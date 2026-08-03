import { audio } from "../audio";
import { getMap } from "../data";
import type { ComposedInterlude } from "../narrative";
import {
  INTERLUDE_BEAT_MS,
  interludeButtonLabel,
  pressInterlude,
  revealComplete,
  startReveal,
  tickReveal,
  type InterludeReveal,
} from "./interludeModel";
import type { OverlayHandle } from "./overlay";
import { t } from "./strings";

/**
 * The act-boundary vignette: a full-screen card over a tinted still of
 * the district the chapter ended in, with the recap beats fading in one
 * at a time.
 *
 * Presentation only. Which beats these are was decided by
 * composeInterlude, and when the vignette is owed at all by
 * pendingInterlude; the reveal and the skip are the pure model in
 * ./interludeModel. This file owns the DOM and one timer.
 */
export interface InterludeOverlayOptions {
  interlude: ComposedInterlude;
  /** Shows every beat at once and skips the timer; defaults to false. */
  reducedMotion?: boolean;
  onClose(): void;
}

export function createInterludeOverlay(
  options: InterludeOverlayOptions,
): OverlayHandle {
  const { interlude } = options;

  const el = document.createElement("div");
  el.className = "nf-overlay nf-overlay-center nf-interlude";

  const backdrop = document.createElement("div");
  backdrop.className =
    `nf-interlude-backdrop nf-interlude-tone-${interlude.backdrop.tone}`;
  backdrop.setAttribute("aria-hidden", "true");

  const panel = document.createElement("div");
  panel.className = "nf-panel nf-interlude-card";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", interlude.title);

  const kicker = document.createElement("div");
  kicker.className = "nf-chapter-end-kicker";
  kicker.textContent = interlude.kicker;
  const title = document.createElement("h2");
  title.textContent = interlude.title;
  panel.append(kicker, title);

  // The district the chapter ended in, named. An id no build of the
  // game knows captions nothing rather than printing a raw id.
  const placeName = getMap(interlude.backdrop.mapId)?.name;
  if (placeName) {
    const place = document.createElement("div");
    place.className = "nf-interlude-place";
    place.textContent = placeName;
    panel.append(place);
  }

  const list = document.createElement("ol");
  list.className = "nf-interlude-beats";
  // Announced as a whole once it settles, rather than a line at a time
  // — a screen reader should get the recap, not the animation.
  list.setAttribute("aria-live", "polite");
  const beatEls = interlude.beats.map((beat) => {
    const item = document.createElement("li");
    item.className = "nf-interlude-beat";
    item.dataset.beatId = beat.id;
    item.textContent = beat.text;
    list.append(item);
    return item;
  });
  panel.append(list);

  const menu = document.createElement("div");
  menu.className = "nf-menu";
  const button = document.createElement("button");
  button.className = "nf-button";
  menu.append(button);
  panel.append(menu);

  const hint = document.createElement("p");
  hint.className = "nf-dim nf-interlude-hint";
  hint.textContent = t("interlude.continueHint");
  panel.append(hint);

  el.append(backdrop, panel);

  let reveal: InterludeReveal = startReveal(
    beatEls.length,
    options.reducedMotion === true,
  );
  let timer: ReturnType<typeof setInterval> | null = null;

  function stopTimer(): void {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  }

  function render(): void {
    beatEls.forEach((item, index) => {
      item.classList.toggle("nf-interlude-beat-shown", index < reveal.shown);
    });
    button.textContent = interludeButtonLabel(reveal);
    if (revealComplete(reveal)) stopTimer();
  }

  function press(): void {
    const next = pressInterlude(reveal);
    reveal = next.reveal;
    if (next.action === "close") {
      audio.emit("ui.confirm");
      options.onClose();
      return;
    }
    audio.emit("ui.click");
    render();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key !== "Enter" && event.key !== " ") return;
    // The scene's own interact key is idle behind an overlay; this one
    // is the vignette's, so it must not also reach the button under it.
    event.preventDefault();
    press();
  }

  button.addEventListener("click", press);
  // Anywhere on the card (or the dimmed district around it) skips too —
  // the whole screen is the button here.
  el.addEventListener("click", (event) => {
    if (event.target === button) return;
    press();
  });
  window.addEventListener("keydown", onKeyDown);

  if (!revealComplete(reveal)) {
    timer = setInterval(() => {
      reveal = tickReveal(reveal);
      render();
    }, INTERLUDE_BEAT_MS);
  }
  render();

  return {
    el,
    destroy(): void {
      stopTimer();
      window.removeEventListener("keydown", onKeyDown);
      el.remove();
    },
  };
}
