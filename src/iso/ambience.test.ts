import { describe, expect, it } from "vitest";
import {
  QUIET_AMBIENCE,
  RAIN_BED_PERIOD_MS,
  RAIN_SPLASH_PERIOD_MS,
  ambienceCues,
  type AmbienceSample,
} from "./ambience";
import { isSoundEvent } from "../audio";

function sample(over: Partial<AmbienceSample> = {}): AmbienceSample {
  return { ...QUIET_AMBIENCE, ...over };
}

describe("world ambience", () => {
  it("says nothing on the first frame of a map", () => {
    // Arriving mid-downpour with a train overhead should not open with
    // every set piece announcing itself at once.
    const busy = sample({
      timeMs: 5000,
      train: true,
      drone: true,
      steam: true,
      rain: true,
      headline: "MARKET SEALED",
    });
    expect(ambienceCues(null, busy)).toEqual([]);
  });

  it("says nothing while nothing changes", () => {
    const quiet = sample({ timeMs: 10 });
    expect(ambienceCues(sample(), quiet)).toEqual([]);
  });

  it("announces each set piece on the frame it arrives, once", () => {
    const before = sample();
    const after = sample({ timeMs: 16, train: true, drone: true, steam: true });
    expect(ambienceCues(before, after)).toEqual([
      "world.train.pass",
      "world.drone.pass",
      "world.steam.burst",
    ]);
    // Still there next frame is not news.
    expect(ambienceCues(after, sample({ ...after, timeMs: 32 }))).toEqual([]);
  });

  it("says nothing when a set piece leaves", () => {
    const before = sample({ train: true, drone: true, steam: true });
    expect(ambienceCues(before, sample({ timeMs: 16 }))).toEqual([]);
  });

  it("opens a shower at once and then keeps the bed up", () => {
    const dry = sample();
    const first = sample({ timeMs: 16, rain: true });
    expect(ambienceCues(dry, first)).toContain("world.rain.bed");
    // Inside the period, nothing more.
    const soon = sample({ timeMs: 32, rain: true });
    expect(ambienceCues(first, soon)).toEqual([]);
    // Across the period boundary, the bed is retriggered.
    const later = sample({ timeMs: RAIN_BED_PERIOD_MS + 1, rain: true });
    expect(ambienceCues(soon, later)).toContain("world.rain.bed");
  });

  it("ticks splashes on their own, slower period", () => {
    const from = sample({ timeMs: RAIN_SPLASH_PERIOD_MS - 10, rain: true });
    const to = sample({ timeMs: RAIN_SPLASH_PERIOD_MS + 10, rain: true });
    expect(ambienceCues(from, to)).toContain("world.rain.splash");
    expect(RAIN_SPLASH_PERIOD_MS).toBeGreaterThan(RAIN_BED_PERIOD_MS);
  });

  it("marks the sky turning over when the rain stops", () => {
    const wet = sample({ timeMs: 100, rain: true });
    expect(ambienceCues(wet, sample({ timeMs: 116 }))).toEqual([
      "ambient.weather.turn",
    ]);
  });

  it("blips once for a board turning over, whatever it turns to", () => {
    const first = sample({ timeMs: 10, headline: "QUAYS CLOSED" });
    expect(ambienceCues(sample(), first)).toEqual(["ambient.news.blip"]);
    expect(ambienceCues(first, sample({ ...first, timeMs: 20 }))).toEqual([]);
    const second = sample({ timeMs: 30, headline: "QUAYS OPEN" });
    expect(ambienceCues(first, second)).toEqual(["ambient.news.blip"]);
    // A map with no boards has nothing to say and does not say it.
    expect(ambienceCues(second, sample({ timeMs: 40 }))).toEqual([]);
  });

  it("holds still while the clock does", () => {
    // Reduced motion freezes the ambient clock at zero; a frozen clock
    // must not tick the rain forever.
    const frozen = sample({ rain: true });
    expect(ambienceCues(frozen, frozen)).toEqual([]);
  });

  it("only ever names registered events", () => {
    const before = sample();
    const after = sample({
      timeMs: RAIN_SPLASH_PERIOD_MS + RAIN_BED_PERIOD_MS,
      train: true,
      drone: true,
      steam: true,
      rain: true,
      headline: "LINE DOWN",
    });
    const cues = [
      ...ambienceCues(before, after),
      ...ambienceCues(after, sample({ timeMs: after.timeMs + 16 })),
    ];
    expect(cues.length).toBeGreaterThan(0);
    for (const cue of cues) expect(isSoundEvent(cue), cue).toBe(true);
  });
});
