import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ChronoSuite, formatClockTime, formatStartTime, formatElapsedTime, formatPomodoroTime } from '@/components/aperture/ChronoSuite';
import { typewriterAudio } from '@/lib/sound';

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

    it('formats AM and PM cleanly without periods', () => {
      const morningDate = new Date(2026, 8, 17, 10, 40, 0);
      const eveningDate = new Date(2026, 8, 17, 22, 40, 0);
      const morningFormatted = formatClockTime(morningDate, { hour12: true });
      const eveningFormatted = formatClockTime(eveningDate, { hour12: true });
      expect(morningFormatted).not.toMatch(/[ap]\.m\./i);
      expect(eveningFormatted).not.toMatch(/[ap]\.m\./i);
      expect(morningFormatted).toContain('AM');
      expect(eveningFormatted).toContain('PM');
    });
  });

  describe('formatElapsedTime', () => {
    it('formats elapsed minutes simply as +[n]', () => {
      expect(formatElapsedTime(0)).toBe('+0');
      expect(formatElapsedTime(25)).toBe('+25');
      expect(formatElapsedTime(59)).toBe('+59');
      expect(formatElapsedTime(60)).toBe('+60');
      expect(formatElapsedTime(66)).toBe('+66');
      expect(formatElapsedTime(90)).toBe('+90');
      expect(formatElapsedTime(120)).toBe('+120');
    });
  });

  describe('formatPomodoroTime', () => {
    it('formats remaining seconds as mm:ss', () => {
      expect(formatPomodoroTime(1500)).toBe('25:00');
      expect(formatPomodoroTime(300)).toBe('05:00');
      expect(formatPomodoroTime(65)).toBe('01:05');
      expect(formatPomodoroTime(59)).toBe('00:59');
      expect(formatPomodoroTime(5)).toBe('00:05');
      expect(formatPomodoroTime(0)).toBe('00:00');
      expect(formatPomodoroTime(-10)).toBe('00:00');
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

    it('applies elegant serif font for manuscript, paperwhite, and newsprint themes', async () => {
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

      // Now badge should appear with initial "+0"
      expect(container.textContent).toContain('+0');

      const badgeBtn = container.querySelector('button[aria-label*="Session timer started"]');
      expect(badgeBtn).not.toBeNull();
      expect(badgeBtn?.getAttribute('title')).toBeNull();
      // Verify non-shifting left-justified positioning above clock and slide-up animation
      expect(badgeBtn?.className).toContain('absolute');
      expect(badgeBtn?.className).toContain('bottom-full');
      expect(badgeBtn?.className).toContain('left-0');
      expect(badgeBtn?.className).toContain('animate-timer-slide-up');

      // Advance time by 66 minutes -> should display +66
      await act(async () => {
        vi.advanceTimersByTime(66 * 60 * 1000);
      });

      expect(container.textContent).toContain('+66');

      // Clicking the badge dismisses the timer
      await act(async () => {
        badgeBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // Badge should be removed
      expect(container.querySelector('button[aria-label*="Session timer started"]')).toBeNull();
    });

    it('correctly transitions between serif and mono fonts across theme switches', async () => {
      const root = createRoot(container);
      
      // Initial render with dark-amber (Terminal - mono)
      await act(async () => {
        root.render(<ChronoSuite showClock={true} colorScheme="dark-amber" />);
      });

      const wrapper = container.querySelector('div');
      expect(wrapper).not.toBeNull();
      expect(wrapper?.className).toContain('font-mono');
      expect(wrapper?.className).not.toContain('font-serif-clock');

      // Switch to typewriter (manuscript - serif)
      await act(async () => {
        root.render(<ChronoSuite showClock={true} colorScheme="typewriter" />);
      });
      expect(wrapper?.className).toContain('font-serif-clock');
      expect(wrapper?.className).not.toContain('font-mono');

      // Switch back to dark-amber (Terminal - mono)
      await act(async () => {
        root.render(<ChronoSuite showClock={true} colorScheme="dark-amber" />);
      });
      expect(wrapper?.className).toContain('font-mono');
      expect(wrapper?.className).not.toContain('font-serif-clock');
    });

    it('handles pomodoro timer countdown, audio alerts, warning flash, break inversion, and dismissal', async () => {
      const beepSpy = vi.spyOn(typewriterAudio, 'playPomodoroBeep');
      const doubleBeepSpy = vi.spyOn(typewriterAudio, 'playPomodoroDoubleBeep');
      const chimeSpy = vi.spyOn(typewriterAudio, 'playPomodoroChime');
      const resumeChimeSpy = vi.spyOn(typewriterAudio, 'playPomodoroResumeChime');

      const root = createRoot(container);
      await act(async () => {
        root.render(<ChronoSuite showClock={true} timerStyle="pomodoro" />);
      });

      const clockBtn = container.querySelector('button[aria-label*="time"]');
      expect(clockBtn).not.toBeNull();

      // Initially no pomodoro badge
      expect(container.querySelector('button[aria-label*="Pomodoro countdown"]')).toBeNull();

      // Click clock to start Pomodoro timer (starts at 02:00)
      await act(async () => {
        clockBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      let badgeBtn = container.querySelector('button[aria-label*="Pomodoro countdown"]');
      expect(badgeBtn).not.toBeNull();
      expect(badgeBtn?.textContent).toBe('02:00');

      // Advance 40 seconds -> should be 01:20
      await act(async () => {
        vi.advanceTimersByTime(40 * 1000);
      });
      expect(badgeBtn?.textContent).toBe('01:20');
      expect(beepSpy).not.toHaveBeenCalled();

      // Advance 20 seconds to 1 minute left (total 60s elapsed)
      await act(async () => {
        vi.advanceTimersByTime(20 * 1000);
      });
      // 60 seconds left -> should be in warning state with animate-pulse and double beep played
      expect(badgeBtn?.textContent).toBe('01:00');
      expect(badgeBtn?.className).toContain('animate-pulse');
      expect(badgeBtn?.className).toContain('font-bold');
      expect(doubleBeepSpy).toHaveBeenCalledTimes(1);

      // Advance 60 seconds to reach zero and trigger 1-minute break
      await act(async () => {
        vi.advanceTimersByTime(60 * 1000);
      });

      // Now in break mode: timer expired -> chime played
      badgeBtn = container.querySelector('button[aria-label*="Pomodoro break"]');
      expect(badgeBtn).not.toBeNull();
      expect(badgeBtn?.textContent).toBe('01:00');
      expect(chimeSpy).toHaveBeenCalledTimes(1);

      // Advance 60 seconds to complete break and resume work session -> reversed chime played
      await act(async () => {
        vi.advanceTimersByTime(60 * 1000);
      });
      badgeBtn = container.querySelector('button[aria-label*="Pomodoro countdown"]');
      expect(badgeBtn).not.toBeNull();
      expect(badgeBtn?.textContent).toBe('02:00');
      expect(resumeChimeSpy).toHaveBeenCalledTimes(1);

      // Clicking the clock restarts pomodoro at 02:00 work phase
      await act(async () => {
        clockBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      badgeBtn = container.querySelector('button[aria-label*="Pomodoro countdown"]');
      expect(badgeBtn).not.toBeNull();
      expect(badgeBtn?.textContent).toBe('02:00');

      // Clicking badge dismisses pomodoro timer
      await act(async () => {
        badgeBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(container.querySelector('button[aria-label*="Pomodoro countdown"]')).toBeNull();
      expect(container.querySelector('button[aria-label*="Pomodoro break"]')).toBeNull();

      beepSpy.mockRestore();
      doubleBeepSpy.mockRestore();
      chimeSpy.mockRestore();
      resumeChimeSpy.mockRestore();
    });

    it('renders theme-specific break badge styling for manuscript, paperwhite, and newsprint', async () => {
      vi.setSystemTime(new Date(2026, 8, 17, 10, 0, 0));

      const themes = [
        { theme: 'typewriter' as const, expectedClass: 'bg-card' },
        { theme: 'high-contrast' as const, expectedClass: 'bg-[#1A1A1A]' },
        { theme: 'low-contrast' as const, expectedClass: 'bg-[#58626E]' },
        { theme: 'dark-mode' as const, expectedClass: 'bg-foreground' },
      ];

      for (const { theme, expectedClass } of themes) {
        const root = createRoot(container);
        await act(async () => {
          root.render(<ChronoSuite showClock={true} timerStyle="pomodoro" colorScheme={theme} />);
        });

        const clockBtn = container.querySelector('button[aria-label*="time"]');
        await act(async () => {
          clockBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        // Fast forward 2 minutes to enter break mode
        await act(async () => {
          vi.advanceTimersByTime(120 * 1000);
        });

        const badgeBtn = container.querySelector('button[aria-label*="Pomodoro break"]');
        expect(badgeBtn).not.toBeNull();
        expect(badgeBtn?.className).toContain(expectedClass);
        expect(badgeBtn?.className).toContain('border-none');

        await act(async () => {
          root.unmount();
        });
      }
    });

    it('silences pomodoro audio cues when pomodoroSoundEnabled is false', async () => {
      const beepSpy = vi.spyOn(typewriterAudio, 'playPomodoroBeep');
      const doubleBeepSpy = vi.spyOn(typewriterAudio, 'playPomodoroDoubleBeep');
      const chimeSpy = vi.spyOn(typewriterAudio, 'playPomodoroChime');
      const resumeChimeSpy = vi.spyOn(typewriterAudio, 'playPomodoroResumeChime');

      const root = createRoot(container);
      await act(async () => {
        root.render(<ChronoSuite showClock={true} timerStyle="pomodoro" pomodoroSoundEnabled={false} />);
      });

      const clockBtn = container.querySelector('button[aria-label*="time"]');
      await act(async () => {
        clockBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // Advance past 1 minute warning (60s) and transition (120s) and resume (180s)
      await act(async () => {
        vi.advanceTimersByTime(180 * 1000);
      });

      expect(beepSpy).not.toHaveBeenCalled();
      expect(doubleBeepSpy).not.toHaveBeenCalled();
      expect(chimeSpy).not.toHaveBeenCalled();
      expect(resumeChimeSpy).not.toHaveBeenCalled();

      beepSpy.mockRestore();
      doubleBeepSpy.mockRestore();
      chimeSpy.mockRestore();
      resumeChimeSpy.mockRestore();
    });

    it('pomodoro timer continues counting down in realtime even when isPaused is true (modals open)', async () => {
      const root = createRoot(container);
      await act(async () => {
        root.render(<ChronoSuite showClock={true} timerStyle="pomodoro" isPaused={true} />);
      });

      const clockBtn = container.querySelector('button[aria-label*="time"]');
      await act(async () => {
        clockBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      const badgeBtn = container.querySelector('button[aria-label*="Pomodoro countdown"]');
      expect(badgeBtn?.textContent).toBe('02:00');

      // Advance 50 seconds while isPaused={true}
      await act(async () => {
        vi.advanceTimersByTime(50 * 1000);
      });

      // Should have advanced 50 seconds in realtime (01:10)
      expect(badgeBtn?.textContent).toBe('01:10');
    });
  });
});
