import { describe, expect, it } from "vitest";
import {
  DEFAULT_MIXER,
  busGain,
  busNodeGain,
  busNodeGains,
  clamp01,
  clampMixer,
  isAudible,
  memoryMixerStore,
  migrateLegacyMixer,
  setBusMuted,
  setBusVolume,
  setDuckOnBlur,
  toggleBusMuted,
  type MixerState,
} from "./mixer";
import { faderGain, gainToFader } from "./gain";
import {
  MIX_BUSES,
  MIX_BUS_IDS,
  PLAYBACK_BUS_IDS,
  type MixBusId,
} from "../data/mixBuses";

/** A mixer with the named faders moved, everything else at default. */
function mixerAt(volumes: Partial<Record<MixBusId, number>>): MixerState {
  return { ...DEFAULT_MIXER, volumes: { ...DEFAULT_MIXER.volumes, ...volumes } };
}

describe("DEFAULT_MIXER", () => {
  it("covers every bus, unmuted, with ducking on", () => {
    for (const id of MIX_BUS_IDS) {
      expect(DEFAULT_MIXER.volumes[id], id).toBeGreaterThan(0);
      expect(DEFAULT_MIXER.volumes[id], id).toBeLessThanOrEqual(1);
      expect(DEFAULT_MIXER.mutes[id], id).toBe(false);
    }
    expect(DEFAULT_MIXER.duckOnBlur).toBe(true);
  });

  it("takes its defaults from the bus table", () => {
    for (const bus of MIX_BUSES) {
      expect(DEFAULT_MIXER.volumes[bus.id], bus.id).toBe(bus.defaultVolume);
    }
  });

  it("leaves master room to be turned up", () => {
    expect(DEFAULT_MIXER.volumes.master).toBeLessThan(1);
  });
});

describe("moving the mixer", () => {
  it("clamps a fader and leaves the old state alone", () => {
    const before = DEFAULT_MIXER.volumes.sfx;
    expect(setBusVolume(DEFAULT_MIXER, "sfx", 1.5).volumes.sfx).toBe(1);
    expect(DEFAULT_MIXER.volumes.sfx).toBe(before);
    expect(setBusVolume(DEFAULT_MIXER, "master", -1).volumes.master).toBe(0);
    expect(setBusVolume(DEFAULT_MIXER, "music", 0.25).volumes.music).toBe(0.25);
    expect(clamp01(Number.NaN)).toBe(0);
  });

  it("moves one bus without touching the others", () => {
    const after = setBusVolume(DEFAULT_MIXER, "ui", 0.1);
    for (const id of MIX_BUS_IDS) {
      if (id === "ui") continue;
      expect(after.volumes[id], id).toBe(DEFAULT_MIXER.volumes[id]);
    }
  });

  it("mutes and toggles per bus, immutably", () => {
    const muted = setBusMuted(DEFAULT_MIXER, "music", true);
    expect(muted.mutes.music).toBe(true);
    expect(muted.mutes.sfx).toBe(false);
    expect(DEFAULT_MIXER.mutes.music).toBe(false);
    expect(toggleBusMuted(muted, "music").mutes.music).toBe(false);
    expect(toggleBusMuted(DEFAULT_MIXER, "master").mutes.master).toBe(true);
  });

  it("carries the ducking switch", () => {
    const off = setDuckOnBlur(DEFAULT_MIXER, false);
    expect(off.duckOnBlur).toBe(false);
    expect(setDuckOnBlur(off, true).duckOnBlur).toBe(true);
  });
});

describe("bus gains", () => {
  it("gives each node its own fader, through the curve", () => {
    const state = mixerAt({ master: 0.5, sfx: 0.75 });
    expect(busNodeGain(state, "master")).toBeCloseTo(faderGain(0.5), 9);
    expect(busNodeGain(state, "sfx")).toBeCloseTo(faderGain(0.75), 9);
  });

  it("multiplies a bus by everything above it", () => {
    const state = mixerAt({ master: 0.5, sfx: 0.75, music: 0.6 });
    expect(busGain(state, "sfx")).toBeCloseTo(
      faderGain(0.5) * faderGain(0.75),
      9,
    );
    expect(busGain(state, "music")).toBeCloseTo(
      faderGain(0.5) * faderGain(0.6),
      9,
    );
    // Master is its own chain: nothing sits above it.
    expect(busGain(state, "master")).toBeCloseTo(faderGain(0.5), 9);
  });

  it("silences a bus from its own mute, and only that bus", () => {
    const state = setBusMuted(DEFAULT_MIXER, "ui", true);
    expect(busGain(state, "ui")).toBe(0);
    expect(isAudible(state, "ui")).toBe(false);
    expect(busGain(state, "sfx")).toBeGreaterThan(0);
    expect(busGain(state, "music")).toBeGreaterThan(0);
  });

  it("silences everything from master's mute, however loud a bus is", () => {
    const state = setBusMuted(
      mixerAt({ sfx: 1, music: 1, ui: 1 }),
      "master",
      true,
    );
    for (const id of MIX_BUS_IDS) {
      expect(busGain(state, id), id).toBe(0);
      expect(isAudible(state, id), id).toBe(false);
    }
  });

  it("silences every bus from master's fader being off", () => {
    const state = mixerAt({ master: 0 });
    for (const id of PLAYBACK_BUS_IDS) {
      expect(busGain(state, id), id).toBe(0);
    }
  });

  it("puts the duck on master alone, so nothing escapes it", () => {
    const nodes = busNodeGains(DEFAULT_MIXER, 0.2);
    expect(nodes.master).toBeCloseTo(
      faderGain(DEFAULT_MIXER.volumes.master) * 0.2,
      9,
    );
    for (const id of PLAYBACK_BUS_IDS) {
      // The node itself is untouched...
      expect(nodes[id], id).toBeCloseTo(
        faderGain(DEFAULT_MIXER.volumes[id]),
        9,
      );
      // ...and yet every bus is ducked, because master is in its chain.
      expect(busGain(DEFAULT_MIXER, id, 0.2), id).toBeCloseTo(
        busGain(DEFAULT_MIXER, id) * 0.2,
        9,
      );
    }
  });

  it("goes silent at a duck factor of zero", () => {
    for (const id of MIX_BUS_IDS) {
      expect(isAudible(DEFAULT_MIXER, id, 0), id).toBe(false);
    }
  });

  it("reports a gain for every bus in the table", () => {
    expect(Object.keys(busNodeGains(DEFAULT_MIXER)).sort()).toEqual(
      [...MIX_BUS_IDS].sort(),
    );
  });
});

describe("clampMixer", () => {
  it("falls back to defaults for non-objects and empty records", () => {
    expect(clampMixer(null)).toEqual(DEFAULT_MIXER);
    expect(clampMixer("loud")).toEqual(DEFAULT_MIXER);
    expect(clampMixer(7)).toEqual(DEFAULT_MIXER);
    expect(clampMixer({})).toEqual(DEFAULT_MIXER);
  });

  it("keeps valid faders and defaults the rest, bus by bus", () => {
    const clamped = clampMixer({
      volumes: { master: 0.4, sfx: "loud", nonsense: 0.9 },
      mutes: { music: true, sfx: "yes" },
    });
    expect(clamped.volumes.master).toBe(0.4);
    expect(clamped.volumes.sfx).toBe(DEFAULT_MIXER.volumes.sfx);
    expect(clamped.volumes.ui).toBe(DEFAULT_MIXER.volumes.ui);
    expect(clamped.mutes.music).toBe(true);
    expect(clamped.mutes.sfx).toBe(false);
    expect(Object.keys(clamped.volumes).sort()).toEqual([...MIX_BUS_IDS].sort());
  });

  it("clamps out-of-range faders rather than dropping them", () => {
    const clamped = clampMixer({ volumes: { master: 4, music: -1 } });
    expect(clamped.volumes.master).toBe(1);
    expect(clamped.volumes.music).toBe(0);
  });

  it("defaults ducking on, and only an explicit false turns it off", () => {
    expect(clampMixer({}).duckOnBlur).toBe(true);
    expect(clampMixer({ duckOnBlur: "no" }).duckOnBlur).toBe(true);
    expect(clampMixer({ duckOnBlur: false }).duckOnBlur).toBe(false);
  });

  it("round-trips a state through JSON unchanged", () => {
    const state = setBusMuted(
      setDuckOnBlur(mixerAt({ master: 0.31, ui: 0.07 }), false),
      "music",
      true,
    );
    expect(clampMixer(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });
});

// --- The move off the old three-channel record --------------------------

describe("migrateLegacyMixer", () => {
  /** The record the old mixer wrote: linear amplitudes, one mute. */
  const legacy = { master: 0.5, sfx: 0.8, music: 0.4, muted: false };

  it("reproduces the old loudness exactly, bus for bus", () => {
    // The whole claim of the migration: upgrading changes nothing about
    // what a player hears. The old effective gain was master × channel,
    // both linear; the new one is the product of the curve at each
    // stored position, and the two have to agree.
    const migrated = migrateLegacyMixer(legacy);
    expect(busGain(migrated, "sfx")).toBeCloseTo(0.5 * 0.8, 9);
    expect(busGain(migrated, "music")).toBeCloseTo(0.5 * 0.4, 9);
    expect(busGain(migrated, "master")).toBeCloseTo(0.5, 9);
  });

  it("holds for every level a player could have left it on", () => {
    for (const master of [0, 0.05, 0.25, 0.5, 0.9, 1]) {
      for (const channel of [0, 0.1, 0.6, 1]) {
        const migrated = migrateLegacyMixer({
          master,
          sfx: channel,
          music: channel,
        });
        expect(
          busGain(migrated, "sfx"),
          `master ${master} × sfx ${channel}`,
        ).toBeCloseTo(master * channel, 9);
        expect(
          busGain(migrated, "music"),
          `master ${master} × music ${channel}`,
        ).toBeCloseTo(master * channel, 9);
      }
    }
  });

  it("puts the interface on the level its sounds already had", () => {
    // UI cues rode the SFX channel before they had a bus of their own,
    // so that is the level they keep: splitting a bus out is not an
    // occasion to change what anything sounds like.
    const migrated = migrateLegacyMixer(legacy);
    expect(migrated.volumes.ui).toBe(migrated.volumes.sfx);
    expect(busGain(migrated, "ui")).toBeCloseTo(busGain(migrated, "sfx"), 9);
  });

  it("stores fader positions, not the amplitudes it was given", () => {
    const migrated = migrateLegacyMixer(legacy);
    expect(migrated.volumes.master).toBeCloseTo(gainToFader(0.5), 9);
    // The conversion is real: 0.5 of amplitude is not 0.5 of travel.
    expect(migrated.volumes.master).not.toBeCloseTo(0.5, 3);
  });

  it("carries the one global mute onto master", () => {
    const migrated = migrateLegacyMixer({ ...legacy, muted: true });
    expect(migrated.mutes.master).toBe(true);
    for (const id of PLAYBACK_BUS_IDS) {
      expect(migrated.mutes[id], id).toBe(false);
    }
    // Which still silences the whole game, as the one mute always did.
    for (const id of MIX_BUS_IDS) expect(busGain(migrated, id), id).toBe(0);
  });

  it("fills a missing field with the level the old mixer defaulted to", () => {
    const migrated = migrateLegacyMixer({ master: 0.5 });
    expect(busGain(migrated, "sfx")).toBeCloseTo(0.5 * 0.9, 9);
    expect(busGain(migrated, "music")).toBeCloseTo(0.5 * 0.6, 9);
  });

  it("turns ducking on for a player who has never had the choice", () => {
    expect(migrateLegacyMixer(legacy).duckOnBlur).toBe(true);
  });

  it("degrades a junk record to defaults instead of throwing", () => {
    expect(migrateLegacyMixer(null)).toEqual(DEFAULT_MIXER);
    expect(migrateLegacyMixer("0.5")).toEqual(DEFAULT_MIXER);
    const odd = migrateLegacyMixer({ master: "loud", sfx: Number.NaN });
    expect(busGain(odd, "sfx")).toBeCloseTo(0.8 * 0.9, 9);
  });

  it("keeps a channel the player had silenced silent", () => {
    const migrated = migrateLegacyMixer({ ...legacy, music: 0 });
    expect(migrated.volumes.music).toBe(0);
    expect(busGain(migrated, "music")).toBe(0);
  });
});

describe("memoryMixerStore", () => {
  it("holds what it is given and hands it back", () => {
    const store = memoryMixerStore();
    expect(store.get()).toEqual(DEFAULT_MIXER);
    const next = setBusVolume(DEFAULT_MIXER, "ui", 0.2);
    store.set(next);
    expect(store.get()).toBe(next);
  });
});
