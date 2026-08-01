/**
 * The synth vocabulary: every sound the game can make is a data-defined
 * patch (oscillator/noise layers with envelopes) rendered by the adapter
 * — no binary audio assets.
 *
 * Nothing in the game names a patch. Systems emit *semantic events*
 * ("a blade swung", "a vent blew steam", "the trace alarm tripped") and
 * a single registry maps event → patch id; see ../data/sfx.ts for the
 * catalog and ./events.ts for the lookup. This file is only the sound
 * itself, so re-voicing a cue never touches the system that fires it.
 *
 * ## Loudness discipline
 *
 * Patches are mixed against each other, not in isolation: a heavy melee
 * impact is the loudest thing the game plays, and everything else is
 * authored down from there. Two numbers per patch matter — the peak of
 * any single layer, and the peak of every layer *sounding at once*
 * (patchPeakGain below, which is what actually clips). Both are bounded
 * per family in ../data/sfx.ts (FAMILY_GAINS) and pinned by tests, so a
 * new cue cannot quietly become the loudest thing in the mix.
 */

export type PatchWave = "sine" | "square" | "sawtooth" | "triangle";

export interface ToneLayer {
  kind: "tone";
  wave: PatchWave;
  /** Start frequency in Hz. */
  freq: number;
  /** Optional sweep target reached at the end of the layer. */
  freqEnd?: number;
  /** Seconds after the patch starts before this layer begins. */
  delay?: number;
  /** Seconds the layer sounds for. */
  duration: number;
  /** Peak gain in (0,1], relative to the SFX channel. */
  gain: number;
  /** Attack in seconds (default 0.005). */
  attack?: number;
}

export interface NoiseLayer {
  kind: "noise";
  delay?: number;
  duration: number;
  gain: number;
  attack?: number;
  filter?: { type: "lowpass" | "highpass" | "bandpass"; freq: number; q?: number };
}

export type PatchLayer = ToneLayer | NoiseLayer;

export interface SynthPatch {
  layers: PatchLayer[];
}

export const SOUND_IDS = [
  // --- UI ---------------------------------------------------------------
  "ui-click",
  "ui-confirm",
  "ui-cancel",
  "dialogue-advance",
  "choice-select",
  "save-confirm",
  "load-confirm",
  "wizard-step",
  "thumbnail-select",
  "swatch-click",
  "perk-pick",
  "breach-node",
  "breach-alarm",
  "haggle-success",
  "haggle-fail",
  "dye-apply",
  "stylist-snip",
  "shard-pickup",
  "injury-sting",
  "bark-pop",
  // --- Exploration / world ----------------------------------------------
  "footstep",
  "interact",
  "rain-bed",
  "rain-splash",
  "train-pass",
  "drone-hum",
  "steam-burst",
  "door-open",
  "door-close",
  "transition-whoosh",
  // --- Stealth ----------------------------------------------------------
  "takedown",
  "spotted",
  // --- Combat: swings, one per weapon class -----------------------------
  "attack-swing",
  "attack-unarmed",
  "attack-blade",
  "attack-baton",
  "attack-pistol",
  "attack-rifle",
  "attack-lash",
  "projectile-whoosh",
  // --- Combat: what the blow was worth ----------------------------------
  "attack-miss",
  "impact-glancing",
  "attack-hit-light",
  "attack-hit-heavy",
  "impact-critical",
  "impact-explosion",
  "hit-pause-thump",
  "death-collapse",
  // --- Combat: ability archetypes ---------------------------------------
  "ability-use",
  "ability-shock-arc",
  "ability-volley-streak",
  "ability-optic-flash",
  "ability-kinetic-slam",
  "ability-snare-mesh",
  "ability-nano-cloud",
  "ability-guard-shimmer",
  "ability-focus-ring",
  // --- Combat: bosses and outcomes --------------------------------------
  "boss-servo",
  "boss-stomp",
  "item-use",
  "enemy-defeat",
  "victory",
  "defeat",
  // --- Inventory ---------------------------------------------------------
  "equip",
  "unequip",
  "install",
  // --- Ambient one-shots -------------------------------------------------
  "news-blip",
  "world-shift",
  "weather-turn",
] as const;

export type SoundId = (typeof SOUND_IDS)[number];

/**
 * The loudest moment of a patch: the greatest sum of layer peaks
 * *sounding at once*. Two quiet layers stacked are louder than either,
 * and it is the stack, not the layer, that spikes a mix — so this, not
 * `max(gain)`, is the number the family bounds are written against.
 *
 * Envelopes are treated as rectangles: a layer contributes its full peak
 * for its whole duration. Pessimistic by design — a patch inside its
 * bound on this measure is inside it on any real envelope.
 */
export function patchPeakGain(patch: SynthPatch): number {
  let peak = 0;
  for (const layer of patch.layers) {
    const start = layer.delay ?? 0;
    let sum = 0;
    for (const other of patch.layers) {
      const from = other.delay ?? 0;
      // Half-open: a layer beginning exactly where another ends does
      // not stack with it, which is how the call-and-answer patches
      // (ui-confirm, victory) are authored.
      if (from <= start && start < from + other.duration) sum += other.gain;
    }
    peak = Math.max(peak, sum);
  }
  return peak;
}

/** The loudest single layer of a patch. */
export function patchLayerGain(patch: SynthPatch): number {
  let peak = 0;
  for (const layer of patch.layers) peak = Math.max(peak, layer.gain);
  return peak;
}

export const SOUND_PATCHES: Record<SoundId, SynthPatch> = {
  "ui-click": {
    layers: [
      { kind: "tone", wave: "square", freq: 880, freqEnd: 660, duration: 0.05, gain: 0.18 },
    ],
  },
  "ui-confirm": {
    layers: [
      { kind: "tone", wave: "sine", freq: 660, duration: 0.07, gain: 0.22 },
      { kind: "tone", wave: "sine", freq: 990, delay: 0.07, duration: 0.1, gain: 0.22 },
    ],
  },
  "ui-cancel": {
    layers: [
      { kind: "tone", wave: "square", freq: 520, freqEnd: 320, duration: 0.09, gain: 0.16 },
    ],
  },
  "dialogue-advance": {
    layers: [
      { kind: "tone", wave: "triangle", freq: 740, duration: 0.045, gain: 0.16 },
    ],
  },
  "choice-select": {
    layers: [
      { kind: "tone", wave: "triangle", freq: 587, freqEnd: 880, duration: 0.07, gain: 0.2 },
    ],
  },
  "save-confirm": {
    layers: [
      { kind: "tone", wave: "sine", freq: 523, duration: 0.09, gain: 0.2 },
      { kind: "tone", wave: "sine", freq: 784, delay: 0.09, duration: 0.14, gain: 0.2 },
    ],
  },
  "load-confirm": {
    layers: [
      { kind: "tone", wave: "sine", freq: 784, duration: 0.09, gain: 0.2 },
      { kind: "tone", wave: "sine", freq: 523, delay: 0.09, duration: 0.14, gain: 0.2 },
    ],
  },
  footstep: {
    layers: [
      { kind: "noise", duration: 0.045, gain: 0.1, filter: { type: "lowpass", freq: 500 } },
      { kind: "tone", wave: "sine", freq: 95, freqEnd: 60, duration: 0.05, gain: 0.12 },
    ],
  },
  interact: {
    layers: [
      { kind: "tone", wave: "sine", freq: 990, duration: 0.06, gain: 0.16 },
      { kind: "tone", wave: "sine", freq: 1320, delay: 0.05, duration: 0.08, gain: 0.12 },
    ],
  },
  "attack-swing": {
    layers: [
      { kind: "noise", duration: 0.08, gain: 0.14, attack: 0.02, filter: { type: "highpass", freq: 1400 } },
    ],
  },
  "attack-hit-light": {
    layers: [
      { kind: "noise", duration: 0.07, gain: 0.28, filter: { type: "lowpass", freq: 900 } },
      { kind: "tone", wave: "square", freq: 220, freqEnd: 110, duration: 0.1, gain: 0.22 },
    ],
  },
  "attack-hit-heavy": {
    layers: [
      { kind: "noise", duration: 0.14, gain: 0.4, filter: { type: "lowpass", freq: 550 } },
      { kind: "tone", wave: "sawtooth", freq: 160, freqEnd: 55, duration: 0.2, gain: 0.3 },
    ],
  },
  "attack-miss": {
    layers: [
      { kind: "noise", duration: 0.07, gain: 0.09, attack: 0.02, filter: { type: "highpass", freq: 2200 } },
    ],
  },
  "ability-use": {
    layers: [
      { kind: "tone", wave: "sawtooth", freq: 330, freqEnd: 660, duration: 0.14, gain: 0.16 },
      { kind: "tone", wave: "sine", freq: 990, delay: 0.08, duration: 0.1, gain: 0.14 },
    ],
  },
  "item-use": {
    layers: [
      { kind: "tone", wave: "triangle", freq: 494, duration: 0.07, gain: 0.18 },
      { kind: "tone", wave: "triangle", freq: 740, delay: 0.07, duration: 0.09, gain: 0.18 },
    ],
  },
  "enemy-defeat": {
    layers: [
      { kind: "tone", wave: "sawtooth", freq: 440, freqEnd: 55, duration: 0.3, gain: 0.2 },
      { kind: "noise", duration: 0.2, gain: 0.16, filter: { type: "lowpass", freq: 700 } },
    ],
  },
  victory: {
    layers: [
      { kind: "tone", wave: "triangle", freq: 523, duration: 0.14, gain: 0.22 },
      { kind: "tone", wave: "triangle", freq: 659, delay: 0.12, duration: 0.14, gain: 0.22 },
      { kind: "tone", wave: "triangle", freq: 784, delay: 0.24, duration: 0.14, gain: 0.22 },
      { kind: "tone", wave: "sine", freq: 1047, delay: 0.36, duration: 0.5, gain: 0.24, attack: 0.02 },
    ],
  },
  defeat: {
    layers: [
      { kind: "tone", wave: "sawtooth", freq: 220, freqEnd: 82, duration: 0.55, gain: 0.16, attack: 0.05 },
      { kind: "tone", wave: "sine", freq: 110, freqEnd: 55, duration: 0.7, gain: 0.2, attack: 0.05 },
    ],
  },
  equip: {
    layers: [
      { kind: "tone", wave: "square", freq: 440, duration: 0.05, gain: 0.14 },
      { kind: "tone", wave: "square", freq: 660, delay: 0.06, duration: 0.06, gain: 0.14 },
    ],
  },
  unequip: {
    layers: [
      { kind: "tone", wave: "square", freq: 660, duration: 0.05, gain: 0.14 },
      { kind: "tone", wave: "square", freq: 440, delay: 0.06, duration: 0.06, gain: 0.14 },
    ],
  },
  // A hand over a mouth: a muffled thump and nothing else. Quiet on
  // purpose — the whole point of the move is that it is not heard.
  takedown: {
    layers: [
      { kind: "noise", duration: 0.09, gain: 0.09, filter: { type: "lowpass", freq: 420 } },
      { kind: "tone", wave: "sine", freq: 165, freqEnd: 82, duration: 0.16, gain: 0.12 },
    ],
  },
  // The opposite: two hard rising notes, the sound of somebody else
  // having decided something about you.
  spotted: {
    layers: [
      { kind: "tone", wave: "square", freq: 523, duration: 0.1, gain: 0.2 },
      { kind: "tone", wave: "square", freq: 784, delay: 0.1, duration: 0.18, gain: 0.2 },
      { kind: "noise", delay: 0.1, duration: 0.2, gain: 0.1, filter: { type: "highpass", freq: 1800 } },
    ],
  },
  install: {
    layers: [
      { kind: "noise", duration: 0.18, gain: 0.1, filter: { type: "bandpass", freq: 1100, q: 2 } },
      { kind: "tone", wave: "sawtooth", freq: 110, freqEnd: 440, duration: 0.22, gain: 0.14, attack: 0.02 },
      { kind: "tone", wave: "square", freq: 880, delay: 0.22, duration: 0.06, gain: 0.16 },
    ],
  },

  // --- UI: the wizard, the pickers, the overlays -------------------------

  // A step of the character wizard closing behind you: two notes up, the
  // second brighter — the same shape as ui-confirm, said faster.
  "wizard-step": {
    layers: [
      { kind: "tone", wave: "triangle", freq: 587, freqEnd: 880, duration: 0.06, gain: 0.16 },
      { kind: "tone", wave: "triangle", freq: 1175, delay: 0.06, duration: 0.08, gain: 0.12 },
    ],
  },
  // Picking a look off a thumbnail grid: a dry double tick, quiet enough
  // to survive being fired forty times while somebody browses hair.
  "thumbnail-select": {
    layers: [
      { kind: "tone", wave: "square", freq: 1046, duration: 0.035, gain: 0.14 },
      { kind: "tone", wave: "square", freq: 1568, delay: 0.035, duration: 0.045, gain: 0.1 },
    ],
  },
  // A colour swatch: the smallest sound in the game. One tick.
  "swatch-click": {
    layers: [{ kind: "tone", wave: "sine", freq: 1320, duration: 0.03, gain: 0.12 }],
  },
  // Taking a perk — the only UI sound allowed to be a fanfare, because
  // it is the only UI moment the character is permanently changed by.
  "perk-pick": {
    layers: [
      // Strictly end to end: a fanfare that overlapped itself would be
      // the loudest thing in the UI band, which a perk pick is not.
      { kind: "tone", wave: "triangle", freq: 523, duration: 0.09, gain: 0.18 },
      { kind: "tone", wave: "triangle", freq: 784, delay: 0.09, duration: 0.09, gain: 0.18 },
      { kind: "tone", wave: "triangle", freq: 1046, delay: 0.18, duration: 0.12, gain: 0.2 },
      { kind: "tone", wave: "sine", freq: 1568, delay: 0.3, duration: 0.34, gain: 0.14, attack: 0.02 },
    ],
  },
  // One node of a breach route taking: a pulse, and its octave answering.
  "breach-node": {
    layers: [
      { kind: "tone", wave: "sine", freq: 880, duration: 0.05, gain: 0.14 },
      { kind: "tone", wave: "sine", freq: 1320, delay: 0.04, duration: 0.06, gain: 0.1 },
    ],
  },
  // The trace closing: a two-tone alarm falling rather than rising, with
  // hiss under it. The one UI sound meant to be unpleasant.
  "breach-alarm": {
    layers: [
      { kind: "tone", wave: "square", freq: 740, duration: 0.14, gain: 0.18 },
      { kind: "tone", wave: "square", freq: 587, delay: 0.14, duration: 0.18, gain: 0.18 },
      { kind: "noise", duration: 0.3, gain: 0.08, attack: 0.03, filter: { type: "highpass", freq: 2000 } },
    ],
  },
  // Talking a price down: the small satisfied interval.
  "haggle-success": {
    layers: [
      { kind: "tone", wave: "triangle", freq: 660, duration: 0.07, gain: 0.16 },
      { kind: "tone", wave: "triangle", freq: 988, delay: 0.07, duration: 0.12, gain: 0.18 },
    ],
  },
  // Failing to: one note down, and the shutter of somebody done talking.
  "haggle-fail": {
    layers: [
      { kind: "tone", wave: "square", freq: 392, freqEnd: 247, duration: 0.16, gain: 0.16 },
      { kind: "noise", duration: 0.08, gain: 0.06, filter: { type: "lowpass", freq: 800 } },
    ],
  },
  // Dye going onto cloth: a soft wash with a rise through it.
  "dye-apply": {
    layers: [
      { kind: "noise", duration: 0.2, gain: 0.08, attack: 0.06, filter: { type: "bandpass", freq: 700, q: 1 } },
      { kind: "tone", wave: "sine", freq: 440, freqEnd: 880, duration: 0.22, gain: 0.12 },
    ],
  },
  // The stylist's two snips — the motif the chair is remembered by.
  "stylist-snip": {
    layers: [
      { kind: "noise", duration: 0.02, gain: 0.12, filter: { type: "highpass", freq: 5000 } },
      { kind: "tone", wave: "square", freq: 2200, duration: 0.015, gain: 0.08 },
      { kind: "noise", delay: 0.07, duration: 0.02, gain: 0.12, filter: { type: "highpass", freq: 5000 } },
    ],
  },
  // A memory shard indexing: three notes climbing, the last one open.
  "shard-pickup": {
    layers: [
      { kind: "tone", wave: "sine", freq: 1046, duration: 0.09, gain: 0.16 },
      { kind: "tone", wave: "sine", freq: 1568, delay: 0.08, duration: 0.12, gain: 0.16 },
      { kind: "tone", wave: "sine", freq: 2093, delay: 0.16, duration: 0.2, gain: 0.12, attack: 0.02 },
    ],
  },
  // Taking an injury: a sour fall with a low ache left under it.
  "injury-sting": {
    layers: [
      { kind: "tone", wave: "sawtooth", freq: 330, freqEnd: 190, duration: 0.22, gain: 0.16 },
      { kind: "tone", wave: "sine", freq: 82, duration: 0.26, gain: 0.12, attack: 0.02 },
    ],
  },
  // A bark appearing over somebody's head. Barely a sound — it fires
  // whenever the street has something to say, which is often.
  "bark-pop": {
    layers: [
      { kind: "tone", wave: "triangle", freq: 620, duration: 0.03, gain: 0.1 },
      { kind: "tone", wave: "triangle", freq: 880, delay: 0.03, duration: 0.04, gain: 0.08 },
    ],
  },

  // --- World: weather, set pieces, doorways ------------------------------

  // The rain bed: a long filtered swell, retriggered while it rains
  // rather than looped — a loop would need a source the mixer keeps
  // alive, and this is the same curtain with none of the bookkeeping.
  "rain-bed": {
    layers: [
      { kind: "noise", duration: 1.6, gain: 0.1, attack: 0.5, filter: { type: "lowpass", freq: 1800 } },
    ],
  },
  // One drop finding a puddle, on the beat the splash sprite plays.
  "rain-splash": {
    layers: [
      { kind: "noise", duration: 0.06, gain: 0.07, filter: { type: "bandpass", freq: 2600, q: 1.5 } },
      { kind: "tone", wave: "sine", freq: 1400, freqEnd: 900, duration: 0.05, gain: 0.05 },
    ],
  },
  // A rake crossing the elevated track: rumble, a low grind under it,
  // and the wheel noise arriving late.
  "train-pass": {
    layers: [
      { kind: "noise", duration: 1.4, gain: 0.14, attack: 0.35, filter: { type: "lowpass", freq: 260 } },
      { kind: "tone", wave: "sawtooth", freq: 60, freqEnd: 48, duration: 1.5, gain: 0.1, attack: 0.4 },
      { kind: "noise", delay: 0.5, duration: 0.5, gain: 0.06, attack: 0.15, filter: { type: "bandpass", freq: 900, q: 1 } },
    ],
  },
  // A patrol drone passing: two detuned rotors and rotor hiss, swept
  // down across the pass — the doppler is in the sweep, not in a filter.
  "drone-hum": {
    layers: [
      { kind: "tone", wave: "triangle", freq: 320, freqEnd: 290, duration: 0.9, gain: 0.1, attack: 0.25 },
      { kind: "tone", wave: "triangle", freq: 640, freqEnd: 570, duration: 0.9, gain: 0.05, attack: 0.3 },
      { kind: "noise", duration: 0.8, gain: 0.04, attack: 0.3, filter: { type: "highpass", freq: 4000 } },
    ],
  },
  // A vent letting go: the hiss, then the body of it.
  "steam-burst": {
    layers: [
      { kind: "noise", duration: 0.34, gain: 0.16, attack: 0.02, filter: { type: "highpass", freq: 2400 } },
      { kind: "noise", delay: 0.05, duration: 0.22, gain: 0.08, attack: 0.04, filter: { type: "bandpass", freq: 1200, q: 1 } },
    ],
  },
  // A doorway cycling open: servo up, and the latch releasing.
  "door-open": {
    layers: [
      { kind: "noise", duration: 0.18, gain: 0.1, filter: { type: "lowpass", freq: 900 } },
      { kind: "tone", wave: "sawtooth", freq: 90, freqEnd: 150, duration: 0.22, gain: 0.1, attack: 0.03 },
      { kind: "tone", wave: "square", freq: 600, delay: 0.2, duration: 0.05, gain: 0.1 },
    ],
  },
  // And shut: servo down, the panel seating, the latch taking.
  "door-close": {
    layers: [
      { kind: "tone", wave: "sawtooth", freq: 150, freqEnd: 80, duration: 0.2, gain: 0.1, attack: 0.03 },
      { kind: "noise", delay: 0.16, duration: 0.1, gain: 0.12, filter: { type: "lowpass", freq: 700 } },
      { kind: "tone", wave: "square", freq: 400, delay: 0.24, duration: 0.05, gain: 0.1 },
    ],
  },
  // The screen going under and coming back: air, and a rise through it.
  "transition-whoosh": {
    layers: [
      { kind: "noise", duration: 0.5, gain: 0.12, attack: 0.18, filter: { type: "highpass", freq: 600 } },
      { kind: "tone", wave: "sine", freq: 220, freqEnd: 660, duration: 0.45, gain: 0.08, attack: 0.15 },
    ],
  },

  // --- Combat: one swing per weapon class --------------------------------
  //
  // Each class is the same three questions answered differently: how
  // much air it moves, how bright the contact edge is, and how much body
  // is behind it. The generic "attack-swing" above stays as the fallback
  // for anything holding something the art does not know about.

  // Bare hands: air and a short body thud, no edge at all.
  "attack-unarmed": {
    layers: [
      { kind: "noise", duration: 0.06, gain: 0.12, attack: 0.02, filter: { type: "highpass", freq: 900 } },
      { kind: "tone", wave: "sine", freq: 180, freqEnd: 90, duration: 0.08, gain: 0.14 },
    ],
  },
  // A blade: almost no air, all edge — a bright rising scrape.
  "attack-blade": {
    layers: [
      { kind: "noise", duration: 0.07, gain: 0.16, attack: 0.015, filter: { type: "bandpass", freq: 3000, q: 3 } },
      { kind: "tone", wave: "sawtooth", freq: 1400, freqEnd: 2600, duration: 0.06, gain: 0.1 },
    ],
  },
  // A baton: the most air of the melee set, and a low body under it.
  "attack-baton": {
    layers: [
      { kind: "noise", duration: 0.09, gain: 0.16, attack: 0.03, filter: { type: "highpass", freq: 700 } },
      { kind: "tone", wave: "triangle", freq: 300, freqEnd: 140, duration: 0.1, gain: 0.14 },
    ],
  },
  // A sidearm: a crack with a short square body and nothing after it.
  "attack-pistol": {
    layers: [
      { kind: "noise", duration: 0.05, gain: 0.3, filter: { type: "highpass", freq: 1800 } },
      { kind: "tone", wave: "square", freq: 420, freqEnd: 90, duration: 0.07, gain: 0.22 },
    ],
  },
  // A rifle: the same crack with more behind it and a tail off the walls.
  "attack-rifle": {
    layers: [
      { kind: "noise", duration: 0.09, gain: 0.34, filter: { type: "highpass", freq: 1200 } },
      { kind: "tone", wave: "sawtooth", freq: 300, freqEnd: 60, duration: 0.14, gain: 0.26 },
      { kind: "noise", delay: 0.05, duration: 0.18, gain: 0.12, attack: 0.03, filter: { type: "lowpass", freq: 400 } },
    ],
  },
  // A monowire lash: air that climbs rather than falls.
  "attack-lash": {
    layers: [
      { kind: "noise", duration: 0.1, gain: 0.18, attack: 0.04, filter: { type: "bandpass", freq: 2400, q: 4 } },
      { kind: "tone", wave: "sawtooth", freq: 700, freqEnd: 2200, duration: 0.08, gain: 0.12 },
    ],
  },
  // A round in the air between the muzzle and whatever it reaches.
  "projectile-whoosh": {
    layers: [
      { kind: "noise", duration: 0.05, gain: 0.08, attack: 0.02, filter: { type: "highpass", freq: 2000 } },
      { kind: "noise", delay: 0.04, duration: 0.06, gain: 0.06, attack: 0.02, filter: { type: "highpass", freq: 3200 } },
      { kind: "tone", wave: "sine", freq: 900, freqEnd: 1800, duration: 0.09, gain: 0.06, attack: 0.03 },
    ],
  },

  // --- Combat: what the blow was worth -----------------------------------
  //
  // The five weights the camera already reads (see ../iso/cameraFeel.ts),
  // said in sound: a glance is a tick, a solid hit has a body, a heavy
  // one has a floor under it, a critical rings on top of that, and a
  // blast is all floor and no contact.

  // Armor ate it: thin, high, and over immediately.
  "impact-glancing": {
    layers: [
      { kind: "noise", duration: 0.04, gain: 0.14, filter: { type: "lowpass", freq: 1600 } },
      { kind: "tone", wave: "square", freq: 330, freqEnd: 220, duration: 0.05, gain: 0.1 },
    ],
  },
  // The loudest thing the game plays, and the reference every other
  // family's ceiling is written against.
  "impact-critical": {
    layers: [
      { kind: "noise", duration: 0.16, gain: 0.36, filter: { type: "lowpass", freq: 500 } },
      { kind: "tone", wave: "sawtooth", freq: 200, freqEnd: 45, duration: 0.24, gain: 0.28 },
      { kind: "tone", wave: "square", freq: 1400, freqEnd: 700, duration: 0.08, gain: 0.14 },
    ],
  },
  // A blast: nothing connected, so there is no contact edge — only the
  // floor dropping out and the air after it.
  "impact-explosion": {
    layers: [
      { kind: "noise", duration: 0.3, gain: 0.34, attack: 0.01, filter: { type: "lowpass", freq: 320 } },
      { kind: "tone", wave: "sine", freq: 90, freqEnd: 35, duration: 0.38, gain: 0.28, attack: 0.02 },
      { kind: "noise", duration: 0.1, gain: 0.12, filter: { type: "highpass", freq: 2000 } },
    ],
  },
  // The freeze itself: a sub thump on the frame the scene stops moving,
  // so the held frame is heard as weight rather than as a dropped one.
  "hit-pause-thump": {
    layers: [
      { kind: "tone", wave: "sine", freq: 70, freqEnd: 40, duration: 0.12, gain: 0.22, attack: 0.008 },
      { kind: "noise", duration: 0.06, gain: 0.1, filter: { type: "lowpass", freq: 200 } },
    ],
  },
  // A body going down: the fall, the landing, and the settle after it.
  "death-collapse": {
    layers: [
      { kind: "tone", wave: "sawtooth", freq: 300, freqEnd: 50, duration: 0.34, gain: 0.18 },
      { kind: "noise", delay: 0.12, duration: 0.26, gain: 0.18, filter: { type: "lowpass", freq: 600 } },
      { kind: "noise", delay: 0.3, duration: 0.16, gain: 0.1, filter: { type: "lowpass", freq: 300 } },
    ],
  },

  // --- Combat: one signature per ability archetype -----------------------
  //
  // The eight looks in ../iso/abilityFx.ts, each with a sound authored to
  // the same shape the art has: a beam strikes, a volley repeats, a
  // flash is instant, a slam drops, a mesh closes, a cloud swells, a
  // ward shimmers up, a focus ring resolves.

  "ability-shock-arc": {
    layers: [
      { kind: "tone", wave: "square", freq: 1200, freqEnd: 300, duration: 0.12, gain: 0.16 },
      { kind: "noise", duration: 0.1, gain: 0.12, filter: { type: "highpass", freq: 3000 } },
      { kind: "tone", wave: "square", freq: 900, freqEnd: 200, delay: 0.06, duration: 0.1, gain: 0.1 },
    ],
  },
  "ability-volley-streak": {
    layers: [
      { kind: "tone", wave: "square", freq: 1600, freqEnd: 800, duration: 0.04, gain: 0.16 },
      { kind: "tone", wave: "square", freq: 1500, freqEnd: 760, delay: 0.05, duration: 0.04, gain: 0.14 },
      { kind: "tone", wave: "square", freq: 1400, freqEnd: 720, delay: 0.1, duration: 0.04, gain: 0.12 },
      { kind: "noise", duration: 0.12, gain: 0.08, filter: { type: "highpass", freq: 2200 } },
    ],
  },
  "ability-optic-flash": {
    layers: [
      { kind: "tone", wave: "sine", freq: 2400, duration: 0.18, gain: 0.18, attack: 0.002 },
      { kind: "tone", wave: "sine", freq: 3200, delay: 0.02, duration: 0.14, gain: 0.12 },
    ],
  },
  "ability-kinetic-slam": {
    layers: [
      { kind: "tone", wave: "sine", freq: 160, freqEnd: 40, duration: 0.26, gain: 0.3 },
      { kind: "noise", duration: 0.16, gain: 0.24, filter: { type: "lowpass", freq: 400 } },
    ],
  },
  "ability-snare-mesh": {
    layers: [
      { kind: "tone", wave: "square", freq: 700, freqEnd: 350, duration: 0.16, gain: 0.12 },
      { kind: "noise", duration: 0.22, gain: 0.1, attack: 0.04, filter: { type: "bandpass", freq: 1800, q: 8 } },
      { kind: "tone", wave: "square", freq: 350, delay: 0.16, duration: 0.1, gain: 0.1 },
    ],
  },
  "ability-nano-cloud": {
    layers: [
      { kind: "noise", duration: 0.45, gain: 0.1, attack: 0.08, filter: { type: "bandpass", freq: 900, q: 2 } },
      { kind: "tone", wave: "sine", freq: 300, freqEnd: 180, duration: 0.4, gain: 0.08, attack: 0.06 },
    ],
  },
  "ability-guard-shimmer": {
    layers: [
      { kind: "tone", wave: "triangle", freq: 880, freqEnd: 1320, duration: 0.2, gain: 0.14, attack: 0.02 },
      { kind: "tone", wave: "triangle", freq: 1320, delay: 0.18, duration: 0.22, gain: 0.1, attack: 0.03 },
    ],
  },
  "ability-focus-ring": {
    layers: [
      { kind: "tone", wave: "sine", freq: 660, duration: 0.16, gain: 0.14 },
      { kind: "tone", wave: "sine", freq: 990, delay: 0.1, duration: 0.2, gain: 0.12 },
      { kind: "tone", wave: "sine", freq: 1320, delay: 0.2, duration: 0.26, gain: 0.1, attack: 0.02 },
    ],
  },

  // --- Combat: the named antagonist --------------------------------------

  // A multi-tile chassis turning to face you: servos, and the frame
  // taking the load. Long and quiet — it is a presence, not a hit.
  "boss-servo": {
    layers: [
      { kind: "tone", wave: "sawtooth", freq: 220, freqEnd: 260, duration: 0.3, gain: 0.12, attack: 0.05 },
      { kind: "tone", wave: "square", freq: 440, duration: 0.28, gain: 0.06, attack: 0.06 },
      { kind: "noise", duration: 0.3, gain: 0.08, attack: 0.05, filter: { type: "bandpass", freq: 1500, q: 6 } },
    ],
  },
  // The same chassis putting a foot down. Everything a critical has,
  // an octave lower and without the ring.
  "boss-stomp": {
    layers: [
      { kind: "tone", wave: "sine", freq: 110, freqEnd: 30, duration: 0.4, gain: 0.34, attack: 0.01 },
      { kind: "noise", duration: 0.22, gain: 0.28, filter: { type: "lowpass", freq: 260 } },
      { kind: "noise", delay: 0.04, duration: 0.1, gain: 0.12, filter: { type: "lowpass", freq: 900 } },
    ],
  },

  // --- Ambient: the world changing under the player ----------------------

  // A headline coming up on a street screen. The quietest cue in the
  // game: it fires whenever a board turns over, whether or not anybody
  // is reading it.
  "news-blip": {
    layers: [
      { kind: "tone", wave: "square", freq: 1760, duration: 0.025, gain: 0.1 },
      { kind: "tone", wave: "square", freq: 2200, delay: 0.03, duration: 0.03, gain: 0.08 },
    ],
  },
  // Something in the world has moved — a faction's standing, a district
  // reacting. A low bell, easy to miss and never in the way.
  "world-shift": {
    layers: [
      { kind: "tone", wave: "sine", freq: 220, duration: 0.5, gain: 0.12, attack: 0.04 },
      { kind: "tone", wave: "sine", freq: 330, delay: 0.06, duration: 0.5, gain: 0.08, attack: 0.06 },
    ],
  },
  // The sky turning over: air, and the pressure under it changing.
  "weather-turn": {
    layers: [
      { kind: "noise", duration: 0.7, gain: 0.08, attack: 0.25, filter: { type: "lowpass", freq: 1200 } },
      { kind: "tone", wave: "sine", freq: 165, freqEnd: 110, duration: 0.6, gain: 0.08, attack: 0.2 },
    ],
  },
};

export function getPatch(id: SoundId): SynthPatch {
  return SOUND_PATCHES[id];
}
