import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { HistoricalLine } from '@/components/aperture/HistoricalLine';
import { ActiveLine } from '@/components/aperture/ActiveLine';
import { ApertureFrame } from '@/components/aperture/ApertureFrame';
import { useWakeLock } from '@/hooks/useWakeLock';
import { LineRecord, CharacterCell } from '@/types';

function makeLine(cellCount: number): LineRecord {
  const cells: CharacterCell[] = Array.from({ length: cellCount }, (_, i) => ({
    id: `c-${i}`,
    char: 'a',
    state: 'standard',
    colIndex: i,
    lineIndex: 0,
  }));
  return {
    id: 'test-line',
    lineIndex: 0,
    cells,
    isCommitted: true,
  };
}

function WakeLockTestComponent({ policy }: { policy?: any }) {
  useWakeLock(policy);
  return <div data-testid="wakelock-host" />;
}

describe('Mobile Ergonomics & Orientation Clamping', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('ApertureFrame renders sr-only live region for accessibility status updates', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<ApertureFrame height={1} isPaused={false} />);
    });

    const liveRegion = container.querySelector('[role="status"]');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion?.getAttribute('aria-live')).toBe('polite');
    expect(liveRegion?.className).toContain('sr-only');
    expect(liveRegion?.textContent).toContain('Line');
    expect(liveRegion?.textContent).toContain('Column');
  });
});

describe('useWakeLock Hook', () => {
  let mockRequest: any;
  let mockSentinel: any;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    mockSentinel = {
      released: false,
      release: vi.fn().mockImplementation(() => {
        mockSentinel.released = true;
        return Promise.resolve();
      }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    mockRequest = vi.fn().mockResolvedValue(mockSentinel);

    Object.defineProperty(navigator, 'wakeLock', {
      value: { request: mockRequest },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.restoreAllMocks();
  });

  it('requests screen wake lock when policy is "always"', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<WakeLockTestComponent policy="always" />);
    });
    expect(mockRequest).toHaveBeenCalledWith('screen');
  });

  it('does not request wake lock when policy is "off"', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<WakeLockTestComponent policy="off" />);
    });
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('handles unsupported wake lock gracefully without errors', async () => {
    Object.defineProperty(navigator, 'wakeLock', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const root = createRoot(container);
    await expect(
      act(async () => {
        root.render(<WakeLockTestComponent policy="always" />);
      })
    ).resolves.not.toThrow();
  });
});
