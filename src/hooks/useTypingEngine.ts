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

export function useTypingEngine() {
  const store = useTypingStore();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // 0. Ignore events originating from interactive inputs (e.g. document title input in modals)
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
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

      // 4. Backspace Trigger
      if (e.key === 'Backspace') {
        e.preventDefault();
        typewriterAudio.playBackspace();
        store.handleBackspace();
        return;
      }

      // 5. Enter Key Resolution
      if (e.key === 'Enter') {
        e.preventDefault();
        if (store.isHighlighting) {
          typewriterAudio.playStrike();
        } else {
          typewriterAudio.playCarriageReturn();
        }
        store.handleEnter();
        return;
      }

      // 6. Printable character entry (length 1, no modifier keys)
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        if (store.isHighlighting) {
          typewriterAudio.playStrike();
        } else if (e.key === ' ') {
          typewriterAudio.playSpace();
        } else {
          typewriterAudio.playKeyClick();
        }
        store.insertChar(e.key);
      }
    },
    [store]
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
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
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
    store.rehydrate();
  }, []);

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

  // BeforeUnload hook for temp mode with unprinted content
  useEffect(() => {
    if (store.manifest.mode !== 'temp') return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Check if there is any unprinted text in current page or historical pages
      const hasContent =
        store.currentPageLines.some((l) => l.cells.length > 0) ||
        store.historicalPages.length > 0;

      if (hasContent) {
        e.preventDefault();
        e.returnValue = 'Draft is running in Temp Mode. Exiting will permanently erase all unprinted text.';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [store.manifest.mode, store.currentPageLines, store.historicalPages]);

  // Compute visible lines for the typing aperture based on activeApertureHeight
  const height = store.manifest.activeApertureHeight;
  const totalLines = store.currentPageLines.length;
  const startIdx = Math.max(0, totalLines - height);
  const visibleLines: LineRecord[] = store.currentPageLines.slice(startIdx);

  return {
    ...store,
    visibleLines,
    visibleStartIndex: startIdx,
  };
}
