// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { composeCharacter } from "../character";
import { fixtureCharacter } from "../character/testSupport";
import { createCombat, livingEnemies, playerCombatant } from "../combat";
import { requireEncounter, requireMap } from "../data";
import {
  ATTACK_CLASS_IDS,
  ATTACK_FX_STYLE,
  REDUCED_IMPACT_MS,
  attackImpactMs,
  createCombatScene,
  createPixelArtSprites,
  effectKind,
  impactSequence,
  worldToScreen,
  type AttackClassId,
  type CombatScene,
  type CombatSceneEntity,
  type EffectKind,
  type EffectSpriteId,
  type EntityPose,
  type ScreenPoint,
  type Sprite,
  type SpriteProvider,
  type TilePoint,
} from "../iso";
import { addItem, equip } from "../inventory";
import { settings } from "../settings";
import { createNewGame, type GameState } from "../state";
import { enemySpriteSource } from "./entitySprites";

/**
 * Ranged and melee effects in a real encounter: a real GameState with
 * the weapon equipped, the real enemy roster, the real arena map, and
 * the real pixel-art provider — so the effects examined here are the
 * baked sprites the fight actually draws, positioned by the real scene.
 *
 * What is under test is the sequence the combat screen depends on:
 * something leaves the weapon on the swing's impact beat, a fired round
 * crosses the ground between the muzzle and what it was aimed at, the
 * blow lands as sparks (or, when it misses, as wall dust a tile past
 * the target), and the hit reaction answers the arrival rather than the
 * trigger. Painting is not under test — the canvas is a recorder, so
 * what is asserted is which effect the scene asked to draw, when, and
 * where.
 */

/** The item that puts each class in the player's hands; null is bare. */
const WEAPON_FOR: Readonly<Record<AttackClassId, string | null>> = {
  unarmed: null,
  blade: "wpn-shard-knife",
  baton: "wpn-stun-baton",
  pistol: "wpn-compact-pistol",
  rifle: "wpn-spindle-projector",
  lash: "wpn-arc-lash",
};

/** The scout team stands east of the player's start on this arena. */
const ENCOUNTER_ID = "enc-auric-scout";

/** Fine enough to land inside the shortest authored hold (40ms). */
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

/** A courier carrying — and holding — the class's weapon, or nothing. */
function fighterState(attackClass: AttackClassId): GameState {
  const base = createNewGame({ character: fixtureCharacter(), seed: 7 });
  const weaponId = WEAPON_FOR[attackClass];
  if (weaponId === null) {
    return {
      ...base,
      player: {
        ...base.player,
        equipment: { ...base.player.equipment, weapon: null },
      },
    };
  }
  const carried = addItem(base.inventory, weaponId);
  const loadout = equip(base.player, carried, weaponId);
  return { ...base, player: loadout.character, inventory: loadout.inventory };
}

/** One effect the scene drew, and the frame it was drawn on. */
interface EffectDraw {
  id: EffectSpriteId;
  frame: number;
  /** Scene-clock ms it was drawn at. */
  atMs: number;
  /** Screen point the effect was centered on (its anchor). */
  point: ScreenPoint;
}

interface Fight {
  scene: CombatScene;
  playerId: string;
  enemyId: string;
  playerTile: TilePoint;
  enemyTile: TilePoint;
  draws: EffectDraw[];
  poses: EntityPose[];
  resolvedClass: AttackClassId;
}

describe("shots, swipes, and impacts in a real encounter", () => {
  let clock = 0;
  let frameCallback: FrameRequestCallback | null = null;
  /** Baked effect canvases, so a drawImage call names what it drew. */
  let baked = new Map<CanvasImageSource, { id: EffectSpriteId; sprite: Sprite; frame: number }>();
  let draws: EffectDraw[] = [];

  /** A canvas context that records only what effect art it is handed. */
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
    // Every canvas records; the bakes themselves paint into the same
    // stand-in, which is fine — nothing here asserts on pixels.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() =>
      recordingContext(),
    );
  });

  afterEach(() => {
    settings.update({ motion: "full" });
    vi.restoreAllMocks();
  });

  /** Move the shared clock and draw one frame at that instant. */
  function drawAt(timeMs: number): void {
    clock = timeMs;
    frameCallback?.(timeMs);
  }

  function startFight(attackClass: AttackClassId): Fight {
    const state = fighterState(attackClass);
    const encounter = requireEncounter(ENCOUNTER_ID);
    const combat = createCombat(state, ENCOUNTER_ID);
    const poses: EntityPose[] = [];
    const real = createPixelArtSprites({
      player: () =>
        composeCharacter(state.player.appearance, state.player.equipment),
      entity: enemySpriteSource(),
    });
    const sprites: SpriteProvider = {
      ...real,
      entity(id: string, pose: EntityPose): Sprite {
        if (id === "player") poses.push({ ...pose });
        return real.entity(id, pose);
      },
      effect(id: EffectSpriteId, frame: number): Sprite {
        const sprite = real.effect(id, frame);
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
    scene.setEntities(
      combat.combatants.map((c) => ({
        id: c.id,
        spriteId: c.kind === "player" ? "player" : c.enemyId ?? "enemy",
        position: { ...c.position },
        hp: c.hp,
        maxHp: c.maxHp,
        alive: true,
        active: c.kind === "player",
      })) satisfies CombatSceneEntity[],
    );
    const player = playerCombatant(combat);
    const enemy = livingEnemies(combat)[0];
    return {
      scene,
      playerId: player.id,
      enemyId: enemy?.id ?? "",
      playerTile: { ...player.position },
      enemyTile: { ...(enemy?.position ?? player.position) },
      draws,
      poses,
      resolvedClass: sprites.attackClass?.("player") ?? "unarmed",
    };
  }

  /** Play the whole sequence out, one fine step at a time. */
  function playOut(fight: Fight, from: number, throughMs: number): EffectDraw[] {
    fight.draws.length = 0;
    for (let t = 0; t <= throughMs; t += STEP_MS) drawAt(from + t);
    return [...fight.draws];
  }

  /**
   * The effect kinds drawn, in the order each first appeared. Effects
   * overlap — a muzzle flash is still burning while the round it fired
   * crosses the ground — so what a sequence is read by is which effect
   * *started* first, not which was drawn last on any one frame.
   */
  function kindOrder(drawn: readonly EffectDraw[]): EffectKind[] {
    const order: EffectKind[] = [];
    for (const draw of drawn) {
      const kind = effectKind(draw.id);
      if (!order.includes(kind)) order.push(kind);
    }
    return order;
  }

  const firstOf = (
    drawn: readonly EffectDraw[],
    kind: EffectKind,
  ): EffectDraw | undefined => drawn.find((d) => effectKind(d.id) === kind);

  const lastOf = (
    drawn: readonly EffectDraw[],
    kind: EffectKind,
  ): EffectDraw | undefined =>
    [...drawn].reverse().find((d) => effectKind(d.id) === kind);

  for (const attackClass of ATTACK_CLASS_IDS) {
    describe(attackClass, () => {
      const style = ATTACK_FX_STYLE[attackClass];

      it("plays what leaves the weapon, what crosses the ground, then what it lands as", () => {
        const fight = startFight(attackClass);
        expect(fight.resolvedClass).toBe(attackClass);
        const start = 2000;
        clock = start;
        const contact = fight.scene.attackFx(fight.playerId, fight.enemyId);
        const sequence = impactSequence(attackClass, {
          distancePx: 0,
          hit: true,
        });
        const drawn = playOut(fight, start, contact + 400);

        // Every class lands something, and lands it last.
        const impact = firstOf(drawn, sequence.impact.kind);
        expect(impact, "the blow lands").toBeDefined();
        expect(effectKind(drawn[drawn.length - 1]?.id ?? "spark-burst")).toBe(
          sequence.impact.kind,
        );
        // And it lands on the beat the scene reported, not before it.
        expect(impact?.atMs).toBeGreaterThanOrEqual(start + contact);
        expect(impact?.atMs).toBeLessThan(start + contact + STEP_MS * 2);

        const order = kindOrder(drawn);
        if (style === "tracer") {
          // Flash, then the round in the air, then the sparks.
          expect(order).toEqual(["muzzle", "tracer", "spark"]);
          expect(lastOf(drawn, "tracer")?.atMs).toBeLessThan(impact?.atMs ?? 0);
          expect(firstOf(drawn, "muzzle")?.atMs).toBe(
            start + attackImpactMs(attackClass),
          );
        } else if (style === "swipe") {
          // The arc comes through and the sparks fly off it at once.
          expect(order[0]).toBe("swipe");
          expect(new Set(order)).toEqual(new Set(["swipe", "spark"]));
          expect(drawn.some((d) => effectKind(d.id) === "tracer")).toBe(false);
        } else {
          // A fist throws nothing; the flash is the whole show.
          expect(order).toEqual(["flash"]);
        }

        // Every authored frame of the impact shows, in order.
        const frames = drawn
          .filter((d) => effectKind(d.id) === sequence.impact.kind)
          .map((d) => d.frame);
        expect(new Set(frames)).toEqual(
          new Set(
            Array.from({ length: sequence.impact.frameCount }, (_, i) => i),
          ),
        );
        expect(frames).toEqual([...frames].sort((a, b) => a - b));
        fight.scene.destroy();
      });

      it("throws its blow where the target is, and a miss a tile past it", () => {
        const fight = startFight(attackClass);
        const target = worldToScreen(fight.enemyTile.x, fight.enemyTile.y);
        const attacker = worldToScreen(fight.playerTile.x, fight.playerTile.y);
        const reach = (point: ScreenPoint): number =>
          Math.hypot(point.sx - attacker.sx, point.sy - attacker.sy);
        // Bare hands flash where a weapon sparks; both land the same way.
        const hitKind = impactSequence(attackClass).impact.kind;

        clock = 2000;
        const hitBeat = fight.scene.attackFx(fight.playerId, fight.enemyId);
        const landed = firstOf(playOut(fight, 2000, hitBeat + 400), hitKind);
        expect(landed, "a hit lands on the target").toBeDefined();
        expect(landed?.point.sx).toBeCloseTo(target.sx, 0);

        clock = 4000;
        const missBeat = fight.scene.attackFx(fight.playerId, fight.enemyId, {
          hit: false,
        });
        const chip = firstOf(playOut(fight, 4000, missBeat + 400), "chip");
        expect(chip, "a miss chips the arena").toBeDefined();
        // Past the target, along the same line: further from whoever
        // threw it than the thing they were aiming at.
        expect(reach(chip?.point ?? attacker)).toBeGreaterThan(reach(target));
        fight.scene.destroy();
      });
    });
  }

  it("carries a fired round from the muzzle to the target, one step at a time", () => {
    const fight = startFight("rifle");
    const start = 2000;
    clock = start;
    const contact = fight.scene.attackFx(fight.playerId, fight.enemyId);
    const flight = playOut(fight, start, contact).filter(
      (d) => effectKind(d.id) === "tracer",
    );
    expect(flight.length, "the round is drawn in flight").toBeGreaterThan(3);

    const target = worldToScreen(fight.enemyTile.x, fight.enemyTile.y);
    const first = flight[0]?.point ?? target;
    const last = flight[flight.length - 1]?.point ?? target;
    const closing = (point: ScreenPoint): number =>
      Math.hypot(point.sx - target.sx, point.sy - target.sy);
    // It only ever gets closer, and it ends up near what it was aimed at.
    let previous = Infinity;
    for (const step of flight) {
      const gap = closing(step.point);
      expect(gap).toBeLessThanOrEqual(previous);
      previous = gap;
    }
    expect(closing(last)).toBeLessThan(closing(first));
    // And it is the same picture every time — one baked streak, moved.
    expect(new Set(flight.map((d) => d.id)).size).toBe(1);
    fight.scene.destroy();
  });

  it("fires from the muzzle, on the side the shooter is facing", () => {
    const fight = startFight("pistol");
    const start = 2000;
    clock = start;
    // East at the scouts: the gun is out on the player's right.
    fight.scene.attackFx(fight.playerId, fight.enemyId);
    const east = firstOf(playOut(fight, start, 200), "muzzle");
    const stance = worldToScreen(fight.playerTile.x, fight.playerTile.y);
    expect(east, "the muzzle lights").toBeDefined();
    expect(east?.point.sx ?? 0, "out in front of the shooter").toBeGreaterThan(
      stance.sx,
    );
    // Chest height, not the boots: well above the tile it stands on.
    expect(east?.point.sy ?? 0).toBeLessThan(stance.sy - 20);
    // The same shot the other way mirrors the muzzle onto the other side.
    clock = 4000;
    fight.scene.attackFx(fight.enemyId, fight.playerId);
    const west = firstOf(playOut(fight, 4000, 200), "muzzle");
    const enemyStance = worldToScreen(fight.enemyTile.x, fight.enemyTile.y);
    expect(west, "the enemy's muzzle lights").toBeDefined();
    expect(west?.point.sx ?? 0, "out on the other side").toBeLessThan(
      enemyStance.sx,
    );
    fight.scene.destroy();
  });

  it("lands the reaction on the arrival, not on the trigger", () => {
    const fight = startFight("rifle");
    const start = 2000;
    clock = start;
    // Exactly what the combat screen does with the beat it is handed.
    const contact = fight.scene.attackFx(fight.playerId, fight.enemyId);
    fight.scene.hitFx(fight.enemyId, {
      attackerId: fight.playerId,
      delayMs: contact,
    });
    expect(contact).toBeGreaterThan(attackImpactMs("rifle"));

    const drawn = playOut(fight, start, contact + 400);
    const spark = firstOf(drawn, "spark");
    // The attacker is still mid-swing while the round is in the air…
    const inFlight = drawn.filter((d) => effectKind(d.id) === "tracer");
    expect(inFlight.length).toBeGreaterThan(0);
    for (const step of inFlight) {
      expect(step.atMs).toBeLessThan(spark?.atMs ?? 0);
    }
    // …and the flinch it causes starts with the impact, not before it.
    fight.draws.length = 0;
    fight.poses.length = 0;
    drawAt(start + contact - STEP_MS);
    expect(fight.draws.some((d) => effectKind(d.id) === "spark")).toBe(false);
    fight.scene.destroy();
  });

  it("keeps a single held impact marker under reduced motion", () => {
    settings.update({ motion: "reduced" });
    const fight = startFight("pistol");
    const start = 2000;
    clock = start;
    expect(fight.scene.attackFx(fight.playerId, fight.enemyId)).toBe(0);
    const drawn = playOut(fight, start, REDUCED_IMPACT_MS + 200);
    // Hit feedback survives: the spark is there, and it is one frame.
    expect(drawn.length).toBeGreaterThan(0);
    expect(new Set(drawn.map((d) => d.id))).toEqual(new Set(["spark-burst"]));
    expect(new Set(drawn.map((d) => d.frame))).toEqual(new Set([0]));
    // It shows at once, and it is gone once its hold is up.
    expect(drawn[0]?.atMs).toBe(start);
    expect(drawn[drawn.length - 1]?.atMs).toBeLessThan(
      start + REDUCED_IMPACT_MS,
    );

    // A miss still reads as a miss, with no travel to read it by.
    clock = 4000;
    fight.scene.attackFx(fight.playerId, fight.enemyId, { hit: false });
    const missed = playOut(fight, 4000, REDUCED_IMPACT_MS + 200);
    expect(new Set(missed.map((d) => d.id))).toEqual(new Set(["wall-chip"]));
    fight.scene.destroy();
  });
});
