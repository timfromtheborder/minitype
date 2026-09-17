'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ClockFormat, Typeface } from '@/types';

export interface ChronoSuiteProps {
  showClock?: boolean;
  clockFormat?: ClockFormat;
  typeface?: Typeface;
  isPaused?: boolean;
}

export function formatClockTime(date: Date, format: ClockFormat = '12h', includePeriod: boolean = true): string {
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');

  if (format === '24h') {
    const hh = hours.toString().padStart(2, '0');
    return `${hh}:${minutes}`;
  }

  // 12-hour format
  const period = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return includePeriod ? `${hours}:${minutes} ${period}` : `${hours}:${minutes}`;
}

export const ChronoSuite: React.FC<ChronoSuiteProps> = ({
  showClock = true,
  clockFormat = '12h',
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

  const formattedCurrentTime = formatClockTime(now, clockFormat, true);
  const formattedStartTime = timerStartTime
    ? formatClockTime(new Date(timerStartTime), clockFormat, false)
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
    <div className={`flex flex-col items-center justify-center select-none ${fontClass}`}>
      {/* Session Timer Badge (Slides in above the clock when active) */}
      {timerStartTime !== null && (
        <button
          type="button"
          onClick={handleTimerBadgeClick}
          className="mb-1 px-2 py-0.5 rounded-[2px] border border-border/60 bg-muted/60 hover:bg-destructive/15 hover:border-destructive/40 text-muted-foreground hover:text-destructive text-[10px] sm:text-xs font-mono font-medium transition-all cursor-pointer active:scale-95 animate-in fade-in slide-in-from-bottom-1 duration-150 flex items-center gap-1 shadow-xs"
          title="Session elapsed timer (click to dismiss)"
          aria-label={`Session timer started at ${formattedStartTime}, elapsed ${elapsedMinutes} minutes. Click to dismiss.`}
        >
          <span>{formattedStartTime}</span>
          <span className="font-bold">+{elapsedMinutes}m</span>
        </button>
      )}

      {/* Clock Display */}
      <button
        type="button"
        onClick={handleClockClick}
        className="text-[11px] sm:text-xs text-foreground/45 hover:text-foreground/80 transition-opacity cursor-pointer tracking-widest uppercase focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-[2px] px-1 py-0.5"
        title="Session clock (click to stamp timer)"
        aria-label={`Current time: ${formattedCurrentTime}. Click to start session timer.`}
      >
        {formattedCurrentTime}
      </button>
    </div>
  );
};
