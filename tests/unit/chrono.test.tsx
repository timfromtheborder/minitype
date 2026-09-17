import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ChronoSuite, formatClockTime, formatStartTime } from '@/components/aperture/ChronoSuite';

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

  describe('formatClockTime & formatStartTime', () => {
    it('formats clock time according to system time', () => {
      const testDate = new Date(2026, 8, 17, 9, 5, 0);
      const formatted = formatClockTime(testDate);
      expect(formatted).toMatch(/9:05/);
    });

    it('formats start time compactly for badges', () => {
      const afternoonDate = new Date(2026, 8, 17, 14, 45, 0);
      const formatted = formatStartTime(afternoonDate);
      expect(formatted).toMatch(/(2:45|14:45)/);
      expect(formatted).not.toMatch(/[ap]\.?m\.?/i);
    });

    it('supports explicit hour12 override if provided', () => {
      const afternoonDate = new Date(2026, 8, 17, 14, 30, 0);
      expect(formatClockTime(afternoonDate, { hour12: false })).toContain('14:30');
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

    it('renders clock time 100% larger and updates on timer intervals', async () => {
      vi.setSystemTime(new Date(2026, 8, 17, 10, 15, 0));

      const root = createRoot(container);
      await act(async () => {
        root.render(<ChronoSuite showClock={true} />);
      });

      const clockBtn = container.querySelector('button[aria-label*="time"]');
      expect(clockBtn).not.toBeNull();
      expect(clockBtn?.className).toContain('text-xl');
      expect(clockBtn?.getAttribute('title')).toBeNull();
      expect(container.textContent).toMatch(/10:15/);

      // Advance 1 minute
      await act(async () => {
        vi.advanceTimersByTime(60000);
      });

      expect(container.textContent).toMatch(/10:16/);
    });

    it('stamps session timer on clock click and positions badge absolutely above clock', async () => {
      vi.setSystemTime(new Date(2026, 8, 17, 14, 0, 0));

      const root = createRoot(container);
      await act(async () => {
        root.render(<ChronoSuite showClock={true} />);
      });

      const clockBtn = container.querySelector('button[aria-label*="time"]');
      expect(clockBtn).not.toBeNull();

      // Click clock to start session timer
      await act(async () => {
        clockBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // Now badge should appear with initial "+0m"
      expect(container.textContent).toContain('+0m');

      const badgeBtn = container.querySelector('button[aria-label*="Session timer started"]');
      expect(badgeBtn).not.toBeNull();
      expect(badgeBtn?.getAttribute('title')).toBeNull();
      // Verify non-shifting absolute positioning above clock and slide-up animation
      expect(badgeBtn?.className).toContain('absolute');
      expect(badgeBtn?.className).toContain('bottom-full');
      expect(badgeBtn?.className).toContain('animate-timer-slide-up');

      // Advance time by 25 minutes
      await act(async () => {
        vi.advanceTimersByTime(25 * 60 * 1000);
      });

      expect(container.textContent).toContain('+25m');

      // Clicking the badge dismisses the timer
      await act(async () => {
        badgeBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // Badge should be removed
      expect(container.querySelector('button[aria-label*="Session timer started"]')).toBeNull();
    });
  });
});
