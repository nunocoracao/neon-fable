import { baseStats } from "../../character";
import type { Stats } from "../../character/stats";
import { fixtureCharacter } from "../../character/testSupport";
import { addItem, installEnhancement, type Loadout } from "../../inventory";
import {
  breachOutcome,
  openBreach,
  settleBreach,
  stepBreach,
  type BreachOutcome,
} from "../../minigames";
import { solveRoute } from "../../minigames/testSupport";
import { composeEpilogue, type EpilogueVignette } from "../../narrative";
import {
  activeStealthZone,
  recordPassed,
  recordSpotted,
  startStealth,
  stepStealth,
  toggleCrouch,
  type StealthStatus,
} from "../../stealth";
import { sneakRoute } from "../../stealth/testSupport";
import { createNewGame, type GameState } from "../../state";
import {
  carriedInjury,
  treatInjury,
  treatmentFee,
  type InjuryTarget,
} from "../../state/injuries";
import { collectedShards } from "../../state/lore";
import {
  carryoverAppearance,
  carryoverCandidates,
} from "../../state/ngplus";
import {
  emptyMetaProgress,
  loadMetaProgress,
  recordCompletionToStorage,
  recordShardToStorage,
  type MetaProgress,
} from "../../state/meta";
import { clampRules, type RunRules } from "../../state/rules";
import {
  createMemoryStorage,
  loadGame,
  saveGame,
  summarizeRun,
  type RunSummary,
  type SaveSlot,
} from "../../state/save";
import { validateGameState } from "../../state/validate";
import { noAssists, type AssistId } from "../assists";
import { requireBreachContext } from "../breach";
import type { DifficultyId } from "../difficulty";
import { epilogueThreads, epilogueVignettes } from "../epilogues";
import { dressMap } from "../mapDressing";
import { requireMap } from "../maps";
import { requireStealthZone } from "../stealth";
import {
  findRouteSeed,
  type RouteBeat,
  type RouteResult,
  type RouteStep,
} from "./walkthroughSupport";

/**
 * The playthrough traces: whole runs, played through the shipped
 * engines, held to something at every beat.
 *
 * ## What this is for, and what it is not
 *
 * The per-act walkthroughs (act1/act2/act3.walkthrough.test.ts) prove
 * that the story's gates open for the histories that earned them. The
 * economy sweep proves a road can be afforded. Neither of them plays a
 * *whole game the way one profile of player plays it* — a difficulty
 * preset carried from creation to epilogue, districts explored or
 * skipped, terminals dived, crossings walked, chrome stacked until it
 * screams — and neither of them ever puts the run through a save file
 * halfway down and carries on from what came back.
 *
 * That is this module. It is integration armour: the bugs it exists to
 * catch are the ones that only appear where two finished systems meet,
 * which is exactly the class no unit test owns.
 *
 * ## The three things every trace checks
 *
 *  - **Validity at every beat.** `runTrace` validates the state after
 *    every choice, every fight, and every between-scene step (see
 *    RouteBeat). A field that goes missing halfway down a run fails on
 *    the beat that lost it, not three scenes later.
 *  - **Save/load, mid-run, for real.** A checkpoint writes the run to a
 *    slot, reads it back, insists the two are the same state — and then
 *    *continues the trace from the loaded copy*. Everything after a
 *    checkpoint is therefore being played on a save file, which is the
 *    only way to prove a load is complete rather than merely parseable.
 *  - **The end state.** The ending the profile aimed at, the epilogue
 *    that composes for the history it actually built, and the
 *    meta-progress the codex reads afterwards — recorded through the
 *    same calls the game screen makes when a run finishes.
 *
 * ## Nothing here is a fixture
 *
 * The breach steps generate the terminal's real lattice and route it
 * with the solver; the stealth steps time a real crossing against the
 * real patrols and record what the watch did; the shopping goes across
 * the shipped counter. A trace that passes is a claim about the game,
 * not about a mock of it.
 *
 * No vitest imports, so it type-checks as ordinary source — the same
 * rule ./walkthroughSupport.ts and src/combat/testSupport.ts follow.
 */

/** Something a trace found. Never a failed fight — that is a retry. */
export class TraceError extends Error {}

/* ------------------------------------------------------------------ *
 * The run under trace
 * ------------------------------------------------------------------ */

/** A build, as a trace describes one: background, points, and rules. */
export interface TraceBuild {
  backgroundId: string;
  /** Points spent on top of the point-buy base. */
  allocate(stats: Stats): void;
  difficulty: DifficultyId;
  /** Assists switched on for the run; none unless listed. */
  assists?: readonly AssistId[];
}

export function traceRules(build: TraceBuild): RunRules {
  const assists = noAssists();
  for (const id of build.assists ?? []) assists[id] = true;
  return clampRules({
    difficulty: build.difficulty,
    assists,
    difficultyChanged: false,
  });
}

/** A fresh run on this build, seeded — what createNewGame is handed. */
export function traceState(build: TraceBuild, seed: number): GameState {
  const allocation = baseStats();
  build.allocate(allocation);
  return createNewGame({
    character: fixtureCharacter({
      backgroundId: build.backgroundId,
      allocation,
    }),
    seed,
    rules: traceRules(build),
  });
}

/* ------------------------------------------------------------------ *
 * The ledger a trace keeps
 * ------------------------------------------------------------------ */

/** One mid-run save/load round trip, and what the slot said about it. */
export interface SaveRoundTrip {
  label: string;
  slot: SaveSlot;
  /** Characters the written envelope took. */
  size: number;
  /** The summary the save menus derive from the reloaded run. */
  summary: RunSummary;
}

/** One terminal, dived. */
export interface BreachRecord {
  contextId: string;
  status: BreachOutcome["status"];
  /** Hops the solver played, entry excluded. */
  hops: number;
  /** Credits the settlement paid, after the preset's scaling. */
  credits: number;
  /** Shard filed to the run's codex, or null. */
  shardId: string | null;
}

/** One watched crossing, walked. */
export interface CrossingRecord {
  zoneId: string;
  status: StealthStatus;
  /** Tiles the route stepped through, start included. */
  steps: number;
}

/** One wound closed at a counter, and what it cost. */
export interface TreatmentRecord {
  /** "player", or the companion's content id. */
  who: string;
  injuryId: string;
  fee: number;
}

/**
 * What a trace wrote down as it played. Shared by reference with the
 * script's steps, and cleared at the top of every attempt — a seed that
 * loses a fight is abandoned, and its ledger goes with it.
 */
export interface TraceLog {
  saves: SaveRoundTrip[];
  breaches: BreachRecord[];
  crossings: CrossingRecord[];
  treatments: TreatmentRecord[];
}

export function emptyTraceLog(): TraceLog {
  return { saves: [], breaches: [], crossings: [], treatments: [] };
}

function clearLog(log: TraceLog): void {
  log.saves.length = 0;
  log.breaches.length = 0;
  log.crossings.length = 0;
  log.treatments.length = 0;
}

/* ------------------------------------------------------------------ *
 * Steps
 * ------------------------------------------------------------------ */

/**
 * A stable rendering of a state, for comparing two of them.
 *
 * Keys are sorted at every level because a loaded state is rebuilt
 * field by field (clamps, migrations, defaults) and there is no reason
 * for it to come back in the order it went out — a run that survives
 * the round trip should not fail on property order.
 */
function canonical(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (typeof value !== "object" || value === null) return value;
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) out[key] = sortDeep(record[key]);
  return out;
}

/**
 * Writes the run to a slot, reads it back, and carries on from what
 * came back.
 *
 * The last part is the point. A round trip that compares two states and
 * then throws the loaded one away proves the writer and the reader
 * agree; continuing from the loaded copy proves the rest of the game
 * can be played on it — every gate after this checkpoint is now being
 * asked of a state that has been through JSON, the envelope, the
 * checksum, validation and the clamps.
 */
export function saveLoadStep(
  label: string,
  log: TraceLog,
  slot: SaveSlot = "slot1",
): RouteStep {
  return {
    kind: "do",
    label: `save/load ${label}`,
    run(state) {
      const storage = createMemoryStorage();
      saveGame(state, slot, storage, 1_700_000_000_000, { label });
      const raw = storage.getItem(`neon-fable:save:${slot}`);
      const loaded = loadGame(slot, storage);
      const before = canonical(state);
      const after = canonical(loaded);
      if (before !== after) {
        throw new TraceError(
          `save/load "${label}" did not round-trip: ` +
            `${firstDivergence(before, after)}`,
        );
      }
      const issues = validateGameState(loaded);
      if (!issues.ok) {
        throw new TraceError(
          `save/load "${label}" produced an invalid state: ` +
            issues.issues.map((i) => `${i.path} (${i.message})`).join("; "),
        );
      }
      log.saves.push({
        label,
        slot,
        size: raw?.length ?? 0,
        summary: summarizeRun(loaded),
      });
      return loaded;
    },
  };
}

/** Where two renderings first differ, with a little either side. */
function firstDivergence(before: string, after: string): string {
  let at = 0;
  while (at < before.length && at < after.length && before[at] === after[at]) {
    at += 1;
  }
  const from = Math.max(0, at - 40);
  return `at ${at}: saved …${before.slice(from, at + 40)}… ` +
    `loaded …${after.slice(from, at + 40)}…`;
}

/**
 * Dives one terminal: generates the lattice this run's seed puts on it,
 * routes it with the solver, and settles the outcome through the
 * shipped fold-back. A terminal already spent this run is a no-op, the
 * same as walking back up to one in the game.
 */
export function breachStep(contextId: string, log: TraceLog): RouteStep {
  return {
    kind: "do",
    label: `breach ${contextId}`,
    run(state) {
      const context = requireBreachContext(contextId);
      let game = openBreach(state, context);
      const route = solveRoute(game.lattice);
      if (route.length === 0) {
        throw new TraceError(`breach "${contextId}" has no route to its core`);
      }
      for (const id of route) game = stepBreach(game, id);
      const outcome = breachOutcome(game);
      const settled = settleBreach(state, context, outcome);
      log.breaches.push({
        contextId,
        status: outcome.status,
        hops: route.length,
        credits: settled.award.credits,
        shardId: settled.filedShardId,
      });
      return settled.state;
    },
  };
}

/**
 * Walks a watched crossing: finds a timing that nobody sees, steps it
 * tick by tick against the real patrols, and records what the watch
 * did on the run's flags.
 *
 * Crouched throughout and one tile per tick, which is the conservative
 * reading of a player's own pace (see sneakRoute) — anything this
 * crosses, a player can cross slower.
 */
export function crossingStep(zoneId: string, log: TraceLog): RouteStep {
  return {
    kind: "do",
    label: `cross ${zoneId}`,
    run(state) {
      const zone = requireStealthZone(zoneId);
      // The shell only posts a watch the run has actually earned, so a
      // trace that walked into one the game would not have shown is
      // measuring a crossing nobody could reach.
      if (activeStealthZone(state, zone.mapId)?.id !== zoneId) {
        throw new TraceError(
          `zone "${zoneId}" is not posted on ${zone.mapId} for this run`,
        );
      }
      const map = requireMap(zone.mapId);
      const spawn = map.spawns.find((entry) => entry.id === "player-start");
      if (!spawn) throw new TraceError(`map "${map.id}" has no player start`);
      const path = sneakRoute(
        map,
        zone,
        { x: spawn.x, y: spawn.y },
        state.flags,
      );
      if (!path) {
        throw new TraceError(`no unseen crossing of "${zoneId}" exists`);
      }
      let run = toggleCrouch(startStealth(zone));
      let flags = state.flags;
      for (let tick = 0; tick < path.length; tick++) {
        const result = stepStealth(map, zone, run, {
          tick,
          playerTile: path[tick]!,
          flags,
        });
        run = result.run;
        if (result.event?.kind === "spotted") {
          flags = recordSpotted(flags, zone);
          break;
        }
        if (result.event?.kind === "passed") {
          flags = recordPassed(flags, zone);
          break;
        }
      }
      if (run.status !== "passed") {
        throw new TraceError(
          `crossing "${zoneId}" ended ${run.status} on a route nobody sees`,
        );
      }
      log.crossings.push({ zoneId, status: run.status, steps: path.length });
      return { ...state, flags };
    },
  };
}

/**
 * Insists that the map is showing what the run has earned: the fixture
 * named here re-points at `nodeId` once the state says it should.
 *
 * The join between a system and the world it changed — a breach writes
 * a flag, and the flag is only worth anything if the thing on the map
 * has actually become a door. Nothing is consumed and nothing moves;
 * the step is a claim about the state it is handed.
 */
export function dressedStep(
  mapId: string,
  interactableId: string,
  nodeId: string,
): RouteStep {
  return {
    kind: "do",
    label: `${interactableId} opens ${nodeId}`,
    run(state) {
      const dressed = dressMap(requireMap(mapId), state.flags);
      const thing = dressed.interactables.find(
        (entry) => entry.id === interactableId,
      );
      if (!thing) {
        throw new TraceError(`no "${interactableId}" on map "${mapId}"`);
      }
      const opens =
        thing.interaction.kind === "dialogue" ? thing.interaction.nodeId : null;
      if (opens !== nodeId) {
        throw new TraceError(
          `"${interactableId}" opens ${opens ?? thing.interaction.kind}, ` +
            `not "${nodeId}"`,
        );
      }
      return state;
    },
  };
}

/**
 * Puts hardware in the bag and installs what the frame will carry.
 *
 * Granted rather than bought, deliberately: whether a road can *afford*
 * a stack of chrome is the economy sweep's question (src/economy/sim),
 * and answering it here would make the trace measure the shelf instead
 * of the systems the chrome switches on. What this models is the
 * player who arrived with it — a New Game+ carry-over, or a run that
 * spent three chapters shopping for nothing else.
 *
 * Best-effort per implant: a slot already filled or a frame with no
 * capacity left skips that one, so the Static band a trace reaches is
 * a result it reports rather than a promise this step makes.
 */
export function chromeStep(itemIds: readonly string[]): RouteStep {
  return {
    kind: "do",
    label: `fit ${itemIds.length} implants`,
    run(state) {
      let player = state.player;
      let inventory = state.inventory;
      for (const itemId of itemIds) {
        const held = addItem(inventory, itemId);
        let loadout: Loadout;
        try {
          loadout = installEnhancement(player, held, itemId);
        } catch {
          continue;
        }
        player = loadout.character;
        inventory = loadout.inventory;
      }
      return { ...state, player, inventory };
    },
  };
}

/**
 * Walks into a clinic: closes whatever the player is carrying, and
 * whatever the crew is carrying, when the run can pay for it.
 *
 * Goes through `treatInjury`, which is a no-op when there is nothing to
 * treat or nothing to pay with — so a trace can put one of these at
 * every chapter break without first asking whether the last chapter
 * hurt anybody.
 */
export function clinicStep(log: TraceLog): RouteStep {
  return {
    kind: "do",
    label: "clinic",
    run(state) {
      let next = state;
      const targets: InjuryTarget[] = [
        {},
        ...next.party.members.map((member) => ({
          companionId: member.companionId,
        })),
      ];
      for (const target of targets) {
        const carried = carriedInjury(next, target);
        if (!carried) continue;
        const fee = treatmentFee(next, target);
        const treated = treatInjury(next, target);
        if (treated === next) continue;
        log.treatments.push({
          who: target.companionId ?? "player",
          injuryId: carried.id,
          fee,
        });
        next = treated;
      }
      return next;
    },
  };
}

/**
 * Splices steps in after the segment that plays `choiceId`.
 *
 * A seam named by what just happened rather than by an index into
 * somebody else's array: "after the act that ends on `sign`" survives a
 * route gaining a scene, where `steps[2]` does not. Throws when no
 * segment plays it, because a checkpoint that quietly failed to be
 * placed is a checkpoint nobody notices is missing.
 */
export function afterSegmentWith(
  steps: readonly RouteStep[],
  choiceId: string,
  ...insert: RouteStep[]
): RouteStep[] {
  const at = steps.findIndex(
    (step) => step.kind === "arc" && step.choices.includes(choiceId),
  );
  if (at < 0) {
    throw new TraceError(`no route segment plays the choice "${choiceId}"`);
  }
  return [...steps.slice(0, at + 1), ...insert, ...steps.slice(at + 1)];
}

/* ------------------------------------------------------------------ *
 * The trace itself
 * ------------------------------------------------------------------ */

export interface TraceProfile {
  id: string;
  /** One line of who is playing this and how. */
  blurb: string;
  build: TraceBuild;
  /**
   * The script, given the ledger its checkpoints report into. A
   * function rather than a list because the save/load, breach and
   * crossing steps all need somewhere to write.
   */
  script(log: TraceLog): RouteStep[];
  /** The ending the run is aimed at. */
  endingId: string;
  /**
   * An extra condition on the night, beyond every fight being won.
   *
   * Only ever narrows the seed scan — everything the trace asserts
   * still has to hold on whichever seed is accepted — so this cannot
   * make a broken road pass. What it can do is ask for a run that also
   * *did* something the profile is about, like coming out of the
   * chapter carrying a wound.
   */
  accept?(result: RouteResult, beats: readonly RouteBeat[]): boolean;
}

export interface TraceResult {
  profile: TraceProfile;
  state: GameState;
  /** Every ending marker the run passed, chapter ends included. */
  endings: string[];
  /** Choices, fights and steps the run played. */
  beats: number;
  log: TraceLog;
  /** The epilogue composed for the finished state. */
  epilogue: EpilogueVignette[];
  /** Meta-progress after the run was recorded, read back off storage. */
  meta: MetaProgress;
  /**
   * Injury ids anybody on the player's side carried at any point, in
   * discovery order. Empty is a finding rather than a pass: a preset
   * that never marks anybody is one where the whole injury system is
   * dormant.
   */
  injuries: string[];
  /**
   * The least frame the player was left holding after any fight, as a
   * share of their maximum. What the bloodied line (BLOODIED_SHARE,
   * scaled by the preset) is actually being compared against.
   */
  lowestFightShare: number;
}

/** Every injury id anybody on the player's side carried, in order. */
export function injuriesCarried(beats: readonly RouteBeat[]): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  const note = (id: string | undefined): void => {
    if (id === undefined || seen.has(id)) return;
    seen.add(id);
    order.push(id);
  };
  for (const beat of beats) {
    note(beat.state.player.injury?.id);
    for (const member of beat.state.party.members) {
      note(member.injury?.id);
    }
  }
  return order;
}

/** The least frame the player finished any fight on, as a share. */
export function lowestFightShare(beats: readonly RouteBeat[]): number {
  let lowest = 1;
  for (const beat of beats) {
    if (beat.kind !== "combat") continue;
    const { hp, derived } = beat.state.player;
    if (derived.maxHp <= 0) continue;
    lowest = Math.min(lowest, hp / derived.maxHp);
  }
  return lowest;
}

/**
 * Plays a profile's whole run and reports what it produced.
 *
 * The seed is scanned exactly as the walkthroughs scan one: the first
 * whose fights all go the player's way. Everything else — a gate that
 * will not open, a save that does not come back, a crossing that cannot
 * be timed — throws, because those are bugs rather than bad nights, and
 * a seed scan that swallowed them would hide the failure by retrying
 * until it stopped happening.
 */
export function runTrace(profile: TraceProfile, maxSeed = 400): TraceResult {
  const log = emptyTraceLog();
  const steps: RouteStep[] = [
    {
      kind: "do",
      label: `${profile.id} begins`,
      run(state) {
        clearLog(log);
        return state;
      },
    },
    ...profile.script(log),
  ];

  const played: RouteBeat[] = [];
  const result = findRouteSeed(
    (seed) => traceState(profile.build, seed),
    steps,
    maxSeed,
    {
      accept: profile.accept,
      onBeat(beat) {
        played.push(beat);
        const issues = validateGameState(beat.state);
        if (issues.ok) return;
        throw new TraceError(
          `${profile.id}: state invalid after ${beat.kind} "${beat.detail}" ` +
            `(${beat.arcId}): ` +
            issues.issues.map((i) => `${i.path} — ${i.message}`).join("; "),
        );
      },
    },
  );

  const state = result.state;
  const epilogue = composeEpilogue(state, epilogueVignettes, epilogueThreads);

  // The codex, written the way the game screen writes it: shards as
  // they were picked up, then the completion when the epilogue is
  // first shown. Read back off storage so the trace exercises the
  // serialization rather than the in-memory record.
  const storage = createMemoryStorage();
  for (const shardId of collectedShards(state)) {
    recordShardToStorage(shardId, storage);
  }
  const endingId = state.flags["ending"];
  if (typeof endingId !== "string") {
    throw new TraceError(`${profile.id}: finished with no ending flag`);
  }
  recordCompletionToStorage(
    {
      endingId,
      epilogueIds: epilogue.map((vignette) => vignette.id),
      legacyItemIds: carryoverCandidates(state.player),
      legacyAppearance: carryoverAppearance(state.player),
    },
    storage,
  );

  return {
    profile,
    state,
    endings: result.endings,
    beats: played.length,
    log,
    epilogue,
    meta: loadMetaProgress(storage) ?? emptyMetaProgress(),
    injuries: injuriesCarried(played),
    lowestFightShare: lowestFightShare(played),
  };
}
