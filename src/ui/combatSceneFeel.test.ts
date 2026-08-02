// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { composeCharacter } from "../character";
import { fixtureCharacter } from "../character/testSupport";
import { createCombat, livingEnemies, playerCombatant } from "../combat";
import { requireEncounter, requireMap } from "../data";
import {
  FOCUS_GLIDE_MS,
  IMPACT_FEEL,
  MAX_SHAKE_PX,
  createCombatScene,
  createPixelArtSprites,
  focusCamera,
  type CombatScene,
  type CombatSceneEntity,
  type EntityPose,
  type IsoMap,
  type Sprite,
  type SpriteProvider,
  type TilePoint,
} from "../iso";
import { settings, type Settings } from "../settings";
import { createNewGame, type GameState } from "../state";
import { enemySpriteSource } from "./entitySprites";

/**
 * The combat camera in a real encounter: the glide that frames whoever
 * is acting, the freeze a blow lands with, and the knock off the heavy
 * ones — all read back off the scene itself rather than off the pure
 * math, which cameraFeel.test.ts covers on its own.
 *
 * Two things make that readable from outside. Every pose the scene asks
 * the sprite provider for carries the scene clock it was drawn at, so a
 * hit-pause shows up as that clock refusing to advance while raw time
 * does. And every frame ends in one ctx.translate, which is the camera
 * (plus whatever is shaking it) in world-screen units — so the glide and
 * the shake are both just numbers coming out of the canvas.
 */

const ENCOUNTER_ID = "enc-auric-scout";

/** A value whose every property/call yields another such value — enough
 * to satisfy the canvas 2D API without rendering anything. */
function anything(): unknown {
  const fn = (): unknown => anything();
  return new Proxy(fn, {
    get: (_target, prop) =>
      prop === Symbol.toPrimitive ? () => 0 : anything(),
    set: () => true,
    apply: () => anything(),
  });
}

interface Translation {
  tx: number;
  ty: number;
}

/** The stand-in canvas context, with the camera translation recorded. */
function recordingCtx(into: Translation[]): CanvasRenderingContext2D {
  const base = anything() as Record<string | symbol, unknown>;
  return new Proxy(base, {
    get: (target, prop) =>
      prop === "translate"
        ? (tx: number, ty: number): void => {
            into.push({ tx, ty });
          }
        : Reflect.get(target, prop),
  }) as unknown as CanvasRenderingContext2D;
}

interface PoseRecord {
  spriteId: string;
  pose: EntityPose;
}

/** The real provider, with every entity pose it is asked for recorded. */
function recordingSprites(state: GameState, poses: PoseRecord[]): SpriteProvider {
  const real = createPixelArtSprites({
    player: () => composeCharacter(state.player.appearance, state.player.equipment),
    entity: enemySpriteSource(),
  });
  return {
    ...real,
    entity(id: string, pose: EntityPose): Sprite {
      poses.push({ spriteId: id, pose: { ...pose } });
      return real.entity(id, pose);
    },
  };
}

interface Fight {
  scene: CombatScene;
  /** This scene's own next frame; two fights in one test never share one. */
  frame: FrameRequestCallback | null;
  map: IsoMap;
  canvas: HTMLCanvasElement;
  playerId: string;
  enemyId: string;
  enemyTile: TilePoint;
  poses: PoseRecord[];
  translations: Translation[];
}

/** Which canvas records its camera translation, and into what. */
const recorders = new WeakMap<HTMLCanvasElement, Translation[]>();

describe("combat camera feel in a real encounter", () => {
  let clock = 0;
  let frameCallback: FrameRequestCallback | null = null;

  beforeEach(() => {
    clock = 1000;
    frameCallback = null;
    settings.update({ motion: "full", combatFeel: true, shakeScale: 1 });
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      frameCallback = cb;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    // Every offscreen bake gets a stand-in context; the one canvas the
    // scene draws into gets the recorder, so the camera translation of
    // each frame is readable.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      function (this: HTMLCanvasElement) {
        const into = recorders.get(this);
        return (into ? recordingCtx(into) : anything()) as never;
      },
    );
  });

  afterEach(() => {
    settings.update({ motion: "full", combatFeel: true, shakeScale: 1 });
    vi.restoreAllMocks();
  });

  function startFight(): Fight {
    const state = createNewGame({ character: fixtureCharacter(), seed: 7 });
    const encounter = requireEncounter(ENCOUNTER_ID);
    const combat = createCombat(state, ENCOUNTER_ID);
    const poses: PoseRecord[] = [];
    const translations: Translation[] = [];
    const canvas = document.createElement("canvas");
    recorders.set(canvas, translations);
    const map = requireMap(encounter.arenaMapId);
    const scene = createCombatScene(canvas, {
      map,
      sprites: recordingSprites(state, poses),
      onTileClick: () => {},
      onTileHover: () => {},
    });
    const enemy = livingEnemies(combat)[0]!;
    scene.setEntities(
      combat.combatants.map(
        (c): CombatSceneEntity => ({
          id: c.id,
          spriteId: c.kind === "player" ? "player" : c.enemyId ?? "enemy",
          position: { ...c.position },
          hp: c.hp,
          maxHp: c.maxHp,
          alive: true,
          active: c.kind === "player",
        }),
      ),
    );
    return {
      scene,
      frame: frameCallback,
      map,
      canvas,
      playerId: playerCombatant(combat).id,
      enemyId: enemy.id,
      enemyTile: { ...enemy.position },
      poses,
      translations,
    };
  }

  /**
   * Move the shared clock and draw one frame of *this* fight at that
   * instant — the scene re-registers as it finishes, so each fight keeps
   * hold of its own next frame rather than the last scene built.
   */
  function drawAt(fight: Fight, timeMs: number): void {
    clock = timeMs;
    frameCallback = null;
    fight.frame?.(timeMs);
    if (frameCallback) fight.frame = frameCallback;
  }

  /** The scene clock the last drawn frame ran on. */
  function sceneClock(fight: Fight): number {
    return fight.poses[fight.poses.length - 1]?.pose.timeMs ?? -1;
  }

  /** The camera x of the last drawn frame (translation is its negation). */
  function cameraX(fight: Fight): number {
    return -(fight.translations[fight.translations.length - 1]?.tx ?? 0);
  }

  /** Where the camera would sit framing a tile, at this viewport. */
  function frameOn(fight: Fight, tile: TilePoint): number {
    return focusCamera(
      fight.map,
      tile,
      fight.canvas.clientWidth,
      fight.canvas.clientHeight,
      settings.get().zoom,
    ).sx;
  }

  // --- Turn focus ------------------------------------------------------

  describe("turn focus", () => {
    it("glides to the active combatant instead of cutting to it", () => {
      const fight = startFight();
      drawAt(fight, 2000);
      const start = cameraX(fight);
      const target = frameOn(fight, fight.enemyTile);
      expect(target).not.toBeCloseTo(start, 3);

      fight.scene.focusOn(fight.enemyId, { pace: "player" });
      // The first frame after a turn starts has barely moved: this is a
      // glide, not a cut.
      drawAt(fight, 2016);
      const first = cameraX(fight);
      expect(Math.abs(first - start)).toBeLessThan(
        Math.abs(target - start) / 4,
      );

      const seen = [first];
      for (let t = 32; t <= FOCUS_GLIDE_MS.player; t += 16) {
        drawAt(fight, 2000 + t);
        seen.push(cameraX(fight));
      }
      // Monotonic toward the target, and settled on it by the end.
      for (let i = 1; i < seen.length; i++) {
        expect(Math.abs(target - seen[i]!)).toBeLessThanOrEqual(
          Math.abs(target - seen[i - 1]!) + 1,
        );
      }
      expect(cameraX(fight)).toBeCloseTo(target, 3);

      // And it stays there — a settled glide does not drift.
      drawAt(fight, 4000);
      expect(cameraX(fight)).toBeCloseTo(target, 3);
      fight.scene.destroy();
    });

    it("gets the AI's turns framed sooner than the player's own", () => {
      const player = startFight();
      drawAt(player, 2000);
      player.scene.focusOn(player.enemyId, { pace: "player" });
      const ai = startFight();
      drawAt(ai, 2000);
      ai.scene.focusOn(ai.enemyId, { pace: "ai" });

      const at = 2000 + FOCUS_GLIDE_MS.ai;
      drawAt(player, at);
      drawAt(ai, at);
      expect(cameraX(ai)).toBeCloseTo(frameOn(ai, ai.enemyTile), 3);
      expect(cameraX(player)).not.toBeCloseTo(frameOn(player, player.enemyTile), 3);
      player.scene.destroy();
      ai.scene.destroy();
    });

    it("leaves the camera alone when the combat feel is switched off", () => {
      const switches: Partial<Settings>[] = [
        { combatFeel: false },
        { motion: "reduced" },
      ];
      for (const off of switches) {
        const fight = startFight();
        settings.update(off);
        drawAt(fight, 2000);
        const fixed = cameraX(fight);
        fight.scene.focusOn(fight.enemyId, { pace: "player" });
        for (let t = 16; t <= FOCUS_GLIDE_MS.player + 200; t += 32) {
          drawAt(fight, 2000 + t);
          expect(cameraX(fight)).toBe(fixed);
        }
        fight.scene.destroy();
        settings.update({ combatFeel: true, motion: "full" });
      }
    });

    it("ignores a combatant it has never been handed", () => {
      const fight = startFight();
      drawAt(fight, 2000);
      const fixed = cameraX(fight);
      fight.scene.focusOn("nobody");
      drawAt(fight, 2200);
      expect(cameraX(fight)).toBe(fixed);
      fight.scene.destroy();
    });
  });

  // --- Hit-pause -------------------------------------------------------

  describe("hit-pause", () => {
    it("holds the whole scene clock on the contact frame, then runs on", () => {
      const fight = startFight();
      drawAt(fight, 2000);
      expect(sceneClock(fight)).toBe(2000);

      fight.scene.hitFx(fight.enemyId, { weight: "critical" });
      const held = IMPACT_FEEL.critical.pauseMs;
      // Raw time runs; the scene clock does not.
      drawAt(fight, 2000 + held / 2);
      expect(sceneClock(fight)).toBe(2000);
      drawAt(fight, 2000 + held);
      expect(sceneClock(fight)).toBe(2000);
      // Out the far side, exactly one freeze behind raw time — nothing
      // skipped, nothing repeated.
      drawAt(fight, 2000 + held + 100);
      expect(sceneClock(fight)).toBe(2100);
      drawAt(fight, 5000);
      expect(sceneClock(fight)).toBe(5000 - held);
      fight.scene.destroy();
    });

    it("freezes on the beat the blow lands, not the beat it was thrown", () => {
      const fight = startFight();
      drawAt(fight, 2000);
      // A round still in the air: the reaction rides 200ms out.
      fight.scene.hitFx(fight.enemyId, { weight: "critical", delayMs: 200 });
      drawAt(fight, 2100);
      expect(sceneClock(fight)).toBe(2100);
      drawAt(fight, 2199);
      expect(sceneClock(fight)).toBe(2199);
      // The round arrives, and the scene holds.
      drawAt(fight, 2250);
      expect(sceneClock(fight)).toBe(2200);
      fight.scene.destroy();
    });

    it("holds longest for a critical and not at all for a glance", () => {
      const held = (weight: "glancing" | "solid" | "critical"): number => {
        const fight = startFight();
        drawAt(fight, 2000);
        fight.scene.hitFx(fight.enemyId, { weight, glancing: weight === "glancing" });
        drawAt(fight, 3000);
        const behind = 3000 - sceneClock(fight);
        fight.scene.destroy();
        return behind;
      };
      expect(held("glancing")).toBe(0);
      expect(held("solid")).toBe(IMPACT_FEEL.solid.pauseMs);
      expect(held("critical")).toBe(IMPACT_FEEL.critical.pauseMs);
    });

    it("freezes once for two blows landing on the same beat", () => {
      const fight = startFight();
      drawAt(fight, 2000);
      fight.scene.hitFx(fight.enemyId, { weight: "critical" });
      fight.scene.hitFx(fight.playerId, { weight: "critical" });
      drawAt(fight, 3000);
      expect(3000 - sceneClock(fight)).toBe(IMPACT_FEEL.critical.pauseMs);
      fight.scene.destroy();
    });

    it("never freezes when the combat feel is off, though the hit still lands", () => {
      const fight = startFight();
      settings.update({ combatFeel: false });
      drawAt(fight, 2000);
      fight.poses.length = 0;
      fight.scene.hitFx(fight.enemyId, {
        attackerId: fight.playerId,
        weight: "critical",
      });
      drawAt(fight, 2050);
      expect(sceneClock(fight)).toBe(2050);
      // The flinch still plays: the camera is switched off, not the hit.
      const enemyPoses = fight.poses.filter((p) => p.spriteId !== "player");
      expect(enemyPoses.some((p) => p.pose.reaction !== undefined)).toBe(true);
      fight.scene.destroy();
    });
  });

  // --- Screen shake ----------------------------------------------------

  describe("screen shake", () => {
    /** Every camera x drawn across a window after a blow of this weight. */
    function shakeRun(
      weight: "solid" | "heavy" | "critical",
      scale?: number,
    ): { base: number; seen: number[] } {
      const fight = startFight();
      if (scale !== undefined) settings.update({ shakeScale: scale as never });
      drawAt(fight, 2000);
      const base = cameraX(fight);
      fight.scene.hitFx(fight.enemyId, { attackerId: fight.playerId, weight });
      const seen: number[] = [];
      for (let t = 0; t <= 600; t += 8) {
        drawAt(fight, 2000 + t);
        seen.push(cameraX(fight));
      }
      fight.scene.destroy();
      return { base, seen };
    }

    it("knocks the view off a heavy hit and settles back", () => {
      const { base, seen } = shakeRun("heavy");
      expect(seen.some((x) => x !== base)).toBe(true);
      expect(seen[seen.length - 1]).toBe(base);
    });

    it("stays inside the cap, however hard it is hit", () => {
      for (const weight of ["heavy", "critical"] as const) {
        const { base, seen } = shakeRun(weight);
        for (const x of seen) {
          // Snapped to whole device pixels, hence the pixel of slack.
          expect(Math.abs(x - base)).toBeLessThanOrEqual(MAX_SHAKE_PX + 1);
        }
      }
    });

    it("hits harder for a critical than for a heavy blow", () => {
      const travel = (weight: "heavy" | "critical"): number => {
        const { base, seen } = shakeRun(weight);
        return Math.max(...seen.map((x) => Math.abs(x - base)));
      };
      expect(travel("critical")).toBeGreaterThan(travel("heavy"));
    });

    it("does not shake for a hit that only connected", () => {
      const { base, seen } = shakeRun("solid");
      expect(seen.every((x) => x === base)).toBe(true);
    });

    it("scales with the setting, and stills at zero", () => {
      const quiet = shakeRun("critical", 0.5);
      const loud = shakeRun("critical", 1);
      const travel = (run: { base: number; seen: number[] }): number =>
        Math.max(...run.seen.map((x) => Math.abs(x - run.base)));
      expect(travel(quiet)).toBeLessThan(travel(loud));
      const off = shakeRun("critical", 0);
      expect(off.seen.every((x) => x === off.base)).toBe(true);
    });

    it("stills alone: a scale of zero still freezes on contact", () => {
      const fight = startFight();
      settings.update({ shakeScale: 0 });
      drawAt(fight, 2000);
      const base = cameraX(fight);
      fight.scene.hitFx(fight.enemyId, { weight: "critical" });
      drawAt(fight, 2050);
      expect(cameraX(fight)).toBe(base);
      expect(sceneClock(fight)).toBe(2000);
      fight.scene.destroy();
    });

    it("never shakes under reduced motion", () => {
      const fight = startFight();
      settings.update({ motion: "reduced" });
      drawAt(fight, 2000);
      const base = cameraX(fight);
      fight.scene.hitFx(fight.enemyId, {
        attackerId: fight.playerId,
        weight: "critical",
      });
      for (let t = 0; t <= 400; t += 8) {
        drawAt(fight, 2000 + t);
        expect(cameraX(fight)).toBe(base);
      }
      expect(sceneClock(fight)).toBe(0);
      fight.scene.destroy();
    });
  });
});
