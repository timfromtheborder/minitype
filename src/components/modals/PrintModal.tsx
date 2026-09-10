import React, { useEffect, useState } from 'react';
import { PageRecord, ManuscriptManifest } from '@/types';
import { sanitizeManuscript } from '@/lib/sanitize';
import { useTypingStore } from '@/stores/typingStore';
import { Printer, Download, X, FolderPlus } from 'lucide-react';

interface PrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  pages: PageRecord[];
  manifest: ManuscriptManifest;
  onPrintedComplete?: (printedCharCount: number) => void;
  onClearText?: () => void;
}

export const PrintModal: React.FC<PrintModalProps> = ({
  isOpen,
  onClose,
  pages,
  manifest,
  onPrintedComplete,
}) => {
  const [title, setTitle] = useState<string>(manifest.title || 'Untitled Manuscript');
  const [sanitizedFullText, setSanitizedFullText] = useState<string>('');
  const [isConfirmingNewProject, setIsConfirmingNewProject] = useState<boolean>(false);

  // Sync title and compile manuscript when modal opens
  useEffect(() => {
    if (isOpen) {
      setTitle(manifest.title || 'Untitled Manuscript');
      setIsConfirmingNewProject(false);
      // Instant compilation on open
      const fullClean = sanitizeManuscript(pages, {
        doubleSpaceLinebreaks: manifest.doubleSpaceLinebreaks,
      });
      setSanitizedFullText(fullClean);
    }
  }, [isOpen]);

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

  const handleNewProject = async () => {
    setIsConfirmingNewProject(false);
    await useTypingStore.getState().newProject();
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl h-[560px] p-6 rounded-none border border-border bg-background text-foreground shadow-2xl flex flex-col justify-between select-none relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 pb-3 gap-3">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <span className="text-xs font-sans font-bold tracking-widest uppercase text-muted-foreground shrink-0">
              Project
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
              className="bg-transparent text-sm font-sans font-semibold tracking-wide text-foreground border-b border-dashed border-border/80 hover:border-foreground focus:border-foreground focus:outline-none px-1 py-0.5 w-full max-w-[280px] sm:max-w-[340px] truncate transition-colors cursor-text"
              title="Click to edit document title"
            />
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-none text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Compilation Preview Window */}
        <div className="relative w-full h-[380px] p-6 rounded-none border border-border/80 bg-card text-card-foreground font-mono text-sm leading-[1.3] overflow-y-auto square-scrollbar whitespace-pre-wrap select-text shadow-inner">
          {sanitizedFullText.length > 0 ? (
            sanitizedFullText
          ) : (
            <span className="text-muted-foreground/40 italic">
              No drafted text to preview. Type in the aperture to begin.
            </span>
          )}
        </div>

        {/* Bottom Actions Row */}
        <div className="relative flex items-center justify-between pt-2 border-t border-border/60 text-xs font-sans">
          {/* New Project Button with Pop-Over Confirmation */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsConfirmingNewProject(!isConfirmingNewProject)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-none border border-border/80 text-muted-foreground hover:text-destructive hover:border-destructive/60 hover:bg-destructive/10 transition-colors cursor-pointer"
              title="Start a new project"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>New Project</span>
            </button>

            {/* Pop-Over Confirmation Card */}
            {isConfirmingNewProject && (
              <div className="absolute bottom-11 left-0 z-30 p-4 rounded-none border border-border bg-popover text-popover-foreground shadow-2xl flex flex-col gap-3 w-72 font-sans text-xs animate-in fade-in zoom-in-95 duration-100">
                <p className="font-bold text-foreground">Start a new project?</p>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  This will erase all drafted text, completed pages, and reset the manuscript title.
                </p>
                <div className="flex items-center justify-end gap-2 pt-1 border-t border-border/40">
                  <button
                    type="button"
                    onClick={() => setIsConfirmingNewProject(false)}
                    className="px-2.5 py-1 rounded-none border border-border/70 bg-muted/40 hover:bg-muted text-foreground transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleNewProject}
                    className="px-3 py-1 rounded-none border border-destructive bg-destructive text-destructive-foreground font-bold hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    Confirm
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Icon-Only Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadTxt}
              disabled={sanitizedFullText.length === 0}
              className="p-2 rounded-none border border-border/80 bg-muted/40 hover:bg-muted text-foreground transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="Download .txt"
              aria-label="Download .txt"
            >
              <Download className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleBrowserPrint}
              disabled={sanitizedFullText.length === 0}
              className="p-2 rounded-none border border-primary bg-primary text-primary-foreground font-semibold shadow-xs hover:opacity-90 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="Print document"
              aria-label="Print document"
            >
              <Printer className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
