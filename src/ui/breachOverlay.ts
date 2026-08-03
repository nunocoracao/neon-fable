import { audio } from "../audio";
import { breachFlag, requireBreachContext } from "../data/breach";
import type { BreachContext } from "../data/breach";
import {
  BreachError,
  breachOutcome,
  breachRescueOffered,
  breachSpent,
  headId,
  openBreach,
  readRunner,
  routeBreach,
  settleBreach,
  stepBreach,
  stepRefusal,
  undoBreach,
  withdrawBreach,
  type BreachGame,
  type BreachSettlement,
} from "../minigames";
import {
  breachBrief,
  breachPanel,
  breachReport,
  spentLine,
  type BreachCell,
} from "./breachModel";
import { installRovingGrid } from "./focus";
import type { OverlayHandle } from "./overlay";
import type { Session } from "./session";
import { t } from "./strings";

/**
 * Breach, on screen: a briefing, a lattice, and a report.
 *
 * Keyboard first. The grid is a roving-tabindex grid of buttons, so
 * arrows walk the lattice and Enter routes the hop under the cursor —
 * the same pattern the appearance pickers use — with U to retrace and W
 * to pull out. Focus follows the head of the route after every move,
 * which is both the "you are here" marker and where the next arrow
 * press should start from. Mouse works because the cells are buttons.
 *
 * No rule lives here. Every hop dispatches into the pure engine and
 * surfaces its BreachError message verbatim (exactly as the inventory
 * panel does), every figure comes off ./breachModel.ts, and the run is
 * folded back into the playthrough by `settleBreach` the moment it
 * stops — before the panel is closed, so a run can never be lost by
 * shutting the window.
 */
export interface BreachOverlayOptions {
  session: Session;
  contextId: string;
  onStateChange(): void;
  /** Fires once, when a finished run has been written into the run. */
  onSettled(settlement: BreachSettlement, context: BreachContext): void;
  onClose(): void;
}

type Phase = "brief" | "run" | "report" | "spent";

export function createBreachOverlay(
  options: BreachOverlayOptions,
): OverlayHandle {
  const { session } = options;
  const context = requireBreachContext(options.contextId);

  const el = document.createElement("div");
  el.className = "nf-overlay nf-overlay-center";
  const panel = document.createElement("div");
  panel.className = "nf-panel nf-breach";
  el.append(panel);

  const already = breachSpent(session.state, context.id);
  let phase: Phase = already ? "spent" : "brief";
  let game: BreachGame = openBreach(session.state, context);
  const runner = readRunner(session.state);
  // Read at open, off the run as it stands: three lockouts already
  // taken and the switch on (see breachRescueOffered).
  const rescueOffered = !already && breachRescueOffered(session.state);
  let settlement: BreachSettlement | null = null;
  let message = "";
  let messageIsError = false;

  function say(text: string, isError = false): void {
    message = text;
    messageIsError = isError;
  }

  /**
   * Folds a stopped run into the playthrough. Called the instant the
   * engine reports a terminal status, so the record is written before
   * the report is even drawn.
   */
  function settle(): void {
    if (settlement !== null || game.status === "running") return;
    settlement = settleBreach(session.state, context, breachOutcome(game));
    session.state = settlement.state;
    phase = "report";
    audio.emit(game.status === "breached" ? "ui.breach.breached" : "ui.breach.lockout");
    options.onStateChange();
    options.onSettled(settlement, context);
  }

  function jackIn(): void {
    phase = "run";
    say("");
    audio.emit("world.interact");
    render();
  }

  /**
   * The rescue assist taken up: the route is handed over rather than
   * run. Settles straight to the report, which pays the context's own
   * prize and none of the credits routing would have earned (see
   * routeBreach). Offered on the briefing beside Jack in — never
   * instead of it, because somebody who has taken three lockouts and
   * still wants to route the fourth by hand is entitled to.
   */
  function routeForMe(): void {
    game = routeBreach(game);
    settle();
    render();
  }

  function step(nodeId: string): void {
    const refusal = stepRefusal(game, nodeId);
    if (refusal) {
      audio.emit("ui.cancel");
      say(refusal.message, true);
      render();
      return;
    }
    const sprungBefore = game.sprung.length;
    game = stepBreach(game, nodeId);
    // A node taking is a pulse; a node that turns out to have been a
    // watchdog is the alarm instead. The budget meter says the same
    // thing a beat later, but the ear gets there first.
    audio.emit(
      game.sprung.length > sprungBefore ? "ui.breach.alarm" : "ui.breach.node",
    );
    say("");
    settle();
    render();
  }

  function undo(): void {
    try {
      game = undoBreach(game);
      audio.emit("ui.cancel");
      say(t("breach.undo"));
    } catch (error) {
      if (!(error instanceof BreachError)) throw error;
      say(error.message, true);
    }
    render();
  }

  function withdraw(): void {
    try {
      game = withdrawBreach(game);
      settle();
    } catch (error) {
      if (!(error instanceof BreachError)) throw error;
      say(error.message, true);
    }
    render();
  }

  function button(
    label: string,
    className: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const control = document.createElement("button");
    control.className = className;
    control.textContent = label;
    control.addEventListener("click", onClick);
    return control;
  }

  function paragraph(text: string, className = ""): HTMLElement {
    const p = document.createElement("p");
    if (className) p.className = className;
    p.textContent = text;
    return p;
  }

  function header(): HTMLElement {
    const bar = document.createElement("div");
    bar.className = "nf-panel-header";
    const title = document.createElement("h2");
    title.textContent = context.name;
    bar.append(title);
    return bar;
  }

  function renderBrief(): void {
    const model = breachBrief(game, context, runner);
    panel.append(
      header(),
      paragraph(model.difficultyLine, "nf-breach-kicker"),
      paragraph(model.brief),
      paragraph(model.prize, "nf-breach-prize"),
      paragraph(model.bufferLine, "nf-breach-buffer"),
    );
    if (model.notes.length > 0) {
      const notes = document.createElement("ul");
      notes.className = "nf-breach-notes";
      for (const note of model.notes) {
        const item = document.createElement("li");
        item.textContent = note;
        notes.append(item);
      }
      panel.append(notes);
    }
    panel.append(paragraph(model.warning, "nf-dim"));
    const menu = document.createElement("div");
    menu.className = "nf-menu";
    menu.append(button(t("breach.jackIn"), "nf-button", jackIn));
    if (rescueOffered) {
      menu.append(
        button(
          t("breach.rescue"),
          "nf-button nf-breach-rescue",
          routeForMe,
        ),
      );
    }
    menu.append(button(t("breach.walkAway"), "nf-button", options.onClose));
    panel.append(menu);
    if (rescueOffered) {
      panel.append(
        paragraph(t("breach.rescue.note"), "nf-dim"),
      );
    }
  }

  function renderCell(cell: BreachCell): HTMLButtonElement {
    const control = document.createElement("button");
    const classes = ["nf-breach-cell", `nf-breach-${cell.tone}`];
    if (cell.view.head) classes.push("nf-breach-head");
    else if (cell.view.onPath) classes.push("nf-breach-routed");
    if (cell.view.steppable) classes.push("nf-breach-open");
    control.className = classes.join(" ");
    control.dataset.node = cell.view.id;
    control.title = cell.label;
    control.setAttribute("aria-label", cell.label);
    control.tabIndex = -1;

    const glyph = document.createElement("span");
    glyph.className = "nf-breach-glyph";
    glyph.textContent = cell.glyph;
    control.append(glyph);
    if (cell.yieldLabel) {
      const yieldMark = document.createElement("span");
      yieldMark.className = "nf-breach-yield";
      yieldMark.textContent = cell.yieldLabel;
      control.append(yieldMark);
    }
    control.addEventListener("click", () => step(cell.view.id));
    return control;
  }

  function renderRun(): void {
    const model = breachPanel(game, context);
    panel.append(header());

    const meters = document.createElement("div");
    meters.className = "nf-breach-meters";
    for (const [text, className] of [
      [model.bufferLine, "nf-breach-meter nf-breach-meter-buffer"],
      [model.chainLine, "nf-breach-meter"],
      [model.harvestLine, "nf-breach-meter"],
    ] as const) {
      const meter = document.createElement("span");
      meter.className = className;
      meter.textContent = text;
      meters.append(meter);
    }
    // The buffer bar, so how close the trace is reads at a glance.
    const bar = document.createElement("div");
    bar.className = "nf-breach-bar";
    const fill = document.createElement("div");
    fill.className = "nf-breach-bar-fill";
    const share =
      model.buffer.max > 0
        ? Math.max(0, Math.min(1, model.buffer.left / model.buffer.max))
        : 0;
    fill.style.width = `${Math.round(share * 100)}%`;
    bar.append(fill);
    panel.append(meters, bar);

    const board = document.createElement("div");
    board.className = "nf-breach-grid";
    board.style.setProperty("--nf-breach-columns", `${model.columns}`);
    board.setAttribute("role", "grid");
    board.setAttribute("aria-label", t("breach.lattice"));
    for (const cell of model.cells) board.append(renderCell(cell));
    panel.append(board);

    // A fresh grid every render: the board is rebuilt from scratch, so
    // the roving tabindex is installed with it rather than re-synced.
    installRovingGrid(board, {
      itemSelector: ".nf-breach-cell",
      columns: () => model.columns,
      primary: (items) =>
        items.find((item) => item.dataset.node === headId(game)) ?? items[0],
    });

    const line = document.createElement("p");
    line.className = messageIsError ? "nf-message nf-error" : "nf-message";
    line.textContent = message || t("breach.help");
    panel.append(line);

    const menu = document.createElement("div");
    menu.className = "nf-menu nf-breach-actions";
    const back = button(t("breach.backUp"), "nf-button nf-button-small", undo);
    back.disabled = !model.canUndo;
    const out = button(t("breach.pullOut"), "nf-button nf-button-small", withdraw);
    out.disabled = !model.canWithdraw;
    menu.append(back, out);
    panel.append(menu);
  }

  function renderReport(): void {
    if (!settlement) return;
    const model = breachReport(
      context,
      breachOutcome(game),
      settlement.award,
    );
    panel.append(header());
    const kicker = document.createElement("div");
    kicker.className = "nf-breach-kicker";
    kicker.textContent = model.headline;
    panel.append(kicker, paragraph(model.body));
    if (model.payout.length > 0) {
      const list = document.createElement("ul");
      list.className = "nf-breach-payout";
      for (const entry of model.payout) {
        const item = document.createElement("li");
        item.textContent = entry;
        list.append(item);
      }
      panel.append(list);
    }
    const menu = document.createElement("div");
    menu.className = "nf-menu";
    menu.append(button(t("breach.jackOut"), "nf-button", options.onClose));
    panel.append(menu);
  }

  function renderSpent(): void {
    panel.append(
      header(),
      paragraph(spentLine(context, session.state.flags[breachFlag(context.id)])),
    );
    const menu = document.createElement("div");
    menu.className = "nf-menu";
    menu.append(button(t("breach.stepBack"), "nf-button", options.onClose));
    panel.append(menu);
  }

  function render(): void {
    panel.replaceChildren();
    if (phase === "brief") renderBrief();
    else if (phase === "run") renderRun();
    else if (phase === "report") renderReport();
    else renderSpent();
    if (phase === "run") {
      // Focus rides the head of the route: it is the "you are here"
      // marker and the place the next arrow press should start from.
      panel
        .querySelector<HTMLElement>(`[data-node="${headId(game)}"]`)
        ?.focus();
    } else {
      panel.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      if (phase !== "run") {
        options.onClose();
        return;
      }
      // A run in progress cannot be closed away from: it is finished,
      // walked out of, or lost, and the panel says which keys do that.
      audio.emit("ui.cancel");
      say(t("breach.cannotClose"), true);
      render();
      return;
    }
    if (phase !== "run") return;
    if (event.key === "u" || event.key === "U") {
      event.preventDefault();
      undo();
    }
    if (event.key === "w" || event.key === "W") {
      event.preventDefault();
      withdraw();
    }
    // Enter and Space on a cell are the cell's own click; the grid's
    // arrows are the roving grid's. Nothing else is ours.
  }

  render();
  window.addEventListener("keydown", onKeyDown);

  return {
    el,
    destroy(): void {
      window.removeEventListener("keydown", onKeyDown);
      el.remove();
    },
  };
}
