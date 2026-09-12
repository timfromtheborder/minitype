import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { useTypingStore, readSynchronousSettings, persistSettings, getInitialManifest } from '@/stores/typingStore';
import { ApertureFrame } from '@/components/aperture/ApertureFrame';
import { db } from '@/db';

describe('Aperture Persistence Invariant', () => {
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    if (typeof window !== 'undefined') window.name = '';
    if (typeof document !== 'undefined') {
      document.cookie = 'minitype_global_settings=; max-age=0; path=/;';
      document.documentElement.removeAttribute('data-theme');
      document.documentElement.removeAttribute('data-text-size');
      document.documentElement.removeAttribute('data-aperture-height');
      document.documentElement.removeAttribute('data-page-mode');
      document.documentElement.removeAttribute('data-page-size');
      document.documentElement.removeAttribute('data-show-stats');
      document.documentElement.removeAttribute('data-double-space');
      document.documentElement.removeAttribute('data-updated-at');
    }
    await db.settings.clear();
    await db.manuscripts.clear();
    await db.pages.clear();
    await db.sessions.clear();
  });

  it('fresh app visit with no saved settings defaults cleanly to 1-line aperture, scroll mode, typewriter theme', async () => {
    const initial = getInitialManifest();
    expect(initial.activeApertureHeight).toBe(1);
    expect(initial.preferredApertureHeight).toBe(1);
    expect(initial.pageMode).toBe('scroll');
    expect(initial.colorScheme).toBe('typewriter');

    useTypingStore.setState({ manifest: initial });
    await useTypingStore.getState().rehydrate();

    const state = useTypingStore.getState();
    expect(state.manifest.activeApertureHeight).toBe(1);
    expect(state.manifest.pageMode).toBe('scroll');
    expect(state.manifest.colorScheme).toBe('typewriter');
  });

  it('Tier 5 fallback returns null when data-updated-at is absent even if data-theme is on documentElement', () => {
    document.documentElement.setAttribute('data-theme', 'typewriter');
    document.documentElement.setAttribute('data-page-mode', 'scroll');
    document.documentElement.removeAttribute('data-updated-at');

    const sync = readSynchronousSettings();
    expect(sync).toBeNull();

    // When sync is null, getInitialManifest returns clean DEFAULT_MANIFEST with activeApertureHeight = 1
    const manifest = getInitialManifest();
    expect(manifest.activeApertureHeight).toBe(1);
    expect(manifest.colorScheme).toBe('typewriter');
  });

  it('Tier 5 fallback parses attributes correctly when data-updated-at is present', () => {
    document.documentElement.setAttribute('data-theme', 'spotlight');
    document.documentElement.setAttribute('data-aperture-height', '6');
    document.documentElement.setAttribute('data-page-mode', 'scroll');
    document.documentElement.setAttribute('data-updated-at', '1234567890');

    const sync = readSynchronousSettings();
    expect(sync).not.toBeNull();
    expect(sync?.colorScheme).toBe('spotlight');
    expect(sync?.activeApertureHeight).toBe(6);
    expect(sync?._updatedAt).toBe(1234567890);
  });

  it('preserves user aperture setting (e.g. 4) across page reload', async () => {
    // 1. Initial mount on fresh app
    await useTypingStore.getState().rehydrate();
    expect(useTypingStore.getState().manifest.activeApertureHeight).toBe(1);

    // 2. User changes aperture slider to 4
    useTypingStore.getState().setApertureHeight(4);
    expect(useTypingStore.getState().manifest.activeApertureHeight).toBe(4);

    // 3. User types some characters
    useTypingStore.getState().insertChar('H');
    useTypingStore.getState().insertChar('e');
    useTypingStore.getState().insertChar('l');
    useTypingStore.getState().insertChar('l');
    useTypingStore.getState().insertChar('o');

    // Wait for async queue to settle
    await new Promise((r) => setTimeout(r, 60));

    // 4. Verify storage contains 4
    const sync = readSynchronousSettings();
    expect(sync?.activeApertureHeight).toBe(4);

    const dbSettings = await db.settings.get('global');
    expect(dbSettings?.settings.activeApertureHeight).toBe(4);

    // 5. Simulate page reload:
    // With layout.tsx updated, HTML element has no static attributes.
    // The inline script sets documentElement attributes if saved settings exist:
    const stored = localStorage.getItem('minitype_global_settings');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.activeApertureHeight) {
        document.documentElement.setAttribute('data-aperture-height', String(parsed.activeApertureHeight));
      }
      if (parsed._updatedAt) {
        document.documentElement.setAttribute('data-updated-at', String(parsed._updatedAt));
      }
    }

    // Now in-memory store starts afresh:
    const freshInitial = getInitialManifest();
    expect(freshInitial.activeApertureHeight).toBe(4);

    // Set store manifest to freshInitial (simulating new module mount)
    useTypingStore.setState({ manifest: freshInitial });

    // Then rehydrate() runs on mount
    await useTypingStore.getState().rehydrate();
    expect(useTypingStore.getState().manifest.activeApertureHeight).toBe(4);
  });

  it('preserves user aperture setting across notecard mode transitions', async () => {
    const store = useTypingStore.getState();
    await store.rehydrate();

    // Set custom aperture to 5 in scroll mode
    store.setApertureHeight(5);
    expect(useTypingStore.getState().manifest.activeApertureHeight).toBe(5);
    expect(useTypingStore.getState().manifest.preferredApertureHeight).toBe(5);

    // Transition to notecard mode (SettingsDrawer calls onUpdateManifest({ pageMode: 'notecard', pageSize: 10 }))
    store.setManifest({ pageMode: 'notecard', pageSize: 10 });
    expect(useTypingStore.getState().manifest.pageMode).toBe('notecard');
    expect(useTypingStore.getState().manifest.activeApertureHeight).toBe(10);
    expect(useTypingStore.getState().manifest.preferredApertureHeight).toBe(5);

    // Transition back to scroll mode
    store.setManifest({ pageMode: 'scroll', pageSize: 999999 });
    expect(useTypingStore.getState().manifest.pageMode).toBe('scroll');
    expect(useTypingStore.getState().manifest.activeApertureHeight).toBe(5);
  });

  it('preserves global aperture setting when creating a new project or loading an existing project', async () => {
    const store = useTypingStore.getState();
    await store.rehydrate();

    // User sets aperture to 7
    store.setApertureHeight(7);
    expect(useTypingStore.getState().manifest.activeApertureHeight).toBe(7);

    // User types in project 1
    store.insertChar('A');
    await new Promise((r) => setTimeout(r, 60));
    const project1Id = useTypingStore.getState().manifest.id;

    // Create a new project
    await store.newProject();
    expect(useTypingStore.getState().manifest.id).not.toBe(project1Id);
    expect(useTypingStore.getState().manifest.activeApertureHeight).toBe(7);

    // Switch back to project 1
    await store.loadProject(project1Id);
    expect(useTypingStore.getState().manifest.id).toBe(project1Id);
    expect(useTypingStore.getState().manifest.activeApertureHeight).toBe(7);
  });

  it('ApertureFrame renders with CSS variable height and matches activeApertureHeight setting', () => {
    // 1. When height is 1
    useTypingStore.getState().setApertureHeight(1);
    let html = renderToString(React.createElement(ApertureFrame, { height: 1, isPaused: false }));
    expect(html).toContain('height:var(--aperture-height-rem, 1.25rem)');
    expect(html).toContain('min-height:var(--aperture-height-rem, 1.25rem)');

    // 2. When height is 4
    useTypingStore.getState().setApertureHeight(4);
    html = renderToString(React.createElement(ApertureFrame, { height: 4, isPaused: false }));
    expect(html).toContain('height:var(--aperture-height-rem, 5rem)');
    expect(html).toContain('min-height:var(--aperture-height-rem, 5rem)');

    // 3. In notecard mode (locked to 10 lines)
    useTypingStore.getState().setManifest({ pageMode: 'notecard', pageSize: 10 });
    html = renderToString(React.createElement(ApertureFrame, { height: 10, isPaused: false }));
    expect(html).toContain('height:var(--aperture-height-rem, 12.5rem)');
    expect(html).toContain('min-height:var(--aperture-height-rem, 12.5rem)');
  });
});
