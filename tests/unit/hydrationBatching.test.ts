import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db, savePages, saveSessions, getPagesForManuscript, getSessionsForProject, getAllManuscripts } from '@/db';
import { hydrateProjectSnapshot } from '@/lib/importer';
import { pruneZeroContentSessions } from '@/lib/projectSerializer';
import { notifyDraftingActivity } from '@/stores/draftingPipeline';
import { useTypingStore, DEFAULT_MANIFEST, ACTIVE_PROJECT_KEY } from '@/stores/typingStore';
import { ManuscriptManifest, PageRecord, SessionRecord } from '@/types';

describe('Storage Architecture, Hydrator Consolidation & Batching (Tier 2 Pass B / v0.9.7.6.1)', () => {
  beforeEach(async () => {
    await db.manuscripts.clear();
    await db.pages.clear();
    await db.sessions.clear();
    await db.settings.clear();
  });

  describe('hydrateProjectSnapshot Canonical Behavior (Pillar 5)', () => {
    const sampleManifest: ManuscriptManifest = {
      id: 'proj-123',
      title: 'Chapter One',
      mode: 'local',
      inboxCount: 0,
      outboxCount: 0,
      lastPrintedCharIndex: 0,
      printedPagesCount: 0,
      activeApertureHeight: 4,
      preferredApertureHeight: 4,
      wrapMode: 'soft',
      pageSize: 54,
      pageMode: 'scroll',
      colorScheme: 'dark-amber',
      typeface: 'ibm-plex-mono',
      textSize: 'l',
      showStats: true,
      showSessionTargetTracker: true,
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T12:00:00.000Z',
    };

    const samplePages: PageRecord[] = [
      {
        id: 'proj-123-page-1',
        manuscriptId: 'proj-123',
        pageNumber: 1,
        lines: [
          {
            id: 'p1-l0',
            lineIndex: 0,
            cells: [
              { id: 'c-0', char: 'H', state: 'standard', colIndex: 0, lineIndex: 0 },
              { id: 'c-1', char: 'e', state: 'standard', colIndex: 1, lineIndex: 0 },
              { id: 'c-2', char: 'l', state: 'standard', colIndex: 2, lineIndex: 0 },
              { id: 'c-3', char: 'l', state: 'standard', colIndex: 3, lineIndex: 0 },
              { id: 'c-4', char: 'o', state: 'standard', colIndex: 4, lineIndex: 0 },
            ],
            isCommitted: true,
            wrapType: 'hard',
          },
        ],
        completedAt: null,
      },
    ];

    const sampleSessions: SessionRecord[] = [
      {
        id: 'proj-123-session-1',
        projectId: 'proj-123',
        sessionNumber: 1,
        startedAt: '2026-09-01T10:00:00.000Z',
        completedAt: '2026-09-01T12:00:00.000Z',
        text: 'Hello',
        wordCount: 1,
      },
    ];

    it('normalizes project snapshot with 100% text fidelity and session reconciliation', () => {
      const globalSettings: Partial<ManuscriptManifest> = {
        colorScheme: 'typewriter',
        textSize: 'm',
      };

      const snapshot = hydrateProjectSnapshot(
        { manifest: sampleManifest, pages: samplePages, sessions: sampleSessions },
        { globalSettings, columnLimit: 70 }
      );

      expect(snapshot.cleanText).toBe('Hello');
      expect(snapshot.totalWordCount).toBe(1);
      expect(snapshot.manifest.id).toBe('proj-123');
      expect(snapshot.manifest.title).toBe('Chapter One');
      // Global settings override manifest settings
      expect(snapshot.manifest.colorScheme).toBe('typewriter');
      expect(snapshot.manifest.textSize).toBe('m');
      // Fallback settings preserve manuscript properties not overridden by global
      expect(snapshot.manifest.activeApertureHeight).toBe(4);
      expect(snapshot.normalizedSessions.length).toBe(1);
      expect(snapshot.normalizedSessions[0].sessionNumber).toBe(1);
      expect(snapshot.normalizedSessions[0].completedAt).not.toBeNull();
    });

    it('prunes zero-content sessions and renumbers remaining sessions contiguously', () => {
      const sessionsWithZero: SessionRecord[] = [
        {
          id: 'proj-123-session-1',
          projectId: 'proj-123',
          sessionNumber: 1,
          startedAt: '2026-09-01T10:00:00.000Z',
          completedAt: '2026-09-01T11:00:00.000Z',
          text: 'Hello',
          wordCount: 1,
        },
        {
          id: 'proj-123-session-2',
          projectId: 'proj-123',
          sessionNumber: 2,
          startedAt: '2026-09-01T11:00:00.000Z',
          completedAt: null,
          text: '',
          wordCount: 0,
        },
      ];

      const snapshot = hydrateProjectSnapshot(
        { manifest: sampleManifest, pages: samplePages, sessions: sessionsWithZero },
        { globalSettings: {}, columnLimit: 70 }
      );

      expect(snapshot.removedSessionIds).toContain('proj-123-session-2');
      expect(snapshot.normalizedSessions.length).toBe(1);
      expect(snapshot.normalizedSessions[0].id).toBe('proj-123-session-1');
      expect(snapshot.normalizedSessions[0].sessionNumber).toBe(1);
    });

    it('partitions notecard mode into 10-line historical cards with a fresh draft card', () => {
      const notecardManifest: ManuscriptManifest = {
        ...sampleManifest,
        pageMode: 'notecard',
      };

      // Create 15 lines of content
      const lineStrings = Array.from({ length: 15 }, (_, i) => `Line ${i + 1}`);
      const mockPages: PageRecord[] = [
        {
          id: 'proj-123-page-1',
          manuscriptId: 'proj-123',
          pageNumber: 1,
          lines: lineStrings.map((l, idx) => ({
            id: `p1-l${idx}`,
            lineIndex: idx,
            cells: l.split('').map((c, cIdx) => ({
              id: `c-${cIdx}`,
              char: c,
              state: 'standard' as const,
              colIndex: cIdx,
              lineIndex: idx,
            })),
            isCommitted: true,
            wrapType: 'hard' as const,
          })),
          completedAt: null,
        },
      ];

      const snapshot = hydrateProjectSnapshot(
        { manifest: notecardManifest, pages: mockPages, sessions: [] },
        { mode: 'load', globalSettings: { pageMode: 'notecard' }, columnLimit: 70 }
      );

      // 15 lines in notecard mode on project switch/load (10 lines per card):
      // Historical card 1: 10 lines
      // Historical card 2: 5 lines
      // Active draft card 3: 1 empty line
      expect(snapshot.partitioned.historicalPages.length).toBe(2);
      expect(snapshot.partitioned.historicalPages[0].lines.length).toBe(10);
      expect(snapshot.partitioned.historicalPages[1].lines.length).toBe(5);
      expect(snapshot.partitioned.currentPageNumber).toBe(3);
      expect(snapshot.partitioned.currentPageLines.length).toBe(1);
      expect(snapshot.partitioned.currentPageLines[0].cells.length).toBe(0);
    });

    it('keeps active draft card on platen on rehydrate in notecard mode', () => {
      const notecardManifest: ManuscriptManifest = {
        id: 'test-notecard-rehydrate',
        title: 'Notecard Project',
        mode: 'local',
        inboxCount: 0,
        outboxCount: 0,
        lastPrintedCharIndex: 0,
        printedPagesCount: 0,
        activeApertureHeight: 10,
        wrapMode: 'soft',
        pageSize: 10,
        pageMode: 'notecard',
        colorScheme: 'typewriter',
        typeface: 'courier-prime',
      };

      const fifteenLines = Array.from({ length: 15 }, (_, i) => `Line ${i + 1}`);
      const mockPages: PageRecord[] = [
        {
          id: 'test-notecard-rehydrate-page-1',
          manuscriptId: 'test-notecard-rehydrate',
          pageNumber: 1,
          lines: fifteenLines.map((l, idx) => ({
            id: `p1-line-${idx}`,
            lineIndex: idx,
            cells: l.split('').map((c, cIdx) => ({
              id: `c-${cIdx}`,
              char: c,
              state: 'standard' as const,
              colIndex: cIdx,
              lineIndex: idx,
            })),
            isCommitted: idx < 14,
            wrapType: idx < 14 ? ('hard' as const) : undefined,
          })),
          completedAt: null,
        },
      ];

      const snapshot = hydrateProjectSnapshot(
        { manifest: notecardManifest, pages: mockPages, sessions: [] },
        { mode: 'rehydrate', globalSettings: { pageMode: 'notecard' }, columnLimit: 70 }
      );

      // On browser reload/rehydrate:
      // Historical card 1: 10 lines
      // Active draft card 2: 5 text lines + 1 fresh drafting line appended by textToManuscriptLines
      expect(snapshot.partitioned.historicalPages.length).toBe(1);
      expect(snapshot.partitioned.historicalPages[0].lines.length).toBe(10);
      expect(snapshot.partitioned.currentPageNumber).toBe(2);
      expect(snapshot.partitioned.currentPageLines.length).toBe(6);
      expect(snapshot.partitioned.currentPageLines[5].cells.length).toBe(0);
    });
  });

  describe('Dexie Batch Operations bulkPut (Pillar 6)', () => {
    it('savePages batch writes multiple pages in a single atomic transaction', async () => {
      const pages: PageRecord[] = [
        {
          id: 'test-p1',
          manuscriptId: 'proj-batch',
          pageNumber: 1,
          lines: [],
          completedAt: null,
        },
        {
          id: 'test-p2',
          manuscriptId: 'proj-batch',
          pageNumber: 2,
          lines: [],
          completedAt: '2026-09-01T12:00:00.000Z',
        },
        {
          id: 'test-p3',
          manuscriptId: 'proj-batch',
          pageNumber: 3,
          lines: [],
          completedAt: null,
        },
      ];

      await savePages(pages);

      const retrieved = await getPagesForManuscript('proj-batch');
      expect(retrieved.length).toBe(3);
      expect(retrieved.map((p) => p.pageNumber)).toEqual([1, 2, 3]);
    });

    it('saveSessions batch writes multiple sessions in a single atomic transaction', async () => {
      const sessions: SessionRecord[] = [
        {
          id: 'proj-batch-session-1',
          projectId: 'proj-batch',
          sessionNumber: 1,
          startedAt: '2026-09-01T10:00:00.000Z',
          completedAt: '2026-09-01T11:00:00.000Z',
          text: 'First sprint',
          wordCount: 2,
        },
        {
          id: 'proj-batch-session-2',
          projectId: 'proj-batch',
          sessionNumber: 2,
          startedAt: '2026-09-01T11:30:00.000Z',
          completedAt: '2026-09-01T12:30:00.000Z',
          text: 'Second sprint',
          wordCount: 2,
        },
      ];

      await saveSessions(sessions);

      const retrieved = await getSessionsForProject('proj-batch');
      expect(retrieved.length).toBe(2);
      expect(retrieved[0].text).toBe('First sprint');
      expect(retrieved[1].text).toBe('Second sprint');
    });
  });

  describe('Cross-Slice Drafting Pipeline (Pillar 7)', () => {
    it('notifyDraftingActivity orchestrates session start, dirty flag, and visual save debouncing', () => {
      const mockSet = vi.fn();
      const mockGet = vi.fn(() => ({
        activeSessions: [],
        manifest: { id: 'default-manuscript' },
        saveState: 'saved',
      })) as any;

      notifyDraftingActivity(mockSet, mockGet);

      // Verify dirty flag was set
      expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ isProjectDirty: true }));
    });

    it('pruneZeroContentSessions preserves completed sessions and removes empty trailing drafts', () => {
      const sessions: SessionRecord[] = [
        {
          id: 's-1',
          projectId: 'p-1',
          sessionNumber: 1,
          startedAt: '2026-09-01T10:00:00.000Z',
          completedAt: '2026-09-01T10:30:00.000Z',
          text: 'Drafted sentence.',
          wordCount: 2,
        },
        {
          id: 's-2',
          projectId: 'p-1',
          sessionNumber: 2,
          startedAt: '2026-09-01T11:00:00.000Z',
          completedAt: null,
          text: '   ',
          wordCount: 0,
        },
      ];

      const { pruned, removedIds } = pruneZeroContentSessions(sessions);
      expect(removedIds).toEqual(['s-2']);
      expect(pruned.length).toBe(1);
      expect(pruned[0].id).toBe('s-1');
    });

    it('initializes exactly ONE Untitled Project on a clean private tab startup with concurrent rehydrate calls', async () => {
      localStorage.clear();
      await db.manuscripts.clear();
      await db.pages.clear();
      await db.sessions.clear();
      await db.settings.clear();

      useTypingStore.setState({
        manifest: { ...DEFAULT_MANIFEST },
        isHydrated: false,
        activeSessions: [],
        historicalPages: [],
        currentPageLines: [],
      });

      // Simulate concurrent rehydration calls on initial mount (React StrictMode / double mount)
      await Promise.all([
        useTypingStore.getState().rehydrate(),
        useTypingStore.getState().rehydrate(),
      ]);

      const all = await getAllManuscripts();
      expect(all.length).toBe(1);
      expect(all[0].title).toBe('Untitled Project');
      expect(all[0].id).not.toBe('default-manuscript');

      const activeId = localStorage.getItem(ACTIVE_PROJECT_KEY);
      expect(activeId).toBe(all[0].id);
      expect(useTypingStore.getState().manifest.id).toBe(all[0].id);
      expect(useTypingStore.getState().isHydrated).toBe(true);
    });
  });
});
