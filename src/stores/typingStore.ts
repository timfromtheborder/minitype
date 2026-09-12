import { create } from 'zustand';
import { TypingStore } from './types';
import { createApertureSlice } from './slices/apertureSlice';
import { createPaginationSlice } from './slices/paginationSlice';
import { createProjectSlice } from './slices/projectSlice';
import { createPersistenceSlice, cancelVisualSaveTimers } from './slices/persistenceSlice';
import { setPersistenceErrorHandler } from '@/db';

export const useTypingStore = create<TypingStore>()((...a) => {
  if (typeof window !== 'undefined') {
    const [set] = a;
    setPersistenceErrorHandler((err) => {
      if (err) {
        cancelVisualSaveTimers();
        set({ persistenceError: err.message, saveState: 'error' });
      } else {
        set({ persistenceError: null });
      }
    });
  }

  return {
    ...createApertureSlice(...a),
    ...createPaginationSlice(...a),
    ...createProjectSlice(...a),
    ...createPersistenceSlice(...a),
  };
});

// Re-exports for backward compatibility
export type { TypingStore } from './types';
export {
  getPageLineLimit,
  createEmptyLine,
  applyPageModeTransition,
} from '@/lib/paginationTransition';
export {
  DEFAULT_MANIFEST,
  SETTING_KEYS,
  SETTINGS_KEY,
  ACTIVE_PROJECT_KEY,
  extractSettings,
  readSynchronousSettings,
  getInitialManifest,
  persistSettings,
} from './settingsPersistence';
export {
  cancelVisualSaveTimers,
  triggerVisualSaveOnTyping,
  markProjectDirty,
  finalizeAndSaveCurrentProject,
} from './slices/persistenceSlice';
export {
  pruneZeroContentSessions,
  ensureActiveSessionOnTyping,
} from './slices/projectSlice';
