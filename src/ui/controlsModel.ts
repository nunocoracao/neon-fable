/**
 * The key map, written down once.
 *
 * Every keystroke the game answers is a row here, grouped by where a
 * player is standing when it works — the panels, the street, a
 * conversation, a fight, a lattice, the creation wizard. Nothing in
 * this file reads a setting, touches the DOM, or knows what a screen
 * looks like: it is a table of string-table keys, exactly like
 * ./graphicsModel.ts is a table for the comfort switches, and the
 * Controls reference (./controlsScreen.ts) renders it.
 *
 * Two rules keep it honest, and controlsModel.test.ts enforces both:
 *
 * 1. **Every binding names keys and says what they do.** A row with an
 *    empty half is a key nobody can look up.
 * 2. **A group is a place, not a screen.** The same key can appear in
 *    two groups when it genuinely does two things (Escape backs out of
 *    a panel and drops a keyboard pick), and the copy has to say which
 *    is which — so the ids are unique across the whole table and the
 *    test reads them as one namespace.
 *
 * When a screen learns a key, it is added here in the same commit. The
 * reference is only worth having if it is complete, and the only way to
 * keep it complete is to make the table the place a key is declared.
 */
import type { PlainKey } from "./strings";

export interface ControlBinding {
  /** Unique across the whole table; also the row's test handle. */
  id: string;
  /** The keys themselves — "Arrows / WASD", "1–9", "Esc". */
  keys: PlainKey;
  /** What pressing them does, in one line. */
  what: PlainKey;
}

export interface ControlGroup {
  id: string;
  title: PlainKey;
  /** Where these keys work, when that is not obvious from the title. */
  blurb: PlainKey | null;
  bindings: readonly ControlBinding[];
}

export const CONTROL_GROUPS: readonly ControlGroup[] = [
  {
    id: "panels",
    title: "controls.group.panels",
    blurb: "controls.group.panels.blurb",
    bindings: [
      {
        id: "focus",
        keys: "controls.focus.keys",
        what: "controls.focus.what",
      },
      {
        id: "confirm",
        keys: "controls.confirm.keys",
        what: "controls.confirm.what",
      },
      {
        id: "back",
        keys: "controls.back.keys",
        what: "controls.back.what",
      },
      {
        id: "grid",
        keys: "controls.grid.keys",
        what: "controls.grid.what",
      },
    ],
  },
  {
    id: "explore",
    title: "controls.group.explore",
    blurb: "controls.group.explore.blurb",
    bindings: [
      {
        id: "walk",
        keys: "controls.walk.keys",
        what: "controls.walk.what",
      },
      {
        id: "pick",
        keys: "controls.pick.keys",
        what: "controls.pick.what",
      },
      {
        id: "use",
        keys: "controls.use.keys",
        what: "controls.use.what",
      },
      {
        id: "dropPick",
        keys: "controls.dropPick.keys",
        what: "controls.dropPick.what",
      },
      {
        id: "inventory",
        keys: "controls.inventory.keys",
        what: "controls.inventory.what",
      },
      {
        id: "crew",
        keys: "controls.crew.keys",
        what: "controls.crew.what",
      },
      {
        id: "advance",
        keys: "controls.advance.keys",
        what: "controls.advance.what",
      },
      {
        id: "minimap",
        keys: "controls.minimap.keys",
        what: "controls.minimap.what",
      },
      {
        id: "crouch",
        keys: "controls.crouch.keys",
        what: "controls.crouch.what",
      },
      {
        id: "takedown",
        keys: "controls.takedown.keys",
        what: "controls.takedown.what",
      },
      {
        id: "zoom",
        keys: "controls.zoom.keys",
        what: "controls.zoom.what",
      },
      {
        id: "pointer",
        keys: "controls.pointer.keys",
        what: "controls.pointer.what",
      },
    ],
  },
  {
    id: "dialogue",
    title: "controls.group.dialogue",
    blurb: null,
    bindings: [
      {
        id: "choice",
        keys: "controls.choice.keys",
        what: "controls.choice.what",
      },
      {
        id: "choiceFocus",
        keys: "controls.choiceFocus.keys",
        what: "controls.choiceFocus.what",
      },
      {
        id: "skipReveal",
        keys: "controls.skipReveal.keys",
        what: "controls.skipReveal.what",
      },
    ],
  },
  {
    id: "combat",
    title: "controls.group.combat",
    blurb: "controls.group.combat.blurb",
    bindings: [
      {
        id: "action",
        keys: "controls.action.keys",
        what: "controls.action.what",
      },
      {
        id: "step",
        keys: "controls.step.keys",
        what: "controls.step.what",
      },
      {
        id: "cycle",
        keys: "controls.cycle.keys",
        what: "controls.cycle.what",
      },
      {
        id: "cancel",
        keys: "controls.cancel.keys",
        what: "controls.cancel.what",
      },
    ],
  },
  {
    id: "breach",
    title: "controls.group.breach",
    blurb: "controls.group.breach.blurb",
    bindings: [
      {
        id: "route",
        keys: "controls.route.keys",
        what: "controls.route.what",
      },
      {
        id: "stepOn",
        keys: "controls.stepOn.keys",
        what: "controls.stepOn.what",
      },
      {
        id: "undo",
        keys: "controls.undo.keys",
        what: "controls.undo.what",
      },
      {
        id: "withdraw",
        keys: "controls.withdraw.keys",
        what: "controls.withdraw.what",
      },
    ],
  },
  {
    id: "create",
    title: "controls.group.create",
    blurb: "controls.group.create.blurb",
    bindings: [
      {
        id: "stepJump",
        keys: "controls.stepJump.keys",
        what: "controls.stepJump.what",
      },
      {
        id: "turn",
        keys: "controls.turn.keys",
        what: "controls.turn.what",
      },
      {
        id: "motion",
        keys: "controls.motion.keys",
        what: "controls.motion.what",
      },
      {
        id: "previewZoom",
        keys: "controls.previewZoom.keys",
        what: "controls.previewZoom.what",
      },
    ],
  },
];

/** Every binding in the table, flattened — the whole key map at once. */
export function allControlBindings(): ControlBinding[] {
  return CONTROL_GROUPS.flatMap((group) => group.bindings);
}
