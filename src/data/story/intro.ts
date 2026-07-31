import type { StoryArc } from "../../narrative/types";
import { vendorChoices } from "../world";

/**
 * Demo arc: a first job in the Meridian Sprawl. Scaffold content proving
 * the engine — it exercises background, stat, item, enhancement, and flag
 * gating; the full Act 1 lands in a later task.
 *
 * The terms set with Sable at the very first node ("sable-terms") decide
 * which meeting scene plays at the Filament Bar much later in the arc.
 */
export const introArc: StoryArc = {
  id: "intro",
  title: "First Light Over Cinder Row",
  entryNodeId: "start",
  // The shuttered-row variant is opened by the world, not by a choice:
  // while the stalls are down the wet-market NPC is re-pointed here
  // (see SCENE_REACTIONS in ../world.ts). Declared as a way in so
  // reachability validates against how it is actually reached.
  entryNodeIds: ["wet-market-shuttered"],
  nodes: [
    {
      id: "start",
      text:
        "Rain drums on the skylight of your bolthole above the Wet Market. " +
        "Your terminal blinks: a job offer from Sable, a fixer who works " +
        "the Filament Bar. The Meridian Sprawl doesn't hand out second " +
        "chances, and rent is due.",
      location: "cinder-row:bolthole",
      choices: [
        {
          id: "agree-terms",
          label: "Reply: you'll take the meet, standard rates, no surprises.",
          target: "wet-market",
          effects: [{ type: "set-flag", key: "sable-terms", value: "agreed" }],
        },
        {
          id: "go-cold",
          label: "Delete the message. You'll show up, but you promise nothing.",
          target: "wet-market",
          effects: [{ type: "set-flag", key: "sable-terms", value: "cold" }],
        },
        {
          // New Game+ returning-echo flavor: same route, knowing eyes.
          id: "echo-terms",
          label:
            "Watch the rain a beat longer. You've read this message before, " +
            "in another life — reply on your own terms.",
          target: "wet-market",
          requirements: [
            { type: "flag-equals", key: "ng-plus", value: true },
          ],
          effects: [
            { type: "set-flag", key: "sable-terms", value: "agreed" },
            { type: "set-flag", key: "echo-noticed", value: true },
          ],
        },
      ],
    },
    {
      id: "wet-market",
      text:
        "The Wet Market is elbow-to-elbow under the dripping overpass: " +
        "noodle steam, counterfeit chrome, a med-stall with trauma patches " +
        "racked like playing cards. The stallkeeper is arguing with a drone.",
      location: "cinder-row:wet-market",
      choices: [
        {
          id: "lift-patch",
          label: "Palm a trauma patch while the stallkeeper argues.",
          target: "filament-door",
          requirements: [{ type: "stat", stat: "reflexes", value: 8 }],
          ifUnavailable: "disabled",
          effects: [
            { type: "add-item", itemId: "con-trauma-patch" },
            { type: "set-flag", key: "market-theft", value: true },
          ],
        },
        {
          id: "back-shelf",
          label: "Ask what the stallkeeper keeps off the rack these days.",
          target: "wet-market-back",
          requirements: [
            { type: "flag-equals", key: "act1-complete", value: true },
          ],
        },
        {
          id: "walk-on",
          label: "Keep walking. The Filament is two blocks on.",
          target: "filament-door",
        },
      ],
    },
    {
      // The row with its shutters down. Reached only while the world
      // says so: the "row-shutters" reaction re-points the stall NPC
      // here (see SCENE_REACTIONS in ../world.ts), and every route out
      // of it lands back on the ordinary stall scene — the market is
      // quieter, not closed. Kept in this arc because a choice may not
      // cross an arc boundary, and the scene it leads to is here.
      id: "wet-market-shuttered",
      text:
        "Half the row is roller-shuttered and the half that is not has " +
        "its awnings down. The stallkeeper is sitting on an upturned " +
        "crate behind a rail of nothing, watching a Combine server work " +
        "the line with a board. They see you coming and do not get up. " +
        "\"We're trading,\" they say, to the pavement. \"Quietly.\"",
      location: "cinder-row:wet-market",
      choices: [
        {
          id: "ask-shutters",
          label: "\"What happened here?\"",
          target: "wet-market-shuttered-why",
        },
        {
          id: "trade-quietly",
          label: "Trade quietly, then.",
          target: "wet-market",
        },
      ],
    },
    {
      id: "wet-market-shuttered-why",
      text:
        "\"An Auric courier went dark in the Undercroft and something " +
        "walked out of the hole with him.\" The stallkeeper turns a " +
        "credit chit over in their fingers. \"Nobody up there thinks it " +
        "came down here. They just know where the doors are that open " +
        "when you knock.\" A shrug. \"Fortnight. Then they'll forget.\"",
      location: "cinder-row:wet-market",
      choices: [
        {
          id: "shrug-back",
          label: "Buy something anyway.",
          target: "wet-market",
        },
        {
          id: "leave-row",
          label: "Leave them to it.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "wet-market-back",
      text:
        "The stallkeeper looks you over — the Undertow job travels ahead " +
        "of you now — and folds back an oilcloth. Underneath: checkpoint " +
        "plate with the insignia ground off, coil-fed hardware in " +
        "customs-auction wrap, a surgery case sweating cold. \"Post-flood " +
        "prices,\" they say. \"You're the reason there's a market.\"",
      location: "cinder-row:wet-market",
      // The shelf is stock, and stock is a fact about the city — what
      // the Cordon coming down put on the street, what a live warrant
      // takes off it, what the boards will consign to somebody they
      // like (see VENDOR_STOCK in ../world.ts). Generated rather than
      // listed so the offer a player is shown and the stock the world
      // layer says is carried are one decision, made once.
      choices: [
        ...vendorChoices("wet-market-back", "wet-market-back"),
        {
          id: "done",
          label: "\"Another time.\"",
          target: "wet-market",
        },
      ],
    },
    {
      id: "filament-door",
      speaker: "Brakk",
      text:
        "\"Cover's fifteen.\" The Filament's bouncer fills the doorway, one " +
        "hand wrapped in a fresh burn dressing. \"Or give me one reason " +
        "you're worth the floor space.\"",
      location: "cinder-row:filament-bar",
      choices: [
        {
          id: "corp-talk",
          label: "Quote Auric guest-list policy at him, ninety-first floor cadence.",
          target: "bar-floor",
          requirements: [{ type: "background", tag: "corp" }],
          effects: [{ type: "set-flag", key: "door-entry", value: "corp" }],
        },
        {
          id: "street-nod",
          label: "Remind him who ran his packages when the underlevels flooded.",
          target: "bar-floor",
          requirements: [{ type: "background", tag: "street" }],
          effects: [{ type: "set-flag", key: "door-entry", value: "street" }],
        },
        {
          id: "bribe-patch",
          label: "Offer a trauma patch for that burned hand.",
          target: "bar-floor",
          requirements: [{ type: "item", itemId: "con-trauma-patch" }],
          ifUnavailable: "disabled",
          effects: [
            { type: "remove-item", itemId: "con-trauma-patch" },
            { type: "set-flag", key: "door-entry", value: "bribe" },
          ],
        },
        {
          id: "pay-cover",
          label: "Pay the fifteen.",
          target: "bar-floor",
          effects: [{ type: "credits", amount: -15 }],
        },
      ],
    },
    {
      id: "bar-floor",
      text:
        "Inside, the Filament hums — filament lights, filament code, deals " +
        "threading between booths. Sable's corner table has one empty chair " +
        "and a line of sight on both exits.",
      location: "cinder-row:filament-bar",
      choices: [
        {
          id: "sit-agreed",
          label: "Take the chair.",
          target: "sable-warm",
          requirements: [
            { type: "flag-equals", key: "sable-terms", value: "agreed" },
          ],
        },
        {
          id: "sit-cold",
          label: "Take the chair.",
          target: "sable-cold",
          requirements: [
            { type: "flag-equals", key: "sable-terms", value: "cold" },
          ],
        },
      ],
    },
    {
      id: "sable-warm",
      speaker: "Sable",
      expression: "smile",
      text:
        "\"Standard rates, no surprises — I do like a professional.\" Sable " +
        "slides a credit chit across the table. \"Advance, like the terms " +
        "said. Don't spend it before you've earned it.\"",
      location: "cinder-row:filament-bar",
      choices: [
        {
          id: "take-advance",
          label: "Pocket the advance and hear the job.",
          target: "job-brief",
          effects: [{ type: "credits", amount: 50 }],
        },
      ],
    },
    {
      id: "sable-cold",
      speaker: "Sable",
      expression: "grim",
      text:
        "\"No reply, no terms. Bold.\" Sable's smile doesn't reach their " +
        "eyes, and no chit crosses the table. \"Then you work this one on " +
        "spec. Impress me and we'll talk numbers after.\"",
      location: "cinder-row:filament-bar",
      choices: [
        {
          id: "hear-out",
          label: "Hear the job anyway.",
          target: "job-brief",
        },
      ],
    },
    {
      id: "job-brief",
      speaker: "Sable",
      text:
        "\"A courier went dark in the Undercroft with an Auric data spike. " +
        "The drop's still sitting there — and Auric's retrieval team is " +
        "already rolling. Get to it first, bring it to me, and Cinder Row " +
        "stays friendly to you.\"",
      location: "cinder-row:filament-bar",
      choices: [
        {
          id: "take-job",
          label: "Take the job.",
          target: "undercroft",
          effects: [{ type: "set-flag", key: "job-accepted", value: true }],
        },
        {
          id: "walk-away",
          label: "Walk away. Rent isn't worth an Auric grudge.",
          effects: [{ type: "end", endingId: "walked-away" }],
        },
      ],
    },
    {
      id: "undercroft",
      text:
        "The Undercroft smells of rust and old floodwater. The dead drop — " +
        "a gutted junction box — is ten meters ahead, and an Auric scout in " +
        "a gray slicker is crouched beside it, running a handheld sweep.",
      location: "undercroft:junction-nine",
      choices: [
        {
          id: "bluff-scout",
          label: "Walk up like you own the sweep: \"Contractor. Auric sent backup.\"",
          target: "spike-secured",
          requirements: [{ type: "stat", stat: "cool", value: 8 }],
          ifUnavailable: "disabled",
          effects: [
            { type: "set-flag", key: "scout-outcome", value: "bluffed" },
            { type: "add-item", itemId: "msc-cracked-spike" },
          ],
        },
        {
          id: "optic-scan",
          label: "Optic-scan the scout's badge and read off their own clearance code.",
          target: "spike-secured",
          requirements: [{ type: "enhancement", itemId: "cyb-optic-suite" }],
          effects: [
            { type: "set-flag", key: "scout-outcome", value: "scanned" },
            { type: "add-item", itemId: "msc-cracked-spike" },
          ],
        },
        {
          id: "jump-scout",
          label: "Rush them before the sweep finishes.",
          target: "spike-secured",
          effects: [
            { type: "start-combat", encounterId: "enc-auric-scout" },
            { type: "set-flag", key: "scout-outcome", value: "fought" },
            { type: "add-item", itemId: "msc-cracked-spike" },
          ],
        },
      ],
    },
    {
      id: "spike-secured",
      text:
        "The junction box gives up a matte-black spike, casing cracked by " +
        "whoever tried to read it first. Somewhere above, a retrieval " +
        "team's rotors echo down the ventilation stacks. Time to move.",
      location: "undercroft:junction-nine",
      choices: [
        {
          id: "back-to-bar",
          label: "Head back to the Filament before Auric floods the tunnels.",
          target: "finale",
        },
      ],
    },
    {
      id: "finale",
      speaker: "Sable",
      text:
        "Sable is waiting at the same table, chair already pulled out. " +
        "\"Well? The Sprawl's been holding its breath.\"",
      location: "cinder-row:filament-bar",
      choices: [
        {
          id: "hand-over",
          label: "Hand over the spike.",
          requirements: [{ type: "item", itemId: "msc-cracked-spike" }],
          effects: [
            { type: "remove-item", itemId: "msc-cracked-spike" },
            { type: "credits", amount: 200 },
            { type: "set-flag", key: "spike-delivered", value: true },
            { type: "end", endingId: "job-done" },
          ],
        },
        {
          id: "keep-spike",
          label: "Lie. The spike stays in your jacket — cracked things can be read.",
          effects: [
            { type: "set-flag", key: "kept-spike", value: true },
            { type: "end", endingId: "kept-it" },
          ],
        },
      ],
    },
  ],
};
