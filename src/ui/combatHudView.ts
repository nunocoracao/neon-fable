import type { CombatActionKind } from "../combat";
import type { StatusFamilyId } from "../iso";
import {
  hpLabel,
  statusLabel,
  type ActionButton,
  type InitiativeChip,
  type TargetCard,
  type TelegraphChip,
} from "./combatHud";
import { actionIconCanvas, statusIconCanvas } from "./combatIcons";
import { percentLabel } from "./format";

/**
 * The combat HUD's view layer: the initiative rail, the action bar, and
 * the target card as DOM. Every one of these is handed a finished model
 * (see ./combatHud.ts) and paints it — no combat reads, no rules, no
 * formatting decisions beyond which element a string goes in.
 *
 * Each builder returns a handle with a stable root element and an
 * `update` that re-paints from a model, so the combat screen holds the
 * elements once and pushes new models at them every sync.
 */

export interface HudView<Model> {
  readonly el: HTMLElement;
  update(model: Model): void;
}

function div(className: string, text?: string): HTMLDivElement {
  const el = document.createElement("div");
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

/** A proportional bar; `fraction` is clamped into [0, 1]. */
function meter(className: string, fraction: number): HTMLDivElement {
  const bar = div(className);
  const fill = div(`${className}-fill`);
  const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  fill.style.width = `${pct}%`;
  // Colour steps rather than a gradient: the HUD has no soft edges.
  fill.dataset.band = pct <= 25 ? "low" : pct <= 60 ? "mid" : "high";
  bar.append(fill);
  return bar;
}

/** A row of condition badges; empty when nothing is true of the body. */
function statusBadges(
  statuses: readonly StatusFamilyId[],
  className: string,
): HTMLDivElement {
  const row = div(className);
  for (const family of statuses) {
    const badge = document.createElement("span");
    badge.className = "nf-status-badge";
    badge.dataset.status = family;
    badge.title = statusLabel(family);
    badge.append(statusIconCanvas(family));
    row.append(badge);
  }
  return row;
}

/* --- Initiative rail ------------------------------------------------- */

export interface InitiativeRailModel {
  round: number;
  chips: readonly InitiativeChip[];
}

export interface InitiativeRailOptions {
  /** A portrait canvas for one chip; the screen owns appearance lookup. */
  portrait(chip: InitiativeChip): HTMLCanvasElement;
  /** Pointing at a chip inspects that combatant. */
  onHover?(combatantId: string | null): void;
}

/**
 * The initiative rail: a portrait chip per combatant in fixed
 * initiative order, the one acting enlarged and lit, the defeated
 * greyed and collapsed to a stub. The turn number on each chip is how
 * far off its turn is, so the order ahead reads without counting.
 */
export function createInitiativeRail(
  options: InitiativeRailOptions,
): HudView<InitiativeRailModel> {
  const el = div("nf-initiative");

  function chipEl(chip: InitiativeChip): HTMLElement {
    const root = div("nf-init-chip");
    root.dataset.combatant = chip.combatantId;
    if (chip.kind === "player") root.classList.add("nf-init-player");
    // A companion reads as one of yours without reading as you.
    if (chip.kind === "ally") root.classList.add("nf-init-ally");
    if (!chip.alive) root.classList.add("nf-init-dead");
    if (chip.active) root.classList.add("nf-init-active");

    const frame = div("nf-init-portrait");
    frame.append(options.portrait(chip));
    // Whoever is up says so; everyone else counts down to their turn.
    if (chip.turnsAway !== null) {
      frame.append(
        div("nf-init-turn", chip.turnsAway === 0 ? "NOW" : `+${chip.turnsAway}`),
      );
    }
    if (chip.statuses.length > 0) {
      frame.append(statusBadges(chip.statuses, "nf-init-statuses"));
    }
    // A wound carried into the fight, named on the chip rather than
    // badged with a glyph: unlike a stun it is not going to resolve
    // itself in a turn, and the player needs to be able to read *which*
    // one it is off the rail without hovering anything.
    if (chip.injury) {
      const badge = div("nf-init-injury", chip.injury.name);
      badge.title = `${chip.injury.name} — ${chip.injury.effect}`;
      frame.append(badge);
    }
    root.append(frame);

    root.append(div("nf-init-name", chip.name));
    // A defeated chip keeps its name and its place in the order and
    // loses everything that only matters to a body still fighting.
    if (chip.alive) {
      const hp = meter("nf-init-hp", chip.hpFraction);
      hp.title = hpLabel(chip.hp, chip.maxHp);
      root.append(hp);
    }

    root.title = `${chip.name} — ${hpLabel(chip.hp, chip.maxHp)}`;
    if (options.onHover) {
      root.addEventListener("mouseenter", () =>
        options.onHover?.(chip.combatantId),
      );
      root.addEventListener("mouseleave", () => options.onHover?.(null));
    }
    return root;
  }

  return {
    el,
    update({ round, chips }) {
      el.replaceChildren(div("nf-init-round", `Round ${round}`));
      for (const chip of chips) el.append(chipEl(chip));
    },
  };
}

/* --- Action bar ------------------------------------------------------ */

export interface ActionBarOptions {
  onInvoke(kind: CombatActionKind): void;
}

/**
 * The action bar: an icon, a name, and a hotkey per button. A disabled
 * button keeps its title, which is the reason it is disabled — the HUD
 * never greys something out without saying why.
 */
export function createActionBar(
  options: ActionBarOptions,
): HudView<readonly ActionButton[]> {
  const el = div("nf-action-bar");

  function buttonEl(model: ActionButton): HTMLButtonElement {
    const button = document.createElement("button");
    button.className = "nf-action-button";
    button.dataset.action = model.kind;
    button.disabled = !model.enabled;
    button.title = model.tooltip;
    button.setAttribute("aria-label", `${model.label} (${model.hotkey})`);

    const icon = div("nf-action-icon");
    icon.append(actionIconCanvas(model.iconId));
    const label = document.createElement("span");
    label.className = "nf-action-label";
    label.textContent = model.label;
    const hotkey = document.createElement("span");
    hotkey.className = "nf-action-hotkey";
    hotkey.textContent = model.hotkey;

    button.append(icon, label, hotkey);
    button.addEventListener("click", () => options.onInvoke(model.kind));
    return button;
  }

  return {
    el,
    update(models) {
      el.replaceChildren(...models.map(buttonEl));
    },
  };
}

/* --- Target card ----------------------------------------------------- */

export interface TargetCardOptions {
  /** A portrait canvas for the inspected combatant. */
  portrait(card: TargetCard): HTMLCanvasElement;
}

/**
 * The target card: who you are pointing at, what they are wearing, and
 * what your weapon would do about it. Hidden — not emptied — when
 * nothing is being inspected, so the arena underneath stays clear.
 */
export function createTargetCard(
  options: TargetCardOptions,
): HudView<TargetCard | null> {
  const el = div("nf-target-card");
  el.hidden = true;

  return {
    el,
    update(card) {
      if (card === null) {
        el.hidden = true;
        el.replaceChildren();
        return;
      }
      el.hidden = false;
      el.dataset.combatant = card.combatantId;

      const frame = div("nf-target-portrait");
      frame.append(options.portrait(card));

      const body = div("nf-target-body");
      body.append(div("nf-target-name", card.name));
      const hp = meter("nf-target-hp", card.hpFraction);
      body.append(hp, div("nf-target-hp-text", hpLabel(card.hp, card.maxHp)));

      const stats = div("nf-target-stats");
      stats.append(
        div("nf-target-stat", `Armor ${card.armor}`),
        div("nf-target-stat", card.weaponName),
        div("nf-target-stat", `${card.distance} away`),
      );
      body.append(stats);

      if (card.attack) {
        body.append(
          div(
            "nf-target-attack",
            `Your shot: ${card.attack.damage} dmg · ` +
              `${percentLabel(card.attack.hitChance)} to hit`,
          ),
        );
      }
      if (card.statuses.length > 0) {
        body.append(statusBadges(card.statuses, "nf-target-statuses"));
      }

      el.replaceChildren(frame, body);
    },
  };
}

/* --- Telegraph chip -------------------------------------------------- */

/** Where the chip hangs: the pointer, in viewport coordinates. */
export interface TelegraphChipAnchor {
  x: number;
  y: number;
}

/**
 * The outcome chip that follows the cursor across the arena: what the
 * hovered tile costs, what aiming there would do to every body it
 * reaches, or the one sentence saying why it would do nothing. Hidden —
 * not emptied — when there is nothing to say, so the grid under it
 * stays clear.
 *
 * Paints a finished model (see telegraphChip in ./combatHud.ts) and
 * nothing else: no combat reads, no figures of its own.
 */
export function createTelegraphChip(): HudView<{
  chip: TelegraphChip | null;
  at: TelegraphChipAnchor | null;
}> {
  const el = div("nf-telegraph-chip");
  el.hidden = true;

  return {
    el,
    update({ chip, at }) {
      if (!chip || !at) {
        el.hidden = true;
        el.replaceChildren();
        return;
      }
      el.hidden = false;
      el.dataset.tone = chip.denial === null ? "ok" : "denied";
      // Anchored above and right of the cursor, and flipped to the other
      // side near an edge so a chip at the rim of the arena still reads.
      el.style.left = `${at.x}px`;
      el.style.top = `${at.y}px`;
      el.dataset.flipX = at.x > window.innerWidth * 0.6 ? "true" : "false";
      el.dataset.flipY = at.y < window.innerHeight * 0.3 ? "true" : "false";

      const parts: HTMLElement[] = [div("nf-telegraph-title", chip.title)];
      if (chip.denial !== null) {
        parts.push(div("nf-telegraph-denial", chip.denial));
      }
      if (chip.cost !== null) {
        parts.push(div("nf-telegraph-cost", chip.cost));
      }
      for (const outcome of chip.outcomes) {
        const line = div("nf-telegraph-outcome");
        if (!outcome.primary) line.classList.add("nf-telegraph-splash");
        line.append(
          div("nf-telegraph-target", outcome.name),
          div("nf-telegraph-figures", outcome.text),
        );
        parts.push(line);
      }
      el.replaceChildren(...parts);
    },
  };
}
