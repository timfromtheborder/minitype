import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import { useTypingStore } from '@/stores/typingStore';
import {
  createLibraryBackup,
  validateBackupArchive,
  restoreLibraryBackup,
  CURRENT_BACKUP_VERSION,
} from '@/lib/backup';
import { MinitypeBackupArchive, ManuscriptManifest, PageRecord, SessionRecord } from '@/types';

describe('Whole-Library Backup & Restore Engine (Pass B2 / v0.9.7.5.5)', () => {
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await db.manuscripts.clear();
    await db.pages.clear();
    await db.sessions.clear();
    await db.settings.clear();

    useTypingStore.getState().resetEngine({
      mode: 'local',
      inboxCount: 0,
      outboxCount: 0,
      activeApertureHeight: 3,
      wrapMode: 'soft',
      pageSize: 54,
    });
  });

  describe('validateBackupArchive', () => {
    const validSampleArchive: MinitypeBackupArchive = {
      app: 'minitype',
      schemaVersion: 1,
      exportedAt: '2026-09-17T00:00:00.000Z',
      version: CURRENT_BACKUP_VERSION,
      manuscripts: [
        {
          id: 'test-doc-1',
          title: 'First Project',
          mode: 'local',
          inboxCount: 0,
          outboxCount: 0,
          lastPrintedCharIndex: 0,
          printedPagesCount: 0,
          activeApertureHeight: 3,
          wrapMode: 'soft',
          pageSize: 54,
          pageMode: 'scroll',
          colorScheme: 'typewriter',
          typeface: 'courier-prime',
        },
      ],
      pages: [
        {
          id: 'test-doc-1-page-1',
          manuscriptId: 'test-doc-1',
          pageNumber: 1,
          lines: [],
          completedAt: null,
        },
      ],
      sessions: [
        {
          id: 'test-doc-1-session-1',
          projectId: 'test-doc-1',
          sessionNumber: 1,
          startedAt: '2026-09-17T00:00:00.000Z',
          completedAt: null,
          text: 'Sample text',
          wordCount: 2,
        },
      ],
      settings: {
        colorScheme: 'dark-amber',
      },
    };

    it('succeeds for valid Minitype backup archives', () => {
      const result = validateBackupArchive(validSampleArchive);
      expect(result.isValid).toBe(true);
      expect(result.archive).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('rejects null, non-objects, and arrays', () => {
      expect(validateBackupArchive(null).isValid).toBe(false);
      expect(validateBackupArchive('invalid json string').isValid).toBe(false);
      expect(validateBackupArchive([]).isValid).toBe(false);
    });

    it('rejects archives missing the "minitype" app tag', () => {
      const invalid = { ...validSampleArchive, app: 'otherapp' };
      const res = validateBackupArchive(invalid);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('missing "minitype" app tag');
    });

    it('rejects archives missing schemaVersion', () => {
      const invalid = { ...validSampleArchive, schemaVersion: undefined };
      const res = validateBackupArchive(invalid);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('schemaVersion');
    });

    it('rejects archives with missing manuscripts array', () => {
      const invalid = { ...validSampleArchive, manuscripts: null };
      expect(validateBackupArchive(invalid).isValid).toBe(false);
    });

    it('rejects archives with corrupted manuscript missing id or title', () => {
      const invalid = {
        ...validSampleArchive,
        manuscripts: [{ id: 'doc-1' }], // missing title
      };
      const res = validateBackupArchive(invalid);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('missing required string properties');
    });

    it('rejects archives with corrupted page entries', () => {
      const invalid = {
        ...validSampleArchive,
        pages: [{ id: 'p-1', manuscriptId: 'doc-1', pageNumber: 'one' }], // invalid pageNumber type
      };
      const res = validateBackupArchive(invalid);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('Page at index 0');
    });

    it('rejects archives with corrupted session entries', () => {
      const invalid = {
        ...validSampleArchive,
        sessions: [{ id: 's-1', projectId: 'doc-1' }], // missing sessionNumber
      };
      const res = validateBackupArchive(invalid);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('Session at index 0');
    });
  });

  describe('createLibraryBackup & restoreLibraryBackup (Merge vs Replace)', () => {
    it('creates a complete backup archive from IndexedDB records', async () => {
      const manifest: ManuscriptManifest = {
        id: 'doc-alpha',
        title: 'Project Alpha',
        mode: 'local',
        inboxCount: 0,
        outboxCount: 0,
        lastPrintedCharIndex: 0,
        printedPagesCount: 0,
        activeApertureHeight: 4,
        wrapMode: 'soft',
        pageSize: 54,
        pageMode: 'scroll',
        colorScheme: 'phosphor',
        typeface: 'jetbrains-mono',
      };
      const page: PageRecord = {
        id: 'doc-alpha-page-1',
        manuscriptId: 'doc-alpha',
        pageNumber: 1,
        lines: [],
        completedAt: null,
      };
      const session: SessionRecord = {
        id: 'doc-alpha-session-1',
        projectId: 'doc-alpha',
        sessionNumber: 1,
        startedAt: '2026-09-17T01:00:00.000Z',
        completedAt: null,
        text: 'Alpha content',
        wordCount: 2,
      };

      await db.manuscripts.put(manifest);
      await db.pages.put(page);
      await db.sessions.put(session);

      const backup = await createLibraryBackup();
      expect(backup.app).toBe('minitype');
      expect(backup.schemaVersion).toBe(1);
      expect(backup.version).toBe(CURRENT_BACKUP_VERSION);
      expect(backup.manuscripts).toHaveLength(1);
      expect(backup.manuscripts[0].title).toBe('Project Alpha');
      expect(backup.pages).toHaveLength(1);
      expect(backup.sessions).toHaveLength(1);
    });

    it('non-destructively merges backup into an existing library without deleting unrelated projects', async () => {
      // Existing project in library
      const existingManifest: ManuscriptManifest = {
        id: 'doc-existing',
        title: 'Existing Project',
        mode: 'local',
        inboxCount: 0,
        outboxCount: 0,
        lastPrintedCharIndex: 0,
        printedPagesCount: 0,
        activeApertureHeight: 3,
        wrapMode: 'soft',
        pageSize: 54,
        pageMode: 'scroll',
        colorScheme: 'typewriter',
        typeface: 'courier-prime',
      };
      await db.manuscripts.put(existingManifest);

      // Backup containing a DIFFERENT project and an updated version of existing project
      const backup: MinitypeBackupArchive = {
        app: 'minitype',
        schemaVersion: 1,
        exportedAt: '2026-09-17T01:00:00.000Z',
        version: CURRENT_BACKUP_VERSION,
        manuscripts: [
          {
            ...existingManifest,
            title: 'Existing Project (Updated)',
          },
          {
            id: 'doc-incoming',
            title: 'Incoming Project',
            mode: 'local',
            inboxCount: 0,
            outboxCount: 0,
            lastPrintedCharIndex: 0,
            printedPagesCount: 0,
            activeApertureHeight: 5,
            wrapMode: 'soft',
            pageSize: 54,
            pageMode: 'scroll',
            colorScheme: 'spotlight',
            typeface: 'ibm-plex-mono',
          },
        ],
        pages: [
          {
            id: 'doc-incoming-page-1',
            manuscriptId: 'doc-incoming',
            pageNumber: 1,
            lines: [],
            completedAt: null,
          },
        ],
        sessions: [
          {
            id: 'doc-incoming-session-1',
            projectId: 'doc-incoming',
            sessionNumber: 1,
            startedAt: '2026-09-17T01:00:00.000Z',
            completedAt: null,
            text: 'Hello from backup',
            wordCount: 3,
          },
        ],
      };

      const res = await restoreLibraryBackup(backup, 'merge');
      expect(res.projectCount).toBe(2);

      const all = await db.manuscripts.toArray();
      expect(all).toHaveLength(2);
      const updatedExisting = all.find((m) => m.id === 'doc-existing');
      expect(updatedExisting?.title).toBe('Existing Project (Updated)');
      const incoming = all.find((m) => m.id === 'doc-incoming');
      expect(incoming?.title).toBe('Incoming Project');
    });

    it('completely replaces the database when mode is "replace"', async () => {
      // Populate existing project
      await db.manuscripts.put({
        id: 'to-be-wiped',
        title: 'Old Project',
        mode: 'local',
        inboxCount: 0,
        outboxCount: 0,
        lastPrintedCharIndex: 0,
        printedPagesCount: 0,
        activeApertureHeight: 1,
        wrapMode: 'soft',
        pageSize: 54,
        pageMode: 'scroll',
        colorScheme: 'typewriter',
        typeface: 'courier-prime',
      });

      const backup: MinitypeBackupArchive = {
        app: 'minitype',
        schemaVersion: 1,
        exportedAt: '2026-09-17T01:00:00.000Z',
        version: CURRENT_BACKUP_VERSION,
        manuscripts: [
          {
            id: 'brand-new',
            title: 'Sole Project',
            mode: 'local',
            inboxCount: 0,
            outboxCount: 0,
            lastPrintedCharIndex: 0,
            printedPagesCount: 0,
            activeApertureHeight: 2,
            wrapMode: 'soft',
            pageSize: 54,
            pageMode: 'scroll',
            colorScheme: 'dark-amber',
            typeface: 'jetbrains-mono',
          },
        ],
        pages: [],
        sessions: [],
      };

      await restoreLibraryBackup(backup, 'replace');

      const all = await db.manuscripts.toArray();
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe('brand-new');
      expect(all[0].title).toBe('Sole Project');
    });
  });

  describe('Store Integration (exportFullBackup & restoreFullBackup)', () => {
    it('exports active typing state and re-synchronizes on restore', async () => {
      const store = useTypingStore.getState();
      await store.newProject(true);
      const originalId = useTypingStore.getState().manifest.id;

      for (const ch of 'First sentence in original project.') {
        store.insertChar(ch);
      }
      expect(useTypingStore.getState().currentPageLines[0].cells.length).toBeGreaterThan(0);

      // Export full backup
      const backup = await store.exportFullBackup();
      expect(backup.manuscripts.some((m) => m.id === originalId)).toBe(true);

      // Create another project in memory
      await store.newProject(true);
      const newProjectId = useTypingStore.getState().manifest.id;
      expect(newProjectId).not.toBe(originalId);

      // Restore the backup (merge mode)
      await store.restoreFullBackup(backup, 'merge');

      // The active project remains valid and both projects exist in DB
      const allManuscripts = await db.manuscripts.toArray();
      expect(allManuscripts.length).toBeGreaterThanOrEqual(2);
    });
  });
});
