import React, { useMemo, useRef, useEffect, useState } from 'react';
import { useTypingStore } from '@/stores/typingStore';
import { resolveActiveSessionStats } from '@/lib/projectSerializer';

export const SessionTargetTracker: React.FC = React.memo(function SessionTargetTracker() {
  const target = useTypingStore((state) => state.manifest.sessionWordTarget);
  const showTracker = useTypingStore((state) => state.manifest.showSessionTargetTracker ?? true);
  const totalProjectWords = useTypingStore((state) => state.manifest.totalWordCount ?? 0);
  const activeSessions = useTypingStore((state) => state.activeSessions);
  const activeColumnLimit = useTypingStore((state) => state.activeColumnLimit);

  const { currentSessionWords } = useMemo(() => {
    return resolveActiveSessionStats(activeSessions, totalProjectWords);
  }, [activeSessions, totalProjectWords]);

  const boxCount = 100;
  const rawFilledCount = target && target > 0
    ? Math.min(boxCount, Math.floor((currentSessionWords / target) * boxCount))
    : 0;

  // Track the displayed filled count, debounced by 2 seconds of typing pause
  const [displayedFilledCount, setDisplayedFilledCount] = useState(rawFilledCount);
  const [burstRange, setBurstRange] = useState<{ start: number; end: number } | null>(null);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const burstTimerRef = useRef<NodeJS.Timeout | null>(null);
  const prevTargetRef = useRef(target);

  // Measure container width so contiguous 100 boxes strictly maintain 1:2 height:width
  const containerRef = useRef<HTMLDivElement>(null);
  const [barHeight, setBarHeight] = useState<number>(4);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const width = el.clientWidth;
      if (width <= 0) return;
      // 100 boxes across width W: each box has width W/100.
      // Height:width is 1:2, so height = (W / 100) / 2 = W / 200.
      const calculatedHeight = Math.max(3, Math.round(width / 200));
      setBarHeight(calculatedHeight);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeColumnLimit]);

  const lastActiveSession = activeSessions.length > 0 ? activeSessions[activeSessions.length - 1] : null;
  const currentSessionId = lastActiveSession?.id ?? null;
  const prevSessionIdRef = useRef(currentSessionId);

  // Synchronously reset/clear if target changes, project resets, a new session begins, or count drops
  useEffect(() => {
    const isNewSession = prevSessionIdRef.current !== currentSessionId;
    const isTargetChanged = prevTargetRef.current !== target;
    const isCountReset = rawFilledCount < displayedFilledCount;

    if (isNewSession || isTargetChanged || isCountReset) {
      prevSessionIdRef.current = currentSessionId;
      prevTargetRef.current = target;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (burstTimerRef.current) {
        clearTimeout(burstTimerRef.current);
        burstTimerRef.current = null;
      }
      setDisplayedFilledCount(rawFilledCount);
      setBurstRange(null);
    }
  }, [currentSessionId, target, rawFilledCount, displayedFilledCount]);

  // Debounce visual tracker progress updates until typing has paused for 1 second
  useEffect(() => {
    if (rawFilledCount <= displayedFilledCount) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setDisplayedFilledCount((currentDisplayed) => {
        if (rawFilledCount > currentDisplayed) {
          // Illuminate all boxes that filled in during this typing burst
          setBurstRange({ start: currentDisplayed, end: rawFilledCount - 1 });
          if (burstTimerRef.current) clearTimeout(burstTimerRef.current);
          burstTimerRef.current = setTimeout(() => {
            setBurstRange(null);
          }, 200); // 200ms burst settle
        } else {
          setBurstRange(null);
        }
        return rawFilledCount;
      });
    }, 1300); // 1300ms pause

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [rawFilledCount, displayedFilledCount]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (burstTimerRef.current) clearTimeout(burstTimerRef.current);
    };
  }, []);

  // Only visible when enabled in settings AND an active wordcount target is set
  if (!showTracker || !target || target <= 0) return null;

  return (
    <div
      ref={containerRef}
      style={{
        height: `${barHeight}px`,
        transform: 'translateZ(0)',
        willChange: 'opacity',
        contain: 'layout paint',
      }}
      className="w-full flex flex-row items-stretch gap-0 border border-border/60 rounded-t-[2px] overflow-hidden bg-background/30 pointer-events-none select-none"
    >
      {Array.from({ length: boxCount }).map((_, idx) => {
        const isFilled = idx < displayedFilledCount;
        const isBursting = burstRange !== null && idx >= burstRange.start && idx <= burstRange.end;

        return (
          <div
            key={idx}
            className={`flex-1 h-full transition-colors duration-150 ${
              isFilled
                ? `session-box-filled bg-primary/25 ${isBursting ? 'session-box-burst' : ''}`
                : 'bg-transparent'
            }`}
          />
        );
      })}
    </div>
  );
});
