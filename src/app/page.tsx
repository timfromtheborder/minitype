'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useTypingEngine } from '@/hooks/useTypingEngine';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useTypingStore } from '@/stores/typingStore';
import { ApertureFrame } from '@/components/aperture/ApertureFrame';
import { DocumentStats } from '@/components/aperture/DocumentStats';
import { ChronoSuite } from '@/components/aperture/ChronoSuite';
import { SessionTargetTracker } from '@/components/stages/SessionTargetTracker';
import { SettingsDrawer } from '@/components/modals/SettingsDrawer';
import { SessionDrawer } from '@/components/modals/SessionDrawer';
import { ProjectFilesModal } from '@/components/modals/ProjectFilesModal';
import { HelpModal } from '@/components/modals/HelpModal';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { Sliders, FolderOpen, Layers, FileText, Check, Loader2, HelpCircle } from 'lucide-react';

export default function Home() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSessionOpen, setIsSessionOpen] = useState(false);
  const [isProjectOpen, setIsProjectOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const isAnyModalOpen = isSessionOpen || isProjectOpen || isSettingsOpen || isHelpOpen;

  useTypingEngine({ isPaused: isAnyModalOpen });

  const toggleModal = React.useCallback((modal: 'document' | 'project' | 'settings' | 'help') => {
    setIsSessionOpen((prev) => (modal === 'document' ? !prev : false));
    setIsProjectOpen((prev) => (modal === 'project' ? !prev : false));
    setIsSettingsOpen((prev) => (modal === 'settings' ? !prev : false));
    setIsHelpOpen((prev) => (modal === 'help' ? !prev : false));
  }, []);

  useKeyboardShortcuts({
    isPaused: isAnyModalOpen,
    onToggleSettings: () => toggleModal('settings'),
    onToggleProject: () => toggleModal('project'),
    onToggleSession: () => toggleModal('document'),
    onToggleHelp: () => toggleModal('help'),
  });

  const colorScheme = useTypingStore((s) => s.manifest.colorScheme);
  const textSize = useTypingStore((s) => s.manifest.textSize);
  const showSessionTargetTracker = useTypingStore((s) => s.manifest.showSessionTargetTracker);
  const sessionWordTarget = useTypingStore((s) => s.manifest.sessionWordTarget);
  const saveState = useTypingStore((s) => s.saveState);
  const persistenceError = useTypingStore((s) => s.persistenceError);
  const manifest = useTypingStore((s) => s.manifest);
  const setApertureHeight = useTypingStore((s) => s.setApertureHeight);
  const setPageSize = useTypingStore((s) => s.setPageSize);
  const setManifest = useTypingStore((s) => s.setManifest);
  const clearText = useTypingStore((s) => s.clearText);

  const activeApertureHeight = useTypingStore((s) => s.manifest.activeApertureHeight);
  const pageMode = useTypingStore((s) => s.manifest.pageMode);
  const isHydrated = useTypingStore((s) => s.isHydrated);

  useWakeLock();

  useEffect(() => {
    if (isHydrated && typeof document !== 'undefined') {
      const veil = document.getElementById('minitype-startup-veil');
      if (veil) {
        veil.style.opacity = '0';
        const timer = setTimeout(() => {
          veil.remove();
        }, 180);
        return () => clearTimeout(timer);
      }
    }
  }, [isHydrated]);

  const handleCloseSettings = React.useCallback(() => setIsSettingsOpen(false), []);
  const handleCloseSession = React.useCallback(() => setIsSessionOpen(false), []);
  const handleCloseProject = React.useCallback(() => setIsProjectOpen(false), []);
  const handleCloseHelp = React.useCallback(() => setIsHelpOpen(false), []);

  // Sync active palette data-theme, data-text-size, data-aperture-height, and data-page-mode attribute with document root
  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (colorScheme && document.documentElement.getAttribute('data-theme') !== colorScheme) {
        document.documentElement.setAttribute('data-theme', colorScheme);
      }
      if (textSize && document.documentElement.getAttribute('data-text-size') !== textSize) {
        document.documentElement.setAttribute('data-text-size', textSize);
      }
      if (activeApertureHeight && document.documentElement.getAttribute('data-aperture-height') !== String(activeApertureHeight)) {
        document.documentElement.setAttribute('data-aperture-height', String(activeApertureHeight));
      }
      if (pageMode && document.documentElement.getAttribute('data-page-mode') !== pageMode) {
        document.documentElement.setAttribute('data-page-mode', pageMode);
      }
      if (manifest.phosphorColor && document.documentElement.getAttribute('data-phosphor') !== manifest.phosphorColor) {
        document.documentElement.setAttribute('data-phosphor', manifest.phosphorColor);
      }
      if (manifest.showClock !== undefined && document.documentElement.getAttribute('data-show-clock') !== String(manifest.showClock)) {
        document.documentElement.setAttribute('data-show-clock', String(manifest.showClock));
      }
      if (manifest.clockFormat && document.documentElement.getAttribute('data-clock-format') !== manifest.clockFormat) {
        document.documentElement.setAttribute('data-clock-format', manifest.clockFormat);
      }
    }
  }, [colorScheme, textSize, activeApertureHeight, pageMode, manifest.phosphorColor, manifest.showClock, manifest.clockFormat]);


  const handlePrintedComplete = React.useCallback(
    (printedCount: number) => {
      const state = useTypingStore.getState();
      state.setManifest({
        lastPrintedCharIndex: printedCount,
        printedPagesCount: state.manifest.outboxCount,
      });
    },
    []
  );

  const isSpotlight = colorScheme === 'spotlight';

  const getDeckButtonClass = (isActive: boolean) => {
    if (isActive) {
      return isSpotlight
        ? 'border-card bg-card text-card-foreground shadow-sm font-semibold ring-1 ring-card/30'
        : 'border-primary bg-primary text-primary-foreground shadow-sm font-semibold ring-1 ring-primary/30';
    }
    return isSpotlight
      ? 'border-border/80 bg-muted/70 text-foreground/90 hover:bg-card hover:text-card-foreground active:bg-card active:text-card-foreground'
      : 'border-border/70 bg-card hover:bg-muted text-card-foreground active:bg-muted';
  };

  return (
    <main
      suppressHydrationWarning
      className="relative w-full h-[100dvh] max-h-[100dvh] overflow-hidden p-2.5 sm:p-6 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] bg-background text-foreground font-sans select-none"
    >
      {/* Chrono Suite: Halfway between the platen (at 50dvh) and top of the screen (0dvh) */}
      <div className="absolute top-[25dvh] left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
        <ChronoSuite
          showClock={manifest.showClock}
          timerStyle={manifest.timerStyle}
          pomodoroSoundEnabled={manifest.pomodoroSoundEnabled ?? true}
          typeface={manifest.typeface}
          colorScheme={colorScheme}
          isPaused={isAnyModalOpen}
        />
      </div>

      {/* Exactly Centered Monospace Aperture */}
      <section className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
        <div className="relative flex flex-col items-center">
          {/* Platen Container with anchored Target Tracker */}
          <div className="relative">
            {showSessionTargetTracker !== false && (sessionWordTarget ?? 0) > 0 && (
              <div className="absolute bottom-full -mb-[1px] left-0 right-0 pointer-events-none">
                <SessionTargetTracker />
              </div>
            )}

            <ApertureFrame
              height={activeApertureHeight}
              isPaused={isAnyModalOpen}
            />
          </div>

          {/* Live Drafting Metadata and Right-Justified Save Checkbox */}
          <DocumentStats />
        </div>
      </section>

      {/* UTILITY DECK: Viewport Base, centered and elevated above modal backdrops */}
      <footer className="fixed bottom-0 left-0 right-0 z-[60] flex justify-center items-center pb-[max(0.75rem,env(safe-area-inset-bottom))] px-2.5 sm:px-6 select-none text-xs pointer-events-none">
        <div className="flex items-center justify-center gap-1.5 sm:gap-2.5 pointer-events-auto">
          {/* Document Button */}
          <button
            type="button"
            onClick={() => toggleModal('document')}
            className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-[2px] border font-sans font-medium transition-all cursor-pointer shadow-xs active:scale-95 text-[11px] sm:text-xs whitespace-nowrap ${getDeckButtonClass(
              isSessionOpen
            )}`}
            title="Document"
            aria-label="Document"
            aria-pressed={isSessionOpen}
          >
            <FileText className={`w-3.5 h-3.5 shrink-0 ${isSessionOpen ? 'opacity-100' : 'opacity-70'}`} />
            <span>Document</span>
          </button>

          {/* Project Button */}
          <button
            type="button"
            onClick={() => toggleModal('project')}
            className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-[2px] border font-sans font-medium transition-all cursor-pointer shadow-xs active:scale-95 text-[11px] sm:text-xs whitespace-nowrap ${getDeckButtonClass(
              isProjectOpen
            )}`}
            title="Project"
            aria-label="Project"
            aria-pressed={isProjectOpen}
          >
            <FolderOpen className={`w-3.5 h-3.5 shrink-0 ${isProjectOpen ? 'opacity-100' : 'opacity-70'}`} />
            <span>Project</span>
          </button>

          {/* Settings Button */}
          <button
            type="button"
            onClick={() => toggleModal('settings')}
            className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-[2px] border font-sans font-medium transition-all cursor-pointer shadow-xs active:scale-95 text-[11px] sm:text-xs whitespace-nowrap ${getDeckButtonClass(
              isSettingsOpen
            )}`}
            title="Settings"
            aria-label="Settings"
            aria-pressed={isSettingsOpen}
          >
            <Sliders className={`w-3.5 h-3.5 shrink-0 ${isSettingsOpen ? 'opacity-100' : 'opacity-70'}`} />
            <span>Settings</span>
          </button>

          {/* Help Button */}
          <button
            type="button"
            onClick={() => toggleModal('help')}
            className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-[2px] border font-sans font-medium transition-all cursor-pointer shadow-xs active:scale-95 text-[11px] sm:text-xs whitespace-nowrap ${getDeckButtonClass(
              isHelpOpen
            )}`}
            title="Help"
            aria-label="Help"
            aria-pressed={isHelpOpen}
          >
            <HelpCircle className={`w-3.5 h-3.5 shrink-0 ${isHelpOpen ? 'opacity-100' : 'opacity-70'}`} />
            <span>Help</span>
          </button>

          {/* Save Status Icon: centered together with bottom buttons */}
          <div
            className="flex items-center justify-center pointer-events-none select-none text-muted-foreground w-4 h-4 ml-0.5"
            aria-hidden="true"
          >
            {persistenceError || saveState === 'error' ? (
              <span className="text-destructive font-bold leading-none text-xs">!</span>
            ) : saveState === 'saving' || saveState === 'typing' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
            )}
          </div>
        </div>
      </footer>

      {/* Settings Drawer Modal */}
      {isSettingsOpen && (
        <SettingsDrawer
          isOpen={isSettingsOpen}
          onClose={handleCloseSettings}
          manifest={manifest}
          onUpdateHeight={setApertureHeight}
          onUpdatePageSize={setPageSize}
          onUpdateManifest={setManifest}
        />
      )}

      {/* Unified Session Drawer */}
      {isSessionOpen && (
        <SessionDrawer
          isOpen={isSessionOpen}
          onClose={handleCloseSession}
          onPrintedComplete={handlePrintedComplete}
          onClearText={clearText}
        />
      )}

      {/* Project Files Modal */}
      {isProjectOpen && (
        <ProjectFilesModal
          isOpen={isProjectOpen}
          onClose={handleCloseProject}
        />
      )}

      {/* Help Modal */}
      {isHelpOpen && (
        <HelpModal
          isOpen={isHelpOpen}
          onClose={handleCloseHelp}
        />
      )}
    </main>
  );
}
