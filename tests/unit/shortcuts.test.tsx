import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { useTypingStore } from '@/stores/typingStore';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function ShortcutHost({
  isPaused = false,
  onToggleSettings,
  onToggleProject,
  onToggleSession,
}: {
  isPaused?: boolean;
  onToggleSettings?: () => void;
  onToggleProject?: () => void;
  onToggleSession?: () => void;
}) {
  useKeyboardShortcuts({
    isPaused,
    onToggleSettings: onToggleSettings || (() => {}),
    onToggleProject: onToggleProject || (() => {}),
    onToggleSession: onToggleSession || (() => {}),
  });
  return null;
}

describe('Keyboard Shortcuts Hook (useKeyboardShortcuts)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    useTypingStore.setState({
      manifest: {
        ...useTypingStore.getState().manifest,
        activeApertureHeight: 3,
        pageMode: 'scroll',
      },
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('Ctrl/Cmd + 1..9 sets aperture height directly to 1..9', async () => {
    await act(async () => {
      root.render(<ShortcutHost />);
    });

    // Press Ctrl + 5
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: '5',
        ctrlKey: true,
        bubbles: true,
      })
    );

    expect(useTypingStore.getState().manifest.activeApertureHeight).toBe(5);

    // Press Cmd + 1
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: '1',
        metaKey: true,
        bubbles: true,
      })
    );

    expect(useTypingStore.getState().manifest.activeApertureHeight).toBe(1);
  });

  it('Ctrl/Cmd + 0 sets aperture height directly to 10', async () => {
    await act(async () => {
      root.render(<ShortcutHost />);
    });

    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: '0',
        ctrlKey: true,
        bubbles: true,
      })
    );

    expect(useTypingStore.getState().manifest.activeApertureHeight).toBe(10);
  });

  it('Ctrl/Cmd + [ and ] steps aperture height between 1 and 10', async () => {
    useTypingStore.getState().setApertureHeight(5);

    await act(async () => {
      root.render(<ShortcutHost />);
    });

    // Shrink with Ctrl + [
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: '[',
        ctrlKey: true,
        bubbles: true,
      })
    );
    expect(useTypingStore.getState().manifest.activeApertureHeight).toBe(4);

    // Expand with Ctrl + ]
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: ']',
        ctrlKey: true,
        bubbles: true,
      })
    );
    expect(useTypingStore.getState().manifest.activeApertureHeight).toBe(5);

    // Clamping to 1
    useTypingStore.getState().setApertureHeight(1);
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: '[',
        ctrlKey: true,
        bubbles: true,
      })
    );
    expect(useTypingStore.getState().manifest.activeApertureHeight).toBe(1);

    // Clamping to 10
    useTypingStore.getState().setApertureHeight(10);
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: ']',
        ctrlKey: true,
        bubbles: true,
      })
    );
    expect(useTypingStore.getState().manifest.activeApertureHeight).toBe(10);
  });

  it('Ctrl/Cmd + P toggles project modal', async () => {
    const onToggleProject = vi.fn();

    await act(async () => {
      root.render(<ShortcutHost onToggleProject={onToggleProject} />);
    });

    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'p',
        ctrlKey: true,
        bubbles: true,
      })
    );

    expect(onToggleProject).toHaveBeenCalledTimes(1);
  });

  it('Ctrl/Cmd + O toggles project modal', async () => {
    const onToggleProject = vi.fn();

    await act(async () => {
      root.render(<ShortcutHost onToggleProject={onToggleProject} />);
    });

    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'o',
        ctrlKey: true,
        bubbles: true,
      })
    );

    expect(onToggleProject).toHaveBeenCalledTimes(1);
  });

  it('Ctrl/Cmd + D toggles document/session drawer', async () => {
    const onToggleSession = vi.fn();

    await act(async () => {
      root.render(<ShortcutHost onToggleSession={onToggleSession} />);
    });

    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'd',
        ctrlKey: true,
        bubbles: true,
      })
    );

    expect(onToggleSession).toHaveBeenCalledTimes(1);
  });

  it('Ctrl/Cmd + , toggles settings drawer', async () => {
    const onToggleSettings = vi.fn();

    await act(async () => {
      root.render(<ShortcutHost onToggleSettings={onToggleSettings} />);
    });

    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: ',',
        metaKey: true,
        bubbles: true,
      })
    );

    expect(onToggleSettings).toHaveBeenCalledTimes(1);
  });

  it('Ctrl/Cmd + Shift + N creates a new session', async () => {
    const startNewSessionSpy = vi.spyOn(useTypingStore.getState(), 'startNewSession');

    await act(async () => {
      root.render(<ShortcutHost />);
    });

    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'N',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
      })
    );

    expect(startNewSessionSpy).toHaveBeenCalledTimes(1);
  });

  it('ignores shortcuts when focus is in an input element', async () => {
    const onToggleSettings = vi.fn();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    await act(async () => {
      root.render(<ShortcutHost onToggleSettings={onToggleSettings} />);
    });

    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: ',',
        ctrlKey: true,
        bubbles: true,
      })
    );

    expect(onToggleSettings).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });
});
