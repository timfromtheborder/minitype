import React from 'react';

interface PaperTrayStackProps {
  count: number;
}

/**
 * Visual wireframe isometric paper stack:
 * An outline with light lineweight, no fill, squished into a parallelogram
 * representing sheets of paper sitting in an outbox/tray from an angle.
 * As pages accumulate, they stack upward with increasingly compressed spacing.
 */
export const PaperTrayStack: React.FC<PaperTrayStackProps> = ({ count }) => {
  // Base parallelogram coordinates representing one sheet in isometric perspective
  // Width: 88, Height: 38, Slant dx: 16
  const p0 = '24,6';
  const p1 = '112,6';
  const p2 = '96,44';
  const p3 = '8,44';
  const basePoints = `${p0} ${p1} ${p2} ${p3}`;

  // Limit rendering up to 24 sheets visually so it doesn't clip
  const visibleSheets = Math.min(count, 24);

  // Spacing between pages is uniform across all sheets in the stack,
  // but dynamically compresses as more pages appear (e.g. 5px down to 0.9px).
  const step = visibleSheets <= 1 ? 4 : Math.max(0.9, Math.min(5, 20 / (visibleSheets - 1)));
  const sheets: number[] = [];
  for (let i = 0; i < visibleSheets; i++) {
    sheets.push(i * step + 2);
  }

  return (
    <div className="flex flex-col items-center select-none group cursor-default">
      <svg
        width="110"
        height="56"
        viewBox="0 -22 120 72"
        className="text-foreground transition-all duration-300"
        style={{ overflow: 'visible' }}
      >
        {/* Base Wireframe Tray (Empty outline with light lineweight) */}
        <polygon
          points={basePoints}
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray={count === 0 ? '3 3' : undefined}
          className="opacity-25 transition-opacity"
        />

        {/* Stacked Paper Sheets (Opaque background fill, identical spacing, dynamically compressed) */}
        {sheets.map((offset, idx) => {
          const isTop = idx === sheets.length - 1;
          return (
            <polygon
              key={idx}
              points={basePoints}
              transform={`translate(0, ${-offset})`}
              fill="var(--background)"
              stroke="currentColor"
              strokeWidth="1"
              className={`transition-all duration-200 ${
                isTop
                  ? 'opacity-90'
                  : 'opacity-50'
              }`}
            />
          );
        })}
      </svg>
    </div>
  );
};
