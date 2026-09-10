import React from 'react';
import { CharacterCell as CharacterCellType } from '@/types';

interface CharacterCellProps {
  cell: CharacterCellType;
}

export const CharacterCell = React.memo(function CharacterCell({ cell }: CharacterCellProps) {
  const isHighlighted = cell.state === 'highlighted';
  const isStruck = cell.state === 'struck';

  // For soft-padding or regular space, render non-breaking space so layout does not collapse
  const displayChar = cell.char === ' ' || cell.isSoftPadding ? '\u00A0' : cell.char;

  return (
    <span
      data-cell-id={cell.id}
      data-col={cell.colIndex}
      data-state={cell.state}
      className={`inline-block relative font-mono text-center select-none w-[1ch] transition-colors duration-75 ${
        isHighlighted
          ? 'bg-amber-400/50 text-foreground dark:bg-amber-500/60 font-semibold'
          : ''
      } ${
        isStruck
          ? 'opacity-70 line-through decoration-destructive decoration-2'
          : ''
      }`}
      style={{
        userSelect: 'none',
      }}
    >
      {displayChar}
      {isStruck && (
        <span
          aria-hidden="true"
          className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] bg-red-600 dark:bg-red-500 pointer-events-none"
        />
      )}
    </span>
  );
});
