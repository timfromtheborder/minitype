'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ClockFormat, Typeface, ColorScheme } from '@/types';

export interface ChronoSuiteProps {
  showClock?: boolean;
  clockFormat?: ClockFormat;
  typeface?: Typeface;
  colorScheme?: ColorScheme;
  isPaused?: boolean;
}

export function formatClockTime(date: Date, options?: { hour12?: boolean }): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: options?.hour12,
    }).format(date);
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

export const ChronoSuite: React.FC<ChronoSuiteProps> = ({
  showClock = true,
  typeface = 'courier-prime',
  colorScheme = 'typewriter',
  isPaused = false,
}) => {
  const [now, setNow] = useState<Date>(() => new Date());
  const [timerStartTime, setTimerStartTime] = useState<number | null>(null);
  const [isMounted, setIsMounted] = useState<boolean>(false);

  // Update clock every second and sync on mount
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

  const handleClockClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    // Tapping clock stamps start time or starts a fresh run
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

  return (
    <div
      suppressHydrationWarning
      className={`relative inline-flex flex-col items-start justify-center select-none ${fontClass}`}
    >
      {/* Session Timer: justified with the clock so numbers align vertically */}
      {timerStartTime !== null && (
        <button
          key={timerStartTime}
          type="button"
          suppressHydrationWarning
          onClick={handleTimerBadgeClick}
          className="absolute bottom-full mb-2 left-0 text-left text-xl sm:text-2xl uppercase tracking-widest text-foreground/45 hover:text-foreground/60 transition-colors cursor-pointer bg-transparent border-none p-0 shadow-none outline-none whitespace-nowrap animate-timer-slide-up select-none"
          aria-label={`Session timer started at ${formattedStartTime}, elapsed ${elapsedMinutes} minutes. Click to dismiss.`}
        >
          <span suppressHydrationWarning>{formattedStartTime}</span>
          <span suppressHydrationWarning className="ml-2.5">{formattedElapsed}</span>
        </button>
      )}

      {/* Clock Display: centered anchor, justified with the timer */}
      <button
        type="button"
        suppressHydrationWarning
        onClick={handleClockClick}
        className="text-left text-xl sm:text-2xl text-foreground/75 hover:text-foreground transition-colors cursor-pointer tracking-widest uppercase bg-transparent border-none p-0 shadow-none outline-none whitespace-nowrap select-none"
        aria-label={`Current time: ${formattedCurrentTime}. Click to start session timer.`}
      >
        <span suppressHydrationWarning>{formattedCurrentTime}</span>
      </button>
    </div>
  );
};
