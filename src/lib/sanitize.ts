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
  const pageTexts: string[] = [];

  for (const page of pages) {
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

    const paragraphs: string[] = [];
    let currentParagraph = '';

    for (let i = 0; i < pageLines.length; i++) {
      const line = pageLines[i];

      const hasStruckOnly =
        line.cells.length > 0 &&
        line.cells.every((c) => c.state === 'struck' || c.isSoftPadding);

      if (hasStruckOnly) continue;

      const rawLine = sanitizeLine(line);
      const lineText = rawLine.trimEnd();

      // Intentional empty line (e.g. user pressed Enter on an empty line)
      if (line.cells.length === 0 || lineText === '') {
        if (currentParagraph !== '') {
          paragraphs.push(currentParagraph);
          currentParagraph = '';
        }
        paragraphs.push('');
        continue;
      }

      if (currentParagraph === '') {
        currentParagraph = lineText;
      } else {
        if (currentParagraph.endsWith('-')) {
          currentParagraph += lineText.trimStart();
        } else {
          currentParagraph += ' ' + lineText.trimStart();
        }
      }

      if (line.wrapType === 'hard') {
        paragraphs.push(currentParagraph);
        currentParagraph = '';
      }
    }

    if (currentParagraph !== '') {
      paragraphs.push(currentParagraph);
    }

    // Trim trailing blank lines within this page
    while (paragraphs.length > 0 && paragraphs[paragraphs.length - 1] === '') {
      paragraphs.pop();
    }

    if (paragraphs.length > 0) {
      pageTexts.push(paragraphs.join('\n'));
    }
  }

  return pageTexts.join('\n\n');
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
