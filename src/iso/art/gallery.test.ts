import { describe, expect, it } from "vitest";
import {
  buildGallerySections,
  filterSections,
  matchesQuery,
  type GallerySection,
} from "./gallery";
import {
  BROWS_OPTIONS,
  EYE_COLOR_OPTIONS,
  EYES_OPTIONS,
  FACE_DETAIL_OPTIONS,
  HAIR_COLOR_OPTIONS,
  HEADWEAR_OPTIONS,
  MOUTH_OPTIONS,
} from "../../data/appearance";
import { ABILITY_FX, ABILITY_FX_IDS } from "../abilityFx";
import { ATTACK_CLASS_IDS, attackFrameCount } from "../attack";
import { STATUS_FAMILY_IDS, STATUS_MARKERS } from "../status";
import {
  EFFECT_SPRITE_IDS,
  EFFECT_TIMING,
  effectKind,
  type EffectSpriteId,
} from "../impact";
import { REACTION_KINDS, reactionFrameCount } from "../reaction";
import { enemies } from "../../data/enemies";
import { items } from "../../data/items";
import { maps } from "../../data/maps";
import { ACTION_ICON_IDS } from "./actionIcons";
import { INTERACTABLE_ART } from "./interactables";
import { MECH_ART, MECH_ART_IDS, MECH_SET_IDS } from "./mech";
import { SETPIECE_ART } from "./setpieces";
import { BODY_BUILD_IDS } from "./layers/body";
import { HAIR_STYLE_IDS } from "./layers/hair";
import { gridErrors } from "./pixel";
import { PROP_ART } from "./props";
import { TILE_ART } from "./tiles";

/**
 * The dev art-gallery registry: every registered art piece must appear
 * exactly once, with valid display-ready grids and animation metadata,
 * and the id filter must narrow sections by substring.
 */

const sections = buildGallerySections();

function section(id: string): GallerySection {
  const found = sections.find((s) => s.id === id);
  if (!found) throw new Error(`missing gallery section ${id}`);
  return found;
}

describe("gallery sections", () => {
  it("groups art into uniquely-identified sections", () => {
    const ids = sections.map((s) => s.id);
    expect(ids).toEqual([
      "tiles",
      "props",
      "interactables",
      "setpieces",
      "cast",
      "drones",
      "mechs",
      "bodies",
      "attacks",
      "reactions",
      "effects",
      "abilityEffects",
      "statusMarkers",
      "popups",
      "actionIcons",
      "appearance",
    ]);
    for (const s of sections) {
      const entryIds = s.entries.map((e) => e.id);
      expect(new Set(entryIds).size, `${s.id} entry ids unique`).toBe(
        entryIds.length,
      );
      expect(s.entries.length, `${s.id} not empty`).toBeGreaterThan(0);
    }
  });

  it("shows every multi-tile chassis on every facing, both swings, and its face", () => {
    const mechs = section("mechs");
    for (const id of MECH_ART_IDS) {
      for (const facing of ["n", "e", "s", "w"]) {
        for (const set of MECH_SET_IDS) {
          expect(
            mechs.entries.some((e) => e.id === `mech ${id} ${set} ${facing}`),
            `${id} ${set} ${facing}`,
          ).toBe(true);
        }
        MECH_ART[id].attackClasses.forEach((_, variant) => {
          expect(
            mechs.entries.some(
              (e) => e.id === `mech ${id} attack v${variant} ${facing}`,
            ),
            `${id} attack v${variant} ${facing}`,
          ).toBe(true);
        });
      }
      expect(mechs.entries.some((e) => e.id === `mech ${id} portrait`)).toBe(
        true,
      );
    }
    // Everything but the portrait actually moves; a chassis shown as a
    // still is the one thing the gallery cannot usefully say about it.
    for (const entry of mechs.entries) {
      if (entry.id.endsWith("portrait")) continue;
      expect(entry.frames.length, entry.id).toBeGreaterThan(1);
      expect(entry.frameMs, entry.id).toBeGreaterThan(0);
    }
  });

  it("covers every tile id and every variant", () => {
    const tiles = section("tiles");
    const expected = Object.entries(TILE_ART).reduce(
      (sum, [, art]) => sum + art.variants.length,
      0,
    );
    expect(tiles.entries.length).toBe(expected);
    for (const id of Object.keys(TILE_ART)) {
      expect(
        tiles.entries.some((e) => e.id === id || e.id.startsWith(`${id} v`)),
        `tile ${id} present`,
      ).toBe(true);
    }
  });

  it("covers every set piece, each playing its own sequence", () => {
    const setPieces = section("setpieces");
    expect(setPieces.entries.map((e) => e.id).sort()).toEqual(
      Object.keys(SETPIECE_ART).sort(),
    );
    // Every one of them animates, the scheduled steam burst included —
    // a set piece shown as a still is the one thing the gallery cannot
    // usefully say about it.
    for (const entry of setPieces.entries) {
      expect(entry.frames.length, `${entry.id} frames`).toBeGreaterThan(1);
      expect(entry.frameMs, `${entry.id} cadence`).toBeGreaterThan(0);
    }
  });

  it("covers every prop and every drawn interactable", () => {
    expect(section("props").entries.map((e) => e.id).sort()).toEqual(
      Object.keys(PROP_ART).sort(),
    );
    expect(section("interactables").entries.map((e) => e.id).sort()).toEqual(
      Object.keys(INTERACTABLE_ART).sort(),
    );
  });

  it("covers every record of every look family per facing and every map NPC", () => {
    const cast = section("cast");
    const npcCount = maps.reduce(
      (sum, map) =>
        sum + map.interactables.filter((i) => i.spriteId === "npc").length,
      0,
    );
    const lookCount = enemies.reduce(
      (sum, enemy) => sum + (enemy.spriteKind === "humanoid" ? enemy.looks.length : 0),
      0,
    );
    expect(cast.entries.length).toBe(lookCount * 4 + npcCount);
    for (const enemy of enemies) {
      // Archetypes with an authored sprite set live in their own
      // section — nothing in the cast composes them.
      if (enemy.spriteKind !== "humanoid") continue;
      for (let look = 0; look < enemy.looks.length; look++) {
        for (const facing of ["n", "e", "s", "w"]) {
          expect(
            cast.entries.some(
              (e) => e.id === `enemy ${enemy.id} look${look} ${facing}`,
            ),
            `enemy ${enemy.id} look${look} ${facing} present`,
          ).toBe(true);
        }
      }
    }
    for (const map of maps) {
      for (const npc of map.interactables) {
        if (npc.spriteId !== "npc") continue;
        expect(
          cast.entries.some((e) => e.id === `npc ${npc.id}`),
          `npc ${npc.id} present`,
        ).toBe(true);
      }
    }
  });

  it("covers every hi-res body build, facing, and motion state", () => {
    const bodies = section("bodies");
    expect(bodies.entries.length).toBe(BODY_BUILD_IDS.length * 4 * 2);
    for (const build of BODY_BUILD_IDS) {
      expect(
        bodies.entries.some((e) => e.id === `${build} w walk`),
        `${build} mirrored walk present`,
      ).toBe(true);
    }
  });

  it("covers every attack class × build × facing at its authored length", () => {
    const attacks = section("attacks");
    expect(attacks.entries.length).toBe(
      ATTACK_CLASS_IDS.length * BODY_BUILD_IDS.length * 4,
    );
    for (const attackClass of ATTACK_CLASS_IDS) {
      for (const build of BODY_BUILD_IDS) {
        for (const facing of ["n", "e", "s", "w"]) {
          const entry = attacks.entries.find(
            (e) => e.id === `attack ${attackClass} ${build} ${facing}`,
          );
          expect(entry, `attack ${attackClass} ${build} ${facing} present`).toBeDefined();
          expect(entry?.frames.length, `${attackClass} frame count`).toBe(
            attackFrameCount(attackClass),
          );
          expect(entry?.frameMs, `${attackClass} cadence`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("covers every reaction × build × facing × throw at its authored length", () => {
    const reactions = section("reactions");
    expect(reactions.entries.length).toBe(
      REACTION_KINDS.length * BODY_BUILD_IDS.length * 4 * 2,
    );
    for (const kind of REACTION_KINDS) {
      for (const build of BODY_BUILD_IDS) {
        for (const facing of ["n", "e", "s", "w"]) {
          for (const awayX of [-1, 1]) {
            const id = `react ${kind} ${build} ${facing} away${awayX}`;
            const entry = reactions.entries.find((e) => e.id === id);
            expect(entry, `${id} present`).toBeDefined();
            expect(entry?.frames.length, `${kind} frame count`).toBe(
              reactionFrameCount(kind),
            );
            expect(entry?.frameMs, `${kind} cadence`).toBeGreaterThan(0);
          }
        }
      }
    }
    const frame = (id: string, f = 0): string =>
      reactions.entries.find((e) => e.id === id)?.frames[f]?.join("\n") ?? "";
    // A blow from the other side throws the body the other way.
    expect(frame("react flinch lean e away1")).not.toBe(
      frame("react flinch lean e away-1"),
    );
    // A body and a chassis end up on the floor differently.
    expect(frame("react collapse lean e away1", 3)).not.toBe(
      frame("react sparkout lean e away1", 3),
    );
  });

  it("covers every combat effect at its authored frame count and hold", () => {
    const effects = section("effects");
    expect(effects.entries.map((e) => e.id)).toEqual([...EFFECT_SPRITE_IDS]);
    for (const entry of effects.entries) {
      const timing = EFFECT_TIMING[effectKind(entry.id as EffectSpriteId)];
      expect(entry.frames.length, `${entry.id} frames`).toBe(timing.frameCount);
      // Multi-frame effects play at their own hold; a tracer is one
      // picture the travel math moves, so it is static here.
      expect(entry.frameMs, `${entry.id} cadence`).toBe(
        timing.frameCount > 1 ? timing.frameMs : 0,
      );
    }
  });

  it("covers every ability archetype at its authored frame count and hold", () => {
    const effects = section("abilityEffects");
    expect(effects.entries.length).toBe(ABILITY_FX_IDS.length);
    for (const id of ABILITY_FX_IDS) {
      const entry = effects.entries.find((e) => e.id.startsWith(id));
      expect(entry, `${id} present`).toBeDefined();
      // The form is on the label: what a cast looks like depends as much
      // on where it is drawn as on what is drawn.
      expect(entry?.id, `${id} labeled`).toBe(`${id} (${ABILITY_FX[id].form})`);
      expect(entry?.frames.length, `${id} frames`).toBe(ABILITY_FX[id].frameCount);
      expect(entry?.frameMs, `${id} cadence`).toBe(ABILITY_FX[id].frameMs);
    }
  });

  it("covers every status marker family, looping at its own hold", () => {
    const markers = section("statusMarkers");
    expect(markers.entries.length).toBe(STATUS_FAMILY_IDS.length);
    for (const id of STATUS_FAMILY_IDS) {
      const entry = markers.entries.find((e) => e.id === `status ${id} (${STATUS_MARKERS[id].label})`);
      expect(entry, `${id} present`).toBeDefined();
      expect(entry?.frames.length, `${id} frames`).toBe(STATUS_MARKERS[id].frameCount);
      expect(entry?.frameMs, `${id} cadence`).toBe(STATUS_MARKERS[id].frameMs);
    }
  });

  it("covers every action-bar icon, one static glyph each", () => {
    const icons = section("actionIcons");
    expect(icons.entries.map((e) => e.id)).toEqual(
      ACTION_ICON_IDS.map((id) => `action ${id}`),
    );
    for (const entry of icons.entries) {
      expect(entry.frames.length, `${entry.id} frames`).toBe(1);
      expect(entry.frameMs, `${entry.id} is static`).toBe(0);
    }
  });

  it("covers every registered hair style × hair color × facing, plus a walk sweep per build", () => {
    const appearance = section("appearance");
    const drawnDetails = FACE_DETAIL_OPTIONS.filter((o) => o.layer !== null);
    const drawnHeadwear = HEADWEAR_OPTIONS.filter((o) => o.layer !== null);
    const drawnOutfits = items.filter(
      (i) => i.kind === "outfit" && i.outfitLayer !== undefined,
    );
    const drawnWeapons = items.filter(
      (i) => i.kind === "weapon" && i.weaponLayer !== undefined,
    );
    const drawnCyber = items.filter(
      (i) => i.kind === "enhancement" && i.cyberLayer !== undefined,
    );
    expect(appearance.entries.length).toBe(
      HAIR_STYLE_IDS.length * HAIR_COLOR_OPTIONS.length * 4 +
        HAIR_STYLE_IDS.length * BODY_BUILD_IDS.length * 4 +
        EYES_OPTIONS.length * EYE_COLOR_OPTIONS.length +
        EYES_OPTIONS.length * BROWS_OPTIONS.length +
        MOUTH_OPTIONS.length +
        drawnDetails.length +
        drawnHeadwear.length * 4 +
        drawnOutfits.length * BODY_BUILD_IDS.length * 4 +
        drawnWeapons.length * BODY_BUILD_IDS.length * 4 +
        drawnCyber.length * BODY_BUILD_IDS.length * 4,
    );
    for (const style of HAIR_STYLE_IDS) {
      for (const color of HAIR_COLOR_OPTIONS) {
        for (const facing of ["n", "e", "s", "w"]) {
          expect(
            appearance.entries.some(
              (e) => e.id === `hair ${style} ${color.id} ${facing}`,
            ),
            `hair ${style} ${color.id} ${facing} present`,
          ).toBe(true);
        }
      }
      for (const build of BODY_BUILD_IDS) {
        for (const facing of ["n", "e", "s", "w"]) {
          expect(
            appearance.entries.some(
              (e) => e.id === `hair ${style} ${build} walk ${facing}`,
            ),
            `hair ${style} ${build} walk ${facing} present`,
          ).toBe(true);
        }
      }
    }
    // Each color actually recolors: same style+facing, distinct frames.
    const frame = (id: string): string =>
      appearance.entries.find((e) => e.id === id)?.frames[0]?.join("\n") ?? "";
    const looks = HAIR_COLOR_OPTIONS.map((c) => frame(`hair bob ${c.id} e`));
    expect(new Set(looks).size).toBe(HAIR_COLOR_OPTIONS.length);
    // The walk sweep really differs per build.
    expect(frame("hair locs lean walk e")).not.toBe(
      frame("hair locs heavy walk e"),
    );
  });

  it("covers every eye shape × eye color and eye shape × brow shape up front", () => {
    const appearance = section("appearance");
    for (const eyes of EYES_OPTIONS) {
      for (const color of EYE_COLOR_OPTIONS) {
        expect(
          appearance.entries.some(
            (e) => e.id === `eyes ${eyes.id} ${color.id} e`,
          ),
          `eyes ${eyes.id} ${color.id} present`,
        ).toBe(true);
      }
      for (const brows of BROWS_OPTIONS) {
        expect(
          appearance.entries.some(
            (e) => e.id === `face ${eyes.id} ${brows.id} e`,
          ),
          `face ${eyes.id} ${brows.id} present`,
        ).toBe(true);
      }
    }
    // Each eye color actually recolors: same shape, distinct frames.
    const frame = (id: string): string =>
      appearance.entries.find((e) => e.id === id)?.frames[0]?.join("\n") ?? "";
    const looks = EYE_COLOR_OPTIONS.map((c) => frame(`eyes standard ${c.id} e`));
    expect(new Set(looks).size).toBe(EYE_COLOR_OPTIONS.length);
    // Brow combos really differ per brow shape.
    const combos = BROWS_OPTIONS.map((b) => frame(`face standard ${b.id} e`));
    expect(new Set(combos).size).toBe(BROWS_OPTIONS.length);
  });

  it("covers every mouth style up front, each with distinct art", () => {
    const appearance = section("appearance");
    for (const mouth of MOUTH_OPTIONS) {
      expect(
        appearance.entries.some((e) => e.id === `mouth ${mouth.id} e`),
        `mouth ${mouth.id} present`,
      ).toBe(true);
    }
    const frame = (id: string): string =>
      appearance.entries.find((e) => e.id === id)?.frames[0]?.join("\n") ?? "";
    const looks = MOUTH_OPTIONS.map((m) => frame(`mouth ${m.id} e`));
    expect(new Set(looks).size).toBe(MOUTH_OPTIONS.length);
  });

  it("covers every drawn headwear option per facing, each distinct over the same base", () => {
    const appearance = section("appearance");
    const drawn = HEADWEAR_OPTIONS.filter((o) => o.layer !== null);
    for (const head of drawn) {
      for (const facing of ["n", "e", "s", "w"]) {
        expect(
          appearance.entries.some(
            (e) => e.id === `headwear ${head.id} ${facing}`,
          ),
          `headwear ${head.id} ${facing} present`,
        ).toBe(true);
      }
    }
    const frame = (id: string): string =>
      appearance.entries.find((e) => e.id === id)?.frames[0]?.join("\n") ?? "";
    // The hair/eye interaction rules make each option read differently
    // over the same eyes + bob base.
    const looks = drawn.map((h) => frame(`headwear ${h.id} e`));
    expect(new Set(looks).size).toBe(drawn.length);
  });

  it("covers every wearable outfit per build and facing, each distinct", () => {
    const appearance = section("appearance");
    const outfits = items.filter(
      (i) => i.kind === "outfit" && i.outfitLayer !== undefined,
    );
    expect(outfits.length).toBeGreaterThanOrEqual(5);
    for (const item of outfits) {
      for (const build of BODY_BUILD_IDS) {
        for (const facing of ["n", "e", "s", "w"]) {
          expect(
            appearance.entries.some(
              (e) => e.id === `outfit ${item.id} ${build} ${facing}`,
            ),
            `outfit ${item.id} ${build} ${facing} present`,
          ).toBe(true);
        }
      }
    }
    const frame = (id: string): string =>
      appearance.entries.find((e) => e.id === id)?.frames[0]?.join("\n") ?? "";
    // Every item reads differently over the same lean base — distinct
    // families, and distinct materials where families could overlap.
    const looks = outfits.map((i) => frame(`outfit ${i.id} lean e`));
    expect(new Set(looks).size).toBe(outfits.length);
  });

  it("covers every weapon per build and facing, each class distinct", () => {
    const appearance = section("appearance");
    const weapons = items.filter(
      (i) => i.kind === "weapon" && i.weaponLayer !== undefined,
    );
    expect(weapons.length).toBeGreaterThanOrEqual(6);
    for (const item of weapons) {
      for (const build of BODY_BUILD_IDS) {
        for (const facing of ["n", "e", "s", "w"]) {
          expect(
            appearance.entries.some(
              (e) => e.id === `weapon ${item.id} ${build} ${facing}`,
            ),
            `weapon ${item.id} ${build} ${facing} present`,
          ).toBe(true);
        }
      }
    }
    const frame = (id: string): string =>
      appearance.entries.find((e) => e.id === id)?.frames[0]?.join("\n") ?? "";
    // Items sharing a class (both pistols, both blades) intentionally
    // read alike; every distinct class + accent silhouette is unique
    // over the same lean base.
    const classLooks = new Map<string, string>();
    for (const item of weapons) {
      if (item.kind !== "weapon" || !item.weaponLayer) continue;
      classLooks.set(
        JSON.stringify(item.weaponLayer),
        frame(`weapon ${item.id} lean e`),
      );
    }
    expect(new Set(classLooks.values()).size).toBe(classLooks.size);
  });

  it("covers every enhancement per build and facing, each install distinct", () => {
    const appearance = section("appearance");
    const enhancements = items.filter(
      (i) => i.kind === "enhancement" && i.cyberLayer !== undefined,
    );
    expect(enhancements.length).toBeGreaterThanOrEqual(7);
    for (const item of enhancements) {
      for (const build of BODY_BUILD_IDS) {
        for (const facing of ["n", "e", "s", "w"]) {
          expect(
            appearance.entries.some(
              (e) => e.id === `cyber ${item.id} ${build} ${facing}`,
            ),
            `cyber ${item.id} ${build} ${facing} present`,
          ).toBe(true);
        }
      }
    }
    const frame = (id: string): string =>
      appearance.entries.find((e) => e.id === id)?.frames[0]?.join("\n") ?? "";
    // Items sharing a family read apart through their glow recolor:
    // every family + accent pair is unique over the same lean base.
    const looks = new Map<string, string>();
    for (const item of enhancements) {
      if (item.kind !== "enhancement" || !item.cyberLayer) continue;
      looks.set(
        JSON.stringify(item.cyberLayer),
        frame(`cyber ${item.id} lean e`),
      );
    }
    expect(new Set(looks.values()).size).toBe(looks.size);
    // The pulsing optics genuinely animate across their idle frames.
    const optics = appearance.entries.find(
      (e) => e.id === "cyber cyb-optic-suite lean e",
    );
    expect(optics?.frames[0]?.join("\n")).not.toBe(
      optics?.frames[1]?.join("\n"),
    );
  });

  it("covers every drawn face detail up front, and cyber-lines glows", () => {
    const appearance = section("appearance");
    const drawn = FACE_DETAIL_OPTIONS.filter((o) => o.layer !== null);
    for (const detail of drawn) {
      expect(
        appearance.entries.some((e) => e.id === `detail ${detail.id} e`),
        `detail ${detail.id} present`,
      ).toBe(true);
    }
    const frame = (id: string, f = 0): string =>
      appearance.entries.find((e) => e.id === id)?.frames[f]?.join("\n") ?? "";
    // Every detail reads differently over the same default face.
    const looks = drawn.map((d) => frame(`detail ${d.id} e`));
    expect(new Set(looks).size).toBe(drawn.length);
    // The shimmer cycles: frame 0 sits dim, frame 1 lights neon cyan
    // trace pixels beyond the standard eyes' four iris pixels.
    const count = (f: number, ch: string): number =>
      [...frame("detail cyber-lines e", f)].filter((c) => c === ch).length;
    expect(count(0, "i")).toBeGreaterThan(0);
    expect(count(1, "g")).toBeGreaterThan(count(0, "g"));
  });
});

describe("gallery entries", () => {
  it("every frame is a valid palette-indexed grid", () => {
    for (const s of sections) {
      for (const entry of s.entries) {
        expect(entry.frames.length, `${s.id}/${entry.id} has frames`).toBeGreaterThan(0);
        entry.frames.forEach((grid, f) => {
          expect(gridErrors(grid), `${s.id}/${entry.id} frame ${f}`).toEqual([]);
        });
      }
    }
  });

  it("multi-frame entries carry a positive frame duration and animate", () => {
    for (const s of sections) {
      for (const entry of s.entries) {
        if (entry.frames.length > 1) {
          expect(entry.frameMs, `${s.id}/${entry.id} frameMs`).toBeGreaterThan(0);
        } else {
          expect(entry.frameMs, `${s.id}/${entry.id} static`).toBe(0);
        }
      }
    }
  });

  it("cast entries animate at the composed 32×48 layer frame", () => {
    const cast = section("cast");
    for (const entry of cast.entries) {
      expect(entry.frames.length, `${entry.id} frames`).toBeGreaterThan(1);
      expect(entry.frameMs, `${entry.id} frameMs`).toBeGreaterThan(0);
      expect(entry.frames[0]?.length, `${entry.id} height`).toBe(48);
      expect(entry.frames[0]?.[0]?.length, `${entry.id} width`).toBe(32);
    }
  });

  it("renders tiles at native 64×32", () => {
    for (const entry of section("tiles").entries) {
      for (const grid of entry.frames) {
        expect(grid.length, `${entry.id} height`).toBe(32);
        expect(grid[0]?.length, `${entry.id} width`).toBe(64);
      }
    }
  });

  it("authored cast looks are deliberate: distinct where they should be, shared where they should be", () => {
    const cast = section("cast");
    const frame = (id: string): string =>
      cast.entries.find((e) => e.id === id)?.frames[0]?.join("\n") ?? "";
    // Every record of every family reads as its own figure — within an
    // archetype and across the roster alike.
    const enemyLooks = enemies.flatMap((e) =>
      e.spriteKind === "humanoid"
        ? e.looks.map((_, look) => frame(`enemy ${e.id} look${look} s`))
        : [],
    );
    expect(new Set(enemyLooks).size).toBe(enemyLooks.length);
    // Flick is the same person on both maps.
    expect(frame("npc flick")).toBe(frame("npc flick-steps"));
    // Seeded ambient NPCs (no authored visual) differ from each other.
    expect(frame("npc vent-crew")).not.toBe(frame("npc muster-crowd"));
  });
});

describe("gallery filter", () => {
  it("matches case-insensitively by id substring", () => {
    expect(matchesQuery("pavement v0", "PAVE")).toBe(true);
    expect(matchesQuery("pavement v0", "  pave ")).toBe(true);
    expect(matchesQuery("pavement v0", "canal")).toBe(false);
    expect(matchesQuery("anything", "")).toBe(true);
  });

  it("narrows entries and drops empty sections", () => {
    const filtered = filterSections(sections, "pavement");
    expect(filtered.length).toBe(1);
    expect(filtered[0]?.id).toBe("tiles");
    expect(
      filtered[0]?.entries.every((e) => e.id.includes("pavement")),
    ).toBe(true);
    expect(filterSections(sections, "no-such-art")).toEqual([]);
  });

  it("keeps everything on an empty query", () => {
    const filtered = filterSections(sections, "");
    expect(filtered.map((s) => s.entries.length)).toEqual(
      sections.map((s) => s.entries.length),
    );
  });
});
