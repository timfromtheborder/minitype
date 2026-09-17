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

export function getPageLineLimit(mode?: PageMode | 'paragraph', customSize?: number): number {
  if (mode === 'scroll' || mode === 'paragraph') return Infinity;
  if (mode === 'notecard') return 10;
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
  requestedTargetMode: PageMode | 'paragraph',
  state: any,
  manifestOverrides: Partial<ManuscriptManifest> = {}
): any {
  flushPendingSave();

  const targetMode: PageMode = requestedTargetMode === 'paragraph' ? 'scroll' : requestedTargetMode;
  const currentMode = state.manifest.pageMode || 'scroll';
  const targetPageSize = targetMode === 'scroll' ? 999999 : targetMode === 'notecard' ? 10 : 54;
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
      const hasClosedSessions = state.activeSessions && state.activeSessions.some((s: any) => s.completedAt !== null);
      const lastLine = unifiedLines.length > 0 ? unifiedLines[unifiedLines.length - 1] : null;
      if (hasClosedSessions && unifiedLines.length > 0 && !lastLine?.isSessionDivider) {
        const dividerIdx = unifiedLines.length;
        unifiedLines.push({
          id: `p1-divider-${dividerIdx}`,
          lineIndex: dividerIdx,
          cells: [],
          isCommitted: true,
          isSessionDivider: true,
        });
      }
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

  // 3. Default fallback for any other mode: simple manifest update
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
