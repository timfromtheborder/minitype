import { db, flushPendingSave, getGlobalSettingsFromDb, saveGlobalSettingsToDb } from '@/db';
import { MinitypeBackupArchive, ManuscriptManifest, PageRecord, SessionRecord } from '@/types';
import { persistSettings, readSynchronousSettings } from '@/stores/settingsPersistence';

export const BACKUP_SCHEMA_VERSION = 1;
export const CURRENT_BACKUP_VERSION = '0.9.7.5.5';

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  archive?: MinitypeBackupArchive;
}

export interface RestoreResult {
  projectCount: number;
  sessionCount: number;
}

/**
 * Determines whether a manuscript has zero drafted content across all pages and sessions.
 * Returns true if the project has never been typed in (empty pages, 0 words, no session text).
 */
export function isProjectEmpty(
  manifest: ManuscriptManifest,
  pages: PageRecord[] = [],
  sessions: SessionRecord[] = []
): boolean {
  if (manifest.totalWordCount && manifest.totalWordCount > 0) {
    return false;
  }
  if (manifest.lastPrintedCharIndex && manifest.lastPrintedCharIndex > 0) {
    return false;
  }

  // Check if any session has non-empty text or words
  const hasSessionText = sessions.some(
    (s) => (s.wordCount && s.wordCount > 0) || (s.text && s.text.trim().length > 0)
  );
  if (hasSessionText) {
    return false;
  }

  // Check if any page has cells with typed non-whitespace characters
  const hasPageText = pages.some(
    (p) => p.lines && p.lines.some((l) => l.cells && l.cells.some((c) => c.char && c.char.trim().length > 0))
  );
  if (hasPageText) {
    return false;
  }

  // If title is default untitled project ("Untitled Project" or "Untitled Project (N)")
  // or title is empty:
  const isUntitled = !manifest.title || /^Untitled Project(?:\s*\(\d+\))?$/i.test(manifest.title.trim());
  if (isUntitled) {
    return true;
  }

  // If it has pages (e.g. newly provisioned Page 1) but 0 typed characters across all pages and sessions:
  if (pages.length > 0 && !hasPageText && !hasSessionText) {
    return true;
  }

  return false;
}

/**
 * Serializes the complete IndexedDB library and settings into a MinitypeBackupArchive.
 * Completely empty projects are pruned prior to archive creation.
 */
export async function createLibraryBackup(): Promise<MinitypeBackupArchive> {
  await flushPendingSave();

  const [manuscripts, pages, sessions, dbSettings] = await Promise.all([
    db.manuscripts.toArray(),
    db.pages.toArray(),
    db.sessions.toArray(),
    getGlobalSettingsFromDb().catch(() => null),
  ]);

  // Group pages and sessions by document
  const pagesByDoc = new Map<string, PageRecord[]>();
  for (const p of pages) {
    if (!p.manuscriptId) continue;
    const arr = pagesByDoc.get(p.manuscriptId) || [];
    arr.push(p);
    pagesByDoc.set(p.manuscriptId, arr);
  }

  const sessionsByDoc = new Map<string, SessionRecord[]>();
  for (const s of sessions) {
    if (!s.projectId) continue;
    const arr = sessionsByDoc.get(s.projectId) || [];
    arr.push(s);
    sessionsByDoc.set(s.projectId, arr);
  }

  // Identify completely empty manuscripts
  const emptyManuscriptIds = new Set<string>();
  for (const m of manuscripts) {
    const docPages = pagesByDoc.get(m.id) || [];
    const docSessions = sessionsByDoc.get(m.id) || [];
    if (isProjectEmpty(m, docPages, docSessions)) {
      emptyManuscriptIds.add(m.id);
    }
  }

  // If there are non-empty manuscripts, prune empty ones from the DB and exclude from export
  const nonZeroManuscripts = manuscripts.filter((m) => !emptyManuscriptIds.has(m.id));
  const manuscriptsToExport = nonZeroManuscripts.length > 0 ? nonZeroManuscripts : manuscripts;
  const exportedDocIds = new Set(manuscriptsToExport.map((m) => m.id));

  if (nonZeroManuscripts.length > 0 && emptyManuscriptIds.size > 0) {
    await db.transaction('rw', db.manuscripts, db.pages, db.sessions, async () => {
      for (const id of emptyManuscriptIds) {
        await db.manuscripts.delete(id);
        await db.pages.where('manuscriptId').equals(id).delete();
        await db.sessions.where('projectId').equals(id).delete();
      }
    }).catch(console.error);
  }

  const filteredPages = pages.filter((p) => p.manuscriptId && exportedDocIds.has(p.manuscriptId));
  const filteredSessions = sessions.filter((s) => s.projectId && exportedDocIds.has(s.projectId));

  const syncSettings = readSynchronousSettings();
  const mergedSettings: Partial<ManuscriptManifest> = {
    ...(dbSettings || {}),
    ...(syncSettings || {}),
  };

  return {
    app: 'minitype',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    version: CURRENT_BACKUP_VERSION,
    manuscripts: manuscriptsToExport,
    pages: filteredPages,
    sessions: filteredSessions,
    settings: Object.keys(mergedSettings).length > 0 ? mergedSettings : undefined,
  };
}

/**
 * Triggers a browser file download of the given backup archive as a formatted JSON file.
 */
export function downloadLibraryBackup(archive: MinitypeBackupArchive): void {
  const jsonString = JSON.stringify(archive, null, 2);
  const dateStr = (archive.exportedAt || new Date().toISOString()).split('T')[0];
  const fileName = `minitype-backup-${dateStr}.json`;

  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Validates untrusted parsed JSON data to ensure it complies with the MinitypeBackupArchive schema.
 */
export function validateBackupArchive(data: any): ValidationResult {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { isValid: false, error: 'File does not contain a valid JSON object.' };
  }

  if (data.app !== 'minitype') {
    return { isValid: false, error: 'File is not a valid Minitype backup archive (missing "minitype" app tag).' };
  }

  if (typeof data.schemaVersion !== 'number') {
    return { isValid: false, error: 'Backup archive is missing a valid schemaVersion number.' };
  }

  if (!Array.isArray(data.manuscripts)) {
    return { isValid: false, error: 'Backup archive manuscripts property must be an array.' };
  }

  if (!Array.isArray(data.pages)) {
    return { isValid: false, error: 'Backup archive pages property must be an array.' };
  }

  if (!Array.isArray(data.sessions)) {
    return { isValid: false, error: 'Backup archive sessions property must be an array.' };
  }

  // Validate each manuscript
  for (let i = 0; i < data.manuscripts.length; i++) {
    const m = data.manuscripts[i];
    if (!m || typeof m !== 'object' || typeof m.id !== 'string' || typeof m.title !== 'string') {
      return { isValid: false, error: `Manuscript at index ${i} is missing required string properties "id" or "title".` };
    }
  }

  // Validate each page
  for (let i = 0; i < data.pages.length; i++) {
    const p = data.pages[i];
    if (
      !p ||
      typeof p !== 'object' ||
      typeof p.id !== 'string' ||
      typeof p.manuscriptId !== 'string' ||
      typeof p.pageNumber !== 'number' ||
      !Array.isArray(p.lines)
    ) {
      return { isValid: false, error: `Page at index ${i} is missing required properties ("id", "manuscriptId", "pageNumber", "lines").` };
    }
  }

  // Validate each session
  for (let i = 0; i < data.sessions.length; i++) {
    const s = data.sessions[i];
    if (
      !s ||
      typeof s !== 'object' ||
      typeof s.id !== 'string' ||
      typeof s.projectId !== 'string' ||
      typeof s.sessionNumber !== 'number'
    ) {
      return { isValid: false, error: `Session at index ${i} is missing required properties ("id", "projectId", "sessionNumber").` };
    }
  }

  return { isValid: true, archive: data as MinitypeBackupArchive };
}

/**
 * Restores a validated backup archive into IndexedDB with atomic transaction semantics.
 */
export async function restoreLibraryBackup(
  archive: MinitypeBackupArchive,
  mode: 'merge' | 'replace' = 'merge'
): Promise<RestoreResult> {
  await flushPendingSave();

  // Group archive pages and sessions by document
  const archivePagesByDoc = new Map<string, PageRecord[]>();
  for (const p of archive.pages) {
    if (!p.manuscriptId) continue;
    const arr = archivePagesByDoc.get(p.manuscriptId) || [];
    arr.push(p);
    archivePagesByDoc.set(p.manuscriptId, arr);
  }

  const archiveSessionsByDoc = new Map<string, SessionRecord[]>();
  for (const s of archive.sessions) {
    if (!s.projectId) continue;
    const arr = archiveSessionsByDoc.get(s.projectId) || [];
    arr.push(s);
    archiveSessionsByDoc.set(s.projectId, arr);
  }

  // Filter incoming archive manuscripts to drop any completely empty ones
  const nonZeroArchiveManuscripts = archive.manuscripts.filter((m) => {
    const docPages = archivePagesByDoc.get(m.id) || [];
    const docSessions = archiveSessionsByDoc.get(m.id) || [];
    return !isProjectEmpty(m, docPages, docSessions);
  });

  const validArchiveManuscripts =
    nonZeroArchiveManuscripts.length > 0 ? nonZeroArchiveManuscripts : archive.manuscripts;
  const validDocIds = new Set(validArchiveManuscripts.map((m) => m.id));
  const validArchivePages = archive.pages.filter((p) => p.manuscriptId && validDocIds.has(p.manuscriptId));
  const validArchiveSessions = archive.sessions.filter((s) => s.projectId && validDocIds.has(s.projectId));

  // Inspect existing IndexedDB manuscripts to identify completely empty ones (e.g. blank 'Untitled Project')
  const [existingManuscripts, existingPages, existingSessions] = await Promise.all([
    db.manuscripts.toArray(),
    db.pages.toArray(),
    db.sessions.toArray(),
  ]);

  const existingPagesByDoc = new Map<string, PageRecord[]>();
  for (const p of existingPages) {
    if (!p.manuscriptId) continue;
    const arr = existingPagesByDoc.get(p.manuscriptId) || [];
    arr.push(p);
    existingPagesByDoc.set(p.manuscriptId, arr);
  }

  const existingSessionsByDoc = new Map<string, SessionRecord[]>();
  for (const s of existingSessions) {
    if (!s.projectId) continue;
    const arr = existingSessionsByDoc.get(s.projectId) || [];
    arr.push(s);
    existingSessionsByDoc.set(s.projectId, arr);
  }

  const emptyExistingIds = new Set<string>();
  for (const m of existingManuscripts) {
    const docPages = existingPagesByDoc.get(m.id) || [];
    const docSessions = existingSessionsByDoc.get(m.id) || [];
    if (isProjectEmpty(m, docPages, docSessions)) {
      emptyExistingIds.add(m.id);
    }
  }

  await db.transaction('rw', db.manuscripts, db.pages, db.sessions, db.settings, async () => {
    if (mode === 'replace') {
      await db.manuscripts.clear();
      await db.pages.clear();
      await db.sessions.clear();
      if (archive.settings) {
        await db.settings.clear();
      }
    } else {
      // In merge mode: if we are restoring valid projects, prune any existing empty projects!
      if (validArchiveManuscripts.length > 0 && emptyExistingIds.size > 0) {
        for (const id of emptyExistingIds) {
          await db.manuscripts.delete(id);
          await db.pages.where('manuscriptId').equals(id).delete();
          await db.sessions.where('projectId').equals(id).delete();
        }
      }
    }

    if (validArchiveManuscripts.length > 0) {
      await db.manuscripts.bulkPut(validArchiveManuscripts);
    }
    if (validArchivePages.length > 0) {
      await db.pages.bulkPut(validArchivePages);
    }
    if (validArchiveSessions.length > 0) {
      await db.sessions.bulkPut(validArchiveSessions);
    }

    if (archive.settings && Object.keys(archive.settings).length > 0) {
      await saveGlobalSettingsToDb(archive.settings);
      persistSettings(archive.settings);
    }
  });

  return {
    projectCount: validArchiveManuscripts.length,
    sessionCount: validArchiveSessions.length,
  };
}
