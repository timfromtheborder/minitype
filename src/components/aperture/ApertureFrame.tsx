import React, { useRef, useEffect } from 'react';
import { LineRecord, ApertureHeight } from '@/types';
import { useTypingStore } from '@/stores/typingStore';
import { HistoricalLine } from './HistoricalLine';
import { ActiveLine } from './ActiveLine';
import { MobileKeyboardBridge, MobileKeyboardBridgeHandle } from './MobileKeyboardBridge';

interface ApertureFrameProps {
  lines: LineRecord[];
  activeLineIndex: number;
  activeColIndex: number;
  height: ApertureHeight;
  isLocked: boolean;
  isHighlighting: boolean;
  isPaused?: boolean;
}

export const ApertureFrame: React.FC<ApertureFrameProps> = ({
  lines,
  activeLineIndex,
  activeColIndex,
  height,
  isLocked,
  isHighlighting,
  isPaused = false,
}) => {
  const bridgeRef = useRef<MobileKeyboardBridgeHandle>(null);
  const activeColumnLimit = useTypingStore((state) => state.activeColumnLimit);
  const setActiveColumnLimit = useTypingStore((state) => state.setActiveColumnLimit);
  const pageMode = useTypingStore((state) => state.manifest.pageMode);

  // Monitor portrait mobile viewport to switch platen column bounds dynamically
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(max-width: 640px) and (orientation: portrait)');
    const updateLimit = () => {
      setActiveColumnLimit(mediaQuery.matches ? 35 : 70);
    };
    updateLimit();
    mediaQuery.addEventListener('change', updateLimit);
    return () => mediaQuery.removeEventListener('change', updateLimit);
  }, [setActiveColumnLimit]);

  // Prevent mouse click highlighting on desktop, but trigger proxy bridge focus on mobile tap
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  const handleFrameTap = () => {
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

  return (
    <div
      onMouseDown={handleMouseDown}
      onClick={handleFrameTap}
      onTouchEnd={handleFrameTap}
      className="relative flex flex-col justify-start w-fit max-w-[calc(100vw-1.5rem)] sm:max-w-[calc(100vw-2.5rem)] px-2.5 sm:px-6 md:px-8 pt-2.5 pb-2 rounded-[2px] border border-border/70 bg-card text-card-foreground shadow-inner shadow-black/5 overflow-hidden select-none text-sm sm:text-base cursor-pointer font-mono"
      style={{
        cursor: isLocked ? 'not-allowed' : 'text',
        userSelect: 'none',
      }}
    >
      {/* Invisible off-screen proxy bridge for summoning on-screen virtual keyboard */}
      <MobileKeyboardBridge ref={bridgeRef} isPaused={isPaused} />

      {/* Column guide top ruler marker (permanently fixed at top of the platen) */}
      {isPortrait ? (
        <div className={`flex items-center justify-between ${platenWidthClass} font-mono select-none pointer-events-none mb-1.5 shrink-0 whitespace-nowrap overflow-hidden leading-none`}>
          <span className="text-[10px] font-semibold text-muted-foreground/45 shrink-0">01</span>
          <span className="flex-1 text-[10px] text-center overflow-hidden whitespace-nowrap truncate tracking-widest text-muted-foreground/25 opacity-70 px-1">
            · · · · · · · · · · · · ·
          </span>
          <span className="text-[10px] font-semibold text-muted-foreground/45 shrink-0">35</span>
        </div>
      ) : (
        <div className={`flex items-center justify-between ${platenWidthClass} font-mono select-none pointer-events-none mb-1.5 shrink-0 whitespace-nowrap overflow-hidden leading-none`}>
          <span className="text-[10px] font-semibold text-muted-foreground/45 shrink-0">01</span>
          <span className="flex-1 text-[10px] text-center overflow-hidden whitespace-nowrap truncate tracking-widest text-muted-foreground/25 opacity-70 px-1">
            · · · · · · · · · · · · ·
          </span>
          <span className="text-[10px] font-semibold text-muted-foreground/60 px-1 shrink-0">35</span>
          <span className="flex-1 text-[10px] text-center overflow-hidden whitespace-nowrap truncate tracking-widest text-muted-foreground/25 opacity-70 px-1">
            · · · · · · · · · · · · ·
          </span>
          <span className="text-[10px] font-semibold text-muted-foreground/45 shrink-0">70</span>
        </div>
      )}

      {/* Drafting lines viewport: fixed height based on aperture capacity, scrolling upward from bottom platen */}
      <div
        className={`flex flex-col justify-end ${platenWidthClass} overflow-hidden`}
        style={{ height: `${viewportHeightRem}rem` }}
      >
        {visibleLines.map((line, idx) => {
          const actualIndex = startIdx + idx;
          const isActive = actualIndex === activeLineIndex;

          if (isActive) {
            return (
              <ActiveLine
                key={line.id}
                line={line}
                lineIndex={actualIndex}
                activeColIndex={activeColIndex}
                isLocked={isLocked}
                isHighlighting={isHighlighting}
              />
            );
          }

          // A line is at the topmost spot of the aperture window ONLY when the aperture is completely
          // full to capacity (visibleLines.length === height) and this line occupies the 0th (topmost) slot.
          // Fading effect is strictly enabled only in endless scroll mode.
          const isOldestInAperture =
            pageMode === 'scroll' && visibleLines.length === height && height > 1 && idx === 0;

          return (
            <HistoricalLine
              key={line.id}
              line={line}
              lineIndex={actualIndex}
              isTopmost={isOldestInAperture}
            />
          );
        })}
      </div>

      {/* Mechanical Platen Roller Line Bar Indicator */}
      <div
        aria-hidden="true"
        className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary/20 pointer-events-none"
      />
    </div>
  );
};
