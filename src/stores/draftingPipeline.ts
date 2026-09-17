import { TypingStore } from './types';
import { ensureActiveSessionOnTyping } from './slices/projectSlice';
import { markProjectDirty, triggerVisualSaveOnTyping, cancelVisualSaveTimers } from './slices/persistenceSlice';

export { markProjectDirty, triggerVisualSaveOnTyping, cancelVisualSaveTimers };

/**
 * Unified drafting event pipeline.
 * Coordinates session tracking, dirty state, and visual save debouncing on keystroke events.
 */
export function notifyDraftingActivity(
  set: (partial: Partial<TypingStore> | ((state: TypingStore) => Partial<TypingStore>)) => void,
  get: () => TypingStore
): void {
  ensureActiveSessionOnTyping(set, get);
  markProjectDirty(set, get);
  triggerVisualSaveOnTyping(set, get);
}
