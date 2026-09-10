import { create } from 'zustand';
import {
  CharacterCell,
  LineRecord,
  PageRecord,
  ManuscriptManifest,
  ApertureHeight,
  WrapMode,
  PageSize,
  TypingEngineState,
  TypingEngineActions,
} from '@/types';
import { wrapLine, getLastPrintableCellIndex, createCellId, MAX_COLUMNS } from '@/lib/wrap';
import { saveManuscript, savePage } from '@/db';

export function createEmptyLine(pageNumber: number, lineIndex: number): LineRecord {
  return {
    id: `p${pageNumber}-line-${lineIndex}`,
    lineIndex,
    cells: [],
    isCommitted: false,
  };
}

export const DEFAULT_MANIFEST: ManuscriptManifest = {
  id: 'default-manuscript',
  title: 'Untitled Manuscript',
  mode: 'local',
  inboxCount: 0,
  outboxCount: 0,
  lastPrintedCharIndex: 0,
  printedPagesCount: 0,
  activeApertureHeight: 1,
  wrapMode: 'soft',
  pageSize: 54,
  colorScheme: 'typewriter',
  typeface: 'courier-prime',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export interface TypingStore extends TypingEngineState, TypingEngineActions {
  currentPageNumber: number;
  historicalPages: PageRecord[];
  pendingWrappedCells: CharacterCell[] | null;
}

export const useTypingStore = create<TypingStore>((set, get) => ({
  manifest: { ...DEFAULT_MANIFEST },
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

  setManifest: (newManifest) => {
    set((state) => {
      const updated = { ...state.manifest, ...newManifest };
      if (updated.mode === 'local') {
        saveManuscript(updated).catch(console.error);
      }
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
      const updated = { ...state.manifest, pageSize };
      if (updated.mode === 'local') {
        saveManuscript(updated).catch(console.error);
      }
      return { manifest: updated };
    });
  },

  insertChar: (char: string) => {
    const state = get();
    if (state.isLocked || char.length !== 1) return;

    let lines = [...state.currentPageLines];
    let isHighlighting = state.isHighlighting;
    let highlightHead = state.highlightHead;
    let activeLineIndex = state.activeLineIndex;

    // 1. If currently in highlight mode, any keystroke immediately strikes out highlighted text:
    // Converts all 'highlighted' cells to 'struck', clears highlight mode, and snaps cursor to drafting head.
    if (isHighlighting) {
      lines = lines.map((line) => ({
        ...line,
        cells: line.cells.map((cell) =>
          cell.state === 'highlighted' ? { ...cell, state: 'struck' as const } : cell
        ),
      }));
      isHighlighting = false;
      highlightHead = null;
    }

    const currentLine = lines[activeLineIndex] || createEmptyLine(state.currentPageNumber, activeLineIndex);
    const lineCells = [...currentLine.cells];
    const colCount = lineCells.length;

    // Soft word wrap boundary check:
    // Exactly 70 character cells fit in a line (columns 0 to 69).
    // Typing the 71st character (colCount >= MAX_COLUMNS) triggers soft word wrap.
    const needsWrap = colCount >= MAX_COLUMNS;

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

      set({
        currentPageLines: lines,
        activeColIndex: colCount + 1,
        isHighlighting: false,
        highlightHead: null,
      });
      return;
    }

    // Line boundary reached (soft wrap triggered)
    const wrapResult = wrapLine(
      currentLine,
      char,
      state.currentPageNumber,
      activeLineIndex + 1,
      'soft'
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
    if (nextLineIndex >= state.manifest.pageSize) {
      const completedPage: PageRecord = {
        id: `${state.manifest.id}-page-${state.currentPageNumber}`,
        manuscriptId: state.manifest.id,
        pageNumber: state.currentPageNumber,
        lines: lines,
        completedAt: new Date().toISOString(),
      };

      const newOutbox = state.manifest.outboxCount + 1;
      const historical = [...state.historicalPages, completedPage];

      if (state.manifest.mode === 'local') {
        savePage(completedPage).catch(console.error);
      }

      // Automatically advance to next page seamlessly (no inbox locking)
      const newPageNum = state.currentPageNumber + 1;
      const firstLine: LineRecord = {
        id: `p${newPageNum}-line-0`,
        lineIndex: 0,
        cells: wrapResult.nextLineCells,
        isCommitted: false,
      };

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

    const lines = [...state.currentPageLines];
    const activeLineIndex = state.activeLineIndex;
    const minVisibleLine = Math.max(0, activeLineIndex - state.manifest.activeApertureHeight + 1);

    if (!state.isHighlighting) {
      // Enter Highlight Mode: traverse backward from the active typing head
      const currentLine = lines[activeLineIndex];
      const printableIndex = currentLine ? getLastPrintableCellIndex(currentLine.cells) : -1;

      if (printableIndex >= 0) {
        // Highlight the last cell on the active line
        const targetCell = currentLine.cells[printableIndex];
        lines[activeLineIndex] = {
          ...currentLine,
          cells: currentLine.cells.map((cell, idx) =>
            idx === printableIndex ? { ...cell, state: 'highlighted' as const } : cell
          ),
        };

        set({
          currentPageLines: lines,
          isHighlighting: true,
          highlightHead: { lineIndex: activeLineIndex, colIndex: printableIndex },
        });
        return;
      }

      // If active line is empty, try to step back into preceding visible line
      if (activeLineIndex > minVisibleLine) {
        const prevLineIndex = activeLineIndex - 1;
        const prevLine = lines[prevLineIndex];
        if (prevLine) {
          const prevPrintableIndex = getLastPrintableCellIndex(prevLine.cells);
          if (prevPrintableIndex >= 0) {
            lines[prevLineIndex] = {
              ...prevLine,
              cells: prevLine.cells.map((cell, idx) =>
                idx === prevPrintableIndex ? { ...cell, state: 'highlighted' as const } : cell
              ),
            };

            set({
              currentPageLines: lines,
              isHighlighting: true,
              highlightHead: { lineIndex: prevLineIndex, colIndex: prevPrintableIndex },
            });
            return;
          }
        }
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
          idx === nextCol ? { ...cell, state: 'highlighted' as const } : cell
        ),
      };

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
              idx === prevPrintableIndex ? { ...cell, state: 'highlighted' as const } : cell
            ),
          };

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

    let lines = [...state.currentPageLines];

    if (state.isHighlighting) {
      // Enter with active highlight:
      // Converts all 'highlighted' cells to 'struck', clears selection,
      // snaps cursor to end of active line without creating a newline.
      lines = lines.map((line) => ({
        ...line,
        cells: line.cells.map((cell) =>
          cell.state === 'highlighted' ? { ...cell, state: 'struck' as const } : cell
        ),
      }));

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
    const currentLine = lines[state.activeLineIndex] || createEmptyLine(state.currentPageNumber, state.activeLineIndex);
    lines[state.activeLineIndex] = {
      ...currentLine,
      isCommitted: true,
      wrapType: 'hard',
    };

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

    const nextLineIndex = state.activeLineIndex + 1;
    if (nextLineIndex >= state.manifest.pageSize) {
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

      if (state.manifest.mode === 'local') {
        savePage(completedPage).catch(console.error);
      }

      const newPageNum = state.currentPageNumber + 1;
      const firstLine = createEmptyLine(newPageNum, 0);

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

  resetEngine: (newManifest) => {
    const manifest = { ...DEFAULT_MANIFEST, ...newManifest };
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
    });
  },
}));
