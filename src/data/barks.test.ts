import { describe, expect, it } from "vitest";
import { SCENE_SPEAKER_KINDS } from "../iso/events";
import { DAY_PHASES, type IsoMap } from "../iso/tilemap";
import { BARK_TRIGGERS, MAX_BARK_LENGTH, barks, getBark, requireBark } from "./barks";
import { companions } from "./companions";
import { maps } from "./maps";

/**
 * Catalog lint for the street's voice. Bad content here is silent —
 * a line pinned to a district that no longer exists simply never gets
 * said — so every id a bark names is checked against the thing it
 * names, and every line is checked for the one hard constraint the
 * chip imposes: it has to fit.
 */

/** Districts a player can walk: everything with a crowd or people on it. */
const explorable: readonly IsoMap[] = maps.filter(
  (map) => map.ambient !== undefined,
);

const interactableIds = new Set(
  maps.flatMap((map) => map.interactables.map((i) => i.id)),
);
const npcIds = new Set(
  maps.flatMap((map) =>
    map.interactables.filter((i) => i.spriteId === "npc").map((i) => i.id),
  ),
);
const mapIds = new Set(maps.map((map) => map.id));
const zoneIds = new Set(
  maps.flatMap((map) => (map.ambient?.zones ?? []).map((zone) => zone.id)),
);
const companionIds = new Set(companions.map((companion) => companion.id));

describe("bark catalog", () => {
  it("ships a full initial pass across districts, weather, and the crew", () => {
    expect(barks.length).toBeGreaterThanOrEqual(40);
  });

  it("has unique ids that resolve", () => {
    const ids = barks.map((bark) => bark.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const bark of barks) {
      expect(getBark(bark.id)).toBe(bark);
      expect(requireBark(bark.id)).toBe(bark);
    }
    expect(getBark("bark-nobody-says-this")).toBeUndefined();
    expect(() => requireBark("bark-nobody-says-this")).toThrow(/Unknown bark/);
  });

  it("declares a speaker kind and a trigger the scheduler knows", () => {
    for (const bark of barks) {
      expect(SCENE_SPEAKER_KINDS, bark.id).toContain(bark.speaker);
      expect(BARK_TRIGGERS, bark.id).toContain(bark.trigger);
    }
  });

  it("fits in a chip: one line, trimmed, and said out loud", () => {
    for (const bark of barks) {
      expect(bark.text.length, `${bark.id}: "${bark.text}"`).toBeLessThanOrEqual(
        MAX_BARK_LENGTH,
      );
      expect(bark.text.trim(), bark.id).toBe(bark.text);
      expect(bark.text.length, bark.id).toBeGreaterThan(0);
      // A chip is one utterance; a line break in it would be a paragraph.
      expect(bark.text, bark.id).not.toContain("\n");
    }
  });

  it("names districts and zones that exist", () => {
    for (const bark of barks) {
      for (const mapId of bark.mapIds ?? []) {
        expect(mapIds, `${bark.id} -> ${mapId}`).toContain(mapId);
      }
      for (const zoneId of bark.zoneIds ?? []) {
        expect(zoneIds, `${bark.id} -> ${zoneId}`).toContain(zoneId);
      }
      if (bark.dayPhase) {
        expect(DAY_PHASES, bark.id).toContain(bark.dayPhase);
      }
    }
  });

  it("only pins a zone to a pedestrian — nobody else belongs to one", () => {
    for (const bark of barks) {
      if (!bark.zoneIds) continue;
      expect(bark.speaker, bark.id).toBe("pedestrian");
    }
  });

  it("names a real person: an NPC on a map, or a companion in the crew", () => {
    for (const bark of barks) {
      if (bark.speaker === "npc") {
        expect(bark.speakerId, bark.id).toBeDefined();
        expect(npcIds, bark.id).toContain(bark.speakerId);
        // Anything named has to be an interactable the maps still carry.
        expect(interactableIds, bark.id).toContain(bark.speakerId);
      }
      if (bark.speaker === "companion") {
        expect(bark.speakerId, bark.id).toBeDefined();
        expect(companionIds, bark.id).toContain(bark.speakerId);
      }
      if (bark.speaker === "pedestrian") {
        // A passer-by is nobody in particular, by definition.
        expect(bark.speakerId, bark.id).toBeUndefined();
      }
    }
  });

  it("leaves the event triggers to the companion", () => {
    // Only the crew have been where the player has been; a stranger
    // cannot comment on a district you have just walked into.
    for (const bark of barks) {
      if (bark.trigger === "idle") continue;
      expect(bark.speaker, bark.id).toBe("companion");
    }
  });

  it("gives every walkable district a pool of its own", () => {
    for (const map of explorable) {
      const pool = barks.filter(
        (bark) =>
          bark.speaker === "pedestrian" &&
          (bark.mapIds === undefined || bark.mapIds.includes(map.id)),
      );
      expect(pool.length, `${map.id} has nothing to say`).toBeGreaterThanOrEqual(2);
    }
  });

  it("gives every zone a district pins lines to a line it can use", () => {
    for (const map of explorable) {
      for (const zone of map.ambient?.zones ?? []) {
        const pinned = barks.filter(
          (bark) =>
            bark.zoneIds?.includes(zone.id) && bark.mapIds?.includes(map.id),
        );
        const unpinned = barks.filter(
          (bark) =>
            bark.speaker === "pedestrian" &&
            bark.zoneIds === undefined &&
            (bark.mapIds === undefined || bark.mapIds.includes(map.id)),
        );
        expect(
          pinned.length + unpinned.length,
          `${map.id}/${zone.id} is mute`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("gives every companion something to say in every situation", () => {
    for (const companion of companions) {
      for (const trigger of BARK_TRIGGERS) {
        const pool = barks.filter(
          (bark) =>
            bark.speakerId === companion.id && bark.trigger === trigger,
        );
        expect(
          pool.length,
          `${companion.id} has nothing for "${trigger}"`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("has the weather to remark on where it remarks on weather", () => {
    for (const bark of barks) {
      if (!bark.weather) continue;
      const candidates = bark.mapIds
        ? maps.filter((map) => bark.mapIds?.includes(map.id))
        : maps;
      // A rain line pinned to a district that never rains is a line
      // that never gets said.
      expect(
        candidates.some((map) => (map.weather ?? "clear") === bark.weather),
        `${bark.id} waits on ${bark.weather} that never comes`,
      ).toBe(true);
    }
  });
});
