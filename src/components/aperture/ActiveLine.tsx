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
      className="flex flex-row items-center font-mono leading-[1.1] h-[1.35rem] whitespace-pre select-none relative w-[71ch]"
    >
      {line.cells.map((cell) => (
        <CharacterCell key={cell.id} cell={cell} />
      ))}

      {/* Typing Head Block Cursor */}
      {!isHighlighting && (
        <span
          data-cursor="typing-head"
          className={`inline-block shrink-0 w-[1ch] h-[1.15em] font-mono select-none pointer-events-none transition-colors duration-200 ${
            isLocked
              ? 'bg-amber-500 animate-pulse'
              : 'animate-[pulse_1s_infinite]'
          }`}
          style={{
            backgroundColor: isLocked ? '#f59e0b' : 'var(--cursor-color, currentColor)',
          }}
          aria-hidden="true"
        />
      )}
    </div>
  );
};
