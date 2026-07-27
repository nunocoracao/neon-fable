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
import type { OverlayHandle } from "./overlay";
import type { Session } from "./session";

/**
 * Advancement panel: review chapter-earned points and spend them on
 * stat raises or ability unlocks. Every action dispatches into the pure
 * character/advancement functions; costs and pools are content, and
 * typed AdvancementErrors surface here as messages.
 */
export interface AdvancementOverlayOptions {
  session: Session;
  onStateChange(): void;
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
    available.textContent = `Unspent: ${pointsLabel(availablePoints(session.state))}`;
    status.append(available);
    for (const grant of chapterGrants) {
      const chapter = document.createElement("span");
      chapter.className = session.state.flags[grant.flag] ? "" : "nf-dim";
      chapter.textContent = session.state.flags[grant.flag]
        ? `${grant.label} · +${pointsLabel(grant.points)}`
        : `${grant.label} · not yet complete`;
      status.append(chapter);
    }
    container.append(status);
  }

  function renderStats(container: HTMLElement): void {
    const { player } = session.state;
    const section = document.createElement("div");
    section.className = "nf-inventory-section";
    const heading = document.createElement("h3");
    heading.textContent = `Raise a stat (${pointsLabel(STAT_RAISE_COST)} each)`;
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
        cap.textContent = "At cap";
        row.append(cap);
      } else {
        row.append(
          actionButton("Raise", () =>
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
    heading.textContent = "Unlock an ability";
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
      cost.textContent = `Ability · ${pointsLabel(entry.cost)}`;
      const description = document.createElement("div");
      description.className = "nf-item-effects";
      description.textContent = ability.description;
      card.append(name, cost, description);

      if (player.advancement.abilityIds.includes(entry.abilityId)) {
        const unlocked = document.createElement("div");
        unlocked.className = "nf-dim";
        unlocked.textContent = "Unlocked";
        card.append(unlocked);
      } else {
        card.append(
          actionButton("Unlock", () =>
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
    title.textContent = "Advancement";
    const close = document.createElement("button");
    close.className = "nf-button nf-button-small";
    close.textContent = "Close [Esc]";
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
    renderStats(columns);
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
