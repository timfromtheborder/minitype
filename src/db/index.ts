import Dexie, { type EntityTable } from 'dexie';
import { ManuscriptManifest, PageRecord, SessionRecord } from '@/types';

export class MinitypeDatabase extends Dexie {
  manuscripts!: EntityTable<ManuscriptManifest, 'id'>;
  pages!: EntityTable<PageRecord, 'id'>;
  sessions!: EntityTable<SessionRecord, 'id'>;
  settings!: EntityTable<{ id: string; settings: Partial<ManuscriptManifest> }, 'id'>;

  constructor() {
    super('MinitypeDatabase');
    this.version(1).stores({
      manuscripts: 'id, mode, updatedAt',
      pages: 'id, manuscriptId, pageNumber, [manuscriptId+pageNumber]',
    });
    this.version(2).stores({
      manuscripts: 'id, mode, updatedAt, createdAt, title',
      pages: 'id, manuscriptId, pageNumber, [manuscriptId+pageNumber]',
      sessions: 'id, projectId, sessionNumber, startedAt',
    });
    this.version(3).stores({
      manuscripts: 'id, mode, updatedAt, createdAt, title',
      pages: 'id, manuscriptId, pageNumber, [manuscriptId+pageNumber]',
      sessions: 'id, projectId, sessionNumber, startedAt',
      settings: 'id',
    });
  }
}

export const db = new MinitypeDatabase();

if (typeof window !== 'undefined') {
  db.on('versionchange', () => {
    db.close();
    return false;
  });
}

export type SaveStatus = 'saved' | 'saving' | 'error';
let saveStatusHandler: ((status: SaveStatus) => void) | null = null;
let persistenceErrorHandler: ((err: Error | null) => void) | null = null;

export function setSaveStatusHandler(handler: ((status: SaveStatus) => void) | null): void {
  saveStatusHandler = handler;
}

export function setPersistenceErrorHandler(handler: ((err: Error | null) => void) | null): void {
  persistenceErrorHandler = handler;
}

function notifyPersistenceError(err: Error | null): void {
  if (persistenceErrorHandler) {
    persistenceErrorHandler(err);
  }
  if (saveStatusHandler) {
    saveStatusHandler(err ? 'error' : 'saved');
  }
}

function notifySaveStatus(status: SaveStatus): void {
  if (saveStatusHandler) {
    saveStatusHandler(status);
  }
}

export async function saveManuscript(manifest: ManuscriptManifest): Promise<void> {
  try {
    const docData: any = {
      ...manifest,
      id: manifest.id,
      title: manifest.title || 'Untitled Manuscript',
      mode: 'local',
      inboxCount: manifest.inboxCount ?? 0,
      outboxCount: manifest.outboxCount ?? 0,
      lastPrintedCharIndex: manifest.lastPrintedCharIndex ?? 0,
      printedPagesCount: manifest.printedPagesCount ?? 0,
      activeSessionId: manifest.activeSessionId,
      sessionCount: manifest.sessionCount ?? 1,
      totalWordCount: manifest.totalWordCount ?? 0,
      createdAt: manifest.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.manuscripts.put(docData);
    notifyPersistenceError(null);
  } catch (err: any) {
    console.error('Failed to save manuscript to IndexedDB:', err);
    notifyPersistenceError(err instanceof Error ? err : new Error(String(err)));
    throw err;
  }
}

export async function getManuscript(id: string): Promise<ManuscriptManifest | undefined> {
  return await db.manuscripts.get(id);
}

export async function getAllManuscripts(): Promise<ManuscriptManifest[]> {
  try {
    const list = await db.manuscripts.toArray();
    list.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
    return list;
  } catch (err) {
    console.error('Failed to get manuscripts list:', err);
    return [];
  }
}

export async function saveSession(session: SessionRecord): Promise<void> {
  try {
    await db.sessions.put(session);
    notifyPersistenceError(null);
  } catch (err: any) {
    console.error('Failed to save session to IndexedDB:', err);
    notifyPersistenceError(err instanceof Error ? err : new Error(String(err)));
    throw err;
  }
}

export async function getSessionsForProject(projectId: string): Promise<SessionRecord[]> {
  try {
    const list = await db.sessions
      .where('projectId')
      .equals(projectId)
      .sortBy('sessionNumber');
    return list;
  } catch (err) {
    console.error('Failed to get sessions for project:', err);
    return [];
  }
}

export async function deleteSession(sessionId: string): Promise<void> {
  try {
    await db.sessions.delete(sessionId);
  } catch (err) {
    console.error('Failed to delete session:', err);
  }
}

export async function deleteSessionsForProject(projectId: string): Promise<void> {
  try {
    await db.sessions.where('projectId').equals(projectId).delete();
  } catch (err) {
    console.error('Failed to delete sessions for project:', err);
  }
}

export async function loadManuscriptProject(
  id: string
): Promise<{ manifest: ManuscriptManifest; pages: PageRecord[]; sessions: SessionRecord[] } | null> {
  try {
    const manifest = await db.manuscripts.get(id);
    if (!manifest) return null;
    const [pages, sessions] = await Promise.all([
      db.pages.where('manuscriptId').equals(id).sortBy('pageNumber'),
      db.sessions.where('projectId').equals(id).sortBy('sessionNumber'),
    ]);
    return { manifest, pages, sessions };
  } catch (err) {
    console.error('Failed to load manuscript project:', err);
    return null;
  }
}

export async function savePage(page: PageRecord): Promise<void> {
  const pageId = page.id || `${page.manuscriptId || 'default'}-page-${page.pageNumber}`;
  try {
    await db.pages.put({
      ...page,
      id: pageId,
    });
    notifyPersistenceError(null);
  } catch (err: any) {
    console.error('Failed to save page to IndexedDB:', err);
    notifyPersistenceError(err instanceof Error ? err : new Error(String(err)));
    throw err;
  }
}

export async function getPagesForManuscript(manuscriptId: string): Promise<PageRecord[]> {
  return await db.pages
    .where('manuscriptId')
    .equals(manuscriptId)
    .sortBy('pageNumber');
}

export async function saveGlobalSettingsToDb(settings: Partial<ManuscriptManifest>): Promise<void> {
  try {
    const existing = await db.settings.get('global');
    const merged = { ...(existing?.settings || {}), ...settings };
    if (!(merged as any)._updatedAt) {
      (merged as any)._updatedAt = Date.now();
    }
    await db.settings.put({ id: 'global', settings: merged });
  } catch (err) {
    console.error('Failed to save settings to IndexedDB:', err);
  }
}

export async function getGlobalSettingsFromDb(): Promise<Partial<ManuscriptManifest> | null> {
  try {
    const record = await db.settings.get('global');
    return record?.settings || null;
  } catch (err) {
    console.error('Failed to get settings from IndexedDB:', err);
    return null;
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
const pendingPagesMap = new Map<string, PageRecord>();

export function debounceSavePage(page: PageRecord, delayMs = 2000): void {
  const pageId = page.id || `${page.manuscriptId || 'default'}-page-${page.pageNumber}`;
  pendingPagesMap.set(pageId, page);

  // Requirement: Only animate when typing stops for a few seconds. Do not trigger 'saving' on every key!
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    notifySaveStatus('saving');
    await flushPendingSave();
  }, delayMs);
}

export async function flushPendingSave(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (pendingPagesMap.size === 0) {
    notifySaveStatus('saved');
    return;
  }

  notifySaveStatus('saving');
  const pagesToSave = Array.from(pendingPagesMap.values());
  pendingPagesMap.clear();

  try {
    await Promise.all(pagesToSave.map((p) => savePage(p)));
    notifyPersistenceError(null);
    notifySaveStatus('saved');
  } catch (err: any) {
    console.error('Failed to flush debounced pages to IndexedDB:', err);
    notifyPersistenceError(err instanceof Error ? err : new Error(String(err)));
  }
}

export async function clearManuscriptData(manuscriptId: string): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  pendingPagesMap.clear();

  await db.transaction('rw', db.manuscripts, db.pages, db.sessions, async () => {
    await db.manuscripts.delete(manuscriptId);
    await db.pages.where('manuscriptId').equals(manuscriptId).delete();
    await db.sessions.where('projectId').equals(manuscriptId).delete();
  });
}

export async function deletePagesForManuscript(manuscriptId: string): Promise<void> {
  await db.pages.where('manuscriptId').equals(manuscriptId).delete();
}
