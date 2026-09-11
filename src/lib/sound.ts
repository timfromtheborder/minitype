// Web Audio API synthesized mechanical keystroke audio

class TypewriterAudio {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = true; // Turned off by default
  private keyClickBuffers: AudioBuffer[] = [];
  private backspaceBuffers: AudioBuffer[] = [];
  private strikeBuffers: AudioBuffer[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('minitype_sound_muted');
        if (saved !== null) {
          this.isMuted = saved === 'true';
        } else {
          this.isMuted = true;
        }
      } catch {
        this.isMuted = true;
      }

      // iOS Safari Web Audio user gesture unlock
      const unlock = () => {
        if (!this.ctx) {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioCtx) {
            this.ctx = new AudioCtx();
            this.initNoisePools(this.ctx);
          }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
      };

      window.addEventListener('touchstart', unlock, { once: true, passive: true });
      window.addEventListener('pointerdown', unlock, { once: true, passive: true });
      window.addEventListener('keydown', unlock, { once: true });
    }
  }

  private initNoisePools(ctx: AudioContext) {
    if (this.keyClickBuffers.length > 0) return;
    try {
      const sampleRate = ctx.sampleRate;

      // 1. Key click pool (4 variants)
      const clickSize = Math.floor(sampleRate * 0.03);
      for (let b = 0; b < 4; b++) {
        const buf = ctx.createBuffer(1, clickSize, sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < clickSize; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (clickSize * 0.2));
        }
        this.keyClickBuffers.push(buf);
      }

      // 2. Backspace pool (4 variants)
      const bsSize = Math.floor(sampleRate * 0.018);
      for (let b = 0; b < 4; b++) {
        const buf = ctx.createBuffer(1, bsSize, sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bsSize; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bsSize * 0.15));
        }
        this.backspaceBuffers.push(buf);
      }

      // 3. Strikeout pool (4 variants)
      const strikeDuration = 0.095;
      const strikeSize = Math.floor(sampleRate * strikeDuration);
      for (let b = 0; b < 4; b++) {
        const buf = ctx.createBuffer(1, strikeSize, sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < strikeSize; i++) {
          const progress = i / strikeSize;
          const env = progress < 0.1 ? progress / 0.1 : Math.exp(-(progress - 0.1) * 4);
          const texture = 1 + 0.3 * Math.sin(progress * 80 * Math.PI);
          data[i] = (Math.random() * 2 - 1) * env * texture;
        }
        this.strikeBuffers.push(buf);
      }
    } catch {}
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.initNoisePools(this.ctx);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('minitype_sound_muted', String(muted));
      } catch {}
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  /**
   * Synthesizes a mechanical typewriter key click (hammer striking platen).
   */
  public playKeyClick() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const t = ctx.currentTime;
      const buffer =
        this.keyClickBuffers[Math.floor(Math.random() * this.keyClickBuffers.length)];
      if (!buffer) return;

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      // Resonant bandpass filter
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1400 + Math.random() * 300, t);
      filter.Q.setValueAtTime(3.5, t);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      noise.start(t);
    } catch {}
  }

  /**
   * Synthesizes a crisp, filtered mechanical noise click for spacebar matching key clicks.
   */
  public playSpace() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const t = ctx.currentTime;
      const buffer =
        this.keyClickBuffers[Math.floor(Math.random() * this.keyClickBuffers.length)];
      if (!buffer) return;

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      // Resonant bandpass filter tuned slightly lower than regular key strikes
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1100 + Math.random() * 200, t);
      filter.Q.setValueAtTime(2.8, t);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.38, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.032);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      noise.start(t);
    } catch {}
  }

  /**
   * Synthesizes a mechanical pawl/escapement click for Backspace.
   * Lighter, sharper, clicky latch click without synthetic oscillator tones.
   */
  public playBackspace() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const t = ctx.currentTime;
      const buffer =
        this.backspaceBuffers[Math.floor(Math.random() * this.backspaceBuffers.length)];
      if (!buffer) return;

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(3400, t);
      filter.Q.setValueAtTime(4.5, t);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.02);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      noise.start(t);
    } catch {}
  }

  /**
   * Synthesizes a 'paper rip' shh sound for strikeout.
   * Textured frictional noise burst simulating ribbon scraping or paper tearing.
   */
  public playStrike() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const t = ctx.currentTime;
      const duration = 0.095; // 95ms
      const buffer =
        this.strikeBuffers[Math.floor(Math.random() * this.strikeBuffers.length)];
      if (!buffer) return;

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      // Bandpass sweeping downward to create the "shhh" friction texture
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2400, t);
      filter.frequency.exponentialRampToValueAtTime(1200, t + duration);
      filter.Q.setValueAtTime(1.8, t);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.32, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      noise.start(t);
    } catch {}
  }

  /**
   * Synthesizes a mechanical "zip-clunk" for Carriage Return (Enter).
   * - Zip: rapid ratcheting tooth clicks as carriage slides across rails
   * - Clunk: solid mechanical margin stop thud at the end
   */
  public playCarriageReturn() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const t = ctx.currentTime;

      // 1. The "Zip" (rapid ratchet wheel sliding from t to t + 0.11s)
      const zipDuration = 0.11;
      const zipBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * zipDuration), ctx.sampleRate);
      const zipData = zipBuffer.getChannelData(0);
      const zipSize = zipData.length;

      // 7 rapid tooth clicks in the burst
      for (let i = 0; i < zipSize; i++) {
        const p = i / zipSize;
        // Tooth repetition every ~15ms
        const tooth = Math.sin(p * Math.PI * 14);
        const toothEnv = tooth > 0.6 ? 1 : 0.05;
        zipData[i] = (Math.random() * 2 - 1) * toothEnv * (0.5 + 0.5 * p);
      }

      const zipSource = ctx.createBufferSource();
      zipSource.buffer = zipBuffer;

      const zipFilter = ctx.createBiquadFilter();
      zipFilter.type = 'bandpass';
      zipFilter.frequency.setValueAtTime(1800, t);
      zipFilter.frequency.exponentialRampToValueAtTime(2800, t + zipDuration);
      zipFilter.Q.setValueAtTime(2.5, t);

      const zipGain = ctx.createGain();
      zipGain.gain.setValueAtTime(0.24, t);
      zipGain.gain.exponentialRampToValueAtTime(0.005, t + zipDuration);

      zipSource.connect(zipFilter);
      zipFilter.connect(zipGain);
      zipGain.connect(ctx.destination);
      zipSource.start(t);

      // 2. The "Clunk" (solid margin stop impact at t + 0.11s)
      const clunkTime = t + 0.105;

      // Low platen thud
      const thudOsc = ctx.createOscillator();
      const thudGain = ctx.createGain();
      thudOsc.type = 'triangle';
      thudOsc.frequency.setValueAtTime(130, clunkTime);
      thudOsc.frequency.exponentialRampToValueAtTime(42, clunkTime + 0.07);

      thudGain.gain.setValueAtTime(0.48, clunkTime);
      thudGain.gain.exponentialRampToValueAtTime(0.001, clunkTime + 0.07);

      thudOsc.connect(thudGain);
      thudGain.connect(ctx.destination);
      thudOsc.start(clunkTime);
      thudOsc.stop(clunkTime + 0.07);

      // Metallic stop latch impact
      const metalBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.035), ctx.sampleRate);
      const metalData = metalBuffer.getChannelData(0);
      for (let i = 0; i < metalData.length; i++) {
        metalData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (metalData.length * 0.2));
      }
      const metalSource = ctx.createBufferSource();
      metalSource.buffer = metalBuffer;

      const metalFilter = ctx.createBiquadFilter();
      metalFilter.type = 'bandpass';
      metalFilter.frequency.setValueAtTime(1100, clunkTime);
      metalFilter.Q.setValueAtTime(3.0, clunkTime);

      const metalGain = ctx.createGain();
      metalGain.gain.setValueAtTime(0.35, clunkTime);
      metalGain.gain.exponentialRampToValueAtTime(0.001, clunkTime + 0.035);

      metalSource.connect(metalFilter);
      metalFilter.connect(metalGain);
      metalGain.connect(ctx.destination);
      metalSource.start(clunkTime);
    } catch {}
  }

  /**
   * Mechanical bell/chime (kept available for vintage chime variant).
   */
  public playBell() {
    this.playCarriageReturn();
  }

  /**
   * Synthesizes authentic dot-matrix printhead buzz (shredding ribbon across paper)
   * followed by the line feed stepper motor click.
   */
  public playDotMatrixLine() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const t = ctx.currentTime;

      // High-speed needle chatter (burst of 9-pin strikes modulated)
      const bufferSize = Math.floor(ctx.sampleRate * 0.16); // 160ms burst
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        const mod = Math.sin((i / ctx.sampleRate) * 2 * Math.PI * 140);
        data[i] = (Math.random() * 2 - 1) * 0.4 * (mod > 0 ? 1 : -0.2);
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2200, t);
      filter.Q.setValueAtTime(2.8, t);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.16);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      source.start(t);

      // Stepper motor feed click at end of line (0.18s)
      const stepOsc = ctx.createOscillator();
      const stepGain = ctx.createGain();
      stepOsc.type = 'square';
      stepOsc.frequency.setValueAtTime(140, t + 0.18);
      stepOsc.frequency.exponentialRampToValueAtTime(45, t + 0.22);
      stepGain.gain.setValueAtTime(0.12, t + 0.18);
      stepGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

      stepOsc.connect(stepGain);
      stepGain.connect(ctx.destination);
      stepOsc.start(t + 0.18);
      stepOsc.stop(t + 0.22);
    } catch {}
  }

  /**
   * Synthesizes a soft, minimal 'shweep' paper flapping sound for adding a page to the stack.
   * Simulates a lightweight parchment sheet sliding and settling into the tray.
   */
  public playPaperFeed() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const t = ctx.currentTime;
      const duration = 0.16; // 160ms
      const bufferSize = Math.floor(ctx.sampleRate * duration);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);

      // Soft paper whoosh with subtle aerodynamic flap flutter
      for (let i = 0; i < bufferSize; i++) {
        const progress = i / bufferSize;
        // Smooth bell curve envelope: rapid soft rise, gentle decay
        const env = Math.sin(progress * Math.PI) * Math.exp(-progress * 1.5);
        // Aerodynamic flutter modulation (~18Hz paper flap)
        const flutter = 1 + 0.25 * Math.sin(progress * 2 * Math.PI * 18);
        data[i] = (Math.random() * 2 - 1) * env * flutter;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      // Bandpass filter sweeping smoothly upward then resting ("shweep")
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(750, t);
      filter.frequency.exponentialRampToValueAtTime(1900, t + 0.08);
      filter.frequency.exponentialRampToValueAtTime(1100, t + duration);
      filter.Q.setValueAtTime(1.4, t);

      // Very minimal, gentle gain (non-intrusive)
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      noise.start(t);
    } catch {}
  }
}

export const typewriterAudio = new TypewriterAudio();
