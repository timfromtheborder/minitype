'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useTypingEngine } from '@/hooks/useTypingEngine';
import { ApertureFrame } from '@/components/aperture/ApertureFrame';
import { PaperTrayStack } from '@/components/stages/PaperTrayStack';
import { SettingsDrawer } from '@/components/modals/SettingsDrawer';
import { PrintModal } from '@/components/modals/PrintModal';
import { Settings, Printer, Database, Zap } from 'lucide-react';

export default function Home() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPrintOpen, setIsPrintOpen] = useState(false);
  const engine = useTypingEngine({ isPaused: isPrintOpen || isSettingsOpen });

  // Sync active palette data-theme attribute with document root
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', engine.manifest.colorScheme);
    }
  }, [engine.manifest.colorScheme]);

  // Compute total characters and wordcount on current page: (character / 5 minus blank spaces)
  const validCellsOnPage = useMemo(
    () =>
      engine.currentPageLines.flatMap((line) =>
        line.cells.filter((c) => c.state !== 'struck' && !c.isSoftPadding)
      ),
    [engine.currentPageLines]
  );
  const totalCharsOnPage = validCellsOnPage.length;
  const blankSpacesOnPage = useMemo(
    () => validCellsOnPage.filter((c) => c.char === ' ').length,
    [validCellsOnPage]
  );
  const nonSpaceChars = totalCharsOnPage - blankSpacesOnPage;
  const wordCount = Math.max(0, Math.round(nonSpaceChars / 5));

  // Stable pages array for print compilation
  const manuscriptPages = useMemo(
    () => [
      ...engine.historicalPages,
      {
        pageNumber: engine.currentPageNumber,
        lines: engine.currentPageLines,
        completedAt: null,
      },
    ],
    [engine.historicalPages, engine.currentPageNumber, engine.currentPageLines]
  );

  const handlePrintedComplete = React.useCallback(
    (printedCount: number) => {
      engine.setManifest({
        lastPrintedCharIndex: printedCount,
        printedPagesCount: engine.manifest.outboxCount,
      });
    },
    [engine.setManifest, engine.manifest.outboxCount]
  );

  const isSpotlight = engine.manifest.colorScheme === 'spotlight';
  const isPortrait = (engine.activeColumnLimit ?? 70) === 35;
  const boxWidthClass = isPortrait
    ? 'w-[calc(36ch+1.5rem)] max-w-[calc(100vw-1.5rem)]'
    : 'w-[calc(71ch+4rem)] max-w-[calc(100vw-1.5rem)]';

  return (
    <main
      suppressHydrationWarning
      data-theme={engine.manifest.colorScheme}
      className="relative w-full h-[100dvh] min-h-[100dvh] overflow-hidden flex flex-col justify-between p-3 sm:p-6 transition-colors duration-300 bg-background text-foreground font-mono"
    >
      {/* 1. TOP STAGE: Visual Wireframe Isometric Paper Outbox Tray */}
      <header className="flex items-center justify-center w-full pt-4 select-none">
        <PaperTrayStack count={engine.manifest.outboxCount} />
      </header>

      {/* 2. CENTER STAGE: Exactly Centered Monospace Aperture */}
      <section className="flex-1 flex flex-col items-center justify-center w-full my-auto">
        <div className="flex flex-col items-center">
          <ApertureFrame
            lines={engine.currentPageLines}
            activeLineIndex={engine.activeLineIndex}
            activeColIndex={engine.activeColIndex}
            height={engine.manifest.activeApertureHeight}
            isLocked={engine.isLocked}
            isHighlighting={engine.isHighlighting}
            isPaused={isPrintOpen || isSettingsOpen}
          />

          {/* Live Drafting Metadata (immediately beneath input box, left-aligned with ruler start) */}
          {engine.manifest.showStats !== false && (
            <div className={`flex items-center justify-start ${boxWidthClass} px-3 sm:px-8 mt-1.5 text-muted-foreground text-[11px] font-mono pointer-events-none select-none`}>
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <span>
                  {engine.manifest.pageMode === 'paragraph'
                    ? `Paragraph ${engine.currentPageNumber} · Line ${engine.activeLineIndex + 1}`
                    : engine.manifest.pageMode === 'notecard'
                    ? `Card ${engine.currentPageNumber} · Line ${engine.activeLineIndex + 1}/10`
                    : `Page ${engine.currentPageNumber} · Line ${engine.activeLineIndex + 1}/${engine.manifest.pageSize || 54}`}
                </span>
                <span>·</span>
                <span>Col {Math.min(engine.activeColIndex + 1, engine.activeColumnLimit ?? 70)}/{engine.activeColumnLimit ?? 70}</span>
                <span>·</span>
                <span className="text-foreground/90 font-medium">{wordCount} words</span>
                <span>·</span>
                <span>{totalCharsOnPage} chars</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 3. UTILITY DECK: Viewport Base, centered and matching input box width */}
      <footer className="w-full flex justify-center items-center pb-2 select-none text-xs">
        <div className={`flex items-center justify-between ${boxWidthClass} gap-2`}>
          {/* Project Button */}
          <button
            type="button"
            onClick={() => setIsPrintOpen(true)}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-none border font-mono transition-all cursor-pointer shadow-xs active:scale-95 text-[11px] sm:text-xs ${
              isSpotlight
                ? 'border-border/80 bg-muted/70 text-foreground/90 hover:bg-card hover:text-card-foreground'
                : 'border-border/70 bg-card hover:bg-muted text-card-foreground'
            }`}
            title="Project"
          >
            <Printer className="w-3.5 h-3.5 opacity-70" />
            <span>Project</span>
          </button>

          {/* Settings Button */}
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-none border font-mono transition-all cursor-pointer shadow-xs active:scale-95 text-[11px] sm:text-xs ${
              isSpotlight
                ? 'border-border/80 bg-muted/70 text-muted-foreground hover:bg-card hover:text-card-foreground'
                : 'border-border/70 bg-card hover:bg-muted text-muted-foreground hover:text-foreground'
            }`}
            title="Settings"
          >
            <Settings className="w-3.5 h-3.5 opacity-70" />
            <span>Settings</span>
          </button>

          {/* Persistence Mode Toggle Indicator */}
          <button
            type="button"
            onClick={() =>
              engine.setManifest({
                mode: engine.manifest.mode === 'local' ? 'temp' : 'local',
              })
            }
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-none border font-mono transition-all cursor-pointer text-[11px] sm:text-xs ${
              engine.manifest.mode === 'local'
                ? isSpotlight
                  ? 'border-border/80 bg-muted/70 text-foreground/90 hover:bg-card hover:text-card-foreground font-medium shadow-xs'
                  : 'border-border/70 bg-card text-card-foreground font-medium shadow-xs'
                : 'border-amber-500/80 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold shadow-xs hover:bg-amber-500/20'
            }`}
            title="Click to toggle between IndexedDB persistence and volatile RAM"
          >
            {engine.manifest.mode === 'local' ? (
              <>
                <Database className="w-3.5 h-3.5 opacity-80" />
                <span>Mode: Local</span>
              </>
            ) : (
              <>
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                <span>Mode: Temp</span>
              </>
            )}
          </button>
        </div>
      </footer>

      {/* Settings Drawer Modal */}
      <SettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        manifest={engine.manifest}
        onUpdateHeight={engine.setApertureHeight}
        onUpdatePageSize={engine.setPageSize}
        onUpdateManifest={engine.setManifest}
      />

      {/* Project Modal */}
      <PrintModal
        isOpen={isPrintOpen}
        onClose={() => setIsPrintOpen(false)}
        pages={manuscriptPages}
        manifest={engine.manifest}
        onPrintedComplete={handlePrintedComplete}
        onClearText={engine.clearText}
      />
    </main>
  );
}
