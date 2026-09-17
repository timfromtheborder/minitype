'use client';

import React, { useEffect, useRef } from 'react';
import { HelpCircle, CornerUpLeft, HardDrive, Settings, Terminal } from 'lucide-react';

export interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  const modalRef = useRef<HTMLDivElement>(null);

  // Focus trap & Escape key listener
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      modalRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        const focusables = modalRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables || focusables.length === 0) return;
        const firstEl = focusables[0];
        const lastEl = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstEl || document.activeElement === modalRef.current) {
            e.preventDefault();
            lastEl.focus();
          }
        } else {
          if (document.activeElement === lastEl) {
            e.preventDefault();
            firstEl.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Help and Instructions"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-2 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="w-full max-w-2xl h-[calc(100dvh-5.5rem)] max-h-[calc(100dvh-5.5rem)] landscape:h-[calc(100dvh-3.5rem)] landscape:max-h-[calc(100dvh-3.5rem)] sm:h-[580px] sm:max-h-[580px] my-auto rounded-[2px] border border-border bg-background text-foreground shadow-2xl flex flex-col select-none relative overflow-hidden p-3 sm:p-5 gap-3 focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: Unified Icon, Label & Return Button */}
        <div className="flex items-center justify-between border-b border-border/60 pb-2 sm:pb-3 gap-2 shrink-0">
          <div className="flex items-center gap-2.5">
            <HelpCircle className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-xs font-sans font-bold tracking-widest uppercase text-muted-foreground shrink-0">
              Help & Instructions
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1 px-2 py-1 rounded-[2px] text-muted-foreground hover:text-foreground hover:bg-muted border border-border/60 transition-colors cursor-pointer text-xs shrink-0"
            title="Return to writing in aperture"
            aria-label="Return to writing in aperture"
          >
            <CornerUpLeft className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline font-sans text-xs font-semibold">Return</span>
          </button>
        </div>

        {/* Scrollable Content Stream */}
        <div className="flex-1 overflow-y-auto square-scrollbar pr-1 flex flex-col gap-5 text-xs font-sans text-foreground/90 select-text leading-relaxed">
          {/* Section 1: Saving, Importing & Exporting */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-primary font-semibold text-xs tracking-wider uppercase">
              <HardDrive className="w-3.5 h-3.5" />
              <h3>Saving, Import & Export</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
              <div className="p-2.5 rounded-[2px] border border-border/70 bg-muted/20 flex flex-col gap-1">
                <span className="font-semibold text-foreground">Local Auto-Save</span>
                <span className="text-foreground/75 leading-normal">
                  All text saves automatically to your browser (LocalStorage and IndexedDB) on every keystroke. Works completely offline without an account.
                </span>
              </div>
              <div className="p-2.5 rounded-[2px] border border-border/70 bg-muted/20 flex flex-col gap-1">
                <span className="font-semibold text-foreground">Exporting</span>
                <span className="text-foreground/75 leading-normal">
                  Download clean <code className="font-mono text-[10px]">.txt</code> plaintext from Document or Project modals. Download full project/library <code className="font-mono text-[10px]">.json</code> backups from Project.
                </span>
              </div>
              <div className="p-2.5 rounded-[2px] border border-border/70 bg-muted/20 flex flex-col gap-1">
                <span className="font-semibold text-foreground">Importing</span>
                <span className="text-foreground/75 leading-normal">
                  Restore previously exported <code className="font-mono text-[10px]">.json</code> project/library backups or import <code className="font-mono text-[10px]">.txt</code> files from the Project modal.
                </span>
              </div>
            </div>
          </section>

          {/* Section 2: Settings Reference */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-primary font-semibold text-xs tracking-wider uppercase">
              <Settings className="w-3.5 h-3.5" />
              <h3>Settings Reference</h3>
            </div>
            <div className="border border-border/70 rounded-[2px] divide-y divide-border/50 text-[11px]">
              <div className="p-2 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4">
                <span className="font-semibold text-foreground sm:w-40 shrink-0">Aperture</span>
                <span className="text-foreground/75">Number of visible drafting lines shown on screen (1 to 10 lines).</span>
              </div>
              <div className="p-2 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4">
                <span className="font-semibold text-foreground sm:w-40 shrink-0">Text Size</span>
                <span className="text-foreground/75">Font size scale for drafting (S, M, L, XL).</span>
              </div>
              <div className="p-2 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4">
                <span className="font-semibold text-foreground sm:w-40 shrink-0">Page Mode</span>
                <span className="text-foreground/75"><strong>Scroll</strong> for continuous drafting; <strong>Notecard</strong> for fixed 10-line index cards.</span>
              </div>
              <div className="p-2 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4">
                <span className="font-semibold text-foreground sm:w-40 shrink-0">Theme</span>
                <span className="text-foreground/75">Color palette (Manuscript, Spotlight, Paperwhite, Terminal, Overcast, Charcoal).</span>
              </div>
              <div className="p-2 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4">
                <span className="font-semibold text-foreground sm:w-40 shrink-0">Show document stats</span>
                <span className="text-foreground/75">Displays word, line, and page counts below the typing frame.</span>
              </div>
              <div className="p-2 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4">
                <span className="font-semibold text-foreground sm:w-40 shrink-0">Session target tracker</span>
                <span className="text-foreground/75">Sets a target word count with a live progress bar above the platen.</span>
              </div>
              <div className="p-2 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4">
                <span className="font-semibold text-foreground sm:w-40 shrink-0">Show clock & Timer style</span>
                <span className="text-foreground/75">Shows the clock above the platen. Choose <strong>Snapshot</strong> (tap clock to stamp time and count elapsed minutes) or <strong>Pomodoro</strong> (25m focus countdown followed by 5m break).</span>
              </div>
              <div className="p-2 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4">
                <span className="font-semibold text-foreground sm:w-40 shrink-0">Allow backspace</span>
                <span className="text-foreground/75">When enabled, Backspace steps backward to strike out text. When disabled, drafting is forward-only.</span>
              </div>
              <div className="p-2 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4">
                <span className="font-semibold text-foreground sm:w-40 shrink-0">Enable sound</span>
                <span className="text-foreground/75">Synthesized mechanical typewriter keystrokes, carriage returns, and Pomodoro timer audio alerts.</span>
              </div>
            </div>
          </section>

          {/* Section 3: Keyboard Shortcuts */}
          <section className="flex flex-col gap-2 pt-1">
            <div className="flex items-center gap-2 text-primary font-semibold text-xs tracking-wider uppercase">
              <Terminal className="w-3.5 h-3.5" />
              <h3>Keyboard Shortcuts</h3>
            </div>
            <div className="border border-border/70 rounded-[2px] overflow-hidden">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-muted/40 border-b border-border/70 text-foreground/80 font-semibold">
                  <tr>
                    <th className="p-2">Action</th>
                    <th className="p-2 text-right">Shortcut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50 text-foreground/75">
                  <tr>
                    <td className="p-2">Document / Manuscript modal</td>
                    <td className="p-2 text-right font-mono">
                      <kbd className="px-1.5 py-0.5 border border-border/80 bg-muted/30 rounded-[2px]">Ctrl + D</kbd>
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2">Projects / Library modal</td>
                    <td className="p-2 text-right font-mono">
                      <kbd className="px-1.5 py-0.5 border border-border/80 bg-muted/30 rounded-[2px]">Ctrl + O</kbd>{' '}
                      <span className="opacity-50">or</span>{' '}
                      <kbd className="px-1.5 py-0.5 border border-border/80 bg-muted/30 rounded-[2px]">Ctrl + P</kbd>
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2">Settings drawer</td>
                    <td className="p-2 text-right font-mono">
                      <kbd className="px-1.5 py-0.5 border border-border/80 bg-muted/30 rounded-[2px]">Ctrl + ,</kbd>
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2">Help & instructions</td>
                    <td className="p-2 text-right font-mono">
                      <kbd className="px-1.5 py-0.5 border border-border/80 bg-muted/30 rounded-[2px]">Ctrl + /</kbd>{' '}
                      <span className="opacity-50">or</span>{' '}
                      <kbd className="px-1.5 py-0.5 border border-border/80 bg-muted/30 rounded-[2px]">F1</kbd>
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2">Start new drafting session</td>
                    <td className="p-2 text-right font-mono">
                      <kbd className="px-1.5 py-0.5 border border-border/80 bg-muted/30 rounded-[2px]">Ctrl + Shift + N</kbd>
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2">Set aperture height (1–10 lines)</td>
                    <td className="p-2 text-right font-mono">
                      <kbd className="px-1.5 py-0.5 border border-border/80 bg-muted/30 rounded-[2px]">Ctrl + 1..0</kbd>
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2">Shrink / expand aperture lines</td>
                    <td className="p-2 text-right font-mono">
                      <kbd className="px-1.5 py-0.5 border border-border/80 bg-muted/30 rounded-[2px]">Ctrl + [</kbd>{' '}
                      <span className="opacity-50">/</span>{' '}
                      <kbd className="px-1.5 py-0.5 border border-border/80 bg-muted/30 rounded-[2px]">Ctrl + ]</kbd>
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2">Highlight character backward</td>
                    <td className="p-2 text-right font-mono">
                      <kbd className="px-1.5 py-0.5 border border-border/80 bg-muted/30 rounded-[2px]">Backspace</kbd>
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2">Highlight word backward</td>
                    <td className="p-2 text-right font-mono">
                      <kbd className="px-1.5 py-0.5 border border-border/80 bg-muted/30 rounded-[2px]">Alt/Ctrl + Backspace</kbd>
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2">Strike out highlighted text</td>
                    <td className="p-2 text-right font-mono">
                      <kbd className="px-1.5 py-0.5 border border-border/80 bg-muted/30 rounded-[2px]">Any key</kbd>{' '}
                      <span className="opacity-50">or</span>{' '}
                      <kbd className="px-1.5 py-0.5 border border-border/80 bg-muted/30 rounded-[2px]">Enter</kbd>
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2">Close open modal / cancel prompt</td>
                    <td className="p-2 text-right font-mono">
                      <kbd className="px-1.5 py-0.5 border border-border/80 bg-muted/30 rounded-[2px]">Escape</kbd>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
