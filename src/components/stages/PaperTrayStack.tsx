import React from 'react';

interface PaperTrayStackProps {
  count: number;
}

/**
 * Visual wireframe isometric notecard outbox tray:
 * Five horizontal spaces distributed across the top of the platen.
 * Scales with text/platen font-size scale (em).
 * Space 0 starts with a dotted outline; each space fills with up to 10 notecards.
 * When a space fills, the next space unlocks with a dotted outline.
 * When all 5 spaces reach capacity (50 cards total), all cards are cleared.
 */
export const PaperTrayStack: React.FC<PaperTrayStackProps> = ({ count }) => {
  const effectiveCount = count % 50;

  // Base parallelogram coordinates representing one notecard in isometric perspective
  // Width: 44, Height: 18, Slant: 8
  const basePoints = '12,4 56,4 48,22 4,22';

  return (
    <div className="w-full grid grid-cols-5 gap-1.5 sm:gap-3 items-end justify-items-center select-none pointer-events-none">
      {Array.from({ length: 5 }).map((_, spaceIdx) => {
        const isUnlocked = spaceIdx === 0 || effectiveCount >= spaceIdx * 10;
        const cardsInSpace = isUnlocked
          ? Math.min(10, Math.max(0, effectiveCount - spaceIdx * 10))
          : 0;

        return (
          <div
            key={spaceIdx}
            className={`w-full flex justify-center transition-opacity duration-200 ${
              isUnlocked ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <svg
              viewBox="0 -10 60 25"
              className="text-foreground transition-all duration-200"
              style={{
                width: '100%',
                maxWidth: '4.2em',
                height: '1.6em',
                overflow: 'visible',
              }}
            >
              {/* Base Wireframe Tray (Empty dotted outline if 0 cards, solid if filled) */}
              <polygon
                points={basePoints}
                fill="none"
                stroke="currentColor"
                strokeWidth="0.8"
                strokeDasharray={cardsInSpace === 0 ? '2 2' : undefined}
                className={cardsInSpace === 0 ? 'opacity-35' : 'opacity-20'}
              />

              {/* Stacked Paper Notecards (Opaque background fill, upward offset) */}
              {Array.from({ length: cardsInSpace }).map((_, cardIdx) => {
                const isTop = cardIdx === cardsInSpace - 1;
                return (
                  <polygon
                    key={cardIdx}
                    points={basePoints}
                    transform={`translate(0, ${-cardIdx * 1.0})`}
                    fill="var(--background)"
                    stroke="currentColor"
                    strokeWidth="0.75"
                    className={`transition-all duration-150 ${
                      isTop ? 'opacity-90' : 'opacity-40'
                    }`}
                  />
                );
              })}
            </svg>
          </div>
        );
      })}
    </div>
  );
};
