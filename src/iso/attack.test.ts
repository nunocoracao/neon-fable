import { describe, expect, it } from "vitest";
import {
  ATTACK_CLASS_IDS,
  ATTACK_TIMING,
  attackDurationMs,
  attackFrameAt,
  attackFrameCount,
  attackImpactMs,
  attackSequence,
  selectMotionFrame,
  type AttackClassId,
} from "./attack";
import { BODY_TIMING, bodyFrameAt } from "./animation";
import { WEAPON_CLASS_IDS } from "./art/layers/weapons";

/**
 * The attack motion model: which frame is showing when, where the
 * impact beat falls, and how an in-flight swing wins over the idle and
 * walk loops. All of it pure over a class id and an elapsed time.
 */

describe("attack timing table", () => {
  it("covers every weapon class plus bare hands", () => {
    for (const weaponClass of WEAPON_CLASS_IDS) {
      expect(
        ATTACK_CLASS_IDS.includes(weaponClass),
        `${weaponClass} can swing`,
      ).toBe(true);
    }
    expect(ATTACK_CLASS_IDS).toContain("unarmed");
  });

  it("gives every class 3-5 frames with positive holds", () => {
    for (const id of ATTACK_CLASS_IDS) {
      const holds = ATTACK_TIMING[id].frameMs;
      expect(holds.length, `${id} frame count`).toBeGreaterThanOrEqual(3);
      expect(holds.length, `${id} frame count`).toBeLessThanOrEqual(5);
      for (const [i, ms] of holds.entries()) {
        expect(ms, `${id} frame ${i} hold`).toBeGreaterThan(0);
      }
      expect(attackFrameCount(id)).toBe(holds.length);
    }
  });

  it("lands every impact on a real frame, never the first or last", () => {
    for (const id of ATTACK_CLASS_IDS) {
      const { impactFrame, frameMs } = ATTACK_TIMING[id];
      expect(impactFrame, `${id} impact frame`).toBeGreaterThan(0);
      expect(impactFrame, `${id} impact frame`).toBeLessThan(frameMs.length - 1);
    }
  });

  it("commits melee weight forward and kicks ranged classes back", () => {
    for (const id of ["unarmed", "blade", "baton", "lash"] as AttackClassId[]) {
      expect(ATTACK_TIMING[id].lungePx, `${id} commits`).toBeGreaterThan(0);
    }
    for (const id of ["pistol", "rifle"] as AttackClassId[]) {
      expect(ATTACK_TIMING[id].lungePx, `${id} recoils`).toBeLessThan(0);
    }
  });
});

describe("attackSequence", () => {
  it("lays frames end to end with no gap or overlap", () => {
    for (const id of ATTACK_CLASS_IDS) {
      const { frames, durationMs } = attackSequence(id);
      expect(frames.length).toBe(attackFrameCount(id));
      expect(frames[0]?.startMs).toBe(0);
      frames.forEach((frame, i) => {
        expect(frame.index, `${id} frame ${i} index`).toBe(i);
        expect(frame.endMs - frame.startMs, `${id} frame ${i} hold`).toBe(
          ATTACK_TIMING[id].frameMs[i],
        );
        if (i > 0) expect(frame.startMs).toBe(frames[i - 1]?.endMs);
      });
      expect(frames[frames.length - 1]?.endMs).toBe(durationMs);
      expect(durationMs).toBe(
        ATTACK_TIMING[id].frameMs.reduce((a, b) => a + b, 0),
      );
    }
  });

  it("puts the impact beat at the start of the impact frame", () => {
    for (const id of ATTACK_CLASS_IDS) {
      const sequence = attackSequence(id);
      const impact = sequence.frames[ATTACK_TIMING[id].impactFrame];
      expect(sequence.impactMs, `${id} impact`).toBe(impact?.startMs);
      expect(attackImpactMs(id)).toBe(sequence.impactMs);
      expect(attackDurationMs(id)).toBe(sequence.durationMs);
      // The impact always falls inside the animation, never after it.
      expect(sequence.impactMs).toBeGreaterThan(0);
      expect(sequence.impactMs).toBeLessThan(sequence.durationMs);
    }
  });

  it("peaks the lunge envelope on the impact beat, inside the animation", () => {
    for (const id of ATTACK_CLASS_IDS) {
      const { impactMs, durationMs, lungeMs, lungePx } = attackSequence(id);
      expect(lungeMs, `${id} lunge`).toBe(Math.min(impactMs * 2, durationMs));
      // lunge01 peaks at the midpoint, so a full envelope tops out on
      // the impact; a clamped one has already peaked by then.
      expect(lungeMs / 2, `${id} lunge peak`).toBeLessThanOrEqual(impactMs);
      expect(lungeMs).toBeLessThanOrEqual(durationMs);
      expect(lungePx).toBe(ATTACK_TIMING[id].lungePx);
    }
  });

  it("is deterministic: the same class always yields the same timeline", () => {
    expect(attackSequence("blade")).toEqual(attackSequence("blade"));
  });
});

describe("attackFrameAt", () => {
  it("holds each frame for exactly its authored duration", () => {
    for (const id of ATTACK_CLASS_IDS) {
      for (const frame of attackSequence(id).frames) {
        expect(attackFrameAt(id, frame.startMs), `${id} @${frame.startMs}`).toBe(
          frame.index,
        );
        expect(attackFrameAt(id, frame.endMs - 1)).toBe(frame.index);
      }
    }
  });

  it("returns null before the swing starts and once it is over", () => {
    const duration = attackDurationMs("rifle");
    expect(attackFrameAt("rifle", -1)).toBeNull();
    expect(attackFrameAt("rifle", duration)).toBeNull();
    expect(attackFrameAt("rifle", duration + 5000)).toBeNull();
    expect(attackFrameAt("rifle", Number.NaN)).toBeNull();
  });

  it("shows the impact frame from the impact beat onward, briefly", () => {
    const impact = attackImpactMs("pistol");
    expect(attackFrameAt("pistol", impact - 1)).toBe(
      ATTACK_TIMING.pistol.impactFrame - 1,
    );
    expect(attackFrameAt("pistol", impact)).toBe(ATTACK_TIMING.pistol.impactFrame);
  });
});

describe("selectMotionFrame", () => {
  it("plays the attack set over both loops while a swing is in flight", () => {
    const impact = attackImpactMs("blade");
    expect(
      selectMotionFrame("blade", {
        moving: true,
        timeMs: 5000,
        attackElapsedMs: impact,
      }),
    ).toEqual({ state: "attack", frame: ATTACK_TIMING.blade.impactFrame });
  });

  it("falls back to the walk loop once the swing has finished", () => {
    const over = attackDurationMs("blade");
    expect(
      selectMotionFrame("blade", {
        moving: true,
        timeMs: 330,
        attackElapsedMs: over,
      }),
    ).toEqual({ state: "walk", frame: bodyFrameAt("walk", 330) });
  });

  it("breathes when standing still with no swing", () => {
    const timeMs = BODY_TIMING.idle.frameMs * 2 + 10;
    expect(selectMotionFrame("unarmed", { moving: false, timeMs })).toEqual({
      state: "idle",
      frame: bodyFrameAt("idle", timeMs),
    });
  });

  it("never selects a frame the class has not authored", () => {
    for (const id of ATTACK_CLASS_IDS) {
      const duration = attackDurationMs(id);
      for (let elapsed = 0; elapsed < duration; elapsed += 7) {
        const { state, frame } = selectMotionFrame(id, {
          moving: false,
          timeMs: 0,
          attackElapsedMs: elapsed,
        });
        expect(state, `${id} @${elapsed}`).toBe("attack");
        expect(frame).toBeGreaterThanOrEqual(0);
        expect(frame).toBeLessThan(attackFrameCount(id));
      }
    }
  });
});
