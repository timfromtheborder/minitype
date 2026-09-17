import { ManuscriptManifest } from '@/types';
import { saveGlobalSettingsToDb } from '@/db';

export const SETTING_KEYS = [
  'activeApertureHeight',
  'preferredApertureHeight',
  'wrapMode',
  'pageSize',
  'pageMode',
  'colorScheme',
  'typeface',
  'textSize',
  'showStats',
  'showSessionTargetTracker',
  'doubleSpaceLinebreaks',
  'allowStrikeout',
  'showClock',
  'clockFormat',
  'phosphorColor',
  'documentViewMode',
  'showSessionDividers',
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
  preferredApertureHeight: 1,
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
  allowStrikeout: true,
  showClock: true,
  clockFormat: '12h',
  phosphorColor: 'amber',
  documentViewMode: 'typewriter',
  showSessionDividers: true,
  sessionCount: 0,
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
          updatedAt: typeof parsed._updatedAt === 'number'
            ? parsed._updatedAt
            : (typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0),
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

  // Tier 3: document.cookie (parse all matching cookies and collect all candidates)
  try {
    if (typeof document !== 'undefined' && document.cookie) {
      const cookies = document.cookie.split(';');
      for (const c of cookies) {
        const trimmed = c.trim();
        if (trimmed.startsWith(`${SETTINGS_KEY}=`)) {
          const rawVal = trimmed.slice(SETTINGS_KEY.length + 1);
          tryParse(decodeURIComponent(rawVal), 3);
        }
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
    const updatedAt = document.documentElement.getAttribute('data-updated-at');
    // Only accept Tier 5 if data-updated-at is present (confirming the inline script actually found and set saved user settings)
    if (updatedAt) {
      const theme = document.documentElement.getAttribute('data-theme') as any;
      const textSize = document.documentElement.getAttribute('data-text-size') as any;
      const apertureHeight = document.documentElement.getAttribute('data-aperture-height');
      const pageMode = document.documentElement.getAttribute('data-page-mode') as any;
      const pageSize = document.documentElement.getAttribute('data-page-size');
      const showStats = document.documentElement.getAttribute('data-show-stats');
      const doubleSpace = document.documentElement.getAttribute('data-double-space');
      const allowStrikeout = document.documentElement.getAttribute('data-allow-strikeout');
      const keepScreenAwake = document.documentElement.getAttribute('data-keep-screen-awake') as any;
      const showClock = document.documentElement.getAttribute('data-show-clock');
      const clockFormat = document.documentElement.getAttribute('data-clock-format') as any;
      const phosphorColor = document.documentElement.getAttribute('data-phosphor') as any;

      const fallback: any = { _updatedAt: parseInt(updatedAt, 10) };
      if (theme) fallback.colorScheme = theme;
      if (textSize) fallback.textSize = textSize;
      if (apertureHeight) fallback.activeApertureHeight = parseInt(apertureHeight, 10);
      if (pageMode) fallback.pageMode = pageMode;
      if (pageSize) fallback.pageSize = parseInt(pageSize, 10);
      if (showStats !== null && showStats !== undefined) fallback.showStats = showStats === 'true';
      if (doubleSpace !== null && doubleSpace !== undefined) fallback.doubleSpaceLinebreaks = doubleSpace === 'true';
      if (allowStrikeout !== null && allowStrikeout !== undefined) fallback.allowStrikeout = allowStrikeout === 'true';
      if (keepScreenAwake) fallback.keepScreenAwake = keepScreenAwake;
      if (showClock !== null && showClock !== undefined) fallback.showClock = showClock === 'true';
      if (clockFormat) fallback.clockFormat = clockFormat;
      if (phosphorColor) fallback.phosphorColor = phosphorColor;
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

let hasRequestedStoragePersist = false;
let hasCleanedLegacyCookies = false;
let inMemorySettingsCache: (Partial<ManuscriptManifest> & { _updatedAt?: number }) | null = null;

export function persistSettings(manifest: Partial<ManuscriptManifest>): void {
  if (typeof window === 'undefined') return;

  try {
    const settings = extractSettings(manifest);
    if (Object.keys(settings).length === 0) return;

    // Instantaneous paint: update theme attribute immediately on document before serialization
    if (typeof document !== 'undefined' && settings.colorScheme) {
      if (document.documentElement.getAttribute('data-theme') !== settings.colorScheme) {
        document.documentElement.setAttribute('data-theme', settings.colorScheme);
      }
    }

    // Invalidate in-memory cache if localStorage was cleared
    let existing = inMemorySettingsCache;
    try {
      if (!localStorage.getItem(SETTINGS_KEY)) {
        existing = null;
      }
    } catch (e) {}

    if (!existing) {
      existing = readSynchronousSettings() || {};
    }

    const merged = { ...existing, ...settings, _updatedAt: Date.now() };
    inMemorySettingsCache = merged;
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

    // 4. Synchronous Cookies: Write strictly to root and clear any legacy subpath shadow cookies
    try {
      if (typeof document !== 'undefined') {
        const isSecure = window.location.protocol === 'https:';
        const secureFlag = isSecure ? '; Secure' : '';
        const cookieVal = encodeURIComponent(serialized);

        // Write to root
        document.cookie = `${SETTINGS_KEY}=${cookieVal}; path=/; max-age=31536000; SameSite=Lax${secureFlag}`;

        // Actively clear any legacy subfolder path cookies (e.g. /minitype or /minitype/) once
        if (!hasCleanedLegacyCookies) {
          hasCleanedLegacyCookies = true;
          const currentPath = window.location.pathname.replace(/\/[^/]*$/, '') || '';
          const pathsToClear = new Set<string>(['/minitype', '/minitype/']);
          if (currentPath && currentPath !== '/') {
            pathsToClear.add(currentPath);
            pathsToClear.add(`${currentPath}/`);
          }
          for (const p of pathsToClear) {
            document.cookie = `${SETTINGS_KEY}=; path=${p}; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax${secureFlag}`;
          }
        }
      }
    } catch (e) {}

    // 5. Asynchronous IndexedDB
    saveGlobalSettingsToDb(merged).catch(console.error);

    // 6. Request persistent storage on mobile / WebKit (once)
    if (!hasRequestedStoragePersist && typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      hasRequestedStoragePersist = true;
      navigator.storage.persist().catch(() => {});
    }

    // 7. Synchronous DOM attribute updates (diffed to avoid redundant style invalidations)
    if (typeof document !== 'undefined') {
      const setAttrIfChanged = (name: string, val: any) => {
        if (val !== undefined && val !== null) {
          const str = String(val);
          if (document.documentElement.getAttribute(name) !== str) {
            document.documentElement.setAttribute(name, str);
          }
        }
      };

      setAttrIfChanged('data-theme', merged.colorScheme);
      setAttrIfChanged('data-text-size', merged.textSize);
      setAttrIfChanged('data-aperture-height', merged.activeApertureHeight);
      setAttrIfChanged('data-page-mode', merged.pageMode);
      setAttrIfChanged('data-page-size', merged.pageSize);
      setAttrIfChanged('data-show-stats', merged.showStats);
      setAttrIfChanged('data-double-space', merged.doubleSpaceLinebreaks);
      setAttrIfChanged('data-allow-strikeout', merged.allowStrikeout);
      setAttrIfChanged('data-keep-screen-awake', merged.keepScreenAwake);
      setAttrIfChanged('data-show-clock', merged.showClock);
      setAttrIfChanged('data-clock-format', merged.clockFormat);
      setAttrIfChanged('data-phosphor', merged.phosphorColor);
      setAttrIfChanged('data-updated-at', merged._updatedAt);
    }
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}
