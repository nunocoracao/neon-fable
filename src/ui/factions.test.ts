// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureCharacter } from "../character/testSupport";
import type { StoryArc } from "../narrative";
import { applyStanding, createNewGame, emptyReputation } from "../state";
import { createDialogueOverlay } from "./dialogueOverlay";
import { createInventoryOverlay } from "./inventoryOverlay";
import type { OverlayHandle } from "./overlay";
import { createSession, type Session } from "./session";

/**
 * The city's ledger as the player meets it: the standings section on
 * the character screen, and the one line a scene prints when a faction
 * changes what it calls you. The arithmetic is proven in
 * src/state/reputation.test.ts and the rows in ./factionModel.test.ts;
 * what is asked here is whether any of it reaches the screen.
 */

function anything(): unknown {
  const fn = (): unknown => anything();
  return new Proxy(fn, {
    get: (_target, prop) =>
      prop === Symbol.toPrimitive ? () => 0 : anything(),
    set: () => true,
    apply: () => anything(),
  });
}

const arc: StoryArc = {
  id: "test-arc",
  title: "Test Arc",
  entryNodeId: "start",
  nodes: [
    {
      id: "start",
      text: "The boards read their own names.",
      choices: [
        {
          id: "expose",
          label: "Tell them.",
          target: "after",
          standing: { market: 24, auric: -2 },
        },
        { id: "walk", label: "Walk away.", target: "after" },
      ],
    },
    { id: "after", text: "The gallery goes quiet.", choices: [] },
  ],
};

let session: Session;
let handle: OverlayHandle | undefined;

function rows(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(".nf-faction-row")];
}

function rowFor(factionId: string): HTMLElement {
  const row = rows().find((el) => el.dataset.faction === factionId);
  if (!row) throw new Error(`no standing row for "${factionId}"`);
  return row;
}

function openInventory(): void {
  handle = createInventoryOverlay({
    session,
    onStateChange: () => {},
    onClose: () => {},
  });
  document.body.append(handle.el);
}

function openDialogue(): void {
  handle = createDialogueOverlay({
    session,
    arc,
    nodeId: "start",
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

function click(text: string): void {
  const button = [...document.querySelectorAll("button")].find((b) =>
    (b.textContent ?? "").trim().startsWith(text),
  );
  if (!button) throw new Error(`no button labelled "${text}"`);
  button.click();
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

describe("standings on the character screen", () => {
  it("lists every faction with its band and its description", () => {
    session.state = {
      ...session.state,
      reputation: applyStanding(emptyReputation(), { court: 62, auric: -70 }),
    };
    openInventory();

    expect(rows()).toHaveLength(3);
    const court = rowFor("court");
    expect(court.textContent).toContain("The Cistern Court");
    expect(court.querySelector(".nf-faction-band")?.textContent).toBe(
      "Trusted",
    );
    expect(court.querySelector(".nf-faction-band")?.className).toContain(
      "nf-band-trusted",
    );
    expect(court.querySelector(".nf-item-summary")?.textContent).toContain(
      "Undercroft",
    );
    expect(
      rowFor("auric").querySelector(".nf-faction-band")?.textContent,
    ).toBe("Hostile");
  });

  it("leans the meter the way the standing goes", () => {
    session.state = {
      ...session.state,
      reputation: applyStanding(emptyReputation(), { court: 50, auric: -50 }),
    };
    openInventory();

    const court = rowFor("court").querySelector<HTMLElement>(
      ".nf-standing-fill",
    )!;
    expect(court.style.left).toBe("50%");
    expect(court.style.width).toBe("25%");
    expect(court.className).toContain("nf-standing-positive");

    const auric = rowFor("auric").querySelector<HTMLElement>(
      ".nf-standing-fill",
    )!;
    expect(auric.style.left).toBe("25%");
    expect(auric.className).toContain("nf-standing-negative");
  });

  it("shows a fresh run as three neutral names, never as an error", () => {
    openInventory();
    for (const row of rows()) {
      expect(row.querySelector(".nf-faction-band")?.textContent).toBe(
        "Neutral",
      );
    }
  });
});

describe("the line a scene prints when the city changes its mind", () => {
  it("names the faction and the word it now uses", () => {
    openDialogue();
    click("Tell them.");
    const line = document.querySelector(".nf-dialogue-standing");
    expect(line?.textContent).toBe("The Vertical Market: Warm");
    expect(session.state.reputation.standing.market).toBe(24);
  });

  it("says nothing for a shift too small to change the word", () => {
    // The Combine's -2 moves the number without moving the band, and
    // the Market's crossing is the only thing worth a line.
    openDialogue();
    click("Tell them.");
    expect(document.querySelector(".nf-dialogue-standing")?.textContent).toBe(
      "The Vertical Market: Warm",
    );
    expect(session.state.reputation.standing.auric).toBe(-2);
  });

  it("says nothing at all for an untagged choice", () => {
    openDialogue();
    click("Walk away.");
    expect(document.querySelector(".nf-dialogue-standing")).toBeNull();
  });

  it("spends the line on the beat that follows, not on the rest", () => {
    openDialogue();
    click("Tell them.");
    expect(document.querySelector(".nf-dialogue-standing")).not.toBeNull();
    // Re-rendering the same beat must not repeat it.
    session.state = { ...session.state };
    handle!.destroy();
    handle = undefined;
    openDialogue();
    expect(document.querySelector(".nf-dialogue-standing")).toBeNull();
  });
});
