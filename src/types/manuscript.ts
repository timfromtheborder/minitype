import { LineRecord } from './aperture';

export interface PageRecord {
  id?: string;
  manuscriptId?: string;
  pageNumber: number;
  lines: LineRecord[];
  completedAt: string | null;
}

export type ApertureHeight = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type WrapMode = 'soft';
export type PageSize = 30 | 40 | 54 | 60 | number;
export type PageMode = 'scroll' | 'page' | 'notecard' | 'paragraph';
export type ColorScheme = 'typewriter' | 'dark-amber' | 'spotlight' | 'high-contrast' | 'dark-mode' | 'low-contrast' | 'phosphor';
export type Typeface = 'courier-prime' | 'jetbrains-mono' | 'ibm-plex-mono';
export type TextSize = 's' | 'm' | 'l' | 'xl';
export type ManuscriptMode = 'local';

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
  pageMode: PageMode;
  colorScheme: ColorScheme;
  typeface: Typeface;
  textSize?: TextSize;
  showStats?: boolean;
  doubleSpaceLinebreaks?: boolean;
  activeSessionId?: string;
  sessionCount?: number;
  totalWordCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

