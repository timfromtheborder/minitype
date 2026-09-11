export interface SessionRecord {
  id: string; // e.g. `${projectId}-session-${sessionNumber}`
  projectId: string;
  sessionNumber: number; // 1, 2, 3...
  startedAt: string; // ISO string
  completedAt: string | null;
  text: string; // Plain text content of this session
  wordCount: number;
  isImported?: boolean;
  importedAt?: string | null;
}
