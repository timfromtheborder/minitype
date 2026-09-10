import { CharacterCell, LineRecord, WrapMode } from '@/types';

export const MAX_COLUMNS = 70;

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
 * Invoked when typing at column 69 or when a word exceeds column bounds.
 */
export function wrapLine(
  currentLine: LineRecord,
  incomingChar: string,
  pageNumber: number,
  nextLineIndex: number,
  _wrapMode: WrapMode = 'soft'
): WrapResult {
  const currentCells = [...currentLine.cells];

  // Soft Word Wrap:
  // If incomingChar is a space, it naturally ends the line cleanly.
  if (incomingChar === ' ') {
    const nextCell: CharacterCell = {
      id: createCellId(pageNumber, nextLineIndex, 0),
      char: ' ',
      state: 'standard',
      colIndex: 0,
      lineIndex: nextLineIndex,
      isSoftPadding: false,
    };
    return {
      updatedCurrentLine: {
        ...currentLine,
        isCommitted: true,
      },
      nextLineCells: [],
    };
  }

  // Look backward on currentLine to find the start of the word that is overflowing.
  let lastSpaceIndex = -1;
  for (let i = currentCells.length - 1; i >= 0; i--) {
    if (currentCells[i].char === ' ' && !currentCells[i].isSoftPadding) {
      lastSpaceIndex = i;
      break;
    }
  }

  // If no space exists on the current line, the word spans the entire line (>= 70 chars).
  // Under mechanical constraints, it must hard-break at the boundary.
  if (lastSpaceIndex === -1) {
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
      },
      nextLineCells: [nextCell],
    };
  }

  // The word starts at lastSpaceIndex + 1
  const wordStartIndex = lastSpaceIndex + 1;
  const wordCells = currentCells.slice(wordStartIndex);

  // Pad the vacated trailing cells of currentLine with isSoftPadding: true
  const updatedCells: CharacterCell[] = [
    ...currentCells.slice(0, wordStartIndex),
  ];

  for (let i = wordStartIndex; i < MAX_COLUMNS; i++) {
    updatedCells.push({
      id: createCellId(pageNumber, currentLine.lineIndex, i),
      char: ' ',
      state: 'standard',
      colIndex: i,
      lineIndex: currentLine.lineIndex,
      isSoftPadding: true,
    });
  }

  // Move the carried word cells to nextLine, starting at colIndex 0
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

  return {
    updatedCurrentLine: {
      ...currentLine,
      cells: updatedCells,
      isCommitted: true,
      explicitTrailingWhitespace: true,
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
