import { chapterGrants, credDeeds } from "../../data/advancement";
import { ACTS } from "../../data/acts";
import { backgrounds } from "../../data/backgrounds";
import { barks } from "../../data/barks";
import { BREACH_CONTEXTS, breachFlag } from "../../data/breach";
import { companions } from "../../data/companions";
import { encounters } from "../../data/encounters";
import { epilogueVignettes } from "../../data/epilogues";
import { hints } from "../../data/hints";
import { interludes } from "../../data/interludes";
import { items } from "../../data/items";
import { mapDressings } from "../../data/mapDressing";
import { LORE_SHARDS } from "../../data/lore";
import { FACTION_STANDINGS } from "../../data/standings";
import {
  alertFlag,
  stealthZoneFlag,
  stealthZones,
  takedownFlag,
} from "../../data/stealth";
import { RESTYLE_COUNT_FLAG, RESTYLE_FLAG } from "../../data/stylist";
import { storyArcs } from "../../data/story";
import { VENDOR_STOCK, WORLD_CONDITIONS } from "../../data/world";
import { combatResultFlag } from "../../combat/outcome";
import { NG_PLUS_CARRYOVER_FLAG, NG_PLUS_FLAG } from "../../state/ngplus";
import { hintFlagKey } from "../hints";
import { interludeSeenFlag } from "../interlude";
import type { Requirement } from "../types";
import { flagWrites, type FlagWrite } from "./refs";

/**
 * The corpus: every gated thing in the game, every flag anything
 * writes, and every flag anything reads — gathered from the content
 * itself rather than from a hand-kept list.
 *
 * That is the whole design constraint here. A hand-kept inventory of
 * "flags the engine touches" is a second place to forget something, and
 * a validator that silently stops covering a system is worse than no
 * validator at all. So the per-id engine keys are enumerated by walking
 * the same tables the systems walk: one flag per encounter because the
 * fight writes one, one per stealth guard because a hand over a mouth
 * writes one. Only the handful of keys owned by a screen rather than by
 * content are named by hand, in src/data/narrativeAudit.ts, where each
 * one has to carry its reason.
 */

/** Something with requirements on it, and enough address to report it. */
export interface GateSource {
  /** Content this came out of: "arc:act1", "bark:bark-quays-tide". */
  source: string;
  /** Where inside it: "node/choice", "strand/variant". */
  where?: string;
  requirements: readonly Requirement[];
}

/** Every gated thing in the game, story and otherwise. */
export function gateSources(): GateSource[] {
  const sources: GateSource[] = [];

  for (const arc of storyArcs) {
    for (const node of arc.nodes) {
      for (const comment of node.comments ?? []) {
        if (comment.requirements?.length) {
          sources.push({
            source: `arc:${arc.id}`,
            where: `${node.id}/comment:${comment.companionId}`,
            requirements: comment.requirements,
          });
        }
      }
      for (const choice of node.choices) {
        if (choice.requirements?.length) {
          sources.push({
            source: `arc:${arc.id}`,
            where: `${node.id}/${choice.id}`,
            requirements: choice.requirements,
          });
        }
      }
    }
  }

  for (const bark of barks) {
    if (bark.requirements?.length) {
      sources.push({ source: `bark:${bark.id}`, requirements: bark.requirements });
    }
  }

  for (const shard of LORE_SHARDS) {
    if (shard.requirements?.length) {
      sources.push({ source: `lore:${shard.id}`, requirements: shard.requirements });
    }
  }

  for (const interlude of interludes) {
    for (const strand of interlude.strands) {
      for (const variant of strand.variants) {
        if (variant.requires?.length) {
          sources.push({
            source: `interlude:${interlude.id}`,
            where: `${strand.id}/${variant.id}`,
            requirements: variant.requires,
          });
        }
      }
    }
  }

  for (const vignette of epilogueVignettes) {
    if (vignette.requires?.length) {
      sources.push({
        source: `epilogue:${vignette.subject}`,
        where: vignette.id,
        requirements: vignette.requires,
      });
    }
  }

  for (const condition of WORLD_CONDITIONS) {
    sources.push({
      source: `world:${condition.id}`,
      requirements: condition.requirements,
    });
  }

  for (const zone of stealthZones) {
    if (zone.requires?.length) {
      sources.push({ source: `stealth:${zone.id}`, requirements: zone.requires });
    }
  }

  return sources;
}

/** A flag write, and the beat that made it. */
export interface FlagWriteSite extends FlagWrite {
  source: string;
  where?: string;
}

/** Every flag the authored story writes, with the choice that writes it. */
export function contentFlagWrites(): FlagWriteSite[] {
  const sites: FlagWriteSite[] = [];
  for (const arc of storyArcs) {
    for (const node of arc.nodes) {
      for (const choice of node.choices) {
        for (const write of flagWrites(choice.effects)) {
          sites.push({
            ...write,
            source: `arc:${arc.id}`,
            where: `${node.id}/${choice.id}`,
          });
        }
      }
    }
  }
  return sites;
}

/**
 * Flags the systems own: written by an engine or a screen rather than
 * by a choice, and read back by the same system. Every one is derived
 * from the content it belongs to, so a new encounter or stealth guard
 * brings its own keys with it.
 *
 * Values matter as much as keys — a gate on `combat:enc-x` = "victory"
 * is satisfiable, one on "won" is a typo — so each key declares the
 * values its writer can actually produce.
 */
export function engineFlagWrites(): FlagWriteSite[] {
  const sites: FlagWriteSite[] = [];
  const push = (key: string, values: readonly FlagWrite["value"][], source: string) => {
    for (const value of values) sites.push({ key, value, source });
  };

  for (const encounter of encounters) {
    push(
      combatResultFlag(encounter.id),
      ["victory", "defeat", "fled"],
      "engine:combat",
    );
    push(alertFlag(encounter.id), [true], "engine:stealth");
  }
  for (const zone of stealthZones) {
    push(stealthZoneFlag(zone.id), ["passed", "spotted"], "engine:stealth");
    for (const guard of zone.guards) {
      push(takedownFlag(zone.id, guard.id), [true], "engine:stealth");
    }
  }
  for (const context of BREACH_CONTEXTS) {
    push(
      breachFlag(context.id),
      ["breached", "withdrawn", "locked-out"],
      "engine:breach",
    );
  }
  for (const hint of hints) {
    push(hintFlagKey(hint.id), [true], "engine:hints");
  }
  for (const interlude of interludes) {
    push(interludeSeenFlag(interlude.id), [true], "engine:interlude");
  }
  push(NG_PLUS_FLAG, [true], "engine:ng-plus");
  sites.push({ key: NG_PLUS_CARRYOVER_FLAG, source: "engine:ng-plus" });
  push(RESTYLE_FLAG, [true], "engine:stylist");
  sites.push({ key: RESTYLE_COUNT_FLAG, increment: 1, source: "engine:stylist" });

  return sites;
}

/** A flag read from outside the gate vocabulary, and who reads it. */
export interface FlagReadSite {
  key: string;
  source: string;
}

/**
 * Flags the systems read directly, off their own tables — the other
 * half of the consequence check. A chapter flag is read by advancement
 * rather than by a gate; a standing source flag is read by the
 * reputation derivation; a dressing key is read by the map.
 */
export function engineFlagReads(): FlagReadSite[] {
  const reads: FlagReadSite[] = [];
  for (const act of ACTS) reads.push({ key: act.completeFlag, source: "engine:acts" });
  for (const grant of chapterGrants) {
    reads.push({ key: grant.flag, source: "engine:advancement" });
  }
  for (const deed of credDeeds) {
    reads.push({ key: deed.flag, source: "engine:cred" });
  }
  for (const standing of FACTION_STANDINGS) {
    reads.push({ key: standing.flag, source: "engine:reputation" });
  }
  for (const dressing of mapDressings) {
    reads.push({ key: dressing.when.key, source: "engine:map-dressing" });
  }
  for (const encounter of encounters) {
    for (const spawn of encounter.enemies) {
      if (spawn.absentWhenFlag != null) {
        reads.push({ key: spawn.absentWhenFlag, source: "engine:encounters" });
      }
    }
  }
  for (const zone of stealthZones) {
    for (const guard of zone.guards) {
      if (guard.absentWhenFlag != null) {
        reads.push({ key: guard.absentWhenFlag, source: "engine:stealth" });
      }
    }
  }
  for (const interlude of interludes) {
    reads.push({ key: interlude.afterFlag, source: "engine:interlude" });
  }
  return reads;
}

/**
 * Every item a run can end up holding: starting gear, anything a beat
 * hands over, anything a fight pays out, anything a counter stocks.
 * What is *not* here is what a gate on it can never see.
 */
export function grantableItemIds(): Set<string> {
  const ids = new Set<string>();
  for (const background of backgrounds) {
    for (const id of background.startingGearIds) ids.add(id);
  }
  for (const arc of storyArcs) {
    for (const node of arc.nodes) {
      for (const choice of node.choices) {
        for (const effect of choice.effects ?? []) {
          if (effect.type === "add-item") ids.add(effect.itemId);
        }
      }
    }
  }
  for (const encounter of encounters) {
    for (const reward of encounter.rewards.items ?? []) ids.add(reward.itemId);
  }
  for (const line of VENDOR_STOCK) ids.add(line.itemId);
  for (const companion of companions) {
    if (companion.weaponId) ids.add(companion.weaponId);
    if (companion.outfitId) ids.add(companion.outfitId);
  }
  return ids;
}

/** Every companion some beat can actually recruit. */
export function recruitableCompanionIds(): Set<string> {
  const ids = new Set<string>();
  for (const arc of storyArcs) {
    for (const node of arc.nodes) {
      for (const choice of node.choices) {
        for (const effect of choice.effects ?? []) {
          if (effect.type === "recruit-companion") ids.add(effect.companionId);
        }
      }
    }
  }
  return ids;
}

/**
 * Every narrative tag a character could present: what a background is,
 * and what an outfit unlocks by being worn.
 */
export function availableBackgroundTags(): Set<string> {
  const tags = new Set<string>();
  for (const background of backgrounds) {
    for (const tag of background.tags) tags.add(tag);
  }
  for (const item of items) {
    const effects = "effects" in item ? item.effects : [];
    for (const effect of effects) {
      if (effect.type === "unlock-dialogue") tags.add(effect.tag);
    }
  }
  return tags;
}
