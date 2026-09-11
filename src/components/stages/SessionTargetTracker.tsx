import React, { useMemo } from 'react';
import { useTypingStore } from '@/stores/typingStore';
import { sanitizeManuscript } from '@/lib/sanitize';
import { countWords } from '@/lib/projectSerializer';

export const SessionTargetTracker: React.FC = React.memo(function SessionTargetTracker() {
  const target = useTypingStore((state) => state.manifest.sessionWordTarget);
  const showTracker = useTypingStore((state) => state.manifest.showSessionTargetTracker ?? true);
  const activeColumnLimit = useTypingStore((state) => state.activeColumnLimit);
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

  // Only visible when enabled in settings AND an active wordcount target is set
  if (!showTracker || !target || target <= 0) return null;

  const isPortrait = (activeColumnLimit ?? 70) === 35;
  // 1 box every 2 columns across the platen
  const boxCount = isPortrait ? 18 : 35;
  const wordsPerBox = target / boxCount;
  const filledCount = Math.min(boxCount, Math.floor(currentSessionWords / wordsPerBox));

  return (
    <div className="w-full max-w-[calc(100vw-1.5rem)] sm:max-w-[calc(100vw-2.5rem)] px-2.5 sm:px-6 md:px-8 flex items-center justify-between pointer-events-none select-none">
      {Array.from({ length: boxCount }).map((_, idx) => {
        const isFilled = idx < filledCount;
        const isNext = idx === filledCount && filledCount < boxCount;

        return (
          <div
            key={idx}
            className={`w-[0.8em] h-[0.8em] rounded-[1px] transition-all duration-200 ${
              isFilled
                ? 'bg-muted-foreground border border-muted-foreground'
                : isNext
                ? 'border border-dotted border-muted-foreground/70 bg-transparent'
                : 'opacity-0'
            }`}
          />
        );
      })}
    </div>
  );
});
