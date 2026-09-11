import React, { useEffect, useState, useRef } from 'react';
import { ManuscriptManifest } from '@/types';
import { getAllManuscripts, loadManuscriptProject } from '@/db';
import { useTypingStore } from '@/stores/typingStore';
import { sanitizeManuscript } from '@/lib/sanitize';
import { FolderOpen, Plus, Upload, Trash2, Download, Check, FileText, Loader2, Edit2 } from 'lucide-react';

interface ProjectFilesTabProps {
  activeManuscriptId: string;
  onCloseModal: () => void;
  onSelectDocumentTab: () => void;
}

export const ProjectFilesTab: React.FC<ProjectFilesTabProps> = ({
  activeManuscriptId,
  onCloseModal: _onCloseModal,
  onSelectDocumentTab,
}) => {
  const [files, setFiles] = useState<ManuscriptManifest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>('');
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
    onSelectDocumentTab();
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
      onSelectDocumentTab();
    } catch (err) {
      console.error('Failed to import file:', err);
    } finally {
      e.target.value = '';
    }
  };

  const handleOpenProject = async (id: string) => {
    if (id !== activeManuscriptId) {
      await useTypingStore.getState().loadProject(id);
    }
    onSelectDocumentTab();
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
      const clean = sanitizeManuscript(data.pages, {
        doubleSpaceLinebreaks: m.doubleSpaceLinebreaks,
      });
      const safeTitle = (m.title.trim() || 'manuscript').replace(/[/\\?%*:|"<>]/g, '-');
      const blob = new Blob([clean], { type: 'text/plain;charset=utf-8' });
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

  return (
    <div className="flex flex-col w-full h-full min-h-0 gap-3 font-sans">
      {/* Hidden file picker */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.md,text/plain"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Top Action Bar */}
      <div className="flex items-center justify-between gap-2 shrink-0 pb-2 border-b border-border/60">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Filesystem ({files.length})
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleImportClick}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-none border border-border/80 bg-muted/40 hover:bg-muted text-foreground transition-colors cursor-pointer"
            title="Import .txt or .md from computer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import</span>
          </button>
          <button
            type="button"
            onClick={handleNewFile}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-none border border-primary bg-primary text-primary-foreground font-semibold shadow-xs hover:opacity-90 transition-opacity cursor-pointer"
            title="Create a new document"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Document</span>
          </button>
        </div>
      </div>

      {/* Files List View */}
      <div className="flex-1 min-h-0 overflow-y-auto square-scrollbar border border-border/80 bg-card text-card-foreground">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-xs gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Loading filesystem...</span>
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 p-4 text-center gap-2 text-muted-foreground">
            <FileText className="w-8 h-8 opacity-40" />
            <p className="text-xs font-medium">No saved files found in local storage.</p>
            <p className="text-[11px] opacity-70">
              Create a new document or import a text file to get started.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {files.map((file) => {
              const isActive = file.id === activeManuscriptId;
              const isConfirmingDelete = deletingId === file.id;
              const isEditing = editingId === file.id;

              return (
                <div
                  key={file.id}
                  onDoubleClick={() => handleOpenProject(file.id)}
                  onTouchEnd={() => handleTouchEnd(file.id)}
                  className={`flex items-center justify-between p-2.5 sm:p-3 gap-2 sm:gap-3 transition-colors select-none ${
                    isActive ? 'bg-muted/40' : 'hover:bg-muted/20'
                  }`}
                >
                  {/* File Info */}
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <FileText className={`w-4 h-4 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
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
                            className="font-mono text-xs sm:text-sm font-semibold text-foreground bg-muted/60 border border-primary px-1.5 py-0.5 rounded-none w-full max-w-[240px] focus:outline-none"
                          />
                        ) : (
                          <div className="flex items-center gap-1.5 min-w-0 group/title">
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartRename(file);
                              }}
                              className="font-mono text-xs sm:text-sm font-semibold truncate text-foreground hover:underline cursor-text"
                              title="Click to rename"
                            >
                              {file.title || 'Untitled Manuscript'}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartRename(file);
                              }}
                              className="opacity-0 group-hover/title:opacity-100 p-0.5 text-muted-foreground hover:text-foreground transition-opacity cursor-pointer"
                              title="Rename document"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        {isActive && (
                          <span className="shrink-0 text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 bg-primary/15 text-primary border border-primary/30 rounded-none">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {formatDate(file.updatedAt || file.createdAt)}
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
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded-none border border-border/80 bg-background hover:bg-muted text-foreground transition-colors cursor-pointer"
                        title="Open this file into the aperture"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Open</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSelectDocumentTab()}
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded-none border border-border/80 bg-background hover:bg-muted text-foreground transition-colors cursor-pointer"
                        title="View active document preview"
                      >
                        <Check className="w-3 h-3 text-primary" />
                        <span className="hidden sm:inline">Current</span>
                      </button>
                    )}

                    {/* Download Button */}
                    <button
                      type="button"
                      onClick={() => handleDownloadProject(file)}
                      className="p-1.5 rounded-none border border-border/60 hover:border-foreground/40 bg-background text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      title="Download clean .txt"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>

                    {/* Delete / Confirm Delete Button */}
                    {isConfirmingDelete ? (
                      <div className="flex items-center gap-1 animate-in fade-in">
                        <button
                          type="button"
                          onClick={() => handleDeleteProject(file.id)}
                          className="px-2 py-1 text-xs rounded-none border border-destructive bg-destructive text-destructive-foreground font-bold hover:opacity-90 cursor-pointer"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingId(null)}
                          className="px-2 py-1 text-xs rounded-none border border-border bg-background text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeletingId(file.id)}
                        className="p-1.5 rounded-none border border-transparent text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors cursor-pointer"
                        title="Delete this file"
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
