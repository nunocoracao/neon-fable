import { describe, expect, it } from "vitest";
import {
  HEAVY_HIT_DAMAGE,
  SOUND_IDS,
  SOUND_PATCHES,
  getPatch,
  hitSoundForDamage,
} from "./patches";

describe("sound registry", () => {
  it("has unique ids", () => {
    expect(new Set(SOUND_IDS).size).toBe(SOUND_IDS.length);
  });

  it("defines a patch with at least one layer for every sound id", () => {
    for (const id of SOUND_IDS) {
      const patch = getPatch(id);
      expect(patch, id).toBeDefined();
      expect(patch.layers.length, id).toBeGreaterThan(0);
    }
  });

  it("has no patches for unknown ids", () => {
    expect(Object.keys(SOUND_PATCHES).sort()).toEqual([...SOUND_IDS].sort());
  });

  it("keeps every layer within sane synth bounds", () => {
    for (const id of SOUND_IDS) {
      for (const layer of getPatch(id).layers) {
        expect(layer.duration, id).toBeGreaterThan(0);
        expect(layer.duration, id).toBeLessThanOrEqual(2);
        expect(layer.gain, id).toBeGreaterThan(0);
        expect(layer.gain, id).toBeLessThanOrEqual(1);
        expect(layer.delay ?? 0, id).toBeGreaterThanOrEqual(0);
        expect(layer.attack ?? 0.005, id).toBeGreaterThan(0);
        if (layer.kind === "tone") {
          expect(layer.freq, id).toBeGreaterThan(0);
          if (layer.freqEnd !== undefined) {
            expect(layer.freqEnd, id).toBeGreaterThan(0);
          }
        } else if (layer.filter) {
          expect(layer.filter.freq, id).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("hitSoundForDamage", () => {
  it("maps light and heavy damage to registered hit sounds", () => {
    expect(hitSoundForDamage(0)).toBe("attack-hit-light");
    expect(hitSoundForDamage(HEAVY_HIT_DAMAGE - 1)).toBe("attack-hit-light");
    expect(hitSoundForDamage(HEAVY_HIT_DAMAGE)).toBe("attack-hit-heavy");
    expect(hitSoundForDamage(99)).toBe("attack-hit-heavy");
    expect(getPatch(hitSoundForDamage(1))).toBeDefined();
    expect(getPatch(hitSoundForDamage(50))).toBeDefined();
  });
});
