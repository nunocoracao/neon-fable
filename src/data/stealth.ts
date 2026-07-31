/**
 * Stealth content: which encounters can be walked past instead of
 * fought, who is standing between you and the far side, and where they
 * are looking.
 *
 * A stealth zone is a *second route through an existing fight*, never a
 * replacement for one. Every encounter listed here is still reachable
 * the way it always was — a choice in a scene that starts it — and the
 * zone only adds a way to arrive on the other side without that choice
 * ever being offered. Being seen does not fail anything either: it
 * starts the same fight with the guards already moving, which is what
 * `alertFlag` records and what the initiative penalty below is worth.
 *
 * Everything here is data. The geometry (cones, patrol stepping,
 * detection, takedown rules) is pure logic in src/stealth/, the tints
 * are the combat telegraph's palette, and the shell in
 * src/ui/gameScreen.ts is the only place any of it meets a canvas.
 */
import type { Facing } from "../iso/animation";
import type { TilePoint } from "../iso/coords";
import type { Requirement } from "../narrative/types";

/**
 * How long one watch tick lasts. Patrols step on it and detection is
 * asked on it — a player crossing a lit tile between two ticks is not
 * caught, which is the whole of what timing a crossing means here.
 */
export const STEALTH_TICK_MS = 850;

/**
 * Places the player back on their feet in the initiative order when a
 * fight opens with the other side already looking at them. It is a
 * fixed shift on the player's own combatant (see Combatant.initiativeMod
 * and src/combat/setup.ts), so being spotted costs a place in the queue
 * and never a stat, a roll, or a hit point.
 */
export const ALERTED_INITIATIVE_PENALTY = 3;

/**
 * The gear tag that buys a second silent takedown. Reading a *tag*
 * rather than an item id is the rule the Breach runner already follows:
 * the Static Veil is the implant that smears a body out of a
 * recognition system, and anything else that ever earns the same tag
 * gets the same benefit with nothing here changing.
 */
export const SILENT_TAKEDOWN_TAG = "static-veil";

/** How far, and how wide, one pair of eyes reaches. */
export interface VisionSpec {
  /**
   * Tiles ahead the cone carries. Measured as depth along the facing,
   * not as a radius — a guard sees down a corridor, not around itself.
   */
  range: number;
  /**
   * Lateral tiles the cone gains per tile of depth. 0 is a straight
   * line down the facing; 1 opens the full quarter. See coneTiles in
   * src/stealth/vision.ts for the exact shape.
   */
  spread: number;
}

/**
 * One stop on a beat. `dwell` holds the guard here for extra ticks
 * (which is what makes a route's rhythm readable), and `facing` aims
 * them while they stand — a guard posted at a rail looks over it rather
 * than back the way they came.
 */
export interface PatrolWaypoint extends TilePoint {
  dwell?: number;
  facing?: Facing;
}

/**
 * How a beat closes: "cycle" walks back to the first waypoint (a loop
 * round a floor), "pingpong" retraces the route in reverse (a span with
 * one way on and off it). Both are closed — a patrol never runs out.
 */
export type PatrolLoop = "cycle" | "pingpong";

export interface PatrolRoute {
  /** Legs run between consecutive waypoints and must be axis-aligned. */
  waypoints: readonly PatrolWaypoint[];
  /** Defaults to "pingpong": the shape a corridor wants. */
  loop?: PatrolLoop;
}

export interface StealthGuard {
  id: string;
  /** What the prompt and the caught-you line call them. */
  name: string;
  /**
   * Archetype in ./enemies.ts — the body the fight already spawns.
   * Authored here as well as in the encounter so the two can be pinned
   * to each other; which *face* of the archetype patrols is never
   * authored, it is the encounter slot's own (see guardSpriteId), so
   * the body on the walkway is the body the fight opens with.
   */
  enemyId: string;
  /**
   * Index into the encounter's own `enemies` list. A takedown writes
   * that spawn's `absentWhenFlag`, which is how work done in the dark
   * shows up in the fight (see EncounterSpawn.absentWhenFlag).
   */
  spawnSlot: number;
  route: PatrolRoute;
  vision: VisionSpec;
  /**
   * Whether a hand over the mouth is a thing that works on this one.
   * Absent means yes; machines and whatever is moving under the boards
   * declare false and have to be walked around instead.
   */
  takedown?: boolean;
  /**
   * A flag that keeps this one off the beat entirely, mirroring the
   * spawn's own. Work that stands a body down before the fight stands
   * it down before the watch, too.
   */
  absentWhenFlag?: string;
  /** What they say the moment they have you. */
  bark: string;
}

/** A rectangle of map, in tiles. */
export interface StealthRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A gap somebody quick can cross in one movement instead of two steps
 * — the head of a span, the lit mouth of an aisle. Taking it skips the
 * tick's detection check, so a lunge beats a cone that is about to
 * sweep the tile you would otherwise be standing on.
 */
export interface PinchPoint {
  id: string;
  label: string;
  from: TilePoint;
  to: TilePoint;
  /** Reflexes the dash asks for. */
  reflexes: number;
}

/** Reaching one of these tiles unseen ends the zone on the good side. */
export interface StealthGoal {
  tiles: readonly TilePoint[];
  /** Story node the shell opens on arriving; it writes the flags. */
  nodeId: string;
}

export interface StealthZone {
  id: string;
  name: string;
  mapId: string;
  /** The fight this zone is an alternative to. */
  encounterId: string;
  /**
   * What has to be true of the run for anybody to be standing here. A
   * zone with none is always posted; these two are both scenes the
   * story has to have opened first.
   */
  requires?: readonly Requirement[];
  /** Where the watch applies. Outside it nobody is looking at you. */
  bounds: StealthRect;
  guards: readonly StealthGuard[];
  pinches?: readonly PinchPoint[];
  goal: StealthGoal;
  /** Story node the shell opens when the watch has you. */
  spottedNodeId: string;
  /**
   * Takedowns the zone allows bare-handed; defaults to 1 — "once per
   * zone", which is the rule the feature is built around.
   */
  takedowns?: number;
  /**
   * Takedowns allowed with SILENT_TAKEDOWN_TAG gear; defaults to the
   * bare-handed figure (an implant that buys nothing here is honest
   * about it). It may never reach the number of bodies the fight has,
   * because a fight with nobody in it cannot be walked into — a
   * stealth.test lint fails on that.
   */
  quietTakedowns?: number;
}

/** How the run records what happened in one zone: "passed" | "spotted". */
export function stealthZoneFlag(zoneId: string): string {
  return `stealth:${zoneId}`;
}

/**
 * The flag one guard's takedown writes. The encounter's own spawn
 * declares the identical string as its `absentWhenFlag`, which is the
 * entire join between a hand over a mouth and a body that does not turn
 * up — see enc-exec-security and enc-quays-salvage in ./encounters.ts.
 */
export function takedownFlag(zoneId: string, guardId: string): string {
  return `stealth:${zoneId}:${guardId}`;
}

/**
 * The flag that says a fight is opening with the other side already
 * moving. Written by the shell the moment a watch has the player, read
 * once at setup (src/combat/setup.ts) and cleared when the fight is
 * folded back in (src/combat/outcome.ts), so it can never leak into the
 * next fight on the same encounter.
 */
export function alertFlag(encounterId: string): string {
  return `stealth-alert:${encounterId}`;
}

/**
 * The two zones, and why they are these two.
 *
 * Both sit on a fight the story already had, in a place a route already
 * ran through: the directors' floor ninety storeys up, and the crossing
 * out to the bonded store under the quays. Both are optional — the
 * spine of Act 3 does not touch the executive floor at all, and the
 * store is one branch of a district side chain — which is exactly what
 * a route the player might never find should be.
 */
export const stealthZones: StealthZone[] = [
  {
    // --- The Auric Spire, executive floor -----------------------------
    //
    // The floor detail walks two lanes: the lead sweeps the north aisle
    // in front of the corner station, the second works the riser lane
    // between the glazing. The floor's own eye in the air circuits the
    // south half, which is the ground anybody coming up the riser has
    // to cross — and it comes off the beat exactly when a Breach run at
    // the muster relay takes it off the fight's roster, which is the
    // only place in the game where two systems' work lands on one body.
    id: "exec-detail",
    name: "The Floor Detail",
    mapId: "auric-executive",
    encounterId: "enc-exec-security",
    // Standing on the floor at all is the whole requirement: the riser
    // only opens for a run that has been up it (see a3-exec-lift), and
    // a detail that has already been dealt with is not standing here.
    requires: [{ type: "flag-unset", key: "exec-cleared" }],
    bounds: { x: 1, y: 2, width: 11, height: 7 },
    guards: [
      {
        id: "lead",
        name: "the floor detail's lead",
        enemyId: "nme-auric-warden",
        spawnSlot: 0,
        route: {
          waypoints: [
            { x: 3, y: 3, dwell: 2, facing: "w" },
            { x: 8, y: 3, dwell: 2, facing: "e" },
          ],
          loop: "pingpong",
        },
        vision: { range: 4, spread: 1 },
        bark: "\"Stop where you are — this level is closed!\"",
      },
      {
        // Cordon interdiction plate, and an attitude to match: there is
        // nothing on this one to get a hand around, so the second is
        // walked around rather than stood down — which is also what
        // keeps a body in the fight however the floor is crossed.
        id: "second",
        name: "the second of the detail",
        enemyId: "nme-cordon-enforcer",
        spawnSlot: 1,
        takedown: false,
        route: {
          waypoints: [
            { x: 5, y: 8, dwell: 1, facing: "s" },
            { x: 5, y: 3, dwell: 1, facing: "n" },
          ],
          loop: "pingpong",
        },
        vision: { range: 4, spread: 1 },
        bark: "\"Contact on the riser lane — hold there!\"",
      },
      {
        // The eye in the air: nothing to get a hand around, and its
        // sweep is wider and shorter than a person's.
        id: "eye",
        name: "the floor's drone",
        enemyId: "nme-static-drone",
        spawnSlot: 2,
        takedown: false,
        absentWhenFlag: "exec-muster-dark",
        // A closed circuit of the south half — the ground between the
        // riser and the aisle, which is the ground somebody coming up
        // has to cross first.
        route: {
          waypoints: [
            { x: 10, y: 5, dwell: 1 },
            { x: 10, y: 8, dwell: 1 },
            { x: 7, y: 8, dwell: 1 },
            { x: 7, y: 5, dwell: 1 },
          ],
          loop: "cycle",
        },
        vision: { range: 3, spread: 1 },
        bark: "The drone's lamp stops on you and stays there.",
      },
    ],
    pinches: [
      {
        id: "north-gap",
        label: "the lit gap onto the north strip",
        from: { x: 4, y: 3 },
        to: { x: 4, y: 1 },
        reflexes: 6,
      },
      {
        // Over the alcove the east lane is pinched at — the one tile of
        // that lane that is not floor to walk on (a memory chip lies in
        // it; see src/data/lore.ts), and therefore the one place the
        // lane can only be taken at a run.
        id: "east-gap",
        label: "the pinch in the east lane",
        from: { x: 11, y: 8 },
        to: { x: 11, y: 6 },
        reflexes: 6,
      },
    ],
    goal: {
      // The north strip, behind the detail: the aisle is yours from
      // there, which is the same thing the checkpoint sells.
      tiles: [
        { x: 10, y: 1 },
        { x: 11, y: 1 },
      ],
      nodeId: "a3-exec-slipped",
    },
    spottedNodeId: "a3-exec-spotted",
    // One body on this floor can be stood down at all, so one is the
    // allowance and a veil buys nothing here. The floor is the zone
    // about *avoiding* a watch rather than thinning one.
    takedowns: 1,
  },
  {
    // --- The Flooded Quays, the crossing to the bonded store ----------
    //
    // Keel's crew works the two plate walkways over the basin, which
    // are one tile wide and go nowhere except across. The catwalk
    // amidships and the salvage platform hung off it are the only
    // places on the water to be that are not a span.
    id: "store-crossing",
    name: "The Store Crossing",
    mapId: "flooded-quays",
    encounterId: "enc-quays-salvage",
    // The crew is only out on the water once the diver has told you
    // what is under it and you have said yes — before that the basin is
    // just a basin, and afterwards you are already inside. The key is
    // UNDER_WATERLINE_STAGE_FLAG and the value is its "taken" stage;
    // stealth.test pins both against the chain rather than trusting the
    // strings here.
    requires: [{ type: "flag-equals", key: "under-waterline", value: "taken" }],
    bounds: { x: 1, y: 3, width: 14, height: 8 },
    guards: [
      {
        // The lower half of the west span — the stretch between the
        // strand and the catwalk, which is the only way off the bank.
        // A memory chip lying on (4, 5) is what caps the beat: the span
        // above it is not floor anybody can walk.
        id: "west-hand",
        name: "the hand on the west span",
        enemyId: "nme-rustyard-bruiser",
        spawnSlot: 0,
        route: {
          waypoints: [
            { x: 4, y: 6, dwell: 2, facing: "n" },
            { x: 4, y: 10, dwell: 2, facing: "s" },
          ],
          loop: "pingpong",
        },
        vision: { range: 5, spread: 0 },
        bark: "\"Off the boards! Keel — we've got one on the west span!\"",
      },
      {
        // The upper east span and the east end of the catwalk: up to
        // the head of the span, a long look north at the wharf, then
        // back down and out along the boards. The ground behind that
        // look is the whole of the crossing's window.
        id: "east-hand",
        name: "the hand on the east span",
        enemyId: "nme-rustyard-bruiser",
        spawnSlot: 1,
        route: {
          waypoints: [
            { x: 11, y: 3, dwell: 2, facing: "n" },
            { x: 11, y: 7 },
            { x: 8, y: 7, dwell: 2, facing: "w" },
          ],
          loop: "pingpong",
        },
        vision: { range: 5, spread: 0 },
        bark: "\"East span! Somebody's come round the trestle!\"",
      },
      {
        // Whatever the crew keeps in the water under the catwalk. It
        // works the west end of the amidships crossing, where anybody
        // coming off the west span has to step, and there is no getting
        // a hand over anything it has.
        id: "under-boards",
        name: "the thing under the boards",
        enemyId: "nme-vent-crawler",
        spawnSlot: 2,
        takedown: false,
        route: {
          waypoints: [
            { x: 5, y: 7, dwell: 1 },
            { x: 7, y: 7, dwell: 1 },
          ],
          loop: "pingpong",
        },
        vision: { range: 3, spread: 1 },
        bark: "Something comes up through the plate gratings behind you.",
      },
    ],
    pinches: [
      {
        // Off the west span and across the boards in one movement,
        // rather than standing on the corner while something under them
        // works out where you are.
        id: "boards",
        label: "the open boards amidships",
        from: { x: 4, y: 7 },
        to: { x: 6, y: 7 },
        reflexes: 7,
      },
      {
        // Past the head of the east span while its hand is looking up
        // at the wharf.
        id: "east-head",
        label: "the head of the east span",
        from: { x: 11, y: 5 },
        to: { x: 11, y: 3 },
        reflexes: 7,
      },
    ],
    goal: {
      // The wharf's east corner, round the trestle: the store's face is
      // the next thing past it.
      tiles: [
        { x: 13, y: 2 },
        { x: 14, y: 2 },
        { x: 14, y: 1 },
      ],
      nodeId: "uw-quiet",
    },
    spottedNodeId: "uw-spotted",
    // Three bodies, two of them people: one takedown bare-handed, two
    // behind the veil, and the thing in the water is still in the water
    // either way.
    takedowns: 1,
    quietTakedowns: 2,
  },
];

const zonesById = new Map(stealthZones.map((zone) => [zone.id, zone]));

export function getStealthZone(id: string): StealthZone | undefined {
  return zonesById.get(id);
}

export function requireStealthZone(id: string): StealthZone {
  const zone = zonesById.get(id);
  if (!zone) throw new Error(`No stealth zone with id "${id}"`);
  return zone;
}

/** Every zone posted on one map, in authored order. */
export function stealthZonesOnMap(mapId: string): StealthZone[] {
  return stealthZones.filter((zone) => zone.mapId === mapId);
}

/** Takedowns this zone allows, given whether the player is wearing a veil. */
export function takedownAllowance(zone: StealthZone, quiet: boolean): number {
  const bare = zone.takedowns ?? 1;
  return quiet ? Math.max(bare, zone.quietTakedowns ?? bare) : bare;
}

/** The guards a takedown can ever reach — the rest have to be walked around. */
export function takedownGuards(zone: StealthZone): StealthGuard[] {
  return zone.guards.filter((guard) => guard.takedown !== false);
}

export function getStealthGuard(
  zone: StealthZone,
  guardId: string,
): StealthGuard | undefined {
  return zone.guards.find((guard) => guard.id === guardId);
}
