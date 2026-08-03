import { describe, expect, it } from "vitest";
import { staticReading } from "../../inventory";
import { deriveCodex, deriveEpilogueCodex, deriveLoreCodex } from "../../state";
import { BLOODIED_SHARE } from "../../combat/injury";
import { endings as chapterEndings } from "../endings";
import { difficultyModifiers } from "../difficulty";
import { epilogueThreads, epilogueVignettes } from "../epilogues";
import { requireEncounter } from "../encounters";
import { LORE_SHARDS } from "../lore";
import {
  corpoRushTrace,
  netExplorerTrace,
  streetChromeTrace,
} from "./traceProfiles";
import { runTrace, type TraceResult } from "./traceSupport";

/**
 * Three whole playthroughs, played through the shipped engines and held
 * to something at every beat.
 *
 * These are integration tests, not content tests: the acts' own
 * walkthroughs already prove each road's gates open, and the economy
 * sweep proves each road can be afforded. What is pinned here is what
 * only shows up when a run is played *as one run* — a difficulty
 * carried from creation to epilogue, a side chain and a terminal and a
 * watched crossing in the same night, chrome loud enough to change a
 * conversation, and a save file opened three times in the middle of it
 * and played on afterwards.
 *
 * They are budgeted: each scans seeds until the fights fall right, the
 * same way every walkthrough in this codebase does, and the whole file
 * runs in a couple of seconds. If one ever starts costing real time,
 * the cause is a road that stopped being winnable rather than the
 * harness.
 */

/** Every ending marker a finished run passes, in order. */
function chapters(result: TraceResult): string[] {
  return result.endings;
}

/** Vignette ids the finished state composed, in section order. */
function vignettes(result: TraceResult): string[] {
  return result.epilogue.map((entry) => entry.id);
}

/** What each trace must be true of, whoever is playing it. */
function assertWholeRun(result: TraceResult): void {
  const { profile, state } = result;

  // It finished, and it finished where the profile said it would.
  expect(state.flags["game-complete"], profile.id).toBe(true);
  expect(state.flags["ending"], profile.id).toBe(profile.endingId);
  expect(chapters(result).at(-1), profile.id).toBe(profile.endingId);
  // Four ending markers: the intro's, and one per act.
  expect(chapters(result), profile.id).toHaveLength(4);

  // The preset it was created on is the preset it finished on, and it
  // never moved.
  expect(state.rules.difficulty, profile.id).toBe(profile.build.difficulty);
  expect(state.rules.difficultyChanged, profile.id).toBe(false);

  // Three save/load round trips, each of which the run continued from.
  expect(result.log.saves.map((save) => save.label), profile.id).toHaveLength(3);
  for (const save of result.log.saves) {
    expect(save.size, `${profile.id}/${save.label}`).toBeGreaterThan(0);
    expect(save.summary.characterName, `${profile.id}/${save.label}`).toBe(
      state.player.name,
    );
  }

  // The epilogue composes, says something, and every paragraph in it is
  // a thread the codex knows how to file.
  const subjects = new Set(epilogueThreads.map((thread) => thread.subject));
  expect(result.epilogue.length, profile.id).toBeGreaterThan(3);
  for (const vignette of result.epilogue) {
    expect(subjects, `${profile.id}/${vignette.id}`).toContain(
      vignette.subject,
    );
  }
  // One variant per subject, never two.
  const seen = result.epilogue.map((entry) => entry.subject);
  expect(new Set(seen).size, profile.id).toBe(seen.length);

  // And the codex the menus read afterwards has this run in it.
  expect(result.meta.completions, profile.id).toBe(1);
  expect(result.meta.ngPlusUnlocked, profile.id).toBe(true);
  expect(result.meta.endingsSeen, profile.id).toEqual([profile.endingId]);
  expect(result.meta.epiloguesSeen, profile.id).toEqual(vignettes(result));
  expect(result.meta.legacyItemIds.length, profile.id).toBeGreaterThan(0);
  expect(result.meta.legacyAppearance, profile.id).not.toBeNull();

  const codex = deriveCodex(chapterEndings, result.meta);
  const entry = codex.entries.find((row) => row.id === profile.endingId);
  expect(entry?.discovered, profile.id).toBe(true);
  expect(entry?.title, profile.id).not.toBeNull();
  expect(codex.found, profile.id).toBe(1);

  const epilogueCodex = deriveEpilogueCodex(
    epilogueThreads,
    epilogueVignettes,
    result.meta,
  );
  expect(epilogueCodex.found, profile.id).toBe(result.epilogue.length);
}

describe("three scripted playthroughs, end to end", () => {
  it("corpo mainline rush on Blackout: signed, promoted, and marked for it", () => {
    const result = runTrace(corpoRushTrace);
    assertWholeRun(result);

    expect(chapters(result)).toEqual([
      "job-done",
      "act1-voss",
      "act2-takeover",
      "ending-regency",
    ]);
    // The road, and nothing beside it: no district was entered, no
    // terminal read, no crossing walked.
    expect(result.log.breaches).toEqual([]);
    expect(result.log.crossings).toEqual([]);
    expect(result.state.flags["market-known"]).toBeUndefined();
    expect(result.state.flags["quays-known"]).toBeUndefined();
    expect(result.state.lore.collected).toEqual([]);

    // Blackout is where the injury system actually lives: the run came
    // out of a fight carrying something, and a clinic closed it.
    expect(result.injuries.length).toBeGreaterThan(0);
    expect(result.log.treatments.length).toBeGreaterThan(0);
    for (const treatment of result.log.treatments) {
      expect(treatment.fee).toBeGreaterThan(0);
    }
    // Which is the preset doing it: a body has to finish nearer to
    // nothing on Grind than it does here.
    const share = difficultyModifiers("blackout").injuryThresholdPct / 100;
    expect(result.lowestFightShare).toBeLessThanOrEqual(
      BLOODIED_SHARE * share,
    );

    // The finale's own payoffs still land under the harder preset.
    expect(result.state.flags["a3-standing"]).toBe("auric");
    expect(result.state.flags["combat:enc-crown-auric"]).toBe("victory");
    expect(vignettes(result)).toContain("voss-regent");
    expect(vignettes(result)).toContain("city-regency");
  });

  it("thorough netrunner on Grind: both chains, three terminals, one crossing", () => {
    const result = runTrace(netExplorerTrace);
    assertWholeRun(result);

    expect(chapters(result)).toEqual([
      "kept-it",
      "act1-broadcast",
      "act2-severance",
      "ending-ghost",
    ]);

    // Both side chains, played to a settlement and not merely opened.
    expect(result.state.flags["last-mile-exposed"]).toBe(true);
    expect(result.state.flags["last-mile-crew"]).toBe("fought");
    expect(result.state.flags["last-mile-lead"]).toBe("traced");
    expect(result.state.flags["under-waterline-broken"]).toBe(true);
    expect(result.state.flags["under-waterline-entry"]).toBe("slipped");
    // Neither settlement's opposite can also be true.
    expect(result.state.flags["last-mile-delivered"]).toBeUndefined();
    expect(result.state.flags["under-waterline-partner"]).toBeUndefined();

    // Three terminals, each routed to its core, each paid, each spent
    // exactly once.
    expect(result.log.breaches.map((run) => run.contextId)).toEqual([
      "market-register",
      "quays-lockgate",
      "vent-archive",
    ]);
    for (const run of result.log.breaches) {
      expect(run.status, run.contextId).toBe("breached");
      expect(run.hops, run.contextId).toBeGreaterThan(0);
      expect(run.credits, run.contextId).toBeGreaterThan(0);
      expect(result.state.flags[`breach:${run.contextId}`]).toBe("breached");
    }
    // The two district terminals are third keys to their own fixtures.
    expect(result.state.flags["market-locker"]).toBeDefined();
    expect(result.state.flags["quays-cage"]).toBeDefined();
    // The ventworks archive files a shard, and the shard reaches both
    // halves of the codex: the run's, and the ever-seen record.
    const shardId = result.log.breaches.find(
      (run) => run.contextId === "vent-archive",
    )?.shardId;
    expect(shardId).not.toBeNull();
    expect(result.state.lore.collected).toContain(shardId);
    expect(result.meta.shardsSeen).toContain(shardId);
    expect(
      deriveLoreCodex(LORE_SHARDS, result.state.lore, result.meta).discovered,
    ).toBeGreaterThan(0);

    // The one watched crossing in the game, walked rather than fought:
    // the zone records "passed", and the fight it is an alternative to
    // never happened.
    expect(result.log.crossings).toHaveLength(1);
    expect(result.log.crossings[0]?.zoneId).toBe("store-crossing");
    expect(result.log.crossings[0]?.status).toBe("passed");
    expect(result.state.flags["stealth:store-crossing"]).toBe("passed");
    expect(result.state.flags["combat:enc-quays-salvage"]).toBeUndefined();

    // And the finale is still the one with no fight anywhere in it.
    expect(result.state.flags["crown-route"]).toBe("commune");
    expect(vignettes(result)).toContain("hex-registrar");
  });

  it("chromed courier on Drift: screaming through the crown", () => {
    const result = runTrace(streetChromeTrace);
    assertWholeRun(result);

    expect(chapters(result)).toEqual([
      "job-done",
      "act1-court",
      "act2-severance",
      "ending-freehold",
    ]);

    // The whole point of the build: the top band, and it is the road's
    // own silt gills that take it there from loud.
    const reading = staticReading(result.state.player);
    expect(reading.band).toBe("screaming");
    expect(reading.def.effects.surge).toBe(true);
    expect(reading.def.effects.chromeAffinity).toBe(true);
    expect(result.state.player.equipment.enhancements).toMatchObject({
      eyes: "cyb-warden-optics",
      arms: "cyb-myomer-arms",
      dermal: "cyb-silt-gills",
    });
    // And the frame is full: what is left will not take the cheapest
    // implant the city sells, so nothing more is going in.
    expect(
      result.state.player.derived.neuralCapacity -
        result.state.player.neuralLoad,
    ).toBeLessThan(2);
    // Patch heard it from the door — the two beats in Act 1 that only
    // open for a visibly chromed runner were played, and applyChoice
    // would have thrown if the band had not been loud enough.
    expect(result.state.flags["knows-culvert"]).toBe(true);

    // And it carried that into a boss fight and won it.
    expect(requireEncounter("enc-crown-court").boss).toBe(true);
    expect(result.state.flags["combat:enc-crown-court"]).toBe("victory");
    expect(result.state.flags["crown-route"]).toBe("court");

    // Drift's half of the bargain, measured rather than asserted: the
    // kindest preset finishes every fight a long way above the line
    // that marks anybody, so nothing on this road ever limps.
    const share = difficultyModifiers("drift").injuryThresholdPct / 100;
    expect(result.lowestFightShare).toBeGreaterThan(BLOODIED_SHARE * share);
    expect(result.injuries).toEqual([]);
    expect(result.log.treatments).toEqual([]);

    expect(vignettes(result)).toContain("city-freehold");
  });
});
