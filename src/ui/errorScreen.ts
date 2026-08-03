import {
  buildErrorReport,
  type CrashContext,
  type DiagnosticReport,
} from "./errorReport";
import type { Screen } from "./screen";
import { t } from "./strings";

/**
 * The screen a crash lands on.
 *
 * Three things it has to do, in this order of importance:
 *
 *  1. **Not be a blank page.** Whatever threw, this renders — which is
 *     why it takes no game data it has not already been handed, looks
 *     nothing up, and builds its text from a pure function.
 *  2. **Say the run is not gone.** The stash is written before this
 *     screen is shown; the first paragraph is about that, not about the
 *     exception.
 *  3. **Be copyable.** A player who wants to report the crash should
 *     not have to transcribe it, and should not have to trust the game
 *     with what goes on their clipboard: the box starts unticked and
 *     the report shown on screen is the report that gets copied.
 */
export interface ErrorScreenOptions {
  context: CrashContext;
  /** Wired by the router to the fallback screen; absent hides the button. */
  onMenu?(): void;
  /** Defaults to a full page reload. */
  onReload?(): void;
  /** Injectable for tests; defaults to the platform clipboard. */
  copyText?(text: string): Promise<void>;
}

export function createErrorScreen(options: ErrorScreenOptions): Screen {
  let container: HTMLElement | null = null;
  let includeSaveData = false;
  let report: DiagnosticReport = buildErrorReport(options.context, {
    includeSaveData,
  });
  let status = "";

  function rebuild(): void {
    report = buildErrorReport(options.context, { includeSaveData });
  }

  function copy(): void {
    const write =
      options.copyText ??
      ((text: string) => navigator.clipboard.writeText(text));
    let attempt: Promise<void>;
    try {
      attempt = write(report.text);
    } catch (error) {
      attempt = Promise.reject(error);
    }
    void attempt.then(
      () => setStatus(t("crash.status.copied")),
      () => setStatus(t("crash.status.copyFailed")),
    );
  }

  function setStatus(text: string): void {
    status = text;
    const line = container?.querySelector(".nf-crash-status");
    if (line) line.textContent = text;
  }

  return {
    name: "crash",

    mount(root: HTMLElement): void {
      container = document.createElement("div");
      container.className = "nf-screen nf-crash";

      const panel = document.createElement("div");
      panel.className = "nf-panel nf-crash-panel";

      const title = document.createElement("h2");
      // The words the rest of the game has always used for this.
      title.textContent = t("crash.title");

      const lede = document.createElement("p");
      lede.className = "nf-dim";
      lede.textContent = options.context.stashed
        ? t("crash.lede.stashed")
        : t("crash.lede.clean");

      const headline = document.createElement("p");
      headline.className = "nf-crash-headline";
      headline.textContent = report.headline;

      panel.append(title, lede, headline);

      const facts = document.createElement("dl");
      facts.className = "nf-crash-facts";
      for (const fact of report.facts) {
        const label = document.createElement("dt");
        label.textContent = fact.label;
        const value = document.createElement("dd");
        value.textContent = fact.value;
        facts.append(label, value);
      }
      panel.append(facts);

      const box = document.createElement("textarea");
      box.className = "nf-crash-report";
      box.readOnly = true;
      box.rows = 10;
      box.value = report.text;
      box.setAttribute("aria-label", t("crash.report.label"));

      const includeRow = document.createElement("label");
      includeRow.className = "nf-crash-include";
      const include = document.createElement("input");
      include.type = "checkbox";
      include.checked = includeSaveData;
      include.addEventListener("change", () => {
        includeSaveData = include.checked;
        rebuild();
        box.value = report.text;
        setStatus(
          includeSaveData
            ? t("crash.status.saveIncluded")
            : t("crash.status.saveOmitted"),
        );
      });
      const includeText = document.createElement("span");
      includeText.textContent = t("crash.includeSave");
      includeRow.append(include, includeText);

      const statusLine = document.createElement("p");
      statusLine.className = "nf-message nf-crash-status";
      statusLine.textContent = status;

      const actions = document.createElement("div");
      actions.className = "nf-crash-actions";

      const copyButton = document.createElement("button");
      copyButton.className = "nf-button";
      copyButton.textContent = t("crash.copy");
      copyButton.addEventListener("click", copy);
      actions.append(copyButton);

      if (options.onMenu) {
        const menu = document.createElement("button");
        menu.className = "nf-button";
        menu.textContent = t("crash.mainMenu");
        menu.addEventListener("click", options.onMenu);
        actions.append(menu);
      }

      const reload = document.createElement("button");
      reload.className = "nf-button";
      reload.textContent = t("crash.reload");
      reload.addEventListener("click", () => {
        if (options.onReload) options.onReload();
        else window.location.reload();
      });
      actions.append(reload);

      panel.append(includeRow, box, statusLine, actions);
      container.append(panel);
      root.append(container);
    },

    unmount(): void {
      container?.remove();
      container = null;
    },
  };
}
