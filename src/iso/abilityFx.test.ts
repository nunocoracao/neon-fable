import { describe, expect, it } from "vitest";
import {
  ABILITY_FX,
  ABILITY_FX_IDS,
  AURA_CAST_MS,
  BEAM_MAX_SEGMENTS,
  abilityCastMs,
  abilityFxFrameAt,
  abilityFxSequence,
  beamPoints,
  beamSegmentCount,
  castsWithWeapon,
  planAbilityCast,
  type AbilityFxTarget,
} from "./abilityFx";
import { ATTACK_CLASS_IDS, attackImpactMs } from "./attack";
import { REDUCED_IMPACT_MS } from "./impact";
import { REACTION_STAGGER_MS, scheduleReaction, type ScheduledReaction } from "./reaction";

/**
 * The ability sequencer: cast wind-up, effect, then the answers. What is
 * under test is that the timeline is derived rather than guessed, that a
 * cast reaching several bodies goes off on all of them at once and is
 * answered down the initiative order, and that the whole thing is a pure
 * function of its inputs — the same cast plans the same way however its
 * targets were listed, which is what makes an area effect reproducible.
 */

const FORMS = ["beam", "burst", "cloud", "aura"] as const;

describe("the archetype registry", () => {
  it("describes every archetype with timing the art can be authored to", () => {
    for (const id of ABILITY_FX_IDS) {
      const spec = ABILITY_FX[id];
      expect(FORMS, `${id} form`).toContain(spec.form);
      expect(spec.frameCount, `${id} frames`).toBeGreaterThan(0);
      expect(spec.frameMs, `${id} hold`).toBeGreaterThan(0);
      expect(spec.loops, `${id} loops`).toBeGreaterThanOrEqual(1);
      // The blow has to land on a frame that is actually drawn.
      expect(spec.contactFrame, `${id} contact frame`).toBeGreaterThanOrEqual(0);
      expect(spec.contactFrame, `${id} contact frame`).toBeLessThan(spec.frameCount);
    }
  });

  it("lays a chain only where there is a line to lay one along", () => {
    for (const id of ABILITY_FX_IDS) {
      const spec = ABILITY_FX[id];
      if (spec.form === "beam") {
        expect(spec.segmentSpacingPx, `${id} spacing`).toBeGreaterThan(0);
        expect(spec.amplitudePx, `${id} amplitude`).toBeGreaterThanOrEqual(0);
      } else {
        expect(spec.segmentSpacingPx, `${id} spacing`).toBe(0);
        expect(spec.amplitudePx, `${id} amplitude`).toBe(0);
      }
    }
  });

  it("only lingers where lingering is the point", () => {
    for (const id of ABILITY_FX_IDS) {
      const spec = ABILITY_FX[id];
      if (spec.loops > 1) expect(spec.form, `${id} loops`).toBe("cloud");
    }
  });
});

describe("the cast wind-up", () => {
  it("throws on the caster's own swing beat, and gathers for an aura", () => {
    for (const id of ABILITY_FX_IDS) {
      for (const attackClass of ATTACK_CLASS_IDS) {
        const castMs = abilityCastMs(id, attackClass);
        if (castsWithWeapon(id)) {
          expect(castMs, `${id} with ${attackClass}`).toBe(
            attackImpactMs(attackClass),
          );
        } else {
          expect(castMs, `${id} with ${attackClass}`).toBe(AURA_CAST_MS);
        }
      }
    }
  });

  it("swings a weapon for everything that leaves the body, and nothing else", () => {
    for (const id of ABILITY_FX_IDS) {
      expect(castsWithWeapon(id), id).toBe(ABILITY_FX[id].form !== "aura");
    }
  });
});

describe("the cast timeline", () => {
  it("puts the effect on the wind-up beat and the blow on its contact frame", () => {
    for (const id of ABILITY_FX_IDS) {
      const spec = ABILITY_FX[id];
      const sequence = abilityFxSequence(id, { castMs: 200 });
      expect(sequence.castMs, id).toBe(200);
      expect(sequence.effect.startMs, id).toBe(200);
      expect(sequence.contactMs, id).toBe(200 + spec.contactFrame * spec.frameMs);
      expect(sequence.endMs, id).toBe(
        200 + spec.frameMs * spec.frameCount * spec.loops,
      );
      // Nothing lands after its own effect has finished playing.
      expect(sequence.contactMs, id).toBeLessThan(sequence.endMs);
    }
  });

  it("is the same sequence every time it is asked for", () => {
    for (const id of ABILITY_FX_IDS) {
      expect(abilityFxSequence(id, { castMs: 90 })).toEqual(
        abilityFxSequence(id, { castMs: 90 }),
      );
    }
  });

  it("holds a cloud over the tile for several passes of its frames", () => {
    const spec = ABILITY_FX["nano-cloud"];
    const sequence = abilityFxSequence("nano-cloud", { castMs: 0 });
    expect(spec.loops).toBeGreaterThan(1);
    expect(sequence.endMs).toBe(spec.frameMs * spec.frameCount * spec.loops);
    // It wraps rather than stopping on its last frame.
    expect(abilityFxFrameAt(sequence.effect, spec.frameMs * spec.frameCount)).toBe(0);
  });
});

describe("which frame is showing", () => {
  it("shows nothing before the effect fires or once it is over", () => {
    const sequence = abilityFxSequence("optic-flash", { castMs: 100 });
    expect(abilityFxFrameAt(sequence.effect, 99)).toBeNull();
    expect(abilityFxFrameAt(sequence.effect, 100)).toBe(0);
    expect(abilityFxFrameAt(sequence.effect, sequence.endMs)).toBeNull();
    expect(abilityFxFrameAt(sequence.effect, sequence.endMs + 500)).toBeNull();
  });

  it("walks every authored frame, in order, exactly once per pass", () => {
    for (const id of ABILITY_FX_IDS) {
      const spec = ABILITY_FX[id];
      const sequence = abilityFxSequence(id, { castMs: 0 });
      const seen: number[] = [];
      for (let t = 0; t < spec.frameMs * spec.frameCount; t += 5) {
        const frame = abilityFxFrameAt(sequence.effect, t);
        if (frame !== null && frame !== seen[seen.length - 1]) seen.push(frame);
      }
      expect(seen, id).toEqual(
        Array.from({ length: spec.frameCount }, (_, i) => i),
      );
    }
  });
});

describe("reduced motion", () => {
  it("collapses every archetype to one marker held at time zero", () => {
    for (const id of ABILITY_FX_IDS) {
      const sequence = abilityFxSequence(id, {
        castMs: 500,
        reducedMotion: true,
      });
      expect(sequence.castMs, id).toBe(0);
      expect(sequence.contactMs, id).toBe(0);
      expect(sequence.effect.frameCount, id).toBe(1);
      expect(sequence.endMs, id).toBe(REDUCED_IMPACT_MS);
      expect(abilityFxFrameAt(sequence.effect, 0), id).toBe(0);
      expect(abilityFxFrameAt(sequence.effect, REDUCED_IMPACT_MS - 1), id).toBe(0);
      expect(abilityFxFrameAt(sequence.effect, REDUCED_IMPACT_MS), id).toBeNull();
    }
  });
});

describe("planning a cast over its targets", () => {
  const targets: AbilityFxTarget[] = [
    { entityId: "enemy-c", order: 2 },
    { entityId: "player", order: 0 },
    { entityId: "enemy-b", order: 1 },
  ];

  it("goes off on every target at once", () => {
    const plan = planAbilityCast("snare-mesh", targets, { castMs: 120 });
    expect(plan.plays).toHaveLength(3);
    const starts = new Set(plan.plays.map((p) => p.startMs));
    const ends = new Set(plan.plays.map((p) => p.endMs));
    expect(starts).toEqual(new Set([plan.sequence.effect.startMs]));
    expect(ends).toEqual(new Set([plan.sequence.effect.endMs]));
  });

  it("asks for its answers in initiative order, all on the contact beat", () => {
    const plan = planAbilityCast("snare-mesh", targets, { castMs: 120 });
    expect(plan.reactions.map((r) => r.entityId)).toEqual([
      "player",
      "enemy-b",
      "enemy-c",
    ]);
    for (const reaction of plan.reactions) {
      expect(reaction.beatMs).toBe(plan.sequence.contactMs);
    }
  });

  it("plans the same cast however its targets were listed", () => {
    const shuffled = [targets[1]!, targets[0]!, targets[2]!];
    expect(planAbilityCast("optic-flash", shuffled, { castMs: 80 })).toEqual(
      planAbilityCast("optic-flash", targets, { castMs: 80 }),
    );
  });

  it("hits a body caught twice by one cast exactly once", () => {
    const plan = planAbilityCast(
      "optic-flash",
      [
        { entityId: "enemy-b", order: 1 },
        { entityId: "enemy-b", order: 1 },
      ],
      { castMs: 0 },
    );
    expect(plan.plays).toHaveLength(1);
    expect(plan.reactions).toHaveLength(1);
  });

  it("breaks an initiative tie by id, so a tie is still an order", () => {
    const plan = planAbilityCast(
      "optic-flash",
      [
        { entityId: "enemy-z", order: 3 },
        { entityId: "enemy-a", order: 3 },
      ],
      { castMs: 0 },
    );
    expect(plan.reactions.map((r) => r.entityId)).toEqual(["enemy-a", "enemy-z"]);
  });

  it("plans nothing for a cast that reached nobody", () => {
    const plan = planAbilityCast("focus-ring", [], { castMs: 0 });
    expect(plan.plays).toEqual([]);
    expect(plan.reactions).toEqual([]);
  });
});

describe("an area cast, answered", () => {
  /** Queue a whole plan's reactions the way the combat screen does. */
  function queueAll(
    plan: ReturnType<typeof planAbilityCast>,
    nowMs: number,
    order: readonly number[],
  ): readonly ScheduledReaction[] {
    let queue: readonly ScheduledReaction[] = [];
    for (const index of order) {
      const request = plan.reactions[index];
      if (!request) continue;
      queue = scheduleReaction(
        queue,
        {
          entityId: request.entityId,
          kind: "flinch",
          awayX: 1,
          order: request.order,
          beatMs: nowMs + request.beatMs,
        },
        nowMs,
      ).queue;
    }
    return queue;
  }

  const plan = planAbilityCast(
    "snare-mesh",
    [
      { entityId: "enemy-c", order: 2 },
      { entityId: "player", order: 0 },
      { entityId: "enemy-b", order: 1 },
    ],
    { castMs: 120 },
  );

  it("staggers the flinches down the initiative order", () => {
    const queue = queueAll(plan, 1000, [0, 1, 2]);
    const starts = queue.map((r) => ({ id: r.entityId, startMs: r.startMs }));
    const beat = 1000 + plan.sequence.contactMs;
    expect(starts).toEqual([
      { id: "player", startMs: beat },
      { id: "enemy-b", startMs: beat + REACTION_STAGGER_MS },
      { id: "enemy-c", startMs: beat + REACTION_STAGGER_MS * 2 },
    ]);
  });

  it("puts them in that order however they were queued", () => {
    const forwards = queueAll(plan, 1000, [0, 1, 2]);
    const backwards = queueAll(plan, 1000, [2, 1, 0]);
    const byId = (queue: readonly ScheduledReaction[]) =>
      [...queue]
        .sort((a, b) => (a.entityId < b.entityId ? -1 : 1))
        .map((r) => `${r.entityId}@${r.startMs}`);
    expect(byId(backwards)).toEqual(byId(forwards));
  });
});

describe("the beam chain", () => {
  const from = { sx: 0, sy: 0 };
  const to = { sx: 120, sy: 60 };

  it("scales its links to the length of the line, within reason", () => {
    expect(beamSegmentCount(0, 11)).toBe(2);
    expect(beamSegmentCount(110, 11)).toBe(10);
    expect(beamSegmentCount(100_000, 11)).toBe(BEAM_MAX_SEGMENTS);
    // A form with no chain to lay asks for no links at all.
    expect(beamSegmentCount(300, 0)).toBe(0);
  });

  it("runs from the caster to the target, ending on the target itself", () => {
    const points = beamPoints(from, to, 6, 0, 9);
    expect(points).toHaveLength(6);
    const last = points[points.length - 1]!;
    expect(last.sx).toBeCloseTo(to.sx, 6);
    expect(last.sy).toBeCloseTo(to.sy, 6);
    // Every link is closer to the target than the one before it.
    let previous = Infinity;
    for (const point of points) {
      const gap = Math.hypot(point.sx - to.sx, point.sy - to.sy);
      expect(gap).toBeLessThan(previous);
      previous = gap;
    }
  });

  it("wanders to alternating sides of the line, and not past its amplitude", () => {
    const amplitude = 9;
    const points = beamPoints(from, to, 8, 0, amplitude);
    const length = Math.hypot(to.sx, to.sy);
    const offsets = points.map(
      // Signed distance from the line, positive on one side.
      (p) => (-to.sy * p.sx + to.sx * p.sy) / length,
    );
    for (const offset of offsets) {
      expect(Math.abs(offset)).toBeLessThanOrEqual(amplitude + 1e-9);
    }
    // Consecutive links sit on opposite sides — that is the jag.
    for (let i = 1; i < offsets.length - 1; i++) {
      expect(Math.sign(offsets[i]!)).toBe(-Math.sign(offsets[i - 1]!));
    }
  });

  it("flips the jag with the frame, which is the whole of the crackle", () => {
    const even = beamPoints(from, to, 6, 0, 9);
    const odd = beamPoints(from, to, 6, 1, 9);
    expect(odd).not.toEqual(even);
    // Same line, same links, mirrored across it.
    even.forEach((point, i) => {
      const other = odd[i]!;
      expect(point.sx + other.sx).toBeCloseTo(2 * (from.sx + (to.sx - from.sx) * ((i + 1) / 6)), 6);
      expect(point.sy + other.sy).toBeCloseTo(2 * (from.sy + (to.sy - from.sy) * ((i + 1) / 6)), 6);
    });
  });

  it("is pure: the same line and frame give the same chain", () => {
    expect(beamPoints(from, to, 5, 2, 7)).toEqual(beamPoints(from, to, 5, 2, 7));
  });

  it("has nowhere to wander when the caster is standing on the target", () => {
    const points = beamPoints(to, to, 4, 0, 9);
    expect(points).toHaveLength(4);
    for (const point of points) expect(point).toEqual(to);
    expect(beamPoints(from, to, 0, 0, 9)).toEqual([]);
  });
});
