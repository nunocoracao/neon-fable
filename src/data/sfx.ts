/**
 * The sound-effect catalog: every *semantic* event the game can say,
 * and the synth patch each one is said with.
 *
 * Systems emit events, never patches. A weapon class swinging, a vent
 * letting go, a trace alarm tripping, a headline turning over — the
 * system that causes it names what happened and nothing else, and this
 * one table decides what that sounds like. Re-voicing a cue is an edit
 * here; it never touches combat, the world, or a screen.
 *
 * ## The naming scheme
 *
 * `family.system.thing` — dot-separated, lower-kebab within a segment.
 * The first segment is the *family*, and it is not decoration: it
 * decides the loudness band the patch has to sit inside (FAMILY_GAINS
 * below), which is what keeps a new cue from becoming the loudest thing
 * in the mix. Four families, loudest first:
 *
 * - `combat` — swings, impacts, abilities, deaths. The reference band:
 *   a critical melee impact is as loud as the game ever gets, and every
 *   other family's ceiling is written down from it.
 * - `ui`  — clicks, confirms, pickers, overlay stings. Loud enough to
 *   answer a click, quiet enough to fire forty times while somebody
 *   browses hair.
 * - `world` — footsteps, weather, set pieces, doorways. These play
 *   unprompted and often, so they sit under everything the player did
 *   on purpose.
 * - `ambient` — one-shots for the world changing on its own. The
 *   quietest band in the game: audible, never in the way.
 *
 * ## What is pinned
 *
 * ../audio/events.test.ts checks this catalog against the id lists the
 * engine actually owns — every attack class can swing, every ability
 * archetype has a signature, every impact weight has an impact — so
 * adding a weapon class or an ability look fails a test until it can be
 * heard. ../audio/patches.test.ts checks every patch against its
 * family's band. Nothing here is reachable by a call site that has not
 * been through ../audio/events.ts.
 */
import type { SoundId } from "../audio/patches";

/** Loudest first; the order the bands below are written in. */
export const SOUND_FAMILIES = ["combat", "ui", "world", "ambient"] as const;

export type SoundFamily = (typeof SOUND_FAMILIES)[number];

/** The loudness band one family's patches have to sit inside. */
export interface FamilyGains {
  /** Ceiling on any single layer's peak gain. */
  readonly maxLayerGain: number;
  /**
   * Ceiling on every layer of the patch *sounding at once* — see
   * patchPeakGain in ../audio/patches. This is the number that actually
   * clips a mix, and the one a stacked patch fails first.
   */
  readonly maxPeakGain: number;
  /** Floor on the same, so nothing is authored inaudible. */
  readonly minPeakGain: number;
}

/**
 * Per-family loudness conventions, in SFX-channel gain.
 *
 * The ceilings are not arbitrary: `combat` is measured off the heaviest
 * impacts the first pass shipped (attack-hit-heavy peaks at 0.70), and
 * every other family is a fraction of that — UI and world at roughly
 * half, ambient at a third. A patch that wants more room is a patch
 * that wants to be in a louder family, and usually should not be.
 */
export const FAMILY_GAINS: Readonly<Record<SoundFamily, FamilyGains>> = {
  combat: { maxLayerGain: 0.42, maxPeakGain: 0.8, minPeakGain: 0.05 },
  ui: { maxLayerGain: 0.24, maxPeakGain: 0.34, minPeakGain: 0.05 },
  world: { maxLayerGain: 0.2, maxPeakGain: 0.34, minPeakGain: 0.05 },
  ambient: { maxLayerGain: 0.18, maxPeakGain: 0.26, minPeakGain: 0.05 },
};

/**
 * The registry: semantic event → synth patch. The single place the two
 * vocabularies meet, and the only reason a system ever has to know a
 * sound exists.
 *
 * Several events share a patch on purpose — a breach run coming out
 * clean is the same confirmation any other screen gives, and saying so
 * twice would only mean two sounds to keep in tune. What is never
 * shared is a *signature*: anything a player is meant to recognise by
 * ear has its own patch.
 */
export const SOUND_EVENT_PATCHES = {
  // --- combat: swings, one per weapon class -----------------------------
  "combat.attack.swing": "attack-swing",
  "combat.attack.unarmed": "attack-unarmed",
  "combat.attack.blade": "attack-blade",
  "combat.attack.baton": "attack-baton",
  "combat.attack.pistol": "attack-pistol",
  "combat.attack.rifle": "attack-rifle",
  "combat.attack.lash": "attack-lash",
  "combat.attack.miss": "attack-miss",
  "combat.projectile.whoosh": "projectile-whoosh",

  // --- combat: what the blow was worth ----------------------------------
  "combat.impact.glancing": "impact-glancing",
  "combat.impact.solid": "attack-hit-light",
  "combat.impact.heavy": "attack-hit-heavy",
  "combat.impact.critical": "impact-critical",
  "combat.impact.explosion": "impact-explosion",
  "combat.hitpause.thump": "hit-pause-thump",
  "combat.death.collapse": "death-collapse",
  "combat.enemy.defeat": "enemy-defeat",

  // --- combat: ability archetypes ---------------------------------------
  "combat.ability.cast": "ability-use",
  "combat.ability.shock-arc": "ability-shock-arc",
  "combat.ability.volley-streak": "ability-volley-streak",
  "combat.ability.optic-flash": "ability-optic-flash",
  "combat.ability.kinetic-slam": "ability-kinetic-slam",
  "combat.ability.snare-mesh": "ability-snare-mesh",
  "combat.ability.nano-cloud": "ability-nano-cloud",
  "combat.ability.guard-shimmer": "ability-guard-shimmer",
  "combat.ability.focus-ring": "ability-focus-ring",

  // --- combat: the named antagonist -------------------------------------
  "combat.boss.servo": "boss-servo",
  "combat.boss.stomp": "boss-stomp",

  // --- combat: the rest of a fight --------------------------------------
  "combat.item.use": "item-use",
  "combat.outcome.victory": "victory",
  "combat.outcome.defeat": "defeat",
  "combat.stealth.takedown": "takedown",
  "combat.stealth.spotted": "spotted",

  // --- ui: the shell ----------------------------------------------------
  "ui.click": "ui-click",
  "ui.confirm": "ui-confirm",
  "ui.cancel": "ui-cancel",
  "ui.dialogue.advance": "dialogue-advance",
  "ui.dialogue.choice": "choice-select",
  "ui.save": "save-confirm",
  "ui.load": "load-confirm",

  // --- ui: inventory and the workbench ----------------------------------
  "ui.equip": "equip",
  "ui.unequip": "unequip",
  "ui.install": "install",
  "ui.dye.apply": "dye-apply",
  // The same patch a fight uses for a stimulant, because it is the same
  // act — only the screen it happens on is different.
  "ui.item.use": "item-use",

  // --- ui: character creation and the stylist ---------------------------
  "ui.wizard.step": "wizard-step",
  "ui.wizard.thumbnail": "thumbnail-select",
  "ui.wizard.swatch": "swatch-click",
  "ui.stylist.snip": "stylist-snip",

  // --- ui: the v2 systems' own screens ----------------------------------
  "ui.perk.pick": "perk-pick",
  "ui.breach.node": "breach-node",
  "ui.breach.alarm": "breach-alarm",
  "ui.breach.breached": "ui-confirm",
  "ui.breach.lockout": "ui-cancel",
  "ui.haggle.success": "haggle-success",
  "ui.haggle.fail": "haggle-fail",
  "ui.shard.pickup": "shard-pickup",
  "ui.injury.taken": "injury-sting",
  "ui.bark.pop": "bark-pop",

  // --- world: the street ------------------------------------------------
  "world.footstep": "footstep",
  "world.interact": "interact",
  "world.rain.bed": "rain-bed",
  "world.rain.splash": "rain-splash",
  "world.train.pass": "train-pass",
  "world.drone.pass": "drone-hum",
  "world.steam.burst": "steam-burst",
  "world.door.open": "door-open",
  "world.door.close": "door-close",
  "world.transition.whoosh": "transition-whoosh",

  // --- ambient: the world moving on its own -----------------------------
  "ambient.news.blip": "news-blip",
  "ambient.world.shift": "world-shift",
  "ambient.weather.turn": "weather-turn",
} as const satisfies Readonly<Record<string, SoundId>>;

/** Every event a system may emit. */
export type SoundEventId = keyof typeof SOUND_EVENT_PATCHES;
