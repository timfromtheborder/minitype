import { CharacterCell, LineRecord, WrapMode } from '@/types';

export const MAX_COLUMNS = 70;
export const PORTRAIT_COLUMNS = 35;

export interface WrapResult {
  updatedCurrentLine: LineRecord;
  nextLineCells: CharacterCell[];
}

/**
 * Creates a unique ID for a character cell.
 */
export function createCellId(pageNumber: number, lineIndex: number, colIndex: number): string {
  return `p${pageNumber}-l${lineIndex}-c${colIndex}-${Math.random().toString(36).substring(2, 7)}`;
}

/**
 * Wraps an overflowing line based on WrapMode ('hard' | 'soft').
 * Invoked when typing at column boundary or when a word exceeds column bounds.
 */
export function wrapLine(
  currentLine: LineRecord,
  incomingChar: string,
  pageNumber: number,
  nextLineIndex: number,
  _wrapMode: WrapMode = 'soft',
  maxColumns: number = MAX_COLUMNS
): WrapResult {
  const currentCells = [...currentLine.cells];

  // Soft Word Wrap:
  // If incomingChar is a space, it naturally ends the line cleanly.
  if (incomingChar === ' ') {
    return {
      updatedCurrentLine: {
        ...currentLine,
        isCommitted: true,
        wrapType: 'soft',
      },
      nextLineCells: [],
    };
  }

  // Look backward on currentLine to find the start of the word or segment that is overflowing.
  // Respects standard ASCII hyphens '-' as break points (leaving the hyphen on current line).
  // Struck-out text must never softwrap to the next line and acts as a boundary.
  let breakIndex = -1;
  for (let i = currentCells.length - 1; i >= 0; i--) {
    const cell = currentCells[i];
    if (cell.isSoftPadding) continue;

    // Struck-out cell is an unmovable boundary on the current line
    if (cell.state === 'struck' || cell.isStruck) {
      breakIndex = i;
      break;
    }

    if (cell.char === ' ' || cell.char === '-') {
      breakIndex = i;
      break;
    }
  }

  // If no space, hyphen, or struck cell exists on the current line, the word spans the entire line.
  // Under mechanical constraints, it breaks at the 70-column boundary.
  if (breakIndex === -1) {
    const nextCell: CharacterCell = {
      id: createCellId(pageNumber, nextLineIndex, 0),
      char: incomingChar,
      state: 'standard',
      colIndex: 0,
      lineIndex: nextLineIndex,
    };

    return {
      updatedCurrentLine: {
        ...currentLine,
        isCommitted: true,
        wrapType: 'soft',
      },
      nextLineCells: [nextCell],
    };
  }

  // The wrapped segment starts at breakIndex + 1 (keeping the hyphen, space, or struck text on current line).
  // Strictly filter out any struck-out cells so they never soft-wrap.
  const wordStartIndex = breakIndex + 1;
  const wordCells = currentCells
    .slice(wordStartIndex)
    .filter((cell) => cell.state !== 'struck' && !cell.isStruck);

  // Pad the vacated trailing cells of currentLine with isSoftPadding: true
  const updatedCells: CharacterCell[] = [
    ...currentCells.slice(0, wordStartIndex),
  ];

  for (let i = wordStartIndex; i < maxColumns; i++) {
    updatedCells.push({
      id: createCellId(pageNumber, currentLine.lineIndex, i),
      char: ' ',
      state: 'standard',
      colIndex: i,
      lineIndex: currentLine.lineIndex,
      isSoftPadding: true,
    });
  }

  // Move the carried non-struck word cells to nextLine, starting at colIndex 0
  const nextLineCells: CharacterCell[] = wordCells.map((cell, idx) => ({
    ...cell,
    id: createCellId(pageNumber, nextLineIndex, idx),
    lineIndex: nextLineIndex,
    colIndex: idx,
    isSoftPadding: false,
  }));

  // Append the incoming character to nextLine
  nextLineCells.push({
    id: createCellId(pageNumber, nextLineIndex, nextLineCells.length),
    char: incomingChar,
    state: 'standard',
    colIndex: nextLineCells.length,
    lineIndex: nextLineIndex,
    isSoftPadding: false,
  });

  const brokeOnSpace = breakIndex >= 0 && currentCells[breakIndex].char === ' ';
  return {
    updatedCurrentLine: {
      ...currentLine,
      cells: updatedCells,
      isCommitted: true,
      wrapType: 'soft',
      explicitTrailingWhitespace: brokeOnSpace,
    },
    nextLineCells,
  };
}

/**
 * Finds the index of the last genuine (non-softPadding) character in a line.
 * Returns -1 if line has no printable cells.
 */
export function getLastPrintableCellIndex(cells: CharacterCell[]): number {
  for (let i = cells.length - 1; i >= 0; i--) {
    if (!cells[i].isSoftPadding) {
      return i;
    }
  }
  return -1;
}
