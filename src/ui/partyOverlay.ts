import { audio } from "../audio";
import { companionsArc, getCompanion, getItem } from "../data";
import { readyPersonalScenes } from "../narrative";
import { setActiveCompanion, type PartyMember } from "../state";
import { companionName, loyaltyLabel } from "./format";
import type { OverlayHandle } from "./overlay";
import { companionPortraitCanvas } from "./portraits";
import type { Session } from "./session";

/**
 * The crew panel: who has joined, who is walking with you, and who has
 * something they want to say. Switching is a party-state call and
 * nothing else — the rule that only one companion is out at a time
 * lives in setActiveCompanion, so this file never counts anybody.
 *
 * The private word opens the crew arc's hub node, which gates each
 * scene on the same three conditions personalSceneReady checks; the
 * button is only offered when at least one of them would open.
 */
export interface PartyOverlayOptions {
  session: Session;
  onStateChange(): void;
  /** Open a dialogue node — the crew arc's hub. */
  onTalk(nodeId: string): void;
  onClose(): void;
}

export function createPartyOverlay(
  options: PartyOverlayOptions,
): OverlayHandle {
  const { session } = options;

  const el = document.createElement("div");
  el.className = "nf-overlay nf-overlay-center";

  const panel = document.createElement("div");
  panel.className = "nf-panel nf-party";
  el.append(panel);

  function actionButton(
    label: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.className = "nf-button nf-button-small";
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  function switchTo(companionId: string | null): void {
    session.state = {
      ...session.state,
      party: setActiveCompanion(session.state.party, companionId),
    };
    audio.play("equip");
    options.onStateChange();
    render();
  }

  function gearLine(member: PartyMember): string {
    return [member.equipment.weapon, member.equipment.outfit]
      .map((id) => (id ? (getItem(id)?.name ?? id) : null))
      .filter((name): name is string => name !== null)
      .join(" · ");
  }

  function renderMember(container: HTMLElement, member: PartyMember): void {
    const companion = getCompanion(member.companionId);
    const card = document.createElement("div");
    card.className = member.active
      ? "nf-party-card nf-party-active"
      : "nf-party-card";
    card.dataset.companion = member.companionId;

    card.append(
      companionPortraitCanvas(member.companionId, member.lookId),
    );

    const body = document.createElement("div");
    body.className = "nf-party-body";

    const name = document.createElement("div");
    name.className = "nf-item-name";
    name.textContent = companionName(member.companionId);
    body.append(name);

    if (companion) {
      const blurb = document.createElement("div");
      blurb.className = "nf-item-summary";
      blurb.textContent = companion.blurb;
      body.append(blurb);
    }

    const status = document.createElement("div");
    status.className = "nf-party-status";
    status.textContent = [
      `HP ${member.hp}/${member.maxHp}`,
      loyaltyLabel(member.loyalty),
      gearLine(member),
    ]
      .filter((part) => part.length > 0)
      .join(" · ");
    body.append(status);

    if (ready.has(member.companionId)) {
      const waiting = document.createElement("div");
      waiting.className = "nf-party-waiting";
      waiting.textContent = `${companionName(member.companionId)} has something to say.`;
      body.append(waiting);
    }

    card.append(body);

    const actions = document.createElement("div");
    actions.className = "nf-party-actions";
    if (member.active) {
      const out = document.createElement("span");
      out.className = "nf-party-out";
      out.textContent = "With you";
      actions.append(out, actionButton("Stand down", () => switchTo(null)));
    } else {
      actions.append(
        actionButton("Take along", () => switchTo(member.companionId)),
      );
    }
    card.append(actions);
    container.append(card);
  }

  /** Companion ids with a personal scene waiting, recomputed per render. */
  let ready = new Set<string>();

  function render(): void {
    ready = new Set(
      readyPersonalScenes(session.state).map((scene) => scene.companionId),
    );
    panel.replaceChildren();

    const header = document.createElement("div");
    header.className = "nf-panel-header";
    const title = document.createElement("h2");
    title.textContent = "Crew";
    const close = document.createElement("button");
    close.className = "nf-button nf-button-small";
    close.textContent = "Close [Esc]";
    close.addEventListener("click", options.onClose);
    header.append(title, close);
    panel.append(header);

    const note = document.createElement("p");
    note.className = "nf-message";
    note.textContent =
      session.state.party.members.length === 0
        ? "Nobody has thrown in with you yet."
        : "One of them walks with you at a time. Swap between jobs.";
    panel.append(note);

    const list = document.createElement("div");
    list.className = "nf-party-list";
    for (const member of session.state.party.members) {
      renderMember(list, member);
    }
    panel.append(list);

    if (ready.size > 0) {
      const talk = actionButton("A word in private", () => {
        audio.play("ui-confirm");
        options.onTalk(companionsArc.entryNodeId);
      });
      talk.classList.add("nf-button-attention");
      panel.append(talk);
    }
  }

  render();

  return {
    el,
    destroy(): void {
      el.remove();
    },
  };
}
