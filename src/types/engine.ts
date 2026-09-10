import { CharacterCell, LineRecord } from './aperture';
import { ManuscriptManifest, PageMode } from './manuscript';

export interface CursorPosition {
  lineIndex: number;
  colIndex: number; // 0 to 69
}

export interface HighlightTarget {
  lineIndex: number;
  colIndex: number;
}

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
}

export interface TypingEngineActions {
  handleKeyDown: (e: KeyboardEvent | React.KeyboardEvent) => void;
  insertChar: (char: string) => void;
  handleBackspace: () => void;
  handleEnter: () => void;
  feedPaper: (amount?: number) => void;
  setApertureHeight: (height: ManuscriptManifest['activeApertureHeight']) => void;
  setPageSize: (size: ManuscriptManifest['pageSize']) => void;
  setPageMode: (mode: PageMode) => void;
  setManifest: (manifest: Partial<ManuscriptManifest>) => void;
  setActiveColumnLimit: (limit: number) => void;
  clearText: () => void;
  newProject: () => Promise<void>;
  toggleStats: (show?: boolean) => void;
  toggleDoubleSpaceLinebreaks: (enabled?: boolean) => void;
  resetEngine: (newManifest?: Partial<ManuscriptManifest>) => void;
  rehydrate: () => Promise<void>;
}

