import React from 'react';
import {
  ApertureHeight,
  WrapMode,
  PageSize,
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
  onUpdateWrapMode: (mode: WrapMode) => void;
  onUpdatePageSize: (size: PageSize) => void;
  onUpdateManifest: (patch: Partial<ManuscriptManifest>) => void;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  isOpen,
  onClose,
  manifest,
  onUpdateHeight,
  onUpdateWrapMode,
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150"
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

          {/* Line Wrap Mode */}
          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground">Line Wrap Boundary (70 col):</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onUpdateWrapMode('soft')}
                className={`py-2 px-3 rounded-md border text-left transition-all cursor-pointer ${
                  manifest.wrapMode === 'soft'
                    ? 'border-primary bg-primary/10 text-primary font-bold shadow-xs'
                    : 'border-border/80 bg-muted/30 hover:bg-muted/70 text-foreground'
                }`}
              >
                <div>Soft Word Wrap</div>
                <div className="text-[10px] text-muted-foreground/80 font-normal">
                  Carries word to next line
                </div>
              </button>
              <button
                type="button"
                onClick={() => onUpdateWrapMode('hard')}
                className={`py-2 px-3 rounded-md border text-left transition-all cursor-pointer ${
                  manifest.wrapMode === 'hard'
                    ? 'border-primary bg-primary/10 text-primary font-bold shadow-xs'
                    : 'border-border/80 bg-muted/30 hover:bg-muted/70 text-foreground'
                }`}
              >
                <div>Hard Break</div>
                <div className="text-[10px] text-muted-foreground/80 font-normal">
                  Splits strictly at col 70
                </div>
              </button>
            </div>
          </div>

          {/* Page Size */}
          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground">Sheet Page Length:</label>
            <div className="grid grid-cols-4 gap-1.5">
              {([30, 40, 54, 60] as PageSize[]).map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => onUpdatePageSize(size)}
                  className={`py-1.5 rounded-md border text-center transition-all cursor-pointer ${
                    manifest.pageSize === size
                      ? 'border-primary bg-primary text-primary-foreground font-bold shadow-xs'
                      : 'border-border/80 bg-muted/30 hover:bg-muted/70 text-foreground'
                  }`}
                >
                  {size} lines
                </button>
              ))}
            </div>
          </div>

          {/* Color Schemes */}
          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground">Palette & Aesthetic:</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'typewriter', label: 'Typewriter Paper', preview: 'bg-[#F5F2EB] text-[#1E1E1E]' },
                { id: 'dark-amber', label: 'Dark Amber', preview: 'bg-[#121212] text-[#FFB000]' },
                { id: 'phosphor', label: 'Phosphor Green', preview: 'bg-[#0A120A] text-[#33FF33]' },
                { id: 'high-contrast', label: 'High Contrast', preview: 'bg-white text-black' },
              ].map((scheme) => (
                <button
                  key={scheme.id}
                  type="button"
                  onClick={() => onUpdateManifest({ colorScheme: scheme.id as ColorScheme })}
                  className={`py-1.5 px-2.5 rounded-md border text-left flex items-center justify-between transition-all cursor-pointer ${
                    manifest.colorScheme === scheme.id
                      ? 'border-primary ring-1 ring-primary font-bold'
                      : 'border-border/80 hover:bg-muted/70'
                  }`}
                >
                  <span>{scheme.label}</span>
                  <span className={`w-3.5 h-3.5 rounded-full border border-black/20 ${scheme.preview}`} />
                </button>
              ))}
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
