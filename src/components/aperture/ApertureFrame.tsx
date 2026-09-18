import React, { useRef, useEffect, useState } from 'react';
import { LineRecord, ApertureHeight } from '@/types';
import { useTypingStore } from '@/stores/typingStore';
import { HistoricalLine } from './HistoricalLine';
import { ActiveLine } from './ActiveLine';
import { MobileKeyboardBridge, MobileKeyboardBridgeHandle } from './MobileKeyboardBridge';
import { typewriterAudio } from '@/lib/sound';

interface ApertureFrameProps {
  lines?: LineRecord[];
  activeLineIndex?: number;
  activeColIndex?: number;
  height?: ApertureHeight;
  isLocked?: boolean;
  isHighlighting?: boolean;
  isPaused?: boolean;
}

export const ApertureFrame: React.FC<ApertureFrameProps> = React.memo(function ApertureFrame({
  lines: propLines,
  activeLineIndex: propActiveLineIndex,
  activeColIndex: propActiveColIndex,
  height: propHeight,
  isLocked: propIsLocked,
  isHighlighting: propIsHighlighting,
  isPaused = false,
}) {
  const bridgeRef = useRef<MobileKeyboardBridgeHandle>(null);
  const storeLines = useTypingStore((state) => state.currentPageLines);
  const storeActiveLineIndex = useTypingStore((state) => state.activeLineIndex);
  const storeActiveColIndex = useTypingStore((state) => state.activeColIndex);
  const storeHeight = useTypingStore((state) => state.manifest.activeApertureHeight);
  const storeIsLocked = useTypingStore((state) => state.isLocked);
  const storeIsHighlighting = useTypingStore((state) => state.isHighlighting);

  const lines = propLines ?? storeLines;
  const activeLineIndex = propActiveLineIndex ?? storeActiveLineIndex;
  const activeColIndex = propActiveColIndex ?? storeActiveColIndex;
  const height = propHeight ?? storeHeight;
  const isLocked = propIsLocked ?? storeIsLocked;
  const isHighlighting = propIsHighlighting ?? storeIsHighlighting;

  const activeColumnLimit = useTypingStore((state) => state.activeColumnLimit);
  const setActiveColumnLimit = useTypingStore((state) => state.setActiveColumnLimit);
  const pageMode = useTypingStore((state) => state.manifest.pageMode);
  const textSize = useTypingStore((state) => state.manifest.textSize);
  const currentPageNumber = useTypingStore((state) => state.currentPageNumber);

  // Faint flash effect when a full notecard is cleared
  const [isNotecardFlashing, setIsNotecardFlashing] = useState(false);
  const prevPageNumRef = useRef(currentPageNumber);

  useEffect(() => {
    if (pageMode === 'notecard' && currentPageNumber > prevPageNumRef.current) {
      setIsNotecardFlashing(true);
      const timer = setTimeout(() => {
        setIsNotecardFlashing(false);
      }, 180);
      prevPageNumRef.current = currentPageNumber;
      return () => clearTimeout(timer);
    }
    prevPageNumRef.current = currentPageNumber;
  }, [currentPageNumber, pageMode]);

  // Monitor portrait viewport and text size to switch platen column bounds dynamically
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkLimit = () => {
      const isPortraitOrientation =
        (typeof window.matchMedia === 'function' && window.matchMedia('(orientation: portrait)').matches) ||
        window.innerHeight > window.innerWidth;

      if (!isPortraitOrientation) {
        // Landscape orientation: standard 70 columns (unless extreme phone < 560px)
        const limit = window.innerWidth <= 560 ? 35 : 70;
        setActiveColumnLimit(limit);
        document.documentElement.setAttribute('data-column-limit', String(limit));
        return;
      }

      // In portrait orientation:
      // 1. Mobile portrait viewports (<= 640px) are locked to 35 columns
      if (window.innerWidth <= 640) {
        setActiveColumnLimit(35);
        document.documentElement.setAttribute('data-column-limit', '35');
        return;
      }

      // 2. Larger portrait devices (e.g. tablets/foldables 641px - 1024px):
      // When text size is L or XL, 70 columns overflows the platen; switch to 35
      const isLargeText = textSize === 'l' || textSize === 'xl';

      // Deterministic calculation without DOM span measurement (Pillar 1):
      // Standard monospace 1ch = 0.6 * fontSize.
      // Base font sizes: S=14px, M=16px, L=18px, XL=24px (default 16px).
      const baseFontSize = textSize === 's' ? 14 : textSize === 'l' ? 18 : textSize === 'xl' ? 24 : 16;
      const estimatedWidth = 71 * (baseFontSize * 0.6);
      const padding = pageMode === 'notecard' ? 84 : 52;
      const overflows = isLargeText || (estimatedWidth + padding > window.innerWidth);

      const finalLimit = overflows ? 35 : 70;
      setActiveColumnLimit(finalLimit);
      document.documentElement.setAttribute('data-column-limit', String(finalLimit));
    };

    checkLimit();

    const portraitQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(orientation: portrait)') : null;
    const mobileQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 640px)') : null;

    window.addEventListener('resize', checkLimit);
    portraitQuery?.addEventListener?.('change', checkLimit);
    mobileQuery?.addEventListener?.('change', checkLimit);

    return () => {
      window.removeEventListener('resize', checkLimit);
      portraitQuery?.removeEventListener?.('change', checkLimit);
      mobileQuery?.removeEventListener?.('change', checkLimit);
    };
  }, [setActiveColumnLimit, textSize, pageMode]);

  // Prevent mouse click highlighting on desktop, but trigger proxy bridge focus on mobile tap
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  const handleFrameTap = () => {
    typewriterAudio.unlockAudio();
    if (!isPaused && !isLocked) {
      bridgeRef.current?.focus();
    }
  };

  // Slice visible lines to respect activeApertureHeight
  const total = lines.length;
  const startIdx = Math.max(0, total - height);
  const visibleLines = lines.slice(startIdx);

  // Height of each line is 1.25rem with tightened 1.1x line spacing
  const LINE_HEIGHT_REM = 1.25;
  const viewportHeightRem = height * LINE_HEIGHT_REM;

  const isPortrait = activeColumnLimit === 35;
  const platenWidthClass = isPortrait ? 'w-[36ch]' : 'w-[71ch]';

  const isNotecard = pageMode === 'notecard';

  return (
    <div
      suppressHydrationWarning
      onMouseDown={handleMouseDown}
      onClick={handleFrameTap}
      onTouchEnd={handleFrameTap}
      className={`relative flex flex-col justify-start w-fit max-w-[calc(100vw-1.5rem)] sm:max-w-[calc(100vw-2.5rem)] ${
        isNotecard ? 'pl-4 sm:pl-7 pr-2.5 sm:pr-6 md:px-8' : 'px-2.5 sm:px-6 md:px-8'
      } pt-2.5 pb-2 rounded-[2px] border border-border/70 bg-card text-card-foreground shadow-inner shadow-black/5 overflow-hidden select-none text-sm sm:text-base cursor-pointer font-mono`}
      style={{
        cursor: isLocked ? 'not-allowed' : 'text',
        userSelect: 'none',
      }}
    >
      {/* Faint flash on platen background when a full notecard is cleared */}
      {isNotecardFlashing && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-foreground platen-flash-effect z-10"
        />
      )}

      {/* Invisible off-screen proxy bridge for summoning on-screen virtual keyboard */}
      <MobileKeyboardBridge ref={bridgeRef} isPaused={isPaused} />

      {/* Column guide top ruler marker (permanently fixed at top of the platen) */}
      {isPortrait ? (
        <div suppressHydrationWarning className={`flex items-center justify-between ${platenWidthClass} font-mono select-none pointer-events-none mb-1.5 shrink-0 whitespace-nowrap overflow-hidden leading-none`}>
          <span className="text-[0.625rem] font-semibold text-muted-foreground/45 shrink-0">01</span>
          <span className="flex-1 text-[0.625rem] text-center overflow-hidden whitespace-nowrap truncate tracking-widest text-muted-foreground/25 opacity-70 px-1">
            · · · · · · · · · · · · ·
          </span>
          <span className="text-[0.625rem] font-semibold text-muted-foreground/45 shrink-0">35</span>
        </div>
      ) : (
        <div suppressHydrationWarning className={`flex items-center justify-between ${platenWidthClass} font-mono select-none pointer-events-none mb-1.5 shrink-0 whitespace-nowrap overflow-hidden leading-none`}>
          <span className="text-[0.625rem] font-semibold text-muted-foreground/45 shrink-0">01</span>
          <span className="flex-1 text-[0.625rem] text-center overflow-hidden whitespace-nowrap truncate tracking-widest text-muted-foreground/25 opacity-70 px-1">
            · · · · · · · · · · · · ·
          </span>
          <span className="text-[0.625rem] font-semibold text-muted-foreground/45 px-1 shrink-0">35</span>
          <span className="flex-1 text-[0.625rem] text-center overflow-hidden whitespace-nowrap truncate tracking-widest text-muted-foreground/25 opacity-70 px-1">
            · · · · · · · · · · · · ·
          </span>
          <span className="text-[0.625rem] font-semibold text-muted-foreground/45 shrink-0">70</span>
        </div>
      )}

      {/* Drafting lines viewport: fixed height based on aperture capacity, scrolling upward from bottom platen */}
      <div suppressHydrationWarning className="relative flex flex-row justify-center">
        {/* Line numbers column in notecard mode */}
        {isNotecard && (
          <div
            aria-hidden="true"
            suppressHydrationWarning
            className="absolute right-[calc(100%+0.75rem)] sm:right-[calc(100%+1.25rem)] top-0 bottom-0 flex flex-col justify-end select-none pointer-events-none"
            style={{
              height: 'var(--aperture-height-rem)',
              minHeight: 'var(--aperture-height-rem)',
              contain: 'layout size',
              transition: 'height 120ms cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            {visibleLines.map((line, idx) => {
              const actualIndex = startIdx + idx;
              return (
                <div
                  key={line.id}
                  className="h-[1.25rem] flex items-center justify-end text-[0.625rem] font-semibold text-muted-foreground/45 font-mono leading-none tabular-nums"
                >
                  {line.isSessionDivider ? '' : actualIndex + 1}
                </div>
              );
            })}
          </div>
        )}

        <div
          suppressHydrationWarning
          className={`flex flex-col justify-end ${platenWidthClass} overflow-hidden`}
          style={{
            height: 'var(--aperture-height-rem)',
            minHeight: 'var(--aperture-height-rem)',
            contain: 'layout size',
            transition: 'height 120ms cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {visibleLines.map((line, idx) => {
            const actualIndex = startIdx + idx;
            const isActive = actualIndex === activeLineIndex;

            if (line.isSessionDivider) {
              return (
                <div
                  key={line.id}
                  className="relative w-full h-[1.25rem] flex items-center justify-center select-none pointer-events-none"
                >
                  <div className="w-full border-t border-dashed border-card-foreground/30" />
                </div>
              );
            }

            // A line is at the topmost spot of the aperture window ONLY when the aperture is completely
            // full to capacity (visibleLines.length === height) and this line occupies the 0th (topmost) slot.
            // Fading effect is strictly enabled only in endless scroll mode.
            const isOldestInAperture =
              pageMode === 'scroll' && visibleLines.length === height && height > 1 && idx === 0;

            return (
              <div key={line.id} className="relative w-full">
                {isActive ? (
                  <ActiveLine
                    line={line}
                    lineIndex={actualIndex}
                    activeColIndex={activeColIndex}
                    isLocked={isLocked}
                    isHighlighting={isHighlighting}
                  />
                ) : (
                  <HistoricalLine
                    line={line}
                    lineIndex={actualIndex}
                    isTopmost={isOldestInAperture}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Accessibility Live Region for Screen Readers: throttled to line and highlight transitions */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {isHighlighting ? 'Highlighting strikeout' : `Line ${activeLineIndex + 1}, Column ${activeColIndex + 1}`}
      </div>

      {/* Mechanical Platen Roller Line Bar Indicator */}
      <div
        aria-hidden="true"
        className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary/20 pointer-events-none"
      />
    </div>
  );
});
