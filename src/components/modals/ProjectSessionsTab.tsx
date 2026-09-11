import React, { useState } from 'react';
import { SessionRecord } from '@/types';
import { Calendar, Clock, FileText, ChevronDown, ChevronRight, Sparkles } from 'lucide-react';

interface ProjectSessionsTabProps {
  sessions: SessionRecord[];
  projectTitle: string;
}

export const ProjectSessionsTab: React.FC<ProjectSessionsTabProps> = ({
  sessions,
  projectTitle,
}) => {
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);

  // Chronological order: oldest at top, newest at bottom
  const sortedSessions = [...sessions].sort((a, b) => a.sessionNumber - b.sessionNumber);

  const totalWords = sortedSessions.reduce((acc, s) => acc + (s.wordCount || 0), 0);

  const formatDate = (isoStr?: string) => {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const toggleExpand = (sessionId: string) => {
    setExpandedSessionId(expandedSessionId === sessionId ? null : sessionId);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2.5 sm:gap-3 overflow-hidden font-sans">
      {/* Overview Banner */}
      <div className="flex items-center justify-between p-2.5 sm:p-3 border border-border/70 bg-muted/25 shrink-0">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
            Project Overview
          </span>
          <h3 className="text-xs sm:text-sm font-semibold truncate text-foreground font-mono">
            {projectTitle || 'Untitled Manuscript'}
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

      {/* Sessions Stream Header */}
      <div className="flex items-center justify-between px-1 text-[11px] text-muted-foreground shrink-0">
        <span className="font-semibold tracking-wide uppercase text-[10px]">
          Session Timeline (Oldest to Newest)
        </span>
        <span className="text-[10px] opacity-70">
          Click a session to inspect text
        </span>
      </div>

      {/* Sessions Scrollable List */}
      <div className="flex-1 min-h-0 overflow-y-auto square-scrollbar border border-border/80 bg-card text-card-foreground divide-y divide-border/40">
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
            const isExpanded = expandedSessionId === session.id;

            return (
              <div
                key={session.id}
                className={`flex flex-col transition-colors ${
                  isExpanded ? 'bg-muted/30' : 'hover:bg-muted/15'
                }`}
              >
                {/* Session Header Card */}
                <div
                  onClick={() => toggleExpand(session.id)}
                  className="flex items-center justify-between p-2.5 sm:p-3 gap-2 cursor-pointer select-none"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground p-0.5 transition-colors"
                      aria-label={isExpanded ? 'Collapse session' : 'Expand session'}
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 shrink-0" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs sm:text-sm font-bold text-foreground">
                          Session {session.sessionNumber}
                        </span>
                        {isLatest && !session.completedAt && (
                          <span className="flex items-center gap-1 text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 rounded-none">
                            <Sparkles className="w-2.5 h-2.5" />
                            <span>Active</span>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-0.5">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 opacity-70" />
                          <span>{formatDate(session.startedAt)}</span>
                        </span>
                        {session.completedAt && (
                          <span className="hidden sm:inline-flex items-center gap-1 opacity-75">
                            <span>to {formatDate(session.completedAt)}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Word Count Pill */}
                  <div className="text-right shrink-0">
                    <span className="font-mono text-xs font-semibold px-2 py-0.5 bg-muted/60 border border-border/60 text-foreground">
                      {session.wordCount.toLocaleString()} words
                    </span>
                  </div>
                </div>

                {/* Session Text Drawer */}
                {isExpanded && (
                  <div className="p-3 sm:p-4 pt-1 bg-background/50 border-t border-border/40 font-mono text-xs leading-relaxed text-foreground whitespace-pre-wrap max-h-60 overflow-y-auto square-scrollbar">
                    {session.text && session.text.trim().length > 0 ? (
                      session.text
                    ) : (
                      <span className="italic text-muted-foreground/70">
                        {isLatest
                          ? 'Drafting actively in the aperture. Text will sync automatically.'
                          : 'Empty session content.'}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
