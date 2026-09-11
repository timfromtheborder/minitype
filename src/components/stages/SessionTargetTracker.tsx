import React, { useMemo } from 'react';
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

  // Only visible when enabled in settings AND an active wordcount target is set
  if (!showTracker || !target || target <= 0) return null;

  const boxCount = 100;
  const filledCount = Math.min(boxCount, Math.floor((currentSessionWords / target) * boxCount));

  return (
    <div className="w-full flex items-center justify-between gap-[1px] sm:gap-[1.5px] pointer-events-none select-none">
      {Array.from({ length: boxCount }).map((_, idx) => {
        const isFilled = idx < filledCount;

        return (
          <div
            key={idx}
            className={`flex-1 h-[5px] sm:h-[6px] min-w-0 rounded-[0.5px] transition-colors duration-150 ${
              isFilled
                ? 'bg-muted-foreground/25 border border-muted-foreground/35'
                : 'border border-dotted border-muted-foreground/25 bg-transparent'
            }`}
          />
        );
      })}
    </div>
  );
});
