// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  initiativeChipLabel,
  statusLabel,
  type InitiativeChip,
} from "./combatHud";
import { createInitiativeRail, createTargetCard } from "./combatHudView";

/**
 * What the combat HUD says out loud.
 *
 * The rail and the target card are the two places the fight states its
 * facts without moving: who is up, how far off everyone else is, how
 * hurt they are, what is stuck to them. All of it was drawn — a
 * portrait, a bar, a glyph, a highlight — and the only text anywhere
 * near it lived on a `title`, which is a hover. A keyboard has no hover,
 * and a screen reader announces `title` at nobody's reliable request.
 *
 * So these are the assertions that the drawn facts also exist as words:
 * the rail is a list, each chip names itself completely, and a condition
 * glyph is an image with a label rather than a decorative canvas.
 */

const chip = (over: Partial<InitiativeChip> = {}): InitiativeChip => ({
  combatantId: "vex",
  name: "Vex",
  kind: "enemy",
  enemyId: null,
  companionId: null,
  lookId: null,
  lookIndex: null,
  hp: 12,
  maxHp: 18,
  hpFraction: 12 / 18,
  alive: true,
  active: false,
  turnsAway: 2,
  statuses: [],
  injury: null,
  ...over,
});

const portrait = (): HTMLCanvasElement => document.createElement("canvas");

/** Enough of the canvas 2D API to bake a badge glyph; no pixels are read. */
function anything(): unknown {
  const fn = (): unknown => anything();
  return new Proxy(fn, {
    get: (_target, prop) =>
      prop === Symbol.toPrimitive ? () => 0 : anything(),
    set: () => true,
    apply: () => anything(),
  });
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => anything() as CanvasRenderingContext2D,
  );
});

function rail(chips: readonly InitiativeChip[]): HTMLElement {
  const view = createInitiativeRail({ portrait });
  view.update({ round: 1, chips });
  return view.el;
}

describe("the initiative rail reads as a list", () => {
  it("is a list, named, of list items", () => {
    const el = rail([chip(), chip({ combatantId: "kade", name: "Kade" })]);
    expect(el.getAttribute("role")).toBe("list");
    expect(el.getAttribute("aria-label")).toBe("Initiative order");
    expect(el.querySelectorAll('[role="listitem"]')).toHaveLength(2);
  });

  it("gives every chip the whole sentence as its name", () => {
    const chips = [
      chip({ turnsAway: 0, active: true }),
      chip({ combatantId: "kade", name: "Kade", statuses: ["stunned"] }),
    ];
    const items = rail(chips).querySelectorAll('[role="listitem"]');
    items.forEach((item, i) => {
      const model = chips[i];
      if (!model) throw new Error("missing chip");
      expect(item.getAttribute("aria-label")).toBe(initiativeChipLabel(model));
    });
  });

  it("hides the pieces the sentence already covers", () => {
    // A "+2" and a bar read one fragment at a time are noise next to a
    // chip that has already said "two turns away, HP 12 of 18".
    const item = rail([chip()]).querySelector('[role="listitem"]');
    expect(item).not.toBeNull();
    for (const child of item?.children ?? []) {
      expect(child.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("still says a defeated body's name and place", () => {
    const label = rail([chip({ alive: false, turnsAway: null, hp: 0 })])
      .querySelector('[role="listitem"]')
      ?.getAttribute("aria-label");
    expect(label).toContain("Vex");
    expect(label).toContain("defeated");
  });
});

describe("condition badges are labelled images, not bare canvases", () => {
  it("names each badge on the target card", () => {
    const view = createTargetCard({ portrait });
    view.update({
      combatantId: "vex",
      name: "Vex",
      kind: "enemy",
      enemyId: null,
      companionId: null,
      lookId: null,
      lookIndex: null,
      hp: 12,
      maxHp: 18,
      hpFraction: 12 / 18,
      armor: 2,
      weaponName: "Shard Knife",
      statuses: ["stunned"],
      distance: 3,
      attack: null,
    });
    const badge = view.el.querySelector(".nf-status-badge");
    expect(badge?.getAttribute("role")).toBe("img");
    expect(badge?.getAttribute("aria-label")).toBe(statusLabel("stunned"));
  });

  it("says the target's health once, not twice", () => {
    // The bar and the figure beside it are the same fact drawn twice.
    const view = createTargetCard({ portrait });
    view.update({
      combatantId: "vex",
      name: "Vex",
      kind: "enemy",
      enemyId: null,
      companionId: null,
      lookId: null,
      lookIndex: null,
      hp: 12,
      maxHp: 18,
      hpFraction: 12 / 18,
      armor: 2,
      weaponName: "Shard Knife",
      statuses: [],
      distance: 3,
      attack: null,
    });
    expect(
      view.el.querySelector(".nf-target-hp")?.getAttribute("aria-hidden"),
    ).toBe("true");
    expect(view.el.querySelector(".nf-target-hp-text")?.textContent).toBe(
      "HP 12/18",
    );
  });
});
