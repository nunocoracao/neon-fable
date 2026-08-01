/**
 * The sequencer: one authored layer plus a resolved step grid in, a
 * stream of absolutely-timed notes out. Pure — same state and horizon,
 * same notes, every time — so the whole of the score's timing is
 * testable without an AudioContext. Only the adapter turns a
 * ScheduledNote into sound.
 *
 * A voice is one layer of one theme playing at one hour, addressed by a
 * `layer` key the adapter uses as its mixer channel. The bus runs
 * several at once and fades them against each other; nothing in here
 * knows that, or knows what the player is doing — see ./score.ts for
 * which voices should be running, and ./bus.ts for making it so.
 */
import type { MusicLayerPattern, MusicPhaseParams } from "../data/music";
import type { PatchWave } from "./patches";

/** A layer's loop resolved to seconds, after the hour's tempo scale. */
export interface LayerGrid {
  /** Seconds per sequencer step. */
  stepSeconds: number;
  /** Steps before the layer loops. */
  stepCount: number;
}

/**
 * Resolves a layer's grid against its theme's bar length. Both a pad on
 * four steps per bar and a combat pulse on sixteen come out sharing bar
 * lines, which is what makes crossfades land.
 */
export function layerGrid(
  pattern: MusicLayerPattern,
  secondsPerBar: number,
  tempoScale: number,
): LayerGrid {
  return {
    stepSeconds: (secondsPerBar * tempoScale) / pattern.stepsPerBar,
    stepCount: pattern.stepsPerBar * pattern.bars,
  };
}

/** Everything the sequencer needs about one running voice. */
export interface VoiceSpec {
  /** Mixer channel the notes go to; one gain node in the adapter. */
  layer: string;
  pattern: MusicLayerPattern;
  grid: LayerGrid;
  /** Multiplies every authored peak gain. */
  gainScale: number;
  /** Multiplies every authored cutoff. */
  filterScale: number;
}

/** Builds a voice spec from an authored layer and the hour's colouring. */
export function voiceSpec(
  layer: string,
  pattern: MusicLayerPattern,
  secondsPerBar: number,
  params: MusicPhaseParams,
): VoiceSpec {
  return {
    layer,
    pattern,
    grid: layerGrid(pattern, secondsPerBar, params.tempoScale),
    gainScale: params.gainScale,
    filterScale: params.filterScale,
  };
}

export interface SequencerState {
  /** Step index the next tick will emit. */
  step: number;
  /** Absolute time (adapter clock, seconds) of that step. */
  nextStepTime: number;
}

/** A note resolved to absolute time, ready for the adapter to schedule. */
export interface ScheduledNote {
  /** Mixer channel; the adapter creates one silently on first use. */
  layer: string;
  time: number;
  freq: number;
  /** Seconds. */
  duration: number;
  gain: number;
  wave: PatchWave;
  filterFreq: number;
}

export function createSequencer(startTime: number): SequencerState {
  return { step: 0, nextStepTime: startTime };
}

/**
 * Collects every note starting before `untilTime`, advancing the state
 * past them. Deterministic: same spec, state, and horizon, same result.
 */
export function collectDue(
  spec: VoiceSpec,
  state: SequencerState,
  untilTime: number,
): { state: SequencerState; notes: ScheduledNote[] } {
  const { pattern, grid } = spec;
  const notes: ScheduledNote[] = [];
  let { step, nextStepTime } = state;
  while (nextStepTime < untilTime) {
    for (const note of pattern.notes) {
      if (note.step !== step) continue;
      notes.push({
        layer: spec.layer,
        time: nextStepTime,
        freq: note.freq,
        duration: note.steps * grid.stepSeconds,
        gain: note.gain * spec.gainScale,
        wave: note.wave,
        filterFreq: note.filterFreq * spec.filterScale,
      });
    }
    step = (step + 1) % grid.stepCount;
    nextStepTime += grid.stepSeconds;
  }
  return { state: { step, nextStepTime }, notes };
}
