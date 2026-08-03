import { createCharacter } from "../../character/create";
import { defaultAppearance } from "../../character/appearance";
import {
  POINT_POOL,
  STAT_KEYS,
  STAT_MAX,
  STAT_MIN,
  type StatKey,
  type Stats,
} from "../../character/stats";
import { combatResultFlag } from "../../combat/outcome";
import { backgrounds, type Background } from "../../data/backgrounds";
import { getItem } from "../../data/items";
import { findArcByNode } from "../../data/story";
import { createNewGame, type GameState } from "../../state/gameState";
import { nextInt } from "../../state/rng";
import type { RngState } from "../../state/rng";
import { validateGameState } from "../../state/validate";
import { availableChoices, applyChoice } from "../engine";
import type { StoryArc } from "../types";
import type { FlagWriteSite } from "./content";
import { error, warning, type AuditFinding } from "./types";
import type { WorldEntry } from "./structure";

/**
 * The random walk: play the graph badly, on purpose, and see what
 * breaks.
 *
 * Every other check in the audit reads the content. This one runs the
 * engine over it — availableChoices, applyChoice, the real requirement
 * evaluator — from every doorway the world holds open, taking arbitrary
 * *legal* choices and asserting the three things a player is entitled
 * to: the engine never throws, the state stays a state the game would
 * load, and there is always a way on.
 *
 * Seeded throughout, so a failure is a number somebody can re-run.
 *
 * Walks start from a randomized-but-achievable character rather than a
 * fresh one, because a fresh save can only ever see the ungated half of
 * the graph, and the gated half is where the interesting mistakes are.
 * The randomization only ever produces states the game itself could
 * produce: a legal point-buy line, one of the authored backgrounds, and
 * flags drawn from the values something in the game actually writes.
 */

export interface WalkOptions {
  arcs: readonly StoryArc[];
  /** Where a walk may start; each is tried in turn as the seeds cycle. */
  entries: readonly WorldEntry[];
  /** Flag writes the fuzzed start state may draw from. */
  writes: readonly FlagWriteSite[];
  /** How many walks to run in total. */
  walks: number;
  /** Choices one walk may take before it is cut off. */
  steps: number;
  /** First seed; every walk takes the next one. */
  seed: number;
  /**
   * How a walk's start state is built. Defaults to `fuzzedStart`; the
   * fixture tests pass their own to walk from a state chosen rather
   * than rolled.
   */
  start?: (seed: number, writes: readonly FlagWriteSite[]) => GameState;
}

export interface WalkReport {
  findings: AuditFinding[];
  /** Story node ids some walk stood on. */
  visited: Set<string>;
  walks: number;
  /** Choices actually taken across every walk. */
  steps: number;
}

/**
 * What a background's own starting gear needs before it can be worn.
 * A run is created with that gear already equipped, so an allocation
 * that cannot hold it is not a character the game would ever build.
 */
function gearFloor(background: Background): Partial<Record<StatKey, number>> {
  const floor: Partial<Record<StatKey, number>> = {};
  for (const itemId of background.startingGearIds) {
    const item = getItem(itemId);
    if (item?.kind !== "weapon" || !item.requirement) continue;
    const { stat, value } = item.requirement;
    floor[stat] = Math.max(floor[stat] ?? 0, value - (background.statBonuses[stat] ?? 0));
  }
  return floor;
}

/** A legal point-buy line, spent to the last point. */
function randomAllocation(
  rng: RngState,
  background: Background,
): { rng: RngState; allocation: Stats } {
  const allocation: Stats = {
    body: STAT_MIN,
    reflexes: STAT_MIN,
    tech: STAT_MIN,
    cool: STAT_MIN,
    intelligence: STAT_MIN,
  };
  let spentOnFloor = 0;
  for (const [stat, value] of Object.entries(gearFloor(background))) {
    const key = stat as StatKey;
    const raised = Math.min(STAT_MAX, Math.max(allocation[key], value));
    spentOnFloor += raised - allocation[key];
    allocation[key] = raised;
  }
  let state = rng;
  for (let spent = spentOnFloor; spent < POINT_POOL; spent++) {
    const open = STAT_KEYS.filter((key) => allocation[key] < STAT_MAX);
    const pick = nextInt(state, 0, open.length - 1);
    state = pick.state;
    const key = open[pick.value]!;
    allocation[key] += 1;
  }
  return { rng: state, allocation };
}

/**
 * A start state a run could really be in: a legal character, a plausible
 * purse, and a random scattering of the flags the game writes — each set
 * to one of the values its own writer produces, never to a value nobody
 * writes.
 */
export function fuzzedStart(
  seed: number,
  writes: readonly FlagWriteSite[],
): GameState {
  let rng: RngState = { seed: seed >>> 0 };
  const pickBackground = nextInt(rng, 0, backgrounds.length - 1);
  rng = pickBackground.state;
  const background = backgrounds[pickBackground.value]!;
  const rolled = randomAllocation(rng, background);
  rng = rolled.rng;
  const state = createNewGame({
    playerName: "Audit",
    seed,
    character: createCharacter({
      name: "Audit",
      background,
      allocation: rolled.allocation,
      appearance: defaultAppearance(),
    }),
  });

  const flags: GameState["flags"] = {};
  const settable = writes.filter((write) => write.value !== undefined);
  const share = nextInt(rng, 0, 100);
  rng = share.state;
  for (const write of settable) {
    const roll = nextInt(rng, 0, 99);
    rng = roll.state;
    if (roll.value < share.value) flags[write.key] = write.value!;
  }

  const credits = nextInt(rng, 0, 4000);
  rng = credits.state;
  return { ...state, flags, credits: credits.value, rng };
}

/** One walk from one doorway. Returns what it found and where it stood. */
function walkFrom(
  entry: WorldEntry,
  seed: number,
  options: WalkOptions,
  visited: Set<string>,
): { findings: AuditFinding[]; steps: number } {
  const findings: AuditFinding[] = [];
  let state = (options.start ?? fuzzedStart)(seed, options.writes);
  let arc = options.arcs.find((candidate) =>
    candidate.nodes.some((node) => node.id === entry.nodeId),
  );
  let nodeId: string | null = entry.nodeId;
  let steps = 0;
  let rng: RngState = { seed: (seed ^ 0x9e3779b9) >>> 0 };

  while (arc && nodeId != null && steps < options.steps) {
    const currentId: string = nodeId;
    const node = arc.nodes.find((candidate) => candidate.id === currentId);
    // A doorway onto a node that does not exist is the structural
    // pass's finding, not the walk's.
    if (!node) break;
    visited.add(node.id);

    // A fuzzed state can stand somewhere no real run could, so a node
    // with nothing available only ends this walk. Whether a node's
    // gates are exhaustive is decided statically instead, where the
    // answer does not depend on which seeds were drawn — see
    // allGatedNodes in ./structure.ts.
    const open = availableChoices(state, node).filter((option) => option.enabled);
    if (open.length === 0) break;

    const pick = nextInt(rng, 0, open.length - 1);
    rng = pick.state;
    const choice = open[pick.value]!.choice;
    let outcome;
    try {
      outcome = applyChoice(state, node, choice.id);
    } catch (thrown) {
      findings.push(
        error(
          "walk-throw",
          `arc:${arc.id}`,
          `Taking "${choice.id}" on node "${node.id}" (seed ${seed}) threw: ` +
            `${thrown instanceof Error ? thrown.message : String(thrown)}`,
          { where: `${node.id}/${choice.id}`, subject: node.id },
        ),
      );
      break;
    }
    steps += 1;
    state = outcome.state;

    const verdict = validateGameState(state);
    if (!verdict.ok) {
      findings.push(
        error(
          "walk-invalid-state",
          `arc:${arc.id}`,
          `Taking "${choice.id}" on node "${node.id}" (seed ${seed}) left a ` +
            `state the game would refuse: ${verdict.issues
              .map((issue) => `${issue.path} ${issue.message}`)
              .join("; ")}`,
          { where: `${node.id}/${choice.id}`, subject: node.id },
        ),
      );
      break;
    }

    // A fight the walk cannot play is settled the way the shell would
    // settle a won one, so the beats behind a fight stay walkable.
    if (outcome.encounterId != null) {
      state = {
        ...state,
        pendingEncounterId: null,
        flags: {
          ...state.flags,
          [combatResultFlag(outcome.encounterId)]: "victory",
        },
      };
    }
    // Travel closes the dialogue; so does an ending. Either way this
    // walk is over.
    if (outcome.ended || outcome.travelTo != null) break;

    nodeId = outcome.nextNodeId;
    if (nodeId != null && !arc.nodes.some((candidate) => candidate.id === nodeId)) {
      arc = findArcByNode(nodeId);
    }
  }

  return { findings, steps };
}

/** Runs the whole walk budget, cycling the doorways as the seeds advance. */
export function runWalks(options: WalkOptions): WalkReport {
  const findings: AuditFinding[] = [];
  const visited = new Set<string>();
  let steps = 0;
  for (let index = 0; index < options.walks; index++) {
    const entry = options.entries[index % options.entries.length];
    if (!entry) break;
    const walk = walkFrom(entry, options.seed + index, options, visited);
    findings.push(...walk.findings);
    steps += walk.steps;
  }
  return { findings, visited, walks: options.walks, steps };
}

/** Story nodes no walk in the budget ever stood on. */
export function unvisitedFindings(
  arcs: readonly StoryArc[],
  visited: ReadonlySet<string>,
): AuditFinding[] {
  const findings: AuditFinding[] = [];
  for (const arc of arcs) {
    for (const node of arc.nodes) {
      if (visited.has(node.id)) continue;
      findings.push(
        warning(
          "unvisited-node",
          `arc:${arc.id}`,
          `No walk in the budget reached node "${node.id}"`,
          { where: node.id, subject: node.id },
        ),
      );
    }
  }
  return findings;
}
