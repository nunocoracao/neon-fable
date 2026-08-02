import type { StoryArc } from "../../narrative/types";

/**
 * Demo arc: a first job in the Meridian Sprawl. Scaffold content proving
 * the engine — it exercises background, stat, item, enhancement, and flag
 * gating; the full Act 1 lands in a later task.
 *
 * The terms set with Sable at the very first node ("sable-terms") decide
 * which meeting scene plays at the Filament Bar much later in the arc.
 *
 * Every way out of the courier job writes "intro-outcome" — "delivered",
 * "kept", or "declined" — and that flag is what closes the thread behind
 * the player. The plaza's Filament door opens this arc for as long as the
 * run lives, so without it the meeting with Sable (and the advance on her
 * table) could be walked into again every evening. Settled, the door is
 * just a door: Brakk knows the face, and what is on the other side of it
 * is a bar rather than a job.
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
      // What is under the oilcloth is a fact about the city — what the
      // Cordon coming down put on the street, what a live warrant takes
      // off it, what the boards will consign to somebody they like (see
      // VENDOR_STOCK in ../world.ts) — and what it costs is a fact about
      // the counter and about you (src/economy/). Neither is authored
      // here: the scene only opens the shelf.
      choices: [
        {
          id: "trade",
          label: "Trade across the oilcloth.",
          // The counter screen replaces the dialogue and resumes here,
          // so a second round of haggling and buying is one Esc away.
          target: "wet-market-back",
          effects: [
            { type: "open-vendor", vendorId: "wet-market-back" },
            { type: "set-flag", key: "back-shelf-known", value: true },
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
          // The courier job is behind you: Brakk says his line to the
          // whole queue and then waves you past it. The routes that talk
          // or pay their way in close on the same flag — they were
          // negotiating entry to a meeting that has already happened.
          id: "known-face",
          label: "Let him finish, then walk past him. He's seen you go in before.",
          target: "bar-floor-after",
          requirements: [{ type: "flag-set", key: "intro-outcome" }],
        },
        {
          id: "corp-talk",
          label: "Quote Auric guest-list policy at him, ninety-first floor cadence.",
          target: "bar-floor",
          requirements: [
            { type: "background", tag: "corp" },
            { type: "flag-unset", key: "intro-outcome" },
          ],
          effects: [{ type: "set-flag", key: "door-entry", value: "corp" }],
        },
        {
          id: "street-nod",
          label: "Remind him who ran his packages when the underlevels flooded.",
          target: "bar-floor",
          requirements: [
            { type: "background", tag: "street" },
            { type: "flag-unset", key: "intro-outcome" },
          ],
          effects: [{ type: "set-flag", key: "door-entry", value: "street" }],
        },
        {
          // The one entry line that stays open afterwards, on purpose:
          // his hand is still burned, and this choice is shown greyed
          // rather than hidden, so a flag gate on it would print the
          // flag's own name next to [Requires: Trauma Patch]. Costs a
          // patch and opens a door that was already open — generosity,
          // not a trap, since the room behind it is the same either way.
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
          requirements: [{ type: "flag-unset", key: "intro-outcome" }],
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
      // The meeting happens once. Both chairs close on "intro-outcome",
      // so a player who paid the cover a second time out of habit walks
      // into the room as it is now rather than into a rerun of the
      // scene that pays an advance.
      choices: [
        {
          id: "sit-agreed",
          label: "Take the chair.",
          target: "sable-warm",
          requirements: [
            { type: "flag-equals", key: "sable-terms", value: "agreed" },
            { type: "flag-unset", key: "intro-outcome" },
          ],
        },
        {
          id: "sit-cold",
          label: "Take the chair.",
          target: "sable-cold",
          requirements: [
            { type: "flag-equals", key: "sable-terms", value: "cold" },
            { type: "flag-unset", key: "intro-outcome" },
          ],
        },
        {
          id: "sit-after",
          label: "Find a stool where you can see the door.",
          target: "bar-floor-after",
          requirements: [{ type: "flag-set", key: "intro-outcome" }],
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
          effects: [
            { type: "set-flag", key: "intro-outcome", value: "declined" },
            { type: "end", endingId: "walked-away" },
          ],
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
            { type: "set-flag", key: "intro-outcome", value: "delivered" },
            { type: "end", endingId: "job-done" },
          ],
        },
        {
          id: "keep-spike",
          label: "Lie. The spike stays in your jacket — cracked things can be read.",
          effects: [
            { type: "set-flag", key: "kept-spike", value: true },
            { type: "set-flag", key: "intro-outcome", value: "kept" },
            { type: "end", endingId: "kept-it" },
          ],
        },
      ],
    },
    // ------------------------------------------------------------------
    // The Filament afterwards
    //
    // Where the plaza's door leads once the courier job is settled. The
    // job is over, so nothing in here pays, recruits, or records: these
    // scenes exist so that walking into your local is a thing the game
    // lets you do, and so the door is not a turnstile back onto a beat
    // that has already been played. Every route out lands on the Row.
    // ------------------------------------------------------------------
    {
      id: "bar-floor-after",
      text:
        "Inside, the Filament is doing what it does on a wet weeknight: " +
        "low talk, wet coats steaming on the rail, a bartender running " +
        "the taps and the room at the same time. Nobody looks up. The " +
        "corner table has a line of sight on both exits, the way it " +
        "always does.",
      location: "cinder-row:filament-bar",
      choices: [
        {
          id: "after-sable-paid",
          label: "Sable's at the corner table. Take the chair.",
          target: "sable-after-paid",
          requirements: [
            { type: "flag-equals", key: "intro-outcome", value: "delivered" },
          ],
        },
        {
          id: "after-sable-kept",
          label: "Sable's at the corner table, and hasn't looked up yet.",
          target: "sable-after-kept",
          requirements: [
            { type: "flag-equals", key: "intro-outcome", value: "kept" },
          ],
        },
        {
          id: "after-sable-declined",
          label: "The corner table is somebody else's problem tonight.",
          target: "sable-after-declined",
          requirements: [
            { type: "flag-equals", key: "intro-outcome", value: "declined" },
          ],
        },
        {
          id: "after-room",
          label: "Buy a drink and let the room talk.",
          target: "filament-room",
        },
        {
          id: "after-leave",
          label: "Finish up and get back out to the Row.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "filament-room",
      text:
        "Two stools down, a rigger is explaining to nobody that the pumps " +
        "under Greywater have been running odd hours. Behind her, a " +
        "salvage crew argues about whose name goes on a claim. The " +
        "Filament's own lights buzz in their cages, and the door lets in " +
        "a slab of rain every time it opens. It is, briefly, not a bad " +
        "place to be nobody in particular.",
      location: "cinder-row:filament-bar",
      choices: [
        {
          id: "room-back",
          label: "Turn back to the room.",
          target: "bar-floor-after",
        },
        {
          id: "room-leave",
          label: "Leave while the rain's easing.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "sable-after-paid",
      speaker: "Sable",
      expression: "smile",
      text:
        "\"The professional.\" Sable moves a glass six inches to make room " +
        "for an elbow that isn't there yet. \"No, I don't have anything " +
        "for you tonight. When I do, you'll know before the Row does — " +
        "that's what delivering buys. Sit. Don't work.\"",
      location: "cinder-row:filament-bar",
      choices: [
        {
          id: "paid-sit",
          label: "Sit a while, and don't work.",
          target: "filament-room",
        },
        {
          id: "paid-go",
          label: "\"Another time.\"",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "sable-after-kept",
      speaker: "Sable",
      expression: "grim",
      text:
        "\"Sit if you like.\" Sable does not move the glass, and does not " +
        "look up from whatever is scrolling under their hand. \"Funny " +
        "thing about the Undercroft. Everything that comes out of it " +
        "turns up eventually, and it's never where it said it was going.\" " +
        "A pause exactly long enough. \"Drink's on the house.\"",
      location: "cinder-row:filament-bar",
      choices: [
        {
          id: "kept-say-nothing",
          label: "Say nothing. Drink the drink.",
          target: "filament-room",
        },
        {
          id: "kept-go",
          label: "Decide you're not thirsty.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "sable-after-declined",
      text:
        "Two people you don't know are running numbers across the corner " +
        "table, and the fixer who once had a job with your name on it is " +
        "not in the room. On the Row that isn't a snub — it's a filing " +
        "decision. The rest of the bar has no opinion about you at all, " +
        "which is worth something on a wet night.",
      location: "cinder-row:filament-bar",
      choices: [
        {
          id: "declined-stay",
          label: "Take a stool anyway.",
          target: "filament-room",
        },
        {
          id: "declined-go",
          label: "Get back out to the Row.",
          effects: [{ type: "end" }],
        },
      ],
    },
  ],
};
