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
  await db.manuscripts.put({
    ...manifest,
    updatedAt: new Date().toISOString(),
  });
}

export async function getManuscript(id: string): Promise<ManuscriptManifest | undefined> {
  return await db.manuscripts.get(id);
}

export async function savePage(page: PageRecord): Promise<void> {
  const pageId = page.id || `${page.manuscriptId || 'default'}-page-${page.pageNumber}`;
  await db.pages.put({
    ...page,
    id: pageId,
  });
}

export async function getPagesForManuscript(manuscriptId: string): Promise<PageRecord[]> {
  return await db.pages
    .where('manuscriptId')
    .equals(manuscriptId)
    .sortBy('pageNumber');
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPageToSave: PageRecord | null = null;

export function debounceSavePage(page: PageRecord, delayMs = 250): void {
  pendingPageToSave = page;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (pendingPageToSave) {
      savePage(pendingPageToSave).catch(console.error);
      pendingPageToSave = null;
    }
  }, delayMs);
}

export function flushPendingSave(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (pendingPageToSave) {
    savePage(pendingPageToSave).catch(console.error);
    pendingPageToSave = null;
  }
}

export async function clearManuscriptData(manuscriptId: string): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  pendingPageToSave = null;

  await db.transaction('rw', db.manuscripts, db.pages, async () => {
    await db.manuscripts.delete(manuscriptId);
    await db.pages.where('manuscriptId').equals(manuscriptId).delete();
  });
}

