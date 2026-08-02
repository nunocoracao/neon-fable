// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  GRAPHICS_SETTING_KEYS,
  SETTINGS_KEY,
  settings,
  TEXT_SCALE_VAR,
} from "../settings";
import { focusables } from "./focus";
import { GRAPHICS_CONTROLS, GRAPHICS_GROUPS } from "./graphicsModel";
import { createSettingsOverlay } from "./settingsScreen";
import type { OverlayHandle } from "./overlay";

/**
 * The Graphics & Comfort section as a player meets it: one panel, every
 * visual switch on it, each one taking effect and staying put.
 *
 * The table itself is covered without a DOM in ./graphicsModel.test.ts.
 * What is under test here is the half a table cannot promise — that the
 * rows are really rendered, that clicking one really writes, that the
 * reset control really resets, and that the whole section is reachable
 * from the keyboard like every other panel in the game.
 */

let overlay: OverlayHandle | null = null;

function mount(): void {
  overlay = createSettingsOverlay({ onClose: () => {} });
  document.body.append(overlay.el);
}

/** The option buttons of one control's row, by control id. */
function row(controlId: string): HTMLButtonElement[] {
  const el = document.querySelector(`[data-setting="${controlId}"]`);
  if (!el) throw new Error(`no settings row for "${controlId}"`);
  return [...el.querySelectorAll("button")];
}

function option(controlId: string, value: string): HTMLButtonElement {
  const button = row(controlId).find((b) => b.dataset.value === value);
  if (!button) throw new Error(`no "${value}" option on "${controlId}"`);
  return button;
}

/** Which option of a row reads as chosen right now. */
function selected(controlId: string): string | undefined {
  return row(controlId).find((b) => b.classList.contains("nf-selected"))
    ?.dataset.value;
}

beforeEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  settings.update({ ...DEFAULT_SETTINGS });
});

afterEach(() => {
  overlay?.destroy();
  overlay = null;
  settings.update({ ...DEFAULT_SETTINGS });
});

describe("the Graphics & Comfort section", () => {
  it("renders a labelled, described row for every control in the table", () => {
    mount();
    for (const control of GRAPHICS_CONTROLS) {
      const el = document.querySelector(`[data-setting="${control.id}"]`);
      expect(el, control.id).toBeTruthy();
      expect(el?.querySelector(".nf-setting-label")?.textContent).toBe(
        control.label,
      );
      expect(row(control.id)).toHaveLength(control.options.length);
    }
    const headings = [...document.querySelectorAll(".nf-settings h4")].map(
      (h) => h.textContent,
    );
    for (const group of GRAPHICS_GROUPS) {
      expect(headings).toContain(group.title);
    }
  });

  it("shows what every row is currently set to", () => {
    settings.update({ colorMode: "assist", shakeScale: 0, motion: "full" });
    mount();
    expect(selected("colorMode")).toBe("assist");
    expect(selected("shakeScale")).toBe("0");
    expect(selected("motion")).toBe("full");
    expect(selected("glow")).toBe("on");
  });

  it("writes, persists, and re-reads every option of every row", () => {
    mount();
    for (const control of GRAPHICS_CONTROLS) {
      for (const value of control.options.map((o) => o.value)) {
        option(control.id, value).click();
        expect(control.value(settings.get()), `${control.id}/${value}`).toBe(
          value,
        );
        expect(selected(control.id), `${control.id}/${value}`).toBe(value);
        expect(localStorage.getItem(SETTINGS_KEY), control.id).toContain(
          `"${Object.keys(control.patch(value))[0]}"`,
        );
      }
    }
  });

  it("applies motion and text size to the document as they are chosen", () => {
    mount();
    option("motion", "reduced").click();
    expect(
      document.documentElement.classList.contains("nf-reduced-motion"),
    ).toBe(true);
    option("motion", "full").click();
    expect(
      document.documentElement.classList.contains("nf-reduced-motion"),
    ).toBe(false);
    expect(document.documentElement.classList.contains("nf-full-motion")).toBe(
      true,
    );

    option("textScale", "1.3").click();
    expect(
      document.documentElement.style.getPropertyValue(TEXT_SCALE_VAR),
    ).toBe("1.3");
    option("textScale", "1").click();
    expect(
      document.documentElement.style.getPropertyValue(TEXT_SCALE_VAR),
    ).toBe("1");
  });

  it("resets the whole section — and only the section — on one press", () => {
    settings.update({ textSpeed: "instant", difficulty: "blackout" });
    mount();
    // Move every row off its default.
    for (const control of GRAPHICS_CONTROLS) {
      const away = control.options.find(
        (o) => o.value !== control.value(DEFAULT_SETTINGS),
      );
      if (away) option(control.id, away.value).click();
    }
    for (const key of GRAPHICS_SETTING_KEYS) {
      expect(settings.get()[key], key).not.toEqual(DEFAULT_SETTINGS[key]);
    }

    const reset = document.querySelector<HTMLButtonElement>(
      '[data-reset="graphics"]',
    );
    expect(reset).toBeTruthy();
    reset?.click();

    for (const key of GRAPHICS_SETTING_KEYS) {
      expect(settings.get()[key], key).toEqual(DEFAULT_SETTINGS[key]);
    }
    // Every row says so too, without the panel being rebuilt.
    for (const control of GRAPHICS_CONTROLS) {
      expect(selected(control.id), control.id).toBe(
        control.value(DEFAULT_SETTINGS),
      );
    }
    // Somebody else's settings, left alone.
    expect(settings.get().textSpeed).toBe("instant");
    expect(settings.get().difficulty).toBe("blackout");
  });

  it("survives a reset that lands on a document with no reduced motion", () => {
    mount();
    option("motion", "reduced").click();
    document.querySelector<HTMLButtonElement>('[data-reset="graphics"]')
      ?.click();
    expect(settings.get().motion).toBe("system");
    expect(document.documentElement.classList.contains("nf-full-motion")).toBe(
      false,
    );
  });

  it("keeps every row reachable and operable from the keyboard", () => {
    mount();
    const panel = document.querySelector<HTMLElement>(".nf-settings");
    if (!panel) throw new Error("no settings panel");
    const order = focusables(panel);
    for (const control of GRAPHICS_CONTROLS) {
      for (const button of row(control.id)) {
        // Native buttons: focusable, never taken out of the tab order,
        // and never left out of the panel's arrow-key run.
        expect(button.tabIndex, control.id).not.toBe(-1);
        expect(order, control.id).toContain(button);
        expect(button.hasAttribute("aria-pressed"), control.id).toBe(true);
      }
    }

    // The arrow-key run really walks them: focus the first option of
    // the first graphics row and step to the next control.
    const first = row(GRAPHICS_CONTROLS[0]!.id)[0]!;
    first.focus();
    panel.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    expect(document.activeElement).toBe(order[order.indexOf(first) + 1]);

    // The state reads without colour, on the chosen one and the rest.
    option("glow", "off").click();
    expect(option("glow", "off").getAttribute("aria-pressed")).toBe("true");
    expect(option("glow", "on").getAttribute("aria-pressed")).toBe("false");
  });
});
