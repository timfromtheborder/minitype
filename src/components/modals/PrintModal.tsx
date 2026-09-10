import React, { useEffect, useState, useRef } from 'react';
import { PageRecord, ManuscriptManifest } from '@/types';
import { sanitizeManuscript } from '@/lib/sanitize';
import { typewriterAudio } from '@/lib/sound';
import { useTypingStore } from '@/stores/typingStore';
import { Printer, Download, X, FastForward, CheckCircle2, Trash2 } from 'lucide-react';

interface PrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  pages: PageRecord[];
  manifest: ManuscriptManifest;
  onPrintedComplete: (printedCharCount: number) => void;
  onClearText?: () => void;
}

export const PrintModal: React.FC<PrintModalProps> = ({
  isOpen,
  onClose,
  pages,
  manifest,
  onPrintedComplete,
  onClearText,
}) => {
  const [title, setTitle] = useState<string>(manifest.title || 'Untitled Manuscript');
  const [allLines, setAllLines] = useState<string[]>([]);
  const [printedLines, setPrintedLines] = useState<string[]>([]);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [isDone, setIsDone] = useState<boolean>(false);
  const [sanitizedFullText, setSanitizedFullText] = useState<string>('');
  const [isConfirmingClear, setIsConfirmingClear] = useState<boolean>(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const printAbortRef = useRef<boolean>(false);
  const prevIsOpenRef = useRef<boolean>(false);

  // Sync title when modal opens or manifest updates
  useEffect(() => {
    if (isOpen) {
      setTitle(manifest.title || 'Untitled Manuscript');
    }
  }, [isOpen, manifest.title]);

  // Trigger print feed animation ONLY when modal opens (transition from closed -> open)
  useEffect(() => {
    if (!isOpen) {
      prevIsOpenRef.current = false;
      setPrintedLines([]);
      setAllLines([]);
      setIsPrinting(false);
      setIsDone(false);
      setIsConfirmingClear(false);
      printAbortRef.current = true;
      return;
    }

    if (prevIsOpenRef.current) {
      // Already running or open, avoid re-triggering loop
      return;
    }
    prevIsOpenRef.current = true;

    const fullClean = sanitizeManuscript(pages);
    setSanitizedFullText(fullClean);

    // Derive print lines directly from sanitized manuscript for 100% export-to-screen fidelity
    const lines = fullClean.length > 0 ? fullClean.split('\n') : [''];
    setAllLines(lines);

    printAbortRef.current = false;
    setPrintedLines([]);
    setIsPrinting(true);
    setIsDone(false);

    let lineIdx = 0;
    const interval = setInterval(() => {
      if (printAbortRef.current) {
        clearInterval(interval);
        return;
      }

      if (lineIdx < lines.length) {
        const nextLine = lines[lineIdx];
        setPrintedLines((prev) => [...prev, nextLine]);
        typewriterAudio.playKeyClick();
        lineIdx++;
      } else {
        clearInterval(interval);
        setIsPrinting(false);
        setIsDone(true);
        typewriterAudio.playBell();
        onPrintedComplete(fullClean.length);
      }
    }, 150); // 1 line per 0.15s (2x faster than 0.3s)

    return () => {
      clearInterval(interval);
      printAbortRef.current = true;
    };
  }, [isOpen]);

  // Keep scrolled to bottom as lines emerge from below
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [printedLines]);

  if (!isOpen) return null;

  const handleFastForward = () => {
    printAbortRef.current = true;
    setPrintedLines(allLines);
    setIsPrinting(false);
    setIsDone(true);
    onPrintedComplete(sanitizedFullText.length);
  };

  const handleDownloadTxt = () => {
    const safeTitle = (title.trim() || manifest.title || 'manuscript').replace(/[/\\?%*:|"<>]/g, '-');
    const blob = new Blob([sanitizedFullText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeTitle}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleBrowserPrint = () => {
    window.print();
  };

  const handleClearText = () => {
    if (!isConfirmingClear) {
      setIsConfirmingClear(true);
      return;
    }
    setIsConfirmingClear(false);
    if (onClearText) {
      onClearText();
    }
    onClose();
  };

  const totalLinesCount = allLines.length;
  const currentCount = printedLines.length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl h-[560px] p-6 rounded-2xl border border-border bg-background text-foreground shadow-2xl flex flex-col justify-between select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 pb-3 gap-3">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <Printer className="w-4 h-4 text-foreground shrink-0" />
            <input
              type="text"
              value={title}
              onChange={(e) => {
                const val = e.target.value;
                setTitle(val);
                useTypingStore.getState().setManifest({ title: val });
              }}
              placeholder="Untitled Manuscript"
              className="bg-transparent text-sm font-mono font-semibold tracking-wide text-foreground border-b border-dashed border-border/80 hover:border-foreground focus:border-foreground focus:outline-none px-1 py-0.5 w-full max-w-[280px] sm:max-w-[340px] truncate transition-colors cursor-text"
              title="Click to edit document title"
            />
          </div>

          <div className="flex items-center gap-2.5">
            {isPrinting && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-muted-foreground animate-pulse">
                  Line {currentCount}/{totalLinesCount}
                </span>
                <button
                  type="button"
                  onClick={handleFastForward}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-border/70 bg-muted/40 hover:bg-muted text-foreground text-xs font-mono cursor-pointer transition-colors"
                  title="Fast-forward"
                >
                  <FastForward className="w-3.5 h-3.5" />
                  <span>Skip</span>
                </button>
              </div>
            )}

            {isDone && (
              <span className="text-xs font-mono text-foreground font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Ready ({totalLinesCount} lines)
              </span>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Clean Manuscript Sheet Area matching input box and input font color */}
        <div className="relative w-full h-[380px] p-6 rounded-xl border border-border/80 bg-card text-card-foreground font-mono text-sm leading-[1.2] overflow-y-auto whitespace-pre-wrap select-text flex flex-col justify-end shadow-inner">
          <div className="flex-1 flex flex-col justify-end">
            {printedLines.map((line, idx) => {
              const isLatest = idx === printedLines.length - 1 && isPrinting;
              return (
                <div
                  key={idx}
                  className={`min-h-[1.5rem] tracking-wide text-card-foreground transition-opacity duration-150 ${
                    isLatest ? 'font-bold' : ''
                  }`}
                >
                  {line || '\u00A0'}
                </div>
              );
            })}
            <div ref={bottomRef} className="h-1" />
          </div>
        </div>

        {/* Actions Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-border/60 text-xs font-mono">
          <div className="flex items-center gap-3">
            {onClearText && (
              <button
                type="button"
                onClick={handleClearText}
                onBlur={() => setIsConfirmingClear(false)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-mono transition-all cursor-pointer ${
                  isConfirmingClear
                    ? 'border-destructive bg-destructive text-destructive-foreground font-bold shadow-xs'
                    : 'border-border/80 text-muted-foreground hover:text-destructive hover:border-destructive/60 hover:bg-destructive/10'
                }`}
                title="Clear all drafted text and reset manuscript"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isConfirmingClear ? 'Confirm Clear?' : 'Clear Text'}</span>
              </button>
            )}

            <span className="text-muted-foreground">
              {totalLinesCount} {totalLinesCount === 1 ? 'line' : 'lines'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadTxt}
              disabled={sanitizedFullText.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border/80 bg-muted/40 hover:bg-muted text-foreground transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-3.5 h-3.5" />
              Download .txt
            </button>

            <button
              type="button"
              onClick={handleBrowserPrint}
              disabled={sanitizedFullText.length === 0}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-md border border-primary bg-primary text-primary-foreground font-semibold shadow-xs hover:opacity-90 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Page
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
