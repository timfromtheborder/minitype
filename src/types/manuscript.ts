import { LineRecord } from './aperture';

export interface PageRecord {
  id?: string;
  manuscriptId?: string;
  pageNumber: number;
  lines: LineRecord[];
  completedAt: string | null;
}

export type ApertureHeight = 1 | 2 | 3 | 4 | 5;
export type WrapMode = 'soft';
export type PageSize = 30 | 40 | 54 | 60;
export type ColorScheme = 'typewriter' | 'dark-amber' | 'phosphor' | 'high-contrast' | 'dark-mode' | 'low-contrast';
export type Typeface = 'courier-prime' | 'jetbrains-mono' | 'ibm-plex-mono';
export type ManuscriptMode = 'local' | 'temp';

export interface ManuscriptManifest {
  id: string;
  title: string;
  mode: ManuscriptMode;
  inboxCount: number;
  outboxCount: number;
  lastPrintedCharIndex: number;
  printedPagesCount: number;
  activeApertureHeight: ApertureHeight;
  wrapMode: WrapMode;
  pageSize: PageSize;
  colorScheme: ColorScheme;
  typeface: Typeface;
  createdAt?: string;
  updatedAt?: string;
}
