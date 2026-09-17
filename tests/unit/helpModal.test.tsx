import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { HelpModal } from '@/components/modals/HelpModal';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('HelpModal', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('renders nothing when isOpen is false', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<HelpModal isOpen={false} onClose={vi.fn()} />);
    });

    expect(container.children.length).toBe(0);
  });

  it('renders unified header with Help icon, instructions, and shortcuts when open', async () => {
    const onClose = vi.fn();
    const root = createRoot(container);
    await act(async () => {
      root.render(<HelpModal isOpen={true} onClose={onClose} />);
    });

    // Check header
    expect(container.textContent).toContain('Help & Instructions');

    // Check Return button
    const returnBtn = container.querySelector('button[aria-label="Return to writing in aperture"]');
    expect(returnBtn).not.toBeNull();
    expect(returnBtn?.textContent).toContain('Return');

    // Check concise instructions sections
    expect(container.textContent).toContain('Saving, Import & Export');
    expect(container.textContent).toContain('Settings Reference');
    expect(container.textContent).toContain('Typing sounds');
    expect(container.textContent).toContain('Newsprint');
    expect(container.textContent).toContain('Keyboard Shortcuts');

    // Verify verbosity, method philosophy, and phosphor easter egg are omitted
    expect(container.textContent).not.toContain('The Minitype Method');
    expect(container.textContent).not.toContain('phosphor');

    // Check shortcuts table
    expect(container.textContent).toContain('Highlight character backward');
    expect(container.textContent).toContain('Settings drawer');
    expect(container.textContent).toContain('Help & instructions');
    expect(container.textContent).toContain('Strike out highlighted text');

    // Click Return button
    await act(async () => {
      returnBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape key press', async () => {
    const onClose = vi.fn();
    const root = createRoot(container);
    await act(async () => {
      root.render(<HelpModal isOpen={true} onClose={onClose} />);
    });

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('allows collapsing and expanding categories independently', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<HelpModal isOpen={true} onClose={vi.fn()} />);
    });

    const settingsBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Settings Reference')
    );
    expect(settingsBtn).toBeDefined();
    expect(container.textContent).toContain('Aperture');

    // Click to collapse
    await act(async () => {
      settingsBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(settingsBtn?.getAttribute('aria-expanded')).toBe('false');
    expect(container.textContent).not.toContain('Aperture');

    // Click to expand again
    await act(async () => {
      settingsBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(settingsBtn?.getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('Aperture');
  });
});
