// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureCharacter } from "../character/testSupport";
import { createCombat, footprintCenter, playerCombatant } from "../combat";
import { requireEncounter, requireMap } from "../data";
import {
  MECH_FRAME,
  createCombatScene,
  createPixelArtSprites,
  worldToScreen,
  type CombatScene,
  type CombatSceneEntity,
  type EntityPose,
  type Sprite,
  type SpriteProvider,
} from "../iso";
import { createNewGame } from "../state";
import { enemySpriteSource } from "./entitySprites";
import { playerSpriteSource } from "./playerSprite";

/**
 * The multi-tile boss on a real arena, drawn by the real provider.
 *
 * What is under test is the geometry the footprint field is *for*: the
 * chassis is drawn over the middle of its 2×2 block rather than over the
 * corner it is anchored on, it sorts against that middle so characters
 * pass in front of and behind it correctly, and everything the scene
 * hangs over a combatant rides its own frame height instead of a
 * person's. Painting is not under test — the provider is wrapped in a
 * recorder and the 2D context records the draws it is given.
 */

const ENCOUNTER_ID = "enc-exec-warden";

/** One image the scene drew, and where it put it. */
interface DrawRecord {
  image: unknown;
  x: number;
  y: number;
}

/** Enough of the 2D API for bakeSprite; paints nothing. */
function bakeContext(): unknown {
  return { fillRect: () => {}, fillStyle: "" };
}

/** Recording 2D context: enough of the API to render, plus a log. */
function recordingContext(draws: DrawRecord[], rects: DrawRecord[]): unknown {
  const noop = (): void => {};
  return {
    canvas: { width: 0, height: 0 },
    setTransform: noop,
    clearRect: noop,
    save: noop,
    restore: noop,
    translate: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    closePath: noop,
    fill: noop,
    stroke: noop,
    setLineDash: noop,
    measureText: () => ({ width: 0 }),
    createRadialGradient: () => ({ addColorStop: noop }),
    fillRect: (x: number, y: number) => rects.push({ image: null, x, y }),
    drawImage: (image: unknown, x: number, y: number) =>
      draws.push({ image, x, y }),
    imageSmoothingEnabled: false,
    globalAlpha: 1,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
  };
}

interface Scene {
  scene: CombatScene;
  draws: DrawRecord[];
  rects: DrawRecord[];
  poses: Array<{ spriteId: string; pose: EntityPose }>;
  entities: CombatSceneEntity[];
  wardenId: string;
  wardenSpriteId: string;
  playerId: string;
  /** The chassis's anchor tile, and the middle of the block it covers. */
  anchor: { x: number; y: number };
  center: { x: number; y: number };
}

describe("a 2x2 chassis on a real arena", () => {
  let frameCallback: FrameRequestCallback | null = null;

  beforeEach(() => {
    frameCallback = null;
    vi.spyOn(performance, "now").mockImplementation(() => 1000);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      frameCallback = cb;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    // happy-dom has no 2D context, and the real provider bakes onto its
    // own canvases: give every canvas a painting stub, and the scene's
    // own canvas a recorder on top of it (an own property wins).
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () => bakeContext() as CanvasRenderingContext2D,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function start(playerAt?: { x: number; y: number }): Scene {
    const state = createNewGame({ character: fixtureCharacter(), seed: 7 });
    const encounter = requireEncounter(ENCOUNTER_ID);
    const combat = createCombat(state, ENCOUNTER_ID);
    const draws: DrawRecord[] = [];
    const rects: DrawRecord[] = [];
    const poses: Array<{ spriteId: string; pose: EntityPose }> = [];
    const real = createPixelArtSprites({
      player: playerSpriteSource({ state } as never),
      entity: enemySpriteSource(),
    });
    const sprites: SpriteProvider = {
      ...real,
      entity(id: string, pose: EntityPose): Sprite {
        poses.push({ spriteId: id, pose: { ...pose } });
        return real.entity(id, pose);
      },
    };
    const canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getContext").mockImplementation(
      () => recordingContext(draws, rects) as CanvasRenderingContext2D,
    );
    const scene = createCombatScene(canvas, {
      map: requireMap(encounter.arenaMapId),
      sprites,
      onTileClick: () => {},
      onTileHover: () => {},
    });
    const warden = combat.combatants.find((c) => c.kind === "enemy")!;
    const wardenSpriteId = `${warden.enemyId}#0`;
    const entities: CombatSceneEntity[] = combat.combatants.map((c) => ({
      id: c.id,
      spriteId: c.kind === "player" ? "player" : wardenSpriteId,
      position:
        c.kind === "player" && playerAt ? { ...playerAt } : { ...c.position },
      ...(c.footprint ? { footprint: { ...c.footprint } } : {}),
      hp: c.hp,
      maxHp: c.maxHp,
      alive: true,
      active: c.kind === "player",
    }));
    scene.setEntities(entities);
    return {
      scene,
      draws,
      rects,
      poses,
      entities,
      wardenId: warden.id,
      wardenSpriteId,
      playerId: playerCombatant(combat).id,
      anchor: { ...warden.position },
      center: footprintCenter(warden.position, warden.footprint),
    };
  }

  function frame(scene: Scene): void {
    scene.draws.length = 0;
    scene.rects.length = 0;
    frameCallback?.(1000);
  }

  it("carries the footprint from the encounter through to the scene", () => {
    const s = start();
    const warden = s.entities.find((e) => e.id === s.wardenId);
    expect(warden?.footprint).toEqual({ width: 2, height: 2 });
    // Anchored on a corner; the middle of the block sits half a tile in.
    expect(s.center).toEqual({ x: s.anchor.x + 0.5, y: s.anchor.y + 0.5 });
    s.scene.destroy();
  });

  it("draws the chassis over the middle of its block, not its corner", () => {
    const s = start();
    frame(s);
    // Located by where it was drawn, never by matching sprite.image —
    // two things of a kind share one cached canvas by design.
    const anchor = createPixelArtSprites({
      entity: enemySpriteSource(),
    }).entityAnchor(s.wardenSpriteId);
    const middle = worldToScreen(s.center.x, s.center.y);
    const corner = worldToScreen(s.anchor.x, s.anchor.y);
    const at = (p: { sx: number; sy: number }): DrawRecord | undefined =>
      s.draws.find((d) => d.x === p.sx - anchor.x && d.y === p.sy - anchor.y);
    expect(at(middle), "drawn over the middle of the block").toBeDefined();
    expect(at(corner), "not drawn over the anchor corner").toBeUndefined();
    s.scene.destroy();
  });

  it("anchors it on its own frame, which is not the body frame", () => {
    const s = start();
    const anchor = createPixelArtSprites({
      entity: enemySpriteSource(),
    }).entityAnchor(s.wardenSpriteId);
    // Its own 96×112 frame, at ART_SCALE — twice a person's height.
    expect(anchor.y).toBe(MECH_FRAME.anchorY * 2);
    expect(anchor.x).toBe(MECH_FRAME.anchorX * 2);
    s.scene.destroy();
  });

  it("hangs its health bar clear of a frame that tall", () => {
    const s = start();
    frame(s);
    const middle = worldToScreen(s.center.x, s.center.y);
    // The bar's backing rect is the topmost thing drawn over the body;
    // for a person it sits at -105, and a chassis must clear its own
    // sprite instead of wearing a person's clearance.
    const overWarden = s.rects
      .filter((r) => Math.abs(r.x - (middle.sx - 33)) <= 1)
      .map((r) => r.y);
    expect(overWarden.length, "a bar was drawn over the chassis").toBeGreaterThan(0);
    const top = Math.min(...overWarden);
    expect(middle.sy - top).toBeGreaterThan(MECH_FRAME.anchorY * 2);
    s.scene.destroy();
  });

  it("sorts at the middle of the block, so bodies read around it", () => {
    const s = start();
    // Walk the player to three places: screen-behind the block, level
    // with it, and screen-in-front of it. The chassis sorts at its own
    // middle (anchor + 0.5 on both axes), so the two tiles either side
    // of that depth land on opposite sides of it.
    const behind = { x: s.anchor.x - 1, y: s.anchor.y };
    const front = { x: s.anchor.x + 2, y: s.anchor.y + 2 };
    const provider = createPixelArtSprites({ entity: enemySpriteSource() });
    const mech = provider.entityAnchor(s.wardenSpriteId);
    const body = provider.entityAnchor("player");
    const order = (to: { x: number; y: number }): number => {
      // A fresh scene per placement: setEntities on a live one would
      // queue a walk, and a body mid-stride is not standing anywhere.
      const placed = start(to);
      frame(placed);
      // Both figures are found by the exact point they were drawn at,
      // never by matching images — two things of a kind share a canvas.
      const wardenAt = worldToScreen(placed.center.x, placed.center.y);
      const playerAt = worldToScreen(to.x, to.y);
      const warden = placed.draws.findIndex(
        (d) => d.x === wardenAt.sx - mech.x && d.y === wardenAt.sy - mech.y,
      );
      const player = placed.draws.findIndex(
        (d) => d.x === playerAt.sx - body.x && d.y === playerAt.sy - body.y,
      );
      expect(warden, "the chassis was drawn").toBeGreaterThanOrEqual(0);
      expect(player, "the player was drawn").toBeGreaterThanOrEqual(0);
      placed.scene.destroy();
      return player - warden;
    };
    // Behind it (lower depth) → drawn first, so the chassis is over it.
    expect(order(behind)).toBeLessThan(0);
    // In front of it (higher depth) → drawn after, so it is over the chassis.
    expect(order(front)).toBeGreaterThan(0);
    s.scene.destroy();
  });
});
