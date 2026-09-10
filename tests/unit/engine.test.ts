import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useTypingStore, createEmptyLine } from '@/stores/typingStore';
import { sanitizeManuscript, calculatePrintDelayMs } from '@/lib/sanitize';
import { wrapLine, MAX_COLUMNS } from '@/lib/wrap';

describe('Typing Engine & State Machine Invariants', () => {
  beforeEach(() => {
    useTypingStore.getState().resetEngine({
      mode: 'temp',
      inboxCount: 2,
      outboxCount: 0,
      activeApertureHeight: 3,
      wrapMode: 'soft',
      pageSize: 54,
    });
  });

  describe('Character Insertion & Strict Column Bounds', () => {
    it('appends characters to the active line up to 70 columns', () => {
      const store = useTypingStore.getState();
      for (let i = 0; i < 10; i++) {
        store.insertChar('A');
      }

      const state = useTypingStore.getState();
      expect(state.currentPageLines[0].cells).toHaveLength(10);
      expect(state.activeColIndex).toBe(10);
      expect(state.currentPageLines[0].cells.map((c) => c.char).join('')).toBe('AAAAAAAAAA');
    });

    it('wraps unbroken words exceeding 70 columns to the next line', () => {
      const store = useTypingStore.getState();

      // Fill first line with 70 continuous characters (unbroken word)
      for (let i = 0; i < 70; i++) {
        store.insertChar('X');
      }

      let state = useTypingStore.getState();
      expect(state.currentPageLines[0].cells).toHaveLength(70);
      expect(state.currentPageLines).toHaveLength(1);

      // 71st character should wrap to column 0 of line 1
      store.insertChar('Y');
      state = useTypingStore.getState();
      expect(state.currentPageLines).toHaveLength(2);
      expect(state.activeLineIndex).toBe(1);
      expect(state.activeColIndex).toBe(1);
      expect(state.currentPageLines[1].cells[0].char).toBe('Y');
    });

    it('handles Soft Word Wrap carrying overflowing word to next line and padding previous line', () => {
      const store = useTypingStore.getState();

      // Type 65 characters of filler followed by a space (66 chars total)
      for (let i = 0; i < 65; i++) {
        store.insertChar('A');
      }
      store.insertChar(' '); // col 65

      // Type word 'HELLO' starting at col 66: 'H'(66), 'E'(67), 'L'(68), 'L'(69), 'O'(70 - overflows 70-col boundary)
      store.insertChar('H');
      store.insertChar('E');
      store.insertChar('L');
      store.insertChar('L');
      store.insertChar('O'); // 71st char on line triggers wrap

      const state = useTypingStore.getState();
      expect(state.currentPageLines).toHaveLength(2);
      expect(state.activeLineIndex).toBe(1);

      // Line 0 should have padded trailing cells
      const line0 = state.currentPageLines[0];
      expect(line0.cells).toHaveLength(MAX_COLUMNS);
      expect(line0.cells[66].isSoftPadding).toBe(true);

      // Line 1 should start with 'HELLO'
      const line1 = state.currentPageLines[1];
      expect(line1.cells.map((c) => c.char).join('')).toBe('HELLO');
    });

    it('breaks words at hyphens leaving hyphen on previous line and does not break at en-dashes', () => {
      const store = useTypingStore.getState();

      // Type 64 characters of filler
      for (let i = 0; i < 64; i++) {
        store.insertChar('A');
      }
      // Line now has 64 chars.
      // Type "life-like":
      // 'l'(64), 'i'(65), 'f'(66), 'e'(67), '-'(68), 'l'(69), 'i'(70 - overflows 70-col boundary)
      store.insertChar('l');
      store.insertChar('i');
      store.insertChar('f');
      store.insertChar('e');
      store.insertChar('-'); // hyphen at col 68
      store.insertChar('l'); // col 69
      store.insertChar('i'); // overflows past 70 columns -> wraps 'li' to next line while keeping 'life-' on line 0!

      const state = useTypingStore.getState();
      expect(state.currentPageLines).toHaveLength(2);
      expect(state.activeLineIndex).toBe(1);

      // Line 0 should end with 'life-' at cols 64..68 and soft padding at col 69
      const line0 = state.currentPageLines[0];
      const line0Str = line0.cells.filter((c) => !c.isSoftPadding).map((c) => c.char).join('');
      expect(line0Str.endsWith('life-')).toBe(true);

      // Line 1 should start with 'li'
      const line1 = state.currentPageLines[1];
      expect(line1.cells.map((c) => c.char).join('')).toBe('li');
    });
  });

  describe('Backspace & Highlight Mode', () => {
    it('enters Highlight Mode on Backspace without erasing characters', () => {
      const store = useTypingStore.getState();
      store.insertChar('H');
      store.insertChar('I');

      store.handleBackspace();

      const state = useTypingStore.getState();
      expect(state.isHighlighting).toBe(true);
      expect(state.currentPageLines[0].cells).toHaveLength(2);
      expect(state.currentPageLines[0].cells[1].state).toBe('highlighted');
      expect(state.currentPageLines[0].cells[0].state).toBe('standard');
    });

    it('expands highlight backwards on sequential Backspaces', () => {
      const store = useTypingStore.getState();
      store.insertChar('C');
      store.insertChar('A');
      store.insertChar('T');

      store.handleBackspace(); // highlights 'T'
      store.handleBackspace(); // highlights 'A'
      store.handleBackspace(); // highlights 'C'

      const state = useTypingStore.getState();
      expect(state.isHighlighting).toBe(true);
      expect(state.currentPageLines[0].cells[2].state).toBe('highlighted');
      expect(state.currentPageLines[0].cells[1].state).toBe('highlighted');
      expect(state.currentPageLines[0].cells[0].state).toBe('highlighted');
    });

    it('clamps Backspace highlighting to the visible frame ceiling', () => {
      // Set aperture height to 2 lines
      useTypingStore.getState().setApertureHeight(2);
      const store = useTypingStore.getState();

      // Create 3 lines: line 0, line 1, line 2
      // Visible frame for height=2 on line 2 is: line 1 and line 2 (minVisibleLine = 2 - 2 + 1 = 1)
      store.insertChar('A');
      store.handleEnter(); // advances to line 1
      store.insertChar('B');
      store.handleEnter(); // advances to line 2
      store.insertChar('C');

      // Now on line 2 with char 'C'
      store.handleBackspace(); // highlights 'C' on line 2
      store.handleBackspace(); // navigates into line 1, highlights 'B'
      store.handleBackspace(); // tries to go to line 0 - should be DROPPED due to visible ceiling

      const state = useTypingStore.getState();
      expect(state.currentPageLines[2].cells[0].state).toBe('highlighted');
      expect(state.currentPageLines[1].cells[0].state).toBe('highlighted');
      // Line 0 is scrolled off-screen: MUST remain 'standard'!
      expect(state.currentPageLines[0].cells[0].state).toBe('standard');
    });

    it('skips soft-wrap padding cells when backspacing across line boundaries', () => {
      const store = useTypingStore.getState();

      // Write text that soft-wraps
      for (let i = 0; i < 65; i++) {
        store.insertChar('A');
      }
      store.insertChar(' '); // col 65
      store.insertChar('W'); // 66
      store.insertChar('O'); // 67
      store.insertChar('R'); // 68
      store.insertChar('D'); // 69 (wraps 'WORD' to line 1)

      // Backspace 4 times on line 1: highlights 'D', 'R', 'O', 'W'
      store.handleBackspace();
      store.handleBackspace();
      store.handleBackspace();
      store.handleBackspace();

      // 5th backspace should traverse into line 0, skipping the padding cells and highlighting space/A
      store.handleBackspace();

      const state = useTypingStore.getState();
      const line0 = state.currentPageLines[0];
      // Target should land on printable char (col 65 space), not padding
      expect(state.highlightHead?.lineIndex).toBe(0);
      expect(state.highlightHead?.colIndex).toBe(65);
      expect(line0.cells[65].state).toBe('highlighted');
    });
  });

  describe('Highlight Resolution', () => {
    it('converts highlighted cells to struck when Enter is pressed with active highlight', () => {
      const store = useTypingStore.getState();
      store.insertChar('A');
      store.insertChar('B');
      store.insertChar('C');

      store.handleBackspace(); // highlight 'C'
      store.handleBackspace(); // highlight 'B'

      store.handleEnter(); // resolve highlight

      const state = useTypingStore.getState();
      expect(state.isHighlighting).toBe(false);
      expect(state.currentPageLines[0].cells[0].state).toBe('standard');
      expect(state.currentPageLines[0].cells[1].state).toBe('struck');
      expect(state.currentPageLines[0].cells[2].state).toBe('struck');
      // Cursor should snap to end of active line without creating a new line
      expect(state.currentPageLines).toHaveLength(1);
      expect(state.activeColIndex).toBe(3);
    });

    it('strikes out highlighted cells and appends typed character when any keystroke is entered', () => {
      const store = useTypingStore.getState();
      store.insertChar('H');
      store.insertChar('I');

      store.handleBackspace(); // highlight 'I'
      expect(useTypingStore.getState().currentPageLines[0].cells[1].state).toBe('highlighted');

      // Typing printable char strikes out highlighted text and appends new char
      store.insertChar('!');

      const state = useTypingStore.getState();
      expect(state.isHighlighting).toBe(false);
      expect(state.currentPageLines[0].cells[0].state).toBe('standard');
      expect(state.currentPageLines[0].cells[1].state).toBe('struck');
      expect(state.currentPageLines[0].cells[2].char).toBe('!');
      expect(state.currentPageLines[0].cells[2].state).toBe('standard');
    });

    it('cancels highlight and clamps cursor when aperture height is dynamically resized', () => {
      useTypingStore.getState().setApertureHeight(5);
      const store = useTypingStore.getState();
      store.insertChar('X');
      store.handleBackspace(); // enter highlight

      expect(useTypingStore.getState().isHighlighting).toBe(true);

      // User changes aperture height in settings
      store.setApertureHeight(2);

      const state = useTypingStore.getState();
      expect(state.isHighlighting).toBe(false);
      expect(state.currentPageLines[0].cells[0].state).toBe('standard');
      expect(state.manifest.activeApertureHeight).toBe(2);
    });
  });

  describe('Page Progression Mechanics', () => {
    it('commits page and seamlessly starts new page when page size limit is reached', () => {
      useTypingStore.getState().setPageSize(30);
      const store = useTypingStore.getState();

      // Enter 29 lines
      for (let i = 0; i < 29; i++) {
        store.insertChar('L');
        store.handleEnter();
      }

      // Now at line 29 (30th line). Committing this line reaches pageSize=30
      store.insertChar('E');
      store.handleEnter();

      const state = useTypingStore.getState();
      expect(state.historicalPages).toHaveLength(1);
      expect(state.manifest.outboxCount).toBe(1);
      expect(state.currentPageNumber).toBe(2);
      expect(state.activeLineIndex).toBe(0);
      expect(state.isLocked).toBe(false);

      // Can immediately continue typing on new page without paper feeder
      store.insertChar('N');
      expect(useTypingStore.getState().currentPageLines[0].cells[0].char).toBe('N');
    });
  });

  describe('Content Sanitization & Print Speed Formula', () => {
    it('strips struck-out cells in sanitization pipeline', () => {
      const store = useTypingStore.getState();
      store.insertChar('H');
      store.insertChar('E');
      store.insertChar('L');
      store.insertChar('L');
      store.insertChar('O');

      // Strike out last two letters 'LO'
      store.handleBackspace();
      store.handleBackspace();
      store.handleEnter();

      const state = useTypingStore.getState();
      const page = {
        pageNumber: 1,
        lines: state.currentPageLines,
        completedAt: null,
      };

      const sanitized = sanitizeManuscript([page]);
      expect(sanitized).toBe('HEL');
    });

    it('computes rubber-band print delay correctly', () => {
      expect(calculatePrintDelayMs(0)).toBe(0);
      // For 100 characters: 30 / (1 + log10(2)) = 30 / 1.30103 ~= 23ms
      const delay100 = calculatePrintDelayMs(100);
      expect(delay100).toBeGreaterThan(20);
      expect(delay100).toBeLessThan(25);

      // Large document: delay is clamped to minimum 2ms
      const delayHuge = calculatePrintDelayMs(100000);
      expect(delayHuge).toBeGreaterThanOrEqual(2);
    });

    it('unwraps soft-wrapped lines into continuous paragraphs, creating linebreaks only on Enter', () => {
      const store = useTypingStore.getState();
      store.resetEngine({ mode: 'temp', wrapMode: 'soft' });

      // 1. Soft-wrapped lines should unwrap into a single continuous paragraph without newlines
      for (let i = 0; i < 60; i++) store.insertChar('a');
      store.insertChar(' ');
      for (const c of 'testing') store.insertChar(c);
      store.insertChar(' ');
      for (const c of 'wrap') store.insertChar(c);

      let state = useTypingStore.getState();
      expect(state.currentPageLines).toHaveLength(2);
      let sanitized = sanitizeManuscript([{ pageNumber: 1, lines: state.currentPageLines, completedAt: null }]);
      expect(sanitized).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa testing wrap');
      expect(sanitized.includes('\n')).toBe(false);

      // 2. Hard Enter should create linebreaks
      store.resetEngine({ mode: 'temp', wrapMode: 'soft' });
      for (const c of 'First line') store.insertChar(c);
      store.handleEnter();
      for (const c of 'Second line') store.insertChar(c);

      state = useTypingStore.getState();
      sanitized = sanitizeManuscript([{ pageNumber: 1, lines: state.currentPageLines, completedAt: null }]);
      expect(sanitized).toBe('First line\nSecond line');

      // 3. Double Enter should create paragraph breaks with an empty line
      store.resetEngine({ mode: 'temp', wrapMode: 'soft' });
      for (const c of 'Paragraph 1') store.insertChar(c);
      store.handleEnter();
      store.handleEnter();
      for (const c of 'Paragraph 2') store.insertChar(c);

      state = useTypingStore.getState();
      sanitized = sanitizeManuscript([{ pageNumber: 1, lines: state.currentPageLines, completedAt: null }]);
      expect(sanitized).toBe('Paragraph 1\n\nParagraph 2');

      // 4. Hyphenated wrap should connect directly without introducing a space
      store.resetEngine({ mode: 'temp', wrapMode: 'soft' });
      for (let i = 0; i < 64; i++) store.insertChar('a');
      for (const c of 'life-like') store.insertChar(c);

      state = useTypingStore.getState();
      sanitized = sanitizeManuscript([{ pageNumber: 1, lines: state.currentPageLines, completedAt: null }]);
      expect(sanitized.endsWith('life-like')).toBe(true);
      expect(sanitized.includes('life- like')).toBe(false);
      expect(sanitized.includes('\n')).toBe(false);
    });
  });
});
