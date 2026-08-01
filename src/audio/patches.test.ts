import { describe, expect, it } from "vitest";
import {
  SOUND_IDS,
  SOUND_PATCHES,
  getPatch,
  patchLayerGain,
  patchPeakGain,
  type SynthPatch,
} from "./patches";
import { SOUND_EVENT_IDS, eventFamily, patchForEvent } from "./events";
import { FAMILY_GAINS, SOUND_FAMILIES, type SoundFamily } from "../data/sfx";

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

  it("has no patch nothing can reach", () => {
    const reachable = new Set(SOUND_EVENT_IDS.map(patchForEvent));
    const orphans = SOUND_IDS.filter((id) => !reachable.has(id));
    expect(orphans, "patches no registered event maps to").toEqual([]);
  });
});

describe("patch loudness measures", () => {
  it("sums only the layers actually sounding together", () => {
    // Two layers over the same span stack; the same two laid end to end
    // do not, which is what a call-and-answer patch relies on.
    const stacked: SynthPatch = {
      layers: [
        { kind: "tone", wave: "sine", freq: 440, duration: 0.1, gain: 0.2 },
        { kind: "tone", wave: "sine", freq: 660, duration: 0.1, gain: 0.3 },
      ],
    };
    const sequential: SynthPatch = {
      layers: [
        { kind: "tone", wave: "sine", freq: 440, duration: 0.1, gain: 0.2 },
        {
          kind: "tone",
          wave: "sine",
          freq: 660,
          delay: 0.1,
          duration: 0.1,
          gain: 0.3,
        },
      ],
    };
    expect(patchPeakGain(stacked)).toBeCloseTo(0.5, 6);
    expect(patchPeakGain(sequential)).toBeCloseTo(0.3, 6);
    expect(patchLayerGain(stacked)).toBeCloseTo(0.3, 6);
  });

  it("counts a layer that starts inside another as overlapping", () => {
    const overlapping: SynthPatch = {
      layers: [
        { kind: "tone", wave: "sine", freq: 440, duration: 0.2, gain: 0.2 },
        {
          kind: "tone",
          wave: "sine",
          freq: 660,
          delay: 0.1,
          duration: 0.2,
          gain: 0.2,
        },
      ],
    };
    expect(patchPeakGain(overlapping)).toBeCloseTo(0.4, 6);
  });
});

describe("family gain conventions", () => {
  it("bounds every family sanely, loudest family first", () => {
    for (const family of SOUND_FAMILIES) {
      const band = FAMILY_GAINS[family];
      expect(band.minPeakGain, family).toBeGreaterThan(0);
      expect(band.maxLayerGain, family).toBeLessThanOrEqual(band.maxPeakGain);
      expect(band.minPeakGain, family).toBeLessThan(band.maxPeakGain);
    }
    // The order of SOUND_FAMILIES is a claim about the mix, not a list.
    const ceilings = SOUND_FAMILIES.map((f) => FAMILY_GAINS[f].maxPeakGain);
    expect([...ceilings].sort((a, b) => b - a)).toEqual(ceilings);
    // Combat is the reference: nothing else may be as loud as a hit.
    for (const family of SOUND_FAMILIES) {
      if (family === "combat") continue;
      expect(
        FAMILY_GAINS[family].maxPeakGain,
        family,
      ).toBeLessThan(FAMILY_GAINS.combat.maxPeakGain);
    }
  });

  it("keeps every event's patch inside its family's band", () => {
    for (const event of SOUND_EVENT_IDS) {
      const family = eventFamily(event);
      const band = FAMILY_GAINS[family];
      const patch = getPatch(patchForEvent(event));
      const where = `${event} (${family})`;
      expect(patchLayerGain(patch), where).toBeLessThanOrEqual(
        band.maxLayerGain,
      );
      expect(patchPeakGain(patch), where).toBeLessThanOrEqual(band.maxPeakGain);
      expect(patchPeakGain(patch), where).toBeGreaterThanOrEqual(
        band.minPeakGain,
      );
    }
  });

  it("leaves the heaviest impact as the loudest thing in the game", () => {
    const loudest = SOUND_IDS.map((id) => patchPeakGain(getPatch(id))).reduce(
      (a, b) => Math.max(a, b),
      0,
    );
    expect(patchPeakGain(getPatch("impact-critical"))).toBeCloseTo(loudest, 6);
  });

  it("holds the ambient family under every other family's ceiling", () => {
    const ambientCeiling = FAMILY_GAINS.ambient.maxPeakGain;
    for (const family of SOUND_FAMILIES) {
      if (family === "ambient") continue;
      const other: SoundFamily = family;
      expect(FAMILY_GAINS[other].maxPeakGain, other).toBeGreaterThan(
        ambientCeiling,
      );
    }
  });
});
