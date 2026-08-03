// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { announcedText, createAnnouncer } from "./announce";
import { STRINGS } from "./strings";

/**
 * The narrator itself. The behaviour worth pinning is the one that is
 * easy to get wrong and impossible to notice: a live region only
 * announces a *change*, so the same sentence twice running has to
 * arrive as two different strings or the second one is silence — which
 * in a fight is "your turn" going unsaid every other round.
 */

beforeEach(() => {
  document.body.replaceChildren();
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("createAnnouncer", () => {
  it("is hidden, polite, and read whole", () => {
    const announcer = createAnnouncer();
    expect(announcer.el.className).toContain("nf-sr-only");
    expect(announcer.el.getAttribute("aria-live")).toBe("polite");
    expect(announcer.el.getAttribute("role")).toBe("status");
    expect(announcer.el.getAttribute("aria-atomic")).toBe("true");
  });

  it("interrupts only when it is asked to", () => {
    const urgent = createAnnouncer({ urgent: true });
    expect(urgent.el.getAttribute("aria-live")).toBe("assertive");
    expect(urgent.el.getAttribute("role")).toBe("alert");
  });

  it("names itself when given a name", () => {
    const announcer = createAnnouncer({ label: "combat.narrator.label" });
    expect(announcer.el.getAttribute("aria-label")).toBe(
      STRINGS["combat.narrator.label"],
    );
  });

  it("says a line", () => {
    const announcer = createAnnouncer();
    announcer.say("Vesper's turn.");
    expect(announcedText(announcer.el)).toBe("Vesper's turn.");
  });

  it("re-announces a repeat by changing the string, not the sentence", () => {
    const announcer = createAnnouncer();
    announcer.say("Your turn.");
    const first = announcer.el.textContent;
    announcer.say("Your turn.");
    expect(announcer.el.textContent).not.toBe(first);
    // ...and it is still the same sentence to whoever is listening.
    expect(announcedText(announcer.el)).toBe("Your turn.");
    announcer.say("Your turn.");
    expect(announcer.el.textContent).toBe(first);
    expect(announcedText(announcer.el)).toBe("Your turn.");
  });

  it("says nothing about nothing", () => {
    const announcer = createAnnouncer();
    announcer.say("A line.");
    announcer.say(null);
    announcer.say("");
    announcer.say("   ");
    expect(announcedText(announcer.el)).toBe("A line.");
  });

  it("empties without announcing, and forgets what it last said", () => {
    const announcer = createAnnouncer();
    announcer.say("A line.");
    announcer.clear();
    expect(announcer.el.textContent).toBe("");
    announcer.say("A line.");
    expect(announcer.el.textContent).toBe("A line.");
  });

  it("takes itself off the page when it is done", () => {
    const announcer = createAnnouncer();
    document.body.append(announcer.el);
    announcer.destroy();
    expect(document.body.contains(announcer.el)).toBe(false);
  });
});
