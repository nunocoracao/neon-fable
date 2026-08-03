import { describe, expect, it } from "vitest";
import {
  EMISSIVE_COLORS,
  HALF_STEPS,
  HAIR_COLORS,
  halfStepBetween,
  MATERIAL_RAMPS,
  PALETTE,
  REMAP_CHANNELS,
  SKIN_RAMPS,
  TRANSPARENT,
  type ColorRamp,
} from "./palette";

/**
 * The complete v1 palette. These character/color pairs are frozen: all
 * shipped art indexes them, so any change here silently recolors old
 * sprites. Extend the palette, never edit these.
 */
const LEGACY_PALETTE: Readonly<Record<string, string>> = {
  "0": "#05060c",
  "1": "#0d0f18",
  "2": "#161a26",
  "3": "#202534",
  "4": "#2b3244",
  "5": "#3a4257",
  "6": "#4c566e",
  "7": "#6b7691",
  "8": "#9aa3b8",
  "9": "#e8e6f0",
  a: "#2e1f1a",
  b: "#4a3626",
  c: "#6e5137",
  d: "#081018",
  e: "#0e2233",
  f: "#17394f",
  g: "#2ee6d6",
  h: "#7ff5ea",
  i: "#14665f",
  j: "#e63e8f",
  k: "#ff7ac2",
  l: "#6e2148",
  m: "#f0b429",
  n: "#ffd977",
  o: "#7a5a1a",
  p: "#ff4d5e",
  q: "#d8c9b8",
  r: "#a08872",
  z: "rgba(5, 6, 12, 0.45)",
};

const HEX_COLOR = /^#[0-9a-f]{6}$/;
const RGBA_COLOR = /^rgba\(\d{1,3}, \d{1,3}, \d{1,3}, 0?\.\d+\)$/;

describe("palette v2", () => {
  it("keeps every pre-v2 character at its exact original color", () => {
    for (const [ch, color] of Object.entries(LEGACY_PALETTE)) {
      expect(PALETTE[ch], `legacy character "${ch}"`).toBe(color);
    }
  });

  it("every entry is a single non-transparent character mapping to a valid CSS color", () => {
    for (const [ch, color] of Object.entries(PALETTE)) {
      expect(ch.length, `character "${ch}"`).toBe(1);
      expect(ch).not.toBe(TRANSPARENT);
      expect(
        HEX_COLOR.test(color) || RGBA_COLOR.test(color),
        `"${ch}" -> "${color}" is a valid color`,
      ).toBe(true);
    }
    expect(PALETTE[TRANSPARENT]).toBeUndefined();
  });

  it("has no duplicate colors — every entry earns its place", () => {
    const colors = Object.values(PALETTE);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it("reaches roughly 78 curated entries — 56 colors plus their half-steps", () => {
    const size = Object.keys(PALETTE).length;
    expect(size).toBeGreaterThanOrEqual(52);
    expect(size).toBeLessThanOrEqual(96);
  });
});

describe("palette v3 half-steps", () => {
  it("splits every ramp that carries material detail, twice", () => {
    expect(HALF_STEPS.length).toBe(20);
    const chars = HALF_STEPS.map((step) => step.char);
    expect(new Set(chars).size).toBe(chars.length);
    for (const step of HALF_STEPS) {
      expect(PALETTE[step.char], `half-step "${step.char}"`).toBeDefined();
      expect(step.char.length).toBe(1);
      expect(step.char).not.toBe(TRANSPARENT);
    }
  });

  it("adds only new characters — no v1 or v2 slot is reused", () => {
    for (const step of HALF_STEPS) {
      expect(LEGACY_PALETTE[step.char], `half-step "${step.char}"`).toBeUndefined();
      expect(step.between.some((anchor) => anchor === step.char)).toBe(false);
    }
  });

  it("splits named steps that exist and are not each other", () => {
    for (const step of HALF_STEPS) {
      const [darker, lighter] = step.between;
      expect(PALETTE[darker], `"${step.char}" darker anchor`).toBeDefined();
      expect(PALETTE[lighter], `"${step.char}" lighter anchor`).toBeDefined();
      expect(darker).not.toBe(lighter);
    }
  });

  it("is reachable by the two steps it sits between", () => {
    expect(halfStepBetween("r", "q")).toBe("v");
    expect(halfStepBetween("T", "9")).toBe("]");
    // Backwards is not a half-step: ramps are ordered dark to light.
    expect(halfStepBetween("q", "r")).toBeUndefined();
    expect(halfStepBetween("K", "L")).toBeUndefined();
  });

  it("leaves the remap channels and the emissive set exactly as they were", () => {
    const chars = new Set(HALF_STEPS.map((step) => step.char));
    for (const channel of Object.values(REMAP_CHANNELS)) {
      for (const ch of channel) expect(chars.has(ch)).toBe(false);
    }
    for (const ch of EMISSIVE_COLORS) expect(chars.has(ch)).toBe(false);
  });
});

function expectRampInPalette(ramp: ColorRamp, label: string): void {
  for (const step of ["shade", "base", "highlight"] as const) {
    expect(PALETTE[ramp[step]], `${label} ${step} "${ramp[step]}"`).toBeDefined();
  }
}

describe("skin ramps and hair colors", () => {
  it("has four skin ramps of existing palette characters", () => {
    expect(SKIN_RAMPS.length).toBe(4);
    SKIN_RAMPS.forEach((ramp, i) => expectRampInPalette(ramp, `skin ramp ${i}`));
  });

  it("skin ramps never share a character", () => {
    const chars = SKIN_RAMPS.flatMap((ramp) => [
      ramp.shade,
      ramp.base,
      ramp.highlight,
    ]);
    expect(new Set(chars).size).toBe(chars.length);
  });

  it("has six distinct hair colors, all in the palette", () => {
    expect(HAIR_COLORS.length).toBe(6);
    expect(new Set(HAIR_COLORS).size).toBe(HAIR_COLORS.length);
    for (const ch of HAIR_COLORS) {
      expect(PALETTE[ch], `hair color "${ch}"`).toBeDefined();
    }
  });
});

describe("material ramps", () => {
  it("covers the v2 material set with existing palette characters", () => {
    const names = Object.keys(MATERIAL_RAMPS);
    expect(names.sort()).toEqual(
      [
        "brushedChrome",
        "concrete",
        "darkFabric",
        "glass",
        "hazardAmber",
        "hologramBlue",
        "neonCyan",
      ].sort(),
    );
    for (const [name, ramp] of Object.entries(MATERIAL_RAMPS)) {
      expectRampInPalette(ramp, name);
    }
  });
});

describe("remap channels", () => {
  it("declares the seven reserved layered-character channels", () => {
    expect(Object.keys(REMAP_CHANNELS).sort()).toEqual(
      [
        "cyberChrome",
        "eyes",
        "hair",
        "outfitAccent",
        "outfitPrimary",
        "skin",
        "tattooInk",
      ].sort(),
    );
  });

  it("only references existing palette characters", () => {
    for (const [name, chars] of Object.entries(REMAP_CHANNELS)) {
      expect(chars.length, name).toBeGreaterThan(0);
      for (const ch of chars) {
        expect(PALETTE[ch], `${name} character "${ch}"`).toBeDefined();
      }
    }
  });

  it("channels are mutually disjoint so layers can carry several at once", () => {
    const all = Object.values(REMAP_CHANNELS).flat();
    expect(new Set(all).size).toBe(all.length);
  });

  it("tattoo ink rides the hologram-blue ramp in ramp order", () => {
    const holo = MATERIAL_RAMPS.hologramBlue;
    expect(REMAP_CHANNELS.tattooInk).toEqual([
      holo.shade,
      holo.base,
      holo.highlight,
    ]);
  });

  it("skin channel is skin ramp 0 in shade/base/highlight order", () => {
    const canonical = SKIN_RAMPS[0];
    expect(REMAP_CHANNELS.skin).toEqual([
      canonical?.shade,
      canonical?.base,
      canonical?.highlight,
    ]);
    expect(HAIR_COLORS).toContain(REMAP_CHANNELS.hair[0]);
  });
});
