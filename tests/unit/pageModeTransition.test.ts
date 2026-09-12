import { describe, it, expect, beforeEach } from 'vitest';
import { useTypingStore } from '@/stores/typingStore';
import { applyPageModeTransition } from '@/lib/paginationTransition';
import { db } from '@/db';
import { DEFAULT_MANIFEST } from '@/stores/settingsPersistence';
import { LineRecord } from '@/types';

function typeString(str: string) {
  for (const ch of str) {
    if (ch === '\n') {
      useTypingStore.getState().handleEnter();
    } else {
      useTypingStore.getState().insertChar(ch);
    }
  }
}

describe('Page Mode Bidirectional Transitions (Scroll <-> Paragraph)', () => {
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await db.settings.clear();
    await db.manuscripts.clear();
    await db.pages.clear();
    await db.sessions.clear();
    await useTypingStore.getState().newProject();
    useTypingStore.getState().setPageMode('scroll');
  });

  it('keeps active drafting paragraph on platen when switching to paragraph mode without wiping platen', () => {
    // Type paragraph 1, press Enter, then start drafting paragraph 2
    typeString('Paragraph 1 line.\n');
    typeString('Paragraph 2 drafting text');

    expect(useTypingStore.getState().manifest.pageMode).toBe('scroll');
    expect(useTypingStore.getState().currentPageLines.length).toBe(2);

    // Switch to paragraph mode
    useTypingStore.getState().setPageMode('paragraph');

    const state = useTypingStore.getState();
    expect(state.manifest.pageMode).toBe('paragraph');

    // Paragraph 1 should be in historicalPages
    expect(state.historicalPages.length).toBe(1);
    expect(state.historicalPages[0].lines[0].cells.map((c) => c.char).join('')).toBe('Paragraph 1 line.');

    // Paragraph 2 should be in currentPageLines (NOT wiped out)
    expect(state.currentPageNumber).toBe(2);
    expect(state.currentPageLines.length).toBe(1);
    expect(state.currentPageLines[0].cells.map((c) => c.char).join('')).toBe('Paragraph 2 drafting text');
    expect(state.currentPageLines[0].isCommitted).toBe(false);
    expect(state.activeLineIndex).toBe(0);
    expect(state.activeColIndex).toBe('Paragraph 2 drafting text'.length);
  });

  it('preserves uncommitted drafting line without injecting spurious empty lines when switching back to scroll', () => {
    typeString('Line one\n');
    typeString('Line two in progress');

    const initialLineCount = useTypingStore.getState().currentPageLines.length;
    expect(initialLineCount).toBe(2);

    // Switch to paragraph mode
    useTypingStore.getState().setPageMode('paragraph');
    // Switch immediately back to scroll mode
    useTypingStore.getState().setPageMode('scroll');

    const state = useTypingStore.getState();
    expect(state.manifest.pageMode).toBe('scroll');
    expect(state.currentPageNumber).toBe(1);
    expect(state.historicalPages.length).toBe(0);

    // Exactly 2 lines must exist: no extra empty line should have been injected
    expect(state.currentPageLines.length).toBe(2);
    expect(state.currentPageLines[0].cells.map((c) => c.char).join('')).toBe('Line one');
    expect(state.currentPageLines[0].isCommitted).toBe(true);
    expect(state.currentPageLines[1].cells.map((c) => c.char).join('')).toBe('Line two in progress');
    expect(state.currentPageLines[1].isCommitted).toBe(false);
    expect(state.activeLineIndex).toBe(1);
    expect(state.activeColIndex).toBe('Line two in progress'.length);
  });

  it('repeatedly toggling between scroll and paragraph mode is idempotent', () => {
    typeString('Paragraph one\n');
    typeString('Paragraph two active');

    for (let i = 0; i < 5; i++) {
      useTypingStore.getState().setPageMode('paragraph');
      useTypingStore.getState().setPageMode('scroll');
    }

    const state = useTypingStore.getState();
    expect(state.currentPageLines.length).toBe(2);
    expect(state.currentPageLines[0].cells.map((c) => c.char).join('')).toBe('Paragraph one');
    expect(state.currentPageLines[1].cells.map((c) => c.char).join('')).toBe('Paragraph two active');
    expect(state.currentPageLines[1].isCommitted).toBe(false);
    expect(state.activeLineIndex).toBe(1);
  });

  it('preserves wrapType hard so Backspace cancels carriage return cleanly after mode transitions', () => {
    typeString('Paragraph one\n'); // Cursor is now on empty line 1 created by Enter

    expect(useTypingStore.getState().currentPageLines.length).toBe(2);
    expect(useTypingStore.getState().activeLineIndex).toBe(1);

    // Switch to paragraph and back to scroll
    useTypingStore.getState().setPageMode('paragraph');
    useTypingStore.getState().setPageMode('scroll');

    const stateAfterSwitch = useTypingStore.getState();
    expect(stateAfterSwitch.currentPageLines.length).toBe(2);
    expect(stateAfterSwitch.activeLineIndex).toBe(1);
    expect(stateAfterSwitch.currentPageLines[0].wrapType).toBe('hard');

    // Pressing Backspace on the empty line should cleanly cancel carriage return and pop the line
    useTypingStore.getState().handleBackspace();

    const stateAfterBackspace = useTypingStore.getState();
    expect(stateAfterBackspace.currentPageLines.length).toBe(1);
    expect(stateAfterBackspace.activeLineIndex).toBe(0);
    expect(stateAfterBackspace.activeColIndex).toBe('Paragraph one'.length);
    expect(stateAfterBackspace.currentPageLines[0].cells.map((c) => c.char).join('')).toBe('Paragraph one');
  });

  it('direct domain unit test: applyPageModeTransition handles paragraph partition with uncommitted line', () => {
    const lines: LineRecord[] = [
      {
        id: 'p1-line-0',
        lineIndex: 0,
        cells: Array.from('Alpha').map((ch, i) => ({ id: `c0_${i}`, char: ch, state: 'standard', colIndex: i, lineIndex: 0 })),
        isCommitted: true,
        wrapType: 'hard',
      },
      {
        id: 'p1-line-1',
        lineIndex: 1,
        cells: Array.from('Beta').map((ch, i) => ({ id: `c1_${i}`, char: ch, state: 'standard', colIndex: i, lineIndex: 1 })),
        isCommitted: false,
      },
    ];

    const state = {
      manifest: { ...DEFAULT_MANIFEST, id: 'test-proj', pageMode: 'scroll' as const },
      historicalPages: [],
      currentPageLines: lines,
      currentPageNumber: 1,
      activeLineIndex: 1,
      activeColIndex: 4,
      isHighlighting: false,
      highlightHead: null,
    };

    // Transition to paragraph
    const toPara = applyPageModeTransition('paragraph', state);
    expect(toPara.manifest.pageMode).toBe('paragraph');
    expect(toPara.historicalPages.length).toBe(1);
    expect(toPara.historicalPages[0].lines[0].cells.map((c: any) => c.char).join('')).toBe('Alpha');
    expect(toPara.currentPageNumber).toBe(2);
    expect(toPara.currentPageLines.length).toBe(1);
    expect(toPara.currentPageLines[0].cells.map((c: any) => c.char).join('')).toBe('Beta');
    expect(toPara.currentPageLines[0].isCommitted).toBe(false);
    expect(toPara.activeLineIndex).toBe(0);
    expect(toPara.activeColIndex).toBe(4);

    // Transition back to scroll
    const toScroll = applyPageModeTransition('scroll', { ...state, ...toPara });
    expect(toScroll.manifest.pageMode).toBe('scroll');
    expect(toScroll.historicalPages.length).toBe(0);
    expect(toScroll.currentPageLines.length).toBe(2);
    expect(toScroll.currentPageLines[0].cells.map((c: any) => c.char).join('')).toBe('Alpha');
    expect(toScroll.currentPageLines[1].cells.map((c: any) => c.char).join('')).toBe('Beta');
    expect(toScroll.currentPageLines[1].isCommitted).toBe(false);
    expect(toScroll.activeLineIndex).toBe(1);
    expect(toScroll.activeColIndex).toBe(4);
  });
});
