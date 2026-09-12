'use client';

import { useEffect, useCallback } from 'react';
import { useTypingStore } from '@/stores/typingStore';
import { LineRecord } from '@/types';
import { typewriterAudio } from '@/lib/sound';
import { flushPendingSave } from '@/db';

const BLOCKED_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Delete',
  'Tab',
]);

export interface UseTypingEngineOptions {
  isPaused?: boolean;
}

export function useTypingEngine(options?: UseTypingEngineOptions) {
  const rehydrate = useTypingStore((s) => s.rehydrate);
  const isPaused = options?.isPaused ?? false;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // If typing is paused (e.g. print dialog or settings modal is open), do not draft
      if (isPaused) {
        return;
      }

      // 0. Ignore events originating from interactive inputs (e.g. document title input in modals), but allow proxy bridge
      const target = e.target as HTMLElement | null;
      if (
        target &&
        target.getAttribute('data-proxy-bridge') !== 'true' &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }

      // 1. IME Guard: suppress state mutation during composition
      const isComposing = (e as any).isComposing || e.keyCode === 229;
      if (isComposing) {
        return;
      }

      // 2. Suppress blocked keys
      if (BLOCKED_KEYS.has(e.key)) {
        e.preventDefault();
        return;
      }

      // 3. Block browser shortcut actions that interfere with drafting
      // e.g. Ctrl+Z / Cmd+Z (undo), Ctrl+Y (redo), Ctrl+V / Cmd+V (paste)
      if ((e.ctrlKey || e.metaKey) && ['z', 'y', 'v', 'x', 'c'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        return;
      }

      const state = useTypingStore.getState();

      // 4. Backspace Trigger
      if (e.key === 'Backspace') {
        e.preventDefault();
        typewriterAudio.playBackspace();
        const byWord = e.ctrlKey || e.metaKey;
        state.handleBackspace({ byWord });
        return;
      }

      // 5. Enter Key Resolution
      if (e.key === 'Enter') {
        e.preventDefault();
        if ((e.ctrlKey || e.metaKey) && state.manifest.pageMode === 'notecard') {
          state.startNewNotecard();
          return;
        }

        const isNotecardEnding = state.manifest.pageMode === 'notecard' && state.activeLineIndex >= 9;
        if (state.isHighlighting) {
          typewriterAudio.playStrike();
        } else if (!isNotecardEnding) {
          typewriterAudio.playCarriageReturn();
        }
        state.handleEnter();
        return;
      }

      // 6. Printable character entry (length 1, no modifier keys)
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        if (state.isHighlighting) {
          typewriterAudio.playStrike();
        } else if (e.key === ' ') {
          typewriterAudio.playSpace();
        } else {
          typewriterAudio.playKeyClick();
        }
        state.insertChar(e.key);
      }
    },
    [isPaused]
  );

  // Global window keyboard listener
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  // Global clipboard and context menu block
  useEffect(() => {
    const blockClipboard = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        target.getAttribute('data-proxy-bridge') !== 'true' &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
    };

    window.addEventListener('paste', blockClipboard);
    window.addEventListener('cut', blockClipboard);
    window.addEventListener('copy', blockClipboard);
    window.addEventListener('contextmenu', blockClipboard);

    return () => {
      window.removeEventListener('paste', blockClipboard);
      window.removeEventListener('cut', blockClipboard);
      window.removeEventListener('copy', blockClipboard);
      window.removeEventListener('contextmenu', blockClipboard);
    };
  }, []);

  // Rehydrate persisted manuscript from IndexedDB on initial mount
  useEffect(() => {
    rehydrate();
  }, [rehydrate]);

  // Flush any pending debounced saves immediately on tab close, hide, or refresh
  useEffect(() => {
    const handleFlush = () => {
      flushPendingSave();
    };

    window.addEventListener('beforeunload', handleFlush);
    window.addEventListener('pagehide', handleFlush);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handleFlush();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleFlush);
      window.removeEventListener('pagehide', handleFlush);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return {};
}
