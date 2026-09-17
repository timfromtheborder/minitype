import { describe, it, expect, beforeEach } from 'vitest';
import { persistSettings, readSynchronousSettings, SETTINGS_KEY } from '@/stores/settingsPersistence';
import { ManuscriptManifest, PhosphorColor } from '@/types';

describe('Phosphor & Chrono 4-Tier Persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-phosphor');
    document.documentElement.removeAttribute('data-show-clock');
  });

  it('persists and restores phosphorColor and showClock across storage layers', () => {
    const patch: Partial<ManuscriptManifest> = {
      colorScheme: 'dark-amber',
      phosphorColor: 'green',
      showClock: true,
    };

    persistSettings(patch);

    // Verify localStorage payload
    const storedRaw = localStorage.getItem(SETTINGS_KEY);
    expect(storedRaw).not.toBeNull();
    const parsed = JSON.parse(storedRaw!);
    expect(parsed.phosphorColor).toBe('green');
    expect(parsed.showClock).toBe(true);

    // Verify DOM attributes
    expect(document.documentElement.getAttribute('data-phosphor')).toBe('green');
    expect(document.documentElement.getAttribute('data-show-clock')).toBe('true');

    // Verify restoration via readSynchronousSettings
    const restored = readSynchronousSettings();
    expect(restored).not.toBeNull();
    expect(restored?.phosphorColor).toBe('green');
    expect(restored?.showClock).toBe(true);
  });

  it('handles all 4 phosphor color swatches (amber, green, blue, red)', () => {
    const colors: PhosphorColor[] = ['amber', 'green', 'blue', 'red'];

    for (const color of colors) {
      persistSettings({ phosphorColor: color });
      expect(document.documentElement.getAttribute('data-phosphor')).toBe(color);
      expect(readSynchronousSettings()?.phosphorColor).toBe(color);
    }
  });

  it('matches strikeout line color to theme color in all four Terminal themes', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const css = fs.readFileSync(path.resolve(process.cwd(), 'src/app/globals.css'), 'utf-8');

    // Amber
    expect(css).toMatch(/\[data-theme="dark-amber"\],[\s\S]*?--struck-color:\s*#FFB000;/);
    // Green
    expect(css).toMatch(/\[data-phosphor="green"\]\s*\{[\s\S]*?--struck-color:\s*#33FF33;/);
    // Blue
    expect(css).toMatch(/\[data-phosphor="blue"\]\s*\{[\s\S]*?--struck-color:\s*#00E5FF;/);
    // Red
    expect(css).toMatch(/\[data-phosphor="red"\]\s*\{[\s\S]*?--struck-color:\s*#ff1a0d;/);
  });
});
