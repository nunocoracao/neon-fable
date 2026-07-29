// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultAppearance, type Appearance, type AppearanceField } from "../character";
import { APPEARANCE_TABS, appearanceCatalogs } from "../data";
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

  it("shows one baked thumb per catalog entry for every category of every tab", () => {
    for (const tab of APPEARANCE_TABS) {
      tabButton(tab.label).click();
      for (const config of tab.categories) {
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
    expect(selected?.getAttribute("aria-pressed")).toBe("true");
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

  it("Tab cycles the category tabs and moves focus into the new grid", () => {
    thumbs("build")[0]?.focus();
    picker.el.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
    );
    expect(tabButton("Hair").classList.contains("nf-selected")).toBe(true);
    expect(
      (document.activeElement as HTMLElement | null)?.dataset.category,
    ).toBe("hairStyle");
    picker.el.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }),
    );
    expect(tabButton("Body").classList.contains("nf-selected")).toBe(true);
  });

  it("hovering or focusing a thumb shows its label in the caption", () => {
    const caption = document.querySelector(".nf-thumb-caption");
    expect(caption?.textContent).toBe("");
    const heavy = thumbs("build").find((b) => b.dataset.id === "heavy");
    heavy?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    expect(caption?.textContent).toBe("Heavy");
    thumbs("skinTone")[0]?.focus();
    expect(caption?.textContent).toBe("Porcelain");
  });
});
