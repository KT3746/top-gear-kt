export class AudioBus {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem("relampago-mute") === "1";
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.engine = null;
    this.timer = null;
    this.step = 0;
    this.theme = "menu";
    this._nextAt = 0;
  }

  unlock() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.13;
    this.sfxGain.gain.value = 0.22;
    this.musicGain.connect(this.master);
    this.sfxGain.connect(this.master);
    this.master.connect(this.ctx.destination);
    this.applyMute();
    this.startMusic(this.theme || "menu");
  }

  applyMute() {
    if (this.master) this.master.gain.value = this.muted ? 0 : 1;
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem("relampago-mute", this.muted ? "1" : "0");
    this.applyMute();
    this.unlock();
    return this.muted;
  }

  beep(freq = 440, dur = 0.08, type = "sine", vol = 0.12) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g);
    g.connect(this.sfxGain);
    o.start();
    o.stop(this.ctx.currentTime + dur);
  }

  noise(dur = 0.2, vol = 0.08, cutoff = 700) {
    if (!this.ctx) return;
    const n = this.ctx.createBufferSource();
    const buf = this.ctx.createBuffer(1, Math.max(1, this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    n.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = cutoff;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    n.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    n.start();
  }

  ui() { this.beep(520, 0.05, "sine", 0.07); }
  ok() { this.beep(620, 0.1, "triangle", 0.09); }
  pickup() { this.beep(540, 0.05, "sine", 0.025); }
  go() { this.beep(196, 0.22, "sine", 0.08); this.beep(262, 0.2, "triangle", 0.06); }
  count() { this.beep(196, 0.1, "sine", 0.07); }
  bump() { this.noise(0.14, 0.1, 420); }
  nitro() {
    this.beep(160, 0.12, "sawtooth", 0.07);
    this.beep(280, 0.18, "square", 0.05);
    this.beep(520, 0.1, "sine", 0.04);
    this.noise(0.22, 0.09, 900);
  }
  finish() {
    [262, 330, 392, 523].forEach((f, i) => {
      setTimeout(() => this.beep(f, 0.2, "sine", 0.08), i * 140);
    });
  }

  setEngine(speed01, nitro) {
    if (!this.ctx) return;
    if (!this.engine) {
      const o1 = this.ctx.createOscillator();
      const o2 = this.ctx.createOscillator();
      const f = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();
      o1.type = "triangle";
      o2.type = "sine";
      o1.frequency.value = 48;
      o2.frequency.value = 96;
      f.type = "lowpass";
      f.frequency.value = 280;
      f.Q.value = 0.7;
      g.gain.value = 0.0001;
      o1.connect(f);
      o2.connect(f);
      f.connect(g);
      g.connect(this.sfxGain);
      o1.start();
      o2.start();
      this.engine = { o1, o2, f, g };
    }
    const now = this.ctx.currentTime;
    const racing = this.theme === "race";
    const freq = 42 + speed01 * 88 + (nitro ? 18 : 0);
    const cutoff = 220 + speed01 * 260 + (nitro ? 90 : 0);
    const gain = racing ? (0.012 + speed01 * 0.038 + (nitro ? 0.012 : 0)) : 0.0001;
    this.engine.o1.frequency.setTargetAtTime(freq, now, 0.08);
    this.engine.o2.frequency.setTargetAtTime(freq * 2.02, now, 0.08);
    this.engine.f.frequency.setTargetAtTime(cutoff, now, 0.1);
    this.engine.g.gain.setTargetAtTime(gain, now, 0.1);
  }

  stopMusic() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // Original SNES-racer vibe (new tune — not a copy of any commercial track).
  patterns() {
    const n = (midi) => midi ? 440 * Math.pow(2, (midi - 69) / 12) : 0;
    if (this.theme === "race") {
      // 32-step groove: punchy bass + catchy hook, less noisy than before
      return {
        bpm: 132,
        steps: 32,
        bass: [
          36,0,36,0, 36,0,43,0, 38,0,38,0, 38,0,45,0,
          41,0,41,0, 41,0,48,0, 43,0,43,38, 36,0,31,0,
        ].map(n),
        lead: [
          72,0,74,76, 0,76,74,72, 67,0,69,71, 0,72,0,0,
          74,0,72,69, 0,67,69,72, 76,0,74,72, 71,69,67,0,
        ].map(n),
        lead2: [
          60,0,0,64, 0,0,67,0, 59,0,0,62, 0,0,66,0,
          60,0,0,64, 0,0,67,0, 62,0,0,66, 0,64,0,0,
        ].map(n),
        hat: [
          1,0,1,0, 1,0,1,1, 1,0,1,0, 1,0,1,1,
          1,0,1,0, 1,0,1,1, 1,0,1,0, 1,1,1,0,
        ],
        kick: [
          1,0,0,0, 1,0,0,1, 1,0,0,0, 1,0,0,0,
          1,0,0,0, 1,0,0,1, 1,0,0,0, 1,0,1,0,
        ],
      };
    }
    // Menu: warmer, slower, melodic
    return {
      bpm: 100,
      steps: 32,
      bass: [
        36,0,0,36, 0,0,43,0, 38,0,0,38, 0,0,45,0,
        41,0,0,41, 0,0,48,0, 43,0,0,38, 36,0,31,0,
      ].map(n),
      lead: [
        67,0,69,71, 0,72,0,71, 69,0,67,64, 0,67,0,0,
        69,0,71,72, 0,74,0,72, 71,0,69,67, 0,64,0,0,
      ].map(n),
      lead2: [
        55,0,0,0, 60,0,0,0, 57,0,0,0, 62,0,0,0,
        60,0,0,0, 64,0,0,0, 62,0,0,0, 59,0,0,0,
      ].map(n),
      hat: [
        1,0,0,1, 1,0,1,0, 1,0,0,1, 1,0,1,0,
        1,0,0,1, 1,0,1,0, 1,0,0,1, 1,0,1,1,
      ],
      kick: [
        1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0,
        1,0,0,0, 0,0,1,0, 1,0,0,0, 1,0,0,0,
      ],
    };
  }

  startMusic(theme) {
    this.theme = theme;
    if (!this.ctx) return;
    this.stopMusic();
    this.step = 0;
    const p = this.patterns();
    const stepMs = Math.max(80, Math.round(60000 / p.bpm / 4));
    this._sched = p;
    // Schedule slightly ahead so mobile stays steady
    this._nextAt = this.ctx.currentTime + 0.05;
    this.timer = setInterval(() => this.tick(), Math.max(20, stepMs / 2));
  }

  tick() {
    if (!this.ctx || !this._sched) return;
    const p = this._sched;
    const stepDur = 60 / p.bpm / 4;
    const now = this.ctx.currentTime;
    // Catch up if tab lagged
    if (this._nextAt < now - 0.25) this._nextAt = now + 0.02;
    while (this._nextAt <= now + 0.08) {
      const i = this.step % p.steps;
      const t = this._nextAt;
      if (!this.muted) {
        const race = this.theme === "race";
        if (p.bass[i]) this.tone(p.bass[i], stepDur * 0.88, "triangle", race ? 0.055 : 0.042, t);
        if (p.lead[i]) this.tone(p.lead[i], stepDur * 0.62, race ? "square" : "triangle", race ? 0.026 : 0.022, t);
        if (p.lead2[i]) this.tone(p.lead2[i], stepDur * 0.78, "sine", race ? 0.018 : 0.016, t);
        if (p.kick[i]) this.kick(t, race ? 0.045 : 0.032);
        if (p.hat[i]) this.hat(t, race ? 0.016 : 0.012);
      }
      this.step++;
      this._nextAt += stepDur;
    }
  }

  kick(time, vol) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(140, time);
    o.frequency.exponentialRampToValueAtTime(42, time + 0.12);
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.14);
    o.connect(g);
    g.connect(this.musicGain);
    o.start(time);
    o.stop(time + 0.15);
  }

  hat(time, vol) {
    const n = this.ctx.createBufferSource();
    const dur = 0.04;
    const buf = this.ctx.createBuffer(1, Math.max(1, this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    n.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 6000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);
    n.connect(f);
    f.connect(g);
    g.connect(this.musicGain);
    n.start(time);
    n.stop(time + dur);
  }

  tone(freq, dur, type, vol, time) {
    if (!freq) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    o.type = type;
    o.frequency.value = freq;
    f.type = "lowpass";
    f.frequency.value = type === "square" ? 1400 : 1600;
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + Math.max(0.03, dur));
    o.connect(f);
    f.connect(g);
    g.connect(this.musicGain);
    o.start(time);
    o.stop(time + dur + 0.02);
  }
}
