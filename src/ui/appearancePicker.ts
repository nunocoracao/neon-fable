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
 * Keyboard and screen readers: the tab strip is a tablist and every
 * grid is a radiogroup of radios labelled from catalog data, each a
 * single tab stop with a roving tabindex — arrow keys move inside,
 * Enter/Space picks, Tab moves to the next group (see ./focus).
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
  swatchChips,
  type AppearanceTabConfig,
  type SwatchCategoryConfig,
  type ThumbCategoryConfig,
} from "../data";
import { installRovingGrid } from "./focus";
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
  /**
   * Tab config to render. Defaults to the creation wizard's full
   * APPEARANCE_TABS; the stylist passes the cosmetic-only subset. The
   * panel is generated entirely from this config plus the catalogs.
   */
  tabs?: readonly AppearanceTabConfig[];
  /** Tab to open on; lets the screen keep the tab across re-renders. */
  initialTab?: string;
  onTabChange?: (tab: string) => void;
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
  const tabs = options.tabs ?? APPEARANCE_TABS;
  if (tabs.length === 0) throw new Error("appearance picker needs tabs");
  const fallbackTab = tabs[0]!;
  let active: string =
    tabs.find((tab) => tab.id === options.initialTab)?.id ?? fallbackTab.id;

  const el = document.createElement("div");
  el.className = "nf-appearance-picker";

  const tabsRow = document.createElement("div");
  tabsRow.className = "nf-appearance-tabs";
  tabsRow.setAttribute("role", "tablist");
  tabsRow.setAttribute("aria-label", "Appearance category");

  const caption = document.createElement("p");
  caption.className = "nf-thumb-caption";

  const body = document.createElement("div");
  body.className = "nf-appearance-tab-body";
  body.id = "nf-appearance-tabpanel";
  body.setAttribute("role", "tabpanel");

  el.append(tabsRow, caption, body);

  function setTab(tab: string): void {
    if (tab !== active) {
      active = tab;
      options.onTabChange?.(tab);
    }
    render();
  }

  // One tab stop for the strip; Left/Right arrows walk the tabs.
  const tabsRoving = installRovingGrid(tabsRow, {
    itemSelector: "button.nf-appearance-tab",
    primary: (items) =>
      items.find((item) => item.getAttribute("aria-selected") === "true"),
  });

  function renderTabs(): void {
    // Rebuilding replaces a focused tab button; put focus back on the
    // active one so keyboard tab switching doesn't dump focus on <body>.
    const hadFocus = tabsRow.contains(document.activeElement);
    tabsRow.replaceChildren(
      ...tabs.map((tab) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "nf-button nf-button-small nf-appearance-tab";
        if (tab.id === active) button.classList.add("nf-selected");
        button.setAttribute("role", "tab");
        button.setAttribute("aria-selected", String(tab.id === active));
        button.setAttribute("aria-controls", body.id);
        button.textContent = tab.label;
        button.addEventListener("click", () => setTab(tab.id));
        return button;
      }),
    );
    tabsRoving.sync();
    if (hadFocus) {
      tabsRow
        .querySelector<HTMLButtonElement>('[aria-selected="true"]')
        ?.focus();
    }
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
    grid.setAttribute("role", "radiogroup");
    grid.setAttribute("aria-label", config.label);

    for (const option of appearanceCatalogs[config.category]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "nf-thumb";
      const selected = look[config.category] === option.id;
      if (selected) button.classList.add("nf-selected");
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", String(selected));
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

    // One tab stop, entering on the selection; arrows move inside.
    installRovingGrid(grid, {
      itemSelector: "button.nf-thumb",
      columns: () => config.columns,
      primary: (items) =>
        items.find((item) => item.getAttribute("aria-checked") === "true"),
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
    row.setAttribute("role", "radiogroup");
    row.setAttribute("aria-label", config.label);

    for (const chip of swatchChips(config.category)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "nf-swatch";
      button.style.background = chip.color;
      const selected = look[config.category] === chip.id;
      if (selected) button.classList.add("nf-selected");
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", String(selected));
      button.dataset.category = config.category;
      button.dataset.id = chip.id;
      button.title = chip.label;
      button.setAttribute("aria-label", `${config.label}: ${chip.label}`);
      button.addEventListener("click", () =>
        options.onPick(config.category, chip.id),
      );
      row.append(button);
    }

    // Single-row roving strip: left/right move, up/down stay put.
    installRovingGrid(row, {
      itemSelector: "button.nf-swatch",
      primary: (items) =>
        items.find((item) => item.getAttribute("aria-checked") === "true"),
    });

    wrap.append(heading, row);
    return wrap;
  }

  function renderBody(): void {
    const tab = tabs.find((t) => t.id === active) ?? fallbackTab;
    body.setAttribute("aria-label", tab.label);
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
