import React from 'react';
import { SessionRecord } from '@/types';
import { Clock, Sparkles } from 'lucide-react';
import { countWords, getActiveSessionText } from '@/lib/projectSerializer';
import { useTypingStore } from '@/stores/typingStore';

interface ProjectSessionsTabProps {
  sessions: SessionRecord[];
  projectTitle: string;
  totalWords?: number;
  currentFullText?: string;
}

export function formatSessionDateTime(isoStr?: string | null): string {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
    const month = d.toLocaleDateString('en-US', { month: 'short' });
    const day = d.getDate();
    const year = d.getFullYear();
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${weekday}, ${month} ${day}, ${year}, ${time}`;
  } catch {
    return isoStr || '';
  }
}

export const ProjectSessionsTab: React.FC<ProjectSessionsTabProps> = ({
  sessions,
  projectTitle,
  totalWords: propTotalWords,
  currentFullText,
}) => {
  const sessionWordTarget = useTypingStore((state) => state.manifest.sessionWordTarget);
  const setManifest = useTypingStore((state) => state.setManifest);

  // Chronological order: oldest at top, newest at bottom
  const sortedSessions = [...sessions].sort((a, b) => a.sessionNumber - b.sessionNumber);

  // Document total words
  const docTotalWords =
    propTotalWords !== undefined
      ? propTotalWords
      : currentFullText !== undefined
      ? countWords(currentFullText)
      : sortedSessions.reduce((acc, s) => acc + (s.wordCount || 0), 0);

  // If there are no sessions recorded, but there is text in the project, create an initial active session
  const effectiveSessions: SessionRecord[] =
    sortedSessions.length > 0
      ? sortedSessions
      : [
          {
            id: 'session-1',
            projectId: 'current',
            sessionNumber: 1,
            startedAt: new Date().toISOString(),
            completedAt: null,
            text: currentFullText || '',
            wordCount: docTotalWords,
          },
        ];

  // Resolve session word counts dynamically so active sessions always reflect current writing
  const resolvedSessions = effectiveSessions.map((session, index) => {
    const isLatest = index === effectiveSessions.length - 1;
    const isActive = isLatest && !session.completedAt;

    if (isActive) {
      const priorSessions = effectiveSessions.slice(0, index);
      const priorWords = priorSessions.reduce((acc, s) => acc + (s.wordCount || 0), 0);
      const activeWords = Math.max(0, docTotalWords - priorWords);
      const activeText = getActiveSessionText(currentFullText || '', priorSessions);
      return {
        ...session,
        text: activeText,
        wordCount: activeWords,
      };
    }

    const cleanText = (session.text || '').trim();
    const finalWordCount =
      session.wordCount !== undefined && session.wordCount > 0
        ? session.wordCount
        : countWords(cleanText);

    return {
      ...session,
      text: cleanText,
      wordCount: finalWordCount,
    };
  });

  const cumulativeTotalWords = Math.max(
    docTotalWords,
    resolvedSessions.reduce((acc, s) => acc + (s.wordCount || 0), 0)
  );

  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [resolvedSessions.length]);

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2.5 sm:gap-3 overflow-hidden font-sans">
      {/* Overview Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 sm:p-3 border border-border/70 bg-muted/25 rounded-[2px] shrink-0 gap-2">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
            Project Overview
          </span>
          <h3 className="text-xs sm:text-sm font-semibold truncate text-foreground font-mono">
            {projectTitle || 'Untitled Project'}
          </h3>
        </div>
        <div className="flex items-center gap-3 sm:gap-4 shrink-0 text-right">
          <div>
            <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
              Sessions
            </div>
            <div className="text-xs sm:text-sm font-mono font-bold text-foreground">
              {resolvedSessions.length}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
              Total Words
            </div>
            <div className="text-xs sm:text-sm font-mono font-bold text-primary">
              {cumulativeTotalWords.toLocaleString()}
            </div>
          </div>
          <div className="border-l border-border/60 pl-3">
            <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
              Session Target
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <input
                type="number"
                min={0}
                max={99999}
                step={50}
                placeholder="Off"
                value={sessionWordTarget && sessionWordTarget > 0 ? sessionWordTarget : ''}
                onChange={(e) => {
                  const val = e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0);
                  setManifest({ sessionWordTarget: val > 0 ? val : undefined });
                }}
                className="w-16 sm:w-20 px-1.5 py-0.5 text-xs font-mono font-bold text-right rounded-[2px] border border-border/80 bg-background text-foreground focus:outline-hidden focus:border-primary"
                title="Target words per session (enter 0 or clear to turn off)"
              />
              {sessionWordTarget && sessionWordTarget > 0 ? (
                <button
                  type="button"
                  onClick={() => setManifest({ sessionWordTarget: undefined })}
                  className="text-[10px] text-muted-foreground hover:text-foreground cursor-pointer underline shrink-0"
                  title="Turn off target"
                >
                  Off
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Sessions Scrollable List (defaults to bottom/newest) */}
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-y-auto square-scrollbar border border-border/80 bg-background text-foreground p-2 sm:p-3 space-y-2 rounded-[2px]"
      >
        {resolvedSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 p-4 text-center gap-2 text-muted-foreground">
            <Clock className="w-8 h-8 opacity-40" />
            <p className="text-xs font-medium">No sessions recorded yet for this project.</p>
            <p className="text-[11px] opacity-70">
              Start typing in the aperture to initiate your first drafting session.
            </p>
          </div>
        ) : (
          resolvedSessions.map((session, index) => {
            const isLatest = index === resolvedSessions.length - 1;
            const isActive = isLatest && !session.completedAt;
            let timeRange: string;
            if (session.isImported) {
              const dt = formatSessionDateTime(session.importedAt || session.startedAt);
              timeRange = `${dt} [imported]`;
            } else if (isActive) {
              timeRange = `${formatSessionDateTime(session.startedAt)} - Present`;
            } else if (session.completedAt) {
              timeRange = `${formatSessionDateTime(session.startedAt)} - ${formatSessionDateTime(session.completedAt)}`;
            } else {
              timeRange = formatSessionDateTime(session.startedAt);
            }

            return (
              <div
                key={session.id}
                className="flex items-center justify-between p-2.5 sm:p-3 border border-border/60 bg-muted/30 text-foreground select-none gap-3 font-mono text-[11px] sm:text-xs rounded-[2px]"
              >
                <div className="flex items-center justify-between gap-3 min-w-0 flex-1">
                  <span className="font-semibold text-foreground truncate">
                    {timeRange}
                  </span>
                  <span className="text-muted-foreground font-medium shrink-0 text-right ml-auto">
                    {session.wordCount.toLocaleString()} words
                  </span>
                </div>

                {isActive && (
                  <span className="flex items-center gap-1 text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 rounded-[2px] shrink-0 font-sans ml-2">
                    <Sparkles className="w-2.5 h-2.5" />
                    <span>Active</span>
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
