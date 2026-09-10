import React from 'react';
import {
  ApertureHeight,
  WrapMode,
  PageSize,
  PageMode,
  ColorScheme,
  Typeface,
  ManuscriptMode,
  ManuscriptManifest,
} from '@/types';
import { X, Sliders, Volume2, VolumeX } from 'lucide-react';
import { typewriterAudio } from '@/lib/sound';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  manifest: ManuscriptManifest;
  onUpdateHeight: (height: ApertureHeight) => void;
  onUpdatePageSize: (size: PageSize) => void;
  onUpdateManifest: (patch: Partial<ManuscriptManifest>) => void;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  isOpen,
  onClose,
  manifest,
  onUpdateHeight,
  onUpdatePageSize,
  onUpdateManifest,
}) => {
  const [isMuted, setIsMuted] = React.useState(typewriterAudio.getMuted());

  if (!isOpen) return null;

  const handleToggleMute = () => {
    const muted = typewriterAudio.toggleMute();
    setIsMuted(muted);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md p-6 rounded-2xl border border-border bg-background shadow-2xl flex flex-col gap-5 select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-mono font-semibold tracking-wider uppercase text-foreground">
              Typewriter Settings
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 text-xs font-mono">
          {/* Aperture Visible Lines */}
          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground">
              Aperture Capacity ({manifest.activeApertureHeight} visible lines):
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {([1, 2, 3, 4, 5] as ApertureHeight[]).map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => onUpdateHeight(h)}
                  className={`py-1.5 rounded-md border text-center transition-all cursor-pointer ${
                    manifest.activeApertureHeight === h
                      ? 'border-primary bg-primary text-primary-foreground font-bold shadow-xs'
                      : 'border-border/80 bg-muted/30 hover:bg-muted/70 text-foreground'
                  }`}
                >
                  {h} L
                </button>
              ))}
            </div>
          </div>

          {/* Page Mode */}
          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground">Page Mode:</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['notecard', 'paragraph', 'page'] as PageMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    const pageSize = mode === 'notecard' ? 10 : mode === 'page' ? 54 : 9999;
                    onUpdateManifest({ pageMode: mode, pageSize });
                  }}
                  className={`py-1.5 rounded-md border text-center transition-all cursor-pointer ${
                    (manifest.pageMode || 'page') === mode
                      ? 'border-primary bg-primary text-primary-foreground font-bold shadow-xs'
                      : 'border-border/80 bg-muted/30 hover:bg-muted/70 text-foreground'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {/* Color Schemes */}
          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground">Palette & Aesthetic:</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  id: 'typewriter',
                  label: 'Typewriter',
                  bg: '#F5F2EB',
                  fg: '#1E1E1E',
                  border: '#DCD1BE',
                },
                {
                  id: 'phosphor',
                  label: 'Phosphor',
                  bg: '#0A120A',
                  fg: '#33FF33',
                  border: '#33FF33',
                },
                {
                  id: 'high-contrast',
                  label: 'High Contrast',
                  bg: '#FFFFFF',
                  fg: '#000000',
                  border: '#666666',
                },
                {
                  id: 'dark-amber',
                  label: 'Amber',
                  bg: '#121212',
                  fg: '#FFB000',
                  border: '#FFB000',
                },
                {
                  id: 'low-contrast',
                  label: 'Low Contrast',
                  bg: '#5B6A78',
                  fg: '#24282C',
                  border: '#748494',
                },
                {
                  id: 'dark-mode',
                  label: 'Dark Mode',
                  bg: '#121214',
                  fg: '#EDEDED',
                  border: '#EDEDED',
                },
              ].map((scheme) => {
                const isSelected = manifest.colorScheme === scheme.id;
                return (
                  <button
                    key={scheme.id}
                    type="button"
                    onClick={() => onUpdateManifest({ colorScheme: scheme.id as ColorScheme })}
                    className={`py-2 px-3 rounded-lg border text-left flex items-center justify-between transition-all cursor-pointer ${
                      isSelected
                        ? 'border-primary ring-1 ring-primary bg-primary/10 text-foreground font-semibold shadow-xs'
                        : 'border-border/80 hover:bg-muted/60 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-4 h-4 rounded-full border shadow-xs flex items-center justify-center text-[8px] font-mono font-bold shrink-0"
                        style={{
                          backgroundColor: scheme.bg,
                          color: scheme.fg,
                          borderColor: scheme.border,
                        }}
                      >
                        Aa
                      </span>
                      <span className="truncate">{scheme.label}</span>
                    </div>

                    {/* Functional Radio Button Indicator */}
                    <div
                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ml-1.5 ${
                        isSelected
                          ? 'border-primary bg-primary'
                          : 'border-muted-foreground/40 bg-transparent'
                      }`}
                    >
                      {isSelected && (
                        <div className="w-1.5 h-1.5 rounded-full bg-background" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Session Mode */}
          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground">Session Persistence:</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onUpdateManifest({ mode: 'local' })}
                className={`py-1.5 px-3 rounded-md border text-center transition-all cursor-pointer ${
                  manifest.mode === 'local'
                    ? 'border-primary bg-primary/10 text-primary font-bold'
                    : 'border-border/80 bg-muted/30 hover:bg-muted/70'
                }`}
              >
                Local (IndexedDB)
              </button>
              <button
                type="button"
                onClick={() => onUpdateManifest({ mode: 'temp' })}
                className={`py-1.5 px-3 rounded-md border text-center transition-all cursor-pointer ${
                  manifest.mode === 'temp'
                    ? 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold'
                    : 'border-border/80 bg-muted/30 hover:bg-muted/70'
                }`}
              >
                Temp (Volatile RAM)
              </button>
            </div>
          </div>

          {/* Audio Feedback Toggle */}
          <div className="flex items-center justify-between pt-2 border-t border-border/60">
            <span className="text-muted-foreground">Mechanical Sound:</span>
            <button
              type="button"
              onClick={handleToggleMute}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border/80 bg-muted/40 hover:bg-muted text-foreground transition-all cursor-pointer"
            >
              {isMuted ? (
                <>
                  <VolumeX className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>Muted</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-3.5 h-3.5 text-primary" />
                  <span>Enabled</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
