import { getCompanion } from "../data/companions";
import { getEncounter } from "../data/encounters";
import { getItem } from "../data/items";
import { getMap } from "../data/maps";
import type { Choice, StoryArc, StoryNode } from "./types";

/**
 * Story-content validation, run in tests over every authored arc: broken
 * links, unreachable nodes, dead-end choices, and dangling item, encounter,
 * or map ids are authoring bugs that must fail CI, not surface
 * mid-playthrough.
 */

export type ArcIssueCode =
  | "duplicate-node"
  | "missing-entry"
  | "broken-target"
  | "orphan-node"
  | "dead-end-choice"
  | "unknown-item"
  | "unknown-encounter"
  | "unknown-map"
  | "unknown-companion";

export interface ArcIssue {
  code: ArcIssueCode;
  /** Node the issue was found on (absent for arc-level issues). */
  nodeId?: string;
  choiceId?: string;
  detail: string;
}

/** Item ids a choice references in requirements or effects. */
function referencedItemIds(choice: Choice): string[] {
  const ids: string[] = [];
  for (const req of choice.requirements ?? []) {
    if (req.type === "item" || req.type === "enhancement") ids.push(req.itemId);
  }
  for (const effect of choice.effects ?? []) {
    if (effect.type === "add-item" || effect.type === "remove-item") {
      ids.push(effect.itemId);
    }
  }
  return ids;
}

/** Companion ids a choice names, in requirements or effects. */
function referencedCompanionIds(choice: Choice): string[] {
  const ids: string[] = [];
  for (const req of choice.requirements ?? []) {
    if (req.type === "companion") ids.push(req.companionId);
  }
  for (const effect of choice.effects ?? []) {
    if (
      effect.type === "recruit-companion" ||
      effect.type === "companion-loyalty"
    ) {
      ids.push(effect.companionId);
    }
  }
  return ids;
}

/** Node ids a choice can lead to (target plus goto overrides). */
function choiceTargets(choice: Choice): string[] {
  const targets: string[] = [];
  if (choice.target != null) targets.push(choice.target);
  for (const effect of choice.effects ?? []) {
    if (effect.type === "goto") targets.push(effect.nodeId);
  }
  return targets;
}

/** End markers and travel effects both legally terminate a choice. */
function hasTerminator(choice: Choice): boolean {
  return (choice.effects ?? []).some(
    (e) => e.type === "end" || e.type === "travel",
  );
}

/**
 * Validates an arc's graph: every choice leads somewhere real (or ends the
 * arc), every node is reachable from the entry node, and every referenced
 * item id resolves in the item content. Returns [] when the arc is sound.
 */
export function validateArc(arc: StoryArc): ArcIssue[] {
  const issues: ArcIssue[] = [];
  const nodesById = new Map<string, StoryNode>();

  for (const node of arc.nodes) {
    if (nodesById.has(node.id)) {
      issues.push({
        code: "duplicate-node",
        nodeId: node.id,
        detail: `Node id "${node.id}" is defined more than once`,
      });
    }
    nodesById.set(node.id, node);
  }

  if (!nodesById.has(arc.entryNodeId)) {
    issues.push({
      code: "missing-entry",
      detail: `Entry node "${arc.entryNodeId}" does not exist in arc "${arc.id}"`,
    });
  }

  for (const node of arc.nodes) {
    // An aside addressed to nobody is a line that can never be read.
    for (const comment of node.comments ?? []) {
      if (!getCompanion(comment.companionId)) {
        issues.push({
          code: "unknown-companion",
          nodeId: node.id,
          detail:
            `Node "${node.id}" carries a comment from unknown companion ` +
            `"${comment.companionId}"`,
        });
      }
    }
    for (const choice of node.choices) {
      const targets = choiceTargets(choice);
      if (targets.length === 0 && !hasTerminator(choice)) {
        issues.push({
          code: "dead-end-choice",
          nodeId: node.id,
          choiceId: choice.id,
          detail:
            `Choice "${choice.id}" on node "${node.id}" has no target, ` +
            "goto, or end marker",
        });
      }
      for (const target of targets) {
        if (!nodesById.has(target)) {
          issues.push({
            code: "broken-target",
            nodeId: node.id,
            choiceId: choice.id,
            detail:
              `Choice "${choice.id}" on node "${node.id}" points at ` +
              `missing node "${target}"`,
          });
        }
      }
      for (const itemId of referencedItemIds(choice)) {
        if (!getItem(itemId)) {
          issues.push({
            code: "unknown-item",
            nodeId: node.id,
            choiceId: choice.id,
            detail:
              `Choice "${choice.id}" on node "${node.id}" references ` +
              `unknown item "${itemId}"`,
          });
        }
      }
      for (const companionId of referencedCompanionIds(choice)) {
        if (!getCompanion(companionId)) {
          issues.push({
            code: "unknown-companion",
            nodeId: node.id,
            choiceId: choice.id,
            detail:
              `Choice "${choice.id}" on node "${node.id}" references ` +
              `unknown companion "${companionId}"`,
          });
        }
      }
      for (const effect of choice.effects ?? []) {
        if (effect.type === "start-combat" && !getEncounter(effect.encounterId)) {
          issues.push({
            code: "unknown-encounter",
            nodeId: node.id,
            choiceId: choice.id,
            detail:
              `Choice "${choice.id}" on node "${node.id}" starts ` +
              `unknown encounter "${effect.encounterId}"`,
          });
        }
        if (effect.type === "travel" && !getMap(effect.mapId)) {
          issues.push({
            code: "unknown-map",
            nodeId: node.id,
            choiceId: choice.id,
            detail:
              `Choice "${choice.id}" on node "${node.id}" travels to ` +
              `unknown map "${effect.mapId}"`,
          });
        }
      }
    }
  }

  const reachable = new Set<string>();
  const frontier = nodesById.has(arc.entryNodeId) ? [arc.entryNodeId] : [];
  while (frontier.length > 0) {
    const nodeId = frontier.pop()!;
    if (reachable.has(nodeId)) continue;
    reachable.add(nodeId);
    const node = nodesById.get(nodeId);
    if (!node) continue;
    for (const choice of node.choices) {
      frontier.push(...choiceTargets(choice));
    }
  }
  for (const node of arc.nodes) {
    if (!reachable.has(node.id)) {
      issues.push({
        code: "orphan-node",
        nodeId: node.id,
        detail: `Node "${node.id}" is unreachable from entry "${arc.entryNodeId}"`,
      });
    }
  }

  return issues;
}
