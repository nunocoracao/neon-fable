/**
 * Action-bar icons: one small palette-indexed glyph per combat action.
 *
 * The HUD is the only part of the game drawn in DOM rather than on the
 * arena canvas, so its buttons are the one place a stray non-pixel icon
 * could creep in. These are authored exactly like every other grid in
 * this directory — same palette, same top-left light, validated by the
 * same test sweep — and baked to canvases by the screen, so a button
 * face is made of the same pixels as the fight behind it.
 *
 * Each glyph is drawn in the channel of the thing it stands for: steel
 * for the blade, magenta for a spark of ability, cyan for the vial and
 * the step, amber for the way out and the turn running down. They read
 * at a glance next to a hotkey number, so they are bold, centered, and
 * carry no detail smaller than two pixels.
 */
import type { PixelGrid } from "./pixel";

/** Every action a bar button can stand for. Matches CombatActionKind. */
export const ACTION_ICON_IDS = [
  "attack",
  "ability",
  "item",
  "move",
  "flee",
  "end-turn",
] as const;

export type ActionIconId = (typeof ACTION_ICON_IDS)[number];

/** Icons are square so a row of buttons lines up without per-icon nudges. */
export const ACTION_ICON_SIZE = 16;

/* --- Attack: two blades crossed, tips up, hilts down. --- */

const attack: PixelGrid = [
  "................",
  ".99..........99.",
  ".898........898.",
  "..898......898..",
  "...898....898...",
  "....898..898....",
  ".....898898.....",
  "......8998......",
  "......8998......",
  ".....898898.....",
  "....8T6..6T8....",
  "...6T6....6T6...",
  "..6T6......6T6..",
  ".6T6........6T6.",
  ".66..........66.",
  "................",
];

/* --- Ability: an eight-point spark, hot core, magenta rays. --- */

const ability: PixelGrid = [
  "................",
  ".......jj.......",
  ".......kk.......",
  "......jkkj......",
  "..j...jkkj...j..",
  "...j..jkkj..j...",
  "....j.jkkj.j....",
  ".jjkkkkkkkkkkjj.",
  ".jjkkkkkkkkkkjj.",
  "....j.jkkj.j....",
  "...j..jkkj..j...",
  "..j...jkkj...j..",
  "......jkkj......",
  ".......kk.......",
  ".......jj.......",
  "................",
];

/* --- Item: a stoppered vial, half full and lit from the left. --- */

const item: PixelGrid = [
  "................",
  ".....888888.....",
  ".....8....8.....",
  "......6..6......",
  "......6..6......",
  ".....8....8.....",
  "....8......8....",
  "...8........8...",
  "...8..hgg...8...",
  "...8.hggggg.8...",
  "...8.ggggggg8...",
  "...8.ggggggg8...",
  "...8.ggggggg8...",
  "....8ggggggg....",
  ".....888888.....",
  "................",
];

/* --- Move: a step arrow, pointing up and away across the grid. --- */

const move: PixelGrid = [
  "................",
  "......hhhhhhhh..",
  "......hhhhhhhh..",
  "...........ghh..",
  "..........g.hh..",
  ".........g..hh..",
  "........g...hh..",
  ".......g....hh..",
  "......g.....hh..",
  ".....g..........",
  "....g...........",
  "...g............",
  "..g.............",
  ".i..............",
  ".i..............",
  "................",
];

/* --- Flee: out through the door, and don't look back. --- */

const flee: PixelGrid = [
  "................",
  ".666666.........",
  ".6....6.........",
  ".6....6.........",
  ".6....6...m.....",
  ".6....6...mm....",
  ".6..mmmmmmmmm...",
  ".6..mmmmmmmmmm..",
  ".6..mmmmmmmmmm..",
  ".6..mmmmmmmmm...",
  ".6....6...mm....",
  ".6....6...m.....",
  ".6....6.........",
  ".666666.........",
  "................",
  "................",
];

/* --- End turn: the glass runs out; hand it over. --- */

const endTurn: PixelGrid = [
  "................",
  "..mmmmmmmmmmmm..",
  "..mmmmmmmmmmmm..",
  "...m........m...",
  "....m..nn..m....",
  ".....m.nn.m.....",
  "......mnnm......",
  ".......mm.......",
  ".......mm.......",
  "......mnnm......",
  ".....m.nn.m.....",
  "....m..nn..m....",
  "...m........m...",
  "..mmmmmmmmmmmm..",
  "..mmmmmmmmmmmm..",
  "................",
];

/** Every action glyph, by id. Flat and eager like the other registries. */
export const ACTION_ICON_ART: Readonly<Record<ActionIconId, PixelGrid>> = {
  attack,
  ability,
  item,
  move,
  flee,
  "end-turn": endTurn,
};
