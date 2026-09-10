import React from 'react';
import { Files } from 'lucide-react';

interface OutboxCounterProps {
  count: number;
}

export const OutboxCounter: React.FC<OutboxCounterProps> = ({ count }) => {
  return (
    <div className="flex flex-col items-center select-none">
      <div className="flex items-center gap-2 px-4 py-1.5 rounded-full border border-border/60 bg-muted/40 text-xs font-mono text-muted-foreground uppercase tracking-widest transition-all">
        <Files className="w-3.5 h-3.5 opacity-70" />
        <span>Outbox:</span>
        <span className="font-semibold text-foreground">{count}</span>
        <span className="text-[10px] lowercase opacity-60">
          {count === 1 ? 'sheet' : 'sheets'}
        </span>
      </div>
    </div>
  );
};
