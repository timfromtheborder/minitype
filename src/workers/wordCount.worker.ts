import { sanitizeManuscript } from '@/lib/sanitize';
import { countWords, getActiveSessionText, resolveActiveSessionStats } from '@/lib/projectSerializer';
import { PageRecord, PageMode, SessionRecord } from '@/types';

export interface WordCountWorkerRequest {
  type: 'CALCULATE_STATS';
  requestId: number;
  pages: PageRecord[];
  pageMode?: PageMode;
  sessions: SessionRecord[];
  sessionWordTarget?: number;
}

export interface WordCountWorkerResponse {
  type: 'STATS_RESULT';
  requestId: number;
  fullText: string;
  docTotalWords: number;
  currentSessionWords: number;
  activeSessionText: string;
  targetReached: boolean;
}

export function executeWordCountCalculation(req: WordCountWorkerRequest): WordCountWorkerResponse {
  const { requestId, pages, pageMode, sessions, sessionWordTarget } = req;
  const fullText = sanitizeManuscript(pages, {
    doubleSpaceLinebreaks: false,
    pageMode,
  });
  const docTotalWords = countWords(fullText);
  const { currentSessionWords } = resolveActiveSessionStats(sessions, docTotalWords);
  const lastIdx = sessions.length > 0 ? sessions.length - 1 : -1;
  const priorSessions = lastIdx > 0 ? sessions.slice(0, lastIdx) : [];
  const activeSessionText = getActiveSessionText(fullText, priorSessions);
  const targetReached = Boolean(
    sessionWordTarget && sessionWordTarget > 0 && currentSessionWords >= sessionWordTarget
  );

  return {
    type: 'STATS_RESULT',
    requestId,
    fullText,
    docTotalWords,
    currentSessionWords,
    activeSessionText,
    targetReached,
  };
}

// Attach listener in Web Worker context
if (typeof self !== 'undefined' && typeof (self as any).addEventListener === 'function') {
  self.addEventListener('message', (event: MessageEvent<WordCountWorkerRequest>) => {
    if (event.data && event.data.type === 'CALCULATE_STATS') {
      const response = executeWordCountCalculation(event.data);
      self.postMessage(response);
    }
  });
}
