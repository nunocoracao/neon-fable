/**
 * The score: one theme per district, each authored as stem layers that
 * the engine mixes live. Everything here is content — patterns of notes
 * and the numbers that colour them. Nothing in this file touches an
 * AudioContext, schedules anything, or knows what the player is doing;
 * that is src/audio (score.ts picks the layers and does the bar math,
 * music.ts turns a layer into notes, bus.ts plays them).
 *
 * ## How a theme is put together
 *
 * A theme declares `secondsPerBar` and nothing else about time. Each
 * layer declares its own `stepsPerBar` and how many `bars` it loops
 * over, so a slow pad on four steps per bar and a combat pulse on
 * sixteen sit on the same bar grid without either being re-authored.
 * That is the whole trick behind the adaptive mix: because every layer
 * of every theme is measured in bars, the *shared* combat layers below
 * drop onto any district's grid at that district's own tempo, and a
 * crossfade only ever has to land on a bar line.
 *
 * Three layers are the district's own voice:
 *
 * - `base` — the identity. It plays in exploration and it keeps playing
 *   through fights: the district is what you are hearing, always.
 * - `melodic` — what the place sounds like when nobody is shooting.
 * - `tension` — the same material with the melody pulled out from under
 *   it; what the district sounds like when somebody is.
 *
 * Two more are shared by every theme (SHARED_LAYERS):
 *
 * - `rhythm` — the combat drive, laid over whichever district you are
 *   fighting in rather than replacing it.
 * - `boss` — the extra weight a named antagonist gets.
 *
 * ## Why it all stays in A minor
 *
 * Same reason the first pass did: layers get mixed in combinations no
 * one auditioned, across a crossfade that briefly sounds two themes at
 * once. A single mode means every accidental pairing is at worst dull,
 * never wrong. Voicing and register carry the character instead.
 */
import type { DayPhaseId, MusicThemeId } from "../iso/tilemap";
import type { PatchWave } from "../audio/patches";

/** Which stem of a theme a pattern is. */
export type MusicLayerRole = "base" | "melodic" | "tension" | "rhythm" | "boss";

export const MUSIC_LAYER_ROLES: readonly MusicLayerRole[] = [
  "base",
  "melodic",
  "tension",
  "rhythm",
  "boss",
];

/** The roles a theme authors itself; the rest come from SHARED_LAYERS. */
export const THEME_LAYER_ROLES = ["base", "melodic", "tension"] as const;

export type ThemeLayerRole = (typeof THEME_LAYER_ROLES)[number];

/** The roles every theme borrows, so a fight sounds like a fight. */
export const SHARED_LAYER_ROLES = ["rhythm", "boss"] as const;

export type SharedLayerRole = (typeof SHARED_LAYER_ROLES)[number];

export interface PatternNote {
  /** Step index within the layer's loop this note starts on. */
  step: number;
  freq: number;
  /** Length in steps. */
  steps: number;
  /** Peak gain in (0,1], before the day phase's scale. */
  gain: number;
  wave: PatchWave;
  /** Lowpass cutoff, before the day phase's scale. Always authored — it
   * is the handle the hour turns (see DAY_PHASE_MUSIC). */
  filterFreq: number;
}

/**
 * One stem, authored in bars. `stepsPerBar` is this layer's resolution
 * alone: a pad on 4 and a pulse on 16 loop together as long as both
 * declare their length in whole bars.
 */
export interface MusicLayerPattern {
  stepsPerBar: number;
  /** Bars before the layer loops. */
  bars: number;
  notes: readonly PatternNote[];
}

export interface MusicTheme {
  id: MusicThemeId;
  name: string;
  /**
   * Seconds per bar at the reference hour. The one tempo statement a
   * theme makes — every layer's step length divides out of it.
   */
  secondsPerBar: number;
  layers: Record<ThemeLayerRole, MusicLayerPattern>;
}

// --- Notes -------------------------------------------------------------

const A1 = 55.0;
const E2 = 82.41;
const F2 = 87.31;
const G2 = 98.0;
const A2 = 110.0;
const B2 = 123.47;
const C3 = 130.81;
const D3 = 146.83;
const E3 = 164.81;
const F3 = 174.61;
const G3 = 196.0;
const A3 = 220.0;
const B3 = 246.94;
const C4 = 261.63;
const D4 = 293.66;
const E4 = 329.63;
const F4 = 349.23;
const G4 = 392.0;
const A4 = 440.0;
const B4 = 493.88;
const C5 = 523.25;
const E5 = 659.26;
const A5 = 880.0;

/** Terser authoring for the note tables below. */
function note(
  step: number,
  freq: number,
  steps: number,
  gain: number,
  wave: PatchWave,
  filterFreq: number,
): PatternNote {
  return { step, freq, steps, gain, wave, filterFreq };
}

/** A figure repeated once per bar, for pulses and drives. */
function everyBar(
  bars: number,
  stepsPerBar: number,
  figure: readonly PatternNote[],
): PatternNote[] {
  const out: PatternNote[] = [];
  for (let bar = 0; bar < bars; bar++) {
    for (const n of figure) {
      out.push({ ...n, step: n.step + bar * stepsPerBar });
    }
  }
  return out;
}

// --- Shared combat layers ----------------------------------------------

/**
 * The drive and the dread, in bar-relative time so they fit any
 * district. Both are deliberately rootless — a low A pulse and open
 * fifths — so they colour the district's own base rather than arguing
 * with its melody.
 */
export const SHARED_LAYERS: Record<SharedLayerRole, MusicLayerPattern> = {
  // Sixteen to the bar: a filtered square pulse on the eighths with two
  // sawtooth stabs, which at every theme's tempo lands between a fast
  // heartbeat and a hard march.
  rhythm: {
    stepsPerBar: 16,
    bars: 1,
    notes: [
      note(0, A2, 1, 0.13, "square", 320),
      note(2, A2, 1, 0.11, "square", 320),
      note(4, A2, 1, 0.13, "square", 320),
      note(6, A2, 1, 0.11, "square", 320),
      note(8, A2, 1, 0.13, "square", 320),
      note(10, A2, 1, 0.11, "square", 320),
      note(12, C3, 1, 0.13, "square", 320),
      note(14, D3, 1, 0.12, "square", 320),
      note(4, A4, 1, 0.055, "sawtooth", 1400),
      note(12, G4, 1, 0.055, "sawtooth", 1400),
      note(8, E5, 1, 0.03, "sine", 2600),
    ],
  },
  // Two bars, so the boss layer is always the longest thing in the mix
  // and the fight never quite settles into a loop you can count.
  boss: {
    stepsPerBar: 16,
    bars: 2,
    notes: [
      // A sub that never lets up.
      note(0, A1, 16, 0.1, "sine", 200),
      note(16, A1, 16, 0.1, "sine", 200),
      // A rising three-note announcement in the second bar.
      note(20, E3, 2, 0.07, "sawtooth", 700),
      note(24, F3, 2, 0.07, "sawtooth", 760),
      note(28, G3, 4, 0.08, "sawtooth", 820),
      // Downbeat weight.
      note(0, A2, 2, 0.09, "triangle", 420),
      note(16, F2, 2, 0.09, "triangle", 420),
    ],
  },
};

// --- Themes ------------------------------------------------------------

/**
 * Cinder Row — the first pass's main theme, opened out. The four-to-the-
 * bar pulse and wandering arp are the ones the hub has always had; what
 * is new is that the pulse is now its own stem, so it survives into
 * every fight fought out of this district.
 */
const hub: MusicTheme = {
  id: "hub",
  name: "Cinder Row",
  secondsPerBar: 3.36,
  layers: {
    base: {
      stepsPerBar: 8,
      bars: 4,
      notes: [
        ...everyBar(2, 8, [
          note(0, A2, 2, 0.13, "triangle", 500),
          note(4, A2, 2, 0.13, "triangle", 500),
        ]),
        note(16, G2, 2, 0.13, "triangle", 500),
        note(20, G2, 2, 0.13, "triangle", 500),
        note(24, F2, 2, 0.13, "triangle", 500),
        note(28, F2, 2, 0.13, "triangle", 500),
        note(0, A3, 16, 0.07, "sine", 800),
        note(16, G3, 16, 0.07, "sine", 800),
      ],
    },
    melodic: {
      stepsPerBar: 8,
      bars: 4,
      notes: [
        note(2, E4, 1, 0.05, "triangle", 2200),
        note(6, D4, 1, 0.05, "triangle", 2200),
        note(10, C4, 1, 0.05, "triangle", 2200),
        note(14, E4, 1, 0.05, "triangle", 2200),
        note(18, D4, 1, 0.05, "triangle", 2200),
        note(22, C4, 1, 0.05, "triangle", 2200),
        note(26, D4, 1, 0.05, "triangle", 2200),
        note(30, E4, 2, 0.05, "triangle", 2200),
        note(8, A4, 4, 0.03, "sine", 3000),
        note(24, G4, 4, 0.03, "sine", 3000),
      ],
    },
    tension: {
      // The arp gone, a semitone rub in its place, and the pad pushed
      // down a register: the same street, holding its breath.
      stepsPerBar: 8,
      bars: 4,
      notes: [
        note(0, A3, 12, 0.06, "sawtooth", 620),
        note(0, B3, 12, 0.04, "sawtooth", 620),
        note(16, G3, 12, 0.06, "sawtooth", 560),
        note(16, A3, 12, 0.04, "sawtooth", 560),
        note(12, C4, 2, 0.05, "triangle", 900),
        note(14, B3, 2, 0.05, "triangle", 860),
        note(28, B3, 2, 0.05, "triangle", 860),
        note(30, A3, 2, 0.05, "triangle", 820),
      ],
    },
  },
};

/**
 * Greywater Steps — damp and salvaged. Long low drone, water plinking
 * off scaffolding, and nothing in a hurry: the settlement is patient
 * because it has had to be.
 */
const greywater: MusicTheme = {
  id: "greywater",
  name: "Greywater Steps",
  secondsPerBar: 4.0,
  layers: {
    base: {
      stepsPerBar: 4,
      bars: 4,
      notes: [
        note(0, A1, 16, 0.12, "sine", 340),
        note(0, A2, 8, 0.07, "triangle", 420),
        note(8, E2, 8, 0.07, "triangle", 400),
        note(6, A2, 2, 0.05, "triangle", 460),
        note(14, G2, 2, 0.05, "triangle", 440),
      ],
    },
    melodic: {
      // Drips: a four-note figure that never quite repeats on the beat.
      stepsPerBar: 4,
      bars: 4,
      notes: [
        note(1, D4, 1, 0.045, "sine", 2800),
        note(5, C4, 1, 0.04, "sine", 2600),
        note(7, A3, 2, 0.04, "sine", 2400),
        note(11, G3, 1, 0.04, "sine", 2200),
        note(13, C4, 1, 0.045, "sine", 2600),
        note(15, D4, 1, 0.035, "sine", 2800),
        note(3, A4, 1, 0.025, "sine", 3200),
      ],
    },
    tension: {
      stepsPerBar: 4,
      bars: 4,
      notes: [
        note(0, A1, 16, 0.12, "sine", 300),
        note(0, E2, 6, 0.06, "sawtooth", 520),
        note(0, F2, 6, 0.05, "sawtooth", 520),
        note(8, E2, 6, 0.06, "sawtooth", 480),
        note(8, F2, 6, 0.05, "sawtooth", 480),
        note(6, C4, 2, 0.04, "triangle", 900),
        note(14, B3, 2, 0.04, "triangle", 860),
      ],
    },
  },
};

/**
 * The Exchange Ventworks — swept, industrial, corporate. A machine
 * ostinato on three against a bar of four, so the plant is always very
 * slightly out of step with itself.
 */
const ventworks: MusicTheme = {
  id: "ventworks",
  name: "Exchange Ventworks",
  secondsPerBar: 3.2,
  layers: {
    base: {
      stepsPerBar: 8,
      bars: 2,
      notes: [
        ...everyBar(2, 8, [
          note(0, A2, 1, 0.12, "square", 260),
          note(3, A2, 1, 0.09, "square", 260),
          note(6, E2, 1, 0.1, "square", 260),
        ]),
        note(0, A3, 8, 0.06, "sawtooth", 480),
        note(8, G3, 8, 0.06, "sawtooth", 460),
      ],
    },
    melodic: {
      // Three-step ostinato inside an eight-step bar.
      stepsPerBar: 8,
      bars: 2,
      notes: [
        note(0, E4, 1, 0.04, "square", 1800),
        note(3, A4, 1, 0.04, "square", 1800),
        note(6, C5, 1, 0.035, "square", 1800),
        note(9, E4, 1, 0.04, "square", 1800),
        note(12, A4, 1, 0.04, "square", 1800),
        note(15, C5, 1, 0.035, "square", 1800),
        note(4, A3, 2, 0.03, "triangle", 1200),
      ],
    },
    tension: {
      stepsPerBar: 8,
      bars: 2,
      notes: [
        ...everyBar(2, 8, [
          note(0, A2, 1, 0.12, "square", 220),
          note(2, A2, 1, 0.09, "square", 220),
          note(4, F2, 1, 0.11, "square", 220),
          note(6, F2, 1, 0.09, "square", 220),
        ]),
        // Two-tone plant alarm, an open fifth apart.
        note(0, E4, 4, 0.05, "sawtooth", 900),
        note(4, B3, 4, 0.05, "sawtooth", 860),
        note(8, E4, 4, 0.05, "sawtooth", 900),
        note(12, B3, 4, 0.05, "sawtooth", 860),
      ],
    },
  },
};

/**
 * The Auric Spire — glass and money. Wide sine pads in stacked fifths
 * and a bell high above them; the only theme with no edge anywhere in
 * its exploration mix, which is the point.
 */
const spire: MusicTheme = {
  id: "spire",
  name: "Auric Spire",
  secondsPerBar: 4.8,
  layers: {
    base: {
      stepsPerBar: 4,
      bars: 4,
      notes: [
        note(0, A2, 8, 0.11, "sine", 700),
        note(0, E3, 8, 0.08, "sine", 700),
        note(8, F2, 8, 0.11, "sine", 660),
        note(8, C3, 8, 0.08, "sine", 660),
        note(0, A3, 16, 0.04, "sine", 900),
      ],
    },
    melodic: {
      stepsPerBar: 4,
      bars: 4,
      notes: [
        note(2, E5, 3, 0.035, "sine", 3400),
        note(6, C5, 3, 0.03, "sine", 3200),
        note(10, A5, 3, 0.03, "sine", 3600),
        note(14, E5, 2, 0.03, "sine", 3400),
        note(4, A4, 4, 0.025, "triangle", 2400),
        note(12, G4, 4, 0.025, "triangle", 2200),
      ],
    },
    tension: {
      // The curtain wall stops being scenery: the same pads, voiced a
      // second apart and sinking.
      stepsPerBar: 4,
      bars: 4,
      notes: [
        note(0, F2, 8, 0.11, "sine", 480),
        note(0, C3, 8, 0.07, "sine", 480),
        note(0, B3, 8, 0.05, "sawtooth", 520),
        note(8, E2, 8, 0.11, "sine", 440),
        note(8, B2, 8, 0.07, "sine", 440),
        note(8, C4, 8, 0.05, "sawtooth", 500),
        note(6, C5, 2, 0.03, "sine", 1800),
        note(14, B4, 2, 0.03, "sine", 1700),
      ],
    },
  },
};

/**
 * The Vertical Market — bustle. The fastest bar in the game, a bouncing
 * bass and an arpeggio that runs up and down the stall scaffold; every
 * other district sounds like it is waiting for something, this one
 * sounds like it is selling you something.
 */
const market: MusicTheme = {
  id: "market",
  name: "Vertical Market",
  secondsPerBar: 2.8,
  layers: {
    base: {
      stepsPerBar: 8,
      bars: 2,
      notes: [
        ...everyBar(2, 8, [
          note(0, A2, 2, 0.12, "triangle", 560),
          note(3, E3, 1, 0.08, "triangle", 560),
          note(5, A2, 1, 0.1, "triangle", 560),
        ]),
        note(0, A3, 8, 0.05, "sine", 900),
        note(8, C4, 8, 0.05, "sine", 900),
      ],
    },
    melodic: {
      stepsPerBar: 16,
      bars: 2,
      notes: [
        note(0, A3, 1, 0.045, "triangle", 2400),
        note(2, C4, 1, 0.045, "triangle", 2400),
        note(4, E4, 1, 0.045, "triangle", 2400),
        note(6, A4, 1, 0.045, "triangle", 2400),
        note(8, E4, 1, 0.045, "triangle", 2400),
        note(10, C4, 1, 0.045, "triangle", 2400),
        note(12, D4, 1, 0.045, "triangle", 2400),
        note(14, E4, 1, 0.045, "triangle", 2400),
        note(16, C4, 1, 0.045, "triangle", 2400),
        note(18, E4, 1, 0.045, "triangle", 2400),
        note(20, G4, 1, 0.045, "triangle", 2400),
        note(22, C5, 1, 0.04, "triangle", 2400),
        note(24, G4, 1, 0.045, "triangle", 2400),
        note(26, E4, 1, 0.045, "triangle", 2400),
        note(28, D4, 1, 0.045, "triangle", 2400),
        note(30, C4, 1, 0.045, "triangle", 2400),
      ],
    },
    tension: {
      // The stalls shutter: the arpeggio collapses to two notes and the
      // bass goes flat-footed.
      stepsPerBar: 8,
      bars: 2,
      notes: [
        ...everyBar(2, 8, [
          note(0, A2, 2, 0.13, "triangle", 400),
          note(4, F2, 2, 0.12, "triangle", 400),
        ]),
        note(0, E4, 2, 0.05, "sawtooth", 1000),
        note(4, F4, 2, 0.05, "sawtooth", 1000),
        note(8, E4, 2, 0.05, "sawtooth", 1000),
        note(12, D4, 2, 0.05, "sawtooth", 980),
        note(0, A3, 16, 0.04, "sine", 620),
      ],
    },
  },
};

/**
 * The Flooded Quays — sparse echo over black water. Almost nothing
 * happens per bar, and what does happen comes back quieter a beat later.
 */
const quays: MusicTheme = {
  id: "quays",
  name: "Flooded Quays",
  secondsPerBar: 5.6,
  layers: {
    base: {
      stepsPerBar: 4,
      bars: 4,
      notes: [
        note(0, A1, 16, 0.12, "sine", 280),
        note(0, A2, 16, 0.06, "sine", 360),
        note(8, E2, 8, 0.05, "sine", 340),
      ],
    },
    melodic: {
      // Ping, echo, silence. The echoes are authored as literal repeats
      // at a third of the gain — no delay line anywhere in the engine.
      stepsPerBar: 4,
      bars: 4,
      notes: [
        note(0, E4, 2, 0.05, "sine", 2600),
        note(3, E4, 1, 0.018, "sine", 1600),
        note(6, C4, 2, 0.045, "sine", 2400),
        note(9, C4, 1, 0.016, "sine", 1500),
        note(10, A4, 2, 0.04, "sine", 2800),
        note(13, A4, 1, 0.014, "sine", 1700),
      ],
    },
    tension: {
      stepsPerBar: 4,
      bars: 4,
      notes: [
        note(0, A1, 16, 0.13, "sine", 240),
        note(0, B2, 8, 0.06, "sawtooth", 460),
        note(8, C3, 8, 0.06, "sawtooth", 440),
        // A hull-plate two-note, far off across the water.
        note(4, A3, 3, 0.045, "triangle", 700),
        note(7, G3, 3, 0.045, "triangle", 660),
        note(12, A3, 3, 0.04, "triangle", 700),
      ],
    },
  },
};

/**
 * The main menu — slow dark pads under a hesitant arp, carried over from
 * the first pass. Never enters combat; it authors a tension stem anyway
 * so no theme in the table is a special case.
 */
const menu: MusicTheme = {
  id: "menu",
  name: "Standby",
  secondsPerBar: 4.4,
  layers: {
    base: {
      stepsPerBar: 8,
      bars: 4,
      notes: [
        note(0, A2, 16, 0.16, "sine", 900),
        note(8, E3, 8, 0.1, "sine", 900),
        note(16, F2, 16, 0.16, "sine", 900),
        note(24, C3, 8, 0.1, "sine", 900),
      ],
    },
    melodic: {
      stepsPerBar: 8,
      bars: 4,
      notes: [
        note(0, A3, 2, 0.06, "triangle", 2200),
        note(5, C4, 2, 0.06, "triangle", 2200),
        note(10, E4, 2, 0.06, "triangle", 2200),
        note(16, A3, 2, 0.06, "triangle", 2200),
        note(21, C4, 2, 0.06, "triangle", 2200),
        note(26, D4, 2, 0.06, "triangle", 2200),
      ],
    },
    tension: {
      stepsPerBar: 8,
      bars: 4,
      notes: [
        note(0, A2, 16, 0.16, "sine", 560),
        note(0, B3, 8, 0.05, "sawtooth", 600),
        note(16, F2, 16, 0.16, "sine", 540),
        note(16, C4, 8, 0.05, "sawtooth", 580),
      ],
    },
  },
};

/**
 * Epilogue — a wide, almost static pad. The slowest bar in the game, so
 * the endings screen has time to be read over it.
 */
const ending: MusicTheme = {
  id: "ending",
  name: "What It Cost",
  secondsPerBar: 6.4,
  layers: {
    base: {
      stepsPerBar: 8,
      bars: 4,
      notes: [
        note(0, A2, 16, 0.14, "sine", 700),
        note(0, E3, 16, 0.1, "sine", 700),
        note(16, F2, 16, 0.14, "sine", 700),
        note(16, C3, 16, 0.1, "sine", 700),
      ],
    },
    melodic: {
      stepsPerBar: 8,
      bars: 4,
      notes: [
        note(8, A4, 4, 0.05, "triangle", 2600),
        note(24, E4, 4, 0.05, "triangle", 2400),
        note(4, C5, 2, 0.025, "sine", 3200),
      ],
    },
    tension: {
      stepsPerBar: 8,
      bars: 4,
      notes: [
        note(0, F2, 16, 0.14, "sine", 460),
        note(0, C3, 16, 0.09, "sine", 460),
        note(16, E2, 16, 0.14, "sine", 440),
        note(16, B2, 16, 0.09, "sine", 440),
      ],
    },
  },
};

export const MUSIC_THEMES: Record<MusicThemeId, MusicTheme> = {
  menu,
  hub,
  greywater,
  ventworks,
  spire,
  market,
  quays,
  ending,
};

export const MUSIC_THEME_IDS = Object.keys(MUSIC_THEMES) as MusicThemeId[];

/** The pattern for one role of one theme: the theme's own, or the shared. */
export function themeLayer(
  theme: MusicTheme,
  role: MusicLayerRole,
): MusicLayerPattern {
  return role === "rhythm" || role === "boss"
    ? SHARED_LAYERS[role]
    : theme.layers[role];
}

// --- The hour ----------------------------------------------------------

/**
 * How the hour colours the score. Deliberately small numbers: this is a
 * shading of the same music, not a different arrangement — the phase
 * changes on a map transition and the player should notice the district
 * feels later, not that the soundtrack changed.
 *
 * `tempoScale` multiplies seconds per bar, so above 1 is *slower*.
 * `filterScale` multiplies every authored cutoff, and `gainScale` every
 * authored peak.
 */
export interface MusicPhaseParams {
  tempoScale: number;
  filterScale: number;
  gainScale: number;
}

export const DAY_PHASE_MUSIC: Record<DayPhaseId, MusicPhaseParams> = {
  // Last light: a shade quicker and brighter, the street still busy.
  dusk: { tempoScale: 0.96, filterScale: 1.3, gainScale: 1.0 },
  // The hour the score is authored at — the neutral reading.
  night: { tempoScale: 1.0, filterScale: 1.0, gainScale: 1.0 },
  // The small hours: everything slower, darker, and further away.
  late: { tempoScale: 1.09, filterScale: 0.68, gainScale: 0.88 },
};
