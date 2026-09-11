'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useTypingEngine } from '@/hooks/useTypingEngine';
import { readSynchronousSettings } from '@/stores/typingStore';
import { ApertureFrame } from '@/components/aperture/ApertureFrame';
import { DocumentStats } from '@/components/aperture/DocumentStats';
import { PaperTrayStack } from '@/components/stages/PaperTrayStack';
import { SessionTargetTracker } from '@/components/stages/SessionTargetTracker';
import { SettingsDrawer } from '@/components/modals/SettingsDrawer';
import { PrintModal } from '@/components/modals/PrintModal';
import { Settings, FileText } from 'lucide-react';

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
      className="relative w-full h-[100dvh] max-h-[100dvh] overflow-hidden p-2.5 sm:p-6 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] transition-colors duration-300 bg-background text-foreground font-sans select-none"
    >
      {/* Exactly Centered Monospace Aperture */}
      <section className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
        <div className="relative flex flex-col items-center">
          {/* Visual Wireframe Isometric Paper Outbox Tray (rendered only in notecard mode, above platen / target tracker) */}
          {engine.manifest.pageMode === 'notecard' && (
            <div
              className={`absolute bottom-full left-0 right-0 pointer-events-none transition-all ${
                engine.manifest.showSessionTargetTracker !== false && (engine.manifest.sessionWordTarget ?? 0) > 0
                  ? 'mb-3 sm:mb-3.5'
                  : 'mb-1 sm:mb-1.5'
              }`}
            >
              <PaperTrayStack count={engine.manifest.outboxCount} />
            </div>
          )}

          {/* Session Target Tracking Graphic (rendered directly above platen with minimal space between) */}
          {engine.manifest.showSessionTargetTracker !== false && (engine.manifest.sessionWordTarget ?? 0) > 0 && (
            <div className="absolute bottom-full mb-1 sm:mb-1.5 left-0 right-0 pointer-events-none">
              <SessionTargetTracker />
            </div>
          )}

          <ApertureFrame
            lines={engine.currentPageLines}
            activeLineIndex={engine.activeLineIndex}
            activeColIndex={engine.activeColIndex}
            height={engine.manifest.activeApertureHeight}
            isLocked={engine.isLocked}
            isHighlighting={engine.isHighlighting}
            isPaused={isPrintOpen || isSettingsOpen}
          />

          {/* Live Drafting Metadata and Right-Justified Save Checkbox */}
          <DocumentStats />
        </div>
      </section>

      {/* UTILITY DECK: Viewport Base, centered and matching input box width */}
      <footer className="absolute bottom-0 left-0 right-0 flex justify-center items-center pb-[max(0.75rem,env(safe-area-inset-bottom))] px-2.5 sm:px-6 select-none text-xs">
        <div className={`flex items-center justify-end ${boxWidthClass} gap-1.5`}>
          {/* System Button */}
          <button
            type="button"
            onClick={() => setIsPrintOpen(true)}
            className={`w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-[2px] border font-sans font-medium transition-all cursor-pointer shadow-xs active:scale-95 ${
              isSpotlight
                ? 'border-border/80 bg-muted/70 text-foreground/90 hover:bg-card hover:text-card-foreground'
                : 'border-border/70 bg-card hover:bg-muted text-card-foreground'
            }`}
            title="System"
            aria-label="System"
          >
            <FileText className="w-3.5 h-3.5 opacity-70 shrink-0" />
          </button>

          {/* Settings Button */}
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className={`w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-[2px] border font-sans font-medium transition-all cursor-pointer shadow-xs active:scale-95 ${
              isSpotlight
                ? 'border-border/80 bg-muted/70 text-foreground/90 hover:bg-card hover:text-card-foreground'
                : 'border-border/70 bg-card hover:bg-muted text-card-foreground'
            }`}
            title="Settings"
            aria-label="Settings"
          >
            <Settings className="w-3.5 h-3.5 opacity-70 shrink-0" />
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
