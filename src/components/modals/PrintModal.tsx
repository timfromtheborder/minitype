import React, { useEffect, useState, useRef } from 'react';
import { PageRecord, ManuscriptManifest } from '@/types';
import { sanitizeManuscript, calculatePrintDelayMs } from '@/lib/sanitize';
import { typewriterAudio } from '@/lib/sound';
import { Printer, Download, X, Play, CheckCircle2 } from 'lucide-react';

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
  const [sanitizedText, setSanitizedText] = useState<string>('');
  const [streamedText, setStreamedText] = useState<string>('');
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [isDone, setIsDone] = useState<boolean>(false);
  const printAbortRef = useRef<boolean>(false);

  useEffect(() => {
    if (!isOpen) {
      setStreamedText('');
      setIsPrinting(false);
      setIsDone(false);
      printAbortRef.current = true;
      return;
    }

    const fullClean = sanitizeManuscript(pages);
    setSanitizedText(fullClean);
    printAbortRef.current = false;

    // Split between previously printed content and unprinted delta
    const watermark = Math.min(manifest.lastPrintedCharIndex, fullClean.length);
    const unprintedDelta = fullClean.slice(watermark);

    if (unprintedDelta.length === 0) {
      // Everything was already printed
      setStreamedText(fullClean);
      setIsDone(true);
      return;
    }

    // Begin rubber-banded typing simulation for the delta
    setIsPrinting(true);
    setStreamedText(fullClean.slice(0, watermark));

    const delayMs = calculatePrintDelayMs(unprintedDelta.length);
    let currIdx = 0;

    const interval = setInterval(() => {
      if (printAbortRef.current) {
        clearInterval(interval);
        return;
      }

      if (currIdx < unprintedDelta.length) {
        const char = unprintedDelta[currIdx];
        if (char === ' ') {
          typewriterAudio.playSpace();
        } else if (char === '\n') {
          typewriterAudio.playBell();
        } else {
          typewriterAudio.playKeyClick();
        }

        currIdx++;
        setStreamedText(fullClean.slice(0, watermark + currIdx));
      } else {
        clearInterval(interval);
        setIsPrinting(false);
        setIsDone(true);
        onPrintedComplete(fullClean.length);
      }
    }, delayMs);

    return () => {
      clearInterval(interval);
      printAbortRef.current = true;
    };
  }, [isOpen, pages, manifest.lastPrintedCharIndex]);

  if (!isOpen) return null;

  const handleDownloadTxt = () => {
    const blob = new Blob([sanitizedText], { type: 'text/plain;charset=utf-8' });
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] p-6 rounded-2xl border border-border bg-background shadow-2xl flex flex-col gap-4 select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <Printer className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-mono font-semibold tracking-wider uppercase text-foreground">
              Print / Compile Manuscript
            </h2>
            {isPrinting && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 animate-pulse">
                Streaming Delta...
              </span>
            )}
            {isDone && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Ready
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Clean Output Paper Viewer */}
        <div className="flex-1 min-h-[300px] max-h-[450px] p-6 rounded-xl border border-border/60 bg-muted/20 font-mono text-sm leading-relaxed overflow-y-auto whitespace-pre-wrap select-text">
          {streamedText || <span className="opacity-40 italic">Nothing written yet...</span>}
          {isPrinting && <span className="inline-block w-[1ch] bg-primary animate-pulse">█</span>}
        </div>

        {/* Actions Deck */}
        <div className="flex items-center justify-between pt-2 border-t border-border/60 text-xs font-mono">
          <div className="text-muted-foreground">
            {sanitizedText.length} sanitized characters
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadTxt}
              disabled={sanitizedText.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border/80 bg-muted/40 hover:bg-muted text-foreground transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-3.5 h-3.5" />
              Download .txt
            </button>
            <button
              type="button"
              onClick={handleBrowserPrint}
              disabled={sanitizedText.length === 0}
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
