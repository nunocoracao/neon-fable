// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import {
  captureFocus,
  focusFirst,
  focusables,
  installListNav,
  installRovingGrid,
  restoreFocus,
} from "./focus";

/**
 * The shared focus utilities in happy-dom: list navigation for menus,
 * roving-tabindex grids for option pickers, and focus capture/restore
 * across re-renders.
 */

function press(target: HTMLElement, key: string): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

function makeButtons(root: HTMLElement, count: number): HTMLButtonElement[] {
  const buttons: HTMLButtonElement[] = [];
  for (let i = 0; i < count; i++) {
    const button = document.createElement("button");
    button.className = "item";
    button.textContent = `item ${i}`;
    root.append(button);
    buttons.push(button);
  }
  return buttons;
}

let root: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = "";
  root = document.createElement("div");
  document.body.append(root);
});

describe("focusFirst / focusables", () => {
  it("focuses the first enabled control, skipping disabled ones", () => {
    const [first, second] = makeButtons(root, 2);
    first!.disabled = true;
    focusFirst(root);
    expect(document.activeElement).toBe(second);
  });

  it("lists enabled controls in DOM order", () => {
    const [a, b, c] = makeButtons(root, 3);
    b!.disabled = true;
    expect(focusables(root)).toEqual([a, c]);
  });
});

describe("installListNav", () => {
  it("arrows walk the controls with wrap; Home/End jump", () => {
    const [a, b, c] = makeButtons(root, 3);
    installListNav(root);
    a!.focus();
    press(a!, "ArrowDown");
    expect(document.activeElement).toBe(b);
    press(b!, "ArrowDown");
    press(c!, "ArrowDown");
    expect(document.activeElement).toBe(a);
    press(a!, "ArrowUp");
    expect(document.activeElement).toBe(c);
    press(c!, "Home");
    expect(document.activeElement).toBe(a);
    press(a!, "End");
    expect(document.activeElement).toBe(c);
  });
});

describe("installRovingGrid", () => {
  it("puts only the primary item in the tab order", () => {
    const items = makeButtons(root, 4);
    items[2]!.dataset.selected = "true";
    installRovingGrid(root, {
      itemSelector: "button.item",
      columns: () => 2,
      primary: (list) => list.find((item) => item.dataset.selected === "true"),
    });
    expect(items.map((item) => item.tabIndex)).toEqual([-1, -1, 0, -1]);
  });

  it("defaults the tab stop to the first item", () => {
    const items = makeButtons(root, 3);
    installRovingGrid(root, { itemSelector: "button.item" });
    expect(items.map((item) => item.tabIndex)).toEqual([0, -1, -1]);
  });

  it("arrow keys move by row and column and rove the tab stop", () => {
    const items = makeButtons(root, 6);
    installRovingGrid(root, {
      itemSelector: "button.item",
      columns: () => 3,
    });
    items[0]!.focus();
    press(items[0]!, "ArrowRight");
    expect(document.activeElement).toBe(items[1]);
    press(items[1]!, "ArrowDown");
    expect(document.activeElement).toBe(items[4]);
    press(items[4]!, "ArrowLeft");
    expect(document.activeElement).toBe(items[3]);
    press(items[3]!, "ArrowUp");
    expect(document.activeElement).toBe(items[0]);
    expect(items.map((item) => item.tabIndex)).toEqual([0, -1, -1, -1, -1, -1]);
  });

  it("does not wrap at the edges but still swallows the key", () => {
    const items = makeButtons(root, 2);
    installRovingGrid(root, { itemSelector: "button.item" });
    let bubbled = 0;
    document.body.addEventListener("keydown", () => bubbled++);
    items[0]!.focus();
    press(items[0]!, "ArrowLeft");
    expect(document.activeElement).toBe(items[0]);
    expect(bubbled).toBe(0);
  });

  it("Home and End jump to the first and last item", () => {
    const items = makeButtons(root, 5);
    installRovingGrid(root, {
      itemSelector: "button.item",
      columns: () => 2,
    });
    items[2]!.focus();
    press(items[2]!, "End");
    expect(document.activeElement).toBe(items[4]);
    press(items[4]!, "Home");
    expect(document.activeElement).toBe(items[0]);
  });

  it("ignores keys when focus is outside the grid's items", () => {
    makeButtons(root, 2);
    const outside = document.createElement("button");
    document.body.append(outside);
    installRovingGrid(root, { itemSelector: "button.item" });
    outside.focus();
    press(outside, "ArrowRight");
    expect(document.activeElement).toBe(outside);
  });

  it("focus arriving by click or restore claims the tab stop", () => {
    const items = makeButtons(root, 3);
    installRovingGrid(root, { itemSelector: "button.item" });
    items[2]!.focus();
    expect(items.map((item) => item.tabIndex)).toEqual([-1, -1, 0]);
  });

  it("sync re-applies the roving tabindex after a rebuild", () => {
    makeButtons(root, 2);
    const grid = installRovingGrid(root, {
      itemSelector: "button.item",
      primary: (list) => list.find((item) => item.dataset.selected === "true"),
    });
    root.replaceChildren();
    const rebuilt = makeButtons(root, 3);
    rebuilt[1]!.dataset.selected = "true";
    grid.sync();
    expect(rebuilt.map((item) => item.tabIndex)).toEqual([-1, 0, -1]);
  });
});

describe("captureFocus / restoreFocus", () => {
  it("returns null when focus is outside the container", () => {
    makeButtons(root, 2);
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    expect(captureFocus(root)).toBeNull();
  });

  it("restores by data-focus-key across a rebuild", () => {
    const items = makeButtons(root, 3);
    items.forEach((item, i) => (item.dataset.focusKey = `k${i}`));
    items[1]!.focus();
    const snapshot = captureFocus(root);
    root.replaceChildren();
    const rebuilt = makeButtons(root, 3);
    // Same keys, new order — the key wins over the position.
    rebuilt[0]!.dataset.focusKey = "k1";
    rebuilt[1]!.dataset.focusKey = "k0";
    rebuilt[2]!.dataset.focusKey = "k2";
    restoreFocus(root, snapshot);
    expect(document.activeElement).toBe(rebuilt[0]);
  });

  it("falls back to the focus-order position when the key is gone or disabled", () => {
    const items = makeButtons(root, 3);
    items[2]!.dataset.focusKey = "gone";
    items[2]!.focus();
    const snapshot = captureFocus(root);
    root.replaceChildren();
    const rebuilt = makeButtons(root, 3);
    rebuilt[2]!.dataset.focusKey = "gone";
    rebuilt[2]!.disabled = true;
    restoreFocus(root, snapshot);
    // Index 2 of the enabled controls clamps to the last enabled one.
    expect(document.activeElement).toBe(rebuilt[1]);
  });

  it("clamps the position to the rebuilt list", () => {
    const items = makeButtons(root, 4);
    items[3]!.focus();
    const snapshot = captureFocus(root);
    root.replaceChildren();
    const rebuilt = makeButtons(root, 2);
    restoreFocus(root, snapshot);
    expect(document.activeElement).toBe(rebuilt[1]);
  });

  it("does nothing for a null snapshot", () => {
    const items = makeButtons(root, 1);
    restoreFocus(root, null);
    expect(document.activeElement).not.toBe(items[0]);
  });
});
