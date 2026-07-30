import { describe, expect, it } from "vitest";
import { ART_SCALE } from "./art/pixel";
import { popupTextGrid } from "./art/popupFont";
import {
  POPUP_KINDS,
  POPUP_LIFT_PX,
  POPUP_MS,
  POPUP_RISE_PX,
  POPUP_STACK_PX,
  POPUP_STYLES,
  STATUS_POPUP_LABELS,
  nextPopupSlot,
  popupMotionAt,
  popupSlotOffsetPx,
  statusPopupKind,
  statusPopupLabel,
} from "./popup";
import { STATUS_FAMILY_IDS } from "./status";

/**
 * The floating readouts, as math. What is under test is everything the
 * arena depends on being a pure function of a kind and an elapsed
 * millisecond count: the curve a number rides, the rungs simultaneous
 * numbers take over one body, and the styling each kind resolves to.
 * Nothing here touches a canvas — the pictures are the font module's
 * business, and the placement is this one's.
 */

describe("popup motion", () => {
  it("is nothing before its beat and nothing after its life", () => {
    expect(popupMotionAt(-1)).toBeNull();
    expect(popupMotionAt(-500)).toBeNull();
    expect(popupMotionAt(POPUP_MS)).toBeNull();
    expect(popupMotionAt(POPUP_MS + 1)).toBeNull();
    expect(popupMotionAt(0)).not.toBeNull();
    expect(popupMotionAt(POPUP_MS - 1)).not.toBeNull();
  });

  it("starts where the blow landed, at full strength", () => {
    const start = popupMotionAt(0);
    expect(start?.risePx).toBe(0);
    expect(start?.alpha).toBe(1);
  });

  it("only ever climbs, and only ever fades", () => {
    let lastRise = -1;
    let lastAlpha = Infinity;
    for (let t = 0; t < POPUP_MS; t += 10) {
      const motion = popupMotionAt(t);
      expect(motion, `t=${t}`).not.toBeNull();
      expect(motion!.risePx).toBeGreaterThanOrEqual(lastRise);
      expect(motion!.alpha).toBeLessThanOrEqual(lastAlpha);
      expect(motion!.alpha).toBeGreaterThanOrEqual(0);
      lastRise = motion!.risePx;
      lastAlpha = motion!.alpha;
    }
    // It gets all the way up, and all the way out.
    expect(lastRise).toBeGreaterThan(POPUP_RISE_PX * 0.95);
    expect(lastRise).toBeLessThanOrEqual(POPUP_RISE_PX);
    expect(lastAlpha).toBeLessThan(0.1);
  });

  it("throws the figure up early and settles, rather than drifting", () => {
    // Half the life in, a linear rise would be exactly half way up.
    const half = popupMotionAt(POPUP_MS / 2);
    expect(half!.risePx).toBeGreaterThan(POPUP_RISE_PX * 0.6);
    // And it is still readable there — the fade is a late thing.
    expect(half!.alpha).toBeGreaterThan(0.7);
  });

  it("is a function of the elapsed time and nothing else", () => {
    for (const t of [0, 37, 250, 899]) {
      expect(popupMotionAt(t)).toEqual(popupMotionAt(t));
    }
  });

  it("reduced motion fades it in place: the reading survives, the travel goes", () => {
    for (let t = 0; t < POPUP_MS; t += 50) {
      const still = popupMotionAt(t, true);
      expect(still!.risePx, `t=${t}`).toBe(0);
      expect(still!.alpha).toBe(popupMotionAt(t)!.alpha);
    }
    expect(popupMotionAt(POPUP_MS, true)).toBeNull();
  });

  it("hangs the whole thing clear of the body it is about", () => {
    // A 32×48 figure stands ~96 screen px tall at ART_SCALE; the lift
    // puts the readout's baseline above its head rather than over it.
    expect(POPUP_LIFT_PX).toBeGreaterThan(48 * ART_SCALE * 0.75);
  });
});

describe("popup stacking", () => {
  it("gives simultaneous readouts their own rungs, lowest first", () => {
    const live: Array<{ slot: number; bornAt: number }> = [];
    for (let i = 0; i < 4; i++) {
      const slot = nextPopupSlot(live, 1000);
      expect(slot).toBe(i);
      live.push({ slot, bornAt: 1000 });
    }
  });

  it("reuses a rung once the readout that held it has gone", () => {
    const live = [{ slot: 0, bornAt: 1000 }];
    expect(nextPopupSlot(live, 1000 + POPUP_MS - 1)).toBe(1);
    expect(nextPopupSlot(live, 1000 + POPUP_MS)).toBe(0);
  });

  it("counts readouts still waiting on a beat of their own", () => {
    // A rifle's figure is scheduled ahead of now; the condition behind
    // it must not be handed the same rung.
    const live = [{ slot: 0, bornAt: 1200 }];
    expect(nextPopupSlot(live, 1000)).toBe(1);
  });

  it("fills the gap a lapsed middle rung leaves", () => {
    const live = [
      { slot: 0, bornAt: 1000 },
      { slot: 2, bornAt: 1000 },
    ];
    expect(nextPopupSlot(live, 1000)).toBe(1);
  });

  it("spaces rungs further apart than the tallest readout draws", () => {
    const tallest = Math.max(
      ...POPUP_KINDS.map(
        (kind) => popupTextGrid("-888", kind).length * ART_SCALE,
      ),
    );
    expect(POPUP_STACK_PX).toBeGreaterThanOrEqual(tallest);
    expect(popupSlotOffsetPx(0)).toBe(0);
    expect(popupSlotOffsetPx(2)).toBe(2 * POPUP_STACK_PX);
    // Negative slots cannot happen, and never push a readout downward.
    expect(popupSlotOffsetPx(-1)).toBe(0);
  });
});

describe("popup styling", () => {
  it("styles every kind, in palette channels, at whole-pixel sizes", () => {
    for (const kind of POPUP_KINDS) {
      const style = POPUP_STYLES[kind];
      expect(style.ink.length, `${kind} ink`).toBe(1);
      expect(Number.isInteger(style.scale), `${kind} scale`).toBe(true);
      expect(style.scale, `${kind} scale`).toBeGreaterThanOrEqual(1);
    }
  });

  it("separates the readings that must never be confused", () => {
    const inkOf = (kind: (typeof POPUP_KINDS)[number]): string =>
      POPUP_STYLES[kind].ink;
    // Damage, a heal, and a miss are three different facts and three
    // different channels — hue is not the only cue, but it is the first.
    expect(new Set([inkOf("damage"), inkOf("heal"), inkOf("miss")]).size).toBe(3);
    // Armor holding reads apart from a plain hit without shouting.
    expect(inkOf("reduced")).not.toBe(inkOf("damage"));
    expect(POPUP_STYLES.reduced.badge).toBe("shield");
    // A critical is the one reading drawn larger; nothing else is.
    expect(POPUP_STYLES.critical.scale).toBeGreaterThan(1);
    for (const kind of POPUP_KINDS) {
      if (kind !== "critical") {
        expect(POPUP_STYLES[kind].scale, `${kind} scale`).toBe(1);
      }
      // Armor is the only thing with a mark to make.
      if (kind !== "reduced") {
        expect(POPUP_STYLES[kind].badge, `${kind} badge`).toBeNull();
      }
    }
    // A condition ending is the same word, gone cold.
    expect(inkOf("status-out")).not.toBe(inkOf("status"));
  });
});

describe("status labels", () => {
  it("gives every family something to say both ways", () => {
    expect(Object.keys(STATUS_POPUP_LABELS).sort()).toEqual(
      [...STATUS_FAMILY_IDS].sort(),
    );
    const said = new Set<string>();
    for (const family of STATUS_FAMILY_IDS) {
      for (const phase of ["gain", "loss"] as const) {
        const label = statusPopupLabel(family, phase);
        expect(label.length, `${family} ${phase}`).toBeGreaterThan(0);
        // Shouted, and short enough to read at a glance over a body.
        expect(label).toBe(label.toUpperCase());
        expect(label.length).toBeLessThanOrEqual(10);
        expect(said.has(label), `${label} said twice`).toBe(false);
        said.add(label);
      }
    }
  });

  it("lights an arriving condition and cools an ending one", () => {
    expect(statusPopupKind("gain")).toBe("status");
    expect(statusPopupKind("loss")).toBe("status-out");
  });
});
