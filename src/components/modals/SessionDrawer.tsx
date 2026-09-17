'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { PageRecord, ManuscriptManifest, SessionRecord } from '@/types';
import { sanitizeManuscript } from '@/lib/sanitize';
import { useTypingStore } from '@/stores/typingStore';
import {
  CornerUpLeft,
  Plus,
  CheckCircle,
  Sparkles,
  Type,
  BookOpen,
  Lock,
  Download,
  FileText,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
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
  const viewMode = manifest.documentViewMode || 'typewriter';
  const showDividers = manifest.showSessionDividers !== false;
  const [isPulsingActive, setIsPulsingActive] = useState<boolean>(false);
  const [isConfirmingCloseExport, setIsConfirmingCloseExport] = useState<boolean>(false);
  const isConfirmingCloseExportRef = useRef<boolean>(false);
  useEffect(() => {
    isConfirmingCloseExportRef.current = isConfirmingCloseExport;
  }, [isConfirmingCloseExport]);

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
      setIsConfirmingCloseExport(false);
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
        if (isConfirmingCloseExportRef.current) {
          setIsConfirmingCloseExport(false);
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

  const activeSession = useMemo(() => {
    if (resolvedSessions.length === 0) return null;
    const latest = resolvedSessions[resolvedSessions.length - 1];
    return !latest.completedAt ? latest : null;
  }, [resolvedSessions]);

  if (!isOpen) return null;

  const handleStartNewSession = async () => {
    if (activeSession && activeSession.wordCount === 0) {
      setIsPulsingActive(true);
      setTimeout(() => setIsPulsingActive(false), 600);
    }
    await useTypingStore.getState().startNewSession();
    setTimeout(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({
          top: scrollContainerRef.current.scrollHeight,
          behavior: 'smooth',
        });
      }
    }, 100);
  };

  const handleCloseActiveSession = async () => {
    setIsConfirmingCloseExport(false);
    await useTypingStore.getState().closeActiveSession();
  };

  const hasActiveSession = Boolean(activeSession);
  const hasActiveDraftedText = Boolean(activeSession && activeSession.wordCount > 0);

  const downloadPlainText = (textToExport: string) => {
    const safeTitle = (title.trim() || 'manuscript').replace(/[/\\?%*:|"<>]/g, '-');
    const blob = new Blob([textToExport], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeTitle}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const executeExport = async (shouldCloseSession: boolean) => {
    setIsConfirmingCloseExport(false);
    if (shouldCloseSession) {
      await useTypingStore.getState().closeActiveSession();
    }
    const state = useTypingStore.getState();
    const allPages = propPages ?? [
      ...state.historicalPages,
      {
        pageNumber: state.currentPageNumber,
        lines: state.currentPageLines,
        completedAt: null,
      },
    ];
    const latestClean = sanitizeManuscript(allPages, {
      doubleSpaceLinebreaks: state.manifest.doubleSpaceLinebreaks,
      pageMode: state.manifest.pageMode,
    });
    downloadPlainText(latestClean);
  };

  const handleExportClick = () => {
    if (hasActiveDraftedText) {
      setIsConfirmingCloseExport(true);
    } else {
      executeExport(false);
    }
  };

  const handleConfirmCloseAndExport = async () => {
    await executeExport(true);
  };

  const handleModalClose = () => {
    setIsConfirmingCloseExport(false);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Document"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 pb-[max(3.5rem,56px)] sm:p-4 sm:pb-16 animate-in fade-in duration-75"
      onClick={handleModalClose}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="w-full max-w-3xl h-[calc(100dvh-max(5.5rem,72px))] max-h-[calc(100dvh-max(5.5rem,72px))] landscape:h-[calc(100dvh-max(4.5rem,68px))] landscape:max-h-[calc(100dvh-max(4.5rem,68px))] sm:h-[620px] sm:max-h-[calc(100dvh-max(5.5rem,72px))] my-auto rounded-[2px] border border-border bg-background text-foreground shadow-2xl flex flex-col select-none relative overflow-hidden p-3 sm:p-5 gap-2.5 sm:gap-3 focus:outline-none"
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
              title="Click to edit document title"
            />
          </div>

          <button
            type="button"
            onClick={handleModalClose}
            className="flex items-center gap-1 px-2 py-1 rounded-[2px] text-muted-foreground hover:text-foreground hover:bg-muted border border-border/60 transition-colors cursor-pointer touch-manipulation text-xs"
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
                <div className="h-[26px] flex items-center rounded-[2px] border border-border/80 bg-background focus-within:border-primary transition-colors overflow-hidden">
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
                    className="w-14 sm:w-16 h-full px-1.5 text-xs font-mono font-bold text-right bg-transparent text-foreground focus:outline-hidden [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    title="Target words per session (enter 0 or clear to turn off)"
                  />
                  <div className="flex flex-col h-full border-l border-border/80 divide-y divide-border/60 shrink-0 w-4 sm:w-4.5 bg-muted/20">
                    <button
                      type="button"
                      onClick={() => {
                        const current = sessionWordTarget ?? 0;
                        const next = Math.min(99999, Math.floor(current / 50) * 50 + 50);
                        useTypingStore.getState().setManifest({ sessionWordTarget: next });
                      }}
                      className="flex-1 flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer select-none"
                      title="Increment target by 50"
                      aria-label="Increment target"
                    >
                      <ChevronUp className="w-2.5 h-2.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const current = sessionWordTarget ?? 0;
                        if (current <= 50) {
                          useTypingStore.getState().setManifest({ sessionWordTarget: undefined });
                        } else {
                          const next = Math.max(50, Math.ceil(current / 50) * 50 - 50);
                          useTypingStore.getState().setManifest({ sessionWordTarget: next });
                        }
                      }}
                      className="flex-1 flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer select-none"
                      title="Decrement target by 50"
                      aria-label="Decrement target"
                    >
                      <ChevronDown className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>
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
            {/* View Mode Toggle Switch (Icons only; tapping anywhere on the box toggles) */}
            <button
              type="button"
              onClick={() => {
                const nextMode = viewMode === 'manuscript' ? 'typewriter' : 'manuscript';
                useTypingStore.getState().setManifest({ documentViewMode: nextMode });
              }}
              className="h-[28px] flex items-center border border-border/80 rounded-[2px] bg-background/50 p-0.5 cursor-pointer hover:border-foreground/40 transition-colors text-[11px] font-sans shrink-0 select-none"
              title={`Switch to ${viewMode === 'manuscript' ? 'Typewriter Monospace' : 'Publisher Manuscript Serif'} View`}
              aria-label={`Toggle document view: ${viewMode === 'manuscript' ? 'Manuscript (Publisher Serif)' : 'Typewriter (Monospace)'}`}
            >
              <span
                className={`h-full flex items-center justify-center px-1.5 rounded-[1px] transition-colors pointer-events-none ${
                  viewMode === 'typewriter'
                    ? 'bg-muted text-foreground font-semibold shadow-2xs'
                    : 'text-muted-foreground'
                }`}
                title="Typewriter Monospace View"
              >
                <Type className="w-3.5 h-3.5" />
              </span>
              <span
                className={`h-full flex items-center justify-center px-1.5 rounded-[1px] transition-colors pointer-events-none ${
                  viewMode === 'manuscript'
                    ? 'bg-muted text-foreground font-semibold shadow-2xs'
                    : 'text-muted-foreground'
                }`}
                title="Publisher Manuscript Serif View"
              >
                <BookOpen className="w-3.5 h-3.5" />
              </span>
            </button>

            {/* Show Sessions Toggle */}
            <button
              type="button"
              onClick={() => {
                useTypingStore.getState().setManifest({ showSessionDividers: !showDividers });
              }}
              className={`h-[28px] flex items-center gap-1.5 px-2 rounded-[2px] border transition-colors cursor-pointer text-[clamp(10px,0.8em,12px)] font-sans shrink-0 ${
                showDividers
                  ? 'bg-primary/10 border-primary text-foreground font-medium'
                  : 'border-border/80 bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground'
              }`}
              title={showDividers ? 'Hide sessions' : 'Show sessions'}
            >
              <span
                className={`w-1.5 h-1.5 rounded-[0.5px] ${
                  showDividers ? 'bg-primary' : 'bg-muted-foreground/50'
                }`}
              />
              <span>Show Sessions</span>
            </button>

            {/* Double-space Toggle */}
            <button
              type="button"
              onClick={() => {
                const isDouble = manifest.doubleSpaceLinebreaks ?? false;
                useTypingStore.getState().setManifest({ doubleSpaceLinebreaks: !isDouble });
              }}
              className={`h-[28px] flex items-center gap-1.5 px-2 rounded-[2px] border transition-colors cursor-pointer text-[clamp(10px,0.8em,12px)] font-sans shrink-0 ${
                manifest.doubleSpaceLinebreaks
                  ? 'bg-primary/10 border-primary text-foreground font-medium'
                  : 'border-border/80 bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground'
              }`}
              title="Double-space paragraphs in preview"
            >
              <span
                className={`w-1.5 h-1.5 rounded-[0.5px] ${
                  manifest.doubleSpaceLinebreaks ? 'bg-primary' : 'bg-muted-foreground/50'
                }`}
              />
              <span>Double-space</span>
            </button>
          </div>
        </div>

        {/* Chronological Stream of Permanently Expanded Contiguous Sessions */}
        <div
          ref={scrollContainerRef}
          onScroll={(e) => {
            if (manifest.id) {
              documentScrollPositions.set(manifest.id, e.currentTarget.scrollTop);
            }
          }}
          style={{ overflowAnchor: 'none' }}
          className="flex-1 min-h-0 overflow-y-auto square-scrollbar border border-border/80 bg-card text-card-foreground p-3 sm:p-5 space-y-3 rounded-[2px] [overflow-anchor:none]"
        >
          {completedSessions.length === 0 && !activeSession ? (
            <div className="flex flex-col items-center justify-center h-48 p-4 text-center gap-2 text-muted-foreground font-mono">
              <span className="text-xs italic">No sessions recorded yet for this project.</span>
            </div>
          ) : (
            <>
              {/* Completed Historical Sessions */}
              {completedSessions.map((session) => {
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
                  <div key={session.id} data-session-card="true">
                    {/* Nested In-line Header Divider in Small Faded Text */}
                    {showDividers && (
                      <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-mono text-card-foreground/50 select-none py-1 mb-1.5 overflow-hidden">
                        <span className="shrink-0 opacity-40 select-none">-----</span>
                        <span className="font-semibold text-card-foreground/85 shrink-0 select-none">
                          Session {session.sessionNumber}
                        </span>
                        <span className="shrink-0 opacity-40 select-none">---</span>
                        <span className="shrink-0 truncate text-card-foreground/65 select-none">
                          {timeRange}
                        </span>
                        <div className="flex-1 min-w-4 border-t border-dashed border-card-foreground/20 self-center mx-1" />
                        <span
                          className={`shrink-0 text-right text-[10px] sm:text-[11px] ${
                            isTargetMet
                              ? 'font-bold text-card-foreground'
                              : 'font-medium text-card-foreground/65'
                          }`}
                        >
                          {session.wordCount.toLocaleString()} words
                        </span>
                        <span className="shrink-0 opacity-40 select-none">-----</span>
                      </div>
                    )}

                    {/* Manuscript Text: Contiguous & Permanently Expanded */}
                    <div
                      className={`whitespace-pre-wrap select-text py-0.5 ${
                        viewMode === 'typewriter'
                          ? 'font-mono text-xs sm:text-sm leading-relaxed'
                          : 'font-manuscript-serif text-sm sm:text-base leading-relaxed'
                      }`}
                    >
                      {sessionText.length === 0 ? (
                        <span className="text-muted-foreground/40 italic font-mono text-xs">
                          No text in this session.
                        </span>
                      ) : viewMode === 'manuscript' ? (
                        sessionText.split('\n').map((para, pIdx) =>
                          para.length === 0 ? (
                            <div key={pIdx} className="h-3 sm:h-4" />
                          ) : (
                            <p key={pIdx} className="indent-8 leading-relaxed mb-0">
                              {para}
                            </p>
                          )
                        )
                      ) : (
                        sessionText
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Active Session Demarcation Card */}
              {activeSession && (
                <div
                  data-session-card="true"
                  data-active-session="true"
                  className={`border border-card-foreground/15 bg-card-foreground/5 rounded-[2px] p-3.5 sm:p-4 text-center select-none shadow-2xs transition-all duration-200 ${
                    completedSessions.length > 0 ? 'mt-6' : 'mt-2'
                  } ${isPulsingActive ? 'bg-card-foreground/12 ring-1 ring-card-foreground/30' : ''}`}
                >
                  {(() => {
                    const isActiveTargetMet = Boolean(
                      sessionWordTarget && sessionWordTarget > 0 && activeSession.wordCount >= sessionWordTarget
                    );
                    return (
                      <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-mono text-card-foreground/50 select-none py-1 mb-2 overflow-hidden">
                        <span className="shrink-0 opacity-40 select-none">-----</span>
                        <span className="font-semibold text-card-foreground/85 shrink-0 select-none">
                          Session {activeSession.sessionNumber}
                        </span>
                        <span className="shrink-0 opacity-40 select-none">---</span>
                        <span className="shrink-0 truncate text-card-foreground/65 select-none">
                          {formatSessionDateTime(activeSession.startedAt)} - Present
                        </span>
                        <span className="flex items-center gap-1 text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 rounded-[1px] shrink-0 font-sans ml-1 select-none">
                          <Sparkles className="w-2.5 h-2.5" />
                          <span>Active</span>
                        </span>
                        <div className="flex-1 min-w-4 border-t border-dashed border-card-foreground/20 self-center mx-1" />
                        <span
                          className={`shrink-0 text-right text-[10px] sm:text-[11px] ${
                            isActiveTargetMet
                              ? 'font-bold text-card-foreground'
                              : 'font-medium text-card-foreground/65'
                          }`}
                        >
                          {activeSession.wordCount.toLocaleString()} words
                        </span>
                        <span className="shrink-0 opacity-40 select-none">-----</span>
                      </div>
                    );
                  })()}
                  <div className="flex items-center justify-center gap-2 py-3 px-2 text-xs sm:text-sm font-mono text-card-foreground/75">
                    <Lock className="w-3.5 h-3.5 shrink-0 opacity-70" />
                    <span>
                      [ {activeSession.wordCount.toLocaleString()} {activeSession.wordCount === 1 ? 'word' : 'words'} drafted · Locked until session closed ]
                    </span>
                  </div>
                </div>
              )}
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

          {isConfirmingCloseExport ? (
            <div className="flex items-center gap-1.5 animate-in fade-in duration-150 shrink-0">
              <button
                type="button"
                onClick={handleConfirmCloseAndExport}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-[2px] border border-primary bg-primary text-primary-foreground font-semibold shadow-xs hover:opacity-90 transition-all cursor-pointer text-xs shrink-0"
                title="Close active drafting session and export document"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Close active session and export</span>
              </button>
              <button
                type="button"
                onClick={() => setIsConfirmingCloseExport(false)}
                className="px-2 py-1.5 rounded-[2px] border border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer text-xs"
                title="Cancel"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleExportClick}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[2px] border border-border/80 bg-muted/40 hover:bg-muted hover:border-foreground/40 text-foreground transition-colors cursor-pointer text-xs font-medium shrink-0"
              title="Export document as plaintext (.txt)"
            >
              <Download className="w-3.5 h-3.5 opacity-70" />
              <span>Export Document</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
