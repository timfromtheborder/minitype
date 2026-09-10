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
  clearText: () => void;
  resetEngine: (newManifest?: Partial<ManuscriptManifest>) => void;
}
