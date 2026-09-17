import { describe, it, expect, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { SessionDrawer } from '@/components/modals/SessionDrawer';
import { ProjectFilesModal } from '@/components/modals/ProjectFilesModal';
import { useTypingStore } from '@/stores/typingStore';

describe('SessionDrawer and ProjectFilesModal Invariants', () => {
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
      activeSessions: [],
    });
  });

  it('allows deleting title completely down to empty string without snapping back while editing in SessionDrawer', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const root = createRoot(container);

    await act(async () => {
      root.render(<SessionDrawer isOpen={true} onClose={() => {}} />);
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

    // The input value must remain empty and NOT snap back to "Untitled Project" or previous title
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

  it('allows deleting title completely down to empty string without snapping back while editing in ProjectFilesModal', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const root = createRoot(container);

    await act(async () => {
      root.render(<ProjectFilesModal isOpen={true} onClose={() => {}} />);
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

    expect(input.value).toBe('');
    expect(useTypingStore.getState().manifest.title).toBe('');

    // On blur, fallback restored
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

  it('toggling double-space on and off retains identical clean text without line duplication', async () => {
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

    const fullDocText = 'First paragraph sentence.\nSecond paragraph sentence.\nFinal paragraph sentence.';
    const now = new Date().toISOString();
    useTypingStore.setState({
      currentPageLines: testLines,
      manifest: {
        ...useTypingStore.getState().manifest,
        textSize: 'xl',
        doubleSpaceLinebreaks: false,
      },
      activeSessions: [
        {
          id: 'test-doc-session-1',
          projectId: useTypingStore.getState().manifest.id,
          sessionNumber: 1,
          startedAt: now,
          completedAt: now, // Completed session to test unmasked text formatting
          text: fullDocText,
          wordCount: 9,
        },
      ],
    });

    await act(async () => {
      root.render(<SessionDrawer isOpen={true} onClose={() => {}} />);
    });

    const innerPreview = container.querySelector('.whitespace-pre-wrap') as HTMLDivElement;
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
      root.render(<SessionDrawer isOpen={true} onClose={() => {}} />);
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
    // Historical targetReached must stay invariant
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

  it('supports toggling between Typewriter and Manuscript views', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const root = createRoot(container);

    const now = new Date().toISOString();
    useTypingStore.setState({
      activeSessions: [
        {
          id: 'doc-1-session-1',
          projectId: 'doc-1',
          sessionNumber: 1,
          startedAt: now,
          completedAt: null,
          text: 'Drafting text here.',
          wordCount: 3,
        },
      ],
      manifest: {
        ...useTypingStore.getState().manifest,
        title: 'View Mode Test',
      },
    });

    await act(async () => {
      root.render(<SessionDrawer isOpen={true} onClose={() => {}} />);
    });

    // Initially typewriter mode
    let textPreview = container.querySelector('.whitespace-pre-wrap');
    expect(textPreview?.className).toContain('font-mono');

    // Click Manuscript button
    const buttons = Array.from(container.querySelectorAll('button'));
    const manuscriptBtn = buttons.find((b) => b.textContent?.includes('Manuscript'));
    expect(manuscriptBtn).toBeDefined();

    await act(async () => {
      manuscriptBtn?.click();
    });

    textPreview = container.querySelector('.whitespace-pre-wrap');
    expect(textPreview?.className).toContain('font-manuscript-serif');

    // Click Typewriter button
    const typewriterBtn = buttons.find((b) => b.textContent?.includes('Typewriter'));
    expect(typewriterBtn).toBeDefined();

    await act(async () => {
      typewriterBtn?.click();
    });

    textPreview = container.querySelector('.whitespace-pre-wrap');
    expect(textPreview?.className).toContain('font-mono');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('renders sessions permanently expanded with inline faded dashed divider and without copy/delete buttons', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const root = createRoot(container);

    const now = new Date().toISOString();
    useTypingStore.setState({
      activeSessions: [
        {
          id: 'doc-1-session-1',
          projectId: 'doc-1',
          sessionNumber: 1,
          startedAt: now,
          completedAt: now,
          text: 'First session text content.',
          wordCount: 4,
        },
      ],
      manifest: {
        ...useTypingStore.getState().manifest,
      },
    });

    await act(async () => {
      root.render(<SessionDrawer isOpen={true} onClose={() => {}} />);
    });

    // Verify modal breadcrumb reads "Document"
    expect(container.textContent).toContain('Document');

    // Card body is permanently expanded
    const textEl = container.querySelector('.whitespace-pre-wrap');
    expect(textEl).not.toBeNull();
    expect(textEl?.textContent).toContain('First session text content.');

    // In-line header divider exists and contains session number, dashes, and word count
    const card = container.querySelector('[data-session-card="true"]');
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain('Session 1');
    expect(card?.textContent).toContain('-----');
    expect(card?.textContent).toContain('4 words');

    // Verify copy, delete, export, and print buttons are removed
    const buttons = Array.from(container.querySelectorAll('button'));
    const copyBtn = buttons.find((b) => b.title?.toLowerCase().includes('copy'));
    const deleteBtn = buttons.find((b) => b.title?.toLowerCase().includes('delete'));
    const exportBtn = buttons.find((b) => b.title?.toLowerCase().includes('export') || b.textContent?.includes('Export'));
    const printBtn = buttons.find((b) => b.title?.toLowerCase().includes('print'));
    expect(copyBtn).toBeUndefined();
    expect(deleteBtn).toBeUndefined();
    expect(exportBtn).toBeUndefined();
    expect(printBtn).toBeUndefined();

    // Verify redundant "words total" at bottom right is removed
    expect(container.textContent).not.toContain('words total');

    // Verify collapse all button is removed
    const collapseAllBtn = buttons.find((b) => b.textContent?.includes('Collapse All'));
    expect(collapseAllBtn).toBeUndefined();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('supports hiding and showing session dividers via the Show Sessions toolbar button', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const root = createRoot(container);

    const now = new Date().toISOString();
    useTypingStore.setState({
      activeSessions: [
        {
          id: 'doc-1-session-1',
          projectId: 'doc-1',
          sessionNumber: 1,
          startedAt: now,
          completedAt: now,
          text: 'First session content.',
          wordCount: 3,
        },
      ],
      manifest: {
        ...useTypingStore.getState().manifest,
        showSessionDividers: true,
      },
    });

    await act(async () => {
      root.render(<SessionDrawer isOpen={true} onClose={() => {}} />);
    });

    // Dividers exist initially
    expect(container.textContent).toContain('-----');

    // Click Show Sessions button
    const buttons = Array.from(container.querySelectorAll('button'));
    const showSessionsBtn = buttons.find((b) => b.textContent?.includes('Show Sessions'));
    expect(showSessionsBtn).toBeDefined();

    await act(async () => {
      showSessionsBtn?.click();
    });

    expect(useTypingStore.getState().manifest.showSessionDividers).toBe(false);
    // Divider dashes should be hidden now
    expect(container.textContent).not.toContain('-----');
    // Content is still present and continuous
    expect(container.textContent).toContain('First session content.');

    // Click Show Sessions button again to restore
    await act(async () => {
      showSessionsBtn?.click();
    });

    expect(useTypingStore.getState().manifest.showSessionDividers).toBe(true);
    expect(container.textContent).toContain('-----');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('indents every paragraph in Manuscript view mode', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const root = createRoot(container);

    const multiParagraphText = 'Paragraph one text.\nParagraph two text.\nParagraph three text.';
    const now = new Date().toISOString();

    useTypingStore.setState({
      activeSessions: [
        {
          id: 'doc-1-session-1',
          projectId: 'doc-1',
          sessionNumber: 1,
          startedAt: now,
          completedAt: now,
          text: multiParagraphText,
          wordCount: 9,
        },
      ],
      manifest: {
        ...useTypingStore.getState().manifest,
        documentViewMode: 'manuscript',
      },
    });

    await act(async () => {
      root.render(<SessionDrawer isOpen={true} onClose={() => {}} />);
    });

    // Query all paragraph elements inside the text preview
    const paragraphs = Array.from(container.querySelectorAll('.whitespace-pre-wrap p'));
    expect(paragraphs.length).toBe(3);

    // Every paragraph must have the indent-8 class
    paragraphs.forEach((p) => {
      expect(p.className).toContain('indent-8');
    });

    expect(paragraphs[0].textContent).toBe('Paragraph one text.');
    expect(paragraphs[1].textContent).toBe('Paragraph two text.');
    expect(paragraphs[2].textContent).toBe('Paragraph three text.');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('masks active session text with block glyphs █ in Document modal and unmasks when closed', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const root = createRoot(container);

    const now = new Date().toISOString();
    const activeText = 'Drafting in progress right now.';
    useTypingStore.setState({
      manifest: {
        ...useTypingStore.getState().manifest,
        id: 'doc-mask-1',
        documentViewMode: 'typewriter',
      },
      currentPageLines: [
        {
          id: 'p1-line-0',
          lineIndex: 0,
          cells: Array.from(activeText).map((ch, i) => ({
            id: `c0_${i}`,
            char: ch,
            state: 'standard',
            colIndex: i,
            lineIndex: 0,
          })),
          isCommitted: false,
        },
      ],
      activeSessions: [
        {
          id: 'doc-mask-1-session-1',
          projectId: 'doc-mask-1',
          sessionNumber: 1,
          startedAt: now,
          completedAt: null, // Active in-progress session
          text: activeText,
          wordCount: 5,
        },
      ],
    });

    await act(async () => {
      root.render(<SessionDrawer isOpen={true} onClose={() => {}} />);
    });

    // Active session text must be masked with block glyphs (█)
    const textPreview = container.querySelector('.whitespace-pre-wrap');
    expect(textPreview).not.toBeNull();
    // Non-whitespace characters must be masked
    expect(textPreview?.textContent).toContain(activeText.replace(/\S/g, '█'));
    // Real text should be concealed
    expect(textPreview?.textContent).not.toContain('Drafting in progress');

    // Click Close Session button to finalize active session
    const buttons = Array.from(container.querySelectorAll('button'));
    const closeBtn = buttons.find((b) => b.textContent?.includes('Close Session'));
    expect(closeBtn).toBeDefined();

    await act(async () => {
      closeBtn?.click();
      await new Promise((r) => setTimeout(r, 50));
    });

    // Once closed, completed session is unmasked and readable
    expect(container.querySelector('.whitespace-pre-wrap')?.textContent).toContain('Drafting in progress right now.');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
