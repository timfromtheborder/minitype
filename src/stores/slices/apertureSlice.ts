import { StateCreator } from 'zustand';
import { TypingStore } from '../types';
import {
  CharacterCell,
  LineRecord,
  PageRecord,
} from '@/types';
import {
  wrapLine,
  getLastPrintableCellIndex,
  createCellId,
  MAX_COLUMNS,
} from '@/lib/wrap';
import { typewriterAudio } from '@/lib/sound';
import {
  saveManuscript,
  savePage,
  deletePage,
  pruneStalePagesForManuscript,
  debounceSavePage,
  flushPendingSave,
} from '@/db';
import { createEmptyLine, getPageLineLimit } from '@/lib/paginationTransition';
import { persistSettings } from '../settingsPersistence';
import { triggerVisualSaveOnTyping, markProjectDirty } from './persistenceSlice';
import { ensureActiveSessionOnTyping } from './projectSlice';

export interface ApertureSlice {
  activeLineIndex: number;
  activeColIndex: number;
  isHighlighting: boolean;
  highlightHead: { lineIndex: number; colIndex: number } | null;
  isLocked: boolean;
  lockReason: 'page_exhaustion' | null;
  activeColumnLimit: number;
  pendingWrappedCells: CharacterCell[] | null;
  setActiveColumnLimit: (limit: number) => void;
  insertChar: (char: string) => void;
  handleBackspace: (options?: { byWord?: boolean }) => void;
  handleEnter: () => void;
  handleKeyDown: (e: KeyboardEvent | React.KeyboardEvent) => void;
  feedPaper: (amount?: number) => void;
}

export const createApertureSlice: StateCreator<
  TypingStore,
  [],
  [],
  ApertureSlice
> = (set, get) => ({
  activeLineIndex: 0,
  activeColIndex: 0,
  isHighlighting: false,
  highlightHead: null,
  isLocked: false,
  lockReason: null,
  activeColumnLimit: 70,
  pendingWrappedCells: null,

  setActiveColumnLimit: (limit: number) =>
    set((state) => (state.activeColumnLimit === limit ? state : { activeColumnLimit: limit })),

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
    const isScrollMode = state.manifest.pageMode === 'scroll';
    const pageLineLimit = getPageLineLimit(state.manifest.pageMode, state.manifest.pageSize);
    const newSessionCommitted = (state.sessionCommittedLines || 0) + 1;
    const newOutbox = isScrollMode ? 0 : Math.floor(newSessionCommitted / 10);

    if (nextLineIndex >= pageLineLimit) {
      if (state.manifest.pageMode === 'notecard') {
        typewriterAudio.playPaperFeed();
      }
      const completedPage: PageRecord = {
        id: `${state.manifest.id}-page-${state.currentPageNumber}`,
        manuscriptId: state.manifest.id,
        pageNumber: state.currentPageNumber,
        lines: lines,
        completedAt: new Date().toISOString(),
      };

      const historical = [...state.historicalPages, completedPage];

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
        sessionCommittedLines: newSessionCommitted,
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

    const updatedManifest = newOutbox !== state.manifest.outboxCount
      ? { ...state.manifest, outboxCount: newOutbox }
      : state.manifest;

    set({
      manifest: updatedManifest,
      currentPageLines: lines,
      activeLineIndex: nextLineIndex,
      activeColIndex: wrapResult.nextLineCells.length,
      isHighlighting: false,
      highlightHead: null,
      sessionCommittedLines: newSessionCommitted,
    });
  },

  handleBackspace: (options?: { byWord?: boolean }) => {
    const state = get();
    if (state.isLocked) return;
    triggerVisualSaveOnTyping(set, get);
    markProjectDirty(set, get);

    const lines = [...state.currentPageLines];
    const activeLineIndex = state.activeLineIndex;
    const minVisibleLine = Math.max(0, activeLineIndex - state.manifest.activeApertureHeight + 1);

    let isHighlighting = state.isHighlighting;
    let head = state.highlightHead;

    if (!isHighlighting) {
      // Enter Highlight Mode: traverse backward from the active typing head
      const currentLine = lines[activeLineIndex];
      const printableIndex = currentLine ? getLastPrintableCellIndex(currentLine.cells) : -1;

      // If active line has printable characters, highlight the last one
      if (printableIndex >= 0) {
        lines[activeLineIndex] = {
          ...currentLine,
          cells: currentLine.cells.map((cell, idx) =>
            idx === printableIndex
              ? { ...cell, state: 'highlighted' as const, isStruck: cell.isStruck || cell.state === 'struck' }
              : cell
          ),
        };

        isHighlighting = true;
        head = { lineIndex: activeLineIndex, colIndex: printableIndex };
      } else if (activeLineIndex > 0) {
        // If active line is empty and was created by Enter (prevLine has wrapType === 'hard'):
        // Backspace strikes out the carriage return!
        const prevLineIndex = activeLineIndex - 1;
        const prevLine = lines[prevLineIndex];
        if (prevLine && prevLine.wrapType === 'hard') {
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

        // If prevLine was soft-wrapped, traverse back to highlight its last printable char
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

            isHighlighting = true;
            head = { lineIndex: prevLineIndex, colIndex: prevPrintableIndex };
          }
        }
      } else if (activeLineIndex === 0 && (!currentLine || currentLine.cells.length === 0) && state.historicalPages.length > 0) {
        // If active line is at index 0, empty, and a previous completed page exists:
        // Strike out paragraph carriage return and restore previous page
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

        const isScrollMode = state.manifest.pageMode === 'scroll';
        const newSessionCommitted = Math.max(0, (state.sessionCommittedLines || 0) - 1);
        const newOutbox = isScrollMode ? 0 : Math.floor(newSessionCommitted / 10);

        set({
          manifest: {
            ...state.manifest,
            outboxCount: newOutbox,
          },
          historicalPages: historical,
          currentPageNumber: prevPage.pageNumber,
          currentPageLines: restoredLines,
          activeLineIndex: lastLineIndex,
          activeColIndex: lastLine ? lastLine.cells.length : 0,
          isHighlighting: false,
          highlightHead: null,
          sessionCommittedLines: newSessionCommitted,
        });
        return;
      }
    }

    if (!head || !isHighlighting) {
      return;
    }

    // Helper: step backward 1 cell in highlight mode
    const stepOneCell = (): { char: string } | null => {
      if (!head) return null;
      const curLine = lines[head.lineIndex];
      if (!curLine) return null;

      let nextCol = head.colIndex - 1;
      while (nextCol >= 0 && curLine.cells[nextCol]?.isSoftPadding) {
        nextCol--;
      }

      if (nextCol >= 0) {
        const cell = curLine.cells[nextCol];
        lines[head.lineIndex] = {
          ...curLine,
          cells: curLine.cells.map((c, idx) =>
            idx === nextCol
              ? { ...c, state: 'highlighted' as const, isStruck: c.isStruck || c.state === 'struck' }
              : c
          ),
        };
        head = { lineIndex: head.lineIndex, colIndex: nextCol };
        return { char: cell?.char || ' ' };
      }

      if (head.lineIndex > minVisibleLine) {
        const prevLineIndex = head.lineIndex - 1;
        const prevLine = lines[prevLineIndex];
        if (prevLine) {
          const prevPrintableIndex = getLastPrintableCellIndex(prevLine.cells);
          if (prevPrintableIndex >= 0) {
            const cell = prevLine.cells[prevPrintableIndex];
            lines[prevLineIndex] = {
              ...prevLine,
              cells: prevLine.cells.map((c, idx) =>
                idx === prevPrintableIndex
                  ? { ...c, state: 'highlighted' as const, isStruck: c.isStruck || c.state === 'struck' }
                  : cell
              ),
            };
            head = { lineIndex: prevLineIndex, colIndex: prevPrintableIndex };
            return { char: cell?.char || ' ' };
          }
        }
      }

      return null;
    };

    if (!state.isHighlighting) {
      // Just entered highlight mode: head is on the first highlighted cell
      if (options?.byWord) {
        const firstChar = lines[head.lineIndex]?.cells[head.colIndex]?.char || '';
        let onSpace = /\s/.test(firstChar);
        while (onSpace) {
          const stepped = stepOneCell();
          if (!stepped) break;
          if (!/\s/.test(stepped.char)) {
            onSpace = false;
          }
        }
        while (true) {
          const curLine = lines[head.lineIndex];
          let peekCol = head.colIndex - 1;
          while (peekCol >= 0 && curLine?.cells[peekCol]?.isSoftPadding) peekCol--;
          if (peekCol < 0 && head.lineIndex <= minVisibleLine) break;
          const nextChar = peekCol >= 0 ? curLine?.cells[peekCol]?.char : null;
          if (nextChar && /\s/.test(nextChar)) break;

          const stepped = stepOneCell();
          if (!stepped) break;
          if (/\s/.test(stepped.char)) break;
        }
      }
    } else {
      // Already in highlight mode: expand backward
      if (options?.byWord) {
        const first = stepOneCell();
        if (first) {
          let onSpace = /\s/.test(first.char);
          while (onSpace) {
            const stepped = stepOneCell();
            if (!stepped) break;
            if (!/\s/.test(stepped.char)) {
              onSpace = false;
            }
          }
          while (true) {
            const curLine = lines[head.lineIndex];
            let peekCol = head.colIndex - 1;
            while (peekCol >= 0 && curLine?.cells[peekCol]?.isSoftPadding) peekCol--;
            if (peekCol < 0 && head.lineIndex <= minVisibleLine) break;
            const nextChar = peekCol >= 0 ? curLine?.cells[peekCol]?.char : null;
            if (nextChar && /\s/.test(nextChar)) break;

            const stepped = stepOneCell();
            if (!stepped) break;
            if (/\s/.test(stepped.char)) break;
          }
        }
      } else {
        stepOneCell();
      }
    }

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
      highlightHead: head,
    });
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
    const isScrollMode = state.manifest.pageMode === 'scroll';
    const pageLineLimit = getPageLineLimit(state.manifest.pageMode, state.manifest.pageSize);
    const shouldCompletePage = isParagraphMode || nextLineIndex >= pageLineLimit;

    const newSessionCommitted = (state.sessionCommittedLines || 0) + 1;
    const newOutbox = isScrollMode ? 0 : Math.floor(newSessionCommitted / 10);

    if (shouldCompletePage) {
      if (state.manifest.pageMode === 'notecard') {
        typewriterAudio.playPaperFeed();
      }
      // Page completed on Enter
      const completedPage: PageRecord = {
        id: `${state.manifest.id}-page-${state.currentPageNumber}`,
        manuscriptId: state.manifest.id,
        pageNumber: state.currentPageNumber,
        lines,
        completedAt: new Date().toISOString(),
      };

      const historical = [...state.historicalPages, completedPage];

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
        sessionCommittedLines: newSessionCommitted,
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

    const updatedManifest = newOutbox !== state.manifest.outboxCount
      ? { ...state.manifest, outboxCount: newOutbox }
      : state.manifest;

    set({
      manifest: updatedManifest,
      currentPageLines: lines,
      activeLineIndex: nextLineIndex,
      activeColIndex: 0,
      isHighlighting: false,
      highlightHead: null,
      sessionCommittedLines: newSessionCommitted,
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

  handleKeyDown: (e: KeyboardEvent | React.KeyboardEvent) => {
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
});
