import {
  AdvancementError,
  STAT_HARD_CAP,
  STAT_KEYS,
  availablePoints,
  raiseStat,
  unlockAbility,
  type CharacterState,
} from "../character";
import { advancementPool, getAbility } from "../data/abilities";
import { STAT_RAISE_COST, chapterGrants } from "../data/advancement";
import { pointsLabel, statLabel } from "./format";
import { credLabel, perkPanel, pickLabel } from "./perkModel";
import type { OverlayHandle } from "./overlay";
import type { Session } from "./session";
import { t } from "./strings";

/**
 * Advancement panel: review chapter-earned points and spend them on
 * stat raises or ability unlocks. Every action dispatches into the pure
 * character/advancement functions; costs and pools are content, and
 * typed AdvancementErrors surface here as messages.
 */
export interface AdvancementOverlayOptions {
  session: Session;
  onStateChange(): void;
  /**
   * Opens the perk pick. Taking a perk is its own screen — it spends a
   * different currency and it is permanent — so this panel reports what
   * the street owes and hands over rather than growing a third column.
   */
  onOpenPerks(): void;
  onClose(): void;
}

export function createAdvancementOverlay(
  options: AdvancementOverlayOptions,
): OverlayHandle {
  const { session } = options;

  const el = document.createElement("div");
  el.className = "nf-overlay nf-overlay-center";

  const panel = document.createElement("div");
  panel.className = "nf-panel nf-advancement";
  el.append(panel);

  let message = "";
  let messageIsError = false;

  function apply(action: () => CharacterState): void {
    try {
      session.state = { ...session.state, player: action() };
      message = "";
      messageIsError = false;
      options.onStateChange();
    } catch (error) {
      if (error instanceof AdvancementError) {
        message = error.message;
        messageIsError = true;
      } else {
        throw error;
      }
    }
    render();
  }

  function actionButton(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.className = "nf-button nf-button-small";
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  function renderStatus(container: HTMLElement): void {
    const status = document.createElement("div");
    status.className = "nf-inventory-status";
    const available = document.createElement("span");
    available.className = "nf-advancement-available";
    available.textContent = t("advance.unspent", {
      points: pointsLabel(availablePoints(session.state)),
    });
    status.append(available);
    for (const grant of chapterGrants) {
      const chapter = document.createElement("span");
      chapter.className = session.state.flags[grant.flag] ? "" : "nf-dim";
      chapter.textContent = session.state.flags[grant.flag]
        ? t("advance.chapter.granted", {
            label: grant.label,
            points: pointsLabel(grant.points),
          })
        : t("advance.chapter.pending", { label: grant.label });
      status.append(chapter);
    }
    container.append(status);

    // The other currency, on the same shelf: what the city has noticed,
    // and whether it currently owes this runner a decision.
    const view = perkPanel(session.state);
    const street = document.createElement("div");
    street.className = "nf-inventory-status nf-cred-status";
    const cred = document.createElement("span");
    cred.className = "nf-advancement-available";
    cred.textContent = credLabel(view);
    street.append(cred);
    const next = document.createElement("span");
    next.className = "nf-dim";
    next.textContent = view.next
      ? t("advance.nextMilestone", {
          label: view.next.label,
          cred: view.next.cred,
        })
      : t("advance.allMilestones");
    street.append(next);
    container.append(street);
  }

  /**
   * The perks this runner has, with what each one does — the character
   * sheet's own record of who the street thinks they are. Read-only:
   * taking one happens on the pick screen, and nothing gives one back.
   */
  function renderPerks(container: HTMLElement): void {
    const view = perkPanel(session.state);
    const section = document.createElement("div");
    section.className = "nf-inventory-section nf-perk-section";
    const heading = document.createElement("h3");
    heading.textContent = t("advance.perks");
    section.append(heading);

    const grid = document.createElement("div");
    grid.className = "nf-item-grid";
    if (view.taken.length === 0) {
      const empty = document.createElement("p");
      empty.className = "nf-dim";
      empty.textContent = t("advance.noPerks");
      grid.append(empty);
    }
    for (const perk of view.taken) {
      const card = document.createElement("div");
      card.className = "nf-item-card nf-perk-card";
      card.dataset.perk = perk.id;
      const name = document.createElement("div");
      name.className = "nf-item-name";
      name.textContent = perk.name;
      const domain = document.createElement("div");
      domain.className = "nf-item-summary";
      domain.textContent = perk.domainLabel;
      const effect = document.createElement("div");
      effect.className = "nf-perk-effect";
      effect.textContent = perk.effect;
      card.append(name, domain, effect);
      grid.append(card);
    }
    section.append(grid);

    const open = actionButton(
      view.picks > 0
        ? t("advance.choosePerk", { picks: pickLabel(view.picks) })
        : t("advance.viewPerks"),
      options.onOpenPerks,
    );
    if (view.picks > 0) open.classList.add("nf-button-attention");
    section.append(open);
    container.append(section);
  }

  function renderStats(container: HTMLElement): void {
    const { player } = session.state;
    const section = document.createElement("div");
    section.className = "nf-inventory-section";
    const heading = document.createElement("h3");
    heading.textContent = t("advance.raiseStat", {
      cost: pointsLabel(STAT_RAISE_COST),
    });
    section.append(heading);

    for (const stat of STAT_KEYS) {
      const row = document.createElement("div");
      row.className = "nf-slot-row";
      const label = document.createElement("span");
      label.className = "nf-slot-label";
      label.textContent = statLabel(stat);
      const value = document.createElement("span");
      value.className = "nf-slot-value";
      value.textContent = `${player.stats[stat]}`;
      row.append(label, value);
      if (player.stats[stat] >= STAT_HARD_CAP) {
        const cap = document.createElement("span");
        cap.className = "nf-dim";
        cap.textContent = t("advance.atCap");
        row.append(cap);
      } else {
        row.append(
          actionButton(t("advance.raise"), () =>
            apply(() => raiseStat(session.state, stat)),
          ),
        );
      }
      section.append(row);
    }
    container.append(section);
  }

  function renderAbilities(container: HTMLElement): void {
    const { player } = session.state;
    const section = document.createElement("div");
    section.className = "nf-inventory-section";
    const heading = document.createElement("h3");
    heading.textContent = t("advance.unlockAbility");
    section.append(heading);

    const grid = document.createElement("div");
    grid.className = "nf-item-grid";
    for (const entry of advancementPool) {
      const ability = getAbility(entry.abilityId);
      if (!ability) {
        console.error(`Unknown ability id in pool: ${entry.abilityId}`);
        continue;
      }
      const card = document.createElement("div");
      card.className = "nf-item-card";

      const name = document.createElement("div");
      name.className = "nf-item-name";
      name.textContent = ability.name;
      const cost = document.createElement("div");
      cost.className = "nf-item-summary";
      cost.textContent = t("advance.abilityCost", {
        cost: pointsLabel(entry.cost),
      });
      const description = document.createElement("div");
      description.className = "nf-item-effects";
      description.textContent = ability.description;
      card.append(name, cost, description);

      if (player.advancement.abilityIds.includes(entry.abilityId)) {
        const unlocked = document.createElement("div");
        unlocked.className = "nf-dim";
        unlocked.textContent = t("advance.unlocked");
        card.append(unlocked);
      } else {
        card.append(
          actionButton(t("advance.unlock"), () =>
            apply(() => unlockAbility(session.state, entry.abilityId)),
          ),
        );
      }
      grid.append(card);
    }
    section.append(grid);
    container.append(section);
  }

  function render(): void {
    panel.replaceChildren();

    const header = document.createElement("div");
    header.className = "nf-panel-header";
    const title = document.createElement("h2");
    title.textContent = t("advance.title");
    const close = document.createElement("button");
    close.className = "nf-button nf-button-small";
    close.textContent = t("common.closeEsc");
    close.addEventListener("click", options.onClose);
    header.append(title, close);
    panel.append(header);

    renderStatus(panel);

    const messageLine = document.createElement("p");
    messageLine.className = messageIsError ? "nf-message nf-error" : "nf-message";
    messageLine.textContent = message;
    panel.append(messageLine);

    const columns = document.createElement("div");
    columns.className = "nf-inventory-columns";
    const left = document.createElement("div");
    left.className = "nf-inventory-column";
    renderStats(left);
    renderPerks(left);
    columns.append(left);
    renderAbilities(columns);
    panel.append(columns);
  }

  render();

  return {
    el,
    destroy(): void {
      el.remove();
    },
  };
}
