import React, { useMemo } from 'react';
import { useTypingStore } from '@/stores/typingStore';
import { sanitizeManuscript } from '@/lib/sanitize';
import { countWords } from '@/lib/projectSerializer';

export const DocumentStats: React.FC = React.memo(function DocumentStats() {
  const showStats = useTypingStore((state) => state.manifest.showStats ?? true);
  const pageMode = useTypingStore((state) => state.manifest.pageMode);
  const pageSize = useTypingStore((state) => state.manifest.pageSize);
  const activeLineIndex = useTypingStore((state) => state.activeLineIndex);
  const activeColumnLimit = useTypingStore((state) => state.activeColumnLimit);
  const currentPageLines = useTypingStore((state) => state.currentPageLines);
  const historicalPages = useTypingStore((state) => state.historicalPages);
  const currentPageNumber = useTypingStore((state) => state.currentPageNumber);
  const activeSessions = useTypingStore((state) => state.activeSessions);
  const title = useTypingStore((state) => state.manifest.title || 'Untitled Project');

  const isPortrait = (activeColumnLimit ?? 70) === 35;
  const boxWidthClass = isPortrait
    ? 'w-[calc(36ch+1.25rem)] max-w-[calc(100vw-1.5rem)]'
    : 'w-[calc(71ch+3rem)] md:w-[calc(71ch+4rem)] max-w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-2.5rem)]';

  const lineStatText =
    pageMode === 'scroll'
      ? `line: ${activeLineIndex + 1}`
      : pageMode === 'notecard'
      ? `line: ${activeLineIndex + 1}/10`
      : pageMode === 'paragraph'
      ? `line: ${activeLineIndex + 1}`
      : `line: ${activeLineIndex + 1}/${pageSize || 54}`;

  const { totalProjectWords, currentSessionNumber, currentSessionWords } = useMemo(() => {
    const allPages = [
      ...historicalPages,
      {
        pageNumber: currentPageNumber,
        lines: currentPageLines,
        completedAt: null,
      },
    ];
    const fullClean = sanitizeManuscript(allPages, { doubleSpaceLinebreaks: false });
    const totalWords = countWords(fullClean);

    const sessions = activeSessions && activeSessions.length > 0 ? activeSessions : [];
    const lastIndex = sessions.length - 1;
    const currentSession = lastIndex >= 0 ? sessions[lastIndex] : null;
    const sessionNum = currentSession?.sessionNumber ?? (sessions.length || 1);

    let sessionWords = 0;
    if (currentSession && !currentSession.completedAt) {
      const priorWords = sessions.slice(0, lastIndex).reduce((acc, s) => acc + (s.wordCount || 0), 0);
      sessionWords = Math.max(0, totalWords - priorWords);
    } else if (currentSession) {
      sessionWords = currentSession.wordCount || 0;
    } else {
      sessionWords = totalWords;
    }

    return {
      totalProjectWords: totalWords,
      currentSessionNumber: sessionNum,
      currentSessionWords: sessionWords,
    };
  }, [historicalPages, currentPageLines, currentPageNumber, activeSessions]);

  if (showStats === false) return null;

  return (
    <div
      className={`flex items-center justify-center text-center ${boxWidthClass} px-3 sm:px-8 mt-1.5 text-muted-foreground text-xs font-mono pointer-events-none select-none`}
    >
      <div className="flex items-center justify-center gap-1.5 sm:gap-2 flex-wrap">
        <span>{lineStatText}</span>
        <span>·</span>
        <span>[ session: {currentSessionNumber} · {currentSessionWords} words ]</span>
        <span>·</span>
        <span className="truncate max-w-[150px] sm:max-w-[250px]">{title.toLowerCase()}</span>
        <span>·</span>
        <span className="text-foreground/90 font-medium">{totalProjectWords} words</span>
      </div>
    </div>
  );
});
