import type { StatKey } from "../../character/stats";
import type { StoryArc } from "../types";
import type { FlagWriteSite, GateSource } from "./content";
import type { GateWorld } from "./gates";

/**
 * The deliberately-broken mini-graph the audit is tested against.
 *
 * A validator is only worth what its own tests are worth, and a
 * validator tested solely against the shipped story proves one thing: it
 * agrees with the story today. So every check has a fixture here that
 * trips it on purpose, and the fixture tests assert both directions —
 * the broken graph produces the finding, the sound one produces
 * nothing.
 *
 * Kept in a plain module rather than inside a test file so it
 * type-checks in the build like every other piece of content, and so a
 * change to the story data model breaks the fixtures loudly instead of
 * leaving them quietly meaningless.
 */

/** A small arc with nothing wrong with it. */
export const soundArc: StoryArc = {
  id: "fixture-sound",
  title: "Sound",
  entryNodeId: "s-start",
  nodes: [
    {
      id: "s-start",
      text: "",
      choices: [
        { id: "s-go", label: "", target: "s-end" },
        {
          id: "s-note",
          label: "",
          target: "s-end",
          effects: [{ type: "set-flag", key: "s-flag", value: "written" }],
        },
      ],
    },
    {
      id: "s-end",
      text: "",
      choices: [
        {
          id: "s-stop",
          label: "",
          requirements: [{ type: "flag-equals", key: "s-flag", value: "written" }],
          effects: [{ type: "end" }],
        },
        { id: "s-leave", label: "", effects: [{ type: "end" }] },
      ],
    },
  ],
};

/**
 * One arc carrying one of everything: a target that goes nowhere, a
 * choice that goes nowhere at all, a room with no doors, a loop with no
 * way out, a scene whose every option is gated, a choice that throws
 * when it is taken, and a flag nobody will ever read.
 */
export const brokenArc: StoryArc = {
  id: "fixture-broken",
  title: "Broken",
  entryNodeId: "b-start",
  nodes: [
    {
      id: "b-start",
      text: "",
      choices: [
        { id: "b-go", label: "", target: "b-hub" },
        // Points at a node that does not exist.
        { id: "b-dangling", label: "", target: "b-nowhere-at-all" },
        // No target, no goto, no end marker.
        { id: "b-void", label: "" },
      ],
    },
    {
      id: "b-hub",
      text: "",
      choices: [
        { id: "b-out", label: "", target: "b-end" },
        { id: "b-into-loop", label: "", target: "b-loop" },
        { id: "b-to-gated", label: "", target: "b-gated" },
        {
          id: "b-note",
          label: "",
          target: "b-end",
          effects: [{ type: "set-flag", key: "b-unread", value: true }],
        },
        {
          // Taking this asks the item catalog for something that is not
          // in it, which is how a walk finds a throw.
          id: "b-throw",
          label: "",
          target: "b-end",
          effects: [{ type: "add-item", itemId: "itm-not-in-the-catalog" }],
        },
      ],
    },
    {
      // Nothing here reaches an end or a way out: a scene the player
      // can never stop being in.
      id: "b-loop",
      text: "",
      choices: [{ id: "b-back", label: "", target: "b-loop" }],
    },
    {
      // Every option gated, and neither gate can ever pass.
      id: "b-gated",
      text: "",
      choices: [
        {
          id: "b-g-flag",
          label: "",
          target: "b-end",
          requirements: [{ type: "flag-equals", key: "b-never-written", value: true }],
        },
        {
          id: "b-g-stat",
          label: "",
          target: "b-end",
          requirements: [{ type: "stat", stat: "body", value: 99 }],
        },
      ],
    },
    { id: "b-end", text: "", choices: [{ id: "b-stop", label: "", effects: [{ type: "end" }] }] },
    // Reachable from nowhere, and nothing can leave it either.
    { id: "b-island", text: "", choices: [] },
  ],
};

/** An arc that declares an entry it does not have, twice over. */
export const strayEntryArc: StoryArc = {
  id: "fixture-stray",
  title: "Stray",
  entryNodeId: "x-nowhere",
  nodes: [
    { id: "x-only", text: "", choices: [{ id: "x-stop", label: "", effects: [{ type: "end" }] }] },
    { id: "x-only", text: "", choices: [{ id: "x-stop", label: "", effects: [{ type: "end" }] }] },
  ],
};

/** Gates outside the story graph, each naming an id that does not resolve. */
export const brokenGateSources: GateSource[] = [
  {
    source: "bark:fixture-bark",
    requirements: [
      { type: "item", itemId: "itm-not-in-the-catalog" },
      { type: "companion", companionId: "nobody-at-all" },
      { type: "injury", injuryId: "inj-not-real" },
    ],
  },
  {
    source: "epilogue:fixture",
    where: "fixture-vignette",
    requirements: [
      // A band id with a typo in it reads as unreachable at runtime,
      // which is a door that silently never opens.
      { type: "reputation", factionId: "auric", value: "trustd" as "trusted" },
    ],
  },
];

/** Gates that name only things that exist, for the negative case. */
export const soundGateSources: GateSource[] = [
  {
    source: "bark:fixture-fine",
    requirements: [{ type: "flag-equals", key: "b-flag", value: "written" }],
  },
];

/** Everything a fixture run of the game could ever produce. */
export const fixtureWrites: FlagWriteSite[] = [
  { key: "b-flag", value: "written", source: "fixture" },
  { key: "b-count", value: 2, source: "fixture" },
];

const flatCeiling = (value: number): Record<StatKey, number> => ({
  body: value,
  reflexes: value,
  tech: value,
  cool: value,
  intelligence: value,
});

/** A tiny world: one grantable item, one recruitable companion, one tag. */
export const fixtureGateWorld: GateWorld = {
  writes: fixtureWrites,
  grantableItems: new Set(["itm-on-a-shelf"]),
  recruitableCompanions: new Set(["somebody-real"]),
  backgroundTags: new Set(["street"]),
  statCeiling: flatCeiling(14),
  standingCeiling: { auric: 30, court: 30, market: 30 },
};
