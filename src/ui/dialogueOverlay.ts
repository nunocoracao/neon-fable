import {
  applyChoice,
  availableChoices,
  getNode,
  type StoryArc,
} from "../narrative";
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

  return {
    el,
    destroy(): void {
      el.remove();
    },
  };
}
