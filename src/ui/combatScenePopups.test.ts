// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { composeCharacter } from "../character";
import { fixtureCharacter } from "../character/testSupport";
import { createCombat, livingEnemies, playerCombatant } from "../combat";
import { requireEncounter, requireMap } from "../data";
import {
  POPUP_LIFT_PX,
  POPUP_MS,
  POPUP_RISE_PX,
  POPUP_STACK_PX,
  createCombatScene,
  createPixelArtSprites,
  worldToScreen,
  type CombatScene,
  type CombatSceneEntity,
  type PopupKind,
  type Sprite,
  type SpriteProvider,
  type TilePoint,
} from "../iso";
import { settings } from "../settings";
import { createNewGame } from "../state";
import { enemySpriteSource } from "./entitySprites";

/**
 * Floating readouts in a real encounter: the real arena map, the real
 * roster, and the real pixel-art provider — so what is examined here is
 * the baked pixel-font sprite the fight actually draws, placed by the
 * real scene.
 *
 * What is under test is what the combat screen depends on: a figure
 * waits for the beat its blow lands on, climbs off the body it belongs
 * to, fades out and leaves nothing behind, several readouts on one body
 * stack instead of overlapping, and reduced motion keeps the reading
 * while dropping the travel. Painting is not under test — the canvas is
 * a recorder, so what is asserted is which readout was drawn, when, and
 * where.
 */

const ENCOUNTER_ID = "enc-auric-scout";

/** Fine enough to catch the start and end of a 900ms life. */
const STEP_MS = 20;

/** A value whose every property/call yields another such value. */
function anything(): unknown {
  const fn = (): unknown => anything();
  return new Proxy(fn, {
    get: (_target, prop) =>
      prop === Symbol.toPrimitive ? () => 0 : anything(),
    set: () => true,
    apply: () => anything(),
  });
}

/** One readout the scene drew, and where it put it. */
interface PopupDraw {
  text: string;
  kind: PopupKind;
  /** Scene-clock ms it was drawn at. */
  atMs: number;
  /** Screen point the readout's bottom center landed on. */
  sx: number;
  sy: number;
  alpha: number;
}

interface Fight {
  scene: CombatScene;
  playerId: string;
  enemyId: string;
  playerTile: TilePoint;
  enemyTile: TilePoint;
  draws: PopupDraw[];
}

describe("floating readouts in a real encounter", () => {
  let clock = 0;
  let frameCallback: FrameRequestCallback | null = null;
  /** Baked readout canvases, so a drawImage call names what it drew. */
  let baked = new Map<CanvasImageSource, { text: string; kind: PopupKind; sprite: Sprite }>();
  let draws: PopupDraw[] = [];
  /** The scale the scene last set on its canvas transform. */
  let transformScale = 0;

  function recordingContext(): CanvasRenderingContext2D {
    const fallback = anything() as Record<string | symbol, unknown>;
    let alpha = 1;
    return new Proxy(
      {},
      {
        get: (_target, prop) => {
          if (prop === "globalAlpha") return alpha;
          if (prop === "setTransform") {
            return (scaleX: number): void => {
              transformScale = scaleX;
            };
          }
          if (prop !== "drawImage") return fallback[prop];
          return (image: CanvasImageSource, x: number, y: number): void => {
            const known = baked.get(image);
            if (!known) return;
            draws.push({
              text: known.text,
              kind: known.kind,
              atMs: clock,
              sx: x + known.sprite.anchorX,
              sy: y + known.sprite.anchorY,
              alpha,
            });
          };
        },
        set: (_target, prop, value) => {
          if (prop === "globalAlpha") alpha = Number(value);
          return true;
        },
      },
    ) as unknown as CanvasRenderingContext2D;
  }

  beforeEach(() => {
    clock = 1000;
    frameCallback = null;
    baked = new Map();
    draws = [];
    transformScale = 0;
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
    settings.update({ reducedMotion: false, zoom: 1 });
    vi.restoreAllMocks();
  });

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
      popupText(text: string, kind: PopupKind): Sprite {
        const sprite = real.popupText(text, kind);
        baked.set(sprite.image, { text, kind, sprite });
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
    };
  }

  /** Play a stretch of the scene clock out, one fine step at a time. */
  function playOut(fight: Fight, from: number, throughMs: number): PopupDraw[] {
    fight.draws.length = 0;
    for (let t = 0; t <= throughMs; t += STEP_MS) drawAt(from + t);
    return [...fight.draws];
  }

  it("floats the figure over the body it is about, and lets it go", () => {
    const fight = startFight();
    const start = 2000;
    clock = start;
    fight.scene.popup({
      tile: fight.enemyTile,
      kind: "damage",
      text: "-12",
    });
    const drawn = playOut(fight, start, POPUP_MS + 200);
    expect(drawn.length, "the figure is drawn").toBeGreaterThan(0);
    expect(new Set(drawn.map((d) => d.text))).toEqual(new Set(["-12"]));

    // Over the target's own column, clear of its head.
    const target = worldToScreen(fight.enemyTile.x, fight.enemyTile.y);
    for (const draw of drawn) {
      expect(draw.sx).toBe(target.sx);
      expect(draw.sy).toBeLessThanOrEqual(target.sy - POPUP_LIFT_PX);
    }
    // It climbs, it fades, and it is gone before its life is up.
    const first = drawn[0];
    const last = drawn[drawn.length - 1];
    expect(first?.atMs).toBe(start);
    expect(first?.alpha).toBe(1);
    expect(last?.sy ?? 0).toBeLessThan((first?.sy ?? 0) - POPUP_RISE_PX * 0.9);
    expect(last?.alpha ?? 1).toBeLessThan(0.2);
    expect(last?.atMs ?? 0).toBeLessThan(start + POPUP_MS);
    // Nothing rises twice or drops back down along the way.
    let previous = Infinity;
    for (const draw of drawn) {
      expect(draw.sy).toBeLessThanOrEqual(previous);
      previous = draw.sy;
    }
    fight.scene.destroy();
  });

  it("waits for the beat the blow lands on", () => {
    const fight = startFight();
    const start = 2000;
    clock = start;
    const delayMs = 300;
    fight.scene.popup({
      tile: fight.enemyTile,
      kind: "damage",
      text: "-4",
      delayMs,
    });
    // Nothing at all until the round arrives…
    expect(playOut(fight, start, delayMs - STEP_MS)).toEqual([]);
    // …and then the whole life of it, from that beat.
    const drawn = playOut(fight, start + delayMs, POPUP_MS);
    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn[0]?.atMs).toBe(start + delayMs);
    fight.scene.destroy();
  });

  it("stacks simultaneous readouts on one body instead of piling them up", () => {
    const fight = startFight();
    const start = 2000;
    clock = start;
    // A blow and the condition it left, answering the same beat.
    fight.scene.popup({ tile: fight.enemyTile, kind: "damage", text: "-9" });
    fight.scene.popup({ tile: fight.enemyTile, kind: "status", text: "STUNNED" });
    fight.scene.popup({ tile: fight.enemyTile, kind: "miss", text: "MISS" });

    fight.draws.length = 0;
    drawAt(start);
    const together = [...fight.draws];
    expect(together.map((d) => d.text).sort()).toEqual(
      ["-9", "MISS", "STUNNED"].sort(),
    );
    const rows = together.map((d) => d.sy).sort((a, b) => a - b);
    expect(new Set(rows).size, "each takes its own rung").toBe(3);
    for (let i = 1; i < rows.length; i++) {
      expect((rows[i - 1] ?? 0) + POPUP_STACK_PX).toBeLessThanOrEqual(rows[i] ?? 0);
    }
    // Which is enough room for the tallest of them: no two overlap.
    const heights = new Map(
      together.map((d) => [d.text, baked.get(spriteFor(d.text))?.sprite.anchorY ?? 0]),
    );
    for (const [text, height] of heights) {
      expect(height, `${text} height`).toBeLessThanOrEqual(POPUP_STACK_PX);
    }
    fight.scene.destroy();
  });

  /** The baked image of a readout the fight has already drawn. */
  function spriteFor(text: string): CanvasImageSource {
    for (const [image, known] of baked) {
      if (known.text === text) return image;
    }
    throw new Error(`no baked readout for "${text}"`);
  }

  it("reuses a rung once the readout that held it has gone", () => {
    const fight = startFight();
    const start = 2000;
    clock = start;
    fight.scene.popup({ tile: fight.enemyTile, kind: "damage", text: "-1" });
    fight.draws.length = 0;
    drawAt(start);
    const firstRow = fight.draws[0]?.sy ?? 0;

    clock = start + POPUP_MS;
    fight.scene.popup({ tile: fight.enemyTile, kind: "damage", text: "-2" });
    fight.draws.length = 0;
    drawAt(start + POPUP_MS);
    const second = fight.draws.find((d) => d.text === "-2");
    expect(second?.sy).toBe(firstRow);
    fight.scene.destroy();
  });

  it("fades in place under reduced motion, and still says what happened", () => {
    settings.update({ reducedMotion: true });
    const fight = startFight();
    const start = 2000;
    clock = start;
    fight.scene.popup({ tile: fight.enemyTile, kind: "critical", text: "-24" });
    const drawn = playOut(fight, start, POPUP_MS + 100);
    expect(drawn.length, "the reading survives").toBeGreaterThan(0);
    // Nowhere: every frame draws it on the same row it landed on.
    expect(new Set(drawn.map((d) => d.sy)).size).toBe(1);
    // And it still goes out rather than staying on the arena forever.
    expect(drawn[0]?.alpha).toBe(1);
    expect(drawn[drawn.length - 1]?.alpha ?? 1).toBeLessThan(0.2);
    expect(playOut(fight, start + POPUP_MS, 200)).toEqual([]);
    fight.scene.destroy();
  });

  it("draws readouts inside the arena's own zoom, like everything else in it", () => {
    settings.update({ zoom: 2 });
    const fight = startFight();
    // The whole scene — ground, bodies, and the numbers over them — is
    // painted through one transform, so a readout is exactly as large
    // relative to the body it is about at every level.
    expect(transformScale).toBe(2 * (window.devicePixelRatio || 1));

    const start = 2000;
    clock = start;
    fight.scene.popup({ tile: fight.enemyTile, kind: "damage", text: "-5" });
    const target = worldToScreen(fight.enemyTile.x, fight.enemyTile.y);
    const drawn = playOut(fight, start, 100);
    // Placed in world-screen units, which the transform then scales:
    // the figure stays over the same tile, whatever the zoom.
    expect(drawn[0]?.sx).toBe(target.sx);

    // And the setting is followed mid-fight, on the next frame.
    settings.update({ zoom: 1 });
    drawAt(start + 120);
    expect(transformScale).toBe(window.devicePixelRatio || 1);
    fight.scene.destroy();
  });

  it("bakes one picture per reading and reuses it", () => {
    const fight = startFight();
    const start = 2000;
    clock = start;
    fight.scene.popup({ tile: fight.enemyTile, kind: "damage", text: "-6" });
    fight.scene.popup({ tile: fight.playerTile, kind: "damage", text: "-6" });
    const drawn = playOut(fight, start, 100);
    expect(drawn.length).toBeGreaterThanOrEqual(2);
    // Two bodies, one figure, one baked canvas between them.
    expect(baked.size).toBe(1);
    fight.scene.destroy();
  });
});
