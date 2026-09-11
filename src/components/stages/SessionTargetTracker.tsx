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

  // Measure container width to guarantee all 100 boxes are strictly identical in size on all screens
  const containerRef = useRef<HTMLDivElement>(null);
  const [boxSize, setBoxSize] = useState<number>(5);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const width = el.clientWidth;
      if (width <= 0) return;
      // Guarantee minimum 1px gap across 99 spaces while ensuring integer box size
      const calculated = Math.max(2, Math.floor((width - 99) / 100));
      setBoxSize(calculated);
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
      className="w-full flex items-center justify-between pointer-events-none select-none"
    >
      {Array.from({ length: boxCount }).map((_, idx) => {
        const isFilled = idx < filledCount;
        const isFlashing = idx === justFilledIdx;

        return (
          <div
            key={idx}
            style={{ width: `${boxSize}px`, height: `${boxSize}px` }}
            className={`shrink-0 rounded-[0.5px] transition-colors duration-150 ${
              isFilled
                ? `session-box-filled bg-muted-foreground/15 border border-muted-foreground/25 ${
                    isFlashing ? 'session-box-flash' : ''
                  }`
                : 'session-box-empty border border-dotted border-muted-foreground/16 bg-transparent'
            }`}
          />
        );
      })}
    </div>
  );
});
