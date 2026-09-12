import {
  CharacterCell,
  LineRecord,
  PageRecord,
  ManuscriptManifest,
  TypingEngineState,
  TypingEngineActions,
  SessionRecord,
} from '@/types';

export interface TypingStore extends TypingEngineState, TypingEngineActions {
  currentPageNumber: number;
  historicalPages: PageRecord[];
  pendingWrappedCells: CharacterCell[] | null;
  sessionCommittedLines: number;
}
