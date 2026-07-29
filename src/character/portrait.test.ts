import { describe, expect, it } from "vitest";
import {
  BROWS_OPTIONS,
  BUILD_OPTIONS,
  EXPRESSION_IDS,
  EYES_OPTIONS,
  EYE_COLOR_OPTIONS,
  FACE_DETAIL_OPTIONS,
  HAIR_COLOR_OPTIONS,
  HAIR_STYLE_OPTIONS,
  HEADWEAR_OPTIONS,
  MOUTH_OPTIONS,
  SKIN_TONE_OPTIONS,
} from "../data/appearance";
import { items } from "../data/items";
import { emptyEquipment } from "../inventory/equipment";
import { CYBER_PORTRAITS } from "../iso/art/layers/cyberware";
import { PORTRAIT_FRAME } from "../iso/art/layers/portrait";
import { gridErrors } from "../iso/art/pixel";
import { createRng } from "../state/rng";
import { defaultAppearance, randomAppearance, type Appearance } from "./appearance";
import { composePortrait, portraitKey, resolvePortraitParts } from "./portrait";

const base = defaultAppearance;
const bare = emptyEquipment;

const render = (
  appearance: Appearance,
  equipment = bare(),
  expression: Parameters<typeof composePortrait>[2] = "neutral",
): string => composePortrait(appearance, equipment, expression).join("\n");

describe("composePortrait", () => {
  it("produces a valid 48×48 grid, deterministically", () => {
    const grid = composePortrait(base(), bare());
    expect(grid).toHaveLength(PORTRAIT_FRAME.height);
    expect(grid.every((row) => row.length === PORTRAIT_FRAME.width)).toBe(true);
    expect(gridErrors(grid)).toEqual([]);
    expect(composePortrait(base(), bare())).toEqual(grid);
  });

  it("throws on an invalid appearance instead of composing garbage", () => {
    expect(() =>
      composePortrait({ ...base(), hairStyle: "beehive" }, bare()),
    ).toThrow(/hairStyle="beehive"/);
  });

  it("sweeps clean over build × hair × headwear × face detail", () => {
    for (const build of BUILD_OPTIONS) {
      for (const hair of HAIR_STYLE_OPTIONS) {
        for (const headwear of HEADWEAR_OPTIONS) {
          for (const detail of FACE_DETAIL_OPTIONS) {
            const appearance = {
              ...base(),
              build: build.id,
              hairStyle: hair.id,
              headwear: headwear.id,
              faceDetail: detail.id,
            };
            const label = `${build.id}/${hair.id}/${headwear.id}/${detail.id}`;
            expect(
              gridErrors(composePortrait(appearance, bare())),
              label,
            ).toEqual([]);
          }
        }
      }
    }
  });

  it("sweeps clean over eyes × brows × mouth × expression", () => {
    for (const eyes of EYES_OPTIONS) {
      for (const brows of BROWS_OPTIONS) {
        for (const mouth of MOUTH_OPTIONS) {
          for (const expression of EXPRESSION_IDS) {
            const appearance = {
              ...base(),
              eyes: eyes.id,
              brows: brows.id,
              mouth: mouth.id,
            };
            const label = `${eyes.id}/${brows.id}/${mouth.id}/${expression}`;
            expect(
              gridErrors(composePortrait(appearance, bare(), expression)),
              label,
            ).toEqual([]);
          }
        }
      }
    }
  });

  it("sweeps clean over every color catalog and random looks", () => {
    for (const skinTone of SKIN_TONE_OPTIONS) {
      expect(
        gridErrors(composePortrait({ ...base(), skinTone: skinTone.id }, bare())),
        skinTone.id,
      ).toEqual([]);
    }
    for (const hairColor of HAIR_COLOR_OPTIONS) {
      expect(
        gridErrors(
          composePortrait({ ...base(), hairColor: hairColor.id }, bare()),
        ),
        hairColor.id,
      ).toEqual([]);
    }
    for (const eyeColor of EYE_COLOR_OPTIONS) {
      expect(
        gridErrors(composePortrait({ ...base(), eyeColor: eyeColor.id }, bare())),
        eyeColor.id,
      ).toEqual([]);
    }
    for (let seed = 0; seed < 50; seed++) {
      const { value } = randomAppearance(createRng(seed));
      expect(gridErrors(composePortrait(value, bare())), `seed ${seed}`).toEqual(
        [],
      );
    }
  });

  it("sweeps clean over every wearable and installable item", () => {
    for (const item of items) {
      if (item.kind === "outfit") {
        const equipment = { ...bare(), outfit: item.id };
        expect(gridErrors(composePortrait(base(), equipment)), item.id).toEqual(
          [],
        );
      }
      if (item.kind === "enhancement") {
        const equipment = { ...bare(), enhancements: { [item.slot]: item.id } };
        expect(gridErrors(composePortrait(base(), equipment)), item.id).toEqual(
          [],
        );
      }
    }
  });

  it("every appearance category changes the composed portrait", () => {
    const bareLook = render(base());
    const variants: Array<[string, Appearance]> = [
      ["skinTone", { ...base(), skinTone: "deep-umber" }],
      ["build", { ...base(), build: "heavy" }],
      ["hairStyle", { ...base(), hairStyle: "mohawk" }],
      ["hairColor", { ...base(), hairColor: "synth-violet" }],
      ["eyes", { ...base(), eyes: "cyber-band" }],
      ["eyeColor", { ...base(), eyeColor: "crimson" }],
      ["brows", { ...base(), brows: "heavy" }],
      ["mouth", { ...base(), mouth: "breather" }],
      ["faceDetail", { ...base(), faceDetail: "circuit-ink" }],
      ["headwear", { ...base(), headwear: "hood" }],
    ];
    for (const [field, appearance] of variants) {
      expect(render(appearance), field).not.toBe(bareLook);
    }
  });
});

describe("expressions", () => {
  it("every expression renders a distinct portrait", () => {
    const renders = EXPRESSION_IDS.map((expression) =>
      render(base(), bare(), expression),
    );
    expect(new Set(renders).size).toBe(EXPRESSION_IDS.length);
  });

  it("neutral differs from every emote for every mouth and brow style", () => {
    for (const mouth of MOUTH_OPTIONS) {
      for (const brows of BROWS_OPTIONS) {
        const appearance = { ...base(), mouth: mouth.id, brows: brows.id };
        const resting = render(appearance);
        for (const expression of EXPRESSION_IDS) {
          if (expression === "neutral") continue;
          expect(
            render(appearance, bare(), expression),
            `${mouth.id}/${brows.id}/${expression}`,
          ).not.toBe(resting);
        }
      }
    }
  });

  it("the neutral default matches an explicit neutral", () => {
    expect(composePortrait(base(), bare())).toEqual(
      composePortrait(base(), bare(), "neutral"),
    );
  });
});

describe("equipment on the portrait", () => {
  it("tints the shoulder band with the outfit's material channels", () => {
    const { shoulders } = PORTRAIT_FRAME;
    const band = (equipment = bare()): string =>
      composePortrait(base(), equipment)
        .slice(shoulders.top, shoulders.bottom + 1)
        .join("\n");
    // Bare: canonical dark-fabric garb with the magenta accent seam.
    expect(band()).toContain("W");
    expect(band()).toContain("j");
    // Armor plate: primary onto brushed chrome, accent onto hazard amber.
    const plated = band({ ...bare(), outfit: "out-cordon-plate" });
    expect(plated).toContain("T");
    expect(plated).toContain("Z");
    expect(plated).not.toContain("W");
    expect(plated).not.toContain("j");
    // Accent-only item: cloth stays, only the seam recolors.
    const harness = band({ ...bare(), outfit: "out-diver-harness" });
    expect(harness).toContain("W");
    expect(harness).toContain("Z");
    expect(harness).not.toContain("j");
  });

  it("unknown and layerless outfits keep the base garb", () => {
    expect(render(base(), { ...bare(), outfit: "out-vaporware" })).toBe(
      render(base()),
    );
  });

  it("head cyberware stamps its portrait overlay; body installs do not", () => {
    const bareLook = render(base());
    for (const item of items) {
      if (item.kind !== "enhancement") continue;
      const equipment = { ...bare(), enhancements: { [item.slot]: item.id } };
      const withInstall = render(base(), equipment);
      const hasPortrait =
        item.cyberLayer !== undefined &&
        CYBER_PORTRAITS[item.cyberLayer.id] !== undefined;
      if (hasPortrait) {
        expect(withInstall, item.id).not.toBe(bareLook);
      } else {
        expect(withInstall, item.id).toBe(bareLook);
      }
    }
  });

  it("keeps the eye color visible under eye-covering headwear", () => {
    // The sprite drops its eyes layer under the visor; the portrait's
    // dithered lens glass lets the crimson irises read through.
    const visored = render(
      { ...base(), headwear: "visor", eyeColor: "crimson" },
      bare(),
    );
    expect(visored).toContain("p");
    const masked = render(
      { ...base(), headwear: "rebreather", eyeColor: "crimson" },
      bare(),
    );
    expect(masked).toContain("p");
  });

  it("always stamps installed optics, even under eye-covering headwear", () => {
    const withOptics = (headwear: string): string =>
      render(
        { ...base(), headwear },
        { ...bare(), enhancements: { eyes: "cyb-optic-suite" } },
      );
    for (const headwear of ["none", "visor", "rebreather"]) {
      expect(withOptics(headwear), headwear).not.toBe(
        render({ ...base(), headwear }),
      );
    }
  });
});

describe("portraitKey", () => {
  it("equal inputs share a key no matter how the objects were built", () => {
    expect(portraitKey(base(), bare())).toBe(
      portraitKey({ ...base() }, { ...bare() }),
    );
    expect(portraitKey(base(), bare())).toBe(
      portraitKey(base(), bare(), "neutral"),
    );
  });

  it("differs across appearance, equipment, and expression changes", () => {
    const keys = [
      portraitKey(base(), bare()),
      portraitKey(base(), bare(), "smile"),
      portraitKey(base(), bare(), "grim"),
      portraitKey(base(), bare(), "shocked"),
      portraitKey({ ...base(), skinTone: "warm-brown" }, bare()),
      portraitKey({ ...base(), build: "heavy" }, bare()),
      portraitKey({ ...base(), hairColor: "silver" }, bare()),
      portraitKey({ ...base(), eyeColor: "crimson" }, bare()),
      portraitKey({ ...base(), headwear: "cap" }, bare()),
      portraitKey(base(), { ...bare(), outfit: "out-cordon-plate" }),
      portraitKey(base(), {
        ...bare(),
        enhancements: { eyes: "cyb-optic-suite" },
      }),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("ignores gear that never reaches the portrait", () => {
    // Weapons have no portrait presence; body-region cyberware without
    // portrait art draws nothing — neither may churn the bake cache.
    expect(portraitKey(base(), { ...bare(), weapon: "wpn-shard-knife" })).toBe(
      portraitKey(base(), bare()),
    );
    expect(
      portraitKey(base(), {
        ...bare(),
        enhancements: { arms: "cyb-myomer-arms" },
      }),
    ).toBe(portraitKey(base(), bare()));
  });

  it("resolves parts bottom-to-top starting from the build's head", () => {
    const parts = resolvePortraitParts(base(), bare());
    expect(parts[0]?.key).toBe("head:lean");
    const order = parts.map((p) => p.key.split(":")[0]);
    expect(order.slice(0, 6)).toEqual([
      "head",
      "eyes",
      "eyes",
      "brows",
      "brows",
      "mouth",
    ]);
  });
});
