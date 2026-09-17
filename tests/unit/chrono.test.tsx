import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ChronoSuite, formatClockTime, formatStartTime, formatElapsedTime } from '@/components/aperture/ChronoSuite';

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

  describe('formatElapsedTime', () => {
    it('formats minutes under an hour as +Xm', () => {
      expect(formatElapsedTime(0)).toBe('+0m');
      expect(formatElapsedTime(25)).toBe('+25m');
      expect(formatElapsedTime(59)).toBe('+59m');
    });

    it('formats times over an hour as +X.XH (e.g. 1 hour and 6 minutes -> +1.1H)', () => {
      expect(formatElapsedTime(60)).toBe('+1.0H');
      expect(formatElapsedTime(66)).toBe('+1.1H');
      expect(formatElapsedTime(90)).toBe('+1.5H');
      expect(formatElapsedTime(120)).toBe('+2.0H');
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

    it('applies elegant serif font for manuscript, paperwhite, and overcast themes', async () => {
      const serifThemes = ['typewriter', 'high-contrast', 'low-contrast'] as const;

      for (const theme of serifThemes) {
        const root = createRoot(container);
        await act(async () => {
          root.render(<ChronoSuite showClock={true} colorScheme={theme} />);
        });

        const wrapper = container.querySelector('div');
        expect(wrapper?.className).toContain('font-serif-clock');

        await act(async () => {
          root.unmount();
        });
      }
    });

    it('keeps mono font for terminal, spotlight, and charcoal themes', async () => {
      const monoThemes = ['dark-amber', 'spotlight', 'dark-mode'] as const;

      for (const theme of monoThemes) {
        const root = createRoot(container);
        await act(async () => {
          root.render(<ChronoSuite showClock={true} colorScheme={theme} />);
        });

        const wrapper = container.querySelector('div');
        expect(wrapper?.className).toContain('font-mono');
        expect(wrapper?.className).not.toContain('font-serif-clock');

        await act(async () => {
          root.unmount();
        });
      }
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

    it('stamps session timer on clock click and positions badge justified above clock', async () => {
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
      // Verify non-shifting left-justified positioning above clock and slide-up animation
      expect(badgeBtn?.className).toContain('absolute');
      expect(badgeBtn?.className).toContain('bottom-full');
      expect(badgeBtn?.className).toContain('left-0');
      expect(badgeBtn?.className).toContain('animate-timer-slide-up');

      // Advance time by 66 minutes -> should display +1.1H
      await act(async () => {
        vi.advanceTimersByTime(66 * 60 * 1000);
      });

      expect(container.textContent).toContain('+1.1H');

      // Clicking the badge dismisses the timer
      await act(async () => {
        badgeBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // Badge should be removed
      expect(container.querySelector('button[aria-label*="Session timer started"]')).toBeNull();
    });
  });
});
