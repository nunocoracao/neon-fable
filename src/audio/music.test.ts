import { describe, expect, it } from "vitest";
import {
  MUSIC_CONTEXT_IDS,
  MUSIC_PATTERNS,
  collectDue,
  createSequencer,
} from "./music";

describe("music patterns", () => {
  it("defines a pattern for every context", () => {
    for (const id of MUSIC_CONTEXT_IDS) {
      const pattern = MUSIC_PATTERNS[id];
      expect(pattern, id).toBeDefined();
      expect(pattern.id, id).toBe(id);
      expect(pattern.stepSeconds, id).toBeGreaterThan(0);
      expect(pattern.stepCount, id).toBeGreaterThan(0);
      expect(pattern.notes.length, id).toBeGreaterThan(0);
    }
  });

  it("keeps every note inside the loop with sane values", () => {
    for (const id of MUSIC_CONTEXT_IDS) {
      const pattern = MUSIC_PATTERNS[id];
      for (const note of pattern.notes) {
        expect(note.step, id).toBeGreaterThanOrEqual(0);
        expect(note.step, id).toBeLessThan(pattern.stepCount);
        expect(Number.isInteger(note.step), id).toBe(true);
        expect(note.steps, id).toBeGreaterThanOrEqual(1);
        expect(note.freq, id).toBeGreaterThan(0);
        expect(note.gain, id).toBeGreaterThan(0);
        expect(note.gain, id).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("sequencer", () => {
  it("starts at step 0 at the given time", () => {
    const state = createSequencer("combat", 12.5);
    expect(state).toEqual({ patternId: "combat", step: 0, nextStepTime: 12.5 });
  });

  it("emits nothing before the next step time", () => {
    const state = createSequencer("combat", 10);
    const result = collectDue(state, 9.99);
    expect(result.notes).toEqual([]);
    expect(result.state).toEqual(state);
  });

  it("steps deterministically with correct absolute times", () => {
    const pattern = MUSIC_PATTERNS.combat;
    const start = 100;
    const state = createSequencer("combat", start);
    // Horizon just past step 4 → emits steps 0..4.
    const until = start + pattern.stepSeconds * 4 + 0.001;
    const result = collectDue(state, until);

    expect(result.state.step).toBe(5);
    expect(result.state.nextStepTime).toBeCloseTo(
      start + pattern.stepSeconds * 5,
    );
    const expected = pattern.notes
      .filter((note) => note.step <= 4)
      .map((note) => ({
        time: start + note.step * pattern.stepSeconds,
        freq: note.freq,
        duration: note.steps * pattern.stepSeconds,
        gain: note.gain,
        wave: note.wave,
        ...(note.filterFreq !== undefined ? { filterFreq: note.filterFreq } : {}),
      }));
    expect(result.notes).toHaveLength(expected.length);
    for (const note of expected) {
      expect(result.notes).toContainEqual(note);
    }
    // Same inputs, same outputs.
    expect(collectDue(state, until)).toEqual(result);
  });

  it("wraps around the loop", () => {
    const pattern = MUSIC_PATTERNS.combat;
    const state = createSequencer("combat", 0);
    const oneLoopAndOne = pattern.stepSeconds * (pattern.stepCount + 1) + 0.001;
    const result = collectDue(state, oneLoopAndOne);
    expect(result.state.step).toBe(2);
    // Step 0 notes appear twice: once per loop pass.
    const loop = pattern.stepSeconds * pattern.stepCount;
    const step0Count = pattern.notes.filter((n) => n.step === 0).length;
    const emittedAtStep0 = result.notes.filter((n) => {
      const offset = n.time % loop;
      return Math.min(offset, loop - offset) < 1e-6;
    });
    expect(emittedAtStep0).toHaveLength(step0Count * 2);
  });

  it("advances every pattern through a full loop without error", () => {
    for (const id of MUSIC_CONTEXT_IDS) {
      const pattern = MUSIC_PATTERNS[id];
      const state = createSequencer(id, 0);
      const horizon = pattern.stepSeconds * pattern.stepCount - 0.001;
      const result = collectDue(state, horizon);
      expect(result.state.step, id).toBe(0);
      expect(result.notes.length, id).toBeGreaterThan(0);
    }
  });
});
