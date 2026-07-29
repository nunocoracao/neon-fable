import { describe, expect, it } from "vitest";
import {
  composeVisual,
  portraitKey,
  validateAppearance,
  visualEquipment,
} from "../character";
import { PLAYER_SPEAKER } from "../narrative";
import { EXPRESSION_IDS } from "./appearance";
import { cast, castVisual, resolveSpeakerPortrait } from "./cast";
import { getItem } from "./items";
import { storyArcs } from "./story";

describe("cast catalog", () => {
  it("every cast member's appearance validates against the catalogs", () => {
    for (const [name, visual] of Object.entries(cast)) {
      expect(validateAppearance(visual.appearance), name).toEqual([]);
    }
  });

  it("every cast member composes into sprite layers and a portrait", () => {
    for (const [name, visual] of Object.entries(cast)) {
      expect(() => composeVisual(visual), name).not.toThrow();
      // Portraits must resolve for every expression a line can request.
      for (const expression of EXPRESSION_IDS) {
        expect(
          portraitKey(visual.appearance, visualEquipment(visual), expression),
          `${name}@${expression}`,
        ).not.toBe("");
      }
    }
  });

  it("cast gear references resolve to items of the right kind", () => {
    for (const [name, visual] of Object.entries(cast)) {
      if (visual.outfit) {
        expect(getItem(visual.outfit)?.kind, `${name} outfit`).toBe("outfit");
      }
      if (visual.weapon) {
        expect(getItem(visual.weapon)?.kind, `${name} weapon`).toBe("weapon");
      }
      for (const itemId of Object.values(visual.enhancements ?? {})) {
        expect(getItem(itemId)?.kind, `${name} enhancement`).toBe(
          "enhancement",
        );
      }
    }
  });

  it("every named speaker in every authored arc has a cast entry", () => {
    for (const arc of storyArcs) {
      for (const node of arc.nodes) {
        if (node.speaker === undefined || node.speaker === PLAYER_SPEAKER) {
          continue;
        }
        expect(
          castVisual(node.speaker),
          `arc "${arc.id}" node "${node.id}" speaker "${node.speaker}"`,
        ).toBeDefined();
      }
    }
  });
});

describe("resolveSpeakerPortrait", () => {
  it("resolves a missing speaker to narration", () => {
    expect(resolveSpeakerPortrait({})).toEqual({ kind: "narration" });
  });

  it("resolves the player sentinel with a neutral default", () => {
    expect(resolveSpeakerPortrait({ speaker: PLAYER_SPEAKER })).toEqual({
      kind: "player",
      expression: "neutral",
    });
  });

  it("passes a line's expression through to the player portrait", () => {
    expect(
      resolveSpeakerPortrait({ speaker: PLAYER_SPEAKER, expression: "grim" }),
    ).toEqual({ kind: "player", expression: "grim" });
  });

  it("resolves each named cast member to their authored visual", () => {
    for (const [name, visual] of Object.entries(cast)) {
      expect(resolveSpeakerPortrait({ speaker: name })).toEqual({
        kind: "npc",
        name,
        visual,
        expression: "neutral",
      });
    }
  });

  it("passes a line's expression through to the NPC portrait", () => {
    const resolved = resolveSpeakerPortrait({
      speaker: "Sable",
      expression: "shocked",
    });
    expect(resolved.kind).toBe("npc");
    expect(resolved).toMatchObject({ expression: "shocked" });
  });

  it("degrades an unknown speaker name to a portrait-free line", () => {
    expect(resolveSpeakerPortrait({ speaker: "A Passing Stranger" })).toEqual({
      kind: "unlisted",
      name: "A Passing Stranger",
    });
  });

  it("only story expressions from the catalog exist on authored lines", () => {
    for (const arc of storyArcs) {
      for (const node of arc.nodes) {
        if (node.expression !== undefined) {
          expect(EXPRESSION_IDS, `node "${node.id}"`).toContain(
            node.expression,
          );
          // An expression implies a speaker whose portrait can play it.
          expect(node.speaker, `node "${node.id}"`).toBeDefined();
        }
      }
    }
  });
});
