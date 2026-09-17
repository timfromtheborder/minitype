import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ChronoSuite, formatClockTime } from '@/components/aperture/ChronoSuite';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('ChronoSuite & Clock Formatter', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.removeChild(container);
  });

  describe('formatClockTime', () => {
    it('formats 12-hour time with AM/PM', () => {
      const morningDate = new Date(2026, 8, 17, 9, 5, 0); // 9:05 AM
      expect(formatClockTime(morningDate, '12h', true)).toBe('9:05 AM');

      const eveningDate = new Date(2026, 8, 17, 21, 30, 0); // 9:30 PM
      expect(formatClockTime(eveningDate, '12h', true)).toBe('9:30 PM');
    });

    it('formats 12-hour time without AM/PM for badges', () => {
      const afternoonDate = new Date(2026, 8, 17, 14, 45, 0);
      expect(formatClockTime(afternoonDate, '12h', false)).toBe('2:45');
    });

    it('formats 24-hour time with padded hours', () => {
      const morningDate = new Date(2026, 8, 17, 8, 7, 0);
      expect(formatClockTime(morningDate, '24h')).toBe('08:07');

      const eveningDate = new Date(2026, 8, 17, 23, 59, 0);
      expect(formatClockTime(eveningDate, '24h')).toBe('23:59');
    });
  });

  describe('ChronoSuite component', () => {
    it('renders null when showClock is false', async () => {
      const root = createRoot(container);
      await act(async () => {
        root.render(<ChronoSuite showClock={false} />);
      });

      expect(container.children.length).toBe(0);
    });

    it('renders clock time and updates on timer intervals', async () => {
      vi.setSystemTime(new Date(2026, 8, 17, 10, 15, 0));

      const root = createRoot(container);
      await act(async () => {
        root.render(<ChronoSuite showClock={true} clockFormat="12h" />);
      });

      expect(container.textContent).toContain('10:15 AM');

      // Advance 1 minute
      await act(async () => {
        vi.advanceTimersByTime(60000);
      });

      expect(container.textContent).toContain('10:16 AM');
    });

    it('stamps session timer on clock click and calculates elapsed minutes', async () => {
      vi.setSystemTime(new Date(2026, 8, 17, 14, 0, 0));

      const root = createRoot(container);
      await act(async () => {
        root.render(<ChronoSuite showClock={true} clockFormat="12h" />);
      });

      const clockBtn = container.querySelector('button[title*="clock"]');
      expect(clockBtn).not.toBeNull();

      // Click clock to start session timer
      await act(async () => {
        clockBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // Now badge should appear with initial "+0m"
      expect(container.textContent).toContain('+0m');
      expect(container.textContent).toContain('2:00');

      // Advance time by 25 minutes
      await act(async () => {
        vi.advanceTimersByTime(25 * 60 * 1000);
      });

      expect(container.textContent).toContain('+25m');

      // Clicking the badge dismisses the timer
      const badgeBtn = container.querySelector('button[title*="elapsed"]');
      expect(badgeBtn).not.toBeNull();

      await act(async () => {
        badgeBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // Badge should be removed
      expect(container.querySelector('button[title*="elapsed"]')).toBeNull();
    });
  });
});
