import { describe, expect, it } from "vitest";
import {
  interludeButtonLabel,
  pressInterlude,
  revealComplete,
  startReveal,
  tickReveal,
} from "./interludeModel";

/**
 * The reveal, and the rule that matters: a press catches the vignette
 * up before it ever closes it, so a player leaning on Enter reads the
 * recap instead of dismissing it.
 */

describe("the reveal", () => {
  it("opens on the first beat, never on a blank card", () => {
    expect(startReveal(4)).toEqual({ shown: 1, total: 4 });
    expect(revealComplete(startReveal(4))).toBe(false);
  });

  it("arrives one beat at a time and then stops", () => {
    let reveal = startReveal(3);
    reveal = tickReveal(reveal);
    expect(reveal.shown).toBe(2);
    reveal = tickReveal(reveal);
    expect(reveal.shown).toBe(3);
    expect(revealComplete(reveal)).toBe(true);
    expect(tickReveal(reveal)).toBe(reveal);
  });

  it("lands fully revealed under reduced motion", () => {
    const reveal = startReveal(5, true);
    expect(reveal).toEqual({ shown: 5, total: 5 });
    expect(revealComplete(reveal)).toBe(true);
  });

  it("treats an empty vignette as already finished", () => {
    expect(startReveal(0)).toEqual({ shown: 0, total: 0 });
    expect(revealComplete(startReveal(0))).toBe(true);
  });
});

describe("skipping", () => {
  it("first press shows every remaining beat rather than closing", () => {
    const pressed = pressInterlude(startReveal(4));
    expect(pressed.action).toBe("reveal");
    expect(pressed.reveal.shown).toBe(4);
  });

  it("a press with nothing left to say closes the vignette", () => {
    const caughtUp = pressInterlude(startReveal(4)).reveal;
    expect(pressInterlude(caughtUp).action).toBe("close");
  });

  it("closes on the first press under reduced motion", () => {
    expect(pressInterlude(startReveal(4, true)).action).toBe("close");
  });

  it("labels the button by what the next press will do", () => {
    expect(interludeButtonLabel(startReveal(4))).toBe("Skip");
    expect(interludeButtonLabel(startReveal(4, true))).toBe("Continue");
  });
});
