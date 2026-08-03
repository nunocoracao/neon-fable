/**
 * Hand-authored lattices, for tests that need to know exactly what is
 * on the grid. Generation is seeded and therefore fine to assert
 * *properties* of; a rule ("three fragments in a row refund two") is
 * only worth asserting against a grid somebody wrote on purpose.
 *
 * One character per node, row-major:
 *
 * ```
 *   E  the entry        C  the core        #  dead ground
 *   a b c d             live nodes carrying fragment 0..3
 *   A B C D             the same, as trace nodes  (C is the core, so a
 *                       trace on fragment 2 is written "Z" — see below)
 * ```
 *
 * "C" is spoken for by the core, so the trace variants are written with
 * the four letters `WXYZ` instead: W/X/Y/Z carry fragments 0..3.
 */
import {
  cheapestRouteCost,
  nodeId,
  neighbours,
  stepCostOf,
  FRAGMENT_TYPES,
  type BreachLattice,
  type BreachNode,
  type BreachNodeKind,
  type FragmentType,
} from "./breach";

const DATA_CHARS = "abcd";
const TRACE_CHARS = "WXYZ";

export interface LatticeFromOptions {
  /** Budget a trace node bills on top of the move; default 2. */
  traceCost?: number;
  /** Yield every live node carries; default 1. */
  value?: number;
}

/** Builds a lattice from character rows; throws on an unknown character. */
export function latticeFrom(
  rows: readonly string[],
  options: LatticeFromOptions = {},
): BreachLattice {
  const traceCost = options.traceCost ?? 2;
  const value = options.value ?? 1;
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const nodes: BreachNode[] = [];
  let entryId: string | null = null;
  let coreId: string | null = null;

  rows.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(`Lattice row ${y} has length ${row.length}, expected ${width}`);
    }
    for (let x = 0; x < width; x++) {
      const ch = row[x]!;
      const id = nodeId(x, y);
      const dataIndex = DATA_CHARS.indexOf(ch);
      const traceIndex = TRACE_CHARS.indexOf(ch);
      let kind: BreachNodeKind;
      let fragment: FragmentType | null = null;
      if (ch === "E") {
        kind = "entry";
        entryId = id;
      } else if (ch === "C") {
        kind = "core";
        coreId = id;
      } else if (ch === "#") {
        kind = "dead";
      } else if (dataIndex >= 0) {
        kind = "data";
        fragment = FRAGMENT_TYPES[dataIndex]!;
      } else if (traceIndex >= 0) {
        kind = "trace";
        fragment = FRAGMENT_TYPES[traceIndex]!;
      } else {
        throw new Error(`Lattice character "${ch}" at (${x}, ${y}) is unknown`);
      }
      nodes.push({
        id,
        x,
        y,
        kind,
        fragment,
        value: fragment === null ? 0 : value,
        traceCost: kind === "trace" ? traceCost : 0,
      });
    }
  });

  if (entryId === null) throw new Error("Lattice has no entry node");
  if (coreId === null) throw new Error("Lattice has no core node");
  return {
    width,
    height,
    nodes,
    entryId,
    coreId,
    minCost: cheapestRouteCost(nodes, width, height, entryId, coreId),
  };
}

/**
 * The cheapest route through a lattice, entry excluded — the hops a
 * solver would play. Used by the content lint to prove every placed
 * terminal is beatable at the worst stat line the game can produce:
 * generation guarantees a route exists, and this walks it.
 *
 * Dijkstra with a parent map, over the same step costs the game
 * charges. Returns [] when the core is unreachable, which generation
 * makes impossible and the lint asserts anyway.
 */
export function solveRoute(lattice: BreachLattice): string[] {
  const best = new Map<string, number>([[lattice.entryId, 0]]);
  const parent = new Map<string, string>();
  const settled = new Set<string>();
  for (;;) {
    let current: string | null = null;
    let currentCost = Infinity;
    for (const [id, cost] of best) {
      if (settled.has(id) || cost >= currentCost) continue;
      current = id;
      currentCost = cost;
    }
    if (current === null) return [];
    if (current === lattice.coreId) break;
    settled.add(current);
    for (const next of neighbours(lattice, current)) {
      if (next.kind === "dead") continue;
      const cost = currentCost + stepCostOf(next);
      if (cost >= (best.get(next.id) ?? Infinity)) continue;
      best.set(next.id, cost);
      parent.set(next.id, current);
    }
  }
  const route: string[] = [];
  let cursor: string | undefined = lattice.coreId;
  while (cursor !== undefined && cursor !== lattice.entryId) {
    route.unshift(cursor);
    cursor = parent.get(cursor);
  }
  return route;
}
