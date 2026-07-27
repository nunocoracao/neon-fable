/**
 * Painter's-order depth sorting for the isometric scene. Anything drawn
 * on the map — tiles, props, entities — sorts by how "near" it is to the
 * viewer; nearer drawables paint later and overlap farther ones.
 */

/** Ground tiles paint under objects that share the same tile. */
export type DrawLayer = "ground" | "object";

/** Minimal shape the sorter needs; positions may be fractional. */
export interface Drawable {
  x: number;
  y: number;
  layer: DrawLayer;
}

const LAYER_ORDER: Record<DrawLayer, number> = { ground: 0, object: 1 };

/** Depth key: larger paints later (closer to the viewer). */
export function depthOf(d: Drawable): number {
  return d.x + d.y;
}

/**
 * Comparator for painter's order: far-to-near by x+y, ground under
 * objects on ties, then y and x for a deterministic total order.
 */
export function compareDrawables(a: Drawable, b: Drawable): number {
  const depth = depthOf(a) - depthOf(b);
  if (depth !== 0) return depth;
  const layer = LAYER_ORDER[a.layer] - LAYER_ORDER[b.layer];
  if (layer !== 0) return layer;
  if (a.y !== b.y) return a.y - b.y;
  return a.x - b.x;
}

/** Returns a new array sorted into painter's order. */
export function sortDrawables<T extends Drawable>(drawables: readonly T[]): T[] {
  return [...drawables].sort(compareDrawables);
}
