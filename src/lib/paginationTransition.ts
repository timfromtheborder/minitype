import {
  CharacterCell,
  LineRecord,
  PageRecord,
  PageMode,
  ManuscriptManifest,
} from '@/types';
import { createCellId } from '@/lib/wrap';
import { persistSettings } from '@/stores/settingsPersistence';
import { saveManuscript, savePage, pruneStalePagesForManuscript, flushPendingSave } from '@/db';

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

export function applyPageModeTransition(
  targetMode: PageMode,
  state: any,
  manifestOverrides: Partial<ManuscriptManifest> = {}
): any {
  flushPendingSave();

  const currentMode = state.manifest.pageMode || 'scroll';
  const targetPageSize = targetMode === 'scroll' ? 999999 : targetMode === 'notecard' ? 10 : 9999;
  const targetApertureHeight =
    targetMode === 'notecard'
      ? 10
      : (manifestOverrides.activeApertureHeight ??
          (state.manifest.pageMode === 'notecard'
            ? (state.manifest.preferredApertureHeight ?? 1)
            : state.manifest.activeApertureHeight));

  if (targetMode === currentMode) {
    const updatedManifest: ManuscriptManifest = {
      ...state.manifest,
      ...manifestOverrides,
      pageMode: targetMode,
      pageSize: targetPageSize,
      activeApertureHeight: targetApertureHeight,
      ...(targetMode !== 'notecard' ? { preferredApertureHeight: targetApertureHeight } : {}),
    };
    persistSettings(updatedManifest);
    if (updatedManifest.mode === 'local') {
      saveManuscript(updatedManifest).catch(console.error);
    }
    return { manifest: updatedManifest };
  }

  // 1. Switching to 'scroll': populate platen immediately with preceding text from all pages
  if (targetMode === 'scroll') {
    let currentLines = [...(state.currentPageLines || [])];
    if (state.isHighlighting && state.activeLineIndex < currentLines.length) {
      const activeLine = currentLines[state.activeLineIndex];
      currentLines[state.activeLineIndex] = {
        ...activeLine,
        cells: activeLine.cells.map((c: CharacterCell) =>
          c.state === 'highlighted' ? { ...c, state: 'struck' as const, isStruck: true } : c
        ),
      };
    }

    const allLines: LineRecord[] = [];
    for (const page of (state.historicalPages || [])) {
      for (const line of page.lines) {
        allLines.push(line);
      }
    }
    for (const line of currentLines) {
      if (line.cells.length > 0 || line.isCommitted) {
        allLines.push(line);
      }
    }

    // Check if the final line was an active drafting line that was uncommitted
    const lastCurrentLine = currentLines[state.activeLineIndex];
    const isDraftingOnLastLine =
      !state.isHighlighting &&
      lastCurrentLine &&
      !lastCurrentLine.isCommitted &&
      lastCurrentLine.cells.length > 0 &&
      allLines.length > 0 &&
      allLines[allLines.length - 1] === lastCurrentLine;

    const unifiedLines: LineRecord[] = [];
    for (let idx = 0; idx < allLines.length; idx++) {
      const line = allLines[idx];
      const isLast = idx === allLines.length - 1;
      const keepUncommitted = isLast && isDraftingOnLastLine;

      unifiedLines.push({
        ...line,
        id: `p1-line-${idx}`,
        lineIndex: idx,
        isCommitted: keepUncommitted ? false : true,
        wrapType: keepUncommitted ? line.wrapType : (line.wrapType || (isLast ? 'hard' : 'soft')),
        cells: line.cells.map((c, colIdx) => ({
          ...c,
          id: createCellId(1, idx, colIdx),
          lineIndex: idx,
          state: c.state === 'highlighted' ? ('struck' as const) : c.state,
          isStruck: c.isStruck || c.state === 'highlighted' || c.state === 'struck',
        })),
      });
    }

    let activeLineIndex = 0;
    let activeColIndex = 0;

    if (isDraftingOnLastLine && unifiedLines.length > 0) {
      activeLineIndex = unifiedLines.length - 1;
      activeColIndex = unifiedLines[activeLineIndex].cells.length;
    } else {
      activeLineIndex = unifiedLines.length;
      activeColIndex = 0;
      unifiedLines.push(createEmptyLine(1, activeLineIndex));
    }

    const updatedManifest: ManuscriptManifest = {
      ...state.manifest,
      ...manifestOverrides,
      pageMode: 'scroll',
      pageSize: 999999,
      activeApertureHeight: targetApertureHeight,
      preferredApertureHeight: targetApertureHeight,
      outboxCount: 0,
    };

    persistSettings(updatedManifest);
    if (updatedManifest.mode === 'local') {
      saveManuscript(updatedManifest).catch(console.error);
      const page1: PageRecord = {
        id: `${updatedManifest.id}-page-1`,
        manuscriptId: updatedManifest.id,
        pageNumber: 1,
        lines: unifiedLines,
        completedAt: null,
      };
      savePage(page1).catch(console.error);
      pruneStalePagesForManuscript(updatedManifest.id, 1).catch(console.error);
    }

    return {
      manifest: updatedManifest,
      currentPageNumber: 1,
      historicalPages: [],
      currentPageLines: unifiedLines,
      activeLineIndex,
      activeColIndex,
      isHighlighting: false,
      highlightHead: null,
    };
  }

  // 2. Switching to 'notecard': always begin a new notecard
  if (targetMode === 'notecard') {
    let currentLines = [...state.currentPageLines];
    if (state.isHighlighting && state.activeLineIndex < currentLines.length) {
      const activeLine = currentLines[state.activeLineIndex];
      currentLines[state.activeLineIndex] = {
        ...activeLine,
        cells: activeLine.cells.map((c: CharacterCell) =>
          c.state === 'highlighted' ? { ...c, state: 'struck' as const, isStruck: true } : c
        ),
      };
    }

    const allContentLines: LineRecord[] = [];
    for (const page of state.historicalPages) {
      for (const line of page.lines) {
        allContentLines.push(line);
      }
    }
    for (const line of currentLines) {
      if (line.cells.length > 0 || line.isCommitted) {
        allContentLines.push({ ...line, isCommitted: true });
      }
    }

    const historicalPages: PageRecord[] = [];
    for (let i = 0; i < allContentLines.length; i += 10) {
      const chunk = allContentLines.slice(i, i + 10);
      const pageNum = historicalPages.length + 1;
      historicalPages.push({
        id: `${state.manifest.id}-page-${pageNum}`,
        manuscriptId: state.manifest.id,
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

    const currentPageNumber = historicalPages.length + 1;
    const currentPageLines = [createEmptyLine(currentPageNumber, 0)];
    const activeLineIndex = 0;
    const activeColIndex = 0;

    const updatedManifest: ManuscriptManifest = {
      ...state.manifest,
      ...manifestOverrides,
      preferredApertureHeight:
        state.manifest.pageMode !== 'notecard'
          ? state.manifest.activeApertureHeight
          : (state.manifest.preferredApertureHeight ?? 1),
      pageMode: 'notecard',
      pageSize: 10,
      activeApertureHeight: 10,
      outboxCount: historicalPages.length,
    };

    persistSettings(updatedManifest);
    if (updatedManifest.mode === 'local') {
      saveManuscript(updatedManifest).catch(console.error);
      for (const hp of historicalPages) {
        savePage(hp).catch(console.error);
      }
      const activePage: PageRecord = {
        id: `${updatedManifest.id}-page-${currentPageNumber}`,
        manuscriptId: updatedManifest.id,
        pageNumber: currentPageNumber,
        lines: currentPageLines,
        completedAt: null,
      };
      savePage(activePage).catch(console.error);
      pruneStalePagesForManuscript(updatedManifest.id, currentPageNumber).catch(console.error);
    }

    return {
      manifest: updatedManifest,
      currentPageNumber,
      historicalPages,
      currentPageLines,
      activeLineIndex,
      activeColIndex,
      isHighlighting: false,
      highlightHead: null,
    };
  }

  // 3. Switching to 'paragraph': partition preceding paragraphs into historical pages and keep active paragraph on platen
  if (targetMode === 'paragraph') {
    let currentLines = [...(state.currentPageLines || [])];
    if (state.isHighlighting && state.activeLineIndex < currentLines.length) {
      const activeLine = currentLines[state.activeLineIndex];
      currentLines[state.activeLineIndex] = {
        ...activeLine,
        cells: activeLine.cells.map((c: CharacterCell) =>
          c.state === 'highlighted' ? { ...c, state: 'struck' as const, isStruck: true } : c
        ),
      };
    }

    const allLines: LineRecord[] = [];
    for (const page of (state.historicalPages || [])) {
      for (const line of page.lines) {
        allLines.push(line);
      }
    }
    for (const line of currentLines) {
      if (line.cells.length > 0 || line.isCommitted) {
        allLines.push(line);
      }
    }

    const lastCurrentLine = currentLines[state.activeLineIndex];
    const isDrafting =
      !state.isHighlighting &&
      lastCurrentLine &&
      !lastCurrentLine.isCommitted &&
      lastCurrentLine.cells.length > 0 &&
      allLines.length > 0 &&
      allLines[allLines.length - 1] === lastCurrentLine;

    // Partition allLines into paragraph groups
    const paragraphGroups: LineRecord[][] = [];
    let currentGroup: LineRecord[] = [];

    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i];
      // Skip empty separator line if currentGroup is empty and it's not the only line
      if (line.cells.length === 0 && currentGroup.length === 0 && i < allLines.length - 1) {
        continue;
      }
      currentGroup.push(line);
      // Hard break marks the end of a paragraph group, unless it's the very last line
      if (line.wrapType === 'hard' && i < allLines.length - 1) {
        paragraphGroups.push(currentGroup);
        currentGroup = [];
      }
    }
    if (currentGroup.length > 0 || paragraphGroups.length === 0) {
      paragraphGroups.push(currentGroup);
    }

    const historicalPages: PageRecord[] = [];
    const lastLineOfAll = allLines[allLines.length - 1];
    const lastEndedWithHardBreak = lastLineOfAll && lastLineOfAll.wrapType === 'hard' && !isDrafting;

    let activePageNumber = 1;
    let activePageLines: LineRecord[] = [];
    let activeLineIndex = 0;
    let activeColIndex = 0;

    // If the document has only a single paragraph in progress and no historical pages,
    // lines are already on page 1 and do not need to be partitioned.
    if ((state.historicalPages || []).length === 0 && paragraphGroups.length <= 1 && !lastEndedWithHardBreak) {
      const updatedManifest: ManuscriptManifest = {
        ...state.manifest,
        ...manifestOverrides,
        pageMode: 'paragraph',
        pageSize: 9999,
        activeApertureHeight: targetApertureHeight,
        preferredApertureHeight: targetApertureHeight,
      };
      persistSettings(updatedManifest);
      if (updatedManifest.mode === 'local') {
        saveManuscript(updatedManifest).catch(console.error);
      }
      return { manifest: updatedManifest };
    }

    if (allLines.length === 0) {
      activePageNumber = 1;
      activePageLines = [createEmptyLine(1, 0)];
      activeLineIndex = 0;
      activeColIndex = 0;
    } else if (lastEndedWithHardBreak) {
      // All paragraphs completed; convert all groups to historical pages
      for (let pIdx = 0; pIdx < paragraphGroups.length; pIdx++) {
        const pageNum = pIdx + 1;
        historicalPages.push({
          id: `${state.manifest.id}-page-${pageNum}`,
          manuscriptId: state.manifest.id,
          pageNumber: pageNum,
          lines: paragraphGroups[pIdx].map((l, lIdx) => ({
            ...l,
            id: `p${pageNum}-line-${lIdx}`,
            lineIndex: lIdx,
            isCommitted: true,
            wrapType: l.wrapType || (lIdx === paragraphGroups[pIdx].length - 1 ? 'hard' : 'soft'),
            cells: l.cells.map((c, colIdx) => ({
              ...c,
              id: createCellId(pageNum, lIdx, colIdx),
              lineIndex: lIdx,
              state: c.state === 'highlighted' ? ('struck' as const) : c.state,
              isStruck: c.isStruck || c.state === 'highlighted' || c.state === 'struck',
            })),
          })),
          completedAt: new Date().toISOString(),
        });
      }
      activePageNumber = historicalPages.length + 1;
      activePageLines = [createEmptyLine(activePageNumber, 0)];
      activeLineIndex = 0;
      activeColIndex = 0;
    } else {
      // The last paragraph is active/unfinished. Preceding paragraphs become historical pages.
      for (let pIdx = 0; pIdx < paragraphGroups.length - 1; pIdx++) {
        const pageNum = pIdx + 1;
        historicalPages.push({
          id: `${state.manifest.id}-page-${pageNum}`,
          manuscriptId: state.manifest.id,
          pageNumber: pageNum,
          lines: paragraphGroups[pIdx].map((l, lIdx) => ({
            ...l,
            id: `p${pageNum}-line-${lIdx}`,
            lineIndex: lIdx,
            isCommitted: true,
            wrapType: l.wrapType || (lIdx === paragraphGroups[pIdx].length - 1 ? 'hard' : 'soft'),
            cells: l.cells.map((c, colIdx) => ({
              ...c,
              id: createCellId(pageNum, lIdx, colIdx),
              lineIndex: lIdx,
              state: c.state === 'highlighted' ? ('struck' as const) : c.state,
              isStruck: c.isStruck || c.state === 'highlighted' || c.state === 'struck',
            })),
          })),
          completedAt: new Date().toISOString(),
        });
      }
      activePageNumber = historicalPages.length + 1;
      const activeGroup = paragraphGroups[paragraphGroups.length - 1] || [];
      activePageLines = activeGroup.map((l, lIdx) => {
        const isLastInGroup = lIdx === activeGroup.length - 1;
        const keepUncommitted = isLastInGroup && isDrafting;
        return {
          ...l,
          id: `p${activePageNumber}-line-${lIdx}`,
          lineIndex: lIdx,
          isCommitted: keepUncommitted ? false : true,
          wrapType: keepUncommitted ? l.wrapType : (l.wrapType || 'soft'),
          cells: l.cells.map((c, colIdx) => ({
            ...c,
            id: createCellId(activePageNumber, lIdx, colIdx),
            lineIndex: lIdx,
            state: c.state === 'highlighted' ? ('struck' as const) : c.state,
            isStruck: c.isStruck || c.state === 'highlighted' || c.state === 'struck',
          })),
        };
      });

      if (isDrafting && activePageLines.length > 0) {
        activeLineIndex = activePageLines.length - 1;
        activeColIndex = activePageLines[activeLineIndex].cells.length;
      } else {
        activeLineIndex = activePageLines.length;
        activeColIndex = 0;
        activePageLines.push(createEmptyLine(activePageNumber, activeLineIndex));
      }
    }

    const updatedManifest: ManuscriptManifest = {
      ...state.manifest,
      ...manifestOverrides,
      pageMode: 'paragraph',
      pageSize: 9999,
      activeApertureHeight: targetApertureHeight,
      preferredApertureHeight: targetApertureHeight,
      outboxCount: historicalPages.length,
    };

    persistSettings(updatedManifest);
    if (updatedManifest.mode === 'local') {
      saveManuscript(updatedManifest).catch(console.error);
      for (const hp of historicalPages) {
        savePage(hp).catch(console.error);
      }
      const activePage: PageRecord = {
        id: `${updatedManifest.id}-page-${activePageNumber}`,
        manuscriptId: updatedManifest.id,
        pageNumber: activePageNumber,
        lines: activePageLines,
        completedAt: null,
      };
      savePage(activePage).catch(console.error);
      pruneStalePagesForManuscript(updatedManifest.id, activePageNumber).catch(console.error);
    }

    return {
      manifest: updatedManifest,
      currentPageNumber: activePageNumber,
      historicalPages,
      currentPageLines: activePageLines,
      activeLineIndex,
      activeColIndex,
      isHighlighting: false,
      highlightHead: null,
    };
  }

  // 4. Default fallback for any other mode: simple manifest update
  const updatedManifest: ManuscriptManifest = {
    ...state.manifest,
    ...manifestOverrides,
    pageMode: targetMode,
    pageSize: targetPageSize,
    activeApertureHeight: targetApertureHeight,
    preferredApertureHeight: targetApertureHeight,
  };

  persistSettings(updatedManifest);
  if (updatedManifest.mode === 'local') {
    saveManuscript(updatedManifest).catch(console.error);
  }

  return { manifest: updatedManifest };
}
