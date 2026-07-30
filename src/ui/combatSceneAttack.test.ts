// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { composeCharacter } from "../character";
import { fixtureCharacter } from "../character/testSupport";
import { createCombat, livingEnemies, playerCombatant } from "../combat";
import { requireEncounter, requireMap } from "../data";
import {
  ATTACK_CLASS_IDS,
  ATTACK_FX_STYLE,
  TRACER_MAX_MS,
  attackDurationMs,
  attackFrameCount,
  attackImpactMs,
  createCombatScene,
  createPixelArtSprites,
  selectMotionFrame,
  type AttackClassId,
  type CombatScene,
  type CombatSceneEntity,
  type EntityPose,
  type Sprite,
  type SpriteProvider,
} from "../iso";
import { addItem, equip } from "../inventory";
import { settings } from "../settings";
import { createNewGame, type GameState } from "../state";
import { enemySpriteSource } from "./entitySprites";

/**
 * Every weapon class swinging in a real encounter: a real GameState with
 * that weapon equipped, the real enemy roster, the real arena map, and
 * the real pixel-art provider — so the descriptor the equipment composes
 * is what chooses the attack set, and the frames exercised here are the
 * frames that actually get baked.
 *
 * What is under test is the sequence the combat screen depends on: the
 * attacker turns to face its target, plays its class's whole authored
 * set in order, hands back the impact beat the reactions ride, and drops
 * to the resting loops once the swing is over. Painting is not under
 * test — the provider is wrapped in a recorder rather than replaced, so
 * the poses examined are the ones the scene really asked to draw.
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

/** Fine enough to land inside the shortest authored hold (80ms). */
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

/** One pose the scene asked to draw, keyed by the sprite id it drew. */
interface PoseRecord {
  spriteId: string;
  pose: EntityPose;
}

/** The real provider, with every entity pose it is asked for recorded. */
function recordingSprites(state: GameState, poses: PoseRecord[]): SpriteProvider {
  const real = createPixelArtSprites({
    player: () =>
      composeCharacter(state.player.appearance, state.player.equipment),
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
  /** Combatant ids — what the scene's sequencer is addressed with. */
  playerId: string;
  enemyId: string;
  /** Sprite ids — what the provider is asked for, and what poses key on. */
  enemySpriteId: string;
  poses: PoseRecord[];
  /** Attack class the real provider resolved from the equipped weapon. */
  resolvedClass: AttackClassId;
}

describe("attack animation in a real encounter", () => {
  let clock = 0;
  let frameCallback: FrameRequestCallback | null = null;

  beforeEach(() => {
    clock = 1000;
    frameCallback = null;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      frameCallback = cb;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () => anything() as CanvasRenderingContext2D,
    );
  });

  afterEach(() => {
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
    const poses: PoseRecord[] = [];
    const sprites = recordingSprites(state, poses);
    const scene = createCombatScene(document.createElement("canvas"), {
      map: requireMap(encounter.arenaMapId),
      sprites,
      onTileClick: () => {},
      onTileHover: () => {},
    });
    const entities: CombatSceneEntity[] = combat.combatants.map((c) => ({
      id: c.id,
      spriteId: c.kind === "player" ? "player" : c.enemyId ?? "enemy",
      position: { ...c.position },
      hp: c.hp,
      maxHp: c.maxHp,
      alive: true,
      active: c.kind === "player",
    }));
    scene.setEntities(entities);
    const enemy = livingEnemies(combat)[0];
    return {
      scene,
      playerId: playerCombatant(combat).id,
      enemyId: enemy?.id ?? "",
      enemySpriteId: enemy?.enemyId ?? "enemy",
      poses,
      resolvedClass: sprites.attackClass?.("player") ?? "unarmed",
    };
  }

  /** Poses one sprite was drawn with, oldest first. */
  function posesOf(fight: Fight, spriteId: string): EntityPose[] {
    return fight.poses
      .filter((p) => p.spriteId === spriteId)
      .map((p) => p.pose);
  }

  const playerPoses = (fight: Fight): EntityPose[] => posesOf(fight, "player");

  for (const attackClass of ATTACK_CLASS_IDS) {
    describe(attackClass, () => {
      it("resolves its class from the weapon the player is holding", () => {
        const fight = startFight(attackClass);
        expect(fight.resolvedClass).toBe(attackClass);
        fight.scene.destroy();
      });

      it("reports the beat its reactions ride", () => {
        const fight = startFight(attackClass);
        clock = 2000;
        const contact = fight.scene.attackFx(fight.playerId, fight.enemyId);
        const swing = attackImpactMs(attackClass);
        if (ATTACK_FX_STYLE[attackClass] === "tracer") {
          // A fired round lands when it arrives, not when it is fired
          // (see ../iso/impact.ts); everything else lands as it swings.
          expect(contact).toBeGreaterThan(swing);
          expect(contact - swing).toBeLessThanOrEqual(TRACER_MAX_MS);
        } else {
          expect(contact).toBe(swing);
        }
        fight.scene.destroy();
      });

      it("plays every authored frame in order, then returns to rest", () => {
        const fight = startFight(attackClass);
        const start = 2000;
        clock = start;
        fight.scene.attackFx(fight.playerId, fight.enemyId);

        fight.poses.length = 0;
        const duration = attackDurationMs(attackClass);
        for (let t = 0; t <= duration + 60; t += STEP_MS) drawAt(start + t);

        // Read each drawn pose back through the one selection rule the
        // provider itself uses, so this asserts on the frame that was
        // baked rather than on the raw clock.
        const played = playerPoses(fight).map((pose) =>
          selectMotionFrame(attackClass, pose),
        );
        const attackFrames = played
          .filter((s) => s.state === "attack")
          .map((s) => s.frame);

        // The whole set showed, in order, and nothing outside it.
        expect(new Set(attackFrames)).toEqual(
          new Set(
            Array.from({ length: attackFrameCount(attackClass) }, (_, i) => i),
          ),
        );
        expect(attackFrames).toEqual([...attackFrames].sort((a, b) => a - b));

        // The swing ends: the last pose drawn is back on a resting loop.
        expect(played[played.length - 1]?.state).not.toBe("attack");
        fight.scene.destroy();
      });

      it("keeps the attacker facing its target through the swing", () => {
        const fight = startFight(attackClass);
        clock = 1500;
        fight.scene.attackFx(fight.playerId, fight.enemyId);
        fight.poses.length = 0;
        drawAt(1520);
        // The scout team stands east of the player's start.
        expect(playerPoses(fight)[0]?.facing).toBe("e");
        fight.scene.destroy();
      });
    });
  }

  it("turns an attacker that is not already facing its target", () => {
    // The enemy spawns facing south and the player stands west of it, so
    // swinging back has to actually turn the sprite around.
    const fight = startFight("blade");
    clock = 1500;
    drawAt(1500);
    expect(posesOf(fight, fight.enemySpriteId)[0]?.facing).toBe("s");

    fight.scene.attackFx(fight.enemyId, fight.playerId);
    fight.poses.length = 0;
    drawAt(1520);
    expect(posesOf(fight, fight.enemySpriteId)[0]?.facing).toBe("w");
    fight.scene.destroy();
  });

  it("still faces the target under reduced motion, but skips the swing", () => {
    settings.update({ reducedMotion: true });
    try {
      const fight = startFight("rifle");
      clock = 1500;
      // Everything resolves on the spot: no beat for reactions to wait on.
      expect(fight.scene.attackFx(fight.enemyId, fight.playerId)).toBe(0);
      fight.poses.length = 0;
      drawAt(1520);
      const pose = posesOf(fight, fight.enemySpriteId)[0];
      expect(pose?.facing, "turns anyway").toBe("w");
      expect(pose?.attackElapsedMs, "no animation plays").toBeUndefined();
      fight.scene.destroy();
    } finally {
      settings.update({ reducedMotion: false });
    }
  });
});
