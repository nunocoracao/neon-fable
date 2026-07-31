/**
 * The SFX registry: every game event sound is a data-defined synth patch
 * (oscillator/noise layers with envelopes) rendered by the adapter — no
 * binary audio assets. Adding a sound means adding an id here and a
 * patch below; the type keeps every call site honest at compile time.
 */

export type PatchWave = "sine" | "square" | "sawtooth" | "triangle";

export interface ToneLayer {
  kind: "tone";
  wave: PatchWave;
  /** Start frequency in Hz. */
  freq: number;
  /** Optional sweep target reached at the end of the layer. */
  freqEnd?: number;
  /** Seconds after the patch starts before this layer begins. */
  delay?: number;
  /** Seconds the layer sounds for. */
  duration: number;
  /** Peak gain in (0,1], relative to the SFX channel. */
  gain: number;
  /** Attack in seconds (default 0.005). */
  attack?: number;
}

export interface NoiseLayer {
  kind: "noise";
  delay?: number;
  duration: number;
  gain: number;
  attack?: number;
  filter?: { type: "lowpass" | "highpass" | "bandpass"; freq: number; q?: number };
}

export type PatchLayer = ToneLayer | NoiseLayer;

export interface SynthPatch {
  layers: PatchLayer[];
}

export const SOUND_IDS = [
  // UI
  "ui-click",
  "ui-confirm",
  "ui-cancel",
  "dialogue-advance",
  "choice-select",
  "save-confirm",
  "load-confirm",
  // Exploration
  "footstep",
  "interact",
  // Stealth
  "takedown",
  "spotted",
  // Combat
  "attack-swing",
  "attack-hit-light",
  "attack-hit-heavy",
  "attack-miss",
  "ability-use",
  "item-use",
  "enemy-defeat",
  "victory",
  "defeat",
  // Inventory
  "equip",
  "unequip",
  "install",
] as const;

export type SoundId = (typeof SOUND_IDS)[number];

/** Damage at or above this plays the heavy hit impact. */
export const HEAVY_HIT_DAMAGE = 6;

/** Hit impacts vary with damage dealt: harder hits ring lower and longer. */
export function hitSoundForDamage(damage: number): SoundId {
  return damage >= HEAVY_HIT_DAMAGE ? "attack-hit-heavy" : "attack-hit-light";
}

export const SOUND_PATCHES: Record<SoundId, SynthPatch> = {
  "ui-click": {
    layers: [
      { kind: "tone", wave: "square", freq: 880, freqEnd: 660, duration: 0.05, gain: 0.18 },
    ],
  },
  "ui-confirm": {
    layers: [
      { kind: "tone", wave: "sine", freq: 660, duration: 0.07, gain: 0.22 },
      { kind: "tone", wave: "sine", freq: 990, delay: 0.07, duration: 0.1, gain: 0.22 },
    ],
  },
  "ui-cancel": {
    layers: [
      { kind: "tone", wave: "square", freq: 520, freqEnd: 320, duration: 0.09, gain: 0.16 },
    ],
  },
  "dialogue-advance": {
    layers: [
      { kind: "tone", wave: "triangle", freq: 740, duration: 0.045, gain: 0.16 },
    ],
  },
  "choice-select": {
    layers: [
      { kind: "tone", wave: "triangle", freq: 587, freqEnd: 880, duration: 0.07, gain: 0.2 },
    ],
  },
  "save-confirm": {
    layers: [
      { kind: "tone", wave: "sine", freq: 523, duration: 0.09, gain: 0.2 },
      { kind: "tone", wave: "sine", freq: 784, delay: 0.09, duration: 0.14, gain: 0.2 },
    ],
  },
  "load-confirm": {
    layers: [
      { kind: "tone", wave: "sine", freq: 784, duration: 0.09, gain: 0.2 },
      { kind: "tone", wave: "sine", freq: 523, delay: 0.09, duration: 0.14, gain: 0.2 },
    ],
  },
  footstep: {
    layers: [
      { kind: "noise", duration: 0.045, gain: 0.1, filter: { type: "lowpass", freq: 500 } },
      { kind: "tone", wave: "sine", freq: 95, freqEnd: 60, duration: 0.05, gain: 0.12 },
    ],
  },
  interact: {
    layers: [
      { kind: "tone", wave: "sine", freq: 990, duration: 0.06, gain: 0.16 },
      { kind: "tone", wave: "sine", freq: 1320, delay: 0.05, duration: 0.08, gain: 0.12 },
    ],
  },
  "attack-swing": {
    layers: [
      { kind: "noise", duration: 0.08, gain: 0.14, attack: 0.02, filter: { type: "highpass", freq: 1400 } },
    ],
  },
  "attack-hit-light": {
    layers: [
      { kind: "noise", duration: 0.07, gain: 0.28, filter: { type: "lowpass", freq: 900 } },
      { kind: "tone", wave: "square", freq: 220, freqEnd: 110, duration: 0.1, gain: 0.22 },
    ],
  },
  "attack-hit-heavy": {
    layers: [
      { kind: "noise", duration: 0.14, gain: 0.4, filter: { type: "lowpass", freq: 550 } },
      { kind: "tone", wave: "sawtooth", freq: 160, freqEnd: 55, duration: 0.2, gain: 0.3 },
    ],
  },
  "attack-miss": {
    layers: [
      { kind: "noise", duration: 0.07, gain: 0.09, attack: 0.02, filter: { type: "highpass", freq: 2200 } },
    ],
  },
  "ability-use": {
    layers: [
      { kind: "tone", wave: "sawtooth", freq: 330, freqEnd: 660, duration: 0.14, gain: 0.16 },
      { kind: "tone", wave: "sine", freq: 990, delay: 0.08, duration: 0.1, gain: 0.14 },
    ],
  },
  "item-use": {
    layers: [
      { kind: "tone", wave: "triangle", freq: 494, duration: 0.07, gain: 0.18 },
      { kind: "tone", wave: "triangle", freq: 740, delay: 0.07, duration: 0.09, gain: 0.18 },
    ],
  },
  "enemy-defeat": {
    layers: [
      { kind: "tone", wave: "sawtooth", freq: 440, freqEnd: 55, duration: 0.3, gain: 0.2 },
      { kind: "noise", duration: 0.2, gain: 0.16, filter: { type: "lowpass", freq: 700 } },
    ],
  },
  victory: {
    layers: [
      { kind: "tone", wave: "triangle", freq: 523, duration: 0.14, gain: 0.22 },
      { kind: "tone", wave: "triangle", freq: 659, delay: 0.12, duration: 0.14, gain: 0.22 },
      { kind: "tone", wave: "triangle", freq: 784, delay: 0.24, duration: 0.14, gain: 0.22 },
      { kind: "tone", wave: "sine", freq: 1047, delay: 0.36, duration: 0.5, gain: 0.24, attack: 0.02 },
    ],
  },
  defeat: {
    layers: [
      { kind: "tone", wave: "sawtooth", freq: 220, freqEnd: 82, duration: 0.55, gain: 0.16, attack: 0.05 },
      { kind: "tone", wave: "sine", freq: 110, freqEnd: 55, duration: 0.7, gain: 0.2, attack: 0.05 },
    ],
  },
  equip: {
    layers: [
      { kind: "tone", wave: "square", freq: 440, duration: 0.05, gain: 0.14 },
      { kind: "tone", wave: "square", freq: 660, delay: 0.06, duration: 0.06, gain: 0.14 },
    ],
  },
  unequip: {
    layers: [
      { kind: "tone", wave: "square", freq: 660, duration: 0.05, gain: 0.14 },
      { kind: "tone", wave: "square", freq: 440, delay: 0.06, duration: 0.06, gain: 0.14 },
    ],
  },
  // A hand over a mouth: a muffled thump and nothing else. Quiet on
  // purpose — the whole point of the move is that it is not heard.
  takedown: {
    layers: [
      { kind: "noise", duration: 0.09, gain: 0.09, filter: { type: "lowpass", freq: 420 } },
      { kind: "tone", wave: "sine", freq: 165, freqEnd: 82, duration: 0.16, gain: 0.12 },
    ],
  },
  // The opposite: two hard rising notes, the sound of somebody else
  // having decided something about you.
  spotted: {
    layers: [
      { kind: "tone", wave: "square", freq: 523, duration: 0.1, gain: 0.2 },
      { kind: "tone", wave: "square", freq: 784, delay: 0.1, duration: 0.18, gain: 0.2 },
      { kind: "noise", delay: 0.1, duration: 0.2, gain: 0.1, filter: { type: "highpass", freq: 1800 } },
    ],
  },
  install: {
    layers: [
      { kind: "noise", duration: 0.18, gain: 0.1, filter: { type: "bandpass", freq: 1100, q: 2 } },
      { kind: "tone", wave: "sawtooth", freq: 110, freqEnd: 440, duration: 0.22, gain: 0.14, attack: 0.02 },
      { kind: "tone", wave: "square", freq: 880, delay: 0.22, duration: 0.06, gain: 0.16 },
    ],
  },
};

export function getPatch(id: SoundId): SynthPatch {
  return SOUND_PATCHES[id];
}
