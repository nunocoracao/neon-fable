/**
 * Just enough of a 2d canvas to run the real code offline.
 *
 * The sprite bakes (src/iso/art/pixel.ts, glow.ts) and the scene painter
 * (src/iso/render.ts) are written against `CanvasRenderingContext2D`.
 * Rather than reimplement either — a second painter would prove nothing
 * about the first — this backs that interface with a ./framebuffer.ts
 * and lets the shipping code paint into it unchanged. What comes out of
 * a contact sheet is what the game draws, by construction.
 *
 * It is a subset, on purpose, and the boundaries are worth stating:
 *
 * - Transforms are translate and scale only. Those are the only two the
 *   renderer applies, and a rotate would silently be wrong here.
 * - Paths fill by even-odd scanline and stroke as per-segment quads
 *   with no joins or caps. Every path in the renderer is a tile diamond
 *   or a batch of them, where neither shows.
 * - `fillText` draws the repo's own 3×5 pixel font (../iso/art/
 *   popupFont.ts) sized to the requested px, because there are no fonts
 *   out here. A name chip in a contact sheet is therefore legible and
 *   correctly placed but is *not* the typeface a browser would use —
 *   the one thing in a postcard that is a stand-in rather than the
 *   real drawing.
 * - Images draw 1:1. The renderer never resamples (`imageSmoothingEnabled`
 *   is off and every draw is at integer scale), so a scaled `drawImage`
 *   throws rather than quietly inventing a resampler.
 */
import { GLYPH_GAP, GLYPH_H, GLYPH_W, textGrid } from "../iso/art/popupFont";
import {
  blit,
  clearRect as clearFramebufferRect,
  createFramebuffer,
  fillPolygons,
  fillRect as fillFramebufferRect,
  parseColor,
  strokeSegment,
  type BlendMode,
  type Framebuffer,
  type Point,
  type Rgba,
} from "./framebuffer";

interface GradientStop {
  readonly at: number;
  readonly color: Rgba;
}

/**
 * A radial or linear gradient. The glow bake is the one caller: a
 * concentric radial falloff filled over a square.
 */
export class PostcardGradient {
  readonly stops: GradientStop[] = [];

  constructor(
    readonly kind: "radial" | "linear",
    readonly geometry: readonly number[],
  ) {}

  addColorStop(at: number, color: string): void {
    this.stops.push({ at, color: parseColor(color) });
    this.stops.sort((a, b) => a.at - b.at);
  }

  /** The color at a point, in framebuffer space. */
  colorAt(x: number, y: number): Rgba {
    if (this.stops.length === 0) return [0, 0, 0, 0];
    const t = this.kind === "radial" ? this.radialT(x, y) : this.linearT(x, y);
    return this.sample(t);
  }

  private radialT(x: number, y: number): number {
    const [x0 = 0, y0 = 0, r0 = 0, , , r1 = 1] = this.geometry;
    const span = r1 - r0;
    if (span <= 0) return 1;
    return (Math.hypot(x - x0, y - y0) - r0) / span;
  }

  private linearT(x: number, y: number): number {
    const [x0 = 0, y0 = 0, x1 = 1, y1 = 0] = this.geometry;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return 0;
    return ((x - x0) * dx + (y - y0) * dy) / lengthSquared;
  }

  private sample(t: number): Rgba {
    const first = this.stops[0] as GradientStop;
    const last = this.stops[this.stops.length - 1] as GradientStop;
    if (t <= first.at) return first.color;
    if (t >= last.at) return last.color;
    for (let i = 0; i + 1 < this.stops.length; i++) {
      const a = this.stops[i] as GradientStop;
      const b = this.stops[i + 1] as GradientStop;
      if (t < a.at || t > b.at) continue;
      const span = b.at - a.at;
      const k = span === 0 ? 0 : (t - a.at) / span;
      return [
        a.color[0] + (b.color[0] - a.color[0]) * k,
        a.color[1] + (b.color[1] - a.color[1]) * k,
        a.color[2] + (b.color[2] - a.color[2]) * k,
        a.color[3] + (b.color[3] - a.color[3]) * k,
      ];
    }
    return last.color;
  }
}

type PaintStyle = string | PostcardGradient;

interface ContextState {
  fillStyle: PaintStyle;
  strokeStyle: PaintStyle;
  lineWidth: number;
  globalAlpha: number;
  globalCompositeOperation: string;
  lineDash: number[];
  font: string;
  textAlign: string;
  /** Uniform scale, then translation — the only transform used here. */
  scaleX: number;
  scaleY: number;
  translateX: number;
  translateY: number;
}

function initialState(): ContextState {
  return {
    fillStyle: "#000000",
    strokeStyle: "#000000",
    lineWidth: 1,
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    lineDash: [],
    font: "10px monospace",
    textAlign: "start",
    scaleX: 1,
    scaleY: 1,
    translateX: 0,
    translateY: 0,
  };
}

/** Anything this module will accept as a source image. */
interface DrawableImage {
  readonly width: number;
  readonly height: number;
  readonly framebuffer: Framebuffer;
}

function asDrawable(image: unknown): DrawableImage {
  const candidate = image as Partial<DrawableImage>;
  if (
    candidate &&
    typeof candidate.width === "number" &&
    typeof candidate.height === "number" &&
    candidate.framebuffer !== undefined
  ) {
    return candidate as DrawableImage;
  }
  throw new Error("drawImage source is not a postcard canvas");
}

/**
 * The 2d context. Every public member is one a browser context has, so
 * an instance can stand in wherever a `CanvasRenderingContext2D` is
 * asked for (via one cast, at the boundary).
 */
export class PostcardContext {
  private state: ContextState = initialState();
  private readonly stack: ContextState[] = [];
  private path: Point[][] = [];
  private current: Point[] = [];

  /** Accepted and ignored — nothing here resamples in the first place. */
  imageSmoothingEnabled = false;

  constructor(readonly canvas: PostcardCanvas) {}

  private get fb(): Framebuffer {
    return this.canvas.framebuffer;
  }

  private get blend(): BlendMode {
    return this.state.globalCompositeOperation === "lighter"
      ? "lighter"
      : "source-over";
  }

  /** Apply the current transform to a point. */
  private map(x: number, y: number): Point {
    return {
      x: x * this.state.scaleX + this.state.translateX,
      y: y * this.state.scaleY + this.state.translateY,
    };
  }

  get fillStyle(): PaintStyle {
    return this.state.fillStyle;
  }
  set fillStyle(value: PaintStyle) {
    this.state.fillStyle = value;
  }

  get strokeStyle(): PaintStyle {
    return this.state.strokeStyle;
  }
  set strokeStyle(value: PaintStyle) {
    this.state.strokeStyle = value;
  }

  get lineWidth(): number {
    return this.state.lineWidth;
  }
  set lineWidth(value: number) {
    this.state.lineWidth = value;
  }

  get globalAlpha(): number {
    return this.state.globalAlpha;
  }
  set globalAlpha(value: number) {
    this.state.globalAlpha = value;
  }

  get globalCompositeOperation(): string {
    return this.state.globalCompositeOperation;
  }
  set globalCompositeOperation(value: string) {
    this.state.globalCompositeOperation = value;
  }

  get font(): string {
    return this.state.font;
  }
  set font(value: string) {
    this.state.font = value;
  }

  get textAlign(): string {
    return this.state.textAlign;
  }
  set textAlign(value: string) {
    this.state.textAlign = value;
  }

  save(): void {
    this.stack.push({ ...this.state, lineDash: [...this.state.lineDash] });
  }

  restore(): void {
    const previous = this.stack.pop();
    if (previous) this.state = previous;
  }

  translate(x: number, y: number): void {
    this.state.translateX += x * this.state.scaleX;
    this.state.translateY += y * this.state.scaleY;
  }

  scale(x: number, y: number): void {
    this.state.scaleX *= x;
    this.state.scaleY *= y;
  }

  setLineDash(dash: readonly number[]): void {
    this.state.lineDash = [...dash];
  }

  getLineDash(): number[] {
    return [...this.state.lineDash];
  }

  clearRect(x: number, y: number, w: number, h: number): void {
    const at = this.map(x, y);
    clearFramebufferRect(
      this.fb,
      at.x,
      at.y,
      w * this.state.scaleX,
      h * this.state.scaleY,
    );
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    const at = this.map(x, y);
    const width = w * this.state.scaleX;
    const height = h * this.state.scaleY;
    const style = this.state.fillStyle;
    if (style instanceof PostcardGradient) {
      const left = Math.round(at.x);
      const top = Math.round(at.y);
      for (let py = top; py < Math.round(at.y + height); py++) {
        for (let px = left; px < Math.round(at.x + width); px++) {
          // Gradients are authored in untransformed canvas space by the
          // one caller that makes them (the glow bake, which paints at
          // the identity transform), so sampling in framebuffer space
          // is the same point.
          fillFramebufferRect(
            this.fb,
            px,
            py,
            1,
            1,
            style.colorAt(px + 0.5, py + 0.5),
            this.state.globalAlpha,
            this.blend,
          );
        }
      }
      return;
    }
    fillFramebufferRect(
      this.fb,
      at.x,
      at.y,
      width,
      height,
      parseColor(style),
      this.state.globalAlpha,
      this.blend,
    );
  }

  strokeRect(x: number, y: number, w: number, h: number): void {
    const a = this.map(x, y);
    const b = this.map(x + w, y + h);
    const corners: Point[] = [
      a,
      { x: b.x, y: a.y },
      b,
      { x: a.x, y: b.y },
    ];
    for (let i = 0; i < corners.length; i++) {
      this.strokeLine(
        corners[i] as Point,
        corners[(i + 1) % corners.length] as Point,
      );
    }
  }

  beginPath(): void {
    this.path = [];
    this.current = [];
  }

  moveTo(x: number, y: number): void {
    if (this.current.length > 0) this.path.push(this.current);
    this.current = [this.map(x, y)];
  }

  lineTo(x: number, y: number): void {
    this.current.push(this.map(x, y));
  }

  closePath(): void {
    if (this.current.length > 0) {
      this.path.push(this.current);
      this.current = [];
    }
  }

  private subpaths(): Point[][] {
    return this.current.length > 0 ? [...this.path, this.current] : this.path;
  }

  fill(): void {
    const style = this.state.fillStyle;
    if (style instanceof PostcardGradient) return;
    fillPolygons(
      this.fb,
      this.subpaths(),
      parseColor(style),
      this.state.globalAlpha,
      this.blend,
    );
  }

  stroke(): void {
    for (const poly of this.subpaths()) {
      for (let i = 0; i + 1 < poly.length; i++) {
        this.strokeLine(poly[i] as Point, poly[i + 1] as Point);
      }
      // A subpath that was explicitly closed comes back round; the
      // renderer's diamonds all are.
      if (poly.length > 2) {
        this.strokeLine(poly[poly.length - 1] as Point, poly[0] as Point);
      }
    }
  }

  private strokeLine(a: Point, b: Point): void {
    const style = this.state.strokeStyle;
    if (style instanceof PostcardGradient) return;
    const color = parseColor(style);
    const width = this.state.lineWidth * this.state.scaleX;
    const dash = this.state.lineDash;
    if (dash.length === 0) {
      strokeSegment(this.fb, a, b, width, color, this.state.globalAlpha);
      return;
    }
    const total = dash.reduce((sum, n) => sum + n, 0);
    if (total <= 0) {
      strokeSegment(this.fb, a, b, width, color, this.state.globalAlpha);
      return;
    }
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    let at = 0;
    let index = 0;
    while (at < length) {
      const run = dash[index % dash.length] ?? 0;
      const end = Math.min(length, at + run);
      if (index % 2 === 0 && end > at) {
        const lerp = (t: number): Point => ({
          x: a.x + ((b.x - a.x) * t) / length,
          y: a.y + ((b.y - a.y) * t) / length,
        });
        strokeSegment(
          this.fb,
          lerp(at),
          lerp(end),
          width,
          color,
          this.state.globalAlpha,
        );
      }
      at = end;
      index++;
    }
  }

  drawImage(image: unknown, ...args: number[]): void {
    const source = asDrawable(image);
    if (args.length === 2) {
      const at = this.map(args[0] ?? 0, args[1] ?? 0);
      blit(
        this.fb,
        source.framebuffer,
        at.x,
        at.y,
        0,
        0,
        source.width,
        source.height,
        this.state.globalAlpha,
        this.blend,
      );
      return;
    }
    if (args.length === 8) {
      const [sx = 0, sy = 0, sw = 0, sh = 0, dx = 0, dy = 0, dw = 0, dh = 0] =
        args;
      if (dw !== sw || dh !== sh) {
        throw new Error("postcard drawImage does not resample");
      }
      const at = this.map(dx, dy);
      blit(
        this.fb,
        source.framebuffer,
        at.x,
        at.y,
        sx,
        sy,
        sw,
        sh,
        this.state.globalAlpha,
        this.blend,
      );
      return;
    }
    throw new Error(`unsupported drawImage arity ${args.length}`);
  }

  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number,
  ): PostcardGradient {
    return new PostcardGradient("radial", [x0, y0, r0, x1, y1, r1]);
  }

  createLinearGradient(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): PostcardGradient {
    return new PostcardGradient("linear", [x0, y0, x1, y1]);
  }

  /** Pixel-font scale for the current `font` size, at least 1. */
  private fontScale(): number {
    const match = /(\d+(?:\.\d+)?)px/.exec(this.state.font);
    const px = match ? Number(match[1]) : 10;
    return Math.max(1, Math.round(px / GLYPH_H));
  }

  measureText(text: string): { width: number } {
    const scale = this.fontScale();
    const glyphs = text.length;
    const width =
      glyphs === 0 ? 0 : (glyphs * (GLYPH_W + GLYPH_GAP) - GLYPH_GAP) * scale;
    return { width: width * this.state.scaleX };
  }

  fillText(text: string, x: number, y: number): void {
    const style = this.state.fillStyle;
    if (style instanceof PostcardGradient) return;
    const scale = this.fontScale();
    const grid = textGrid(text.toUpperCase());
    const width = (grid[0]?.length ?? 0) * scale;
    const left =
      this.state.textAlign === "center"
        ? x - width / (2 * this.state.scaleX)
        : this.state.textAlign === "right"
          ? x - width / this.state.scaleX
          : x;
    const at = this.map(left, y);
    // Canvas text sits on a baseline; the pixel font is drawn from its
    // top, so lift it by its own height to land in the same place.
    drawText(this.fb, text, at.x, at.y - GLYPH_H * scale, scale, style);
  }
}

/**
 * Paint a line of text in the repo's pixel font, in a flat color.
 * Exported because the sheet layout labels its cells with it — the same
 * glyphs a damage number is made of, so a contact sheet is drawn
 * entirely out of this project's own art.
 */
export function drawText(
  fb: Framebuffer,
  text: string,
  x: number,
  y: number,
  scale: number,
  color: string,
): void {
  const grid = textGrid(text.toUpperCase());
  if (grid.length === 0) return;
  const rgba = parseColor(color);
  grid.forEach((row, gy) => {
    for (let gx = 0; gx < row.length; gx++) {
      if (row[gx] === ".") continue;
      fillFramebufferRect(fb, x + gx * scale, y + gy * scale, scale, scale, rgba);
    }
  });
}

/** Width in pixels `drawText` will cover. */
export function textWidth(text: string, scale: number): number {
  return text.length === 0
    ? 0
    : (text.length * (GLYPH_W + GLYPH_GAP) - GLYPH_GAP) * scale;
}

/** Height in pixels `drawText` will cover. */
export function textHeight(scale: number): number {
  return GLYPH_H * scale;
}

/**
 * A canvas-shaped object over a framebuffer. Resizing reallocates and
 * clears, exactly like the real thing — the sprite bakes rely on that.
 */
export class PostcardCanvas {
  private _width = 0;
  private _height = 0;
  private _fb: Framebuffer = createFramebuffer(0, 0);
  private _ctx: PostcardContext | null = null;

  get width(): number {
    return this._width;
  }
  set width(value: number) {
    this._width = Math.max(0, Math.trunc(value));
    this._fb = createFramebuffer(this._width, this._height);
  }

  get height(): number {
    return this._height;
  }
  set height(value: number) {
    this._height = Math.max(0, Math.trunc(value));
    this._fb = createFramebuffer(this._width, this._height);
  }

  get framebuffer(): Framebuffer {
    return this._fb;
  }

  getContext(kind: string): PostcardContext | null {
    if (kind !== "2d") return null;
    if (!this._ctx) this._ctx = new PostcardContext(this);
    return this._ctx;
  }
}

/** A canvas of a fixed size, already allocated. */
export function createCanvas(width: number, height: number): PostcardCanvas {
  const canvas = new PostcardCanvas();
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * Give the module graph a `document` whose `createElement("canvas")`
 * hands back one of these. The sprite bakes call that directly, so this
 * is what lets the shipping bake path run in Node at all. Returns a
 * function that puts back whatever was there before.
 */
export function installCanvasShim(): () => void {
  const host = globalThis as { document?: unknown };
  const previous = host.document;
  host.document = {
    createElement(tag: string): unknown {
      if (tag !== "canvas") {
        throw new Error(`postcards only make canvases, not <${tag}>`);
      }
      return new PostcardCanvas();
    },
  };
  return () => {
    host.document = previous;
  };
}

/** The framebuffer a canvas-shaped value is backed by. */
export function framebufferOf(canvas: unknown): Framebuffer {
  return asDrawable(canvas).framebuffer;
}

/** Convenience: the drawing surface of a fresh canvas plus its context. */
export function createSurface(
  width: number,
  height: number,
): { canvas: PostcardCanvas; ctx: PostcardContext; fb: Framebuffer } {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("postcard canvas refused a 2d context");
  return { canvas, ctx, fb: canvas.framebuffer };
}
