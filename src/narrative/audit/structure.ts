import { barks } from "../../data/barks";
import { companions, getCompanion } from "../../data/companions";
import { getFaction, REPUTATION_BAND_IDS } from "../../data/factions";
import { getInjury } from "../../data/injuries";
import { getItem } from "../../data/items";
import { interludes } from "../../data/interludes";
import { LORE_SHARDS } from "../../data/lore";
import { getMap, maps } from "../../data/maps";
import { stealthZones } from "../../data/stealth";
import { SCENE_REACTIONS } from "../../data/world";
import { arcEntryNodeIds, type StoryArc, type StoryNode } from "../types";
import { validateArc } from "../validate";
import type { GateSource } from "./content";
import { requirementsRefs, type ContentRef } from "./refs";
import { error, warning, type AuditFinding } from "./types";

/**
 * Structure: does everything the content points at exist, and can a run
 * always get back out again.
 *
 * validateArc already walks each arc on its own, so this module folds
 * its verdict in rather than repeating it, and adds the questions one
 * arc cannot answer by itself:
 *
 *  - **Terminal reachability.** A node whose every path loops without
 *    ever reaching an end or a way out is a soft-lock: the player is
 *    talking to somebody they can never stop talking to. Reachability
 *    *from* the entry says nothing about it, which is why an arc can
 *    pass validateArc and still trap somebody.
 *  - **The world's own doorways.** A map interactable, a street
 *    reaction, a companion's scene, and a stealth zone's spotted beat
 *    all open story nodes from outside the graph. A rename on either
 *    side of one of those joins is invisible to both files.
 *
 * Ids named by non-story content — a bark's district, a shard's map, a
 * gate on an item in an epilogue — are checked here too, because a typo
 * in a bark's requirement fails exactly as silently as one in a
 * choice's, and nothing else was looking.
 */

/** Every node id something outside the story graph can open. */
export interface WorldEntry {
  nodeId: string;
  /** Who opens it: "map:cinder-plaza/filament-door", "companion:vesper". */
  source: string;
}

/** The doorways the world itself holds open, gathered from map and world data. */
export function worldEntries(arcs: readonly StoryArc[]): WorldEntry[] {
  const entries: WorldEntry[] = [];
  for (const arc of arcs) {
    for (const nodeId of arcEntryNodeIds(arc)) {
      entries.push({ nodeId, source: `arc:${arc.id}` });
    }
  }
  for (const map of maps) {
    for (const interactable of map.interactables) {
      if (interactable.interaction.kind === "dialogue") {
        entries.push({
          nodeId: interactable.interaction.nodeId,
          source: `map:${map.id}/${interactable.id}`,
        });
      }
    }
  }
  for (const reaction of SCENE_REACTIONS) {
    for (const spawn of reaction.spawn ?? []) {
      entries.push({ nodeId: spawn.nodeId, source: `world:${reaction.id}` });
    }
    for (const dressing of reaction.dress ?? []) {
      if (dressing.nodeId != null) {
        entries.push({ nodeId: dressing.nodeId, source: `world:${reaction.id}` });
      }
    }
  }
  for (const companion of companions) {
    entries.push({
      nodeId: companion.personalScene.nodeId,
      source: `companion:${companion.id}`,
    });
    entries.push({
      nodeId: companion.bondScene.nodeId,
      source: `companion:${companion.id}`,
    });
  }
  for (const zone of stealthZones) {
    entries.push({ nodeId: zone.spottedNodeId, source: `stealth:${zone.id}` });
  }
  return entries;
}

/** Node ids a node's choices can lead to (targets plus goto overrides). */
function choiceTargets(node: StoryNode): string[] {
  const targets: string[] = [];
  for (const choice of node.choices) {
    if (choice.target != null) targets.push(choice.target);
    for (const effect of choice.effects ?? []) {
      if (effect.type === "goto") targets.push(effect.nodeId);
    }
  }
  return targets;
}

/** True when some choice on the node closes the scene by itself. */
function terminates(node: StoryNode): boolean {
  return node.choices.some((choice) =>
    (choice.effects ?? []).some((e) => e.type === "end" || e.type === "travel"),
  );
}

/**
 * Nodes from which no terminator is reachable, following every choice
 * edge regardless of gates. Gates only ever *remove* ways out, so a node
 * the ungated graph cannot escape can never be escaped at all — this is
 * the conservative half of the question, and the half that is decidable
 * from the data alone.
 */
export function softLockedNodes(arc: StoryArc): string[] {
  const safe = new Set<string>();
  for (const node of arc.nodes) if (terminates(node)) safe.add(node.id);
  let grew = true;
  while (grew) {
    grew = false;
    for (const node of arc.nodes) {
      if (safe.has(node.id)) continue;
      if (choiceTargets(node).some((id) => safe.has(id))) {
        safe.add(node.id);
        grew = true;
      }
    }
  }
  return arc.nodes.filter((node) => !safe.has(node.id)).map((node) => node.id);
}

/**
 * Nodes where every single choice is gated.
 *
 * Not a bug by itself — the four faces of a dominant-faction beat are
 * all gated and exactly one always passes — but it is the only shape a
 * dialogue trap can take: reach one of these in a state none of its
 * gates accept and the scene has no options at all, which the UI has
 * nothing sensible to do with. So each one has to be *argued*: either
 * the gates are exhaustive, and the waiver in src/data/narrativeAudit.ts
 * says why, or the node needs a way out that asks for nothing.
 *
 * Static on purpose. A random walk finds these by luck of the seed, and
 * a check that depends on which seeds were drawn is a check that goes
 * quiet the moment somebody edits an unrelated scene.
 */
export function allGatedNodes(arc: StoryArc): StoryNode[] {
  return arc.nodes.filter(
    (node) =>
      node.choices.length > 0 &&
      node.choices.every((choice) => (choice.requirements ?? []).length > 0),
  );
}

/** The story graph's own verdict: arc issues, dead rooms, soft-locks. */
export function auditGraph(arcs: readonly StoryArc[]): AuditFinding[] {
  const findings: AuditFinding[] = [];
  for (const arc of arcs) {
    for (const issue of validateArc(arc)) {
      findings.push(
        error("arc-issue", `arc:${arc.id}`, `${issue.code}: ${issue.detail}`, {
          ...(issue.nodeId != null
            ? {
                where:
                  issue.choiceId != null
                    ? `${issue.nodeId}/${issue.choiceId}`
                    : issue.nodeId,
              }
            : {}),
          subject: issue.nodeId ?? arc.id,
        }),
      );
    }
    for (const node of arc.nodes) {
      if (node.choices.length === 0) {
        findings.push(
          error(
            "no-exit-node",
            `arc:${arc.id}`,
            `Node "${node.id}" offers no choices: nothing can leave it`,
            { where: node.id, subject: node.id },
          ),
        );
      }
    }
    for (const node of allGatedNodes(arc)) {
      findings.push(
        warning(
          "all-gated-node",
          `arc:${arc.id}`,
          `Every choice on node "${node.id}" is gated: a run whose state ` +
            "matches none of them has no way on",
          { where: node.id, subject: node.id },
        ),
      );
    }
    const choicesById = new Map(
      arc.nodes.map((node) => [node.id, node.choices.length]),
    );
    for (const nodeId of softLockedNodes(arc)) {
      // A room with no doors at all is already reported above; saying it
      // twice tells nobody anything new.
      if (choicesById.get(nodeId) === 0) continue;
      findings.push(
        error(
          "soft-lock",
          `arc:${arc.id}`,
          `No end, travel, or exit is reachable from node "${nodeId}"`,
          { where: nodeId, subject: nodeId },
        ),
      );
    }
  }
  return findings;
}

/** Every doorway the world opens has to land on a node that exists. */
export function auditWorldEntries(
  arcs: readonly StoryArc[],
  entries: readonly WorldEntry[],
): AuditFinding[] {
  const nodeIds = new Set<string>();
  for (const arc of arcs) for (const node of arc.nodes) nodeIds.add(node.id);
  return entries
    .filter((entry) => !nodeIds.has(entry.nodeId))
    .map((entry) =>
      error(
        "arc-issue",
        entry.source,
        `broken-target: opens missing story node "${entry.nodeId}"`,
        { subject: entry.nodeId },
      ),
    );
}

/** Whether a content id resolves, by kind. */
function refExists(ref: ContentRef): boolean {
  switch (ref.kind) {
    case "item":
    case "enhancement":
      return getItem(ref.id) != null;
    case "companion":
      return getCompanion(ref.id) != null;
    case "injury":
      return getInjury(ref.id) != null;
    case "faction":
      return getFaction(ref.id) != null;
    case "band":
      return (REPUTATION_BAND_IDS as readonly string[]).includes(ref.id);
    // Whether a tag anybody can present exists is the satisfiability
    // pass's question, not an id lookup.
    case "background-tag":
      return true;
  }
}

const REF_LABEL: Record<ContentRef["kind"], string> = {
  item: "item",
  enhancement: "enhancement",
  companion: "companion",
  injury: "injury",
  faction: "faction",
  band: "reputation band",
  "background-tag": "background tag",
};

const REF_CODE = {
  item: "unknown-item",
  enhancement: "unknown-item",
  companion: "unknown-companion",
  injury: "unknown-injury",
  faction: "unknown-faction",
  band: "unknown-band",
} as const;

/**
 * Ids named by gates outside the story graph — a bark's, a shard's, an
 * epilogue's. Story choices are validateArc's beat and are skipped, so
 * one finding never arrives twice under two codes.
 */
export function auditGateRefs(sources: readonly GateSource[]): AuditFinding[] {
  const findings: AuditFinding[] = [];
  for (const source of sources) {
    if (source.source.startsWith("arc:")) continue;
    for (const ref of requirementsRefs(source.requirements)) {
      if (refExists(ref)) continue;
      const code = REF_CODE[ref.kind as keyof typeof REF_CODE];
      if (!code) continue;
      findings.push(
        error(
          code,
          source.source,
          `Gate names unknown ${REF_LABEL[ref.kind]} "${ref.id}"`,
          {
            ...(source.where != null ? { where: source.where } : {}),
            subject: ref.id,
          },
        ),
      );
    }
  }
  return findings;
}

/**
 * Where non-story content says it lives: a bark's districts and zones, a
 * shard's map, an interlude's backdrop. All strings, none of them
 * checked by the type system, and each one a line of content that
 * silently never appears if it is wrong.
 */
export function auditPlacements(): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const zonesByMap = new Map<string, Set<string>>();
  for (const map of maps) {
    zonesByMap.set(
      map.id,
      new Set((map.ambient?.zones ?? []).map((zone) => zone.id)),
    );
  }

  for (const bark of barks) {
    for (const mapId of bark.mapIds ?? []) {
      if (!getMap(mapId)) {
        findings.push(
          error(
            "unknown-map",
            `bark:${bark.id}`,
            `Bark is posted to unknown map "${mapId}"`,
            { subject: mapId },
          ),
        );
      }
    }
    for (const zoneId of bark.zoneIds ?? []) {
      const known = (bark.mapIds ?? []).some((mapId) =>
        zonesByMap.get(mapId)?.has(zoneId),
      );
      if (!known) {
        findings.push(
          error(
            "unknown-zone",
            `bark:${bark.id}`,
            `Bark is posted to zone "${zoneId}", which none of its maps declares`,
            { subject: zoneId },
          ),
        );
      }
    }
  }

  for (const shard of LORE_SHARDS) {
    if (!getMap(shard.mapId)) {
      findings.push(
        error(
          "unknown-map",
          `lore:${shard.id}`,
          `Shard lies on unknown map "${shard.mapId}"`,
          { subject: shard.mapId },
        ),
      );
    }
  }

  for (const interlude of interludes) {
    if (!getMap(interlude.backdrop.mapId)) {
      findings.push(
        error(
          "unknown-map",
          `interlude:${interlude.id}`,
          `Backdrop names unknown map "${interlude.backdrop.mapId}"`,
          { subject: interlude.backdrop.mapId },
        ),
      );
    }
  }

  return findings;
}
