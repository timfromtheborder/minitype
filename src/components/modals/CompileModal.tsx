'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useTypingStore } from '@/stores/typingStore';
import { sanitizeManuscript } from '@/lib/sanitize';
import { PageRecord, ManuscriptManifest } from '@/types';
import { Download, Printer, CornerUpLeft, FileText, ChevronDown } from 'lucide-react';

interface CompileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCloseAll: () => void;
  pages?: PageRecord[];
  manifest?: ManuscriptManifest;
}

export function generateRtf(text: string): string {
  const escaped = text
    .replace(/\\/g, '\\\\')
    .replace(/{/g, '\\{')
    .replace(/}/g, '\\}')
    .split('\n')
    .map((para) => {
      if (!para.trim()) return '\\par';
      return `\\fi720 ${para}\\par`;
    })
    .join('\n');

  return `{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0\\froman\\fcharset0 Times New Roman;}}
\\viewkind4\\uc1\\pard\\f0\\fs24
${escaped}
}`;
}

export const CompileModal: React.FC<CompileModalProps> = ({
  isOpen,
  onClose,
  onCloseAll,
  pages: propPages,
  manifest: propManifest,
}) => {
  const storeManifest = useTypingStore((state) => state.manifest);
  const manifest = propManifest ?? storeManifest;
  const storeHistoricalPages = useTypingStore((state) => state.historicalPages);
  const storeCurrentPageNumber = useTypingStore((state) => state.currentPageNumber);
  const storeCurrentPageLines = useTypingStore((state) => state.currentPageLines);
  const isDoubleSpaced = manifest.doubleSpaceLinebreaks ?? false;

  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Close export dropdown on outside click
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    if (isExportMenuOpen) {
      document.addEventListener('pointerdown', handlePointerDown);
      return () => document.removeEventListener('pointerdown', handlePointerDown);
    }
  }, [isExportMenuOpen]);

  // Compile clean text
  const cleanText = React.useMemo(() => {
    const allPages = propPages ?? [
      ...storeHistoricalPages,
      {
        pageNumber: storeCurrentPageNumber,
        lines: storeCurrentPageLines,
        completedAt: null,
      },
    ];
    return sanitizeManuscript(allPages, {
      doubleSpaceLinebreaks: isDoubleSpaced,
      pageMode: manifest.pageMode,
    });
  }, [propPages, storeHistoricalPages, storeCurrentPageNumber, storeCurrentPageLines, isDoubleSpaced, manifest.pageMode]);

  if (!isOpen) return null;

  const handleExportTxt = () => {
    setIsExportMenuOpen(false);
    const blob = new Blob([cleanText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cleanTitle = (manifest.title || 'Untitled Project')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .toLowerCase();
    a.download = `${cleanTitle}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportRtf = () => {
    setIsExportMenuOpen(false);
    const rtfContent = generateRtf(cleanText);
    const blob = new Blob([rtfContent], { type: 'application/rtf;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cleanTitle = (manifest.title || 'Untitled Project')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .toLowerCase();
    a.download = `${cleanTitle}.rtf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Compile Manuscript"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(3.5rem,56px)] px-2 sm:p-4 sm:pb-16 animate-in fade-in duration-75"
      onClick={onCloseAll}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="w-full max-w-3xl h-[calc(100dvh-max(5.5rem,72px)-env(safe-area-inset-top))] max-h-[calc(100dvh-max(5.5rem,72px)-env(safe-area-inset-top))] landscape:h-[calc(100dvh-max(4.5rem,68px))] landscape:max-h-[calc(100dvh-max(4.5rem,68px))] sm:h-[620px] sm:max-h-[calc(100dvh-max(5.5rem,72px))] my-auto rounded-[2px] border border-border bg-background text-foreground shadow-2xl flex flex-col select-none relative overflow-hidden p-3 sm:p-5 gap-2.5 sm:gap-3 focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Continuous Manuscript Text Stream (No Header) */}
        <div
          className={`flex-1 min-h-0 overflow-y-auto square-scrollbar border border-border/80 ${
            manifest.colorScheme === 'spotlight' ? 'bg-white text-zinc-950' : 'bg-card text-card-foreground'
          } p-4 sm:p-8 rounded-[2px] select-text`}
        >
          {cleanText.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center text-muted-foreground font-mono text-xs italic select-none">
              No manuscript content to display.
            </div>
          ) : (
            <div className="font-manuscript-serif text-sm sm:text-base leading-relaxed space-y-0">
              {cleanText.split('\n').map((para, pIdx) =>
                para.length === 0 ? (
                  <div key={pIdx} className={isDoubleSpaced ? 'h-6 sm:h-8' : 'h-3 sm:h-4'} />
                ) : (
                  <p
                    key={pIdx}
                    className={`indent-8 mb-0 ${isDoubleSpaced ? 'leading-loose' : 'leading-relaxed'}`}
                  >
                    {para}
                  </p>
                )
              )}
            </div>
          )}
        </div>

        {/* Bottom Action Bar */}
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 pt-2 border-t border-border/60 text-xs font-sans shrink-0">
          {/* Left: Close button (returns to Document drawer underneath) */}
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[2px] border border-border/80 bg-muted/40 hover:bg-muted text-foreground transition-colors cursor-pointer text-xs font-medium shrink-0"
            aria-label="Return to session view"
          >
            <CornerUpLeft className="w-3.5 h-3.5" />
            <span>Return to Session View</span>
          </button>

          {/* Right: Formatting & Export actions */}
          <div className="flex items-center gap-2 shrink-0 relative">
            {/* Double-space toggle */}
            <button
              type="button"
              onClick={() => {
                useTypingStore.getState().setManifest({ doubleSpaceLinebreaks: !isDoubleSpaced });
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[2px] border transition-colors cursor-pointer text-xs font-medium ${
                isDoubleSpaced
                  ? 'bg-primary/10 border-primary text-foreground font-medium'
                  : 'border-border/80 bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground'
              }`}
              aria-label="Double-space paragraphs"
            >
              <span
                className={`w-1.5 h-1.5 rounded-[0.5px] ${
                  isDoubleSpaced ? 'bg-primary' : 'bg-muted-foreground/50'
                }`}
              />
              <span>Double-space</span>
            </button>

            {/* Print button */}
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[2px] border border-border/80 bg-muted/40 hover:bg-muted text-foreground transition-colors cursor-pointer text-xs font-medium"
              aria-label="Print manuscript"
            >
              <Printer className="w-3.5 h-3.5 opacity-70" />
              <span>Print</span>
            </button>

            {/* Export Dropdown */}
            <div ref={exportMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setIsExportMenuOpen((prev) => !prev)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-[2px] border border-primary bg-primary text-primary-foreground font-semibold shadow-xs hover:opacity-90 transition-opacity cursor-pointer text-xs"
                aria-label="Export options"
                aria-expanded={isExportMenuOpen}
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export</span>
                <ChevronDown className="w-3 h-3 ml-0.5 opacity-80" />
              </button>

              {isExportMenuOpen && (
                <div className="absolute right-0 bottom-full mb-1 w-44 rounded-[2px] border border-border bg-card text-card-foreground shadow-xl py-1 z-30 flex flex-col font-sans animate-in fade-in zoom-in-95 duration-100">
                  <button
                    type="button"
                    onClick={handleExportTxt}
                    className="flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/80 text-foreground transition-colors cursor-pointer"
                    aria-label="Export as plain text"
                  >
                    <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                    <div className="flex flex-col">
                      <span className="font-semibold">Plain Text</span>
                      <span className="text-[10px] text-muted-foreground">Standard .txt file</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportRtf}
                    className="flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/80 text-foreground transition-colors cursor-pointer border-t border-border/40"
                    aria-label="Export as rich text format"
                  >
                    <FileText className="w-3.5 h-3.5 text-primary" />
                    <div className="flex flex-col">
                      <span className="font-semibold">Rich Text (RTF)</span>
                      <span className="text-[10px] text-muted-foreground">Formatted with indents</span>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
