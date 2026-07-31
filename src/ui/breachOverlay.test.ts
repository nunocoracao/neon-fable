// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { breachFlag, requireBreachContext } from "../data/breach";
import { openBreach, type BreachSettlement } from "../minigames";
import { solveRoute } from "../minigames/testSupport";
import { createMemoryStorage, createNewGame } from "../state";
import { createBreachOverlay } from "./breachOverlay";
import type { OverlayHandle } from "./overlay";
import { createSession, type Session } from "./session";

/**
 * The Breach overlay in isolation: that the briefing gates the run,
 * that the grid routes on a click and refuses out loud, that the
 * keyboard can play the whole thing, and — the one that matters — that
 * a finished run is written into the playthrough before the panel is
 * ever closed.
 */

const CONTEXT = requireBreachContext("vent-archive");

let open: OverlayHandle | null = null;

afterEach(() => {
  open?.destroy();
  open = null;
  document.body.replaceChildren();
});

function makeSession(seed = 12): Session {
  return createSession(
    createNewGame({ playerName: "Vex", seed }),
    createMemoryStorage(),
  );
}

interface Mounted {
  handle: OverlayHandle;
  session: Session;
  settled: BreachSettlement[];
  closed: () => number;
}

function mount(session: Session = makeSession()): Mounted {
  const settled: BreachSettlement[] = [];
  let closes = 0;
  const handle = createBreachOverlay({
    session,
    contextId: CONTEXT.id,
    onStateChange: () => {},
    onSettled: (settlement) => settled.push(settlement),
    onClose: () => {
      closes += 1;
    },
  });
  document.body.append(handle.el);
  open = handle;
  return { handle, session, settled, closed: () => closes };
}

function buttonLabelled(handle: OverlayHandle, label: string): HTMLButtonElement {
  const found = [...handle.el.querySelectorAll("button")].find((button) =>
    (button.textContent ?? "").startsWith(label),
  );
  if (!found) throw new Error(`no button "${label}"`);
  return found;
}

function cells(handle: OverlayHandle): HTMLButtonElement[] {
  return [...handle.el.querySelectorAll<HTMLButtonElement>(".nf-breach-cell")];
}

function cellFor(handle: OverlayHandle, id: string): HTMLButtonElement {
  const found = cells(handle).find((cell) => cell.dataset.node === id);
  if (!found) throw new Error(`no cell "${id}"`);
  return found;
}

function messageOf(handle: OverlayHandle): string {
  return handle.el.querySelector(".nf-message")?.textContent ?? "";
}

function press(key: string): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

/** The cheapest route through this session's lattice, hop by hop. */
function routeFor(session: Session): string[] {
  return solveRoute(openBreach(session.state, CONTEXT).lattice);
}

describe("the briefing", () => {
  it("says what the terminal is and what is in it before anything starts", () => {
    const { handle } = mount();
    const text = handle.el.textContent ?? "";
    expect(text).toContain(CONTEXT.name);
    expect(text).toContain(CONTEXT.prize);
    expect(text).toContain("One attempt");
    // Nothing is routable until the player commits.
    expect(cells(handle)).toHaveLength(0);
  });

  it("walks away without spending the terminal", () => {
    const { handle, session, closed } = mount();
    buttonLabelled(handle, "Walk away").click();
    expect(closed()).toBe(1);
    expect(session.state.flags[breachFlag(CONTEXT.id)]).toBeUndefined();
  });

  it("lays the lattice out once the player jacks in", () => {
    const { handle, session } = mount();
    buttonLabelled(handle, "Jack in").click();
    const lattice = openBreach(session.state, CONTEXT).lattice;
    expect(cells(handle)).toHaveLength(lattice.nodes.length);
    expect(handle.el.querySelector(".nf-breach-grid")).not.toBeNull();
    expect(messageOf(handle)).toContain("Arrows to move");
    // The entry node is where the route starts, and where focus is.
    expect(cellFor(handle, lattice.entryId).classList).toContain(
      "nf-breach-head",
    );
    expect(document.activeElement).toBe(cellFor(handle, lattice.entryId));
  });
});

describe("routing", () => {
  it("takes a hop on a click and moves the head", () => {
    const { handle, session } = mount();
    buttonLabelled(handle, "Jack in").click();
    const first = routeFor(session)[0]!;
    cellFor(handle, first).click();
    expect(cellFor(handle, first).classList).toContain("nf-breach-head");
    expect(handle.el.textContent).toContain("Buffer");
    expect(document.activeElement).toBe(cellFor(handle, first));
  });

  it("refuses an illegal hop out loud, and moves nothing", () => {
    const { handle, session } = mount();
    buttonLabelled(handle, "Jack in").click();
    const lattice = openBreach(session.state, CONTEXT).lattice;
    // The core is across the grid: not a neighbour of the entry.
    cellFor(handle, lattice.coreId).click();
    expect(messageOf(handle)).toContain("neighbour");
    expect(handle.el.querySelector(".nf-error")).not.toBeNull();
    expect(cellFor(handle, lattice.entryId).classList).toContain(
      "nf-breach-head",
    );
  });

  it("backs up on [U], and refuses to back off the entry", () => {
    const { handle, session } = mount();
    buttonLabelled(handle, "Jack in").click();
    const lattice = openBreach(session.state, CONTEXT).lattice;
    press("u");
    expect(messageOf(handle)).toContain("entry node");

    cellFor(handle, routeFor(session)[0]!).click();
    press("u");
    expect(cellFor(handle, lattice.entryId).classList).toContain(
      "nf-breach-head",
    );
    expect(messageOf(handle)).toContain("spent either way");
  });
});

describe("finishing a run", () => {
  it("reaches the core, settles into the run, and reports the payout", () => {
    const session = makeSession();
    const before = session.state.credits;
    const { handle, settled } = mount(session);
    buttonLabelled(handle, "Jack in").click();
    for (const id of routeFor(session)) cellFor(handle, id).click();

    expect(settled).toHaveLength(1);
    expect(settled[0]?.award.shardId).toBe("shard-cordon-precedent");
    // Written into the playthrough before the panel was ever closed.
    expect(session.state.flags[breachFlag(CONTEXT.id)]).toBe("breached");
    expect(session.state.flags["vent-archive-read"]).toBe(true);
    expect(session.state.credits).toBeGreaterThan(before);
    expect(session.state.lore.collected).toContain("shard-cordon-precedent");

    const text = handle.el.textContent ?? "";
    expect(text).toContain("Core reached");
    expect(text).toContain("Memory shard");
    expect(cells(handle)).toHaveLength(0);
  });

  it("pulls out on [W], keeping the data that came with it", () => {
    const session = makeSession();
    const before = session.state.credits;
    const { handle, settled } = mount(session);
    buttonLabelled(handle, "Jack in").click();
    cellFor(handle, routeFor(session)[0]!).click();
    press("w");

    expect(settled).toHaveLength(1);
    expect(session.state.flags[breachFlag(CONTEXT.id)]).toBe("withdrawn");
    // The context's own payout is not a withdrawal's to take.
    expect(session.state.flags["vent-archive-read"]).toBeUndefined();
    expect(session.state.credits).toBeGreaterThan(before);
    expect(handle.el.textContent).toContain("Pulled out");
  });

  it("will not let a run be closed away from, and closes once it is over", () => {
    const session = makeSession();
    const { handle, closed } = mount(session);
    buttonLabelled(handle, "Jack in").click();
    press("Escape");
    expect(closed()).toBe(0);
    expect(messageOf(handle)).toContain("[W]");
    expect(session.state.flags[breachFlag(CONTEXT.id)]).toBeUndefined();

    press("w");
    press("Escape");
    expect(closed()).toBe(1);
  });
});

describe("a terminal that has already been run", () => {
  it("offers nothing, and says why", () => {
    const session = makeSession();
    session.state = {
      ...session.state,
      flags: { ...session.state.flags, [breachFlag(CONTEXT.id)]: "locked-out" },
    };
    const { handle, settled } = mount(session);
    expect(handle.el.textContent).toContain("will not open again");
    expect(cells(handle)).toHaveLength(0);
    expect(settled).toHaveLength(0);
    // No way in from here: the only control is the way out.
    expect(buttonLabelled(handle, "Step back")).toBeDefined();
    expect(() => buttonLabelled(handle, "Jack in")).toThrow();
  });
});
