/**
 * Combat arena scene: renders an arena map with combatant entities, HP
 * bars, tile highlights (reachable / targets / path preview), walk
 * tweens, hit flashes, and floating combat numbers. Presentation only —
 * the combat screen feeds it authoritative state and interprets clicks;
 * this layer never imports the combat engine.
 */
import { clampCamera, mapPixelBounds, type Camera } from "./camera";
import {
  TILE_H,
  TILE_W,
  sameTile,
  screenToTile,
  worldToScreen,
  type TilePoint,
  type WorldPoint,
} from "./coords";
import { compareDrawables, type Drawable } from "./depth";
import {
  createPlaceholderSprites,
  type EntitySpriteId,
  type Sprite,
  type SpriteProvider,
} from "./sprites";
import type { IsoMap } from "./tilemap";

/** Authoritative view of one combatant, pushed by the combat screen. */
export interface CombatSceneEntity {
  id: string;
  spriteId: EntitySpriteId;
  /** Logical tile; the scene walks the sprite toward it when it changes. */
  position: TilePoint;
  hp: number;
  maxHp: number;
  alive: boolean;
  /** Marks whose turn it is (drawn as a ring under the sprite). */
  active: boolean;
}

export interface CombatHighlights {
  /** Tiles the active combatant may move to (soft fill). */
  reachable: readonly TilePoint[];
  /** Tiles under targetable combatants (hostile outline). */
  targets: readonly TilePoint[];
  /** Path preview for the hovered move (bright fill). */
  path: readonly TilePoint[];
  hover: TilePoint | null;
}

export interface CombatSceneOptions {
  map: IsoMap;
  onTileClick(tile: TilePoint): void;
  onTileHover(tile: TilePoint | null): void;
  sprites?: SpriteProvider;
}

export interface CombatScene {
  /** Replace the entity view; changed positions animate as walks. */
  setEntities(entities: readonly CombatSceneEntity[]): void;
  setHighlights(highlights: Partial<CombatHighlights>): void;
  /** Brief bright ring on an entity (attack landing, ability hit). */
  flashEntity(id: string): void;
  /** Floating rise-and-fade text over a tile (damage, MISS, heals). */
  floatText(tile: TilePoint, text: string, color?: string): void;
  destroy(): void;
}

/** Tiles per second entities walk between logical positions. */
const WALK_SPEED = 6;
const FLASH_MS = 350;
const FLOAT_MS = 900;
const FLOAT_RISE_PX = 28;

interface EntityView extends CombatSceneEntity {
  /** Where the sprite is drawn right now (trails position while walking). */
  visual: WorldPoint;
  /** Tiles still to walk; [0] is the tile being entered. */
  queue: TilePoint[];
  progress: number;
}

interface FloatingText {
  text: string;
  color: string;
  sx: number;
  sy: number;
  bornAt: number;
}

/** Axis-by-axis steps from one tile to the next (dominant axis first). */
function stepQueue(from: TilePoint, to: TilePoint): TilePoint[] {
  const steps: TilePoint[] = [];
  let { x, y } = from;
  const walkX = (): void => {
    while (x !== to.x) {
      x += Math.sign(to.x - x);
      steps.push({ x, y });
    }
  };
  const walkY = (): void => {
    while (y !== to.y) {
      y += Math.sign(to.y - y);
      steps.push({ x, y });
    }
  };
  if (Math.abs(to.y - from.y) > Math.abs(to.x - from.x)) {
    walkY();
    walkX();
  } else {
    walkX();
    walkY();
  }
  return steps;
}

export function createCombatScene(
  canvas: HTMLCanvasElement,
  options: CombatSceneOptions,
): CombatScene {
  const { map } = options;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2d context for combat canvas");
  const sprites = options.sprites ?? createPlaceholderSprites();
  const bounds = mapPixelBounds(map);

  const entities = new Map<string, EntityView>();
  const flashes = new Map<string, number>();
  const floats: FloatingText[] = [];
  let highlights: CombatHighlights = {
    reachable: [],
    targets: [],
    path: [],
    hover: null,
  };

  let viewportW = 0;
  let viewportH = 0;
  // Fixed camera on the arena center; arenas are small enough to fit.
  let camera: Camera = {
    sx: (bounds.minX + bounds.maxX) / 2,
    sy: (bounds.minY + bounds.maxY) / 2,
  };

  function resize(): void {
    const dpr = window.devicePixelRatio || 1;
    viewportW = canvas.clientWidth;
    viewportH = canvas.clientHeight;
    canvas.width = Math.round(viewportW * dpr);
    canvas.height = Math.round(viewportH * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    camera = clampCamera(camera, bounds, viewportW, viewportH);
  }

  function pickTile(event: PointerEvent): TilePoint {
    const rect = canvas.getBoundingClientRect();
    const cssX = event.clientX - rect.left;
    const cssY = event.clientY - rect.top;
    return screenToTile(
      cssX - viewportW / 2 + camera.sx,
      cssY - viewportH / 2 + camera.sy,
    );
  }

  function onPointerUp(event: PointerEvent): void {
    if (event.button !== 0) return;
    options.onTileClick(pickTile(event));
  }

  function onPointerMove(event: PointerEvent): void {
    options.onTileHover(pickTile(event));
  }

  function onPointerLeave(): void {
    options.onTileHover(null);
  }

  function stepEntities(dt: number): void {
    for (const entity of entities.values()) {
      if (entity.queue.length === 0) continue;
      entity.progress += WALK_SPEED * dt;
      while (entity.progress >= 1 && entity.queue.length > 0) {
        entity.progress -= 1;
        const reached = entity.queue.shift();
        if (reached) entity.visual = { ...reached };
      }
      const next = entity.queue[0];
      if (next) {
        const fromX = Math.round(entity.visual.x);
        const fromY = Math.round(entity.visual.y);
        entity.visual = {
          x: fromX + (next.x - fromX) * entity.progress,
          y: fromY + (next.y - fromY) * entity.progress,
        };
      } else {
        entity.visual = { ...entity.position };
        entity.progress = 0;
      }
    }
  }

  function drawDiamond(
    tile: TilePoint,
    fill: string | null,
    stroke: string | null,
  ): void {
    const { sx, sy } = worldToScreen(tile.x, tile.y);
    ctx!.beginPath();
    ctx!.moveTo(sx, sy - TILE_H / 2);
    ctx!.lineTo(sx + TILE_W / 2, sy);
    ctx!.lineTo(sx, sy + TILE_H / 2);
    ctx!.lineTo(sx - TILE_W / 2, sy);
    ctx!.closePath();
    if (fill) {
      ctx!.fillStyle = fill;
      ctx!.fill();
    }
    if (stroke) {
      ctx!.strokeStyle = stroke;
      ctx!.lineWidth = 1.5;
      ctx!.stroke();
    }
  }

  function drawSprite(sprite: Sprite, x: number, y: number): void {
    const { sx, sy } = worldToScreen(x, y);
    ctx!.drawImage(
      sprite.image,
      Math.round(sx - sprite.anchorX),
      Math.round(sy - sprite.anchorY),
    );
  }

  function drawHpBar(entity: EntityView): void {
    const { sx, sy } = worldToScreen(entity.visual.x, entity.visual.y);
    const width = 34;
    const height = 5;
    const x = sx - width / 2;
    const y = sy - 46;
    const ratio = Math.max(0, Math.min(1, entity.hp / entity.maxHp));
    ctx!.fillStyle = "rgba(10, 10, 18, 0.85)";
    ctx!.fillRect(x, y, width, height);
    ctx!.fillStyle = ratio > 0.5 ? "#2ee6d6" : ratio > 0.25 ? "#f0b429" : "#ff4d5e";
    ctx!.fillRect(x + 1, y + 1, (width - 2) * ratio, height - 2);
    ctx!.strokeStyle = "#2a2a44";
    ctx!.lineWidth = 1;
    ctx!.strokeRect(x, y, width, height);
  }

  function render(now: number): void {
    ctx!.clearRect(0, 0, viewportW, viewportH);
    ctx!.save();
    ctx!.translate(
      Math.round(viewportW / 2 - camera.sx),
      Math.round(viewportH / 2 - camera.sy),
    );

    // Ground pass.
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tileId = map.tiles[y]?.[x];
        if (tileId === undefined) continue;
        drawSprite(sprites.tile(tileId), x, y);
      }
    }

    // Highlights sit on the ground under everything.
    for (const tile of highlights.reachable) {
      drawDiamond(tile, "rgba(46, 230, 214, 0.14)", "rgba(46, 230, 214, 0.35)");
    }
    for (const tile of highlights.path) {
      drawDiamond(tile, "rgba(46, 230, 214, 0.35)", null);
    }
    for (const tile of highlights.targets) {
      drawDiamond(tile, "rgba(230, 62, 143, 0.18)", "rgba(230, 62, 143, 0.9)");
    }
    if (highlights.hover) {
      drawDiamond(highlights.hover, null, "rgba(232, 230, 240, 0.6)");
    }
    for (const entity of entities.values()) {
      if (entity.alive && entity.active) {
        drawDiamond(entity.position, null, "rgba(46, 230, 214, 0.9)");
      }
    }

    // Object pass: living entities, depth sorted.
    const drawables: Array<Drawable & { entity: EntityView }> = [];
    for (const entity of entities.values()) {
      if (!entity.alive) continue;
      drawables.push({
        x: entity.visual.x,
        y: entity.visual.y,
        layer: "object",
        entity,
      });
    }
    drawables.sort(compareDrawables);
    for (const d of drawables) {
      drawSprite(sprites.entity(d.entity.spriteId), d.x, d.y);
      const flashUntil = flashes.get(d.entity.id);
      if (flashUntil !== undefined) {
        if (now < flashUntil) {
          drawDiamond(
            { x: Math.round(d.x), y: Math.round(d.y) },
            "rgba(255, 255, 255, 0.25)",
            "rgba(255, 77, 94, 0.9)",
          );
        } else {
          flashes.delete(d.entity.id);
        }
      }
      drawHpBar(d.entity);
    }

    // Floating combat text, newest on top.
    for (let i = floats.length - 1; i >= 0; i--) {
      const float = floats[i];
      if (!float) continue;
      const age = now - float.bornAt;
      if (age > FLOAT_MS) {
        floats.splice(i, 1);
        continue;
      }
      const t = age / FLOAT_MS;
      ctx!.globalAlpha = 1 - t * t;
      ctx!.fillStyle = float.color;
      ctx!.font = "bold 14px monospace";
      ctx!.textAlign = "center";
      ctx!.fillText(float.text, float.sx, float.sy - 40 - t * FLOAT_RISE_PX);
      ctx!.globalAlpha = 1;
    }

    ctx!.restore();
  }

  let rafId = 0;
  let lastTime: number | null = null;
  function frame(time: number): void {
    const dt = lastTime === null ? 0 : Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;
    stepEntities(dt);
    render(time);
    rafId = requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener("resize", resize);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);
  rafId = requestAnimationFrame(frame);

  return {
    setEntities(next: readonly CombatSceneEntity[]): void {
      const seen = new Set<string>();
      for (const incoming of next) {
        seen.add(incoming.id);
        const existing = entities.get(incoming.id);
        if (!existing) {
          entities.set(incoming.id, {
            ...incoming,
            visual: { ...incoming.position },
            queue: [],
            progress: 0,
          });
          continue;
        }
        const moved = !sameTile(existing.position, incoming.position);
        Object.assign(existing, incoming);
        if (moved) {
          const fromTile = {
            x: Math.round(existing.visual.x),
            y: Math.round(existing.visual.y),
          };
          existing.queue = stepQueue(fromTile, incoming.position);
          existing.progress = 0;
        }
      }
      for (const id of entities.keys()) {
        if (!seen.has(id)) entities.delete(id);
      }
    },

    setHighlights(next: Partial<CombatHighlights>): void {
      highlights = { ...highlights, ...next };
    },

    flashEntity(id: string): void {
      flashes.set(id, performance.now() + FLASH_MS);
    },

    floatText(tile: TilePoint, text: string, color = "#e8e6f0"): void {
      const { sx, sy } = worldToScreen(tile.x, tile.y);
      floats.push({ text, color, sx, sy, bornAt: performance.now() });
    },

    destroy(): void {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      ctx!.clearRect(0, 0, viewportW, viewportH);
    },
  };
}
