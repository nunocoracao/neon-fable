import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MIX_BUSES,
  MIX_BUS_IDS,
  PLAYBACK_BUS_IDS,
  busChain,
  isPlaybackBus,
  requireBus,
  type MixBusId,
} from "../data/mixBuses";
import { FAMILY_BUSES, SOUND_FAMILIES } from "../data/sfx";
import { SOUND_EVENT_IDS, busForEvent, eventFamily } from "./events";

/**
 * The routing audit.
 *
 * "Every sound routes through exactly one bus" is the claim the whole
 * mixer rests on: a sound that reaches the output some other way is a
 * sound a fader cannot touch, and the player is left with a control that
 * lies. These tests pin it from both ends — the bus table has to be a
 * tree that terminates at master, and every registered cue has to name a
 * bus in it.
 */

describe("the bus table", () => {
  it("has unique ids and one definition each", () => {
    expect(new Set(MIX_BUS_IDS).size).toBe(MIX_BUS_IDS.length);
    expect(MIX_BUSES.map((bus) => bus.id).sort()).toEqual(
      [...MIX_BUS_IDS].sort(),
    );
    for (const id of MIX_BUS_IDS) expect(requireBus(id).id, id).toBe(id);
  });

  it("names and describes every bus", () => {
    for (const bus of MIX_BUSES) {
      expect(bus.label.length, bus.id).toBeGreaterThan(0);
      expect(bus.blurb.length, bus.id).toBeGreaterThan(0);
      expect(bus.defaultVolume, bus.id).toBeGreaterThan(0);
      expect(bus.defaultVolume, bus.id).toBeLessThanOrEqual(1);
    }
  });

  it("is a tree with master at the root", () => {
    const roots = MIX_BUSES.filter((bus) => bus.parent === null);
    expect(roots.map((bus) => bus.id)).toEqual(["master"]);
    for (const bus of MIX_BUSES) {
      if (bus.parent === null) continue;
      expect(MIX_BUS_IDS, bus.id).toContain(bus.parent);
      expect(bus.parent, bus.id).not.toBe(bus.id);
    }
  });

  it("routes every bus to the output through master, and only once", () => {
    for (const id of MIX_BUS_IDS) {
      const chain = busChain(id);
      expect(chain[0], id).toBe(id);
      expect(chain[chain.length - 1], id).toBe("master");
      // No bus appears in its own chain twice: a loop in the table
      // would be a signal path that never leaves.
      expect(new Set(chain).size, id).toBe(chain.length);
      expect(chain.filter((step) => step === "master").length, id).toBe(1);
    }
  });

  it("keeps master out of the buses a sound can be played on", () => {
    expect(PLAYBACK_BUS_IDS).not.toContain("master");
    expect(isPlaybackBus("master")).toBe(false);
    for (const id of PLAYBACK_BUS_IDS) {
      expect(MIX_BUS_IDS, id).toContain(id);
      expect(isPlaybackBus(id), id).toBe(true);
      expect(requireBus(id).parent, id).toBe("master");
    }
    // The two lists differ by exactly master.
    expect([...PLAYBACK_BUS_IDS, "master"].sort()).toEqual(
      [...MIX_BUS_IDS].sort(),
    );
  });

  it("rejects a bus id it does not know", () => {
    expect(() => requireBus("reverb" as MixBusId)).toThrow();
  });
});

describe("every cue declares a bus, and every bus exists", () => {
  it("gives every sound family a bus in the table", () => {
    expect(Object.keys(FAMILY_BUSES).sort()).toEqual(
      [...SOUND_FAMILIES].sort(),
    );
    for (const family of SOUND_FAMILIES) {
      expect(PLAYBACK_BUS_IDS, family).toContain(FAMILY_BUSES[family]);
    }
  });

  it("routes every registered event to exactly one existing bus", () => {
    for (const event of SOUND_EVENT_IDS) {
      const bus = busForEvent(event);
      expect(PLAYBACK_BUS_IDS, event).toContain(bus);
      // Exactly one, and always the same one: the routing is a lookup
      // on the family, not a decision anything makes at play time.
      expect(busForEvent(event), event).toBe(bus);
      expect(bus, event).toBe(FAMILY_BUSES[eventFamily(event)]);
    }
  });

  it("leaves no playback bus with nothing on it", () => {
    // A bus nothing routes to is a fader that does nothing, which is
    // worse than not having the fader. Two things feed the graph: the
    // cue registry, which routes by family, and the adaptive score,
    // which has the music bus to itself and does not go through events
    // at all (it schedules notes into stems — see ./score.ts).
    const fedByCues = new Set(SOUND_EVENT_IDS.map(busForEvent));
    expect([...fedByCues, "music"].sort()).toEqual([...PLAYBACK_BUS_IDS].sort());
    for (const id of PLAYBACK_BUS_IDS) {
      if (id === "music") continue;
      const carried = SOUND_EVENT_IDS.filter(
        (event) => busForEvent(event) === id,
      );
      expect(carried.length, id).toBeGreaterThan(0);
    }
  });

  it("keeps the score off the buses the cues are on", () => {
    // Music has a fader of its own precisely so it can be pulled down
    // without taking the gunfire with it; a cue landing on it would
    // make that fader lie.
    for (const event of SOUND_EVENT_IDS) {
      expect(busForEvent(event), event).not.toBe("music");
    }
  });

  it("keeps the shell on its own bus, and the world off it", () => {
    // The reason the UI bus exists: menus are the noisiest thing in the
    // game and the least worth hearing loudly.
    expect(FAMILY_BUSES.ui).toBe("ui");
    for (const family of SOUND_FAMILIES) {
      if (family === "ui") continue;
      expect(FAMILY_BUSES[family], family).not.toBe("ui");
    }
  });
});

// --- No strays ----------------------------------------------------------

/** Every .ts file under src, in a stable order. */
function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (entry.endsWith(".ts")) found.push(path);
  }
  return found;
}

const SOURCES = sourceFiles("src").map((path) => ({
  path,
  text: readFileSync(path, "utf8"),
}));

describe("nothing reaches the output around the buses", () => {
  it("found the sources it was meant to scan", () => {
    expect(SOURCES.length).toBeGreaterThan(100);
    expect(SOURCES.some(({ path }) => path.endsWith("adapter.ts"))).toBe(true);
  });

  it("keeps the Web Audio graph inside the adapter", () => {
    // One file builds the graph. Creating a gain node or connecting one
    // anywhere else is a signal path nobody put a fader on, and the two
    // calls are unambiguous enough to scan for — unlike, say, the word
    // "destination", which this codebase uses for places on a map.
    const strays: string[] = [];
    const adapter = join("src", "audio", "adapter.ts");
    for (const { path, text } of SOURCES) {
      if (path === adapter || path.endsWith(".test.ts")) continue;
      if (/\bcreateGain\(/.test(text)) strays.push(`${path}: createGain()`);
      if (/\.connect\(/.test(text)) strays.push(`${path}: connect()`);
    }
    expect(strays).toEqual([]);
  });

  it("leaves playing a patch to the audio bus", () => {
    // playPatch is the only door into the graph and it takes a bus;
    // game code is on the far side of emit(), which picks the bus from
    // the registry so no call site ever gets to choose one.
    const strays: string[] = [];
    for (const { path, text } of SOURCES) {
      if (path.startsWith(join("src", "audio"))) continue;
      if (/\bplayPatch\(/.test(text)) strays.push(`${path}: playPatch()`);
      if (/\bsetBusGains\(/.test(text)) strays.push(`${path}: setBusGains()`);
    }
    expect(strays).toEqual([]);
  });
});
