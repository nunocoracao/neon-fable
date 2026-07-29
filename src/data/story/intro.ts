import type { StoryArc } from "../../narrative/types";

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
      id: "wet-market-back",
      text:
        "The stallkeeper looks you over — the Undertow job travels ahead " +
        "of you now — and folds back an oilcloth. Underneath: checkpoint " +
        "plate with the insignia ground off, coil-fed hardware in " +
        "customs-auction wrap, a surgery case sweating cold. \"Post-flood " +
        "prices,\" they say. \"You're the reason there's a market.\"",
      location: "cinder-row:wet-market",
      choices: [
        {
          id: "buy-rail-spitter",
          label: "Buy the Rail Spitter. (320 cr)",
          target: "wet-market-back",
          requirements: [{ type: "credits", value: 320 }],
          ifUnavailable: "disabled",
          effects: [
            { type: "credits", amount: -320 },
            { type: "add-item", itemId: "wpn-rail-spitter" },
          ],
        },
        {
          id: "buy-torque-cleaver",
          label: "Buy the Torque Cleaver. (320 cr)",
          target: "wet-market-back",
          requirements: [{ type: "credits", value: 320 }],
          ifUnavailable: "disabled",
          effects: [
            { type: "credits", amount: -320 },
            { type: "add-item", itemId: "wpn-torque-cleaver" },
          ],
        },
        {
          id: "buy-ghostline-mantle",
          label: "Buy the Ghostline Mantle. (300 cr)",
          target: "wet-market-back",
          requirements: [{ type: "credits", value: 300 }],
          ifUnavailable: "disabled",
          effects: [
            { type: "credits", amount: -300 },
            { type: "add-item", itemId: "out-ghostline-mantle" },
          ],
        },
        {
          id: "buy-cordon-plate",
          label: "Buy the Cordon Plate Rig. (380 cr)",
          target: "wet-market-back",
          requirements: [{ type: "credits", value: 380 }],
          ifUnavailable: "disabled",
          effects: [
            { type: "credits", amount: -380 },
            { type: "add-item", itemId: "out-cordon-plate" },
          ],
        },
        {
          id: "buy-warden-optics",
          label: "Buy the Warden Optics. (450 cr)",
          target: "wet-market-back",
          requirements: [{ type: "credits", value: 450 }],
          ifUnavailable: "disabled",
          effects: [
            { type: "credits", amount: -450 },
            { type: "add-item", itemId: "cyb-warden-optics" },
          ],
        },
        {
          id: "buy-cascade-governor",
          label: "Buy the Cascade Governor. (500 cr)",
          target: "wet-market-back",
          requirements: [{ type: "credits", value: 500 }],
          ifUnavailable: "disabled",
          effects: [
            { type: "credits", amount: -500 },
            { type: "add-item", itemId: "cyb-cascade-governor" },
          ],
        },
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
