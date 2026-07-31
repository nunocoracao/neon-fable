import { isCriticalBlow, isGlancingBlow } from "../combat/damage";
import type { CombatEvent } from "../combat/types";
import {
  statusPopupKind,
  statusPopupLabel,
  type PopupKind,
  type StatusFamilyId,
} from "../iso";

/**
 * Turning what the fight *recorded* into what the fight *shows*: one
 * combat-log entry in, the floating readouts it is worth in return.
 *
 * ## One figure, two readings
 *
 * The log is the source of truth and stays it — every number here comes
 * straight off an event, and nothing is counted, remembered, or
 * recomputed on the side. A damage popup and its log line are the same
 * figure said twice, so they cannot drift apart.
 *
 * What the derivation *adds* is styling, and it does that by reading
 * the numbers the engine already produced against the target they
 * landed on: a blow armor mostly stopped (isGlancingBlow) reads as
 * reduced, one that took a real share of the frame (isCriticalBlow)
 * reads as critical. Neither is a new mechanic — the engine rolls no
 * criticals and branches on neither.
 *
 * ## Conditions are state, not events
 *
 * A condition arriving has an event behind it; a condition *ending* has
 * none — it simply stops being true when its turns run out. So status
 * popups are derived from the change in the engine's own condition set
 * (see statusPopups), the very set the markers over the bodies are
 * drawn from. That keeps arrivals and expiries in one rule and still
 * leaves nothing tracked twice: the engine owns the conditions, this
 * only notices when they change.
 *
 * Pure over events and condition sets — no DOM, no scene, no clock.
 */

/** One readout to float over a combatant. */
export interface CombatPopup {
  /** Whose body it belongs over. */
  readonly combatantId: string;
  readonly kind: PopupKind;
  readonly text: string;
}

/** What the styling needs to know about whoever took the blow. */
export interface PopupTargetView {
  /**
   * Plating that stood between the blow and the body — 0 for damage
   * that goes straight through it, which is never a glancing hit
   * however much plating there was.
   */
  readonly armor: number;
  /** The whole frame, which is what makes a figure large or ordinary. */
  readonly maxHp: number;
}

export interface PopupContext {
  /** The target of a blow; absent for events that land on nobody. */
  readonly target?: PopupTargetView;
}

/**
 * How a landed blow of this size reads. Critical outranks reduced: a
 * blow that took a third of the frame is a big hit even if the plating
 * ate as much again on the way in.
 */
export function damagePopupKind(
  damage: number,
  target: PopupTargetView | undefined,
): PopupKind {
  if (isCriticalBlow(damage, target?.maxHp ?? 0)) return "critical";
  return isGlancingBlow(damage, target?.armor ?? 0) ? "reduced" : "damage";
}

/** The figure a blow floats: what got through, signed against the bar. */
export function damagePopupText(damage: number): string {
  return `-${damage}`;
}

/**
 * The readouts one log entry is worth. Most entries are worth none —
 * turn markers, moves, and the fight's own start and end are the log's
 * business, not the arena's.
 */
export function eventPopups(
  event: CombatEvent,
  context: PopupContext = {},
): CombatPopup[] {
  switch (event.type) {
    case "attacked":
      return event.hit
        ? [
            {
              combatantId: event.targetId,
              kind: damagePopupKind(event.damage, context.target),
              text: damagePopupText(event.damage),
            },
          ]
        : [{ combatantId: event.targetId, kind: "miss", text: "MISS" }];
    case "ability-used":
      // A self-buff has no figure to show; the condition it grants
      // announces itself through the status rule instead.
      return event.damage > 0
        ? [
            {
              combatantId: event.targetId,
              kind: damagePopupKind(event.damage, context.target),
              text: damagePopupText(event.damage),
            },
          ]
        : [];
    case "healed":
      return [
        {
          combatantId: event.combatantId,
          kind: "heal",
          text: `+${event.amount}`,
        },
      ];
    case "charge-released":
      // A wind-up that caught nobody is the whole reward for reading
      // the marked ground, so it says so over the thing that threw it.
      // One that connected reports itself through the blows it landed.
      return event.bodies === 0
        ? [{ combatantId: event.combatantId, kind: "miss", text: "NO HIT" }]
        : [];
    case "flee-attempted":
      // Getting away is its own outcome on the screen; failing to is a
      // wasted action, and reads like one.
      return event.success
        ? []
        : [{ combatantId: event.combatantId, kind: "miss", text: "NO ESCAPE" }];
    default:
      return [];
  }
}

/** The conditions on each combatant, as the scene is handed them. */
export type StatusSets = ReadonlyMap<string, readonly StatusFamilyId[]>;

/**
 * The readouts a change in the fight's conditions is worth: a label
 * where a family arrived, a colder one where it lifted.
 *
 * Combatants the previous set had never seen announce nothing — a fight
 * re-entered mid-battle opens with its conditions already true, and
 * shouting them on the first frame would report history as news.
 */
export function statusPopups(
  before: StatusSets,
  after: StatusSets,
): CombatPopup[] {
  const popups: CombatPopup[] = [];
  for (const [combatantId, families] of after) {
    const had = before.get(combatantId);
    if (had === undefined) continue;
    const previous = new Set(had);
    const current = new Set(families);
    for (const family of families) {
      if (!previous.has(family)) {
        popups.push({
          combatantId,
          kind: statusPopupKind("gain"),
          text: statusPopupLabel(family, "gain"),
        });
      }
    }
    for (const family of had) {
      if (!current.has(family)) {
        popups.push({
          combatantId,
          kind: statusPopupKind("loss"),
          text: statusPopupLabel(family, "loss"),
        });
      }
    }
  }
  return popups;
}
