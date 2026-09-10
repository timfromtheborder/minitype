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
      className="flex flex-row items-center font-mono leading-[1.1] h-[1.35rem] whitespace-pre select-none w-[71ch]"
    >
      {line.cells.map((cell) => (
        <CharacterCell key={cell.id} cell={cell} />
      ))}
    </div>
  );
});
