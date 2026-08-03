import { describe, expect, it } from "vitest";
import type { Hint } from "../data/hints";
import type { FlagMap } from "../state/flags";
import {
  budgetSpent,
  createHintQueue,
  cueHints,
  dismissHint,
  hintFlagKey,
  hintSeen,
  markHintSeen,
  nextHintId,
  resetHintFlags,
  forgetHint,
  pauseHints,
  seenHintIds,
  showHint,
  wizardHelpFor,
} from "./hints";

/**
 * The hint rules as the screens lean on them: cued once, shown once,
 * never two at a time, and forgettable on request. Every test here is
 * pure — no DOM, no settings, no clock — which is the point of the
 * split (the chip itself is covered in src/ui/hintLayer.test.ts).
 */

/** A small catalog with known priorities, so ordering is unambiguous. */
const CATALOG: readonly Hint[] = [
  { id: "low", trigger: "combat-turn", title: "Low", text: "l", priority: 10 },
  { id: "high", trigger: "combat-turn", title: "High", text: "h", priority: 90 },
  { id: "mid", trigger: "combat-turn", title: "Mid", text: "m", priority: 50 },
  { id: "walk", trigger: "explore", title: "Walk", text: "w", priority: 40 },
];

const noFlags: FlagMap = {};

describe("hint flags", () => {
  it("namespaces one key per hint and reads it back", () => {
    expect(hintFlagKey("hint-move")).toBe("hint:hint-move");
    expect(hintSeen(noFlags, "hint-move")).toBe(false);
    expect(hintSeen(markHintSeen(noFlags, "hint-move"), "hint-move")).toBe(true);
  });

  it("marks without mutating, and marking twice is the same map", () => {
    const flags: FlagMap = { "act1-complete": true };
    const once = markHintSeen(flags, "hint-move");
    expect(flags["hint:hint-move"]).toBeUndefined();
    expect(once["act1-complete"]).toBe(true);
    // Idempotent by identity: a re-cue must not churn the save.
    expect(markHintSeen(once, "hint-move")).toBe(once);
  });

  it("lists what has been shown, ignoring every other flag", () => {
    const flags = markHintSeen(markHintSeen({ ending: "commons" }, "a"), "b");
    expect(seenHintIds(flags).sort()).toEqual(["a", "b"]);
  });

  it("resets only the hint keys and leaves the run alone", () => {
    const flags = markHintSeen(
      { "act1-complete": true, "sable-terms": "cold" },
      "hint-move",
    );
    const reset = resetHintFlags(flags);
    expect(reset).toEqual({ "act1-complete": true, "sable-terms": "cold" });
    expect(hintSeen(reset, "hint-move")).toBe(false);
  });

  it("a reset run offers the same hint again", () => {
    const seen = markHintSeen(noFlags, "walk");
    expect(cueHints(createHintQueue(), "explore", seen, CATALOG).pending)
      .toEqual([]);
    expect(
      cueHints(createHintQueue(), "explore", resetHintFlags(seen), CATALOG)
        .pending,
    ).toEqual(["walk"]);
  });
});

describe("cueing", () => {
  it("queues every unseen hint a trigger owns", () => {
    const queue = cueHints(createHintQueue(), "combat-turn", noFlags, CATALOG);
    expect(queue.pending).toEqual(["low", "high", "mid"]);
  });

  it("skips hints the run has already been shown", () => {
    const flags = markHintSeen(noFlags, "high");
    const queue = cueHints(createHintQueue(), "combat-turn", flags, CATALOG);
    expect(queue.pending).toEqual(["low", "mid"]);
  });

  it("re-cueing the same trigger adds nothing and keeps identity", () => {
    const once = cueHints(createHintQueue(), "explore", noFlags, CATALOG);
    expect(cueHints(once, "explore", noFlags, CATALOG)).toBe(once);
  });

  it("never re-queues what is already on screen", () => {
    const cued = cueHints(createHintQueue(), "explore", noFlags, CATALOG);
    const { queue } = showHint(cued, CATALOG);
    expect(queue.active).toBe("walk");
    // The flags have not been written yet (the caller does that), so
    // only the active check stands between this and a duplicate.
    expect(cueHints(queue, "explore", noFlags, CATALOG).pending).toEqual([]);
  });
});

describe("showing", () => {
  it("puts the highest priority up first, then the next", () => {
    let queue = cueHints(createHintQueue(), "combat-turn", noFlags, CATALOG);
    expect(nextHintId(queue, CATALOG)).toBe("high");

    const first = showHint(queue, CATALOG);
    expect(first.shown).toBe("high");
    queue = first.queue;
    expect(queue.active).toBe("high");
    expect(queue.shown).toBe(1);

    // Nothing while a chip is up: one at a time is the whole contract.
    expect(showHint(queue, CATALOG).shown).toBeNull();

    queue = dismissHint(queue);
    const second = showHint(queue, CATALOG);
    expect(second.shown).toBe("mid");
    expect(second.queue.pending).toEqual(["low"]);
  });

  it("shows nothing when nothing is waiting", () => {
    const queue = createHintQueue();
    expect(showHint(queue, CATALOG)).toEqual({ queue, shown: null });
  });

  it("drops ids with no content behind them rather than blanking the chip", () => {
    const queue = { ...createHintQueue(), pending: ["retired"] };
    const result = showHint(queue, CATALOG);
    expect(result.shown).toBeNull();
    expect(result.queue.pending).toEqual([]);
  });

  it("spends a scene budget and holds the rest back for the next scene", () => {
    let queue = cueHints(createHintQueue(2), "combat-turn", noFlags, CATALOG);
    queue = dismissHint(showHint(queue, CATALOG).queue);
    queue = dismissHint(showHint(queue, CATALOG).queue);
    expect(budgetSpent(queue)).toBe(true);
    // Third one still queued — rationed, not dropped.
    expect(queue.pending).toEqual(["low"]);
    expect(showHint(queue, CATALOG).shown).toBeNull();

    // A fresh scene carries the same content through with a new budget.
    const nextScene = cueHints(
      createHintQueue(2),
      "combat-turn",
      markHintSeen(markHintSeen(noFlags, "high"), "mid"),
      CATALOG,
    );
    expect(showHint(nextScene, CATALOG).shown).toBe("low");
  });
});

describe("dismissing and pausing", () => {
  it("takes the chip down and leaves the backlog alone", () => {
    const cued = cueHints(createHintQueue(), "combat-turn", noFlags, CATALOG);
    const { queue } = showHint(cued, CATALOG);
    const after = dismissHint(queue);
    expect(after.active).toBeNull();
    expect(after.pending).toEqual(["low", "mid"]);
  });

  it("ignores a stale dismissal aimed at a chip that has already gone", () => {
    const cued = cueHints(createHintQueue(), "combat-turn", noFlags, CATALOG);
    const { queue } = showHint(cued, CATALOG);
    expect(dismissHint(queue, "mid")).toBe(queue);
    expect(dismissHint(queue, "high").active).toBeNull();
  });

  it("dismissing an empty screen changes nothing", () => {
    const queue = createHintQueue();
    expect(dismissHint(queue)).toBe(queue);
  });

  it("pausing hands the chip back rather than spending it", () => {
    const cued = cueHints(createHintQueue(2), "combat-turn", noFlags, CATALOG);
    const { queue } = showHint(cued, CATALOG);
    expect(queue.shown).toBe(1);

    const held = pauseHints(queue);
    expect(held.returned).toBe("high");
    expect(held.queue.active).toBeNull();
    // Front of the queue and the budget handed back: a chip covered
    // before it could be read has not been shown to anybody.
    expect(held.queue.pending).toEqual(["high", "low", "mid"]);
    expect(held.queue.shown).toBe(0);
    expect(showHint(held.queue, CATALOG).shown).toBe("high");
  });

  it("pausing an empty screen changes nothing", () => {
    const queue = createHintQueue();
    expect(pauseHints(queue)).toEqual({ queue, returned: null });
  });

  it("forgets a hint the run was never really told", () => {
    const flags = markHintSeen(noFlags, "high");
    expect(hintSeen(forgetHint(flags, "high"), "high")).toBe(false);
    // Idempotent by identity, like marking.
    expect(forgetHint(noFlags, "high")).toBe(noFlags);
  });
});

describe("wizard helper copy", () => {
  it("is offered to a player who has never finished a run", () => {
    expect(wizardHelpFor("identity", { completions: 0 })).toMatch(/name/i);
    expect(wizardHelpFor("stats", { completions: 0 })).toMatch(/Body/);
  });

  it("is withheld the moment one playthrough is on the record", () => {
    for (const step of ["identity", "background", "stats", "appearance", "review"] as const) {
      expect(wizardHelpFor(step, { completions: 1 })).toBeNull();
    }
  });
});
