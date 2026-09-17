import { describe, it, expect, beforeEach } from 'vitest';
import { persistSettings, readSynchronousSettings, SETTINGS_KEY } from '@/stores/settingsPersistence';
import { ManuscriptManifest, PhosphorColor, ClockFormat } from '@/types';

describe('Phosphor & Chrono 4-Tier Persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-phosphor');
    document.documentElement.removeAttribute('data-show-clock');
    document.documentElement.removeAttribute('data-clock-format');
  });

  it('persists and restores phosphorColor, showClock, and clockFormat across storage layers', () => {
    const patch: Partial<ManuscriptManifest> = {
      colorScheme: 'dark-amber',
      phosphorColor: 'green',
      showClock: true,
      clockFormat: '24h',
    };

    persistSettings(patch);

    // Verify localStorage payload
    const storedRaw = localStorage.getItem(SETTINGS_KEY);
    expect(storedRaw).not.toBeNull();
    const parsed = JSON.parse(storedRaw!);
    expect(parsed.phosphorColor).toBe('green');
    expect(parsed.showClock).toBe(true);
    expect(parsed.clockFormat).toBe('24h');

    // Verify DOM attributes
    expect(document.documentElement.getAttribute('data-phosphor')).toBe('green');
    expect(document.documentElement.getAttribute('data-show-clock')).toBe('true');
    expect(document.documentElement.getAttribute('data-clock-format')).toBe('24h');

    // Verify restoration via readSynchronousSettings
    const restored = readSynchronousSettings();
    expect(restored).not.toBeNull();
    expect(restored?.phosphorColor).toBe('green');
    expect(restored?.showClock).toBe(true);
    expect(restored?.clockFormat).toBe('24h');
  });

  it('handles all 4 phosphor color swatches (amber, green, blue, red)', () => {
    const colors: PhosphorColor[] = ['amber', 'green', 'blue', 'red'];

    for (const color of colors) {
      persistSettings({ phosphorColor: color });
      expect(document.documentElement.getAttribute('data-phosphor')).toBe(color);
      expect(readSynchronousSettings()?.phosphorColor).toBe(color);
    }
  });

  it('handles clock format toggling between 12h and 24h', () => {
    const formats: ClockFormat[] = ['12h', '24h'];

    for (const fmt of formats) {
      persistSettings({ clockFormat: fmt });
      expect(document.documentElement.getAttribute('data-clock-format')).toBe(fmt);
      expect(readSynchronousSettings()?.clockFormat).toBe(fmt);
    }
  });
});
