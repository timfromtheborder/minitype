'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ClockFormat, Typeface, ColorScheme, TimerStyle } from '@/types';
import { typewriterAudio } from '@/lib/sound';

export interface ChronoSuiteProps {
  showClock?: boolean;
  clockFormat?: ClockFormat;
  timerStyle?: TimerStyle;
  typeface?: Typeface;
  colorScheme?: ColorScheme;
  isPaused?: boolean;
}

export function formatClockTime(date: Date, options?: { hour12?: boolean }): string {
  try {
    const raw = new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: options?.hour12,
    }).format(date);
    return raw
      .replace(/([ap])\.\s*m\./gi, (_, m) => `${m.toUpperCase()}M`)
      .replace(/[\u202f\u00a0]/g, ' ')
      .trim();
  } catch (e) {
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const period = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${period}`;
  }
}

export function formatStartTime(date: Date): string {
  try {
    const formatted = new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
    // Strip trailing/leading AM/PM for a compact badge display (e.g. "4:30")
    return formatted.replace(/\s*[ap]\.?m\.?/i, '').trim();
  } catch (e) {
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    hours = hours % 12 || 12;
    return `${hours}:${minutes}`;
  }
}

export function formatElapsedTime(elapsedMinutes: number): string {
  return `+${elapsedMinutes}`;
}

export function formatPomodoroTime(totalSeconds: number): string {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, '0');
  const seconds = (safeSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export const ChronoSuite: React.FC<ChronoSuiteProps> = ({
  showClock = true,
  timerStyle = 'snapshot',
  typeface = 'courier-prime',
  colorScheme = 'typewriter',
  isPaused = false,
}) => {
  const [now, setNow] = useState<Date>(() => new Date());
  const [timerStartTime, setTimerStartTime] = useState<number | null>(null);
  const [isMounted, setIsMounted] = useState<boolean>(false);

  // Update clock and countdown continuously in realtime every second
  useEffect(() => {
    setIsMounted(true);
    setNow(new Date());
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const elapsedMinutes = useMemo(() => {
    if (!timerStartTime) return 0;
    return Math.max(0, Math.floor((now.getTime() - timerStartTime) / 60000));
  }, [timerStartTime, now]);

  // Pomodoro countdown derived continuously in realtime from wall-clock time
  // TEMPORARY: Set work to 2 minutes, break to 1 minute for testing (normally 25m work, 5m break)
  const { pomodoroPhase, pomodoroSeconds } = useMemo(() => {
    const WORK_SECONDS = 2 * 60;
    const BREAK_SECONDS = 1 * 60;
    const CYCLE_SECONDS = WORK_SECONDS + BREAK_SECONDS;

    if (timerStartTime === null) {
      return { pomodoroPhase: 'work' as const, pomodoroSeconds: WORK_SECONDS };
    }
    const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - timerStartTime) / 1000));
    const cycleSeconds = elapsedSeconds % CYCLE_SECONDS;
    if (cycleSeconds < WORK_SECONDS) {
      return {
        pomodoroPhase: 'work' as const,
        pomodoroSeconds: WORK_SECONDS - cycleSeconds,
      };
    } else {
      return {
        pomodoroPhase: 'break' as const,
        pomodoroSeconds: CYCLE_SECONDS - cycleSeconds,
      };
    }
  }, [timerStartTime, now]);

  // Pomodoro Audio Alerts:
  // - 1-minute remaining warning beep in work phase
  // - Ding when hitting 0 and transitioning to break
  // - Chime when break hits 0 and work resumes
  const prevPhaseRef = useRef<'work' | 'break' | null>(null);
  const hasPlayedBeepRef = useRef<boolean>(false);
  const prevStartTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (timerStyle !== 'pomodoro' || timerStartTime === null) {
      prevPhaseRef.current = null;
      hasPlayedBeepRef.current = false;
      prevStartTimeRef.current = null;
      return;
    }

    // Reset baseline if timer was just clicked/restarted
    if (prevStartTimeRef.current !== timerStartTime) {
      prevStartTimeRef.current = timerStartTime;
      prevPhaseRef.current = pomodoroPhase;
      hasPlayedBeepRef.current = false;
      return;
    }

    // 1. Warning beep at <= 1 minute left in work phase
    if (pomodoroPhase === 'work') {
      if (pomodoroSeconds <= 60 && !hasPlayedBeepRef.current) {
        hasPlayedBeepRef.current = true;
        typewriterAudio.playPomodoroBeep();
      } else if (pomodoroSeconds > 60) {
        hasPlayedBeepRef.current = false;
      }
    }

    // 2. Phase transitions
    if (prevPhaseRef.current !== null && prevPhaseRef.current !== pomodoroPhase) {
      if (prevPhaseRef.current === 'work' && pomodoroPhase === 'break') {
        // Work hit 0 and transitioned to break
        typewriterAudio.playPomodoroDing();
        hasPlayedBeepRef.current = false;
      } else if (prevPhaseRef.current === 'break' && pomodoroPhase === 'work') {
        // Break hit 0 and resumed work
        typewriterAudio.playPomodoroChime();
        hasPlayedBeepRef.current = false;
      }
    }

    prevPhaseRef.current = pomodoroPhase;
  }, [timerStyle, timerStartTime, pomodoroPhase, pomodoroSeconds]);

  const handleClockClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    // Tapping clock stamps start time in snapshot mode or restarts at 25:00 in pomodoro mode
    setTimerStartTime(Date.now());
  }, []);

  const handleTimerBadgeClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    // Tapping timer badge dismisses/clears it
    setTimerStartTime(null);
  }, []);

  if (!showClock) {
    return null;
  }

  const formattedCurrentTime = formatClockTime(now);
  const formattedStartTime = timerStartTime
    ? formatStartTime(new Date(timerStartTime))
    : '';
  const formattedElapsed = formatElapsedTime(elapsedMinutes);
  const formattedPomodoro = formatPomodoroTime(pomodoroSeconds);

  const effectiveColorScheme = isMounted ? colorScheme : 'typewriter';

  const isSerifTheme =
    effectiveColorScheme === 'typewriter' ||
    effectiveColorScheme === 'high-contrast' ||
    effectiveColorScheme === 'low-contrast';

  const fontClass = isSerifTheme
    ? 'font-serif-clock tracking-widest font-normal'
    : typeface === 'courier-prime'
      ? 'font-mono'
      : typeface === 'jetbrains-mono'
        ? 'font-mono tracking-wider'
        : typeface === 'ibm-plex-mono'
          ? 'font-mono tracking-tight'
          : 'font-mono';

  // Pomodoro styling:
  // - Work phase: matches snapshot, flashes when <= 1 minute left
  // - Break phase: inverted appearance (black text inside light bg box or white inside dark box), flashes background on minute boundary
  const isPomodoroWarning = timerStyle === 'pomodoro' && pomodoroPhase === 'work' && pomodoroSeconds <= 60 && pomodoroSeconds > 0;
  const isBreakPhase = timerStyle === 'pomodoro' && pomodoroPhase === 'break';
  const isBreakMinuteFlash = isBreakPhase && pomodoroSeconds % 60 === 0;

  return (
    <div
      suppressHydrationWarning
      className={`relative inline-flex flex-col items-start justify-center select-none ${fontClass}`}
    >
      {/* Session Timer: justified with the clock so numbers align vertically */}
      {timerStartTime !== null && (
        <button
          key={`${timerStartTime}-${timerStyle}`}
          type="button"
          suppressHydrationWarning
          onClick={handleTimerBadgeClick}
          className={`absolute bottom-full mb-2 left-0 text-left text-xl sm:text-2xl uppercase tracking-widest transition-all cursor-pointer border-none shadow-none outline-none whitespace-nowrap animate-timer-slide-up select-none ${
            isBreakPhase
              ? `bg-foreground text-background px-1.5 py-0.5 rounded-[2px] font-bold ${
                  isBreakMinuteFlash ? 'opacity-50' : 'opacity-100'
                }`
              : isPomodoroWarning
              ? 'text-foreground font-bold animate-pulse p-0'
              : 'text-foreground/45 hover:text-foreground/60 p-0'
          }`}
          aria-label={
            timerStyle === 'pomodoro'
              ? pomodoroPhase === 'work'
                ? `Pomodoro countdown: ${formattedPomodoro} remaining. Click to dismiss.`
                : `Pomodoro break: ${formattedPomodoro} remaining. Click to dismiss.`
              : `Session timer started at ${formattedStartTime}, elapsed ${elapsedMinutes} minutes. Click to dismiss.`
          }
        >
          {timerStyle === 'pomodoro' ? (
            <span suppressHydrationWarning>{formattedPomodoro}</span>
          ) : (
            <>
              <span suppressHydrationWarning>{formattedStartTime}</span>
              <span suppressHydrationWarning className="ml-2.5">{formattedElapsed}</span>
            </>
          )}
        </button>
      )}

      {/* Clock Display: centered anchor, justified with the timer */}
      <button
        type="button"
        suppressHydrationWarning
        onClick={handleClockClick}
        className="text-left text-xl sm:text-2xl text-foreground/75 hover:text-foreground transition-colors cursor-pointer tracking-widest uppercase bg-transparent border-none p-0 shadow-none outline-none whitespace-nowrap select-none"
        aria-label={
          timerStyle === 'pomodoro'
            ? `Current time: ${formattedCurrentTime}. Click to restart 25-minute Pomodoro timer.`
            : `Current time: ${formattedCurrentTime}. Click to start session timer.`
        }
      >
        <span suppressHydrationWarning>{formattedCurrentTime}</span>
      </button>
    </div>
  );
};
