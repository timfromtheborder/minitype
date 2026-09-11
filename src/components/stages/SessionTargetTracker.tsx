import React, { useMemo, useRef, useEffect, useState } from 'react';
import { useTypingStore } from '@/stores/typingStore';
import { sanitizeManuscript } from '@/lib/sanitize';
import { countWords } from '@/lib/projectSerializer';

export const SessionTargetTracker: React.FC = React.memo(function SessionTargetTracker() {
  const target = useTypingStore((state) => state.manifest.sessionWordTarget);
  const showTracker = useTypingStore((state) => state.manifest.showSessionTargetTracker ?? true);
  const pageMode = useTypingStore((state) => state.manifest.pageMode);
  const currentPageLines = useTypingStore((state) => state.currentPageLines);
  const historicalPages = useTypingStore((state) => state.historicalPages);
  const currentPageNumber = useTypingStore((state) => state.currentPageNumber);
  const activeSessions = useTypingStore((state) => state.activeSessions);

  const { currentSessionWords } = useMemo(() => {
    const allPages = [
      ...historicalPages,
      {
        pageNumber: currentPageNumber,
        lines: currentPageLines,
        completedAt: null,
      },
    ];
    const fullClean = sanitizeManuscript(allPages, { doubleSpaceLinebreaks: false, pageMode });
    const totalWords = countWords(fullClean);

    const sessions = activeSessions && activeSessions.length > 0 ? activeSessions : [];
    const lastIndex = sessions.length - 1;
    const lastSession = lastIndex >= 0 ? sessions[lastIndex] : null;
    const isSessionActive = lastSession && !lastSession.completedAt;

    if (isSessionActive) {
      const priorSessions = sessions.slice(0, lastIndex);
      const priorWords = priorSessions.reduce((acc, s) => acc + (s.wordCount || 0), 0);
      return { currentSessionWords: Math.max(0, totalWords - priorWords) };
    }
    return { currentSessionWords: 0 };
  }, [historicalPages, currentPageLines, currentPageNumber, activeSessions, pageMode]);

  const boxCount = 100;
  const filledCount = target && target > 0
    ? Math.min(boxCount, Math.floor((currentSessionWords / target) * boxCount))
    : 0;

  // Track the most recently filled box index to trigger a brief flash animation
  const prevFilledRef = useRef(filledCount);
  const [justFilledIdx, setJustFilledIdx] = useState<number | null>(null);

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
  }, []);

  useEffect(() => {
    if (filledCount > prevFilledRef.current) {
      setJustFilledIdx(filledCount - 1);
      const timer = setTimeout(() => {
        setJustFilledIdx(null);
      }, 300);
      prevFilledRef.current = filledCount;
      return () => clearTimeout(timer);
    } else {
      prevFilledRef.current = filledCount;
    }
  }, [filledCount]);

  // Only visible when enabled in settings AND an active wordcount target is set
  if (!showTracker || !target || target <= 0) return null;

  return (
    <div
      ref={containerRef}
      style={{ height: `${barHeight}px` }}
      className="w-full flex flex-row items-stretch gap-0 border border-border/60 rounded-t-[2px] overflow-hidden bg-background/30 pointer-events-none select-none"
    >
      {Array.from({ length: boxCount }).map((_, idx) => {
        const isFilled = idx < filledCount;
        const isFlashing = idx === justFilledIdx;

        return (
          <div
            key={idx}
            className={`flex-1 h-full transition-colors duration-150 ${
              isFilled
                ? `session-box-filled bg-primary/25 ${isFlashing ? 'session-box-flash' : ''}`
                : 'bg-transparent'
            }`}
          />
        );
      })}
    </div>
  );
});
