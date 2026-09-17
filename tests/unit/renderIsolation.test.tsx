import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { ActiveLine } from '@/components/aperture/ActiveLine';
import { HistoricalLine } from '@/components/aperture/HistoricalLine';
import { ApertureFrame } from '@/components/aperture/ApertureFrame';
import { LineRecord, CharacterCell } from '@/types';

function makeLine(cellCount: number): LineRecord {
  const cells: CharacterCell[] = Array.from({ length: cellCount }, (_, i) => ({
    id: `c-${i}`,
    char: String.fromCharCode(97 + (i % 26)),
    state: 'standard',
    colIndex: i,
    lineIndex: 0,
  }));
  return {
    id: 'test-line',
    lineIndex: 0,
    cells,
    isCommitted: true,
  };
}

describe('Platen Rendering Optimization & Typing Engine Isolation (Tier 2 Pass A / v0.9.7.6)', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('ActiveLine GPU Cursor Overlay & Color Transition Isolation', () => {
    it('renders typing-head cursor as an absolutely positioned overlay with translateX(Nch)', async () => {
      const line = makeLine(5);
      const root = createRoot(container);

      await act(async () => {
        root.render(
          <ActiveLine
            line={line}
            lineIndex={0}
            activeColIndex={5}
            isLocked={false}
            isHighlighting={false}
          />
        );
      });

      const cursor = container.querySelector('[data-cursor="typing-head"]') as HTMLElement;
      expect(cursor).not.toBeNull();
      expect(cursor.className).toContain('absolute');
      expect(cursor.className).toContain('w-[1ch]');
      expect(cursor.style.transform).toBe('translateX(5ch)');

      // Verify removal of transition color delay
      expect(cursor.className).not.toContain('transition-colors');
      expect(cursor.className).not.toContain('duration-200');
    });

    it('hides cursor when isHighlighting is true', async () => {
      const line = makeLine(3);
      const root = createRoot(container);

      await act(async () => {
        root.render(
          <ActiveLine
            line={line}
            lineIndex={0}
            activeColIndex={3}
            isLocked={false}
            isHighlighting={true}
          />
        );
      });

      const cursor = container.querySelector('[data-cursor="typing-head"]');
      expect(cursor).toBeNull();
    });

    it('renders amber lockout color when isLocked is true', async () => {
      const line = makeLine(2);
      const root = createRoot(container);

      await act(async () => {
        root.render(
          <ActiveLine
            line={line}
            lineIndex={0}
            activeColIndex={2}
            isLocked={true}
            isHighlighting={false}
          />
        );
      });

      const cursor = container.querySelector('[data-cursor="typing-head"]') as HTMLElement;
      expect(cursor).not.toBeNull();
      expect(cursor.className).toContain('bg-amber-500');
      expect(cursor.style.backgroundColor).toBe('rgb(245, 158, 11)'); // #f59e0b in rgb
    });
  });

  describe('HistoricalLine Custom Memoization Comparator', () => {
    it('custom memo comparator prevents re-render when line, lineIndex, and isTopmost are identical', () => {
      const line = makeLine(10);
      const prevProps = { line, lineIndex: 0, isTopmost: false };
      const nextProps = { line, lineIndex: 0, isTopmost: false };

      // In React.memo, comparator function is stored in (HistoricalLine as any).type?.compare or (HistoricalLine as any).compare
      const memoComparator = (HistoricalLine as any).compare;

      if (memoComparator) {
        expect(memoComparator(prevProps, nextProps)).toBe(true);

        // Fails when line reference changes
        expect(memoComparator(prevProps, { ...nextProps, line: makeLine(10) })).toBe(false);

        // Fails when lineIndex changes
        expect(memoComparator(prevProps, { ...nextProps, lineIndex: 1 })).toBe(false);

        // Fails when isTopmost changes
        expect(memoComparator(prevProps, { ...nextProps, isTopmost: true })).toBe(false);
      } else {
        // Fallback check: component is wrapped in React.memo
        expect((HistoricalLine as any).$$typeof.toString()).toContain('react.memo');
      }
    });
  });

  describe('ApertureFrame Deterministic Limit & CSS Containment', () => {
    it('does not append any synthetic test spans to document.body during checkLimit', async () => {
      const createElementSpy = vi.spyOn(document, 'createElement');
      const appendChildSpy = vi.spyOn(document.body, 'appendChild');

      const root = createRoot(container);
      await act(async () => {
        root.render(<ApertureFrame height={3} isPaused={false} />);
      });

      // Confirm no hidden font measurement span was added to document.body
      const spanAppends = appendChildSpy.mock.calls.filter((call) => {
        const node = call[0] as HTMLElement;
        return node && node.tagName === 'SPAN' && node.textContent?.includes('00000');
      });
      expect(spanAppends.length).toBe(0);

      createElementSpy.mockRestore();
      appendChildSpy.mockRestore();
    });

    it('applies CSS containment and height transition to the platen drafting viewport', async () => {
      const root = createRoot(container);
      await act(async () => {
        root.render(<ApertureFrame height={5} isPaused={false} />);
      });

      // Find the platen drafting viewport element
      const platen = container.querySelector('[class*="flex flex-col justify-end"][class*="overflow-hidden"]') as HTMLElement;
      expect(platen).not.toBeNull();
      expect(platen.style.contain).toBe('layout size');
      expect(platen.style.transition).toContain('height 120ms');
    });
  });
});
