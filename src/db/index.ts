import Dexie, { type EntityTable } from 'dexie';
import { ManuscriptManifest, PageRecord } from '@/types';

export class MinitypeDatabase extends Dexie {
  manuscripts!: EntityTable<ManuscriptManifest, 'id'>;
  pages!: EntityTable<PageRecord, 'id'>;

  constructor() {
    super('MinitypeDatabase');
    this.version(1).stores({
      manuscripts: 'id, mode, updatedAt',
      pages: 'id, manuscriptId, pageNumber, [manuscriptId+pageNumber]',
    });
  }
}

export const db = new MinitypeDatabase();

export async function saveManuscript(manifest: ManuscriptManifest): Promise<void> {
  if (manifest.mode === 'temp') return;
  try {
    await db.manuscripts.put({
      ...manifest,
      updatedAt: new Date().toISOString(),
    });
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

export async function loadManuscriptProject(
  id: string
): Promise<{ manifest: ManuscriptManifest; pages: PageRecord[] } | null> {
  try {
    const manifest = await db.manuscripts.get(id);
    if (!manifest) return null;
    const pages = await db.pages.where('manuscriptId').equals(id).sortBy('pageNumber');
    return { manifest, pages };
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

let saveTimer: ReturnType<typeof setTimeout> | null = null;
const pendingPagesMap = new Map<string, PageRecord>();
let persistenceErrorHandler: ((err: Error | null) => void) | null = null;

export function setPersistenceErrorHandler(handler: ((err: Error | null) => void) | null): void {
  persistenceErrorHandler = handler;
}

function notifyPersistenceError(err: Error | null): void {
  if (persistenceErrorHandler) {
    persistenceErrorHandler(err);
  }
}

export function debounceSavePage(page: PageRecord, delayMs = 250): void {
  const pageId = page.id || `${page.manuscriptId || 'default'}-page-${page.pageNumber}`;
  pendingPagesMap.set(pageId, page);

  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await flushPendingSave();
  }, delayMs);
}

export async function flushPendingSave(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (pendingPagesMap.size === 0) return;

  const pagesToSave = Array.from(pendingPagesMap.values());
  pendingPagesMap.clear();

  try {
    await Promise.all(pagesToSave.map((p) => savePage(p)));
    notifyPersistenceError(null);
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

  await db.transaction('rw', db.manuscripts, db.pages, async () => {
    await db.manuscripts.delete(manuscriptId);
    await db.pages.where('manuscriptId').equals(manuscriptId).delete();
  });
}

export async function deletePagesForManuscript(manuscriptId: string): Promise<void> {
  await db.pages.where('manuscriptId').equals(manuscriptId).delete();
}

