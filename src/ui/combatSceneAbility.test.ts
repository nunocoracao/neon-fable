// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { composeCharacter } from "../character";
import { fixtureCharacter } from "../character/testSupport";
import { createCombat, livingEnemies, playerCombatant } from "../combat";
import { abilities, requireEncounter, requireMap } from "../data";
import {
  ABILITY_FX,
  REDUCED_IMPACT_MS,
  abilityCastMs,
  abilityFxSequence,
  beamSegmentCount,
  createCombatScene,
  createPixelArtSprites,
  statusFamilies,
  worldToScreen,
  type AbilityFxId,
  type AttackClassId,
  type CombatScene,
  type CombatSceneEntity,
  type ScreenPoint,
  type Sprite,
  type SpriteProvider,
  type StatusFamilyId,
  type TilePoint,
} from "../iso";
import { settings } from "../settings";
import { createNewGame } from "../state";
import { enemySpriteSource } from "./entitySprites";

/**
 * Every ability's effect, in a real encounter: a real GameState, the
 * real enemy roster, the real arena map, and the real pixel-art
 * provider — so what is examined here is the baked art the fight
 * actually draws, positioned by the real scene, for every ability
 * defined in src/data.
 *
 * What is under test is the contract the combat screen depends on: that
 * a cast plays the archetype its content names and nothing else, that
 * the archetype's form decides where it lands (a beam spans the line, a
 * burst and a cloud sit on the target, an aura on the caster), that the
 * blow lands on the beat the scene reports, that a cast reaching two
 * bodies goes off on both at once, and that reduced motion leaves one
 * held marker. Painting is not under test — the canvas is a recorder, so
 * what is asserted is which effect the scene asked to draw, when, and
 * where.
 */

/** The scout team stands east of the player's start on this arena. */
const ENCOUNTER_ID = "enc-auric-scout";

/** Fine enough to land inside the shortest authored hold (45ms). */
const STEP_MS = 5;

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

/** One ability effect (or status marker) the scene drew. */
interface Draw {
  id: string;
  frame: number;
  /** Scene-clock ms it was drawn at. */
  atMs: number;
  /** Screen point the picture was centered on (its anchor). */
  point: ScreenPoint;
}

interface Fight {
  scene: CombatScene;
  playerId: string;
  enemyIds: string[];
  playerTile: TilePoint;
  enemyTiles: TilePoint[];
  draws: Draw[];
  attackClass: AttackClassId;
  setEntities(entities: readonly CombatSceneEntity[]): void;
  entities: CombatSceneEntity[];
}

describe("ability effects in a real encounter", () => {
  let clock = 0;
  let frameCallback: FrameRequestCallback | null = null;
  /** Baked canvases, so a drawImage call names what it drew. */
  let baked = new Map<CanvasImageSource, { id: string; sprite: Sprite; frame: number }>();
  let draws: Draw[] = [];

  function recordingContext(): CanvasRenderingContext2D {
    const fallback = anything() as Record<string | symbol, unknown>;
    return new Proxy(
      {},
      {
        get: (_target, prop) => {
          if (prop !== "drawImage") return fallback[prop];
          return (image: CanvasImageSource, x: number, y: number): void => {
            const known = baked.get(image);
            if (!known) return;
            draws.push({
              id: known.id,
              frame: known.frame,
              atMs: clock,
              point: {
                sx: x + known.sprite.anchorX,
                sy: y + known.sprite.anchorY,
              },
            });
          };
        },
      },
    ) as unknown as CanvasRenderingContext2D;
  }

  beforeEach(() => {
    clock = 1000;
    frameCallback = null;
    baked = new Map();
    draws = [];
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      frameCallback = cb;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() =>
      recordingContext(),
    );
  });

  afterEach(() => {
    settings.update({ reducedMotion: false });
    vi.restoreAllMocks();
  });

  /** Move the shared clock and draw one frame at that instant. */
  function drawAt(timeMs: number): void {
    clock = timeMs;
    frameCallback?.(timeMs);
  }

  function startFight(): Fight {
    const state = createNewGame({ character: fixtureCharacter(), seed: 7 });
    const encounter = requireEncounter(ENCOUNTER_ID);
    const combat = createCombat(state, ENCOUNTER_ID);
    const real = createPixelArtSprites({
      player: () =>
        composeCharacter(state.player.appearance, state.player.equipment),
      entity: enemySpriteSource(),
    });
    const sprites: SpriteProvider = {
      ...real,
      abilityEffect(id: AbilityFxId, frame: number): Sprite {
        const sprite = real.abilityEffect(id, frame);
        baked.set(sprite.image, { id, frame, sprite });
        return sprite;
      },
      statusMarker(id: StatusFamilyId, frame: number): Sprite {
        const sprite = real.statusMarker(id, frame);
        baked.set(sprite.image, { id: `status:${id}`, frame, sprite });
        return sprite;
      },
    };
    const scene = createCombatScene(document.createElement("canvas"), {
      map: requireMap(encounter.arenaMapId),
      sprites,
      onTileClick: () => {},
      onTileHover: () => {},
    });
    const entities: CombatSceneEntity[] = combat.combatants.map((c, index) => ({
      id: c.id,
      spriteId: c.kind === "player" ? "player" : c.enemyId ?? "enemy",
      position: { ...c.position },
      hp: c.hp,
      maxHp: c.maxHp,
      alive: true,
      active: c.kind === "player",
      order: index,
    }));
    scene.setEntities(entities);
    const player = playerCombatant(combat);
    const foes = livingEnemies(combat);
    return {
      scene,
      playerId: player.id,
      enemyIds: foes.map((e) => e.id),
      playerTile: { ...player.position },
      enemyTiles: foes.map((e) => ({ ...e.position })),
      draws,
      attackClass: sprites.attackClass?.("player") ?? "unarmed",
      entities,
      setEntities: (next) => scene.setEntities(next),
    };
  }

  /** Play the whole sequence out, one fine step at a time. */
  function playOut(fight: Fight, from: number, throughMs: number): Draw[] {
    fight.draws.length = 0;
    for (let t = 0; t <= throughMs; t += STEP_MS) drawAt(from + t);
    return [...fight.draws];
  }

  /** Screen point of the chest of whoever stands on this tile. */
  function chestOf(tile: TilePoint): ScreenPoint {
    const ground = worldToScreen(tile.x, tile.y);
    return { sx: ground.sx, sy: ground.sy - 40 };
  }

  // Every ability the game defines, played through the scene by the
  // archetype its content names — the sweep that makes "every ability
  // has a look" a fact rather than an intention.
  for (const ability of abilities) {
    const fx = ability.effectRef;
    const spec = ABILITY_FX[fx];

    describe(`${ability.name} (${fx}, ${spec.form})`, () => {
      it("plays its own archetype, every authored frame of it, in order", () => {
        const fight = startFight();
        const selfCast = spec.form === "aura";
        const targetId = selfCast ? fight.playerId : fight.enemyIds[0] ?? "";
        const start = 2000;
        clock = start;
        const contact = fight.scene.abilityFx(fight.playerId, [targetId], fx);
        const sequence = abilityFxSequence(fx, {
          castMs: abilityCastMs(fx, fight.attackClass),
        });
        expect(contact, "the beat the blow lands on").toBe(sequence.contactMs);

        const drawn = playOut(fight, start, sequence.endMs + 200);
        expect(drawn.length, "something was drawn").toBeGreaterThan(0);
        // Nothing but this ability's own look.
        expect(new Set(drawn.map((d) => d.id))).toEqual(new Set([fx]));
        // It waits for the cast wind-up…
        expect(drawn[0]?.atMs).toBeGreaterThanOrEqual(start + sequence.castMs);
        // …plays every frame, in order, and leaves nothing behind.
        const frames = drawn.map((d) => d.frame);
        expect(new Set(frames)).toEqual(
          new Set(Array.from({ length: spec.frameCount }, (_, i) => i)),
        );
        expect(drawn[drawn.length - 1]?.atMs).toBeLessThan(
          start + sequence.endMs,
        );
        fight.scene.destroy();
      });

      it("draws where its form says it goes", () => {
        const fight = startFight();
        const selfCast = spec.form === "aura";
        const targetTile = selfCast ? fight.playerTile : fight.enemyTiles[0];
        const targetId = selfCast ? fight.playerId : fight.enemyIds[0] ?? "";
        const caster = chestOf(fight.playerTile);
        const target = chestOf(targetTile ?? fight.playerTile);
        const start = 2000;
        clock = start;
        const contact = fight.scene.abilityFx(fight.playerId, [targetId], fx);
        const drawn = playOut(fight, start, contact + 400);
        const firstFrame = drawn.filter((d) => d.atMs === drawn[0]?.atMs);
        expect(firstFrame.length).toBeGreaterThan(0);

        if (spec.form === "beam") {
          // A chain from the caster to the target: several pictures on
          // one frame, the last of them on the body it reaches.
          const expected = beamSegmentCount(
            Math.hypot(target.sx - caster.sx, target.sy - caster.sy),
            spec.segmentSpacingPx,
          );
          // The chain leaves the weapon's muzzle rather than the chest,
          // so its span — and with it the last link — differs from the
          // one measured here by about a hand's width.
          expect(
            Math.abs(firstFrame.length - expected),
            `links in the chain (${firstFrame.length} vs ~${expected})`,
          ).toBeLessThanOrEqual(1);
          const last = firstFrame[firstFrame.length - 1]?.point ?? caster;
          expect(last.sx).toBeCloseTo(target.sx, 0);
          expect(last.sy).toBeCloseTo(target.sy, 0);
          // And the chain really does span the gap rather than sitting
          // on either end of it.
          const spread = firstFrame.map((d) =>
            Math.hypot(d.point.sx - caster.sx, d.point.sy - caster.sy),
          );
          expect(Math.min(...spread)).toBeLessThan(Math.max(...spread) / 2);
        } else {
          // One picture, on the chest it went off against — the target's
          // for anything thrown, the caster's own for an aura.
          expect(firstFrame).toHaveLength(1);
          expect(firstFrame[0]?.point.sx).toBeCloseTo(target.sx, 0);
          expect(firstFrame[0]?.point.sy).toBeCloseTo(target.sy, 0);
        }
        fight.scene.destroy();
      });

      it("holds one marker and nothing else under reduced motion", () => {
        settings.update({ reducedMotion: true });
        const fight = startFight();
        const selfCast = spec.form === "aura";
        const targetId = selfCast ? fight.playerId : fight.enemyIds[0] ?? "";
        const start = 2000;
        clock = start;
        expect(fight.scene.abilityFx(fight.playerId, [targetId], fx)).toBe(0);
        const drawn = playOut(fight, start, REDUCED_IMPACT_MS + 200);
        expect(drawn.length).toBeGreaterThan(0);
        expect(new Set(drawn.map((d) => d.id))).toEqual(new Set([fx]));
        expect(new Set(drawn.map((d) => d.frame))).toEqual(new Set([0]));
        expect(drawn[0]?.atMs).toBe(start);
        expect(drawn[drawn.length - 1]?.atMs).toBeLessThan(
          start + REDUCED_IMPACT_MS,
        );
        fight.scene.destroy();
      });
    });
  }

  it("goes off on every body one cast reaches, at the same instant", () => {
    const fight = startFight();
    expect(fight.enemyIds.length, "an encounter with a crowd in it")
      .toBeGreaterThan(1);
    const start = 2000;
    clock = start;
    const contact = fight.scene.abilityFx(
      fight.playerId,
      fight.enemyIds,
      "optic-flash",
    );
    const drawn = playOut(fight, start, contact + 400);
    const first = drawn.filter((d) => d.atMs === drawn[0]?.atMs);
    // One burst per body caught, all of them on the same frame.
    expect(first).toHaveLength(fight.enemyIds.length);
    expect(new Set(first.map((d) => d.frame))).toEqual(new Set([0]));
    const points = first.map((d) => `${Math.round(d.point.sx)},${Math.round(d.point.sy)}`);
    expect(new Set(points).size, "a burst on each of them").toBe(
      fight.enemyIds.length,
    );
    for (const tile of fight.enemyTiles) {
      const chest = chestOf(tile);
      expect(
        points.includes(`${Math.round(chest.sx)},${Math.round(chest.sy)}`),
        `a burst on the body at ${tile.x},${tile.y}`,
      ).toBe(true);
    }
    fight.scene.destroy();
  });

  it("draws nothing for a cast that reached nobody the scene knows", () => {
    const fight = startFight();
    clock = 2000;
    expect(fight.scene.abilityFx(fight.playerId, ["nobody"], "optic-flash"))
      .toBe(0);
    expect(playOut(fight, 2000, 600)).toEqual([]);
    expect(fight.scene.abilityFx("nobody", fight.enemyIds, "optic-flash")).toBe(0);
    expect(playOut(fight, 3000, 600)).toEqual([]);
    fight.scene.destroy();
  });
});

describe("status markers over a fighter", () => {
  let clock = 0;
  let frameCallback: FrameRequestCallback | null = null;
  let baked = new Map<CanvasImageSource, { id: string; sprite: Sprite; frame: number }>();
  let draws: Draw[] = [];

  function recordingContext(): CanvasRenderingContext2D {
    const fallback = anything() as Record<string | symbol, unknown>;
    return new Proxy(
      {},
      {
        get: (_target, prop) => {
          if (prop !== "drawImage") return fallback[prop];
          return (image: CanvasImageSource, x: number, y: number): void => {
            const known = baked.get(image);
            if (!known) return;
            draws.push({
              id: known.id,
              frame: known.frame,
              atMs: clock,
              point: { sx: x + known.sprite.anchorX, sy: y + known.sprite.anchorY },
            });
          };
        },
      },
    ) as unknown as CanvasRenderingContext2D;
  }

  beforeEach(() => {
    clock = 1000;
    frameCallback = null;
    baked = new Map();
    draws = [];
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      frameCallback = cb;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() =>
      recordingContext(),
    );
  });

  afterEach(() => {
    settings.update({ reducedMotion: false });
    vi.restoreAllMocks();
  });

  /** A fight where the scene's entity view is ours to push conditions into. */
  function markedFight(): {
    scene: CombatScene;
    push(statuses: readonly StatusFamilyId[], alive?: boolean): void;
    tile: TilePoint;
    frameAt(timeMs: number): Draw[];
  } {
    const state = createNewGame({ character: fixtureCharacter(), seed: 7 });
    const encounter = requireEncounter(ENCOUNTER_ID);
    const combat = createCombat(state, ENCOUNTER_ID);
    const real = createPixelArtSprites({
      player: () =>
        composeCharacter(state.player.appearance, state.player.equipment),
      entity: enemySpriteSource(),
    });
    const sprites: SpriteProvider = {
      ...real,
      statusMarker(id: StatusFamilyId, frame: number): Sprite {
        const sprite = real.statusMarker(id, frame);
        baked.set(sprite.image, { id, frame, sprite });
        return sprite;
      },
    };
    const scene = createCombatScene(document.createElement("canvas"), {
      map: requireMap(encounter.arenaMapId),
      sprites,
      onTileClick: () => {},
      onTileHover: () => {},
    });
    const player = playerCombatant(combat);
    const base: CombatSceneEntity = {
      id: player.id,
      spriteId: "player",
      position: { ...player.position },
      hp: player.hp,
      maxHp: player.maxHp,
      alive: true,
      active: true,
      order: 0,
    };
    return {
      scene,
      tile: { ...player.position },
      push(statuses, alive = true) {
        scene.setEntities([{ ...base, alive, statuses }]);
      },
      frameAt(timeMs) {
        draws.length = 0;
        clock = timeMs;
        frameCallback?.(timeMs);
        return [...draws];
      },
    };
  }

  it("marks nothing on a body nothing is true of", () => {
    const fight = markedFight();
    fight.push([]);
    expect(fight.frameAt(2000)).toEqual([]);
    fight.scene.destroy();
  });

  it("hangs one glyph per family over the body, in a centered row", () => {
    const fight = markedFight();
    const marks = statusFamilies({ stunTurns: 1, boostStats: ["body", "cool"] });
    expect(marks).toHaveLength(3);
    fight.push(marks);
    const drawn = fight.frameAt(2000);
    expect(drawn.map((d) => d.id)).toEqual([...marks]);
    // Over the head, clear of the HP bar, and centered on the body.
    const stance = worldToScreen(fight.tile.x, fight.tile.y);
    const xs = drawn.map((d) => d.point.sx);
    expect(xs.reduce((a, b) => a + b, 0) / xs.length).toBeCloseTo(stance.sx, 0);
    for (const draw of drawn) {
      expect(draw.point.sy).toBeLessThan(stance.sy - 110);
    }
    fight.scene.destroy();
  });

  it("keeps the mark going while the condition lasts, and drops it when it lifts", () => {
    const fight = markedFight();
    fight.push(["stunned"]);
    expect(fight.frameAt(2000).map((d) => d.id)).toEqual(["stunned"]);
    expect(fight.frameAt(9000).map((d) => d.id)).toEqual(["stunned"]);
    // The glyph is looping, not frozen.
    const frames = new Set(
      [0, 140, 280, 420].map((t) => fight.frameAt(2000 + t)[0]?.frame),
    );
    expect(frames.size).toBeGreaterThan(1);
    fight.push([]);
    expect(fight.frameAt(3000)).toEqual([]);
    fight.scene.destroy();
  });

  it("holds the mark still under reduced motion", () => {
    settings.update({ reducedMotion: true });
    const fight = markedFight();
    fight.push(["empowered"]);
    const frames = new Set(
      [0, 200, 400, 900].map((t) => fight.frameAt(2000 + t)[0]?.frame),
    );
    expect(frames).toEqual(new Set([0]));
    fight.scene.destroy();
  });

  it("marks nothing on a body that has gone down", () => {
    const fight = markedFight();
    fight.push(["stunned"]);
    expect(fight.frameAt(2000)).not.toEqual([]);
    fight.push(["stunned"], false);
    expect(fight.frameAt(2400)).toEqual([]);
    fight.scene.destroy();
  });
});
