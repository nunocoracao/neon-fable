// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EntitySpriteId } from "../sprites";
import {
  DAY_PHASES,
  type InteractableSpriteId,
  type PropId,
  type TileId,
} from "../tilemap";
import type { Facing } from "../animation";
import { INTERACTABLE_ART } from "./interactables";
import { ART_SCALE } from "./pixel";
import { PROP_ART } from "./props";
import { skinToneRemap, type ComposedCharacter } from "./layers";
import { createPixelArtSprites, type PixelArtSprites } from "./provider";
import { TILE_ART } from "./tiles";
import { SPLASH_ANCHOR_X, SPLASH_ANCHOR_Y } from "./weather";
import type { SpriteCacheStats } from "./spriteCache";

/**
 * happy-dom has no 2d canvas; a minimal stub context lets bakes run so
 * the cache behavior (not the pixels) is under test.
 */
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () =>
      ({
        fillStyle: "",
        fillRect: () => {},
        createRadialGradient: () => ({ addColorStop: () => {} }),
      }) as unknown as CanvasRenderingContext2D,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

const TILE_IDS = Object.keys(TILE_ART) as TileId[];
const PROP_IDS = Object.keys(PROP_ART) as PropId[];
const INTERACTABLE_IDS = Object.keys(INTERACTABLE_ART) as InteractableSpriteId[];
const ENTITY_IDS: EntitySpriteId[] = ["player", "enemy"];
const FACINGS: Facing[] = ["n", "e", "s", "w"];

/**
 * One frame of the work the scene render loops ask of the provider:
 * every registered tile/prop/interactable over a spread of coordinates
 * (covering variants and phase offsets), plus every entity pose and its
 * hit-flash silhouette.
 */
function renderFrame(sprites: PixelArtSprites, timeMs: number): void {
  for (const id of TILE_IDS) {
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        sprites.tile(id, x, y, timeMs);
      }
    }
  }
  for (const id of PROP_IDS) {
    for (let i = 0; i < 3; i++) sprites.prop(id, i, 7 - i, timeMs);
  }
  for (const id of INTERACTABLE_IDS) {
    for (let i = 0; i < 3; i++) sprites.interactable(id, i, i + 2, timeMs);
  }
  for (const id of ENTITY_IDS) {
    for (const facing of FACINGS) {
      for (const moving of [false, true]) {
        const pose = { facing, moving, timeMs };
        sprites.entity(id, pose);
        sprites.entitySilhouette(id, pose);
      }
    }
  }
}

describe("createPixelArtSprites cache", () => {
  it("performs zero bakes in steady state after one warm-up pass", () => {
    const sprites = createPixelArtSprites();
    // ~12s at 60fps covers every animation loop period (idle 960ms,
    // walk 520ms, tile/prop loops, and the 90ms neon flicker slots).
    for (let t = 0; t <= 12_000; t += 16.7) renderFrame(sprites, t);
    const warm = sprites.cacheStats();
    expect(warm.misses).toBeGreaterThan(0);
    for (let t = 12_000; t <= 24_000; t += 16.7) renderFrame(sprites, t);
    const steady = sprites.cacheStats();
    expect(steady.misses).toBe(warm.misses);
    expect(steady.evictions).toBe(0);
  });

  it("stays far under the byte budget with the full current art set", () => {
    const sprites = createPixelArtSprites();
    for (let t = 0; t <= 12_000; t += 16.7) renderFrame(sprites, t);
    const stats = sprites.cacheStats();
    expect(stats.bytes).toBeGreaterThan(0);
    expect(stats.bytes).toBeLessThan(stats.budgetBytes / 4);
  });

  it("accounts baked canvas bytes exactly", () => {
    const sprites = createPixelArtSprites();
    const tileId = TILE_IDS[0];
    if (!tileId) throw new Error("no tiles registered");
    sprites.tile(tileId, 0, 0, 0);
    // One 64×32 (1x) tile baked at ART_SCALE, RGBA.
    expect(sprites.cacheStats()).toMatchObject({
      entries: 1,
      bytes: 64 * ART_SCALE * 32 * ART_SCALE * 4,
    });
  });

  it("bakes each glow color+radius once and serves it from the cache", () => {
    const sprites = createPixelArtSprites();
    const first = sprites.glow("g", 22);
    expect(sprites.glow("g", 22)).toBe(first);
    expect(sprites.glow("j", 22)).not.toBe(first);
    expect(sprites.glow("g", 18)).not.toBe(first);
    expect(sprites.cacheStats()).toMatchObject({ entries: 3, misses: 3, hits: 1 });
    // Glow canvases are square at ART_SCALE with a centered anchor.
    const size = 22 * 2 * ART_SCALE;
    expect(first.anchorX).toBe(size / 2);
    expect(first.anchorY).toBe(size / 2);
    expect((first.image as HTMLCanvasElement).width).toBe(size);
    expect((first.image as HTMLCanvasElement).height).toBe(size);
  });

  it("swaps in a tile's rain variant only where the ground has one", () => {
    const sprites = createPixelArtSprites();
    const dry = sprites.tile("pavement", 2, 3, 0);
    expect(sprites.tile("pavement", 2, 3, 0, false)).toBe(dry);
    // Wet is a separate bake, cached under its own key.
    const wet = sprites.tile("pavement", 2, 3, 0, true);
    expect(wet).not.toBe(dry);
    expect(sprites.tile("pavement", 2, 3, 0, true)).toBe(wet);
    // Ground with no rain art ignores the flag rather than failing.
    const interior = sprites.tile("bar-floor", 1, 1, 0);
    expect(sprites.tile("bar-floor", 1, 1, 0, true)).toBe(interior);
  });

  it("bakes rain streaks and splash frames once each", () => {
    const sprites = createPixelArtSprites();
    const far = sprites.rainStreak(0);
    expect(sprites.rainStreak(0)).toBe(far);
    expect(sprites.rainStreak(1)).not.toBe(far);
    // Streaks are anchored at their tail: placements are already the
    // sprite's corner.
    expect(far.anchorX).toBe(0);
    expect(far.anchorY).toBe(0);

    const splash = sprites.splash(0);
    expect(sprites.splash(0)).toBe(splash);
    expect(sprites.splash(1)).not.toBe(splash);
    expect(splash.anchorX).toBe(SPLASH_ANCHOR_X * ART_SCALE);
    expect(splash.anchorY).toBe(SPLASH_ANCHOR_Y * ART_SCALE);
  });

  it("refuses glow colors that are not hex palette entries", () => {
    const sprites = createPixelArtSprites();
    expect(() => sprites.glow("?", 10)).toThrow();
    // "z" is the rgba() ground shadow, not a hex entry.
    expect(() => sprites.glow("z", 10)).toThrow();
  });

  it("bakes per composed descriptor: resolved entities get their own key, unresolved share the fallback", () => {
    const rogue: ComposedCharacter = {
      build: "heavy",
      layers: [{ slot: "body", art: "heavy", remap: skinToneRemap(2) }],
    };
    const sprites = createPixelArtSprites({
      entity: (id) => (id === "rogue" ? rogue : undefined),
    });
    const pose = { facing: "e" as const, moving: false, timeMs: 0 };
    const first = sprites.entity("player", pose);
    expect(sprites.entity("player", pose)).toBe(first);
    // A resolved descriptor bakes under its own key...
    expect(sprites.entity("rogue", pose)).not.toBe(first);
    // ...while unresolvable ids degrade to the stock look, sharing the
    // fallback player's bake (keys serialize the descriptor).
    expect(sprites.entity("mystery", pose)).toBe(first);
    expect(sprites.cacheStats()).toMatchObject({ entries: 2, misses: 2, hits: 2 });
    // Composed frames bake at the 32×48 layer frame with its anchor.
    expect((first.image as HTMLCanvasElement).width).toBe(32 * ART_SCALE);
    expect((first.image as HTMLCanvasElement).height).toBe(48 * ART_SCALE);
    expect(first.anchorX).toBe(16 * ART_SCALE);
    expect(first.anchorY).toBe(44 * ART_SCALE);
  });

  it("composes NPC interactables through the injected npc source", () => {
    const vendor: ComposedCharacter = {
      build: "lean",
      layers: [{ slot: "body", art: "lean", remap: skinToneRemap(1) }],
    };
    const sprites = createPixelArtSprites({
      npc: (x, y) => (x === 2 && y === 3 ? vendor : undefined),
    });
    // Composed at the 32×48 layer frame — the legacy 16×24 set is gone.
    const npcSprite = sprites.interactable("npc", 2, 3, 0);
    expect((npcSprite.image as HTMLCanvasElement).width).toBe(32 * ART_SCALE);
    expect((npcSprite.image as HTMLCanvasElement).height).toBe(48 * ART_SCALE);
    expect(npcSprite.anchorY).toBe(44 * ART_SCALE);
    // Positions without an NPC fall back to the stock look, cached.
    const fallback = sprites.interactable("npc", 9, 9, 0);
    expect(fallback).not.toBe(npcSprite);
    expect(sprites.interactable("npc", 9, 9, 0)).toBe(fallback);
  });

  it("rebakes when the injected player descriptor changes", () => {
    let current: ComposedCharacter = {
      build: "lean",
      layers: [{ slot: "body", art: "lean", remap: skinToneRemap(0) }],
    };
    const sprites = createPixelArtSprites({ player: () => current });
    const pose = { facing: "s" as const, moving: false, timeMs: 0 };
    const porcelain = sprites.entity("player", pose);
    expect(sprites.entity("player", pose)).toBe(porcelain);
    current = {
      build: "heavy",
      layers: [{ slot: "body", art: "heavy", remap: skinToneRemap(3) }],
    };
    const umber = sprites.entity("player", pose);
    expect(umber).not.toBe(porcelain);
    expect(sprites.cacheStats()).toMatchObject({ entries: 2, misses: 2, hits: 1 });
  });

  it("bakes composed silhouettes under their own keys", () => {
    const sprites = createPixelArtSprites();
    const pose = { facing: "w" as const, moving: true, timeMs: 500 };
    const sprite = sprites.entity("player", pose);
    const flash = sprites.entitySilhouette("player", pose);
    expect(flash).not.toBe(sprite);
    expect(sprites.entitySilhouette("player", pose)).toBe(flash);
    expect(sprites.cacheStats()).toMatchObject({ entries: 2, misses: 2, hits: 1 });
  });

  it("reaches zero-bake steady state on the composed player path", () => {
    const sprites = createPixelArtSprites();
    const drive = (from: number, to: number): void => {
      for (let t = from; t <= to; t += 16.7) {
        for (const facing of FACINGS) {
          for (const moving of [false, true]) {
            const pose = { facing, moving, timeMs: t };
            sprites.entity("player", pose);
            sprites.entitySilhouette("player", pose);
          }
        }
      }
    };
    drive(0, 4_000);
    const warm = sprites.cacheStats();
    // 4 facings × (4 idle + 6 walk) frames, sprites and silhouettes.
    expect(warm.misses).toBe(2 * 4 * 10);
    drive(4_000, 8_000);
    expect(sprites.cacheStats().misses).toBe(warm.misses);
    expect(sprites.cacheStats().evictions).toBe(0);
  });

  it("keys tinted bakes by day phase, so hours never share a canvas", () => {
    const sprites = createPixelArtSprites();
    const pose = { facing: "s" as const, moving: false, timeMs: 0 };
    const nightTile = sprites.tile("pavement", 1, 1, 0);
    const nightPlayer = sprites.entity("player", pose);
    const warm = sprites.cacheStats();

    sprites.setDayPhase?.("late");
    // Same art, different hour: a fresh bake through the tinted palette.
    expect(sprites.tile("pavement", 1, 1, 0)).not.toBe(nightTile);
    expect(sprites.entity("player", pose)).not.toBe(nightPlayer);
    expect(sprites.cacheStats().misses).toBe(warm.misses + 2);

    // Walking back into the hour already baked costs nothing.
    sprites.setDayPhase?.("night");
    expect(sprites.tile("pavement", 1, 1, 0)).toBe(nightTile);
    expect(sprites.entity("player", pose)).toBe(nightPlayer);
    expect(sprites.cacheStats().misses).toBe(warm.misses + 2);
  });

  it("starts at the phase it was created with", () => {
    const night = createPixelArtSprites();
    const dusk = createPixelArtSprites({ dayPhase: "dusk" });
    night.setDayPhase?.("dusk");
    // Both providers are at dusk now, so both bake the same key: the
    // constructor option and the setter are the same knob.
    dusk.tile("pavement", 4, 2, 0);
    night.tile("pavement", 4, 2, 0);
    expect(night.cacheStats().misses).toBe(1);
    expect(dusk.cacheStats().misses).toBe(1);
  });

  it("leaves phase-free bakes alone when the clock moves", () => {
    const sprites = createPixelArtSprites();
    const pose = { facing: "n" as const, moving: false, timeMs: 0 };
    // Glows are emissive and flashes are one flat color: neither takes
    // a tint, so neither pays for the hour changing.
    const glow = sprites.glow("g", 22);
    const flash = sprites.entitySilhouette("player", pose);
    const warm = sprites.cacheStats();
    sprites.setDayPhase?.("dusk");
    expect(sprites.glow("g", 22)).toBe(glow);
    expect(sprites.entitySilhouette("player", pose)).toBe(flash);
    expect(sprites.cacheStats().misses).toBe(warm.misses);
  });

  it("re-baking every hour stays inside the byte budget", () => {
    const sprites = createPixelArtSprites();
    for (const phase of DAY_PHASES) {
      sprites.setDayPhase?.(phase);
      for (let t = 0; t <= 4_000; t += 16.7) renderFrame(sprites, t);
    }
    const stats = sprites.cacheStats();
    expect(stats.evictions).toBe(0);
    expect(stats.bytes).toBeLessThan(stats.budgetBytes);
  });

  it("exposes live stats through the window dev hook", () => {
    const sprites = createPixelArtSprites();
    sprites.entity("player", { facing: "s", moving: false, timeMs: 0 });
    const hook = (
      window as unknown as { __spriteCacheStats?: () => SpriteCacheStats[] }
    ).__spriteCacheStats;
    expect(hook).toBeTypeOf("function");
    const all = hook?.() ?? [];
    expect(all).toContainEqual(sprites.cacheStats());
  });
});
