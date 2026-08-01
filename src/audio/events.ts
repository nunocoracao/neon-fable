/**
 * The sound registry, read side: everything the game needs to turn a
 * semantic event into the patch that says it.
 *
 * The table itself is content (../data/sfx.ts). What lives here is the
 * lookup, the family derivation, and the three typed bridges from the
 * engine's own vocabularies — a weapon class, an ability archetype, an
 * impact weight — to the events that answer them. Those bridges are
 * total by construction: the compiler will not let an attack class,
 * ability look, or impact weight exist without a sound, which is the
 * whole reason they are `Record<...>` rather than lookups that can miss.
 *
 * Imports from ../iso here are type-only on purpose: sound content must
 * never pull the renderer into a module graph that does not want it.
 */
import {
  FAMILY_GAINS,
  SOUND_EVENT_PATCHES,
  SOUND_FAMILIES,
  type SoundEventId,
  type SoundFamily,
} from "../data/sfx";
import type { SoundId } from "./patches";
import type { AbilityFxId } from "../iso/abilityFx";
import type { AttackClassId } from "../iso/attack";
import type { ImpactWeight } from "../iso/cameraFeel";

export type { SoundEventId, SoundFamily };
export { FAMILY_GAINS };

/** Every registered event, in catalog order. */
export const SOUND_EVENT_IDS = Object.keys(
  SOUND_EVENT_PATCHES,
) as readonly SoundEventId[];

const EVENT_SET: ReadonlySet<string> = new Set<string>(SOUND_EVENT_IDS);

/** Whether an arbitrary string names a registered event. */
export function isSoundEvent(value: string): value is SoundEventId {
  return EVENT_SET.has(value);
}

/** The patch an event is said with. */
export function patchForEvent(event: SoundEventId): SoundId {
  return SOUND_EVENT_PATCHES[event];
}

/**
 * The family an event belongs to — its id's first segment, which is
 * also the loudness band its patch has to sit inside (FAMILY_GAINS).
 */
export function eventFamily(event: SoundEventId): SoundFamily {
  const head = event.slice(0, event.indexOf("."));
  // Every registered id starts with a family; a test pins that, and the
  // fallback only exists so this can never return undefined.
  return (SOUND_FAMILIES as readonly string[]).includes(head)
    ? (head as SoundFamily)
    : "ui";
}

/** Every event in one family, in catalog order. */
export function eventsInFamily(family: SoundFamily): readonly SoundEventId[] {
  return SOUND_EVENT_IDS.filter((event) => eventFamily(event) === family);
}

/**
 * The swing each weapon class makes. Total over ATTACK_CLASS_IDS — a
 * new class does not compile until it can be heard.
 */
export const ATTACK_EVENTS: Readonly<Record<AttackClassId, SoundEventId>> = {
  unarmed: "combat.attack.unarmed",
  blade: "combat.attack.blade",
  baton: "combat.attack.baton",
  pistol: "combat.attack.pistol",
  rifle: "combat.attack.rifle",
  lash: "combat.attack.lash",
};

export function attackEvent(attackClass: AttackClassId): SoundEventId {
  return ATTACK_EVENTS[attackClass] ?? "combat.attack.swing";
}

/**
 * Which classes throw something that has to travel. Their swing is the
 * shot leaving; the whoosh rides the flight between muzzle and body.
 */
const RANGED_CLASSES: ReadonlySet<AttackClassId> = new Set<AttackClassId>([
  "pistol",
  "rifle",
]);

export function isRangedAttack(attackClass: AttackClassId): boolean {
  return RANGED_CLASSES.has(attackClass);
}

/**
 * One signature per ability archetype (see ../iso/abilityFx.ts). Total
 * over ABILITY_FX_IDS for the same reason as the attacks.
 */
export const ABILITY_EVENTS: Readonly<Record<AbilityFxId, SoundEventId>> = {
  "shock-arc": "combat.ability.shock-arc",
  "volley-streak": "combat.ability.volley-streak",
  "optic-flash": "combat.ability.optic-flash",
  "kinetic-slam": "combat.ability.kinetic-slam",
  "snare-mesh": "combat.ability.snare-mesh",
  "nano-cloud": "combat.ability.nano-cloud",
  "guard-shimmer": "combat.ability.guard-shimmer",
  "focus-ring": "combat.ability.focus-ring",
};

export function abilityEvent(fx: AbilityFxId): SoundEventId {
  return ABILITY_EVENTS[fx] ?? "combat.ability.cast";
}

/**
 * What a landed blow sounds like, by the weight the camera already read
 * off it (see ../iso/cameraFeel.ts). One vocabulary, two answers: the
 * screen holds and the mix hits, on the same beat, from the same number.
 */
export const IMPACT_EVENTS: Readonly<Record<ImpactWeight, SoundEventId>> = {
  glancing: "combat.impact.glancing",
  solid: "combat.impact.solid",
  heavy: "combat.impact.heavy",
  critical: "combat.impact.critical",
  explosion: "combat.impact.explosion",
};

export function impactEvent(weight: ImpactWeight): SoundEventId {
  return IMPACT_EVENTS[weight] ?? "combat.impact.solid";
}
