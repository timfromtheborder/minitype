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
 * Serializes the complete IndexedDB library and settings into a MinitypeBackupArchive.
 */
export async function createLibraryBackup(): Promise<MinitypeBackupArchive> {
  await flushPendingSave();

  const [manuscripts, pages, sessions, dbSettings] = await Promise.all([
    db.manuscripts.toArray(),
    db.pages.toArray(),
    db.sessions.toArray(),
    getGlobalSettingsFromDb().catch(() => null),
  ]);

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
    manuscripts,
    pages,
    sessions,
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

  await db.transaction('rw', db.manuscripts, db.pages, db.sessions, db.settings, async () => {
    if (mode === 'replace') {
      await db.manuscripts.clear();
      await db.pages.clear();
      await db.sessions.clear();
      if (archive.settings) {
        await db.settings.clear();
      }
    }

    if (archive.manuscripts.length > 0) {
      await db.manuscripts.bulkPut(archive.manuscripts);
    }
    if (archive.pages.length > 0) {
      await db.pages.bulkPut(archive.pages);
    }
    if (archive.sessions.length > 0) {
      await db.sessions.bulkPut(archive.sessions);
    }

    if (archive.settings && Object.keys(archive.settings).length > 0) {
      await saveGlobalSettingsToDb(archive.settings);
      persistSettings(archive.settings);
    }
  });

  return {
    projectCount: archive.manuscripts.length,
    sessionCount: archive.sessions.length,
  };
}
