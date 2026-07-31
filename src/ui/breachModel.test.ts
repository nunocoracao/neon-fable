import { describe, expect, it } from "vitest";
import { requireBreachContext } from "../data/breach";
import {
  breachOutcome,
  startBreach,
  stepBreach,
  withdrawBreach,
  type BreachGame,
  type BreachOutcome,
} from "../minigames";
import { latticeFrom } from "../minigames/testSupport";
import {
  breachBrief,
  breachCell,
  breachPanel,
  breachReport,
  fragmentGlyph,
  spentLine,
} from "./breachModel";

/**
 * The Breach screen as data. Everything here is derived from a game the
 * engine produced, so what is asserted is the reading: that a cell says
 * what it is without giving away what the runner cannot see, and that a
 * report names the payout in the same words the terminal promised.
 */

const CONTEXT = requireBreachContext("market-register");

function game(
  rows: readonly string[],
  vision = { traces: true, values: true },
): BreachGame {
  return startBreach(latticeFrom(rows), { budget: 14, vision });
}

function cellOf(current: BreachGame, id: string) {
  const cell = breachPanel(current, CONTEXT).cells.find(
    (entry) => entry.view.id === id,
  );
  if (!cell) throw new Error(`no cell "${id}"`);
  return cell;
}

describe("the lattice as cells", () => {
  const ROWS = ["EaW#", "b##C"];

  it("gives every kind of node its own mark", () => {
    const current = game(ROWS);
    expect(cellOf(current, "0,0").glyph).toBe("▶");
    expect(cellOf(current, "3,1").glyph).toBe("◎");
    expect(cellOf(current, "3,0").glyph).toBe("×");
    expect(cellOf(current, "1,0").glyph).toBe(fragmentGlyph("carrier"));
    // A watchdog wears its fragment's mark, not a skull: what gives it
    // away is the colour and the price, never the glyph.
    expect(cellOf(current, "2,0").glyph).toBe(fragmentGlyph("carrier"));
    expect(cellOf(current, "2,0").tone).toBe("trace");
  });

  it("says what a node is worth only when it can be read", () => {
    const blind = game(ROWS, { traces: false, values: false });
    expect(cellOf(blind, "1,0").yieldLabel).toBe("?");
    expect(cellOf(blind, "1,0").label).toContain("yield unread");
    // A watchdog nobody can see reads as an ordinary node, at an
    // ordinary price.
    expect(cellOf(blind, "2,0").tone).toBe("data");
    expect(cellOf(blind, "2,0").label).toContain("costs 1");

    const sighted = game(ROWS);
    expect(cellOf(sighted, "1,0").yieldLabel).toBe("1");
    expect(cellOf(sighted, "2,0").label).toContain("costs 3");
  });

  it("marks where the route has been and where it is standing", () => {
    const routed = stepBreach(game(ROWS), "1,0");
    expect(cellOf(routed, "0,0").view.onPath).toBe(true);
    expect(cellOf(routed, "0,0").view.head).toBe(false);
    expect(cellOf(routed, "1,0").view.head).toBe(true);
    expect(cellOf(routed, "1,0").label).toContain("you are here");
    expect(cellOf(routed, "0,0").label).toContain("routed");
  });

  it("carries no yield or price on the ends of the run", () => {
    const current = game(ROWS);
    for (const id of ["0,0", "3,1", "3,0"]) {
      expect(cellOf(current, id).yieldLabel, id).toBe("");
    }
    expect(breachCell(cellOf(current, "3,0").view).label).toContain("Corrupt");
  });
});

describe("the panel", () => {
  it("reads the buffer, the chain and the harvest off the run", () => {
    const routed = stepBreach(stepBreach(game(["Eaa", "##C"]), "1,0"), "2,0");
    const panel = breachPanel(routed, CONTEXT);
    expect(panel.title).toBe(CONTEXT.name);
    expect(panel.bufferLine).toBe("Buffer 12 / 14");
    expect(panel.buffer).toEqual({ left: 12, max: 14 });
    expect(panel.chainLine).toBe("Chain 2/3 · 0 banked");
    expect(panel.harvestLine).toBe("Data 2");
    expect(panel.columns).toBe(3);
    expect(panel.cells).toHaveLength(6);
    expect(panel.canUndo).toBe(true);
    expect(panel.canWithdraw).toBe(true);
  });

  it("offers nothing once the run has stopped", () => {
    const done = withdrawBreach(game(["EaC", "###"]));
    const panel = breachPanel(done, CONTEXT);
    expect(panel.status).toBe("withdrawn");
    expect(panel.canUndo).toBe(false);
    expect(panel.canWithdraw).toBe(false);
  });

  it("cannot undo off the entry node", () => {
    expect(breachPanel(game(["EaC", "###"]), CONTEXT).canUndo).toBe(false);
  });
});

describe("the briefing", () => {
  it("splits the buffer into the route and the room for error", () => {
    const current = game(["EaaC", "####"]);
    const brief = breachBrief(current, CONTEXT, {
      tech: 7,
      bonus: 2,
      vision: { traces: true, values: false },
      notes: ["Tech 7: +2 buffer"],
    });
    expect(brief.title).toBe(CONTEXT.name);
    expect(brief.brief).toBe(CONTEXT.brief);
    expect(brief.prize).toBe(CONTEXT.prize);
    expect(brief.bufferLine).toBe("Buffer 14 — 3 to route it clean, 11 to be wrong with.");
    expect(brief.notes).toEqual(["Tech 7: +2 buffer"]);
  });

  it("says out loud whether backing out keeps anything", () => {
    const current = game(["EaC", "###"]);
    const runner = {
      tech: 3,
      bonus: 0,
      vision: { traces: false, values: false },
      notes: [],
    };
    expect(breachBrief(current, CONTEXT, runner).warning).toContain("keep");
    const relay = requireBreachContext("exec-muster");
    expect(breachBrief(current, relay, runner).warning).toContain(
      "nothing here to carry out",
    );
  });
});

describe("the report", () => {
  const OUTCOME: BreachOutcome = {
    status: "breached",
    harvest: 6,
    chains: 2,
    budgetLeft: 3,
    steps: 8,
  };

  it("counts the run and names everything it paid", () => {
    const report = breachReport(CONTEXT, OUTCOME, {
      credits: 22,
      effects: [
        { type: "credits", amount: 25 },
        { type: "add-item", itemId: "con-field-kit" },
      ],
      shardId: "shard-cordon-precedent",
    });
    expect(report.headline).toBe("Core reached");
    expect(report.body).toContain("8 hops");
    expect(report.body).toContain("2 chains");
    expect(report.payout[0]).toBe("22 cr");
    expect(report.payout).toContain("25 cr");
    expect(report.payout.join(" ")).toContain("Field Kit");
    expect(report.payout.join(" ")).toContain("Memory shard");
    // What the terminal promised is said again on the way out, because
    // a flag is not something a player can read.
    expect(report.payout).toContain(CONTEXT.prize);
  });

  it("reports a withdrawal as a walk-out, with only what came with you", () => {
    const report = breachReport(
      CONTEXT,
      { ...OUTCOME, status: "withdrawn" },
      { credits: 12, effects: [], shardId: null },
    );
    expect(report.headline).toBe("Pulled out");
    expect(report.payout).toEqual(["12 cr"]);
  });

  it("reports a lockout as costing everything that was in there", () => {
    const report = breachReport(
      CONTEXT,
      { ...OUTCOME, status: "locked-out", budgetLeft: 0 },
      { credits: 0, effects: [], shardId: null },
    );
    expect(report.headline).toBe("Locked out");
    expect(report.payout).toEqual([]);
    expect(report.body).toContain("stays in there");
  });

  it("reads a real run end to end", () => {
    let current = game(["EaaC", "####"]);
    for (const id of ["1,0", "2,0", "3,0"]) current = stepBreach(current, id);
    const report = breachReport(CONTEXT, breachOutcome(current), {
      credits: 4,
      effects: [],
      shardId: null,
    });
    expect(report.headline).toBe("Core reached");
    expect(report.body).toContain("3 hops");
  });
});

describe("a terminal that has already had its one run", () => {
  it("says which way it went", () => {
    expect(spentLine(CONTEXT, "breached")).toBe(CONTEXT.spent);
    expect(spentLine(CONTEXT, "withdrawn")).toContain("did not finish");
    expect(spentLine(CONTEXT, "locked-out")).toContain("will not open again");
    expect(spentLine(CONTEXT, undefined)).toContain("will not open again");
  });
});
