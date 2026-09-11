import { CharacterCell, LineRecord } from './aperture';
import { ManuscriptManifest, PageMode, TextSize } from './manuscript';
import { SessionRecord } from './session';

export interface CursorPosition {
  lineIndex: number;
  colIndex: number; // 0 to 69
}

export interface HighlightTarget {
  lineIndex: number;
  colIndex: number;
}

export type SaveState = 'saved' | 'typing' | 'saving' | 'error';

export interface TypingEngineState {
  manifest: ManuscriptManifest;
  currentPageLines: LineRecord[];
  activeLineIndex: number;
  activeColIndex: number;
  isHighlighting: boolean;
  highlightHead: HighlightTarget | null; // Tracks backward cursor during highlight mode
  isLocked: boolean;
  lockReason: 'page_exhaustion' | null;
  activeColumnLimit: number; // 70 for desktop/landscape, 35 for mobile portrait
  persistenceError: string | null;
  saveState: SaveState;
  activeSessions: SessionRecord[];
  isProjectDirty: boolean;
}

export interface TypingEngineActions {
  handleKeyDown: (e: KeyboardEvent | React.KeyboardEvent) => void;
  insertChar: (char: string) => void;
  handleBackspace: (options?: { byWord?: boolean }) => void;
  handleEnter: () => void;
  startNewNotecard: () => void;
  feedPaper: (amount?: number) => void;
  setApertureHeight: (height: ManuscriptManifest['activeApertureHeight']) => void;
  setPageSize: (size: ManuscriptManifest['pageSize']) => void;
  setPageMode: (mode: PageMode) => void;
  setTextSize: (size: TextSize) => void;
  setManifest: (manifest: Partial<ManuscriptManifest>) => void;
  setActiveColumnLimit: (limit: number) => void;
  clearText: () => Promise<void>;
  newProject: (skipSaveCurrent?: boolean) => Promise<void>;
  loadProject: (id: string, skipSaveCurrent?: boolean) => Promise<void>;
  importTextFileAsProject: (title: string, rawText: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  renameProject: (id: string, newTitle: string) => Promise<void>;
  startNewSession: () => Promise<void>;
  syncSessionStats: (fullText?: string, words?: number) => void;
  flushSave: () => Promise<void>;
  toggleStats: (show?: boolean) => void;
  toggleDoubleSpaceLinebreaks: (enabled?: boolean) => void;
  resetEngine: (newManifest?: Partial<ManuscriptManifest>) => void;
  rehydrate: () => Promise<void>;
}

