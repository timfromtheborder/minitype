'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { PageRecord, ManuscriptManifest, SessionRecord } from '@/types';
import { sanitizeManuscript } from '@/lib/sanitize';
import { useTypingStore } from '@/stores/typingStore';
import {
  CornerUpLeft,
  Plus,
  CheckCircle,
  BookOpen,
  FileText,
  ChevronRight,
} from 'lucide-react';
import { CompileModal } from './CompileModal';
import {
  countWords,
  resolveActiveSessionStats,
  getActiveSessionText,
} from '@/lib/projectSerializer';
import { formatSessionDateTime } from './ProjectSessionsTab';

// Persist scroll position per document ID while in memory across modal reopens
const documentScrollPositions = new Map<string, number>();

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
  const [sanitizedFullText, setSanitizedFullText] = useState<string>(() => {
    const allPages = propPages || [
      ...storeHistoricalPages,
      {
        pageNumber: storeCurrentPageNumber,
        lines: storeCurrentPageLines,
        completedAt: null,
      },
    ];
    return sanitizeManuscript(allPages, {
      doubleSpaceLinebreaks: false,
      pageMode: manifest.pageMode,
    });
  });
  const [isPulsingActive, setIsPulsingActive] = useState<boolean>(false);
  const [justClosedSessionId, setJustClosedSessionId] = useState<string | null>(null);
  const [expandedSessionIds, setExpandedSessionIds] = useState<Set<string>>(() => new Set());
  const [isCollapsedActive, setIsCollapsedActive] = useState<boolean>(false);
  const [isCompileOpen, setIsCompileOpen] = useState<boolean>(false);
  const [isConfirmingCloseCompile, setIsConfirmingCloseCompile] = useState<boolean>(false);
  const isConfirmingCloseCompileRef = useRef<boolean>(false);
  useEffect(() => {
    isConfirmingCloseCompileRef.current = isConfirmingCloseCompile;
  }, [isConfirmingCloseCompile]);

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
        setExpandedSessionIds(new Set());
        setIsCollapsedActive(false);
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
      setIsConfirmingCloseCompile(false);
      setIsCompileOpen(false);
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

  // Restore scroll position specifically for the currently open document
  useEffect(() => {
    if (isOpen && scrollContainerRef.current && manifest.id) {
      const savedPos = documentScrollPositions.get(manifest.id) ?? 0;
      scrollContainerRef.current.scrollTop = savedPos;
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = savedPos;
        }
      });
    }
  }, [isOpen, manifest.id]);

  // Focus trap & Escape key listener
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      modalRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isConfirmingCloseCompileRef.current) {
          setIsConfirmingCloseCompile(false);
          return;
        }
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
          if (document.activeElement === firstEl || document.activeElement === modalRef.current) {
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
  const isSpotlight = manifest.colorScheme === 'spotlight';

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

  // Separate completed historical sessions from the active in-progress drafting session
  const completedSessions = useMemo(() => {
    return resolvedSessions.filter((s, idx) => {
      const isLatest = idx === resolvedSessions.length - 1;
      return !(isLatest && !s.completedAt);
    });
  }, [resolvedSessions]);

  const reversedCompletedSessions = useMemo(() => {
    return [...completedSessions].reverse();
  }, [completedSessions]);

  const activeSession = useMemo(() => {
    if (resolvedSessions.length === 0) return null;
    const latest = resolvedSessions[resolvedSessions.length - 1];
    return !latest.completedAt ? latest : null;
  }, [resolvedSessions]);

  const toggleSessionExpanded = (sessionId: string) => {
    setExpandedSessionIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  };

  if (!isOpen) return null;

  const handleStartNewSession = async () => {
    if (activeSession && activeSession.wordCount === 0) {
      setIsPulsingActive(true);
      setTimeout(() => setIsPulsingActive(false), 600);
    }
    const archivingSessionId =
      activeSession && (activeSession.wordCount > 0 || activeSession.text.trim().length > 0)
        ? activeSession.id
        : null;

    if (archivingSessionId) {
      setJustClosedSessionId(archivingSessionId);
      setTimeout(() => setJustClosedSessionId(null), 320);
    }

    await useTypingStore.getState().startNewSession();
    setTimeout(() => {
      if (scrollContainerRef.current) {
        if (typeof scrollContainerRef.current.scrollTo === 'function') {
          scrollContainerRef.current.scrollTo({
            top: 0,
            behavior: 'smooth',
          });
        } else {
          scrollContainerRef.current.scrollTop = 0;
        }
      }
    }, 100);
  };

  const handleCloseActiveSession = async () => {
    setIsConfirmingCloseCompile(false);
    if (activeSession) {
      setJustClosedSessionId(activeSession.id);
      setTimeout(() => setJustClosedSessionId(null), 320);
    }
    await useTypingStore.getState().closeActiveSession();
  };

  const hasActiveSession = Boolean(activeSession);
  const hasActiveDraftedText = Boolean(activeSession && activeSession.wordCount > 0);

  const handleCompileClick = () => {
    if (hasActiveDraftedText) {
      setIsConfirmingCloseCompile(true);
    } else {
      setIsCompileOpen(true);
    }
  };

  const handleConfirmCloseAndCompile = async () => {
    setIsConfirmingCloseCompile(false);
    if (activeSession) {
      setJustClosedSessionId(activeSession.id);
      setTimeout(() => setJustClosedSessionId(null), 320);
    }
    await useTypingStore.getState().closeActiveSession();
    setIsCompileOpen(true);
  };

  const handleModalClose = () => {
    setIsConfirmingCloseCompile(false);
    setIsCompileOpen(false);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Document"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(3.5rem,56px)] px-2 sm:p-4 sm:pb-16 animate-in fade-in duration-75"
      onClick={handleModalClose}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="w-full max-w-3xl h-[calc(100dvh-max(5.5rem,72px)-env(safe-area-inset-top))] max-h-[calc(100dvh-max(5.5rem,72px)-env(safe-area-inset-top))] landscape:h-[calc(100dvh-max(4.5rem,68px))] landscape:max-h-[calc(100dvh-max(4.5rem,68px))] sm:h-[620px] sm:max-h-[calc(100dvh-max(5.5rem,72px))] my-auto rounded-[2px] border border-border bg-background text-foreground shadow-2xl flex flex-col select-none relative overflow-hidden p-3 sm:p-5 gap-2.5 sm:gap-3 focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: Breadcrumb Title Input + Return Button */}
        <div className="flex items-center justify-between border-b border-border/60 pb-2 sm:pb-3 gap-2 sm:gap-3 shrink-0">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-xs font-sans font-bold tracking-widest uppercase text-muted-foreground shrink-0">
              Document
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
              aria-label="Click to edit document title"
            />
          </div>

          <button
            type="button"
            onClick={handleModalClose}
            className="flex items-center gap-1 px-2 py-1 rounded-[2px] text-muted-foreground hover:text-foreground hover:bg-muted border border-border/60 transition-colors cursor-pointer touch-manipulation text-xs"
            aria-label="Return to writing in aperture"
          >
            <CornerUpLeft className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline font-sans text-xs font-semibold">Return</span>
          </button>
        </div>

        {/* Overview Banner: Clean single row */}
        <div className="flex items-center justify-between p-2.5 sm:p-3 border border-border/70 bg-muted/25 rounded-[2px] shrink-0">
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
            {manifest.sessionWordTarget && manifest.sessionWordTarget > 0 ? (
              <div className="border-l border-border/60 pl-3">
                <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                  Target
                </div>
                <div className="text-xs sm:text-sm font-mono font-bold text-muted-foreground">
                  {manifest.sessionWordTarget}w
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Chronological Stream of Collapsible File-Folder Sessions */}
        <div
          ref={scrollContainerRef}
          onScroll={(e) => {
            if (manifest.id) {
              documentScrollPositions.set(manifest.id, e.currentTarget.scrollTop);
            }
          }}
          style={{ overflowAnchor: 'none' }}
          className="flex-1 min-h-0 overflow-y-auto square-scrollbar border border-border/80 bg-muted/15 text-foreground p-2 sm:p-3 space-y-2 rounded-[2px] [overflow-anchor:none]"
        >
          {completedSessions.length === 0 && !activeSession ? (
            <div className="flex flex-col items-center justify-center h-48 p-4 text-center gap-2 text-muted-foreground font-mono">
              <span className="text-xs italic">No sessions recorded yet for this project.</span>
            </div>
          ) : (
            <>
              {/* Active Session Demarcation Folder (Newest Session at Top) */}
              {activeSession && (() => {
                const isActiveTargetMet = Boolean(
                  sessionWordTarget && sessionWordTarget > 0 && activeSession.wordCount >= sessionWordTarget
                );
                const isActiveExpanded = !isCollapsedActive;

                return (
                  <div
                    data-session-card="true"
                    data-session-folder="true"
                    data-active-session="true"
                    className={`border border-primary/40 rounded-[2px] overflow-hidden ${
                      isSpotlight ? 'bg-zinc-900/90' : 'bg-card'
                    } transition-all ${
                      isPulsingActive ? 'ring-1 ring-primary/50' : ''
                    }`}
                  >
                    {/* Active Folder Tab Header Button */}
                    <button
                      type="button"
                      onClick={() => setIsCollapsedActive(!isCollapsedActive)}
                      aria-expanded={isActiveExpanded}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-mono select-none cursor-pointer transition-colors text-left ${
                        isActiveExpanded
                          ? 'bg-primary/[0.08] border-b border-primary/30 text-foreground'
                          : 'bg-primary/[0.04] hover:bg-primary/[0.08] text-foreground/80'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <ChevronRight
                          className={`w-3.5 h-3.5 shrink-0 text-primary/80 transition-transform duration-150 ${
                            isActiveExpanded ? 'rotate-90' : ''
                          }`}
                        />
                        <span className="font-semibold text-foreground shrink-0">
                          #{activeSession.sessionNumber}
                        </span>
                        <span className="text-muted-foreground/40 shrink-0">•</span>
                        <span className="truncate text-muted-foreground text-[11px]">
                          {formatSessionDateTime(activeSession.startedAt)} - Present
                        </span>
                      </div>
                      <span
                        className={`shrink-0 text-right text-[11px] ${
                          isActiveTargetMet
                            ? 'font-bold text-foreground'
                            : 'font-medium text-muted-foreground'
                        }`}
                      >
                        {activeSession.wordCount.toLocaleString()} words
                      </span>
                    </button>

                    {/* Active Folder Body */}
                    {isActiveExpanded && (
                      <div
                        className={`p-2.5 sm:p-3 border-l-2 border-primary/50 ${
                          isSpotlight ? 'bg-white text-zinc-950' : 'bg-card text-card-foreground/90'
                        }`}
                      >
                        <div
                          className={`whitespace-pre-wrap select-text font-mono text-xs sm:text-sm leading-[1.0] tracking-[-0.1em] ${
                            isSpotlight ? 'text-zinc-950' : 'text-card-foreground/90'
                          }`}
                        >
                          {activeSession.text.length === 0 ? (
                            <span className={isSpotlight ? 'text-zinc-400 italic' : 'text-muted-foreground/40 italic'}>
                              No text in this active session yet.
                            </span>
                          ) : (
                            activeSession.text
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Completed Historical Sessions (Newest to Oldest) */}
              {reversedCompletedSessions.map((session) => {
                const isJustClosed = session.id === justClosedSessionId;
                const isExpanded = expandedSessionIds.has(session.id);
                const isTargetMet = Boolean(session.targetReached);
                let timeRange: string;
                if (session.isImported) {
                  const dt = formatSessionDateTime(session.importedAt || session.startedAt);
                  timeRange = `${dt} [imported]`;
                } else if (session.completedAt) {
                  timeRange = `${formatSessionDateTime(session.startedAt)} - ${formatSessionDateTime(session.completedAt)}`;
                } else {
                  timeRange = formatSessionDateTime(session.startedAt);
                }

                const sessionText = session.text || '';

                return (
                  <div
                    key={session.id}
                    data-session-card="true"
                    data-session-folder="true"
                    className={`border rounded-[2px] overflow-hidden ${
                      isSpotlight ? 'bg-zinc-900/90' : 'bg-card'
                    } ${
                      isJustClosed
                        ? 'animate-archive-flash'
                        : 'border-border/70'
                    }`}
                  >
                    {/* Folder Tab Header Button */}
                    <button
                      type="button"
                      onClick={() => toggleSessionExpanded(session.id)}
                      aria-expanded={isExpanded}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-mono select-none cursor-pointer transition-colors text-left ${
                        isExpanded
                          ? 'bg-muted/40 border-b border-border/60 text-foreground'
                          : 'bg-muted/20 hover:bg-muted/35 text-foreground/80'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <ChevronRight
                          className={`w-3.5 h-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ${
                            isExpanded ? 'rotate-90' : ''
                          }`}
                        />
                        <span className="font-semibold text-foreground shrink-0">
                          #{session.sessionNumber}
                        </span>
                        <span className="text-muted-foreground/40 shrink-0">•</span>
                        <span className="truncate text-muted-foreground text-[11px]">
                          {timeRange}
                        </span>
                      </div>
                      <span
                        className={`shrink-0 text-right text-[11px] ${
                          isTargetMet
                            ? 'font-bold text-foreground'
                            : 'font-medium text-muted-foreground'
                        }`}
                      >
                        {session.wordCount.toLocaleString()} words
                      </span>
                    </button>

                    {/* Collapsible Folder Body */}
                    {isExpanded && (
                      <div
                        className={`p-2.5 sm:p-3 ${
                          isSpotlight ? 'bg-white text-zinc-950' : 'bg-card'
                        }`}
                      >
                        <div
                          className={`whitespace-pre-wrap select-text font-mono text-xs sm:text-sm leading-[1.0] tracking-[-0.1em] ${
                            isSpotlight ? 'text-zinc-950' : 'text-card-foreground/85'
                          }`}
                        >
                          {sessionText.length === 0 ? (
                            <span className={isSpotlight ? 'text-zinc-400 italic' : 'text-muted-foreground/40 italic'}>
                              No text in this session.
                            </span>
                          ) : (
                            sessionText
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Bottom Action Bar */}
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 pt-2 border-t border-border/60 text-xs font-sans shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleStartNewSession}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[2px] border border-primary bg-primary text-primary-foreground font-semibold shadow-xs hover:opacity-90 transition-opacity cursor-pointer text-xs"
              aria-label="Start a new drafting session"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Start New Session</span>
            </button>

            <button
              type="button"
              onClick={handleCloseActiveSession}
              disabled={!hasActiveSession}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[2px] border border-border/80 bg-muted/40 hover:bg-muted text-foreground transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium"
              aria-label="Complete and close active drafting session"
            >
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
              <span>Close Session</span>
            </button>
          </div>

          {isConfirmingCloseCompile ? (
            <div className="flex items-center gap-1.5 animate-in fade-in duration-150 shrink-0">
              <button
                type="button"
                onClick={handleConfirmCloseAndCompile}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-[2px] border border-primary bg-primary text-primary-foreground font-semibold shadow-xs hover:opacity-90 transition-all cursor-pointer text-xs shrink-0"
                aria-label="Close active drafting session and compile"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Close active session and compile</span>
              </button>
              <button
                type="button"
                onClick={() => setIsConfirmingCloseCompile(false)}
                className="px-2 py-1.5 rounded-[2px] border border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer text-xs"
                aria-label="Cancel"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleCompileClick}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[2px] border border-border/80 bg-muted/40 hover:bg-muted hover:border-foreground/40 text-foreground transition-colors cursor-pointer text-xs font-medium shrink-0"
              aria-label="Compile manuscript view"
            >
              <BookOpen className="w-3.5 h-3.5 opacity-70" />
              <span>Compile</span>
            </button>
          )}
        </div>

        {/* Compile Modal: Manuscript View */}
        <CompileModal
          isOpen={isCompileOpen}
          onClose={() => setIsCompileOpen(false)}
          onCloseAll={handleModalClose}
          pages={propPages}
          manifest={manifest}
        />
      </div>
    </div>
  );
};
