/**
 * Interactable pixel art: door and terminal (NPCs reuse the shared
 * character set with the npc palette remap — see characters.ts). Both
 * carry a small emissive accent that pulses through a two-frame loop.
 */
import { remapped, type PixelGrid } from "./pixel";

export interface InteractableArt {
  frames: readonly PixelGrid[];
  anchorX: number;
  anchorY: number;
  frameMs: number;
}

const rep = (n: number, row: string): string[] => Array<string>(n).fill(row);

/* --- Door: frame posts around a dark void with a glowing seam. --- */

const doorBright: string[] = [
  ".0000000000000000000000.",
  ".0444444444444444444440.",
  ".0444444444444444444440.",
  ...rep(3, ".0330111111hh1111110330."),
  ...rep(23, ".0330111111gg1111110330."),
  ".0555555555555555555550.",
  "..zzzzzzzzzzzzzzzzzzzz..",
];

const doorDim = remapped(doorBright, { h: "g", g: "i" });

/* --- Terminal: kiosk with a scanlined cyan screen and keyboard ledge. --- */

const terminalHead: string[] = [
  "...0000000000...",
  "..044444444440..",
  "..044444444440..",
];

const terminalScreenA: string[] = [
  "..04iiiiiiii40..",
  "..04igggggii40..",
  "..04iiiiiiii40..",
  "..04iggggiii40..",
  "..04iiiiiiii40..",
];

const terminalScreenB: string[] = [
  "..04iiiiiiii40..",
  "..04iiigggii40..",
  "..04i9iiiiii40..",
  "..04iiiggggi40..",
  "..04iiiiiiii40..",
];

const terminalBody: string[] = [
  "..044444444440..",
  ".05555555555550.",
  ".05555555555550.",
  "..000000000000..",
  ...rep(6, "......0330......"),
  ".....003300.....",
  "....00333300....",
  "...zzzzzzzzzz...",
  "................",
];

const terminalA = [...terminalHead, ...terminalScreenA, ...terminalBody];
const terminalB = [...terminalHead, ...terminalScreenB, ...terminalBody];

/** Door and terminal art; the npc sprite comes from characters.ts. */
export const INTERACTABLE_ART: Readonly<Record<"door" | "terminal", InteractableArt>> = {
  door: { frames: [doorBright, doorDim], anchorX: 12, anchorY: 29, frameMs: 800 },
  terminal: { frames: [terminalA, terminalB], anchorX: 8, anchorY: 19, frameMs: 520 },
};
