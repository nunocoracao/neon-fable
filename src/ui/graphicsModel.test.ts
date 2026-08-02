import { describe, expect, it } from "vitest";
import {
  COLOR_MODES,
  MOTION_PREFERENCES,
  TEXT_SCALES,
} from "../data/accessibility";
import {
  DEFAULT_SETTINGS,
  GRAPHICS_SETTING_KEYS,
  clampSettings,
  type Settings,
} from "../settings";
import { GRAPHICS_CONTROLS, GRAPHICS_GROUPS } from "./graphicsModel";

/**
 * The Graphics & Comfort table, driven with no DOM.
 *
 * The claim each control makes is small and exact: "choosing this
 * option changes that field, and the row then reads back as chosen".
 * Made once per control, over every option, that is the whole of "the
 * panel is really wired up" — which used to be a question only a
 * browser could answer, and only one switch at a time.
 */

/** The settings that choosing `value` on `control` would produce. */
function choose(current: Settings, controlId: string, value: string): Settings {
  const control = GRAPHICS_CONTROLS.find((entry) => entry.id === controlId);
  if (!control) throw new Error(`no control "${controlId}"`);
  return clampSettings({ ...current, ...control.patch(value) });
}

describe("the Graphics & Comfort table", () => {
  it("groups every control exactly once, with unique ids", () => {
    const ids = GRAPHICS_CONTROLS.map((control) => control.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(GRAPHICS_GROUPS.map((g) => g.id)).size).toBe(
      GRAPHICS_GROUPS.length,
    );
    expect(GRAPHICS_CONTROLS.length).toBe(
      GRAPHICS_GROUPS.reduce((n, group) => n + group.controls.length, 0),
    );
  });

  it("covers every field the section's reset restores, and no other", () => {
    // The two lists are the same promise said twice: what the section
    // governs, and what "reset this section" puts back. A control with
    // no key would survive a reset; a key with no control would be
    // reset by a button that never showed it.
    expect([...GRAPHICS_CONTROLS.map((c) => c.id)].sort()).toEqual(
      [...GRAPHICS_SETTING_KEYS].sort(),
    );
  });

  it("says what each control is and does, in words", () => {
    for (const group of GRAPHICS_GROUPS) {
      expect(group.title.length, group.id).toBeGreaterThan(0);
      for (const control of group.controls) {
        expect(control.label.length, control.id).toBeGreaterThan(0);
        // Long enough to be a sentence rather than a restated label.
        expect(control.blurb.length, control.id).toBeGreaterThan(40);
        expect(control.options.length, control.id).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("offers unique, labelled options on every control", () => {
    for (const control of GRAPHICS_CONTROLS) {
      const values = control.options.map((option) => option.value);
      expect(new Set(values).size, control.id).toBe(values.length);
      for (const option of control.options) {
        expect(option.label.length, `${control.id}/${option.value}`)
          .toBeGreaterThan(0);
      }
    }
  });

  it("reads back the shipped defaults as a real option on every row", () => {
    for (const control of GRAPHICS_CONTROLS) {
      const chosen = control.value(DEFAULT_SETTINGS);
      expect(
        control.options.map((option) => option.value),
        control.id,
      ).toContain(chosen);
    }
  });
});

describe("every control is wired to the field it claims", () => {
  it("writes what it reads back, for every option of every control", () => {
    for (const control of GRAPHICS_CONTROLS) {
      for (const option of control.options) {
        const next = clampSettings({
          ...DEFAULT_SETTINGS,
          ...control.patch(option.value),
        });
        expect(control.value(next), `${control.id}/${option.value}`).toBe(
          option.value,
        );
      }
    }
  });

  it("touches its own field and nothing else", () => {
    for (const control of GRAPHICS_CONTROLS) {
      for (const option of control.options) {
        const patch = control.patch(option.value);
        expect(Object.keys(patch), control.id).toHaveLength(1);
        const next = choose(DEFAULT_SETTINGS, control.id, option.value);
        for (const key of GRAPHICS_SETTING_KEYS) {
          if (key === Object.keys(patch)[0]) continue;
          expect(next[key], `${control.id} moved ${key}`).toEqual(
            DEFAULT_SETTINGS[key],
          );
        }
      }
    }
  });

  it("moves the fields the v2 toggles arrived with", () => {
    expect(choose(DEFAULT_SETTINGS, "glow", "off").glow).toBe(false);
    expect(choose(DEFAULT_SETTINGS, "weather", "off").weather).toBe(false);
    expect(choose(DEFAULT_SETTINGS, "setPieces", "off").setPieces).toBe(false);
    expect(choose(DEFAULT_SETTINGS, "barks", "off").barks).toBe(false);
    expect(choose(DEFAULT_SETTINGS, "minimap", "off").minimap).toBe(false);
    expect(choose(DEFAULT_SETTINGS, "combatFeel", "off").combatFeel).toBe(
      false,
    );
    expect(choose(DEFAULT_SETTINGS, "shakeScale", "0").shakeScale).toBe(0);
    expect(choose(DEFAULT_SETTINGS, "zoom", "2").zoom).toBe(2);
  });

  it("moves the three comfort options this section added", () => {
    expect(choose(DEFAULT_SETTINGS, "motion", "reduced").motion).toBe(
      "reduced",
    );
    expect(choose(DEFAULT_SETTINGS, "motion", "full").motion).toBe("full");
    expect(choose(DEFAULT_SETTINGS, "colorMode", "assist").colorMode).toBe(
      "assist",
    );
    expect(choose(DEFAULT_SETTINGS, "textScale", "1.3").textScale).toBe(1.3);
  });

  it("offers exactly the catalog's positions on the catalog-backed rows", () => {
    const values = (id: string): string[] => {
      const control = GRAPHICS_CONTROLS.find((entry) => entry.id === id);
      return (control?.options ?? []).map((option) => option.value);
    };
    expect(values("motion")).toEqual([...MOTION_PREFERENCES]);
    expect(values("colorMode")).toEqual([...COLOR_MODES]);
    expect(values("textScale")).toEqual(TEXT_SCALES.map(String));
  });

  it("refuses a value off the ladder rather than storing it", () => {
    // The panel only ever hands back its own option values, but the
    // clamp is what makes a hand-edited payload harmless.
    expect(choose(DEFAULT_SETTINGS, "zoom", "9").zoom).toBe(
      DEFAULT_SETTINGS.zoom,
    );
    expect(choose(DEFAULT_SETTINGS, "shakeScale", "9").shakeScale).toBe(
      DEFAULT_SETTINGS.shakeScale,
    );
    expect(choose(DEFAULT_SETTINGS, "textScale", "9").textScale).toBe(
      DEFAULT_SETTINGS.textScale,
    );
    expect(choose(DEFAULT_SETTINGS, "colorMode", "sepia").colorMode).toBe(
      DEFAULT_SETTINGS.colorMode,
    );
    expect(choose(DEFAULT_SETTINGS, "motion", "sideways").motion).toBe(
      DEFAULT_SETTINGS.motion,
    );
  });
});
