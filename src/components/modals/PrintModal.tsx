import React, { useEffect, useState, useRef } from 'react';
import { PageRecord, ManuscriptManifest } from '@/types';
import { sanitizeManuscript } from '@/lib/sanitize';
import { typewriterAudio } from '@/lib/sound';
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
  const [allLines, setAllLines] = useState<string[]>([]);
  const [printedLines, setPrintedLines] = useState<string[]>([]);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [isDone, setIsDone] = useState<boolean>(false);
  const [sanitizedFullText, setSanitizedFullText] = useState<string>('');
  const [isConfirmingClear, setIsConfirmingClear] = useState<boolean>(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const printAbortRef = useRef<boolean>(false);
  const prevIsOpenRef = useRef<boolean>(false);

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

    // Extract visual drafted lines for the line-by-line feed animation
    const visualLines: string[] = [];
    for (let p = 0; p < pages.length; p++) {
      const page = pages[p];
      const pageVisualLines: string[] = [];

      for (const line of page.lines) {
        const hasStruckOnly =
          line.cells.length > 0 &&
          line.cells.every((c) => c.state === 'struck' || c.isSoftPadding);
        if (hasStruckOnly) continue;

        const cleanChars = line.cells
          .filter((c) => c.state !== 'struck' && !c.isSoftPadding)
          .map((c) => c.char)
          .join('')
          .trimEnd();

        if (line.cells.length === 0 || cleanChars === '') {
          if (line.isCommitted || line.wrapType === 'hard') {
            pageVisualLines.push('');
          }
        } else {
          pageVisualLines.push(cleanChars);
        }
      }

      // Trim trailing empty lines from this page
      while (pageVisualLines.length > 0 && pageVisualLines[pageVisualLines.length - 1] === '') {
        pageVisualLines.pop();
      }

      if (pageVisualLines.length > 0) {
        if (visualLines.length > 0) {
          // Visual line break between pages
          visualLines.push('');
        }
        visualLines.push(...pageVisualLines);
      }
    }

    const lines = visualLines.length > 0 ? visualLines : [''];
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
    const blob = new Blob([sanitizedFullText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${manifest.title || 'manuscript'}.txt`;
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
        className="w-full max-w-2xl h-[560px] p-6 rounded-2xl border border-border bg-background shadow-2xl flex flex-col justify-between select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2.5">
            <Printer className="w-4 h-4 text-foreground" />
            <h2 className="text-sm font-mono font-semibold tracking-wider uppercase text-foreground">
              Manuscript Print Output
            </h2>
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
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-border bg-card hover:bg-muted text-xs font-mono cursor-pointer transition-colors"
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

        {/* Clean, Non-skeumorphic Manuscript Sheet Area (Fixed size, lines emerge one-by-one from the bottom) */}
        <div className="relative w-full h-[380px] p-6 rounded-xl border border-border bg-card font-mono text-sm leading-relaxed overflow-y-auto whitespace-pre-wrap select-text flex flex-col justify-end">
          <div className="flex-1 flex flex-col justify-end">
            {printedLines.map((line, idx) => {
              const isLatest = idx === printedLines.length - 1 && isPrinting;
              return (
                <div
                  key={idx}
                  className={`min-h-[1.5rem] tracking-wide transition-opacity duration-150 ${
                    isLatest ? 'opacity-100 font-semibold' : 'opacity-90'
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
        <div className="flex items-center justify-between pt-2 border-t border-border text-xs font-mono">
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-card hover:bg-muted text-foreground transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
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
