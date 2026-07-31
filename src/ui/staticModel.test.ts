import { describe, expect, it } from "vitest";
import { fixtureCharacter } from "../character/testSupport";
import type { CharacterState } from "../character/create";
import { installEnhancement } from "../inventory/equipment";
import { addItem, emptyInventory } from "../inventory/inventory";
import { staticReading } from "../inventory/staticLoad";
import {
  STATIC_METER_FULL,
  installPreviewRow,
  isDampenerId,
  staticMeter,
  uninstallPreviewRow,
} from "./staticModel";

/**
 * A runner built to carry chrome — Body and Cool bought high, because
 * neural capacity is what decides how much hardware fits, and the
 * screaming band is only reachable by somebody who paid for the room.
 */
function chromeCarrier(): CharacterState {
  return fixtureCharacter({
    allocation: { body: 9, reflexes: 4, tech: 4, cool: 9, intelligence: 4 },
  });
}

/** A player with the named shipped implants installed. */
function wearing(...itemIds: string[]): CharacterState {
  let character = chromeCarrier();
  let inventory = emptyInventory();
  for (const id of itemIds) {
    const loadout = installEnhancement(character, addItem(inventory, id), id);
    character = loadout.character;
    inventory = loadout.inventory;
  }
  return character;
}

describe("staticMeter", () => {
  it("reads a clean character as clear, empty, and costing nothing", () => {
    const view = staticMeter(chromeCarrier());
    expect(view.level).toBe(0);
    expect(view.band).toBe("clear");
    expect(view.label).toBe("Static 0 — Clear");
    expect(view.fill).toBe(0);
    expect(view.notes).toEqual([]);
    expect(view.blurb.length).toBeGreaterThan(0);
  });

  it("names the band and what it is costing once there is a cost", () => {
    // Myomer Arms (3) + Lattice Coprocessor (3) = 6: loud.
    const view = staticMeter(wearing("cyb-myomer-arms", "cyb-lattice-coprocessor"));
    expect(view.band).toBe("loud");
    expect(view.label).toBe("Static 6 — Loud");
    expect(view.notes).toContain("-1 Cool in conversation");
    expect(view.notes).toContain("Opens chrome-affinity talk");
  });

  it("pins the bar full at the worst band's floor and never past it", () => {
    expect(staticMeter(wearing()).fill).toBe(0);
    const loud = staticMeter(wearing("cyb-myomer-arms", "cyb-lattice-coprocessor"));
    expect(loud.fill).toBeCloseTo(6 / STATIC_METER_FULL);
    expect(loud.fill).toBeLessThan(1);
    // Warden Optics (4) + Myomer Arms (3) + Static Veil (3) = 10,
    // past the floor and inside a chrome-carrier's neural capacity.
    const screaming = staticMeter(
      wearing("cyb-warden-optics", "cyb-myomer-arms", "cyb-static-veil"),
    );
    expect(screaming.band).toBe("screaming");
    expect(screaming.fill).toBe(1);
    expect(screaming.notes).toContain("Static surge, once a fight");
  });

  it("reads the meter off the same derivation the rest of the game does", () => {
    const character = wearing("cyb-warden-optics");
    const view = staticMeter(character);
    expect(view.level).toBe(staticReading(character).level);
    expect(view.band).toBe(staticReading(character).band);
  });
});

describe("install projections", () => {
  it("quotes the level, the sign, and the band a move lands in", () => {
    const row = installPreviewRow(
      wearing("cyb-warden-optics", "cyb-myomer-arms"),
      "cyb-static-veil",
    );
    expect(row.level).toBe(10);
    expect(row.band).toBe("screaming");
    expect(row.bandChanges).toBe(true);
    expect(row.quiets).toBe(false);
    expect(row.projection).toBe("+3 Static → 10 · Screaming");
  });

  it("leaves the band off a move that stays inside one", () => {
    const row = installPreviewRow(chromeCarrier(), "cyb-optic-suite");
    expect(row.band).toBe("clear");
    expect(row.bandChanges).toBe(false);
    expect(row.projection).toBe("+2 Static → 2");
  });

  it("reads a dampener as the quieting it is", () => {
    const row = installPreviewRow(
      wearing("cyb-myomer-arms", "cyb-optic-suite"),
      "cyb-null-collar",
    );
    expect(row.quiets).toBe(true);
    expect(row.level).toBe(2);
    expect(row.projection).toBe("-3 Static → 2 · Clear");
    expect(isDampenerId("cyb-null-collar")).toBe(true);
    expect(isDampenerId("cyb-optic-suite")).toBe(false);
  });

  it("says plainly that a non-implant changes nothing", () => {
    const row = installPreviewRow(chromeCarrier(), "out-courier-slicker");
    expect(row.projection).toBe("No change to Static");
    expect(row.bandChanges).toBe(false);
  });

  it("promises exactly what installing then delivers — preview parity", () => {
    const before = wearing("cyb-warden-optics", "cyb-myomer-arms");
    const projected = installPreviewRow(before, "cyb-static-veil");
    const after = installEnhancement(
      before,
      addItem(emptyInventory(), "cyb-static-veil"),
      "cyb-static-veil",
    ).character;
    const meter = staticMeter(after);
    expect(meter.level).toBe(projected.level);
    expect(meter.band).toBe(projected.band);
  });
});

describe("extraction projections", () => {
  it("quotes what pulling an implant would leave behind", () => {
    const character = wearing("cyb-myomer-arms", "cyb-cascade-governor");
    const row = uninstallPreviewRow(character, "neural");
    expect(row.quiets).toBe(true);
    expect(row.level).toBe(3);
    expect(row.projection).toBe("-5 Static → 3 · Humming");
  });

  it("projects nothing for a slot with nothing in it", () => {
    const row = uninstallPreviewRow(chromeCarrier(), "dermal");
    expect(row.projection).toBe("No change to Static");
    expect(row.quiets).toBe(false);
  });
});
