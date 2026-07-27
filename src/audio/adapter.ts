/**
 * The only file that touches the Web Audio API. Creates the context
 * lazily on unlock() (a user gesture, per autoplay policy) and renders
 * patches and music notes into a master → sfx/music gain graph. Every
 * method is a safe no-op when the context is unavailable (jsdom, denied
 * or failed contexts) — nothing here ever throws into game code.
 */
import type { ScheduledNote } from "./music";
import type { SynthPatch } from "./patches";

export interface AudioAdapter {
  /** Create/resume the context inside a user gesture. True once running. */
  unlock(): boolean;
  /** True while the context exists and is running. */
  readonly running: boolean;
  /** Context clock in seconds (0 when unavailable). */
  now(): number;
  setChannelGains(sfx: number, music: number): void;
  playPatch(patch: SynthPatch): void;
  /** Schedules one music note into the current music layer. */
  scheduleNote(note: ScheduledNote): void;
  /** Fades the current music layer out and fades a fresh one in. */
  swapMusicLayer(fadeSeconds: number): void;
  /** Fades out and drops the current music layer. */
  stopMusicLayer(fadeSeconds: number): void;
}

const MIN_GAIN = 0.0001;
const DEFAULT_ATTACK = 0.005;

type AudioContextCtor = new () => AudioContext;

function contextConstructor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  if (typeof AudioContext !== "undefined") return AudioContext;
  const w = window as Window & { webkitAudioContext?: AudioContextCtor };
  return w.webkitAudioContext ?? null;
}

export function createWebAudioAdapter(): AudioAdapter {
  let ctx: AudioContext | null = null;
  let sfxGain: GainNode | null = null;
  let musicGain: GainNode | null = null;
  let musicLayer: GainNode | null = null;
  let noiseBuffer: AudioBuffer | null = null;
  let pendingGains = { sfx: 1, music: 1 };
  /** Set when context creation failed; don't retry every gesture. */
  let broken = false;

  function buildGraph(context: AudioContext): void {
    sfxGain = context.createGain();
    musicGain = context.createGain();
    sfxGain.gain.value = pendingGains.sfx;
    musicGain.gain.value = pendingGains.music;
    sfxGain.connect(context.destination);
    musicGain.connect(context.destination);
  }

  function unlock(): boolean {
    if (broken) return false;
    try {
      if (!ctx) {
        const Ctor = contextConstructor();
        if (!Ctor) {
          broken = true;
          return false;
        }
        ctx = new Ctor();
        buildGraph(ctx);
      }
      if (ctx.state !== "running") {
        void ctx.resume().catch(() => undefined);
      }
      return ctx.state === "running";
    } catch {
      broken = true;
      ctx = null;
      return false;
    }
  }

  function running(): boolean {
    return ctx !== null && ctx.state === "running";
  }

  function getNoiseBuffer(context: AudioContext): AudioBuffer {
    if (!noiseBuffer) {
      const length = Math.floor(context.sampleRate);
      noiseBuffer = context.createBuffer(1, length, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }
    return noiseBuffer;
  }

  /** Attack/decay gain envelope shared by every voice. */
  function envelope(
    context: AudioContext,
    start: number,
    duration: number,
    peak: number,
    attack: number,
  ): GainNode {
    const gain = context.createGain();
    gain.gain.setValueAtTime(MIN_GAIN, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, MIN_GAIN), start + attack);
    gain.gain.exponentialRampToValueAtTime(MIN_GAIN, start + duration);
    return gain;
  }

  function playPatch(patch: SynthPatch): void {
    try {
      if (!ctx || !sfxGain || !running()) return;
      const base = ctx.currentTime;
      for (const layer of patch.layers) {
        const start = base + (layer.delay ?? 0);
        const attack = layer.attack ?? DEFAULT_ATTACK;
        const gain = envelope(ctx, start, layer.duration, layer.gain, attack);
        gain.connect(sfxGain);
        if (layer.kind === "tone") {
          const osc = ctx.createOscillator();
          osc.type = layer.wave;
          osc.frequency.setValueAtTime(Math.max(layer.freq, 1), start);
          if (layer.freqEnd !== undefined) {
            osc.frequency.exponentialRampToValueAtTime(
              Math.max(layer.freqEnd, 1),
              start + layer.duration,
            );
          }
          osc.connect(gain);
          osc.start(start);
          osc.stop(start + layer.duration + 0.05);
        } else {
          const source = ctx.createBufferSource();
          source.buffer = getNoiseBuffer(ctx);
          source.loop = true;
          if (layer.filter) {
            const filter = ctx.createBiquadFilter();
            filter.type = layer.filter.type;
            filter.frequency.value = layer.filter.freq;
            if (layer.filter.q !== undefined) filter.Q.value = layer.filter.q;
            source.connect(filter);
            filter.connect(gain);
          } else {
            source.connect(gain);
          }
          source.start(start);
          source.stop(start + layer.duration + 0.05);
        }
      }
    } catch {
      // A failed sound is silence, never a crash.
    }
  }

  /** The layer new music notes play into; created lazily at full gain. */
  function ensureMusicLayer(context: AudioContext): GainNode {
    if (!musicLayer) {
      musicLayer = context.createGain();
      musicLayer.gain.value = 1;
      musicLayer.connect(musicGain!);
    }
    return musicLayer;
  }

  function scheduleNote(note: ScheduledNote): void {
    try {
      if (!ctx || !musicGain || !running()) return;
      const layer = ensureMusicLayer(ctx);
      const attack = Math.max(note.duration * 0.15, 0.02);
      const gain = envelope(ctx, note.time, note.duration, note.gain, attack);
      gain.connect(layer);
      const osc = ctx.createOscillator();
      osc.type = note.wave;
      osc.frequency.setValueAtTime(Math.max(note.freq, 1), note.time);
      if (note.filterFreq !== undefined) {
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = note.filterFreq;
        osc.connect(filter);
        filter.connect(gain);
      } else {
        osc.connect(gain);
      }
      osc.start(note.time);
      osc.stop(note.time + note.duration + 0.1);
    } catch {
      // Skip the note.
    }
  }

  function fadeOutLayer(layer: GainNode, fadeSeconds: number): void {
    if (!ctx) return;
    const t = ctx.currentTime;
    layer.gain.cancelScheduledValues(t);
    layer.gain.setValueAtTime(Math.max(layer.gain.value, MIN_GAIN), t);
    layer.gain.exponentialRampToValueAtTime(MIN_GAIN, t + fadeSeconds);
    setTimeout(
      () => {
        try {
          layer.disconnect();
        } catch {
          // Already gone.
        }
      },
      (fadeSeconds + 0.3) * 1000,
    );
  }

  function swapMusicLayer(fadeSeconds: number): void {
    try {
      if (!ctx || !musicGain) return;
      if (musicLayer) fadeOutLayer(musicLayer, fadeSeconds);
      const t = ctx.currentTime;
      const layer = ctx.createGain();
      layer.gain.setValueAtTime(MIN_GAIN, t);
      layer.gain.linearRampToValueAtTime(1, t + fadeSeconds);
      layer.connect(musicGain);
      musicLayer = layer;
    } catch {
      musicLayer = null;
    }
  }

  function stopMusicLayer(fadeSeconds: number): void {
    try {
      if (musicLayer) fadeOutLayer(musicLayer, fadeSeconds);
    } catch {
      // Nothing to stop.
    }
    musicLayer = null;
  }

  function setChannelGains(sfx: number, music: number): void {
    pendingGains = { sfx, music };
    try {
      if (!ctx || !sfxGain || !musicGain) return;
      const t = ctx.currentTime;
      sfxGain.gain.setTargetAtTime(sfx, t, 0.03);
      musicGain.gain.setTargetAtTime(music, t, 0.03);
    } catch {
      // Applied on next unlock via pendingGains.
    }
  }

  return {
    unlock,
    get running() {
      return running();
    },
    now: () => {
      try {
        return ctx?.currentTime ?? 0;
      } catch {
        return 0;
      }
    },
    setChannelGains,
    playPatch,
    scheduleNote,
    swapMusicLayer,
    stopMusicLayer,
  };
}
