import type { StoryArc } from "../../narrative/types";

/**
 * The Flooded Quays: a district arc, like the market's, rather than a
 * chapter. It carries the two ways through the door (the hub's lockgate
 * down, the Lockgate Stair back up), the tide board on the wharf, the
 * diver working the basin, and the salvage cage chained under the
 * wrecked barge's stern.
 *
 * Self-contained on purpose. Dredge has deeper business waiting on
 * later work — what she keeps finding down there, and who keeps paying
 * her not to mention it — so nothing here sets a story flag any act
 * reads, gates on one, or moves the player anywhere but between the two
 * maps. What it leaves behind is `quays-known`, for a later arc that
 * wants to tell a first visit from a return, and the cage's own record
 * of how it came open.
 */
export const quaysArc: StoryArc = {
  id: "flooded-quays",
  title: "The Flooded Quays",
  entryNodeId: "fq-lock",
  nodes: [
    {
      id: "fq-lock",
      text:
        "The storm canal leaves Cinder Row through a lockgate nobody has " +
        "worked in a decade, and beside it a maintenance stair drops away " +
        "into the dark under the plaza. Cold comes up it. So does the " +
        "sound of water moving somewhere very large and not in a hurry. A " +
        "sign bolted to the handrail says QUAYS — AUTHORISED — and " +
        "somebody has scratched out the second word so thoroughly they " +
        "went through to the steel.",
      location: "cinder-row:canal-lock",
      choices: [
        {
          id: "descend",
          label: "Take the stair down to the water.",
          target: "fq-arrival",
          effects: [
            { type: "travel", mapId: "flooded-quays" },
            { type: "set-flag", key: "quays-known", value: true },
          ],
        },
        {
          id: "not-tonight",
          label: "Leave it. Whatever is down there can keep.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      // The arrival beat, and the arc's junction: everything a player
      // can walk up to down here is offered by name from it too, so the
      // district reads as one graph whichever way it is entered.
      id: "fq-arrival",
      text:
        "The stair ends on a strand of wet concrete, and past it there is " +
        "no more ground — just the basin, black and flat and going back " +
        "further than the light does. Two plate walkways cross it on " +
        "trestles, joined halfway by a catwalk with a working platform " +
        "hung off it, and everything else is water. It is raining, and " +
        "has been for so long that the rain is simply what the air is " +
        "doing. Off to the east a barge lies half under, stern up on the " +
        "bank, one amber lamp still burning on its mast.",
      location: "flooded-quays:strand",
      choices: [
        {
          id: "to-diver",
          label: "Cross to the platform — somebody is working out there.",
          target: "fq-diver",
        },
        {
          id: "to-cage",
          label: "Look at the cage chained off the strand under the wreck.",
          target: "fq-cage",
        },
        {
          id: "to-board",
          label: "Take a walkway over to the wharf and its tide board.",
          target: "fq-board",
        },
        {
          id: "to-stair",
          label: "Look back up the Lockgate Stair.",
          target: "fq-stair",
        },
        {
          id: "wander",
          label: "Just stand in the rain a while and look at the water.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "fq-stair",
      text:
        "The Lockgate Stair climbs out of the strand in one straight flight " +
        "of grating, and the rain comes down it the whole way like it is " +
        "being poured. From the third landing the quays read all at once: " +
        "two thin bright lines of walkway over a great deal of nothing, " +
        "the platform lamp haloed in the wet, and the barge's riding light " +
        "doubled in the water under it.",
      location: "flooded-quays:lockgate-stair",
      choices: [
        {
          id: "ascend",
          label: "Climb back up to Cinder Row.",
          effects: [{ type: "travel", mapId: "cinder-plaza" }],
        },
        {
          id: "stay",
          label: "Stay down here. The basin is not finished with you.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "fq-diver",
      speaker: "Dredge",
      text:
        "She is sitting on the platform edge with her boots in the basin, " +
        "hood back, rain running off a scalp shaved to silver stubble — " +
        "and along her ribs, under the harness, the chrome-rimmed slits " +
        "of a set of gills. There is a coil of line at her hip and " +
        "something heavy and dripping in a net beside her. \"Mind the " +
        "third plank,\" she says, without turning round. \"It's been " +
        "meaning to go for a year.\"",
      location: "flooded-quays:platform",
      choices: [
        {
          id: "what-down-there",
          label: "\"What is down there?\"",
          target: "fq-diver-below",
        },
        {
          id: "the-barge",
          label: "\"Whose barge is that?\"",
          target: "fq-diver-barge",
        },
        {
          id: "gills-read",
          label: "Ask what the water tastes like. Diver to diver.",
          target: "fq-diver-gills",
          requirements: [{ type: "enhancement", itemId: "cyb-silt-gills" }],
          ifUnavailable: "disabled",
        },
        {
          id: "leave-diver",
          label: "Leave her to her line.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "fq-diver-below",
      speaker: "Dredge",
      text:
        "\"Two streets.\" She says it the way you would name neighbours. " +
        "\"Everything the Combine stopped pumping for is still down there " +
        "with the doors shut on it. Shopfronts. A tram. A whole " +
        "launderette with the machines still bolted down, which is where " +
        "your drum motors come from, before you ask.\" She hauls the net " +
        "an inch out of the water and lets it back. \"People, too, but " +
        "they've been polite about it.\"",
      location: "flooded-quays:platform",
      choices: [
        {
          id: "below-back",
          label: "\"Something else, then —\"",
          target: "fq-diver",
        },
        {
          id: "below-leave",
          label: "Decide you did not need to know that. Go.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "fq-diver-barge",
      speaker: "Dredge",
      text:
        "\"Mine, now. Salvage law, and nobody down here to argue it.\" She " +
        "nods east without looking, to where the lighter lies with its bow " +
        "under and its lamp still going. \"She came in loaded, tied up " +
        "right, and opened her plates in the night — which boats do not do " +
        "on their own. I keep the lamp lit because it's a mast light and " +
        "there's a rule about that, and because somebody ought to be able " +
        "to see her from up top.\"",
      location: "flooded-quays:platform",
      choices: [
        {
          id: "barge-back",
          label: "\"Right. One more thing —\"",
          target: "fq-diver",
        },
        {
          id: "barge-leave",
          label: "Let the wreck keep the rest of it.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "fq-diver-gills",
      speaker: "Dredge",
      expression: "smile",
      text:
        "She looks at you properly for the first time, then at the line of " +
        "your ribs, and something in her face puts its weight down. " +
        "\"Rust and cold pennies,\" she says. \"And on the bad nights, " +
        "flowers. Nobody warns you about the flowers.\" She works a " +
        "shoulder, and the slits along it open and shut once, unhurried. " +
        "\"You'll want to come down with me some time. There's more of it " +
        "than one person should be the only one to have seen.\"",
      location: "flooded-quays:platform",
      choices: [
        {
          id: "gills-back",
          label: "\"Some time. First —\"",
          target: "fq-diver",
        },
        {
          id: "gills-leave",
          label: "Say nothing, which is answer enough. Go.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "fq-board",
      text:
        "The tide board is a slab of enamelled steel bolted to the wharf " +
        "wall, ruled into columns for the lock crews who used to work the " +
        "gates: date, level, gate, initials. The last hand to write on it " +
        "gave up mid-column. Below the ruling somebody has kept the record " +
        "going anyway, in grease pencil, one line a week for years — a " +
        "number, and beside it a mark for whether the number was worse " +
        "than the week before. Lately the marks all lean the same way.",
      location: "flooded-quays:wharf",
      choices: [
        {
          id: "board-read",
          label: "Read the grease-pencil column back to its beginning.",
          target: "fq-board-column",
        },
        {
          id: "board-leave",
          label: "Leave the board to whoever is still keeping it.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "fq-board-column",
      text:
        "It starts eleven years ago at a hand's width below the wharf lip " +
        "and it ends this week at the second tread of the Lockgate Stair. " +
        "Nobody has signed a single line of it. Whoever they are, they " +
        "come down here in the rain once a week to write a number nobody " +
        "reads on a board nobody maintains, because a thing that is not " +
        "measured is a thing that is not happening.",
      location: "flooded-quays:wharf",
      choices: [
        {
          id: "column-done",
          label: "Note where the water will be next year. Walk away.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "fq-cage",
      text:
        "A salvage cage hangs off the strand on a chain, half in the water " +
        "under the wrecked barge's stern — the way a diver parks a haul " +
        "they cannot carry up in one trip. This one has been parked a long " +
        "time. The padlock is a drowned lump of rust, the chain is fused " +
        "to the ring it runs through, and what is inside is a shape under " +
        "silt that has not moved in a season.",
      location: "flooded-quays:strand",
      choices: [
        {
          id: "haul",
          label: "Set your feet on the lip and haul the chain up bodily.",
          target: "fq-cage-open",
          requirements: [{ type: "stat", stat: "body", value: 7 }],
          ifUnavailable: "disabled",
          effects: [
            { type: "add-item", itemId: "con-field-kit" },
            { type: "credits", amount: 30 },
            { type: "set-flag", key: "quays-cage", value: "hauled" },
          ],
        },
        {
          id: "dive",
          label: "Go in after it and unhook the cage from underneath.",
          target: "fq-cage-open",
          requirements: [{ type: "enhancement", itemId: "cyb-silt-gills" }],
          ifUnavailable: "disabled",
          effects: [
            { type: "add-item", itemId: "con-trauma-patch" },
            { type: "credits", amount: 30 },
            { type: "set-flag", key: "quays-cage", value: "dived" },
          ],
        },
        {
          id: "leave-cage",
          label: "Leave it. Somebody meant to come back for that.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "fq-cage-open",
      text:
        "The cage comes up streaming and lands on the concrete with a " +
        "noise the rain takes straight off you. Inside, under a finger of " +
        "silt: a sealed medical case, a fold of soft credit chits " +
        "gone furry at the edges, and a child's shoe, single, laced. You " +
        "put the shoe back in the cage, and the cage back over the side, " +
        "and you are careful about it.",
      location: "flooded-quays:strand",
      choices: [
        {
          id: "cage-done",
          label: "Wipe your hands on the rain and get off the strand.",
          effects: [{ type: "end" }],
        },
      ],
    },
  ],
};
