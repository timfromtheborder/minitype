'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useTypingStore } from '@/stores/typingStore';
import { ProjectFilesTab } from './ProjectFilesTab';
import { CornerUpLeft, FolderOpen } from 'lucide-react';

export interface ProjectFilesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ProjectFilesModalComponent: React.FC<ProjectFilesModalProps> = ({
  isOpen,
  onClose,
}) => {
  const storeManifest = useTypingStore((state) => state.manifest);
  const storeTitle = useTypingStore((state) => state.manifest.title);
  const [title, setTitle] = useState<string>(storeManifest.title || 'Untitled Project');
  const modalRef = useRef<HTMLDivElement>(null);
  const prevDocIdRef = useRef<string | null>(null);
  const prevIsOpenRef = useRef<boolean>(false);

  // Sync title from store if project changes or is renamed externally
  useEffect(() => {
    if (storeTitle !== undefined && storeTitle !== title) {
      setTitle(storeTitle);
    }
  }, [storeTitle]);

  useEffect(() => {
    if (isOpen) {
      if (!prevIsOpenRef.current || prevDocIdRef.current !== storeManifest.id) {
        setTitle(storeManifest.title || 'Untitled Project');
        prevDocIdRef.current = storeManifest.id;
      }
      prevIsOpenRef.current = true;
    } else {
      prevIsOpenRef.current = false;
    }
  }, [isOpen, storeManifest.id, storeManifest.title]);

  // Focus trapping and Escape key listener
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      modalRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        const focusables = modalRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables || focusables.length === 0) return;
        const firstEl = focusables[0];
        const lastEl = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstEl || document.activeElement === modalRef.current) {
            e.preventDefault();
            lastEl.focus();
          }
        } else {
          if (document.activeElement === lastEl) {
            e.preventDefault();
            firstEl.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Project Files"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(3.5rem,56px)] px-2 sm:p-4 sm:pb-16 animate-in fade-in duration-75"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="w-full max-w-3xl h-[calc(100dvh-max(5.5rem,72px)-env(safe-area-inset-top))] max-h-[calc(100dvh-max(5.5rem,72px)-env(safe-area-inset-top))] landscape:h-[calc(100dvh-max(4.5rem,68px))] landscape:max-h-[calc(100dvh-max(4.5rem,68px))] sm:h-[560px] sm:max-h-[calc(100dvh-max(5.5rem,72px))] my-auto rounded-[2px] border border-border bg-background text-foreground shadow-2xl flex flex-col p-3 sm:p-5 gap-2.5 sm:gap-3 select-none relative overflow-hidden focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: Projects / [Document Title] + Return button */}
        <div className="flex items-center justify-between border-b border-border/60 pb-2 sm:pb-3 gap-2 shrink-0">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-xs font-sans font-bold tracking-widest uppercase text-muted-foreground shrink-0">
              Projects
            </span>
            <span className="text-muted-foreground/40 font-sans text-xs shrink-0">/</span>
            <input
              type="text"
              data-modal-input="true"
              value={title}
              onChange={(e) => {
                const val = e.target.value;
                setTitle(val);
                useTypingStore.getState().setManifest({ title: val });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  window.getSelection()?.removeAllRanges();
                }
              }}
              placeholder="Untitled Project"
              onBlur={() => {
                if (!title.trim()) {
                  const fallback = 'Untitled Project';
                  setTitle(fallback);
                  useTypingStore.getState().setManifest({ title: fallback });
                }
              }}
              className="bg-transparent text-sm font-sans font-semibold tracking-wide text-foreground border-b border-dashed border-border/80 hover:border-foreground focus:border-foreground focus:outline-none px-1 py-0.5 w-full max-w-[240px] sm:max-w-[340px] truncate transition-colors cursor-text"
              title="Click to edit project title"
            />
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1 px-2 py-1 rounded-[2px] text-muted-foreground hover:text-foreground hover:bg-muted border border-border/60 transition-colors cursor-pointer touch-manipulation text-xs"
            title="Return to writing in aperture"
          >
            <CornerUpLeft className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline font-sans text-xs font-semibold">Return</span>
          </button>
        </div>

        {/* Project Files Body */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <ProjectFilesTab
            activeManuscriptId={storeManifest.id}
            onCloseModal={onClose}
            isActiveTab={isOpen}
          />
        </div>
      </div>
    </div>
  );
};

export const ProjectFilesModal = React.memo(ProjectFilesModalComponent);
