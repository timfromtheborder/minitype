import React from 'react';
import { LineRecord, ApertureHeight } from '@/types';
import { HistoricalLine } from './HistoricalLine';
import { ActiveLine } from './ActiveLine';

interface ApertureFrameProps {
  lines: LineRecord[];
  activeLineIndex: number;
  activeColIndex: number;
  height: ApertureHeight;
  isLocked: boolean;
  isHighlighting: boolean;
}

export const ApertureFrame: React.FC<ApertureFrameProps> = ({
  lines,
  activeLineIndex,
  activeColIndex,
  height,
  isLocked,
  isHighlighting,
}) => {
  // Prevent any mouse clicks from attempting to select text or move cursor
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  // Slice visible lines to respect activeApertureHeight
  const total = lines.length;
  const startIdx = Math.max(0, total - height);
  const visibleLines = lines.slice(startIdx);

  // Height of each line is 1.35rem with tightened 1.1x line spacing
  const LINE_HEIGHT_REM = 1.35;
  const viewportHeightRem = height * LINE_HEIGHT_REM;

  return (
    <div
      onMouseDown={handleMouseDown}
      className="relative flex flex-col justify-start w-fit max-w-[calc(100vw-2rem)] px-8 pt-4 pb-4 rounded-xl border border-border/70 bg-card text-card-foreground shadow-inner shadow-black/5 overflow-hidden select-none"
      style={{
        cursor: isLocked ? 'not-allowed' : 'default',
        userSelect: 'none',
      }}
    >
      {/* 70-character column guide top ruler marker (permanently fixed at the top of the box) */}
      <div className="flex items-center justify-between w-[71ch] font-mono select-none pointer-events-none mb-3 shrink-0">
        <span className="text-[10px] font-semibold text-muted-foreground/45">01</span>
        <span className="flex-1 text-[10px] text-center overflow-hidden tracking-widest text-muted-foreground/25 opacity-70 px-2">
          · · · · · · · · · · · · · · · · · · · ·
        </span>
        <span className="text-[10px] font-semibold text-muted-foreground/60 px-1">35</span>
        <span className="flex-1 text-[10px] text-center overflow-hidden tracking-widest text-muted-foreground/25 opacity-70 px-2">
          · · · · · · · · · · · · · · · · · · · ·
        </span>
        <span className="text-[10px] font-semibold text-muted-foreground/45">70</span>
      </div>

      {/* Drafting lines viewport: fixed height based on aperture capacity, scrolling upward from bottom platen */}
      <div
        className="flex flex-col justify-end w-[71ch] overflow-hidden"
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

          return (
            <HistoricalLine
              key={line.id}
              line={line}
              lineIndex={actualIndex}
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
