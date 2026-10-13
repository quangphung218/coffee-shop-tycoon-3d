import type { GameEvent } from '../sim/types';

/**
 * Sounds synthesised with Web Audio, no files: doorbell, coffee machine,
 * cash, notification, angry customer and a soft looping chord pad. The
 * AudioContext is only created by unlock(), which main.ts calls on the
 * player's first click or key press (browsers block audio before that).
 */

export type SoundName = 'doorbell' | 'brew' | 'cash' | 'notify' | 'angry';

export interface Audio {
  /** Creates or resumes the AudioContext; call from a user gesture. */
  unlock(): void;
  /** 0..1 each. */
  setVolumes(music: number, sfx: number): void;
  play(name: SoundName): void;
  /** Plays the sounds for one frame of sim events. */
  handleEvents(events: readonly GameEvent[]): void;
  setMusic(on: boolean): void;
  dispose(): void;
}

/** Same sound again within this window is skipped, so 4x speed does not stack dozens of bells. */
const MIN_GAP_S: Record<SoundName, number> = { doorbell: 0.25, brew: 1.2, cash: 0.12, notify: 0.3, angry: 0.4 };

export function soundForEvent(event: GameEvent): SoundName | null {
  switch (event.type) {
    case 'doorbell':
      return 'doorbell';
    case 'brew':
      return 'brew';
    case 'cash':
      return 'cash';
    case 'angry':
      return 'angry';
    case 'notify':
    case 'low_stock':
    case 'dayEnded':
      return 'notify';
    default:
      return null;
  }
}

const MUSIC_GAIN = 0.16;
const SFX_GAIN = 0.5;
/** C – Am – F – G, each chord one bar. Frequencies in Hz. */
const CHORDS: readonly (readonly number[])[] = [
  [261.63, 329.63, 392.0],
  [220.0, 261.63, 329.63],
  [174.61, 220.0, 261.63],
  [196.0, 246.94, 293.66],
];
const BAR_S = 3.2;
const SCHEDULE_AHEAD_S = 1.0;

type Ctor = typeof AudioContext;

function audioContextCtor(): Ctor | null {
  const g = globalThis as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

export function createAudio(initial: { music: number; sfx: number }): Audio {
  let ctx: AudioContext | null = null;
  let musicBus: GainNode | null = null;
  let sfxBus: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let volumes = { ...initial };
  let musicOn = false;
  let musicTimer: ReturnType<typeof setInterval> | null = null;
  let nextBarAt = 0;
  let bar = 0;
  const lastPlayed = new Map<SoundName, number>();

  function applyVolumes(): void {
    if (!ctx || !musicBus || !sfxBus) return;
    const t = ctx.currentTime;
    musicBus.gain.setTargetAtTime(volumes.music * MUSIC_GAIN, t, 0.05);
    sfxBus.gain.setTargetAtTime(volumes.sfx * SFX_GAIN, t, 0.02);
  }

  function tone(freq: number, start: number, dur: number, type: OscillatorType, peak: number, bus: AudioNode, endFreq?: number): void {
    const c = ctx!;
    const osc = c.createOscillator();
    const env = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(peak, start + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(env).connect(bus);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  function noiseBurst(start: number, dur: number, filterFreq: number, peak: number): void {
    const c = ctx!;
    if (!noise) {
      noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = c.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, start);
    filter.Q.value = 0.8;
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(peak, start + 0.15);
    env.gain.setValueAtTime(peak, start + dur - 0.3);
    env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(filter).connect(env).connect(sfxBus!);
    src.start(start);
    src.stop(start + dur + 0.05);
  }

  const SOUNDS: Record<SoundName, (t: number) => void> = {
    // Ding-dong: two bell partials each.
    doorbell: (t) => {
      tone(1318.5, t, 0.7, 'sine', 0.5, sfxBus!);
      tone(2637, t, 0.35, 'sine', 0.12, sfxBus!);
      tone(1046.5, t + 0.28, 0.9, 'sine', 0.5, sfxBus!);
      tone(2093, t + 0.28, 0.4, 'sine', 0.12, sfxBus!);
    },
    // Machine hum plus a steam hiss.
    brew: (t) => {
      tone(110, t, 1.4, 'sawtooth', 0.05, sfxBus!);
      noiseBurst(t + 0.1, 1.3, 2600, 0.25);
    },
    // Coin "ka-ching".
    cash: (t) => {
      tone(1975.5, t, 0.12, 'square', 0.12, sfxBus!);
      tone(2637, t + 0.07, 0.35, 'triangle', 0.3, sfxBus!);
    },
    notify: (t) => {
      tone(659.25, t, 0.18, 'triangle', 0.3, sfxBus!);
      tone(987.77, t + 0.12, 0.3, 'triangle', 0.3, sfxBus!);
    },
    // Grumble: falling low sawtooth.
    angry: (t) => {
      tone(220, t, 0.45, 'sawtooth', 0.18, sfxBus!, 110);
      tone(233, t + 0.05, 0.45, 'sawtooth', 0.12, sfxBus!, 98);
    },
  };

  function scheduleMusic(): void {
    if (!ctx || !musicBus || !musicOn) return;
    // Timers are throttled in background tabs: skip missed bars instead of stacking them.
    if (nextBarAt < ctx.currentTime) nextBarAt = ctx.currentTime + 0.05;
    while (nextBarAt < ctx.currentTime + SCHEDULE_AHEAD_S) {
      const chord = CHORDS[bar % CHORDS.length]!;
      for (const f of chord) {
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = f;
        env.gain.setValueAtTime(0.0001, nextBarAt);
        env.gain.linearRampToValueAtTime(0.25, nextBarAt + 0.6);
        env.gain.linearRampToValueAtTime(0.18, nextBarAt + BAR_S - 0.6);
        env.gain.linearRampToValueAtTime(0.0001, nextBarAt + BAR_S + 0.3);
        osc.connect(env).connect(musicBus);
        osc.start(nextBarAt);
        osc.stop(nextBarAt + BAR_S + 0.4);
      }
      // A soft bass root an octave down.
      tone(chord[0]! / 2, nextBarAt, BAR_S, 'sine', 0.3, musicBus);
      nextBarAt += BAR_S;
      bar += 1;
    }
  }

  function play(name: SoundName): void {
    if (!ctx || !sfxBus || ctx.state !== 'running' || volumes.sfx <= 0) return;
    const now = ctx.currentTime;
    if (now - (lastPlayed.get(name) ?? -Infinity) < MIN_GAP_S[name]) return;
    lastPlayed.set(name, now);
    SOUNDS[name](now + 0.01);
  }

  function updateMusic(): void {
    if (!ctx) return;
    if (musicOn && !musicTimer) {
      nextBarAt = ctx.currentTime + 0.1;
      scheduleMusic();
      musicTimer = setInterval(scheduleMusic, 250);
    } else if (!musicOn && musicTimer) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
  }

  return {
    unlock() {
      if (!ctx) {
        const AC = audioContextCtor();
        if (!AC) return;
        try {
          ctx = new AC();
        } catch {
          return;
        }
        musicBus = ctx.createGain();
        sfxBus = ctx.createGain();
        musicBus.gain.value = 0;
        sfxBus.gain.value = 0;
        musicBus.connect(ctx.destination);
        sfxBus.connect(ctx.destination);
        applyVolumes();
        updateMusic();
      }
      if (ctx.state === 'suspended') void ctx.resume();
    },
    setVolumes(music, sfx) {
      volumes = { music, sfx };
      applyVolumes();
    },
    play,
    handleEvents(events) {
      for (const e of events) {
        const name = soundForEvent(e);
        if (name) play(name);
      }
    },
    setMusic(on) {
      musicOn = on;
      updateMusic();
    },
    dispose() {
      if (musicTimer) clearInterval(musicTimer);
      musicTimer = null;
      void ctx?.close();
      ctx = null;
    },
  };
}
