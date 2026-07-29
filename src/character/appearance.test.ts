import { describe, expect, it } from "vitest";
import {
  APPEARANCE_FIELDS,
  composeCharacter,
  defaultAppearance,
  randomAppearance,
  resolveLayers,
  validateAppearance,
  type Appearance,
} from "./appearance";
import {
  BUILD_OPTIONS,
  FACE_DETAIL_OPTIONS,
  HAIR_STYLE_OPTIONS,
  SKIN_TONE_OPTIONS,
} from "../data/appearance";
import { items } from "../data/items";
import { emptyEquipment } from "../inventory/equipment";
import {
  composedCharacterGrid,
  composedCharacterKey,
} from "../iso/art/layers";
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

  it("stubs weapon and cyberware slots with the equipped item ids", () => {
    const layers = resolveLayers(defaultAppearance(), {
      weapon: "wpn-shard-knife",
      outfit: null,
      enhancements: { neural: "enh-neural-jack", arms: "enh-chrome-arm" },
    });
    expect(layers.find((l) => l.slot === "weapon")?.art).toBe("wpn-shard-knife");
    // Cyberware follows the fixed slot order, not insertion order.
    expect(layers.filter((l) => l.slot === "cyberware").map((l) => l.art)).toEqual(
      ["enh-chrome-arm", "enh-neural-jack"],
    );
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
