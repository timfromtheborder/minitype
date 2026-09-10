import React, { useEffect, useState, useRef } from 'react';
import { PageRecord, ManuscriptManifest } from '@/types';
import { sanitizeManuscript } from '@/lib/sanitize';
import { typewriterAudio } from '@/lib/sound';
import { Printer, Download, X, FastForward, CheckCircle2, RotateCcw } from 'lucide-react';

interface PrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  pages: PageRecord[];
  manifest: ManuscriptManifest;
  onPrintedComplete: (printedCharCount: number) => void;
}

export const PrintModal: React.FC<PrintModalProps> = ({
  isOpen,
  onClose,
  pages,
  manifest,
  onPrintedComplete,
}) => {
  const [allLines, setAllLines] = useState<string[]>([]);
  const [printedLines, setPrintedLines] = useState<string[]>([]);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [isDone, setIsDone] = useState<boolean>(false);
  const [sanitizedFullText, setSanitizedFullText] = useState<string>('');
  
  const bottomRef = useRef<HTMLDivElement>(null);
  const printAbortRef = useRef<boolean>(false);

  // Initialize and start dot-matrix line feed printing
  useEffect(() => {
    if (!isOpen) {
      setPrintedLines([]);
      setAllLines([]);
      setIsPrinting(false);
      setIsDone(false);
      printAbortRef.current = true;
      return;
    }

    const fullClean = sanitizeManuscript(pages);
    setSanitizedFullText(fullClean);
    const lines = fullClean.length > 0 ? fullClean.split('\n') : [''];
    setAllLines(lines);

    printAbortRef.current = false;
    setPrintedLines([]);
    setIsPrinting(true);
    setIsDone(false);

    let lineIdx = 0;
    const LINE_INTERVAL_MS = 300; // Exact 0.3 seconds per line

    const interval = setInterval(() => {
      if (printAbortRef.current) {
        clearInterval(interval);
        return;
      }

      if (lineIdx < lines.length) {
        const nextLine = lines[lineIdx];
        setPrintedLines((prev) => [...prev, nextLine]);
        typewriterAudio.playDotMatrixLine();
        lineIdx++;

        // Smooth scroll to bottom platen
        if (bottomRef.current) {
          bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      } else {
        clearInterval(interval);
        setIsPrinting(false);
        setIsDone(true);
        typewriterAudio.playBell();
        onPrintedComplete(fullClean.length);
      }
    }, LINE_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      printAbortRef.current = true;
    };
  }, [isOpen, pages]);

  // Keep scrolled to bottom as lines emerge
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [printedLines]);

  if (!isOpen) return null;

  // Skip / Fast-forward immediately to the end
  const handleFastForward = () => {
    printAbortRef.current = true;
    setPrintedLines(allLines);
    setIsPrinting(false);
    setIsDone(true);
    onPrintedComplete(sanitizedFullText.length);
  };

  // Restart print simulation
  const handleRestart = () => {
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

      if (lineIdx < allLines.length) {
        const nextLine = allLines[lineIdx];
        setPrintedLines((prev) => [...prev, nextLine]);
        typewriterAudio.playDotMatrixLine();
        lineIdx++;
      } else {
        clearInterval(interval);
        setIsPrinting(false);
        setIsDone(true);
        typewriterAudio.playBell();
        onPrintedComplete(sanitizedFullText.length);
      }
    }, 300);
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

  const totalLinesCount = allLines.length;
  const currentCount = printedLines.length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[90vh] p-6 rounded-2xl border border-border bg-background shadow-2xl flex flex-col gap-4 select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-3">
            <Printer className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-sm font-mono font-bold tracking-wider uppercase text-foreground">
                Dot Matrix Print Simulator
              </h2>
              <div className="text-[11px] font-mono text-muted-foreground flex items-center gap-2">
                <span>9-Pin Impact Feed</span>
                <span>·</span>
                <span>Speed: 1 line / 0.3s</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isPrinting && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold animate-pulse flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                  Feeding: Line {currentCount}/{totalLinesCount}
                </span>
                <button
                  type="button"
                  onClick={handleFastForward}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-border/80 hover:bg-muted text-xs font-mono cursor-pointer transition-colors"
                  title="Fast-forward to end"
                >
                  <FastForward className="w-3.5 h-3.5" />
                  <span>Skip</span>
                </button>
              </div>
            )}

            {isDone && (
              <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-green-500/15 text-green-600 dark:text-green-400 font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Complete ({totalLinesCount} lines)
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

        {/* Continuous Dot Matrix Tractor-Feed Paper Viewport */}
        <div className="relative flex-1 min-h-[360px] max-h-[500px] rounded-xl border border-border/70 bg-[#F7F5EE] dark:bg-[#151714] text-[#1E1E1E] dark:text-[#E0E0E0] shadow-inner overflow-hidden flex flex-col justify-end">
          
          {/* Continuous Tractor Feed Side Perforations (Left & Right) */}
          <div className="absolute top-0 bottom-10 left-1 w-5 flex flex-col justify-around pointer-events-none opacity-25 select-none">
            {Array.from({ length: 24 }).map((_, i) => (
              <div key={i} className="w-2.5 h-2.5 rounded-full border border-current mx-auto" />
            ))}
          </div>
          <div className="absolute top-0 bottom-10 right-1 w-5 flex flex-col justify-around pointer-events-none opacity-25 select-none">
            {Array.from({ length: 24 }).map((_, i) => (
              <div key={i} className="w-2.5 h-2.5 rounded-full border border-current mx-auto" />
            ))}
          </div>

          {/* Paper Sheet Content Area (Auto-scrolls, emerging upward from the bottom platen) */}
          <div className="flex-1 px-8 py-6 font-mono text-sm leading-relaxed overflow-y-auto whitespace-pre-wrap select-text">
            {printedLines.length === 0 && !isPrinting && (
              <div className="h-full flex items-center justify-center text-muted-foreground italic text-xs">
                No printable content to feed.
              </div>
            )}

            {printedLines.map((line, idx) => {
              const isLatest = idx === printedLines.length - 1 && isPrinting;
              return (
                <div
                  key={idx}
                  className={`min-h-[1.5rem] tracking-wide transition-all ${
                    isLatest
                      ? 'bg-amber-400/20 dark:bg-amber-500/20 font-bold border-b border-primary/40'
                      : ''
                  }`}
                >
                  {line || '\u00A0'}
                </div>
              );
            })}
            <div ref={bottomRef} className="h-2" />
          </div>

          {/* Industrial Dot Matrix Printhead & Feed Platen Bar at the Bottom */}
          <div className="h-10 bg-zinc-900 border-t-2 border-zinc-700 text-zinc-300 px-6 flex items-center justify-between text-[11px] font-mono tracking-widest uppercase select-none z-10 shadow-lg">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-xs shadow-emerald-400 animate-pulse" />
              <span>Platen Feed Slot</span>
            </div>

            {isPrinting && (
              <div className="flex items-center gap-2 text-amber-400 font-bold">
                <span className="animate-pulse">PRINTHEAD ACTIVE · · ·</span>
              </div>
            )}

            <div className="text-zinc-500 text-[10px]">
              TRACTOR FEED · 70 MONO COLUMNS
            </div>
          </div>
        </div>

        {/* Actions Deck */}
        <div className="flex items-center justify-between pt-2 border-t border-border/60 text-xs font-mono">
          <div className="flex items-center gap-3 text-muted-foreground">
            <span>{sanitizedFullText.length} characters</span>
            <span>·</span>
            <span>{totalLinesCount} lines</span>
          </div>

          <div className="flex items-center gap-2">
            {isDone && (
              <button
                type="button"
                onClick={handleRestart}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border/80 hover:bg-muted text-foreground transition-all cursor-pointer"
                title="Re-run print feed animation"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Re-print
              </button>
            )}

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
