import { describe, expect, it } from "vitest";
import {
  FOCUS_GLIDE_MS,
  FOCUS_SETTLE_PX,
  IMPACT_FEEL,
  IMPACT_WEIGHTS,
  MAX_PAUSE_MS,
  MAX_SHAKE_PX,
  NO_PAUSES,
  advancePauses,
  combinedShakeAt,
  glideCameraAt,
  glideDone,
  hitPauseMs,
  insertPause,
  planCameraGlide,
  resolveCombatFeel,
  sceneTimeAt,
  shakeAmplitudePx,
  shakeDirection,
  shakeFinished,
  shakeOffsetAt,
  type PauseTimeline,
  type ShakeSource,
} from "./cameraFeel";

const FULL = { reducedMotion: false, combatFeel: true, shakeScale: 1 };

describe("resolveCombatFeel", () => {
  it("runs all three when the feel is on and motion is not reduced", () => {
    expect(resolveCombatFeel(FULL)).toEqual({
      focus: true,
      hitPause: true,
      shake: true,
      shakeScale: 1,
    });
  });

  it("switches all three off under reduced motion", () => {
    const feel = resolveCombatFeel({ ...FULL, reducedMotion: true });
    expect(feel.focus).toBe(false);
    expect(feel.hitPause).toBe(false);
    expect(feel.shake).toBe(false);
    expect(feel.shakeScale).toBe(0);
  });

  it("switches all three off from the combat feel toggle alone", () => {
    const feel = resolveCombatFeel({ ...FULL, combatFeel: false });
    expect(feel.focus).toBe(false);
    expect(feel.hitPause).toBe(false);
    expect(feel.shake).toBe(false);
  });

  it("stills the shake by its own setting, leaving the other two", () => {
    const feel = resolveCombatFeel({ ...FULL, shakeScale: 0 });
    expect(feel.shake).toBe(false);
    expect(feel.focus).toBe(true);
    expect(feel.hitPause).toBe(true);
  });

  it("carries the scale through and never lets it go negative", () => {
    expect(resolveCombatFeel({ ...FULL, shakeScale: 1.5 }).shakeScale).toBe(1.5);
    expect(resolveCombatFeel({ ...FULL, shakeScale: -3 }).shakeScale).toBe(0);
  });
});

describe("turn focus glides", () => {
  const from = { sx: 0, sy: 0 };
  const to = { sx: 300, sy: 120 };

  it("plans nothing when the camera is already framing the target", () => {
    expect(planCameraGlide(from, { ...from }, 0, "player")).toBeNull();
    expect(
      planCameraGlide(from, { sx: FOCUS_SETTLE_PX / 2, sy: 0 }, 0, "player"),
    ).toBeNull();
  });

  it("glides the AI's turns faster than the player's own", () => {
    const player = planCameraGlide(from, to, 0, "player");
    const ai = planCameraGlide(from, to, 0, "ai");
    expect(player?.durationMs).toBe(FOCUS_GLIDE_MS.player);
    expect(ai?.durationMs).toBe(FOCUS_GLIDE_MS.ai);
    expect(ai!.durationMs).toBeLessThan(player!.durationMs);
  });

  it("starts where the camera is and arrives on the target", () => {
    const glide = planCameraGlide(from, to, 1000, "player")!;
    expect(glideCameraAt(glide, 1000)).toEqual(from);
    expect(glideCameraAt(glide, 1000 + glide.durationMs)).toEqual(to);
    // Reading past the end simply holds the destination.
    expect(glideCameraAt(glide, 9999)).toEqual(to);
    expect(glideDone(glide, 1000 + glide.durationMs)).toBe(true);
    expect(glideDone(glide, 1000 + glide.durationMs - 1)).toBe(false);
  });

  it("eases out of the start and into the end, never overshooting", () => {
    const glide = planCameraGlide(from, to, 0, "player")!;
    const half = glide.durationMs / 2;
    const samples = Array.from({ length: 41 }, (_, i) =>
      glideCameraAt(glide, (i * glide.durationMs) / 40),
    );
    // Monotonic, inside the span, and halfway across at the midpoint.
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]!.sx).toBeGreaterThanOrEqual(samples[i - 1]!.sx);
      expect(samples[i]!.sx).toBeLessThanOrEqual(to.sx);
    }
    expect(glideCameraAt(glide, half).sx).toBeCloseTo(to.sx / 2, 6);
    // Eased: the first tenth covers less ground than the middle tenth.
    const early = glideCameraAt(glide, glide.durationMs * 0.1).sx;
    const midA = glideCameraAt(glide, glide.durationMs * 0.45).sx;
    const midB = glideCameraAt(glide, glide.durationMs * 0.55).sx;
    expect(early).toBeLessThan(midB - midA);
  });

  it("is pure: the same scene time always gives the same camera", () => {
    const glide = planCameraGlide(from, to, 500, "ai")!;
    expect(glideCameraAt(glide, 640)).toEqual(glideCameraAt(glide, 640));
  });
});

describe("hit-pause insertion", () => {
  it("ignores pauses worth nothing", () => {
    expect(insertPause(NO_PAUSES, 100, 0, 0)).toBe(NO_PAUSES);
    expect(insertPause(NO_PAUSES, 100, -20, 0)).toBe(NO_PAUSES);
  });

  it("caps a single freeze", () => {
    const timeline = insertPause(NO_PAUSES, 100, 10_000, 0);
    expect(timeline.pending[0]?.durationMs).toBe(MAX_PAUSE_MS);
  });

  it("never schedules a freeze in the past — the clock cannot step back", () => {
    const timeline = insertPause(NO_PAUSES, 100, 40, 500);
    expect(timeline.pending[0]?.atMs).toBe(500);
  });

  it("keeps pending pauses in beat order however they arrive", () => {
    let timeline = insertPause(NO_PAUSES, 300, 40, 0);
    timeline = insertPause(timeline, 100, 40, 0);
    timeline = insertPause(timeline, 200, 40, 0);
    expect(timeline.pending.map((p) => p.atMs)).toEqual([100, 200, 300]);
  });

  it("freezes once for blows landing on the same beat, for the longest", () => {
    let timeline = insertPause(NO_PAUSES, 100, 40, 0);
    timeline = insertPause(timeline, 100, 90, 0);
    timeline = insertPause(timeline, 100, 20, 0);
    expect(timeline.pending).toEqual([{ atMs: 100, durationMs: 90 }]);
  });
});

describe("the scene clock", () => {
  it("is raw time when nothing is owed", () => {
    expect(sceneTimeAt(NO_PAUSES, 1234)).toBe(1234);
  });

  it("holds on the beat, then runs on behind it by the pause", () => {
    const timeline = insertPause(NO_PAUSES, 1000, 60, 0);
    expect(sceneTimeAt(timeline, 999)).toBe(999);
    expect(sceneTimeAt(timeline, 1000)).toBe(1000);
    // Held for the whole freeze…
    expect(sceneTimeAt(timeline, 1030)).toBe(1000);
    expect(sceneTimeAt(timeline, 1060)).toBe(1000);
    // …then running again, exactly one pause behind raw time.
    expect(sceneTimeAt(timeline, 1100)).toBe(1040);
    expect(sceneTimeAt(timeline, 5000)).toBe(4940);
  });

  it("never runs backwards or skips, whatever it is asked", () => {
    let timeline = insertPause(NO_PAUSES, 1000, 60, 0);
    timeline = insertPause(timeline, 1200, 100, 0);
    let previous = sceneTimeAt(timeline, 899);
    for (let raw = 900; raw <= 2000; raw += 1) {
      const scene = sceneTimeAt(timeline, raw);
      expect(scene).toBeGreaterThanOrEqual(previous);
      expect(scene - previous).toBeLessThanOrEqual(1);
      previous = scene;
    }
    // Both freezes served: the clock is behind by exactly their sum.
    expect(sceneTimeAt(timeline, 3000)).toBe(3000 - 160);
  });

  it("serves stacked pauses in order, one at a time", () => {
    let timeline = insertPause(NO_PAUSES, 1000, 60, 0);
    timeline = insertPause(timeline, 1010, 60, 0);
    // Still inside the first freeze.
    expect(sceneTimeAt(timeline, 1040)).toBe(1000);
    // Out of the first, straight into the second.
    expect(sceneTimeAt(timeline, 1075)).toBe(1010);
    expect(sceneTimeAt(timeline, 1130)).toBe(1010);
    expect(sceneTimeAt(timeline, 1200)).toBe(1080);
  });

  it("folds served pauses away without changing a single answer", () => {
    let timeline: PauseTimeline = insertPause(NO_PAUSES, 1000, 60, 0);
    timeline = insertPause(timeline, 1200, 40, 0);
    const walked = [1100, 1300, 1400, 2000].map((raw) => {
      const advanced = advancePauses(timeline, raw);
      timeline = advanced.timeline;
      return advanced.sceneMs;
    });
    // Read cold from the original timeline, the answers are identical.
    let cold: PauseTimeline = insertPause(NO_PAUSES, 1000, 60, 0);
    cold = insertPause(cold, 1200, 40, 0);
    expect(walked).toEqual([1100, 1300, 1400, 2000].map((r) => sceneTimeAt(cold, r)));
    // …and nothing is left to walk.
    expect(timeline.pending).toEqual([]);
    expect(timeline.settledMs).toBe(100);
  });

  it("is deterministic: the same inserts give the same clock", () => {
    const build = (): PauseTimeline => {
      let timeline = insertPause(NO_PAUSES, 1000, 50, 0);
      timeline = insertPause(timeline, 1300, 110, 0);
      return insertPause(timeline, 1000, 70, 0);
    };
    const times = (t: PauseTimeline): number[] =>
      Array.from({ length: 60 }, (_, i) => sceneTimeAt(t, 950 + i * 10));
    expect(times(build())).toEqual(times(build()));
  });
});

describe("what a blow is worth", () => {
  it("holds longest on a critical, and never on a glance", () => {
    expect(hitPauseMs("glancing", true)).toBe(0);
    expect(hitPauseMs("critical", true)).toBeGreaterThan(
      hitPauseMs("heavy", true),
    );
    expect(hitPauseMs("heavy", true)).toBeGreaterThan(hitPauseMs("solid", true));
  });

  it("pauses on melee contact, and at range only on a critical", () => {
    expect(hitPauseMs("solid", false)).toBe(0);
    expect(hitPauseMs("heavy", false)).toBe(0);
    expect(hitPauseMs("critical", false)).toBe(IMPACT_FEEL.critical.pauseMs);
  });

  it("never freezes for a blast — nothing connected", () => {
    expect(hitPauseMs("explosion", true)).toBe(0);
    expect(hitPauseMs("explosion", false)).toBe(0);
  });

  it("keeps every authored freeze inside the cap and a few frames long", () => {
    for (const weight of IMPACT_WEIGHTS) {
      const { pauseMs } = IMPACT_FEEL[weight];
      expect(pauseMs).toBeLessThanOrEqual(MAX_PAUSE_MS);
      // Nothing between one frame and nothing: a freeze reads or it
      // does not happen at all.
      expect(pauseMs === 0 || pauseMs >= 1000 / 60).toBe(true);
    }
  });

  it("only shakes for the two heaviest readings and for blasts", () => {
    expect(shakeAmplitudePx("glancing", 1)).toBe(0);
    expect(shakeAmplitudePx("solid", 1)).toBe(0);
    expect(shakeAmplitudePx("heavy", 1)).toBeGreaterThan(0);
    expect(shakeAmplitudePx("critical", 1)).toBeGreaterThan(
      shakeAmplitudePx("heavy", 1),
    );
    expect(shakeAmplitudePx("explosion", 1)).toBeGreaterThan(0);
  });

  it("scales with the setting and stops at the cap", () => {
    expect(shakeAmplitudePx("critical", 0)).toBe(0);
    expect(shakeAmplitudePx("critical", 0.5)).toBeCloseTo(
      shakeAmplitudePx("critical", 1) / 2,
      6,
    );
    expect(shakeAmplitudePx("critical", 1000)).toBe(MAX_SHAKE_PX);
  });
});

describe("screen shake", () => {
  const source: ShakeSource = {
    startMs: 1000,
    durationMs: 240,
    amplitudePx: 4,
    dirX: 1,
    dirY: 0,
  };

  it("normalizes the line a blow came in on", () => {
    const dir = shakeDirection(3, 4);
    expect(Math.hypot(dir.x, dir.y)).toBeCloseTo(1, 9);
    // Nothing to read (a self-cast): pushed along the screen instead.
    expect(shakeDirection(0, 0)).toEqual({ x: 1, y: 0 });
  });

  it("is still before it starts and once it is spent", () => {
    expect(shakeOffsetAt(source, 999)).toEqual({ x: 0, y: 0 });
    expect(shakeOffsetAt(source, 1240)).toEqual({ x: 0, y: 0 });
    expect(shakeOffsetAt(source, 5000)).toEqual({ x: 0, y: 0 });
    expect(shakeFinished(source, 1240)).toBe(true);
    expect(shakeFinished(source, 1239)).toBe(false);
  });

  it("starts still, so a freeze on the contact beat holds a clean frame", () => {
    expect(shakeOffsetAt(source, source.startMs)).toEqual({ x: 0, y: 0 });
  });

  it("never travels past its amplitude, and decays to nothing", () => {
    let peakEarly = 0;
    let peakLate = 0;
    for (let t = 0; t < source.durationMs; t += 1) {
      const { x, y } = shakeOffsetAt(source, source.startMs + t);
      expect(Math.abs(x)).toBeLessThanOrEqual(source.amplitudePx);
      expect(Math.abs(y)).toBeLessThanOrEqual(source.amplitudePx);
      const magnitude = Math.hypot(x, y);
      if (t < source.durationMs / 2) peakEarly = Math.max(peakEarly, magnitude);
      else peakLate = Math.max(peakLate, magnitude);
    }
    expect(peakLate).toBeLessThan(peakEarly);
  });

  it("throws the view along its own line, flattened into iso space", () => {
    const diagonal: ShakeSource = { ...source, dirX: 0.6, dirY: 0.8 };
    for (let t = 1; t < diagonal.durationMs; t += 7) {
      const { x, y } = shakeOffsetAt(diagonal, diagonal.startMs + t);
      if (x === 0) continue;
      // Screen y is compressed 2:1, as everything in iso space is.
      expect(y / x).toBeCloseTo(0.8 / 0.6 / 2, 9);
    }
  });

  it("is pure: the same scene time always gives the same offset", () => {
    expect(shakeOffsetAt(source, 1080)).toEqual(shakeOffsetAt(source, 1080));
  });

  it("sums what lands together, then caps the lot", () => {
    const hard: ShakeSource[] = Array.from({ length: 6 }, () => ({
      ...source,
      amplitudePx: MAX_SHAKE_PX,
    }));
    for (let t = 0; t < source.durationMs; t += 3) {
      const { x, y } = combinedShakeAt(hard, source.startMs + t);
      expect(Math.hypot(x, y)).toBeLessThanOrEqual(MAX_SHAKE_PX + 1e-9);
    }
    // Two together do push harder than one alone.
    const one = combinedShakeAt([source], 1040);
    const two = combinedShakeAt([source, source], 1040);
    expect(Math.abs(two.x)).toBeGreaterThan(Math.abs(one.x));
  });

  it("is still with nothing in flight", () => {
    expect(combinedShakeAt([], 1000)).toEqual({ x: 0, y: 0 });
  });
});
