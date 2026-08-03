import { modEffectLabel, signedNumber, socketLabel, socketsLabel } from "./format";
import { getAbility } from "../data/abilities";
import { getItem } from "../data/items";
import {
  MOD_REMOVAL_FEE,
  benchWeapons,
  fittableMods,
  previewFit,
  previewPull,
  sameWeapon,
  socketAt,
  weaponSockets,
  type BenchWeapon,
  type FitPreview,
  type ProfileDelta,
  type WeaponRef,
  type Workbench,
} from "../inventory";

import { t } from "./strings";

/**
 * The bench screen, as data. Pure over a `Workbench` — no DOM, no
 * session, no item lookups the caller has to repeat — so what the panel
 * shows is testable without mounting it (the same split combatHud.ts
 * and combatHudView.ts use).
 *
 * Every figure on the screen comes from the workbench previews, which
 * run the same `weaponProfile` the fight reads. A delta shown here is
 * the delta the weapon will have.
 */

/** One weapon on the rack, as its row on the left column reads. */
export interface WeaponRow {
  ref: WeaponRef;
  name: string;
  /** "Equipped" or "Carried" — where this copy is. */
  place: string;
  /** "Ranged · 8 dmg" with the fitted parts already folded in. */
  summary: string;
  /** "2 sockets · 1 filled", or the no-sockets line. */
  socketLine: string;
  selected: boolean;
  /** False for weapons the bench can do nothing with. */
  workable: boolean;
}

/** One socket on the selected weapon, and what sits in it. */
export interface SocketRow {
  index: number;
  /** "Barrel", "Core", "Grip". */
  label: string;
  /** The fitted part's name, or the empty-socket line. */
  fitted: string | null;
  /** Effect chips for whatever is fitted; empty when the socket is. */
  effects: string[];
  /** Present exactly when something is fitted and can be pulled. */
  pull: { feeLabel: string; affordable: boolean; deltas: string[] } | null;
}

/** One part in the bag that fits the chosen socket. */
export interface PartRow {
  modId: string;
  name: string;
  quantity: number;
  effects: string[];
  /** What fitting it would do to the weapon's figures. */
  deltas: string[];
  /** Null when the fitting would be refused (occupied, wrong socket). */
  preview: FitPreview | null;
}

export interface WorkbenchModel {
  weapons: WeaponRow[];
  /** The weapon being worked on, or null when the rack is empty. */
  selected: BenchWeapon | null;
  sockets: SocketRow[];
  /** Parts for the chosen socket; empty when no socket is chosen. */
  parts: PartRow[];
  /** Which socket the part list belongs to, or null. */
  socketIndex: number | null;
  credits: number;
}

/** How a figure reads on a delta chip. */
function fieldLabel(field: ProfileDelta["field"]): string {
  switch (field) {
    case "damage":
      return t("bench.field.damage");
    case "accuracy":
      return t("bench.field.accuracy");
    case "armorPierce":
      return t("bench.field.pierce");
    case "rangeBonus":
      return t("bench.field.range");
    case "critShare":
      return t("bench.field.crit");
  }
}

/**
 * "damage 8 → 10". Crit threshold reads as a percentage of the frame,
 * because a share is not a number anybody carries around.
 */
export function deltaLabel(delta: ProfileDelta): string {
  if (delta.field === "critShare") {
    const pct = (value: number): string => `${Math.round(value * 100)}%`;
    return `crit threshold ${pct(delta.before)} → ${pct(delta.after)}`;
  }
  const show = (value: number): string =>
    delta.field === "damage" ? `${value}` : signedNumber(value);
  return `${fieldLabel(delta.field)} ${show(delta.before)} → ${show(delta.after)}`;
}

/** Every figure a fitting moves, as chips; empty when it moves none. */
export function deltaLabels(preview: FitPreview | null): string[] {
  return (preview?.deltas ?? []).map(deltaLabel);
}

/** "Ranged · 8 dmg · +2 armor pierce" for the weapon as it stands. */
export function weaponSummary(weapon: BenchWeapon): string {
  const parts = [
    weapon.profile.rangeType === "melee" ? "Melee" : "Ranged",
    `${weapon.profile.damage} dmg`,
  ];
  const { armorPierce, accuracy, rangeBonus } = weapon.profile;
  if (armorPierce) parts.push(`${signedNumber(armorPierce)} armor pierce`);
  if (accuracy) parts.push(`${signedNumber(accuracy)} accuracy`);
  if (rangeBonus) parts.push(`${signedNumber(rangeBonus)} range`);
  return parts.join(" · ");
}

/** "2 sockets · 1 filled", or what a weapon with none is worth saying. */
export function socketLine(weapon: BenchWeapon): string {
  const total = weaponSockets(weapon.item).length;
  if (total === 0) return t("socket.none");
  const filled = weapon.mods.filter((id) => id != null).length;
  return t("bench.socketLine", {
    sockets: socketsLabel(total),
    filled,
  });
}

/**
 * The whole screen for a bench, a chosen weapon and a chosen socket.
 * Selection is the caller's state — the model is a pure read of it, so
 * a re-render after a fitting never has to re-derive what was clicked.
 */
export function workbenchModel(
  bench: Workbench,
  selectedRef: WeaponRef | null,
  socketIndex: number | null,
): WorkbenchModel {
  const rack = benchWeapons(bench);
  const selected =
    (selectedRef ? rack.find((w) => sameWeapon(w.ref, selectedRef)) : null) ??
    rack.find((w) => weaponSockets(w.item).length > 0) ??
    rack[0] ??
    null;

  const weapons: WeaponRow[] = rack.map((weapon) => ({
    ref: weapon.ref,
    name: weapon.item.name,
    place:
      weapon.ref.where === "equipped"
        ? t("bench.place.equipped")
        : t("bench.place.carried"),
    summary: weaponSummary(weapon),
    socketLine: socketLine(weapon),
    selected: selected !== null && sameWeapon(weapon.ref, selected.ref),
    workable: weaponSockets(weapon.item).length > 0,
  }));

  if (!selected) {
    return {
      weapons,
      selected: null,
      sockets: [],
      parts: [],
      socketIndex: null,
      credits: bench.credits,
    };
  }

  const sockets: SocketRow[] = weaponSockets(selected.item).map(
    (socket, index) => {
      const fittedId = selected.mods[index] ?? null;
      const pullPreview =
        fittedId === null ? null : previewPull(bench, selected.ref, index);
      return {
        index,
        label: socketLabel(socket),
        fitted: fittedId === null ? null : partName(fittedId),
        effects: fittedId === null ? [] : partEffects(fittedId),
        pull:
          pullPreview === null
            ? null
            : {
                feeLabel: `Pull — ${MOD_REMOVAL_FEE} cr`,
                affordable: bench.credits >= MOD_REMOVAL_FEE,
                deltas: deltaLabels(pullPreview),
              },
      };
    },
  );

  // A socket the caller has not chosen (or one this weapon does not
  // have — it changed weapons) shows no parts rather than the wrong ones.
  const socket =
    socketIndex === null ? undefined : socketAt(selected.item, socketIndex);
  const parts: PartRow[] =
    socket === undefined || socketIndex === null
      ? []
      : fittableMods(bench, socket).map((row) => {
          const preview = previewFit(
            bench,
            selected.ref,
            socketIndex,
            row.modId,
          );
          return {
            modId: row.modId,
            name: row.item.name,
            quantity: row.quantity,
            effects: row.item.effects.map((effect) =>
              modEffectLabel(effect, getAbility),
            ),
            deltas: deltaLabels(preview),
            preview,
          };
        });

  return {
    weapons,
    selected,
    sockets,
    parts,
    socketIndex: socket === undefined ? null : socketIndex,
    credits: bench.credits,
  };
}

/* --- Item readings the rows need ------------------------------------- */

function partName(modId: string): string {
  return getItem(modId)?.name ?? modId;
}

function partEffects(modId: string): string[] {
  const item = getItem(modId);
  if (item?.kind !== "mod") return [];
  return item.effects.map((effect) => modEffectLabel(effect, getAbility));
}
