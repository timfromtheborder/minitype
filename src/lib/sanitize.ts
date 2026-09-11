import { CharacterCell, LineRecord, PageRecord, PageMode } from '@/types';

/**
 * Sanitizes a single line by removing struck cells, trimming soft padding,
 * and eliminating orphaned whitespace between or adjacent to struck cells.
 */
export function sanitizeLine(line: LineRecord): string {
  const cells = line.cells;

  // Filter out soft padding cells
  const nonPaddingCells = cells.filter((c) => !c.isSoftPadding);
  if (nonPaddingCells.length === 0) return '';

  const chars: string[] = [];

  for (let i = 0; i < nonPaddingCells.length; i++) {
    const cell = nonPaddingCells[i];

    if (cell.state === 'struck' || cell.isStruck) {
      continue;
    }

    if (cell.char === ' ') {
      // Look backward for the nearest non-space cell
      let prevCell: CharacterCell | null = null;
      for (let p = i - 1; p >= 0; p--) {
        if (nonPaddingCells[p].char === ' ') continue;
        prevCell = nonPaddingCells[p];
        break;
      }

      // Look forward for the nearest non-space cell
      let nextCell: CharacterCell | null = null;
      for (let n = i + 1; n < nonPaddingCells.length; n++) {
        if (nonPaddingCells[n].char === ' ') continue;
        nextCell = nonPaddingCells[n];
        break;
      }

      const prevIsStruck = Boolean(prevCell && (prevCell.state === 'struck' || prevCell.isStruck));
      const nextIsStruck = Boolean(nextCell && (nextCell.state === 'struck' || nextCell.isStruck));

      // 1. Space between two struck cells: e.g. struck("x") + " " + struck("y")
      if (prevIsStruck && nextIsStruck) {
        continue;
      }

      // 2. Space at the start of line followed by struck cells: e.g. " " + struck("x")
      if (!prevCell && nextIsStruck) {
        continue;
      }

      // 3. Space at the end of line preceded by struck cells: e.g. struck("x") + " "
      // If the line wraps softly, this space must be preserved for separating words across lines.
      if (prevIsStruck && !nextCell && line.wrapType !== 'soft') {
        continue;
      }

      // 4. Space preceded by struck cells at the start of line before regular text:
      // e.g. line starts with struck("y") then space then "ing"
      let hasPriorValidText = false;
      for (let p = i - 1; p >= 0; p--) {
        if (nonPaddingCells[p].state !== 'struck' && !nonPaddingCells[p].isStruck && nonPaddingCells[p].char !== ' ') {
          hasPriorValidText = true;
          break;
        }
      }
      if (!hasPriorValidText && prevIsStruck) {
        continue;
      }

      // 5. Space followed by struck cells that extend to the end of the line:
      // e.g. "test" + " " + struck("x") (where everything after space is struck)
      // If line wraps softly, or if there was valid text before this space, preserve it so words don't merge across lines.
      let hasSubsequentValidText = false;
      for (let n = i + 1; n < nonPaddingCells.length; n++) {
        if (nonPaddingCells[n].state !== 'struck' && !nonPaddingCells[n].isStruck && nonPaddingCells[n].char !== ' ') {
          hasSubsequentValidText = true;
          break;
        }
      }
      if (nextIsStruck && !hasSubsequentValidText && !hasPriorValidText && line.wrapType !== 'soft') {
        continue;
      }
    }

    chars.push(cell.char);
  }

  return chars.join('');
}

export interface SanitizeOptions {
  doubleSpaceLinebreaks?: boolean;
  pageMode?: PageMode;
}

/**
 * Sanitizes an array of pages or lines, unwrapping soft-wrapped lines into
 * continuous paragraphs so that only explicit 'Enter' keystrokes create linebreaks.
 * Also eliminates struck-out text and collapses lines created by full-line strikeouts.
 * Soft wraps across page/card boundaries are seamlessly unwrapped without artificial linebreaks.
 */
export function sanitizeManuscript(
  pages: PageRecord[],
  options?: SanitizeOptions
): string {
  const isParagraphMode = options?.pageMode === 'paragraph';
  const isDoubleSpace = Boolean(options?.doubleSpaceLinebreaks);

  const paragraphs: string[] = [];
  let currentParagraph = '';
  let previousLineRecord: LineRecord | null = null;

  for (let pIdx = 0; pIdx < pages.length; pIdx++) {
    const page = pages[pIdx];
    const pageLines = [...page.lines];

    // Remove unwritten empty lines at the end of the page
    while (
      pageLines.length > 0 &&
      pageLines[pageLines.length - 1].cells.length === 0 &&
      !pageLines[pageLines.length - 1].isCommitted
    ) {
      pageLines.pop();
    }

    if (pageLines.length === 0) continue;

    for (let i = 0; i < pageLines.length; i++) {
      const line = pageLines[i];

      const rawLine = sanitizeLine(line);
      const lineText = rawLine.trimEnd();

      // Check if all non-padding genuine text on this line was struck out
      const hasStruckCells = line.cells.some((c) => c.state === 'struck');
      const hasOnlyStruckOrEmpty =
        line.cells.length > 0 &&
        line.cells.every((c) => c.state === 'struck' || c.isSoftPadding || c.char === ' ');

      if (hasOnlyStruckOrEmpty && hasStruckCells) {
        // This entire line was struck out. Collapse it without adding an unwanted empty line or breaking paragraphs.
        continue;
      }

      // Intentional empty line (e.g. user pressed Enter on an empty line without struck text)
      if (line.cells.length === 0 || lineText === '') {
        if (currentParagraph !== '') {
          paragraphs.push(currentParagraph.trimEnd());
          currentParagraph = '';
        }
        paragraphs.push('');
        previousLineRecord = null;
        continue;
      }

      if (currentParagraph === '') {
        currentParagraph = rawLine;
      } else {
        const hasTrailingSpace = currentParagraph.endsWith(' ') || Boolean(previousLineRecord?.explicitTrailingWhitespace);
        const hasLeadingSpace = rawLine.startsWith(' ');
        const isHyphenated = currentParagraph.endsWith('-');

        if (isHyphenated) {
          currentParagraph += rawLine.trimStart();
        } else if (hasTrailingSpace || hasLeadingSpace) {
          currentParagraph = currentParagraph.trimEnd() + ' ' + rawLine.trimStart();
        } else {
          // No whitespace between lines: connect directly (e.g. mid-word strikethrough: test[strike] + ing = testing)
          currentParagraph += rawLine;
        }
      }

      previousLineRecord = line;

      if (line.wrapType === 'hard') {
        paragraphs.push(currentParagraph.trimEnd());
        currentParagraph = '';
        previousLineRecord = null;
      }
    }

    // In paragraph mode, each card boundary is explicitly a paragraph separation
    if (isParagraphMode && currentParagraph !== '') {
      paragraphs.push(currentParagraph.trimEnd());
      currentParagraph = '';
      previousLineRecord = null;
    }
  }

  if (currentParagraph !== '') {
    paragraphs.push(currentParagraph.trimEnd());
  }

  // Trim trailing blank lines
  while (paragraphs.length > 0 && paragraphs[paragraphs.length - 1] === '') {
    paragraphs.pop();
  }

  if (paragraphs.length === 0) {
    return '';
  }

  if (isDoubleSpace) {
    return paragraphs.join('\n\n');
  }

  return paragraphs.join('\n');
}

/**
 * Calculates print delay in ms using the rubber-band formula from PRD:
 * Delay per character (ms) = max(2, 30 / (1 + log10(1 + C / 100)))
 */
export function calculatePrintDelayMs(totalDeltaChars: number): number {
  if (totalDeltaChars <= 0) return 0;
  const rawDelay = 30 / (1 + Math.log10(1 + totalDeltaChars / 100));
  return Math.max(2, rawDelay);
}
