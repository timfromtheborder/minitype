import React from 'react';
import { LineRecord } from '@/types';
import { CharacterCell } from './CharacterCell';

interface HistoricalLineProps {
  line: LineRecord;
  lineIndex: number;
  isTopmost?: boolean;
  activeColumnLimit?: number;
}

export const HistoricalLine = React.memo(function HistoricalLine({
  line,
  lineIndex,
  isTopmost = false,
  activeColumnLimit,
}: HistoricalLineProps) {
  const cellCount = line.cells.length;
  const scale = activeColumnLimit && cellCount > activeColumnLimit ? activeColumnLimit / cellCount : 1;

  return (
    <div
      data-line-index={lineIndex}
      className={`flex flex-row items-center font-mono leading-[1.1] h-[1.25rem] whitespace-pre select-none w-full transition-opacity duration-150 ${
        isTopmost ? 'opacity-65' : ''
      }`}
      style={
        scale < 1
          ? {
              transform: `scaleX(${scale})`,
              transformOrigin: 'left center',
              width: `${(1 / scale) * 100}%`,
            }
          : undefined
      }
    >
      {line.cells.map((cell) => (
        <CharacterCell key={cell.id} cell={cell} />
      ))}
    </div>
  );
});
