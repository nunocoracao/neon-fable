/**
 * The portrait sweep: the same proof of totality as ./composition, on
 * the 48×48 head-and-shoulders frame.
 *
 * Portraits derive from the same appearance data as the sprite, so the
 * case list is the same one (see ./cases) — every option against the
 * stock look, then all-pairs coverage, seeded and deduplicated. What
 * differs is the two axes only a portrait has: the four expression
 * states, and the Static flicker, whose torn frames a screaming
 * implant band lays over the face.
 *
 * Every case is swept across every expression and every flicker frame:
 * that product is small enough to run whole, so unlike the sprite sweep
 * nothing here is tiered.
 *
 * As in ./composition, checks collect repro lines rather than assert in
 * the loop; the test asserts once against the report.
 */
import { describe, expect, it } from "vitest";
import {
  EXPRESSION_IDS,
  resolveExpression,
  appearanceCatalogs,
  type ExpressionId,
} from "../../data/appearance";
import { composeGrids, remapKey } from "../../iso/art/layers";
import {
  PORTRAIT_FRAME,
  STATIC_FLICKER_FRAMES,
} from "../../iso/art/layers/portrait";
import {
  gridErrors,
  silhouetteArea,
  silhouetteGrid,
  type PixelGrid,
} from "../../iso/art/pixel";
import {
  composePortrait,
  portraitKey,
  resolvePortraitParts,
  staticFlickerPart,
} from "../portrait";
import { describeCase, sweepPlan, type SweepCase } from "./cases";
import {
  describeFault,
  differsVisibly,
  hairOverFace,
  pixelsOutside,
  PORTRAIT_PART_REGIONS,
  portraitPartKind,
} from "./regions";
import { faultReport } from "./report";

const plan = sweepPlan();
/** Frame indices of the flicker cycle: the clean frame plus both tears. */
const FLICKERS = STATIC_FLICKER_FRAMES.map((_, index) => index);

/**
 * Every portrait the sweep needs, composed once. Several tests below
 * ask the same case for the same face; composing it three times over
 * would triple the sweep's share of the test run for nothing.
 */
const composed = new Map<string, PixelGrid>();
function portraitOf(
  index: number,
  expression: ExpressionId,
  flicker = 0,
): PixelGrid {
  const memo = `${index}:${expression}:${flicker}`;
  const hit = composed.get(memo);
  if (hit) return hit;
  const sweepCase = plan.cases[index];
  if (!sweepCase) throw new Error(`no sweep case ${index}`);
  const grid = composePortrait(
    sweepCase.appearance,
    sweepCase.equipment,
    expression,
    undefined,
    flicker,
  );
  composed.set(memo, grid);
  return grid;
}

const where = (
  sweepCase: SweepCase,
  expression: string,
  flicker: number,
): string => `[${expression}/static:${flicker}] ${describeCase(sweepCase)}`;

/** Everything one composed portrait must satisfy. */
function portraitFaults(grid: PixelGrid, label: string): string[] {
  const faults: string[] = [];
  for (const error of gridErrors(grid)) faults.push(`${label}: ${error}`);
  if (grid.length !== PORTRAIT_FRAME.height) {
    faults.push(`${label}: ${grid.length} rows, expected ${PORTRAIT_FRAME.height}`);
  }
  const width = grid[0]?.length ?? 0;
  if (width !== PORTRAIT_FRAME.width) {
    faults.push(`${label}: ${width} columns, expected ${PORTRAIT_FRAME.width}`);
  }
  if (silhouetteArea(grid) === 0) {
    faults.push(`${label}: silhouette is empty — nothing to trace`);
  }
  const silhouette = silhouetteGrid(grid);
  if (silhouette.length !== grid.length) {
    faults.push(`${label}: silhouette does not match the frame`);
  }
  return faults;
}

describe("every combination composes a portrait", () => {
  it("renders a valid 48×48 face for every expression and flicker frame", () => {
    const faults: string[] = [];
    plan.cases.forEach((sweepCase, index) => {
      for (const expression of EXPRESSION_IDS) {
        for (const flicker of FLICKERS) {
          const label = where(sweepCase, expression, flicker);
          let grid: PixelGrid;
          try {
            grid = portraitOf(index, expression, flicker);
          } catch (error) {
            faults.push(`${label}: threw ${String(error)}`);
            continue;
          }
          faults.push(...portraitFaults(grid, label));
        }
      }
    });
    expect(faultReport(faults)).toBe("");
  });

  it("keeps every resolved part inside its declared region", () => {
    const faults: string[] = [];
    for (const sweepCase of plan.cases) {
      for (const expression of EXPRESSION_IDS) {
        for (const flicker of FLICKERS) {
          const parts = resolvePortraitParts(
            sweepCase.appearance,
            sweepCase.equipment,
            expression,
            undefined,
            flicker,
          );
          for (const part of parts) {
            const kind = portraitPartKind(part.key);
            const region = PORTRAIT_PART_REGIONS[kind];
            if (!region) {
              faults.push(`unknown portrait part kind "${kind}" (${part.key})`);
              continue;
            }
            const outside = pixelsOutside(part.grid, region);
            if (outside.length > 0) {
              faults.push(
                `${describeFault({
                  slot: "face",
                  art: part.key,
                  view: "front",
                  rule: `outside the ${kind} region`,
                  pixels: outside,
                })} — ${where(sweepCase, expression, flicker)}`,
              );
            }
          }
        }
      }
    }
    expect(faultReport(faults)).toBe("");
  });

  it("never lets a hair crown fall across the face", () => {
    const faults: string[] = [];
    for (const sweepCase of plan.cases) {
      for (const part of resolvePortraitParts(
        sweepCase.appearance,
        sweepCase.equipment,
      )) {
        if (portraitPartKind(part.key) !== "hair") continue;
        const over = hairOverFace(part.grid);
        if (over.length > 0) {
          faults.push(
            `${part.key} covers the face at ${over.slice(0, 4).join(", ")} — ${describeCase(sweepCase)}`,
          );
        }
      }
    }
    expect(faultReport(faults)).toBe("");
  });

  it("composes the resolved parts into exactly what composePortrait draws", () => {
    const faults: string[] = [];
    for (const sweepCase of plan.perOption) {
      for (const expression of EXPRESSION_IDS) {
        const parts = resolvePortraitParts(
          sweepCase.appearance,
          sweepCase.equipment,
          expression,
        );
        const rebuilt = composeGrids(
          parts.map(({ grid, remap }) => ({ grid, remap })),
          PORTRAIT_FRAME,
        );
        const composed = composePortrait(
          sweepCase.appearance,
          sweepCase.equipment,
          expression,
        );
        if (rebuilt.join("\n") !== composed.join("\n")) {
          faults.push(`parts and portrait disagree — ${describeCase(sweepCase)}`);
        }
      }
    }
    expect(faultReport(faults)).toBe("");
  });
});

describe("expressions are total over the catalogs", () => {
  it("resolves an overlay pair for every mouth × brow × expression", () => {
    const faults: string[] = [];
    for (const mouth of appearanceCatalogs.mouth) {
      for (const brows of appearanceCatalogs.brows) {
        for (const expression of EXPRESSION_IDS) {
          try {
            const overlays = resolveExpression(mouth.id, brows.id, expression);
            if (overlays.mouth.length === 0 || overlays.brows.length === 0) {
              faults.push(`${mouth.id}/${brows.id}@${expression}: empty overlay`);
            }
          } catch (error) {
            faults.push(`${mouth.id}/${brows.id}@${expression}: ${String(error)}`);
          }
        }
      }
    }
    expect(faultReport(faults)).toBe("");
  });

  it("shows every expression the face is not masked out of", () => {
    // Two expressions draw one face exactly when everything separating
    // them is hidden under something opaque — which, in practice, is a
    // full-face rebreather over the mouth and brows. That is read off
    // the art (differsVisibly walks the resolved stack), not from a
    // list of which headwear covers what, so a new mask needs no test
    // edit and a mask that stopped covering fails here.
    const faults: string[] = [];
    plan.cases.forEach((sweepCase, index) => {
      const stacks = new Map<string, PixelGrid[]>();
      for (const expression of EXPRESSION_IDS) {
        stacks.set(
          expression,
          resolvePortraitParts(
            sweepCase.appearance,
            sweepCase.equipment,
            expression,
          ).map((part) => part.grid),
        );
      }
      const drawnFaces = new Map<string, string>(
        EXPRESSION_IDS.map((expression) => [
          expression,
          portraitOf(index, expression).join("\n"),
        ]),
      );
      for (const a of EXPRESSION_IDS) {
        for (const b of EXPRESSION_IDS) {
          if (a >= b) continue;
          const visible = differsVisibly(stacks.get(a) ?? [], stacks.get(b) ?? []);
          const drawn = drawnFaces.get(a) !== drawnFaces.get(b);
          if (drawn !== visible) {
            faults.push(
              `"${a}" and "${b}" ${drawn ? "draw two faces" : "draw one face"} but the stack says ${visible ? "two" : "one"} — ${describeCase(sweepCase)}`,
            );
          }
        }
      }
    });
    expect(faultReport(faults)).toBe("");
  });

  it("keeps at least the mouth speaking on a bare face", () => {
    // The guard on the test above: with nothing over the face, every
    // expression really is a different picture.
    const faults: string[] = [];
    plan.cases.forEach((sweepCase, index) => {
      if (sweepCase.appearance.headwear !== "none") return;
      const drawn = new Map<string, string>();
      for (const expression of EXPRESSION_IDS) {
        const grid = portraitOf(index, expression).join("\n");
        const already = drawn.get(grid);
        if (already !== undefined) {
          faults.push(
            `"${expression}" is the same bare face as "${already}" — ${describeCase(sweepCase)}`,
          );
        }
        drawn.set(grid, expression);
      }
    });
    expect(faultReport(faults)).toBe("");
  });
});

describe("the Static flicker", () => {
  it("leaves the clean frame clean and tears the rest, in every case", () => {
    const faults: string[] = [];
    plan.cases.forEach((sweepCase, index) => {
      const clean = portraitOf(index, "neutral", 0).join("\n");
      for (const flicker of FLICKERS.slice(1)) {
        const torn = portraitOf(index, "neutral", flicker).join("\n");
        if (torn === clean) {
          faults.push(
            `flicker ${flicker} left no tear — ${describeCase(sweepCase)}`,
          );
        }
      }
    });
    expect(faultReport(faults)).toBe("");
  });

  it("wraps a clock in either direction rather than throwing on one", () => {
    for (const frame of [-7, -1, 0, 1, 2, 3, 99]) {
      expect(() => staticFlickerPart(frame)).not.toThrow();
    }
    expect(staticFlickerPart(0)).toBeNull();
    expect(staticFlickerPart(FLICKERS.length)).toBeNull();
    expect(staticFlickerPart(-FLICKERS.length)).toBeNull();
  });
});

describe("portrait bake keys", () => {
  it("never hands two different faces the same key", () => {
    // Two looks may legitimately share a portrait — a weapon and a body
    // implant are invisible above the shoulders — so a shared key is
    // only a bug when the faces differ. That is the property the bake
    // cache actually rests on.
    const seen = new Map<string, { label: string; grid: string }>();
    const faults: string[] = [];
    plan.cases.forEach((sweepCase, index) => {
      for (const expression of EXPRESSION_IDS) {
        for (const flicker of FLICKERS) {
          const key = portraitKey(
            sweepCase.appearance,
            sweepCase.equipment,
            expression,
            undefined,
            flicker,
          );
          const label = where(sweepCase, expression, flicker);
          const grid = portraitOf(index, expression, flicker).join("\n");
          const previous = seen.get(key);
          if (previous && previous.grid !== grid) {
            faults.push(`portrait key collision:\n  ${label}\n  ${previous.label}`);
            continue;
          }
          if (!previous) seen.set(key, { label, grid });
        }
      }
    });
    expect(faultReport(faults)).toBe("");
  });

  it("is stable: the same inputs key the same however they were built", () => {
    const faults: string[] = [];
    for (const sweepCase of plan.cases) {
      const again = portraitKey(
        { ...sweepCase.appearance },
        { ...sweepCase.equipment, enhancements: { ...sweepCase.equipment.enhancements } },
      );
      if (again !== portraitKey(sweepCase.appearance, sweepCase.equipment)) {
        faults.push(`portrait key is not stable — ${describeCase(sweepCase)}`);
      }
    }
    expect(faultReport(faults)).toBe("");
  });

  it("serializes remaps canonically, so equal looks never miss the cache", () => {
    expect(remapKey({ a: "b", c: "d" })).toBe(remapKey({ c: "d", a: "b" }));
    expect(remapKey({})).toBe("");
  });
});
