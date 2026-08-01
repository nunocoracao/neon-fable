/**
 * The only file that touches the Web Audio API. Creates the context
 * lazily on unlock() (a user gesture, per autoplay policy) and renders
 * patches and music notes into an sfx/music gain graph. Music fans out
 * one gain node per named layer under the music channel — that is the
 * mixer the adaptive score fades stems against — and every layer is
 * created silent, so nothing can ever arrive except through a fade.
 *
 * The adapter is told *what* to fade and *when*, never why: which stems
 * should be up and which bar line to move on is decided in ./score.ts
 * and ./bus.ts, where it can be tested. Every method is a safe no-op
 * when the context is unavailable (happy-dom, denied or failed
 * contexts) — nothing here ever throws into game code.
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
  /** Schedules one music note into its named layer, created if new. */
  scheduleNote(note: ScheduledNote): void;
  /**
   * Ramps a named music layer's gain to `target` over `seconds`,
   * starting at `startTime` on the context clock. Creates the layer
   * silent if it does not exist yet — which is how a stem fades in.
   */
  rampLayer(
    layer: string,
    target: number,
    startTime: number,
    seconds: number,
  ): void;
  /** Disconnects and forgets a layer; the bus calls it once faded out. */
  dropLayer(layer: string): void;
  /** Fades out and drops every music layer. */
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
  /** One gain node per running stem, keyed by the bus's layer key. */
  const musicLayers = new Map<string, GainNode>();
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

  /**
   * A stem's mixer channel. Created silent: every layer arrives through
   * a fade-in, so there is no path by which one snaps on at full gain.
   */
  function ensureMusicLayer(context: AudioContext, key: string): GainNode {
    const existing = musicLayers.get(key);
    if (existing) return existing;
    const layer = context.createGain();
    layer.gain.value = 0;
    layer.connect(musicGain!);
    musicLayers.set(key, layer);
    return layer;
  }

  function scheduleNote(note: ScheduledNote): void {
    try {
      if (!ctx || !musicGain || !running()) return;
      const layer = ensureMusicLayer(ctx, note.layer);
      const attack = Math.max(note.duration * 0.15, 0.02);
      const gain = envelope(ctx, note.time, note.duration, note.gain, attack);
      gain.connect(layer);
      const osc = ctx.createOscillator();
      osc.type = note.wave;
      osc.frequency.setValueAtTime(Math.max(note.freq, 1), note.time);
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = Math.max(note.filterFreq, 1);
      osc.connect(filter);
      filter.connect(gain);
      osc.start(note.time);
      osc.stop(note.time + note.duration + 0.1);
    } catch {
      // Skip the note.
    }
  }

  function rampLayer(
    key: string,
    target: number,
    startTime: number,
    seconds: number,
  ): void {
    try {
      if (!ctx || !musicGain || !running()) return;
      const layer = ensureMusicLayer(ctx, key);
      // Never behind the clock: a fade planned for a bar line that has
      // already gone by starts now instead of being dropped.
      const t = Math.max(startTime, ctx.currentTime);
      const from = layer.gain.value;
      layer.gain.cancelScheduledValues(t);
      layer.gain.setValueAtTime(from, t);
      // Linear, not exponential: only a linear ramp can reach zero.
      layer.gain.linearRampToValueAtTime(target, t + Math.max(seconds, 0.01));
    } catch {
      // A layer that will not fade still plays; leave it alone.
    }
  }

  function dropLayer(key: string): void {
    const layer = musicLayers.get(key);
    musicLayers.delete(key);
    try {
      layer?.disconnect();
    } catch {
      // Already gone.
    }
  }

  /**
   * Takes every stem down together and forgets them. The bus no longer
   * holds these keys once it has called this, so disposal is on a timer
   * here rather than on a later tick.
   */
  function stopMusicLayer(fadeSeconds: number): void {
    const dying = [...musicLayers.entries()];
    for (const [key] of dying) {
      rampLayer(key, 0, ctx?.currentTime ?? 0, fadeSeconds);
    }
    musicLayers.clear();
    if (dying.length === 0) return;
    setTimeout(
      () => {
        for (const [, layer] of dying) {
          try {
            layer.disconnect();
          } catch {
            // Already gone.
          }
        }
      },
      (fadeSeconds + 0.3) * 1000,
    );
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
    rampLayer,
    dropLayer,
    stopMusicLayer,
  };
}
