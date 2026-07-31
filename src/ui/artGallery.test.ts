// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildGallerySections } from "../iso/art/gallery";
import { createArtGalleryScreen } from "./artGallery";
import { initScreenRouter, showScreen } from "./screen";

/**
 * The dev art gallery screen: one labeled cell per registry entry, a
 * substring filter that hides non-matching cells (and emptied
 * sections), and a Back route. The 2d context is stubbed as in
 * flow.test — painting is not under test, only the DOM structure.
 */

/** Canvas stub proxy, as in flow.test. */
function anything(): unknown {
  const fn = (): unknown => anything();
  return new Proxy(fn, {
    get: (_target, prop) =>
      prop === Symbol.toPrimitive ? () => 0 : anything(),
    set: () => true,
    apply: () => anything(),
  });
}

function cells(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(".nf-gallery-cell")];
}

function visibleCells(): HTMLElement[] {
  return cells().filter((cell) => !cell.hidden);
}

function filterBox(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>(".nf-gallery-filter");
  if (!input) throw new Error("filter box not rendered");
  return input;
}

const onBack = vi.fn();

beforeEach(() => {
  document.body.innerHTML = '<div id="ui-root"></div>';
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => anything() as CanvasRenderingContext2D,
  );
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  onBack.mockClear();
  initScreenRouter(document.getElementById("ui-root")!);
  showScreen(createArtGalleryScreen({ onBack }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("art gallery screen", () => {
  it("renders one labeled cell per registry entry, grouped in sections", () => {
    const sections = buildGallerySections();
    const total = sections.reduce((sum, s) => sum + s.entries.length, 0);
    expect(cells().length).toBe(total);
    expect(document.querySelectorAll(".nf-gallery-section").length).toBe(
      sections.length,
    );
    const labels = [...document.querySelectorAll(".nf-gallery-label")].map(
      (el) => el.textContent,
    );
    expect(labels).toContain("door");
    expect(labels).toContain("enemy nme-auric-agent look0 e");
    expect(labels).toContain("drone static-drone idle e");
    expect(labels).toContain("npc flick");
    const headings = [
      ...document.querySelectorAll(".nf-gallery-section-title"),
    ].map((el) => el.textContent ?? "");
    expect(headings.some((h) => h.startsWith("Tiles"))).toBe(true);
  });

  it("every cell carries a canvas for its sprite", () => {
    for (const cell of cells()) {
      expect(cell.querySelector("canvas")).not.toBeNull();
    }
  });

  it("filters cells by id substring and hides emptied sections", () => {
    const box = filterBox();
    box.value = "door";
    box.dispatchEvent(new Event("input"));
    const visible = visibleCells();
    expect(visible.length).toBeGreaterThan(0);
    for (const cell of visible) {
      expect(cell.querySelector(".nf-gallery-label")?.textContent).toContain(
        "door",
      );
    }
    const sections = [
      ...document.querySelectorAll<HTMLElement>(".nf-gallery-section"),
    ];
    expect(sections.some((s) => s.hidden)).toBe(true);
    expect(sections.filter((s) => !s.hidden).length).toBe(1);
  });

  it("restores all cells when the filter is cleared", () => {
    const box = filterBox();
    box.value = "door";
    box.dispatchEvent(new Event("input"));
    box.value = "";
    box.dispatchEvent(new Event("input"));
    expect(visibleCells().length).toBe(cells().length);
    expect(
      [...document.querySelectorAll<HTMLElement>(".nf-gallery-section")].every(
        (s) => !s.hidden,
      ),
    ).toBe(true);
  });

  it("routes Back through the provided callback", () => {
    const back = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "Back",
    );
    back?.click();
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
