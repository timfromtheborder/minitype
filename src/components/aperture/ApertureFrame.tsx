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

  // Height of each line is 2rem (32px)
  const containerHeightRem = height * 2;

  return (
    <div
      onMouseDown={handleMouseDown}
      className="relative flex flex-col justify-end w-fit max-w-[calc(100vw-2rem)] px-8 py-5 rounded-xl border border-border/70 bg-card shadow-inner shadow-black/5 overflow-hidden select-none"
      style={{
        height: `${containerHeightRem + 2.5}rem`,
        cursor: isLocked ? 'not-allowed' : 'default',
        userSelect: 'none',
      }}
    >
      {/* 70-character column guide top ruler marker (aligned precisely with 70 columns below) */}
      <div className="relative w-[70ch] h-4 mb-2 font-mono text-muted-foreground/40 select-none pointer-events-none">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-b border-border/40" />
        <span className="absolute left-0 bg-card pr-1 text-[10px] leading-none">01</span>
        <span className="absolute left-1/2 -translate-x-1/2 bg-card px-1.5 text-[10px] leading-none">
          35
        </span>
        <span className="absolute right-0 bg-card pl-1 text-[10px] leading-none">70</span>
      </div>

      <div className="flex flex-col justify-end w-[71ch]">
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
