import React, { useEffect, useState, useRef } from 'react';
import { PageRecord, ManuscriptManifest } from '@/types';
import { sanitizeManuscript } from '@/lib/sanitize';
import { useTypingStore } from '@/stores/typingStore';
import { ProjectFilesTab } from './ProjectFilesTab';
import { ProjectSessionsTab } from './ProjectSessionsTab';
import {
  Printer,
  Download,
  CornerUpLeft,
  Play,
  FileText,
  FolderOpen,
  Layers,
  Sparkles,
} from 'lucide-react';
import { countWords } from '@/lib/projectSerializer';

interface PrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  pages: PageRecord[];
  manifest: ManuscriptManifest;
  onPrintedComplete?: (printedCharCount: number) => void;
  onClearText?: () => void;
}

// Persist scroll position per document ID while open
const documentScrollPositions = new Map<string, number>();

export const PrintModal: React.FC<PrintModalProps> = ({
  isOpen,
  onClose,
  pages,
  manifest,
  onPrintedComplete,
}) => {
  const [activeTab, setActiveTab] = useState<'document' | 'project' | 'files'>('document');
  const [title, setTitle] = useState<string>(manifest.title || 'Untitled Manuscript');
  const [sanitizedFullText, setSanitizedFullText] = useState<string>('');
  const previewScrollRef = useRef<HTMLDivElement>(null);

  const activeSessions = useTypingStore((state) => state.activeSessions);

  // Sync title and compile manuscript when modal opens or manifest/pages update
  useEffect(() => {
    if (isOpen) {
      setTitle(manifest.title || 'Untitled Manuscript');
      const fullClean = sanitizeManuscript(pages, {
        doubleSpaceLinebreaks: manifest.doubleSpaceLinebreaks,
      });
      setSanitizedFullText(fullClean);
      const computedTotalWords = countWords(fullClean);
      useTypingStore.getState().syncSessionStats(fullClean, computedTotalWords);
    }
  }, [isOpen, manifest.id, manifest.title, manifest.doubleSpaceLinebreaks, pages]);

  // Restore scroll position specifically for the currently open document
  useEffect(() => {
    if (isOpen && activeTab === 'document' && previewScrollRef.current) {
      const savedPos = documentScrollPositions.get(manifest.id) ?? 0;
      previewScrollRef.current.scrollTop = savedPos;
    }
  }, [isOpen, activeTab, manifest.id, sanitizedFullText]);

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
    await useTypingStore.getState().startNewSession();
    onClose();
  };

  const totalWords = countWords(sanitizedFullText);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-2 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl h-[calc(100dvh-5.5rem)] max-h-[calc(100dvh-5.5rem)] landscape:h-[calc(100dvh-3.5rem)] landscape:max-h-[calc(100dvh-3.5rem)] sm:h-[560px] sm:max-h-[560px] my-auto rounded-[2px] border border-border bg-background text-foreground shadow-2xl flex flex-row select-none relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tall and Skinny 3-Tab Rail with Sideways Vertical Text on Left Side (Widened by 10%) */}
        <div className="w-[35px] sm:w-[44px] shrink-0 flex flex-col border-r border-border/60 bg-muted/25 h-full select-none divide-y divide-border/40">
          {/* Tab 1: Document */}
          <button
            type="button"
            onClick={() => setActiveTab('document')}
            className={`flex-1 flex flex-col items-center justify-center py-2 sm:py-3 cursor-pointer transition-colors ${
              activeTab === 'document'
                ? 'bg-background text-foreground font-bold border-r-2 border-r-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            }`}
            title="Document: Full Compiled Manuscript"
          >
            <FileText className="w-3.5 h-3.5 mb-2 shrink-0" />
            <span className="[writing-mode:vertical-rl] rotate-180 text-[10px] sm:text-[11px] font-sans tracking-widest uppercase font-semibold">
              Document
            </span>
          </button>

          {/* Tab 2: Project (Sessions stream) */}
          <button
            type="button"
            onClick={() => setActiveTab('project')}
            className={`flex-1 flex flex-col items-center justify-center py-2 sm:py-3 cursor-pointer transition-colors ${
              activeTab === 'project'
                ? 'bg-background text-foreground font-bold border-r-2 border-r-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            }`}
            title="Sessions: Chronological Drafting Sessions"
          >
            <Layers className="w-3.5 h-3.5 mb-2 shrink-0" />
            <span className="[writing-mode:vertical-rl] rotate-180 text-[10px] sm:text-[11px] font-sans tracking-widest uppercase font-semibold">
              Sessions
            </span>
          </button>

          {/* Tab 3: Projects */}
          <button
            type="button"
            onClick={() => setActiveTab('files')}
            className={`flex-1 flex flex-col items-center justify-center py-2 sm:py-3 cursor-pointer transition-colors ${
              activeTab === 'files'
                ? 'bg-background text-foreground font-bold border-r-2 border-r-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            }`}
            title="Projects: Saved Projects Explorer"
          >
            <FolderOpen className="w-3.5 h-3.5 mb-2 shrink-0" />
            <span className="[writing-mode:vertical-rl] rotate-180 text-[10px] sm:text-[11px] font-sans tracking-widest uppercase font-semibold">
              Projects
            </span>
          </button>
        </div>

        {/* Right Content Panels */}
        <div className="flex-1 min-w-0 flex flex-col p-3 sm:p-5 gap-2.5 sm:gap-3 overflow-hidden">
          {/* Document Tab View */}
          <div className={`flex-1 min-h-0 flex-col gap-2.5 sm:gap-3 overflow-hidden ${activeTab === 'document' ? 'flex' : 'hidden'}`}>
            {/* Header: System / [Document Title] */}
            <div className="flex items-center justify-between border-b border-border/60 pb-2 sm:pb-3 gap-2 sm:gap-3 shrink-0">
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
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
                  placeholder="Untitled Manuscript"
                  className="bg-transparent text-sm font-sans font-semibold tracking-wide text-foreground border-b border-dashed border-border/80 hover:border-foreground focus:border-foreground focus:outline-none px-1 py-0.5 w-full max-w-[240px] sm:max-w-[340px] truncate transition-colors cursor-text"
                  title="Click to edit document title"
                />
              </div>

              {/* Top-Right Return to Typing Button */}
              <button
                type="button"
                onClick={onClose}
                className="flex items-center gap-1 px-2 py-1 rounded-[2px] text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent hover:border-border/60 transition-colors cursor-pointer text-xs"
                title="Return to writing in aperture"
              >
                <CornerUpLeft className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline font-sans text-[11px] font-semibold">Return</span>
              </button>
            </div>

            {/* Scrollable Compilation Preview Window with Scroll Position Memory */}
            <div
              ref={previewScrollRef}
              onScroll={(e) => {
                documentScrollPositions.set(manifest.id, e.currentTarget.scrollTop);
              }}
              className="relative w-full flex-1 min-h-0 p-3 sm:p-5 rounded-[2px] border border-border/80 bg-card text-card-foreground font-mono text-xs sm:text-sm leading-[1.3] overflow-y-auto square-scrollbar whitespace-pre-wrap select-text shadow-inner"
            >
              {sanitizedFullText.length > 0 ? (
                sanitizedFullText
              ) : (
                <span className="text-muted-foreground/40 italic">
                  No drafted text to preview. Type in the aperture to begin.
                </span>
              )}
            </div>

            {/* Document Tab Bottom Actions Row */}
            <div className="relative flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/60 text-xs font-sans shrink-0">
              {/* Left Action: Start New Session */}
              <button
                type="button"
                onClick={handleStartNewSession}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-[2px] border border-primary bg-primary text-primary-foreground font-semibold shadow-xs hover:opacity-90 transition-opacity cursor-pointer text-xs"
                title="Start a new drafting session on a fresh linebreak"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>New Session</span>
              </button>

              {/* Stats & Icon Actions */}
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-muted-foreground font-mono">
                  {totalWords.toLocaleString()} words
                </span>

                <div className="flex items-center gap-1.5">
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
            </div>
          </div>

          {/* Project Tab View (Sessions List) */}
          <div className={`flex-1 min-h-0 flex-col gap-2.5 sm:gap-3 overflow-hidden ${activeTab === 'project' ? 'flex' : 'hidden'}`}>
            <div className="flex items-center justify-between border-b border-border/60 pb-2 sm:pb-3 gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-sans font-bold tracking-widest uppercase text-muted-foreground shrink-0">
                  Sessions
                </span>
                <span className="text-muted-foreground/40 font-sans text-xs shrink-0">/</span>
                <span className="text-sm font-sans font-semibold text-foreground truncate">
                  {title || 'Untitled Project'}
                </span>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="flex items-center gap-1 px-2 py-1 rounded-[2px] text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent hover:border-border/60 transition-colors cursor-pointer text-xs"
                title="Return to writing in aperture"
              >
                <CornerUpLeft className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline font-sans text-[11px] font-semibold">Return</span>
              </button>
            </div>

            <ProjectSessionsTab
              sessions={activeSessions}
              projectTitle={title}
              totalWords={totalWords}
              currentFullText={sanitizedFullText}
            />
          </div>

          {/* Files Tab View */}
          <div className={`flex-1 min-h-0 flex-col gap-2.5 sm:gap-3 overflow-hidden ${activeTab === 'files' ? 'flex' : 'hidden'}`}>
            <div className="flex items-center justify-between border-b border-border/60 pb-2 sm:pb-3 gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-sans font-bold tracking-widest uppercase text-muted-foreground shrink-0">
                  Projects
                </span>
                <span className="text-muted-foreground/40 font-sans text-xs shrink-0">/</span>
                <span className="text-sm font-sans font-semibold text-foreground truncate">
                  {title || 'Untitled Project'}
                </span>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="flex items-center gap-1 px-2 py-1 rounded-[2px] text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent hover:border-border/60 transition-colors cursor-pointer text-xs"
                title="Return to writing in aperture"
              >
                <CornerUpLeft className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline font-sans text-[11px] font-semibold">Return</span>
              </button>
            </div>

            {/* Files Tab Content */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <ProjectFilesTab
                activeManuscriptId={manifest.id}
                onCloseModal={onClose}
                onSelectDocumentTab={() => setActiveTab('document')}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
