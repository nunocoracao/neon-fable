import { describe, expect, it } from "vitest";
import {
  APPEARANCE_FIELDS,
  composeCharacter,
  composeVisual,
  defaultAppearance,
  outfitDyeRemap,
  presetAppearanceFor,
  randomAppearance,
  randomizeUnlocked,
  resolveLayers,
  seededAppearance,
  validateAppearance,
  type Appearance,
  type AppearanceLocks,
  type CharacterVisual,
} from "./appearance";
import {
  BUILD_OPTIONS,
  FACE_DETAIL_OPTIONS,
  HAIR_STYLE_OPTIONS,
  SKIN_TONE_OPTIONS,
  backgroundPresets,
} from "../data/appearance";
import { backgrounds } from "../data/backgrounds";
import { getItem, items } from "../data/items";
import { emptyEquipment } from "../inventory/equipment";
import {
  composedCharacterGrid,
  composedCharacterKey,
  layerArtGrid,
} from "../iso/art/layers";
import { cyberArtId, cyberPulseFrames } from "../iso/art/layers/cyberware";
import { REMAP_CHANNELS } from "../iso/art/palette";
import { gridErrors } from "../iso/art/pixel";
import { createRng } from "../state/rng";

describe("validateAppearance", () => {
  it("accepts the default appearance", () => {
    expect(validateAppearance(defaultAppearance())).toEqual([]);
  });

  it("rejects an unknown id on every field, naming the field and id", () => {
    for (const field of APPEARANCE_FIELDS) {
      const broken: Appearance = { ...defaultAppearance(), [field]: "bogus" };
      expect(validateAppearance(broken)).toEqual([{ field, id: "bogus" }]);
    }
  });

  it("collects every invalid field at once", () => {
    const broken: Appearance = {
      ...defaultAppearance(),
      skinTone: "chrome",
      headwear: "crown",
    };
    expect(validateAppearance(broken)).toHaveLength(2);
  });
});

describe("randomAppearance", () => {
  it("always validates, across many seeds", () => {
    for (let seed = 0; seed < 200; seed++) {
      const { value } = randomAppearance(createRng(seed));
      expect(validateAppearance(value)).toEqual([]);
    }
  });

  it("is deterministic for a given seed and advances the rng state", () => {
    const rng = createRng(1234);
    const first = randomAppearance(rng);
    const second = randomAppearance(rng);
    expect(second.value).toEqual(first.value);
    expect(first.state).not.toEqual(rng);
    // Continuing from the returned state rolls a fresh look.
    const next = randomAppearance(first.state);
    expect(next.state).not.toEqual(first.state);
  });

  it("reaches every catalog option somewhere in the seed space", () => {
    const seenBuilds = new Set<string>();
    const seenHair = new Set<string>();
    for (let seed = 0; seed < 300; seed++) {
      const { value } = randomAppearance(createRng(seed));
      seenBuilds.add(value.build);
      seenHair.add(value.hairStyle);
    }
    expect(seenBuilds.size).toBeGreaterThan(1);
    expect(seenHair.size).toBeGreaterThan(2);
  });
});

describe("randomizeUnlocked", () => {
  it("keeps locked categories and always validates, across many seeds", () => {
    const start = presetAppearanceFor("grid-diver");
    const locks: AppearanceLocks = {
      hairStyle: true,
      hairColor: true,
      headwear: true,
    };
    for (let seed = 0; seed < 200; seed++) {
      const { value } = randomizeUnlocked(start, locks, createRng(seed));
      expect(validateAppearance(value), `seed ${seed}`).toEqual([]);
      expect(value.hairStyle, `seed ${seed}`).toBe(start.hairStyle);
      expect(value.hairColor, `seed ${seed}`).toBe(start.hairColor);
      expect(value.headwear, `seed ${seed}`).toBe(start.headwear);
    }
  });

  it("validates under arbitrary lock subsets", () => {
    for (let seed = 0; seed < 100; seed++) {
      // Derive a different lock subset per seed from its bits.
      const locks = Object.fromEntries(
        APPEARANCE_FIELDS.map((field, i) => [field, ((seed >> i) & 1) === 1]),
      ) as AppearanceLocks;
      const { value } = randomizeUnlocked(
        defaultAppearance(),
        locks,
        createRng(seed),
      );
      expect(validateAppearance(value), `seed ${seed}`).toEqual([]);
      for (const field of APPEARANCE_FIELDS) {
        if (locks[field]) {
          expect(value[field], `seed ${seed} ${field}`).toBe(
            defaultAppearance()[field],
          );
        }
      }
    }
  });

  it("is deterministic and advances the rng only for unlocked fields", () => {
    const rng = createRng(77);
    const locks: AppearanceLocks = { build: true, mouth: true };
    const first = randomizeUnlocked(defaultAppearance(), locks, rng);
    expect(randomizeUnlocked(defaultAppearance(), locks, rng)).toEqual(first);
    expect(first.state).not.toEqual(rng);

    // Every field locked: the look and the rng state both come back
    // untouched — repeated clicks with all locks burn no entropy.
    const allLocked = Object.fromEntries(
      APPEARANCE_FIELDS.map((field) => [field, true]),
    ) as AppearanceLocks;
    const frozen = randomizeUnlocked(first.value, allLocked, rng);
    expect(frozen.value).toEqual(first.value);
    expect(frozen.state).toEqual(rng);
  });

  it("with nothing locked it matches randomAppearance from the same state", () => {
    for (const seed of [0, 9, 4321]) {
      expect(
        randomizeUnlocked(
          presetAppearanceFor("tower-analyst"),
          {},
          createRng(seed),
        ),
      ).toEqual(randomAppearance(createRng(seed)));
    }
  });
});

describe("presetAppearanceFor", () => {
  it("returns every background's first preset as a fresh, valid copy", () => {
    for (const background of backgrounds) {
      const first = backgroundPresets(background.id)[0]!;
      const seeded = presetAppearanceFor(background.id);
      expect(seeded, background.id).toEqual(first.appearance);
      // A copy: editing the working look never mutates the preset data.
      expect(seeded, background.id).not.toBe(first.appearance);
      expect(validateAppearance(seeded), background.id).toEqual([]);
    }
  });

  it("falls back to the stock look for a background without presets", () => {
    expect(presetAppearanceFor("no-such-background")).toEqual(
      defaultAppearance(),
    );
  });
});

describe("resolveLayers", () => {
  it("is deterministic: equal inputs give deeply equal descriptors", () => {
    const a = resolveLayers(defaultAppearance(), emptyEquipment());
    const b = resolveLayers(defaultAppearance(), emptyEquipment());
    expect(b).toEqual(a);
  });

  it("puts the body first and applies the skin remap to it", () => {
    const layers = resolveLayers(
      { ...defaultAppearance(), skinTone: "deep-umber", build: "heavy" },
      emptyEquipment(),
    );
    expect(layers[0]).toEqual({
      slot: "body",
      art: "heavy",
      // Canonical porcelain channel (r/q/A) onto the deep-umber ramp.
      remap: { r: "I", q: "H", A: "J" },
    });
  });

  it("remaps hair and brows to the chosen hair color, eyes to the eye color", () => {
    const layers = resolveLayers(
      {
        ...defaultAppearance(),
        hairStyle: "bob",
        hairColor: "synth-violet",
        eyeColor: "amber",
      },
      emptyEquipment(),
    );
    const hair = layers.find((l) => l.slot === "hair");
    expect(hair).toEqual({ slot: "hair", art: "bob", remap: { K: "P" } });
    const brows = layers.find((l) => l.art === "straight");
    expect(brows?.remap).toEqual({ K: "P" });
    const eyes = layers.find((l) => l.art === "standard");
    expect(eyes?.remap).toMatchObject({ g: "m" });
  });

  it("skips 'none' hair, headwear, and face detail entirely", () => {
    const layers = resolveLayers(
      { ...defaultAppearance(), hairStyle: "none" },
      emptyEquipment(),
    );
    expect(layers.some((l) => l.slot === "hair")).toBe(false);
    expect(layers.some((l) => l.slot === "headwear")).toBe(false);
    expect(layers.some((l) => l.art === "none")).toBe(false);
  });

  it("resolves the equipped weapon's class layer per build, with its accent", () => {
    const layers = resolveLayers(defaultAppearance(), {
      weapon: "wpn-shard-knife",
      outfit: null,
      enhancements: {
        neural: "cyb-lattice-coprocessor",
        arms: "cyb-myomer-arms",
      },
    });
    // The shard knife's blade class, keyed to the lean default build.
    expect(layers.find((l) => l.slot === "weapon")).toEqual({
      slot: "weapon",
      art: "blade@lean",
      remap: {},
    });
    // Installed cyberware resolves per build too, in fixed slot order.
    expect(layers.filter((l) => l.slot === "cyberware").map((l) => l.art)).toEqual(
      ["chrome-arm@lean", "neural-jack@lean"],
    );

    // The heavy build keys the same class to its own grid set, and an
    // accented weapon carries its energy recolor (stun tip -> hologram).
    const heavy = resolveLayers(
      { ...defaultAppearance(), build: "heavy" },
      { weapon: "wpn-stun-baton", outfit: null, enhancements: {} },
    );
    expect(heavy.find((l) => l.slot === "weapon")).toEqual({
      slot: "weapon",
      art: "baton@heavy",
      remap: { l: "s", j: "t", k: "u" },
    });
  });

  it("falls through to empty hands when unarmed or the weapon has no layer", () => {
    const unarmed = resolveLayers(defaultAppearance(), emptyEquipment());
    expect(unarmed.some((l) => l.slot === "weapon")).toBe(false);

    // Unknown ids and weapons without a layer reference degrade the
    // same way — bare hands, never a crash.
    const unknown = resolveLayers(defaultAppearance(), {
      weapon: "wpn-vaporware",
      outfit: null,
      enhancements: {},
    });
    expect(unknown.some((l) => l.slot === "weapon")).toBe(false);

    const bareFixture = resolveLayers(
      defaultAppearance(),
      { weapon: "wpn-fixture", outfit: null, enhancements: {} },
      (id) =>
        id === "wpn-fixture"
          ? {
              id,
              kind: "weapon",
              name: "Fixture",
              description: "",
              damage: 1,
              rangeType: "melee",
              effects: [],
            }
          : undefined,
    );
    expect(bareFixture.some((l) => l.slot === "weapon")).toBe(false);
  });

  it("wires the cyber-lines catalog shimmer onto its face layer only", () => {
    const layers = resolveLayers(
      { ...defaultAppearance(), faceDetail: "cyber-lines" },
      emptyEquipment(),
    );
    const detail = layers.find((l) => l.art === "cyber-lines");
    expect(detail?.shimmer).toBe(
      FACE_DETAIL_OPTIONS.find((o) => o.id === "cyber-lines")?.shimmer,
    );
    for (const layer of layers) {
      if (layer.art !== "cyber-lines") {
        expect(layer.shimmer, layer.art).toBeUndefined();
      }
    }
    // Static details resolve without any shimmer at all.
    const inked = resolveLayers(
      { ...defaultAppearance(), faceDetail: "circuit-ink" },
      emptyEquipment(),
    );
    expect(inked.every((l) => l.shimmer === undefined)).toBe(true);
  });

  it("keeps base z-order: body, then face parts, hair, headwear on top", () => {
    // The cap crushes hair (it stays a layer) and leaves eyes visible,
    // so every slot appears.
    const layers = resolveLayers(
      { ...defaultAppearance(), headwear: "cap", faceDetail: "scar" },
      emptyEquipment(),
    );
    const slots = layers.map((l) => l.slot);
    expect(slots).toEqual([
      "body",
      "face", // eyes
      "face", // brows
      "face", // mouth
      "face", // face detail
      "hair",
      "headwear",
    ]);
  });

  it("throws on an invalid appearance instead of composing garbage", () => {
    expect(() =>
      resolveLayers(
        { ...defaultAppearance(), eyes: "laser" },
        emptyEquipment(),
      ),
    ).toThrow(/eyes="laser"/);
  });
});

describe("equipped outfit resolution", () => {
  const wearing = (outfit: string | null, build = "lean") =>
    resolveLayers(
      { ...defaultAppearance(), build },
      { ...emptyEquipment(), outfit },
    );

  it("swaps the outfit layer to the item's family, keyed per build", () => {
    expect(wearing("out-courier-slicker").find((l) => l.slot === "outfit"))
      .toEqual({ slot: "outfit", art: "slicker@lean", remap: {} });
    expect(
      wearing("out-courier-slicker", "heavy").find((l) => l.slot === "outfit")
        ?.art,
    ).toBe("slicker@heavy");
  });

  it("applies the item's data-driven material remaps per channel", () => {
    const plate = wearing("out-cordon-plate").find((l) => l.slot === "outfit");
    expect(plate).toEqual({
      slot: "outfit",
      art: "plate@lean",
      // Primary cloth onto brushed chrome, accent onto hazard amber.
      remap: { V: "6", W: "T", X: "9", l: "Y", j: "Z", k: "n" },
    });
    const harness = wearing("out-diver-harness").find(
      (l) => l.slot === "outfit",
    );
    expect(harness?.remap).toEqual({ l: "Y", j: "Z", k: "n" });
  });

  it("sits between the body and the face layers", () => {
    const layers = wearing("out-spire-suit");
    const slots = layers.map((l) => l.slot);
    expect(slots.indexOf("outfit")).toBe(slots.indexOf("body") + 1);
    expect(slots.indexOf("outfit")).toBeLessThan(slots.indexOf("face"));
  });

  it("falls back to the base garb for unknown ids and layerless items", () => {
    expect(wearing(null).some((l) => l.slot === "outfit")).toBe(false);
    expect(wearing("out-no-such-item").some((l) => l.slot === "outfit")).toBe(
      false,
    );
    // An injected fixture without an outfitLayer draws nothing either.
    const layers = resolveLayers(defaultAppearance(), {
      ...emptyEquipment(),
      outfit: "fixture-vest",
    }, () => ({
      id: "fixture-vest",
      kind: "outfit",
      name: "Fixture Vest",
      description: "test-only",
      armor: 1,
      effects: [],
    }));
    expect(layers.some((l) => l.slot === "outfit")).toBe(false);
  });

  it("color picks change the descriptor key (swatch thumbs re-bake)", () => {
    // The picker's mini/portrait caches key on the composed descriptor,
    // so a new skin, hair, or eye color must yield a new key — that is
    // what invalidates every visible thumbnail on a swatch pick.
    const key = (patch: Partial<Appearance>): string =>
      composedCharacterKey(
        composeCharacter(
          { ...defaultAppearance(), ...patch },
          emptyEquipment(),
        ),
      );
    const keys = [
      key({}),
      key({ skinTone: "deep-umber" }),
      key({ hairColor: "silver" }),
      key({ eyeColor: "crimson" }),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every wearable item and the bare look have distinct descriptor keys", () => {
    const outfits = items.filter((i) => i.kind === "outfit").map((i) => i.id);
    expect(outfits.length).toBeGreaterThanOrEqual(5);
    const keys = [null, ...outfits].map((outfit) =>
      composedCharacterKey(
        composeCharacter(defaultAppearance(), {
          ...emptyEquipment(),
          outfit,
        }),
      ),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("equipping and unequipping changes the composed grid immediately", () => {
    const grid = (outfit: string | null): string =>
      composedCharacterGrid(
        composeCharacter(defaultAppearance(), { ...emptyEquipment(), outfit }),
        "e",
        "idle",
        0,
      ).join("\n");
    expect(grid("out-courier-slicker")).not.toBe(grid(null));
    expect(grid("out-cordon-plate")).not.toBe(grid("out-courier-slicker"));
  });
});

describe("headwear hair-interaction rules", () => {
  const withHeadwear = (headwear: string, hairStyle = "bob") =>
    resolveLayers(
      {
        ...defaultAppearance(),
        hairStyle,
        hairColor: "synth-violet",
        headwear,
      },
      emptyEquipment(),
    );

  it("'shows': the visor leaves hair unchanged", () => {
    const layers = withHeadwear("visor");
    expect(layers.find((l) => l.slot === "hair")).toEqual({
      slot: "hair",
      art: "bob",
      remap: { K: "P" },
    });
    expect(layers.find((l) => l.slot === "headwear")?.art).toBe("visor");
  });

  it("'crushes': the cap swaps hair to its group's flattened variant, keeping the color remap", () => {
    const long = withHeadwear("cap").find((l) => l.slot === "hair");
    expect(long).toEqual({
      slot: "hair",
      art: HAIR_STYLE_OPTIONS.find((o) => o.id === "bob")?.crushed,
      remap: { K: "P" },
    });
    const short = withHeadwear("cap", "buzz").find((l) => l.slot === "hair");
    expect(short?.art).toBe(
      HAIR_STYLE_OPTIONS.find((o) => o.id === "buzz")?.crushed,
    );
    expect(short?.art).not.toBe(long?.art);
  });

  it("'hides': the hood omits the hair layer entirely", () => {
    const layers = withHeadwear("hood");
    expect(layers.some((l) => l.slot === "hair")).toBe(false);
    expect(layers.find((l) => l.slot === "headwear")?.art).toBe("hood");
  });

  it("crushing follows the catalog data on the edge styles", () => {
    // Shaved hair has no crushed variant: no hair layer under the cap.
    expect(
      withHeadwear("cap", "none").some((l) => l.slot === "hair"),
    ).toBe(false);
    // The glyph's scalp dye maps to itself.
    expect(
      withHeadwear("cap", "glyph").find((l) => l.slot === "hair")?.art,
    ).toBe("glyph");
  });

  it("coversEyes drops the eyes layer for the visor and rebreather only", () => {
    const eyesArt = "standard";
    for (const headwear of ["visor", "rebreather"]) {
      const layers = withHeadwear(headwear);
      expect(
        layers.some((l) => l.art === eyesArt),
        headwear,
      ).toBe(false);
      // The other face parts stay.
      expect(layers.filter((l) => l.slot === "face")).toHaveLength(2);
    }
    for (const headwear of ["none", "cap", "hood"]) {
      expect(
        withHeadwear(headwear).some((l) => l.art === eyesArt),
        headwear,
      ).toBe(true);
    }
  });

  it("the rebreather both crushes hair and covers the eyes", () => {
    const layers = withHeadwear("rebreather");
    expect(layers.find((l) => l.slot === "hair")?.art).toBe(
      HAIR_STYLE_OPTIONS.find((o) => o.id === "bob")?.crushed,
    );
    expect(layers.some((l) => l.art === "standard")).toBe(false);
    expect(layers.find((l) => l.slot === "headwear")?.art).toBe("rebreather");
  });
});

describe("installed cyberware resolution", () => {
  const installed = (
    enhancements: Partial<Record<"eyes" | "arms" | "neural" | "dermal", string>>,
    appearance = defaultAppearance(),
  ) => resolveLayers(appearance, { ...emptyEquipment(), enhancements });

  const enhancementItems = items.filter((i) => i.kind === "enhancement");

  it("every installable enhancement shows a registered overlay layer", () => {
    for (const item of enhancementItems) {
      if (item.kind !== "enhancement") continue;
      const layers = installed({ [item.slot]: item.id });
      const cyber = layers.filter((l) => l.slot === "cyberware");
      expect(cyber, item.id).toHaveLength(1);
      const art = cyber[0]?.art ?? "";
      expect(art, item.id).toBe(cyberArtId(item.cyberLayer?.id ?? "", "lean"));
      for (const view of ["front", "back"] as const) {
        expect(layerArtGrid("cyberware", art, view), `${item.id} ${view}`)
          .not.toBeNull();
      }
      // Installing visibly changes the composed sprite.
      const grid = composedCharacterGrid(
        composeCharacter(defaultAppearance(), {
          ...emptyEquipment(),
          enhancements: { [item.slot]: item.id },
        }),
        "e",
        "idle",
        0,
      ).join("\n");
      const bare = composedCharacterGrid(
        composeCharacter(defaultAppearance(), emptyEquipment()),
        "e",
        "idle",
        0,
      ).join("\n");
      expect(grid, item.id).not.toBe(bare);
    }
  });

  it("keys the overlay to the character's build", () => {
    const heavy = resolveLayers(
      { ...defaultAppearance(), build: "heavy" },
      { ...emptyEquipment(), enhancements: { arms: "cyb-myomer-arms" } },
    );
    expect(heavy.find((l) => l.slot === "cyberware")?.art).toBe(
      "chrome-arm@heavy",
    );
  });

  it("applies the item's accent recolor to the glow channel", () => {
    const amber = installed({ arms: "cyb-myomer-arms" }).find(
      (l) => l.slot === "cyberware",
    );
    expect(amber?.remap).toEqual({ l: "Y", j: "Z", k: "n" });
    const plain = installed({ dermal: "cyb-dermal-weave" }).find(
      (l) => l.slot === "cyberware",
    );
    expect(plain?.remap).toEqual({});
  });

  it("multi-install composition is deterministic, ordered, and validates", () => {
    const full = {
      eyes: "cyb-optic-suite",
      arms: "cyb-torsion-frame",
      neural: "cyb-cascade-governor",
      dermal: "cyb-dermal-weave",
    };
    const layers = installed(full);
    expect(layers).toEqual(installed(full));
    // Fixed install-slot order, whatever the record's key order was.
    expect(layers.filter((l) => l.slot === "cyberware").map((l) => l.art)).toEqual([
      "optics@lean",
      "chrome-arm@lean",
      "neural-jack@lean",
      "dermal-plate@lean",
    ]);
    expect(
      installed({
        dermal: "cyb-dermal-weave",
        arms: "cyb-torsion-frame",
        neural: "cyb-cascade-governor",
        eyes: "cyb-optic-suite",
      }),
    ).toEqual(layers);
    // The full chrome loadout composes into valid frames on every facing.
    const character = composeCharacter(defaultAppearance(), {
      ...emptyEquipment(),
      enhancements: full,
    });
    for (const facing of ["n", "e", "s", "w"] as const) {
      const grid = composedCharacterGrid(character, facing, "idle", 0);
      expect(gridErrors(grid), facing).toEqual([]);
    }
  });

  it("every install combination has a distinct descriptor key", () => {
    const combos: Array<Partial<Record<"eyes" | "arms" | "neural" | "dermal", string>>> = [
      {},
      ...enhancementItems.flatMap((item) =>
        item.kind === "enhancement" ? [{ [item.slot]: item.id }] : [],
      ),
      { eyes: "cyb-optic-suite", arms: "cyb-myomer-arms" },
    ];
    const keys = combos.map((enhancements) =>
      composedCharacterKey(
        composeCharacter(defaultAppearance(), {
          ...emptyEquipment(),
          enhancements,
        }),
      ),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("wires the 2-frame pulse onto glowing families only, and it renders", () => {
    const optics = installed({ eyes: "cyb-optic-suite" }).find(
      (l) => l.slot === "cyberware",
    );
    expect(optics?.shimmer).toEqual(cyberPulseFrames("neonCyan"));
    expect(optics?.shimmer).toHaveLength(2);
    const veil = installed({ dermal: "cyb-static-veil" }).find(
      (l) => l.slot === "cyberware",
    );
    expect(veil?.shimmer).toEqual(cyberPulseFrames("hologramBlue"));
    for (const id of ["cyb-myomer-arms", "cyb-lattice-coprocessor"]) {
      const item = getItem(id);
      if (item?.kind !== "enhancement") continue;
      const layer = installed({ [item.slot]: id }).find(
        (l) => l.slot === "cyberware",
      );
      expect(layer?.shimmer, id).toBeUndefined();
    }
    // The pulse reaches the composed frames: the cyan flare ("h") only
    // exists on the flare phase; the dim phase sinks the glow to "i".
    const character = composeCharacter(defaultAppearance(), {
      ...emptyEquipment(),
      enhancements: { eyes: "cyb-optic-suite" },
    });
    const count = (frame: number, ch: string): number =>
      composedCharacterGrid(character, "e", "idle", frame)
        .join("")
        .split(ch).length - 1;
    expect(count(0, "h")).toBe(0);
    expect(count(0, "i")).toBeGreaterThan(0);
    expect(count(1, "h")).toBeGreaterThan(0);
  });

  it("eye-covering headwear hides the optic glow on the sprite only", () => {
    for (const headwear of ["visor", "rebreather"]) {
      const layers = installed(
        { eyes: "cyb-warden-optics", arms: "cyb-myomer-arms" },
        { ...defaultAppearance(), headwear },
      );
      expect(
        layers.some((l) => l.art === "optics@lean"),
        headwear,
      ).toBe(false);
      // Other installs stay visible under the same helmet.
      expect(
        layers.some((l) => l.art === "chrome-arm@lean"),
        headwear,
      ).toBe(true);
    }
    for (const headwear of ["none", "cap", "hood"]) {
      expect(
        installed(
          { eyes: "cyb-warden-optics" },
          { ...defaultAppearance(), headwear },
        ).some((l) => l.art === "optics@lean"),
        headwear,
      ).toBe(true);
    }
  });

  it("degrades to no visible mark for unknown ids and layerless fixtures", () => {
    expect(
      installed({ arms: "cyb-vaporware" }).some((l) => l.slot === "cyberware"),
    ).toBe(false);
    const layers = resolveLayers(
      defaultAppearance(),
      { ...emptyEquipment(), enhancements: { dermal: "cyb-fixture" } },
      (id) =>
        id === "cyb-fixture"
          ? {
              id,
              kind: "enhancement",
              name: "Fixture Graft",
              description: "test-only",
              slot: "dermal",
              neuralCost: 1,
              staticLoad: 1,
              effects: [],
            }
          : undefined,
    );
    expect(layers.some((l) => l.slot === "cyberware")).toBe(false);
  });
});

describe("composeCharacter", () => {
  it("maps every build option onto its authored body grid set", () => {
    for (const option of BUILD_OPTIONS) {
      const composed = composeCharacter(
        { ...defaultAppearance(), build: option.id },
        emptyEquipment(),
      );
      expect(composed.build, option.id).toBe(option.build);
      expect(composed.layers[0], option.id).toMatchObject({
        slot: "body",
        art: option.build,
      });
    }
  });

  it("carries the resolved layer stack", () => {
    const appearance = defaultAppearance();
    const equipment = emptyEquipment();
    expect(composeCharacter(appearance, equipment).layers).toEqual(
      resolveLayers(appearance, equipment),
    );
  });

  it("descriptor cache keys differ exactly when the appearance differs", () => {
    const key = (appearance: Appearance): string =>
      composedCharacterKey(composeCharacter(appearance, emptyEquipment()));
    expect(key(defaultAppearance())).toBe(key(defaultAppearance()));
    const variants = [
      defaultAppearance(),
      { ...defaultAppearance(), skinTone: "golden-tan" },
      { ...defaultAppearance(), skinTone: "warm-brown" },
      { ...defaultAppearance(), skinTone: "deep-umber" },
      { ...defaultAppearance(), build: "heavy" },
      { ...defaultAppearance(), eyeColor: "amber" },
      { ...defaultAppearance(), hairStyle: "none" },
      { ...defaultAppearance(), mouth: "smirk" },
      { ...defaultAppearance(), faceDetail: "scar" },
      { ...defaultAppearance(), faceDetail: "cyber-lines" },
      { ...defaultAppearance(), headwear: "cap" },
      { ...defaultAppearance(), headwear: "hood" },
      { ...defaultAppearance(), headwear: "visor" },
      { ...defaultAppearance(), headwear: "rebreather" },
    ];
    expect(new Set(variants.map(key)).size).toBe(variants.length);
  });

  it("renders through the layer engine: distinct grids per tone and build", () => {
    const grid = (appearance: Appearance): string =>
      composedCharacterGrid(
        composeCharacter(appearance, emptyEquipment()),
        "e",
        "idle",
        0,
      ).join("\n");
    const looks = [
      ...SKIN_TONE_OPTIONS.map((tone) => ({
        ...defaultAppearance(),
        skinTone: tone.id,
      })),
      ...BUILD_OPTIONS.map((build) => ({
        ...defaultAppearance(),
        build: build.id,
      })),
    ];
    // 4 tones on the lean build + heavy; "lean" appears in both sets.
    expect(new Set(looks.map(grid)).size).toBe(looks.length - 1);
  });
});

describe("seededAppearance", () => {
  it("is deterministic: the same seed always produces the same look", () => {
    for (const seed of [0, 1, 7, 0xdeadbeef, 4294967295]) {
      expect(seededAppearance(seed)).toEqual(seededAppearance(seed));
    }
  });

  it("always validates against the catalogs", () => {
    for (let seed = 0; seed < 250; seed++) {
      expect(validateAppearance(seededAppearance(seed)), `seed ${seed}`).toEqual(
        [],
      );
    }
  });

  it("produces real variety across seeds", () => {
    const looks = new Set(
      Array.from({ length: 50 }, (_, seed) =>
        JSON.stringify(seededAppearance(seed)),
      ),
    );
    expect(looks.size).toBeGreaterThan(40);
  });
});

describe("composeVisual", () => {
  it("matches composeCharacter over the equivalent equipment state", () => {
    const visual: CharacterVisual = {
      appearance: defaultAppearance(),
      weapon: "wpn-compact-pistol",
      outfit: "out-spire-suit",
      enhancements: { arms: "cyb-myomer-arms" },
    };
    expect(composeVisual(visual)).toEqual(
      composeCharacter(visual.appearance, {
        weapon: "wpn-compact-pistol",
        outfit: "out-spire-suit",
        enhancements: { arms: "cyb-myomer-arms" },
      }),
    );
  });

  it("treats omitted gear as empty equipment", () => {
    expect(composeVisual({ appearance: defaultAppearance() })).toEqual(
      composeCharacter(defaultAppearance(), emptyEquipment()),
    );
  });

  it("draws authored gear: outfit, weapon, and cyberware layers appear", () => {
    const { layers } = composeVisual({
      appearance: defaultAppearance(),
      weapon: "wpn-compact-pistol",
      outfit: "out-spire-suit",
      enhancements: { arms: "cyb-myomer-arms" },
    });
    const slots = layers.map((layer) => layer.slot);
    expect(slots).toContain("outfit");
    expect(slots).toContain("weapon");
    expect(slots).toContain("cyberware");
  });

  it("rejects an invalid appearance", () => {
    const broken = { ...defaultAppearance(), hairStyle: "bogus" };
    expect(() => composeVisual({ appearance: broken })).toThrow(/hairStyle/);
  });

  it("lays a crew dye over the outfit layer's own material remap", () => {
    const visual: CharacterVisual = {
      appearance: defaultAppearance(),
      outfit: "out-spire-suit",
      outfitDye: { accent: "hazardAmber" },
    };
    const plain = composeVisual({ ...visual, outfitDye: undefined });
    const dyed = composeVisual(visual);
    const outfitOf = (c: typeof dyed) =>
      c.layers.find((layer) => layer.slot === "outfit");
    // Same layer, same art, different colors — and every other layer
    // untouched, because only cloth is dyed.
    expect(outfitOf(dyed)?.art).toBe(outfitOf(plain)?.art);
    expect(outfitOf(dyed)?.remap).not.toEqual(outfitOf(plain)?.remap);
    expect(dyed.layers.filter((l) => l.slot !== "outfit")).toEqual(
      plain.layers.filter((l) => l.slot !== "outfit"),
    );
  });

  it("keeps the channels a dye does not name", () => {
    const base: CharacterVisual = {
      appearance: defaultAppearance(),
      outfit: "out-cordon-plate",
    };
    const plain = composeVisual(base);
    const dyed = composeVisual({ ...base, outfitDye: { accent: "neonCyan" } });
    const outfitOf = (c: typeof dyed) =>
      c.layers.find((layer) => layer.slot === "outfit")?.remap ?? {};
    const [primaryShade] = REMAP_CHANNELS.outfitPrimary;
    // The plate's own brushed-chrome cloth survives an accent-only dye.
    expect(outfitOf(dyed)[primaryShade as string]).toBe(
      outfitOf(plain)[primaryShade as string],
    );
  });

  it("ignores a dye on a look wearing nothing to dye", () => {
    const bare: CharacterVisual = { appearance: defaultAppearance() };
    expect(composeVisual({ ...bare, outfitDye: { accent: "neonCyan" } })).toEqual(
      composeVisual(bare),
    );
  });

  it("resolves an empty dye to nothing at all", () => {
    expect(outfitDyeRemap(undefined)).toBeNull();
    expect(outfitDyeRemap({})).toBeNull();
    expect(outfitDyeRemap({ accent: "neonCyan" })).not.toBeNull();
  });
});
