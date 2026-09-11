import { create } from 'zustand';
import {
  CharacterCell,
  LineRecord,
  PageRecord,
  ManuscriptManifest,
  ApertureHeight,
  WrapMode,
  PageSize,
  PageMode,
  TypingEngineState,
  TypingEngineActions,
  SessionRecord,
  SaveState,
  TextSize,
} from '@/types';
import { wrapLine, getLastPrintableCellIndex, createCellId, MAX_COLUMNS } from '@/lib/wrap';
import { typewriterAudio } from '@/lib/sound';
import {
  saveManuscript,
  savePage,
  deletePage,
  pruneStalePagesForManuscript,
  saveSession,
  deleteSession,
  getSessionsForProject,
  clearManuscriptData,
  getManuscript,
  getPagesForManuscript,
  loadManuscriptProject,
  deletePagesForManuscript,
  debounceSavePage,
  flushPendingSave,
  setPersistenceErrorHandler,
  setSaveStatusHandler,
  getAllManuscripts,
  saveGlobalSettingsToDb,
  getGlobalSettingsFromDb,
} from '@/db';
import { textToManuscriptLines, partitionManuscriptLines, healDuplicatedManuscriptText } from '@/lib/importer';
import { sanitizeManuscript } from '@/lib/sanitize';
import {
  parseProjectFile,
  stripSessionMarkers,
  countWords,
  getActiveSessionText,
  reconcileSessionsWithText,
} from '@/lib/projectSerializer';

export function getPageLineLimit(mode?: PageMode, customSize?: number): number {
  if (mode === 'scroll') return Infinity;
  if (mode === 'notecard') return 10;
  if (mode === 'paragraph') return 9999;
  return customSize || 54;
}

export function createEmptyLine(pageNumber: number, lineIndex: number): LineRecord {
  return {
    id: `p${pageNumber}-line-${lineIndex}`,
    lineIndex,
    cells: [],
    isCommitted: false,
  };
}

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
      const finalized: SessionRecord = {
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
    sessions.some((s: SessionRecord) => (s.wordCount || 0) > 0 || s.text.trim().length > 0);

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

function ensureActiveSessionOnTyping(set: any, get: any): void {
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
  };

  const updatedSessions = [...normalizedPruned, newSession];
  const updatedManifest: ManuscriptManifest = {
    ...state.manifest,
    activeSessionId: newSession.id,
    sessionCount: updatedSessions.length,
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
  });
}

export const DEFAULT_MANIFEST: ManuscriptManifest = {
  id: 'default-manuscript',
  title: 'Untitled Project',
  mode: 'local',
  inboxCount: 0,
  outboxCount: 0,
  lastPrintedCharIndex: 0,
  printedPagesCount: 0,
  activeApertureHeight: 1,
  wrapMode: 'soft',
  pageSize: 999999,
  pageMode: 'scroll',
  colorScheme: 'typewriter',
  typeface: 'courier-prime',
  textSize: 'm',
  showStats: true,
  doubleSpaceLinebreaks: false,
  sessionCount: 1,
  totalWordCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

export const SETTING_KEYS = [
  'activeApertureHeight',
  'wrapMode',
  'pageSize',
  'pageMode',
  'colorScheme',
  'typeface',
  'textSize',
  'showStats',
  'doubleSpaceLinebreaks',
] as const;

export function extractSettings(obj: any): Partial<ManuscriptManifest> {
  const settings: any = {};
  if (!obj) return settings;
  for (const key of SETTING_KEYS) {
    if (obj[key] !== undefined) {
      settings[key] = obj[key];
    }
  }
  return settings;
}

export const SETTINGS_KEY = 'minitype_global_settings';
export const ACTIVE_PROJECT_KEY = 'minitype_active_project_id';

export function readSynchronousSettings(): (Partial<ManuscriptManifest> & { _updatedAt?: number }) | null {
  if (typeof window === 'undefined') return null;

  const candidates: Array<{ settings: Partial<ManuscriptManifest>; updatedAt: number; priority: number }> = [];

  const tryParse = (raw: string | null, priority: number) => {
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const settings = extractSettings(parsed);
      if (Object.keys(settings).length > 0) {
        candidates.push({
          settings,
          updatedAt: typeof parsed._updatedAt === 'number' ? parsed._updatedAt : 0,
          priority,
        });
      }
    } catch (e) {}
  };

  // Tier 1: localStorage
  try {
    tryParse(localStorage.getItem(SETTINGS_KEY), 1);
  } catch (e) {}

  // Tier 2: sessionStorage (guaranteed survival across reloads in same tab on iOS)
  try {
    tryParse(sessionStorage.getItem(SETTINGS_KEY), 2);
  } catch (e) {}

  // Tier 3: document.cookie
  try {
    if (typeof document !== 'undefined') {
      const match = document.cookie.match(new RegExp(`(?:^|; )${SETTINGS_KEY}=([^;]*)`));
      if (match) {
        tryParse(decodeURIComponent(match[1]), 3);
      }
    }
  } catch (e) {}

  // Tier 4: window.name backup (immune to iOS Safari storage wiping and private browsing limits)
  try {
    if (typeof window !== 'undefined' && window.name && window.name.startsWith('minitype_settings:')) {
      tryParse(window.name.slice('minitype_settings:'.length), 4);
    }
  } catch (e) {}

  if (candidates.length > 0) {
    // Sort descending by updatedAt, and if equal, by tier priority ascending (1 > 2 > 3 > 4)
    candidates.sort((a, b) => b.updatedAt - a.updatedAt || a.priority - b.priority);
    // Merge all candidates from lowest priority/oldest to highest priority/newest so best values win
    let merged: any = {};
    for (let i = candidates.length - 1; i >= 0; i--) {
      merged = { ...merged, ...candidates[i].settings };
    }
    merged._updatedAt = candidates[0].updatedAt;
    return merged;
  }

  // Tier 5: Document element fallback if set by layout script
  if (typeof document !== 'undefined') {
    const theme = document.documentElement.getAttribute('data-theme') as any;
    const textSize = document.documentElement.getAttribute('data-text-size') as any;
    const apertureHeight = document.documentElement.getAttribute('data-aperture-height');
    const pageMode = document.documentElement.getAttribute('data-page-mode') as any;
    const pageSize = document.documentElement.getAttribute('data-page-size');
    const showStats = document.documentElement.getAttribute('data-show-stats');
    const doubleSpace = document.documentElement.getAttribute('data-double-space');
    const updatedAt = document.documentElement.getAttribute('data-updated-at');

    if (theme || textSize || apertureHeight || pageMode || pageSize) {
      const fallback: any = {};
      if (theme) fallback.colorScheme = theme;
      if (textSize) fallback.textSize = textSize;
      if (apertureHeight) fallback.activeApertureHeight = parseInt(apertureHeight, 10);
      if (pageMode) fallback.pageMode = pageMode;
      if (pageSize) fallback.pageSize = parseInt(pageSize, 10);
      if (showStats !== null && showStats !== undefined) fallback.showStats = showStats === 'true';
      if (doubleSpace !== null && doubleSpace !== undefined) fallback.doubleSpaceLinebreaks = doubleSpace === 'true';
      if (updatedAt) fallback._updatedAt = parseInt(updatedAt, 10);
      return fallback;
    }
  }

  return null;
}

export function getInitialManifest(): ManuscriptManifest {
  const base = { ...DEFAULT_MANIFEST };
  const sync = readSynchronousSettings();
  if (sync) {
    return { ...base, ...extractSettings(sync) };
  }
  return base;
}

export function persistSettings(manifest: Partial<ManuscriptManifest>): void {
  if (typeof window === 'undefined') return;

  try {
    const settings = extractSettings(manifest);
    if (Object.keys(settings).length === 0) return;

    const existing = readSynchronousSettings() || {};
    const merged = { ...existing, ...settings, _updatedAt: Date.now() };
    const serialized = JSON.stringify(merged);

    // 1. Synchronous localStorage
    try {
      localStorage.setItem(SETTINGS_KEY, serialized);
    } catch (e) {}

    // 2. Synchronous sessionStorage
    try {
      sessionStorage.setItem(SETTINGS_KEY, serialized);
    } catch (e) {}

    // 3. Synchronous window.name backup
    try {
      window.name = `minitype_settings:${serialized}`;
    } catch (e) {}

    // 4. Synchronous Cookies
    try {
      if (typeof document !== 'undefined') {
        const isSecure = window.location.protocol === 'https:';
        const secureFlag = isSecure ? '; Secure' : '';
        const cookieVal = encodeURIComponent(serialized);

        // Write to root
        document.cookie = `${SETTINGS_KEY}=${cookieVal}; path=/; max-age=31536000; SameSite=Lax${secureFlag}`;

        // Write to current subfolder path (e.g. /minitype/ on GitHub Pages)
        const currentPath = window.location.pathname.replace(/\/[^/]*$/, '') || '';
        if (currentPath && currentPath !== '/') {
          document.cookie = `${SETTINGS_KEY}=${cookieVal}; path=${currentPath}; max-age=31536000; SameSite=Lax${secureFlag}`;
          document.cookie = `${SETTINGS_KEY}=${cookieVal}; path=${currentPath}/; max-age=31536000; SameSite=Lax${secureFlag}`;
        }
      }
    } catch (e) {}

    // 5. Asynchronous IndexedDB
    saveGlobalSettingsToDb(merged).catch(console.error);

    // 6. Request persistent storage on mobile / WebKit
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }

    // 7. Synchronous DOM attribute updates
    if (typeof document !== 'undefined') {
      if (merged.colorScheme) {
        document.documentElement.setAttribute('data-theme', merged.colorScheme);
      }
      if (merged.textSize) {
        document.documentElement.setAttribute('data-text-size', merged.textSize);
      }
      if (merged.activeApertureHeight) {
        document.documentElement.setAttribute('data-aperture-height', String(merged.activeApertureHeight));
      }
      if (merged.pageMode) {
        document.documentElement.setAttribute('data-page-mode', merged.pageMode);
      }
      if (merged.pageSize) {
        document.documentElement.setAttribute('data-page-size', String(merged.pageSize));
      }
      if (merged.showStats !== undefined) {
        document.documentElement.setAttribute('data-show-stats', String(merged.showStats));
      }
      if (merged.doubleSpaceLinebreaks !== undefined) {
        document.documentElement.setAttribute('data-double-space', String(merged.doubleSpaceLinebreaks));
      }
      if (merged._updatedAt) {
        document.documentElement.setAttribute('data-updated-at', String(merged._updatedAt));
      }
    }
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
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

export interface TypingStore extends TypingEngineState, TypingEngineActions {
  currentPageNumber: number;
  historicalPages: PageRecord[];
  pendingWrappedCells: CharacterCell[] | null;
}

export const useTypingStore = create<TypingStore>((set, get) => {
  if (typeof window !== 'undefined') {
    setPersistenceErrorHandler((err) => {
      if (err) {
        cancelVisualSaveTimers();
        set({ persistenceError: err.message, saveState: 'error' });
      } else {
        set({ persistenceError: null });
      }
    });
  }

  return {
    manifest: getInitialManifest(),
    currentPageNumber: 1,
    historicalPages: [],
    currentPageLines: [createEmptyLine(1, 0)],
    activeLineIndex: 0,
    activeColIndex: 0,
    isHighlighting: false,
    highlightHead: null,
    isLocked: false,
    lockReason: null,
    activeColumnLimit: 70,
    persistenceError: null,
    pendingWrappedCells: null,
    saveState: 'saved',
    activeSessions: [],
    isProjectDirty: false,

  setActiveColumnLimit: (limit: number) =>
    set((state) => (state.activeColumnLimit === limit ? state : { activeColumnLimit: limit })),

  setManifest: (newManifest) => {
    set((state) => {
      const updated = { ...state.manifest, ...newManifest, mode: 'local' as const };
      persistSettings(updated);
      saveManuscript(updated).catch(console.error);
      const currentPage: PageRecord = {
        id: `${updated.id}-page-${state.currentPageNumber}`,
        manuscriptId: updated.id,
        pageNumber: state.currentPageNumber,
        lines: state.currentPageLines,
        completedAt: null,
      };
      savePage(currentPage).catch(console.error);
      state.historicalPages.forEach((p) => savePage(p).catch(console.error));
      return { manifest: updated };
    });
  },

  setApertureHeight: (height: ApertureHeight) => {
    set((state) => {
      // PRD 8.2: Any runtime modification to aperture height cancels active highlights
      let lines = state.currentPageLines;
      if (state.isHighlighting) {
        lines = lines.map((line) => ({
          ...line,
          cells: line.cells.map((cell) =>
            cell.state === 'highlighted' ? { ...cell, state: 'standard' as const } : cell
          ),
        }));
      }

      const updatedManifest = { ...state.manifest, activeApertureHeight: height };
      persistSettings(updatedManifest);
      if (updatedManifest.mode === 'local') {
        saveManuscript(updatedManifest).catch(console.error);
      }

      return {
        manifest: updatedManifest,
        currentPageLines: lines,
        isHighlighting: false,
        highlightHead: null,
      };
    });
  },

  setPageSize: (pageSize: PageSize) => {
    set((state) => {
      const updated = { ...state.manifest, pageSize, pageMode: 'page' as const };
      persistSettings(updated);
      if (updated.mode === 'local') {
        saveManuscript(updated).catch(console.error);
      }
      return { manifest: updated };
    });
  },

  setPageMode: (pageMode: PageMode) => {
    const pageSize = pageMode === 'scroll' ? 999999 : pageMode === 'notecard' ? 10 : pageMode === 'page' ? 54 : 9999;
    set((state) => {
      const updated = { ...state.manifest, pageMode, pageSize };
      persistSettings(updated);
      if (updated.mode === 'local') {
        saveManuscript(updated).catch(console.error);
      }
      return { manifest: updated };
    });
  },

  setTextSize: (textSize: TextSize) => {
    set((state) => {
      const updated = { ...state.manifest, textSize };
      persistSettings(updated);
      if (updated.mode === 'local') {
        saveManuscript(updated).catch(console.error);
      }
      return { manifest: updated };
    });
  },

  insertChar: (char: string) => {
    const state = get();
    if (state.isLocked || char.length !== 1) return;
    triggerVisualSaveOnTyping(set, get);
    ensureActiveSessionOnTyping(set, get);
    markProjectDirty(set, get);

    let lines = [...state.currentPageLines];
    let isHighlighting = state.isHighlighting;
    let highlightHead = state.highlightHead;
    let activeLineIndex = state.activeLineIndex;

    // 1. If currently in highlight mode, any keystroke immediately strikes out highlighted text:
    // Converts all 'highlighted' cells to 'struck', permanently marks isStruck: true, clears highlight mode, and snaps cursor.
    if (isHighlighting) {
      lines = lines.map((line, idx) => ({
        ...line,
        wrapType:
          idx < activeLineIndex &&
          (line.cells.some((c) => c.state === 'highlighted') ||
            (highlightHead && highlightHead.lineIndex <= idx))
            ? 'soft'
            : line.wrapType,
        cells: line.cells.map((cell) =>
          cell.state === 'highlighted' ? { ...cell, state: 'struck' as const, isStruck: true } : cell
        ),
      }));
      isHighlighting = false;
      highlightHead = null;
    }

    const currentLine = lines[activeLineIndex] || createEmptyLine(state.currentPageNumber, activeLineIndex);
    const lineCells = [...currentLine.cells];
    const colCount = lineCells.length;
    const columnLimit = state.activeColumnLimit ?? MAX_COLUMNS;

    // Soft word wrap boundary check:
    // Exactly columnLimit character cells fit in a line (columns 0 to columnLimit - 1).
    // Typing character at colCount >= columnLimit triggers soft word wrap.
    const needsWrap = colCount >= columnLimit;

    if (!needsWrap) {
      // Append directly to current line
      const newCell: CharacterCell = {
        id: createCellId(state.currentPageNumber, activeLineIndex, colCount),
        char,
        state: 'standard',
        colIndex: colCount,
        lineIndex: activeLineIndex,
      };

      lines[activeLineIndex] = {
        ...currentLine,
        cells: [...lineCells, newCell],
      };

      if (state.manifest.mode === 'local') {
        const pageToSave: PageRecord = {
          id: `${state.manifest.id}-page-${state.currentPageNumber}`,
          manuscriptId: state.manifest.id,
          pageNumber: state.currentPageNumber,
          lines: lines,
          completedAt: null,
        };
        debounceSavePage(pageToSave);
      }

      set({
        currentPageLines: lines,
        activeColIndex: colCount + 1,
        isHighlighting: false,
        highlightHead: null,
      });
      return;
    }

    flushPendingSave();

    // Line boundary reached (soft wrap triggered)
    const wrapResult = wrapLine(
      currentLine,
      char,
      state.currentPageNumber,
      activeLineIndex + 1,
      'soft',
      columnLimit
    );

    lines[activeLineIndex] = wrapResult.updatedCurrentLine;

    // Save committed line if in local mode
    if (state.manifest.mode === 'local') {
      const pageToSave: PageRecord = {
        id: `${state.manifest.id}-page-${state.currentPageNumber}`,
        manuscriptId: state.manifest.id,
        pageNumber: state.currentPageNumber,
        lines: lines,
        completedAt: null,
      };
      savePage(pageToSave).catch(console.error);
    }

    // Check if advancing to the next line completes the page
    const nextLineIndex = activeLineIndex + 1;
    const pageLineLimit = getPageLineLimit(state.manifest.pageMode, state.manifest.pageSize);
    if (nextLineIndex >= pageLineLimit) {
      const completedPage: PageRecord = {
        id: `${state.manifest.id}-page-${state.currentPageNumber}`,
        manuscriptId: state.manifest.id,
        pageNumber: state.currentPageNumber,
        lines: lines,
        completedAt: new Date().toISOString(),
      };

      const newOutbox = state.manifest.outboxCount + 1;
      const historical = [...state.historicalPages, completedPage];
      typewriterAudio.playPaperFeed();

      const newPageNum = state.currentPageNumber + 1;
      const firstLine: LineRecord = {
        id: `p${newPageNum}-line-0`,
        lineIndex: 0,
        cells: wrapResult.nextLineCells,
        isCommitted: false,
      };

      if (state.manifest.mode === 'local') {
        savePage(completedPage).catch(console.error);
        savePage({
          id: `${state.manifest.id}-page-${newPageNum}`,
          manuscriptId: state.manifest.id,
          pageNumber: newPageNum,
          lines: [firstLine],
          completedAt: null,
        }).catch(console.error);
      }

      const updatedManifest = {
        ...state.manifest,
        outboxCount: newOutbox,
      };
      if (updatedManifest.mode === 'local') {
        saveManuscript(updatedManifest).catch(console.error);
      }

      set({
        manifest: updatedManifest,
        historicalPages: historical,
        currentPageNumber: newPageNum,
        currentPageLines: [firstLine],
        activeLineIndex: 0,
        activeColIndex: wrapResult.nextLineCells.length,
        isHighlighting: false,
        highlightHead: null,
        isLocked: false,
        lockReason: null,
        pendingWrappedCells: null,
      });
      return;
    }

    // Normal line advance within current page
    const nextLineRecord: LineRecord = {
      id: `p${state.currentPageNumber}-line-${nextLineIndex}`,
      lineIndex: nextLineIndex,
      cells: wrapResult.nextLineCells,
      isCommitted: false,
    };
    lines.push(nextLineRecord);

    set({
      currentPageLines: lines,
      activeLineIndex: nextLineIndex,
      activeColIndex: wrapResult.nextLineCells.length,
      isHighlighting: false,
      highlightHead: null,
    });
  },

  handleBackspace: () => {
    const state = get();
    if (state.isLocked) return;
    triggerVisualSaveOnTyping(set, get);
    markProjectDirty(set, get);

    const lines = [...state.currentPageLines];
    const activeLineIndex = state.activeLineIndex;
    const minVisibleLine = Math.max(0, activeLineIndex - state.manifest.activeApertureHeight + 1);

    if (!state.isHighlighting) {
      // Enter Highlight Mode: traverse backward from the active typing head
      const currentLine = lines[activeLineIndex];
      const printableIndex = currentLine ? getLastPrintableCellIndex(currentLine.cells) : -1;

      // If active line has printable characters, highlight the last one
      if (printableIndex >= 0) {
        // Highlight the last cell on the active line
        const targetCell = currentLine.cells[printableIndex];
        lines[activeLineIndex] = {
          ...currentLine,
          cells: currentLine.cells.map((cell, idx) =>
            idx === printableIndex
              ? { ...cell, state: 'highlighted' as const, isStruck: cell.isStruck || cell.state === 'struck' }
              : cell
          ),
        };

        if (state.manifest.mode === 'local') {
          debounceSavePage({
            id: `${state.manifest.id}-page-${state.currentPageNumber}`,
            manuscriptId: state.manifest.id,
            pageNumber: state.currentPageNumber,
            lines,
            completedAt: null,
          });
        }

        set({
          currentPageLines: lines,
          isHighlighting: true,
          highlightHead: { lineIndex: activeLineIndex, colIndex: printableIndex },
        });
        return;
      }

      // If active line is empty and was created by Enter (prevLine has wrapType === 'hard'):
      // Backspace strikes out the carriage return!
      if (activeLineIndex > 0) {
        const prevLineIndex = activeLineIndex - 1;
        const prevLine = lines[prevLineIndex];
        if (prevLine && prevLine.wrapType === 'hard') {
          // Strike out the carriage return: cancel the hard break and pop empty line
          prevLine.wrapType = 'soft';
          prevLine.isCommitted = false;
          lines.pop();

          typewriterAudio.playStrike();

          if (state.manifest.mode === 'local') {
            debounceSavePage({
              id: `${state.manifest.id}-page-${state.currentPageNumber}`,
              manuscriptId: state.manifest.id,
              pageNumber: state.currentPageNumber,
              lines,
              completedAt: null,
            });
          }

          set({
            currentPageLines: lines,
            activeLineIndex: prevLineIndex,
            activeColIndex: prevLine.cells.length,
            isHighlighting: false,
            highlightHead: null,
          });
          return;
        }

        // If prevLine was soft-wrapped (not a manual carriage return), traverse back to highlight its last printable char
        if (prevLine) {
          const prevPrintableIndex = getLastPrintableCellIndex(prevLine.cells);
          if (prevPrintableIndex >= 0) {
            lines[prevLineIndex] = {
              ...prevLine,
              cells: prevLine.cells.map((cell, idx) =>
                idx === prevPrintableIndex
                  ? { ...cell, state: 'highlighted' as const, isStruck: cell.isStruck || cell.state === 'struck' }
                  : cell
              ),
            };

            if (state.manifest.mode === 'local') {
              debounceSavePage({
                id: `${state.manifest.id}-page-${state.currentPageNumber}`,
                manuscriptId: state.manifest.id,
                pageNumber: state.currentPageNumber,
                lines,
                completedAt: null,
              });
            }

            set({
              currentPageLines: lines,
              isHighlighting: true,
              highlightHead: { lineIndex: prevLineIndex, colIndex: prevPrintableIndex },
            });
            return;
          }
        }
      }

      // If active line is at index 0, empty, and a previous completed page exists (e.g. paragraph mode):
      // Strike out the paragraph carriage return and restore previous page
      if (activeLineIndex === 0 && (!currentLine || currentLine.cells.length === 0) && state.historicalPages.length > 0) {
        const historical = [...state.historicalPages];
        const prevPage = historical.pop()!;
        const restoredLines = [...prevPage.lines];
        const lastLineIndex = Math.max(0, restoredLines.length - 1);
        const lastLine = restoredLines[lastLineIndex];
        if (lastLine && lastLine.wrapType === 'hard') {
          lastLine.wrapType = 'soft';
          lastLine.isCommitted = false;
        }

        typewriterAudio.playStrike();

        const abandonedPageId = `${state.manifest.id}-page-${state.currentPageNumber}`;
        deletePage(abandonedPageId).catch(console.error);
        pruneStalePagesForManuscript(state.manifest.id, prevPage.pageNumber).catch(console.error);

        if (state.manifest.mode === 'local') {
          savePage({
            id: `${state.manifest.id}-page-${prevPage.pageNumber}`,
            manuscriptId: state.manifest.id,
            pageNumber: prevPage.pageNumber,
            lines: restoredLines,
            completedAt: null,
          }).catch(console.error);
        }

        set({
          manifest: {
            ...state.manifest,
            outboxCount: Math.max(0, state.manifest.outboxCount - 1),
          },
          historicalPages: historical,
          currentPageNumber: prevPage.pageNumber,
          currentPageLines: restoredLines,
          activeLineIndex: lastLineIndex,
          activeColIndex: lastLine ? lastLine.cells.length : 0,
          isHighlighting: false,
          highlightHead: null,
        });
        return;
      }

      // Cannot highlight further backward
      return;
    }

    // Already in Highlight Mode: expand highlight backward by one cell
    const head = state.highlightHead;
    if (!head) return;

    const currentHeadLine = lines[head.lineIndex];
    if (!currentHeadLine) return;

    // Scan backward on the same line, skipping any soft-wrap padding cells
    let nextCol = head.colIndex - 1;
    while (nextCol >= 0 && currentHeadLine.cells[nextCol]?.isSoftPadding) {
      nextCol--;
    }

    if (nextCol >= 0) {
      lines[head.lineIndex] = {
        ...currentHeadLine,
        cells: currentHeadLine.cells.map((cell, idx) =>
          idx === nextCol
            ? { ...cell, state: 'highlighted' as const, isStruck: cell.isStruck || cell.state === 'struck' }
            : cell
        ),
      };

      if (state.manifest.mode === 'local') {
        debounceSavePage({
          id: `${state.manifest.id}-page-${state.currentPageNumber}`,
          manuscriptId: state.manifest.id,
          pageNumber: state.currentPageNumber,
          lines,
          completedAt: null,
        });
      }

      set({
        currentPageLines: lines,
        highlightHead: { lineIndex: head.lineIndex, colIndex: nextCol },
      });
      return;
    }

    // At col 0 of head.lineIndex: try to traverse up to previous line
    if (head.lineIndex > minVisibleLine) {
      const prevLineIndex = head.lineIndex - 1;
      const prevLine = lines[prevLineIndex];
      if (prevLine) {
        // Skip soft padding on the previous line and lock onto last printable char
        const prevPrintableIndex = getLastPrintableCellIndex(prevLine.cells);
        if (prevPrintableIndex >= 0) {
          lines[prevLineIndex] = {
            ...prevLine,
            cells: prevLine.cells.map((cell, idx) =>
              idx === prevPrintableIndex
                ? { ...cell, state: 'highlighted' as const, isStruck: cell.isStruck || cell.state === 'struck' }
                : cell
            ),
          };

          if (state.manifest.mode === 'local') {
            debounceSavePage({
              id: `${state.manifest.id}-page-${state.currentPageNumber}`,
              manuscriptId: state.manifest.id,
              pageNumber: state.currentPageNumber,
              lines,
              completedAt: null,
            });
          }

          set({
            currentPageLines: lines,
            highlightHead: { lineIndex: prevLineIndex, colIndex: prevPrintableIndex },
          });
          return;
        }
      }
    }

    // Clamped to visible ceiling (activeLine - activeApertureHeight + 1, col 0)
    // Dropping further Backspace inputs.
  },

  handleEnter: () => {
    const state = get();
    if (state.isLocked) return;
    triggerVisualSaveOnTyping(set, get);
    ensureActiveSessionOnTyping(set, get);
    markProjectDirty(set, get);

    let lines = [...state.currentPageLines];

    if (state.isHighlighting) {
      // Enter with active highlight:
      // Converts all 'highlighted' cells to 'struck', permanently marks isStruck: true, clears selection,
      // snaps cursor to end of active line without creating a newline.
      // If the highlight spanned into preceding lines, those carriage returns were struck out (wrapType = 'soft').
      lines = lines.map((line, idx) => ({
        ...line,
        wrapType:
          idx < state.activeLineIndex &&
          (line.cells.some((c) => c.state === 'highlighted') ||
            (state.highlightHead && state.highlightHead.lineIndex <= idx))
            ? 'soft'
            : line.wrapType,
        cells: line.cells.map((cell) =>
          cell.state === 'highlighted' ? { ...cell, state: 'struck' as const, isStruck: true } : cell
        ),
      }));

      if (state.manifest.mode === 'local') {
        debounceSavePage({
          id: `${state.manifest.id}-page-${state.currentPageNumber}`,
          manuscriptId: state.manifest.id,
          pageNumber: state.currentPageNumber,
          lines,
          completedAt: null,
        });
      }

      const activeLine = lines[state.activeLineIndex];
      const activeCol = activeLine ? activeLine.cells.length : 0;

      set({
        currentPageLines: lines,
        isHighlighting: false,
        highlightHead: null,
        activeColIndex: activeCol,
      });
      return;
    }

    // Enter without active highlight: commits current line and advances to line N+1
    flushPendingSave();

    const currentLine = lines[state.activeLineIndex] || createEmptyLine(state.currentPageNumber, state.activeLineIndex);
    lines[state.activeLineIndex] = {
      ...currentLine,
      isCommitted: true,
      wrapType: 'hard',
    };

    const nextLineIndex = state.activeLineIndex + 1;
    const isParagraphMode = state.manifest.pageMode === 'paragraph';
    const pageLineLimit = getPageLineLimit(state.manifest.pageMode, state.manifest.pageSize);
    const shouldCompletePage = isParagraphMode || nextLineIndex >= pageLineLimit;

    if (shouldCompletePage) {
      // Page completed on Enter
      const completedPage: PageRecord = {
        id: `${state.manifest.id}-page-${state.currentPageNumber}`,
        manuscriptId: state.manifest.id,
        pageNumber: state.currentPageNumber,
        lines,
        completedAt: new Date().toISOString(),
      };

      const newOutbox = state.manifest.outboxCount + 1;
      const historical = [...state.historicalPages, completedPage];
      typewriterAudio.playPaperFeed();

      const newPageNum = state.currentPageNumber + 1;
      const firstLine = createEmptyLine(newPageNum, 0);

      if (state.manifest.mode === 'local') {
        savePage(completedPage).catch(console.error);
        savePage({
          id: `${state.manifest.id}-page-${newPageNum}`,
          manuscriptId: state.manifest.id,
          pageNumber: newPageNum,
          lines: [firstLine],
          completedAt: null,
        }).catch(console.error);
      }

      const updatedManifest = {
        ...state.manifest,
        outboxCount: newOutbox,
      };
      persistSettings(updatedManifest);
      if (updatedManifest.mode === 'local') {
        saveManuscript(updatedManifest).catch(console.error);
      }

      set({
        manifest: updatedManifest,
        historicalPages: historical,
        currentPageNumber: newPageNum,
        currentPageLines: [firstLine],
        activeLineIndex: 0,
        activeColIndex: 0,
        isHighlighting: false,
        highlightHead: null,
        isLocked: false,
        lockReason: null,
      });
      return;
    }

    // Advance to line N+1
    lines.push(createEmptyLine(state.currentPageNumber, nextLineIndex));

    if (state.manifest.mode === 'local') {
      const pageToSave: PageRecord = {
        id: `${state.manifest.id}-page-${state.currentPageNumber}`,
        manuscriptId: state.manifest.id,
        pageNumber: state.currentPageNumber,
        lines,
        completedAt: null,
      };
      savePage(pageToSave).catch(console.error);
    }

    set({
      currentPageLines: lines,
      activeLineIndex: nextLineIndex,
      activeColIndex: 0,
      isHighlighting: false,
      highlightHead: null,
    });
  },

  feedPaper: (amount = 1) => {
    set((state) => {
      let inbox = state.manifest.inboxCount + amount;
      let isLocked = state.isLocked;
      let lockReason = state.lockReason;
      let lines = state.currentPageLines;
      let pageNum = state.currentPageNumber;
      let activeLineIndex = state.activeLineIndex;
      let activeColIndex = state.activeColIndex;
      let pendingCells = state.pendingWrappedCells;

      if (isLocked && lockReason === 'page_exhaustion') {
        // Unlock and start fresh page
        inbox -= 1;
        isLocked = false;
        lockReason = null;
        pageNum += 1;
        activeLineIndex = 0;

        const initialCells = pendingCells || [];
        lines = [
          {
            id: `p${pageNum}-line-0`,
            lineIndex: 0,
            cells: initialCells,
            isCommitted: false,
          },
        ];
        activeColIndex = initialCells.length;
        pendingCells = null;
      }

      const updatedManifest = { ...state.manifest, inboxCount: inbox };
      if (updatedManifest.mode === 'local') {
        saveManuscript(updatedManifest).catch(console.error);
      }

      return {
        manifest: updatedManifest,
        isLocked,
        lockReason,
        currentPageNumber: pageNum,
        currentPageLines: lines,
        activeLineIndex,
        activeColIndex,
        pendingWrappedCells: pendingCells,
      };
    });
  },

  handleKeyDown: (e) => {
    // Top-level dispatcher - also used directly in hooks
    const key = e.key;

    if (key === 'Backspace') {
      get().handleBackspace();
      return;
    }

    if (key === 'Enter') {
      get().handleEnter();
      return;
    }

    if (key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      get().insertChar(key);
    }
  },

  clearText: async () => {
    const state = get();
    await clearManuscriptData(state.manifest.id).catch(console.error);

    const initialSession: SessionRecord = {
      id: `${state.manifest.id}-session-1`,
      projectId: state.manifest.id,
      sessionNumber: 1,
      startedAt: new Date().toISOString(),
      completedAt: null,
      text: '',
      wordCount: 0,
    };

    const updatedManifest: ManuscriptManifest = {
      ...state.manifest,
      outboxCount: 0,
      lastPrintedCharIndex: 0,
      printedPagesCount: 0,
      activeSessionId: initialSession.id,
      sessionCount: 1,
      totalWordCount: 0,
    };
    persistSettings(updatedManifest);
    await saveManuscript(updatedManifest).catch(console.error);
    await saveSession(initialSession).catch(console.error);
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
      activeSessions: [initialSession],
      manifest: updatedManifest,
      saveState: 'saved',
    });
  },

  newProject: async () => {
    await finalizeAndSaveCurrentProject(get, set);
    const state = get();

    const newId = `manuscript-${Date.now()}`;
    const initialSession: SessionRecord = {
      id: `${newId}-session-1`,
      projectId: newId,
      sessionNumber: 1,
      startedAt: new Date().toISOString(),
      completedAt: null,
      text: '',
      wordCount: 0,
    };

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
      activeSessionId: initialSession.id,
      sessionCount: 1,
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
    await saveSession(initialSession).catch(console.error);
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
      activeSessions: [initialSession],
      manifest: updatedManifest,
      saveState: 'saved',
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
    const columnLimit = state.activeColumnLimit ?? MAX_COLUMNS;
    // Parse into platen lines with a fresh empty line at the end
    const parsed = textToManuscriptLines(cleanText, 1, columnLimit);
    const partitioned = partitionManuscriptLines(
      parsed.lines,
      loadedManifest.pageMode,
      loadedManifest.pageSize,
      loadedManifest.id
    );

    // Prepare sessions: if none exist in db, generate Session 1 from cleanText
    let rawSessions: SessionRecord[] = existingSessions && existingSessions.length > 0
      ? [...existingSessions]
      : [
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

    // If there is only 1 session and its text is empty, populate it with cleanText
    if (rawSessions.length === 1 && (!rawSessions[0].text || rawSessions[0].text.trim() === '')) {
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

    // Ensure all prior sessions are finalized so they don't say "Present",
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
    const globalSettings = extractSettings(readSynchronousSettings() || state.manifest);
    const updatedManifest: ManuscriptManifest = {
      ...state.manifest,
      ...globalSettings,
      id: loadedManifest.id,
      title: loadedManifest.title || 'Untitled Project',
      mode: 'local',
      outboxCount: partitioned.historicalPages.length,
      lastPrintedCharIndex: loadedManifest.lastPrintedCharIndex ?? 0,
      printedPagesCount: loadedManifest.printedPagesCount ?? 0,
      activeSessionId: sessions[sessions.length - 1]?.id || '',
      sessionCount: sessions.length,
      totalWordCount: countWords(cleanText),
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
      isProjectDirty: false,
    });
  },

  importTextFileAsProject: async (title: string, rawText: string) => {
    await flushPendingSave();
    const state = get();
    const cleanTitle = title.replace(/\.(txt|md|minitype)$/i, '').trim() || 'Untitled Project';
    const newId = `manuscript-${Date.now()}`;

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
      outboxCount: 0,
      lastPrintedCharIndex: 0,
      printedPagesCount: 0,
      activeSessionId: activeSession.id,
      sessionCount: allSessions.length,
      totalWordCount: countWords(cleanText),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const newPage: PageRecord = {
      id: `${newId}-page-1`,
      manuscriptId: newId,
      pageNumber: 1,
      lines: parsed.lines,
      completedAt: null,
    };

    await saveManuscript(newManifest).catch(console.error);
    await savePage(newPage).catch(console.error);
    for (const s of allSessions) {
      await saveSession(s).catch(console.error);
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem(ACTIVE_PROJECT_KEY, newId);
    }

    set({
      manifest: newManifest,
      currentPageNumber: 1,
      historicalPages: [],
      currentPageLines: parsed.lines,
      activeLineIndex: parsed.activeLineIndex,
      activeColIndex: parsed.activeColIndex,
      activeSessions: allSessions,
      isHighlighting: false,
      highlightHead: null,
      isLocked: false,
      lockReason: null,
      pendingWrappedCells: null,
      saveState: 'saved',
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
        // Requirement: Behavior for "no project loaded" state if all projects deleted
        // Auto-provision a fresh project with Session 1 so the platen is always functional
        await get().newProject();
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
    const priorSessions = activeSessions.slice(0, -1);
    const priorWords = priorSessions.reduce((acc, s) => acc + (s.wordCount || 0), 0);
    const docTotalWords = countWords(fullText);
    const currentWordCount = Math.max(0, docTotalWords - priorWords);
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
      const updatedLastSession: SessionRecord = {
        ...lastSession,
        completedAt: now,
        text: currentSessionText || lastSession.text || '',
        wordCount: currentWordCount || lastSession.wordCount || 0,
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
      const priorSessions = sessions.slice(0, lastIdx);
      const priorWords = priorSessions.reduce((acc, s) => acc + (s.wordCount || 0), 0);
      const activeWords = Math.max(0, docTotalWords - priorWords);
      const activeText = getActiveSessionText(text, priorSessions);

      sessions[lastIdx] = {
        ...last,
        text: activeText,
        wordCount: activeWords,
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

  toggleStats: (show?: boolean) => {
    set((state) => {
      const showStats = show !== undefined ? show : !(state.manifest.showStats ?? true);
      const updatedManifest = { ...state.manifest, showStats };
      persistSettings(updatedManifest);
      if (updatedManifest.mode === 'local') {
        saveManuscript(updatedManifest).catch(console.error);
      }
      return { manifest: updatedManifest };
    });
  },

  toggleDoubleSpaceLinebreaks: (enabled?: boolean) => {
    set((state) => {
      const doubleSpaceLinebreaks = enabled !== undefined ? enabled : !(state.manifest.doubleSpaceLinebreaks ?? false);
      const updatedManifest = { ...state.manifest, doubleSpaceLinebreaks };
      persistSettings(updatedManifest);
      if (updatedManifest.mode === 'local') {
        saveManuscript(updatedManifest).catch(console.error);
      }
      return { manifest: updatedManifest };
    });
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
      activeSessions: [
        {
          id: `${manifest.id}-session-1`,
          projectId: manifest.id,
          sessionNumber: 1,
          startedAt: new Date().toISOString(),
          completedAt: null,
          text: '',
          wordCount: 0,
        },
      ],
      isProjectDirty: false,
    });
  },

  rehydrate: async () => {
    if (typeof window === 'undefined') return;

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
      const columnLimit = get().activeColumnLimit ?? MAX_COLUMNS;
      const parsed = textToManuscriptLines(cleanText, 1, columnLimit);
      const partitioned = partitionManuscriptLines(
        parsed.lines,
        loadedManifest.pageMode,
        loadedManifest.pageSize,
        loadedManifest.id
      );

      let rawSessions = sessions && sessions.length > 0 ? sessions : [
        {
          id: `${loadedManifest.id}-session-1`,
          projectId: loadedManifest.id,
          sessionNumber: 1,
          startedAt: loadedManifest.createdAt || new Date().toISOString(),
          completedAt: null,
          text: cleanText,
          wordCount: countWords(cleanText),
        },
      ];

      // If there is only 1 session and its text is empty, populate it with cleanText
      if (rawSessions.length === 1 && (!rawSessions[0].text || rawSessions[0].text.trim() === '')) {
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
          const priorSessions = projectSessions.slice(0, lastIdx);
          const priorWords = priorSessions.reduce((acc, s) => acc + (s.wordCount || 0), 0);
          const docTotalWords = countWords(cleanText);
          const activeWords = Math.max(0, docTotalWords - priorWords);
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
        outboxCount: partitioned.historicalPages.length,
        lastPrintedCharIndex: loadedManifest.lastPrintedCharIndex ?? 0,
        printedPagesCount: loadedManifest.printedPagesCount ?? 0,
        activeSessionId: loadedManifest.activeSessionId || normalizedSessions[normalizedSessions.length - 1].id,
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
      });
    } catch (e) {
      console.error('Failed to rehydrate project from IndexedDB:', e);
    }
  },
};
});
