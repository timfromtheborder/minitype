import { describe, it, expect, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { PrintModal } from '@/components/modals/PrintModal';
import { useTypingStore } from '@/stores/typingStore';

describe('PrintModal Title Deletion and Restoration Invariants', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    useTypingStore.setState({
      manifest: {
        id: 'doc-1',
        title: 'My Great Novel',
        mode: 'local',
        inboxCount: 0,
        outboxCount: 0,
        lastPrintedCharIndex: 0,
        printedPagesCount: 0,
        activeApertureHeight: 1,
        preferredApertureHeight: 1,
        wrapMode: 'soft',
        pageSize: 54,
        pageMode: 'scroll',
        colorScheme: 'typewriter',
        typeface: 'courier-prime',
      },
      historicalPages: [],
      currentPageNumber: 1,
      currentPageLines: [],
    });
  });

  it('allows deleting title completely down to empty string without snapping back while editing', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const root = createRoot(container);

    await act(async () => {
      root.render(<PrintModal isOpen={true} onClose={() => {}} />);
    });

    const input = container.querySelector('input[data-modal-input="true"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe('My Great Novel');

    // Simulate user editing title to empty string
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      nativeSetter?.call(input, '');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // The input value must remain empty and NOT snap back to "Untitled Manuscript" or previous title
    expect(input.value).toBe('');
    expect(useTypingStore.getState().manifest.title).toBe('');

    // When the user leaves/blurs the field with an empty string, fallback is restored
    await act(async () => {
      input.focus();
      input.blur();
    });

    expect(input.value).toBe('Untitled Project');
    expect(useTypingStore.getState().manifest.title).toBe('Untitled Project');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('renaming title in the top box immediately updates the filesystem view in Projects tab', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const root = createRoot(container);

    await act(async () => {
      root.render(<PrintModal isOpen={true} onClose={() => {}} />);
    });

    // Switch to Projects tab
    const projectsTabButton = Array.from(container.querySelectorAll('button')).find(
      (b) => b.title && b.title.includes('Projects')
    );
    expect(projectsTabButton).toBeDefined();

    await act(async () => {
      projectsTabButton?.click();
    });

    // Top box input on Projects tab
    const inputs = container.querySelectorAll('input[data-modal-input="true"]');
    expect(inputs.length).toBeGreaterThan(0);
    const topInput = inputs[0] as HTMLInputElement;

    // Simulate user renaming project in the top box
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      nativeSetter?.call(topInput, 'Brand New Masterpiece');
      topInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(useTypingStore.getState().manifest.title).toBe('Brand New Masterpiece');

    // Verify active project in the filesystem list view immediately shows the new title
    const activeProjectSpan = container.querySelector('.group\\/title span');
    expect(activeProjectSpan).not.toBeNull();
    expect(activeProjectSpan?.textContent).toBe('Brand New Masterpiece');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('renaming title on Document tab immediately updates the filesystem view when navigating to Projects tab', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const root = createRoot(container);

    await act(async () => {
      root.render(<PrintModal isOpen={true} onClose={() => {}} />);
    });

    // We start on Document tab by default. Edit title input.
    const docInput = container.querySelector('input[data-modal-input="true"]') as HTMLInputElement;
    expect(docInput).not.toBeNull();

    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      nativeSetter?.call(docInput, 'Document Tab Title Update');
      docInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(useTypingStore.getState().manifest.title).toBe('Document Tab Title Update');

    // Switch to Projects tab
    const projectsTabButton = Array.from(container.querySelectorAll('button')).find(
      (b) => b.title && b.title.includes('Projects')
    );
    expect(projectsTabButton).toBeDefined();

    await act(async () => {
      projectsTabButton?.click();
    });

    // The active project in the filesystem list view must show the updated title
    const activeProjectSpan = container.querySelector('.group\\/title span');
    expect(activeProjectSpan).not.toBeNull();
    expect(activeProjectSpan?.textContent).toBe('Document Tab Title Update');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('v0.9.7.4.5: toggling double-space on and off retains identical clean text without line duplication', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const root = createRoot(container);

    const testLines = [
      {
        id: 'p1-line-0',
        lineIndex: 0,
        cells: 'First paragraph sentence.'.split('').map((char, colIndex) => ({
          id: `p1-l0-c${colIndex}`,
          char,
          state: 'standard' as const,
          colIndex,
          lineIndex: 0,
        })),
        isCommitted: true,
        wrapType: 'hard' as const,
      },
      {
        id: 'p1-line-1',
        lineIndex: 1,
        cells: 'Second paragraph sentence.'.split('').map((char, colIndex) => ({
          id: `p1-l1-c${colIndex}`,
          char,
          state: 'standard' as const,
          colIndex,
          lineIndex: 1,
        })),
        isCommitted: true,
        wrapType: 'hard' as const,
      },
      {
        id: 'p1-line-2',
        lineIndex: 2,
        cells: 'Final paragraph sentence.'.split('').map((char, colIndex) => ({
          id: `p1-l2-c${colIndex}`,
          char,
          state: 'standard' as const,
          colIndex,
          lineIndex: 2,
        })),
        isCommitted: true,
        wrapType: 'hard' as const,
      },
    ];

    useTypingStore.setState({
      currentPageLines: testLines,
      manifest: {
        ...useTypingStore.getState().manifest,
        textSize: 'xl',
        doubleSpaceLinebreaks: false,
      },
    });

    await act(async () => {
      root.render(<PrintModal isOpen={true} onClose={() => {}} />);
    });

    const previewContainer = container.querySelector('.square-scrollbar') as HTMLDivElement;
    expect(previewContainer).not.toBeNull();
    expect(previewContainer.style.overflowAnchor).toBe('none');

    const innerPreview = previewContainer.querySelector('.whitespace-pre-wrap') as HTMLDivElement;
    expect(innerPreview).not.toBeNull();
    const initialText = innerPreview.textContent;
    expect(initialText).toBe('First paragraph sentence.\nSecond paragraph sentence.\nFinal paragraph sentence.');

    // Find double-space button
    const buttons = Array.from(container.querySelectorAll('button'));
    const doubleSpaceBtn = buttons.find((b) => b.textContent?.includes('Double-space'));
    expect(doubleSpaceBtn).toBeDefined();

    // Toggle double space ON
    await act(async () => {
      doubleSpaceBtn?.click();
    });

    expect(useTypingStore.getState().manifest.doubleSpaceLinebreaks).toBe(true);
    const doubleSpacedPreview = container.querySelector('.whitespace-pre-wrap') as HTMLDivElement;
    expect(doubleSpacedPreview.textContent).toBe(
      'First paragraph sentence.\n\nSecond paragraph sentence.\n\nFinal paragraph sentence.'
    );

    // Toggle double space OFF
    await act(async () => {
      doubleSpaceBtn?.click();
    });

    expect(useTypingStore.getState().manifest.doubleSpaceLinebreaks).toBe(false);
    const restoredPreview = container.querySelector('.whitespace-pre-wrap') as HTMLDivElement;
    // Must be strictly identical to initial text, with no duplicated final paragraph
    expect(restoredPreview.textContent).toBe(initialText);

    // Count occurrences of the final sentence
    const occurrences = (restoredPreview.textContent?.match(/Final paragraph sentence\./g) || []).length;
    expect(occurrences).toBe(1);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('historical session wordcount bolding is not affected by changing current sessionWordTarget', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const root = createRoot(container);

    const now = new Date().toISOString();
    const testSessions = [
      {
        id: 'doc-1-session-1',
        projectId: 'doc-1',
        sessionNumber: 1,
        startedAt: now,
        completedAt: now,
        text: 'Session one reached target previously with five words.',
        wordCount: 8,
        targetReached: true, // Met target when completed
      },
      {
        id: 'doc-1-session-2',
        projectId: 'doc-1',
        sessionNumber: 2,
        startedAt: now,
        completedAt: now,
        text: 'Session two was short.',
        wordCount: 4,
        targetReached: false, // Did NOT meet target when completed
      },
      {
        id: 'doc-1-session-3',
        projectId: 'doc-1',
        sessionNumber: 3,
        startedAt: now,
        completedAt: null, // Active drafting session
        text: 'Active session drafting text.',
        wordCount: 4,
        targetReached: false,
      },
    ];

    const fullDocText =
      'Session one reached target previously with five words. Session two was short. Active session drafting text.';

    useTypingStore.setState({
      activeSessions: testSessions,
      currentPageLines: [
        {
          id: 'p1-line-0',
          lineIndex: 0,
          cells: fullDocText.split('').map((char, colIndex) => ({
            id: `p1-l0-c${colIndex}`,
            char,
            state: 'standard' as const,
            colIndex,
            lineIndex: 0,
          })),
          isCommitted: true,
          wrapType: 'hard' as const,
        },
      ],
      manifest: {
        ...useTypingStore.getState().manifest,
        sessionWordTarget: 5,
      },
    });

    await act(async () => {
      root.render(<PrintModal isOpen={true} onClose={() => {}} />);
    });

    // Switch to Sessions tab
    const sessionsTabBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.title?.includes('Sessions')
    );
    expect(sessionsTabBtn).toBeDefined();

    await act(async () => {
      sessionsTabBtn?.click();
    });

    // Helper to query session word count spans
    const getSessionWordSpans = () => {
      const cards = container.querySelectorAll('[data-session-card="true"]');
      return Array.from(cards).map((card) => {
        const span = card.querySelector('.text-right');
        return {
          text: span?.textContent?.trim() || '',
          isBold: span?.classList.contains('font-bold') || false,
        };
      });
    };

    let sessionSpans = getSessionWordSpans();
    // Session 1 (targetReached: true): bold
    expect(sessionSpans[0].isBold).toBe(true);
    // Session 2 (targetReached: false, 4 words): not bold (even though 4 is close to 5)
    expect(sessionSpans[1].isBold).toBe(false);
    // Session 3 (active, 4 words, target 5): not bold
    expect(sessionSpans[2].isBold).toBe(false);

    // Now CHANGE sessionWordTarget to 2 (drastically lower target)
    // In buggy code: Session 2 (4 words) would turn bold because 4 >= 2!
    // In fixed code: Session 2 MUST REMAIN NOT BOLD because historical targetReached is false!
    const targetInput = container.querySelector('input[type="number"]') as HTMLInputElement;
    expect(targetInput).not.toBeNull();

    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      nativeSetter?.call(targetInput, '2');
      targetInput.dispatchEvent(new Event('input', { bubbles: true }));
      targetInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    sessionSpans = getSessionWordSpans();
    // Session 1: stays bold
    expect(sessionSpans[0].isBold).toBe(true);
    // Session 2: MUST STILL BE NOT BOLD!
    expect(sessionSpans[1].isBold).toBe(false);
    // Session 3 (active, 4 words >= 2 target): dynamically turns bold
    expect(sessionSpans[2].isBold).toBe(true);

    // Now CHANGE sessionWordTarget to 100 (drastically higher target)
    // Session 1 (targetReached: true, 8 words): MUST REMAIN BOLD!
    // Session 3 (active, 4 words < 100): dynamically unbolds!
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      nativeSetter?.call(targetInput, '100');
      targetInput.dispatchEvent(new Event('input', { bubbles: true }));
      targetInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    sessionSpans = getSessionWordSpans();
    // Session 1: MUST REMAIN BOLD!
    expect(sessionSpans[0].isBold).toBe(true);
    // Session 2: stays not bold
    expect(sessionSpans[1].isBold).toBe(false);
    // Session 3 (active, 4 words < 100 target): unbolds
    expect(sessionSpans[2].isBold).toBe(false);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});


