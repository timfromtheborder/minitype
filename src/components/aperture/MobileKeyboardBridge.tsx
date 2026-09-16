'use client';

import React, { useRef, useImperativeHandle, forwardRef, useEffect } from 'react';
import { useTypingStore } from '@/stores/typingStore';
import { typewriterAudio } from '@/lib/sound';

export interface MobileKeyboardBridgeHandle {
  focus: () => void;
  blur: () => void;
}

interface MobileKeyboardBridgeProps {
  isPaused?: boolean;
}

export const MobileKeyboardBridge = forwardRef<
  MobileKeyboardBridgeHandle,
  MobileKeyboardBridgeProps
>(function MobileKeyboardBridge({ isPaused = false }, ref) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isLocked = useTypingStore((state) => state.isLocked);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        if (!isPaused && !isLocked) {
          inputRef.current?.focus();
        }
      },
      blur: () => {
        inputRef.current?.blur();
      },
    }),
    [isPaused, isLocked]
  );

  // Auto-blur when typing is paused (e.g., modals open)
  useEffect(() => {
    if (isPaused) {
      inputRef.current?.blur();
    }
  }, [isPaused]);

  // Handle orientation change gracefully to prevent iOS Safari auto-scroll jitter loops
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let timeoutId: NodeJS.Timeout;
    const handleOrientationChange = () => {
      const wasFocused = document.activeElement === inputRef.current;
      if (wasFocused) {
        inputRef.current?.blur();
      }
      window.scrollTo(0, 0);
      document.body.scrollTop = 0;

      clearTimeout(timeoutId);
      if (wasFocused) {
        // Re-focus cleanly after the rotation transition finishes without triggering scroll fight
        timeoutId = setTimeout(() => {
          window.scrollTo(0, 0);
          document.body.scrollTop = 0;
          if (!isPaused && !useTypingStore.getState().isLocked) {
            inputRef.current?.focus();
          }
        }, 350);
      }
    };

    window.addEventListener('orientationchange', handleOrientationChange);
    screen.orientation?.addEventListener?.('change', handleOrientationChange);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('orientationchange', handleOrientationChange);
      screen.orientation?.removeEventListener?.('change', handleOrientationChange);
    };
  }, [isPaused]);

  // Prevent any accidental page offset drifting
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleScroll = () => {
      if (window.scrollX !== 0 || window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Input deduplication tracker to prevent double-entry on mobile browsers that fire both keydown and beforeinput
  const lastHandledInputRef = useRef<{ token: string; time: number }>({ token: '', time: 0 });

  const handleBeforeInput = (e: React.FormEvent<HTMLInputElement>) => {
    const nativeEvent = e.nativeEvent as InputEvent;
    const s = useTypingStore.getState();
    if (isPaused || s.isLocked) {
      e.preventDefault();
      return;
    }

    const { inputType, data } = nativeEvent;
    const now = Date.now();

    if (inputType === 'insertText' || inputType === 'insertCompositionText') {
      e.preventDefault();
      e.stopPropagation();
      if (data) {
        for (const char of data) {
          // Deduplicate if keydown already handled this exact character within 50ms
          if (now - lastHandledInputRef.current.time < 50 && lastHandledInputRef.current.token === char) {
            continue;
          }
          lastHandledInputRef.current = { token: char, time: now };

          if (s.isHighlighting) {
            typewriterAudio.playStrike();
          } else if (char === ' ') {
            typewriterAudio.playSpace();
          } else {
            typewriterAudio.playKeyClick();
          }
          s.insertChar(char);
        }
      }
    } else if (inputType === 'deleteContentBackward') {
      e.preventDefault();
      e.stopPropagation();
      if (now - lastHandledInputRef.current.time < 50 && lastHandledInputRef.current.token === 'Backspace') {
        return;
      }
      lastHandledInputRef.current = { token: 'Backspace', time: now };
      const allowStrikeout = s.manifest.allowStrikeout !== false;
      const curLine = s.currentPageLines[s.activeLineIndex];
      const prevLine = s.activeLineIndex > 0 ? s.currentPageLines[s.activeLineIndex - 1] : null;
      const isCarriageReturnCancel =
        s.activeLineIndex > 0 &&
        (!curLine || curLine.cells.length === 0) &&
        prevLine?.wrapType === 'hard' &&
        !prevLine?.isSessionDivider;

      if (allowStrikeout || isCarriageReturnCancel) {
        typewriterAudio.playBackspace();
        s.handleBackspace();
      }
    } else if (inputType === 'insertParagraph' || inputType === 'insertLineBreak') {
      e.preventDefault();
      e.stopPropagation();
      if (now - lastHandledInputRef.current.time < 50 && lastHandledInputRef.current.token === 'Enter') {
        return;
      }
      lastHandledInputRef.current = { token: 'Enter', time: now };
      if (s.isHighlighting) {
        typewriterAudio.playStrike();
      } else {
        const isCompletingNotecard = s.manifest.pageMode === 'notecard' && s.activeLineIndex >= 9;
        if (!isCompletingNotecard) {
          typewriterAudio.playCarriageReturn();
        }
      }
      s.handleEnter();
    }

    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const s = useTypingStore.getState();
    if (isPaused || s.isLocked) return;
    const now = Date.now();

    // Direct key resolution for virtual or hardware keyboards attached to mobile or desktop
    if (e.key === 'Backspace') {
      e.preventDefault();
      e.stopPropagation();
      if (now - lastHandledInputRef.current.time < 50 && lastHandledInputRef.current.token === 'Backspace') {
        return;
      }
      lastHandledInputRef.current = { token: 'Backspace', time: now };
      const allowStrikeout = s.manifest.allowStrikeout !== false;
      const curLine = s.currentPageLines[s.activeLineIndex];
      const prevLine = s.activeLineIndex > 0 ? s.currentPageLines[s.activeLineIndex - 1] : null;
      const isCarriageReturnCancel =
        s.activeLineIndex > 0 &&
        (!curLine || curLine.cells.length === 0) &&
        prevLine?.wrapType === 'hard' &&
        !prevLine?.isSessionDivider;

      if (allowStrikeout || isCarriageReturnCancel) {
        typewriterAudio.playBackspace();
        s.handleBackspace();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (now - lastHandledInputRef.current.time < 50 && lastHandledInputRef.current.token === 'Enter') {
        return;
      }
      lastHandledInputRef.current = { token: 'Enter', time: now };
      if (s.isHighlighting) {
        typewriterAudio.playStrike();
      } else {
        const isCompletingNotecard = s.manifest.pageMode === 'notecard' && s.activeLineIndex >= 9;
        if (!isCompletingNotecard) {
          typewriterAudio.playCarriageReturn();
        }
      }
      s.handleEnter();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      if (now - lastHandledInputRef.current.time < 50 && lastHandledInputRef.current.token === e.key) {
        return;
      }
      lastHandledInputRef.current = { token: e.key, time: now };
      if (s.isHighlighting) {
        typewriterAudio.playStrike();
      } else if (e.key === ' ') {
        typewriterAudio.playSpace();
      } else {
        typewriterAudio.playKeyClick();
      }
      s.insertChar(e.key);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Keep internal buffer empty at all times to prevent native text accumulation
    e.target.value = '';
  };

  const handleBlock = (e: React.SyntheticEvent) => {
    // Invariant #5: Strict paste/copy/cut blocking on the platen
    e.preventDefault();
  };

  return (
    <input
      ref={inputRef}
      data-proxy-bridge="true"
      type="text"
      inputMode="text"
      autoCapitalize="none"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      tabIndex={-1}
      aria-hidden="true"
      onBeforeInput={handleBeforeInput}
      onKeyDown={handleKeyDown}
      onChange={handleChange}
      onPaste={handleBlock}
      onCopy={handleBlock}
      onCut={handleBlock}
      className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-text select-none"
      style={{
        userSelect: 'none',
      }}
    />
  );
});
