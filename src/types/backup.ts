import { ManuscriptManifest, PageRecord, SessionRecord } from '@/types';

export interface MinitypeBackupArchive {
  app: 'minitype';
  schemaVersion: 1;
  exportedAt: string;
  version: string;
  manuscripts: ManuscriptManifest[];
  pages: PageRecord[];
  sessions: SessionRecord[];
  settings?: Partial<ManuscriptManifest>;
}
