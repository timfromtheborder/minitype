import { CharacterCell, LineRecord } from '@/types';
import { createCellId, MAX_COLUMNS } from './wrap';

export interface ParsedManuscript {
  lines: LineRecord[];
  activeLineIndex: number;
  activeColIndex: number;
}

/**
 * Parses raw text into Minitype platen lines conforming to column bounds (default 70 cols).
 * Implements Option A:
 * - Sanitizes text (zero strikeouts).
 * - Soft-wraps paragraphs exceeding column bounds.
 * - Appends a fresh line at the end with cursor at Col 0 so the user can immediately resume typing.
 */
export function textToManuscriptLines(
  rawText: string,
  pageNumber: number = 1,
  columnLimit: number = MAX_COLUMNS
): ParsedManuscript {
  if (!rawText || rawText.length === 0) {
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

  const lines: LineRecord[] = [];
  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\t/g, '  ');
  const paragraphs = normalized.split('\n');

  let currentLineIndex = 0;

  for (let p = 0; p < paragraphs.length; p++) {
    const paragraph = paragraphs[p];

    // Empty paragraph (blank line)
    if (paragraph.length === 0) {
      lines.push({
        id: `p${pageNumber}-line-${currentLineIndex}`,
        lineIndex: currentLineIndex,
        cells: [],
        isCommitted: true,
        wrapType: 'hard',
      });
      currentLineIndex++;
      continue;
    }

    // Split paragraph into words while preserving whitespace
    const words = paragraph.match(/\S+|\s+/g) || [paragraph];
    let currentLineCells: CharacterCell[] = [];

    for (let w = 0; w < words.length; w++) {
      const word = words[w];

      // Check if word fits on current line
      if (currentLineCells.length + word.length <= columnLimit) {
        for (let i = 0; i < word.length; i++) {
          const colIndex = currentLineCells.length;
          currentLineCells.push({
            id: createCellId(pageNumber, currentLineIndex, colIndex),
            char: word[i],
            state: 'standard',
            colIndex,
            lineIndex: currentLineIndex,
          });
        }
      } else {
        // Word overflows current line
        if (currentLineCells.length > 0) {
          // If word is whitespace only at boundary, drop and soft wrap
          if (/^\s+$/.test(word)) {
            // Commit current line with soft wrap
            lines.push({
              id: `p${pageNumber}-line-${currentLineIndex}`,
              lineIndex: currentLineIndex,
              cells: currentLineCells,
              isCommitted: true,
              wrapType: 'soft',
              explicitTrailingWhitespace: true,
            });
            currentLineIndex++;
            currentLineCells = [];
            continue;
          }

          // Pad remaining columns on current line as soft padding
          const wordStartIndex = currentLineCells.length;
          const paddedCells = [...currentLineCells];
          for (let pad = wordStartIndex; pad < columnLimit; pad++) {
            paddedCells.push({
              id: createCellId(pageNumber, currentLineIndex, pad),
              char: ' ',
              state: 'standard',
              colIndex: pad,
              lineIndex: currentLineIndex,
              isSoftPadding: true,
            });
          }

          lines.push({
            id: `p${pageNumber}-line-${currentLineIndex}`,
            lineIndex: currentLineIndex,
            cells: paddedCells,
            isCommitted: true,
            wrapType: 'soft',
          });
          currentLineIndex++;
          currentLineCells = [];
        }

        // Now place word on next line (handling words longer than columnLimit)
        let remainingWord = word;
        while (remainingWord.length > columnLimit) {
          const chunk = remainingWord.slice(0, columnLimit);
          remainingWord = remainingWord.slice(columnLimit);

          const chunkCells: CharacterCell[] = [];
          for (let i = 0; i < chunk.length; i++) {
            chunkCells.push({
              id: createCellId(pageNumber, currentLineIndex, i),
              char: chunk[i],
              state: 'standard',
              colIndex: i,
              lineIndex: currentLineIndex,
            });
          }

          lines.push({
            id: `p${pageNumber}-line-${currentLineIndex}`,
            lineIndex: currentLineIndex,
            cells: chunkCells,
            isCommitted: true,
            wrapType: 'soft',
          });
          currentLineIndex++;
        }

        // Place the remaining piece of word
        for (let i = 0; i < remainingWord.length; i++) {
          const colIndex = currentLineCells.length;
          currentLineCells.push({
            id: createCellId(pageNumber, currentLineIndex, colIndex),
            char: remainingWord[i],
            state: 'standard',
            colIndex,
            lineIndex: currentLineIndex,
          });
        }
      }
    }

    // Paragraph ended: commit last line of paragraph with 'hard' wrap
    if (currentLineCells.length > 0 || lines.length === 0) {
      lines.push({
        id: `p${pageNumber}-line-${currentLineIndex}`,
        lineIndex: currentLineIndex,
        cells: currentLineCells,
        isCommitted: true,
        wrapType: 'hard',
      });
      currentLineIndex++;
    }
  }

  // Option A: Automatically append a fresh line at the end so typing resumes cleanly
  const activeLineIndex = currentLineIndex;
  lines.push({
    id: `p${pageNumber}-line-${activeLineIndex}`,
    lineIndex: activeLineIndex,
    cells: [],
    isCommitted: false,
  });

  return {
    lines,
    activeLineIndex,
    activeColIndex: 0,
  };
}
