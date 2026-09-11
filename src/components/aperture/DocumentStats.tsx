import React, { useMemo } from 'react';
import { useTypingStore } from '@/stores/typingStore';

export const DocumentStats: React.FC = React.memo(function DocumentStats() {
  const showStats = useTypingStore((state) => state.manifest.showStats ?? true);
  const pageMode = useTypingStore((state) => state.manifest.pageMode);
  const pageSize = useTypingStore((state) => state.manifest.pageSize);
  const activeLineIndex = useTypingStore((state) => state.activeLineIndex);
  const activeColumnLimit = useTypingStore((state) => state.activeColumnLimit);
  const currentPageLines = useTypingStore((state) => state.currentPageLines);
  const title = useTypingStore((state) => state.manifest.title || 'Untitled Project');

  const isPortrait = (activeColumnLimit ?? 70) === 35;
  const boxWidthClass = isPortrait
    ? 'w-[calc(36ch+1.5rem)] max-w-[calc(100vw-2rem)]'
    : 'w-[calc(71ch+4rem)] max-w-[calc(100vw-2.5rem)]';

  const lineStatText =
    pageMode === 'scroll'
      ? `line: ${activeLineIndex + 1}`
      : pageMode === 'notecard'
      ? `line: ${activeLineIndex + 1}/10`
      : pageMode === 'paragraph'
      ? `line: ${activeLineIndex + 1}`
      : `line: ${activeLineIndex + 1}/${pageSize || 54}`;

  // Zero-allocation character and word count calculation
  const { totalCharsOnPage, wordCount } = useMemo(() => {
    let totalChars = 0;
    let blankSpaces = 0;

    for (let i = 0; i < currentPageLines.length; i++) {
      const cells = currentPageLines[i].cells;
      for (let j = 0; j < cells.length; j++) {
        const c = cells[j];
        if (c.state !== 'struck' && !c.isSoftPadding) {
          totalChars++;
          if (c.char === ' ') {
            blankSpaces++;
          }
        }
      }
    }

    const nonSpaceChars = totalChars - blankSpaces;
    const words = Math.max(0, Math.round(nonSpaceChars / 5));

    return {
      totalCharsOnPage: totalChars,
      wordCount: words,
    };
  }, [currentPageLines]);

  if (showStats === false) return null;

  return (
    <div
      className={`flex items-center justify-center text-center ${boxWidthClass} px-3 sm:px-8 mt-1.5 text-muted-foreground text-xs font-mono pointer-events-none select-none`}
    >
      <div className="flex items-center justify-center gap-1.5 sm:gap-2 flex-wrap">
        <span>{lineStatText}</span>
        <span>-</span>
        <span className="text-foreground/90 font-medium">{wordCount} words</span>
        <span>-</span>
        <span>{totalCharsOnPage} chars</span>
        <span>-</span>
        <span className="truncate max-w-[200px] sm:max-w-[300px]">{title.toLowerCase()}</span>
      </div>
    </div>
  );
});
