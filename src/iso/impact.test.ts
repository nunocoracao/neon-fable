import { describe, expect, it } from "vitest";
import { ATTACK_CLASS_IDS, attackImpactMs, type AttackClassId } from "./attack";
import { TILE_W, worldToScreen } from "./coords";
import {
  ATTACK_FX_STYLE,
  EFFECT_SPRITE_IDS,
  EFFECT_TIMING,
  MISS_OVERSHOOT_TILES,
  REDUCED_IMPACT_MS,
  TRACER_DIRECTIONS,
  TRACER_MAX_MS,
  TRACER_MIN_MS,
  TRACER_SPEED_PX_PER_MS,
  effectFrameAt,
  effectKind,
  effectSpriteId,
  impactSequence,
  overshootPoint,
  swipeSpriteId,
  tracerDirection,
  tracerPointAt,
  tracerProgress,
  tracerSpriteId,
  tracerTravelMs,
} from "./impact";

/**
 * The sequence between a swing and the flinch that answers it. What is
 * under test: that every class delivers its blow somehow, that the
 * beats stay in order (weapon, then flight, then impact), that a fired
 * round's flight actually scales with the distance it crosses, that a
 * miss carries past its target, and that reduced motion still leaves
 * something on screen to read a hit by.
 */

/** Fine enough to land inside the shortest authored hold (40ms). */
const STEP_MS = 5;

/** Every frame an effect window shows over its whole life, in order. */
function playedFrames(
  sequence: ReturnType<typeof impactSequence>,
  pick: "launch" | "impact",
): number[] {
  const window = pick === "launch" ? sequence.launch : sequence.impact;
  if (!window) return [];
  const played: number[] = [];
  for (let t = 0; t <= sequence.endMs + 60; t += STEP_MS) {
    const frame = effectFrameAt(window, t);
    if (frame === null) continue;
    if (played[played.length - 1] !== frame) played.push(frame);
  }
  return played;
}

describe("attack effect styles", () => {
  it("gives every attack class a way to land its blow", () => {
    for (const attackClass of ATTACK_CLASS_IDS) {
      expect(ATTACK_FX_STYLE[attackClass], attackClass).toBeDefined();
    }
    // Guns fire, edges swing, fists are their own impact.
    expect(ATTACK_FX_STYLE.pistol).toBe("tracer");
    expect(ATTACK_FX_STYLE.rifle).toBe("tracer");
    expect(ATTACK_FX_STYLE.blade).toBe("swipe");
    expect(ATTACK_FX_STYLE.unarmed).toBe("flash");
  });

  it("authors one effect id per direction the art carries", () => {
    expect(new Set(EFFECT_SPRITE_IDS).size).toBe(EFFECT_SPRITE_IDS.length);
    for (const dir of TRACER_DIRECTIONS) {
      expect(EFFECT_SPRITE_IDS).toContain(`tracer-${dir}`);
    }
    for (const id of EFFECT_SPRITE_IDS) {
      expect(EFFECT_TIMING[effectKind(id)], id).toBeDefined();
    }
  });
});

describe("the sequence of one blow", () => {
  for (const attackClass of ATTACK_CLASS_IDS) {
    describe(attackClass, () => {
      const style = ATTACK_FX_STYLE[attackClass];

      it("launches on the swing's own impact beat and lands after it", () => {
        const sequence = impactSequence(attackClass, { distancePx: 300 });
        expect(sequence.launchMs).toBe(attackImpactMs(attackClass));
        expect(sequence.contactMs).toBeGreaterThanOrEqual(sequence.launchMs);
        // Nothing ends before it lands, and nothing outlives the whole.
        expect(sequence.impact.startMs).toBe(sequence.contactMs);
        expect(sequence.endMs).toBeGreaterThanOrEqual(sequence.impact.endMs);
        if (sequence.launch) {
          expect(sequence.launch.startMs).toBe(sequence.launchMs);
          expect(sequence.endMs).toBeGreaterThanOrEqual(sequence.launch.endMs);
        }
      });

      it("plays its authored effect frames in order and leaves nothing behind", () => {
        const sequence = impactSequence(attackClass, { distancePx: 300 });
        const impact = playedFrames(sequence, "impact");
        expect(impact).toEqual(
          Array.from({ length: sequence.impact.frameCount }, (_, i) => i),
        );
        expect(effectFrameAt(sequence.impact, sequence.impact.endMs)).toBeNull();
        expect(effectFrameAt(sequence.impact, sequence.contactMs - 1)).toBeNull();
        if (sequence.launch) {
          expect(playedFrames(sequence, "launch")).toEqual(
            Array.from({ length: sequence.launch.frameCount }, (_, i) => i),
          );
        }
      });

      it("carries the right effects for its style", () => {
        const sequence = impactSequence(attackClass, { distancePx: 300 });
        if (style === "tracer") {
          // Flash at the gun, flight between, sparks where it arrives.
          expect(sequence.launch?.kind).toBe("muzzle");
          expect(sequence.travelMs).toBeGreaterThan(0);
          expect(sequence.contactMs).toBe(
            sequence.launchMs + sequence.travelMs,
          );
          expect(sequence.impact.kind).toBe("spark");
        } else if (style === "swipe") {
          // The arc is the whole travel: it lands as it comes through.
          expect(sequence.launch?.kind).toBe("swipe");
          expect(sequence.travelMs).toBe(0);
          expect(sequence.contactMs).toBe(sequence.launchMs);
          expect(sequence.impact.kind).toBe("spark");
        } else {
          // A fist throws nothing; the flash is the whole show.
          expect(sequence.launch).toBeNull();
          expect(sequence.travelMs).toBe(0);
          expect(sequence.impact.kind).toBe("flash");
        }
      });

      it("puffs wall dust past the target when it misses", () => {
        const missed = impactSequence(attackClass, {
          distancePx: 300,
          hit: false,
        });
        expect(missed.impact.kind).toBe("chip");
        // A miss is thrown exactly like a hit — only its ending differs.
        const landed = impactSequence(attackClass, { distancePx: 300 });
        expect(missed.launchMs).toBe(landed.launchMs);
        expect(missed.launch?.kind).toBe(landed.launch?.kind);
      });

      it("collapses to one held impact frame under reduced motion", () => {
        const sequence = impactSequence(attackClass, {
          distancePx: 300,
          reducedMotion: true,
        });
        expect(sequence.launch, "nothing leaves the weapon").toBeNull();
        expect(sequence.travelMs, "nothing travels").toBe(0);
        expect(sequence.contactMs, "it lands on the spot").toBe(0);
        expect(sequence.impact.frameCount).toBe(1);
        expect(sequence.endMs).toBe(REDUCED_IMPACT_MS);
        // And that one frame is on screen for the whole hold.
        expect(effectFrameAt(sequence.impact, 0)).toBe(0);
        expect(effectFrameAt(sequence.impact, REDUCED_IMPACT_MS - 1)).toBe(0);
        expect(effectFrameAt(sequence.impact, REDUCED_IMPACT_MS)).toBeNull();
      });
    });
  }

  it("orders the whole exchange: weapon, flight, impact", () => {
    // A rifle across four tiles is the longest sequence in the game.
    const from = worldToScreen(0, 0);
    const to = worldToScreen(4, 0);
    const sequence = impactSequence("rifle", {
      distancePx: Math.hypot(to.sx - from.sx, to.sy - from.sy),
    });
    const beats = [
      sequence.launch?.startMs ?? 0,
      sequence.contactMs,
      sequence.impact.endMs,
    ];
    expect(beats).toEqual([...beats].sort((a, b) => a - b));
    // The round really is in the air between the two, and only then.
    expect(tracerProgress(sequence, sequence.launchMs - 1)).toBeNull();
    expect(tracerProgress(sequence, sequence.launchMs)).toBe(0);
    expect(tracerProgress(sequence, sequence.contactMs)).toBeNull();
    const mid = tracerProgress(
      sequence,
      sequence.launchMs + sequence.travelMs / 2,
    );
    expect(mid).toBeCloseTo(0.5, 5);
  });
});

describe("tracer flight", () => {
  it("takes longer the further it goes, within sane bounds", () => {
    expect(tracerTravelMs(TILE_W)).toBe(
      Math.round(TILE_W / TRACER_SPEED_PX_PER_MS),
    );
    expect(tracerTravelMs(2 * TILE_W)).toBeGreaterThan(tracerTravelMs(TILE_W));
    expect(tracerTravelMs(0)).toBe(TRACER_MIN_MS);
    expect(tracerTravelMs(100_000)).toBe(TRACER_MAX_MS);
  });

  it("is deterministic: the same beat always puts the round in the same place", () => {
    const from = { sx: 0, sy: 0 };
    const to = { sx: 200, sy: -100 };
    for (const t of [0, 0.25, 0.5, 1]) {
      expect(tracerPointAt(from, to, t)).toEqual(tracerPointAt(from, to, t));
    }
    expect(tracerPointAt(from, to, 0)).toEqual(from);
    expect(tracerPointAt(from, to, 1)).toEqual(to);
    expect(tracerPointAt(from, to, 0.5)).toEqual({ sx: 100, sy: -50 });
  });

  it("draws along the slope it travels", () => {
    // Flat, the iso grid's own 2:1 diagonal, and vertical, both ways.
    expect(tracerDirection(100, 0)).toBe("e");
    expect(tracerDirection(-100, 0)).toBe("w");
    expect(tracerDirection(100, 50)).toBe("se");
    expect(tracerDirection(100, -50)).toBe("ne");
    expect(tracerDirection(-100, 50)).toBe("sw");
    expect(tracerDirection(-100, -50)).toBe("nw");
    expect(tracerDirection(0, 100)).toBe("s");
    expect(tracerDirection(0, -100)).toBe("n");
    // A shot along an iso axis is drawn on the diagonal art, which is
    // that axis: one tile east is TILE_W/2 across and TILE_H/2 down.
    const axis = worldToScreen(1, 0);
    expect(tracerDirection(axis.sx, axis.sy)).toBe("se");
    // Every direction resolves to a registered picture.
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [1, 1],
      [-1, 1],
      [0, 1],
      [0, -1],
      [0, 0],
    ] as const) {
      expect(EFFECT_SPRITE_IDS).toContain(tracerSpriteId(dx, dy));
    }
  });

  it("swings the smear on the hand the blow is thrown from", () => {
    expect(swipeSpriteId(60)).toBe("swipe-e");
    expect(swipeSpriteId(-60)).toBe("swipe-w");
    expect(effectSpriteId("muzzle")).toBe("muzzle-flash");
    expect(effectSpriteId("spark")).toBe("spark-burst");
    expect(effectSpriteId("chip")).toBe("wall-chip");
    expect(effectSpriteId("flash")).toBe("impact-flash");
  });
});

describe("misses", () => {
  it("carry a tile past the target along the attacker's own line", () => {
    const past = overshootPoint({ x: 2, y: 2 }, { x: 5, y: 2 });
    expect(past).toEqual({ x: 5 + MISS_OVERSHOOT_TILES, y: 2 });
    // Diagonal lines overshoot along themselves, not along an axis.
    const diagonal = overshootPoint({ x: 0, y: 0 }, { x: 3, y: 4 });
    expect(diagonal.x).toBeCloseTo(3 + 0.6, 5);
    expect(diagonal.y).toBeCloseTo(4 + 0.8, 5);
    // It always ends up further from the attacker than the target was.
    const reach = Math.hypot(diagonal.x, diagonal.y);
    expect(reach).toBeGreaterThan(Math.hypot(3, 4));
  });

  it("land where they were aimed when there is no line to carry", () => {
    expect(overshootPoint({ x: 4, y: 4 }, { x: 4, y: 4 })).toEqual({
      x: 4,
      y: 4,
    });
  });

  it("takes a fired round longer to reach the overshoot than the target", () => {
    const attacker = { x: 0, y: 0 };
    const target = { x: 3, y: 0 };
    const px = (point: { x: number; y: number }): number => {
      const at = worldToScreen(point.x, point.y);
      return Math.hypot(at.sx, at.sy);
    };
    const hit = impactSequence("pistol", { distancePx: px(target) });
    const miss = impactSequence("pistol", {
      distancePx: px(overshootPoint(attacker, target)),
      hit: false,
    });
    expect(miss.contactMs).toBeGreaterThan(hit.contactMs);
  });
});

describe("effect timing", () => {
  it("holds every effect long enough to see and short enough to keep up", () => {
    for (const kind of Object.keys(EFFECT_TIMING) as Array<
      keyof typeof EFFECT_TIMING
    >) {
      const { frameMs, frameCount } = EFFECT_TIMING[kind];
      expect(frameCount, `${kind} frames`).toBeGreaterThanOrEqual(1);
      expect(frameMs * frameCount, `${kind} length`).toBeLessThanOrEqual(300);
    }
    // Nothing outlasts the reaction it is playing over.
    const swing = impactSequence("blade", { distancePx: 200 });
    expect(swing.endMs - swing.contactMs).toBeLessThanOrEqual(300);
  });

  it("keeps a class's whole sequence inside a single exchange", () => {
    for (const attackClass of ATTACK_CLASS_IDS as readonly AttackClassId[]) {
      const sequence = impactSequence(attackClass, { distancePx: 700 });
      expect(sequence.endMs, attackClass).toBeLessThan(1200);
    }
  });
});
