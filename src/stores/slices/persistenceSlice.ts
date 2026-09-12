import { StateCreator } from 'zustand';
import { TypingStore } from '../types';
import {
  CharacterCell,
  LineRecord,
  PageRecord,
  SessionRecord,
  ManuscriptManifest,
  SaveState,
} from '@/types';
import {
  flushPendingSave,
  saveManuscript,
  savePage,
  saveSession,
  deleteSession,
  pruneStalePagesForManuscript,
  getGlobalSettingsFromDb,
  saveGlobalSettingsToDb,
  getAllManuscripts,
  loadManuscriptProject,
} from '@/db';
import {
  DEFAULT_MANIFEST,
  SETTING_KEYS,
  ACTIVE_PROJECT_KEY,
  extractSettings,
  readSynchronousSettings,
  persistSettings,
} from '../settingsPersistence';
import { createEmptyLine } from '@/lib/paginationTransition';
import {
  textToManuscriptLines,
  partitionManuscriptLines,
  healDuplicatedManuscriptText,
  type PartitionedManuscript,
} from '@/lib/importer';
import { sanitizeManuscript } from '@/lib/sanitize';
import {
  countWords,
  getActiveSessionText,
  reconcileSessionsWithText,
  resolveActiveSessionStats,
} from '@/lib/projectSerializer';
import { pruneZeroContentSessions } from './projectSlice';
import { MAX_COLUMNS } from '@/lib/wrap';

export interface PersistenceSlice {
  saveState: SaveState;
  persistenceError: string | null;
  isProjectDirty: boolean;
  flushSave: () => Promise<void>;
  resetEngine: (newManifest?: Partial<ManuscriptManifest>) => void;
  rehydrate: () => Promise<void>;
}

let delayToSavingTimer: ReturnType<typeof setTimeout> | null = null;
let pauseDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let animSaveTimer: ReturnType<typeof setTimeout> | null = null;

export function cancelVisualSaveTimers(): void {
  if (delayToSavingTimer) {
    clearTimeout(delayToSavingTimer);
    delayToSavingTimer = null;
  }
  if (pauseDebounceTimer) {
    clearTimeout(pauseDebounceTimer);
    pauseDebounceTimer = null;
  }
  if (animSaveTimer) {
    clearTimeout(animSaveTimer);
    animSaveTimer = null;
  }
}

export function triggerVisualSaveOnTyping(
  set: (partial: Partial<TypingStore> | ((state: TypingStore) => Partial<TypingStore>)) => void,
  get: () => TypingStore
): void {
  // If an end-of-save countdown was in progress, cancel it because the user typed again
  if (animSaveTimer) {
    clearTimeout(animSaveTimer);
    animSaveTimer = null;
  }
  if (pauseDebounceTimer) {
    clearTimeout(pauseDebounceTimer);
    pauseDebounceTimer = null;
  }

  const currentSaveState = get().saveState;

  // 1. 0.6 second delay before moving from checkmark ('saved') to gray circle animation ('saving')
  if (currentSaveState === 'saved' && !delayToSavingTimer) {
    delayToSavingTimer = setTimeout(() => {
      delayToSavingTimer = null;
      set({ saveState: 'saving' });
    }, 600);
  }

  // 2. Debounce detection of typing pause (400ms after last keystroke)
  pauseDebounceTimer = setTimeout(() => {
    pauseDebounceTimer = null;

    try {
      get().syncSessionStats();
    } catch (e) {}

    const runEndSavingAnimation = () => {
      // Delay the end of the saving animation for a random 0.6 - 1.4 second count (600ms to 1400ms)
      const randomDuration = 600 + Math.random() * 800;
      animSaveTimer = setTimeout(() => {
        animSaveTimer = null;
        const current = get();
        if (current.saveState === 'saving') {
          set({ saveState: current.persistenceError ? 'error' : 'saved' });
        }
      }, randomDuration);
    };

    if (delayToSavingTimer) {
      // Typing paused before 600ms elapsed: transition immediately to saving so user sees feedback
      clearTimeout(delayToSavingTimer);
      delayToSavingTimer = null;
      set({ saveState: 'saving' });
      runEndSavingAnimation();
    } else {
      runEndSavingAnimation();
    }
  }, 400);
}

export function markProjectDirty(set: any, get: any): void {
  if (!get().isProjectDirty) {
    set({ isProjectDirty: true });
  }
}

export async function finalizeAndSaveCurrentProject(get: any, set: any): Promise<void> {
  const state = get();
  if (!state.isProjectDirty) {
    return;
  }

  // 1. Flush debounced page writes
  await flushPendingSave();

  // 2. Synchronously sync current session stats so active session has up-to-date words and text
  try {
    get().syncSessionStats();
  } catch (e) {
    console.error('Failed to sync session stats during finalization:', e);
  }

  // 3. Read fresh state from store after syncSessionStats
  const freshState = get();
  let sessions = [...freshState.activeSessions];

  if (sessions.length > 0) {
    const lastIdx = sessions.length - 1;
    const last = sessions[lastIdx];

    // If the active session has 0 words and empty text, discard it
    if (!last.completedAt && (last.wordCount || 0) === 0 && (!last.text || last.text.trim() === '')) {
      await deleteSession(last.id).catch(console.error);
      sessions.splice(lastIdx, 1);
    } else if (!last.completedAt) {
      // Finalize the active session with completed timestamp
      const finalized = {
        ...last,
        completedAt: new Date().toISOString(),
      };
      sessions[lastIdx] = finalized;
      await saveSession(finalized).catch(console.error);
    }

    // Save all surviving sessions to Dexie
    for (const s of sessions) {
      await saveSession(s).catch(console.error);
    }
  }

  // 4. Save manifest and page only if there is real content and it's not the initial default placeholder
  const hasContent =
    freshState.historicalPages.length > 0 ||
    freshState.currentPageLines.some((l: LineRecord) => l.cells.some((c: CharacterCell) => !c.isSoftPadding && c.char.trim().length > 0)) ||
    sessions.some((s) => (s.wordCount || 0) > 0 || s.text.trim().length > 0);

  if (freshState.manifest.id !== 'default-manuscript' && hasContent) {
    const curManifest: ManuscriptManifest = {
      ...freshState.manifest,
      sessionCount: sessions.length,
      activeSessionId: sessions[sessions.length - 1]?.id || '',
    };
    await saveManuscript(curManifest).catch(console.error);

    for (const hp of freshState.historicalPages) {
      await savePage(hp).catch(console.error);
    }

    const curPage: PageRecord = {
      id: `${freshState.manifest.id}-page-${freshState.currentPageNumber}`,
      manuscriptId: freshState.manifest.id,
      pageNumber: freshState.currentPageNumber,
      lines: freshState.currentPageLines,
      completedAt: null,
    };
    await savePage(curPage).catch(console.error);
    await pruneStalePagesForManuscript(freshState.manifest.id, freshState.currentPageNumber).catch(console.error);
  }

  set({ activeSessions: sessions, isProjectDirty: false });
}

export const createPersistenceSlice: StateCreator<
  TypingStore,
  [],
  [],
  PersistenceSlice
> = (set, get) => ({
  saveState: 'saved',
  persistenceError: null,
  isProjectDirty: false,

  flushSave: async () => {
    cancelVisualSaveTimers();
    set({ saveState: 'saving' });
    await flushPendingSave();
    get().syncSessionStats();
    const randomDuration = 600 + Math.random() * 800;
    animSaveTimer = setTimeout(() => {
      animSaveTimer = null;
      const current = get();
      if (current.saveState === 'saving') {
        set({ saveState: current.persistenceError ? 'error' : 'saved' });
      }
    }, randomDuration);
  },

  resetEngine: (newManifest) => {
    const manifest = { ...DEFAULT_MANIFEST, ...newManifest, mode: 'local' as const };
    set({
      manifest,
      currentPageNumber: 1,
      historicalPages: [],
      currentPageLines: [createEmptyLine(1, 0)],
      activeLineIndex: 0,
      activeColIndex: 0,
      isHighlighting: false,
      highlightHead: null,
      isLocked: false,
      lockReason: null,
      pendingWrappedCells: null,
      activeSessions: [],
      sessionCommittedLines: 0,
      isProjectDirty: false,
    });
  },

  rehydrate: async () => {
    if (typeof window !== 'undefined') {
      // 1. Rehydrate global settings from synchronous stores & IndexedDB
      let currentManifest = get().manifest;
      const syncSettings = readSynchronousSettings();
      const explicitSync = syncSettings ? extractSettings(syncSettings) : {};
      let explicitDb: Partial<ManuscriptManifest> = {};

      if (syncSettings) {
        currentManifest = { ...currentManifest, ...explicitSync };
      }

      try {
        const dbRecord = await getGlobalSettingsFromDb();
        if (dbRecord) {
          explicitDb = extractSettings(dbRecord);
          const syncUpdatedAt = (syncSettings as any)?._updatedAt || 0;
          const dbUpdatedAt = (dbRecord as any)?._updatedAt || 0;

          // If DB has settings, and either sync was missing or DB is newer/equal
          if (!syncSettings || dbUpdatedAt >= syncUpdatedAt) {
            currentManifest = { ...currentManifest, ...explicitDb };
            // Reseed all synchronous stores with database settings
            persistSettings(currentManifest);
          } else {
            // Sync settings are newer -> preserve any settings that were missing from syncSettings
            const missingKeys: any = {};
            for (const key of SETTING_KEYS) {
              if ((explicitSync as any)[key] === undefined && (explicitDb as any)[key] !== undefined) {
                missingKeys[key] = (explicitDb as any)[key];
              }
            }
            currentManifest = { ...currentManifest, ...missingKeys };
            persistSettings(currentManifest);
          }
        } else if (syncSettings) {
          // No DB record yet -> save current sync settings to IndexedDB
          saveGlobalSettingsToDb({ ...extractSettings(currentManifest), _updatedAt: (syncSettings as any)?._updatedAt || Date.now() } as any).catch(console.error);
        }
      } catch (e) {
        console.error('Failed to load settings from IndexedDB:', e);
      }

      if (typeof document !== 'undefined') {
        if (currentManifest.colorScheme) {
          document.documentElement.setAttribute('data-theme', currentManifest.colorScheme);
        }
        if (currentManifest.textSize) {
          document.documentElement.setAttribute('data-text-size', currentManifest.textSize);
        }
        if (currentManifest.activeApertureHeight) {
          document.documentElement.setAttribute('data-aperture-height', String(currentManifest.activeApertureHeight));
        }
        if (currentManifest.pageMode) {
          document.documentElement.setAttribute('data-page-mode', currentManifest.pageMode);
        }
        if (currentManifest.pageSize) {
          document.documentElement.setAttribute('data-page-size', String(currentManifest.pageSize));
        }
        if (currentManifest.showStats !== undefined) {
          document.documentElement.setAttribute('data-show-stats', String(currentManifest.showStats));
        }
        if (currentManifest.doubleSpaceLinebreaks !== undefined) {
          document.documentElement.setAttribute('data-double-space', String(currentManifest.doubleSpaceLinebreaks));
        }
      }

      set({ manifest: currentManifest });

      // 2. Rehydrate active project from IndexedDB
      try {
        let activeProjectId = localStorage.getItem(ACTIVE_PROJECT_KEY);
        let projectData = activeProjectId ? await loadManuscriptProject(activeProjectId) : null;

        if (!projectData) {
          const all = await getAllManuscripts();
          if (all.length > 0) {
            activeProjectId = all[0].id;
            projectData = await loadManuscriptProject(activeProjectId);
          }
        }

        if (!projectData) {
          // No project in IndexedDB -> create fresh initial project
          await get().newProject();
          return;
        }

        const { manifest: loadedManifest, pages, sessions } = projectData;
        if (typeof window !== 'undefined' && loadedManifest.id) {
          localStorage.setItem(ACTIVE_PROJECT_KEY, loadedManifest.id);
        }

        const rawCleanText = sanitizeManuscript(pages, {
          doubleSpaceLinebreaks: false,
          pageMode: loadedManifest.pageMode,
        });
        const cleanText = healDuplicatedManuscriptText(rawCleanText);
        const effectivePageMode = currentManifest.pageMode || loadedManifest.pageMode || 'scroll';
        const effectivePageSize = currentManifest.pageSize || loadedManifest.pageSize || 54;
        const columnLimit = get().activeColumnLimit ?? MAX_COLUMNS;
        const parsed = textToManuscriptLines(cleanText, 1, columnLimit);
        let partitioned: PartitionedManuscript;
        // In notecard mode, if the persisted pages already ended with a fresh empty active card,
        // preserve that empty active card so reload doesn't pull completed cards back onto the platen
        const lastPage = pages && pages.length > 1 ? pages[pages.length - 1] : null;
        const isLastPageEmptyCard =
          effectivePageMode === 'notecard' &&
          lastPage !== null &&
          lastPage.completedAt === null &&
          (!lastPage.lines || lastPage.lines.every((l) => !l.cells || l.cells.length === 0));

        if (isLastPageEmptyCard && lastPage) {
          const contentLines = parsed.lines.filter((l) => l.cells.length > 0 || l.isCommitted);
          const historicalPages: PageRecord[] = [];
          for (let i = 0; i < contentLines.length; i += 10) {
            const chunk = contentLines.slice(i, i + 10);
            const pageNum = historicalPages.length + 1;
            historicalPages.push({
              id: `${loadedManifest.id}-page-${pageNum}`,
              manuscriptId: loadedManifest.id,
              pageNumber: pageNum,
              lines: chunk.map((l, lIdx) => ({
                ...l,
                id: `p${pageNum}-line-${lIdx}`,
                lineIndex: lIdx,
                isCommitted: true,
              })),
              completedAt: new Date().toISOString(),
            });
          }
          const nextCardNum = historicalPages.length + 1;
          partitioned = {
            historicalPages,
            currentPageNumber: nextCardNum,
            currentPageLines: [createEmptyLine(nextCardNum, 0)],
          };
        } else {
          partitioned = partitionManuscriptLines(
            parsed.lines,
            effectivePageMode,
            effectivePageSize,
            loadedManifest.id
          );
        }

        let rawSessions: SessionRecord[] = [];
        if (sessions && sessions.length > 0) {
          rawSessions = [...sessions];
        } else if (cleanText.trim() !== '') {
          rawSessions = [
            {
              id: `${loadedManifest.id}-session-1`,
              projectId: loadedManifest.id,
              sessionNumber: 1,
              startedAt: loadedManifest.createdAt || new Date().toISOString(),
              completedAt: loadedManifest.updatedAt || new Date().toISOString(),
              text: cleanText,
              wordCount: countWords(cleanText),
            },
          ];
        }

        // If there is only 1 session and its text is empty, populate it with cleanText
        if (rawSessions.length === 1 && (!rawSessions[0].text || rawSessions[0].text.trim() === '') && cleanText.trim() !== '') {
          rawSessions[0] = {
            ...rawSessions[0],
            text: cleanText,
            wordCount: rawSessions[0].wordCount || countWords(cleanText),
          };
        }

        // Reconcile existing sessions against true cleanText to fix any slice/offset corruption
        const reconciled = reconcileSessionsWithText(rawSessions, cleanText);

        // Prune any 0-content sessions left from previous runs
        const { pruned: projectSessions, removedIds } = pruneZeroContentSessions(reconciled);
        for (const remId of removedIds) {
          deleteSession(remId).catch(console.error);
        }

        // Sync active session with current cleanText and wordCount
        if (projectSessions.length > 0) {
          const lastIdx = projectSessions.length - 1;
          const last = projectSessions[lastIdx];
          if (!last.completedAt) {
            const docTotalWords = countWords(cleanText);
            const { currentSessionWords: activeWords } = resolveActiveSessionStats(projectSessions, docTotalWords);
            const priorSessions = projectSessions.slice(0, lastIdx);
            const activeText = getActiveSessionText(cleanText, priorSessions);
            projectSessions[lastIdx] = {
              ...last,
              text: activeText,
              wordCount: activeWords,
            };
          }
        }

        // Ensure all rehydrated sessions are finalized so historical sessions are immutable,
        // and renumber contiguously to eliminate gaps from any pruned sessions
        const normalizedSessions = projectSessions.map((s, idx) => ({
          ...s,
          sessionNumber: idx + 1,
          completedAt: s.completedAt || loadedManifest.updatedAt || s.startedAt,
        }));
        for (const s of normalizedSessions) {
          saveSession(s).catch(console.error);
        }

        const loadedSettings = extractSettings(loadedManifest);
        // If a setting was NOT explicitly provided by syncSettings or db.settings, fallback to loadedManifest's setting
        const fallbackFromLoaded: any = {};
        for (const key of SETTING_KEYS) {
          if (
            (explicitSync as any)[key] === undefined &&
            (explicitDb as any)[key] === undefined &&
            (currentManifest as any)[key] === undefined &&
            (loadedSettings as any)[key] !== undefined
          ) {
            fallbackFromLoaded[key] = (loadedSettings as any)[key];
          }
        }

        const updatedManifest: ManuscriptManifest = {
          ...currentManifest, // retains global settings!
          ...fallbackFromLoaded,
          id: loadedManifest.id,
          title: loadedManifest.title || 'Untitled Project',
          mode: 'local',
          outboxCount: 0,
          lastPrintedCharIndex: loadedManifest.lastPrintedCharIndex ?? 0,
          printedPagesCount: loadedManifest.printedPagesCount ?? 0,
          activeSessionId: loadedManifest.activeSessionId || (normalizedSessions.length > 0 ? normalizedSessions[normalizedSessions.length - 1].id : ''),
          sessionCount: normalizedSessions.length,
          totalWordCount: countWords(cleanText),
          createdAt: loadedManifest.createdAt || new Date().toISOString(),
          updatedAt: loadedManifest.updatedAt || new Date().toISOString(),
        };

        if (Object.keys(fallbackFromLoaded).length > 0) {
          persistSettings(updatedManifest);
        }

        if (typeof document !== 'undefined') {
          if (updatedManifest.colorScheme) {
            document.documentElement.setAttribute('data-theme', updatedManifest.colorScheme);
          }
          if (updatedManifest.textSize) {
            document.documentElement.setAttribute('data-text-size', updatedManifest.textSize);
          }
          if (updatedManifest.activeApertureHeight) {
            document.documentElement.setAttribute('data-aperture-height', String(updatedManifest.activeApertureHeight));
          }
          if (updatedManifest.pageMode) {
            document.documentElement.setAttribute('data-page-mode', updatedManifest.pageMode);
          }
          if (updatedManifest.pageSize) {
            document.documentElement.setAttribute('data-page-size', String(updatedManifest.pageSize));
          }
          if (updatedManifest.showStats !== undefined) {
            document.documentElement.setAttribute('data-show-stats', String(updatedManifest.showStats));
          }
          if (updatedManifest.doubleSpaceLinebreaks !== undefined) {
            document.documentElement.setAttribute('data-double-space', String(updatedManifest.doubleSpaceLinebreaks));
          }
        }

        if (cleanText.trim() !== '' || (pages && pages.length > 0)) {
          // Prune stale pages from IndexedDB and sync valid pages
          await pruneStalePagesForManuscript(loadedManifest.id, partitioned.currentPageNumber);
          for (const hp of partitioned.historicalPages) {
            savePage(hp).catch(console.error);
          }
          savePage({
            id: `${loadedManifest.id}-page-${partitioned.currentPageNumber}`,
            manuscriptId: loadedManifest.id,
            pageNumber: partitioned.currentPageNumber,
            lines: partitioned.currentPageLines,
            completedAt: null,
          }).catch(console.error);
        }

        set({
          manifest: updatedManifest,
          currentPageNumber: partitioned.currentPageNumber,
          historicalPages: partitioned.historicalPages,
          currentPageLines: partitioned.currentPageLines,
          activeLineIndex: Math.max(0, partitioned.currentPageLines.length - 1),
          activeColIndex: 0,
          activeSessions: normalizedSessions,
          isHighlighting: false,
          highlightHead: null,
          isLocked: false,
          lockReason: null,
          sessionCommittedLines: 0,
        });
      } catch (e) {
        console.error('Failed to rehydrate project from IndexedDB:', e);
      }
    }
  },
});
