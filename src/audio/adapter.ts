/**
 * The only file that touches the Web Audio API. Creates the context
 * lazily on unlock() (a user gesture, per autoplay policy) and renders
 * patches and music notes into the bus graph.
 *
 * The graph is the one described in ../data/mixBuses.ts, built from that
 * table rather than hand-wired: one GainNode per bus, each connected to
 * its parent's, master connected to the destination. Nothing reaches the
 * output any other way — a patch is played *onto* a named bus or not at
 * all — so "every sound routes through exactly one bus" is a property of
 * the graph and not a convention anybody has to remember.
 *
 * Music fans out one further gain node per named layer under the music
 * bus — that is the mixer the adaptive score fades stems against — and
 * every layer is created silent, so nothing can ever arrive except
 * through a fade.
 *
 * The adapter is told *what* to fade and *when*, never why: which stems
 * should be up and which bar line to move on is decided in ./score.ts
 * and ./bus.ts, where it can be tested. Every method is a safe no-op
 * when the context is unavailable (happy-dom, denied or failed
 * contexts) — nothing here ever throws into game code.
 */
import { MIX_BUSES, MIX_BUS_IDS, type MixBusId } from "../data/mixBuses";
import type { ScheduledNote } from "./music";
import type { SynthPatch } from "./patches";

export interface AudioAdapter {
  /** Create/resume the context inside a user gesture. True once running. */
  unlock(): boolean;
  /** True while the context exists and is running. */
  readonly running: boolean;
  /** Context clock in seconds (0 when unavailable). */
  now(): number;
  /** Writes each bus node's own gain; see busNodeGains in ./mixer.ts. */
  setBusGains(gains: Readonly<Record<MixBusId, number>>): void;
  /** Plays one patch onto one bus. There is no other way in. */
  playPatch(patch: SynthPatch, bus: MixBusId): void;
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

function unityGains(): Record<MixBusId, number> {
  const gains = {} as Record<MixBusId, number>;
  for (const id of MIX_BUS_IDS) gains[id] = 1;
  return gains;
}

export function createWebAudioAdapter(): AudioAdapter {
  let ctx: AudioContext | null = null;
  /** One gain node per bus, or empty before the context exists. */
  const busNodes = new Map<MixBusId, GainNode>();
  /** One gain node per running stem, keyed by the bus's layer key. */
  const musicLayers = new Map<string, GainNode>();
  let noiseBuffer: AudioBuffer | null = null;
  let pendingGains = unityGains();
  /** Set when context creation failed; don't retry every gesture. */
  let broken = false;

  /**
   * Builds the bus graph from the table: a node per bus, then each one
   * connected to its parent — master, whose parent is null, to the
   * destination. Adding a bus is an edit to ../data/mixBuses.ts and
   * nothing here.
   */
  function buildGraph(context: AudioContext): void {
    busNodes.clear();
    for (const bus of MIX_BUSES) {
      const node = context.createGain();
      node.gain.value = pendingGains[bus.id];
      busNodes.set(bus.id, node);
    }
    for (const bus of MIX_BUSES) {
      const node = busNodes.get(bus.id);
      if (!node) continue;
      const parent = bus.parent === null ? null : busNodes.get(bus.parent);
      node.connect(parent ?? context.destination);
    }
  }

  function busNode(bus: MixBusId): GainNode | null {
    return busNodes.get(bus) ?? null;
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

  function playPatch(patch: SynthPatch, bus: MixBusId): void {
    try {
      const target = busNode(bus);
      if (!ctx || !target || !running()) return;
      const base = ctx.currentTime;
      for (const layer of patch.layers) {
        const start = base + (layer.delay ?? 0);
        const attack = layer.attack ?? DEFAULT_ATTACK;
        const gain = envelope(ctx, start, layer.duration, layer.gain, attack);
        gain.connect(target);
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
  function ensureMusicLayer(
    context: AudioContext,
    key: string,
    music: GainNode,
  ): GainNode {
    const existing = musicLayers.get(key);
    if (existing) return existing;
    const layer = context.createGain();
    layer.gain.value = 0;
    layer.connect(music);
    musicLayers.set(key, layer);
    return layer;
  }

  function scheduleNote(note: ScheduledNote): void {
    try {
      const music = busNode("music");
      if (!ctx || !music || !running()) return;
      const layer = ensureMusicLayer(ctx, note.layer, music);
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
      const music = busNode("music");
      if (!ctx || !music || !running()) return;
      const layer = ensureMusicLayer(ctx, key, music);
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

  /**
   * Every bus node's gain at once, smoothed rather than stepped so a
   * dragged fader does not click. Held in pendingGains as well, because
   * the panel is usable before the context exists and the graph has to
   * be built at whatever the player has already set.
   */
  function setBusGains(gains: Readonly<Record<MixBusId, number>>): void {
    pendingGains = { ...unityGains(), ...gains };
    try {
      if (!ctx) return;
      const t = ctx.currentTime;
      for (const id of MIX_BUS_IDS) {
        busNodes.get(id)?.gain.setTargetAtTime(pendingGains[id], t, 0.03);
      }
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
    setBusGains,
    playPatch,
    scheduleNote,
    rampLayer,
    dropLayer,
    stopMusicLayer,
  };
}
