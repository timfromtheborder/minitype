import { describe, it, expect } from 'vitest';
import { reflowLines } from '@/lib/reflow';
import { textToManuscriptLines } from '@/lib/importer';
import { sanitizeManuscript } from '@/lib/sanitize';
import { useTypingStore } from '@/stores/typingStore';
import { LineRecord, CharacterCell } from '@/types';

describe('Lossless Text Reorganization (Reflow)', () => {
  it('re-flows 70-column text to 35-column lines without scaling or character loss', () => {
    const text = 'The mechanical constraints of the typewriter create forward-momentum writing. Every single character is permanently committed.';
    const parsed = textToManuscriptLines(text, 1, 70);

    const reflowed = reflowLines(parsed.lines, 35, 1, parsed.activeLineIndex, parsed.activeColIndex);

    // Every line in 35-col mode must have <= 35 columns
    for (const line of reflowed.lines) {
      expect(line.cells.length).toBeLessThanOrEqual(35);
    }

    // Sanitize before and after: compiled text must be 100% identical
    const textBefore = sanitizeManuscript([{ pageNumber: 1, lines: parsed.lines, completedAt: null }]);
    const textAfter = sanitizeManuscript([{ pageNumber: 1, lines: reflowed.lines, completedAt: null }]);

    expect(textAfter).toBe(textBefore);
  });

  it('preserves round-trip fidelity: 70 -> 35 -> 70 produces identical line count and content', () => {
    const text = 'A quick movement in writing creates forward momentum without second-guessing.';
    const parsed = textToManuscriptLines(text, 1, 70);

    const to35 = reflowLines(parsed.lines, 35, 1, parsed.activeLineIndex, parsed.activeColIndex);
    const backTo70 = reflowLines(to35.lines, 70, 1, to35.activeLineIndex, to35.activeColIndex);

    const textOriginal = sanitizeManuscript([{ pageNumber: 1, lines: parsed.lines, completedAt: null }]);
    const textRoundTrip = sanitizeManuscript([{ pageNumber: 1, lines: backTo70.lines, completedAt: null }]);

    expect(textRoundTrip).toBe(textOriginal);
    expect(backTo70.lines.length).toBe(parsed.lines.length);
  });

  it('strictly preserves hard paragraph carriage returns across reflows', () => {
    const text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph with more details here.';
    const parsed = textToManuscriptLines(text, 1, 70);

    const to35 = reflowLines(parsed.lines, 35, 1, parsed.activeLineIndex, parsed.activeColIndex);

    // Count how many hard breaks exist
    const hardBreaksBefore = parsed.lines.filter((l) => l.wrapType === 'hard').length;
    const hardBreaksAfter = to35.lines.filter((l) => l.wrapType === 'hard').length;

    expect(hardBreaksAfter).toBe(hardBreaksBefore);

    const textBefore = sanitizeManuscript([{ pageNumber: 1, lines: parsed.lines, completedAt: null }]);
    const textAfter = sanitizeManuscript([{ pageNumber: 1, lines: to35.lines, completedAt: null }]);
    expect(textAfter).toBe(textBefore);
  });

  it('preserves struck cells and their relative positions', () => {
    const parsed = textToManuscriptLines('Hello wonderful world', 1, 70);
    // Strike out "wonderful"
    parsed.lines[0].cells = parsed.lines[0].cells.map((c) =>
      c.char === 'w' || c.char === 'o' || c.char === 'n' ? { ...c, state: 'struck' as const, isStruck: true } : c
    );

    const to35 = reflowLines(parsed.lines, 35, 1, 0, 0);

    const struckCountBefore = parsed.lines[0].cells.filter((c) => c.state === 'struck').length;
    const struckCountAfter = to35.lines.flatMap((l) => l.cells).filter((c) => c.state === 'struck').length;

    expect(struckCountAfter).toBe(struckCountBefore);
  });

  it('preserves session divider lines at exact positions', () => {
    const lines: LineRecord[] = [
      {
        id: 'p1-line-0',
        lineIndex: 0,
        cells: [{ id: 'c1', char: 'a', state: 'standard', colIndex: 0, lineIndex: 0 }],
        isCommitted: true,
        wrapType: 'hard',
      },
      {
        id: 'p1-line-1',
        lineIndex: 1,
        cells: [],
        isCommitted: true,
        wrapType: 'hard',
        isSessionDivider: true,
      },
      {
        id: 'p1-line-2',
        lineIndex: 2,
        cells: [{ id: 'c2', char: 'b', state: 'standard', colIndex: 0, lineIndex: 2 }],
        isCommitted: false,
        wrapType: 'hard',
      },
    ];

    const reflowed = reflowLines(lines, 35, 1, 2, 1);

    const dividerIndex = reflowed.lines.findIndex((l) => l.isSessionDivider);
    expect(dividerIndex).toBe(1);
    expect(reflowed.lines[dividerIndex].isSessionDivider).toBe(true);
  });

  it('correctly remaps cursor position across column bound changes', () => {
    // 70-column line with 60 characters, cursor at column 50
    const text = 'The quick brown fox jumps over the lazy dog and runs quickly into the forest';
    const parsed = textToManuscriptLines(text, 1, 70);

    // Set cursor to line 0, column 50
    const to35 = reflowLines(parsed.lines, 35, 1, 0, 50);

    // In 35-col mode, column 50 should be on line 1
    expect(to35.activeLineIndex).toBeGreaterThan(0);
    expect(to35.activeColIndex).toBeGreaterThanOrEqual(0);
    expect(to35.activeColIndex).toBeLessThanOrEqual(35);
  });

  it('useTypingStore re-flows currentPageLines when setActiveColumnLimit is invoked', () => {
    const text = 'Typing on a manual typewriter teaches discipline and patience across all devices.';
    const parsed = textToManuscriptLines(text, 1, 70);

    useTypingStore.setState({
      activeColumnLimit: 70,
      currentPageLines: parsed.lines,
      activeLineIndex: parsed.activeLineIndex,
      activeColIndex: parsed.activeColIndex,
    });

    // Flip to 35-col mode
    useTypingStore.getState().setActiveColumnLimit(35);

    const state35 = useTypingStore.getState();
    expect(state35.activeColumnLimit).toBe(35);
    for (const line of state35.currentPageLines) {
      expect(line.cells.length).toBeLessThanOrEqual(35);
    }

    // Flip back to 70-col mode
    useTypingStore.getState().setActiveColumnLimit(70);
    const state70 = useTypingStore.getState();
    expect(state70.activeColumnLimit).toBe(70);
    expect(state70.currentPageLines.length).toBe(parsed.lines.length);
  });
});
