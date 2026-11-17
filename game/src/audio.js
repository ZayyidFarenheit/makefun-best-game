// INKBOUND — all sound, synthesized in code with WebAudio. One job: sound
// effects for every action plus a quiet generative music loop. No audio files.

const MUSIC_SCALE = [220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25];

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.musicTimer = 0;
    this.musicStep = 0;
    this.musicNote = 3;
  }

  // Must be called from a user gesture (click / key) the first time.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
    } catch (e) { /* audio unavailable: the game stays silent, never crashes */ }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  tone(freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noise(dur, vol, lowFreq) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = lowFreq || 1200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start(t);
  }

  shoot() { this.tone(880, 0.07, 'triangle', 0.12, 320); this.noise(0.05, 0.05, 2400); }
  hit() { this.tone(340, 0.05, 'square', 0.07, 240); }
  enemyDie() { this.tone(520, 0.16, 'sawtooth', 0.10, 90); this.noise(0.12, 0.08, 900); }
  tomeHit() { this.tone(110, 0.22, 'sine', 0.28, 55); this.noise(0.15, 0.12, 300); }
  playerHurt() { this.tone(200, 0.18, 'sawtooth', 0.14, 70); }
  dash() { this.noise(0.18, 0.10, 1800); }
  pickup() { this.tone(1320, 0.09, 'sine', 0.10, 1760); }
  trapPop() { this.tone(180, 0.25, 'sine', 0.16, 60); this.noise(0.2, 0.08, 500); }
  bossRoar() { this.tone(70, 0.9, 'sawtooth', 0.22, 45); this.noise(0.7, 0.12, 250); }
  chapter() { [523, 659, 784].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'triangle', 0.14), i * 90)); }
  upgrade() { [392, 523, 659, 784].forEach((f, i) => setTimeout(() => this.tone(f, 0.18, 'triangle', 0.13), i * 70)); }
  win() { [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => this.tone(f, 0.3, 'triangle', 0.15), i * 110)); }
  lose() { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => this.tone(f, 0.35, 'sine', 0.16), i * 140)); }
  dryClick() { this.tone(180, 0.04, 'square', 0.06); }

  // Generative ambient music: a slow pentatonic walk over a low drone.
  // Called every frame with dt; schedules a soft pluck about twice a second.
  update(dt) {
    if (!this.ctx || this.muted) return;
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    this.musicTimer = 0.45 + Math.random() * 0.25;
    this.musicStep++;
    this.musicNote += Math.floor(Math.random() * 5) - 2;
    if (this.musicNote < 0) this.musicNote = 0;
    if (this.musicNote > MUSIC_SCALE.length - 1) this.musicNote = MUSIC_SCALE.length - 1;
    this.tone(MUSIC_SCALE[this.musicNote], 0.9, 'sine', 0.045);
    if (this.musicStep % 8 === 0) this.tone(110, 2.2, 'sine', 0.035);
  }
}
