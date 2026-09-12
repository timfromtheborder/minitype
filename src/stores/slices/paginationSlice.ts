import { StateCreator } from 'zustand';
import { TypingStore } from '../types';
import {
  ApertureHeight,
  PageSize,
  PageMode,
  TextSize,
  LineRecord,
  PageRecord,
} from '@/types';
import { saveManuscript, savePage, flushPendingSave } from '@/db';
import { createEmptyLine, applyPageModeTransition } from '@/lib/paginationTransition';
import { persistSettings } from '../settingsPersistence';
import { typewriterAudio } from '@/lib/sound';
import { triggerVisualSaveOnTyping, markProjectDirty } from './persistenceSlice';
import { ensureActiveSessionOnTyping } from './projectSlice';

export interface PaginationSlice {
  currentPageNumber: number;
  historicalPages: PageRecord[];
  currentPageLines: LineRecord[];
  sessionCommittedLines: number;
  setApertureHeight: (height: ApertureHeight) => void;
  setPageSize: (pageSize: PageSize) => void;
  setPageMode: (pageMode: PageMode) => void;
  setTextSize: (textSize: TextSize) => void;
  toggleStats: (show?: boolean) => void;
  toggleDoubleSpaceLinebreaks: (enabled?: boolean) => void;
  startNewNotecard: () => void;
}

export const createPaginationSlice: StateCreator<
  TypingStore,
  [],
  [],
  PaginationSlice
> = (set, get) => ({
  currentPageNumber: 1,
  historicalPages: [],
  currentPageLines: [createEmptyLine(1, 0)],
  sessionCommittedLines: 0,

  setApertureHeight: (height: ApertureHeight) => {
    set((state) => {
      // In notecard mode, aperture height is strictly locked to 10
      const finalHeight = state.manifest.pageMode === 'notecard' ? 10 : height;

      // PRD 8.2: Any runtime modification to aperture height cancels active highlights
      let lines = state.currentPageLines;
      if (state.isHighlighting) {
        lines = lines.map((line) => ({
          ...line,
          cells: line.cells.map((cell) =>
            cell.state === 'highlighted' ? { ...cell, state: 'standard' as const } : cell
          ),
        }));
      }

      const updatedManifest = {
        ...state.manifest,
        activeApertureHeight: finalHeight,
        ...(state.manifest.pageMode !== 'notecard' ? { preferredApertureHeight: height } : {}),
      };
      persistSettings(updatedManifest);
      if (updatedManifest.mode === 'local') {
        saveManuscript(updatedManifest).catch(console.error);
      }

      return {
        manifest: updatedManifest,
        currentPageLines: lines,
        isHighlighting: false,
        highlightHead: null,
      };
    });
  },

  setPageSize: (pageSize: PageSize) => {
    set((state) => {
      const updated = { ...state.manifest, pageSize, pageMode: 'page' as const };
      persistSettings(updated);
      if (updated.mode === 'local') {
        saveManuscript(updated).catch(console.error);
      }
      return { manifest: updated };
    });
  },

  setPageMode: (pageMode: PageMode) => {
    set((state) => applyPageModeTransition(pageMode, state));
  },

  setTextSize: (textSize: TextSize) => {
    set((state) => {
      const updated = { ...state.manifest, textSize };
      persistSettings(updated);
      if (updated.mode === 'local') {
        saveManuscript(updated).catch(console.error);
      }
      return { manifest: updated };
    });
  },

  toggleStats: (show?: boolean) => {
    set((state) => {
      const showStats = show !== undefined ? show : !(state.manifest.showStats ?? true);
      const updatedManifest = { ...state.manifest, showStats };
      persistSettings(updatedManifest);
      if (updatedManifest.mode === 'local') {
        saveManuscript(updatedManifest).catch(console.error);
      }
      return { manifest: updatedManifest };
    });
  },

  toggleDoubleSpaceLinebreaks: (enabled?: boolean) => {
    set((state) => {
      const doubleSpaceLinebreaks = enabled !== undefined ? enabled : !(state.manifest.doubleSpaceLinebreaks ?? false);
      const updatedManifest = { ...state.manifest, doubleSpaceLinebreaks };
      persistSettings(updatedManifest);
      if (updatedManifest.mode === 'local') {
        saveManuscript(updatedManifest).catch(console.error);
      }
      return { manifest: updatedManifest };
    });
  },

  startNewNotecard: () => {
    const state = get();
    if (state.manifest.pageMode !== 'notecard') return;
    if (state.isLocked) return;

    triggerVisualSaveOnTyping(set, get);
    ensureActiveSessionOnTyping(set, get);
    markProjectDirty(set, get);
    flushPendingSave();

    typewriterAudio.playPaperFeed();

    const lines = [...state.currentPageLines];
    if (lines.length > 0 && state.activeLineIndex < lines.length) {
      let activeLine = lines[state.activeLineIndex];
      if (state.isHighlighting) {
        activeLine = {
          ...activeLine,
          cells: activeLine.cells.map((c) =>
            c.state === 'highlighted' ? { ...c, state: 'struck', isStruck: true } : c
          ),
        };
      }
      lines[state.activeLineIndex] = {
        ...activeLine,
        isCommitted: true,
        wrapType: 'hard',
      };
    }

    const completedPage: PageRecord = {
      id: `${state.manifest.id}-page-${state.currentPageNumber}`,
      manuscriptId: state.manifest.id,
      pageNumber: state.currentPageNumber,
      lines,
      completedAt: new Date().toISOString(),
    };

    const historical = [...state.historicalPages, completedPage];
    const newPageNum = state.currentPageNumber + 1;
    const firstLine = createEmptyLine(newPageNum, 0);

    if (state.manifest.mode === 'local') {
      savePage(completedPage).catch(console.error);
      savePage({
        id: `${state.manifest.id}-page-${newPageNum}`,
        manuscriptId: state.manifest.id,
        pageNumber: newPageNum,
        lines: [firstLine],
        completedAt: null,
      }).catch(console.error);
    }

    set({
      historicalPages: historical,
      currentPageNumber: newPageNum,
      currentPageLines: [firstLine],
      activeLineIndex: 0,
      activeColIndex: 0,
      isHighlighting: false,
      highlightHead: null,
    });
  },
});
