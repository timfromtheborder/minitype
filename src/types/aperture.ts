export type CharacterState = 'standard' | 'highlighted' | 'struck';

export interface CharacterCell {
  id: string;
  char: string;
  state: CharacterState;
  colIndex: number;        // 0 to 69
  lineIndex: number;
  isSoftPadding?: boolean; // True if created by soft word-wrap
}

export interface LineRecord {
  id: string;
  lineIndex: number;
  cells: CharacterCell[];
  isCommitted: boolean;
  explicitTrailingWhitespace?: boolean;
}
