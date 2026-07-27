/**
 * Procedural ambient music: each play context loops a data-defined
 * pattern of sparse synth voices. The sequencer is pure — given a state
 * and a horizon it returns the notes due and the advanced state; only
 * the adapter turns ScheduledNotes into sound.
 */
import type { PatchWave } from "./patches";

export type MusicContextId = "menu" | "hub" | "combat" | "ending";

export const MUSIC_CONTEXT_IDS: readonly MusicContextId[] = [
  "menu",
  "hub",
  "combat",
  "ending",
];

export interface PatternNote {
  /** Step index within the loop this note starts on. */
  step: number;
  freq: number;
  /** Length in steps. */
  steps: number;
  /** Peak gain in (0,1], relative to the music channel. */
  gain: number;
  wave: PatchWave;
  /** Optional lowpass cutoff to soften the voice. */
  filterFreq?: number;
}

export interface MusicPattern {
  id: MusicContextId;
  /** Seconds per sequencer step. */
  stepSeconds: number;
  /** Steps before the pattern loops. */
  stepCount: number;
  notes: PatternNote[];
}

// A-minor throughout so context switches never clash harmonically.
const A2 = 110.0;
const C3 = 130.81;
const D3 = 146.83;
const E3 = 164.81;
const F2 = 87.31;
const G2 = 98.0;
const A3 = 220.0;
const G3 = 196.0;
const C4 = 261.63;
const D4 = 293.66;
const E4 = 329.63;
const G4 = 392.0;
const A4 = 440.0;
const E5 = 659.26;

export const MUSIC_PATTERNS: Record<MusicContextId, MusicPattern> = {
  // Main menu: slow dark pads with a hesitant arp.
  menu: {
    id: "menu",
    stepSeconds: 0.55,
    stepCount: 32,
    notes: [
      { step: 0, freq: A2, steps: 16, gain: 0.16, wave: "sine", filterFreq: 900 },
      { step: 8, freq: E3, steps: 8, gain: 0.1, wave: "sine", filterFreq: 900 },
      { step: 16, freq: F2, steps: 16, gain: 0.16, wave: "sine", filterFreq: 900 },
      { step: 24, freq: C3, steps: 8, gain: 0.1, wave: "sine", filterFreq: 900 },
      { step: 0, freq: A3, steps: 2, gain: 0.06, wave: "triangle" },
      { step: 5, freq: C4, steps: 2, gain: 0.06, wave: "triangle" },
      { step: 10, freq: E4, steps: 2, gain: 0.06, wave: "triangle" },
      { step: 16, freq: A3, steps: 2, gain: 0.06, wave: "triangle" },
      { step: 21, freq: C4, steps: 2, gain: 0.06, wave: "triangle" },
      { step: 26, freq: D4, steps: 2, gain: 0.06, wave: "triangle" },
    ],
  },
  // Hub exploration: low pulse under a wandering arp.
  hub: {
    id: "hub",
    stepSeconds: 0.42,
    stepCount: 32,
    notes: [
      { step: 0, freq: A2, steps: 2, gain: 0.13, wave: "triangle", filterFreq: 500 },
      { step: 4, freq: A2, steps: 2, gain: 0.13, wave: "triangle", filterFreq: 500 },
      { step: 8, freq: A2, steps: 2, gain: 0.13, wave: "triangle", filterFreq: 500 },
      { step: 12, freq: A2, steps: 2, gain: 0.13, wave: "triangle", filterFreq: 500 },
      { step: 16, freq: G2, steps: 2, gain: 0.13, wave: "triangle", filterFreq: 500 },
      { step: 20, freq: G2, steps: 2, gain: 0.13, wave: "triangle", filterFreq: 500 },
      { step: 24, freq: F2, steps: 2, gain: 0.13, wave: "triangle", filterFreq: 500 },
      { step: 28, freq: F2, steps: 2, gain: 0.13, wave: "triangle", filterFreq: 500 },
      { step: 0, freq: A3, steps: 16, gain: 0.07, wave: "sine", filterFreq: 800 },
      { step: 16, freq: G3, steps: 16, gain: 0.07, wave: "sine", filterFreq: 800 },
      { step: 2, freq: E4, steps: 1, gain: 0.045, wave: "triangle" },
      { step: 6, freq: D4, steps: 1, gain: 0.045, wave: "triangle" },
      { step: 10, freq: C4, steps: 1, gain: 0.045, wave: "triangle" },
      { step: 14, freq: E4, steps: 1, gain: 0.045, wave: "triangle" },
      { step: 18, freq: D4, steps: 1, gain: 0.045, wave: "triangle" },
      { step: 22, freq: C4, steps: 1, gain: 0.045, wave: "triangle" },
      { step: 26, freq: D4, steps: 1, gain: 0.045, wave: "triangle" },
      { step: 30, freq: E4, steps: 1, gain: 0.045, wave: "triangle" },
    ],
  },
  // Combat: fast filtered bass drive with sparse stabs.
  combat: {
    id: "combat",
    stepSeconds: 0.22,
    stepCount: 16,
    notes: [
      { step: 0, freq: A2, steps: 1, gain: 0.15, wave: "square", filterFreq: 320 },
      { step: 2, freq: A2, steps: 1, gain: 0.15, wave: "square", filterFreq: 320 },
      { step: 4, freq: A2, steps: 1, gain: 0.15, wave: "square", filterFreq: 320 },
      { step: 6, freq: A2, steps: 1, gain: 0.15, wave: "square", filterFreq: 320 },
      { step: 8, freq: A2, steps: 1, gain: 0.15, wave: "square", filterFreq: 320 },
      { step: 10, freq: A2, steps: 1, gain: 0.15, wave: "square", filterFreq: 320 },
      { step: 12, freq: C3, steps: 1, gain: 0.15, wave: "square", filterFreq: 320 },
      { step: 14, freq: D3, steps: 1, gain: 0.15, wave: "square", filterFreq: 320 },
      { step: 4, freq: A4, steps: 1, gain: 0.06, wave: "sawtooth", filterFreq: 1400 },
      { step: 12, freq: G4, steps: 1, gain: 0.06, wave: "sawtooth", filterFreq: 1400 },
      { step: 8, freq: E5, steps: 1, gain: 0.03, wave: "sine" },
    ],
  },
  // Endings/epilogue: a wide slow pad sting, almost static.
  ending: {
    id: "ending",
    stepSeconds: 0.8,
    stepCount: 32,
    notes: [
      { step: 0, freq: A2, steps: 16, gain: 0.14, wave: "sine", filterFreq: 700 },
      { step: 0, freq: E3, steps: 16, gain: 0.1, wave: "sine", filterFreq: 700 },
      { step: 16, freq: F2, steps: 16, gain: 0.14, wave: "sine", filterFreq: 700 },
      { step: 16, freq: C3, steps: 16, gain: 0.1, wave: "sine", filterFreq: 700 },
      { step: 8, freq: A4, steps: 4, gain: 0.05, wave: "triangle" },
      { step: 24, freq: E4, steps: 4, gain: 0.05, wave: "triangle" },
    ],
  },
};

// --- Sequencer ---------------------------------------------------------

export interface SequencerState {
  patternId: MusicContextId;
  /** Step index the next tick will emit. */
  step: number;
  /** Absolute time (adapter clock, seconds) of that step. */
  nextStepTime: number;
}

/** A note resolved to absolute time, ready for the adapter to schedule. */
export interface ScheduledNote {
  time: number;
  freq: number;
  /** Seconds. */
  duration: number;
  gain: number;
  wave: PatchWave;
  filterFreq?: number;
}

export function createSequencer(
  patternId: MusicContextId,
  startTime: number,
): SequencerState {
  return { patternId, step: 0, nextStepTime: startTime };
}

/**
 * Collects every note starting before `untilTime`, advancing the state
 * past them. Deterministic: same state + horizon, same result.
 */
export function collectDue(
  state: SequencerState,
  untilTime: number,
): { state: SequencerState; notes: ScheduledNote[] } {
  const pattern = MUSIC_PATTERNS[state.patternId];
  const notes: ScheduledNote[] = [];
  let { step, nextStepTime } = state;
  while (nextStepTime < untilTime) {
    for (const note of pattern.notes) {
      if (note.step !== step) continue;
      notes.push({
        time: nextStepTime,
        freq: note.freq,
        duration: note.steps * pattern.stepSeconds,
        gain: note.gain,
        wave: note.wave,
        ...(note.filterFreq !== undefined ? { filterFreq: note.filterFreq } : {}),
      });
    }
    step = (step + 1) % pattern.stepCount;
    nextStepTime += pattern.stepSeconds;
  }
  return { state: { patternId: state.patternId, step, nextStepTime }, notes };
}
