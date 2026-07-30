import { describe, expect, it } from "vitest";
import { STAT_KEYS } from "../character/stats";
import {
  BOOST_FAMILY,
  STATUS_FAMILY_IDS,
  STATUS_MARKERS,
  STATUS_MARKER_SPACING_PX,
  boostStatusFamily,
  statusFamilies,
  statusMarkerFrame,
  statusMarkerOffsets,
} from "./status";

/**
 * Status markers: which families a body is wearing, and how the glyph
 * that says so behaves. What is under test is that the mapping from the
 * engine's own conditions is total (every stat resolves to a family),
 * that a fact shows once however many times it is true, and that the
 * loop stops but the mark stays under reduced motion.
 */

describe("the family registry", () => {
  it("gives every family a loop the art can be authored to", () => {
    for (const id of STATUS_FAMILY_IDS) {
      const spec = STATUS_MARKERS[id];
      expect(spec.frameCount, `${id} frames`).toBeGreaterThan(1);
      expect(spec.frameMs, `${id} hold`).toBeGreaterThan(0);
      expect(spec.label.length, `${id} label`).toBeGreaterThan(0);
    }
  });

  it("maps every stat to a family, so no boost renders as nothing", () => {
    for (const stat of STAT_KEYS) {
      expect(STATUS_FAMILY_IDS, stat).toContain(boostStatusFamily(stat));
      expect(BOOST_FAMILY[stat], stat).toBe(boostStatusFamily(stat));
    }
    // What a body can take, against what it can do.
    expect(boostStatusFamily("body")).toBe("guarded");
    expect(boostStatusFamily("reflexes")).toBe("empowered");
  });
});

describe("what a body is wearing", () => {
  it("marks nothing when nothing is true of it", () => {
    expect(statusFamilies({})).toEqual([]);
    expect(statusFamilies({ stunTurns: 0, boostStats: [] })).toEqual([]);
  });

  it("marks a lost turn and a boost apart", () => {
    expect(statusFamilies({ stunTurns: 2 })).toEqual(["stunned"]);
    expect(statusFamilies({ boostStats: ["body"] })).toEqual(["guarded"]);
    expect(statusFamilies({ boostStats: ["tech"] })).toEqual(["empowered"]);
  });

  it("says a fact once, however many times it is true", () => {
    expect(
      statusFamilies({ boostStats: ["reflexes", "cool", "intelligence"] }),
    ).toEqual(["empowered"]);
  });

  it("keeps a stable order, so a row of marks never shuffles", () => {
    const marks = statusFamilies({
      stunTurns: 1,
      boostStats: ["reflexes", "body"],
    });
    expect(marks).toEqual(["stunned", "guarded", "empowered"]);
    expect(
      statusFamilies({ stunTurns: 1, boostStats: ["body", "reflexes"] }),
    ).toEqual(marks);
  });
});

describe("the glyph loop", () => {
  it("cycles every family's frames on its own hold", () => {
    for (const id of STATUS_FAMILY_IDS) {
      const { frameMs, frameCount } = STATUS_MARKERS[id];
      expect(statusMarkerFrame(id, 0)).toBe(0);
      expect(statusMarkerFrame(id, frameMs)).toBe(1 % frameCount);
      expect(statusMarkerFrame(id, frameMs * frameCount)).toBe(0);
      for (let t = 0; t < frameMs * frameCount * 2; t += 17) {
        const frame = statusMarkerFrame(id, t);
        expect(frame, `${id} at ${t}`).toBeGreaterThanOrEqual(0);
        expect(frame, `${id} at ${t}`).toBeLessThan(frameCount);
      }
    }
  });

  it("stops the loop but keeps the mark under reduced motion", () => {
    for (const id of STATUS_FAMILY_IDS) {
      expect(statusMarkerFrame(id, 9999, true), id).toBe(0);
    }
  });
});

describe("laying out a row of marks", () => {
  it("centers the row over the body, whatever it holds", () => {
    expect(statusMarkerOffsets(0)).toEqual([]);
    expect(statusMarkerOffsets(1)).toEqual([0]);
    for (const count of [1, 2, 3, 4]) {
      const offsets = statusMarkerOffsets(count);
      expect(offsets).toHaveLength(count);
      const mean = offsets.reduce((a, b) => a + b, 0) / count;
      expect(mean).toBeCloseTo(0, 6);
      for (let i = 1; i < offsets.length; i++) {
        expect(offsets[i]! - offsets[i - 1]!).toBe(STATUS_MARKER_SPACING_PX);
      }
    }
  });
});
