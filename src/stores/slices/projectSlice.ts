import { StateCreator } from 'zustand';
import { TypingStore } from '../types';
import {
  ManuscriptManifest,
  SessionRecord,
  LineRecord,
  PageRecord,
} from '@/types';
import {
  saveManuscript,
  savePage,
  saveSession,
  deleteSession,
  getAllManuscripts,
  loadManuscriptProject,
  clearManuscriptData,
  getManuscript,
  pruneStalePagesForManuscript,
  flushPendingSave,
} from '@/db';
import { createEmptyLine, applyPageModeTransition } from '@/lib/paginationTransition';
import {
  readSynchronousSettings,
  extractSettings,
  persistSettings,
  ACTIVE_PROJECT_KEY,
  getInitialManifest,
} from '../settingsPersistence';
import { sanitizeManuscript } from '@/lib/sanitize';
import {
  healDuplicatedManuscriptText,
  textToManuscriptLines,
  partitionManuscriptLines,
  type PartitionedManuscript,
} from '@/lib/importer';
import {
  countWords,
  resolveActiveSessionStats,
  getActiveSessionText,
  reconcileSessionsWithText,
  parseProjectFile,
  stripSessionMarkers,
} from '@/lib/projectSerializer';
import { MAX_COLUMNS } from '@/lib/wrap';
import { markProjectDirty, finalizeAndSaveCurrentProject } from './persistenceSlice';

export function pruneZeroContentSessions(sessions: SessionRecord[]): {
  pruned: SessionRecord[];
  removedIds: string[];
} {
  const removedIds: string[] = [];
  const pruned: SessionRecord[] = [];

  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    const clean = (s.text || '').trim();
    const isCompleted = !!s.completedAt;
    const words =
      isCompleted && s.wordCount !== undefined && s.wordCount > 0
        ? s.wordCount
        : countWords(clean);
    const isZeroContent = words === 0;

    if (isZeroContent && (sessions.length > 1 || pruned.length > 0)) {
      removedIds.push(s.id);
    } else {
      pruned.push({ ...s, text: clean, wordCount: words });
    }
  }

  if (pruned.length === 0 && sessions.length > 0) {
    const first = sessions[0];
    const clean = (first.text || '').trim();
    const isCompleted = !!first.completedAt;
    const words =
      isCompleted && first.wordCount !== undefined && first.wordCount > 0
        ? first.wordCount
        : countWords(clean);
    pruned.push({ ...first, text: clean, wordCount: words });
    const idx = removedIds.indexOf(first.id);
    if (idx >= 0) removedIds.splice(idx, 1);
  }

  return { pruned, removedIds };
}

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
    for (const s of normalizedPruned) {
      saveSession(s).catch(console.error);
    }
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

  if (state.manifest.id !== 'default-manuscript') {
    saveSession(newSession).catch(console.error);
    if (updatedManifest.mode === 'local') {
      saveManuscript(updatedManifest).catch(console.error);
    }
  }

  set({
    activeSessions: updatedSessions,
    manifest: updatedManifest,
    sessionCommittedLines: 0,
  });
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
  startNewSession: () => Promise<void>;
  syncSessionStats: (fullText?: string, words?: number) => void;
}

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
      saveManuscript(updated).catch(console.error);
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
      sessionWordTarget: undefined,
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

    const { manifest: loadedManifest, pages, sessions: existingSessions } = data;

    // Requirement: When a file is loaded, strikeouts should be removed
    const rawCleanText = sanitizeManuscript(pages, {
      doubleSpaceLinebreaks: false,
      pageMode: loadedManifest.pageMode,
    });
    const cleanText = healDuplicatedManuscriptText(rawCleanText);

    const state = get();
    const globalSettings = extractSettings(readSynchronousSettings() || state.manifest);
    const effectivePageMode = globalSettings.pageMode || loadedManifest.pageMode || 'scroll';
    const effectivePageSize = globalSettings.pageSize || loadedManifest.pageSize || 54;
    const columnLimit = state.activeColumnLimit ?? MAX_COLUMNS;
    // Parse into platen lines with a fresh empty line at the end
    const parsed = textToManuscriptLines(cleanText, 1, columnLimit);

    let partitioned: PartitionedManuscript;
    if (effectivePageMode === 'notecard') {
      const contentLines = parsed.lines.filter((l) => l.cells.length > 0 || l.isCommitted);
      if (contentLines.length === 0) {
        partitioned = {
          historicalPages: [],
          currentPageNumber: 1,
          currentPageLines: [createEmptyLine(1, 0)],
        };
      } else {
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
      }
    } else {
      partitioned = partitionManuscriptLines(
        parsed.lines,
        effectivePageMode,
        effectivePageSize,
        loadedManifest.id
      );
    }

    // Prepare sessions: if none exist in db, generate Session 1 from cleanText
    // Prepare sessions: if none exist in db, generate Session 1 from cleanText ONLY if there is text
    let rawSessions: SessionRecord[] = [];
    if (existingSessions && existingSessions.length > 0) {
      rawSessions = [...existingSessions];
    } else if (cleanText.trim() !== '') {
      rawSessions = [
        {
          id: `${id}-session-1`,
          projectId: id,
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

    // Prune any 0-content sessions on load
    const { pruned, removedIds } = pruneZeroContentSessions(reconciled);
    for (const remId of removedIds) {
      await deleteSession(remId).catch(console.error);
    }

    // Ensure all prior sessions are finalized so historical sessions are immutable (Invariant 7 & 8),
    // and renumber contiguously to eliminate gaps from any pruned sessions
    const sessions = pruned.map((s, idx) => ({
      ...s,
      sessionNumber: idx + 1,
      completedAt: s.completedAt || loadedManifest.updatedAt || s.startedAt,
    }));
    for (const s of sessions) {
      saveSession(s).catch(console.error);
    }

    // CRITICAL: Global settings are preserved across document changes!
    const updatedManifest: ManuscriptManifest = {
      ...state.manifest,
      ...globalSettings,
      id: loadedManifest.id,
      title: loadedManifest.title || 'Untitled Project',
      mode: 'local',
      outboxCount: 0,
      lastPrintedCharIndex: loadedManifest.lastPrintedCharIndex ?? 0,
      printedPagesCount: loadedManifest.printedPagesCount ?? 0,
      activeSessionId: (sessions.length > 0 ? sessions[sessions.length - 1]?.id : '') || '',
      sessionCount: sessions.length,
      totalWordCount: countWords(cleanText),
      sessionWordTarget: loadedManifest.sessionWordTarget,
      createdAt: loadedManifest.createdAt || new Date().toISOString(),
      updatedAt: loadedManifest.updatedAt || new Date().toISOString(), // PRESERVE existing timestamp!
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

    if (cleanText.trim() !== '' || pages.length > 0) {
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

    if (typeof window !== 'undefined') {
      localStorage.setItem(ACTIVE_PROJECT_KEY, id);
    }

    set({
      manifest: updatedManifest,
      currentPageNumber: partitioned.currentPageNumber,
      historicalPages: partitioned.historicalPages,
      currentPageLines: partitioned.currentPageLines,
      activeLineIndex: Math.max(0, partitioned.currentPageLines.length - 1),
      activeColIndex: 0,
      activeSessions: sessions,
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
      outboxCount = historicalPages.length;
    } else if (effectivePageMode === 'paragraph' && contentLines.length > 0) {
      // In paragraph view, imported text does not display on the platen at all.
      // Partition into completed historical paragraph pages.
      let currentGroup: LineRecord[] = [];
      for (let i = 0; i < contentLines.length; i++) {
        const line = contentLines[i];
        currentGroup.push(line);
        if (line.wrapType === 'hard' || i === contentLines.length - 1) {
          const pageNum = historicalPages.length + 1;
          historicalPages.push({
            id: `${newId}-page-${pageNum}`,
            manuscriptId: newId,
            pageNumber: pageNum,
            lines: currentGroup.map((l, lIdx) => ({
              ...l,
              id: `p${pageNum}-line-${lIdx}`,
              lineIndex: lIdx,
              isCommitted: true,
            })),
            completedAt: importTime,
          });
          currentGroup = [];
        }
      }
      currentPageNumber = historicalPages.length + 1;
      currentPageLines = [createEmptyLine(currentPageNumber, 0)];
      activeLineIndex = 0;
      activeColIndex = 0;
    } else {
      // Scroll mode (or empty text): all preceding text is placed in currentPageLines
      historicalPages = [];
      currentPageNumber = 1;
      currentPageLines = parsed.lines;
      activeLineIndex = parsed.activeLineIndex;
      activeColIndex = parsed.activeColIndex;
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
    for (const hp of historicalPages) {
      await savePage(hp).catch(console.error);
    }
    await savePage(newPage).catch(console.error);
    for (const s of allSessions) {
      await saveSession(s).catch(console.error);
    }

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

    // Requirement: If the current session is empty, reset the session time but don't start a new session
    if (currentWordCount === 0 && currentSessionText.length === 0) {
      if (activeSessions.length > 0) {
        const lastSession = activeSessions[activeSessions.length - 1];
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

    // 3. Advance to a fresh linebreak in the aperture if current line has content
    let lines = [...state.currentPageLines];
    const currentLine = lines[state.activeLineIndex];
    if (currentLine && currentLine.cells.length > 0) {
      lines[state.activeLineIndex] = { ...currentLine, isCommitted: true, wrapType: 'hard' };
      const nextIdx = state.activeLineIndex + 1;
      lines.push(createEmptyLine(state.currentPageNumber, nextIdx));

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
        activeLineIndex: nextIdx,
        activeColIndex: 0,
        activeSessions,
        manifest: updatedManifest,
        sessionCommittedLines: 0,
      });
    } else {
      const updatedManifest: ManuscriptManifest = {
        ...state.manifest,
        outboxCount: 0,
        activeSessionId: newSession.id,
        sessionCount: activeSessions.length,
        totalWordCount: countWords(fullText),
      };
      await saveManuscript(updatedManifest).catch(console.error);
      set({
        activeSessions,
        manifest: updatedManifest,
        sessionCommittedLines: 0,
      });
    }
  },

  syncSessionStats: (fullText?: string, words?: number) => {
    const state = get();
    if (!state.activeSessions || state.activeSessions.length === 0) return;

    let text = fullText;
    if (text === undefined) {
      const allPages = [
        ...state.historicalPages,
        {
          pageNumber: state.currentPageNumber,
          lines: state.currentPageLines,
          completedAt: null,
        },
      ];
      text = sanitizeManuscript(allPages, {
        doubleSpaceLinebreaks: false,
        pageMode: state.manifest.pageMode,
      });
    }

    const docTotalWords = words !== undefined ? words : countWords(text);
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

      set({
        activeSessions: sessions,
        manifest: updatedManifest,
      });

      if (state.manifest.mode === 'local' && state.manifest.id !== 'default-manuscript') {
        saveSession(sessions[lastIdx]).catch(console.error);
        saveManuscript(updatedManifest).catch(console.error);
      }
    }
  },
});
