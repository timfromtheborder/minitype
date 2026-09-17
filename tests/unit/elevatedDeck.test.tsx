import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import Home from '@/app/page';
import { useTypingStore } from '@/stores/typingStore';
import * as fs from 'fs';
import * as path from 'path';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Strategy A - Persistent Elevated Deck & Modal Linking', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    // Reset Zustand store state
    useTypingStore.setState({
      manifest: {
        id: 'test-project',
        title: 'Elevated Deck Test',
        mode: 'local',
        inboxCount: 0,
        outboxCount: 0,
        lastPrintedCharIndex: 0,
        printedPagesCount: 0,
        activeApertureHeight: 5,
        wrapMode: 'soft',
        pageSize: 54,
        pageMode: 'scroll',
        colorScheme: 'typewriter',
        typeface: 'courier-prime',
        textSize: 'm',
      },
      isHydrated: true,
      historicalPages: [],
      currentPageNumber: 1,
      currentPageLines: [{ id: 'p1-line-0', lineIndex: 0, cells: [], isCommitted: false }],
    });
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('renders persistent deck with z-[60] elevated positioning above modals', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<Home />);
    });

    const footer = container.querySelector('footer');
    expect(footer).not.toBeNull();
    expect(footer?.className).toContain('z-[60]');
    expect(footer?.className).toContain('fixed');
    expect(footer?.className).toContain('bottom-0');
  });

  it('allows direct 1-tap switching between modals without manual dismiss', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<Home />);
    });

    const docBtn = container.querySelector('button[aria-label="Document"]') as HTMLButtonElement;
    const projectBtn = container.querySelector('button[aria-label="Project"]') as HTMLButtonElement;
    const settingsBtn = container.querySelector('button[aria-label="Settings"]') as HTMLButtonElement;
    const helpBtn = container.querySelector('button[aria-label="Help"]') as HTMLButtonElement;

    expect(docBtn).not.toBeNull();
    expect(projectBtn).not.toBeNull();
    expect(settingsBtn).not.toBeNull();
    expect(helpBtn).not.toBeNull();

    // Initially no modals are open
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(docBtn.getAttribute('aria-pressed')).toBe('false');

    // 1. Open Document modal
    await act(async () => {
      docBtn.click();
    });
    expect(container.querySelector('div[role="dialog"][aria-label="Document"]')).not.toBeNull();
    expect(docBtn.getAttribute('aria-pressed')).toBe('true');

    // 2. Direct 1-tap switch to Project modal
    await act(async () => {
      projectBtn.click();
    });
    expect(container.querySelector('div[role="dialog"][aria-label="Document"]')).toBeNull();
    expect(container.querySelector('div[role="dialog"][aria-label="Project Files"]')).not.toBeNull();
    expect(docBtn.getAttribute('aria-pressed')).toBe('false');
    expect(projectBtn.getAttribute('aria-pressed')).toBe('true');

    // 3. Direct 1-tap switch to Settings drawer
    await act(async () => {
      settingsBtn.click();
    });
    expect(container.querySelector('div[role="dialog"][aria-label="Project Files"]')).toBeNull();
    expect(container.querySelector('div[role="dialog"][aria-label="Settings"]')).not.toBeNull();
    expect(projectBtn.getAttribute('aria-pressed')).toBe('false');
    expect(settingsBtn.getAttribute('aria-pressed')).toBe('true');

    // 4. Direct 1-tap switch to Help modal
    await act(async () => {
      helpBtn.click();
    });
    expect(container.querySelector('div[role="dialog"][aria-label="Settings"]')).toBeNull();
    expect(container.querySelector('div[role="dialog"][aria-label="Help and Instructions"]')).not.toBeNull();
    expect(settingsBtn.getAttribute('aria-pressed')).toBe('false');
    expect(helpBtn.getAttribute('aria-pressed')).toBe('true');

    // 5. Toggling active modal button closes the modal
    await act(async () => {
      helpBtn.click();
    });
    expect(container.querySelector('div[role="dialog"]')).toBeNull();
    expect(helpBtn.getAttribute('aria-pressed')).toBe('false');
  });

  it('applies active styling to the currently open modal deck button', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<Home />);
    });

    const docBtn = container.querySelector('button[aria-label="Document"]') as HTMLButtonElement;

    // Inactive: contains bg-card and opacity-70
    expect(docBtn.className).toContain('bg-card');

    // Click Document: becomes active with border-primary bg-primary text-primary-foreground
    await act(async () => {
      docBtn.click();
    });
    expect(docBtn.className).toContain('bg-primary');
    expect(docBtn.className).toContain('text-primary-foreground');

    // Click again: toggles off, returns to inactive
    await act(async () => {
      docBtn.click();
    });
    expect(docBtn.className).toContain('bg-card');
  });

  it('verifies S (-15%) and M (-5%) font size reductions in globals.css', () => {
    const cssPath = path.resolve(__dirname, '../../src/app/globals.css');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');

    // Check S size is 11.9px (14px - 15%)
    expect(cssContent).toContain('font-size: 11.9px;');

    // Check M size is 15.2px (16px - 5%)
    expect(cssContent).toContain('font-size: 15.2px;');

    // Check clamped values include 11.9px and 15.2px
    expect(cssContent).toContain('11.9px)');
    expect(cssContent).toContain('15.2px)');
  });
});
