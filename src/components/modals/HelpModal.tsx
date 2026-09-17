'use client';

import React, { useEffect, useRef } from 'react';
import { HelpCircle, CornerUpLeft, Terminal, Type, Clock, Settings, Layers, ShieldCheck, Zap } from 'lucide-react';

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
        className="w-full max-w-3xl h-[calc(100dvh-5.5rem)] max-h-[calc(100dvh-5.5rem)] landscape:h-[calc(100dvh-3.5rem)] landscape:max-h-[calc(100dvh-3.5rem)] sm:h-[620px] sm:max-h-[620px] my-auto rounded-[2px] border border-border bg-background text-foreground shadow-2xl flex flex-col select-none relative overflow-hidden p-3 sm:p-5 gap-3 focus:outline-none"
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
        <div className="flex-1 overflow-y-auto square-scrollbar pr-1 flex flex-col gap-6 text-xs font-sans text-foreground/90 select-text leading-relaxed">
          {/* Section 1: The Minitype Method */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-primary font-semibold text-xs tracking-wider uppercase">
              <Zap className="w-3.5 h-3.5" />
              <h3>The Minitype Method</h3>
            </div>
            <p className="text-foreground/80">
              Minitype is a distraction-free, forward-momentum drafting tool modeled on mechanical typewriter constraints. It is designed to silence the inner editor and build uninterrupted writing flow.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-[11px]">
              <div className="p-2.5 rounded-[2px] border border-border/70 bg-muted/20 flex flex-col gap-1">
                <span className="font-semibold text-foreground">Strict Monospace Grid</span>
                <span className="text-foreground/70">Locked to exactly 70 columns (35 in mobile portrait). No native text boxes, inputs, or contenteditables.</span>
              </div>
              <div className="p-2.5 rounded-[2px] border border-border/70 bg-muted/20 flex flex-col gap-1">
                <span className="font-semibold text-foreground">No Pointer / No Paste</span>
                <span className="text-foreground/70">Clicking the aperture will not move the cursor. Clipboard pasting is blocked to protect raw writing momentum.</span>
              </div>
            </div>
          </section>

          {/* Section 2: Strikeout & Backspace Mechanics */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-primary font-semibold text-xs tracking-wider uppercase">
              <ShieldCheck className="w-3.5 h-3.5" />
              <h3>Backspace & Strikeout Mechanics</h3>
            </div>
            <p className="text-foreground/80">
              Backward character erasure is strictly disabled. The <kbd className="px-1 py-0.5 border border-border/80 bg-muted/40 rounded-[2px] font-mono text-[10px]">Delete</kbd> key is locked.
            </p>
            <ul className="list-disc list-inside space-y-1 text-foreground/75 text-[11px] pl-1">
              <li>
                <strong className="text-foreground">Highlight Mode:</strong> Pressing <kbd className="px-1 py-0.5 border border-border/80 bg-muted/40 rounded-[2px] font-mono text-[10px]">Backspace</kbd> steps backward cell-by-cell. Holding <kbd className="px-1 py-0.5 border border-border/80 bg-muted/40 rounded-[2px] font-mono text-[10px]">Alt</kbd> or <kbd className="px-1 py-0.5 border border-border/80 bg-muted/40 rounded-[2px] font-mono text-[10px]">Ctrl</kbd> steps word-by-word.
              </li>
              <li>
                <strong className="text-foreground">Physical Strikeout:</strong> Typing any printable character or pressing <kbd className="px-1 py-0.5 border border-border/80 bg-muted/40 rounded-[2px] font-mono text-[10px]">Enter</kbd> permanently strikes through the highlighted cells (<code className="font-mono text-[11px]">---</code>), unhighlights, and resumes forward drafting.
              </li>
              <li>
                <strong className="text-foreground">Carriage Return Cancel:</strong> Pressing Backspace on a fresh empty newline cancels the carriage return, plays a mechanical strike sound, and restores the cursor to the end of the previous line.
              </li>
            </ul>
          </section>

          {/* Section 3: Aperture & Page Modes */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-primary font-semibold text-xs tracking-wider uppercase">
              <Layers className="w-3.5 h-3.5" />
              <h3>Aperture & Page Modes</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="p-2.5 rounded-[2px] border border-border/70 bg-muted/20 flex flex-col gap-1">
                <span className="font-semibold text-foreground">Scroll Mode</span>
                <span className="text-foreground/70">Continuous drafting roll. When the aperture is full, the oldest line in the visible window fades to maintain forward focus.</span>
              </div>
              <div className="p-2.5 rounded-[2px] border border-border/70 bg-muted/20 flex flex-col gap-1">
                <span className="font-semibold text-foreground">Notecard Mode</span>
                <span className="text-foreground/70">Platen locks to exactly 10 lines per card, replicating index-card drafting. Your prior aperture height is restored when returning to Scroll mode.</span>
              </div>
            </div>
          </section>

          {/* Section 4: Sessions & Document Modal */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-primary font-semibold text-xs tracking-wider uppercase">
              <Type className="w-3.5 h-3.5" />
              <h3>Sessions & Documents</h3>
            </div>
            <p className="text-foreground/80">
              Minitype organizes your writing into immutable historical drafting sessions. Active sessions start lazily on your first typed character and are demarcated in the platen by inline dashed dividers.
            </p>
            <ul className="list-disc list-inside space-y-1 text-foreground/75 text-[11px] pl-1">
              <li><strong className="text-foreground">Publishing Standard Counting:</strong> Word counts match MS Word / Scrivener standards, treating hyphens, em-dashes, and slashes as genuine word boundaries.</li>
              <li><strong className="text-foreground">Document Modal:</strong> Press <kbd className="px-1 py-0.5 border border-border/80 bg-muted/40 rounded-[2px] font-mono text-[10px]">Ctrl + D</kbd> to inspect your full manuscript, toggle between Typewriter and Manuscript paragraph views, and close or start sessions.</li>
              <li><strong className="text-foreground">Plaintext Export:</strong> Download your sanitized document anytime as a clean <code className="font-mono text-[11px]">.txt</code> file from the Document modal.</li>
            </ul>
          </section>

          {/* Section 5: Clock & Pomodoro Suite */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-primary font-semibold text-xs tracking-wider uppercase">
              <Clock className="w-3.5 h-3.5" />
              <h3>Clock & Timer Suite</h3>
            </div>
            <p className="text-foreground/80">
              The clock in the top deck provides two distinct focus timer styles (configurable in Settings):
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="p-2.5 rounded-[2px] border border-border/70 bg-muted/20 flex flex-col gap-1">
                <span className="font-semibold text-foreground">Snapshot Timer</span>
                <span className="text-foreground/70">Clicking the clock stamps the start time and increments elapsed minutes (e.g. <code className="font-mono text-[10px]">10:40 +15</code>). Click badge to dismiss.</span>
              </div>
              <div className="p-2.5 rounded-[2px] border border-border/70 bg-muted/20 flex flex-col gap-1">
                <span className="font-semibold text-foreground">Pomodoro Countdown</span>
                <span className="text-foreground/70">25-minute focus countdown (<code className="font-mono text-[10px]">25:00</code>) with a 1-minute warning flash, followed by a 5-minute inverted break. Tap clock to restart at 25:00; tap badge to dismiss.</span>
              </div>
            </div>
          </section>

          {/* Section 6: Settings Guide */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-primary font-semibold text-xs tracking-wider uppercase">
              <Settings className="w-3.5 h-3.5" />
              <h3>Settings & Customization</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="p-2.5 rounded-[2px] border border-border/70 bg-muted/20 flex flex-col gap-1">
                <span className="font-semibold text-foreground">Themes & Phosphor</span>
                <span className="text-foreground/70">7 visual themes including Typewriter, Dark Amber, Spotlight, Dark Mode, High/Low Contrast, and customizable Phosphor CRT color palettes.</span>
              </div>
              <div className="p-2.5 rounded-[2px] border border-border/70 bg-muted/20 flex flex-col gap-1">
                <span className="font-semibold text-foreground">Sound & Aesthetics</span>
                <span className="text-foreground/70">Procedural Web Audio synthesis for mechanical key strikes, carriage bells, and paper feed. Toggle text size (S–XL) and typefaces.</span>
              </div>
            </div>
          </section>

          {/* Section 7: Keyboard Shortcuts */}
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
                      <kbd className="px-1.5 py-0.5 border border-border/80 bg-muted/30 rounded-[2px]">Any character</kbd>{' '}
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
