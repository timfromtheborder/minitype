'use client';

import { useEffect, useCallback } from 'react';
import { useTypingStore } from '@/stores/typingStore';
import { ApertureHeight } from '@/types';

export interface UseKeyboardShortcutsOptions {
  isPaused?: boolean;
  onToggleSettings?: () => void;
  onToggleProject?: () => void;
  onToggleSession?: () => void;
}

export function useKeyboardShortcuts(options?: UseKeyboardShortcutsOptions) {
  const isPaused = options?.isPaused ?? false;
  const onToggleSettings = options?.onToggleSettings;
  const onToggleProject = options?.onToggleProject;
  const onToggleSession = options?.onToggleSession;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // 0. Ignore events originating from interactive inputs (e.g. text inputs inside modals)
      const target = e.target as HTMLElement | null;
      if (
        target &&
        typeof target.getAttribute === 'function' &&
        target.getAttribute('data-proxy-bridge') !== 'true' &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }

      // Check modifier keys (Cmd on macOS, Ctrl on Windows/Linux)
      const hasModifier = e.ctrlKey || e.metaKey;
      if (!hasModifier) {
        return;
      }

      // 1. Modal / Drawer Toggles
      // Cmd/Ctrl + , (Settings Drawer)
      if (e.key === ',' && !e.shiftKey) {
        e.preventDefault();
        onToggleSettings?.();
        return;
      }

      // Cmd/Ctrl + P or Cmd/Ctrl + O (Project Files Modal)
      if ((e.key.toLowerCase() === 'p' || e.key.toLowerCase() === 'o') && !e.shiftKey) {
        e.preventDefault();
        onToggleProject?.();
        return;
      }

      // Cmd/Ctrl + D, Cmd/Ctrl + S, or Cmd/Ctrl + E (Document / Session Drawer)
      if (
        (e.key.toLowerCase() === 'd' || e.key.toLowerCase() === 's' || e.key.toLowerCase() === 'e') &&
        !e.shiftKey
      ) {
        e.preventDefault();
        onToggleSession?.();
        return;
      }

      // If typing/platen is paused (a modal is open), do not trigger platen shortcuts
      if (isPaused) {
        return;
      }

      const state = useTypingStore.getState();

      // 2. Start New Session: Cmd/Ctrl + Shift + N
      if (e.key.toLowerCase() === 'n' && e.shiftKey) {
        e.preventDefault();
        state.startNewSession();
        return;
      }

      // 3. Direct Platen Height Shortcuts: Cmd/Ctrl + [1, 2, 3... 9, 0]
      // Note: '0' maps to 10 lines
      if (!e.shiftKey && e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        const targetHeight = (e.key === '0' ? 10 : Number(e.key)) as ApertureHeight;
        state.setApertureHeight(targetHeight);
        return;
      }

      // 4. Stepped Platen Height: Cmd/Ctrl + [ (shrink) and Cmd/Ctrl + ] (expand)
      if (e.key === '[') {
        e.preventDefault();
        const currentHeight = state.manifest.activeApertureHeight || 1;
        const newHeight = Math.max(1, currentHeight - 1) as ApertureHeight;
        state.setApertureHeight(newHeight);
        return;
      }

      if (e.key === ']') {
        e.preventDefault();
        const currentHeight = state.manifest.activeApertureHeight || 1;
        const newHeight = Math.min(10, currentHeight + 1) as ApertureHeight;
        state.setApertureHeight(newHeight);
        return;
      }
    },
    [isPaused, onToggleSettings, onToggleProject, onToggleSession]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}
