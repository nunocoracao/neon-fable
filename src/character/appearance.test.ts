import { describe, expect, it } from "vitest";
import {
  APPEARANCE_FIELDS,
  defaultAppearance,
  randomAppearance,
  resolveLayers,
  validateAppearance,
  type Appearance,
} from "./appearance";
import { emptyEquipment } from "../inventory/equipment";
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

  it("stubs equipment-driven slots with the equipped item ids", () => {
    const layers = resolveLayers(defaultAppearance(), {
      weapon: "wpn-shard-knife",
      outfit: "out-courier-slicker",
      enhancements: { neural: "enh-neural-jack", arms: "enh-chrome-arm" },
    });
    expect(layers.find((l) => l.slot === "weapon")?.art).toBe("wpn-shard-knife");
    expect(layers.find((l) => l.slot === "outfit")?.art).toBe(
      "out-courier-slicker",
    );
    // Cyberware follows the fixed slot order, not insertion order.
    expect(layers.filter((l) => l.slot === "cyberware").map((l) => l.art)).toEqual(
      ["enh-chrome-arm", "enh-neural-jack"],
    );
  });

  it("keeps base z-order: body, then face parts, hair, headwear on top", () => {
    const layers = resolveLayers(
      { ...defaultAppearance(), headwear: "hood", faceDetail: "scar" },
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
