// @vitest-environment happy-dom
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COLOR_MODE_DEFS } from "../data/accessibility";
import {
  OUTLINE_COLORS,
  TELEGRAPH_PALETTE_IDS,
  outlineColor,
} from "../iso";
import {
  DEFAULT_SETTINGS,
  applyDisplaySettings,
  applyMotionPreference,
  applyTextScale,
  outlinePaletteFor,
  reducedMotionActive,
  systemPrefersReducedMotion,
  telegraphPaletteFor,
  TEXT_SCALE_VAR,
  type Settings,
} from "./index";

/**
 * The comfort audit.
 *
 * Two claims hold the Graphics & Comfort section together, and neither
 * is the kind of thing a single unit test can protect. The first is
 * that there is exactly *one* reduced-motion selector: the setting is
 * three-valued now, so anything that reads the stored field and treats
 * it as a boolean gets the "follow the device" case wrong, silently,
 * for exactly the players who need it. The second is that the colour
 * palettes reach every mark on the ground — a ground layer where half
 * the marks recolour and half do not is worse than one that does not
 * recolour at all.
 *
 * So both are swept over the sources, in the manner of the routing
 * audit in src/audio/routing.test.ts: a claim about the whole codebase
 * is checked against the whole codebase.
 */

/** Every .ts file under src, in a stable order. */
function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (entry.endsWith(".ts")) found.push(path);
  }
  return found;
}

const SOURCES = sourceFiles("src").map((path) => ({
  path,
  text: readFileSync(path, "utf8"),
}));

/** Non-test sources only: a test may say whatever it is testing. */
const SHIPPED = SOURCES.filter(({ path }) => !path.endsWith(".test.ts"));

describe("one reduced-motion selector", () => {
  it("found the sources it was meant to scan", () => {
    expect(SHIPPED.length).toBeGreaterThan(100);
    expect(SHIPPED.some(({ path }) => path.endsWith("combatScene.ts"))).toBe(
      true,
    );
  });

  it("asks the OS in exactly one place", () => {
    // Every animated system goes through reducedMotionActive, which is
    // the only thing in the game allowed to run the media query. A
    // second reader would be a second answer.
    const strays = SHIPPED.filter(
      ({ path, text }) =>
        path !== join("src", "settings", "index.ts") &&
        /prefers-reduced-motion/.test(text),
    ).map(({ path }) => path);
    // theme.css has its own copy of the query and is meant to: CSS
    // cannot call a function. It is not a .ts file, so it is not here.
    expect(strays).toEqual([]);
  });

  it("never reads the stored preference to decide whether to animate", () => {
    // `motion` is a three-valued preference, not a switch. Reading it
    // off the store outside this directory means somebody has
    // re-derived the answer, and re-derived it wrong for the case that
    // ships as the default.
    const strays = SHIPPED.filter(
      ({ path, text }) =>
        !path.startsWith(join("src", "settings")) &&
        /settings\s*\.\s*get\(\)\s*\.\s*motion\b/.test(text),
    ).map(({ path }) => `${path}: settings.get().motion`);
    expect(strays).toEqual([]);
  });

  it("never re-derives the answer by comparing the preference", () => {
    // The one mistake this sweep exists to catch: `motion === "reduced"`
    // is right two thirds of the time and wrong for the default, which
    // is the position most installs are actually in. Reading the field
    // to *render* it is fine — the row in the panel does exactly that —
    // so what is banned is comparing it, not touching it.
    const compare = /\bmotion\b[^\n]{0,40}?[=!]==\s*["'](system|full|reduced)["']/;
    const strays = SHIPPED.filter(
      ({ path, text }) =>
        !path.startsWith(join("src", "settings")) && compare.test(text),
    ).map(({ path }) => `${path}: compares the motion preference`);
    expect(strays).toEqual([]);
  });

  it("takes the answer from the selector wherever it holds the store", () => {
    // A module that reaches for the settings store *and* talks about
    // reduced motion has to be getting the answer from the selector.
    // Anything else is that module deciding for itself.
    const strays: string[] = [];
    for (const { path, text } of SHIPPED) {
      if (path.startsWith(join("src", "settings"))) continue;
      if (!/\breducedMotion\b/.test(text)) continue;
      const imports = text.match(/import \{[^}]*\} from "[^"]*settings";/s);
      if (!imports) continue;
      if (!imports[0].includes("reducedMotionActive")) {
        strays.push(`${path}: imports the store, not the selector`);
      }
    }
    expect(strays).toEqual([]);
  });

  it("freezes the clock it hands the renderer, in both scenes", () => {
    /**
     * The one lever the whole reduced-motion design hangs from.
     *
     * Almost nothing in src/iso decides for itself whether to animate:
     * the flicker, the weather, the glow shimmer, the ticker scroll and
     * the marker pulses are all pure functions of a time in
     * milliseconds, and the scene stills every one of them at once by
     * passing zero instead of the clock. That is why an animated module
     * can be written without ever mentioning reduced motion and still be
     * covered — and also why a scene that passed the raw clock would
     * quietly un-cover all of them together, with no other test failing.
     *
     * So the sweep is not "does this module know about reduced motion"
     * but "does the clock reaching the renderer go through the gate".
     */
    const gated = /timeMs:\s*reduced(?:Motion)?(?:Active\(\))?\s*\?\s*0\s*:/;
    for (const file of ["scene.ts", "combatScene.ts"]) {
      const source = SHIPPED.find(({ path }) =>
        path.endsWith(join("src", "iso", file)),
      );
      expect(source, file).toBeDefined();
      expect(source?.text, `${file} must gate the clock it renders with`)
        .toMatch(gated);
    }
  });

  it("keeps the CSS kill switch driven by the same answer", () => {
    const css = readFileSync(join("src", "ui", "theme.css"), "utf8");
    // The media query is the OS half, and it has to stand aside when
    // the player has explicitly overridden the OS.
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(css).toMatch(/:root:not\(\.nf-full-motion\)/);
    expect(css).toMatch(/\.nf-reduced-motion \*/);
  });
});

describe("applyMotionPreference", () => {
  const os = (matches: boolean) => ({ matchMedia: () => ({ matches }) });

  function classes(): DOMTokenList {
    return document.documentElement.classList;
  }

  it("stills the DOM when the device asks and nobody has overridden it", () => {
    applyMotionPreference(DEFAULT_SETTINGS, document, os(true));
    expect(classes().contains("nf-reduced-motion")).toBe(true);
    expect(classes().contains("nf-full-motion")).toBe(false);
  });

  it("marks the explicit full override so the media query stands aside", () => {
    const full: Settings = { ...DEFAULT_SETTINGS, motion: "full" };
    applyMotionPreference(full, document, os(true));
    expect(classes().contains("nf-reduced-motion")).toBe(false);
    expect(classes().contains("nf-full-motion")).toBe(true);
  });

  it("takes both classes off again when the preference goes back", () => {
    applyMotionPreference(
      { ...DEFAULT_SETTINGS, motion: "full" },
      document,
      os(false),
    );
    applyMotionPreference(DEFAULT_SETTINGS, document, os(false));
    expect(classes().contains("nf-reduced-motion")).toBe(false);
    expect(classes().contains("nf-full-motion")).toBe(false);
  });

  it("agrees with the selector every screen reads", () => {
    for (const motion of ["system", "full", "reduced"] as const) {
      for (const asked of [true, false]) {
        const current: Settings = { ...DEFAULT_SETTINGS, motion };
        applyMotionPreference(current, document, os(asked));
        expect(classes().contains("nf-reduced-motion"), `${motion}/${asked}`)
          .toBe(reducedMotionActive(current, os(asked)));
      }
    }
  });

  it("reports the device preference plainly, and survives no matchMedia", () => {
    expect(systemPrefersReducedMotion(os(true))).toBe(true);
    expect(systemPrefersReducedMotion(os(false))).toBe(false);
    expect(systemPrefersReducedMotion(null)).toBe(false);
    expect(systemPrefersReducedMotion({})).toBe(false);
  });
});

describe("applyTextScale", () => {
  it("writes the one variable every rem-sized label is scaled by", () => {
    applyTextScale({ ...DEFAULT_SETTINGS, textScale: 1.3 }, document);
    expect(
      document.documentElement.style.getPropertyValue(TEXT_SCALE_VAR),
    ).toBe("1.3");
    applyTextScale(DEFAULT_SETTINGS, document);
    expect(
      document.documentElement.style.getPropertyValue(TEXT_SCALE_VAR),
    ).toBe("1");
  });

  it("is scaled off the root font size, which is what rem means", () => {
    const css = readFileSync(join("src", "ui", "theme.css"), "utf8");
    expect(css).toMatch(/--nf-text-scale:\s*1;/);
    expect(css).toMatch(/font-size:\s*calc\(100% \* var\(--nf-text-scale\)\)/);
  });

  it("is applied alongside motion by the one boot-time projection", () => {
    applyDisplaySettings(
      { ...DEFAULT_SETTINGS, motion: "reduced", textScale: 1.15 },
      document,
      { matchMedia: () => ({ matches: false }) },
    );
    expect(
      document.documentElement.classList.contains("nf-reduced-motion"),
    ).toBe(true);
    expect(
      document.documentElement.style.getPropertyValue(TEXT_SCALE_VAR),
    ).toBe("1.15");
  });
});

describe("the colour mode reaches everything that paints the ground", () => {
  it("resolves to a real palette on both sides for every mode", () => {
    for (const mode of COLOR_MODE_DEFS) {
      const current: Settings = { ...DEFAULT_SETTINGS, colorMode: mode.id };
      expect(TELEGRAPH_PALETTE_IDS, mode.id).toContain(
        telegraphPaletteFor(current),
      );
      expect(Object.keys(OUTLINE_COLORS), mode.id).toContain(
        outlinePaletteFor(current),
      );
      expect(outlineColor(outlinePaletteFor(current)), mode.id).toMatch(
        /^#[0-9a-f]{6}$/i,
      );
    }
  });

  it("gives the assist mode a palette of its own on both sides", () => {
    const neon: Settings = { ...DEFAULT_SETTINGS, colorMode: "neon" };
    const assist: Settings = { ...DEFAULT_SETTINGS, colorMode: "assist" };
    expect(telegraphPaletteFor(assist)).not.toBe(telegraphPaletteFor(neon));
    expect(outlineColor(outlinePaletteFor(assist))).not.toBe(
      outlineColor(outlinePaletteFor(neon)),
    );
  });

  it("leaves no ground mark painted from a literal colour", () => {
    // Every diamond laid on the ground — telegraph tint, cursor, walk
    // preview, interactable pulse, the ring under whoever is acting —
    // takes its colour from the palette table. A literal passed to
    // drawDiamond is a mark the assist palette cannot reach.
    const strays: string[] = [];
    for (const { path, text } of SHIPPED) {
      if (!path.startsWith(join("src", "iso"))) continue;
      for (const call of text.matchAll(/drawDiamond\(([^;]*?)\);/gs)) {
        if (/["'`]/.test(call[1] ?? "")) strays.push(`${path}: ${call[0]}`);
      }
    }
    expect(strays).toEqual([]);
  });

  it("is handed to both renderers by the screens that build them", () => {
    // The palette is read once per scene, from the settings, and passed
    // in — the renderers take it as data and never reach for a store.
    const scene = SHIPPED.find(({ path }) =>
      path.endsWith(join("iso", "scene.ts")),
    );
    const combat = SHIPPED.find(({ path }) =>
      path.endsWith(join("ui", "combatScreen.ts")),
    );
    expect(scene?.text).toMatch(/telegraphPalette: telegraphPaletteFor\(/);
    expect(scene?.text).toMatch(/outlineColor\(outlinePaletteFor\(/);
    expect(combat?.text).toMatch(/telegraphPalette: telegraphPaletteFor\(/);
  });
});
