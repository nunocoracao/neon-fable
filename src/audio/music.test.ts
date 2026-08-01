import { describe, expect, it } from "vitest";
import type { MusicLayerPattern, MusicPhaseParams } from "../data/music";
import { collectDue, createSequencer, layerGrid, voiceSpec } from "./music";

const NEUTRAL: MusicPhaseParams = {
  tempoScale: 1,
  filterScale: 1,
  gainScale: 1,
};

/** Two bars of four steps: a downbeat, an offbeat, and a held note. */
const pattern: MusicLayerPattern = {
  stepsPerBar: 4,
  bars: 2,
  notes: [
    { step: 0, freq: 110, steps: 4, gain: 0.2, wave: "sine", filterFreq: 800 },
    { step: 2, freq: 220, steps: 1, gain: 0.1, wave: "triangle", filterFreq: 1600 },
    { step: 5, freq: 330, steps: 1, gain: 0.1, wave: "square", filterFreq: 1600 },
  ],
};

function spec(secondsPerBar = 2, params: MusicPhaseParams = NEUTRAL) {
  return voiceSpec("theme:night:base", pattern, secondsPerBar, params);
}

describe("layerGrid", () => {
  it("divides the bar by the layer's own resolution", () => {
    expect(layerGrid(pattern, 2, 1)).toEqual({ stepSeconds: 0.5, stepCount: 8 });
  });

  it("puts layers of different resolutions on the same bar lines", () => {
    const fast: MusicLayerPattern = { ...pattern, stepsPerBar: 16, bars: 1 };
    const slow = layerGrid(pattern, 3.2, 1);
    const drive = layerGrid(fast, 3.2, 1);
    expect(slow.stepSeconds * slow.stepCount).toBeCloseTo(3.2 * 2);
    expect(drive.stepSeconds * drive.stepCount).toBeCloseTo(3.2);
    // Both loops are whole numbers of the same bar.
    expect((slow.stepSeconds * slow.stepCount) % 3.2).toBeCloseTo(0);
  });

  it("scales the whole grid by the hour's tempo", () => {
    const slower = layerGrid(pattern, 2, 1.5);
    expect(slower.stepSeconds).toBeCloseTo(0.75);
    expect(slower.stepCount).toBe(8);
  });
});

describe("sequencer", () => {
  it("starts at step 0 at the given time", () => {
    expect(createSequencer(12.5)).toEqual({ step: 0, nextStepTime: 12.5 });
  });

  it("emits nothing before the next step time", () => {
    const state = createSequencer(10);
    const result = collectDue(spec(), state, 9.99);
    expect(result.notes).toEqual([]);
    expect(result.state).toEqual(state);
  });

  it("resolves steps to absolute times, deterministically", () => {
    const voice = spec();
    const start = 100;
    const state = createSequencer(start);
    // Horizon just past step 2 → emits steps 0..2.
    const result = collectDue(voice, state, start + 0.5 * 2 + 0.001);

    expect(result.state.step).toBe(3);
    expect(result.state.nextStepTime).toBeCloseTo(start + 1.5);
    expect(result.notes).toEqual([
      {
        layer: "theme:night:base",
        time: 100,
        freq: 110,
        duration: 2,
        gain: 0.2,
        wave: "sine",
        filterFreq: 800,
      },
      {
        layer: "theme:night:base",
        time: 101,
        freq: 220,
        duration: 0.5,
        gain: 0.1,
        wave: "triangle",
        filterFreq: 1600,
      },
    ]);
    // Same inputs, same outputs.
    expect(collectDue(voice, state, start + 1.001)).toEqual(result);
  });

  it("wraps around the loop", () => {
    const voice = spec();
    const loop = voice.grid.stepSeconds * voice.grid.stepCount;
    const result = collectDue(voice, createSequencer(0), loop + 0.5 + 0.001);
    expect(result.state.step).toBe(2);
    // The downbeat has come round a second time.
    const downbeats = result.notes.filter((n) => n.freq === 110);
    expect(downbeats.map((n) => n.time)).toEqual([0, loop]);
  });

  it("carries the day phase's colouring into every note", () => {
    const voice = spec(2, { tempoScale: 1, filterScale: 0.5, gainScale: 0.5 });
    const result = collectDue(voice, createSequencer(0), 0.001);
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0]?.gain).toBeCloseTo(0.1);
    expect(result.notes[0]?.filterFreq).toBeCloseTo(400);
  });

  it("tags every note with the voice's mixer channel", () => {
    const voice = voiceSpec("quays:late:tension", pattern, 2, NEUTRAL);
    const result = collectDue(voice, createSequencer(0), 4);
    expect(result.notes.length).toBeGreaterThan(0);
    for (const note of result.notes) {
      expect(note.layer).toBe("quays:late:tension");
    }
  });
});
