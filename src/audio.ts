import { settings } from './settings';

// Everything here is synthesized with WebAudio: no audio files to download.
export type Track = 'none' | 'cozy' | 'tension' | 'street' | 'dance' | 'store' | 'boss' | 'calm' | 'epic';
export type Ambience = 'none' | 'apartment' | 'corridor' | 'street' | 'store';
export type Sfx =
  | 'click' | 'select' | 'toast' | 'quest' | 'meow' | 'meow2' | 'purr' | 'door' | 'step' | 'beep'
  | 'kaching' | 'bump' | 'whoosh' | 'scratch' | 'honk' | 'scooter' | 'victory' | 'ding' | 'warning'
  | 'focus' | 'buzz' | 'slowmo' | 'pop' | 'secret' | 'boss' | 'eat' | 'thud' | 'hello';

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface TrackDef {
  bpm: number;
  vol: number;
  step: (a: AudioManager, s: number, t: number, out: AudioNode, sd: number) => void;
}

// Deterministic pseudo-random so loops sound composed rather than chaotic.
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const TRACKS: Record<Exclude<Track, 'none'>, TrackDef> = {
  cozy: {
    bpm: 76,
    vol: 0.55,
    step(a, s, t, out, sd) {
      const chords = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]];
      const bar = Math.floor(s / 16) % 4;
      const st = s % 16;
      const ch = chords[bar];
      const swing = st % 2 === 1 ? sd * 0.22 : 0;
      if (st === 0) ch.forEach((n, i) => a.keys(mtof(n), t + i * 0.012, sd * 14, 0.07, out));
      if (st === 10) ch.slice(1).forEach((n) => a.keys(mtof(n + 12), t, sd * 5, 0.025, out));
      if (st === 0 || st === 10) a.bass(mtof(ch[0] - 12), t, sd * 5, 0.16, out);
      if (st === 0 || st === 7 || st === 10) a.kick(t, 0.35, out);
      if (st === 4 || st === 12) a.snare(t, 0.08, out, 2500);
      if (st % 2 === 0 || st === 15) a.hat(t + swing, 0.025 + (st % 4 === 2 ? 0.015 : 0), out);
      if (hash(s * 3.1) > 0.82 && st % 2 === 0) {
        const pent = [60, 62, 65, 67, 69, 72, 74];
        a.pluck(mtof(pent[Math.floor(hash(s) * pent.length)] + 12), t + swing, 0.05, out);
      }
    },
  },
  calm: {
    bpm: 68,
    vol: 0.5,
    step(a, s, t, out, sd) {
      const chords = [[48, 55, 64, 67], [45, 52, 60, 64], [41, 48, 57, 64], [43, 50, 59, 62]];
      const bar = Math.floor(s / 16) % 4;
      const st = s % 16;
      const ch = chords[bar];
      if (st === 0) {
        a.pad(ch.map(mtof), t, sd * 16, 0.035, out);
        a.bass(mtof(ch[0] - 12), t, sd * 8, 0.13, out);
      }
      const mel = [76, 74, 72, 74, 76, 79, 76, 72];
      if (st % 4 === 0) a.bell(mtof(mel[(Math.floor(s / 4) + bar) % mel.length]), t, 0.04, out);
      if (st === 8) a.kick(t, 0.18, out);
      if (st % 4 === 2) a.hat(t, 0.015, out);
    },
  },
  street: {
    bpm: 94,
    vol: 0.45,
    step(a, s, t, out, sd) {
      const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
      const bar = Math.floor(s / 16) % 4;
      const st = s % 16;
      const ch = chords[bar];
      if (st === 0) a.pad(ch.map(mtof), t, sd * 16, 0.025, out);
      if (st === 0 || st === 6 || st === 10) a.bass(mtof(ch[0] - 12), t, sd * 3, 0.14, out);
      if (st % 2 === 0) a.pluck(mtof(ch[(st / 2) % 3] + 12 + (st > 8 ? 12 : 0)), t, 0.035, out);
      if (st === 0 || st === 8) a.kick(t, 0.25, out);
      if (st === 4 || st === 12) a.snare(t, 0.05, out, 3000);
      a.shaker(t, st % 4 === 2 ? 0.03 : 0.012, out);
    },
  },
  tension: {
    bpm: 66,
    vol: 0.5,
    step(a, s, t, out, sd) {
      const st = s % 16;
      if (st === 0) a.drone(mtof(33), t, sd * 16, 0.12, out);
      if (st % 4 === 0) a.wood(t, st === 0 ? 0.12 : 0.07, out);
      if (st === 6 || st === 14) a.bell(mtof(hash(s) > 0.5 ? 81 : 80), t, 0.03, out);
    },
  },
  dance: {
    bpm: 158,
    vol: 0.5,
    step(a, s, t, out, sd) {
      const roots = [40, 36, 38, 35];
      const bar = Math.floor(s / 16) % 4;
      const st = s % 16;
      const r = roots[bar];
      if (st % 2 === 0) a.bass(mtof(r + (st % 4 === 2 ? 12 : 0)), t, sd * 1.6, 0.16, out, 'sawtooth');
      if (st % 4 === 0) a.kick(t, 0.5, out);
      if (st === 4 || st === 12) a.snare(t, 0.16, out, 1800);
      if (st % 2 === 1) a.hat(t, 0.03, out);
      if (st === 0 || st === 3 || st === 6) a.brass([r + 24, r + 31, r + 36].map(mtof), t, sd * 1.5, 0.05, out);
    },
  },
  boss: {
    bpm: 138,
    vol: 0.55,
    step(a, s, t, out, sd) {
      const chords = [[50, 57, 62, 65], [46, 53, 58, 62], [48, 55, 60, 64], [45, 52, 57, 61]];
      const bar = Math.floor(s / 16) % 4;
      const st = s % 16;
      const ch = chords[bar];
      if (st === 0) a.choir(ch.slice(1).map((n) => mtof(n)), t, sd * 16, 0.035, out);
      if (st % 2 === 0) a.bass(mtof(ch[0] - 12), t, sd * 1.5, 0.15, out, 'sawtooth');
      if (st === 0 || st === 3 || st === 6 || st === 10) a.tom(t, st === 0 ? 0.6 : 0.4, out);
      if (st === 4 || st === 12) a.snare(t, 0.14, out, 1600);
      if (bar === 3 && st >= 12) a.snare(t, 0.06 + (st - 12) * 0.02, out, 1600);
      if (st === 0 || st === 6 || st === 8 || st === 14) a.brass(ch.map((n) => mtof(n + 12)), t, sd * 1.2, 0.045, out);
      if (st % 2 === 1) a.hat(t, 0.02, out);
    },
  },
  epic: {
    bpm: 84,
    vol: 0.6,
    step(a, s, t, out, sd) {
      const chords = [[50, 57, 62, 65], [46, 53, 58, 62], [48, 55, 60, 64], [45, 52, 57, 61]];
      const bar = Math.floor(s / 16) % 4;
      const st = s % 16;
      const ch = chords[bar];
      if (st === 0) {
        a.choir(ch.map((n) => mtof(n + 12)), t, sd * 16, 0.04, out);
        a.tom(t, 0.8, out);
        a.boom(t, 0.5, out);
        a.brass(ch.map((n) => mtof(n + 12)), t, sd * 6, 0.05, out);
      }
      if (st === 8 || st === 11 || st === 14) a.tom(t, 0.45, out);
      if (st % 4 === 2) a.pluck(mtof(ch[1] + 24), t, 0.03, out);
    },
  },
  store: {
    bpm: 112,
    vol: 0.4,
    step(a, s, t, out, sd) {
      const chords = [[48, 52, 55, 59], [45, 48, 52, 55], [50, 53, 57, 60], [43, 47, 50, 53]];
      const bar = Math.floor(s / 16) % 4;
      const st = s % 16;
      const ch = chords[bar];
      if ([0, 3, 6, 10, 12].includes(st)) ch.forEach((n) => a.keys(mtof(n + 12), t, sd * 2.5, 0.025, out));
      if (st === 0 || st === 8) a.bass(mtof(ch[0] - 12), t, sd * 4, 0.13, out);
      if (st === 6 || st === 14) a.bass(mtof(ch[0] - 5), t, sd * 2, 0.1, out);
      a.shaker(t, st % 2 === 0 ? 0.02 : 0.008, out);
      const mel = [72, 0, 76, 74, 0, 72, 69, 0, 71, 0, 74, 72, 0, 0, 67, 0];
      const m = mel[(st + bar * 4) % 16];
      if (m && st % 2 === 0) a.flute(mtof(m), t, sd * 2, 0.035, out);
    },
  },
};

export class AudioManager {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private musicFilter!: BiquadFilterNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private brownBuf!: AudioBuffer;

  track: Track = 'none';
  private trackOut: GainNode | null = null;
  private step = 0;
  private nextTime = 0;

  heartbeat = 0;
  private nextBeat = 0;

  private ambFilter!: BiquadFilterNode;
  private ambGain!: GainNode;
  private humGain!: GainNode;
  private ambience: Ambience = 'none';
  private nextAmbEvent = 0;
  private duck = 1;

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 18000;
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.musicFilter).connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.ambBus = ctx.createGain();
    this.ambBus.connect(this.master);

    // White + brown noise buffers, shared by all percussion and ambience.
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    this.brownBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const w = this.noiseBuf.getChannelData(0);
    const b = this.brownBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      w[i] = Math.random() * 2 - 1;
      last = (last + 0.02 * w[i]) / 1.02;
      b[i] = last * 3.5;
    }

    // Ambience bed: looping brown noise + electrical hum.
    const src = ctx.createBufferSource();
    src.buffer = this.brownBuf;
    src.loop = true;
    this.ambFilter = ctx.createBiquadFilter();
    this.ambFilter.type = 'lowpass';
    this.ambFilter.frequency.value = 400;
    this.ambGain = ctx.createGain();
    this.ambGain.gain.value = 0;
    src.connect(this.ambFilter).connect(this.ambGain).connect(this.ambBus);
    src.start();
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    [120, 240].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = i ? 0.3 : 1;
      o.connect(g).connect(this.humGain);
      o.start();
    });
    this.humGain.connect(this.ambBus);

    this.applyVolumes();
    window.setInterval(() => this.tick(), 25);
    const wanted = this.track;
    this.track = 'none';
    this.setAmbience(this.ambience, true);
    this.play(wanted);
  }

  applyVolumes() {
    if (!this.ctx) return;
    const m = settings.muted ? 0 : settings.master;
    this.master.gain.setTargetAtTime(m, this.ctx.currentTime, 0.05);
    this.musicBus.gain.setTargetAtTime(settings.music * this.duck, this.ctx.currentTime, 0.2);
    this.sfxBus.gain.setTargetAtTime(settings.sfx, this.ctx.currentTime, 0.05);
    this.ambBus.gain.setTargetAtTime(settings.sfx * 0.9, this.ctx.currentTime, 0.05);
  }

  /** Duck music (e.g. dramatic pauses). 1 = normal. */
  setDuck(v: number) {
    this.duck = v;
    this.applyVolumes();
  }

  /** Muffle music (focus / slow-mo). */
  private muffled = false;
  setMuffle(on: boolean) {
    if (!this.ctx || on === this.muffled) return;
    this.muffled = on;
    this.musicFilter.frequency.setTargetAtTime(on ? 650 : 18000, this.ctx.currentTime, 0.25);
  }

  play(track: Track, fade = 1.2) {
    if (track === this.track) return;
    this.track = track;
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (this.trackOut) {
      const old = this.trackOut;
      old.gain.cancelScheduledValues(now);
      old.gain.setValueAtTime(old.gain.value, now);
      old.gain.linearRampToValueAtTime(0, now + fade);
      setTimeout(() => old.disconnect(), (fade + 0.6) * 1000);
      this.trackOut = null;
    }
    if (track === 'none') return;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(TRACKS[track].vol, now + Math.min(fade, 0.8));
    g.connect(this.musicBus);
    this.trackOut = g;
    this.step = 0;
    this.nextTime = now + 0.06;
  }

  /** Abrupt stop for comedic timing. */
  stopMusic() {
    this.play('none', 0.05);
  }

  setAmbience(a: Ambience, force = false) {
    if (a === this.ambience && !force) return;
    this.ambience = a;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const cfg: Record<Ambience, [number, number, number]> = {
      none: [0, 300, 0],
      apartment: [0.05, 260, 0],
      corridor: [0.03, 300, 0.012],
      street: [0.16, 520, 0],
      store: [0.04, 220, 0.016],
    };
    const [g, f, hum] = cfg[a];
    this.ambGain.gain.setTargetAtTime(g, t, 0.6);
    this.ambFilter.frequency.setTargetAtTime(f, t, 0.6);
    this.humGain.gain.setTargetAtTime(hum, t, 0.6);
    this.nextAmbEvent = t + 2;
  }

  private tick() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (this.track !== 'none' && this.trackOut) {
      const def = TRACKS[this.track];
      const sd = 60 / def.bpm / 4;
      if (this.nextTime < now - 0.5) this.nextTime = now + 0.02;
      while (this.nextTime < now + 0.12) {
        def.step(this, this.step, this.nextTime, this.trackOut, sd);
        this.nextTime += sd;
        this.step++;
      }
    }
    // Heartbeat layer driven by the Thought Spiral.
    if (this.heartbeat > 0.02) {
      if (this.nextBeat < now) this.nextBeat = now + 0.05;
      if (this.nextBeat < now + 0.12) {
        const v = Math.min(1, this.heartbeat) * 0.55;
        this.thump(this.nextBeat, v);
        this.thump(this.nextBeat + 0.16, v * 0.7);
        this.nextBeat += 60 / (68 + this.heartbeat * 62);
      }
    }
    // Random ambient events.
    if (now > this.nextAmbEvent) {
      if (this.ambience === 'street') {
        const r = Math.random();
        if (r < 0.35) this.honkAt(now, 0.05 + Math.random() * 0.05, 0.6 + Math.random() * 0.5);
        else if (r < 0.65) this.scooterAt(now, 0.06);
        else this.crickets(now);
        this.nextAmbEvent = now + 3 + Math.random() * 5;
      } else if (this.ambience === 'apartment') {
        if (Math.random() < 0.4) this.honkAt(now, 0.012, 0.5);
        this.nextAmbEvent = now + 8 + Math.random() * 10;
      } else {
        this.nextAmbEvent = now + 5;
      }
    }
  }

  // ---------- instruments ----------
  private env(t: number, vol: number, attack: number, dur: number, release: number, dest: AudioNode) {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.setTargetAtTime(0, t + attack + dur, release / 3);
    g.connect(dest);
    return g;
  }

  private osc(type: OscillatorType, f: number, t: number, len: number, dest: AudioNode, detune = 0) {
    const o = this.ctx!.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.detune.value = detune;
    o.connect(dest);
    o.start(t);
    o.stop(t + len);
    return o;
  }

  private noise(t: number, len: number, dest: AudioNode, buf = this.noiseBuf) {
    const s = this.ctx!.createBufferSource();
    s.buffer = buf;
    s.connect(dest);
    s.start(t, Math.random() * 1.5);
    s.stop(t + len);
    return s;
  }

  keys(f: number, t: number, dur: number, vol: number, out: AudioNode) {
    const g = this.env(t, vol, 0.01, 0.05, dur, out);
    this.osc('sine', f, t, dur + 0.5, g);
    const g2 = this.env(t, vol * 0.3, 0.005, 0.02, 0.3, out);
    this.osc('triangle', f * 2, t, 0.6, g2);
  }

  pluck(f: number, t: number, vol: number, out: AudioNode) {
    const g = this.env(t, vol, 0.004, 0.02, 0.45, out);
    this.osc('triangle', f, t, 0.8, g);
  }

  bell(f: number, t: number, vol: number, out: AudioNode) {
    const g = this.env(t, vol, 0.003, 0.03, 1.4, out);
    this.osc('sine', f, t, 2, g);
    const g2 = this.env(t, vol * 0.25, 0.003, 0.01, 0.5, out);
    this.osc('sine', f * 2.76, t, 1, g2);
  }

  flute(f: number, t: number, dur: number, vol: number, out: AudioNode) {
    const g = this.env(t, vol, 0.05, dur * 0.7, 0.2, out);
    const o = this.osc('sine', f, t, dur + 0.4, g);
    const lfo = this.ctx!.createOscillator();
    const lg = this.ctx!.createGain();
    lfo.frequency.value = 5.5;
    lg.gain.value = 6;
    lfo.connect(lg).connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.4);
  }

  bass(f: number, t: number, dur: number, vol: number, out: AudioNode, type: OscillatorType = 'triangle') {
    const lp = this.ctx!.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = type === 'sawtooth' ? 500 : 900;
    lp.connect(out);
    const g = this.env(t, vol, 0.01, dur * 0.6, 0.15, lp);
    this.osc(type, f, t, dur + 0.3, g);
  }

  pad(fs: number[], t: number, dur: number, vol: number, out: AudioNode) {
    const lp = this.ctx!.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    lp.connect(out);
    const g = this.env(t, vol, dur * 0.3, dur * 0.5, dur * 0.4, lp);
    fs.forEach((f) => {
      this.osc('sawtooth', f, t, dur * 1.3, g, -7);
      this.osc('sawtooth', f, t, dur * 1.3, g, 7);
    });
  }

  choir(fs: number[], t: number, dur: number, vol: number, out: AudioNode) {
    const bp = this.ctx!.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 1.2;
    bp.connect(out);
    const g = this.env(t, vol * 1.6, 0.4, dur * 0.7, 0.6, bp);
    fs.forEach((f) => {
      this.osc('sawtooth', f, t, dur + 1, g, -9);
      this.osc('sawtooth', f, t, dur + 1, g, 9);
    });
  }

  brass(fs: number[], t: number, dur: number, vol: number, out: AudioNode) {
    const lp = this.ctx!.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(400, t);
    lp.frequency.linearRampToValueAtTime(2600, t + 0.06);
    lp.frequency.setTargetAtTime(900, t + 0.08, 0.15);
    lp.connect(out);
    const g = this.env(t, vol, 0.02, dur, 0.12, lp);
    fs.forEach((f) => this.osc('sawtooth', f, t, dur + 0.4, g, (Math.random() - 0.5) * 10));
  }

  drone(f: number, t: number, dur: number, vol: number, out: AudioNode) {
    const lp = this.ctx!.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    lp.connect(out);
    const g = this.env(t, vol, 1, dur - 1, 1, lp);
    this.osc('sawtooth', f, t, dur + 1.2, g, -5);
    this.osc('sawtooth', f * 1.5, t, dur + 1.2, g, 5);
  }

  kick(t: number, vol: number, out: AudioNode) {
    const g = this.env(t, vol, 0.002, 0.05, 0.25, out);
    const o = this.osc('sine', 140, t, 0.4, g);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  }

  tom(t: number, vol: number, out: AudioNode) {
    const g = this.env(t, vol * 0.7, 0.002, 0.08, 0.5, out);
    const o = this.osc('sine', 110, t, 0.8, g);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.3);
  }

  boom(t: number, vol: number, out: AudioNode) {
    const lp = this.ctx!.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    lp.connect(out);
    const g = this.env(t, vol, 0.005, 0.2, 1.6, lp);
    this.noise(t, 2.2, g, this.brownBuf);
  }

  snare(t: number, vol: number, out: AudioNode, f = 2000) {
    const bp = this.ctx!.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f;
    bp.connect(out);
    const g = this.env(t, vol, 0.001, 0.02, 0.14, bp);
    this.noise(t, 0.25, g);
  }

  hat(t: number, vol: number, out: AudioNode) {
    const hp = this.ctx!.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    hp.connect(out);
    const g = this.env(t, vol, 0.001, 0.005, 0.04, hp);
    this.noise(t, 0.08, g);
  }

  shaker(t: number, vol: number, out: AudioNode) {
    const hp = this.ctx!.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 5000;
    hp.connect(out);
    const g = this.env(t, vol, 0.01, 0.01, 0.05, hp);
    this.noise(t, 0.1, g);
  }

  wood(t: number, vol: number, out: AudioNode) {
    const g = this.env(t, vol, 0.001, 0.005, 0.05, out);
    this.osc('sine', 1400, t, 0.1, g);
  }

  private thump(t: number, vol: number) {
    const g = this.env(t, vol, 0.004, 0.03, 0.18, this.sfxBus);
    const o = this.osc('sine', 62, t, 0.3, g);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.12);
  }

  private honkAt(t: number, vol: number, pan: number) {
    const g = this.env(t, vol, 0.01, 0.25 * pan, 0.08, this.ambBus);
    this.osc('square', 392, t, 0.6, g);
    this.osc('square', 494, t, 0.6, g);
  }

  private scooterAt(t: number, vol: number) {
    const lp = this.ctx!.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    lp.connect(this.ambBus);
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 1.2);
    g.gain.linearRampToValueAtTime(0, t + 2.6);
    g.connect(lp);
    const o = this.osc('sawtooth', 85, t, 2.8, g);
    o.frequency.linearRampToValueAtTime(110, t + 1.2);
    o.frequency.linearRampToValueAtTime(78, t + 2.6);
  }

  private crickets(t: number) {
    for (let i = 0; i < 6; i++) {
      const g = this.env(t + i * 0.09, 0.008, 0.005, 0.02, 0.03, this.ambBus);
      this.osc('sine', 4200 + Math.random() * 300, t + i * 0.09, 0.1, g);
    }
  }

  // ---------- sound effects ----------
  sfx(name: Sfx, vol = 1) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.01;
    const out = this.sfxBus;
    switch (name) {
      case 'click': {
        const g = this.env(t, 0.12 * vol, 0.002, 0.01, 0.05, out);
        const o = this.osc('triangle', 900, t, 0.1, g);
        o.frequency.exponentialRampToValueAtTime(600, t + 0.06);
        break;
      }
      case 'select':
        [660, 990].forEach((f, i) => this.pluck(f, t + i * 0.06, 0.14 * vol, out));
        break;
      case 'toast':
        [72, 76, 79, 84].forEach((n, i) => this.pluck(mtof(n), t + i * 0.06, 0.12 * vol, out));
        break;
      case 'secret':
        [79, 83, 86, 91, 95].forEach((n, i) => this.bell(mtof(n), t + i * 0.07, 0.07 * vol, out));
        break;
      case 'quest':
        this.brass([62, 69, 74, 78].map(mtof), t, 0.3, 0.09 * vol, out);
        this.brass([64, 71, 76, 79].map(mtof), t + 0.35, 0.8, 0.1 * vol, out);
        this.tom(t, 0.6 * vol, out);
        this.tom(t + 0.35, 0.7 * vol, out);
        this.boom(t + 0.35, 0.4 * vol, out);
        break;
      case 'boss':
        this.boom(t, 0.7 * vol, out);
        this.brass([38, 45, 50].map(mtof), t, 1.2, 0.12 * vol, out);
        break;
      case 'victory':
        [[72, 0], [72, 0.12], [72, 0.24], [76, 0.4], [79, 0.6], [84, 0.8]].forEach(([n, d]) =>
          this.brass([mtof(n), mtof(n - 12)], t + d, d === 0.8 ? 1 : 0.1, 0.07 * vol, out),
        );
        this.kick(t + 0.8, 0.5, out);
        this.boom(t + 0.8, 0.3, out);
        break;
      case 'meow':
      case 'meow2': {
        const p = name === 'meow2' ? 1.25 : 1;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = 3;
        bp.frequency.setValueAtTime(900 * p, t);
        bp.frequency.linearRampToValueAtTime(2200 * p, t + 0.18);
        bp.frequency.linearRampToValueAtTime(800 * p, t + 0.55);
        bp.connect(out);
        const g = this.env(t, 0.35 * vol, 0.04, 0.35, 0.15, bp);
        const o = this.osc('sawtooth', 480 * p, t, 0.7, g);
        o.frequency.linearRampToValueAtTime(720 * p, t + 0.16);
        o.frequency.linearRampToValueAtTime(430 * p, t + 0.55);
        break;
      }
      case 'purr': {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 300;
        lp.connect(out);
        const g = ctx.createGain();
        g.gain.value = 0;
        g.connect(lp);
        const am = ctx.createOscillator();
        const amg = ctx.createGain();
        am.frequency.value = 24;
        amg.gain.value = 0.18 * vol;
        am.connect(amg).connect(g.gain);
        am.start(t);
        am.stop(t + 2.2);
        this.noise(t, 2.2, g, this.brownBuf);
        break;
      }
      case 'eat':
        for (let i = 0; i < 6; i++) {
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.value = 1800 + Math.random() * 800;
          bp.connect(out);
          const g = this.env(t + i * 0.22, 0.25 * vol, 0.002, 0.02, 0.05, bp);
          this.noise(t + i * 0.22, 0.1, g);
        }
        break;
      case 'door': {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 400;
        lp.connect(out);
        const g = this.env(t, 0.5 * vol, 0.005, 0.05, 0.25, lp);
        this.noise(t, 0.4, g, this.brownBuf);
        const g2 = this.env(t + 0.05, 0.03 * vol, 0.05, 0.3, 0.1, out);
        const o = this.osc('sawtooth', 300, t + 0.05, 0.6, g2);
        o.frequency.linearRampToValueAtTime(420, t + 0.4);
        break;
      }
      case 'thud': {
        const g = this.env(t, 0.4 * vol, 0.002, 0.03, 0.15, out);
        const o = this.osc('sine', 120, t, 0.3, g);
        o.frequency.exponentialRampToValueAtTime(50, t + 0.15);
        break;
      }
      case 'step': {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 900 + Math.random() * 300;
        lp.connect(out);
        const g = this.env(t, 0.06 * vol, 0.002, 0.01, 0.05, lp);
        this.noise(t, 0.08, g);
        break;
      }
      case 'beep': {
        const g = this.env(t, 0.08 * vol, 0.002, 0.07, 0.02, out);
        this.osc('square', 1850, t, 0.15, g);
        break;
      }
      case 'kaching': {
        this.snare(t, 0.2 * vol, out, 4000);
        [2093, 2637, 3136].forEach((f, i) => this.bell(f, t + 0.08 + i * 0.03, 0.06 * vol, out));
        break;
      }
      case 'bump': {
        const g = this.env(t, 0.3 * vol, 0.005, 0.08, 0.2, out);
        const o = this.osc('sine', 340, t, 0.4, g);
        o.frequency.exponentialRampToValueAtTime(110, t + 0.25);
        break;
      }
      case 'whoosh': {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = 2;
        bp.frequency.setValueAtTime(400, t);
        bp.frequency.exponentialRampToValueAtTime(3000, t + 0.3);
        bp.connect(out);
        const g = this.env(t, 0.25 * vol, 0.12, 0.08, 0.15, bp);
        this.noise(t, 0.5, g);
        break;
      }
      case 'scratch': {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = 4;
        bp.frequency.setValueAtTime(1200, t);
        bp.frequency.linearRampToValueAtTime(3500, t + 0.08);
        bp.frequency.linearRampToValueAtTime(600, t + 0.22);
        bp.connect(out);
        const g = this.env(t, 0.5 * vol, 0.005, 0.18, 0.05, bp);
        this.noise(t, 0.3, g);
        break;
      }
      case 'honk':
        this.honkAt(t, 0.12 * vol, 1);
        break;
      case 'scooter':
        this.scooterAt(t, 0.1 * vol);
        break;
      case 'ding':
        this.bell(1318, t, 0.12 * vol, out);
        this.bell(1046, t + 0.25, 0.12 * vol, out);
        break;
      case 'warning':
        [0, 0.22].forEach((d) => {
          const g = this.env(t + d, 0.06 * vol, 0.01, 0.12, 0.05, out);
          this.osc('sawtooth', 220, t + d, 0.25, g);
          this.osc('sawtooth', 233, t + d, 0.25, g);
        });
        break;
      case 'focus': {
        this.bell(mtof(84), t, 0.06 * vol, out);
        this.bell(mtof(91), t + 0.15, 0.05 * vol, out);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 900;
        bp.connect(out);
        const g = this.env(t, 0.12 * vol, 0.8, 0.2, 0.9, bp);
        this.noise(t, 2, g);
        break;
      }
      case 'buzz':
        for (let i = 0; i < 2; i++) {
          const g = this.env(t + i * 0.3, 0.06 * vol, 0.005, 0.18, 0.02, out);
          this.osc('square', 150, t + i * 0.3, 0.25, g);
        }
        break;
      case 'slowmo': {
        const g = this.env(t, 0.25 * vol, 0.02, 0.5, 0.4, out);
        const o = this.osc('sawtooth', 220, t, 1.2, g);
        o.frequency.exponentialRampToValueAtTime(50, t + 0.9);
        const lp = ctx.createBiquadFilter();
        lp.frequency.value = 600;
        o.disconnect();
        o.connect(lp).connect(g);
        break;
      }
      case 'pop':
        this.pluck(1320, t, 0.12 * vol, out);
        break;
      case 'hello': {
        const g = this.env(t, 0.08 * vol, 0.01, 0.12, 0.08, out);
        const o = this.osc('triangle', 330, t, 0.35, g);
        o.frequency.linearRampToValueAtTime(440, t + 0.1);
        o.frequency.linearRampToValueAtTime(370, t + 0.25);
        break;
      }
    }
  }
}

export const audio = new AudioManager();
