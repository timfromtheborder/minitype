'use client';

import React, { useState } from 'react';
import { useTypingEngine } from '@/hooks/useTypingEngine';
import { ApertureFrame } from '@/components/aperture/ApertureFrame';
import { OutboxCounter } from '@/components/stages/OutboxCounter';
import { InboxCounter } from '@/components/stages/InboxCounter';
import { SettingsDrawer } from '@/components/modals/SettingsDrawer';
import { PrintModal } from '@/components/modals/PrintModal';
import { Settings, Printer, Database, Zap } from 'lucide-react';

export default function Home() {
  const engine = useTypingEngine();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPrintOpen, setIsPrintOpen] = useState(false);

  // Compute total characters drafted on current page
  const totalCharsOnPage = engine.currentPageLines.reduce(
    (acc, line) => acc + line.cells.filter((c) => c.state !== 'struck' && !c.isSoftPadding).length,
    0
  );

  // Determine color scheme classes
  const colorSchemeClasses = (() => {
    switch (engine.manifest.colorScheme) {
      case 'dark-amber':
        return 'bg-[#121212] text-[#FFB000] selection:bg-[#FFB000]/30';
      case 'phosphor':
        return 'bg-[#0A120A] text-[#33FF33] selection:bg-[#33FF33]/30';
      case 'high-contrast':
        return 'bg-white text-black selection:bg-black/20';
      case 'typewriter':
      default:
        return 'bg-[#F5F2EB] text-[#1E1E1E] selection:bg-[#D4C5A9]';
    }
  })();

  // Determine typeface font class
  const typefaceClass = (() => {
    switch (engine.manifest.typeface) {
      case 'jetbrains-mono':
      case 'ibm-plex-mono':
      case 'courier-prime':
      default:
        return 'font-mono';
    }
  })();

  return (
    <main
      className={`relative w-full h-screen overflow-hidden flex flex-col justify-between p-6 transition-colors duration-300 ${colorSchemeClasses} ${typefaceClass}`}
    >
      {/* 1. TOP DECK: Outbox Counter (Top Center) */}
      <header className="flex items-center justify-center w-full pt-2 select-none">
        <OutboxCounter count={engine.manifest.outboxCount} />
      </header>

      {/* 2. CENTER STAGE: Settings Gear + Aperture */}
      <section className="flex items-center justify-center w-full gap-4 my-auto">
        {/* Settings Gear Button */}
        <button
          type="button"
          onClick={() => setIsSettingsOpen(true)}
          title="Settings (Aperture, Wrap, Palette, Page Size)"
          className="p-3 rounded-full border border-border/70 bg-card/60 hover:bg-muted text-muted-foreground hover:text-foreground shadow-xs transition-all cursor-pointer hover:rotate-45 active:scale-95"
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

      {/* 3. LOWER STAGE: Inbox Paper Feeder Counter (Bottom Center) */}
      <section className="flex flex-col items-center justify-center w-full pb-2 select-none">
        <InboxCounter
          count={engine.manifest.inboxCount}
          isLocked={engine.isLocked}
          onFeedPaper={() => engine.feedPaper(1)}
        />
      </section>

      {/* 4. UTILITY DECK: Viewport Base */}
      <footer className="flex items-center justify-between w-full border-t border-border/40 pt-3 select-none text-xs">
        {/* Print / Compile Trigger */}
        <button
          type="button"
          onClick={() => setIsPrintOpen(true)}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-border/70 bg-card/60 hover:bg-muted text-foreground font-mono transition-all cursor-pointer shadow-xs active:scale-95"
        >
          <Printer className="w-3.5 h-3.5 opacity-70" />
          <span>Print / Compile</span>
        </button>

        {/* Live Drafting Metadata */}
        <div className="flex items-center gap-4 text-muted-foreground text-[11px] font-mono">
          <span>
            Sheet {engine.currentPageNumber} · Line {engine.activeLineIndex + 1}/{engine.manifest.pageSize}
          </span>
          <span>·</span>
          <span>Col {Math.min(engine.activeColIndex + 1, 70)}/70</span>
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
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono transition-all cursor-pointer ${
            engine.manifest.mode === 'local'
              ? 'border-border/70 bg-card/60 text-foreground'
              : 'border-amber-500/80 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold'
          }`}
          title="Click to toggle between IndexedDB persistence and volatile RAM"
        >
          {engine.manifest.mode === 'local' ? (
            <>
              <Database className="w-3.5 h-3.5 opacity-70" />
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
        onUpdateWrapMode={engine.setWrapMode}
        onUpdatePageSize={engine.setPageSize}
        onUpdateManifest={engine.setManifest}
      />

      {/* Print / Compile Modal */}
      <PrintModal
        isOpen={isPrintOpen}
        onClose={() => setIsPrintOpen(false)}
        pages={[
          ...engine.historicalPages,
          {
            pageNumber: engine.currentPageNumber,
            lines: engine.currentPageLines,
            completedAt: null,
          },
        ]}
        manifest={engine.manifest}
        onPrintedComplete={(printedCount) => {
          engine.setManifest({
            lastPrintedCharIndex: printedCount,
            printedPagesCount: engine.manifest.outboxCount,
          });
        }}
      />
    </main>
  );
}
