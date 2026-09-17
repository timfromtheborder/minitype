import { CharacterCell, LineRecord } from '@/types';
import { createCellId } from './wrap';

export interface ReflowResult {
  lines: LineRecord[];
  activeLineIndex: number;
  activeColIndex: number;
}

interface Token {
  isSpace: boolean;
  cells: CharacterCell[];
}

function tokenizeCells(cells: CharacterCell[]): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < cells.length) {
    if (cells[i].char === ' ') {
      const spaceCells: CharacterCell[] = [];
      while (i < cells.length && cells[i].char === ' ') {
        spaceCells.push(cells[i]);
        i++;
      }
      tokens.push({ isSpace: true, cells: spaceCells });
    } else {
      const wordCells: CharacterCell[] = [];
      while (i < cells.length && cells[i].char !== ' ') {
        const c = cells[i];
        wordCells.push(c);
        i++;
        if (c.char === '-') {
          break;
        }
      }
      tokens.push({ isSpace: false, cells: wordCells });
    }
  }

  return tokens;
}

/**
 * Re-flows lines to fit targetColumnLimit (e.g. 35 for portrait, 70 for landscape)
 * without horizontally scaling characters or altering paragraph boundaries.
 */
export function reflowLines(
  lines: LineRecord[],
  targetColumnLimit: number,
  pageNumber: number = 1,
  activeLineIndex: number = 0,
  activeColIndex: number = 0
): ReflowResult {
  if (!lines || lines.length === 0) {
    return {
      lines: [
        {
          id: `p${pageNumber}-line-0`,
          lineIndex: 0,
          cells: [],
          isCommitted: false,
        },
      ],
      activeLineIndex: 0,
      activeColIndex: 0,
    };
  }

  type Block =
    | { type: 'divider'; originalLine: LineRecord; hasCursor: boolean }
    | {
        type: 'paragraph';
        lines: LineRecord[];
        hasCursor: boolean;
        cursorOffsetInParagraph: number;
        lastLineIsCommitted: boolean;
        lastLineWrapType?: 'soft' | 'hard';
      };

  const blocks: Block[] = [];
  let currentParaLines: LineRecord[] = [];
  let paraStartIndex = 0;

  const flushParagraph = () => {
    if (currentParaLines.length === 0) return;

    let hasCursor = false;
    let cursorOffset = -1;
    let runningOffset = 0;

    const lastLine = currentParaLines[currentParaLines.length - 1];

    for (let l = 0; l < currentParaLines.length; l++) {
      const lIdx = paraStartIndex + l;
      const line = currentParaLines[l];
      const nonPadding = line.cells.filter((c) => !c.isSoftPadding);

      if (lIdx === activeLineIndex) {
        hasCursor = true;
        let beforeCount = 0;
        for (let c = 0; c < Math.min(line.cells.length, activeColIndex); c++) {
          if (!line.cells[c].isSoftPadding) {
            beforeCount++;
          }
        }
        cursorOffset = runningOffset + beforeCount;
      }

      runningOffset += nonPadding.length;
      if (line.explicitTrailingWhitespace && nonPadding.length > 0 && nonPadding[nonPadding.length - 1].char !== ' ') {
        if (lIdx === activeLineIndex && activeColIndex >= line.cells.length) {
          cursorOffset = runningOffset;
        }
        runningOffset += 1;
      }
    }

    blocks.push({
      type: 'paragraph',
      lines: currentParaLines,
      hasCursor,
      cursorOffsetInParagraph: cursorOffset,
      lastLineIsCommitted: lastLine.isCommitted,
      lastLineWrapType: lastLine.wrapType ?? (lastLine.isCommitted ? 'hard' : undefined),
    });

    currentParaLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.isSessionDivider) {
      flushParagraph();
      blocks.push({
        type: 'divider',
        originalLine: line,
        hasCursor: i === activeLineIndex,
      });
      paraStartIndex = i + 1;
      continue;
    }

    if (currentParaLines.length === 0) {
      paraStartIndex = i;
    }
    currentParaLines.push(line);

    if (line.wrapType === 'hard') {
      flushParagraph();
      paraStartIndex = i + 1;
    }
  }

  flushParagraph();

  const finalLines: LineRecord[] = [];
  let finalActiveLineIndex = 0;
  let finalActiveColIndex = 0;
  let cursorAssigned = false;

  for (const block of blocks) {
    if (block.type === 'divider') {
      const lineIdx = finalLines.length;
      finalLines.push({
        id: `p${pageNumber}-line-${lineIdx}`,
        lineIndex: lineIdx,
        cells: [],
        isCommitted: true,
        wrapType: 'hard',
        isSessionDivider: true,
      });
      if (block.hasCursor && !cursorAssigned) {
        finalActiveLineIndex = lineIdx;
        finalActiveColIndex = 0;
        cursorAssigned = true;
      }
      continue;
    }

    // Paragraph block
    const genuineCells: CharacterCell[] = [];
    for (let l = 0; l < block.lines.length; l++) {
      const line = block.lines[l];
      const nonPadding = line.cells.filter((c) => !c.isSoftPadding);
      genuineCells.push(...nonPadding);

      if (line.explicitTrailingWhitespace && nonPadding.length > 0 && nonPadding[nonPadding.length - 1].char !== ' ') {
        genuineCells.push({
          id: `p${pageNumber}-synth-${l}`,
          char: ' ',
          state: 'standard',
          colIndex: 0,
          lineIndex: 0,
        });
      }
    }

    if (genuineCells.length === 0) {
      // Empty line / paragraph
      const lineIdx = finalLines.length;
      finalLines.push({
        id: `p${pageNumber}-line-${lineIdx}`,
        lineIndex: lineIdx,
        cells: [],
        isCommitted: block.lastLineIsCommitted,
        wrapType: block.lastLineWrapType,
      });
      if (block.hasCursor && !cursorAssigned) {
        finalActiveLineIndex = lineIdx;
        finalActiveColIndex = 0;
        cursorAssigned = true;
      }
      continue;
    }

    const tokens = tokenizeCells(genuineCells);
    const paraDraftLines: Array<{
      cells: CharacterCell[];
      wrapType?: 'soft' | 'hard';
      isCommitted: boolean;
      explicitTrailingWhitespace?: boolean;
    }> = [];

    let currentLineCells: CharacterCell[] = [];
    let cellCounter = 0;
    let newCursorLineOffset = -1;
    let newCursorCol = -1;

    const recordCursorIfMatch = (col: number) => {
      if (block.hasCursor && newCursorLineOffset === -1 && cellCounter === block.cursorOffsetInParagraph) {
        newCursorLineOffset = paraDraftLines.length;
        newCursorCol = col;
      }
    };

    if (block.hasCursor && block.cursorOffsetInParagraph === 0) {
      newCursorLineOffset = 0;
      newCursorCol = 0;
    }

    for (const token of tokens) {
      if (!token.isSpace) {
        // Word token
        if (currentLineCells.length + token.cells.length <= targetColumnLimit) {
          for (const c of token.cells) {
            currentLineCells.push(c);
            cellCounter++;
            recordCursorIfMatch(currentLineCells.length);
          }
        } else {
          // Word overflows current line
          if (currentLineCells.length > 0) {
            const brokeOnSpace = currentLineCells[currentLineCells.length - 1].char === ' ';
            const padded = [...currentLineCells];
            const padStart = currentLineCells.length;
            for (let p = padStart; p < targetColumnLimit; p++) {
              padded.push({
                id: '',
                char: ' ',
                state: 'standard',
                colIndex: p,
                lineIndex: 0,
                isSoftPadding: true,
              });
            }
            paraDraftLines.push({
              cells: padded,
              wrapType: 'soft',
              isCommitted: true,
              explicitTrailingWhitespace: brokeOnSpace,
            });
            currentLineCells = [];
          }

          let remainingCells = [...token.cells];
          while (remainingCells.length > targetColumnLimit) {
            const chunk = remainingCells.slice(0, targetColumnLimit);
            remainingCells = remainingCells.slice(targetColumnLimit);

            for (const c of chunk) {
              cellCounter++;
              recordCursorIfMatch(chunk.indexOf(c) + 1);
            }

            paraDraftLines.push({
              cells: chunk,
              wrapType: 'soft',
              isCommitted: true,
            });
          }

          for (const c of remainingCells) {
            currentLineCells.push(c);
            cellCounter++;
            recordCursorIfMatch(currentLineCells.length);
          }
        }
      } else {
        // Whitespace token
        if (currentLineCells.length === 0) {
          if (paraDraftLines.length === 0) {
            // Indentation at paragraph start
            for (const c of token.cells) {
              if (currentLineCells.length < targetColumnLimit) {
                currentLineCells.push(c);
                cellCounter++;
                recordCursorIfMatch(currentLineCells.length);
              }
            }
          } else {
            // Space at wrap boundary: absorb into counter
            for (const _c of token.cells) {
              cellCounter++;
              recordCursorIfMatch(0);
            }
          }
        } else if (currentLineCells.length + token.cells.length <= targetColumnLimit) {
          for (const c of token.cells) {
            currentLineCells.push(c);
            cellCounter++;
            recordCursorIfMatch(currentLineCells.length);
          }
        } else {
          // Trailing space reached column limit: commit line softly
          const padded = [...currentLineCells];
          const padStart = currentLineCells.length;
          for (let p = padStart; p < targetColumnLimit; p++) {
            padded.push({
              id: '',
              char: ' ',
              state: 'standard',
              colIndex: p,
              lineIndex: 0,
              isSoftPadding: true,
            });
          }
          paraDraftLines.push({
            cells: padded,
            wrapType: 'soft',
            isCommitted: true,
            explicitTrailingWhitespace: true,
          });
          currentLineCells = [];
          for (const _c of token.cells) {
            cellCounter++;
            recordCursorIfMatch(0);
          }
        }
      }
    }

    // Terminal line of paragraph
    if (currentLineCells.length > 0 || paraDraftLines.length === 0) {
      paraDraftLines.push({
        cells: currentLineCells,
        wrapType: block.lastLineWrapType,
        isCommitted: block.lastLineIsCommitted,
      });
    }

    // If cursor was at or past the end of the paragraph
    if (block.hasCursor && newCursorLineOffset === -1) {
      newCursorLineOffset = paraDraftLines.length - 1;
      const lastLineCells = paraDraftLines[paraDraftLines.length - 1].cells.filter((c) => !c.isSoftPadding);
      newCursorCol = lastLineCells.length;
    }

    const baseLineIdx = finalLines.length;
    for (let l = 0; l < paraDraftLines.length; l++) {
      const lineIdx = baseLineIdx + l;
      const dl = paraDraftLines[l];
      const remappedCells = dl.cells.map((c, colIdx) => ({
        ...c,
        id: createCellId(pageNumber, lineIdx, colIdx),
        lineIndex: lineIdx,
        colIndex: colIdx,
      }));

      finalLines.push({
        id: `p${pageNumber}-line-${lineIdx}`,
        lineIndex: lineIdx,
        cells: remappedCells,
        isCommitted: dl.isCommitted,
        wrapType: dl.wrapType,
        explicitTrailingWhitespace: dl.explicitTrailingWhitespace,
      });
    }

    if (block.hasCursor && !cursorAssigned && newCursorLineOffset >= 0) {
      finalActiveLineIndex = baseLineIdx + newCursorLineOffset;
      finalActiveColIndex = Math.max(0, newCursorCol);
      cursorAssigned = true;
    }
  }

  if (!cursorAssigned && finalLines.length > 0) {
    finalActiveLineIndex = Math.min(activeLineIndex, finalLines.length - 1);
    finalActiveColIndex = 0;
  }

  return {
    lines: finalLines,
    activeLineIndex: finalActiveLineIndex,
    activeColIndex: finalActiveColIndex,
  };
}
