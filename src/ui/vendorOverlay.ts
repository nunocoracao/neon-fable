import { audio } from "../audio";
import type { SoundEventId } from "../audio";
import { EconomyError } from "../data/economy";
import {
  buyFromVendor,
  haggleWithVendor,
  sellToVendor,
} from "../economy";
import type { GameState } from "../state/gameState";
import { focusFirst } from "./focus";
import type { OverlayHandle } from "./overlay";
import type { Session } from "./session";
import {
  vendorModel,
  type BuyRowView,
  type PriceView,
  type SellRowView,
  type VendorModel,
  type VendorTab,
} from "./vendorModel";
import { t } from "./strings";

/**
 * The counter: the only screen that buys or sells.
 *
 * Two tabs — what is on the shelf, what is in your bag — one haggle,
 * and a price on every row that shows its working. The breakdown is not
 * decoration: a stall's risk premium, a faction's regard and a won
 * argument all move the same number, and a player who cannot see which
 * of them is doing it has no way to act on any of them.
 *
 * Nothing here computes a price or enforces a rule. Rows come from
 * ./vendorModel.ts; buying, selling and arguing dispatch into the pure
 * economy ops and surface their EconomyError messages, exactly as the
 * bench does with InventoryError.
 */
export interface VendorOverlayOptions {
  session: Session;
  vendorId: string;
  onStateChange(): void;
  onClose(): void;
}

export function createVendorOverlay(
  options: VendorOverlayOptions,
): OverlayHandle {
  const { session, vendorId } = options;

  const el = document.createElement("div");
  el.className = "nf-overlay nf-overlay-center";

  const panel = document.createElement("div");
  panel.className = "nf-panel nf-vendor";
  el.append(panel);

  let tab: VendorTab = "buy";
  /** Which row's breakdown is open; null when none is. */
  let openBreakdown: string | null = null;
  let message = "";
  let messageIsError = false;

  /**
   * Runs a counter operation and folds the result back into the run.
   * The sound may be deferred to a thunk, because a haggle does not
   * know which of its two cues it is until the roll has been made.
   */
  function apply(
    action: (state: GameState) => { state: GameState },
    sound: SoundEventId | (() => SoundEventId) = "ui.equip",
  ): void {
    // Cleared before the action, never after: a haggle writes its own
    // line from inside the action and must not be wiped by its success.
    message = "";
    messageIsError = false;
    try {
      const next = action(session.state);
      session.state = next.state;
      audio.emit(typeof sound === "function" ? sound() : sound);
      options.onStateChange();
    } catch (error) {
      if (!(error instanceof EconomyError)) throw error;
      message = error.message;
      messageIsError = true;
    }
    render();
  }

  function button(
    label: string,
    className: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const el = document.createElement("button");
    el.className = className;
    el.textContent = label;
    el.addEventListener("click", onClick);
    return el;
  }

  /**
   * The price, with its reasons. The one-line version rides the title
   * attribute (that is the hover), and the same lines expand in place
   * for anybody who cannot hover — a breakdown only a mouse can reach
   * is not a breakdown.
   */
  function renderPrice(
    price: PriceView,
    key: string,
    onToggle: () => void,
  ): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "nf-vendor-price";
    wrap.title = price.summary;

    const figure = document.createElement("span");
    figure.className = price.adjusted
      ? "nf-vendor-figure nf-vendor-figure-moved"
      : "nf-vendor-figure";
    figure.textContent = price.label;

    const base = document.createElement("span");
    base.className = "nf-vendor-base";
    base.textContent = price.baseLabel;
    wrap.append(figure, base);

    if (price.adjusted) {
      const toggle = button(
        openBreakdown === key ? t("vendor.hideBreakdown") : t("vendor.why"),
        "nf-button nf-button-small nf-vendor-why",
        onToggle,
      );
      toggle.setAttribute(
        "aria-expanded",
        openBreakdown === key ? "true" : "false",
      );
      wrap.append(toggle);
    }

    if (openBreakdown === key) {
      const list = document.createElement("ul");
      list.className = "nf-vendor-lines";
      for (const line of price.lines) {
        const row = document.createElement("li");
        const label = document.createElement("span");
        label.textContent = line.label;
        const amount = document.createElement("span");
        amount.className = "nf-vendor-amount";
        amount.textContent = line.amount;
        row.append(label, amount);
        list.append(row);
      }
      wrap.append(list);
    }
    return wrap;
  }

  function renderBuyRow(row: BuyRowView): HTMLElement {
    const card = document.createElement("div");
    card.className = row.buyable
      ? "nf-vendor-row"
      : "nf-vendor-row nf-vendor-row-shut";

    const name = document.createElement("div");
    name.className = "nf-item-name";
    name.textContent = row.name;
    const summary = document.createElement("div");
    summary.className = "nf-item-summary";
    summary.textContent = row.summary;
    card.append(name, summary);

    if (row.note) {
      const note = document.createElement("div");
      note.className = "nf-vendor-note";
      note.textContent = row.note;
      card.append(note);
    }

    const stock = document.createElement("div");
    stock.className = "nf-vendor-stock";
    stock.textContent = row.stockLabel;
    card.append(stock);

    card.append(
      renderPrice(row.price, `buy:${row.entryId}`, () => {
        openBreakdown =
          openBreakdown === `buy:${row.entryId}` ? null : `buy:${row.entryId}`;
        render();
      }),
    );

    const buy = button(
      row.remaining <= 0
        ? t("vendor.soldOut")
        : t("vendor.buy", { price: row.price.label }),
      "nf-button nf-button-small",
      () => apply((state) => buyFromVendor(state, vendorId, row.entryId)),
    );
    buy.disabled = !row.buyable;
    card.append(buy);
    return card;
  }

  function renderSellRow(row: SellRowView): HTMLElement {
    const card = document.createElement("div");
    card.className = "nf-vendor-row";

    const name = document.createElement("div");
    name.className = "nf-item-name";
    name.textContent =
      row.quantity > 1 ? `${row.name} ×${row.quantity}` : row.name;
    const summary = document.createElement("div");
    summary.className = "nf-item-summary";
    summary.textContent = t("vendor.sellSummary", {
      summary: row.summary,
      condition: row.conditionLabel,
    });
    card.append(name, summary);

    const key = `sell:${row.stackIndex}`;
    card.append(
      renderPrice(row.price, key, () => {
        openBreakdown = openBreakdown === key ? null : key;
        render();
      }),
    );

    card.append(
      button(`Sell — ${row.price.label}`, "nf-button nf-button-small", () =>
        apply(
          (state) => sellToVendor(state, vendorId, row.stackIndex),
          "ui.unequip",
        ),
      ),
    );
    return card;
  }

  function renderTabs(model: VendorModel): HTMLElement {
    const strip = document.createElement("div");
    strip.className = "nf-vendor-tabs";
    strip.setAttribute("role", "tablist");
    for (const id of ["buy", "sell"] as const) {
      const selected = model.tab === id;
      const tabButton = button(
        id === "buy" ? t("vendor.tab.buy") : t("vendor.tab.sell"),
        selected ? "nf-button nf-button-small nf-selected" : "nf-button nf-button-small",
        () => {
          tab = id;
          openBreakdown = null;
          message = "";
          render();
        },
      );
      tabButton.setAttribute("role", "tab");
      tabButton.setAttribute("aria-selected", selected ? "true" : "false");
      strip.append(tabButton);
    }
    return strip;
  }

  function renderHaggle(model: VendorModel): HTMLElement {
    const row = document.createElement("div");
    // The untried state is the base look; only the two settled ones
    // carry a colour, so there is no class here nothing styles.
    row.className =
      model.haggle.state === "none"
        ? "nf-vendor-haggle"
        : `nf-vendor-haggle nf-vendor-haggle-${model.haggle.state}`;

    const label = model.haggle.chanceLabel
      ? `${model.haggle.label} (${model.haggle.chanceLabel})`
      : model.haggle.label;
    // Which way the argument went, remembered across the action so the
    // cue that answers it can be chosen after the roll rather than before.
    let won = false;
    const attempt = button(label, "nf-button nf-button-small", () =>
      apply(
        (state) => {
          const result = haggleWithVendor(state, vendorId);
          won = result.won;
          message = result.won
            ? `${model.keeper} sighs and takes it off the price.`
            : `${model.keeper} does not blink. Prices here are what they are, this chapter.`;
          messageIsError = !result.won;
          return result;
        },
        () => (won ? "ui.haggle.success" : "ui.haggle.fail"),
      ),
    );
    attempt.disabled = !model.haggle.canTry;

    const hint = document.createElement("span");
    hint.className = "nf-vendor-haggle-hint";
    hint.textContent = model.haggle.hint;
    row.append(attempt, hint);
    return row;
  }

  function render(): void {
    const model = vendorModel(session.state, vendorId, tab);
    panel.replaceChildren();

    const header = document.createElement("div");
    header.className = "nf-panel-header";
    const title = document.createElement("h2");
    title.textContent = model.title;
    const credits = document.createElement("span");
    credits.className = "nf-bench-credits";
    credits.textContent = t("counter.credits", { credits: model.credits });
    const close = document.createElement("button");
    close.className = "nf-button nf-button-small";
    close.textContent = t("common.doneEsc");
    close.addEventListener("click", options.onClose);
    header.append(title, credits, close);
    panel.append(header);

    const kicker = document.createElement("p");
    kicker.className = "nf-vendor-kicker";
    kicker.textContent = [
      model.kindLabel,
      model.actLabel,
      model.standingLabel,
    ]
      .filter((part): part is string => part !== null)
      .join(" · ");
    const blurb = document.createElement("p");
    blurb.className = "nf-dim";
    blurb.textContent = model.blurb;
    panel.append(kicker, blurb);

    panel.append(renderHaggle(model));

    const messageLine = document.createElement("p");
    messageLine.className = messageIsError
      ? "nf-message nf-error"
      : "nf-message";
    messageLine.textContent = message;
    panel.append(messageLine);

    panel.append(renderTabs(model));

    const list = document.createElement("div");
    list.className = "nf-vendor-list";
    const rows =
      model.tab === "buy"
        ? model.buy.map(renderBuyRow)
        : model.sell.map(renderSellRow);
    if (rows.length === 0) {
      const empty = document.createElement("p");
      empty.className = "nf-dim";
      empty.textContent =
        model.tab === "buy" ? t("vendor.empty.buy") : t("vendor.empty.sell");
      list.append(empty);
    } else {
      list.append(...rows);
    }
    panel.append(list);
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      options.onClose();
    }
  }

  render();
  window.addEventListener("keydown", onKeyDown);
  focusFirst(panel);

  return {
    el,
    destroy(): void {
      window.removeEventListener("keydown", onKeyDown);
      el.remove();
    },
  };
}
