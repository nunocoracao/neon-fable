import {
  applyChoice,
  availableChoices,
  getNode,
  type StoryArc,
} from "../narrative";
import { focusFirst } from "./focus";
import { requirementLabels } from "./format";
import type { OverlayHandle } from "./overlay";
import type { Session } from "./session";

/**
 * Dialogue box over the iso scene. Renders the current story node and
 * its presented choices; all gating and effects go through the narrative
 * engine — this file never inspects requirements or applies effects
 * itself.
 */
export interface DialogueOverlayOptions {
  session: Session;
  arc: StoryArc;
  nodeId: string;
  /** Called after every applied choice so the HUD can refresh. */
  onStateChange(): void;
  /** A start-combat effect fired; resume dialogue at resumeNodeId after. */
  onCombat(encounterId: string, resumeNodeId: string | null): void;
  /** A travel effect fired; continue dialogue at nextNodeId on the new map. */
  onTravel(mapId: string, nextNodeId: string | null): void;
  /** An end marker fired. */
  onEnded(endingId: string | undefined): void;
  /** The node chain ran out without an end marker. */
  onComplete(): void;
}

export function createDialogueOverlay(
  options: DialogueOverlayOptions,
): OverlayHandle {
  const { session, arc } = options;
  let nodeId = options.nodeId;

  const el = document.createElement("div");
  el.className = "nf-overlay nf-overlay-bottom";

  const panel = document.createElement("div");
  panel.className = "nf-panel nf-dialogue";
  el.append(panel);

  function render(): void {
    const node = getNode(arc, nodeId);
    if (!node) {
      console.error(`Dialogue node "${nodeId}" not found in arc "${arc.id}"`);
      options.onComplete();
      return;
    }
    panel.replaceChildren();

    if (node.speaker) {
      const speaker = document.createElement("div");
      speaker.className = "nf-dialogue-speaker";
      speaker.textContent = node.speaker;
      panel.append(speaker);
    }

    const text = document.createElement("p");
    text.className = "nf-dialogue-text";
    text.textContent = node.text;
    panel.append(text);

    const choices = document.createElement("div");
    choices.className = "nf-dialogue-choices";
    for (const presented of availableChoices(session.state, node)) {
      const button = document.createElement("button");
      button.className = "nf-choice";
      button.textContent = presented.choice.label;
      if (presented.enabled) {
        button.addEventListener("click", () => takeChoice(presented.choice.id));
      } else {
        button.disabled = true;
        const reason = document.createElement("span");
        reason.className = "nf-choice-req";
        reason.textContent = requirementLabels(presented.choice.requirements);
        button.append(" ", reason);
      }
      choices.append(button);
    }
    panel.append(choices);
    // Keyboard flow: Enter takes the focused (first enabled) choice.
    focusFirst(choices);
  }

  /** Number keys pick choices: 1 takes the first presented choice, etc. */
  function onKeyDown(event: KeyboardEvent): void {
    const index = Number.parseInt(event.key, 10);
    if (!Number.isInteger(index) || index < 1 || index > 9) return;
    const button = panel.querySelectorAll<HTMLButtonElement>(".nf-choice")[
      index - 1
    ];
    if (button && !button.disabled) {
      event.preventDefault();
      button.click();
    }
  }

  function takeChoice(choiceId: string): void {
    const node = getNode(arc, nodeId);
    if (!node) return;
    const outcome = applyChoice(session.state, node, choiceId);
    session.state = outcome.state;
    options.onStateChange();
    if (outcome.encounterId) {
      options.onCombat(outcome.encounterId, outcome.nextNodeId);
      return;
    }
    if (outcome.travelTo) {
      options.onTravel(outcome.travelTo, outcome.nextNodeId);
      return;
    }
    if (outcome.ended) {
      options.onEnded(outcome.endingId);
      return;
    }
    if (outcome.nextNodeId) {
      nodeId = outcome.nextNodeId;
      render();
      return;
    }
    options.onComplete();
  }

  render();
  window.addEventListener("keydown", onKeyDown);

  return {
    el,
    destroy(): void {
      window.removeEventListener("keydown", onKeyDown);
      el.remove();
    },
  };
}
