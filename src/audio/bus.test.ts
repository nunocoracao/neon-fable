import { describe, expect, it } from "vitest";
import type { AudioAdapter } from "./adapter";
import { MUSIC_FADE_SECONDS, createAudioBus, installAutoUnlock } from "./bus";
import { DEFAULT_MIXER, type AudioSettingsStorage } from "./mixer";
import type { ScheduledNote } from "./music";
import { barSeconds, arrangementFor, layerKey, musicScene } from "./score";
import { SOUND_PATCHES, type SynthPatch } from "./patches";
import { SOUND_EVENT_IDS, patchForEvent } from "./events";

interface Ramp {
  layer: string;
  target: number;
  startTime: number;
  seconds: number;
}

interface FakeAdapter {
  adapter: AudioAdapter;
  patches: SynthPatch[];
  notes: ScheduledNote[];
  ramps: Ramp[];
  drops: string[];
  stops: number;
  gains: Array<[number, number]>;
  setTime(time: number): void;
  setRunning(running: boolean): void;
  /** Layers currently ramped up and not dropped. */
  liveLayers(): string[];
}

function fakeAdapter(running = true): FakeAdapter {
  const fake: FakeAdapter = {
    patches: [],
    notes: [],
    ramps: [],
    drops: [],
    stops: 0,
    gains: [],
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
    setChannelGains: (sfx, music) => void fake.gains.push([sfx, music]),
    playPatch: (patch) => void fake.patches.push(patch),
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

function memoryStorage(): AudioSettingsStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

/** Bus wired to a fake adapter, timer disabled — tests call tick(). */
function makeBus(fake: FakeAdapter, storage: AudioSettingsStorage | null = null) {
  return createAudioBus({ adapter: fake.adapter, storage, tickIntervalMs: 0 });
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

  it("respects the SFX bus: muting silences every event", () => {
    const fake = fakeAdapter();
    const bus = makeBus(fake);
    bus.setVolume("sfx", 0);
    for (const event of SOUND_EVENT_IDS) bus.emit(event);
    expect(fake.patches).toEqual([]);
    bus.setVolume("sfx", 1);
    bus.emit("ui.click");
    expect(fake.patches).toHaveLength(1);
  });
});

describe("play", () => {
  it("forwards the registered patch to the adapter", () => {
    const fake = fakeAdapter();
    const bus = makeBus(fake);
    bus.play("ui-click");
    expect(fake.patches).toEqual([SOUND_PATCHES["ui-click"]]);
  });

  it("skips playback entirely while muted", () => {
    const fake = fakeAdapter();
    const bus = makeBus(fake);
    bus.setMuted(true);
    bus.play("ui-click");
    expect(fake.patches).toEqual([]);
  });

  it("never throws when the adapter is not running", () => {
    const fake = fakeAdapter(false);
    const bus = makeBus(fake);
    expect(() => bus.play("attack-hit-heavy")).not.toThrow();
  });
});

describe("mixer controls", () => {
  it("clamps volumes and reports them through getMixer", () => {
    const bus = makeBus(fakeAdapter());
    bus.setVolume("master", 5);
    bus.setVolume("music", -3);
    expect(bus.getMixer().master).toBe(1);
    expect(bus.getMixer().music).toBe(0);
  });

  it("persists settings so a new bus on the same storage restores them", () => {
    const storage = memoryStorage();
    const first = makeBus(fakeAdapter(), storage);
    first.setVolume("sfx", 0.35);
    first.setVolume("master", 0.5);
    first.setMuted(true);

    const second = makeBus(fakeAdapter(), storage);
    expect(second.getMixer()).toEqual({
      ...DEFAULT_MIXER,
      sfx: 0.35,
      master: 0.5,
      muted: true,
    });
  });

  it("pushes effective channel gains to the adapter", () => {
    const fake = fakeAdapter();
    const bus = makeBus(fake);
    bus.setVolume("master", 0.5);
    bus.setVolume("sfx", 0.5);
    const [sfx] = fake.gains[fake.gains.length - 1] ?? [];
    expect(sfx).toBeCloseTo(0.25);
    bus.setMuted(true);
    expect(fake.gains[fake.gains.length - 1]).toEqual([0, 0]);
  });

  it("toggleMuted flips and reports the new state", () => {
    const bus = makeBus(fakeAdapter());
    expect(bus.toggleMuted()).toBe(true);
    expect(bus.toggleMuted()).toBe(false);
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
    bus.setMuted(true);
    bus.tick();
    const muted = fake.notes.length;
    advance(fake, bus, 8);
    expect(fake.notes.length).toBe(muted);
    expect(bus.getMusicLayers()).toEqual([]);

    bus.setMuted(false);
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
