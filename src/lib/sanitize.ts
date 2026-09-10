import { LineRecord, PageRecord } from '@/types';

/**
 * Sanitizes a single line by removing struck cells and trimming soft padding.
 */
export function sanitizeLine(line: LineRecord): string {
  // Collect chars that are not struck and not soft-wrap padding
  const validChars = line.cells
    .filter((cell) => cell.state !== 'struck' && !cell.isSoftPadding)
    .map((cell) => cell.char);

  return validChars.join('');
}

/**
 * Sanitizes an array of pages or lines, unwrapping soft-wrapped lines into
 * continuous paragraphs so that only explicit 'Enter' keystrokes create linebreaks.
 * Also eliminates struck-out text and collapses lines created by full-line strikeouts.
 */
export function sanitizeManuscript(pages: PageRecord[]): string {
  // Flatten all lines across pages
  const allLines: LineRecord[] = [];
  for (const page of pages) {
    for (const line of page.lines) {
      allLines.push(line);
    }
  }

  // Remove unwritten empty lines at the very end of the manuscript
  while (
    allLines.length > 0 &&
    allLines[allLines.length - 1].cells.length === 0 &&
    !allLines[allLines.length - 1].isCommitted
  ) {
    allLines.pop();
  }

  const paragraphs: string[] = [];
  let currentParagraph = '';

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];

    // Check if line was entirely struck out (had cells, but all struck/padding)
    const hasStruckOnly =
      line.cells.length > 0 &&
      line.cells.every((c) => c.state === 'struck' || c.isSoftPadding);

    if (hasStruckOnly) {
      // Eliminate orphaned blank lines created by full-line strikeouts
      continue;
    }

    const rawLine = sanitizeLine(line);
    const lineText = rawLine.trimEnd();

    // Check for intentional empty line (e.g. user pressed Enter on an empty line)
    if (line.cells.length === 0 || lineText === '') {
      if (currentParagraph !== '') {
        paragraphs.push(currentParagraph);
        currentParagraph = '';
      }
      paragraphs.push('');
      continue;
    }

    // Append to current paragraph
    if (currentParagraph === '') {
      currentParagraph = lineText;
    } else {
      // Joining soft-wrapped text within paragraph
      if (currentParagraph.endsWith('-')) {
        // Hyphenated wrap: connect directly (e.g. "life-" + "like" = "life-like")
        currentParagraph += lineText.trimStart();
      } else {
        // Space wrap: connect with a single space
        currentParagraph += ' ' + lineText.trimStart();
      }
    }

    // If this line ended with a hard return (Enter), commit current paragraph
    if (line.wrapType === 'hard') {
      paragraphs.push(currentParagraph);
      currentParagraph = '';
    }
  }

  if (currentParagraph !== '') {
    paragraphs.push(currentParagraph);
  }

  // Trim trailing blank lines
  while (paragraphs.length > 0 && paragraphs[paragraphs.length - 1] === '') {
    paragraphs.pop();
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
