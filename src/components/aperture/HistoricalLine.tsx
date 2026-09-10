import React from 'react';
import { LineRecord } from '@/types';
import { CharacterCell } from './CharacterCell';

interface HistoricalLineProps {
  line: LineRecord;
  lineIndex: number;
}

export const HistoricalLine = React.memo(function HistoricalLine({
  line,
  lineIndex,
}: HistoricalLineProps) {
  return (
    <div
      data-line-index={lineIndex}
      className="flex flex-row items-center font-mono leading-relaxed tracking-wider h-[2rem] whitespace-pre select-none"
    >
      {line.cells.map((cell) => (
        <CharacterCell key={cell.id} cell={cell} />
      ))}
    </div>
  );
});
