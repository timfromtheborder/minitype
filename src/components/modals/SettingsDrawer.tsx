import React from 'react';
import {
  ApertureHeight,
  PageSize,
  PageMode,
  ColorScheme,
  TextSize,
  ManuscriptManifest,
  PhosphorColor,
  TimerStyle,
} from '@/types';
import { useTypingStore } from '@/stores/typingStore';
import {
  CornerUpLeft,
  Sliders,
  Volume2,
  VolumeX,
  ChevronUp,
  ChevronDown,
  Clock,
  BarChart2,
  Target,
  Type,
  Palette,
  Delete,
  Scroll,
} from 'lucide-react';
import { typewriterAudio } from '@/lib/sound';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  manifest?: ManuscriptManifest;
  onUpdateHeight?: (height: ApertureHeight) => void;
  onUpdatePageSize?: (size: PageSize) => void;
  onUpdateManifest?: (patch: Partial<ManuscriptManifest>) => void;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  isOpen,
  onClose,
  manifest: propManifest,
  onUpdateHeight: propOnUpdateHeight,
  onUpdateManifest: propOnUpdateManifest,
}) => {
  const storeManifest = useTypingStore((state) => state.manifest);
  const manifest = propManifest ?? storeManifest;
  const onUpdateManifest = propOnUpdateManifest ?? useTypingStore.getState().setManifest;
  const onUpdateHeight = propOnUpdateHeight ?? useTypingStore.getState().setApertureHeight;
  const [isMuted, setIsMuted] = React.useState(typewriterAudio.getMuted());
  const [isPhosphorPickerOpen, setIsPhosphorPickerOpen] = React.useState(false);

  const phosphorHexMap: Record<PhosphorColor, string> = {
    amber: '#FFB000',
    green: '#33FF33',
    blue: '#00E5FF',
    red: '#ff1a0d',
  };
  const currentPhosphorHex = phosphorHexMap[manifest.phosphorColor || 'amber'] || '#FFB000';

  React.useEffect(() => {
    if (isOpen) {
      setIsMuted(typewriterAudio.getMuted());
      setIsPhosphorPickerOpen(false);
    }
  }, [isOpen]);

  const drawerRef = React.useRef<HTMLDivElement>(null);

  // Focus trap and Escape key dismiss
  React.useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      const focusables = drawerRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables && focusables.length > 0) {
        focusables[0].focus();
      }
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        const focusables = drawerRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables || focusables.length === 0) return;
        const firstEl = focusables[0];
        const lastEl = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstEl) {
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

  const handleToggleMute = () => {
    const muted = typewriterAudio.toggleMute();
    setIsMuted(muted);
  };

  const showStats = manifest.showStats ?? true;
  const showSessionTargetTracker = manifest.showSessionTargetTracker ?? true;
  const allowStrikeout = manifest.allowStrikeout ?? true;

  const handleSelectScheme = (newScheme: ColorScheme) => {
    onUpdateManifest({ colorScheme: newScheme });
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(3.5rem,56px)] px-2 sm:p-4 sm:pb-16 animate-in fade-in duration-75"
      onClick={handleClose}
    >
      <div
        ref={drawerRef}
        className="w-full max-w-md max-h-[calc(100dvh-max(4.5rem,68px)-env(safe-area-inset-top))] sm:max-h-[calc(100dvh-5rem)] overflow-y-auto square-scrollbar p-4 sm:p-5 rounded-[2px] border border-border bg-background text-foreground shadow-2xl flex flex-col gap-3.5 sm:gap-4 select-none"
        onClick={(e) => {
          e.stopPropagation();
          setIsPhosphorPickerOpen(false);
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 pb-2 sm:pb-3 gap-2 shrink-0">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-xs font-sans font-bold tracking-widest uppercase text-muted-foreground shrink-0">
              Settings
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1 px-2 py-1 rounded-[2px] text-muted-foreground hover:text-foreground hover:bg-muted border border-border/60 transition-colors cursor-pointer touch-manipulation text-xs"
            aria-label="Return to writing in aperture"
          >
            <CornerUpLeft className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline font-sans text-xs font-semibold">Return</span>
          </button>
        </div>

        <div className="flex flex-col gap-3 sm:gap-3.5 text-xs font-sans">
          {/* =================================================================
              SECTION 1: MECHANICS (Aperture Slider, Page Mode, Typing Sounds, Allow Backspace)
              ================================================================= */}
          <div className="flex flex-col gap-2">
            {/* Aperture Visible Lines Slider (1 to 10 lines) */}
            <div className="flex flex-col gap-1 px-2 py-1 -mx-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sliders className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <label className="font-medium text-foreground">Aperture:</label>
                </div>
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
              <div className="flex items-center gap-3 pt-0.5">
                <span className="text-xs text-muted-foreground font-semibold">1</span>
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
                <span className="text-xs text-muted-foreground font-semibold">10</span>
              </div>
            </div>

            {/* Page Mode */}
            <div className="flex flex-col gap-1 px-2 py-1 -mx-2">
              <div className="flex items-center gap-2">
                <Scroll className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <label className="font-medium text-foreground">Page Mode:</label>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {(['scroll', 'notecard'] as PageMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      const pageSize = mode === 'scroll' ? 999999 : 10;
                      onUpdateManifest({ pageMode: mode, pageSize });
                    }}
                    className={`py-1.5 px-0.5 rounded-[2px] border text-center transition-all cursor-pointer capitalize text-xs truncate ${
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

            {/* Typing sounds */}
            <div
              className="flex items-center justify-between px-2 py-1.5 -mx-2 rounded-[2px] hover:bg-muted/40 transition-colors cursor-pointer"
              onClick={handleToggleMute}
            >
              <div className="flex items-center gap-2">
                {!isMuted ? (
                  <Volume2 className="w-3.5 h-3.5 text-primary shrink-0" />
                ) : (
                  <VolumeX className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                )}
                <span className="font-medium text-foreground">Typing sounds</span>
              </div>
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
                aria-label="Typing sounds"
              >
                <span
                  className={`pointer-events-none inline-block h-3.5 w-3.5 rounded-[1px] shadow-xs transition-transform duration-150 ease-in-out ${
                    !isMuted ? 'translate-x-4 bg-primary-foreground' : 'translate-x-0.5 bg-muted-foreground/70'
                  }`}
                />
              </button>
            </div>

            {/* Allow backspace */}
            <div
              className="flex items-center justify-between px-2 py-1.5 -mx-2 rounded-[2px] hover:bg-muted/40 transition-colors cursor-pointer"
              onClick={() => onUpdateManifest({ allowStrikeout: !allowStrikeout })}
            >
              <div className="flex items-center gap-2">
                <Delete
                  className={`w-3.5 h-3.5 shrink-0 ${
                    allowStrikeout ? 'text-primary' : 'text-muted-foreground/60'
                  }`}
                />
                <span className="font-medium text-foreground">Allow backspace</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={allowStrikeout}
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdateManifest({ allowStrikeout: !allowStrikeout });
                }}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-[2px] border transition-colors duration-150 ease-in-out focus:outline-hidden ${
                  allowStrikeout ? 'bg-primary border-primary' : 'bg-muted/70 border-border/80'
                }`}
                aria-label="Allow backspace"
              >
                <span
                  className={`pointer-events-none inline-block h-3.5 w-3.5 rounded-[1px] shadow-xs transition-transform duration-150 ease-in-out ${
                    allowStrikeout ? 'translate-x-4 bg-primary-foreground' : 'translate-x-0.5 bg-muted-foreground/70'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Section Divider */}
          <div className="border-t border-border/60" />

          {/* =================================================================
              SECTION 2: TOOLS (Stats, Session Target, Clock & Timer)
              ================================================================= */}
          <div className="flex flex-col gap-2">
            {/* Show document stats */}
            <div
              className="flex items-center justify-between px-2 py-1.5 -mx-2 rounded-[2px] hover:bg-muted/40 transition-colors cursor-pointer"
              onClick={() => onUpdateManifest({ showStats: !showStats })}
            >
              <div className="flex items-center gap-2">
                <BarChart2
                  className={`w-3.5 h-3.5 shrink-0 ${
                    showStats ? 'text-primary' : 'text-muted-foreground/60'
                  }`}
                />
                <span className="font-medium text-foreground">Show document stats</span>
              </div>
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
                aria-label="Show document stats"
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
              className="flex items-center justify-between px-2 py-1.5 -mx-2 rounded-[2px] hover:bg-muted/40 transition-colors cursor-pointer"
              onClick={() => onUpdateManifest({ showSessionTargetTracker: !showSessionTargetTracker })}
            >
              <div className="flex items-center gap-2">
                <Target
                  className={`w-3.5 h-3.5 shrink-0 ${
                    showSessionTargetTracker ? 'text-primary' : 'text-muted-foreground/60'
                  }`}
                />
                <span className="font-medium text-foreground">Session target tracker</span>
              </div>
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
                aria-label="Session target tracker"
              >
                <span
                  className={`pointer-events-none inline-block h-3.5 w-3.5 rounded-[1px] shadow-xs transition-transform duration-150 ease-in-out ${
                    showSessionTargetTracker ? 'translate-x-4 bg-primary-foreground' : 'translate-x-0.5 bg-muted-foreground/70'
                  }`}
                />
              </button>
            </div>

            {/* Session target words stepper (beneath session target tracker) */}
            {showSessionTargetTracker && (
              <div className="flex items-center justify-between pl-3 pr-1.5 py-1 border-l-2 border-primary/40 bg-muted/15 rounded-r-[2px] -mt-0.5 mb-0.5 animate-in fade-in duration-100">
                <span className="text-xs text-muted-foreground">Target words per session</span>
                <div className="flex items-center gap-1.5">
                  <div className="h-[26px] flex items-center rounded-[2px] border border-border/80 bg-background focus-within:border-primary transition-colors overflow-hidden">
                    <input
                      type="number"
                      min={0}
                      max={99999}
                      step={50}
                      placeholder="Off"
                      value={manifest.sessionWordTarget && manifest.sessionWordTarget > 0 ? manifest.sessionWordTarget : ''}
                      onChange={(e) => {
                        const val = e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0);
                        onUpdateManifest({ sessionWordTarget: val > 0 ? val : undefined });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          window.getSelection()?.removeAllRanges();
                        }
                      }}
                      className="w-16 h-full px-1.5 text-xs font-mono font-bold text-right bg-transparent text-foreground focus:outline-hidden [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      aria-label="Target words per session"
                    />
                    <div className="flex flex-col h-full border-l border-border/80 divide-y divide-border/60 shrink-0 w-4 bg-muted/20">
                      <button
                        type="button"
                        onClick={() => {
                          const current = manifest.sessionWordTarget ?? 0;
                          const next = Math.min(99999, Math.floor(current / 50) * 50 + 50);
                          onUpdateManifest({ sessionWordTarget: next });
                        }}
                        className="flex-1 flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer select-none"
                        aria-label="Increment target by 50"
                      >
                        <ChevronUp className="w-2.5 h-2.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const current = manifest.sessionWordTarget ?? 0;
                          if (current <= 50) {
                            onUpdateManifest({ sessionWordTarget: undefined });
                          } else {
                            const next = Math.max(50, Math.ceil(current / 50) * 50 - 50);
                            onUpdateManifest({ sessionWordTarget: next });
                          }
                        }}
                        className="flex-1 flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer select-none"
                        aria-label="Decrement target by 50"
                      >
                        <ChevronDown className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  </div>
                  {manifest.sessionWordTarget && manifest.sessionWordTarget > 0 ? (
                    <button
                      type="button"
                      onClick={() => onUpdateManifest({ sessionWordTarget: undefined })}
                      className="text-[10px] text-muted-foreground hover:text-foreground cursor-pointer underline shrink-0"
                      aria-label="Turn off target"
                    >
                      Off
                    </button>
                  ) : null}
                </div>
              </div>
            )}

            {/* Show clock */}
            <div
              className="flex items-center justify-between px-2 py-1.5 -mx-2 rounded-[2px] hover:bg-muted/40 transition-colors cursor-pointer"
              onClick={() => onUpdateManifest({ showClock: !manifest.showClock })}
            >
              <div className="flex items-center gap-2">
                <Clock
                  className={`w-3.5 h-3.5 shrink-0 ${
                    manifest.showClock ? 'text-primary' : 'text-muted-foreground/60'
                  }`}
                />
                <span className="font-medium text-foreground">Show clock</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={manifest.showClock ?? false}
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdateManifest({ showClock: !manifest.showClock });
                }}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-[2px] border transition-colors duration-150 ease-in-out focus:outline-hidden ${
                  manifest.showClock ? 'bg-primary border-primary' : 'bg-muted/70 border-border/80'
                }`}
                aria-label="Show clock"
              >
                <span
                  className={`pointer-events-none inline-block h-3.5 w-3.5 rounded-[1px] shadow-xs transition-transform duration-150 ease-in-out ${
                    manifest.showClock ? 'translate-x-4 bg-primary-foreground' : 'translate-x-0.5 bg-muted-foreground/70'
                  }`}
                />
              </button>
            </div>

            {/* Timer Style (Visible only when Clock is enabled) */}
            {manifest.showClock && (
              <div className="flex flex-col gap-1 pl-3 pr-1.5 py-1.5 border-l-2 border-primary/40 bg-muted/15 rounded-r-[2px] -mt-0.5 animate-in fade-in duration-100">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-xs">Timer Style</span>
                  <span className="font-bold text-foreground capitalize text-xs">
                    {manifest.timerStyle || 'snapshot'}
                  </span>
                </div>
                <div className="flex items-stretch gap-1.5">
                  <div className="grid grid-cols-2 gap-1.5 flex-1">
                    {(['snapshot', 'pomodoro'] as TimerStyle[]).map((style) => (
                      <button
                        key={style}
                        type="button"
                        onClick={() => onUpdateManifest({ timerStyle: style })}
                        className={`h-6.5 flex items-center justify-center px-1 rounded-[2px] border text-center transition-all cursor-pointer capitalize text-[11px] touch-manipulation ${
                          (manifest.timerStyle || 'snapshot') === style
                            ? 'border-primary bg-primary text-primary-foreground font-bold shadow-xs'
                            : 'border-border/80 bg-muted/30 hover:bg-muted/70 text-foreground font-medium'
                        }`}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                  {(() => {
                    const isSnapshot = (manifest.timerStyle || 'snapshot') === 'snapshot';
                    return (
                      <button
                        type="button"
                        disabled={isSnapshot}
                        onClick={() => {
                          if (isSnapshot) return;
                          onUpdateManifest({
                            pomodoroSoundEnabled: !(manifest.pomodoroSoundEnabled ?? false),
                          });
                        }}
                        className={`h-6.5 w-6.5 flex items-center justify-center rounded-[2px] border transition-colors shrink-0 touch-manipulation ${
                          isSnapshot
                            ? 'opacity-30 border-border/40 bg-muted/20 text-muted-foreground/40 cursor-not-allowed'
                            : manifest.pomodoroSoundEnabled ?? false
                            ? 'border-primary bg-primary text-primary-foreground shadow-xs cursor-pointer'
                            : 'border-border/80 bg-muted/30 hover:bg-muted/70 text-muted-foreground cursor-pointer'
                        }`}
                        aria-label={
                          manifest.pomodoroSoundEnabled ?? false
                            ? 'Mute Pomodoro audio alerts'
                            : 'Enable Pomodoro audio alerts'
                        }
                      >
                        {(manifest.pomodoroSoundEnabled ?? false) && !isSnapshot ? (
                          <Volume2 className="w-3.5 h-3.5" />
                        ) : (
                          <VolumeX className="w-3.5 h-3.5" />
                        )}
                      </button>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* Section Divider */}
          <div className="border-t border-border/60" />

          {/* =================================================================
              SECTION 3: INTERFACE (Text Size, Theme Grid)
              ================================================================= */}
          <div className="flex flex-col gap-2">
            {/* Text Size ([S] [M] [L] [XL]) */}
            <div className="flex flex-col gap-1 px-2 py-1 -mx-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Type className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <label className="font-medium text-foreground">Text Size:</label>
                </div>
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

            {/* Color Schemes */}
            <div className="flex flex-col gap-1.5 px-2 py-1 -mx-2">
              <div className="flex items-center gap-2">
                <Palette className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <label className="font-medium text-foreground">Theme:</label>
              </div>
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
                    fg: currentPhosphorHex,
                    border: currentPhosphorHex,
                  },
                  {
                    id: 'low-contrast',
                    label: 'Newsprint',
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
                    <div key={scheme.id} className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (scheme.id === 'dark-amber') {
                            if (isSelected) {
                              setIsPhosphorPickerOpen((prev) => !prev);
                            } else {
                              handleSelectScheme('dark-amber');
                              setIsPhosphorPickerOpen(false);
                            }
                          } else {
                            handleSelectScheme(scheme.id as ColorScheme);
                            setIsPhosphorPickerOpen(false);
                          }
                        }}
                        className={`w-full py-2 px-3 rounded-[2px] border text-left flex items-center justify-between transition-colors duration-100 cursor-pointer focus:outline-hidden ${
                          isSelected
                            ? 'border-primary bg-primary text-primary-foreground font-semibold shadow-xs'
                            : 'border-border/80 hover:bg-muted/60 text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="w-4 h-4 rounded-[2px] border flex items-center justify-center text-[8px] font-mono font-bold shrink-0"
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
                          className={`w-3.5 h-3.5 rounded-[2px] border flex items-center justify-center transition-colors duration-100 shrink-0 ml-1.5 ${
                            isSelected
                              ? 'border-primary-foreground bg-primary-foreground'
                              : 'border-muted-foreground/40 bg-transparent'
                          }`}
                        >
                          {isSelected && (
                            <div className="w-1.5 h-1.5 rounded-[2px] bg-primary" />
                          )}
                        </div>
                      </button>

                      {/* Terminal Multi-Phosphor Pop-over directly over the Terminal button */}
                      {scheme.id === 'dark-amber' && isPhosphorPickerOpen && (
                        <div
                          className="absolute inset-0 z-20 rounded-[2px] border border-primary bg-card/95 backdrop-blur-xs flex items-center justify-around px-1.5 shadow-lg animate-in fade-in zoom-in-95 duration-100 select-none"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {(
                            [
                              { id: 'amber', label: 'Amber', hex: '#FFB000' },
                              { id: 'green', label: 'Green', hex: '#33FF33' },
                              { id: 'blue', label: 'Blue', hex: '#00E5FF' },
                              { id: 'red', label: 'Red', hex: '#ff1a0d' },
                            ] as const
                          ).map((swatch) => {
                            const isCurrent = (manifest.phosphorColor || 'amber') === swatch.id;
                            return (
                              <button
                                key={swatch.id}
                                type="button"
                                aria-label={swatch.label}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUpdateManifest({ phosphorColor: swatch.id });
                                  setIsPhosphorPickerOpen(false);
                                }}
                                className={`w-5 h-5 sm:w-6 sm:h-6 rounded-[2px] border flex items-center justify-center transition-all cursor-pointer ${
                                  isCurrent
                                    ? 'ring-2 ring-foreground ring-offset-1 ring-offset-background border-transparent scale-105'
                                    : 'border-border/80 hover:scale-105 opacity-85 hover:opacity-100'
                                }`}
                                style={{ backgroundColor: swatch.hex }}
                              >
                                {isCurrent && (
                                  <div className="w-1.5 h-1.5 rounded-[1px] bg-black" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Version Footer */}
          <div className="pt-2.5 pb-0.5 text-center border-t border-border/40">
            <span className="text-xs font-mono tracking-widest text-muted-foreground/60 uppercase select-none">
              Minitype v0.9.10.25 · by timfromtheborder
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
