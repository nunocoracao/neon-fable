import { audio } from "../audio";
import { visualEquipment } from "../character";
import { resolveSpeakerPortrait, type ExpressionId } from "../data";
import {
  applyChoice,
  availableChoices,
  companionAside,
  getNode,
  type LoyaltyChange,
  type StandingChange,
  type StoryArc,
  type StoryNode,
} from "../narrative";
import { revealDelayMs, settings } from "../settings";
import { focusFirst } from "./focus";
import {
  companionName,
  loyaltyNote,
  requirementLabels,
  standingNote,
} from "./format";
import type { OverlayHandle } from "./overlay";
import { enemyPortraitCanvas, portraitCanvas } from "./portraits";
import type { Session } from "./session";

/**
 * Dialogue box over the iso scene. Renders the current story node and
 * its presented choices; all gating and effects go through the narrative
 * engine — this file never inspects requirements or applies effects
 * itself. Speaker identity resolves through the cast catalog: NPC
 * portrait on the left, the player's own on the right, active speaker
 * highlighted; narration renders portrait-free.
 */
export interface DialogueOverlayOptions {
  session: Session;
  arc: StoryArc;
  nodeId: string;
  /** Called after every applied choice so the HUD can refresh. */
  onStateChange(): void;
  /**
   * Called with each node as it is shown, so the scene behind the box
   * can follow the beat's staging (the hour it plays at).
   */
  onNode?(node: StoryNode): void;
  /** A start-combat effect fired; resume dialogue at resumeNodeId after. */
  onCombat(encounterId: string, resumeNodeId: string | null): void;
  /** A travel effect fired; continue dialogue at nextNodeId on the new map. */
  onTravel(mapId: string, nextNodeId: string | null): void;
  /** An open-stylist effect fired; resume dialogue at resumeNodeId after. */
  onStylist(resumeNodeId: string | null): void;
  /** An open-workbench effect fired; same handoff as the stylist's. */
  onWorkbench(resumeNodeId: string | null): void;
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
  /**
   * What the last choice moved with the people who watched it, shown
   * once on the beat that follows and then spent. A reaction belongs to
   * the moment it was earned, not to the rest of the conversation.
   */
  let lastLoyalty: LoyaltyChange[] = [];
  /**
   * What the last choice moved with the city, shown the same way and on
   * the same terms — except that only a band crossing is ever worth a
   * line, so most beats say nothing (see standingNote).
   */
  let lastStanding: StandingChange[] = [];

  const el = document.createElement("div");
  el.className = "nf-overlay nf-overlay-bottom";

  const panel = document.createElement("div");
  panel.className = "nf-panel nf-dialogue";
  el.append(panel);

  /**
   * One side of the portrait row. The expression is stamped on the
   * container so tests (and dev tooling) can read which variant the
   * bake used without decoding pixels.
   */
  function portraitSide(
    role: "npc" | "player",
    canvas: HTMLCanvasElement,
    active: boolean,
    expression: ExpressionId,
  ): HTMLDivElement {
    const side = document.createElement("div");
    side.className = `nf-dialogue-side ${
      active ? "nf-portrait-active" : "nf-portrait-dim"
    }`;
    side.dataset.role = role;
    side.dataset.expression = expression;
    side.append(canvas);
    return side;
  }

  function playerSide(active: boolean, expression: ExpressionId): HTMLDivElement {
    const player = session.state.player;
    return portraitSide(
      "player",
      portraitCanvas(player.appearance, player.equipment, expression),
      active,
      expression,
    );
  }

  function render(): void {
    const node = getNode(arc, nodeId);
    if (!node) {
      console.error(`Dialogue node "${nodeId}" not found in arc "${arc.id}"`);
      options.onComplete();
      return;
    }
    options.onNode?.(node);
    panel.replaceChildren();

    const portrait = resolveSpeakerPortrait(node);
    const row = document.createElement("div");
    row.className = "nf-dialogue-row";
    const main = document.createElement("div");
    main.className = "nf-dialogue-main";

    // NPC left, player right; the speaking side is highlighted, the
    // listening side dimmed. Narration keeps the row bare.
    if (portrait.kind === "npc") {
      row.append(
        portraitSide(
          "npc",
          portraitCanvas(
            portrait.visual.appearance,
            visualEquipment(portrait.visual),
            portrait.expression,
          ),
          true,
          portrait.expression,
        ),
      );
    } else if (portrait.kind === "machine") {
      // Nothing to compose and nothing to emote: the archetype's own
      // authored plate, the same one its initiative chip wears.
      row.append(
        portraitSide(
          "npc",
          enemyPortraitCanvas(portrait.enemyId, 0, "grim"),
          true,
          "grim",
        ),
      );
    }
    row.append(main);
    if (portrait.kind === "player") {
      row.append(playerSide(true, portrait.expression));
    } else if (portrait.kind !== "narration") {
      row.append(playerSide(false, "neutral"));
    }
    panel.append(row);

    const speakerName =
      portrait.kind === "player"
        ? session.state.player.name
        : portrait.kind === "narration"
          ? null
          : portrait.name;
    if (speakerName) {
      const speaker = document.createElement("div");
      speaker.className = "nf-dialogue-speaker";
      speaker.textContent = speakerName;
      main.append(speaker);
    }

    const text = document.createElement("p");
    text.className = "nf-dialogue-text";
    renderNodeText(text, node.text);
    main.append(text);

    // Whoever is standing at your shoulder gets to put an oar in. Pure
    // presentation: the aside is chosen by the narrative layer from the
    // node's authored comments and changes nothing about the scene.
    const aside = companionAside(node, session.state);
    if (aside) {
      const line = document.createElement("p");
      line.className = "nf-dialogue-aside";
      const who = document.createElement("span");
      who.className = "nf-dialogue-aside-name";
      who.textContent = companionName(aside.companionId);
      line.append(who, document.createTextNode(` ${aside.text}`));
      main.append(line);
    }

    if (lastLoyalty.length > 0) {
      const line = document.createElement("p");
      line.className = "nf-dialogue-loyalty";
      line.textContent = loyaltyNote(lastLoyalty);
      main.append(line);
      lastLoyalty = [];
    }

    const standingText = standingNote(lastStanding);
    lastStanding = [];
    if (standingText.length > 0) {
      const line = document.createElement("p");
      line.className = "nf-dialogue-standing";
      line.textContent = standingText;
      main.append(line);
    }

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
    main.append(choices);
    // Keyboard flow: Enter takes the focused (first enabled) choice.
    focusFirst(choices);
  }

  /**
   * Typewriter reveal: at non-instant speeds each character is a span
   * whose reveal animation starts after a per-index delay, so the full
   * text is always in the DOM (screen readers and tests see it whole)
   * and reduced-motion CSS collapses the reveal to instant. Clicking
   * the text skips to the end.
   */
  function renderNodeText(target: HTMLElement, content: string): void {
    const speed = settings.get().textSpeed;
    if (speed === "instant") {
      target.textContent = content;
      return;
    }
    for (let i = 0; i < content.length; i++) {
      const span = document.createElement("span");
      span.className = "nf-reveal-char";
      span.textContent = content[i] ?? "";
      span.style.animationDelay = `${revealDelayMs(i, speed)}ms`;
      target.append(span);
    }
    target.addEventListener("pointerdown", () =>
      target.classList.add("nf-reveal-skip"),
    );
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
    // A lone "Continue" is an advance; a real fork is a selection.
    const presented = availableChoices(session.state, node);
    audio.play(presented.length > 1 ? "choice-select" : "dialogue-advance");
    const outcome = applyChoice(session.state, node, choiceId);
    session.state = outcome.state;
    lastLoyalty = outcome.loyalty;
    lastStanding = outcome.standing;
    options.onStateChange();
    if (outcome.encounterId) {
      options.onCombat(outcome.encounterId, outcome.nextNodeId);
      return;
    }
    if (outcome.travelTo) {
      options.onTravel(outcome.travelTo, outcome.nextNodeId);
      return;
    }
    if (outcome.stylist) {
      options.onStylist(outcome.nextNodeId);
      return;
    }
    if (outcome.workbench) {
      options.onWorkbench(outcome.nextNodeId);
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
