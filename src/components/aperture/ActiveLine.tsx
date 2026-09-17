import React from 'react';
import { LineRecord } from '@/types';
import { CharacterCell } from './CharacterCell';

interface ActiveLineProps {
  line: LineRecord;
  lineIndex: number;
  activeColIndex: number;
  isLocked: boolean;
  isHighlighting: boolean;
}

export const ActiveLine: React.FC<ActiveLineProps> = ({
  line,
  lineIndex,
  activeColIndex,
  isLocked,
  isHighlighting,
}) => {
  return (
    <div
      data-line-index={lineIndex}
      className="flex flex-row items-center font-mono leading-[1.1] h-[1.25rem] whitespace-pre select-none relative w-full"
    >
      {line.cells.map((cell) => (
        <CharacterCell key={cell.id} cell={cell} />
      ))}

      {/* Typing Head Block Cursor - GPU-accelerated absolute overlay */}
      {!isHighlighting && (
        <span
          data-cursor="typing-head"
          className={`absolute left-0 top-[calc((1.25rem-1.15em)/2)] w-[1ch] h-[1.15em] font-mono select-none pointer-events-none ${
            isLocked
              ? 'bg-amber-500 animate-pulse'
              : 'animate-[pulse_1s_infinite]'
          }`}
          style={{
            transform: `translateX(${activeColIndex}ch)`,
            backgroundColor: isLocked ? '#f59e0b' : 'var(--cursor-color, currentColor)',
          }}
          aria-hidden="true"
        />
      )}
    </div>
  );
};
