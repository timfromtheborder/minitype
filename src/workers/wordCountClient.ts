import { PageRecord, PageMode, SessionRecord } from '@/types';
import {
  WordCountWorkerRequest,
  WordCountWorkerResponse,
  executeWordCountCalculation,
} from './wordCount.worker';

class WordCountClient {
  private worker: Worker | null = null;
  private currentRequestId = 0;
  private pendingResolvers = new Map<number, (res: WordCountWorkerResponse) => void>();
  private isWorkerSupported = false;

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(new URL('./wordCount.worker.ts', import.meta.url), {
          type: 'module',
        });
        this.worker.onmessage = (e: MessageEvent<WordCountWorkerResponse>) => {
          const { requestId } = e.data;
          const resolver = this.pendingResolvers.get(requestId);
          if (resolver) {
            this.pendingResolvers.delete(requestId);
            resolver(e.data);
          }
        };
        this.worker.onerror = (err) => {
          console.warn('WordCount Worker error, falling back to local thread:', err);
          this.isWorkerSupported = false;
        };
        this.isWorkerSupported = true;
      } catch (err) {
        // In environments that do not support module workers or CSP restrictions
        this.isWorkerSupported = false;
      }
    }
  }

  public async calculateStats(
    pages: PageRecord[],
    pageMode: PageMode | undefined,
    sessions: SessionRecord[],
    sessionWordTarget?: number
  ): Promise<WordCountWorkerResponse> {
    const requestId = ++this.currentRequestId;
    const req: WordCountWorkerRequest = {
      type: 'CALCULATE_STATS',
      requestId,
      pages,
      pageMode,
      sessions,
      sessionWordTarget,
    };

    if (this.isWorkerSupported && this.worker) {
      return new Promise((resolve) => {
        this.pendingResolvers.set(requestId, resolve);
        this.worker!.postMessage(req);
      });
    }

    // Isomorphic fallback for Node/Vitest, SSR, or environments without Web Worker
    return new Promise((resolve) => {
      queueMicrotask(() => {
        const result = executeWordCountCalculation(req);
        resolve(result);
      });
    });
  }

  public terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingResolvers.clear();
  }
}

export const wordCountClient = new WordCountClient();
