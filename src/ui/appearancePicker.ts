/**
 * Visual appearance picker for the creation wizard's appearance step:
 * category tabs (Body / Hair / Face / Extras from the tab config in
 * src/data/appearanceTabs) over thumbnail grids with one live-baked
 * thumb per catalog entry, plus flat palette-chip swatch rows for the
 * color categories (skin tone, hair color, eye color). Thumbs are real
 * renders of the working appearance wearing each option — full-body
 * idle minis for build, portrait crops for hair and face — cached
 * exactly like the portrait and sprite bakes; picking a color changes
 * the working look's remaps, so dependent thumbs re-bake under new
 * descriptor keys. Only the active tab's grids are built, so the step
 * opens without baking every catalog.
 *
 * Keyboard: arrow keys move within a grid, Tab cycles the category
 * tabs. Full a11y polish (roving tabindex, tablist semantics) is a
 * later task; this keeps the picker operable.
 */
import {
  composeCharacter,
  defaultAppearance,
  type Appearance,
  type AppearanceField,
} from "../character";
import {
  APPEARANCE_TABS,
  appearanceCatalogs,
  moveInGrid,
  swatchChips,
  type AppearanceTabId,
  type SwatchCategoryConfig,
  type ThumbCategoryConfig,
} from "../data";
import { emptyEquipment } from "../inventory/equipment";
import {
  composedCharacterGrid,
  composedFrameKey,
  type ComposedCharacter,
} from "../iso/art/layers";
import { BODY_FRAME } from "../iso/art/layers/body";
import { ART_SCALE, bakeSprite, spriteBytes } from "../iso/art/pixel";
import { createSpriteCache } from "../iso/art/spriteCache";
import type { Sprite } from "../iso/sprites";
import { portraitCanvas } from "./portraits";

/**
 * Byte budget for baked full-body mini canvases. A 64×96-at-2x bake
 * holds ~48 KiB; 4 MiB covers every look the pickers realistically
 * cycle through while bounding churn.
 */
export const MINI_CACHE_BUDGET_BYTES = 4 * 1024 * 1024;

const miniCache = createSpriteCache<Sprite>(MINI_CACHE_BUDGET_BYTES, spriteBytes);

/**
 * A display canvas showing the full-body idle sprite for an appearance
 * (front facing, resting frame), baked through the same layer pipeline
 * and cache shape as scene sprites. A corrupt appearance degrades to
 * the stock look instead of crashing the screen.
 */
export function characterMiniCanvas(appearance: Appearance): HTMLCanvasElement {
  let composed: ComposedCharacter;
  try {
    composed = composeCharacter(appearance, emptyEquipment());
  } catch (error) {
    console.error("Invalid appearance; rendering the default mini", error);
    composed = composeCharacter(defaultAppearance(), emptyEquipment());
  }
  const baked = miniCache.get(
    `mini:${composedFrameKey(composed, "s", "idle", 0)}`,
    () => bakeSprite(composedCharacterGrid(composed, "s", "idle", 0), 0, 0),
  );

  const el = document.createElement("canvas");
  el.className = "nf-thumb-mini";
  el.width = BODY_FRAME.width * ART_SCALE;
  el.height = BODY_FRAME.height * ART_SCALE;
  el.getContext("2d")?.drawImage(baked.image, 0, 0);
  return el;
}

export interface AppearancePickerOptions {
  /** Live working appearance the thumbs render against. */
  appearance: () => Appearance;
  /** Tab to open on; lets the screen keep the tab across re-renders. */
  initialTab?: AppearanceTabId;
  onTabChange?: (tab: AppearanceTabId) => void;
  /** A thumb was clicked; the caller owns applying it to the draft. */
  onPick: (category: AppearanceField, id: string) => void;
}

export interface AppearancePicker {
  el: HTMLElement;
  /** Re-render the active tab against the current working appearance. */
  update(): void;
}

export function createAppearancePicker(
  options: AppearancePickerOptions,
): AppearancePicker {
  let active: AppearanceTabId = options.initialTab ?? APPEARANCE_TABS[0].id;

  const el = document.createElement("div");
  el.className = "nf-appearance-picker";

  const tabsRow = document.createElement("div");
  tabsRow.className = "nf-appearance-tabs";

  const caption = document.createElement("p");
  caption.className = "nf-thumb-caption";

  const body = document.createElement("div");
  body.className = "nf-appearance-tab-body";

  el.append(tabsRow, caption, body);

  function setTab(tab: AppearanceTabId, focusGrid: boolean): void {
    if (tab !== active) {
      active = tab;
      options.onTabChange?.(tab);
    }
    render();
    if (focusGrid) {
      body
        .querySelector<HTMLButtonElement>("button.nf-thumb, button.nf-swatch")
        ?.focus();
    }
  }

  function renderTabs(): void {
    tabsRow.replaceChildren(
      ...APPEARANCE_TABS.map((tab) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "nf-button nf-button-small nf-appearance-tab";
        if (tab.id === active) button.classList.add("nf-selected");
        button.setAttribute("aria-pressed", String(tab.id === active));
        button.textContent = tab.label;
        button.addEventListener("click", () => setTab(tab.id, false));
        return button;
      }),
    );
  }

  function thumbCanvas(
    config: ThumbCategoryConfig,
    look: Appearance,
    id: string,
  ): HTMLCanvasElement {
    const preview = { ...look, [config.category]: id } as Appearance;
    return config.thumb === "mini"
      ? characterMiniCanvas(preview)
      : portraitCanvas(preview, emptyEquipment());
  }

  function thumbSection(
    config: ThumbCategoryConfig,
    look: Appearance,
  ): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "nf-thumb-section";
    const heading = document.createElement("span");
    heading.className = "nf-field-label";
    heading.textContent = config.label;

    const grid = document.createElement("div");
    grid.className = "nf-thumb-grid";
    grid.style.gridTemplateColumns = `repeat(${config.columns}, max-content)`;

    for (const option of appearanceCatalogs[config.category]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "nf-thumb";
      const selected = look[config.category] === option.id;
      if (selected) button.classList.add("nf-selected");
      button.setAttribute("aria-pressed", String(selected));
      button.dataset.category = config.category;
      button.dataset.id = option.id;
      button.title = option.label;
      button.setAttribute("aria-label", `${config.label}: ${option.label}`);
      button.append(thumbCanvas(config, look, option.id));
      button.addEventListener("click", () =>
        options.onPick(config.category, option.id),
      );
      grid.append(button);
    }

    // Arrow keys move within this grid; swallowed here so the wizard's
    // list navigation doesn't also walk the focus linearly.
    grid.addEventListener("keydown", (event: KeyboardEvent) => {
      if (
        event.key !== "ArrowRight" &&
        event.key !== "ArrowLeft" &&
        event.key !== "ArrowDown" &&
        event.key !== "ArrowUp"
      ) {
        return;
      }
      const thumbs = [
        ...grid.querySelectorAll<HTMLButtonElement>("button.nf-thumb"),
      ];
      const index = thumbs.indexOf(document.activeElement as HTMLButtonElement);
      if (index === -1) return;
      event.preventDefault();
      event.stopPropagation();
      const next = moveInGrid(index, thumbs.length, config.columns, event.key);
      if (next !== null) thumbs[next]?.focus();
    });

    wrap.append(heading, grid);
    return wrap;
  }

  /**
   * A swatch row for a color category: one flat palette chip per
   * catalog entry, straight off swatchChips — no bakes involved.
   */
  function swatchSection(
    config: SwatchCategoryConfig,
    look: Appearance,
  ): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "nf-thumb-section";
    const heading = document.createElement("span");
    heading.className = "nf-field-label";
    heading.textContent = config.label;

    const row = document.createElement("div");
    row.className = "nf-swatch-row";

    for (const chip of swatchChips(config.category)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "nf-swatch";
      button.style.background = chip.color;
      const selected = look[config.category] === chip.id;
      if (selected) button.classList.add("nf-selected");
      button.setAttribute("aria-pressed", String(selected));
      button.dataset.category = config.category;
      button.dataset.id = chip.id;
      button.title = chip.label;
      button.setAttribute("aria-label", `${config.label}: ${chip.label}`);
      button.addEventListener("click", () =>
        options.onPick(config.category, chip.id),
      );
      row.append(button);
    }

    // Left/right walk the single-row strip (columns = count makes
    // up/down off-grid moves); swallowed like the thumb grids' keys.
    row.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      const chips = [
        ...row.querySelectorAll<HTMLButtonElement>("button.nf-swatch"),
      ];
      const index = chips.indexOf(document.activeElement as HTMLButtonElement);
      if (index === -1) return;
      event.preventDefault();
      event.stopPropagation();
      const next = moveInGrid(index, chips.length, chips.length, event.key);
      if (next !== null) chips[next]?.focus();
    });

    wrap.append(heading, row);
    return wrap;
  }

  function renderBody(): void {
    const tab = APPEARANCE_TABS.find((t) => t.id === active) ?? APPEARANCE_TABS[0];
    const look = options.appearance();
    // Rebuilding replaces a focused thumb; put focus back on its
    // successor so keyboard picking doesn't dump focus on <body>.
    const focused =
      document.activeElement instanceof HTMLElement &&
      body.contains(document.activeElement)
        ? {
            category: document.activeElement.dataset.category,
            id: document.activeElement.dataset.id,
          }
        : null;
    body.replaceChildren(
      ...tab.categories.map((config) =>
        config.kind === "swatch"
          ? swatchSection(config, look)
          : thumbSection(config, look),
      ),
    );
    if (focused?.category && focused.id) {
      body
        .querySelector<HTMLButtonElement>(
          `button[data-category="${focused.category}"][data-id="${focused.id}"]`,
        )
        ?.focus();
    }
  }

  function render(): void {
    renderTabs();
    renderBody();
  }

  // Tab cycles the category tabs while the picker holds focus (basic
  // keyboard operability; roving-tabindex a11y comes later).
  el.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key !== "Tab") return;
    event.preventDefault();
    event.stopPropagation();
    const index = APPEARANCE_TABS.findIndex((tab) => tab.id === active);
    const count = APPEARANCE_TABS.length;
    const next =
      APPEARANCE_TABS[(index + (event.shiftKey ? -1 : 1) + count) % count];
    if (next) setTab(next.id, true);
  });

  // Hovering or focusing a thumb or chip surfaces its label in the
  // caption bar.
  const showCaption = (target: EventTarget | null): void => {
    const thumb =
      target instanceof HTMLElement
        ? target.closest("button.nf-thumb, button.nf-swatch")
        : null;
    if (thumb instanceof HTMLElement) caption.textContent = thumb.title;
  };
  el.addEventListener("mouseover", (event) => showCaption(event.target));
  el.addEventListener("focusin", (event) => showCaption(event.target));

  render();
  return { el, update: render };
}
