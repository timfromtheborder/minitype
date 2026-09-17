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
  savePages,
  saveSession,
  saveSessions,
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
  hydrateProjectSnapshot,
  type PartitionedManuscript,
} from '@/lib/importer';
import { sanitizeManuscript } from '@/lib/sanitize';
import {
  countWords,
  getActiveSessionText,
  reconcileSessionsWithText,
  resolveActiveSessionStats,
  pruneZeroContentSessions,
} from '@/lib/projectSerializer';
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
      const target = freshState.manifest.sessionWordTarget;
      const isTargetReached = Boolean(
        last.targetReached ||
        (target && target > 0 && (last.wordCount || 0) >= target)
      );
      const finalized = {
        ...last,
        completedAt: new Date().toISOString(),
        targetReached: isTargetReached,
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

    const curPage: PageRecord = {
      id: `${freshState.manifest.id}-page-${freshState.currentPageNumber}`,
      manuscriptId: freshState.manifest.id,
      pageNumber: freshState.currentPageNumber,
      lines: freshState.currentPageLines,
      completedAt: null,
    };
    await savePages([...freshState.historicalPages, curPage]).catch(console.error);
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

          // If DB has settings, and either sync was missing or DB is strictly newer
          if (!syncSettings || dbUpdatedAt > syncUpdatedAt) {
            currentManifest = { ...currentManifest, ...explicitDb };
            // Reseed all synchronous stores with database settings
            persistSettings(currentManifest);
          } else {
            // Sync settings are newer or equal -> preserve any settings that were missing from syncSettings
            const missingKeys: any = {};
            for (const key of SETTING_KEYS) {
              if ((explicitSync as any)[key] === undefined && (explicitDb as any)[key] !== undefined) {
                missingKeys[key] = (explicitDb as any)[key];
              }
            }
            if (Object.keys(missingKeys).length > 0) {
              currentManifest = { ...currentManifest, ...missingKeys };
              persistSettings(currentManifest);
            }
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

        const snapshot = hydrateProjectSnapshot(
          { manifest: loadedManifest, pages, sessions },
          {
            globalSettings: currentManifest,
            columnLimit: get().activeColumnLimit ?? MAX_COLUMNS,
            explicitSyncSettings: explicitSync,
            explicitDbSettings: explicitDb,
          }
        );

        for (const remId of snapshot.removedSessionIds) {
          deleteSession(remId).catch(console.error);
        }

        await saveSessions(snapshot.normalizedSessions).catch(console.error);

        if (Object.keys(snapshot.fallbackSettings).length > 0) {
          persistSettings(snapshot.manifest);
        }

        if (typeof document !== 'undefined') {
          if (snapshot.manifest.colorScheme) {
            document.documentElement.setAttribute('data-theme', snapshot.manifest.colorScheme);
          }
          if (snapshot.manifest.textSize) {
            document.documentElement.setAttribute('data-text-size', snapshot.manifest.textSize);
          }
          if (snapshot.manifest.activeApertureHeight) {
            document.documentElement.setAttribute('data-aperture-height', String(snapshot.manifest.activeApertureHeight));
          }
          if (snapshot.manifest.pageMode) {
            document.documentElement.setAttribute('data-page-mode', snapshot.manifest.pageMode);
          }
          if (snapshot.manifest.pageSize) {
            document.documentElement.setAttribute('data-page-size', String(snapshot.manifest.pageSize));
          }
          if (snapshot.manifest.showStats !== undefined) {
            document.documentElement.setAttribute('data-show-stats', String(snapshot.manifest.showStats));
          }
          if (snapshot.manifest.doubleSpaceLinebreaks !== undefined) {
            document.documentElement.setAttribute('data-double-space', String(snapshot.manifest.doubleSpaceLinebreaks));
          }
        }

        if (snapshot.cleanText.trim() !== '' || (pages && pages.length > 0)) {
          // Prune stale pages from IndexedDB and sync valid pages
          await pruneStalePagesForManuscript(loadedManifest.id, snapshot.partitioned.currentPageNumber);
          const allPagesToSave = [
            ...snapshot.partitioned.historicalPages,
            {
              id: `${loadedManifest.id}-page-${snapshot.partitioned.currentPageNumber}`,
              manuscriptId: loadedManifest.id,
              pageNumber: snapshot.partitioned.currentPageNumber,
              lines: snapshot.partitioned.currentPageLines,
              completedAt: null,
            },
          ];
          await savePages(allPagesToSave).catch(console.error);
        }

        const activeLineIdx = Math.max(0, snapshot.partitioned.currentPageLines.length - 1);

        set({
          manifest: snapshot.manifest,
          currentPageNumber: snapshot.partitioned.currentPageNumber,
          historicalPages: snapshot.partitioned.historicalPages,
          currentPageLines: snapshot.partitioned.currentPageLines,
          activeLineIndex: activeLineIdx,
          activeColIndex: 0,
          activeSessions: snapshot.normalizedSessions,
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
