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
  const showSessionTargetTracker = manifest.showSessionTargetTracker ?? true;

  const handleClose = () => {
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
          {/* Aperture Visible Lines Slider (1 to 10 lines) */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-muted-foreground">Aperture:</label>
              <span
                className={`font-bold ${
                  manifest.pageMode === 'notecard' ? 'text-muted-foreground/50' : 'text-foreground'
                }`}
              >
                {manifest.pageMode === 'notecard'
                  ? '10 lines'
                  : `${manifest.activeApertureHeight} ${manifest.activeApertureHeight === 1 ? 'line' : 'lines'}`}
              </span>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <span className="text-[10px] text-muted-foreground font-semibold">1</span>
              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={manifest.pageMode === 'notecard' ? 10 : manifest.activeApertureHeight}
                disabled={manifest.pageMode === 'notecard'}
                onChange={(e) => {
                  if (manifest.pageMode === 'notecard') return;
                  const val = Number(e.target.value) as ApertureHeight;
                  onUpdateHeight(val);
                }}
                className={`w-full square-slider ${
                  manifest.pageMode === 'notecard' ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                }`}
                aria-label="Aperture slider"
              />
              <span className="text-[10px] text-muted-foreground font-semibold">10</span>
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
            <div className="grid grid-cols-3 gap-1.5">
              {(['scroll', 'paragraph', 'notecard'] as PageMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    const pageSize = mode === 'scroll' ? 999999 : mode === 'notecard' ? 10 : 9999;
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
                  bg: '#646a71',
                  fg: '#1c2024',
                  border: '#6d747c',
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

          {/* Settings Switches (Document Stats, Double-space paragraphs, Typing Sounds) */}
          <div className="flex flex-col gap-3 pt-2.5 border-t border-border/60">
            {/* Show document stats */}
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => onUpdateManifest({ showStats: !showStats })}
            >
              <span className="text-muted-foreground">Show document stats</span>
              <button
                type="button"
                role="switch"
                aria-checked={showStats}
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdateManifest({ showStats: !showStats });
                }}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-[2px] border transition-colors duration-150 ease-in-out focus:outline-hidden ${
                  showStats ? 'bg-primary border-primary' : 'bg-muted/70 border-border/80'
                }`}
                title="Show document stats"
              >
                <span
                  className={`pointer-events-none inline-block h-3.5 w-3.5 rounded-[1px] shadow-xs transition-transform duration-150 ease-in-out ${
                    showStats ? 'translate-x-4 bg-primary-foreground' : 'translate-x-0.5 bg-muted-foreground/70'
                  }`}
                />
              </button>
            </div>

            {/* Session target tracker */}
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => onUpdateManifest({ showSessionTargetTracker: !showSessionTargetTracker })}
            >
              <span className="text-muted-foreground">Session target tracker</span>
              <button
                type="button"
                role="switch"
                aria-checked={showSessionTargetTracker}
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdateManifest({ showSessionTargetTracker: !showSessionTargetTracker });
                }}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-[2px] border transition-colors duration-150 ease-in-out focus:outline-hidden ${
                  showSessionTargetTracker ? 'bg-primary border-primary' : 'bg-muted/70 border-border/80'
                }`}
                title="Session target tracker"
              >
                <span
                  className={`pointer-events-none inline-block h-3.5 w-3.5 rounded-[1px] shadow-xs transition-transform duration-150 ease-in-out ${
                    showSessionTargetTracker ? 'translate-x-4 bg-primary-foreground' : 'translate-x-0.5 bg-muted-foreground/70'
                  }`}
                />
              </button>
            </div>

            {/* Typing sounds */}
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={handleToggleMute}
            >
              <span className="text-muted-foreground">Typing sounds</span>
              <button
                type="button"
                role="switch"
                aria-checked={!isMuted}
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleMute();
                }}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-[2px] border transition-colors duration-150 ease-in-out focus:outline-hidden ${
                  !isMuted ? 'bg-primary border-primary' : 'bg-muted/70 border-border/80'
                }`}
                title="Typing sounds"
              >
                <span
                  className={`pointer-events-none inline-block h-3.5 w-3.5 rounded-[1px] shadow-xs transition-transform duration-150 ease-in-out ${
                    !isMuted ? 'translate-x-4 bg-primary-foreground' : 'translate-x-0.5 bg-muted-foreground/70'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Version Footer */}
          <div className="pt-3 pb-1 text-center border-t border-border/40">
            <span className="text-[10px] font-mono tracking-widest text-muted-foreground/60 uppercase select-none">
              Minitype v0.9.7.4
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
