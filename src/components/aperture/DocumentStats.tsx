import React, { useMemo } from 'react';
import { useTypingStore } from '@/stores/typingStore';
import { resolveActiveSessionStats } from '@/lib/projectSerializer';

export const DocumentStats: React.FC = React.memo(function DocumentStats() {
  const showStats = useTypingStore((state) => state.manifest.showStats ?? true);
  const pageMode = useTypingStore((state) => state.manifest.pageMode);
  const activeLineIndex = useTypingStore((state) => state.activeLineIndex);
  const totalProjectWords = useTypingStore((state) => state.manifest.totalWordCount ?? 0);
  const activeSessions = useTypingStore((state) => state.activeSessions);
  const title = useTypingStore((state) => state.manifest.title || 'Untitled Project');
  const sessionWordTarget = useTypingStore((state) => state.manifest.sessionWordTarget);

  const showLineStat = pageMode === 'notecard';
  const lineStatText = showLineStat ? `line: ${activeLineIndex + 1}/10` : null;

  const { currentSessionNumber, currentSessionWords } = useMemo(() => {
    return resolveActiveSessionStats(activeSessions, totalProjectWords);
  }, [activeSessions, totalProjectWords]);

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
        {lineStatText ? (
          <>
            <span>{lineStatText}</span>
            <span>·</span>
          </>
        ) : null}
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
    </div>
  );
});
