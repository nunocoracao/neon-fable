// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { createTelegraphChip } from "./combatHudView";
import type { TelegraphChip } from "./combatHud";

/**
 * The telegraph chip's view layer. It is handed a finished model (see
 * telegraphChip in ./combatHud.ts) and paints it; what is under test is
 * that it paints all of it, hides rather than empties when there is
 * nothing to say, and follows the cursor it was given.
 */

const chipModel = (over: Partial<TelegraphChip> = {}): TelegraphChip => ({
  title: "Stun Strike",
  cost: null,
  outcomes: [],
  denial: null,
  ...over,
});

describe("createTelegraphChip", () => {
  let view = createTelegraphChip();

  beforeEach(() => {
    document.body.innerHTML = "";
    view = createTelegraphChip();
    document.body.append(view.el);
  });

  function text(selector: string): string | null {
    return view.el.querySelector(selector)?.textContent ?? null;
  }

  it("opens hidden and stays out of the way with nothing to say", () => {
    expect(view.el.hidden).toBe(true);
    view.update({ chip: chipModel({ cost: "1 step" }), at: { x: 10, y: 20 } });
    expect(view.el.hidden).toBe(false);
    view.update({ chip: null, at: { x: 10, y: 20 } });
    expect(view.el.hidden).toBe(true);
    expect(view.el.children).toHaveLength(0);
  });

  it("hides when the pointer is nowhere, even with a model in hand", () => {
    view.update({ chip: chipModel({ cost: "1 step" }), at: null });
    expect(view.el.hidden).toBe(true);
  });

  it("follows the cursor it was handed", () => {
    view.update({ chip: chipModel({ cost: "1 step" }), at: { x: 128, y: 64 } });
    expect(view.el.style.left).toBe("128px");
    expect(view.el.style.top).toBe("64px");
  });

  it("folds to the other side of the cursor near an edge", () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const chip = chipModel({ cost: "1 step" });
    view.update({ chip, at: { x: w * 0.1, y: h * 0.9 } });
    expect(view.el.dataset.flipX).toBe("false");
    expect(view.el.dataset.flipY).toBe("false");
    // Hard against the right edge and the top of the screen.
    view.update({ chip, at: { x: w * 0.95, y: h * 0.05 } });
    expect(view.el.dataset.flipX).toBe("true");
    expect(view.el.dataset.flipY).toBe("true");
  });

  it("paints a move's cost under its title", () => {
    view.update({
      chip: chipModel({ title: "Move", cost: "2 steps · 1 left after" }),
      at: { x: 0, y: 0 },
    });
    expect(text(".nf-telegraph-title")).toBe("Move");
    expect(text(".nf-telegraph-cost")).toBe("2 steps · 1 left after");
    expect(view.el.dataset.tone).toBe("ok");
  });

  it("paints one line per body, marking the ones an area caught", () => {
    view.update({
      chip: chipModel({
        outcomes: [
          {
            combatantId: "aimed",
            name: "Bruiser",
            primary: true,
            text: "2 dmg · stuns 1",
          },
          {
            combatantId: "beside",
            name: "Runner",
            primary: false,
            text: "1 dmg · stuns 1",
          },
        ],
      }),
      at: { x: 0, y: 0 },
    });
    const lines = [
      ...view.el.querySelectorAll<HTMLElement>(".nf-telegraph-outcome"),
    ];
    expect(lines).toHaveLength(2);
    expect(lines[0]?.querySelector(".nf-telegraph-target")?.textContent).toBe(
      "Bruiser",
    );
    expect(lines[0]?.querySelector(".nf-telegraph-figures")?.textContent).toBe(
      "2 dmg · stuns 1",
    );
    // The aimed body reads first; the splashed one is stepped back.
    expect(lines[0]?.classList.contains("nf-telegraph-splash")).toBe(false);
    expect(lines[1]?.classList.contains("nf-telegraph-splash")).toBe(true);
  });

  it("marks a refusal as a refusal, and drops the figures with it", () => {
    view.update({
      chip: chipModel({ denial: "Out of range." }),
      at: { x: 0, y: 0 },
    });
    expect(view.el.dataset.tone).toBe("denied");
    expect(text(".nf-telegraph-denial")).toBe("Out of range.");
    expect(view.el.querySelector(".nf-telegraph-outcome")).toBeNull();
    expect(view.el.querySelector(".nf-telegraph-cost")).toBeNull();
  });

  it("replaces the previous hover rather than stacking onto it", () => {
    view.update({
      chip: chipModel({ title: "Move", cost: "1 step" }),
      at: { x: 0, y: 0 },
    });
    view.update({
      chip: chipModel({ title: "Move", cost: "3 steps" }),
      at: { x: 0, y: 0 },
    });
    expect(
      view.el.querySelectorAll(".nf-telegraph-cost"),
    ).toHaveLength(1);
    expect(text(".nf-telegraph-cost")).toBe("3 steps");
  });
});
