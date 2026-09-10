'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useTypingEngine } from '@/hooks/useTypingEngine';
import { ApertureFrame } from '@/components/aperture/ApertureFrame';
import { PaperTrayStack } from '@/components/stages/PaperTrayStack';
import { SettingsDrawer } from '@/components/modals/SettingsDrawer';
import { PrintModal } from '@/components/modals/PrintModal';
import { Settings, Printer, Database, Zap } from 'lucide-react';

export default function Home() {
  const engine = useTypingEngine();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPrintOpen, setIsPrintOpen] = useState(false);

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

  const isSpotlight = engine.manifest.colorScheme === 'spotlight';

  return (
    <main
      suppressHydrationWarning
      data-theme={engine.manifest.colorScheme}
      className="relative w-full h-screen overflow-hidden flex flex-col justify-between p-6 transition-colors duration-300 bg-background text-foreground font-mono"
    >
      {/* 1. TOP STAGE: Visual Wireframe Isometric Paper Outbox Tray */}
      <header className="flex items-center justify-center w-full pt-4 select-none">
        <PaperTrayStack count={engine.manifest.outboxCount} />
      </header>

      {/* 2. CENTER STAGE: Settings Gear + Monospace Aperture */}
      <section className="flex items-center justify-center w-full gap-4 my-auto">
        {/* Settings Gear Button */}
        <button
          type="button"
          onClick={() => setIsSettingsOpen(true)}
          title="Settings (Aperture, Palette, Page Size)"
          className={`p-3 rounded-full border shadow-xs transition-all cursor-pointer hover:rotate-45 active:scale-95 ${
            isSpotlight
              ? 'border-border/80 bg-muted/70 text-muted-foreground hover:bg-card hover:text-card-foreground'
              : 'border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground'
          }`}
        >
          <Settings className="w-5 h-5" />
        </button>

        {/* 70-Character Monospace Typing Aperture */}
        <ApertureFrame
          lines={engine.currentPageLines}
          activeLineIndex={engine.activeLineIndex}
          activeColIndex={engine.activeColIndex}
          height={engine.manifest.activeApertureHeight}
          isLocked={engine.isLocked}
          isHighlighting={engine.isHighlighting}
        />
      </section>

      {/* 3. UTILITY DECK: Viewport Base */}
      <footer className="relative flex items-center justify-between w-full border-t border-border pt-3 select-none text-xs">
        {/* Print / Compile Trigger */}
        <button
          type="button"
          onClick={() => setIsPrintOpen(true)}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg border font-mono transition-all cursor-pointer shadow-xs active:scale-95 z-10 ${
            isSpotlight
              ? 'border-border/80 bg-muted/70 text-foreground/90 hover:bg-card hover:text-card-foreground'
              : 'border-border/70 bg-card hover:bg-muted text-card-foreground'
          }`}
        >
          <Printer className="w-3.5 h-3.5 opacity-70" />
          <span>Print / Compile</span>
        </button>

        {/* Live Drafting Metadata (Centered) */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-3.5 text-muted-foreground text-[11px] font-mono pointer-events-none">
          <span>
            {engine.manifest.pageMode === 'paragraph'
              ? `Paragraph ${engine.currentPageNumber} · Line ${engine.activeLineIndex + 1}`
              : engine.manifest.pageMode === 'notecard'
              ? `Card ${engine.currentPageNumber} · Line ${engine.activeLineIndex + 1}/10`
              : `Page ${engine.currentPageNumber} · Line ${engine.activeLineIndex + 1}/${engine.manifest.pageSize || 54}`}
          </span>
          <span>·</span>
          <span>Col {Math.min(engine.activeColIndex + 1, 70)}/70</span>
          <span>·</span>
          <span className="text-foreground/90 font-medium">{wordCount} words</span>
          <span>·</span>
          <span>{totalCharsOnPage} chars</span>
        </div>

        {/* Persistence Mode Toggle Indicator */}
        <button
          type="button"
          onClick={() =>
            engine.setManifest({
              mode: engine.manifest.mode === 'local' ? 'temp' : 'local',
            })
          }
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono transition-all cursor-pointer z-10 ${
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
              <span>Mode: Local (IndexedDB)</span>
            </>
          ) : (
            <>
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span>Mode: Temp (RAM Only)</span>
            </>
          )}
        </button>
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

      {/* Print / Compile Modal */}
      <PrintModal
        isOpen={isPrintOpen}
        onClose={() => setIsPrintOpen(false)}
        pages={manuscriptPages}
        manifest={engine.manifest}
        onPrintedComplete={(printedCount) => {
          engine.setManifest({
            lastPrintedCharIndex: printedCount,
            printedPagesCount: engine.manifest.outboxCount,
          });
        }}
        onClearText={engine.clearText}
      />
    </main>
  );
}
