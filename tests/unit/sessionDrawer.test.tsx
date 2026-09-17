import { describe, it, expect, beforeEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { SessionDrawer } from '@/components/modals/SessionDrawer';
import { ProjectFilesModal } from '@/components/modals/ProjectFilesModal';
import { SettingsDrawer } from '@/components/modals/SettingsDrawer';
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
          completedAt: now,
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

    // Verify per-session copy, delete, export, and print buttons are removed
    const cardButtons = Array.from(card?.querySelectorAll('button') || []);
    expect(cardButtons.length).toBe(0);

    const buttons = Array.from(container.querySelectorAll('button'));
    const copyBtn = buttons.find((b) => b.title?.toLowerCase().includes('copy'));
    const deleteBtn = buttons.find((b) => b.title?.toLowerCase().includes('delete'));
    const printBtn = buttons.find((b) => b.title?.toLowerCase().includes('print'));
    expect(copyBtn).toBeUndefined();
    expect(deleteBtn).toBeUndefined();
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

  it('demarcates active session in a dedicated card with locked banner and promotes to readable text when closed', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const root = createRoot(container);

    const now = new Date().toISOString();
    const activeText = 'Drafting in progress right now.';
    useTypingStore.setState({
      manifest: {
        ...useTypingStore.getState().manifest,
        id: 'doc-mask-1',
        title: 'Drafting Demarcation Test',
      },
      historicalPages: [],
      currentPageNumber: 1,
      currentPageLines: [
        {
          id: 'p1-line-0',
          lineIndex: 0,
          cells: Array.from(activeText).map((ch, i) => ({
            id: `p1-l0-c${i}`,
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

    // Active session must render in a dedicated demarcated card
    const activeCard = container.querySelector('[data-active-session="true"]');
    expect(activeCard).not.toBeNull();
    // Banner displays locked message with wordcount
    expect(activeCard?.textContent).toContain('[ 5 words drafted · Locked until session closed ]');
    // Raw active text should NOT be rendered in the document modal while active
    expect(container.textContent).not.toContain('Drafting in progress right now.');

    // Click Close Session button to finalize active session
    const buttons = Array.from(container.querySelectorAll('button'));
    const closeBtn = buttons.find((b) => b.textContent?.includes('Close Session'));
    expect(closeBtn).toBeDefined();

    await act(async () => {
      closeBtn?.click();
      await new Promise((r) => setTimeout(r, 50));
    });

    // Once closed, completed session is unmasked and readable in the manuscript body
    expect(container.querySelector('[data-active-session="true"]')).toBeNull();
    expect(container.querySelector('.whitespace-pre-wrap')?.textContent).toContain('Drafting in progress right now.');

    await act(async () => {
      root.unmount();
    });
  });

  it('preserves active session demarcation card when Show Sessions is toggled off', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const root = createRoot(container);

    const now = new Date().toISOString();
    const completedText = 'Completed chapter one text.';
    const activeText = 'Currently drafting chapter two.';

    const fullDocText = `${completedText} ${activeText}`;

    useTypingStore.setState({
      manifest: {
        ...useTypingStore.getState().manifest,
        id: 'doc-mask-2',
        title: 'Dividers Off Demarcation Test',
        showSessionDividers: false, // Sessions hidden
      },
      historicalPages: [],
      currentPageNumber: 1,
      currentPageLines: [
        {
          id: 'p1-line-0',
          lineIndex: 0,
          cells: Array.from(fullDocText).map((ch, i) => ({
            id: `p1-l0-c${i}`,
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
          id: 'doc-mask-2-session-1',
          projectId: 'doc-mask-2',
          sessionNumber: 1,
          startedAt: now,
          completedAt: now, // Completed
          text: completedText,
          wordCount: 4,
        },
        {
          id: 'doc-mask-2-session-2',
          projectId: 'doc-mask-2',
          sessionNumber: 2,
          startedAt: now,
          completedAt: null, // Active
          text: activeText,
          wordCount: 4,
        },
      ],
    });

    await act(async () => {
      root.render(<SessionDrawer isOpen={true} onClose={() => {}} />);
    });

    // Completed session text is visible in main body without divider headers
    expect(container.querySelector('.whitespace-pre-wrap')?.textContent).toContain(completedText);
    expect(container.querySelector('.whitespace-pre-wrap')?.textContent).not.toContain('Session 1');

    // Active session card remains distinctly demarcated beneath the body AND shows its banner even when dividers are off
    const activeCard = container.querySelector('[data-active-session="true"]');
    expect(activeCard).not.toBeNull();
    expect(activeCard?.textContent).toContain('Session 2');
    expect(activeCard?.textContent).toContain('Active');
    expect(activeCard?.textContent).toContain('[ 4 words drafted · Locked until session closed ]');
    // Active draft text is hidden
    expect(container.textContent).not.toContain(activeText);

    // When closed, session joins the body, and with Show Sessions off, neither session has a divider
    const buttons = Array.from(container.querySelectorAll('button'));
    const closeBtn = buttons.find((b) => b.textContent?.includes('Close Session'));
    expect(closeBtn).toBeDefined();

    await act(async () => {
      closeBtn?.click();
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(container.querySelector('[data-active-session="true"]')).toBeNull();
    expect(container.textContent).not.toContain('Session 1');
    expect(container.textContent).not.toContain('Session 2');
    expect(container.textContent).toContain(completedText);
    expect(container.textContent).toContain(activeText);

    await act(async () => {
      root.unmount();
    });
  });

  it('forces a linebreak in the platen when closing an active session with drafting content', async () => {
    const now = new Date().toISOString();
    const draftLine = 'Drafting on platen line zero.';

    useTypingStore.setState({
      manifest: {
        ...useTypingStore.getState().manifest,
        id: 'platen-break-1',
        title: 'Platen Break Test',
      },
      historicalPages: [],
      currentPageNumber: 1,
      currentPageLines: [
        {
          id: 'p1-line-0',
          lineIndex: 0,
          cells: Array.from(draftLine).map((ch, i) => ({
            id: `p1-l0-c${i}`,
            char: ch,
            state: 'standard',
            colIndex: i,
            lineIndex: 0,
          })),
          isCommitted: false,
        },
      ],
      activeLineIndex: 0,
      activeColIndex: draftLine.length,
      activeSessions: [
        {
          id: 'platen-break-1-session-1',
          projectId: 'platen-break-1',
          sessionNumber: 1,
          startedAt: now,
          completedAt: null,
          text: draftLine,
          wordCount: 5,
        },
      ],
    });

    // Close the active session
    await useTypingStore.getState().closeActiveSession();

    const state = useTypingStore.getState();
    // Prior drafting line must be committed with hard line break
    expect(state.currentPageLines[0].isCommitted).toBe(true);
    expect(state.currentPageLines[0].wrapType).toBe('hard');

    // Platen must have advanced to a fresh empty drafting line
    expect(state.currentPageLines.length).toBe(2);
    expect(state.currentPageLines[1].cells.length).toBe(0);
    expect(state.activeLineIndex).toBe(1);
    expect(state.activeColIndex).toBe(0);
  });

  it('inserts session divider in platen when typing lazily starts a new session after closing prior session', async () => {
    const now = new Date().toISOString();
    const draftLine = 'Draft content for session 1';

    useTypingStore.setState({
      activeSessions: [
        {
          id: 'test-session-1',
          projectId: 'current',
          sessionNumber: 1,
          startedAt: now,
          completedAt: null,
          text: draftLine,
          wordCount: 5,
        },
      ],
      currentPageLines: [
        {
          id: 'p1-l0',
          lineIndex: 0,
          cells: draftLine.split('').map((char, colIndex) => ({
            id: `p1-l0-c${colIndex}`,
            char,
            state: 'standard' as const,
            colIndex,
            lineIndex: 0,
          })),
          isCommitted: false,
        },
      ],
      activeLineIndex: 0,
      activeColIndex: draftLine.length,
    });

    // Close Session 1
    await useTypingStore.getState().closeActiveSession();
    expect(useTypingStore.getState().activeSessions[0].completedAt).not.toBeNull();

    // Now type a character to lazily start Session 2
    useTypingStore.getState().insertChar('N');

    const state = useTypingStore.getState();
    expect(state.activeSessions.length).toBe(2);
    expect(state.activeSessions[1].sessionNumber).toBe(2);
    expect(state.activeSessions[1].completedAt).toBeNull();

    // Platen must have:
    // Line 0: Session 1 text (committed)
    // Line 1: Session divider line (isSessionDivider: true)
    // Line 2: Session 2 text containing 'N'
    expect(state.currentPageLines.length).toBe(3);
    expect(state.currentPageLines[0].isCommitted).toBe(true);
    expect(state.currentPageLines[1].isSessionDivider).toBe(true);
    expect(state.currentPageLines[2].cells.map((c) => c.char).join('')).toBe('N');
    expect(state.activeLineIndex).toBe(2);
  });

  it('unifies modal headers across Settings, Document, and Project modals, including Return button and author footer', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const root = createRoot(container);

    // 1. Check SettingsDrawer header and footer
    await act(async () => {
      root.render(
        <SettingsDrawer
          isOpen={true}
          onClose={() => {}}
          manifest={useTypingStore.getState().manifest}
          onUpdateHeight={() => {}}
          onUpdatePageSize={() => {}}
          onUpdateManifest={() => {}}
        />
      );
    });

    const settingsHeader = container.querySelector('h2, span.uppercase');
    expect(settingsHeader?.textContent).toContain('Settings');
    const settingsReturnBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Return')
    );
    expect(settingsReturnBtn).not.toBeUndefined();
    expect(container.textContent).toMatch(/Minitype v\d+\.\d+\.\d+\.\d+ · by timfromtheborder/);

    await act(async () => {
      root.unmount();
    });

    // 2. Check SessionDrawer header
    const root2 = createRoot(container);
    await act(async () => {
      root2.render(<SessionDrawer isOpen={true} onClose={() => {}} />);
    });

    const documentHeader = Array.from(container.querySelectorAll('span')).find((s) =>
      s.textContent?.includes('Document')
    );
    expect(documentHeader).not.toBeUndefined();
    const documentReturnBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Return')
    );
    expect(documentReturnBtn).not.toBeUndefined();

    await act(async () => {
      root2.unmount();
    });
  });

  it('does not automatically focus or activate the project title input when SessionDrawer or ProjectFilesModal open', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const root = createRoot(container);

    // Test SessionDrawer
    await act(async () => {
      root.render(<SessionDrawer isOpen={true} onClose={() => {}} />);
    });
    // Wait for the 50ms focus timeout
    await act(async () => {
      await new Promise((res) => setTimeout(res, 80));
    });

    const sessionDrawerInput = container.querySelector('input[data-modal-input="true"]') as HTMLInputElement;
    expect(sessionDrawerInput).not.toBeNull();
    expect(document.activeElement).not.toBe(sessionDrawerInput);

    await act(async () => {
      root.unmount();
    });

    // Test ProjectFilesModal
    const root2 = createRoot(container);
    await act(async () => {
      root2.render(<ProjectFilesModal isOpen={true} onClose={() => {}} />);
    });
    await act(async () => {
      await new Promise((res) => setTimeout(res, 80));
    });

    const projectFilesInput = container.querySelector('input[data-modal-input="true"]') as HTMLInputElement;
    expect(projectFilesInput).not.toBeNull();
    expect(document.activeElement).not.toBe(projectFilesInput);

    await act(async () => {
      root2.unmount();
    });
    container.remove();
  });

  it('exports plaintext directly when no active session with text, but expands button with confirmation when active text exists', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    if (!window.URL.createObjectURL) {
      window.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock');
      window.URL.revokeObjectURL = vi.fn();
    }
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    // Case 1: No active session with text
    useTypingStore.setState({
      activeSessions: [],
      currentPageLines: [
        {
          id: 'p1-l0',
          lineIndex: 0,
          cells: [],
          isCommitted: false,
        },
      ],
      manifest: {
        ...useTypingStore.getState().manifest,
        title: 'Export Test Doc',
      },
    });

    const root = createRoot(container);
    await act(async () => {
      root.render(<SessionDrawer isOpen={true} onClose={() => {}} />);
    });

    const exportBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Export Document')
    );
    expect(exportBtn).not.toBeUndefined();

    await act(async () => {
      exportBtn?.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Should download directly without expanding confirmation
    expect(clickSpy).toHaveBeenCalled();
    expect(container.textContent).not.toContain('Close active session and export');

    await act(async () => {
      root.unmount();
    });

    // Case 2: Active session with text exists
    const now = new Date().toISOString();
    useTypingStore.setState({
      activeSessions: [
        {
          id: 'export-session-1',
          projectId: 'current',
          sessionNumber: 1,
          startedAt: now,
          completedAt: null,
          text: 'Active drafted words here.',
          wordCount: 4,
        },
      ],
      currentPageLines: [
        {
          id: 'p1-l0',
          lineIndex: 0,
          cells: 'Active drafted words here.'.split('').map((char, colIndex) => ({
            id: `p1-l0-c${colIndex}`,
            char,
            state: 'standard' as const,
            colIndex,
            lineIndex: 0,
          })),
          isCommitted: false,
        },
      ],
    });

    const closeSessionSpy = vi.spyOn(useTypingStore.getState(), 'closeActiveSession');

    const root2 = createRoot(container);
    await act(async () => {
      root2.render(<SessionDrawer isOpen={true} onClose={() => {}} />);
    });

    const exportBtn2 = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Export Document')
    );
    expect(exportBtn2).not.toBeUndefined();

    // Click Export Document -> button expands and text says 'Close active session and export'
    await act(async () => {
      exportBtn2?.click();
    });

    expect(container.textContent).toContain('Close active session and export');
    expect(container.textContent).toContain('Cancel');

    // Test reversion 1: Cancel reverts button back to 'Export Document'
    const cancelBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Cancel')
    );
    expect(cancelBtn).not.toBeUndefined();

    await act(async () => {
      cancelBtn?.click();
    });
    expect(container.textContent).not.toContain('Close active session and export');
    expect(container.textContent).toContain('Export Document');

    // Expand button again
    const exportBtn3 = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Export Document')
    );
    await act(async () => {
      exportBtn3?.click();
    });
    expect(container.textContent).toContain('Close active session and export');

    // Test reversion 2: If 'Close Session' button is pressed, the button reverts
    const closeSessionBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Close Session')
    );
    expect(closeSessionBtn).not.toBeUndefined();

    await act(async () => {
      closeSessionBtn?.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(closeSessionSpy).toHaveBeenCalled();
    expect(container.textContent).not.toContain('Close active session and export');
    expect(container.textContent).toContain('Export Document');

    // Test reversion 3: If the modal is closed, the button reverts
    // Set up active session with text again
    await act(async () => {
      useTypingStore.setState({
        activeSessions: [
          {
            id: 'export-session-2',
            projectId: 'current',
            sessionNumber: 2,
            startedAt: now,
            completedAt: null,
            text: 'More active words.',
            wordCount: 3,
          },
        ],
      });
    });

    // Re-render and expand
    await act(async () => {
      root2.render(<SessionDrawer isOpen={true} onClose={() => {}} />);
    });
    const exportBtn4 = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Export Document')
    );
    await act(async () => {
      exportBtn4?.click();
    });
    expect(container.textContent).toContain('Close active session and export');

    // Close modal (isOpen: false)
    await act(async () => {
      root2.render(<SessionDrawer isOpen={false} onClose={() => {}} />);
    });
    // Open modal again (isOpen: true)
    await act(async () => {
      root2.render(<SessionDrawer isOpen={true} onClose={() => {}} />);
    });
    // The button must have reverted to 'Export Document'
    expect(container.textContent).not.toContain('Close active session and export');
    expect(container.textContent).toContain('Export Document');

    // Test execution: Clicking 'Close active session and export'
    const exportBtn5 = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Export Document')
    );
    await act(async () => {
      exportBtn5?.click();
    });

    const closeAndExportBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Close active session and export')
    );
    expect(closeAndExportBtn).not.toBeUndefined();

    await act(async () => {
      closeAndExportBtn?.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(closeSessionSpy).toHaveBeenCalledTimes(2);
    expect(container.textContent).not.toContain('Close active session and export');

    await act(async () => {
      root2.unmount();
    });
    clickSpy.mockRestore();
    container.remove();
  });
});
