import { CharacterCell, LineRecord, PageRecord, PageMode, ManuscriptManifest, SessionRecord } from '@/types';
import { createCellId, MAX_COLUMNS } from './wrap';
import { sanitizeManuscript, sanitizeLine } from './sanitize';
import { countWords, reconcileSessionsWithText, pruneZeroContentSessions } from './projectSerializer';
import { createEmptyLine } from './paginationTransition';
import { SETTING_KEYS } from '@/stores/settingsPersistence';

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
    const maxK = Math.min(20, Math.floor(p.length / 2));
    for (let k = 1; k <= maxK; k++) {
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
  const maxLen = Math.min(4000, Math.floor(healedText.length / 2));
  for (let len = maxLen; len >= 15; len--) {
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

export const SCROLL_CHUNK_SIZE = 60;

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
    if (lines.length <= SCROLL_CHUNK_SIZE) {
      return {
        historicalPages: [],
        currentPageNumber: 1,
        currentPageLines: lines,
      };
    }

    const historicalPages: PageRecord[] = [];
    let chunkStart = 0;
    let pageNum = 1;

    while (chunkStart + SCROLL_CHUNK_SIZE < lines.length) {
      const chunk = lines.slice(chunkStart, chunkStart + SCROLL_CHUNK_SIZE);
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
      chunkStart += SCROLL_CHUNK_SIZE;
      pageNum++;
    }

    const remaining = lines.slice(chunkStart).map((l, lIdx) => ({
      ...l,
      id: `p${pageNum}-line-${lIdx}`,
      lineIndex: lIdx,
    }));

    return {
      historicalPages,
      currentPageNumber: pageNum,
      currentPageLines: remaining.length > 0 ? remaining : [createEmptyLine(pageNum, 0)],
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

export interface NormalizedProjectSnapshot {
  manifest: ManuscriptManifest;
  cleanText: string;
  totalWordCount: number;
  committedDocWords: number;
  partitioned: PartitionedManuscript;
  normalizedSessions: SessionRecord[];
  removedSessionIds: string[];
  fallbackSettings: Partial<ManuscriptManifest>;
}

export interface HydrateProjectOptions {
  mode?: 'rehydrate' | 'load';
  globalSettings?: Partial<ManuscriptManifest>;
  columnLimit?: number;
  explicitSyncSettings?: Partial<ManuscriptManifest>;
  explicitDbSettings?: Partial<ManuscriptManifest>;
}

/**
 * Unified canonical helper to normalize, sanitize, partition, and reconcile
 * a manuscript project snapshot into platen lines, historical pages, and sessions.
 * Guarantees 100% behavioral parity between cold boot reload and project switching.
 */
export function hydrateProjectSnapshot(
  projectData: {
    manifest: ManuscriptManifest;
    pages: PageRecord[];
    sessions: SessionRecord[];
  },
  options: HydrateProjectOptions = {}
): NormalizedProjectSnapshot {
  const { manifest: loadedManifest, pages, sessions: existingSessions } = projectData;
  const {
    mode = 'rehydrate',
    globalSettings = {},
    columnLimit = MAX_COLUMNS,
    explicitSyncSettings,
    explicitDbSettings,
  } = options;

  // 1. Sanitize manuscript text (remove strikeouts) and heal duplicates
  const rawCleanText = sanitizeManuscript(pages, {
    doubleSpaceLinebreaks: false,
    pageMode: loadedManifest.pageMode,
  });
  const cleanText = healDuplicatedManuscriptText(rawCleanText);

  // 2. Determine effective page mode & size
  const effectivePageMode = globalSettings.pageMode || loadedManifest.pageMode || 'scroll';
  const effectivePageSize = globalSettings.pageSize || loadedManifest.pageSize || 54;

  // 3. Parse into platen lines
  const parsed = textToManuscriptLines(cleanText, 1, columnLimit);

  // 4. Partition lines based on page mode
  let partitioned: PartitionedManuscript;

  if (effectivePageMode === 'notecard') {
    const lastPage = pages && pages.length > 1 ? pages[pages.length - 1] : null;
    const isLastPageEmptyCard =
      lastPage !== null &&
      lastPage.completedAt === null &&
      (!lastPage.lines || lastPage.lines.every((l) => !l.cells || l.cells.length === 0));

    if (mode === 'load' || (isLastPageEmptyCard && lastPage)) {
      const contentLines = parsed.lines.filter((l) => l.cells.length > 0 || l.isCommitted);
      if (contentLines.length === 0) {
        partitioned = {
          historicalPages: [],
          currentPageNumber: 1,
          currentPageLines: [createEmptyLine(1, 0)],
        };
      } else {
        const historicalPages: PageRecord[] = [];
        for (let i = 0; i < contentLines.length; i += 10) {
          const chunk = contentLines.slice(i, i + 10);
          const pageNum = historicalPages.length + 1;
          historicalPages.push({
            id: `${loadedManifest.id}-page-${pageNum}`,
            manuscriptId: loadedManifest.id,
            pageNumber: pageNum,
            lines: chunk.map((l, lIdx) => ({
              ...l,
              id: `p${pageNum}-line-${lIdx}`,
              lineIndex: lIdx,
              isCommitted: true,
            })),
            completedAt: new Date().toISOString(),
          });
        }
        const nextCardNum = historicalPages.length + 1;
        partitioned = {
          historicalPages,
          currentPageNumber: nextCardNum,
          currentPageLines: [createEmptyLine(nextCardNum, 0)],
        };
      }
    } else {
      partitioned = partitionManuscriptLines(
        parsed.lines,
        effectivePageMode,
        effectivePageSize,
        loadedManifest.id
      );
    }
  } else {
    partitioned = partitionManuscriptLines(
      parsed.lines,
      effectivePageMode,
      effectivePageSize,
      loadedManifest.id
    );

    const shouldInsertDivider =
      effectivePageMode === 'scroll' &&
      cleanText.trim() !== '' &&
      (
        (pages && pages.some((p) => p.lines && p.lines.some((l) => l.isSessionDivider))) ||
        (existingSessions && existingSessions.some((s) => s.isImported)) ||
        (existingSessions && existingSessions.length > 1 && existingSessions.some((s) => s.completedAt !== null))
      );

    if (shouldInsertDivider) {
      const contentLines = parsed.lines.slice(0, parsed.activeLineIndex);
      if (contentLines.length > 0) {
        const linesWithDivider: LineRecord[] = [...contentLines];
        const dividerIdx = linesWithDivider.length;
        linesWithDivider.push({
          id: `${loadedManifest.id}-divider-hydrated`,
          lineIndex: dividerIdx,
          cells: [],
          isCommitted: true,
          isSessionDivider: true,
        });
        const nextDraftingIdx = linesWithDivider.length;
        linesWithDivider.push(createEmptyLine(1, nextDraftingIdx));
        partitioned = {
          historicalPages: [],
          currentPageNumber: 1,
          currentPageLines: linesWithDivider,
        };
      }
    }
  }

  // 5. Session reconciliation & zero-content pruning
  let rawSessions: SessionRecord[] = [];
  if (existingSessions && existingSessions.length > 0) {
    rawSessions = [...existingSessions];
  } else if (cleanText.trim() !== '') {
    rawSessions = [
      {
        id: `${loadedManifest.id}-session-1`,
        projectId: loadedManifest.id,
        sessionNumber: 1,
        startedAt: loadedManifest.createdAt || new Date().toISOString(),
        completedAt: loadedManifest.updatedAt || new Date().toISOString(),
        text: cleanText,
        wordCount: countWords(cleanText),
      },
    ];
  }

  // If there is only 1 session and its text is empty, populate it with cleanText
  if (rawSessions.length === 1 && (!rawSessions[0].text || rawSessions[0].text.trim() === '') && cleanText.trim() !== '') {
    rawSessions[0] = {
      ...rawSessions[0],
      text: cleanText,
      wordCount: rawSessions[0].wordCount || countWords(cleanText),
    };
  }

  const reconciled = reconcileSessionsWithText(rawSessions, cleanText);
  const { pruned, removedIds } = pruneZeroContentSessions(reconciled);

  // Renumber contiguously and guarantee immutability on historical sessions
  const normalizedSessions = pruned.map((s, idx) => ({
    ...s,
    sessionNumber: idx + 1,
    completedAt: s.completedAt || loadedManifest.updatedAt || s.startedAt,
  }));

  const docTotalWords = countWords(cleanText);

  // 6. Settings fallback from loadedManifest
  const fallbackSettings: Partial<ManuscriptManifest> = {};
  const loadedSettings = loadedManifest as Record<string, any>;
  const syncSettings = (explicitSyncSettings || {}) as Record<string, any>;
  const dbSettings = (explicitDbSettings || {}) as Record<string, any>;
  const gSettings = (globalSettings || {}) as Record<string, any>;

  for (const key of SETTING_KEYS) {
    if (
      syncSettings[key] === undefined &&
      dbSettings[key] === undefined &&
      gSettings[key] === undefined &&
      loadedSettings[key] !== undefined
    ) {
      (fallbackSettings as Record<string, any>)[key] = loadedSettings[key];
    }
  }

  // 7. Compose finalized manifest
  const updatedManifest: ManuscriptManifest = {
    activeApertureHeight: globalSettings.activeApertureHeight || loadedManifest.activeApertureHeight || 1,
    wrapMode: globalSettings.wrapMode || loadedManifest.wrapMode || 'soft',
    pageSize: effectivePageSize,
    pageMode: effectivePageMode,
    colorScheme: globalSettings.colorScheme || loadedManifest.colorScheme || 'typewriter',
    typeface: globalSettings.typeface || loadedManifest.typeface || 'courier-prime',
    ...globalSettings,
    ...fallbackSettings,
    id: loadedManifest.id,
    title: loadedManifest.title || 'Untitled Project',
    mode: 'local',
    inboxCount: loadedManifest.inboxCount ?? 0,
    outboxCount: 0,
    lastPrintedCharIndex: loadedManifest.lastPrintedCharIndex ?? 0,
    printedPagesCount: loadedManifest.printedPagesCount ?? 0,
    sessionWordTarget: loadedManifest.sessionWordTarget,
    showSessionTargetTracker: loadedManifest.showSessionTargetTracker ?? globalSettings.showSessionTargetTracker,
    activeSessionId:
      loadedManifest.activeSessionId ||
      (normalizedSessions.length > 0 ? normalizedSessions[normalizedSessions.length - 1].id : ''),
    sessionCount: normalizedSessions.length,
    totalWordCount: docTotalWords,
    createdAt: loadedManifest.createdAt || new Date().toISOString(),
    updatedAt: loadedManifest.updatedAt || new Date().toISOString(),
  };

  const activeLines = partitioned.currentPageLines;
  const activeLine = activeLines.length > 0 ? activeLines[activeLines.length - 1] : null;
  const activeLineWords = activeLine && !activeLine.isCommitted
    ? countWords(sanitizeLine(activeLine).trim())
    : 0;
  const committedDocWords = Math.max(0, docTotalWords - activeLineWords);

  return {
    manifest: updatedManifest,
    cleanText,
    totalWordCount: docTotalWords,
    committedDocWords,
    partitioned,
    normalizedSessions,
    removedSessionIds: removedIds,
    fallbackSettings,
  };
}


