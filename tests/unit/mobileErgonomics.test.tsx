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

  it('HistoricalLine applies horizontal scaleX when cells exceed activeColumnLimit (e.g. 70 chars in 35 col mode)', async () => {
    const line70 = makeLine(70);
    const root = createRoot(container);
    await act(async () => {
      root.render(<HistoricalLine line={line70} lineIndex={0} activeColumnLimit={35} />);
    });

    const lineDiv = container.querySelector('[data-line-index="0"]');
    expect(lineDiv).not.toBeNull();
    const style = lineDiv?.getAttribute('style');
    expect(style).toContain('scaleX(0.5)');
    expect(style).toContain('left center');
  });

  it('HistoricalLine does not scale when cell count is within activeColumnLimit', async () => {
    const line30 = makeLine(30);
    const root = createRoot(container);
    await act(async () => {
      root.render(<HistoricalLine line={line30} lineIndex={0} activeColumnLimit={35} />);
    });

    const lineDiv = container.querySelector('[data-line-index="0"]');
    expect(lineDiv).not.toBeNull();
    const style = lineDiv?.getAttribute('style');
    expect(style || '').not.toContain('scaleX');
  });

  it('ActiveLine applies horizontal scaleX when active line length exceeds activeColumnLimit', async () => {
    const line50 = makeLine(50);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ActiveLine
          line={line50}
          lineIndex={0}
          activeColIndex={50}
          isLocked={false}
          isHighlighting={false}
          activeColumnLimit={35}
        />
      );
    });

    const lineDiv = container.querySelector('[data-line-index="0"]');
    expect(lineDiv).not.toBeNull();
    const style = lineDiv?.getAttribute('style');
    expect(style).toContain('scaleX(');
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
