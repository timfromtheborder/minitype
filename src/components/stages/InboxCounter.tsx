import React from 'react';
import { PlusCircle, AlertCircle } from 'lucide-react';

interface InboxCounterProps {
  count: number;
  isLocked: boolean;
  onFeedPaper: () => void;
}

export const InboxCounter: React.FC<InboxCounterProps> = ({
  count,
  isLocked,
  onFeedPaper,
}) => {
  return (
    <div className="flex flex-col items-center gap-1.5 select-none">
      <button
        type="button"
        onClick={onFeedPaper}
        className={`group flex items-center gap-2 px-4 py-1.5 rounded-full border text-xs font-mono transition-all duration-150 cursor-pointer shadow-xs active:scale-95 ${
          isLocked
            ? 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400 animate-bounce'
            : 'border-border/60 bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground'
        }`}
      >
        {isLocked ? (
          <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
        ) : (
          <PlusCircle className="w-3.5 h-3.5 opacity-70 group-hover:rotate-90 transition-transform duration-200" />
        )}
        <span className="uppercase tracking-widest">Inbox:</span>
        <span className="font-semibold text-foreground">{count}</span>
        <span className="text-[10px] lowercase opacity-60">
          {count === 1 ? 'sheet' : 'sheets'}
        </span>
      </button>

      <span
        className={`text-[11px] font-mono tracking-tight transition-colors ${
          isLocked
            ? 'text-amber-600 dark:text-amber-400 font-medium'
            : 'text-muted-foreground/60'
        }`}
      >
        {isLocked
          ? '⚠ Feed paper: Click Inbox to load sheet'
          : '+ Click to feed sheet'}
      </span>
    </div>
  );
};
