// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { availablePoints } from "../character";
import { STAT_RAISE_COST } from "../data/advancement";
import { grantedAbilityIds } from "../inventory";
import { createMemoryStorage, createNewGame } from "../state";
import { createAdvancementOverlay } from "./advancementOverlay";
import type { OverlayHandle } from "./overlay";
import { createSession, type Session } from "./session";

/**
 * Advancement overlay in isolation: reviewing points, spending them on
 * raises and unlocks, and typed spend errors surfacing as messages.
 * Full-screen flows (HUD button, chapter-end highlight) stay in
 * flow.test/resilience.test territory.
 */

function makeSession(flags: Record<string, boolean>): Session {
  const state = createNewGame({ playerName: "Vex", seed: 3 });
  return createSession({ ...state, flags }, createMemoryStorage());
}

let perksOpened = 0;

function mount(session: Session): OverlayHandle {
  const handle = createAdvancementOverlay({
    session,
    onStateChange: () => {},
    onOpenPerks: () => {
      perksOpened += 1;
    },
    onClose: () => {},
  });
  document.body.append(handle.el);
  return handle;
}

function buttonIn(scope: Element, label: string): HTMLButtonElement {
  const button = [...scope.querySelectorAll("button")].find(
    (b) => (b.textContent ?? "").trim() === label,
  );
  if (!button) throw new Error(`no "${label}" button in scope`);
  return button;
}

function rowByLabel(handle: OverlayHandle, label: string): Element {
  const row = [...handle.el.querySelectorAll(".nf-slot-row")].find((r) =>
    (r.querySelector(".nf-slot-label")?.textContent ?? "").startsWith(label),
  );
  if (!row) throw new Error(`no "${label}" row`);
  return row;
}

function cardByName(handle: OverlayHandle, name: string): Element {
  const card = [...handle.el.querySelectorAll(".nf-item-card")].find(
    (c) => c.querySelector(".nf-item-name")?.textContent === name,
  );
  if (!card) throw new Error(`no "${name}" card`);
  return card;
}

afterEach(() => {
  document.body.replaceChildren();
  perksOpened = 0;
});

describe("advancement overlay", () => {
  it("shows unspent points and per-chapter grants", () => {
    const handle = mount(makeSession({ "act1-complete": true }));
    const text = handle.el.textContent ?? "";
    expect(text).toContain("Unspent: 3 points");
    expect(text).toContain("Chapter 1");
    expect(text).toContain("not yet complete");
    handle.destroy();
  });

  it("raises a stat and refreshes the panel", () => {
    const session = makeSession({ "act1-complete": true });
    const before = session.state.player.stats.body;
    const handle = mount(session);
    buttonIn(rowByLabel(handle, "Body"), "Raise").click();
    expect(session.state.player.stats.body).toBe(before + 1);
    expect(availablePoints(session.state)).toBe(3 - STAT_RAISE_COST);
    expect(handle.el.textContent).toContain("Unspent: 1 point");
    handle.destroy();
  });

  it("unlocks a pool ability and marks it unlocked", () => {
    const session = makeSession({ "act1-complete": true });
    const handle = mount(session);
    buttonIn(cardByName(handle, "Combat Focus"), "Unlock").click();
    expect(grantedAbilityIds(session.state.player)).toContain(
      "ability-combat-focus",
    );
    expect(cardByName(handle, "Combat Focus").textContent).toContain(
      "Unlocked",
    );
    handle.destroy();
  });

  it("shows street cred beside the points, and the milestone to come", () => {
    const handle = mount(makeSession({ "act1-complete": true }));
    const text = handle.el.textContent ?? "";
    expect(text).toContain("Street cred 5");
    expect(text).toMatch(/at \d+ cred/);
    handle.destroy();
  });

  it("lists taken perks with what they do, and hands off the pick", () => {
    const session = makeSession({ "act1-complete": true });
    session.state = {
      ...session.state,
      player: {
        ...session.state.player,
        advancement: {
          ...session.state.player.advancement,
          perkIds: ["perk-cold-read"],
        },
      },
    };
    const handle = mount(session);
    const card = handle.el.querySelector('[data-perk="perk-cold-read"]');
    expect(card?.textContent).toContain("Cold Read");
    expect(card?.textContent).toContain("Hostile reach is marked");
    const open = [...handle.el.querySelectorAll("button")].find((b) =>
      (b.textContent ?? "").includes("Perk"),
    );
    open?.click();
    expect(perksOpened).toBe(1);
    handle.destroy();
  });

  it("surfaces illegal spends as error messages without mutating state", () => {
    const session = makeSession({});
    const handle = mount(session);
    buttonIn(rowByLabel(handle, "Reflexes"), "Raise").click();
    expect(session.state.player.advancement.pointsSpent).toBe(0);
    expect(handle.el.querySelector(".nf-error")?.textContent).toMatch(
      /advancement points/,
    );
    handle.destroy();
  });
});
