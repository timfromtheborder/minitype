import React, { useEffect, useState, useRef } from 'react';
import { ManuscriptManifest } from '@/types';
import { getAllManuscripts, loadManuscriptProject } from '@/db';
import { useTypingStore } from '@/stores/typingStore';
import { sanitizeManuscript } from '@/lib/sanitize';
import { serializeProjectFile } from '@/lib/projectSerializer';
import {
  FolderOpen,
  Plus,
  Upload,
  Trash2,
  Download,
  Check,
  FileText,
  Loader2,
  Edit2,
  ArrowUpDown,
  ArrowDown,
  ArrowUp,
} from 'lucide-react';

interface ProjectFilesTabProps {
  activeManuscriptId: string;
  onCloseModal: () => void;
}

type SortField = 'modified' | 'created' | 'name';
type SortDirection = 'asc' | 'desc';

export const ProjectFilesTab: React.FC<ProjectFilesTabProps> = ({
  activeManuscriptId,
  onCloseModal: _onCloseModal,
}) => {
  const [files, setFiles] = useState<ManuscriptManifest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('modified');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastTapRef = useRef<{ id: string; time: number }>({ id: '', time: 0 });

  const refreshFiles = async () => {
    try {
      setLoading(true);
      const list = await getAllManuscripts();
      setFiles(list);
    } catch (e) {
      console.error('Failed to load projects list:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshFiles();
  }, [activeManuscriptId]);

  const handleNewFile = async () => {
    await useTypingStore.getState().newProject();
    await refreshFiles();
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const fileName = file.name;
      await useTypingStore.getState().importTextFileAsProject(fileName, text);
      await refreshFiles();
    } catch (err) {
      console.error('Failed to import project file:', err);
    } finally {
      e.target.value = '';
    }
  };

  const handleOpenProject = async (id: string) => {
    if (id !== activeManuscriptId) {
      await useTypingStore.getState().loadProject(id);
    }
    await refreshFiles();
  };

  const handleDeleteProject = async (id: string) => {
    await useTypingStore.getState().deleteProject(id);
    setDeletingId(null);
    await refreshFiles();
  };

  const handleStartRename = (file: ManuscriptManifest) => {
    setEditingId(file.id);
    setEditingTitle(file.title || 'Untitled Manuscript');
  };

  const handleCommitRename = async (id: string) => {
    if (!editingId) return;
    const finalTitle = editingTitle.trim() || 'Untitled Manuscript';
    await useTypingStore.getState().renameProject(id, finalTitle);
    setEditingId(null);
    await refreshFiles();
  };

  const handleTouchEnd = (fileId: string) => {
    if (editingId === fileId) return;
    const now = Date.now();
    if (lastTapRef.current.id === fileId && now - lastTapRef.current.time < 350) {
      handleOpenProject(fileId);
      lastTapRef.current = { id: '', time: 0 };
    } else {
      lastTapRef.current = { id: fileId, time: now };
    }
  };

  const handleDownloadProject = async (m: ManuscriptManifest) => {
    try {
      const data = await loadManuscriptProject(m.id);
      if (!data) return;

      let content = '';
      if (data.sessions && data.sessions.length > 1) {
        content = serializeProjectFile(data.sessions);
      } else {
        content = sanitizeManuscript(data.pages, {
          doubleSpaceLinebreaks: m.doubleSpaceLinebreaks,
          pageMode: m.pageMode,
        });
      }

      const safeTitle = (m.title.trim() || 'manuscript').replace(/[/\\?%*:|"<>]/g, '-');
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeTitle}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download project:', err);
    }
  };

  const formatDate = (isoStr?: string) => {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection(field === 'name' ? 'asc' : 'desc');
    }
  };

  const sortedFiles = [...files].sort((a, b) => {
    if (sortField === 'name') {
      const nameA = (a.title || 'Untitled Manuscript').toLowerCase();
      const nameB = (b.title || 'Untitled Manuscript').toLowerCase();
      return sortDirection === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
    }
    if (sortField === 'created') {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return sortDirection === 'asc' ? timeA - timeB : timeB - timeA;
    }
    // 'modified'
    const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return sortDirection === 'asc' ? timeA - timeB : timeB - timeA;
  });

  return (
    <div className="flex flex-col w-full h-full min-h-0 gap-2.5 sm:gap-3 font-sans">
      {/* Hidden file picker */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.md,text/plain"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 shrink-0 pb-2 border-b border-border/60">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Projects ({files.length})
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleImportClick}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-[2px] border border-border/80 bg-muted/40 hover:bg-muted text-foreground transition-colors cursor-pointer"
            title="Import .txt or .md from computer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import</span>
          </button>
          <button
            type="button"
            onClick={handleNewFile}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-[2px] border border-primary bg-primary text-primary-foreground font-semibold shadow-xs hover:opacity-90 transition-opacity cursor-pointer"
            title="Create a new project"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Project</span>
          </button>
        </div>
      </div>

      {/* Sorting Controls Bar */}
      <div className="flex items-center justify-between gap-2 shrink-0 px-1 py-1 text-[11px] bg-muted/20 border border-border/40 rounded-[2px]">
        <div className="flex items-center gap-1 text-muted-foreground">
          <ArrowUpDown className="w-3 h-3 opacity-70" />
          <span className="uppercase tracking-wider font-semibold text-[10px]">Sort:</span>
        </div>
        <div className="flex items-center gap-1">
          {(['modified', 'created', 'name'] as SortField[]).map((field) => {
            const isSelected = sortField === field;
            return (
              <button
                key={field}
                type="button"
                onClick={() => toggleSort(field)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-[2px] border transition-colors cursor-pointer capitalize ${
                  isSelected
                    ? 'border-primary bg-primary/15 text-primary font-bold shadow-xs'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40'
                }`}
              >
                <span>{field}</span>
                {isSelected && (
                  sortDirection === 'asc' ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Files List View */}
      <div className="flex-1 min-h-0 overflow-y-auto square-scrollbar border border-border/80 bg-background text-foreground">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-xs gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Loading filesystem...</span>
          </div>
        ) : sortedFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 p-4 text-center gap-2 text-muted-foreground">
            <FileText className="w-8 h-8 opacity-40" />
            <p className="text-xs font-medium">No saved projects found in local storage.</p>
            <p className="text-[11px] opacity-70">
              Create a new project or import a text file to get started.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {sortedFiles.map((file) => {
              const isActive = file.id === activeManuscriptId;
              const isConfirmingDelete = deletingId === file.id;
              const isEditing = editingId === file.id;

              return (
                <div
                  key={file.id}
                  onDoubleClick={() => handleOpenProject(file.id)}
                  onTouchEnd={() => handleTouchEnd(file.id)}
                  className={`flex items-center justify-between p-2.5 sm:p-3 gap-2 sm:gap-3 transition-all select-none ${
                    isActive
                      ? 'border-l-4 border-l-primary bg-primary/15 shadow-xs'
                      : 'hover:bg-muted/30 border-l-4 border-l-transparent'
                  }`}
                >
                  {/* File Info */}
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <FileText className={`w-4 h-4 shrink-0 ${isActive ? 'text-primary font-bold' : 'text-muted-foreground'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <input
                            type="text"
                            autoFocus
                            data-modal-input="true"
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onBlur={() => handleCommitRename(file.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleCommitRename(file.id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="font-mono text-xs sm:text-sm font-semibold text-foreground bg-muted/60 border border-primary px-1.5 py-0.5 rounded-[2px] w-full max-w-[240px] focus:outline-none"
                          />
                        ) : (
                          <div className="flex items-center gap-1.5 min-w-0 group/title">
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartRename(file);
                              }}
                              className={`font-mono text-xs sm:text-sm truncate text-foreground hover:underline cursor-text ${
                                isActive ? 'font-bold' : 'font-semibold'
                              }`}
                              title="Click to rename"
                            >
                              {file.title || 'Untitled Project'}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartRename(file);
                              }}
                              className="opacity-0 group-hover/title:opacity-100 p-0.5 text-muted-foreground hover:text-foreground transition-opacity cursor-pointer"
                              title="Rename project"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        {isActive && (
                          <span className="shrink-0 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-primary text-primary-foreground shadow-xs rounded-[2px]">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2.5 text-[10px] text-muted-foreground truncate mt-0.5">
                        <span>{formatDate(file.updatedAt || file.createdAt)}</span>
                        <span>•</span>
                        <span>
                          {file.sessionCount || 1} {(file.sessionCount || 1) === 1 ? 'session' : 'sessions'}
                        </span>
                        {file.totalWordCount !== undefined && file.totalWordCount > 0 && (
                          <>
                            <span>•</span>
                            <span>{file.totalWordCount.toLocaleString()} words</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {/* Open Button */}
                    {!isActive ? (
                      <button
                        type="button"
                        onClick={() => handleOpenProject(file.id)}
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded-[2px] border border-border/80 bg-muted/30 hover:bg-muted text-foreground transition-colors cursor-pointer"
                        title="Open this project"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Open</span>
                      </button>
                    ) : (
                      <span
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded-[2px] border border-primary/50 bg-primary/20 text-primary font-bold shadow-xs select-none"
                        title="Currently active project"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Active</span>
                      </span>
                    )}

                    {/* Download Button */}
                    <button
                      type="button"
                      onClick={() => handleDownloadProject(file)}
                      className="p-1 rounded-[2px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                      title="Download project text"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>

                    {/* Delete with Confirmation */}
                    {isConfirmingDelete ? (
                      <div className="flex items-center gap-1 bg-destructive/10 p-0.5 border border-destructive/30 rounded-[2px]">
                        <button
                          type="button"
                          onClick={() => handleDeleteProject(file.id)}
                          className="px-2 py-0.5 text-xs rounded-[2px] border border-destructive bg-destructive text-destructive-foreground font-bold hover:opacity-90 cursor-pointer"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingId(null)}
                          className="px-1.5 py-0.5 text-xs rounded-[2px] text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeletingId(file.id)}
                        className="p-1 rounded-[2px] text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                        title="Delete project"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
