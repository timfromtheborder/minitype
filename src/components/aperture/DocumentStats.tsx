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
  const activeColumnLimit = useTypingStore((state) => state.activeColumnLimit);
  const currentPageLines = useTypingStore((state) => state.currentPageLines);
  const historicalPages = useTypingStore((state) => state.historicalPages);
  const currentPageNumber = useTypingStore((state) => state.currentPageNumber);
  const activeSessions = useTypingStore((state) => state.activeSessions);
  const title = useTypingStore((state) => state.manifest.title || 'Untitled Project');

  const saveState = useTypingStore((state) => state.saveState);
  const persistenceError = useTypingStore((state) => state.persistenceError);
  const flushSave = useTypingStore((state) => state.flushSave);

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
      className={`relative flex items-center justify-center ${boxWidthClass} px-2.5 sm:px-6 md:px-8 mt-1.5 text-muted-foreground text-xs font-mono select-none`}
    >
      {/* Centered Document Metadata - strictly on one line */}
      <div
        className={`flex items-center justify-center gap-1.5 sm:gap-2 whitespace-nowrap overflow-hidden text-ellipsis px-5 pointer-events-none transition-opacity duration-150 ${
          showStats === false ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <span>{lineStatText}</span>
        <span>·</span>
        <span>[ session: {currentSessionNumber} · {currentSessionWords} words ]</span>
        <span>·</span>
        <span className="truncate max-w-[80px] sm:max-w-[160px] md:max-w-[220px]">{title.toLowerCase()}</span>
        <span>·</span>
        <span className="text-foreground/90 font-medium">{totalProjectWords} words</span>
      </div>

      {/* Right-Justified Save Status Checkbox - beneath bottom-right corner of platen */}
      <button
        type="button"
        onClick={() => flushSave?.()}
        className="absolute right-2.5 sm:right-6 md:right-8 flex items-center justify-center w-[0.85em] h-[0.85em] rounded-[1.5px] border border-border/80 bg-card text-card-foreground shadow-xs cursor-pointer active:scale-95 transition-all p-0 leading-none shrink-0"
        aria-label="Save status"
      >
        {persistenceError || saveState === 'error' ? (
          <span className="text-red-500 font-bold leading-none text-[0.65em]">!</span>
        ) : saveState === 'saving' || saveState === 'typing' ? (
          <Loader2 className="w-[0.7em] h-[0.7em] animate-spin text-card-foreground" />
        ) : (
          <Check className="w-[0.7em] h-[0.7em] stroke-[2.5] text-card-foreground" />
        )}
      </button>
    </div>
  );
});
