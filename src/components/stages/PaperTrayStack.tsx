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

  // Limit rendering up to 20 sheets visually so it doesn't clip
  const visibleSheets = Math.min(count, 20);

  // Calculate cumulative compressed vertical offsets
  const sheets: number[] = [];
  let currentOffset = 0;
  for (let i = 0; i < visibleSheets; i++) {
    const gap = Math.max(1, 5.5 / (1 + 0.35 * i));
    currentOffset += gap;
    sheets.push(currentOffset);
  }

  return (
    <div className="flex flex-col items-center select-none group cursor-default" title={`${count} completed ${count === 1 ? 'page' : 'pages'}`}>
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

        {/* Stacked Paper Sheets (Outlines with compressed spacing) */}
        {sheets.map((offset, idx) => {
          const isTop = idx === sheets.length - 1;
          return (
            <polygon
              key={idx}
              points={basePoints}
              transform={`translate(0, ${-offset})`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              className={`transition-all duration-200 ${
                isTop
                  ? 'opacity-80'
                  : 'opacity-40'
              }`}
            />
          );
        })}
      </svg>

      <span className="text-[10px] font-mono tracking-widest uppercase text-muted-foreground/60 transition-colors group-hover:text-foreground">
        {count === 0 ? 'Outbox' : `${count} ${count === 1 ? 'Sheet' : 'Sheets'}`}
      </span>
    </div>
  );
};
