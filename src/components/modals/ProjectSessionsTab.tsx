import React from 'react';
import { SessionRecord } from '@/types';
import { Clock, Sparkles } from 'lucide-react';

interface ProjectSessionsTabProps {
  sessions: SessionRecord[];
  projectTitle: string;
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
}) => {
  // Chronological order: oldest at top, newest at bottom
  const sortedSessions = [...sessions].sort((a, b) => a.sessionNumber - b.sessionNumber);
  const totalWords = sortedSessions.reduce((acc, s) => acc + (s.wordCount || 0), 0);

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2.5 sm:gap-3 overflow-hidden font-sans">
      {/* Overview Banner */}
      <div className="flex items-center justify-between p-2.5 sm:p-3 border border-border/70 bg-muted/25 shrink-0">
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
              {sortedSessions.length}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
              Total Words
            </div>
            <div className="text-xs sm:text-sm font-mono font-bold text-primary">
              {totalWords.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Sessions Scrollable List */}
      <div className="flex-1 min-h-0 overflow-y-auto square-scrollbar border border-border/80 bg-card text-card-foreground p-2 sm:p-3 space-y-2">
        {sortedSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 p-4 text-center gap-2 text-muted-foreground">
            <Clock className="w-8 h-8 opacity-40" />
            <p className="text-xs font-medium">No sessions recorded yet for this project.</p>
            <p className="text-[11px] opacity-70">
              Start typing in the aperture to initiate your first drafting session.
            </p>
          </div>
        ) : (
          sortedSessions.map((session, index) => {
            const isLatest = index === sortedSessions.length - 1;
            const isActive = isLatest && !session.completedAt;
            let timeRange: string;
            if (session.isImported) {
              const dt = formatSessionDateTime(session.importedAt || session.startedAt);
              timeRange = `${dt} [imported]`;
            } else if (session.completedAt) {
              timeRange = `${formatSessionDateTime(session.startedAt)} - ${formatSessionDateTime(session.completedAt)}`;
            } else {
              timeRange = `${formatSessionDateTime(session.startedAt)} - Present`;
            }

            return (
              <div
                key={session.id}
                className="flex items-center justify-between p-2.5 sm:p-3 border border-border/60 bg-muted/20 text-foreground select-none gap-2 font-mono text-[11px] sm:text-xs"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                  <span className="font-semibold text-foreground">
                    {timeRange}
                  </span>
                  <span className="text-muted-foreground/60">|</span>
                  <span className="text-muted-foreground font-medium shrink-0">
                    {session.wordCount.toLocaleString()} words
                  </span>
                </div>

                {isActive && (
                  <span className="flex items-center gap-1 text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 rounded-none shrink-0 font-sans">
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
