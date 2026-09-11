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

  // Render up to 80 sheets visually
  const visibleSheets = Math.min(count, 80);

  // Spacing between pages dynamically fills vertical space (~65px) before compressing
  const step = visibleSheets <= 1 ? 4.5 : Math.max(0.7, Math.min(4.5, 65 / (visibleSheets - 1)));
  const sheets: number[] = [];
  for (let i = 0; i < visibleSheets; i++) {
    sheets.push(i * step + 2);
  }

  return (
    <div className="flex flex-col items-center select-none group cursor-default">
      <svg
        width="110"
        height="100"
        viewBox="0 -72 120 120"
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
