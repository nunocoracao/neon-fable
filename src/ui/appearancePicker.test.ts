// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultAppearance, type Appearance, type AppearanceField } from "../character";
import {
  APPEARANCE_TABS,
  SWATCH_CATEGORIES,
  appearanceCatalogs,
  swatchChips,
} from "../data";
import { createAppearancePicker, type AppearancePicker } from "./appearancePicker";

/**
 * Drives the appearance picker in happy-dom. The canvas 2D context is
 * stubbed — thumbnail pixels are not under test, only that the panel is
 * generated entirely from the tab config and catalogs, bakes lazily per
 * tab, applies picks, and stays keyboard-operable.
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

let look: Appearance;
let picks: Array<[AppearanceField, string]>;
let picker: AppearancePicker;

function thumbs(category?: string): HTMLButtonElement[] {
  const selector = category
    ? `button.nf-thumb[data-category="${category}"]`
    : "button.nf-thumb";
  return [...document.querySelectorAll<HTMLButtonElement>(selector)];
}

function swatches(category?: string): HTMLButtonElement[] {
  const selector = category
    ? `button.nf-swatch[data-category="${category}"]`
    : "button.nf-swatch";
  return [...document.querySelectorAll<HTMLButtonElement>(selector)];
}

/** A hex color normalized the way happy-dom stores inline backgrounds. */
function cssColor(color: string): string {
  const probe = document.createElement("i");
  probe.style.background = color;
  return probe.style.background;
}

function tabButton(label: string): HTMLButtonElement {
  const button = [
    ...document.querySelectorAll<HTMLButtonElement>(".nf-appearance-tab"),
  ].find((b) => b.textContent === label);
  if (!button) throw new Error(`no tab labelled "${label}"`);
  return button;
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => anything() as CanvasRenderingContext2D,
  );
  document.body.innerHTML = "";
  look = defaultAppearance();
  picks = [];
  picker = createAppearancePicker({
    appearance: () => look,
    onPick: (category, id) => {
      picks.push([category, id]);
      look = { ...look, [category]: id };
      picker.update();
    },
  });
  document.body.append(picker.el);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("appearance picker", () => {
  it("renders a tab per config entry and opens on the first", () => {
    expect(
      [...document.querySelectorAll(".nf-appearance-tab")].map(
        (b) => b.textContent,
      ),
    ).toEqual(APPEARANCE_TABS.map((tab) => tab.label));
    expect(tabButton("Body").classList.contains("nf-selected")).toBe(true);
  });

  it("shows one baked thumb per catalog entry for every thumb category of every tab", () => {
    for (const tab of APPEARANCE_TABS) {
      tabButton(tab.label).click();
      for (const config of tab.categories) {
        if (config.kind !== "thumbs") continue;
        const buttons = thumbs(config.category);
        expect(buttons.map((b) => b.dataset.id)).toEqual(
          appearanceCatalogs[config.category].map((option) => option.id),
        );
        for (const button of buttons) {
          expect(button.querySelector("canvas")).toBeTruthy();
          const option = appearanceCatalogs[config.category].find(
            (o) => o.id === button.dataset.id,
          );
          expect(button.title).toBe(option?.label);
        }
      }
    }
  });

  it("bakes lazily: inactive tabs have no thumbs until opened", () => {
    expect(thumbs("eyes")).toHaveLength(0);
    expect(thumbs("headwear")).toHaveLength(0);
    tabButton("Face").click();
    expect(thumbs("eyes")).toHaveLength(appearanceCatalogs.eyes.length);
    expect(thumbs("headwear")).toHaveLength(0);
  });

  it("marks the working appearance's option selected in every grid", () => {
    tabButton("Face").click();
    const selected = thumbs("mouth").find((b) =>
      b.classList.contains("nf-selected"),
    );
    expect(selected?.dataset.id).toBe(look.mouth);
    expect(selected?.getAttribute("aria-checked")).toBe("true");
  });

  it("clicking a thumb reports the pick and the selection follows", () => {
    tabButton("Hair").click();
    const mohawk = thumbs("hairStyle").find((b) => b.dataset.id === "mohawk");
    mohawk?.click();
    expect(picks).toEqual([["hairStyle", "mohawk"]]);
    const selected = thumbs("hairStyle").filter((b) =>
      b.classList.contains("nf-selected"),
    );
    expect(selected.map((b) => b.dataset.id)).toEqual(["mohawk"]);
  });

  it("arrow keys move focus within a grid without leaving it", () => {
    tabButton("Face").click();
    const eyes = thumbs("eyes");
    eyes[0]?.focus();
    eyes[0]?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    expect(document.activeElement).toBe(eyes[1]);
    // Left at the first thumb stays put instead of wrapping away.
    eyes[1]?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
    );
    eyes[0]?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
    );
    expect(document.activeElement).toBe(eyes[0]);
  });

  it("keyboard picking keeps focus on the picked thumb across the rebuild", () => {
    tabButton("Hair").click();
    const bob = thumbs("hairStyle").find((b) => b.dataset.id === "bob");
    bob?.focus();
    bob?.click();
    expect(picks).toEqual([["hairStyle", "bob"]]);
    const active = document.activeElement as HTMLButtonElement;
    expect(active.dataset.id).toBe("bob");
    expect(active.classList.contains("nf-selected")).toBe(true);
  });

  it("the tab strip is a roving tablist: arrows move, Enter activates", () => {
    const strip = document.querySelector(".nf-appearance-tabs");
    expect(strip?.getAttribute("role")).toBe("tablist");
    const body = tabButton("Body");
    expect(body.getAttribute("role")).toBe("tab");
    expect(body.getAttribute("aria-selected")).toBe("true");
    // Only the active tab is in the tab order.
    expect(body.tabIndex).toBe(0);
    expect(tabButton("Hair").tabIndex).toBe(-1);
    body.focus();
    body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    // Focus moved without activating; the panel still shows Body.
    const hair = tabButton("Hair");
    expect(document.activeElement).toBe(hair);
    expect(body.getAttribute("aria-selected")).toBe("true");
    expect(thumbs("build").length).toBeGreaterThan(0);
    // Activation (a click, as Enter/Space produce on a button) switches
    // the panel and keeps focus on the now-active tab.
    hair.click();
    const active = document.activeElement as HTMLButtonElement;
    expect(active.textContent).toBe("Hair");
    expect(active.getAttribute("aria-selected")).toBe("true");
    expect(thumbs("hairStyle").length).toBeGreaterThan(0);
  });

  it("grids are labelled radiogroups with one roving tab stop", () => {
    tabButton("Hair").click();
    const grid = thumbs("hairStyle")[0]?.parentElement;
    expect(grid?.getAttribute("role")).toBe("radiogroup");
    expect(grid?.getAttribute("aria-label")).toBe("Style");
    for (const thumb of thumbs("hairStyle")) {
      expect(thumb.getAttribute("role")).toBe("radio");
    }
    // The selected thumb is the single tab stop.
    const stops = thumbs("hairStyle").filter((b) => b.tabIndex === 0);
    expect(stops.map((b) => b.dataset.id)).toEqual([look.hairStyle]);
    const row = swatches("hairColor")[0]?.parentElement;
    expect(row?.getAttribute("role")).toBe("radiogroup");
    expect(row?.getAttribute("aria-label")).toBe("Color");
    expect(
      swatches("hairColor").filter((b) => b.tabIndex === 0),
    ).toHaveLength(1);
  });

  it("hovering or focusing a thumb or chip shows its label in the caption", () => {
    const caption = document.querySelector(".nf-thumb-caption");
    expect(caption?.textContent).toBe("");
    const heavy = thumbs("build").find((b) => b.dataset.id === "heavy");
    heavy?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    expect(caption?.textContent).toBe("Heavy");
    swatches("skinTone")[0]?.focus();
    expect(caption?.textContent).toBe("Porcelain");
  });

  it("renders each color category as a swatch row of palette chips in its tab", () => {
    const rows: Array<[string, (typeof SWATCH_CATEGORIES)[number]]> = [
      ["Body", "skinTone"],
      ["Hair", "hairColor"],
      ["Face", "eyeColor"],
    ];
    expect(rows.map(([, category]) => category).sort()).toEqual(
      [...SWATCH_CATEGORIES].sort(),
    );
    for (const [tabLabel, category] of rows) {
      tabButton(tabLabel).click();
      const chips = swatchChips(category);
      const buttons = swatches(category);
      expect(buttons.map((b) => b.dataset.id)).toEqual(
        chips.map((chip) => chip.id),
      );
      for (const [i, button] of buttons.entries()) {
        expect(button.style.background).toBe(cssColor(chips[i]!.color));
        expect(button.title).toBe(chips[i]!.label);
        expect(button.querySelector("canvas")).toBeNull();
      }
    }
  });

  it("marks the working appearance's chip selected in every swatch row", () => {
    const selected = swatches("skinTone").find((b) =>
      b.classList.contains("nf-selected"),
    );
    expect(selected?.dataset.id).toBe(look.skinTone);
    expect(selected?.getAttribute("aria-checked")).toBe("true");
  });

  it("clicking a chip round-trips the pick into the appearance record", () => {
    tabButton("Hair").click();
    const chestnut = swatches("hairColor").find(
      (b) => b.dataset.id === "chestnut",
    );
    chestnut?.click();
    expect(picks).toEqual([["hairColor", "chestnut"]]);
    expect(look.hairColor).toBe("chestnut");
    const selected = swatches("hairColor").filter((b) =>
      b.classList.contains("nf-selected"),
    );
    expect(selected.map((b) => b.dataset.id)).toEqual(["chestnut"]);
  });

  it("arrow keys walk a swatch row without leaving it", () => {
    tabButton("Face").click();
    const chips = swatches("eyeColor");
    chips[0]?.focus();
    chips[0]?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    expect(document.activeElement).toBe(chips[1]);
    chips[1]?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
    );
    chips[0]?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
    );
    expect(document.activeElement).toBe(chips[0]);
  });
});
