import type { AdvancementView, CredLine } from "../character";
import {
  availablePerks,
  credLines,
  currentMilestone,
  nextMilestone,
  perkPicksAvailable,
  streetCred,
  takenPerks,
} from "../character";
import type { CredMilestone } from "../data/advancement";
import type { Perk, PerkDomain } from "../data/perks";

/**
 * Pure selector behind the perk overlay and the perk section of the
 * advancement panel: the run's street cred, what it has earned, what it
 * has taken, and what is still on offer.
 *
 * No DOM and no state mutation — the screens render exactly what this
 * returns, so the wording of a milestone, the shape of the cred
 * breakdown, and the "one pick waiting" nudge are all unit-testable
 * without a browser. Every figure comes from src/character/cred.ts;
 * nothing here counts anything of its own.
 */

export const PERK_DOMAIN_LABELS: Record<PerkDomain, string> = {
  combat: "Combat",
  dialogue: "Conversation",
  inventory: "Kit",
};

/** One perk as a card: what it is, what it does, and whether it is yours. */
export interface PerkCard {
  id: string;
  name: string;
  domain: PerkDomain;
  domainLabel: string;
  description: string;
  effect: string;
  taken: boolean;
}

/** How far the next milestone is, for the line under the cred figure. */
export interface MilestoneProgress {
  label: string;
  cred: number;
  /** Cred still to earn. Always at least 1 — a reached milestone is not next. */
  remaining: number;
}

export interface PerkPanelView {
  /** The run's street cred right now. */
  cred: number;
  /** Where it came from, in reading order. */
  lines: CredLine[];
  /** The name the city currently has for you, or null before the first. */
  milestone: CredMilestone | null;
  /** The next name to earn, or null once there are none left. */
  next: MilestoneProgress | null;
  /** Picks owed and unspent. */
  picks: number;
  /** Perks already taken, with their effects. */
  taken: PerkCard[];
  /** Perks still on offer — everything unchosen, whatever milestone it is. */
  choices: PerkCard[];
  /** True when every perk in the pool has been taken. */
  exhausted: boolean;
  /**
   * The line the pick overlay leads with: the milestone's own blurb
   * while a pick is owed, and a plain status line otherwise.
   */
  headline: string;
}

function card(perk: Perk, taken: boolean): PerkCard {
  return {
    id: perk.id,
    name: perk.name,
    domain: perk.domain,
    domainLabel: PERK_DOMAIN_LABELS[perk.domain],
    description: perk.description,
    effect: perk.effect,
    taken,
  };
}

function headlineFor(
  picks: number,
  milestone: CredMilestone | null,
  next: MilestoneProgress | null,
  exhausted: boolean,
): string {
  if (picks > 0 && milestone) return milestone.blurb;
  if (exhausted) return "You are everything the street has to teach.";
  if (next) {
    return `${next.remaining} more cred and the Sprawl wants a word.`;
  }
  return "The city knows exactly who you are.";
}

export function perkPanel(state: AdvancementView): PerkPanelView {
  const cred = streetCred(state.flags);
  const upcoming = nextMilestone(cred);
  const next: MilestoneProgress | null = upcoming
    ? {
        label: upcoming.label,
        cred: upcoming.cred,
        remaining: Math.max(1, upcoming.cred - cred),
      }
    : null;
  const taken = takenPerks(state.player).map((perk) => card(perk, true));
  const choices = availablePerks(state.player).map((perk) => card(perk, false));
  const picks = perkPicksAvailable(state);
  const exhausted = choices.length === 0;
  const milestone = currentMilestone(cred);
  return {
    cred,
    lines: credLines(state.flags),
    milestone,
    next,
    picks,
    taken,
    choices,
    exhausted,
    headline: headlineFor(picks, milestone, next, exhausted),
  };
}

/** "Street cred 14 · Counted" — the one-line status a panel header shows. */
export function credLabel(view: PerkPanelView): string {
  return view.milestone
    ? `Street cred ${view.cred} · ${view.milestone.label}`
    : `Street cred ${view.cred}`;
}

/** "1 perk pick waiting" / "" — the nudge, worded for a count. */
export function pickLabel(picks: number): string {
  if (picks <= 0) return "";
  return picks === 1 ? "1 perk pick waiting" : `${picks} perk picks waiting`;
}
