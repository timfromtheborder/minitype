import { describe, it, expect, beforeEach } from 'vitest';
import {
  getPageLineLimit,
  createEmptyLine,
  applyPageModeTransition,
} from '@/lib/paginationTransition';
import { DEFAULT_MANIFEST } from '@/stores/settingsPersistence';
import { LineRecord, PageRecord } from '@/types';

describe('Pagination Transition Domain Service', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('getPageLineLimit', () => {
    it('returns Infinity for scroll mode', () => {
      expect(getPageLineLimit('scroll')).toBe(Infinity);
    });

    it('returns 10 for notecard mode', () => {
      expect(getPageLineLimit('notecard')).toBe(10);
    });

    it('returns 9999 for paragraph mode', () => {
      expect(getPageLineLimit('paragraph')).toBe(9999);
    });

    it('returns custom size or default 54 for page mode', () => {
      expect(getPageLineLimit('page', 60)).toBe(60);
      expect(getPageLineLimit('page')).toBe(54);
    });
  });

  describe('createEmptyLine', () => {
    it('creates an empty uncommitted line record', () => {
      const line = createEmptyLine(2, 5);
      expect(line.id).toBe('p2-line-5');
      expect(line.lineIndex).toBe(5);
      expect(line.cells).toEqual([]);
      expect(line.isCommitted).toBe(false);
    });
  });

  describe('applyPageModeTransition', () => {
    it('returns updated manifest if targetMode equals currentMode', () => {
      const state = {
        manifest: { ...DEFAULT_MANIFEST, pageMode: 'scroll' as const },
        historicalPages: [],
        currentPageLines: [createEmptyLine(1, 0)],
        activeLineIndex: 0,
        activeColIndex: 0,
        isHighlighting: false,
        highlightHead: null,
      };

      const result = applyPageModeTransition('scroll', state);
      expect(result.manifest.pageMode).toBe('scroll');
      expect(result.historicalPages).toBeUndefined();
    });

    it('transitions from page to scroll: unifies all lines onto platen with trailing empty line', () => {
      const line1: LineRecord = {
        id: 'p1-line-0',
        lineIndex: 0,
        cells: [{ id: 'c1', char: 'A', state: 'standard', colIndex: 0, lineIndex: 0 }],
        isCommitted: true,
      };
      const line2: LineRecord = {
        id: 'p2-line-0',
        lineIndex: 0,
        cells: [{ id: 'c2', char: 'B', state: 'highlighted', colIndex: 0, lineIndex: 0 }],
        isCommitted: false,
      };

      const historicalPage: PageRecord = {
        id: 'proj-page-1',
        manuscriptId: 'proj',
        pageNumber: 1,
        lines: [line1],
        completedAt: new Date().toISOString(),
      };

      const state = {
        manifest: { ...DEFAULT_MANIFEST, id: 'proj', pageMode: 'page' as const },
        historicalPages: [historicalPage],
        currentPageLines: [line2],
        currentPageNumber: 2,
        activeLineIndex: 0,
        activeColIndex: 1,
        isHighlighting: true,
        highlightHead: { lineIndex: 0, colIndex: 0 },
      };

      const result = applyPageModeTransition('scroll', state);
      expect(result.manifest.pageMode).toBe('scroll');
      expect(result.currentPageNumber).toBe(1);
      expect(result.historicalPages).toEqual([]);
      // Should have unified 2 content lines + 1 active empty drafting line
      expect(result.currentPageLines.length).toBe(3);
      // Highlighted cell should have transitioned to struck
      expect(result.currentPageLines[1].cells[0].state).toBe('struck');
      expect(result.activeLineIndex).toBe(2);
      expect(result.activeColIndex).toBe(0);
      expect(result.isHighlighting).toBe(false);
    });

    it('transitions to notecard: chunks all existing lines into 10-line cards and starts fresh card', () => {
      const lines: LineRecord[] = [];
      for (let i = 0; i < 25; i++) {
        lines.push({
          id: `p1-line-${i}`,
          lineIndex: i,
          cells: [{ id: `c-${i}`, char: 'X', state: 'standard', colIndex: 0, lineIndex: i }],
          isCommitted: true,
        });
      }

      const state = {
        manifest: { ...DEFAULT_MANIFEST, id: 'proj', pageMode: 'scroll' as const },
        historicalPages: [],
        currentPageLines: lines,
        currentPageNumber: 1,
        activeLineIndex: 24,
        activeColIndex: 1,
        isHighlighting: false,
        highlightHead: null,
      };

      const result = applyPageModeTransition('notecard', state);
      expect(result.manifest.pageMode).toBe('notecard');
      expect(result.manifest.activeApertureHeight).toBe(10);
      // 25 lines = 3 completed cards (10, 10, 5)
      expect(result.historicalPages.length).toBe(3);
      expect(result.historicalPages[0].lines.length).toBe(10);
      expect(result.historicalPages[1].lines.length).toBe(10);
      expect(result.historicalPages[2].lines.length).toBe(5);
      expect(result.currentPageNumber).toBe(4);
      expect(result.currentPageLines.length).toBe(1);
      expect(result.currentPageLines[0].cells).toEqual([]);
      expect(result.activeLineIndex).toBe(0);
      expect(result.activeColIndex).toBe(0);
    });
  });
});
