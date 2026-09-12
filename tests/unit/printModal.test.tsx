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
});
