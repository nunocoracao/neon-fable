// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureCharacter } from "../character/testSupport";
import { PLAYER_SPEAKER, type StoryArc, type StoryNode } from "../narrative";
import { createNewGame, recruitCompanion } from "../state";
import { createDialogueOverlay } from "./dialogueOverlay";
import type { OverlayHandle } from "./overlay";
import { createSession, type Session } from "./session";

/**
 * Drives the dialogue overlay in happy-dom. The canvas 2D context is
 * stubbed — portrait pixels are not under test, only that speaker
 * identity resolves to the right portrait sides, the active speaker is
 * highlighted, expressions stamp through from line data, and narration
 * renders portrait-free.
 */

/** A value whose every property/call yields another such value — enough to
 * satisfy the canvas 2D API without rendering anything. */
function anything(): unknown {
  const fn = (): unknown => anything();
  return new Proxy(fn, {
    get: (_target, prop) =>
      prop === Symbol.toPrimitive ? () => 0 : anything(),
    set: () => true,
    apply: () => anything(),
  });
}

const endChoice = {
  id: "done",
  label: "Done.",
  effects: [{ type: "end" } as const],
};

const arc: StoryArc = {
  id: "test-arc",
  title: "Test Arc",
  entryNodeId: "npc-line",
  nodes: [
    {
      id: "npc-line",
      speaker: "Sable",
      expression: "grim",
      text: "The fixer waits.",
      choices: [endChoice],
    },
    {
      id: "player-line",
      speaker: PLAYER_SPEAKER,
      expression: "smile",
      text: "You answer.",
      choices: [endChoice],
    },
    {
      id: "narration",
      text: "Rain drums on the skylight.",
      choices: [endChoice],
    },
    {
      id: "unlisted-line",
      speaker: "A Passing Stranger",
      text: "Spare a chit?",
      choices: [endChoice],
    },
    {
      id: "commented-line",
      text: "The cage has not moved in a season.",
      comments: [
        { companionId: "vesper", text: "\"That's parked, not lost.\"" },
      ],
      choices: [endChoice],
    },
    {
      id: "staged-line",
      text: "The hour turns over.",
      dayPhase: "late",
      choices: [{ id: "on", label: "On.", target: "narration" }],
    },
  ],
};

let session: Session;
let handle: OverlayHandle | undefined;

function open(nodeId: string, onNode?: (node: StoryNode) => void): void {
  handle = createDialogueOverlay({
    session,
    arc,
    nodeId,
    onNode,
    onStateChange: () => {},
    onCombat: () => {},
    onTravel: () => {},
    onStylist: () => {},
    onWorkbench: () => {},
    onEnded: () => {},
    onComplete: () => {},
  });
  document.body.append(handle.el);
}

function side(role: "npc" | "player"): HTMLElement | null {
  return document.querySelector(`.nf-dialogue-side[data-role="${role}"]`);
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    anything() as never,
  );
  session = createSession(
    createNewGame({ character: fixtureCharacter({ name: "Vex" }) }),
  );
});

afterEach(() => {
  handle?.destroy();
  handle = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("companion asides", () => {
  it("prints the active companion's line under the beat, named", () => {
    session.state = {
      ...session.state,
      party: recruitCompanion(session.state.party, "vesper"),
    };
    open("commented-line");
    const aside = document.querySelector(".nf-dialogue-aside");
    expect(aside?.textContent).toContain("Vesper Kade");
    expect(aside?.textContent).toContain("That's parked, not lost.");
    expect(
      aside?.querySelector(".nf-dialogue-aside-name")?.textContent,
    ).toBe("Vesper Kade");
  });

  it("says nothing when nobody is walking with the player", () => {
    open("commented-line");
    expect(document.querySelector(".nf-dialogue-aside")).toBeNull();
    // The beat itself is untouched.
    expect(document.querySelector(".nf-dialogue-text")?.textContent).toBe(
      "The cage has not moved in a season.",
    );
  });
});

describe("dialogue portraits", () => {
  it("shows the NPC active on the left and the player dimmed on the right", () => {
    open("npc-line");
    const npc = side("npc");
    const player = side("player");
    expect(npc).not.toBeNull();
    expect(player).not.toBeNull();
    expect(npc?.classList.contains("nf-portrait-active")).toBe(true);
    expect(player?.classList.contains("nf-portrait-dim")).toBe(true);
    expect(npc?.querySelector("canvas.nf-portrait")).not.toBeNull();
    expect(player?.querySelector("canvas.nf-portrait")).not.toBeNull();
    // NPC left of the text, player right of it.
    const row = document.querySelector(".nf-dialogue-row");
    expect([...(row?.children ?? [])].map((c) => c.className.split(" ")[0]))
      .toEqual(["nf-dialogue-side", "nf-dialogue-main", "nf-dialogue-side"]);
    expect(document.querySelector(".nf-dialogue-speaker")?.textContent).toBe(
      "Sable",
    );
  });

  it("plays the line's expression on the speaking portrait only", () => {
    open("npc-line");
    expect(side("npc")?.dataset.expression).toBe("grim");
    expect(side("player")?.dataset.expression).toBe("neutral");
  });

  it("shows the player active under their own name on player lines", () => {
    open("player-line");
    expect(side("npc")).toBeNull();
    const player = side("player");
    expect(player?.classList.contains("nf-portrait-active")).toBe(true);
    expect(player?.dataset.expression).toBe("smile");
    expect(document.querySelector(".nf-dialogue-speaker")?.textContent).toBe(
      "Vex",
    );
  });

  it("renders narration portrait-free", () => {
    open("narration");
    expect(document.querySelector(".nf-dialogue-side")).toBeNull();
    expect(document.querySelector(".nf-dialogue-speaker")).toBeNull();
    expect(
      document.querySelector(".nf-dialogue-text")?.textContent,
    ).toContain("Rain drums");
  });

  it("degrades an unlisted speaker to a named line without an NPC portrait", () => {
    open("unlisted-line");
    expect(side("npc")).toBeNull();
    expect(side("player")?.classList.contains("nf-portrait-dim")).toBe(true);
    expect(document.querySelector(".nf-dialogue-speaker")?.textContent).toBe(
      "A Passing Stranger",
    );
  });
});

describe("scene staging", () => {
  it("reports every node it shows, so the scene can follow the beat", () => {
    const shown: StoryNode[] = [];
    open("staged-line", (node) => shown.push(node));
    expect(shown.map((node) => node.id)).toEqual(["staged-line"]);
    expect(shown[0]?.dayPhase).toBe("late");

    // Advancing reports the next line, staging and all — a beat that
    // sets no hour reports none rather than restating the last.
    document.querySelector<HTMLButtonElement>(".nf-choice")?.click();
    expect(shown.map((node) => node.id)).toEqual(["staged-line", "narration"]);
    expect(shown[1]?.dayPhase).toBeUndefined();
  });

  it("is optional — dialogue runs without anyone listening", () => {
    expect(() => open("staged-line")).not.toThrow();
    expect(document.querySelector(".nf-dialogue-text")?.textContent).toContain(
      "hour turns over",
    );
  });
});
