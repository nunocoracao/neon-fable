// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { composeCharacter } from "../character";
import { fixtureCharacter } from "../character/testSupport";
import { createCombat, livingEnemies, playerCombatant } from "../combat";
import { requireEncounter, requireMap } from "../data";
import {
  REACTION_STAGGER_MS,
  createCombatScene,
  createPixelArtSprites,
  reactionDurationMs,
  reactionFrameCount,
  selectMotionFrame,
  type CombatScene,
  type CombatSceneEntity,
  type EntityPose,
  type ReactionKind,
  type Sprite,
  type SpriteProvider,
} from "../iso";
import { settings } from "../settings";
import { createNewGame, type GameState } from "../state";
import { enemyDeathStyle, enemySpriteSource } from "./entitySprites";

/**
 * The receiving end of a real fight: the scout team on the real arena
 * map, drawn through the real pixel-art provider, taking real blows.
 *
 * What is under test is the sequence the combat screen depends on — a
 * hit lands on the beat the swing reports and throws the body away from
 * whoever swung, armor turns a flinch into a shudder, several reactions
 * on one beat play in initiative order, a death follows the blow that
 * caused it and leaves a heap that stays, and a chassis dies visibly
 * unlike a body. Painting is not under test: the provider is wrapped in
 * a recorder rather than replaced, so the poses examined are the ones
 * the scene really asked to draw.
 */

/** The scout team: an Auric agent (flesh, armored) and a drone (machine). */
const ENCOUNTER_ID = "enc-auric-scout";

/** Fine enough to land inside the shortest authored hold (70ms). */
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

/** One pose the scene asked to draw, in the order it asked for it. */
interface PoseRecord {
  spriteId: string;
  pose: EntityPose;
}

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

interface Fighter {
  /** Combatant id — what the scene's sequencer is addressed with. */
  id: string;
  /** Sprite id — what the provider is asked for, and what poses key on. */
  spriteId: string;
}

interface Fight {
  scene: CombatScene;
  player: Fighter;
  /** The Auric agent, standing north-east of the player. */
  agent: Fighter;
  /** The static drone, standing south-east of the player. */
  drone: Fighter;
  poses: PoseRecord[];
  push(overrides?: Record<string, Partial<CombatSceneEntity>>): void;
}

describe("hit reactions and deaths in a real encounter", () => {
  let clock = 0;
  let frameCallback: FrameRequestCallback | null = null;

  beforeEach(() => {
    clock = 1000;
    frameCallback = null;
    // What is under test here is the reaction sequencer, read off the
    // scene clock. The combat camera's hit-pause deliberately holds
    // that clock on a contact beat (see ../iso/cameraFeel.ts), which is
    // its own subject — combatSceneFeel.test.ts — so it stays off here.
    settings.update({ combatFeel: false });
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
    settings.update({ motion: "full", combatFeel: true });
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
    const poses: PoseRecord[] = [];
    const scene = createCombatScene(document.createElement("canvas"), {
      map: requireMap(encounter.arenaMapId),
      sprites: recordingSprites(state, poses),
      onTileClick: () => {},
      onTileHover: () => {},
    });
    // The screen's own entity view: sprite id, initiative place, and the
    // death an archetype's chassis calls for.
    const base = combat.combatants.map((c, index) => ({
      id: c.id,
      spriteId: c.kind === "player" ? "player" : c.enemyId ?? "enemy",
      position: { ...c.position },
      hp: c.hp,
      maxHp: c.maxHp,
      alive: true,
      active: c.kind === "player",
      order: index,
      deathStyle:
        c.kind === "player" ? ("collapse" as const) : enemyDeathStyle(c.enemyId),
    }));
    const push = (
      overrides: Record<string, Partial<CombatSceneEntity>> = {},
    ): void => {
      scene.setEntities(
        base.map((entity) => ({ ...entity, ...overrides[entity.id] })),
      );
    };
    push();
    const foes = livingEnemies(combat);
    const fighter = (enemyId: string): Fighter => {
      const found = foes.find((c) => c.enemyId === enemyId);
      if (!found) throw new Error(`no ${enemyId} in ${ENCOUNTER_ID}`);
      return { id: found.id, spriteId: enemyId };
    };
    return {
      scene,
      player: { id: playerCombatant(combat).id, spriteId: "player" },
      agent: fighter("nme-auric-agent"),
      drone: fighter("nme-static-drone"),
      poses,
      push,
    };
  }

  /** Poses one sprite was drawn with since the recorder was last cleared. */
  function posesOf(fight: Fight, who: Fighter): EntityPose[] {
    return fight.poses
      .filter((p) => p.spriteId === who.spriteId)
      .map((p) => p.pose);
  }

  /** The reaction a sprite is drawn in on a single frame, if any. */
  function reactionOn(fight: Fight, who: Fighter, at: number): EntityPose["reaction"] {
    fight.poses.length = 0;
    drawAt(at);
    return posesOf(fight, who)[0]?.reaction;
  }

  /** Every distinct reaction frame a sprite played over a window. */
  function playedFrames(
    fight: Fight,
    who: Fighter,
    from: number,
    to: number,
  ): Array<{ kind: ReactionKind; frame: number }> {
    fight.poses.length = 0;
    for (let t = from; t <= to; t += STEP_MS) drawAt(t);
    const played: Array<{ kind: ReactionKind; frame: number }> = [];
    for (const pose of posesOf(fight, who)) {
      if (!pose.reaction) continue;
      // Read the pose back through the same rule the provider uses, so
      // this asserts on the frame that was baked, not on the raw clock.
      const { state, frame } = selectMotionFrame("unarmed", pose);
      if (state !== "react") continue;
      const last = played[played.length - 1];
      if (last && last.kind === pose.reaction.kind && last.frame === frame) {
        continue;
      }
      played.push({ kind: pose.reaction.kind, frame });
    }
    return played;
  }

  it("waits for the impact beat, then throws the body away from the attacker", () => {
    const fight = startFight();
    clock = 2000;
    // The agent stands north-east of the player: further right on
    // screen, so the blow throws it further right again.
    fight.scene.hitFx(fight.agent.id, {
      attackerId: fight.player.id,
      delayMs: 200,
    });
    expect(reactionOn(fight, fight.agent, 2100), "before the beat").toBeUndefined();
    const landed = reactionOn(fight, fight.agent, 2200);
    expect(landed?.kind).toBe("flinch");
    expect(landed?.awayX).toBe(1);
    fight.scene.destroy();
  });

  it("gives an armored blow the reduced shudder", () => {
    const fight = startFight();
    clock = 2000;
    fight.scene.hitFx(fight.agent.id, {
      attackerId: fight.player.id,
      glancing: true,
    });
    expect(reactionOn(fight, fight.agent, 2000)?.kind).toBe("shudder");
    fight.scene.destroy();
  });

  it("plays a flinch's whole set in order, then goes back to breathing", () => {
    const fight = startFight();
    clock = 2000;
    fight.scene.hitFx(fight.agent.id, { attackerId: fight.player.id });
    const played = playedFrames(
      fight,
      fight.agent,
      2000,
      2000 + reactionDurationMs("flinch") + 60,
    );
    expect(played.map((p) => p.frame)).toEqual(
      Array.from({ length: reactionFrameCount("flinch") }, (_, i) => i),
    );
    // The last pose drawn is back on a resting loop.
    expect(posesOf(fight, fight.agent).slice(-1)[0]?.reaction).toBeUndefined();
    fight.scene.destroy();
  });

  it("queues two reactions on one beat in initiative order", () => {
    const fight = startFight();
    clock = 2000;
    // Both are hit by the same blow, on the same beat. The drone acts
    // later in the round, so it reacts a stagger behind the agent.
    fight.scene.hitFx(fight.drone.id, { attackerId: fight.player.id });
    fight.scene.hitFx(fight.agent.id, { attackerId: fight.player.id });
    expect(reactionOn(fight, fight.agent, 2000)?.kind).toBe("flinch");
    expect(reactionOn(fight, fight.drone, 2000), "waits its turn").toBeUndefined();
    expect(
      reactionOn(fight, fight.drone, 2000 + REACTION_STAGGER_MS)?.kind,
    ).toBe("flinch");
    fight.scene.destroy();
  });

  it("lands the collapse after the flinch that killed it", () => {
    const fight = startFight();
    clock = 2000;
    fight.scene.hitFx(fight.agent.id, {
      attackerId: fight.player.id,
      delayMs: 100,
    });
    // The screen pushes the defeat as soon as the engine reports it,
    // before the swing has even connected.
    fight.push({ [fight.agent.id]: { alive: false, hp: 0 } });
    const played = playedFrames(
      fight,
      fight.agent,
      2100,
      2100 + reactionDurationMs("flinch") + reactionDurationMs("collapse"),
    );
    expect(played.map((p) => p.kind)).toEqual([
      "flinch",
      "flinch",
      ...Array.from({ length: reactionFrameCount("collapse") }, () => "collapse"),
    ]);
    expect(played.slice(2).map((p) => p.frame)).toEqual(
      Array.from({ length: reactionFrameCount("collapse") }, (_, i) => i),
    );
    fight.scene.destroy();
  });

  it("leaves a heap on the floor for the rest of the encounter", () => {
    const fight = startFight();
    clock = 2000;
    fight.push({ [fight.agent.id]: { alive: false, hp: 0 } });
    const settled = 2000 + reactionDurationMs("collapse");
    const heap = reactionFrameCount("collapse") - 1;
    for (const at of [settled, settled + 30_000, settled + 600_000]) {
      const pose = reactionOn(fight, fight.agent, at);
      expect(pose?.kind, `heap at ${at}`).toBe("collapse");
      expect(selectMotionFrame("unarmed", { moving: false, timeMs: at, reaction: pose })).toEqual(
        { state: "react", frame: heap },
      );
    }
    fight.scene.destroy();
  });

  it("sparks a chassis out where a body crumples", () => {
    const fight = startFight();
    clock = 2000;
    fight.push({
      [fight.agent.id]: { alive: false, hp: 0 },
      [fight.drone.id]: { alive: false, hp: 0 },
    });
    const settled = 2000 + reactionDurationMs("sparkout");
    expect(reactionOn(fight, fight.agent, settled)?.kind).toBe("collapse");
    expect(reactionOn(fight, fight.drone, settled)?.kind).toBe("sparkout");
    fight.scene.destroy();
  });

  it("lays the heap under whoever is still standing on the same depth", () => {
    const fight = startFight();
    clock = 2000;
    // Same x+y: the fallen and the standing are the same distance from
    // the viewer, and the heap is the one that gets stepped over.
    fight.push({
      [fight.agent.id]: { alive: false, hp: 0, position: { x: 5, y: 3 } },
      [fight.drone.id]: { position: { x: 3, y: 5 } },
    });
    fight.poses.length = 0;
    drawAt(2000 + reactionDurationMs("collapse"));
    const drawn = fight.poses.map((p) => p.spriteId);
    expect(drawn.indexOf(fight.agent.spriteId)).toBeLessThan(
      drawn.indexOf(fight.drone.spriteId),
    );
    fight.scene.destroy();
  });

  it("under reduced motion, takes hits without a recoil and fades the dead away", () => {
    settings.update({ motion: "reduced" });
    const fight = startFight();
    clock = 2000;
    fight.scene.hitFx(fight.agent.id, { attackerId: fight.player.id });
    expect(reactionOn(fight, fight.agent, 2000), "no recoil").toBeUndefined();

    fight.push({ [fight.drone.id]: { alive: false, hp: 0 } });
    // Mid-fade the body is still drawn — as itself, not falling.
    expect(reactionOn(fight, fight.drone, 2200), "no collapse").toBeUndefined();
    expect(posesOf(fight, fight.drone).length, "still on screen").toBe(1);
    // And once faded there is nothing left, heap included.
    fight.poses.length = 0;
    drawAt(2000 + reactionDurationMs("sparkout") + 1000);
    expect(posesOf(fight, fight.drone).length, "gone").toBe(0);
    fight.scene.destroy();
  });
});
