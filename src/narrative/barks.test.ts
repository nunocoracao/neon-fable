import { describe, expect, it } from "vitest";
import { fixtureCharacter } from "../character/testSupport";
import type { Bark } from "../data/barks";
import {
  createNewGame,
  recruitCompanion,
  setActiveCompanion,
  type GameState,
} from "../state";
import {
  BARK_FADE_IN_MS,
  BARK_FADE_OUT_MS,
  BARK_LIFE_MS,
  CUE_PATIENCE_MS,
  GLOBAL_COOLDOWN_MS,
  MAX_LIVE_BARKS,
  NPC_BARK_RANGE,
  NPC_LINGER_MS,
  PEDESTRIAN_BARK_RANGE,
  REPEAT_COOLDOWN_MS,
  SPEAKER_COOLDOWN_MS,
  WOUNDED_BARK_RATIO,
  barkAlphaAt,
  canHear,
  createBarkSchedule,
  cueBark,
  eligibleBarks,
  expireBarks,
  isWounded,
  silenceBarks,
  stepBarks,
  type BarkSchedule,
  type BarkSpeaker,
  type BarkTick,
} from "./barks";

/**
 * The scheduler is the whole system's clock: everything visible is one
 * of its decisions, and every one of those decisions is made from
 * arguments. So these tests never touch a DOM, never read a wall clock,
 * and never let it roll a die it did not have to.
 */

function freshState(): GameState {
  return createNewGame({ character: fixtureCharacter({}), seed: 11 });
}

/** A three-line catalog: one per speaker kind, all `idle`. */
const CATALOG: readonly Bark[] = [
  {
    id: "t-ped",
    speaker: "pedestrian",
    trigger: "idle",
    text: "Two creds a bowl.",
  },
  {
    id: "t-npc",
    speaker: "npc",
    trigger: "idle",
    speakerId: "flick",
    text: "You're in my spot.",
  },
  {
    id: "t-cmp",
    speaker: "companion",
    trigger: "idle",
    speakerId: "vesper",
    text: "This place would strip in an afternoon.",
  },
];

/** A pool deep enough that the repeat cooldown is never the limit. */
const PEDESTRIAN_POOL: readonly Bark[] = Array.from({ length: 40 }, (_, i) => ({
  id: `t-ped-${i}`,
  speaker: "pedestrian" as const,
  trigger: "idle" as const,
  text: `line ${i}`,
}));

const PED: BarkSpeaker = {
  id: "ped-1",
  kind: "pedestrian",
  refId: null,
  zoneId: "market-row",
  distance: 3,
};
const NPC: BarkSpeaker = {
  id: "npc:flick",
  kind: "npc",
  refId: "flick",
  zoneId: null,
  distance: 1,
};
const CMP: BarkSpeaker = {
  id: "companion",
  kind: "companion",
  refId: "vesper",
  zoneId: null,
  distance: 1,
};

function tick(overrides: Partial<BarkTick> = {}): BarkTick {
  return {
    state: freshState(),
    context: { mapId: "cinder-plaza", weather: "clear", dayPhase: "dusk" },
    speakers: [PED],
    now: 0,
    lingerMs: 10_000,
    catalog: CATALOG,
    ...overrides,
  };
}

/** Runs ticks at a fixed cadence, returning every line that went up. */
function play(
  schedule: BarkSchedule,
  options: { steps: number; stepMs: number; tick: BarkTick },
): { schedule: BarkSchedule; said: string[] } {
  let current = schedule;
  const said: string[] = [];
  for (let i = 0; i < options.steps; i++) {
    const now = i * options.stepMs;
    const before = new Set(current.live.map((live) => live.barkId));
    current = stepBarks(current, { ...options.tick, now });
    for (const live of current.live) {
      if (!before.has(live.barkId)) said.push(`${live.speakerId}/${live.barkId}`);
    }
  }
  return { schedule: current, said };
}

describe("bark scheduler", () => {
  it("says nothing when nobody is standing there", () => {
    const next = stepBarks(createBarkSchedule("seed"), tick({ speakers: [] }));
    expect(next.live).toEqual([]);
    expect(next.lastAt).toBeNull();
  });

  it("puts one line up, with a life and a speaker", () => {
    const next = stepBarks(createBarkSchedule("seed"), tick());
    expect(next.live).toHaveLength(1);
    const live = next.live[0]!;
    expect(live.speakerId).toBe("ped-1");
    expect(live.barkId).toBe("t-ped");
    expect(live.text).toBe("Two creds a bowl.");
    expect(live.endsAt - live.startedAt).toBe(BARK_LIFE_MS);
    expect(next.lastAt).toBe(0);
  });

  it("replays identically from the same seed, and differs from another", () => {
    const speakers = [PED, NPC, CMP];
    const run = (seed: string): string[] =>
      play(createBarkSchedule(seed), {
        steps: 40,
        stepMs: 5000,
        tick: tick({ speakers }),
      }).said;

    expect(run("street-a")).toEqual(run("street-a"));
    // Not a guarantee of the module — a pin on the seed actually
    // reaching the draw, which a scheduler that ignored it would fail.
    expect(run("street-a")).not.toEqual(run("street-z"));
  });

  it("never lets one speaker hold two chips, or talk twice in a row", () => {
    const { schedule, said } = play(createBarkSchedule("seed"), {
      steps: 30,
      stepMs: GLOBAL_COOLDOWN_MS,
      tick: tick({ speakers: [PED] }),
    });
    expect(schedule.live.length).toBeLessThanOrEqual(1);
    // One speaker, one line per speaker cooldown: 30 ticks of
    // GLOBAL_COOLDOWN_MS is 78s of scene, so at most six lines.
    const window = 30 * GLOBAL_COOLDOWN_MS;
    expect(said.length).toBeLessThanOrEqual(
      Math.ceil(window / SPEAKER_COOLDOWN_MS),
    );
  });

  it("holds a speaker quiet for their cooldown, to the millisecond", () => {
    const deep = { catalog: PEDESTRIAN_POOL };
    const first = stepBarks(createBarkSchedule("seed"), tick(deep));
    const early = stepBarks(first, tick({ ...deep, now: SPEAKER_COOLDOWN_MS - 1 }));
    expect(early.live).toHaveLength(0);
    const due = stepBarks(early, tick({ ...deep, now: SPEAKER_COOLDOWN_MS }));
    expect(due.live).toHaveLength(1);
  });

  it("keeps a floor between any two lines, whoever says them", () => {
    const crowd = [
      PED,
      { ...PED, id: "ped-2" },
      { ...PED, id: "ped-3" },
      { ...PED, id: "ped-4" },
    ];
    const busy = { speakers: crowd, catalog: PEDESTRIAN_POOL };
    const first = stepBarks(createBarkSchedule("seed"), tick(busy));
    const early = stepBarks(
      first,
      tick({ ...busy, now: GLOBAL_COOLDOWN_MS - 1 }),
    );
    expect(early.live).toHaveLength(1);
    const due = stepBarks(early, tick({ ...busy, now: GLOBAL_COOLDOWN_MS }));
    expect(due.live).toHaveLength(2);
  });

  it("never shows more than the cap, however busy the street", () => {
    const crowd = Array.from({ length: 12 }, (_, i) => ({
      ...PED,
      id: `ped-${i}`,
    }));
    const { schedule } = play(createBarkSchedule("seed"), {
      steps: 60,
      stepMs: GLOBAL_COOLDOWN_MS,
      // A pool big enough that the repeat cooldown never runs it dry.
      tick: tick({ speakers: crowd, catalog: PEDESTRIAN_POOL }),
    });
    expect(schedule.live.length).toBeLessThanOrEqual(MAX_LIVE_BARKS);
  });

  it("does not repeat a line while it is still in earshot memory", () => {
    const crowd = Array.from({ length: 8 }, (_, i) => ({ ...PED, id: `ped-${i}` }));
    const { said } = play(createBarkSchedule("seed"), {
      steps: 20,
      stepMs: GLOBAL_COOLDOWN_MS,
      tick: tick({ speakers: crowd }),
    });
    // One line in the pool, so after the first it is on repeat cooldown
    // and 20 ticks (52s < REPEAT_COOLDOWN_MS) can produce no second —
    // eight people, and only one of them gets to say it.
    expect(REPEAT_COOLDOWN_MS).toBeGreaterThan(20 * GLOBAL_COOLDOWN_MS);
    expect(said).toHaveLength(1);
    expect(said[0]).toMatch(/\/t-ped$/);
  });

  it("expires a chip the millisecond its life is over", () => {
    const spoken = stepBarks(createBarkSchedule("seed"), tick());
    expect(expireBarks(spoken, BARK_LIFE_MS - 1).live).toHaveLength(1);
    expect(expireBarks(spoken, BARK_LIFE_MS).live).toHaveLength(0);
    // Nothing to retire is the same schedule, not a copy of it.
    expect(expireBarks(spoken, 0)).toBe(spoken);
  });
});

describe("bark eligibility", () => {
  it("matches the district, the zone, the sky, and the hour", () => {
    const gated: Bark = {
      id: "t-gated",
      speaker: "pedestrian",
      trigger: "idle",
      text: "Water's up two steps.",
      mapIds: ["greywater-steps"],
      zoneIds: ["walk"],
      weather: "rain",
      dayPhase: "night",
    };
    const base = tick({ catalog: [gated] });
    const speaker = { ...PED, zoneId: "walk" };
    const open: BarkTick = {
      ...base,
      speakers: [speaker],
      context: { mapId: "greywater-steps", weather: "rain", dayPhase: "night" },
    };
    const schedule = createBarkSchedule("seed");
    expect(eligibleBarks(schedule, open, "idle")).toHaveLength(1);

    const wrong: Array<Partial<BarkTick>> = [
      { context: { mapId: "cinder-plaza", weather: "rain", dayPhase: "night" } },
      { context: { mapId: "greywater-steps", weather: "clear", dayPhase: "night" } },
      { context: { mapId: "greywater-steps", weather: "rain", dayPhase: "dusk" } },
      { speakers: [{ ...speaker, zoneId: "street" }] },
    ];
    for (const override of wrong) {
      expect(eligibleBarks(schedule, { ...open, ...override }, "idle")).toEqual([]);
    }
  });

  it("reads the story gate the rest of the game reads", () => {
    const gated: Bark = {
      id: "t-flagged",
      speaker: "pedestrian",
      trigger: "idle",
      text: "Cordon's down. Walk while it's down.",
      requirements: [{ type: "flag-set", key: "cordon-broken" }],
    };
    const schedule = createBarkSchedule("seed");
    const closed = tick({ catalog: [gated] });
    expect(eligibleBarks(schedule, closed, "idle")).toEqual([]);

    const state = freshState();
    const open = tick({
      catalog: [gated],
      state: { ...state, flags: { ...state.flags, "cordon-broken": true } },
    });
    expect(eligibleBarks(schedule, open, "idle")).toHaveLength(1);
  });

  it("keeps a named person's lines to that person", () => {
    const schedule = createBarkSchedule("seed");
    const speakers = [NPC, { ...NPC, id: "npc:crown-watcher", refId: "crown-watcher" }];
    const candidates = eligibleBarks(schedule, tick({ speakers }), "idle");
    expect(candidates.map((c) => c.speaker.id)).toEqual(["npc:flick"]);
  });

  it("answers a companion's line to whoever is actually walking with you", () => {
    const base = freshState();
    const state: GameState = {
      ...base,
      party: setActiveCompanion(recruitCompanion(base.party, "sill"), "sill"),
    };
    const schedule = createBarkSchedule("seed");
    const withSill = tick({ speakers: [{ ...CMP, refId: "sill" }], state });
    // The catalog's only companion line is Kade's; Sill has nothing to
    // say here and says nothing rather than borrowing hers.
    expect(eligibleBarks(schedule, withSill, "idle")).toEqual([]);
    expect(eligibleBarks(schedule, tick({ speakers: [CMP] }), "idle")).toHaveLength(1);
  });

  it("hears a passer-by across the street and a person only up close", () => {
    expect(canHear({ ...PED, distance: PEDESTRIAN_BARK_RANGE }, 10_000)).toBe(true);
    expect(canHear({ ...PED, distance: PEDESTRIAN_BARK_RANGE + 1 }, 10_000)).toBe(
      false,
    );
    expect(canHear({ ...NPC, distance: NPC_BARK_RANGE }, 10_000)).toBe(true);
    expect(canHear({ ...NPC, distance: NPC_BARK_RANGE + 1 }, 10_000)).toBe(false);
    // The companion is beside you whatever the tile grid says.
    expect(canHear({ ...CMP, distance: 40 }, 0)).toBe(true);
  });

  it("waits for the player to stop before a named person speaks", () => {
    const schedule = createBarkSchedule("seed");
    const walking = tick({ speakers: [NPC], lingerMs: NPC_LINGER_MS - 1 });
    expect(eligibleBarks(schedule, walking, "idle")).toEqual([]);
    const stopped = tick({ speakers: [NPC], lingerMs: NPC_LINGER_MS });
    expect(eligibleBarks(schedule, stopped, "idle")).toHaveLength(1);
  });
});

describe("bark cues", () => {
  const ARRIVAL: readonly Bark[] = [
    {
      id: "t-arrive",
      speaker: "companion",
      trigger: "arrive",
      speakerId: "vesper",
      text: "Home water. Don't drink it.",
    },
    ...CATALOG,
  ];

  it("answers a cue with the event's own line, ahead of the idle pool", () => {
    const cued = cueBark(createBarkSchedule("seed"), "arrive");
    const next = stepBarks(cued, tick({ speakers: [CMP, PED], catalog: ARRIVAL }));
    expect(next.live.map((live) => live.barkId)).toEqual(["t-arrive"]);
    // Answered, so it is off the queue and never said twice.
    expect(next.cues).toEqual([]);
  });

  it("queues one of each kind, however many times it is cued", () => {
    let schedule = createBarkSchedule("seed");
    for (let i = 0; i < 5; i++) schedule = cueBark(schedule, "arrive");
    expect(schedule.cues).toHaveLength(1);
    schedule = cueBark(schedule, "weather");
    expect(schedule.cues.map((cue) => cue.trigger)).toEqual(["arrive", "weather"]);
  });

  it("lets a cue nobody can answer lapse, without muting the street", () => {
    // Walking alone: nobody present has an `arrive` line at all.
    const cued = cueBark(createBarkSchedule("seed"), "arrive");
    const alone = tick({ speakers: [PED], catalog: ARRIVAL });
    const first = stepBarks(cued, alone);
    // The ambient pool was still offered in the same tick.
    expect(first.live.map((live) => live.barkId)).toEqual(["t-ped"]);
    expect(first.cues).toHaveLength(1);

    const lapsed = expireBarks(first, CUE_PATIENCE_MS);
    expect(lapsed.cues).toEqual([]);
  });

  it("stamps a cue against the first tick that sees it", () => {
    const cued = cueBark(createBarkSchedule("seed"), "weather");
    expect(cued.cues[0]?.cuedAt).toBeNull();
    const seen = expireBarks(cued, 5_000);
    expect(seen.cues[0]?.cuedAt).toBe(5_000);
    // Patience runs from when it was seen, not from zero.
    expect(expireBarks(seen, 5_000 + CUE_PATIENCE_MS - 1).cues).toHaveLength(1);
    expect(expireBarks(seen, 5_000 + CUE_PATIENCE_MS).cues).toEqual([]);
  });
});

describe("bark presentation", () => {
  it("fades in, holds, and fades out over the chip's life", () => {
    expect(barkAlphaAt(-1)).toBeNull();
    expect(barkAlphaAt(BARK_LIFE_MS)).toBeNull();
    expect(barkAlphaAt(0)).toBe(0);
    expect(barkAlphaAt(BARK_FADE_IN_MS)).toBe(1);
    expect(barkAlphaAt(BARK_LIFE_MS / 2)).toBe(1);
    expect(barkAlphaAt(BARK_LIFE_MS - BARK_FADE_OUT_MS)).toBe(1);
    const late = barkAlphaAt(BARK_LIFE_MS - BARK_FADE_OUT_MS / 2);
    expect(late).toBeGreaterThan(0);
    expect(late).toBeLessThan(1);
  });

  it("reduced motion keeps the words and drops the fade", () => {
    for (const elapsed of [0, BARK_LIFE_MS / 2, BARK_LIFE_MS - 1]) {
      expect(barkAlphaAt(elapsed, true)).toBe(1);
    }
    expect(barkAlphaAt(BARK_LIFE_MS, true)).toBeNull();
  });

  it("silencing takes every chip down and keeps every cooldown", () => {
    const spoken = stepBarks(createBarkSchedule("seed"), tick());
    const silent = silenceBarks(cueBark(spoken, "arrive"));
    expect(silent.live).toEqual([]);
    expect(silent.cues).toEqual([]);
    expect(silent.lastBySpeaker).toEqual(spoken.lastBySpeaker);
    expect(silent.lastAt).toBe(spoken.lastAt);
    expect(silenceBarks(silent)).toBe(silent);
  });

  it("knows when the player is hurt enough to be worth mentioning", () => {
    const state = freshState();
    const { maxHp } = state.player.derived;
    const at = (hp: number): GameState => ({
      ...state,
      player: { ...state.player, hp },
    });
    expect(isWounded(at(maxHp))).toBe(false);
    expect(isWounded(at(Math.floor(maxHp * WOUNDED_BARK_RATIO)))).toBe(true);
    expect(isWounded(at(maxHp - 1))).toBe(false);
    // Nobody remarks on a corpse; that beat belongs to the fight.
    expect(isWounded(at(0))).toBe(false);
  });
});
