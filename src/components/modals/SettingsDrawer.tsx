import React from 'react';
import {
  ApertureHeight,
  PageSize,
  PageMode,
  ColorScheme,
  TextSize,
  ManuscriptManifest,
} from '@/types';
import { X, Sliders, Volume2, VolumeX } from 'lucide-react';
import { typewriterAudio } from '@/lib/sound';
import { persistSettings } from '@/stores/typingStore';

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
  onUpdateManifest,
}) => {
  const [isMuted, setIsMuted] = React.useState(typewriterAudio.getMuted());

  React.useEffect(() => {
    if (isOpen) {
      setIsMuted(typewriterAudio.getMuted());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleToggleMute = () => {
    const muted = typewriterAudio.toggleMute();
    setIsMuted(muted);
  };

  const showStats = manifest.showStats ?? true;
  const isDoubleSpace = manifest.doubleSpaceLinebreaks ?? false;

  const handleClose = () => {
    try {
      persistSettings(manifest);
    } catch (e) {}
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-2 sm:p-4 animate-in fade-in duration-150"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md max-h-[calc(100dvh-1rem)] overflow-y-auto square-scrollbar p-4 sm:p-6 rounded-[2px] border border-border bg-background text-foreground shadow-2xl flex flex-col gap-4 sm:gap-5 select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-sans font-semibold tracking-wider uppercase text-foreground">
              Settings
            </h2>
            <span className="text-[10px] font-mono tracking-wider px-1.5 py-0.5 rounded-[2px] bg-muted text-muted-foreground border border-border/60">
              v0.9.5.2
            </span>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 rounded-[2px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 text-xs font-sans">
          {/* Aperture Visible Lines Slider (1 to 8 lines) */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-muted-foreground">Aperture:</label>
              <span className="font-bold text-foreground">
                {manifest.activeApertureHeight} {manifest.activeApertureHeight === 1 ? 'line' : 'lines'}
              </span>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <span className="text-[10px] text-muted-foreground font-semibold">1</span>
              <input
                type="range"
                min={1}
                max={8}
                step={1}
                value={manifest.activeApertureHeight}
                onChange={(e) => {
                  const val = Number(e.target.value) as ApertureHeight;
                  onUpdateHeight(val);
                  onUpdateManifest({ activeApertureHeight: val });
                }}
                onInput={(e) => {
                  const val = Number(e.currentTarget.value) as ApertureHeight;
                  onUpdateHeight(val);
                  onUpdateManifest({ activeApertureHeight: val });
                }}
                className="w-full square-slider cursor-pointer"
                aria-label="Aperture slider"
              />
              <span className="text-[10px] text-muted-foreground font-semibold">8</span>
            </div>
          </div>

          {/* Text Size ([S] [M] [L] [XL]) */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-muted-foreground">Text Size:</label>
              <span className="font-bold text-foreground">
                {(manifest.textSize || 'm') === 's'
                  ? 'Small (S)'
                  : (manifest.textSize || 'm') === 'l'
                  ? 'Large (L)'
                  : (manifest.textSize || 'm') === 'xl'
                  ? 'Extra Large (XL)'
                  : 'Default (M)'}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {(['s', 'm', 'l', 'xl'] as TextSize[]).map((size) => {
                const isSelected = (manifest.textSize || 'm') === size;
                const label = size.toUpperCase();
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => onUpdateManifest({ textSize: size })}
                    className={`py-1.5 rounded-[2px] border text-center transition-all cursor-pointer font-bold text-xs sm:text-sm ${
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                        : 'border-border/80 bg-muted/30 hover:bg-muted/70 text-foreground'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Page Mode */}
          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground">Page Mode:</label>
            <div className="grid grid-cols-4 gap-1.5">
              {(['scroll', 'page', 'notecard', 'paragraph'] as PageMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    const pageSize = mode === 'scroll' ? 999999 : mode === 'notecard' ? 10 : mode === 'page' ? 54 : 9999;
                    onUpdateManifest({ pageMode: mode, pageSize });
                  }}
                  className={`py-1.5 px-0.5 rounded-[2px] border text-center transition-all cursor-pointer capitalize text-[10px] sm:text-xs truncate ${
                    (manifest.pageMode || 'scroll') === mode
                      ? 'border-primary bg-primary text-primary-foreground font-bold shadow-xs'
                      : 'border-border/80 bg-muted/30 hover:bg-muted/70 text-foreground'
                  }`}
                >
                  <span className="truncate">{mode}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Color Schemes (Renamed labels) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground">Theme:</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  id: 'typewriter',
                  label: 'Manuscript',
                  bg: '#F5F2EB',
                  fg: '#1E1E1E',
                  border: '#DCD1BE',
                },
                {
                  id: 'spotlight',
                  label: 'Spotlight',
                  bg: '#E4E4E7',
                  fg: '#09090B',
                  border: '#141416',
                },
                {
                  id: 'high-contrast',
                  label: 'Paperwhite',
                  bg: '#FFFFFF',
                  fg: '#000000',
                  border: '#666666',
                },
                {
                  id: 'dark-amber',
                  label: 'Terminal',
                  bg: '#121212',
                  fg: '#FFB000',
                  border: '#FFB000',
                },
                {
                  id: 'low-contrast',
                  label: 'Overcast',
                  bg: '#5B6A78',
                  fg: '#24282C',
                  border: '#748494',
                },
                {
                  id: 'dark-mode',
                  label: 'Charcoal',
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
                    className={`py-2 px-3 rounded-[2px] border text-left flex items-center justify-between transition-all cursor-pointer ${
                      isSelected
                        ? 'border-primary ring-1 ring-primary bg-primary/10 text-foreground font-semibold shadow-xs'
                        : 'border-border/80 hover:bg-muted/60 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-4 h-4 rounded-[2px] border shadow-xs flex items-center justify-center text-[8px] font-mono font-bold shrink-0"
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

                    {/* Functional Square Radio Button Indicator */}
                    <div
                      className={`w-3.5 h-3.5 rounded-[2px] border flex items-center justify-center transition-all shrink-0 ml-1.5 ${
                        isSelected
                          ? 'border-primary bg-primary'
                          : 'border-muted-foreground/40 bg-transparent'
                      }`}
                    >
                      {isSelected && (
                        <div className="w-1.5 h-1.5 rounded-[2px] bg-background" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Settings Toggles (Document Stats & Markdown Mode) */}
          <div className="flex flex-col gap-2 pt-2 border-t border-border/60">
            {/* Document Stats */}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Document Stats:</span>
              <button
                type="button"
                onClick={() => onUpdateManifest({ showStats: !showStats })}
                className={`px-3 py-1 rounded-[2px] border text-xs transition-all cursor-pointer ${
                  showStats
                    ? 'border-primary bg-primary text-primary-foreground font-bold shadow-xs'
                    : 'border-border/80 bg-muted/30 hover:bg-muted/70 text-muted-foreground'
                }`}
              >
                {showStats ? 'Visible' : 'Hidden'}
              </button>
            </div>

            {/* Markdown Mode (Double-space linebreaks) */}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Markdown Mode:</span>
              <button
                type="button"
                onClick={() => onUpdateManifest({ doubleSpaceLinebreaks: !isDoubleSpace })}
                className={`px-3 py-1 rounded-[2px] border text-xs transition-all cursor-pointer ${
                  isDoubleSpace
                    ? 'border-primary bg-primary text-primary-foreground font-bold shadow-xs'
                    : 'border-border/80 bg-muted/30 hover:bg-muted/70 text-muted-foreground'
                }`}
                title="Double-space hard linebreaks for markdown formatting"
              >
                {isDoubleSpace ? 'Double-Spaced' : 'Single-Spaced'}
              </button>
            </div>
          </div>

          {/* Audio Feedback Toggle */}
          <div className="flex items-center justify-between pt-2 border-t border-border/60">
            <span className="text-muted-foreground">Sound:</span>
            <button
              type="button"
              onClick={handleToggleMute}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[2px] border border-border/80 bg-muted/40 hover:bg-muted text-foreground transition-all cursor-pointer"
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

          {/* Version Footer */}
          <div className="pt-3 pb-1 text-center border-t border-border/40">
            <span className="text-[10px] font-mono tracking-widest text-muted-foreground/60 uppercase select-none">
              Minitype v0.9.5.2
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
