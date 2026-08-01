import { describe, expect, it } from "vitest";
import type { AudioAdapter } from "./adapter";
import {
  MUSIC_FADE_SECONDS,
  createAudioBus,
  installAutoUnlock,
  installFocusDucking,
} from "./bus";
import {
  DEFAULT_MIXER,
  busGain,
  memoryMixerStore,
  type MixerStore,
} from "./mixer";
import { DUCK_BLURRED_GAIN, DUCK_HIDDEN_GAIN } from "./duck";
import { faderGain } from "./gain";
import type { ScheduledNote } from "./music";
import { barSeconds, arrangementFor, layerKey, musicScene } from "./score";
import { SOUND_PATCHES, type SynthPatch } from "./patches";
import { SOUND_EVENT_IDS, busForEvent, patchForEvent } from "./events";
import { MIX_BUS_IDS, PLAYBACK_BUS_IDS, type MixBusId } from "../data/mixBuses";

interface Ramp {
  layer: string;
  target: number;
  startTime: number;
  seconds: number;
}

/** One patch, and the bus it was played onto. */
interface Played {
  patch: SynthPatch;
  bus: MixBusId;
}

interface FakeAdapter {
  adapter: AudioAdapter;
  played: Played[];
  patches: SynthPatch[];
  notes: ScheduledNote[];
  ramps: Ramp[];
  drops: string[];
  stops: number;
  gains: Array<Record<MixBusId, number>>;
  /** The most recent gain written to one bus node. */
  gain(bus: MixBusId): number | undefined;
  setTime(time: number): void;
  setRunning(running: boolean): void;
  /** Layers currently ramped up and not dropped. */
  liveLayers(): string[];
}

function fakeAdapter(running = true): FakeAdapter {
  const fake: FakeAdapter = {
    played: [],
    get patches() {
      return fake.played.map((entry) => entry.patch);
    },
    notes: [],
    ramps: [],
    drops: [],
    stops: 0,
    gains: [],
    gain: (bus) => fake.gains[fake.gains.length - 1]?.[bus],
    setTime: (time) => {
      now = time;
    },
    setRunning: (value) => {
      isRunning = value;
    },
    liveLayers: () => {
      const up = new Set<string>();
      for (const ramp of fake.ramps) {
        if (ramp.target > 0) up.add(ramp.layer);
        else up.delete(ramp.layer);
      }
      for (const key of fake.drops) up.delete(key);
      return [...up];
    },
    adapter: null as unknown as AudioAdapter,
  };
  let now = 0;
  let isRunning = running;
  fake.adapter = {
    unlock: () => isRunning,
    get running() {
      return isRunning;
    },
    now: () => now,
    setBusGains: (gains) => void fake.gains.push({ ...gains }),
    playPatch: (patch, bus) => void fake.played.push({ patch, bus }),
    scheduleNote: (note) => void fake.notes.push(note),
    rampLayer: (layer, target, startTime, seconds) =>
      void fake.ramps.push({ layer, target, startTime, seconds }),
    dropLayer: (layer) => void fake.drops.push(layer),
    stopMusicLayer: () => {
      fake.stops++;
      fake.ramps.length = 0;
    },
  };
  return fake;
}

/** Bus wired to a fake adapter, timer disabled — tests call tick(). */
function makeBus(fake: FakeAdapter, mixer: MixerStore | null = null) {
  return createAudioBus({ adapter: fake.adapter, mixer, tickIntervalMs: 0 });
}

/** Runs the scheduler forward to `time` in lookahead-sized steps. */
function advance(fake: FakeAdapter, bus: ReturnType<typeof makeBus>, time: number): void {
  for (let t = fake.adapter.now() + 0.1; t <= time; t += 0.1) {
    fake.setTime(Number(t.toFixed(6)));
    bus.tick();
  }
}

/** How far a time sits from the nearest bar line, in bars. */
function offGrid(time: number, origin: number, bar: number): number {
  const bars = (time - origin) / bar;
  return Math.abs(bars - Math.round(bars));
}

describe("emit", () => {
  it("plays the patch the registry maps the event to", () => {
    const fake = fakeAdapter();
    const bus = makeBus(fake);
    bus.emit("combat.attack.blade");
    expect(fake.patches).toEqual([
      SOUND_PATCHES[patchForEvent("combat.attack.blade")],
    ]);
  });

  it("plays every registered event without throwing", () => {
    const fake = fakeAdapter();
    const bus = makeBus(fake);
    for (const event of SOUND_EVENT_IDS) {
      expect(() => bus.emit(event), event).not.toThrow();
    }
    expect(fake.patches).toHaveLength(SOUND_EVENT_IDS.length);
  });

  it("plays every event onto the bus the registry routes it to", () => {
    // The routing audit, driven rather than read: nothing gets to the
    // adapter except on the one bus its family declares.
    const fake = fakeAdapter();
    const bus = makeBus(fake);
    for (const event of SOUND_EVENT_IDS) bus.emit(event);
    expect(fake.played).toHaveLength(SOUND_EVENT_IDS.length);
    fake.played.forEach((entry, index) => {
      const event = SOUND_EVENT_IDS[index]!;
      expect(entry.bus, event).toBe(busForEvent(event));
      expect(PLAYBACK_BUS_IDS, event).toContain(entry.bus);
    });
  });

  it("silences one bus without silencing the others", () => {
    const fake = fakeAdapter();
    const bus = makeBus(fake);
    bus.setBusVolume("ui", 0);
    bus.emit("ui.click");
    expect(fake.played).toEqual([]);
    // The street is unaffected by the shell being turned off.
    bus.emit("world.footstep");
    expect(fake.played).toHaveLength(1);
    expect(fake.played[0]?.bus).toBe("sfx");
  });

  it("stops everything when master is muted", () => {
    const fake = fakeAdapter();
    const bus = makeBus(fake);
    bus.setBusMuted("master", true);
    for (const event of SOUND_EVENT_IDS) bus.emit(event);
    expect(fake.played).toEqual([]);
  });
});

describe("play", () => {
  it("forwards the registered patch to the named bus", () => {
    const fake = fakeAdapter();
    const bus = makeBus(fake);
    bus.play("ui-click", "ui");
    expect(fake.played).toEqual([{ patch: SOUND_PATCHES["ui-click"], bus: "ui" }]);
  });

  it("skips playback entirely while its bus is muted", () => {
    const fake = fakeAdapter();
    const bus = makeBus(fake);
    bus.setBusMuted("ui", true);
    bus.play("ui-click", "ui");
    expect(fake.played).toEqual([]);
  });

  it("never throws when the adapter is not running", () => {
    const fake = fakeAdapter(false);
    const bus = makeBus(fake);
    expect(() => bus.play("attack-hit-heavy", "sfx")).not.toThrow();
  });
});

describe("mixer controls", () => {
  it("clamps faders and reports them through getMixer", () => {
    const bus = makeBus(fakeAdapter());
    bus.setBusVolume("master", 5);
    bus.setBusVolume("music", -3);
    expect(bus.getMixer().volumes.master).toBe(1);
    expect(bus.getMixer().volumes.music).toBe(0);
  });

  it("writes every change straight through to its store", () => {
    const store = memoryMixerStore();
    const bus = makeBus(fakeAdapter(), store);
    bus.setBusVolume("sfx", 0.35);
    bus.setBusMuted("ui", true);
    bus.setDuckOnBlur(false);

    expect(store.get().volumes.sfx).toBe(0.35);
    expect(store.get().mutes.ui).toBe(true);
    expect(store.get().duckOnBlur).toBe(false);
    // And a bus built on the same store afterwards is already there.
    expect(makeBus(fakeAdapter(), store).getMixer()).toEqual(store.get());
  });

  it("reads the store rather than a cache of it", () => {
    // The settings panel is not the only thing that can write settings.
    const store = memoryMixerStore();
    const bus = makeBus(fakeAdapter(), store);
    store.set({ ...DEFAULT_MIXER, mutes: { ...DEFAULT_MIXER.mutes, sfx: true } });
    expect(bus.getMixer().mutes.sfx).toBe(true);
    expect(bus.isAudible("sfx")).toBe(false);
  });

  it("pushes a gain for every bus node, live", () => {
    const fake = fakeAdapter();
    const bus = makeBus(fake);
    bus.setBusVolume("master", 0.5);
    bus.setBusVolume("sfx", 0.75);
    expect(Object.keys(fake.gains[fake.gains.length - 1] ?? {}).sort()).toEqual(
      [...MIX_BUS_IDS].sort(),
    );
    expect(fake.gain("master")).toBeCloseTo(faderGain(0.5), 9);
    expect(fake.gain("sfx")).toBeCloseTo(faderGain(0.75), 9);

    // A mute is a node at zero, not a flag the adapter has to know about.
    bus.setBusMuted("master", true);
    expect(fake.gain("master")).toBe(0);
    expect(fake.gain("sfx")).toBeCloseTo(faderGain(0.75), 9);
  });

  it("toggleBusMuted flips one bus and reports where it landed", () => {
    const bus = makeBus(fakeAdapter());
    expect(bus.toggleBusMuted("music")).toBe(true);
    expect(bus.toggleBusMuted("music")).toBe(false);
    expect(bus.getMixer().mutes.sfx).toBe(false);
  });
});

describe("the test tone", () => {
  it("plays the registered tone on whichever bus is asked for", () => {
    const fake = fakeAdapter();
    const bus = makeBus(fake);
    const tone = SOUND_PATCHES[patchForEvent("ui.mixer.tone")];
    for (const id of MIX_BUS_IDS) bus.playTestTone(id);
    expect(fake.played).toEqual(MIX_BUS_IDS.map((bus) => ({ patch: tone, bus })));
  });

  it("reaches master, which nothing else is played onto", () => {
    // The point of a master test tone: hearing that fader on its own.
    const fake = fakeAdapter();
    const bus = makeBus(fake);
    bus.playTestTone("master");
    expect(fake.played[0]?.bus).toBe("master");
  });

  it("stays quiet on a bus that cannot be heard", () => {
    const fake = fakeAdapter();
    const bus = makeBus(fake);
    bus.setBusMuted("music", true);
    bus.playTestTone("music");
    expect(fake.played).toEqual([]);
    // Master muted takes the rest with it.
    bus.setBusMuted("master", true);
    for (const id of MIX_BUS_IDS) bus.playTestTone(id);
    expect(fake.played).toEqual([]);
  });
});

describe("ducking", () => {
  it("quiets a blurred window and silences a hidden tab", () => {
    const fake = fakeAdapter();
    const bus = makeBus(fake);
    const master = fake.gain("master")!;

    bus.setFocus("blur");
    expect(bus.getDuckFactor()).toBe(DUCK_BLURRED_GAIN);
    expect(fake.gain("master")).toBeCloseTo(master * DUCK_BLURRED_GAIN, 9);

    bus.setFocus("hide");
    expect(bus.getDuckFactor()).toBe(DUCK_HIDDEN_GAIN);
    expect(fake.gain("master")).toBe(0);

    bus.setFocus("show");
    bus.setFocus("focus");
    expect(bus.getDuckFactor()).toBe(1);
    expect(fake.gain("master")).toBeCloseTo(master, 9);
  });

  it("keeps a ducked event out of the adapter entirely", () => {
    const fake = fakeAdapter();
    const bus = makeBus(fake);
    bus.setFocus("hide");
    bus.emit("world.footstep");
    expect(fake.played).toEqual([]);
    bus.setFocus("show");
    bus.emit("world.footstep");
    expect(fake.played).toHaveLength(1);
  });

  it("still plays, quieter, while merely unfocused", () => {
    const fake = fakeAdapter();
    const bus = makeBus(fake);
    bus.setFocus("blur");
    bus.emit("world.footstep");
    expect(fake.played).toHaveLength(1);
    expect(bus.isAudible("sfx")).toBe(true);
  });

  it("stops and resumes the score around a hidden tab", () => {
    const fake = fakeAdapter();
    const bus = makeBus(fake);
    bus.setMusicScene(musicScene("hub"));
    advance(fake, bus, 3);
    const before = fake.notes.length;

    bus.setFocus("hide");
    advance(fake, bus, 8);
    expect(fake.notes.length).toBe(before);
    expect(bus.getMusicLayers()).toEqual([]);

    bus.setFocus("show");
    fake.setTime(20);
    bus.tick();
    expect(fake.notes.length).toBeGreaterThan(before);
    expect(bus.getMusicLayers()).toEqual(["base", "melodic"]);
  });

  it("does nothing at all with the setting off, and lifts a live duck", () => {
    const fake = fakeAdapter();
    const bus = makeBus(fake);
    const master = fake.gain("master")!;
    bus.setFocus("hide");
    expect(fake.gain("master")).toBe(0);

    bus.setDuckOnBlur(false);
    expect(bus.getDuckFactor()).toBe(1);
    expect(fake.gain("master")).toBeCloseTo(master, 9);
    // The focus state is still remembered — only its consequence is off.
    expect(bus.getFocus()).toEqual({ focused: true, visible: false });
    bus.setDuckOnBlur(true);
    expect(fake.gain("master")).toBe(0);
  });

  it("keeps the duck out of the stored mix", () => {
    // Ducking is a fact about right now, not a preference: it must not
    // end up written into anybody's fader.
    const store = memoryMixerStore();
    const bus = makeBus(fakeAdapter(), store);
    bus.setFocus("blur");
    expect(store.get().volumes).toEqual(DEFAULT_MIXER.volumes);
    expect(busGain(store.get(), "sfx")).toBeGreaterThan(0);
  });
});

describe("installFocusDucking", () => {
  /** A window/document pair whose listeners the test can fire. */
  function fakeTargets(hidden = false) {
    const listeners = new Map<string, () => void>();
    const doc = {
      hidden,
      addEventListener: (type: string, fn: () => void) =>
        void listeners.set(`doc:${type}`, fn),
    };
    return {
      listeners,
      doc,
      targets: {
        window: {
          addEventListener: (type: string, fn: () => void) =>
            void listeners.set(`win:${type}`, fn),
        },
        document: doc,
      },
    };
  }

  it("wires both attention signals onto the bus", () => {
    const bus = makeBus(fakeAdapter());
    const { listeners, doc, targets } = fakeTargets();
    installFocusDucking(bus, targets as never);
    expect([...listeners.keys()].sort()).toEqual([
      "doc:visibilitychange",
      "win:blur",
      "win:focus",
    ]);

    listeners.get("win:blur")?.();
    expect(bus.getDuckFactor()).toBe(DUCK_BLURRED_GAIN);
    listeners.get("win:focus")?.();
    expect(bus.getDuckFactor()).toBe(1);

    doc.hidden = true;
    listeners.get("doc:visibilitychange")?.();
    expect(bus.getDuckFactor()).toBe(DUCK_HIDDEN_GAIN);
    doc.hidden = false;
    listeners.get("doc:visibilitychange")?.();
    expect(bus.getDuckFactor()).toBe(1);
  });

  it("seeds from a page restored into a background tab", () => {
    const bus = makeBus(fakeAdapter());
    installFocusDucking(bus, fakeTargets(true).targets as never);
    expect(bus.getFocus().visible).toBe(false);
    expect(bus.getDuckFactor()).toBe(DUCK_HIDDEN_GAIN);
  });
});

describe("the score", () => {
  it("brings up the exploration stems and schedules their notes", () => {
    const fake = fakeAdapter();
    const bus = makeBus(fake);
    fake.setTime(10);
    bus.setMusicScene(musicScene("hub"));
    advance(fake, bus, 14);

    expect(bus.getMusicLayers()).toEqual(["base", "melodic"]);
    expect(fake.liveLayers()).toEqual([
      layerKey("hub", "night", "base"),
      layerKey("hub", "night", "melodic"),
    ]);
    expect(fake.notes.length).toBeGreaterThan(0);
    for (const note of fake.notes) {
      expect(note.time).toBeGreaterThanOrEqual(10);
    }
  });

  it("keeps scheduling as ticks advance and never re-emits a step", () => {
    const fake = fakeAdapter();
    const bus = makeBus(fake);
    bus.setMusicScene(musicScene("market"));
    bus.tick();
    const afterStart = fake.notes.length;
    advance(fake, bus, 3);
    expect(fake.notes.length).toBeGreaterThan(afterStart);
    const stamps = fake.notes.map((n) => `${n.layer}@${n.time.toFixed(6)}@${n.freq}`);
    expect(new Set(stamps).size).toBe(stamps.length);
  });

  it("keeps the district playing through a fight", () => {
    const fake = fakeAdapter();
    const bus = makeBus(fake);
    bus.setMusicScene(musicScene("quays"));
    advance(fake, bus, 6);
    const baseKey = layerKey("quays", "night", "base");
    const baseNotes = fake.notes.filter((n) => n.layer === baseKey).length;

    bus.setMusicMode("combat");
    advance(fake, bus, 20);

    // The base stem was never faded down and never re-created: the same
    // channel is still running, and still emitting.
    expect(fake.ramps.filter((r) => r.layer === baseKey && r.target === 0)).toEqual(
      [],
    );
    expect(fake.drops).not.toContain(baseKey);
    expect(fake.notes.filter((n) => n.layer === baseKey).length).toBeGreaterThan(
      baseNotes,
    );
    expect(bus.getMusicLayers()).toEqual(["base", "tension", "rhythm"]);
  });

  it("crossfades into a fight on a bar line", () => {
    const fake = fakeAdapter();
    const bus = makeBus(fake);
    bus.setMusicScene(musicScene("ventworks"));
    bus.tick();
    const origin = 0.05;
    const bar = barSeconds(arrangementFor(musicScene("ventworks")));

    advance(fake, bus, 3);
    bus.setMusicMode("combat");
    const moved = fake.ramps.filter((r) => r.layer.includes("tension"));
    expect(moved).toHaveLength(1);
    const at = moved[0]!.startTime;
    expect(at).toBeGreaterThanOrEqual(3);
    expect(offGrid(at, origin, bar)).toBeLessThan(1e-9);
    expect(moved[0]!.seconds).toBe(MUSIC_FADE_SECONDS);
  });

  it("adds a layer for a boss without disturbing the fight's mix", () => {
    const fake = fakeAdapter();
    const bus = makeBus(fake);
    bus.setMusicScene(musicScene("spire", "combat"));
    advance(fake, bus, 12);
    const before = fake.ramps.length;

    bus.setMusicMode("boss");
    const added = fake.ramps.slice(before);
    expect(added).toHaveLength(1);
    expect(added[0]?.layer).toBe(layerKey("spire", "night", "boss"));
    expect(added[0]?.target).toBe(1);
    expect(bus.getMusicLayers()).toEqual(["base", "tension", "rhythm", "boss"]);
  });

  it("crossfades the whole theme when the district changes", () => {
    const fake = fakeAdapter();
    const bus = makeBus(fake);
    bus.setMusicScene(musicScene("hub"));
    advance(fake, bus, 8);
    const before = fake.ramps.length;

    bus.setMusicScene(musicScene("greywater"));
    const moved = fake.ramps.slice(before);
    expect(moved.filter((r) => r.target === 0).map((r) => r.layer).sort()).toEqual(
      [layerKey("hub", "night", "base"), layerKey("hub", "night", "melodic")],
    );
    expect(moved.filter((r) => r.target === 1).map((r) => r.layer).sort()).toEqual(
      [
        layerKey("greywater", "night", "base"),
        layerKey("greywater", "night", "melodic"),
      ],
    );
    // Every fade in the move starts together, on one bar line.
    expect(new Set(moved.map((r) => r.startTime)).size).toBe(1);
  });

  it("lets a faded-out layer finish sounding before dropping it", () => {
    const fake = fakeAdapter();
    const bus = makeBus(fake);
    bus.setMusicScene(musicScene("hub"));
    advance(fake, bus, 8);
    const stale = layerKey("hub", "night", "melodic");

    bus.setMusicMode("combat");
    const fade = fake.ramps.find((r) => r.layer === stale && r.target === 0);
    expect(fade).toBeDefined();
    const silent = fade!.startTime + fade!.seconds;

    // Still there while it is fading — the melody is on its way out, not cut.
    advance(fake, bus, silent - 0.2);
    expect(fake.drops).not.toContain(stale);

    advance(fake, bus, silent + 0.5);
    expect(fake.drops).toContain(stale);
    expect(fake.liveLayers()).not.toContain(stale);
    // And nothing was scheduled into it past the point it went silent.
    const late = fake.notes.filter((n) => n.layer === stale && n.time > silent);
    expect(late).toEqual([]);
  });

  it("the hour changes the notes, and refades to say so", () => {
    const fake = fakeAdapter();
    const bus = makeBus(fake);
    bus.setMusicScene(musicScene("hub", "explore", "night"));
    advance(fake, bus, 8);
    const nightNotes = fake.notes.filter((n) => n.layer.includes(":night:"));

    bus.setMusicScene(musicScene("hub", "explore", "late"));
    advance(fake, bus, 40);
    const lateNotes = fake.notes.filter((n) => n.layer.includes(":late:"));
    expect(lateNotes.length).toBeGreaterThan(0);
    // Same music, quieter and darker at 3am.
    expect(Math.max(...lateNotes.map((n) => n.filterFreq))).toBeLessThan(
      Math.max(...nightNotes.map((n) => n.filterFreq)),
    );
  });

  it("null stops the score and the scheduling with it", () => {
    const fake = fakeAdapter();
    const bus = makeBus(fake);
    bus.setMusicScene(musicScene("hub"));
    advance(fake, bus, 5);
    expect(bus.getMusicScene()).toEqual(musicScene("hub"));

    bus.setMusicScene(null);
    expect(fake.stops).toBe(1);
    const count = fake.notes.length;
    advance(fake, bus, 30);
    expect(fake.notes.length).toBe(count);
    expect(bus.getMusicScene()).toBeNull();
    expect(bus.getMusicLayers()).toEqual([]);
  });

  it("setting the same scene twice changes nothing", () => {
    const fake = fakeAdapter();
    const bus = makeBus(fake);
    bus.setMusicScene(musicScene("menu"));
    bus.tick();
    const ramps = fake.ramps.length;
    bus.setMusicScene(musicScene("menu"));
    bus.tick();
    expect(fake.ramps.length).toBe(ramps);
  });

  it("setMusicMode does nothing with no scene, and no-ops on a repeat", () => {
    const fake = fakeAdapter();
    const bus = makeBus(fake);
    bus.setMusicMode("combat");
    expect(bus.getMusicScene()).toBeNull();
    expect(fake.ramps).toEqual([]);

    bus.setMusicScene(musicScene("hub", "combat"));
    bus.tick();
    const ramps = fake.ramps.length;
    bus.setMusicMode("combat");
    expect(fake.ramps.length).toBe(ramps);
  });

  it("mutes cleanly and rejoins at the current time on unmute", () => {
    const fake = fakeAdapter();
    const bus = makeBus(fake);
    bus.setMusicScene(musicScene("hub"));
    advance(fake, bus, 3);
    bus.setBusMuted("music", true);
    bus.tick();
    const muted = fake.notes.length;
    advance(fake, bus, 8);
    expect(fake.notes.length).toBe(muted);
    expect(bus.getMusicLayers()).toEqual([]);

    bus.setBusMuted("music", false);
    fake.setTime(20);
    bus.tick();
    const resumed = fake.notes.slice(muted);
    expect(resumed.length).toBeGreaterThan(0);
    for (const note of resumed) {
      expect(note.time).toBeGreaterThanOrEqual(20);
    }
  });

  it("rejoins at the clock after the timer starves", () => {
    const fake = fakeAdapter();
    const bus = makeBus(fake);
    bus.setMusicScene(musicScene("hub"));
    advance(fake, bus, 3);
    const before = fake.notes.length;

    // The tab slept: one tick, minutes later.
    fake.setTime(300);
    bus.tick();
    const resumed = fake.notes.slice(before);
    expect(resumed.length).toBeGreaterThan(0);
    for (const note of resumed) {
      expect(note.time).toBeGreaterThanOrEqual(300);
      expect(note.time).toBeLessThan(301);
    }
    // The mix survived the sleep — nothing was refaded or dropped.
    expect(bus.getMusicLayers()).toEqual(["base", "melodic"]);
    expect(fake.drops).toEqual([]);
  });

  it("schedules nothing while the adapter is unavailable", () => {
    const fake = fakeAdapter(false);
    const bus = makeBus(fake);
    bus.setMusicScene(musicScene("hub"));
    bus.tick();
    expect(fake.notes).toEqual([]);
    // And picks up where it was told to once the context unlocks.
    fake.setRunning(true);
    bus.unlock();
    bus.tick();
    expect(fake.notes.length).toBeGreaterThan(0);
  });
});

describe("installAutoUnlock", () => {
  it("retries on gestures and detaches once running", () => {
    const fake = fakeAdapter(false);
    const bus = makeBus(fake);
    const listeners = new Map<string, (event: unknown) => void>();
    const target = {
      addEventListener: (type: string, fn: (event: unknown) => void) =>
        void listeners.set(type, fn),
      removeEventListener: (type: string) => void listeners.delete(type),
    } as unknown as Window;

    installAutoUnlock(bus, target);
    expect(listeners.size).toBe(2);

    listeners.get("pointerdown")?.({});
    expect(listeners.size).toBe(2);

    fake.setRunning(true);
    listeners.get("pointerdown")?.({});
    expect(listeners.size).toBe(0);
  });
});
