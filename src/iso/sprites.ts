/**
 * Placeholder sprite art, drawn procedurally to offscreen canvases in a
 * neon-dark palette. Everything renders through the SpriteProvider
 * interface so real art can replace this module without touching the
 * renderer or scene.
 */
import { TILE_H, TILE_W } from "./coords";
import type { InteractableSpriteId, PropId, TileId } from "./tilemap";

export type EntitySpriteId = "player";

/**
 * A drawable image plus its anchor: the pixel inside the image that
 * should land on the center of the tile diamond it occupies.
 */
export interface Sprite {
  image: CanvasImageSource;
  anchorX: number;
  anchorY: number;
}

export interface SpriteProvider {
  tile(id: TileId): Sprite;
  prop(id: PropId): Sprite;
  interactable(id: InteractableSpriteId): Sprite;
  entity(id: EntitySpriteId): Sprite;
}

const PALETTE = {
  inkDeep: "#0a0a12",
  slab: "#181826",
  slabLight: "#20202f",
  slabDark: "#121220",
  rust: "#2b2118",
  rustEdge: "#4a3826",
  canal: "#0c1626",
  canalGlow: "#1b3a55",
  edge: "#2a2a44",
  cyan: "#2ee6d6",
  magenta: "#e63e8f",
  amber: "#f0b429",
  ink: "#e8e6f0",
} as const;

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create 2d context for sprite");
  return [canvas, ctx];
}

/** Trace the tile diamond centered at (cx, cy) into the current path. */
function diamondPath(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - TILE_H / 2);
  ctx.lineTo(cx + TILE_W / 2, cy);
  ctx.lineTo(cx, cy + TILE_H / 2);
  ctx.lineTo(cx - TILE_W / 2, cy);
  ctx.closePath();
}

function flatTile(fill: string, edge: string, detail?: (ctx: CanvasRenderingContext2D) => void): Sprite {
  const [canvas, ctx] = makeCanvas(TILE_W, TILE_H);
  const cx = TILE_W / 2;
  const cy = TILE_H / 2;
  diamondPath(ctx, cx, cy);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1;
  ctx.stroke();
  if (detail) {
    ctx.save();
    diamondPath(ctx, cx, cy);
    ctx.clip();
    detail(ctx);
    ctx.restore();
  }
  return { image: canvas, anchorX: cx, anchorY: cy };
}

function makeTileSprite(id: TileId): Sprite {
  switch (id) {
    case "pavement":
      return flatTile(PALETTE.slab, PALETTE.edge);
    case "pavement-cracked":
      return flatTile(PALETTE.slab, PALETTE.edge, (ctx) => {
        ctx.strokeStyle = PALETTE.slabDark;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(20, 10);
        ctx.lineTo(30, 16);
        ctx.lineTo(26, 22);
        ctx.moveTo(40, 8);
        ctx.lineTo(46, 14);
        ctx.stroke();
      });
    case "plaza-glow":
      return flatTile(PALETTE.slabLight, PALETTE.cyan, (ctx) => {
        ctx.strokeStyle = "rgba(46, 230, 214, 0.35)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(TILE_W / 2, 4);
        ctx.lineTo(TILE_W - 8, TILE_H / 2);
        ctx.lineTo(TILE_W / 2, TILE_H - 4);
        ctx.lineTo(8, TILE_H / 2);
        ctx.closePath();
        ctx.stroke();
      });
    case "road":
      return flatTile(PALETTE.slabDark, PALETTE.edge, (ctx) => {
        ctx.strokeStyle = "rgba(240, 180, 41, 0.4)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(8, TILE_H / 2);
        ctx.lineTo(TILE_W - 8, TILE_H / 2);
        ctx.stroke();
      });
    case "canal": {
      return flatTile(PALETTE.canal, PALETTE.canalGlow, (ctx) => {
        ctx.strokeStyle = "rgba(46, 230, 214, 0.18)";
        ctx.lineWidth = 1;
        for (const yy of [10, 16, 22]) {
          ctx.beginPath();
          ctx.moveTo(12, yy);
          ctx.bezierCurveTo(24, yy - 3, 40, yy + 3, 52, yy);
          ctx.stroke();
        }
      });
    }
    case "foundation":
      return flatTile(PALETTE.inkDeep, PALETTE.edge);
    case "rust-floor":
      return flatTile(PALETTE.rust, PALETTE.rustEdge, (ctx) => {
        ctx.fillStyle = "rgba(74, 56, 38, 0.5)";
        ctx.fillRect(18, 8, 6, 3);
        ctx.fillRect(38, 18, 8, 3);
      });
  }
}

/**
 * A raised block: a diamond top face at the given height with two shaded
 * side faces down to the ground diamond. Base of the block sits on a
 * tile; anchor is the ground diamond center.
 */
function block(
  height: number,
  topFill: string,
  leftFill: string,
  rightFill: string,
  glow?: (ctx: CanvasRenderingContext2D, cx: number, topCy: number) => void,
): Sprite {
  const [canvas, ctx] = makeCanvas(TILE_W, TILE_H + height);
  const cx = TILE_W / 2;
  const groundCy = height + TILE_H / 2;
  const topCy = TILE_H / 2;

  // Left face
  ctx.fillStyle = leftFill;
  ctx.beginPath();
  ctx.moveTo(cx - TILE_W / 2, topCy);
  ctx.lineTo(cx, topCy + TILE_H / 2);
  ctx.lineTo(cx, groundCy + TILE_H / 2);
  ctx.lineTo(cx - TILE_W / 2, groundCy);
  ctx.closePath();
  ctx.fill();

  // Right face
  ctx.fillStyle = rightFill;
  ctx.beginPath();
  ctx.moveTo(cx + TILE_W / 2, topCy);
  ctx.lineTo(cx, topCy + TILE_H / 2);
  ctx.lineTo(cx, groundCy + TILE_H / 2);
  ctx.lineTo(cx + TILE_W / 2, groundCy);
  ctx.closePath();
  ctx.fill();

  // Top face
  diamondPath(ctx, cx, topCy);
  ctx.fillStyle = topFill;
  ctx.fill();
  ctx.strokeStyle = PALETTE.edge;
  ctx.lineWidth = 1;
  ctx.stroke();

  glow?.(ctx, cx, topCy);
  return { image: canvas, anchorX: cx, anchorY: groundCy };
}

function makePropSprite(id: PropId): Sprite {
  switch (id) {
    case "building":
      return block(72, "#1c1c30", "#141422", "#191928", (ctx, cx) => {
        // Scattered lit windows
        ctx.fillStyle = "rgba(46, 230, 214, 0.5)";
        for (const [wx, wy] of [
          [cx - 22, 30],
          [cx - 14, 46],
          [cx - 24, 60],
          [cx + 10, 34],
          [cx + 20, 52],
          [cx + 8, 64],
        ] as const) {
          ctx.fillRect(wx, wy, 4, 5);
        }
      });
    case "vent-stack":
      return block(40, "#232336", "#17172a", "#1d1d30", (ctx, cx, topCy) => {
        ctx.strokeStyle = "rgba(240, 180, 41, 0.4)";
        ctx.lineWidth = 1;
        diamondPath(ctx, cx, topCy);
        ctx.stroke();
      });
    case "crate":
      return block(18, "#33301f", "#221f14", "#2b281a");
    case "barrier": {
      const [canvas, ctx] = makeCanvas(TILE_W, TILE_H + 14);
      const cx = TILE_W / 2;
      const groundCy = 14 + TILE_H / 2;
      ctx.fillStyle = "#3a1f27";
      ctx.beginPath();
      ctx.moveTo(cx - 24, groundCy - 2);
      ctx.lineTo(cx + 24, groundCy - 2);
      ctx.lineTo(cx + 24, groundCy - 14);
      ctx.lineTo(cx - 24, groundCy - 14);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = PALETTE.magenta;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - 24, groundCy - 8);
      ctx.lineTo(cx + 24, groundCy - 8);
      ctx.stroke();
      return { image: canvas, anchorX: cx, anchorY: groundCy };
    }
    case "streetlight": {
      const height = 56;
      const [canvas, ctx] = makeCanvas(TILE_W, TILE_H + height);
      const cx = TILE_W / 2;
      const groundCy = height + TILE_H / 2;
      ctx.strokeStyle = "#2f2f4a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, groundCy);
      ctx.lineTo(cx, groundCy - height + 6);
      ctx.stroke();
      ctx.fillStyle = PALETTE.cyan;
      ctx.beginPath();
      ctx.arc(cx, groundCy - height + 6, 4, 0, Math.PI * 2);
      ctx.fill();
      const halo = ctx.createRadialGradient(cx, groundCy - height + 6, 2, cx, groundCy - height + 6, 14);
      halo.addColorStop(0, "rgba(46, 230, 214, 0.35)");
      halo.addColorStop(1, "rgba(46, 230, 214, 0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, groundCy - height + 6, 14, 0, Math.PI * 2);
      ctx.fill();
      return { image: canvas, anchorX: cx, anchorY: groundCy };
    }
    case "holo-sign": {
      const height = 48;
      const [canvas, ctx] = makeCanvas(TILE_W, TILE_H + height);
      const cx = TILE_W / 2;
      const groundCy = height + TILE_H / 2;
      ctx.strokeStyle = "#2f2f4a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, groundCy);
      ctx.lineTo(cx, groundCy - 20);
      ctx.stroke();
      ctx.fillStyle = "rgba(230, 62, 143, 0.22)";
      ctx.fillRect(cx - 16, groundCy - height, 32, 26);
      ctx.strokeStyle = PALETTE.magenta;
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - 16, groundCy - height, 32, 26);
      ctx.fillStyle = PALETTE.magenta;
      ctx.font = "10px monospace";
      ctx.textAlign = "center";
      ctx.fillText("匚水", cx, groundCy - height + 17);
      return { image: canvas, anchorX: cx, anchorY: groundCy };
    }
  }
}

/** A simple standing figure: legs, torso, head, tinted per role. */
function figure(bodyColor: string, glowColor: string): Sprite {
  const height = 34;
  const [canvas, ctx] = makeCanvas(TILE_W, TILE_H + height);
  const cx = TILE_W / 2;
  const groundCy = height + TILE_H / 2;

  // Ground shadow
  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.beginPath();
  ctx.ellipse(cx, groundCy, 10, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs
  ctx.strokeStyle = bodyColor;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 3, groundCy - 1);
  ctx.lineTo(cx - 2, groundCy - 12);
  ctx.moveTo(cx + 3, groundCy - 1);
  ctx.lineTo(cx + 2, groundCy - 12);
  ctx.stroke();

  // Torso
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.roundRect(cx - 6, groundCy - 26, 12, 15, 3);
  ctx.fill();

  // Head
  ctx.fillStyle = "#d8c9b8";
  ctx.beginPath();
  ctx.arc(cx, groundCy - 30, 4.5, 0, Math.PI * 2);
  ctx.fill();

  // Neon accent (visor / jacket seam)
  ctx.strokeStyle = glowColor;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - 4, groundCy - 31);
  ctx.lineTo(cx + 4, groundCy - 31);
  ctx.stroke();

  return { image: canvas, anchorX: cx, anchorY: groundCy };
}

function makeInteractableSprite(id: InteractableSpriteId): Sprite {
  switch (id) {
    case "npc":
      return figure("#3d3d5c", PALETTE.amber);
    case "door": {
      const height = 44;
      const [canvas, ctx] = makeCanvas(TILE_W, TILE_H + height);
      const cx = TILE_W / 2;
      const groundCy = height + TILE_H / 2;
      ctx.fillStyle = "#15152a";
      ctx.beginPath();
      ctx.moveTo(cx - 16, groundCy - 4);
      ctx.lineTo(cx - 16, groundCy - height + 4);
      ctx.lineTo(cx + 16, groundCy - height + 4);
      ctx.lineTo(cx + 16, groundCy - 4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = PALETTE.cyan;
      ctx.lineWidth = 2;
      ctx.strokeRect(cx - 10, groundCy - height + 10, 20, height - 16);
      ctx.beginPath();
      ctx.moveTo(cx, groundCy - height + 10);
      ctx.lineTo(cx, groundCy - 6);
      ctx.stroke();
      return { image: canvas, anchorX: cx, anchorY: groundCy };
    }
    case "terminal": {
      const height = 26;
      const [canvas, ctx] = makeCanvas(TILE_W, TILE_H + height);
      const cx = TILE_W / 2;
      const groundCy = height + TILE_H / 2;
      ctx.fillStyle = "#20203a";
      ctx.beginPath();
      ctx.roundRect(cx - 9, groundCy - height, 18, height - 4, 2);
      ctx.fill();
      ctx.fillStyle = "rgba(46, 230, 214, 0.8)";
      ctx.fillRect(cx - 6, groundCy - height + 4, 12, 8);
      return { image: canvas, anchorX: cx, anchorY: groundCy };
    }
  }
}

function makeEntitySprite(id: EntitySpriteId): Sprite {
  switch (id) {
    case "player":
      return figure("#1f4f5c", PALETTE.cyan);
  }
}

/** Cached procedural sprites in the placeholder neon-dark style. */
export function createPlaceholderSprites(): SpriteProvider {
  const tiles = new Map<TileId, Sprite>();
  const props = new Map<PropId, Sprite>();
  const interactables = new Map<InteractableSpriteId, Sprite>();
  const entities = new Map<EntitySpriteId, Sprite>();

  const cached = <K,>(cache: Map<K, Sprite>, id: K, make: (id: K) => Sprite): Sprite => {
    let sprite = cache.get(id);
    if (!sprite) {
      sprite = make(id);
      cache.set(id, sprite);
    }
    return sprite;
  };

  return {
    tile: (id) => cached(tiles, id, makeTileSprite),
    prop: (id) => cached(props, id, makePropSprite),
    interactable: (id) => cached(interactables, id, makeInteractableSprite),
    entity: (id) => cached(entities, id, makeEntitySprite),
  };
}
