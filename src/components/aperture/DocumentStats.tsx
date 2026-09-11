import React, { useMemo } from 'react';
import { useTypingStore } from '@/stores/typingStore';
import { sanitizeManuscript } from '@/lib/sanitize';
import { countWords } from '@/lib/projectSerializer';
import { Check, Loader2 } from 'lucide-react';

export const DocumentStats: React.FC = React.memo(function DocumentStats() {
  const showStats = useTypingStore((state) => state.manifest.showStats ?? true);
  const pageMode = useTypingStore((state) => state.manifest.pageMode);
  const pageSize = useTypingStore((state) => state.manifest.pageSize);
  const activeLineIndex = useTypingStore((state) => state.activeLineIndex);
  const currentPageLines = useTypingStore((state) => state.currentPageLines);
  const historicalPages = useTypingStore((state) => state.historicalPages);
  const currentPageNumber = useTypingStore((state) => state.currentPageNumber);
  const activeSessions = useTypingStore((state) => state.activeSessions);
  const title = useTypingStore((state) => state.manifest.title || 'Untitled Project');
  const sessionWordTarget = useTypingStore((state) => state.manifest.sessionWordTarget);

  const saveState = useTypingStore((state) => state.saveState);
  const persistenceError = useTypingStore((state) => state.persistenceError);

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
    const fullClean = sanitizeManuscript(allPages, { doubleSpaceLinebreaks: false, pageMode });
    const totalWords = countWords(fullClean);

    const sessions = activeSessions && activeSessions.length > 0 ? activeSessions : [];
    const lastIndex = sessions.length - 1;
    const lastSession = lastIndex >= 0 ? sessions[lastIndex] : null;

    // Check if we currently have an uncompleted active session in progress
    const isSessionActive = lastSession && !lastSession.completedAt;

    let sessionNum = 1;
    let sessionWords = 0;

    if (isSessionActive) {
      sessionNum = lastSession.sessionNumber;
      const priorSessions = sessions.slice(0, lastIndex);
      const priorWords = priorSessions.reduce((acc, s) => acc + (s.wordCount || 0), 0);
      sessionWords = Math.max(0, totalWords - priorWords);
    } else {
      // All prior sessions were completed (e.g. freshly loaded file, or after starting a session).
      // When a new session is going to start on the next keystroke, show its upcoming number and 0 words.
      sessionNum = sessions.length + 1;
      sessionWords = 0;
    }

    return {
      totalProjectWords: totalWords,
      currentSessionNumber: sessionNum,
      currentSessionWords: sessionWords,
    };
  }, [historicalPages, currentPageLines, currentPageNumber, activeSessions, pageMode]);

  return (
    <div
      className="relative flex items-center justify-center w-full max-w-[calc(100vw-1.5rem)] sm:max-w-[calc(100vw-2.5rem)] px-2.5 sm:px-6 md:px-8 mt-1.5 text-muted-foreground text-xs font-mono select-none"
    >
      {/* Centered Document Metadata - strictly on one line */}
      <div
        className={`flex items-center justify-center gap-1.5 sm:gap-2 whitespace-nowrap overflow-hidden text-ellipsis px-6 pointer-events-none transition-opacity duration-150 ${
          showStats === false ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <span>{lineStatText}</span>
        <span>·</span>
        <span>
          [ session: {currentSessionNumber} ·{' '}
          <span
            className={
              sessionWordTarget && sessionWordTarget > 0 && currentSessionWords >= sessionWordTarget
                ? 'font-bold text-foreground'
                : undefined
            }
          >
            {sessionWordTarget && sessionWordTarget > 0
              ? `${currentSessionWords}/${sessionWordTarget} words`
              : `${currentSessionWords} words`}
          </span>{' '}
          ]
        </span>
        <span>·</span>
        <span className="truncate max-w-[80px] sm:max-w-[160px] md:max-w-[220px]">{title.toLowerCase()}</span>
        <span>·</span>
        <span className="text-foreground/90 font-medium">{totalProjectWords} words</span>
      </div>

      {/* Right-Justified Save Status Indicator - aligned vertically with right outside edge of platen */}
      <div
        className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none select-none"
        aria-hidden="true"
      >
        {persistenceError || saveState === 'error' ? (
          <span className="text-destructive font-bold leading-none text-[0.85em]">!</span>
        ) : saveState === 'saving' || saveState === 'typing' ? (
          <Loader2 className="w-[0.85em] h-[0.85em] animate-spin text-muted-foreground" />
        ) : (
          <Check className="w-[0.85em] h-[0.85em] stroke-[2.5] text-muted-foreground" />
        )}
      </div>
    </div>
  );
});
