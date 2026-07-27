import { describe, expect, it } from "vitest";
import type { AudioAdapter } from "./adapter";
import { createAudioBus, installAutoUnlock } from "./bus";
import { DEFAULT_MIXER, type AudioSettingsStorage } from "./mixer";
import type { ScheduledNote } from "./music";
import { MUSIC_PATTERNS } from "./music";
import { SOUND_PATCHES, type SynthPatch } from "./patches";

interface FakeAdapter {
  adapter: AudioAdapter;
  patches: SynthPatch[];
  notes: ScheduledNote[];
  swaps: number;
  stops: number;
  gains: Array<[number, number]>;
  setTime(time: number): void;
  setRunning(running: boolean): void;
}

function fakeAdapter(running = true): FakeAdapter {
  const fake: FakeAdapter = {
    patches: [],
    notes: [],
    swaps: 0,
    stops: 0,
    gains: [],
    setTime: (time) => {
      now = time;
    },
    setRunning: (value) => {
      isRunning = value;
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
    swapMusicLayer: () => void fake.swaps++,
    stopMusicLayer: () => void fake.stops++,
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

describe("music context", () => {
  it("schedules pattern notes ahead of the clock once a context is set", () => {
    const fake = fakeAdapter();
    const bus = makeBus(fake);
    fake.setTime(10);
    bus.setMusicContext("combat");
    expect(fake.swaps).toBe(1);
    expect(fake.notes.length).toBeGreaterThan(0);
    for (const note of fake.notes) {
      expect(note.time).toBeGreaterThanOrEqual(10);
    }
    const step0 = MUSIC_PATTERNS.combat.notes.filter((n) => n.step === 0);
    expect(fake.notes.some((n) => n.freq === step0[0]?.freq)).toBe(true);
  });

  it("keeps scheduling as ticks advance and never re-emits a step", () => {
    const fake = fakeAdapter();
    const bus = makeBus(fake);
    bus.setMusicContext("combat");
    const afterStart = fake.notes.length;
    fake.setTime(0.25);
    bus.tick();
    fake.setTime(0.5);
    bus.tick();
    expect(fake.notes.length).toBeGreaterThan(afterStart);
    const times = fake.notes.map((n) => n.time);
    expect(new Set(times.map((t) => t.toFixed(6))).size).toBe(times.length);
  });

  it("switching contexts crossfades; null stops the layer and scheduling", () => {
    const fake = fakeAdapter();
    const bus = makeBus(fake);
    bus.setMusicContext("menu");
    bus.setMusicContext("hub");
    expect(fake.swaps).toBe(2);
    expect(bus.getMusicContext()).toBe("hub");

    bus.setMusicContext(null);
    expect(fake.stops).toBe(1);
    const count = fake.notes.length;
    fake.setTime(30);
    bus.tick();
    expect(fake.notes.length).toBe(count);
    expect(bus.getMusicContext()).toBeNull();
  });

  it("setting the same context twice does not restart the layer", () => {
    const fake = fakeAdapter();
    const bus = makeBus(fake);
    bus.setMusicContext("menu");
    bus.setMusicContext("menu");
    expect(fake.swaps).toBe(1);
  });

  it("mutes cleanly and rejoins at the current time on unmute", () => {
    const fake = fakeAdapter();
    const bus = makeBus(fake);
    bus.setMusicContext("hub");
    bus.setMuted(true);
    const muted = fake.notes.length;
    fake.setTime(5);
    bus.tick();
    expect(fake.notes.length).toBe(muted);

    bus.setMuted(false);
    fake.setTime(20);
    bus.tick();
    const resumed = fake.notes.slice(muted);
    expect(resumed.length).toBeGreaterThan(0);
    for (const note of resumed) {
      expect(note.time).toBeGreaterThanOrEqual(20);
    }
  });

  it("schedules nothing while the adapter is unavailable", () => {
    const fake = fakeAdapter(false);
    const bus = makeBus(fake);
    bus.setMusicContext("combat");
    bus.tick();
    expect(fake.notes).toEqual([]);
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
