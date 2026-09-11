'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useTypingEngine } from '@/hooks/useTypingEngine';
import { readSynchronousSettings } from '@/stores/typingStore';
import { ApertureFrame } from '@/components/aperture/ApertureFrame';
import { DocumentStats } from '@/components/aperture/DocumentStats';
import { PaperTrayStack } from '@/components/stages/PaperTrayStack';
import { SettingsDrawer } from '@/components/modals/SettingsDrawer';
import { PrintModal } from '@/components/modals/PrintModal';
import { Settings, FileText, Check, Loader2, AlertTriangle } from 'lucide-react';

export default function Home() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPrintOpen, setIsPrintOpen] = useState(false);
  const engine = useTypingEngine({ isPaused: isPrintOpen || isSettingsOpen });



  // Sync active palette data-theme and data-text-size attribute with document root
  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (engine.manifest.colorScheme) {
        document.documentElement.setAttribute('data-theme', engine.manifest.colorScheme);
      }
      if (engine.manifest.textSize) {
        document.documentElement.setAttribute('data-text-size', engine.manifest.textSize);
      }
    }
  }, [engine.manifest.colorScheme, engine.manifest.textSize]);

  // Compile full manuscript pages strictly on-demand when the Project dialog opens
  const manuscriptPages = useMemo(() => {
    if (!isPrintOpen) return [];
    return [
      ...engine.historicalPages,
      {
        pageNumber: engine.currentPageNumber,
        lines: engine.currentPageLines,
        completedAt: null,
      },
    ];
  }, [isPrintOpen, engine.historicalPages, engine.currentPageNumber, engine.currentPageLines]);

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
    ? 'w-[calc(36ch+1.25rem)] max-w-[calc(100vw-1.5rem)]'
    : 'w-[calc(71ch+3rem)] md:w-[calc(71ch+4rem)] max-w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-2.5rem)]';

  return (
    <main
      suppressHydrationWarning
      className="relative w-full h-[100dvh] max-h-[100dvh] overflow-hidden flex flex-col justify-between p-2.5 sm:p-6 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] transition-colors duration-300 bg-background text-foreground font-sans"
    >
      {/* 1. TOP STAGE: Visual Wireframe Isometric Paper Outbox Tray (hidden in endless scroll mode) */}
      {engine.manifest.pageMode !== 'scroll' && (
        <header className="flex items-center justify-center w-full pt-2 sm:pt-4 select-none shrink-0">
          <PaperTrayStack count={engine.manifest.outboxCount} />
        </header>
      )}

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

          {/* Live Drafting Metadata (Isolated subscriber component) */}
          <DocumentStats />
        </div>
      </section>

      {/* 3. UTILITY DECK: Viewport Base, centered and matching input box width */}
      <footer className="w-full flex justify-center items-center pb-1.5 sm:pb-2 select-none text-xs shrink-0">
        <div className={`flex items-center justify-between ${boxWidthClass} gap-2`}>
          {/* System Button */}
          <button
            type="button"
            onClick={() => setIsPrintOpen(true)}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-[2px] border font-sans font-medium transition-all cursor-pointer shadow-xs active:scale-95 text-[11px] sm:text-xs whitespace-nowrap ${
              isSpotlight
                ? 'border-border/80 bg-muted/70 text-foreground/90 hover:bg-card hover:text-card-foreground'
                : 'border-border/70 bg-card hover:bg-muted text-card-foreground'
            }`}
            title="System"
          >
            <FileText className="w-3.5 h-3.5 opacity-70 shrink-0" />
            <span>System</span>
          </button>

          {/* Settings Button */}
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-[2px] border font-sans font-medium transition-all cursor-pointer shadow-xs active:scale-95 text-[11px] sm:text-xs whitespace-nowrap ${
              isSpotlight
                ? 'border-border/80 bg-muted/70 text-foreground/90 hover:bg-card hover:text-card-foreground'
                : 'border-border/70 bg-card hover:bg-muted text-card-foreground'
            }`}
            title="Settings"
          >
            <Settings className="w-3.5 h-3.5 opacity-70 shrink-0" />
            <span>Settings</span>
          </button>

          {/* Live Save State Indicator */}
          <button
            type="button"
            onClick={() => engine.flushSave?.()}
            className={`flex items-center justify-center px-2.5 py-1.5 rounded-[2px] border font-sans transition-all cursor-pointer shadow-xs shrink-0 ${
              engine.saveState === 'error' || engine.persistenceError
                ? 'border-red-500 bg-red-500/10 text-red-600 dark:text-red-400 font-semibold'
                : engine.saveState === 'saving' || engine.saveState === 'typing'
                ? 'border-border/60 bg-muted/40 text-muted-foreground'
                : isSpotlight
                ? 'border-border/80 bg-muted/70 text-foreground/90 hover:bg-card hover:text-card-foreground'
                : 'border-border/70 bg-card text-card-foreground hover:bg-muted'
            }`}
            title={
              engine.saveState === 'error' || engine.persistenceError
                ? `Save Error: ${engine.persistenceError || 'IndexedDB write error'}`
                : engine.saveState === 'saving' || engine.saveState === 'typing'
                ? 'Saving changes...'
                : 'All changes saved. Click to force save now.'
            }
          >
            {engine.saveState === 'error' || engine.persistenceError ? (
              <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
            ) : engine.saveState === 'saving' || engine.saveState === 'typing' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground/60 opacity-60 shrink-0" />
            ) : (
              <Check className="w-3.5 h-3.5 opacity-80 shrink-0 text-emerald-600 dark:text-emerald-400" />
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
