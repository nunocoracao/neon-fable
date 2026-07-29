import { describe, expect, it } from "vitest";
import { EMISSIVE_COLORS, PALETTE, SKIN_RAMPS, TRANSPARENT } from "./palette";
import {
  PHASE_TINTS,
  SKIN_TINT_DAMPING,
  glowIntensityScale,
  phasePalette,
  tintGains,
  tintedColor,
} from "./tint";
import { DAY_PHASES, DEFAULT_DAY_PHASE, type DayPhaseId } from "../tilemap";

const HEX_COLOR = /^#[0-9a-f]{6}$/;
const RGBA_COLOR = /^rgba\(\d{1,3}, \d{1,3}, \d{1,3}, 0?\.\d+\)$/;

function channels(color: string): [number, number, number] {
  return [
    parseInt(color.slice(1, 3), 16),
    parseInt(color.slice(3, 5), 16),
    parseInt(color.slice(5, 7), 16),
  ];
}

/** Perceptual-ish brightness, enough to compare one hour against another. */
function luminance(color: string): number {
  const [r, g, b] = channels(color);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const SKIN_CHARS = SKIN_RAMPS.flatMap((ramp) => [
  ramp.shade,
  ramp.base,
  ramp.highlight,
]);

/** Palette entries the grade actually moves: not emissive, not skin. */
const GRADED_CHARS = Object.keys(PALETTE).filter(
  (ch) => !EMISSIVE_COLORS.includes(ch) && !SKIN_CHARS.includes(ch),
);

describe("phase palettes", () => {
  it("declares a tint for every day phase", () => {
    expect(Object.keys(PHASE_TINTS).sort()).toEqual([...DAY_PHASES].sort());
  });

  it.each(DAY_PHASES)("%s is total over the master palette", (phase) => {
    const table = phasePalette(phase);
    // Every character keeps an entry...
    for (const ch of Object.keys(PALETTE)) {
      expect(table[ch], `phase "${phase}" character "${ch}"`).toBeDefined();
    }
    // ...and none is invented, so a bake can never resolve a character
    // the master palette does not have.
    expect(Object.keys(table).sort()).toEqual(Object.keys(PALETTE).sort());
    expect(table[TRANSPARENT]).toBeUndefined();
  });

  it.each(DAY_PHASES)("%s yields only valid CSS colors", (phase) => {
    for (const [ch, color] of Object.entries(phasePalette(phase))) {
      expect(
        HEX_COLOR.test(color) || RGBA_COLOR.test(color),
        `phase "${phase}" "${ch}" -> "${color}"`,
      ).toBe(true);
    }
  });

  it("bakes the default phase exactly as the art was authored", () => {
    // Night is the identity grade: an undeclared map must render
    // byte-for-byte what shipped before day phases existed.
    expect(phasePalette(DEFAULT_DAY_PHASE)).toEqual(PALETTE);
  });

  it("builds each phase table once and shares it", () => {
    expect(phasePalette("late")).toBe(phasePalette("late"));
  });

  it("never touches an emissive entry — neon stays saturated", () => {
    for (const phase of DAY_PHASES) {
      const table = phasePalette(phase);
      for (const ch of EMISSIVE_COLORS) {
        expect(table[ch], `phase "${phase}" emissive "${ch}"`).toBe(PALETTE[ch]);
      }
    }
  });

  it("passes the alpha ground shadow through untinted", () => {
    for (const phase of DAY_PHASES) {
      expect(phasePalette(phase)["z"]).toBe(PALETTE["z"]);
    }
  });

  it("keeps skin closer to its authored color than the world around it", () => {
    for (const phase of DAY_PHASES) {
      if (phase === DEFAULT_DAY_PHASE) continue;
      const tint = PHASE_TINTS[phase];
      const table = phasePalette(phase);
      for (const ch of SKIN_CHARS) {
        const authored = PALETTE[ch] as string;
        const damped = table[ch] as string;
        const full = tintedColor(authored, tint, 1);
        const label = `phase "${phase}" skin "${ch}"`;
        // Damped skin is on the way to the full grade, never past it,
        // and never all the way there: it sits in the scene without
        // taking the hour on the chin.
        expect(damped, label).not.toBe(full);
        channels(damped).forEach((value, i) => {
          const from = channels(authored)[i] as number;
          const to = channels(full)[i] as number;
          expect(value, `${label} channel ${i}`).toBeGreaterThanOrEqual(
            Math.min(from, to),
          );
          expect(value, `${label} channel ${i}`).toBeLessThanOrEqual(
            Math.max(from, to),
          );
        });
      }
    }
  });

  it("keeps faces off the floor in the darkest hour", () => {
    // The point of the clamp: at 3am a face must still read as a face,
    // not as a silhouette the pavement grade swallowed.
    const tint = PHASE_TINTS.late;
    const table = phasePalette("late");
    for (const ch of SKIN_CHARS) {
      const authored = PALETTE[ch] as string;
      const label = `late skin "${ch}"`;
      expect(luminance(table[ch] as string), label).toBeGreaterThan(
        luminance(tintedColor(authored, tint, 1)),
      );
      expect(luminance(table[ch] as string), label).toBeGreaterThan(
        luminance(authored) * 0.7,
      );
    }
  });

  it("shifts the world in full where skin is damped", () => {
    for (const phase of DAY_PHASES) {
      if (phase === DEFAULT_DAY_PHASE) continue;
      const tint = PHASE_TINTS[phase];
      const table = phasePalette(phase);
      for (const ch of GRADED_CHARS) {
        const authored = PALETTE[ch] as string;
        if (!HEX_COLOR.test(authored)) continue;
        expect(table[ch], `phase "${phase}" "${ch}"`).toBe(
          tintedColor(authored, tint, 1),
        );
      }
    }
  });
});

describe("the grade itself", () => {
  it("normalizes a cast so its dominant channel is untouched", () => {
    const [r, g, b] = tintGains({
      brightness: 1,
      cast: "#ff8000",
      strength: 1,
      glow: 1,
    });
    expect(r).toBeCloseTo(1);
    expect(g).toBeCloseTo(128 / 255);
    expect(b).toBeCloseTo(0);
  });

  it("is the identity at zero strength and unit brightness", () => {
    const tint = { brightness: 1, cast: "#6ea0ff", strength: 0, glow: 1 };
    expect(tintedColor("#2b3244", tint)).toBe("#2b3244");
  });

  it("multiplies rather than washes: black stays black", () => {
    for (const phase of DAY_PHASES) {
      expect(tintedColor("#000000", PHASE_TINTS[phase])).toBe("#000000");
    }
  });

  it("clamps to the byte range at the bright end", () => {
    const tint = { brightness: 4, cast: "#ffffff", strength: 0, glow: 1 };
    expect(tintedColor("#e8e6f0", tint)).toBe("#ffffff");
  });

  it("warms the neutrals at dusk and cools them late", () => {
    const slate = PALETTE["4"] as string;
    const [dr, , db] = channels(tintedColor(slate, PHASE_TINTS.dusk));
    const [lr, , lb] = channels(tintedColor(slate, PHASE_TINTS.late));
    const [nr, , nb] = channels(slate);
    // Warm = red gains on blue; cool = the reverse.
    expect(dr / db).toBeGreaterThan(nr / nb);
    expect(lr / lb).toBeLessThan(nr / nb);
  });

  it("runs the street darker as the night gets later", () => {
    const order: DayPhaseId[] = ["dusk", "night", "late"];
    const brightness = order.map((phase) =>
      luminance(tintedColor(PALETTE["5"] as string, PHASE_TINTS[phase])),
    );
    expect(brightness[0]).toBeGreaterThan(brightness[1] as number);
    expect(brightness[1]).toBeGreaterThan(brightness[2] as number);
  });
});

describe("glow intensity", () => {
  it("burns harder the later it gets, with night as the baseline", () => {
    expect(glowIntensityScale("night")).toBe(1);
    expect(glowIntensityScale("dusk")).toBeLessThan(1);
    expect(glowIntensityScale("late")).toBeGreaterThan(1);
  });

  it("stays positive for every phase — no hour kills the neon", () => {
    for (const phase of DAY_PHASES) {
      expect(glowIntensityScale(phase), phase).toBeGreaterThan(0);
    }
  });
});

describe("skin damping", () => {
  it("takes a real but partial share of the phase", () => {
    expect(SKIN_TINT_DAMPING).toBeGreaterThan(0);
    expect(SKIN_TINT_DAMPING).toBeLessThan(0.5);
  });
});
