'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ClockFormat, Typeface } from '@/types';

export interface ChronoSuiteProps {
  showClock?: boolean;
  clockFormat?: ClockFormat;
  typeface?: Typeface;
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

export const ChronoSuite: React.FC<ChronoSuiteProps> = ({
  showClock = true,
  typeface = 'courier-prime',
  isPaused = false,
}) => {
  const [now, setNow] = useState<Date>(() => new Date());
  const [timerStartTime, setTimerStartTime] = useState<number | null>(null);

  // Update clock every second
  useEffect(() => {
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

  const fontClass =
    typeface === 'courier-prime'
      ? 'font-mono'
      : typeface === 'jetbrains-mono'
        ? 'font-mono tracking-wider'
        : typeface === 'ibm-plex-mono'
          ? 'font-mono tracking-tight'
          : 'font-mono';

  return (
    <div className={`relative flex flex-col items-center justify-center select-none ${fontClass}`}>
      {/* Session Timer Badge: anchored absolutely above the clock without shifting clock position */}
      {timerStartTime !== null && (
        <button
          type="button"
          onClick={handleTimerBadgeClick}
          className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-[2px] border border-border/60 bg-muted/80 hover:bg-destructive/15 hover:border-destructive/40 text-muted-foreground hover:text-destructive text-xs font-mono font-medium transition-all cursor-pointer active:scale-95 animate-in fade-in slide-in-from-bottom-1 duration-150 flex items-center gap-1.5 shadow-xs whitespace-nowrap z-20"
          title="Session elapsed timer (click to dismiss)"
          aria-label={`Session timer started at ${formattedStartTime}, elapsed ${elapsedMinutes} minutes. Click to dismiss.`}
        >
          <span>{formattedStartTime}</span>
          <span className="font-bold">+{elapsedMinutes}m</span>
        </button>
      )}

      {/* Clock Display: 100% larger (text-xl sm:text-2xl) */}
      <button
        type="button"
        onClick={handleClockClick}
        className="text-xl sm:text-2xl text-foreground/40 hover:text-foreground/80 transition-opacity cursor-pointer tracking-widest font-mono uppercase focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-[2px] px-2 py-0.5 whitespace-nowrap"
        title="Session clock (click to stamp timer)"
        aria-label={`Current time: ${formattedCurrentTime}. Click to start session timer.`}
      >
        {formattedCurrentTime}
      </button>
    </div>
  );
};
