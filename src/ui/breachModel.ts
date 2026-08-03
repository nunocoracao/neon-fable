import { getItem } from "../data/items";
import { getShard } from "../data/lore";
import {
  breachDifficulty,
  type BreachContext,
} from "../data/breach";
import {
  CHAIN_LENGTH,
  latticeView,
  type BreachGame,
  type BreachNodeKind,
  type BreachNodeView,
  type BreachOutcome,
  type BreachStatus,
  type FragmentType,
} from "../minigames";
import type { BreachAward, RunnerRead } from "../minigames";
import { chainsLabel, itemSummary } from "./format";
import { plain, t, type PlainKey } from "./strings";

/**
 * The Breach screen, as data. Pure over a game and its context — no
 * DOM, no session — so what the overlay shows is testable without
 * mounting it, the same split workbenchModel.ts and combatHud.ts use.
 *
 * Nothing here decides a rule. Every figure comes off the game state
 * the engine produced, and every cell's steppability is the engine's
 * own answer (see nodeView), so the screen can never offer a hop the
 * rules would refuse.
 */

/** The mark a fragment wears on the grid. */
const FRAGMENT_GLYPHS: Readonly<Record<FragmentType, string>> = {
  carrier: "▲",
  cipher: "◆",
  pulse: "●",
  ghost: "■",
};

/** How a fragment reads in a sentence. */
const FRAGMENT_NAMES: Readonly<Record<FragmentType, PlainKey>> = {
  carrier: "breach.fragment.carrier",
  cipher: "breach.fragment.cipher",
  pulse: "breach.fragment.pulse",
  ghost: "breach.fragment.ghost",
};

export function fragmentGlyph(fragment: FragmentType): string {
  return FRAGMENT_GLYPHS[fragment];
}

/** One node, as its button on the grid reads. */
export interface BreachCell {
  view: BreachNodeView;
  /** What is drawn in the cell. */
  glyph: string;
  /** Yield under the glyph — "?" while it cannot be read, "" for none. */
  yieldLabel: string;
  /** The whole cell in a sentence, for screen readers and the title. */
  label: string;
  /** Which look the cell wears; drives the class, never a rule. */
  tone: BreachNodeKind;
}

export function breachCell(view: BreachNodeView): BreachCell {
  const glyph =
    view.kind === "entry"
      ? "▶"
      : view.kind === "core"
        ? "◎"
        : view.kind === "dead"
          ? "×"
          : view.fragment
            ? FRAGMENT_GLYPHS[view.fragment]
            : "·";
  const yieldLabel =
    view.kind === "dead" || view.kind === "entry" || view.kind === "core"
      ? ""
      : view.value === null
        ? "?"
        : `${view.value}`;

  const parts: string[] = [];
  if (view.kind === "entry") parts.push(t("breach.node.entry"));
  else if (view.kind === "core") parts.push(t("breach.node.core"));
  else if (view.kind === "dead") parts.push(t("breach.node.dead"));
  else {
    const fragment = plain(FRAGMENT_NAMES[view.fragment ?? "carrier"]);
    parts.push(
      view.kind === "trace"
        ? t("breach.node.trace", { fragment })
        : t("breach.node.fragment", { fragment }),
    );
    parts.push(
      view.value === null
        ? t("breach.node.unread")
        : t("breach.node.yield", { value: view.value }),
    );
  }
  if (view.kind !== "dead" && view.kind !== "entry") {
    parts.push(t("breach.node.cost", { cost: view.cost }));
  }
  if (view.head) parts.push(t("breach.node.here"));
  else if (view.onPath) parts.push(t("breach.node.routed"));
  return { view, glyph, yieldLabel, label: parts.join(" · "), tone: view.kind };
}

/** The whole screen for a run in progress. */
export interface BreachPanel {
  title: string;
  /** "Guarded · Somebody pays for this one to be watched." */
  difficultyLine: string;
  /** "Buffer 11 / 14". */
  bufferLine: string;
  buffer: { left: number; max: number };
  /** "Chain 2/3 · 1 banked". */
  chainLine: string;
  /** "Data 7". */
  harvestLine: string;
  cells: BreachCell[];
  columns: number;
  canUndo: boolean;
  canWithdraw: boolean;
  status: BreachStatus;
}

export function breachPanel(
  game: BreachGame,
  context: BreachContext,
): BreachPanel {
  const difficulty = breachDifficulty(context.difficulty);
  const running = game.status === "running";
  return {
    title: context.name,
    difficultyLine: `${difficulty.label} · ${difficulty.blurb}`,
    bufferLine: `Buffer ${game.budget} / ${game.budgetMax}`,
    buffer: { left: game.budget, max: game.budgetMax },
    chainLine: `Chain ${game.chain}/${CHAIN_LENGTH} · ${game.chains} banked`,
    harvestLine: `Data ${game.harvest}`,
    cells: latticeView(game).map(breachCell),
    columns: game.lattice.width,
    canUndo: running && game.path.length > 1,
    canWithdraw: running,
    status: game.status,
  };
}

/** The briefing, before anybody commits. */
export interface BreachBrief {
  title: string;
  difficultyLine: string;
  brief: string;
  prize: string;
  /** "Buffer 14 — 9 to route it clean, 5 to be wrong with." */
  bufferLine: string;
  /** What the runner's own wiring is doing for them; may be empty. */
  notes: readonly string[];
  /** Said out loud, because a terminal only ever gives you one go. */
  warning: string;
}

export function breachBrief(
  game: BreachGame,
  context: BreachContext,
  runner: RunnerRead,
): BreachBrief {
  const difficulty = breachDifficulty(context.difficulty);
  const slack = game.budget - game.lattice.minCost;
  return {
    title: context.name,
    difficultyLine: `${difficulty.label} · ${difficulty.blurb}`,
    brief: context.brief,
    prize: context.prize,
    bufferLine: t("breach.buffer", {
      budget: game.budget,
      minimum: game.lattice.minCost,
      slack,
    }),
    notes: runner.notes,
    warning:
      context.rewards.partial === true
        ? t("breach.warning.partial")
        : t("breach.warning.allOrNothing"),
  };
}

/** The run, after it has stopped. */
export interface BreachReport {
  headline: string;
  /** What happened, in the runner's own terms. */
  body: string;
  /** One line per thing the run paid out; empty when it paid nothing. */
  payout: string[];
}

export function breachReport(
  context: BreachContext,
  outcome: BreachOutcome,
  award: BreachAward,
): BreachReport {
  const payout: string[] = [];
  if (award.credits > 0) payout.push(`${award.credits} cr`);
  for (const effect of award.effects) {
    if (effect.type === "credits" && effect.amount > 0) {
      payout.push(`${effect.amount} cr`);
    }
    if (effect.type === "add-item") {
      const item = getItem(effect.itemId);
      const name = item?.name ?? effect.itemId;
      const quantity = effect.quantity ?? 1;
      payout.push(
        quantity > 1
          ? `${name} ×${quantity}`
          : item
            ? `${name} — ${itemSummary(item)}`
            : name,
      );
    }
  }
  if (award.shardId) {
    const shard = getShard(award.shardId);
    payout.push(`Memory shard — "${shard?.title ?? award.shardId}"`);
  }
  // The prize a context authored is the sentence a player came for, so
  // it is said again on the way out rather than left to be inferred
  // from a flag they cannot see.
  if (outcome.status === "breached") payout.push(context.prize);

  if (outcome.status === "breached") {
    return {
      headline: t("breach.report.breached"),
      body: t("breach.report.breached.body", {
        hops: outcome.steps,
        chains: chainsLabel(outcome.chains),
        harvest: outcome.harvest,
        left: outcome.budgetLeft,
      }),
      payout,
    };
  }
  if (outcome.status === "withdrawn") {
    return {
      headline: t("breach.report.withdrawn"),
      body: t("breach.report.withdrawn.body", { harvest: outcome.harvest }),
      payout,
    };
  }
  return {
    headline: t("breach.report.lockedOut"),
    body: t("breach.report.lockedOut.body"),
    payout,
  };
}

/** What a terminal that has already had its one run says. */
export function spentLine(context: BreachContext, recorded: unknown): string {
  const outcome = typeof recorded === "string" ? recorded : "";
  if (outcome === "breached") return context.spent;
  if (outcome === "withdrawn") {
    return t("breach.spent.withdrawn", { spent: context.spent });
  }
  return t("breach.spent.lockedOut");
}
