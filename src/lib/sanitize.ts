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
 * Sanitizes an array of pages or lines, stripping struck text and
 * collapsing consecutive empty lines created by full-line strikeouts.
 */
export function sanitizeManuscript(pages: PageRecord[]): string {
  const allSanitizedLines: string[] = [];

  for (const page of pages) {
    for (const line of page.lines) {
      const lineText = sanitizeLine(line).trimEnd();
      allSanitizedLines.push(lineText);
    }
  }

  // Eliminate trailing empty lines and trim excess blanks
  // Preserve intentional blank lines (e.g. paragraph breaks) but collapse
  // lines that were entirely struck out.
  const resultLines: string[] = [];
  let prevWasEmpty = false;

  for (const line of allSanitizedLines) {
    if (line.trim() === '') {
      if (!prevWasEmpty && resultLines.length > 0) {
        resultLines.push('');
        prevWasEmpty = true;
      }
    } else {
      resultLines.push(line);
      prevWasEmpty = false;
    }
  }

  return resultLines.join('\n');
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
