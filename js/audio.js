export class AudioBus {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem("relampago-mute") === "1";
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.engine = null;
    this.pad = null;
    this.timer = null;
    this.step = 0;
    this.theme = "menu";
  }

  unlock() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.12;
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
  go() { this.beep(196, 0.22, "sine", 0.08); this.beep(262, 0.2, "triangle", 0.06); }
  count() { this.beep(196, 0.1, "sine", 0.07); }
  bump() { this.noise(0.14, 0.1, 420); }
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

  stopPad() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.pad) {
      try {
        this.pad.g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.08);
        this.pad.o1.stop(this.ctx.currentTime + 0.12);
        this.pad.o2.stop(this.ctx.currentTime + 0.12);
      } catch {}
      this.pad = null;
    }
  }

  startPad(freqs, vol) {
    if (!this.ctx) return;
    const o1 = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    const f = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    o1.type = "sine";
    o2.type = "sine";
    o1.frequency.value = freqs[0];
    o2.frequency.value = freqs[1];
    f.type = "lowpass";
    f.frequency.value = 420;
    g.gain.value = vol;
    o1.connect(f);
    o2.connect(f);
    f.connect(g);
    g.connect(this.musicGain);
    o1.start();
    o2.start();
    this.pad = { o1, o2, f, g };
  }

  startMusic(theme) {
    this.theme = theme;
    if (!this.ctx) return;
    this.stopPad();
    this.step = 0;
    if (theme === "race") {
      this.startPad([55, 82.4], 0.045);
      this.timer = setInterval(() => this.tick(), 920);
    } else {
      this.startPad([65.4, 98], 0.04);
      this.timer = setInterval(() => this.tick(), 1400);
    }
  }

  tick() {
    if (!this.ctx || this.muted) {
      this.step++;
      return;
    }
    const t = this.ctx.currentTime;
    const race = this.theme === "race";
    const bass = race ? [55, 61.7, 49, 55] : [65.4, 73.4, 55, 65.4];
    const i = this.step % 4;
    this.tone(bass[i], race ? 0.55 : 0.7, "sine", race ? 0.035 : 0.03, t);
    if (this.pad) {
      this.pad.o1.frequency.setTargetAtTime(bass[i], t, 0.2);
      this.pad.o2.frequency.setTargetAtTime(bass[i] * 1.5, t, 0.25);
    }
    this.step++;
  }

  tone(freq, dur, type, vol, time) {
    if (!freq) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);
    o.connect(g);
    g.connect(this.musicGain);
    o.start(time);
    o.stop(time + dur);
  }
}
