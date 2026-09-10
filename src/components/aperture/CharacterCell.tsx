import React from 'react';
import { CharacterCell as CharacterCellType } from '@/types';

interface CharacterCellProps {
  cell: CharacterCellType;
}

export const CharacterCell = React.memo(function CharacterCell({ cell }: CharacterCellProps) {
  const isHighlighted = cell.state === 'highlighted';
  const isStruck = cell.state === 'struck' || Boolean(cell.isStruck);

  // For soft-padding or regular space, render non-breaking space so layout does not collapse
  const displayChar = cell.char === ' ' || cell.isSoftPadding ? '\u00A0' : cell.char;

  return (
    <span
      data-cell-id={cell.id}
      data-col={cell.colIndex}
      data-state={cell.state}
      className={`inline-block shrink-0 relative font-mono text-center select-none w-[1ch] transition-colors duration-75 ${
        isHighlighted ? 'font-semibold' : ''
      } ${isStruck ? 'opacity-70' : ''}`}
      style={{
        userSelect: 'none',
        backgroundColor: isHighlighted ? 'var(--highlight-bg, rgba(220, 206, 178, 0.9))' : undefined,
        color: isHighlighted ? 'var(--highlight-text, inherit)' : undefined,
      }}
    >
      {displayChar}
      {isStruck && (
        <span
          aria-hidden="true"
          className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] pointer-events-none"
          style={{ backgroundColor: 'var(--struck-color, #C0392B)' }}
        />
      )}
    </span>
  );
});
