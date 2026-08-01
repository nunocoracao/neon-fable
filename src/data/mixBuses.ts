/**
 * The mixer: the four buses every sound in the game passes through, and
 * what each one is called on the settings panel.
 *
 * A bus is a place in the signal path with a fader and a mute on it.
 * Three of them carry sound — music, sound effects, and the shell's own
 * clicks — and each feeds the fourth, master, which feeds the output.
 * Nothing reaches the speakers except through exactly one playback bus
 * and then master, which is what makes "turn the UI down" and "mute
 * everything" two different, honest controls rather than one number
 * shared by everything.
 *
 * The UI bus exists because the shell is the noisiest thing in the game
 * and the least worth hearing: browsing hair fires forty clicks a
 * minute, and a player who wants the street loud and the menus quiet had
 * no way to say so while both rode the SFX channel.
 *
 * Which bus a *sound* lands on is decided by its family, one table over
 * in ./sfx.ts — a sound never names a bus, the same way it never names a
 * patch. ../audio/routing.test.ts pins the two tables against each other.
 */

/** Every bus, master last: the order the signal flows, not the panel. */
export const MIX_BUS_IDS = ["music", "sfx", "ui", "master"] as const;

export type MixBusId = (typeof MIX_BUS_IDS)[number];

/**
 * The buses a sound can actually be played on. Master is not one of
 * them: it is where the others arrive, and a sound routed straight to it
 * would be a sound with no fader of its own.
 */
export const PLAYBACK_BUS_IDS = ["music", "sfx", "ui"] as const;

export type PlaybackBusId = (typeof PLAYBACK_BUS_IDS)[number];

export interface MixBusDef {
  readonly id: MixBusId;
  /** The bus this one feeds; null only for master, which feeds the output. */
  readonly parent: MixBusId | null;
  readonly label: string;
  /** One line under the fader saying what is on it. */
  readonly blurb: string;
  /**
   * The fader position a player who has never touched it starts on — a
   * position on the curve in ../audio/gain.ts, not an amplitude. Master
   * sits below unity so there is somewhere to turn *up* to, and the UI
   * sits under the world because it fires far more often than it matters.
   */
  readonly defaultVolume: number;
}

/** Panel order: master first, then what feeds it. */
export const MIX_BUSES: readonly MixBusDef[] = [
  {
    id: "master",
    parent: null,
    label: "Master",
    blurb: "Everything the game plays, after the three faders below it.",
    defaultVolume: 0.9,
  },
  {
    id: "music",
    parent: "master",
    label: "Music",
    blurb: "The adaptive score: district themes, the hour, and fights.",
    defaultVolume: 0.8,
  },
  {
    id: "sfx",
    parent: "master",
    label: "Sound effects",
    blurb: "Combat, the street, weather, and the world moving on its own.",
    defaultVolume: 1,
  },
  {
    id: "ui",
    parent: "master",
    label: "Interface",
    blurb: "Clicks, confirmations, and the stings menus make. Loud is rarely better here.",
    defaultVolume: 0.85,
  },
];

const BY_ID: ReadonlyMap<MixBusId, MixBusDef> = new Map(
  MIX_BUSES.map((bus) => [bus.id, bus]),
);

/** The bus a bus id names. Total over MixBusId; a test pins that. */
export function requireBus(id: MixBusId): MixBusDef {
  const bus = BY_ID.get(id);
  if (!bus) throw new Error(`Unknown mix bus: ${id}`);
  return bus;
}

export function isPlaybackBus(id: MixBusId): id is PlaybackBusId {
  return (PLAYBACK_BUS_IDS as readonly MixBusId[]).includes(id);
}

/**
 * Every bus a signal on `id` passes through on its way out, `id` first
 * and master last. This is the chain the gain of a sound is the product
 * of, and the chain a mute anywhere in it silences.
 *
 * Bounded by the number of buses rather than trusting the parent links
 * to terminate: a cycle in the table would otherwise hang the mixer
 * instead of failing a test.
 */
export function busChain(id: MixBusId): readonly MixBusId[] {
  const chain: MixBusId[] = [];
  let current: MixBusId | null = id;
  for (let steps = 0; current !== null && steps <= MIX_BUS_IDS.length; steps++) {
    if (chain.includes(current)) break;
    chain.push(current);
    current = requireBus(current).parent;
  }
  return chain;
}
