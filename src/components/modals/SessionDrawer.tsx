'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { PageRecord, ManuscriptManifest, SessionRecord } from '@/types';
import { sanitizeManuscript } from '@/lib/sanitize';
import { useTypingStore } from '@/stores/typingStore';
import {
  Printer,
  Download,
  CornerUpLeft,
  Plus,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  ChevronsDownUp,
  Copy,
  Check,
  Trash2,
  Sparkles,
  Type,
  BookOpen,
} from 'lucide-react';
import {
  countWords,
  resolveActiveSessionStats,
  getActiveSessionText,
} from '@/lib/projectSerializer';
import { formatSessionDateTime } from './ProjectSessionsTab';

export interface SessionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  pages?: PageRecord[];
  manifest?: ManuscriptManifest;
  onPrintedComplete?: (printedCharCount: number) => void;
  onClearText?: () => void;
}

export const SessionDrawer: React.FC<SessionDrawerProps> = ({
  isOpen,
  onClose,
  pages: propPages,
  manifest: propManifest,
  onPrintedComplete,
}) => {
  const storeManifest = useTypingStore((state) => state.manifest);
  const storeHistoricalPages = useTypingStore((state) => state.historicalPages);
  const storeCurrentPageNumber = useTypingStore((state) => state.currentPageNumber);
  const storeCurrentPageLines = useTypingStore((state) => state.currentPageLines);
  const activeSessions = useTypingStore((state) => state.activeSessions);

  const manifest = propManifest ?? storeManifest;
  const storeTitle = useTypingStore((state) => state.manifest.title);
  const [title, setTitle] = useState<string>(manifest.title || 'Untitled Project');
  const [sanitizedFullText, setSanitizedFullText] = useState<string>('');
  const [viewMode, setViewMode] = useState<'typewriter' | 'manuscript'>('typewriter');
  const [collapsedSessionIds, setCollapsedSessionIds] = useState<Record<string, boolean>>({});
  const [copiedSessionId, setCopiedSessionId] = useState<string | null>(null);
  const [isPulsingActive, setIsPulsingActive] = useState<boolean>(false);

  const modalRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevDocIdRef = useRef<string | null>(null);
  const prevIsOpenRef = useRef<boolean>(false);

  // Sync title from store if project changes or is renamed externally
  useEffect(() => {
    if (storeTitle !== undefined && storeTitle !== title) {
      setTitle(storeTitle);
    }
  }, [storeTitle]);

  // Sync title and compile manuscript when drawer opens or document changes
  useEffect(() => {
    if (isOpen) {
      if (!prevIsOpenRef.current || prevDocIdRef.current !== manifest.id) {
        setTitle(manifest.title || 'Untitled Project');
        prevDocIdRef.current = manifest.id;
      }
      prevIsOpenRef.current = true;

      const allPages = propPages ?? [
        ...storeHistoricalPages,
        {
          pageNumber: storeCurrentPageNumber,
          lines: storeCurrentPageLines,
          completedAt: null,
        },
      ];
      const fullClean = sanitizeManuscript(allPages, {
        doubleSpaceLinebreaks: manifest.doubleSpaceLinebreaks,
        pageMode: manifest.pageMode,
      });
      setSanitizedFullText(fullClean);
      const computedTotalWords = countWords(fullClean);
      useTypingStore.getState().syncSessionStats(fullClean, computedTotalWords);
    } else {
      prevIsOpenRef.current = false;
    }
  }, [
    isOpen,
    manifest.id,
    manifest.doubleSpaceLinebreaks,
    manifest.pageMode,
    propPages,
    storeHistoricalPages,
    storeCurrentPageNumber,
    storeCurrentPageLines,
  ]);

  // Focus trap & Escape key listener
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      const focusables = modalRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables && focusables.length > 0) {
        focusables[0].focus();
      }
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        const focusables = modalRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables || focusables.length === 0) return;
        const firstEl = focusables[0];
        const lastEl = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstEl) {
            e.preventDefault();
            lastEl.focus();
          }
        } else {
          if (document.activeElement === lastEl) {
            e.preventDefault();
            firstEl.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const totalWords = countWords(sanitizedFullText);
  const sessionWordTarget = manifest.sessionWordTarget;

  // Filter sessions strictly to the current project and sort chronologically: oldest at top, newest at bottom
  const projectSessions = activeSessions.filter((s) => s.projectId === manifest.id);
  const sortedSessions = useMemo(() => {
    return [...projectSessions].sort((a, b) => a.sessionNumber - b.sessionNumber);
  }, [projectSessions]);

  // If there are no sessions recorded, but there is text in the project, create an initial active session
  const effectiveSessions: SessionRecord[] = useMemo(() => {
    if (sortedSessions.length > 0) return sortedSessions;
    if (totalWords > 0) {
      return [
        {
          id: `${manifest.id}-session-1`,
          projectId: manifest.id,
          sessionNumber: 1,
          startedAt: new Date().toISOString(),
          completedAt: null,
          text: sanitizedFullText,
          wordCount: totalWords,
        },
      ];
    }
    return [];
  }, [sortedSessions, totalWords, manifest.id, sanitizedFullText]);

  // Resolve session word counts dynamically so active sessions always reflect current writing
  const resolvedSessions = useMemo(() => {
    return effectiveSessions.map((session, index) => {
      const isLatest = index === effectiveSessions.length - 1;
      const isActive = isLatest && !session.completedAt;

      if (isActive) {
        const { currentSessionWords } = resolveActiveSessionStats(effectiveSessions, totalWords);
        const priorSessions = effectiveSessions.slice(0, index);
        const activeText = getActiveSessionText(sanitizedFullText, priorSessions);
        return {
          ...session,
          text: activeText,
          wordCount: currentSessionWords,
        };
      }

      let cleanText = (session.text || '').trim();
      if (manifest.doubleSpaceLinebreaks && cleanText.length > 0) {
        cleanText = cleanText.replace(/\n{2,}/g, '\n\n').replace(/([^\n])\n([^\n])/g, '$1\n\n$2');
      }
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
  }, [effectiveSessions, totalWords, sanitizedFullText, manifest.doubleSpaceLinebreaks]);

  if (!isOpen) return null;

  const handleDownloadTxt = () => {
    const safeTitle = (title.trim() || manifest.title || 'manuscript').replace(/[/\\?%*:|"<>]/g, '-');
    const blob = new Blob([sanitizedFullText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeTitle}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    if (onPrintedComplete) {
      onPrintedComplete(sanitizedFullText.length);
    }
  };

  const handleBrowserPrint = () => {
    window.print();
    if (onPrintedComplete) {
      onPrintedComplete(sanitizedFullText.length);
    }
  };

  const handleStartNewSession = async () => {
    const hasEmptyActive = resolvedSessions.some(
      (s, idx) => idx === resolvedSessions.length - 1 && !s.completedAt && s.wordCount === 0
    );
    if (hasEmptyActive) {
      setIsPulsingActive(true);
      setTimeout(() => setIsPulsingActive(false), 600);
    }
    await useTypingStore.getState().startNewSession();
  };

  const handleCloseActiveSession = async () => {
    await useTypingStore.getState().closeActiveSession();
  };

  const handleCopySessionText = async (sessionId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSessionId(sessionId);
      setTimeout(() => setCopiedSessionId(null), 1500);
    } catch {
      // Fallback
      setCopiedSessionId(null);
    }
  };

  const toggleSessionCollapse = (sessionId: string) => {
    setCollapsedSessionIds((prev) => ({
      ...prev,
      [sessionId]: !prev[sessionId],
    }));
  };

  const allCollapsed = resolvedSessions.length > 0 && resolvedSessions.every((s) => collapsedSessionIds[s.id]);

  const handleToggleAllCollapse = () => {
    if (allCollapsed) {
      // Expand all
      setCollapsedSessionIds({});
    } else {
      // Collapse all
      const next: Record<string, boolean> = {};
      resolvedSessions.forEach((s) => {
        next[s.id] = true;
      });
      setCollapsedSessionIds(next);
    }
  };

  const hasActiveSession = resolvedSessions.some(
    (s, idx) => idx === resolvedSessions.length - 1 && !s.completedAt && s.wordCount > 0
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Session Drawer"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-2 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="w-full max-w-3xl h-[calc(100dvh-5.5rem)] max-h-[calc(100dvh-5.5rem)] landscape:h-[calc(100dvh-3.5rem)] landscape:max-h-[calc(100dvh-3.5rem)] sm:h-[620px] sm:max-h-[620px] my-auto rounded-[2px] border border-border bg-background text-foreground shadow-2xl flex flex-col select-none relative overflow-hidden p-3 sm:p-5 gap-2.5 sm:gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: Breadcrumb Title Input + Return Button */}
        <div className="flex items-center justify-between border-b border-border/60 pb-2 sm:pb-3 gap-2 sm:gap-3 shrink-0">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <span className="text-xs font-sans font-bold tracking-widest uppercase text-muted-foreground shrink-0">
              Session
            </span>
            <span className="text-muted-foreground/40 font-sans text-xs">/</span>
            <input
              type="text"
              data-modal-input="true"
              value={title}
              onChange={(e) => {
                const val = e.target.value;
                setTitle(val);
                useTypingStore.getState().setManifest({ title: val });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  window.getSelection()?.removeAllRanges();
                }
              }}
              placeholder="Untitled Project"
              onBlur={() => {
                if (!title.trim()) {
                  const fallback = 'Untitled Project';
                  setTitle(fallback);
                  useTypingStore.getState().setManifest({ title: fallback });
                }
              }}
              className="bg-transparent text-sm font-sans font-semibold tracking-wide text-foreground border-b border-dashed border-border/80 hover:border-foreground focus:border-foreground focus:outline-none px-1 py-0.5 w-full max-w-[240px] sm:max-w-[340px] truncate transition-colors cursor-text"
              title="Click to edit document title"
            />
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1 px-2 py-1 rounded-[2px] text-muted-foreground hover:text-foreground hover:bg-muted border border-border/60 transition-colors cursor-pointer text-xs"
            title="Return to writing in aperture"
          >
            <CornerUpLeft className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline font-sans text-xs font-semibold">Return</span>
          </button>
        </div>

        {/* Overview Banner & Top Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 sm:p-3 border border-border/70 bg-muted/25 rounded-[2px] shrink-0 gap-2.5">
          <div className="flex items-center gap-3 sm:gap-4 shrink-0">
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
                {totalWords.toLocaleString()}
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
                    useTypingStore.getState().setManifest({ sessionWordTarget: val > 0 ? val : undefined });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      window.getSelection()?.removeAllRanges();
                    }
                  }}
                  className="w-16 sm:w-20 px-1.5 py-0.5 text-xs font-mono font-bold text-right rounded-[2px] border border-border/80 bg-background text-foreground focus:outline-hidden focus:border-primary"
                  title="Target words per session (enter 0 or clear to turn off)"
                />
                {sessionWordTarget && sessionWordTarget > 0 ? (
                  <button
                    type="button"
                    onClick={() => useTypingStore.getState().setManifest({ sessionWordTarget: undefined })}
                    className="text-[10px] text-muted-foreground hover:text-foreground cursor-pointer underline shrink-0"
                    title="Turn off target"
                  >
                    Off
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {/* View Mode Segmented Switch */}
            <div className="flex items-center border border-border/80 rounded-[2px] bg-background/50 p-0.5 text-[11px] font-sans">
              <button
                type="button"
                onClick={() => setViewMode('typewriter')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-[1px] transition-colors cursor-pointer ${
                  viewMode === 'typewriter'
                    ? 'bg-muted text-foreground font-semibold shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Typewriter Monospace View"
              >
                <Type className="w-3 h-3" />
                <span>Typewriter</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('manuscript')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-[1px] transition-colors cursor-pointer ${
                  viewMode === 'manuscript'
                    ? 'bg-muted text-foreground font-semibold shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Publisher Manuscript Serif View"
              >
                <BookOpen className="w-3 h-3" />
                <span>Manuscript</span>
              </button>
            </div>

            {/* Double-space Toggle */}
            <button
              type="button"
              onClick={() => {
                const isDouble = manifest.doubleSpaceLinebreaks ?? false;
                useTypingStore.getState().setManifest({ doubleSpaceLinebreaks: !isDouble });
              }}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-[2px] border transition-colors cursor-pointer text-[clamp(10px,0.8em,12px)] font-sans ${
                manifest.doubleSpaceLinebreaks
                  ? 'bg-primary/10 border-primary text-foreground font-medium'
                  : 'border-border/80 bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground'
              }`}
              title="Double-space paragraphs in preview and export"
            >
              <span
                className={`w-1.5 h-1.5 rounded-[0.5px] ${
                  manifest.doubleSpaceLinebreaks ? 'bg-primary' : 'bg-muted-foreground/50'
                }`}
              />
              <span>Double-space</span>
            </button>

            {/* Expand / Collapse All */}
            <button
              type="button"
              onClick={handleToggleAllCollapse}
              className="flex items-center gap-1 px-2 py-1 rounded-[2px] border border-border/80 bg-muted/40 hover:bg-muted text-foreground transition-all cursor-pointer text-[clamp(10px,0.8em,12px)] font-sans"
              title={allCollapsed ? 'Expand all sessions' : 'Collapse all sessions'}
            >
              {allCollapsed ? <ChevronsUpDown className="w-3 h-3" /> : <ChevronsDownUp className="w-3 h-3" />}
              <span>{allCollapsed ? 'Expand All' : 'Collapse All'}</span>
            </button>

            {/* Export .txt */}
            <button
              type="button"
              onClick={handleDownloadTxt}
              disabled={sanitizedFullText.length === 0}
              className="flex items-center gap-1 p-1.5 sm:px-2.5 sm:py-1 rounded-[2px] border border-border/80 bg-muted/40 hover:bg-muted text-foreground transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-xs"
              title="Export clean .txt file"
              aria-label="Export clean .txt"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export</span>
            </button>

            {/* Print */}
            <button
              type="button"
              onClick={handleBrowserPrint}
              disabled={sanitizedFullText.length === 0}
              className="p-1.5 rounded-[2px] border border-border/80 bg-muted/40 hover:bg-muted text-foreground transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="Print document"
              aria-label="Print document"
            >
              <Printer className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Chronological Stream of Collapsible Session Cards */}
        <div
          ref={scrollContainerRef}
          style={{ overflowAnchor: 'none' }}
          className="flex-1 min-h-0 overflow-y-auto square-scrollbar border border-border/80 bg-card text-card-foreground p-2 sm:p-3 space-y-2.5 rounded-[2px] [overflow-anchor:none]"
        >
          {resolvedSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 p-4 text-center gap-2 text-muted-foreground font-mono">
              <span className="text-xs italic">No sessions recorded yet for this project.</span>
            </div>
          ) : (
            resolvedSessions.map((session, index) => {
              const isLatest = index === resolvedSessions.length - 1;
              const isActive = isLatest && !session.completedAt;
              const isTargetMet = isActive
                ? Boolean(sessionWordTarget && sessionWordTarget > 0 && session.wordCount >= sessionWordTarget)
                : Boolean(session.targetReached);

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

              const isCollapsed = Boolean(collapsedSessionIds[session.id]);
              const sessionText = session.text || '';

              return (
                <div
                  key={session.id}
                  data-session-card="true"
                  className={`border rounded-[2px] transition-all duration-200 overflow-hidden ${
                    isActive && isPulsingActive
                      ? 'border-primary bg-primary/15 shadow-xs'
                      : 'border-border/70 bg-background/80'
                  }`}
                >
                  {/* Card Header: Clickable to toggle collapse */}
                  <div
                    onClick={() => toggleSessionCollapse(session.id)}
                    className="flex items-center justify-between p-2 sm:p-2.5 bg-muted/30 hover:bg-muted/50 cursor-pointer text-xs font-mono select-none gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground shrink-0"
                        title={isCollapsed ? 'Expand session' : 'Collapse session'}
                      >
                        {isCollapsed ? (
                          <ChevronRight className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <span className="font-bold text-foreground shrink-0">
                        Session {session.sessionNumber}
                      </span>
                      <span className="text-muted-foreground/60 hidden sm:inline">|</span>
                      <span className="text-muted-foreground text-[11px] truncate">
                        {timeRange}
                      </span>
                      {isActive && (
                        <span className="flex items-center gap-1 text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 rounded-[2px] shrink-0 font-sans ml-1">
                          <Sparkles className="w-2.5 h-2.5" />
                          <span>Active</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-right text-[11px] sm:text-xs ${
                          isTargetMet
                            ? 'font-bold text-foreground'
                            : 'font-medium text-muted-foreground'
                        }`}
                      >
                        {session.wordCount.toLocaleString()} words
                      </span>

                      {/* Copy Session Text Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopySessionText(session.id, sessionText);
                        }}
                        className="p-1 rounded-[2px] border border-border/60 hover:bg-background text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        title="Copy session text"
                      >
                        {copiedSessionId === session.id ? (
                          <Check className="w-3 h-3 text-emerald-500" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>

                      {/* Delete Session Button (only if more than 1 session or inactive) */}
                      {resolvedSessions.length > 1 && (
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (window.confirm(`Delete Session ${session.sessionNumber}?`)) {
                              await useTypingStore.getState().deleteSession(session.id);
                            }
                          }}
                          className="p-1 rounded-[2px] border border-border/60 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                          title="Delete session"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Card Body: Manuscript text preview when expanded */}
                  {!isCollapsed && (
                    <div className="p-3 sm:p-4 border-t border-border/40 bg-card select-text">
                      <div
                        className={`whitespace-pre-wrap ${
                          viewMode === 'typewriter'
                            ? 'font-mono text-xs sm:text-sm leading-relaxed'
                            : 'font-serif-clock text-sm sm:text-base leading-relaxed indent-8'
                        }`}
                      >
                        {sessionText.length > 0 ? (
                          sessionText
                        ) : (
                          <span className="text-muted-foreground/40 italic font-mono text-xs">
                            No text in this session.
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Bottom Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/60 text-xs font-sans shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleStartNewSession}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[2px] border border-primary bg-primary text-primary-foreground font-semibold shadow-xs hover:opacity-90 transition-opacity cursor-pointer text-xs"
              title="Start a new drafting session"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Start New Session</span>
            </button>

            <button
              type="button"
              onClick={handleCloseActiveSession}
              disabled={!hasActiveSession}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[2px] border border-border/80 bg-muted/40 hover:bg-muted text-foreground transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium"
              title="Complete and close active drafting session"
            >
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
              <span>Close Session</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[clamp(11px,0.85em,13px)] text-muted-foreground font-mono">
              {totalWords.toLocaleString()} words total
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
