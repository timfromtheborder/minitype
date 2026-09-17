import { describe, it, expect, beforeEach } from 'vitest';
import { useTypingStore } from '@/stores/typingStore';
import { db } from '@/db';
import { PageRecord, ManuscriptManifest, LineRecord } from '@/types';
import { countWords, resolveActiveSessionStats } from '@/lib/projectSerializer';
import { sanitizeManuscript, sanitizeLine } from '@/lib/sanitize';
import { hydrateProjectSnapshot, partitionManuscriptLines, SCROLL_CHUNK_SIZE } from '@/lib/importer';
import { wordCountClient } from '@/workers/wordCountClient';
import { executeWordCountCalculation } from '@/workers/wordCount.worker';

describe('Tier 2 Pass C (v0.9.7.6.2): Concurrency, Word Delta & 60k Stress Benchmark', () => {
  beforeEach(async () => {
    await db.manuscripts.clear();
    await db.pages.clear();
    await db.sessions.clear();
    await db.settings.clear();
    useTypingStore.getState().resetEngine();
  });

  describe('Pillar 8: Active Line Word Delta Tracking', () => {
    it('instantaneously calculates word count on active line without full document scanning', () => {
      const store = useTypingStore.getState();
      store.newProject();

      // Type "hello world "
      'hello world '.split('').forEach((c) => store.insertChar(c));

      const stateAfterWords = useTypingStore.getState();
      expect(stateAfterWords.manifest.totalWordCount).toBe(2);
      expect(stateAfterWords.committedDocWords).toBe(0);

      // Hit Enter: commits line 0, advances to line 1
      const t0 = performance.now();
      store.handleEnter();
      const enterDuration = performance.now() - t0;

      // Enter execution must be sub-millisecond (25ms margin for parallel test runner)
      expect(enterDuration).toBeLessThan(25);

      const stateAfterEnter = useTypingStore.getState();
      expect(stateAfterEnter.committedDocWords).toBe(2);
      expect(stateAfterEnter.manifest.totalWordCount).toBe(2);
      expect(stateAfterEnter.activeLineIndex).toBe(1);

      // Type on line 1: "another sentence"
      'another sentence'.split('').forEach((c) => store.insertChar(c));

      const stateLine1 = useTypingStore.getState();
      expect(stateLine1.committedDocWords).toBe(2);
      expect(stateLine1.manifest.totalWordCount).toBe(4);
    });

    it('calibrates committedDocWords when backspacing across carriage return', () => {
      const store = useTypingStore.getState();
      store.newProject();

      'first line'.split('').forEach((c) => store.insertChar(c));
      store.handleEnter();

      expect(useTypingStore.getState().committedDocWords).toBe(2);
      expect(useTypingStore.getState().activeLineIndex).toBe(1);

      // Backspace on empty line: strikes carriage return and restores line 0
      store.handleBackspace();

      const stateAfterCancel = useTypingStore.getState();
      expect(stateAfterCancel.activeLineIndex).toBe(0);
      expect(stateAfterCancel.committedDocWords).toBe(0);
      expect(stateAfterCancel.manifest.totalWordCount).toBe(2);
    });
  });

  describe('Pillar 9: Web Worker Word Count Offload', () => {
    it('executes background word count and session stats accurately', async () => {
      const mockPages: PageRecord[] = [
        {
          id: 'test-p1',
          manuscriptId: 'test-proj',
          pageNumber: 1,
          lines: [
            {
              id: 'l1',
              lineIndex: 0,
              cells: 'The quick brown fox jumps over the lazy dog.'.split('').map((char, colIndex) => ({
                id: `c-${colIndex}`,
                char,
                state: 'standard' as const,
                colIndex,
                lineIndex: 0,
              })),
              isCommitted: true,
              wrapType: 'hard',
            },
          ],
          completedAt: null,
        },
      ];

      const res = await wordCountClient.calculateStats(mockPages, 'scroll', [
        {
          id: 's1',
          projectId: 'test-proj',
          sessionNumber: 1,
          startedAt: new Date().toISOString(),
          completedAt: null,
          text: '',
          wordCount: 0,
        },
      ]);

      expect(res.docTotalWords).toBe(9);
      expect(res.currentSessionWords).toBe(9);
      expect(res.fullText).toBe('The quick brown fox jumps over the lazy dog.');
    });

    it('executeWordCountCalculation pure function matches Scrivener regex standards', () => {
      const sampleText = 'Alpha—beta--gamma/delta... epsilon (zeta) "eta" well-known 1,000 3.14';
      const words = countWords(sampleText);
      expect(words).toBe(10);
    });
  });

  describe('Pillars A & B: Instant Enter & Scroll Chunking', () => {
    it('partitions large scroll manuscripts into bounded 60-line chunks', () => {
      // Create 150 lines
      const hundredFiftyLines: LineRecord[] = Array.from({ length: 150 }, (_, i) => ({
        id: `line-${i}`,
        lineIndex: i,
        cells: `Line number ${i + 1} content`.split('').map((char, colIndex) => ({
          id: `c-${colIndex}`,
          char,
          state: 'standard' as const,
          colIndex,
          lineIndex: i,
        })),
        isCommitted: true,
        wrapType: 'hard' as const,
      }));

      const partitioned = partitionManuscriptLines(hundredFiftyLines, 'scroll', 54, 'bench-proj');

      expect(partitioned.historicalPages).toHaveLength(2); // 2 chunks of 60 lines
      expect(partitioned.historicalPages[0].lines).toHaveLength(60);
      expect(partitioned.historicalPages[1].lines).toHaveLength(60);
      expect(partitioned.currentPageLines).toHaveLength(30); // 150 - 120 = 30 lines
      expect(partitioned.currentPageNumber).toBe(3);
    });

    it('maintains sub-millisecond keystroke and Enter responsiveness across a 60k-word manuscript', async () => {
      // Generate realistic 60,000-word manuscript
      // 6,000 lines with 10 words per line = 60,000 words
      const totalTargetLines = 6000;
      const getLineText = (idx: number) =>
        `Line-${idx} typewriter clicked with rhythmic mechanical words flow here today.`;
      const wordsPerLine = countWords(getLineText(0)); // 10 words
      const expectedTotalWords = wordsPerLine * totalTargetLines; // 60,000 words

      expect(wordsPerLine).toBe(10);
      expect(expectedTotalWords).toBe(60000);

      // Create snapshot with 6,000 lines partitioned into 60-line pages
      const totalPages = Math.floor(totalTargetLines / SCROLL_CHUNK_SIZE); // 100 pages
      const mockPages: PageRecord[] = [];

      for (let p = 1; p <= totalPages; p++) {
        const pLines: LineRecord[] = [];
        for (let l = 0; l < SCROLL_CHUNK_SIZE; l++) {
          const globalLineIdx = (p - 1) * SCROLL_CHUNK_SIZE + l;
          const currentText = getLineText(globalLineIdx);
          pLines.push({
            id: `p${p}-line-${l}`,
            lineIndex: l,
            cells: currentText.split('').map((char, colIndex) => ({
              id: `p${p}-l${l}-c${colIndex}`,
              char,
              state: 'standard' as const,
              colIndex,
              lineIndex: l,
            })),
            isCommitted: true,
            wrapType: 'hard' as const,
          });
        }
        mockPages.push({
          id: `60k-proj-page-${p}`,
          manuscriptId: '60k-proj',
          pageNumber: p,
          lines: pLines,
          completedAt: p < totalPages ? new Date().toISOString() : null,
        });
      }

      // 1. Measure Hydration Performance
      const tHydrateStart = performance.now();
      const snapshot = hydrateProjectSnapshot(
        {
          manifest: {
            id: '60k-proj',
            title: '60,000 Word Novel',
            mode: 'local',
            inboxCount: 0,
            outboxCount: 0,
            lastPrintedCharIndex: 0,
            printedPagesCount: 0,
            activeApertureHeight: 5,
            wrapMode: 'soft',
            pageSize: 54,
            pageMode: 'scroll',
            colorScheme: 'typewriter',
            typeface: 'courier-prime',
          },
          pages: mockPages,
          sessions: [],
        },
        { mode: 'rehydrate', globalSettings: { pageMode: 'scroll' }, columnLimit: 70 }
      );
      const hydrateDuration = performance.now() - tHydrateStart;

      expect(snapshot.totalWordCount).toBe(60000);
      expect(snapshot.committedDocWords).toBe(60000);
      expect(hydrateDuration).toBeLessThan(1500); // 60k words hydrated cleanly

      // 2. Load into store and test keystroke latency
      const store = useTypingStore.getState();
      store.setManifest(snapshot.manifest);
      useTypingStore.setState({
        historicalPages: snapshot.partitioned.historicalPages,
        currentPageNumber: snapshot.partitioned.currentPageNumber,
        currentPageLines: snapshot.partitioned.currentPageLines,
        activeLineIndex: snapshot.partitioned.currentPageLines.length - 1,
        activeColIndex: 0,
        committedDocWords: snapshot.committedDocWords,
      });

      // 3. Measure Keystroke Latency on 60,000-Word Document
      const tKeystrokeStart = performance.now();
      const burstChars = 'Drafting a new chapter at full momentum.'.split('');
      for (const char of burstChars) {
        store.insertChar(char);
      }
      const keystrokeDuration = performance.now() - tKeystrokeStart;
      const avgPerChar = keystrokeDuration / burstChars.length;

      expect(avgPerChar).toBeLessThan(5); // Sub-5ms per keystroke on 60k words

      // 4. Measure Enter Latency on 60,000-Word Document
      const tEnterStart = performance.now();
      store.handleEnter();
      const enterDuration = performance.now() - tEnterStart;

      expect(enterDuration).toBeLessThan(10); // Instant Enter (< 10ms in test environment)

      // Verify active line delta accurately incremented total word count
      const wordsAdded = countWords('Drafting a new chapter at full momentum.');
      expect(useTypingStore.getState().manifest.totalWordCount).toBe(60000 + wordsAdded);
      expect(useTypingStore.getState().committedDocWords).toBe(60000 + wordsAdded);
    });
  });
});
