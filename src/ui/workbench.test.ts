// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CharacterState } from "../character/create";
import {
  MOD_REMOVAL_FEE,
  addGear,
  addItem,
  emptyInventory,
  equip,
  equippedWeaponProfile,
  type Workbench,
} from "../inventory";
import { createMemoryStorage, createNewGame, type GameState } from "../state";
import type { OverlayHandle } from "./overlay";
import { createSession, type Session } from "./session";
import { workbenchModel } from "./workbenchModel";
import { createWorkbenchOverlay } from "./workbenchOverlay";

/**
 * The bench, model and screen. The model is pure and asserted directly;
 * the screen is driven in happy-dom to prove the three columns route
 * into the pure workbench ops and that a previewed delta is on the
 * button the player presses.
 */

function armedState(credits = 500): GameState {
  const base = createNewGame({ playerName: "Test", seed: 5 });
  const character: CharacterState = {
    ...base.player,
    stats: { ...base.player.stats, reflexes: 8, body: 8 },
  };
  let inventory = addGear(emptyInventory(), "wpn-rail-spitter", {});
  for (const modId of [
    "mod-lattice-rifling",
    "mod-smartlink-sight",
    "mod-gyro-sleeve",
  ]) {
    inventory = addItem(inventory, modId, 1);
  }
  const held = equip(character, inventory, "wpn-rail-spitter");
  return {
    ...base,
    player: held.character,
    inventory: held.inventory,
    credits,
  };
}

function benchOf(state: GameState): Workbench {
  return {
    character: state.player,
    inventory: state.inventory,
    credits: state.credits,
  };
}

describe("workbench model", () => {
  it("puts the weapon in hand at the top of the rack and selects it", () => {
    const model = workbenchModel(benchOf(armedState()), null, null);
    expect(model.weapons.map((w) => [w.place, w.name])).toEqual([
      ["In hand", "Rail Spitter"],
      // The starting knife, displaced into the bag by the pistol.
      ["Carried", "Shard Knife"],
    ]);
    expect(model.weapons[0]?.selected).toBe(true);
    expect(model.weapons[0]?.socketLine).toBe("2 sockets · 0 filled");
  });

  it("shows no parts until a socket is chosen, then only what fits", () => {
    const bench = benchOf(armedState());
    expect(workbenchModel(bench, null, null).parts).toEqual([]);
    const barrel = workbenchModel(bench, null, 0);
    expect(barrel.parts.map((p) => p.modId)).toEqual([
      "mod-lattice-rifling",
      "mod-smartlink-sight",
    ]);
    // The core socket takes neither of those, nor the grip part.
    expect(workbenchModel(bench, null, 1).parts).toEqual([]);
  });

  it("puts the figures a fitting would move on the part's own row", () => {
    const model = workbenchModel(benchOf(armedState()), null, 0);
    const sight = model.parts.find((p) => p.modId === "mod-smartlink-sight");
    expect(sight?.deltas).toEqual([
      "damage 8 → 7",
      "accuracy 0 → +3",
    ]);
    expect(sight?.effects).toEqual(["+3 accuracy", "-1 damage"]);
  });

  it("ignores a socket index the chosen weapon does not have", () => {
    const model = workbenchModel(benchOf(armedState()), null, 9);
    expect(model.socketIndex).toBeNull();
    expect(model.parts).toEqual([]);
  });
});

/* --- The screen ------------------------------------------------------ */

let session: Session;
let overlay: OverlayHandle;
let closed: boolean;

function mount(state: GameState): void {
  session = createSession(state, createMemoryStorage());
  closed = false;
  overlay = createWorkbenchOverlay({
    session,
    onStateChange: () => {},
    onClose: () => {
      closed = true;
    },
  });
  document.body.append(overlay.el);
}

afterEach(() => {
  overlay?.destroy();
  document.body.replaceChildren();
});

function buttons(): HTMLButtonElement[] {
  return [...overlay.el.querySelectorAll("button")];
}

/** The nth button whose label is exactly `label` (0-based). */
function find(label: string, nth = 0): HTMLButtonElement {
  const matches = buttons().filter((b) => b.textContent === label);
  const button = matches[nth];
  if (!button) {
    throw new Error(
      `no button "${label}" #${nth} — have ${buttons()
        .map((b) => b.textContent)
        .join(" | ")}`,
    );
  }
  return button;
}

function click(label: string, nth = 0): void {
  find(label, nth).click();
}

describe("bench screen", () => {
  beforeEach(() => mount(armedState()));

  it("opens on the weapon in hand with its sockets listed", () => {
    expect(overlay.el.textContent).toContain("Rig-Up Bench");
    expect(overlay.el.querySelectorAll(".nf-bench-socket")).toHaveLength(2);
    expect(overlay.el.textContent).toContain("Barrel — empty");
    expect(overlay.el.textContent).toContain("Core — empty");
  });

  it("shows the previewed delta before anything is committed", () => {
    click("Fit a part");
    const deltas = [...overlay.el.querySelectorAll(".nf-bench-delta")].map(
      (el) => el.textContent,
    );
    expect(deltas.some((text) => text?.includes("armor pierce 0 → +2"))).toBe(
      true,
    );
    // Nothing has moved yet.
    expect(session.state.player.equipment.weaponMods).toBeUndefined();
  });

  it("fits the part, and the weapon's figures move with it", () => {
    click("Fit a part");
    click("Fit");
    expect(session.state.player.equipment.weaponMods).toEqual([
      "mod-lattice-rifling",
      null,
    ]);
    expect(equippedWeaponProfile(session.state.player)?.armorPierce).toBe(2);
    expect(overlay.el.textContent).toContain("Barrel — Lattice Rifling");
    // Fitting is free.
    expect(session.state.credits).toBe(500);
  });

  it("pulls it back out for the fee, intact", () => {
    click("Fit a part");
    click("Fit");
    click(`Pull — ${MOD_REMOVAL_FEE} cr`);
    expect(session.state.credits).toBe(500 - MOD_REMOVAL_FEE);
    expect(session.state.player.equipment.weaponMods).toBeUndefined();
    expect(
      session.state.inventory.stacks.some(
        (s) => s.itemId === "mod-lattice-rifling",
      ),
    ).toBe(true);
  });

  it("greys the pull when the fee is out of reach, and says nothing broke", () => {
    overlay.destroy();
    mount(armedState(10));
    click("Fit a part");
    click("Fit");
    expect(find(`Pull — ${MOD_REMOVAL_FEE} cr`).disabled).toBe(true);
  });

  it("never offers a part that does not fit the chosen socket", () => {
    // The core socket's list is empty — the grip part is not in it.
    click("Fit a part", 1);
    expect(overlay.el.textContent).toContain(
      "You carry nothing that fits that socket",
    );
  });

  it("closes on Esc without touching the run", () => {
    const before = session.state;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(closed).toBe(true);
    expect(session.state).toBe(before);
  });
});
