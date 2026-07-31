/**
 * Breach — tracing a signal path through a corrupted node lattice.
 *
 * The whole game, as pure logic. A lattice is generated from a seed and
 * a difficulty spec; the player routes a path from the entry node to the
 * core inside a move budget, chaining matching signal fragments for
 * refunds and avoiding trace nodes that eat the budget. Nothing here
 * touches GameState, the DOM, or a clock — the join with the run (which
 * stats you bring, what a win pays out) lives in ./runner.ts, and the
 * contexts a terminal offers are content in src/data/breach.ts.
 *
 * ## The rules, in one place
 *
 * - A step goes to an orthogonally adjacent node that is not already on
 *   the path and is not dead ground. It costs `1 + traceCost`, and it is
 *   illegal when the budget cannot pay for it — the budget never goes
 *   negative and is never spent on a move that did not happen.
 * - Budget is otherwise **monotone**: `undo` retracts the last step and
 *   refunds nothing. A reroute costs you the move you wasted, which is
 *   what makes a sprung trace hurt and what makes the game terminate.
 *   The one thing that ever adds budget is a completed chain, and a
 *   chain costs three steps to refund two — so even that is a loss on
 *   the way to being a gain.
 * - Three same-fragment nodes in a row complete a chain: `CHAIN_REFUND`
 *   back, the counter reset, and one more chain on the record. Runs of
 *   six pay twice.
 * - Reaching the core wins. Running the budget down — or standing on
 *   the entry with nothing affordable next to it — is a lockout.
 *   Withdrawing is neither: it is walking out with what you have.
 *
 * Everything is a pure function of (lattice, path, budget), so a game is
 * replayable from its seed and its keystrokes, and a test can play one
 * move by move without mounting anything.
 */
import { createRng, hashSeed, nextInt, type RngState } from "../state/rng";

/* ------------------------------------------------------------------ *
 * Vocabulary
 * ------------------------------------------------------------------ */

/**
 * The four signal fragments a node can carry. Engine vocabulary rather
 * than content: the chain rule is "the same fragment three times", and
 * what the four are called is presentation.
 */
export const FRAGMENT_TYPES = ["carrier", "cipher", "pulse", "ghost"] as const;

export type FragmentType = (typeof FRAGMENT_TYPES)[number];

/**
 * What a node is.
 *
 * - "entry": where the runner comes in. Carries nothing, costs nothing.
 * - "core": what they are routing to. Reaching it ends the run.
 * - "data": a live node carrying a fragment and a yield.
 * - "trace": the same, plus watchdog logic that bills you for standing
 *   on it. Indistinguishable from a data node until it is seen (high
 *   Tech, a neural implant) or sprung.
 * - "dead": corrupted ground. Never steppable.
 */
export type BreachNodeKind = "entry" | "core" | "data" | "trace" | "dead";

export interface BreachNode {
  /** "x,y" — stable, and the key every path and set is written in. */
  id: string;
  x: number;
  y: number;
  kind: BreachNodeKind;
  /** Fragment carried; null on the entry, the core, and dead ground. */
  fragment: FragmentType | null;
  /** Data the node yields when routed through; 0 where it carries none. */
  value: number;
  /** Extra budget stepping onto it costs; above 0 only on a trace. */
  traceCost: number;
}

export interface BreachLattice {
  width: number;
  height: number;
  /** Row-major, so nodes[y * width + x] is (x, y). */
  nodes: readonly BreachNode[];
  entryId: string;
  coreId: string;
  /**
   * The cheapest route from entry to core, in budget. Computed at
   * generation over the same step costs the game charges, which is what
   * makes a difficulty's `slack` mean "how much room for error you get"
   * rather than "how big a number somebody guessed" — and what makes
   * every generated lattice solvable by construction.
   */
  minCost: number;
}

/** What the runner can see before they step. */
export interface BreachVision {
  /** Trace nodes are marked up front instead of springing under you. */
  traces: boolean;
  /** Fragment yields are readable instead of blank. */
  values: boolean;
}

/** What a runner brings to a lattice: room to move, and eyes. */
export interface BreachProfile {
  /** Moves to spend, already including every stat and implant bonus. */
  budget: number;
  vision: BreachVision;
}

export type BreachStatus = "running" | "breached" | "withdrawn" | "locked-out";

export interface BreachGame {
  lattice: BreachLattice;
  vision: BreachVision;
  /** Node ids in routing order; the entry is always the first. */
  path: readonly string[];
  budget: number;
  /** What the runner started with, for the meter. */
  budgetMax: number;
  /** Matching fragments in a row on the head of the path, 1-based. */
  chain: number;
  /** Chains completed so far. */
  chains: number;
  /** Data harvested off the path so far. */
  harvest: number;
  /** Traces the runner has stepped on. Revealed for good once sprung. */
  sprung: readonly string[];
  status: BreachStatus;
}

/** How the run ended, and what it is worth before content prices it. */
export interface BreachOutcome {
  status: Exclude<BreachStatus, "running">;
  /** Data harvested along the path. */
  harvest: number;
  chains: number;
  budgetLeft: number;
  /** Steps taken, not counting standing on the entry. */
  steps: number;
}

/** Matching fragments in a row that complete a chain. */
export const CHAIN_LENGTH = 3;

/** Budget a completed chain hands back. Deliberately under its cost. */
export const CHAIN_REFUND = 2;

export type BreachErrorCode =
  | "not-running"
  | "not-adjacent"
  | "dead-node"
  | "already-routed"
  | "no-budget"
  | "nothing-to-undo"
  | "unknown-node";

/** Refused move, carrying the line the overlay shows verbatim. */
export class BreachError extends Error {
  constructor(
    readonly code: BreachErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BreachError";
  }
}

/* ------------------------------------------------------------------ *
 * Generation
 * ------------------------------------------------------------------ */

/**
 * The shape of a lattice, before a seed fills it in. Authored per
 * difficulty in src/data/breach.ts.
 */
export interface LatticeSpec {
  width: number;
  height: number;
  /** Trace nodes seeded off the safe corridor. */
  traces: number;
  /** Dead nodes seeded off the safe corridor. */
  deads: number;
  /** Budget a trace bills, inclusive range. */
  traceCost: [number, number];
  /** Yield a live node carries, inclusive range. */
  value: [number, number];
}

export function nodeId(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * The corridor a lattice is guaranteed to be solvable along: one column
 * at a time from the entry row to the core row, stepping at most one row
 * either way per column. Nothing corrupt is ever seeded onto it, so
 * there is always a route through — and because the walk is bounded to
 * one row per column, the corridor is never longer than twice the width.
 */
function carveCorridor(
  spec: LatticeSpec,
  entryY: number,
  coreY: number,
  rng: RngState,
): { tiles: Set<string>; rng: RngState } {
  const tiles = new Set<string>([nodeId(0, entryY)]);
  let state = rng;
  let y = entryY;
  for (let x = 1; x < spec.width; x++) {
    // Wander freely while there are columns to spare, and close the
    // distance to the core's row once there are not.
    const remaining = spec.width - 1 - x;
    let drift: number;
    if (Math.abs(coreY - y) >= remaining) {
      drift = Math.sign(coreY - y);
    } else {
      const draw = nextInt(state, -1, 1);
      state = draw.state;
      drift = draw.value;
    }
    const next = Math.min(spec.height - 1, Math.max(0, y + drift));
    // Both cells of the turn, so the corridor is orthogonally connected.
    tiles.add(nodeId(x - 1, next));
    tiles.add(nodeId(x, next));
    y = next;
  }
  return { tiles, rng: state };
}

/**
 * Cheapest route cost from entry to core, over the game's own step
 * costs. Exported because it is what `minCost` means: a lattice is only
 * ever built with this figure on it, and a hand-authored one (tests, dev
 * tooling) has to be built the same way or a budget stops meaning
 * "room over the shortest route".
 */
export function cheapestRouteCost(
  nodes: readonly BreachNode[],
  width: number,
  height: number,
  entryId: string,
  coreId: string,
): number {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const best = new Map<string, number>([[entryId, 0]]);
  // Costs are small integers, so a plain "cheapest unvisited" scan is
  // both fast enough for a 7x5 grid and easier to read than a heap.
  const settled = new Set<string>();
  for (;;) {
    let current: string | null = null;
    let currentCost = Infinity;
    for (const [id, cost] of best) {
      if (settled.has(id) || cost >= currentCost) continue;
      current = id;
      currentCost = cost;
    }
    if (current === null) return Infinity;
    if (current === coreId) return currentCost;
    settled.add(current);
    const node = byId.get(current);
    if (!node) continue;
    for (const next of neighbourIds(node.x, node.y, width, height)) {
      const target = byId.get(next);
      if (!target || target.kind === "dead") continue;
      const cost = currentCost + stepCostOf(target);
      if (cost < (best.get(next) ?? Infinity)) best.set(next, cost);
    }
  }
}

function neighbourIds(
  x: number,
  y: number,
  width: number,
  height: number,
): string[] {
  const ids: string[] = [];
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    ids.push(nodeId(nx, ny));
  }
  return ids;
}

/**
 * A lattice from a spec and a seed. Pure and total: the same pair always
 * produces the same grid, on any machine and in any session, because
 * every draw comes off the game's own seeded RNG.
 */
export function generateLattice(
  spec: LatticeSpec,
  seed: number,
): BreachLattice {
  const entryY = Math.floor(spec.height / 2);
  const coreY = Math.floor(spec.height / 2);
  const entryId = nodeId(0, entryY);
  const coreId = nodeId(spec.width - 1, coreY);

  let rng = createRng(seed);
  const carved = carveCorridor(spec, entryY, coreY, rng);
  rng = carved.rng;
  const corridor = carved.tiles;

  // Every cell off the corridor, in a stable order, is the pool the
  // corruption is dealt from. Dealt by index rather than by rejection
  // sampling so the draw count never depends on how lucky it got.
  const pool: string[] = [];
  for (let y = 0; y < spec.height; y++) {
    for (let x = 0; x < spec.width; x++) {
      const id = nodeId(x, y);
      if (id === entryId || id === coreId || corridor.has(id)) continue;
      pool.push(id);
    }
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const draw = nextInt(rng, 0, i);
    rng = draw.state;
    const j = draw.value;
    const swap = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = swap;
  }
  const deads = new Set(pool.slice(0, Math.min(spec.deads, pool.length)));
  const traces = new Set(
    pool.slice(deads.size, Math.min(deads.size + spec.traces, pool.length)),
  );

  const nodes: BreachNode[] = [];
  for (let y = 0; y < spec.height; y++) {
    for (let x = 0; x < spec.width; x++) {
      const id = nodeId(x, y);
      const kind: BreachNodeKind =
        id === entryId
          ? "entry"
          : id === coreId
            ? "core"
            : deads.has(id)
              ? "dead"
              : traces.has(id)
                ? "trace"
                : "data";
      if (kind === "entry" || kind === "core" || kind === "dead") {
        nodes.push({ id, x, y, kind, fragment: null, value: 0, traceCost: 0 });
        continue;
      }
      // A trace is a data node with a bite: it carries a fragment and a
      // yield like any other, which is exactly why one cannot be picked
      // out of the grid by looking at what it holds.
      const fragmentDraw = nextInt(rng, 0, FRAGMENT_TYPES.length - 1);
      rng = fragmentDraw.state;
      const valueDraw = nextInt(rng, spec.value[0], spec.value[1]);
      rng = valueDraw.state;
      let traceCost = 0;
      if (kind === "trace") {
        const costDraw = nextInt(rng, spec.traceCost[0], spec.traceCost[1]);
        rng = costDraw.state;
        traceCost = costDraw.value;
      }
      nodes.push({
        id,
        x,
        y,
        kind,
        fragment: FRAGMENT_TYPES[fragmentDraw.value]!,
        value: valueDraw.value,
        traceCost,
      });
    }
  }

  return {
    width: spec.width,
    height: spec.height,
    nodes,
    entryId,
    coreId,
    minCost: cheapestRouteCost(nodes, spec.width, spec.height, entryId, coreId),
  };
}

/** A stable lattice seed for one terminal in one playthrough. */
export function breachSeed(contextId: string, runSeed: number): number {
  return hashSeed(`breach:${contextId}:${runSeed >>> 0}`);
}

/* ------------------------------------------------------------------ *
 * Reading a lattice
 * ------------------------------------------------------------------ */

export function latticeNode(
  lattice: BreachLattice,
  id: string,
): BreachNode | undefined {
  return lattice.nodes.find((node) => node.id === id);
}

export function requireNode(lattice: BreachLattice, id: string): BreachNode {
  const node = latticeNode(lattice, id);
  if (!node) throw new BreachError("unknown-node", `No lattice node "${id}"`);
  return node;
}

/** What stepping onto a node costs: the move, plus whatever bills you. */
export function stepCostOf(node: BreachNode): number {
  return 1 + node.traceCost;
}

/** The node the runner is standing on. */
export function headId(game: BreachGame): string {
  return game.path[game.path.length - 1]!;
}

export function headNode(game: BreachGame): BreachNode {
  return requireNode(game.lattice, headId(game));
}

/** Whether a node is already on the routed path. */
export function onPath(game: BreachGame, id: string): boolean {
  return game.path.includes(id);
}

/** Every node orthogonally adjacent to one, in grid order. */
export function neighbours(
  lattice: BreachLattice,
  id: string,
): BreachNode[] {
  const node = requireNode(lattice, id);
  return neighbourIds(node.x, node.y, lattice.width, lattice.height).flatMap(
    (next) => {
      const found = latticeNode(lattice, next);
      return found ? [found] : [];
    },
  );
}

/**
 * Why a step is refused, or null when it is legal. Separated from
 * `stepBreach` so the overlay can grey a node out and say why without
 * having to catch an exception per cell every render.
 */
export function stepRefusal(
  game: BreachGame,
  id: string,
): BreachError | null {
  if (game.status !== "running") {
    return new BreachError("not-running", "The run is over.");
  }
  const target = latticeNode(game.lattice, id);
  if (!target) return new BreachError("unknown-node", `No node "${id}"`);
  if (target.kind === "dead") {
    return new BreachError("dead-node", "That node is corrupt — nothing routes through it.");
  }
  if (onPath(game, id)) {
    return new BreachError("already-routed", "Your path already runs through there.");
  }
  const head = headNode(game);
  const adjacent = Math.abs(head.x - target.x) + Math.abs(head.y - target.y) === 1;
  if (!adjacent) {
    return new BreachError("not-adjacent", "The lattice only routes to a neighbour.");
  }
  if (stepCostOf(target) > game.budget) {
    return new BreachError("no-budget", "Not enough left in the buffer for that hop.");
  }
  return null;
}

export function canStep(game: BreachGame, id: string): boolean {
  return stepRefusal(game, id) === null;
}

/** Every node the runner could legally step to right now, in grid order. */
export function stepTargets(game: BreachGame): BreachNode[] {
  if (game.status !== "running") return [];
  return neighbours(game.lattice, headId(game)).filter((node) =>
    canStep(game, node.id),
  );
}

/* ------------------------------------------------------------------ *
 * Playing
 * ------------------------------------------------------------------ */

export function startBreach(
  lattice: BreachLattice,
  profile: BreachProfile,
): BreachGame {
  const budget = Math.max(0, Math.trunc(profile.budget));
  const opening: BreachGame = {
    lattice,
    vision: { ...profile.vision },
    path: [lattice.entryId],
    budget,
    budgetMax: budget,
    chain: 0,
    chains: 0,
    harvest: 0,
    sprung: [],
    status: "running",
  };
  return settle(opening);
}

/**
 * The one place a run's status is decided, applied after every move.
 * A run is over when the head is the core (through), when there is
 * nothing left to spend (locked out), or when the runner is back on the
 * entry with nothing they can afford beside it — the corner case where
 * a budget above zero still buys nothing at all.
 */
function settle(game: BreachGame): BreachGame {
  if (game.status !== "running") return game;
  if (headId(game) === game.lattice.coreId) {
    return { ...game, status: "breached" };
  }
  if (game.budget <= 0) return { ...game, status: "locked-out" };
  if (game.path.length === 1 && stepTargets(game).length === 0) {
    return { ...game, status: "locked-out" };
  }
  return game;
}

/**
 * Routes one hop. Throws a BreachError the overlay shows verbatim when
 * the move is refused — the budget is never touched by a step that did
 * not happen.
 */
export function stepBreach(game: BreachGame, id: string): BreachGame {
  const refusal = stepRefusal(game, id);
  if (refusal) throw refusal;
  const target = requireNode(game.lattice, id);
  const previous = headNode(game);

  // The chain runs on fragments, so it survives a trace (which carries
  // one like any other node) and breaks on the core, which carries none.
  const matched =
    target.fragment !== null && target.fragment === previous.fragment;
  let chain = matched ? game.chain + 1 : target.fragment === null ? 0 : 1;
  let chains = game.chains;
  let refund = 0;
  if (chain >= CHAIN_LENGTH) {
    chain = 0;
    chains += 1;
    refund = CHAIN_REFUND;
  }

  const sprung =
    target.kind === "trace" && !game.sprung.includes(id)
      ? [...game.sprung, id]
      : game.sprung;

  return settle({
    ...game,
    path: [...game.path, id],
    budget: game.budget - stepCostOf(target) + refund,
    chain,
    chains,
    harvest: game.harvest + target.value,
    sprung,
  });
}

/**
 * Retracts the last hop. Refunds nothing on purpose: a reroute costs
 * you the move you wasted, which is the only reason a sprung trace ever
 * hurts and the reason the game cannot be played forever. What it does
 * hand back is the fragment chain and the harvest of the node left
 * behind, so undoing is a clean rewind of everything but the budget.
 */
export function undoBreach(game: BreachGame): BreachGame {
  if (game.status !== "running") {
    throw new BreachError("not-running", "The run is over.");
  }
  if (game.path.length <= 1) {
    throw new BreachError("nothing-to-undo", "You are still on the entry node.");
  }
  const path = game.path.slice(0, -1);
  const dropped = requireNode(game.lattice, game.path[game.path.length - 1]!);
  const rewound = { ...game, path, harvest: game.harvest - dropped.value };
  return settle({ ...rewound, ...rewindChain(rewound) });
}

/**
 * The chain the path would read if it had been routed exactly as it now
 * stands. Recomputed rather than remembered, so an undo can never leave
 * a counter describing a hop that is no longer there.
 */
function rewindChain(game: BreachGame): { chain: number; chains: number } {
  let chain = 0;
  let chains = 0;
  let previous: FragmentType | null = null;
  for (const id of game.path) {
    const node = requireNode(game.lattice, id);
    if (node.fragment === null) {
      chain = 0;
    } else if (node.fragment === previous) {
      chain += 1;
    } else {
      chain = 1;
    }
    if (chain >= CHAIN_LENGTH) {
      chain = 0;
      chains += 1;
    }
    previous = node.fragment;
  }
  return { chain, chains };
}

/** Walks out with what has been harvested so far. */
export function withdrawBreach(game: BreachGame): BreachGame {
  if (game.status !== "running") {
    throw new BreachError("not-running", "The run is over.");
  }
  return { ...game, status: "withdrawn" };
}

/** How a finished run reads; throws while one is still going. */
export function breachOutcome(game: BreachGame): BreachOutcome {
  if (game.status === "running") {
    throw new BreachError("not-running", "The run is still going.");
  }
  return {
    status: game.status,
    harvest: game.harvest,
    chains: game.chains,
    budgetLeft: game.budget,
    steps: game.path.length - 1,
  };
}

/* ------------------------------------------------------------------ *
 * What the runner can see
 * ------------------------------------------------------------------ */

/**
 * A node's kind as far as this runner is concerned. A trace they cannot
 * see and have not sprung reads as an ordinary data node — which is the
 * whole of the information game, and the reason Tech and a neural jack
 * are worth bringing.
 */
export function visibleKind(
  game: BreachGame,
  node: BreachNode,
): BreachNodeKind {
  if (node.kind !== "trace") return node.kind;
  if (game.vision.traces || game.sprung.includes(node.id)) return "trace";
  return "data";
}

/** One node as the screen reads it. Everything the overlay draws. */
export interface BreachNodeView {
  id: string;
  x: number;
  y: number;
  /** What the runner believes the node is; see visibleKind. */
  kind: BreachNodeKind;
  fragment: FragmentType | null;
  /** Yield, or null when the runner cannot read it yet. */
  value: number | null;
  /** What stepping there would cost, as far as the runner can tell. */
  cost: number;
  onPath: boolean;
  /** True on the node the runner is standing on. */
  head: boolean;
  /** A legal hop from where they stand right now. */
  steppable: boolean;
}

export function nodeView(game: BreachGame, node: BreachNode): BreachNodeView {
  const kind = visibleKind(game, node);
  const routed = onPath(game, node.id);
  // A yield is readable once the optics can read it, and once you have
  // taken it — a node you have already routed through has no secrets.
  const readable = game.vision.values || routed;
  return {
    id: node.id,
    x: node.x,
    y: node.y,
    kind,
    fragment: node.fragment,
    value: node.value === 0 ? null : readable ? node.value : null,
    // The cost a hidden trace advertises is the cost of the node it is
    // pretending to be. Springing it is how you find out otherwise.
    cost: kind === "trace" ? stepCostOf(node) : 1,
    onPath: routed,
    head: routed && node.id === headId(game),
    steppable: canStep(game, node.id),
  };
}

/** Every node, row-major, as the screen reads them. */
export function latticeView(game: BreachGame): BreachNodeView[] {
  return game.lattice.nodes.map((node) => nodeView(game, node));
}
