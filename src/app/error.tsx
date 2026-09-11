'use client';

import React, { useEffect } from 'react';
import { useTypingStore } from '@/stores/typingStore';
import { AlertCircle, RotateCcw, FolderPlus } from 'lucide-react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('Minitype runtime error captured by root boundary:', error);
  }, [error]);

  const handleNewProject = async () => {
    try {
      await useTypingStore.getState().newProject();
    } catch (e) {
      console.error('Failed to reset project:', e);
    }
    reset();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background text-foreground font-sans select-none">
      <div className="w-full max-w-md p-6 rounded-none border border-border bg-card text-card-foreground shadow-2xl flex flex-col gap-4">
        <div className="flex items-center gap-2 border-b border-border/60 pb-3 text-red-600 dark:text-red-400">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <h2 className="text-sm font-semibold tracking-wider uppercase font-sans">
            Mechanism Jammed
          </h2>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          An unexpected interruption occurred in the drafting engine. Your drafted progress has been saved in local storage.
        </p>

        {error?.message && (
          <div className="p-3 bg-muted/40 border border-border/60 font-mono text-[11px] text-muted-foreground break-words max-h-24 overflow-y-auto">
            {error.message}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40 text-xs">
          <button
            type="button"
            onClick={reset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-none border border-border/70 bg-muted/40 hover:bg-muted text-foreground transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Try Again</span>
          </button>

          <button
            type="button"
            onClick={handleNewProject}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-none border border-primary bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors cursor-pointer shadow-xs"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>Reset Engine</span>
          </button>
        </div>
      </div>
    </div>
  );
}
