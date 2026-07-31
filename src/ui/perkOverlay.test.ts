// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { perkIdsOf, perkPicksAvailable, streetCred } from "../character";
import { combatResultFlag } from "../combat";
import { CRED_PER_VICTORY, credMilestones } from "../data/advancement";
import { perks } from "../data/perks";
import { createMemoryStorage, createNewGame } from "../state";
import type { OverlayHandle } from "./overlay";
import { createPerkOverlay } from "./perkOverlay";
import { perkPanel } from "./perkModel";
import { createSession, type Session } from "./session";

/**
 * The pick overlay in isolation: what a milestone offers, that a pick
 * takes two clicks and is permanent, and that a depleted pool and an
 * unearned pick both say so instead of quietly working.
 */

/** Won fights worth at least `count` milestones of cred. */
function credFlags(count: number): Record<string, string> {
  const wanted = credMilestones[count - 1]?.cred ?? 0;
  const flags: Record<string, string> = {};
  for (let i = 0; i < Math.ceil(wanted / CRED_PER_VICTORY); i++) {
    flags[combatResultFlag(`enc-test-${i}`)] = "victory";
  }
  return flags;
}

function makeSession(picks = 1, taken: string[] = []): Session {
  const state = createNewGame({ playerName: "Vex", seed: 3 });
  return createSession(
    {
      ...state,
      flags: picks > 0 ? credFlags(picks) : {},
      player: {
        ...state.player,
        advancement: { ...state.player.advancement, perkIds: [...taken] },
      },
    },
    createMemoryStorage(),
  );
}

function mount(session: Session): OverlayHandle {
  const handle = createPerkOverlay({
    session,
    onStateChange: () => {},
    onClose: () => {},
  });
  document.body.append(handle.el);
  return handle;
}

function cardFor(handle: OverlayHandle, perkId: string): HTMLElement {
  const card = handle.el.querySelector<HTMLElement>(`[data-perk="${perkId}"]`);
  if (!card) throw new Error(`no card for "${perkId}"`);
  return card;
}

function buttonIn(scope: Element, label: string): HTMLButtonElement {
  const button = [...scope.querySelectorAll("button")].find((b) =>
    (b.textContent ?? "").trim().startsWith(label),
  );
  if (!button) throw new Error(`no "${label}" button in scope`);
  return button;
}

function take(handle: OverlayHandle, perkId: string): void {
  buttonIn(cardFor(handle, perkId), "Take").click();
  buttonIn(cardFor(handle, perkId), "Confirm").click();
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("perk overlay", () => {
  it("shows the cred, the milestone, and the pick it owes", () => {
    const session = makeSession(1);
    const handle = mount(session);
    const text = handle.el.textContent ?? "";
    expect(text).toContain(`Street cred ${streetCred(session.state.flags)}`);
    expect(text).toContain(credMilestones[0]!.label);
    expect(text).toContain("1 perk pick waiting");
    expect(text).toContain("fights won");
    handle.destroy();
  });

  it("offers every perk with its effect in plain words", () => {
    const handle = mount(makeSession(1));
    for (const perk of perks) {
      const card = cardFor(handle, perk.id);
      expect(card.textContent).toContain(perk.name);
      expect(card.textContent).toContain(perk.effect);
    }
    handle.destroy();
  });

  it("takes a perk on a confirm, never on the first click", () => {
    const session = makeSession(1);
    const handle = mount(session);
    buttonIn(cardFor(handle, "perk-cold-read"), "Take").click();
    expect(perkIdsOf(session.state.player)).toEqual([]);
    expect(handle.el.textContent).toContain("permanent");
    buttonIn(cardFor(handle, "perk-cold-read"), "Confirm").click();
    expect(perkIdsOf(session.state.player)).toEqual(["perk-cold-read"]);
    handle.destroy();
  });

  it("marks a taken perk as yours and stops offering it", () => {
    const session = makeSession(2);
    const handle = mount(session);
    take(handle, "perk-ghost-step");
    const card = cardFor(handle, "perk-ghost-step");
    expect(card.textContent).toContain("Yours");
    expect(card.querySelector("button")).toBeNull();
    handle.destroy();
  });

  it("spends exactly one pick and leaves the rest on offer", () => {
    const session = makeSession(2);
    const handle = mount(session);
    expect(perkPicksAvailable(session.state)).toBe(2);
    take(handle, "perk-silver-tongue");
    expect(perkPicksAvailable(session.state)).toBe(1);
    expect(handle.el.textContent).toContain("1 perk pick waiting");
    // Everything unchosen is still takeable with the second pick.
    take(handle, "perk-pain-editor");
    expect(perkIdsOf(session.state.player)).toEqual([
      "perk-silver-tongue",
      "perk-pain-editor",
    ]);
    expect(perkPicksAvailable(session.state)).toBe(0);
    handle.destroy();
  });

  it("offers no buttons at all when nothing is owed", () => {
    const session = makeSession(0);
    const handle = mount(session);
    expect(handle.el.textContent).toContain("No pick waiting");
    expect(cardFor(handle, "perk-cold-read").querySelector("button")).toBeNull();
    handle.destroy();
  });

  it("says so once the pool is empty", () => {
    const session = makeSession(1, perks.map((perk) => perk.id));
    const handle = mount(session);
    expect(handle.el.textContent).toContain("taken everything");
    handle.destroy();
  });
});

describe("perkPanel", () => {
  it("counts down to the next milestone", () => {
    const session = makeSession(0);
    const view = perkPanel(session.state);
    expect(view.cred).toBe(0);
    expect(view.milestone).toBeNull();
    expect(view.next?.remaining).toBe(credMilestones[0]!.cred);
    expect(view.headline).toContain("more cred");
  });

  it("leads with the milestone's own words while a pick is owed", () => {
    const view = perkPanel(makeSession(1).state);
    expect(view.picks).toBe(1);
    expect(view.headline).toBe(credMilestones[0]!.blurb);
  });
});
