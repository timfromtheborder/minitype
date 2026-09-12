import { ManuscriptManifest } from '@/types';
import { saveGlobalSettingsToDb } from '@/db';

export const SETTING_KEYS = [
  'activeApertureHeight',
  'wrapMode',
  'pageSize',
  'pageMode',
  'colorScheme',
  'typeface',
  'textSize',
  'showStats',
  'showSessionTargetTracker',
  'doubleSpaceLinebreaks',
] as const;

export const SETTINGS_KEY = 'minitype_global_settings';
export const ACTIVE_PROJECT_KEY = 'minitype_active_project_id';

export const DEFAULT_MANIFEST: ManuscriptManifest = {
  id: 'default-manuscript',
  title: 'Untitled Project',
  mode: 'local',
  inboxCount: 0,
  outboxCount: 0,
  lastPrintedCharIndex: 0,
  printedPagesCount: 0,
  activeApertureHeight: 1,
  wrapMode: 'soft',
  pageSize: 999999,
  pageMode: 'scroll',
  colorScheme: 'typewriter',
  typeface: 'courier-prime',
  textSize: 'm',
  showStats: true,
  showSessionTargetTracker: true,
  sessionWordTarget: undefined,
  doubleSpaceLinebreaks: false,
  sessionCount: 1,
  totalWordCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

export function extractSettings(obj: any): Partial<ManuscriptManifest> {
  const settings: any = {};
  if (!obj) return settings;
  for (const key of SETTING_KEYS) {
    if (obj[key] !== undefined) {
      settings[key] = obj[key];
    }
  }
  return settings;
}

export function readSynchronousSettings(): (Partial<ManuscriptManifest> & { _updatedAt?: number }) | null {
  if (typeof window === 'undefined') return null;

  const candidates: Array<{ settings: Partial<ManuscriptManifest>; updatedAt: number; priority: number }> = [];

  const tryParse = (raw: string | null, priority: number) => {
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const settings = extractSettings(parsed);
      if (Object.keys(settings).length > 0) {
        candidates.push({
          settings,
          updatedAt: typeof parsed._updatedAt === 'number' ? parsed._updatedAt : 0,
          priority,
        });
      }
    } catch (e) {}
  };

  // Tier 1: localStorage
  try {
    tryParse(localStorage.getItem(SETTINGS_KEY), 1);
  } catch (e) {}

  // Tier 2: sessionStorage (guaranteed survival across reloads in same tab on iOS)
  try {
    tryParse(sessionStorage.getItem(SETTINGS_KEY), 2);
  } catch (e) {}

  // Tier 3: document.cookie
  try {
    if (typeof document !== 'undefined') {
      const match = document.cookie.match(new RegExp(`(?:^|; )${SETTINGS_KEY}=([^;]*)`));
      if (match) {
        tryParse(decodeURIComponent(match[1]), 3);
      }
    }
  } catch (e) {}

  // Tier 4: window.name backup (immune to iOS Safari storage wiping and private browsing limits)
  try {
    if (typeof window !== 'undefined' && window.name && window.name.startsWith('minitype_settings:')) {
      tryParse(window.name.slice('minitype_settings:'.length), 4);
    }
  } catch (e) {}

  if (candidates.length > 0) {
    // Sort descending by updatedAt, and if equal, by tier priority ascending (1 > 2 > 3 > 4)
    candidates.sort((a, b) => b.updatedAt - a.updatedAt || a.priority - b.priority);
    // Merge all candidates from lowest priority/oldest to highest priority/newest so best values win
    let merged: any = {};
    for (let i = candidates.length - 1; i >= 0; i--) {
      merged = { ...merged, ...candidates[i].settings };
    }
    merged._updatedAt = candidates[0].updatedAt;
    return merged;
  }

  // Tier 5: Document element fallback if set by layout script
  if (typeof document !== 'undefined') {
    const theme = document.documentElement.getAttribute('data-theme') as any;
    const textSize = document.documentElement.getAttribute('data-text-size') as any;
    const apertureHeight = document.documentElement.getAttribute('data-aperture-height');
    const pageMode = document.documentElement.getAttribute('data-page-mode') as any;
    const pageSize = document.documentElement.getAttribute('data-page-size');
    const showStats = document.documentElement.getAttribute('data-show-stats');
    const doubleSpace = document.documentElement.getAttribute('data-double-space');
    const updatedAt = document.documentElement.getAttribute('data-updated-at');

    if (theme || textSize || apertureHeight || pageMode || pageSize) {
      const fallback: any = {};
      if (theme) fallback.colorScheme = theme;
      if (textSize) fallback.textSize = textSize;
      if (apertureHeight) fallback.activeApertureHeight = parseInt(apertureHeight, 10);
      if (pageMode) fallback.pageMode = pageMode;
      if (pageSize) fallback.pageSize = parseInt(pageSize, 10);
      if (showStats !== null && showStats !== undefined) fallback.showStats = showStats === 'true';
      if (doubleSpace !== null && doubleSpace !== undefined) fallback.doubleSpaceLinebreaks = doubleSpace === 'true';
      if (updatedAt) fallback._updatedAt = parseInt(updatedAt, 10);
      return fallback;
    }
  }

  return null;
}

export function getInitialManifest(): ManuscriptManifest {
  const base = { ...DEFAULT_MANIFEST };
  const sync = readSynchronousSettings();
  if (sync) {
    return { ...base, ...extractSettings(sync) };
  }
  return base;
}

export function persistSettings(manifest: Partial<ManuscriptManifest>): void {
  if (typeof window === 'undefined') return;

  try {
    const settings = extractSettings(manifest);
    if (Object.keys(settings).length === 0) return;

    const existing = readSynchronousSettings() || {};
    const merged = { ...existing, ...settings, _updatedAt: Date.now() };
    const serialized = JSON.stringify(merged);

    // 1. Synchronous localStorage
    try {
      localStorage.setItem(SETTINGS_KEY, serialized);
    } catch (e) {}

    // 2. Synchronous sessionStorage
    try {
      sessionStorage.setItem(SETTINGS_KEY, serialized);
    } catch (e) {}

    // 3. Synchronous window.name backup
    try {
      window.name = `minitype_settings:${serialized}`;
    } catch (e) {}

    // 4. Synchronous Cookies
    try {
      if (typeof document !== 'undefined') {
        const isSecure = window.location.protocol === 'https:';
        const secureFlag = isSecure ? '; Secure' : '';
        const cookieVal = encodeURIComponent(serialized);

        // Write to root
        document.cookie = `${SETTINGS_KEY}=${cookieVal}; path=/; max-age=31536000; SameSite=Lax${secureFlag}`;

        // Write to current subfolder path (e.g. /minitype/ on GitHub Pages)
        const currentPath = window.location.pathname.replace(/\/[^/]*$/, '') || '';
        if (currentPath && currentPath !== '/') {
          document.cookie = `${SETTINGS_KEY}=${cookieVal}; path=${currentPath}; max-age=31536000; SameSite=Lax${secureFlag}`;
          document.cookie = `${SETTINGS_KEY}=${cookieVal}; path=${currentPath}/; max-age=31536000; SameSite=Lax${secureFlag}`;
        }
      }
    } catch (e) {}

    // 5. Asynchronous IndexedDB
    saveGlobalSettingsToDb(merged).catch(console.error);

    // 6. Request persistent storage on mobile / WebKit
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }

    // 7. Synchronous DOM attribute updates
    if (typeof document !== 'undefined') {
      if (merged.colorScheme) {
        document.documentElement.setAttribute('data-theme', merged.colorScheme);
      }
      if (merged.textSize) {
        document.documentElement.setAttribute('data-text-size', merged.textSize);
      }
      if (merged.activeApertureHeight) {
        document.documentElement.setAttribute('data-aperture-height', String(merged.activeApertureHeight));
      }
      if (merged.pageMode) {
        document.documentElement.setAttribute('data-page-mode', merged.pageMode);
      }
      if (merged.pageSize) {
        document.documentElement.setAttribute('data-page-size', String(merged.pageSize));
      }
      if (merged.showStats !== undefined) {
        document.documentElement.setAttribute('data-show-stats', String(merged.showStats));
      }
      if (merged.doubleSpaceLinebreaks !== undefined) {
        document.documentElement.setAttribute('data-double-space', String(merged.doubleSpaceLinebreaks));
      }
      if (merged._updatedAt) {
        document.documentElement.setAttribute('data-updated-at', String(merged._updatedAt));
      }
    }
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}
