import { StateCreator } from 'zustand';
import { TypingStore } from '../types';
import {
  ManuscriptManifest,
  SessionRecord,
  LineRecord,
  PageRecord,
  MinitypeBackupArchive,
} from '@/types';
import { createLibraryBackup, restoreLibraryBackup } from '@/lib/backup';
import {
  saveManuscript,
  savePage,
  savePages,
  saveSession,
  saveSessions,
  deleteSession,
  getAllManuscripts,
  loadManuscriptProject,
  clearManuscriptData,
  getManuscript,
  pruneStalePagesForManuscript,
  flushPendingSave,
} from '@/db';
import { createEmptyLine, applyPageModeTransition, getPageLineLimit } from '@/lib/paginationTransition';
import {
  readSynchronousSettings,
  extractSettings,
  persistSettings,
  ACTIVE_PROJECT_KEY,
  getInitialManifest,
} from '../settingsPersistence';
import { sanitizeManuscript, sanitizeLine } from '@/lib/sanitize';
import { wordCountClient } from '@/workers/wordCountClient';
import {
  healDuplicatedManuscriptText,
  textToManuscriptLines,
  partitionManuscriptLines,
  hydrateProjectSnapshot,
  type PartitionedManuscript,
} from '@/lib/importer';
import {
  countWords,
  resolveActiveSessionStats,
  getActiveSessionText,
  reconcileSessionsWithText,
  parseProjectFile,
  stripSessionMarkers,
  pruneZeroContentSessions,
} from '@/lib/projectSerializer';
import { MAX_COLUMNS } from '@/lib/wrap';
import { markProjectDirty, finalizeAndSaveCurrentProject } from './persistenceSlice';

export { pruneZeroContentSessions };

export function ensureActiveSessionOnTyping(
  set: (partial: Partial<TypingStore> | ((state: TypingStore) => Partial<TypingStore>)) => void,
  get: () => TypingStore
): void {
  const state = get();
  const sessions = [...state.activeSessions];
  const lastSession = sessions.length > 0 ? sessions[sessions.length - 1] : null;

  // If there is an active uncompleted session, we are already in an active session
  if (lastSession && !lastSession.completedAt) {
    return;
  }

  // All prior sessions were completed (e.g. freshly loaded file).
  // First prune any remaining zero-content sessions:
  const { pruned, removedIds } = pruneZeroContentSessions(sessions);
  for (const remId of removedIds) {
    deleteSession(remId).catch(console.error);
  }

  // Renumber prior sessions contiguously so old pruned sessions do not cause inflated numbers
  const normalizedPruned = pruned.map((s, idx) => ({
    ...s,
    sessionNumber: idx + 1,
  }));
  if (state.manifest.id !== 'default-manuscript') {
    saveSessions(normalizedPruned).catch(console.error);
  }

  const nextSessionNum = normalizedPruned.length + 1;
  const newSession: SessionRecord = {
    id: `${state.manifest.id}-session-${nextSessionNum}`,
    projectId: state.manifest.id,
    sessionNumber: nextSessionNum,
    startedAt: new Date().toISOString(),
    completedAt: null,
    text: '',
    wordCount: 0,
    targetReached: false,
  };

  const updatedSessions = [...normalizedPruned, newSession];
  const updatedManifest: ManuscriptManifest = {
    ...state.manifest,
    activeSessionId: newSession.id,
    sessionCount: updatedSessions.length,
    outboxCount: 0,
    updatedAt: new Date().toISOString(),
  };

  // If there is at least one prior session (e.g. a session was closed and now resuming typing),
  // insert the session divider line in the platen if one is not already present.
  let lines = Array.isArray(state.currentPageLines) ? [...state.currentPageLines] : [];
  let activeLineIndex = state.activeLineIndex ?? 0;
  let activeColIndex = state.activeColIndex ?? 0;

  if (normalizedPruned.length > 0 && lines.length > 0) {
    const lastLine = lines.length > 0 ? lines[lines.length - 1] : null;
    const prevLine = activeLineIndex > 0 ? lines[activeLineIndex - 1] : null;
    const hasPrecedingDivider = Boolean(prevLine?.isSessionDivider || lastLine?.isSessionDivider);

    if (!hasPrecedingDivider) {
      const currentLine = lines[activeLineIndex];
      if (currentLine && currentLine.cells.length > 0) {
        lines[activeLineIndex] = { ...currentLine, isCommitted: true, wrapType: 'hard' };
        const dividerIdx = lines.length;
        lines.push({
          id: `${state.manifest.id}-divider-${nextSessionNum}`,
          lineIndex: dividerIdx,
          cells: [],
          isCommitted: true,
          isSessionDivider: true,
        });
        const nextDraftingIdx = lines.length;
        lines.push(createEmptyLine(state.currentPageNumber, nextDraftingIdx));
        activeLineIndex = nextDraftingIdx;
        activeColIndex = 0;
      } else {
        // Current active line is empty (e.g. created when closing active session)
        const dividerIdx = activeLineIndex;
        lines[dividerIdx] = {
          id: `${state.manifest.id}-divider-${nextSessionNum}`,
          lineIndex: dividerIdx,
          cells: [],
          isCommitted: true,
          isSessionDivider: true,
        };
        const nextDraftingIdx = lines.length;
        lines.push(createEmptyLine(state.currentPageNumber, nextDraftingIdx));
        activeLineIndex = nextDraftingIdx;
        activeColIndex = 0;
      }
    }
  }

  if (state.manifest.id !== 'default-manuscript') {
    saveSession(newSession).catch(console.error);
    if (updatedManifest.mode === 'local') {
      saveManuscript(updatedManifest).catch(console.error);
      if (Array.isArray(state.currentPageLines)) {
        savePage({
          id: `${state.manifest.id}-page-${state.currentPageNumber}`,
          manuscriptId: state.manifest.id,
          pageNumber: state.currentPageNumber,
          lines,
          completedAt: null,
        }).catch(console.error);
      }
    }
  }

  const partialUpdate: Partial<TypingStore> = {
    activeSessions: updatedSessions,
    manifest: updatedManifest,
    sessionCommittedLines: 0,
  };
  if (Array.isArray(state.currentPageLines)) {
    partialUpdate.currentPageLines = lines;
    partialUpdate.activeLineIndex = activeLineIndex;
    partialUpdate.activeColIndex = activeColIndex;
  }
  set(partialUpdate);
}

export interface ProjectSlice {
  manifest: ManuscriptManifest;
  activeSessions: SessionRecord[];
  setManifest: (manifest: Partial<ManuscriptManifest>) => void;
  newProject: (skipSaveCurrent?: boolean) => Promise<void>;
  loadProject: (id: string, skipSaveCurrent?: boolean) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  renameProject: (id: string, newTitle: string) => Promise<void>;
  importTextFileAsProject: (title: string, rawText: string) => Promise<void>;
  clearText: () => Promise<void>;
  exportFullBackup: () => Promise<MinitypeBackupArchive>;
  restoreFullBackup: (archive: MinitypeBackupArchive, mode?: 'merge' | 'replace') => Promise<{ projectCount: number; sessionCount: number }>;
  startNewSession: () => Promise<void>;
  closeActiveSession: () => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  syncSessionStats: (fullText?: string, words?: number) => void;
}

let debouncedSaveManuscriptTimer: ReturnType<typeof setTimeout> | null = null;

export const createProjectSlice: StateCreator<
  TypingStore,
  [],
  [],
  ProjectSlice
> = (set, get) => ({
  manifest: getInitialManifest(),
  activeSessions: [],

  setManifest: (newManifest) => {
    set((state) => {
      if (newManifest.pageMode && newManifest.pageMode !== state.manifest.pageMode) {
        return applyPageModeTransition(newManifest.pageMode, state, newManifest);
      }
      const updated = { ...state.manifest, ...newManifest, mode: 'local' as const };
      persistSettings(updated);

      if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
        if (debouncedSaveManuscriptTimer) {
          clearTimeout(debouncedSaveManuscriptTimer);
        }
        debouncedSaveManuscriptTimer = setTimeout(() => {
          saveManuscript(updated).catch(console.error);
          debouncedSaveManuscriptTimer = null;
        }, 150);
      } else {
        saveManuscript(updated).catch(console.error);
      }

      return { manifest: updated };
    });
  },

  clearText: async () => {
    const state = get();
    await clearManuscriptData(state.manifest.id).catch(console.error);

    const updatedManifest: ManuscriptManifest = {
      ...state.manifest,
      outboxCount: 0,
      lastPrintedCharIndex: 0,
      printedPagesCount: 0,
      activeSessionId: undefined,
      sessionCount: 0,
      totalWordCount: 0,
    };
    persistSettings(updatedManifest);
    await saveManuscript(updatedManifest).catch(console.error);
    await savePage({
      id: `${state.manifest.id}-page-1`,
      manuscriptId: state.manifest.id,
      pageNumber: 1,
      lines: [createEmptyLine(1, 0)],
      completedAt: null,
    }).catch(console.error);

    set({
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
      manifest: updatedManifest,
      saveState: 'saved',
      sessionCommittedLines: 0,
      committedDocWords: 0,
    });
  },

  newProject: async (skipSaveCurrent = false) => {
    if (!skipSaveCurrent) {
      await finalizeAndSaveCurrentProject(get, set);
    }
    const state = get();

    const newId = `manuscript-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // Calculate unique title with incremental duplicate counter if 'Untitled Project' exists
    const existing = await getAllManuscripts().catch(() => []);
    let title = 'Untitled Project';
    const untitledRegex = /^Untitled Project(?:\s*\((\d+)\))?$/i;
    const existingNumbers = new Set<number>();
    let hasBaseUntitled = false;

    for (const m of existing) {
      const match = (m.title || '').trim().match(untitledRegex);
      if (match) {
        if (match[1] === undefined) {
          hasBaseUntitled = true;
        } else {
          existingNumbers.add(parseInt(match[1], 10));
        }
      }
    }

    if (hasBaseUntitled) {
      let num = 2;
      while (existingNumbers.has(num)) {
        num++;
      }
      title = `Untitled Project (${num})`;
    }

    const globalSettings = extractSettings(readSynchronousSettings() || state.manifest);
    const updatedManifest: ManuscriptManifest = {
      ...state.manifest, // retains global settings
      ...globalSettings,
      id: newId,
      title,
      mode: 'local',
      outboxCount: 0,
      lastPrintedCharIndex: 0,
      printedPagesCount: 0,
      activeSessionId: undefined,
      sessionCount: 0,
      totalWordCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

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
    }

    await saveManuscript(updatedManifest).catch(console.error);
    await savePage({
      id: `${newId}-page-1`,
      manuscriptId: newId,
      pageNumber: 1,
      lines: [createEmptyLine(1, 0)],
      completedAt: null,
    }).catch(console.error);

    if (typeof window !== 'undefined') {
      localStorage.setItem(ACTIVE_PROJECT_KEY, newId);
    }

    set({
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
      manifest: updatedManifest,
      saveState: 'saved',
      sessionCommittedLines: 0,
      isProjectDirty: false,
      committedDocWords: 0,
    });
  },

  loadProject: async (id: string, skipSaveCurrent: boolean = false) => {
    const currentId = get().manifest.id;
    // Save and finalize current active project state before switching (skip if deleted or loading itself)
    if (!skipSaveCurrent && currentId !== id) {
      await finalizeAndSaveCurrentProject(get, set);
    }

    const data = await loadManuscriptProject(id);
    if (!data) return;

    const state = get();
    const globalSettings = extractSettings(readSynchronousSettings() || state.manifest);
    const columnLimit = state.activeColumnLimit ?? MAX_COLUMNS;

    const snapshot = hydrateProjectSnapshot(data, {
      mode: 'load',
      globalSettings,
      columnLimit,
    });

    for (const remId of snapshot.removedSessionIds) {
      await deleteSession(remId).catch(console.error);
    }

    await saveSessions(snapshot.normalizedSessions).catch(console.error);

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
    }

    if (snapshot.cleanText.trim() !== '' || data.pages.length > 0) {
      // Prune stale pages from IndexedDB and sync valid pages
      await pruneStalePagesForManuscript(data.manifest.id, snapshot.partitioned.currentPageNumber);
      const completedPagesCount = (data.pages || []).filter((p) => p.completedAt !== null).length;
      if (snapshot.partitioned.historicalPages.length !== completedPagesCount) {
        const allPagesToSave = [
          ...snapshot.partitioned.historicalPages,
          {
            id: `${data.manifest.id}-page-${snapshot.partitioned.currentPageNumber}`,
            manuscriptId: data.manifest.id,
            pageNumber: snapshot.partitioned.currentPageNumber,
            lines: snapshot.partitioned.currentPageLines,
            completedAt: null,
          },
        ];
        await savePages(allPagesToSave).catch(console.error);
      } else {
        await savePage({
          id: `${data.manifest.id}-page-${snapshot.partitioned.currentPageNumber}`,
          manuscriptId: data.manifest.id,
          pageNumber: snapshot.partitioned.currentPageNumber,
          lines: snapshot.partitioned.currentPageLines,
          completedAt: null,
        }).catch(console.error);
      }
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem(ACTIVE_PROJECT_KEY, id);
    }

    set({
      manifest: snapshot.manifest,
      currentPageNumber: snapshot.partitioned.currentPageNumber,
      historicalPages: snapshot.partitioned.historicalPages,
      currentPageLines: snapshot.partitioned.currentPageLines,
      activeLineIndex: Math.max(0, snapshot.partitioned.currentPageLines.length - 1),
      activeColIndex: 0,
      activeSessions: snapshot.normalizedSessions,
      isHighlighting: false,
      highlightHead: null,
      isLocked: false,
      lockReason: null,
      pendingWrappedCells: null,
      saveState: 'saved',
      sessionCommittedLines: 0,
      isProjectDirty: false,
      committedDocWords: snapshot.committedDocWords,
    });
  },

  importTextFileAsProject: async (title: string, rawText: string) => {
    await flushPendingSave();
    const state = get();
    const cleanTitle = title.replace(/\.(txt|md|minitype)$/i, '').trim() || 'Untitled Project';
    const newId = `manuscript-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // Parse sessions if delimiter codes exist in project file
    const importTime = new Date().toISOString();
    const parsedSessions = parseProjectFile(rawText, newId).map((s) => ({
      ...s,
      isImported: true,
      importedAt: s.importedAt || importTime,
    }));
    const cleanText = stripSessionMarkers(rawText);

    const columnLimit = state.activeColumnLimit ?? MAX_COLUMNS;
    const parsed = textToManuscriptLines(cleanText, 1, columnLimit);
    const contentLines = parsed.lines.slice(0, parsed.activeLineIndex);
    const effectivePageMode = state.manifest.pageMode || 'scroll';

    let historicalPages: PageRecord[] = [];
    let currentPageNumber = 1;
    let currentPageLines: LineRecord[] = [];
    let activeLineIndex = 0;
    let activeColIndex = 0;
    let outboxCount = 0;

    if (effectivePageMode === 'notecard' && contentLines.length > 0) {
      // In notecard view, imported text does not display on the active card at all.
      // Partition all imported content lines into completed 10-line historical cards.
      for (let i = 0; i < contentLines.length; i += 10) {
        const chunk = contentLines.slice(i, i + 10);
        const pageNum = historicalPages.length + 1;
        historicalPages.push({
          id: `${newId}-page-${pageNum}`,
          manuscriptId: newId,
          pageNumber: pageNum,
          lines: chunk.map((l, lIdx) => ({
            ...l,
            id: `p${pageNum}-line-${lIdx}`,
            lineIndex: lIdx,
            isCommitted: true,
          })),
          completedAt: importTime,
        });
      }
      currentPageNumber = historicalPages.length + 1;
      currentPageLines = [createEmptyLine(currentPageNumber, 0)];
      activeLineIndex = 0;
      activeColIndex = 0;
    } else {
      // Scroll mode (or empty text): all preceding text is placed in currentPageLines
      historicalPages = [];
      currentPageNumber = 1;
      if (contentLines.length > 0) {
        const linesWithDivider: LineRecord[] = [...contentLines];
        const dividerIdx = linesWithDivider.length;
        linesWithDivider.push({
          id: `${newId}-divider-imported`,
          lineIndex: dividerIdx,
          cells: [],
          isCommitted: true,
          isSessionDivider: true,
        });
        const nextDraftingIdx = linesWithDivider.length;
        linesWithDivider.push(createEmptyLine(1, nextDraftingIdx));
        currentPageLines = linesWithDivider;
        activeLineIndex = nextDraftingIdx;
        activeColIndex = 0;
      } else {
        currentPageLines = [createEmptyLine(1, 0)];
        activeLineIndex = 0;
        activeColIndex = 0;
      }
    }

    // Auto-start next active session for writing upon import
    const nextSessionNum = (parsedSessions[parsedSessions.length - 1]?.sessionNumber || 0) + 1;
    const activeSession: SessionRecord = {
      id: `${newId}-session-${nextSessionNum}`,
      projectId: newId,
      sessionNumber: nextSessionNum,
      startedAt: new Date().toISOString(),
      completedAt: null,
      text: '',
      wordCount: 0,
    };
    const allSessions = [...parsedSessions, activeSession];

    const newManifest: ManuscriptManifest = {
      ...state.manifest,
      sessionWordTarget: undefined,
      id: newId,
      title: cleanTitle,
      mode: 'local',
      outboxCount,
      lastPrintedCharIndex: 0,
      printedPagesCount: 0,
      activeSessionId: activeSession.id,
      sessionCount: allSessions.length,
      totalWordCount: countWords(cleanText),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const newPage: PageRecord = {
      id: `${newId}-page-${currentPageNumber}`,
      manuscriptId: newId,
      pageNumber: currentPageNumber,
      lines: currentPageLines,
      completedAt: null,
    };

    await saveManuscript(newManifest).catch(console.error);
    await savePages([...historicalPages, newPage]).catch(console.error);
    await saveSessions(allSessions).catch(console.error);

    if (typeof window !== 'undefined') {
      localStorage.setItem(ACTIVE_PROJECT_KEY, newId);
    }

    set({
      manifest: newManifest,
      currentPageNumber,
      historicalPages,
      currentPageLines,
      activeLineIndex,
      activeColIndex,
      activeSessions: allSessions,
      isHighlighting: false,
      highlightHead: null,
      isLocked: false,
      lockReason: null,
      pendingWrappedCells: null,
      saveState: 'saved',
      sessionCommittedLines: 0,
      isProjectDirty: false,
    });
  },

  deleteProject: async (id: string) => {
    await flushPendingSave();
    const state = get();
    await clearManuscriptData(id).catch(console.error);

    if (state.manifest.id === id) {
      const remaining = await getAllManuscripts();
      if (remaining.length > 0) {
        await get().loadProject(remaining[0].id, true);
      } else {
        // Auto-provision a fresh project with Session 1 so the platen is always functional
        await get().newProject(true);
      }
    }
  },

  renameProject: async (id: string, newTitle: string) => {
    const state = get();
    if (state.manifest.id === id) {
      state.setManifest({ title: newTitle });
    }
    const m = await getManuscript(id);
    if (m) {
      await saveManuscript({ ...m, title: newTitle, updatedAt: new Date().toISOString() }).catch(console.error);
    }
  },

  exportFullBackup: async () => {
    await finalizeAndSaveCurrentProject(get, set);
    const archive = await createLibraryBackup();
    const currentId = get().manifest.id;
    const allManuscripts = await getAllManuscripts();
    const currentExists = allManuscripts.some((m) => m.id === currentId);
    if (!currentExists && allManuscripts.length > 0) {
      await get().loadProject(allManuscripts[0].id, true);
    }
    return archive;
  },

  restoreFullBackup: async (archive: MinitypeBackupArchive, mode: 'merge' | 'replace' = 'merge') => {
    const result = await restoreLibraryBackup(archive, mode);

    const currentId = get().manifest.id;
    const allManuscripts = await getAllManuscripts();
    const currentExists = allManuscripts.some((m) => m.id === currentId);

    if (currentExists) {
      await get().loadProject(currentId, true);
    } else if (allManuscripts.length > 0) {
      await get().loadProject(allManuscripts[0].id, true);
    } else {
      await get().newProject(true);
    }

    return result;
  },

  startNewSession: async () => {
    markProjectDirty(set, get);
    await flushPendingSave();
    const state = get();
    const activeSessions = [...state.activeSessions];
    const projectId = state.manifest.id;
    const now = new Date().toISOString();

    const allPages = [
      ...state.historicalPages,
      {
        pageNumber: state.currentPageNumber,
        lines: state.currentPageLines,
        completedAt: null,
      },
    ];
    const fullText = sanitizeManuscript(allPages, {
      doubleSpaceLinebreaks: false,
      pageMode: state.manifest.pageMode,
    });
    const docTotalWords = countWords(fullText);
    const { currentSessionWords: currentWordCount } = resolveActiveSessionStats(activeSessions, docTotalWords);
    const priorSessions = activeSessions.slice(0, -1);
    const currentSessionText = getActiveSessionText(fullText, priorSessions);

    // Requirement: If the current session is empty, reset the session time or seed session 1
    if (currentWordCount === 0 && currentSessionText.length === 0) {
      if (activeSessions.length === 0) {
        const newSession: SessionRecord = {
          id: `${projectId}-session-1`,
          projectId,
          sessionNumber: 1,
          startedAt: now,
          completedAt: null,
          text: '',
          wordCount: 0,
          targetReached: false,
        };
        activeSessions.push(newSession);
        await saveSession(newSession).catch(console.error);
        const updatedManifest: ManuscriptManifest = {
          ...state.manifest,
          outboxCount: 0,
          activeSessionId: newSession.id,
          sessionCount: 1,
        };
        if (state.manifest.mode === 'local') {
          await saveManuscript(updatedManifest).catch(console.error);
        }
        set({ activeSessions, manifest: updatedManifest });
        return;
      }
      const lastSession = activeSessions[activeSessions.length - 1];
      if (lastSession.completedAt === null) {
        const updatedSession: SessionRecord = {
          ...lastSession,
          startedAt: now,
          completedAt: null,
          text: '',
          wordCount: 0,
        };
        activeSessions[activeSessions.length - 1] = updatedSession;
        await saveSession(updatedSession).catch(console.error);
        const updatedManifest = {
          ...state.manifest,
          outboxCount: 0,
          sessionCount: activeSessions.length,
          activeSessionId: updatedSession.id,
        };
        if (state.manifest.mode === 'local') {
          await saveManuscript(updatedManifest).catch(console.error);
        }
        set({ activeSessions, manifest: updatedManifest });
      }
      return;
    }

    // 1. Finalize the current active session
    if (activeSessions.length > 0) {
      const lastSession = activeSessions[activeSessions.length - 1];
      const target = state.manifest.sessionWordTarget;
      const finalWords = currentWordCount || lastSession.wordCount || 0;
      const isTargetReached = Boolean(
        lastSession.targetReached ||
        (target && target > 0 && finalWords >= target)
      );
      const updatedLastSession: SessionRecord = {
        ...lastSession,
        completedAt: now,
        text: currentSessionText || lastSession.text || '',
        wordCount: finalWords,
        targetReached: isTargetReached,
      };
      activeSessions[activeSessions.length - 1] = updatedLastSession;
      await saveSession(updatedLastSession).catch(console.error);
    }

    // 2. Start new session
    const nextSessionNum = activeSessions.length + 1;
    const newSession: SessionRecord = {
      id: `${projectId}-session-${nextSessionNum}`,
      projectId,
      sessionNumber: nextSessionNum,
      startedAt: now,
      completedAt: null,
      text: '',
      wordCount: 0,
      targetReached: false,
    };
    activeSessions.push(newSession);
    await saveSession(newSession).catch(console.error);

    // 3. Advance to a fresh linebreak in the aperture, insert session divider line
    let lines = [...state.currentPageLines];
    const currentLine = lines[state.activeLineIndex];
    if (currentLine && currentLine.cells.length > 0) {
      lines[state.activeLineIndex] = { ...currentLine, isCommitted: true, wrapType: 'hard' };
    }

    const dividerIdx = lines.length;
    lines.push({
      id: `${state.manifest.id}-divider-${nextSessionNum}`,
      lineIndex: dividerIdx,
      cells: [],
      isCommitted: true,
      isSessionDivider: true,
    });

    const nextDraftingIdx = lines.length;
    lines.push(createEmptyLine(state.currentPageNumber, nextDraftingIdx));

    const updatedManifest: ManuscriptManifest = {
      ...state.manifest,
      outboxCount: 0,
      activeSessionId: newSession.id,
      sessionCount: activeSessions.length,
      totalWordCount: countWords(fullText),
    };
    await saveManuscript(updatedManifest).catch(console.error);
    await savePage({
      id: `${state.manifest.id}-page-${state.currentPageNumber}`,
      manuscriptId: state.manifest.id,
      pageNumber: state.currentPageNumber,
      lines,
      completedAt: null,
    }).catch(console.error);

    set({
      currentPageLines: lines,
      activeLineIndex: nextDraftingIdx,
      activeColIndex: 0,
      activeSessions,
      manifest: updatedManifest,
      sessionCommittedLines: 0,
      committedDocWords: countWords(fullText),
    });
  },

  closeActiveSession: async () => {
    markProjectDirty(set, get);
    await flushPendingSave();
    const state = get();
    const activeSessions = [...state.activeSessions];
    const now = new Date().toISOString();

    if (activeSessions.length === 0) return;
    const lastSession = activeSessions[activeSessions.length - 1];
    if (lastSession.completedAt !== null) return;

    let lines = [...state.currentPageLines];
    let activeLineIndex = state.activeLineIndex;
    let activeColIndex = state.activeColIndex;
    let historicalPages = [...state.historicalPages];
    let currentPageNumber = state.currentPageNumber;
    let currentLine = lines[activeLineIndex] || createEmptyLine(currentPageNumber, activeLineIndex);

    const allPages = [
      ...historicalPages,
      {
        pageNumber: currentPageNumber,
        lines,
        completedAt: null,
      },
    ];
    const fullText = sanitizeManuscript(allPages, {
      doubleSpaceLinebreaks: false,
      pageMode: state.manifest.pageMode,
    });
    const docTotalWords = countWords(fullText);
    const { currentSessionWords: currentWordCount } = resolveActiveSessionStats(activeSessions, docTotalWords);
    const priorSessions = activeSessions.slice(0, -1);
    const currentSessionText = getActiveSessionText(fullText, priorSessions);

    const isSessionEmpty =
      (currentWordCount === 0 || currentWordCount === undefined) &&
      (!currentSessionText || currentSessionText.trim() === '') &&
      (lastSession.wordCount === 0 || lastSession.wordCount === undefined) &&
      (!lastSession.text || lastSession.text.trim() === '') &&
      currentLine.cells.length === 0;

    if (isSessionEmpty) {
      // Closing an empty session erases it like it was never created;
      // it is not promoted or closed into the completed ledger at all.
      const erasedSession = activeSessions.pop()!;
      await deleteSession(erasedSession.id).catch(console.error);

      // Clean up any session divider and empty drafting line added for this session
      const dividerId = `${state.manifest.id}-divider-${erasedSession.sessionNumber}`;
      let dividerIndex = lines.findIndex((l) => l.id === dividerId);
      if (dividerIndex === -1 && activeLineIndex > 0 && lines[activeLineIndex - 1]?.isSessionDivider) {
        dividerIndex = activeLineIndex - 1;
      }

      if (dividerIndex !== -1 && lines[dividerIndex + 1]?.cells.length === 0) {
        lines.splice(dividerIndex, 2);
        activeLineIndex = Math.max(0, dividerIndex - 1);
        activeColIndex = lines[activeLineIndex]?.cells.length ?? 0;
      }

      if (lines.length === 0) {
        lines = [createEmptyLine(currentPageNumber, 0)];
        activeLineIndex = 0;
        activeColIndex = 0;
      }

      const updatedManifest: ManuscriptManifest = {
        ...state.manifest,
        activeSessionId: undefined,
        sessionCount: activeSessions.length,
        totalWordCount: countWords(
          sanitizeManuscript(
            [
              ...historicalPages,
              {
                pageNumber: currentPageNumber,
                lines,
                completedAt: null,
              },
            ],
            {
              doubleSpaceLinebreaks: false,
              pageMode: state.manifest.pageMode,
            }
          )
        ),
      };

      if (state.manifest.mode === 'local') {
        await saveManuscript(updatedManifest).catch(console.error);
        await savePage({
          id: `${state.manifest.id}-page-${currentPageNumber}`,
          manuscriptId: state.manifest.id,
          pageNumber: currentPageNumber,
          lines,
          completedAt: null,
        }).catch(console.error);
      }

      set({
        activeSessions,
        manifest: updatedManifest,
        currentPageLines: lines,
        activeLineIndex,
        activeColIndex,
        isHighlighting: false,
        highlightHead: null,
      });
      return;
    }

    // Force a linebreak in the platen if the active line has characters or drafting content

    if (state.isHighlighting) {
      currentLine = {
        ...currentLine,
        cells: currentLine.cells.map((c) =>
          c.state === 'highlighted' ? { ...c, state: 'struck' as const, isStruck: true } : c
        ),
      };
    }

    if (currentLine.cells.length > 0) {
      lines[activeLineIndex] = {
        ...currentLine,
        isCommitted: true,
        wrapType: 'hard',
      };

      const nextLineIndex = activeLineIndex + 1;
      const pageLineLimit = getPageLineLimit(state.manifest.pageMode, state.manifest.pageSize);
      const shouldCompletePage = nextLineIndex >= pageLineLimit;

      if (shouldCompletePage) {
        const completedPage: PageRecord = {
          id: `${state.manifest.id}-page-${currentPageNumber}`,
          manuscriptId: state.manifest.id,
          pageNumber: currentPageNumber,
          lines,
          completedAt: now,
        };
        historicalPages.push(completedPage);
        currentPageNumber += 1;
        const firstLine = createEmptyLine(currentPageNumber, 0);
        lines = [firstLine];
        activeLineIndex = 0;
        activeColIndex = 0;

        if (state.manifest.mode === 'local') {
          await savePage(completedPage).catch(console.error);
          await savePage({
            id: `${state.manifest.id}-page-${currentPageNumber}`,
            manuscriptId: state.manifest.id,
            pageNumber: currentPageNumber,
            lines: [firstLine],
            completedAt: null,
          }).catch(console.error);
        }
      } else {
        const nextLine = createEmptyLine(currentPageNumber, nextLineIndex);
        lines.push(nextLine);
        activeLineIndex = nextLineIndex;
        activeColIndex = 0;

        if (state.manifest.mode === 'local') {
          await savePage({
            id: `${state.manifest.id}-page-${currentPageNumber}`,
            manuscriptId: state.manifest.id,
            pageNumber: currentPageNumber,
            lines,
            completedAt: null,
          }).catch(console.error);
        }
      }
    } else if (activeLineIndex > 0 && lines[activeLineIndex - 1]) {
      // If active line is already empty, ensure preceding line is committed with hard break
      lines[activeLineIndex - 1] = {
        ...lines[activeLineIndex - 1],
        isCommitted: true,
        wrapType: 'hard',
      };
    }

    const finalAllPages = [
      ...historicalPages,
      {
        pageNumber: currentPageNumber,
        lines,
        completedAt: null,
      },
    ];
    const finalFullText = sanitizeManuscript(finalAllPages, {
      doubleSpaceLinebreaks: false,
      pageMode: state.manifest.pageMode,
    });
    const finalDocTotalWords = countWords(finalFullText);
    const { currentSessionWords: resolvedCurrentWords } = resolveActiveSessionStats(activeSessions, finalDocTotalWords);
    const resolvedPriorSessions = activeSessions.slice(0, -1);
    const resolvedCurrentText = getActiveSessionText(finalFullText, resolvedPriorSessions);

    const target = state.manifest.sessionWordTarget;
    const finalWords = resolvedCurrentWords || lastSession.wordCount || 0;
    const isTargetReached = Boolean(
      lastSession.targetReached ||
      (target && target > 0 && finalWords >= target)
    );
    const updatedLastSession: SessionRecord = {
      ...lastSession,
      completedAt: now,
      text: resolvedCurrentText || lastSession.text || '',
      wordCount: finalWords,
      targetReached: isTargetReached,
    };
    activeSessions[activeSessions.length - 1] = updatedLastSession;
    await saveSession(updatedLastSession).catch(console.error);

    const updatedManifest: ManuscriptManifest = {
      ...state.manifest,
      activeSessionId: undefined,
      sessionCount: activeSessions.length,
      totalWordCount: finalDocTotalWords,
    };
    if (state.manifest.mode === 'local') {
      await saveManuscript(updatedManifest).catch(console.error);
    }
    set({
      activeSessions,
      manifest: updatedManifest,
      currentPageLines: lines,
      activeLineIndex,
      activeColIndex,
      historicalPages,
      currentPageNumber,
      isHighlighting: false,
      highlightHead: null,
    });
  },

  deleteSession: async (sessionId: string) => {
    markProjectDirty(set, get);
    await flushPendingSave();
    const state = get();
    const filtered = state.activeSessions.filter((s) => s.id !== sessionId);
    await deleteSession(sessionId).catch(console.error);

    const renumbered = filtered.map((s, idx) => ({
      ...s,
      sessionNumber: idx + 1,
    }));
    await saveSessions(renumbered).catch(console.error);

    const updatedManifest: ManuscriptManifest = {
      ...state.manifest,
      sessionCount: renumbered.length,
      activeSessionId:
        renumbered.length > 0 && !renumbered[renumbered.length - 1].completedAt
          ? renumbered[renumbered.length - 1].id
          : undefined,
    };
    if (state.manifest.mode === 'local') {
      await saveManuscript(updatedManifest).catch(console.error);
    }
    set({ activeSessions: renumbered, manifest: updatedManifest });
  },

  syncSessionStats: (fullText?: string, words?: number) => {
    const state = get();
    if (!state.activeSessions || state.activeSessions.length === 0) return;

    if (fullText !== undefined && words !== undefined) {
      const docTotalWords = words;
      const text = fullText;
      const sessions = [...state.activeSessions];
      const lastIdx = sessions.length - 1;
      const last = sessions[lastIdx];

      if (!last.completedAt) {
        const { currentSessionWords } = resolveActiveSessionStats(sessions, docTotalWords);
        const priorSessions = sessions.slice(0, lastIdx);
        const activeText = getActiveSessionText(text, priorSessions);
        const target = state.manifest.sessionWordTarget;
        const targetReached = Boolean(
          target && target > 0 && currentSessionWords >= target
        );

        sessions[lastIdx] = {
          ...last,
          text: activeText,
          wordCount: currentSessionWords,
          targetReached,
        };

        const updatedManifest = {
          ...state.manifest,
          totalWordCount: docTotalWords,
        };

        const activeLines = state.currentPageLines;
        const activeLine = activeLines.length > 0 ? activeLines[state.activeLineIndex] : null;
        const activeWords = activeLine && !activeLine.isCommitted
          ? countWords(sanitizeLine(activeLine).trim())
          : 0;
        const calibratedCommittedWords = Math.max(0, docTotalWords - activeWords);

        set({
          activeSessions: sessions,
          manifest: updatedManifest,
          committedDocWords: calibratedCommittedWords,
        });

        if (state.manifest.mode === 'local' && state.manifest.id !== 'default-manuscript') {
          saveSession(sessions[lastIdx]).catch(console.error);
          saveManuscript(updatedManifest).catch(console.error);
        }
      }
      return;
    }

    // Instant delta-based word count update (< 0.05ms)
    const activeLines = state.currentPageLines;
    const activeLine = activeLines.length > 0 ? activeLines[state.activeLineIndex] : null;
    const activeWords = activeLine && !activeLine.isCommitted
      ? countWords(sanitizeLine(activeLine).trim())
      : 0;
    const committedWords = state.committedDocWords !== undefined
      ? state.committedDocWords
      : Math.max(0, (state.manifest.totalWordCount ?? 0) - activeWords);
    const immediateTotalWords = committedWords + activeWords;

    const sessions = [...state.activeSessions];
    const lastIdx = sessions.length - 1;
    const last = sessions[lastIdx];

    if (!last.completedAt) {
      const { currentSessionWords } = resolveActiveSessionStats(sessions, immediateTotalWords);
      const target = state.manifest.sessionWordTarget;
      const targetReached = Boolean(
        target && target > 0 && currentSessionWords >= target
      );

      sessions[lastIdx] = {
        ...last,
        wordCount: currentSessionWords,
        targetReached,
      };

      const updatedManifest = {
        ...state.manifest,
        totalWordCount: immediateTotalWords,
      };

      set({
        activeSessions: sessions,
        manifest: updatedManifest,
        committedDocWords: committedWords,
      });

      // Offload full manuscript compilation, sanitization, and Unicode regex counting to Web Worker
      const allPages = [
        ...state.historicalPages,
        {
          pageNumber: state.currentPageNumber,
          lines: state.currentPageLines,
          completedAt: null,
        },
      ];

      wordCountClient
        .calculateStats(
          allPages,
          state.manifest.pageMode,
          sessions,
          state.manifest.sessionWordTarget
        )
        .then((workerResult) => {
          const curState = get();
          if (curState.manifest.id !== state.manifest.id) return;
          curState.syncSessionStats(workerResult.fullText, workerResult.docTotalWords);
        })
        .catch(console.error);
    }
  },
});
