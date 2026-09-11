import { CharacterCell, LineRecord, PageRecord, PageMode } from '@/types';
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

export interface PartitionedManuscript {
  historicalPages: PageRecord[];
  currentPageNumber: number;
  currentPageLines: LineRecord[];
}

/**
 * Detects and removes repeating suffix blocks caused by stale orphan page duplication loops.
 * Idempotently cleans corrupted text while leaving valid non-repeating manuscripts untouched.
 */
export function healDuplicatedManuscriptText(rawText: string): string {
  if (!rawText || rawText.length < 10) return rawText;
  let text = rawText;

  // 1. Paragraph-level repeating suffix healing
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const paragraphs = normalized.split('\n\n');
  if (paragraphs.length >= 2) {
    let healed = false;
    let p = [...paragraphs];
    for (let k = 1; k <= Math.floor(p.length / 2); k++) {
      const suffix = p.slice(p.length - k);
      let matches = 0;
      while (p.length >= (matches + 2) * k) {
        const prev = p.slice(p.length - (matches + 2) * k, p.length - (matches + 1) * k);
        let equal = true;
        for (let i = 0; i < k; i++) {
          if (suffix[i].trim() === '' || suffix[i].trim() !== prev[i].trim()) {
            equal = false;
            break;
          }
        }
        if (equal) {
          matches++;
        } else {
          break;
        }
      }
      if (matches > 0) {
        p = p.slice(0, p.length - matches * k);
        healed = true;
        break;
      }
    }
    if (healed) {
      text = p.join('\n\n');
    }
  }

  // 2. String-level repeating suffix healing (for single multi-line blocks or line-wrapped repeats)
  let healedText = text.trimEnd();
  for (let len = Math.floor(healedText.length / 2); len >= 15; len--) {
    const suffix = healedText.slice(-len);
    if (suffix.trim().length >= 10 && healedText.slice(0, -len).endsWith(suffix)) {
      while (healedText.length >= len * 2 && healedText.slice(0, -len).endsWith(suffix)) {
        healedText = healedText.slice(0, -len);
      }
      text = healedText;
      break;
    }
  }

  return text;
}

/**
 * Partitions parsed manuscript lines into completed historical pages and active drafting lines,
 * strictly conforming to the manuscript's pageMode ('scroll', 'page', 'notecard', 'paragraph')
 * and pageSize constraints.
 */
export function partitionManuscriptLines(
  lines: LineRecord[],
  pageMode: PageMode = 'scroll',
  pageSize: number = 54,
  manifestId: string = 'manuscript'
): PartitionedManuscript {
  if (pageMode === 'scroll' || !pageMode) {
    return {
      historicalPages: [],
      currentPageNumber: 1,
      currentPageLines: lines,
    };
  }

  if (pageMode === 'paragraph') {
    const pageGroups: LineRecord[][] = [];
    let currentGroup: LineRecord[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip lone empty separator lines between paragraphs
      if (line.cells.length === 0 && currentGroup.length === 0 && i < lines.length - 1) {
        continue;
      }
      currentGroup.push(line);
      // Hard break marks the end of a paragraph page, unless it's the very last uncommitted line
      if (line.wrapType === 'hard' && i < lines.length - 1) {
        pageGroups.push(currentGroup);
        currentGroup = [];
      }
    }
    if (currentGroup.length > 0 || pageGroups.length === 0) {
      pageGroups.push(currentGroup);
    }

    const historicalPages: PageRecord[] = [];
    for (let pIdx = 0; pIdx < pageGroups.length - 1; pIdx++) {
      const pageNum = pIdx + 1;
      const pLines = pageGroups[pIdx].map((l, lIdx) => ({
        ...l,
        id: `p${pageNum}-line-${lIdx}`,
        lineIndex: lIdx,
        isCommitted: true,
      }));
      historicalPages.push({
        id: `${manifestId}-page-${pageNum}`,
        manuscriptId: manifestId,
        pageNumber: pageNum,
        lines: pLines,
        completedAt: new Date().toISOString(),
      });
    }

    const activePageNum = pageGroups.length;
    const activeLines = (pageGroups[pageGroups.length - 1] || []).map((l, lIdx) => ({
      ...l,
      id: `p${activePageNum}-line-${lIdx}`,
      lineIndex: lIdx,
    }));

    return {
      historicalPages,
      currentPageNumber: activePageNum,
      currentPageLines: activeLines.length > 0 ? activeLines : [
        {
          id: `p${activePageNum}-line-0`,
          lineIndex: 0,
          cells: [],
          isCommitted: false,
        },
      ],
    };
  }

  // Notecard or Page mode
  const limit = pageMode === 'notecard' ? 10 : (pageSize || 54);
  if (lines.length <= limit) {
    return {
      historicalPages: [],
      currentPageNumber: 1,
      currentPageLines: lines,
    };
  }

  const historicalPages: PageRecord[] = [];
  let chunkStart = 0;
  let pageNum = 1;

  while (chunkStart + limit < lines.length) {
    const chunk = lines.slice(chunkStart, chunkStart + limit);
    const pLines = chunk.map((l, lIdx) => ({
      ...l,
      id: `p${pageNum}-line-${lIdx}`,
      lineIndex: lIdx,
      isCommitted: true,
    }));
    historicalPages.push({
      id: `${manifestId}-page-${pageNum}`,
      manuscriptId: manifestId,
      pageNumber: pageNum,
      lines: pLines,
      completedAt: new Date().toISOString(),
    });
    chunkStart += limit;
    pageNum++;
  }

  const activeChunk = lines.slice(chunkStart);
  const activeLines = activeChunk.map((l, lIdx) => ({
    ...l,
    id: `p${pageNum}-line-${lIdx}`,
    lineIndex: lIdx,
  }));

  return {
    historicalPages,
    currentPageNumber: pageNum,
    currentPageLines: activeLines,
  };
}

