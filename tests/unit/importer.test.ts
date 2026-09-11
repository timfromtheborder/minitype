import { describe, it, expect } from 'vitest';
import { textToManuscriptLines, partitionManuscriptLines, healDuplicatedManuscriptText } from '@/lib/importer';

describe('Importer - textToManuscriptLines (Option A)', () => {
  it('converts simple text into platen lines with trailing newline for immediate drafting', () => {
    const text = 'Hello world';
    const parsed = textToManuscriptLines(text, 1, 70);

    // Should have 2 lines: line 0 with 'Hello world', line 1 empty for typing resumption
    expect(parsed.lines.length).toBe(2);

    const firstLine = parsed.lines[0];
    expect(firstLine.lineIndex).toBe(0);
    expect(firstLine.isCommitted).toBe(true);
    expect(firstLine.wrapType).toBe('hard');
    expect(firstLine.cells.map((c) => c.char).join('')).toBe('Hello world');
    // Verify no strikeouts
    expect(firstLine.cells.every((c) => c.state === 'standard')).toBe(true);

    // Trailing line for drafting
    const activeLine = parsed.lines[1];
    expect(activeLine.lineIndex).toBe(1);
    expect(activeLine.isCommitted).toBe(false);
    expect(activeLine.cells.length).toBe(0);

    // Option A cursor position: line 1, column 0
    expect(parsed.activeLineIndex).toBe(1);
    expect(parsed.activeColIndex).toBe(0);
  });

  it('handles empty text cleanly', () => {
    const parsed = textToManuscriptLines('', 1, 70);
    expect(parsed.lines.length).toBe(1);
    expect(parsed.lines[0].cells.length).toBe(0);
    expect(parsed.activeLineIndex).toBe(0);
    expect(parsed.activeColIndex).toBe(0);
  });

  it('preserves empty blank lines as hard breaks', () => {
    const text = 'Line 1\n\nLine 2';
    const parsed = textToManuscriptLines(text, 1, 70);

    // Line 0: "Line 1"
    // Line 1: "" (empty paragraph)
    // Line 2: "Line 2"
    // Line 3: "" (Option A appended active drafting line)
    expect(parsed.lines.length).toBe(4);
    expect(parsed.lines[0].cells.map((c) => c.char).join('')).toBe('Line 1');
    expect(parsed.lines[1].cells.length).toBe(0);
    expect(parsed.lines[1].wrapType).toBe('hard');
    expect(parsed.lines[2].cells.map((c) => c.char).join('')).toBe('Line 2');
    expect(parsed.activeLineIndex).toBe(3);
    expect(parsed.activeColIndex).toBe(0);
  });

  it('soft-wraps paragraphs that exceed the column limit', () => {
    // 35-column limit
    const sentence = 'The quick brown fox jumps over the lazy dog and runs away fast into the forest.';
    const parsed = textToManuscriptLines(sentence, 1, 35);

    // Should have multiple wrapped lines + 1 trailing active line
    expect(parsed.lines.length).toBeGreaterThan(2);

    // Check that every committed line does not exceed 35 columns
    for (let i = 0; i < parsed.lines.length - 1; i++) {
      expect(parsed.lines[i].cells.length).toBeLessThanOrEqual(35);
    }

    // Check the trailing line
    const lastLine = parsed.lines[parsed.lines.length - 1];
    expect(lastLine.isCommitted).toBe(false);
    expect(lastLine.cells.length).toBe(0);
    expect(parsed.activeLineIndex).toBe(parsed.lines.length - 1);
    expect(parsed.activeColIndex).toBe(0);
  });

  it('handles long words exceeding column limit by chunking', () => {
    const longWord = 'supercalifragilisticexpialidocious_supercalifragilisticexpialidocious';
    const parsed = textToManuscriptLines(longWord, 1, 30);

    expect(parsed.lines.length).toBeGreaterThan(2);
    expect(parsed.lines[0].cells.length).toBe(30);
    expect(parsed.lines[1].cells.length).toBe(30);
    expect(parsed.activeLineIndex).toBe(parsed.lines.length - 1);
    expect(parsed.activeColIndex).toBe(0);
  });
});

describe('healDuplicatedManuscriptText', () => {
  it('collapses repeated paragraph suffixes created by orphan page reload loops', () => {
    const text = 'Paragraph 1\n\nParagraph 2\n\nParagraph 2\n\nParagraph 2';
    const healed = healDuplicatedManuscriptText(text);
    expect(healed).toBe('Paragraph 1\n\nParagraph 2');
  });

  it('collapses multi-paragraph repeated blocks', () => {
    const text = 'P1\n\nP2\n\nP3\n\nP2\n\nP3\n\nP2\n\nP3';
    const healed = healDuplicatedManuscriptText(text);
    expect(healed).toBe('P1\n\nP2\n\nP3');
  });

  it('leaves clean, non-repeating manuscripts completely untouched', () => {
    const text = 'Chapter 1: The Departure.\n\nChapter 2: The Journey Begins.\n\nChapter 3: The Arrival.';
    const healed = healDuplicatedManuscriptText(text);
    expect(healed).toBe(text);
  });
});

describe('partitionManuscriptLines', () => {
  it('keeps all lines on single page in scroll mode', () => {
    const parsed = textToManuscriptLines('Line 1\nLine 2\nLine 3', 1, 70);
    const partitioned = partitionManuscriptLines(parsed.lines, 'scroll', 54, 'test-doc');

    expect(partitioned.historicalPages.length).toBe(0);
    expect(partitioned.currentPageNumber).toBe(1);
    expect(partitioned.currentPageLines.length).toBe(parsed.lines.length);
  });

  it('partitions lines into historical pages and active page in notecard mode (10 lines per card)', () => {
    // 25 lines total -> 2 completed cards (10 lines each) + 1 active card (5 lines)
    const longText = Array.from({ length: 24 }, (_, i) => `Sentence ${i + 1}`).join('\n');
    const parsed = textToManuscriptLines(longText, 1, 70);
    const partitioned = partitionManuscriptLines(parsed.lines, 'notecard', 10, 'card-doc');

    expect(partitioned.historicalPages.length).toBe(2);
    expect(partitioned.historicalPages[0].pageNumber).toBe(1);
    expect(partitioned.historicalPages[0].lines.length).toBe(10);
    expect(partitioned.historicalPages[1].pageNumber).toBe(2);
    expect(partitioned.historicalPages[1].lines.length).toBe(10);

    expect(partitioned.currentPageNumber).toBe(3);
    expect(partitioned.currentPageLines.length).toBe(parsed.lines.length - 20);
  });

  it('partitions lines by paragraph in paragraph mode', () => {
    const text = 'Paragraph 1.\n\nParagraph 2.\n\nParagraph 3.';
    const parsed = textToManuscriptLines(text, 1, 70);
    const partitioned = partitionManuscriptLines(parsed.lines, 'paragraph', 54, 'para-doc');

    // 3 completed paragraph pages + 1 active drafting page for typing the 4th paragraph
    expect(partitioned.historicalPages.length).toBe(3);
    expect(partitioned.currentPageNumber).toBe(4);
    expect(partitioned.currentPageLines[0].cells.length).toBe(0);
  });
});
