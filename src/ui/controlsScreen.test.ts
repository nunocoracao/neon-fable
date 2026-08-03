// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONTROL_GROUPS, allControlBindings } from "./controlsModel";
import { createControlsOverlay, createControlsScreen } from "./controlsScreen";
import { initScreenRouter, showScreen } from "./screen";
import { STRINGS } from "./strings";

/**
 * The reference on screen: every row in the table rendered, as a
 * definition list, with a way back out by button and by Escape.
 */

let root: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '<div id="ui-root"></div>';
  root = document.getElementById("ui-root")!;
  initScreenRouter(root);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("the controls reference", () => {
  it("renders every binding in the table, keys beside meanings", () => {
    showScreen(createControlsScreen({ onBack: () => {} }));
    const terms = [...root.querySelectorAll("dt")].map((el) => el.textContent);
    const descriptions = [...root.querySelectorAll("dd")].map(
      (el) => el.textContent,
    );
    const bindings = allControlBindings();
    expect(terms).toHaveLength(bindings.length);
    expect(descriptions).toHaveLength(bindings.length);
    for (const binding of bindings) {
      expect(terms).toContain(STRINGS[binding.keys]);
      expect(descriptions).toContain(STRINGS[binding.what]);
    }
  });

  it("heads each group so the list is walkable by section", () => {
    showScreen(createControlsScreen({ onBack: () => {} }));
    const headings = [...root.querySelectorAll("h3")].map(
      (el) => el.textContent,
    );
    for (const group of CONTROL_GROUPS) {
      expect(headings).toContain(STRINGS[group.title]);
    }
  });

  it("backs out by button and by Escape", () => {
    let backs = 0;
    showScreen(createControlsScreen({ onBack: () => backs++ }));
    root.querySelector<HTMLButtonElement>(".nf-controls .nf-button")?.click();
    expect(backs).toBe(1);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(backs).toBe(2);
  });

  it("opens focused, so the keyboard never lands nowhere", () => {
    showScreen(createControlsScreen({ onBack: () => {} }));
    expect(document.activeElement?.tagName).toBe("BUTTON");
  });

  it("reads the same table as an overlay over the map", () => {
    let closed = 0;
    const overlay = createControlsOverlay({ onClose: () => closed++ });
    document.body.append(overlay.el);
    expect(overlay.el.querySelectorAll("dt")).toHaveLength(
      allControlBindings().length,
    );
    overlay.el.querySelector<HTMLButtonElement>(".nf-button")?.click();
    expect(closed).toBe(1);
    overlay.destroy();
    expect(document.body.contains(overlay.el)).toBe(false);
  });
});
