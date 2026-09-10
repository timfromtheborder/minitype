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
  const store = useTypingStore();

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        if (!isPaused && !store.isLocked) {
          inputRef.current?.focus();
        }
      },
      blur: () => {
        inputRef.current?.blur();
      },
    }),
    [isPaused, store.isLocked]
  );

  // Auto-blur when typing is paused (e.g., modals open)
  useEffect(() => {
    if (isPaused) {
      inputRef.current?.blur();
    }
  }, [isPaused]);

  const handleBeforeInput = (e: React.FormEvent<HTMLInputElement>) => {
    const nativeEvent = e.nativeEvent as InputEvent;
    if (isPaused || store.isLocked) {
      e.preventDefault();
      return;
    }

    const { inputType, data } = nativeEvent;

    if (inputType === 'insertText' || inputType === 'insertCompositionText') {
      e.preventDefault();
      e.stopPropagation();
      if (data) {
        for (const char of data) {
          if (store.isHighlighting) {
            typewriterAudio.playStrike();
          } else if (char === ' ') {
            typewriterAudio.playSpace();
          } else {
            typewriterAudio.playKeyClick();
          }
          store.insertChar(char);
        }
      }
    } else if (inputType === 'deleteContentBackward') {
      e.preventDefault();
      e.stopPropagation();
      typewriterAudio.playBackspace();
      store.handleBackspace();
    } else if (inputType === 'insertParagraph' || inputType === 'insertLineBreak') {
      e.preventDefault();
      e.stopPropagation();
      if (store.isHighlighting) {
        typewriterAudio.playStrike();
      } else {
        typewriterAudio.playCarriageReturn();
      }
      store.handleEnter();
    }

    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isPaused || store.isLocked) return;

    // Direct key resolution for virtual or hardware keyboards attached to mobile or desktop
    if (e.key === 'Backspace') {
      e.preventDefault();
      e.stopPropagation();
      typewriterAudio.playBackspace();
      store.handleBackspace();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (store.isHighlighting) {
        typewriterAudio.playStrike();
      } else {
        typewriterAudio.playCarriageReturn();
      }
      store.handleEnter();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      if (store.isHighlighting) {
        typewriterAudio.playStrike();
      } else if (e.key === ' ') {
        typewriterAudio.playSpace();
      } else {
        typewriterAudio.playKeyClick();
      }
      store.insertChar(e.key);
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
