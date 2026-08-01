import { AdvancementError, choosePerk, type CharacterState } from "../character";
import { audio } from "../audio";
import { credLabel, perkPanel, pickLabel, type PerkCard } from "./perkModel";
import type { OverlayHandle } from "./overlay";
import type { Session } from "./session";

/**
 * The perk pick: a milestone reached, and one permanent decision about
 * who this runner is.
 *
 * Built on the advancement panel's patterns — the same card grid, the
 * same "dispatch into the pure function and surface its typed error as
 * a message" loop — because it is the same kind of screen. Everything
 * shown comes from perkPanel (./perkModel.ts); nothing here derives a
 * figure or decides what is on offer.
 *
 * A pick is permanent, so the button says so before it is pressed:
 * every card carries its effect in plain words, and the confirm is a
 * second click on the same card rather than a dialog that could be
 * dismissed by accident.
 */
export interface PerkOverlayOptions {
  session: Session;
  onStateChange(): void;
  onClose(): void;
}

export function createPerkOverlay(options: PerkOverlayOptions): OverlayHandle {
  const { session } = options;

  const el = document.createElement("div");
  el.className = "nf-overlay nf-overlay-center";

  const panel = document.createElement("div");
  panel.className = "nf-panel nf-advancement nf-perks";
  el.append(panel);

  let message = "";
  let messageIsError = false;
  /** The card waiting on its confirm click; a pick is never one click. */
  let pending: string | null = null;

  function apply(action: () => CharacterState): void {
    try {
      session.state = { ...session.state, player: action() };
      message = "";
      messageIsError = false;
      audio.emit("ui.perk.pick");
      options.onStateChange();
    } catch (error) {
      if (error instanceof AdvancementError) {
        message = error.message;
        messageIsError = true;
      } else {
        throw error;
      }
    }
    pending = null;
    render();
  }

  function actionButton(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.className = "nf-button nf-button-small";
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  function perkCard(card: PerkCard, picks: number): HTMLElement {
    const el = document.createElement("div");
    el.className = "nf-item-card nf-perk-card";
    el.dataset.perk = card.id;
    el.dataset.domain = card.domain;

    const name = document.createElement("div");
    name.className = "nf-item-name";
    name.textContent = card.name;
    const domain = document.createElement("div");
    domain.className = "nf-item-summary";
    domain.textContent = card.domainLabel;
    const effect = document.createElement("div");
    effect.className = "nf-perk-effect";
    effect.textContent = card.effect;
    const description = document.createElement("div");
    description.className = "nf-item-effects";
    description.textContent = card.description;
    el.append(name, domain, effect, description);

    if (card.taken) {
      const taken = document.createElement("div");
      taken.className = "nf-dim";
      taken.textContent = "Yours";
      el.append(taken);
      return el;
    }
    if (picks < 1) return el;

    if (pending === card.id) {
      el.append(
        actionButton("Confirm — this is permanent", () =>
          apply(() => choosePerk(session.state, card.id)),
        ),
      );
    } else {
      el.append(
        actionButton("Take", () => {
          pending = card.id;
          message = `${card.name} is a permanent choice. Confirm to take it.`;
          messageIsError = false;
          render();
        }),
      );
    }
    return el;
  }

  function renderStatus(view: ReturnType<typeof perkPanel>): void {
    const status = document.createElement("div");
    status.className = "nf-inventory-status";

    const cred = document.createElement("span");
    cred.className = "nf-advancement-available";
    cred.textContent = credLabel(view);
    status.append(cred);

    const picks = document.createElement("span");
    picks.className = view.picks > 0 ? "nf-advancement-available" : "nf-dim";
    picks.textContent =
      view.picks > 0 ? pickLabel(view.picks) : "No pick waiting";
    status.append(picks);

    if (view.next) {
      const next = document.createElement("span");
      next.className = "nf-dim";
      next.textContent = `Next: ${view.next.label} at ${view.next.cred}`;
      status.append(next);
    }
    panel.append(status);

    // Where the cred came from — the same lines the derivation summed.
    const breakdown = document.createElement("div");
    breakdown.className = "nf-item-effects nf-cred-lines";
    breakdown.textContent =
      view.lines.length > 0
        ? view.lines.map((line) => `${line.label} +${line.cred}`).join(" · ")
        : "Nothing the city has noticed yet.";
    panel.append(breakdown);
  }

  function renderSection(
    title: string,
    cards: PerkCard[],
    picks: number,
    emptyText: string,
  ): void {
    const section = document.createElement("div");
    section.className = "nf-inventory-section";
    const heading = document.createElement("h3");
    heading.textContent = title;
    section.append(heading);
    const grid = document.createElement("div");
    grid.className = "nf-item-grid";
    if (cards.length === 0) {
      const empty = document.createElement("p");
      empty.className = "nf-dim";
      empty.textContent = emptyText;
      grid.append(empty);
    }
    for (const card of cards) grid.append(perkCard(card, picks));
    section.append(grid);
    panel.append(section);
  }

  function render(): void {
    panel.replaceChildren();
    const view = perkPanel(session.state);

    const header = document.createElement("div");
    header.className = "nf-panel-header";
    const title = document.createElement("h2");
    title.textContent = "Perks";
    const close = document.createElement("button");
    close.className = "nf-button nf-button-small";
    close.textContent = "Close [Esc]";
    close.addEventListener("click", options.onClose);
    header.append(title, close);
    panel.append(header);

    const headline = document.createElement("p");
    headline.className = "nf-chapter-end-text";
    headline.textContent = view.headline;
    panel.append(headline);

    renderStatus(view);

    const messageLine = document.createElement("p");
    messageLine.className = messageIsError
      ? "nf-message nf-error"
      : "nf-message";
    messageLine.textContent = message;
    panel.append(messageLine);

    renderSection(
      "Taken",
      view.taken,
      0,
      "Nothing yet — the street has not made its mind up about you.",
    );
    renderSection(
      view.picks > 0 ? "Choose one" : "On offer",
      view.choices,
      view.picks,
      "You have taken everything there is to take.",
    );
  }

  render();

  return {
    el,
    destroy(): void {
      el.remove();
    },
  };
}
