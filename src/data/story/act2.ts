import type { StoryArc } from "../../narrative/types";

/**
 * Act 2 — "The Cordon". Auric's answer to the Undertow: Director Halex
 * seals the Chainwell under a "remediation embargo" and begins winding
 * down the Undercroft's air-and-water cyclers at the Meridian Exchange —
 * a flood with no water in it. The chapter opens differently for each
 * recorded Act 1 outcome (act1-outcome = "court" | "voss" | "broadcast"),
 * converges on the Exchange Ventworks, and ends on one of three outcomes
 * recorded for the final act:
 *
 *   act2-complete: true
 *   act2-outcome:  "charter" | "takeover" | "severance"
 *   plus consequence flags (cordon-broken always; halex-deposed,
 *   undercroft-charter, voss-ascendant, auric-patron, undercroft-severed,
 *   steps-independent, and wanted-by-auric cleared on the charter route).
 *
 * Branch bookkeeping: the opening taken sets a2-approach ("court" |
 * "voss" | "lone"), which keys the climax variant at the Cordon core;
 * gate2-route records how the player got past the Exchange perimeter.
 * The coolant vault also carries the crew's own fault line — with both
 * companions recruited, vent-vault-call records whose read of a dead
 * crew's lockers the player backed, and moves the two loyalties in
 * opposite directions.
 * Act 1 allies materially help (the Court's tunnel, Voss's writ and
 * retainer), and wanted-by-auric / betrayed-* / sable-burned all come
 * back to bite in the lone and Voss openings.
 */
export const act2Arc: StoryArc = {
  id: "act2",
  title: "The Cordon",
  entryNodeId: "a2-start",
  nodes: [
    // ------------------------------------------------------------------
    // Hook — the plaza, three days after the Undertow
    // ------------------------------------------------------------------
    {
      id: "a2-start",
      text:
        "A messenger has been working the plaza's edge all morning — too " +
        "patient for a courier, too watchful for a beggar. Behind them the " +
        "screens cycle a new Auric crest: RECLAMATION CORDON, in letters " +
        "that don't apologize. Whoever the messenger is waiting for, " +
        "they've been at it a while — and as you cross the glow-tiles, " +
        "the waiting stops.",
      location: "cinder-row:plaza",
      comments: [
        {
          companionId: "vesper",
          text:
            "\"Reclamation.\" She reads the crest twice. \"That's the " +
            "word they used on the Quays. Nobody reclaimed anything.\"",
        },
        {
          companionId: "sill",
          text:
            "\"A cordon is a legal instrument, not a wall,\" he says. " +
            "\"Which means it was filed. Which means it can be answered.\"",
        },
      ],
      choices: [
        {
          id: "quiet",
          label: "\"It's done.\" (The Cordon is broken.)",
          target: "a2-done",
          requirements: [
            { type: "flag-equals", key: "act2-complete", value: true },
          ],
        },
        {
          id: "court",
          label: "Hear out the runner in Court grey.",
          target: "a2-court-runner",
          requirements: [
            { type: "flag-equals", key: "act1-outcome", value: "court" },
          ],
        },
        {
          id: "voss",
          label: "Accept the Auric courier drone's sealed slate.",
          target: "a2-voss-drone",
          requirements: [
            { type: "flag-equals", key: "act1-outcome", value: "voss" },
          ],
        },
        {
          id: "lone",
          label: "Meet the eyes that have followed you since the tram loop.",
          target: "a2-lone-watch",
          requirements: [
            { type: "flag-equals", key: "act1-outcome", value: "broadcast" },
          ],
        },
        {
          id: "walk-on",
          label: "Keep walking.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "a2-done",
      text:
        "The Cordon crest is gone from the screens, replaced by weather, " +
        "adverts, and — on one stubborn noodle-stall display — a looping " +
        "frame of the Exchange's gates standing open. The plaza has gone " +
        "back to minding its own business, which in Cinder Row is the " +
        "highest honor going.",
      location: "cinder-row:plaza",
      choices: [
        { id: "move-along", label: "Move along.", effects: [{ type: "end" }] },
      ],
    },
    // ------------------------------------------------------------------
    // Opening A — the Court's runner (act1-outcome = court)
    // ------------------------------------------------------------------
    {
      id: "a2-court-runner",
      speaker: "Steps Runner",
      text:
        "The runner still has cistern damp in her boots and no breath to " +
        "waste. \"Chainwell's sealed. Auric plate over the stair, bolted " +
        "from topside, overnight — they're calling it a 'remediation " +
        "embargo'. Freight lifts locked, barges turned back.\" She grips " +
        "your sleeve, Court-fashion. \"Matron says come. Matron says " +
        "it's worse than the water.\"",
      location: "cinder-row:plaza",
      choices: [
        {
          id: "ask",
          label: "\"Worse than the water how?\"",
          target: "a2-court-runner-more",
        },
        {
          id: "descend",
          label: "Take the thieves' chain down. The Court cut you a way.",
          target: "a2-court-council",
          requirements: [
            { type: "flag-equals", key: "ally-cistern-court", value: true },
          ],
          effects: [{ type: "travel", mapId: "greywater-steps" }],
        },
      ],
    },
    {
      id: "a2-court-runner-more",
      speaker: "Steps Runner",
      text:
        "\"The cyclers.\" She says it like a diagnosis. \"The big ones " +
        "topside, at the Meridian Exchange — the ones that breathe for " +
        "the deep levels. They're winding down. Slow, scheduled, all " +
        "stamped and legal.\" A breath. \"You can fight water, topsider. " +
        "You can't fight air that just... stops coming.\"",
      location: "cinder-row:plaza",
      choices: [
        { id: "back", label: "\"Take me to the chain.\"", target: "a2-court-runner" },
      ],
    },
    {
      id: "a2-court-council",
      speaker: "Matron Ferrow",
      text:
        "The sappers' thieves' chain drops you through a cut in the old " +
        "freight shaft — the Court's answer to Auric plate, ready before " +
        "the bolts were cool. Below, the hall is a war room again, but " +
        "quieter this time; you can hear the difference in the air " +
        "itself, a settlement holding its breath. \"They learned,\" " +
        "Ferrow says without greeting. \"No flood this time. Nothing to " +
        "photograph. They sealed the stair and put our lungs on a " +
        "schedule.\"",
      location: "greywater:court-hall",
      choices: [
        {
          id: "ask-cyclers",
          label: "\"Walk me through the cyclers.\"",
          target: "a2-court-cyclers",
        },
        {
          id: "flick",
          label: "Hear what Flick smuggled out.",
          target: "a2-court-flick",
        },
        {
          id: "wall",
          label: "Read the wall by the door.",
          target: "a2-court-wall",
        },
        {
          id: "accept",
          label: "\"Give me the shape of it, Matron.\"",
          target: "a2-court-charge",
        },
      ],
    },
    {
      id: "a2-court-cyclers",
      speaker: "Matron Ferrow",
      text:
        "\"Everything below Ledge Four breathes through the Meridian " +
        "Exchange — air cyclers, water cyclers, the whole slow tide. " +
        "Always has. It was the one thing Auric never dared touch, " +
        "because dead districts don't pay rent.\" She taps the tide " +
        "chart where someone has inked a new line, falling. \"A director " +
        "named Halex did the daring. Forty hours, the schedule says. " +
        "Then the deep levels start breathing yesterday's air.\"",
      location: "greywater:court-hall",
      choices: [
        { id: "back", label: "Turn back to the Matron.", target: "a2-court-council" },
      ],
    },
    {
      id: "a2-court-flick",
      speaker: "Flick",
      text:
        "Flick got out before the seal came down and has been insuffer" +
        "able about it since. \"Rode the last barge up hidden in a fish " +
        "crate. A FISH crate.\" The kid produces a work-order flimsy, " +
        "lifted whole from an enforcer's kit. \"'Cycler wind-down, phase " +
        "one, authorizing officer H-A-L-E-X.' They're marching the vent " +
        "crews out of the Exchange so nobody's hands are on the valves " +
        "when it happens.\"",
      location: "greywater:court-hall",
      choices: [
        { id: "back", label: "\"Good work. Stay out of crates.\"", target: "a2-court-council" },
      ],
    },
    {
      id: "a2-court-wall",
      text:
        "The chalked names from the flood have been joined by the " +
        "embargo notice, pinned upside down — the Court's editorial " +
        "position. Under WE LIVE HERE someone has added, in the same " +
        "careful hand: WE BREATHE HERE TOO.",
      location: "greywater:court-hall",
      choices: [
        { id: "back", label: "Step back from the wall.", target: "a2-court-council" },
      ],
    },
    {
      id: "a2-court-charge",
      speaker: "Matron Ferrow",
      text:
        "\"The Cordon runs from a core ring on the Exchange's cycler " +
        "floor — Halex's mandate machine. Break it and the embargo dies " +
        "with it; the governors revert and the Steps breathe.\" Ferrow " +
        "grips your forearm once, hard. \"My sappers cut a tunnel into " +
        "the Exchange's freight web last night. They'll hold it open and " +
        "pull the watch off you when you move. We got you a door, " +
        "topsider. What goes through it is you.\"",
      location: "greywater:court-hall",
      choices: [
        {
          id: "tunnel-supplied",
          label: "Take her field kit, then the sappers' tunnel topside.",
          target: "a2-court-tunnel",
          effects: [
            { type: "add-item", itemId: "con-trauma-patch", quantity: 2 },
            { type: "set-flag", key: "a2-approach", value: "court" },
            { type: "travel", mapId: "exchange-ventworks" },
          ],
        },
        {
          id: "tunnel-now",
          label: "Go now. Travel light.",
          target: "a2-court-tunnel",
          effects: [
            { type: "set-flag", key: "a2-approach", value: "court" },
            { type: "travel", mapId: "exchange-ventworks" },
          ],
        },
      ],
    },
    {
      id: "a2-court-tunnel",
      text:
        "The tunnel surfaces inside the Exchange's freight web, past the " +
        "perimeter scanners entirely — an hour of crawling behind a " +
        "sapper who never once looks back. At the last grate she finally " +
        "turns. \"We hold the tunnel. Whatever comes down it after you, " +
        "we hold that too.\" The grate swings out onto the Ventworks' " +
        "sodium dark. \"Break their machine, topsider.\"",
      location: "exchange:freight-web",
      choices: [
        { id: "up", label: "Step out into the Ventworks.", target: "a2-vent-arrival" },
      ],
    },
    // ------------------------------------------------------------------
    // Opening B — Voss's summons (act1-outcome = voss)
    // ------------------------------------------------------------------
    {
      id: "a2-voss-drone",
      text:
        "The courier drone finds you with the ease of something that was " +
        "never looking — your writ pinged it the moment you crossed the " +
        "plaza. The slate it delivers is sealed to your thumb. Two lines: " +
        "'Glasshouse. Now.' — and under Voss's mark, countersigned in a " +
        "second key you don't recognize, a crest reading RECLAMATION " +
        "CORDON, DIR. HALEX.",
      location: "cinder-row:plaza",
      choices: [
        {
          id: "glasshouse",
          label: "The Glasshouse, then.",
          target: "a2-voss-glasshouse",
        },
        {
          id: "toss",
          label: "Pocket the slate and take the long way. Let them wait.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "a2-voss-glasshouse",
      speaker: "Director Voss",
      text:
        "The terrarium is in a packing crate. That's the first thing you " +
        "notice, and Voss watches you notice it. \"Halex survived my " +
        "committee. Worse — Halex learned from it. The directorate gave " +
        "Reclamation to a director with a plan, and the plan is called " +
        "the Cordon: seal the Undercroft, wind down its cyclers, and let " +
        "arithmetic do what the Undertow couldn't photograph.\" A pause, " +
        "measured. \"Your name is on my payroll, and my payroll is " +
        "evidence now. When I fall, you're a line item in the indictment.\"",
      location: "cinder-row:glasshouse",
      choices: [
        {
          id: "callback",
          label: "\"You wrote the Undertow. Did you draft this one too?\"",
          target: "a2-voss-callback",
          requirements: [
            { type: "flag-equals", key: "voss-confronted", value: true },
          ],
        },
        {
          id: "terms",
          label: "\"Skip the eulogy. What's the job?\"",
          target: "a2-voss-brief",
        },
      ],
    },
    {
      id: "a2-voss-callback",
      speaker: "Director Voss",
      text:
        "For once the smile doesn't deploy. \"No. Halex wrote this one " +
        "alone — by grading my homework. Every mistake the Undertow " +
        "made, the Cordon corrects: no water, no bodies, no single night " +
        "to point at. Just a schedule and a sealed door.\" Voss feeds " +
        "the crated salt-plants a last pipette of brine. \"I built a " +
        "monster once, and I at least had the manners to keep it " +
        "deniable. Halex is proud of theirs.\"",
      location: "cinder-row:glasshouse",
      choices: [
        { id: "back", label: "Back to business.", target: "a2-voss-glasshouse" },
      ],
    },
    {
      id: "a2-voss-brief",
      speaker: "Director Voss",
      text:
        "\"Two items, as before — I find the format works on you. One: " +
        "Halex runs the Cordon partly off-book; somewhere in the " +
        "Exchange is a mandate spool with the cycler shutdown signed in " +
        "the director's own key. Bring it to me and Halex dies in " +
        "committee, permanently this time. Two: the core ring itself. " +
        "Break it before the wind-down finishes, or the spool is just an " +
        "obituary with good penmanship.\" Voss slides a retainer's kit " +
        "across the desk. \"Your writ still opens the Exchange's front " +
        "gate. Halex hasn't dared void it — voiding it would mean " +
        "admitting I still have assets.\"",
      location: "cinder-row:glasshouse",
      choices: [
        {
          id: "lin",
          label: "Find Auditor Lin first. Towers talk to towers.",
          target: "a2-voss-lin",
          requirements: [{ type: "background", tag: "corp" }],
          effects: [
            { type: "add-item", itemId: "msc-cordon-orders" },
            { type: "set-flag", key: "lin-debt", value: true },
          ],
        },
        {
          id: "filament",
          label: "Call at the Filament on the way. Old habit.",
          target: "a2-voss-filament",
          requirements: [
            { type: "flag-equals", key: "sable-burned", value: true },
          ],
        },
        {
          id: "go",
          label: "Take the kit and ride the tram to the Meridian Exchange.",
          target: "a2-voss-gate",
          effects: [
            { type: "set-flag", key: "a2-approach", value: "voss" },
            { type: "add-item", itemId: "con-field-kit" },
            { type: "travel", mapId: "exchange-ventworks" },
          ],
        },
      ],
    },
    {
      id: "a2-voss-lin",
      speaker: "Auditor Lin",
      text:
        "Lin audits the Exchange now — a promotion shaped exactly like " +
        "exile. You quote the internal calendar; Lin's posture does the " +
        "old centimeter. \"Halex routes the Cordon's real ledger through " +
        "a cold spool on the cycler floor. Off-book, off-backup — " +
        "auditors aren't cleared past the core ring, which is how I know " +
        "it matters.\" A data chit changes hands under the partition. " +
        "\"The routing map. I pulled it before my clearance 'lapsed'. " +
        "That's twice I was never helpful. You're building a tab.\"",
      location: "cinder-row:glasshouse",
      choices: [
        { id: "back", label: "\"I pay my tabs, Lin.\"", target: "a2-voss-brief" },
      ],
    },
    {
      id: "a2-voss-filament",
      text:
        "The Filament's door is painted over — not boarded, painted, the " +
        "Row's way of saying nobody's coming back and nobody's asking. " +
        "A chalk mark by the hinge, in courier shorthand: BURNED. Down " +
        "the block, Flick is watching you read it, and when you meet the " +
        "kid's eyes they turn and walk, unhurried, the way you taught " +
        "the whole Row that topsiders whistle.",
      location: "cinder-row:filament-bar",
      choices: [
        {
          id: "back",
          label: "There's nothing here to say. Back to the job.",
          target: "a2-voss-brief",
          effects: [{ type: "set-flag", key: "filament-dark", value: true }],
        },
      ],
    },
    {
      id: "a2-voss-gate",
      text:
        "The Meridian Exchange's front gate is new Cordon plate over old " +
        "civic bronze, and the scanners over it turn to track you with " +
        "the smooth unhurry of things that have already decided. Two " +
        "enforcers in matte black flank the arch. The scanner light " +
        "settles on your chest and waits.",
      location: "exchange:front-gate",
      choices: [
        {
          id: "writ",
          label: "Show the Auric writ and keep walking.",
          target: "a2-vent-arrival",
          requirements: [{ type: "item", itemId: "msc-auric-writ" }],
          effects: [{ type: "set-flag", key: "gate2-route", value: "writ" }],
        },
        {
          id: "fight",
          label: "The gate's the way in. Go through it.",
          target: "a2-vent-arrival",
          effects: [
            { type: "set-flag", key: "gate2-route", value: "fight" },
            { type: "start-combat", encounterId: "enc-exchange-gate" },
          ],
        },
      ],
    },
    // ------------------------------------------------------------------
    // Opening C — the manhunt (act1-outcome = broadcast)
    // ------------------------------------------------------------------
    {
      id: "a2-lone-watch",
      text:
        "You've been three different people since the broadcast — new " +
        "walk, new coat, new nothing-to-see — and it almost works. The " +
        "plaza screens cycle Auric 'correction notices' with a bounty " +
        "figure and a gait-print that used to be yours. The watcher " +
        "peels off the tram queue at last: Flick, wearing a new walk of " +
        "their own. \"Don't look at the screens,\" the kid murmurs, " +
        "passing. \"Patch's cellar. The one behind the noodle stall. " +
        "Now-ish.\"",
      location: "cinder-row:plaza",
      choices: [
        {
          id: "follow",
          label: "Drift after Flick, casual as weather.",
          target: "a2-lone-safehouse",
          effects: [
            { type: "add-item", itemId: "con-trauma-patch", quantity: 2 },
          ],
        },
      ],
    },
    {
      id: "a2-lone-safehouse",
      text:
        "Patch's topside bolt-hole smells of noodle steam and solder. " +
        "Patch — up the chain from Greywater since the seal came down — " +
        "lays it out flat: the Chainwell bolted shut, the Steps under a " +
        "'remediation embargo', and the big cyclers at the Meridian " +
        "Exchange winding down on a forty-hour schedule signed by a " +
        "director named Halex. \"And your warrant doubled at midnight,\" " +
        "Patch adds, already pressing trauma patches on you aunt-fashion " +
        "— you look like the warrant half caught you. \"The Cordon's got " +
        "scanners on every gate that matters. Whatever you're going to " +
        "do, your face can't do it.\"",
      location: "cinder-row:patch-cellar",
      choices: [
        {
          id: "hex",
          label: "Ask the dead screen in the corner. It's been listening.",
          target: "a2-lone-hex",
          requirements: [
            { type: "flag-equals", key: "hex-broadcast", value: true },
          ],
          effects: [{ type: "set-flag", key: "hex-exchange", value: true }],
        },
        {
          id: "flick-word",
          label: "\"Flick. What have those new eyes seen?\"",
          target: "a2-lone-flick",
          requirements: [
            { type: "flag-equals", key: "flick-friend", value: true },
          ],
        },
        {
          id: "move-open",
          label: "Move out. The Exchange won't break itself.",
          target: "a2-lone-approach",
          requirements: [
            { type: "flag-equals", key: "act1-side", value: "open" },
          ],
        },
        {
          id: "move-voss",
          label: "Move out — and clock the good coats waiting by the stall.",
          target: "a2-lone-collectors",
          requirements: [
            { type: "flag-equals", key: "betrayed-voss", value: true },
          ],
        },
        {
          id: "move-court",
          label: "Move out, past the chain-cutters who won't hail you.",
          target: "a2-lone-ferrowcold",
          requirements: [
            { type: "flag-equals", key: "betrayed-court", value: true },
          ],
        },
      ],
    },
    {
      id: "a2-lone-hex",
      speaker: "Hex",
      text:
        "The dead screen warms like a struck match. \"I moved after our " +
        "concert,\" Hex says, wearing the noodle stall's order display " +
        "as a mouth. \"The Exchange's ghost registers are spacious, and " +
        "nobody audits the dead. I have been reading Halex's Cordon " +
        "from the inside all week.\" The screen draws a maintenance web, " +
        "lovingly. \"Its doors still dream in my key, diver. Come to " +
        "the wire and I will open the Exchange like a songbook.\"",
      location: "cinder-row:patch-cellar",
      choices: [
        { id: "back", label: "\"Keep the registers warm, Hex.\"", target: "a2-lone-safehouse" },
      ],
    },
    {
      id: "a2-lone-flick",
      speaker: "Flick",
      text:
        "\"Freight gate rotates its watch at the shift bell, roof crane " +
        "on the tram side never got its cameras back after the storm, " +
        "and Patch has something in a case they've been pretending not " +
        "to save for you.\" Flick counts the items off on gloved " +
        "fingers, then grins the old grin under the new walk. \"Whole " +
        "Sprawl memorized your broadcast, you know. Some of us are " +
        "still deciding what it made you. I already decided.\"",
      location: "cinder-row:patch-cellar",
      choices: [
        {
          id: "back",
          label: "\"Good eyes, Flick.\"",
          target: "a2-lone-safehouse",
          effects: [{ type: "set-flag", key: "flick-scout", value: true }],
        },
      ],
    },
    {
      id: "a2-lone-collectors",
      text:
        "They're waiting in the underlevel cut behind the stall — a good " +
        "coat with a writ-server pistol, a tally drone at their shoulder, " +
        "and the patience of compound interest. \"Voss sends regards,\" " +
        "the collector says, almost kindly. \"The director calls it a severance audit. You walked " +
        "on a live contract, and the balance came due at midnight — " +
        "settle it in credits, or in kind.\"",
      location: "cinder-row:underlevel-cut",
      choices: [
        {
          id: "pay",
          label: "Settle the writ. (200 cr)",
          target: "a2-lone-approach",
          requirements: [{ type: "credits", value: 200 }],
          ifUnavailable: "disabled",
          effects: [
            { type: "credits", amount: -200 },
            { type: "set-flag", key: "collectors-paid", value: true },
          ],
        },
        {
          id: "fight",
          label: "\"Collect, then.\"",
          target: "a2-lone-approach",
          effects: [{ type: "start-combat", encounterId: "enc-collectors" }],
        },
      ],
    },
    {
      id: "a2-lone-ferrowcold",
      text:
        "The Court's chain-cutters work the topside conduits now, " +
        "keeping the thieves' chain alive — and every one of them finds " +
        "somewhere else to look as you pass. At the cut's mouth, one " +
        "finally speaks, eyes on her work: \"Matron says your name like " +
        "a debt. Says the Crown was a fine loud thing, and the deck you " +
        "left her sappers on was a quiet one.\" She snips a cable, " +
        "precise. \"Break the Cordon and maybe the Steps forget which " +
        "night was which.\"",
      location: "cinder-row:underlevel-cut",
      choices: [
        {
          id: "on",
          label: "Carry the debt. Move.",
          target: "a2-lone-approach",
          effects: [{ type: "set-flag", key: "court-cold", value: true }],
        },
      ],
    },
    {
      id: "a2-lone-approach",
      text:
        "The Meridian Exchange fills the tram loop's north sky, gates " +
        "chevroned in Cordon black. Every entrance has scanners, and " +
        "every scanner has your gait in its teeth. From the shadow of " +
        "the stalled tram you count the ways in: the front arch, the " +
        "freight gate, the crane line sagging over the wire — and " +
        "whatever doors aren't doors at all.",
      location: "cinder-row:tram-loop",
      choices: [
        {
          id: "patch-veil",
          label: "Find Patch first. About that case.",
          target: "a2-lone-veil",
        },
        {
          id: "veil-walk",
          label: "Walk the front arch as nobody at all. (Static Veil)",
          target: "a2-lone-ghostgate",
          requirements: [{ type: "enhancement", itemId: "cyb-static-veil" }],
          effects: [
            { type: "set-flag", key: "gate2-route", value: "veil" },
            { type: "set-flag", key: "a2-approach", value: "lone" },
            { type: "travel", mapId: "exchange-ventworks" },
          ],
        },
        {
          id: "hex-door",
          label: "Go to the wire and let Hex sing the service door open.",
          target: "a2-lone-ghostgate",
          requirements: [
            { type: "flag-equals", key: "hex-exchange", value: true },
          ],
          effects: [
            { type: "set-flag", key: "gate2-route", value: "hex" },
            { type: "set-flag", key: "a2-approach", value: "lone" },
            { type: "travel", mapId: "exchange-ventworks" },
          ],
        },
        {
          // The Market's own way in, and the only one that is bought
          // with nothing but standing: six levels of traders keep a
          // stair into a bonded floor because six levels of traders
          // have always had stock in it. Warm gets you the stair —
          // the boards do not lend their doors to faces.
          id: "market-stair",
          label: "Ask the boards for the freight stair nobody bills for.",
          target: "a2-lone-backstair",
          requirements: [
            { type: "reputation", factionId: "market", value: "warm" },
          ],
          ifUnavailable: "disabled",
          effects: [
            { type: "set-flag", key: "gate2-route", value: "market" },
            { type: "set-flag", key: "a2-approach", value: "lone" },
            { type: "travel", mapId: "exchange-ventworks" },
          ],
        },
        {
          id: "roof",
          label: "Ride the dead crane line over the wire.",
          target: "a2-lone-ghostgate",
          requirements: [{ type: "stat", stat: "reflexes", value: 8 }],
          ifUnavailable: "disabled",
          effects: [
            { type: "set-flag", key: "gate2-route", value: "roof" },
            { type: "set-flag", key: "a2-approach", value: "lone" },
            { type: "travel", mapId: "exchange-ventworks" },
          ],
        },
        {
          id: "force",
          label: "The freight gate, then. The loud way.",
          target: "a2-lone-gate",
          effects: [
            { type: "set-flag", key: "a2-approach", value: "lone" },
            { type: "travel", mapId: "exchange-ventworks" },
          ],
        },
      ],
    },
    {
      id: "a2-lone-veil",
      speaker: "Patch",
      text:
        "Patch sets the case on a crate like it's a patient. Inside, in " +
        "clinic seals: a Static Veil, subdermal projection film, the " +
        "kind of hardware that makes recognition systems file you under " +
        "weather — and beneath it, packed in foam, a Torsion Frame " +
        "stripped from a cycler crew auction. \"Held both through two " +
        "offers,\" Patch says. \"Flood season prices, same as ever — and " +
        "no warranty on what any of it does to mirrors.\"",
      location: "cinder-row:tram-loop",
      choices: [
        {
          id: "buy",
          label: "Buy the Static Veil. (150 cr)",
          target: "a2-lone-veil",
          requirements: [{ type: "credits", value: 150 }],
          ifUnavailable: "disabled",
          effects: [
            { type: "credits", amount: -150 },
            { type: "add-item", itemId: "cyb-static-veil" },
          ],
        },
        {
          id: "buy-frame",
          label: "Buy the Torsion Frame. (400 cr)",
          target: "a2-lone-veil",
          requirements: [{ type: "credits", value: 400 }],
          ifUnavailable: "disabled",
          effects: [
            { type: "credits", amount: -400 },
            { type: "add-item", itemId: "cyb-torsion-frame" },
          ],
        },
        {
          id: "buy-patch",
          label: "Buy a trauma patch. (20 cr)",
          target: "a2-lone-veil",
          requirements: [{ type: "credits", value: 20 }],
          ifUnavailable: "disabled",
          effects: [
            { type: "credits", amount: -20 },
            { type: "add-item", itemId: "con-trauma-patch" },
          ],
        },
        {
          id: "done",
          label: "\"That's the lot.\"",
          target: "a2-lone-approach",
        },
      ],
    },
    {
      id: "a2-lone-ghostgate",
      text:
        "You cross the Exchange's wire the way rumors cross a room — " +
        "past the scanners, through the service dark, and out into the " +
        "Ventworks with nothing behind you but a door easing shut. " +
        "Somewhere overhead the Cordon's watch goes on guarding the " +
        "city against a gait-print that no longer exists.",
      location: "exchange:service-dark",
      choices: [
        { id: "in", label: "Into the Ventworks.", target: "a2-vent-arrival" },
      ],
    },
    {
      id: "a2-lone-backstair",
      text:
        "A runner in market colours meets you at the tram loop's south " +
        "rail, says your name like a consignment number, and walks you " +
        "four blocks to a freight stair that is not on any of the " +
        "Exchange's plans because it predates them. \"Bonded floor's " +
        "been ours since the embargo,\" she says, chaining the door " +
        "open behind you. \"Boards say you're good for it. Don't make " +
        "them wrong, and don't come back out this way.\" The scanners " +
        "up on the arch never get a look at you at all.",
      location: "exchange:freight-stair",
      choices: [
        { id: "in", label: "Up the stair, into the Ventworks.", target: "a2-vent-arrival" },
      ],
    },
    {
      id: "a2-lone-gate",
      text:
        "The freight gate stands half-lit between shift bells, chain " +
        "still swaying from the last crate through. Two Cordon " +
        "enforcers hold it in matte black, and the scanner above the " +
        "arch finds your gait in three strides. The klaxon starts " +
        "polite. It won't stay polite.",
      location: "exchange:freight-gate",
      choices: [
        {
          id: "fight",
          label: "Finish what the klaxon started.",
          target: "a2-vent-arrival",
          effects: [
            { type: "set-flag", key: "gate2-route", value: "fight" },
            { type: "start-combat", encounterId: "enc-exchange-gate" },
          ],
        },
      ],
    },
    // ------------------------------------------------------------------
    // The Ventworks — converging spine
    // ------------------------------------------------------------------
    {
      id: "a2-vent-arrival",
      text:
        "The Ventworks is the Sprawl's hidden lung laid open: cycler " +
        "galleries tall as tenements, coolant mains sweating along the " +
        "east wall, and everywhere the wrongness of machines running " +
        "slow. Enforcers are marching the last vent crews toward 'exit " +
        "processing' in neat, unhurried files. At the center of it all " +
        "rises the Cordon core — a ring of mandate machinery, lit like " +
        "a verdict.",
      location: "exchange:concourse",
      comments: [
        {
          companionId: "vesper",
          text:
            "\"They're walking them out so nobody's hands are near the " +
            "valves,\" she says. \"That's not evacuation. I've seen " +
            "evacuation.\"",
        },
        {
          companionId: "sill",
          text:
            "\"Exit processing,\" he repeats, without inflection. \"I " +
            "certified this floor for nine years. Those galleries have " +
            "names. I know most of them.\"",
        },
      ],
      choices: [
        { id: "crew", label: "Look in on the penned vent crews.", target: "a2-vent-crew" },
        { id: "gallery", label: "Study the cycler gallery terminal.", target: "a2-vent-gallery" },
        {
          id: "bonded",
          label: "Try the bonded lift on the mezzanine.",
          target: "a2-vent-bonded",
          // One visit: past the door, the floor's stock is spoken for
          // one way or the other.
          requirements: [{ type: "flag-unset", key: "bonded-floor" }],
        },
        { id: "vault", label: "Follow the coolant mains to the vault.", target: "a2-vent-cache" },
        { id: "core", label: "Walk the ramp to the Cordon core.", target: "a2-core-door" },
        { id: "tram", label: "Head back toward the tram gate.", target: "a2-tram" },
        { id: "look", label: "Keep to the shadows awhile.", effects: [{ type: "end" }] },
      ],
    },
    {
      id: "a2-vent-crew",
      speaker: "Foreman Odal",
      text:
        "The vent crews wait in a holding pen of portable barrier, " +
        "tagged for 'exit processing' like freight. Their foreman — " +
        "Odal, by the coverall — watches the cyclers wind down through " +
        "the mesh with the face of a surgeon watching someone sit on " +
        "her patient. \"Forty years I've kept those breathing,\" she " +
        "says to no one in particular. \"Now they schedule the stopping " +
        "and march us out so no hands are near the valves.\"",
      location: "exchange:crew-pen",
      choices: [
        {
          id: "street-knock",
          label: "Give the courier knock on the barrier mesh. The old one.",
          target: "a2-vent-crew-street",
          requirements: [{ type: "background", tag: "street" }],
          effects: [
            { type: "set-flag", key: "knows-ducts", value: true },
            { type: "set-flag", key: "crew-warned", value: true },
            { type: "add-item", itemId: "con-field-kit" },
          ],
          reactions: ["mercy"],
        },
        {
          id: "wrench",
          label: "Wrench the holding gate off its runners.",
          target: "a2-vent-grate",
          requirements: [{ type: "stat", stat: "body", value: 7 }],
          ifUnavailable: "disabled",
          effects: [
            { type: "set-flag", key: "crew-freed", value: true },
            { type: "increment-flag", key: "steps-goodwill" },
          ],
          reactions: ["mercy", "defiance"],
        },
        {
          id: "back",
          label: "Move on before the escort circles back.",
          target: "a2-vent-arrival",
        },
      ],
    },
    {
      id: "a2-vent-crew-street",
      speaker: "Foreman Odal",
      text:
        "Odal's head comes around at the knock, and the surgeon's face " +
        "cracks into something younger. \"Underlevels crew! Ha — you " +
        "ran the Greywater loop, didn't you. Knew the walk.\" Her voice " +
        "drops to shop-floor pitch. \"Listen: the maintenance ducts " +
        "behind the coolant vault run clean past the core ring's watch " +
        "— we used them to dodge the safety auditors for years. But " +
        "mind the vault itself. Something dens in there. We seal it " +
        "with prayer tape and it mails us back the tape.\" A field kit " +
        "passes through the mesh, aunt-fashion.",
      location: "exchange:crew-pen",
      choices: [
        { id: "back", label: "\"Keep your people ready, Foreman.\"", target: "a2-vent-arrival" },
      ],
    },
    {
      id: "a2-vent-grate",
      text:
        "The holding gate was rated for crowd sentiment, not for you. " +
        "It comes off its runners with a shriek, and the vent crews " +
        "pour out through the gap and scatter into the ductwork they " +
        "know better than their own names — gone before the nearest " +
        "enforcer finishes turning. Odal is last through. She looks " +
        "you up and down once, files you somewhere, and vanishes.",
      location: "exchange:crew-pen",
      choices: [
        { id: "back", label: "Walk away from the empty pen.", target: "a2-vent-arrival" },
      ],
    },
    {
      id: "a2-vent-gallery",
      text:
        "The gallery terminal still trusts anyone in arm's reach — vent " +
        "crews never needed passwords, just competence. On screen, the " +
        "wind-down schedule descends in tidy stages toward a flat line " +
        "labeled MINIMUM CIVIC OBLIGATION. Every stage is stamped with " +
        "the same authorizing key: HALEX.",
      location: "exchange:gallery",
      choices: [
        {
          id: "dive",
          label: "Jack in and dive the Exchange schema.",
          target: "a2-vent-dive",
          requirements: [{ type: "background", tag: "net" }],
          effects: [
            { type: "set-flag", key: "proxy-known", value: true },
            { type: "set-flag", key: "knows-ducts", value: true },
          ],
          reactions: ["record"],
        },
        {
          id: "reroute",
          label: "Re-route a cycler loop through the maintenance bus.",
          target: "a2-vent-reroute",
          requirements: [{ type: "stat", stat: "tech", value: 7 }],
          ifUnavailable: "disabled",
          effects: [
            { type: "set-flag", key: "cyclers-stalled", value: true },
            { type: "increment-flag", key: "steps-goodwill" },
          ],
          reactions: ["mercy", "defiance"],
        },
        {
          id: "read",
          label: "Read the schedule to the end.",
          target: "a2-vent-schedule",
          reactions: ["record"],
        },
        {
          id: "back",
          label: "Step away from the terminal.",
          target: "a2-vent-arrival",
        },
      ],
    },
    {
      id: "a2-vent-dive",
      text:
        "The Exchange's schema opens around you, drowned architecture " +
        "again — but tended this time, wind-down orders swimming in " +
        "schools. Two things surface before you do. First: the " +
        "maintenance ducts behind the coolant vault, mapped and " +
        "unwatched. Second: the thing in the core ring wearing Halex's " +
        "voice is a telepresence proxy — the director's chassis is " +
        "here, but the director is high in the Spire, holding the " +
        "Cordon's keys at arm's length from the consequences.",
      location: "exchange:gallery",
      choices: [
        { id: "surface", label: "Surface with the map and the truth.", target: "a2-vent-arrival" },
      ],
    },
    {
      id: "a2-vent-reroute",
      text:
        "You bridge the maintenance bus the way vent techs have bridged " +
        "it for decades when the paperwork ran slower than the air. One " +
        "cycler loop shudders, reconsiders, and spins back up to full " +
        "song. Somewhere below Ledge Four, tonight, the air will keep " +
        "moving hours past Halex's schedule — and on the wind-down " +
        "graph, a single line quietly refuses to fall.",
      location: "exchange:gallery",
      choices: [
        { id: "back", label: "Leave the bus humming.", target: "a2-vent-arrival" },
      ],
    },
    {
      id: "a2-vent-schedule",
      text:
        "The last stage has a footnote, in the smallest civic font: " +
        "'Residual habitation below stage floor to self-resolve. No " +
        "remediation cost projected.' Forty hours, then the deep levels " +
        "breathe yesterday's air until the arithmetic finishes. You " +
        "memorize the phrasing. Some sentences deserve to be read back " +
        "to their authors.",
      location: "exchange:gallery",
      choices: [
        { id: "back", label: "Step away from the terminal.", target: "a2-vent-arrival" },
      ],
    },
    // ------------------------------------------------------------------
    // The bonded lift — a Combine door, read two ways
    //
    // The plainest thing standing can buy: a maintained corporate door
    // that opens for a file it likes and, for everybody else, for two
    // hundred credits pressed into a floor clerk's hand. Same floor
    // either way — the difference is whether the Combine let you in or
    // whether you bought your way past it, and whether you can still
    // afford what happens next.
    // ------------------------------------------------------------------
    {
      id: "a2-vent-bonded",
      text:
        "The bonded lift is the only thing on the mezzanine still " +
        "lit the way its builders meant: brass call plate, live " +
        "reader, EMBARGOED STOCK — AURIC COMBINE RECLAMATION stencilled " +
        "at head height. Behind the grille, four levels of shelving " +
        "hold whatever the Cordon impounded and never got round to " +
        "moving. A floor clerk sits at the foot of it with a slate, a " +
        "flask, and the particular boredom of a man paid to be the " +
        "last honest step in a process.",
      location: "exchange:mezzanine",
      choices: [
        {
          id: "bonded-standing",
          label: "Put your hand on the reader and let it look you up.",
          target: "a2-vent-bonded-floor",
          requirements: [
            { type: "reputation", factionId: "auric", value: "warm" },
          ],
          ifUnavailable: "disabled",
          effects: [{ type: "set-flag", key: "bonded-floor", value: "standing" }],
        },
        {
          id: "bonded-clerk",
          label: "Buy the clerk's cycle key instead. (150 cr)",
          target: "a2-vent-bonded-floor",
          requirements: [{ type: "credits", value: 150 }],
          ifUnavailable: "disabled",
          effects: [
            { type: "credits", amount: -150 },
            { type: "set-flag", key: "bonded-floor", value: "paid" },
          ],
          reactions: ["deception"],
        },
        {
          id: "bonded-back",
          label: "Leave the Combine's shelves to the Combine.",
          target: "a2-vent-arrival",
        },
      ],
    },
    {
      id: "a2-vent-bonded-floor",
      text:
        "The grille rolls back on four levels of impounded stock, " +
        "each crate stencilled with the district it was lifted from " +
        "and the date the Cordon took it. Cycler parts. Clinic " +
        "consumables. A pallet of filter cartridges addressed to " +
        "Ledge Nine, three weeks late and going nowhere. The manifest " +
        "hangs by the grille on a clip, one page per district, and it " +
        "is the single most saleable piece of paper in the Exchange.",
      location: "exchange:mezzanine",
      choices: [
        {
          id: "bonded-take",
          label: "Fill your pockets and go. Somebody was always going to.",
          target: "a2-vent-arrival",
          effects: [
            { type: "credits", amount: 120 },
            { type: "add-item", itemId: "con-field-kit", quantity: 2 },
            { type: "add-item", itemId: "con-surge-stim" },
          ],
          reactions: ["salvage"],
        },
        {
          id: "bonded-boards",
          label: "Photograph the manifest. Six levels can read it by morning.",
          target: "a2-vent-arrival",
          effects: [
            { type: "credits", amount: 40 },
            { type: "add-item", itemId: "con-field-kit" },
            { type: "set-flag", key: "boards-cut-in", value: true },
          ],
          // What the Market pays for being told first, and what the
          // Combine charges for having its shelves read out loud.
          standing: { market: 12, auric: -6 },
          reactions: ["record", "defiance"],
        },
      ],
    },
    {
      id: "a2-vent-cache",
      text:
        "The coolant vault crouches under the mains, door furred with " +
        "generations of prayer tape — the vent crews' shrine to the " +
        "thing that lives past it. Fresh drag-marks groove the floor " +
        "inward. Beyond the vault, per the crews, the maintenance ducts " +
        "run clean past the core ring's watch; through the door grille " +
        "you can see the racked gear the crews abandoned mid-shift.",
      location: "exchange:coolant-vault",
      choices: [
        {
          id: "ducts",
          label: "Slip through on the crews' route, quiet past the den.",
          target: "a2-vent-loot",
          requirements: [{ type: "flag-equals", key: "knows-ducts", value: true }],
          effects: [{ type: "set-flag", key: "crawler-skipped", value: true }],
        },
        {
          id: "fight",
          label: "Open the vault and meet what dens there.",
          target: "a2-vent-loot",
          effects: [{ type: "start-combat", encounterId: "enc-vent-crawler" }],
        },
        {
          id: "back",
          label: "Leave the prayer tape unbroken.",
          target: "a2-vent-arrival",
        },
      ],
    },
    {
      id: "a2-vent-loot",
      text:
        "The vault past the den is a vent-crew reliquary: racked tools, " +
        "a wall of tagged lockers — and hung in pride of place, an arc " +
        "lash, its cable spool still live. Someone chalked a name above " +
        "it and then crossed the name out. Crews don't take a dead " +
        "colleague's tools. They wait for the tools to choose. On the " +
        "survey bench below, a spindle projector sits mid-calibration, " +
        "its safety stops already filed away.",
      location: "exchange:coolant-vault",
      choices: [
        {
          id: "take",
          label: "Take the arc lash off its hook.",
          target: "a2-vent-arrival",
          effects: [{ type: "add-item", itemId: "wpn-arc-lash" }],
          reactions: ["salvage"],
        },
        {
          id: "take-projector",
          label: "Lift the spindle projector from the bench.",
          target: "a2-vent-arrival",
          requirements: [{ type: "stat", stat: "tech", value: 6 }],
          ifUnavailable: "disabled",
          effects: [{ type: "add-item", itemId: "wpn-spindle-projector" }],
          reactions: ["salvage"],
        },
        {
          id: "crew-split",
          label: "Behind you, the crew have stopped agreeing.",
          target: "a2-vent-split",
          // Both of them, whichever one you brought: the argument is
          // the beat, so the one on the bench came anyway.
          requirements: [
            { type: "companion", companionId: "vesper", status: "recruited" },
            { type: "companion", companionId: "sill", status: "recruited" },
          ],
        },
      ],
    },
    // ------------------------------------------------------------------
    // The vault, and the crew's own fault line
    //
    // The one beat where both companions are in the room whoever is
    // benched, because their agendas finally touch: a dead crew's
    // lockers are either a haul or an exhibit, and the player says
    // which. Loyalty moves by explicit effect rather than by reaction
    // tag — a tagged choice would only be scored by whoever happens to
    // be out, and this call is watched by both of them.
    //
    // Records vent-vault-call ("salvage" | "filed" | "brokered"), which
    // the epilogues read.
    // ------------------------------------------------------------------
    {
      id: "a2-vent-split",
      text:
        "Kade has three of the tagged lockers open before you turn " +
        "round, and she is not being quiet about it: cable, a pump " +
        "head, a torque driver worth a month. Sill is in the vault " +
        "doorway with the slate against his chest, and he is not coming " +
        "any further in. \"Every one of these has a name chalked on " +
        "it,\" he says. \"Those names are on the exit-processing roster. " +
        "This room is the only place both lists exist.\" — \"This room " +
        "is under forty hours of air,\" Kade says, without looking up. " +
        "\"They're gone, Deacon. This is what's left of them and it " +
        "should go to people who are still breathing.\"",
      location: "exchange:coolant-vault",
      choices: [
        {
          id: "split-strip",
          label: "\"Strip it. Every hour we spend here is an hour of air.\"",
          target: "a2-vent-split-strip",
          effects: [
            { type: "set-flag", key: "vent-vault-call", value: "salvage" },
            { type: "companion-loyalty", companionId: "vesper", amount: 3 },
            { type: "companion-loyalty", companionId: "sill", amount: -3 },
          ],
        },
        {
          id: "split-file",
          label: "\"Nothing leaves this room until it's on his slate.\"",
          target: "a2-vent-split-file",
          effects: [
            { type: "set-flag", key: "vent-vault-call", value: "filed" },
            { type: "companion-loyalty", companionId: "sill", amount: 3 },
            { type: "companion-loyalty", companionId: "vesper", amount: -3 },
          ],
        },
        {
          id: "split-broker",
          label: "Make them do it together — logged out, signed for, carried.",
          target: "a2-vent-split-both",
          // Getting these two to hold the same clipboard is the hardest
          // social thing in the chapter, and it is priced that way.
          requirements: [{ type: "stat", stat: "cool", value: 7 }],
          ifUnavailable: "disabled",
          effects: [
            { type: "set-flag", key: "vent-vault-call", value: "brokered" },
            { type: "companion-loyalty", companionId: "vesper", amount: 1 },
            { type: "companion-loyalty", companionId: "sill", amount: 1 },
          ],
        },
      ],
    },
    {
      id: "a2-vent-split-strip",
      text:
        "Kade has the racks cleared in eleven minutes and she is good " +
        "enough at it that it is almost not ugly. Sill photographs what " +
        "he can before it goes, standing in the doorway the whole time, " +
        "and when the last locker comes off the wall he writes one line " +
        "on the slate and closes it. \"Ninety-one statements,\" he says, " +
        "to nobody. \"And the corroboration went out under somebody's " +
        "arm.\" Kade shoulders the bundle and does not answer, because " +
        "she is right too, and both of them know it.",
      location: "exchange:coolant-vault",
      choices: [
        {
          id: "strip-on",
          label: "Get it out of here before the escort circles back.",
          target: "a2-vent-arrival",
        },
      ],
    },
    {
      id: "a2-vent-split-file",
      text:
        "It takes an hour you do not have. Sill works the wall locker by " +
        "locker — name, serial, tag number, the roster line it matches — " +
        "and at the end of it he has a document that will make somebody " +
        "in the tower put a hand over their mouth. Kade stands at the " +
        "vault mouth with her back to both of you for most of it. \"Fine,\" " +
        "she says, once. \"It's fine. I'm just counting what a month of " +
        "somebody's rent looks like sat on a shelf being evidence.\"",
      location: "exchange:coolant-vault",
      choices: [
        {
          id: "file-on",
          label: "Close the vault on it and move.",
          target: "a2-vent-arrival",
        },
      ],
    },
    {
      id: "a2-vent-split-both",
      text:
        "You put it to them as a receipt: he logs a locker, she carries " +
        "it, both names go on the line, and whatever is sold gets sold " +
        "against a list that exists. Sill objects on procedure for four " +
        "minutes and then starts writing faster than she can lift. Kade " +
        "objects on principle for one, and then reads a chalked name " +
        "aloud so he can spell it right. It is not friendship. It is two " +
        "people agreeing to be witnesses to each other, which on this " +
        "floor tonight is very nearly the same thing.",
      location: "exchange:coolant-vault",
      choices: [
        {
          id: "both-on",
          label: "Take the list and the load, and go.",
          target: "a2-vent-arrival",
        },
      ],
    },
    {
      id: "a2-tram",
      text:
        "The tram gate's departure board still lists Cinder Row like " +
        "nothing upstairs has changed. Through the arch you can see the " +
        "loop's stalled cars and, beyond them, the plaza glow — a whole " +
        "city running on air it hasn't thought about once.",
      location: "exchange:tram-gate",
      choices: [
        {
          id: "ride",
          label: "Ride back to Cinder Row.",
          effects: [{ type: "travel", mapId: "cinder-plaza" }],
        },
        { id: "stay", label: "Stay in the Ventworks.", effects: [{ type: "end" }] },
      ],
    },
    // ------------------------------------------------------------------
    // The Cordon core — climax, keyed by approach
    // ------------------------------------------------------------------
    {
      id: "a2-core-door",
      speaker: "Director Halex",
      text:
        "The core ring's blast doors carry the Cordon crest at parade " +
        "scale, and the PA carries Halex — a voice like a signature " +
        "stamp. \"Field asset. I know each of the three people you " +
        "might be, and I approved the contingency for all of them. The " +
        "Cordon is not a scheme; it is a correction. Schemes can be " +
        "embarrassed. Corrections simply complete.\" Beyond the doors, " +
        "something vast cycles up with a sound like a held breath.",
      location: "exchange:core-ring",
      comments: [
        {
          companionId: "vesper",
          text:
            "\"He's on a speaker,\" she says, disgusted. \"He isn't " +
            "even in the building and he's still the loudest thing in it.\"",
        },
        {
          companionId: "sill",
          text:
            "\"'A correction,'\" he quotes, writing it down verbatim. " +
            "\"Say it again, Director. Slower.\"",
        },
      ],
      choices: [
        {
          id: "breach-court",
          label: "Give the sappers their mark and go in through the coolant wall.",
          target: "a2-core-won",
          requirements: [
            { type: "flag-equals", key: "a2-approach", value: "court" },
          ],
          effects: [{ type: "start-combat", encounterId: "enc-cordon-court" }],
        },
        {
          id: "breach-voss",
          label: "Feed Voss's override to the doors. Eleven seconds.",
          target: "a2-core-won",
          requirements: [
            { type: "flag-equals", key: "a2-approach", value: "voss" },
          ],
          effects: [{ type: "start-combat", encounterId: "enc-cordon-voss" }],
        },
        {
          id: "breach-lone",
          label: "No allies, no override. Go in as the rumor they can't file.",
          target: "a2-core-won",
          requirements: [
            { type: "flag-equals", key: "a2-approach", value: "lone" },
          ],
          effects: [{ type: "start-combat", encounterId: "enc-cordon-lone" }],
        },
        {
          id: "step-back",
          label: "Step back from the ring. Not yet.",
          target: "a2-vent-arrival",
        },
      ],
    },
    {
      id: "a2-core-won",
      text:
        "The proxy chassis lies where it folded, mandate lance dark, " +
        "the director's borrowed face gone to static. The ring's " +
        "machinery idles around you, suddenly ownerless — and the PA " +
        "clears its throat. \"Noted,\" Halex says, from very high up " +
        "and very far away, in the tone of someone amending a " +
        "spreadsheet. \"Recoverable. Everything about tonight is " +
        "recoverable.\" A cold spool socket blinks amber on the fallen " +
        "chassis, where a director kept the books they couldn't leave " +
        "in the Spire.",
      location: "exchange:core-ring",
      choices: [
        {
          id: "gloat",
          label: "\"You watched me name Voss, Halex. Say thank you.\"",
          target: "a2-core-halex",
          requirements: [
            { type: "flag-equals", key: "voss-exposed", value: true },
          ],
        },
        {
          id: "spool",
          label: "Pull the mandate spool from the proxy's socket.",
          target: "a2-core-console",
          effects: [{ type: "add-item", itemId: "msc-cordon-orders" }],
        },
        {
          id: "console",
          label: "Leave the wreck. The console is waiting.",
          target: "a2-core-console",
        },
      ],
    },
    {
      id: "a2-core-halex",
      speaker: "Director Halex",
      text:
        "A pause you could invoice. \"Thank you,\" Halex says, and the " +
        "horror of it is the sincerity. \"Your broadcast retired my " +
        "only rival and taught the directorate that scandal is a " +
        "flood-class risk. The Cordon is dry, deniable, and boring " +
        "precisely because you taught us what loud costs. You are, in " +
        "a real sense, a co-author.\" The PA hums. \"I had the clause " +
        "drafted, you know. In case we ever met: no offer. You've " +
        "shown what you do to offers.\"",
      location: "exchange:core-ring",
      choices: [
        {
          id: "spool",
          label: "Answer by pulling the mandate spool from the wreck.",
          target: "a2-core-console",
          effects: [{ type: "add-item", itemId: "msc-cordon-orders" }],
        },
      ],
    },
    {
      id: "a2-core-console",
      text:
        "The master console holds the whole Cordon in five glass " +
        "columns: embargo bolts, cycler governors, the directorate " +
        "uplink, the district boards, and a sixth column, dark, that " +
        "nobody has dared label. The wind-down counter ticks overhead. " +
        "Whatever you do here, the Sprawl wakes up in a different city.",
      location: "exchange:core-ring",
      choices: [
        {
          id: "charter",
          label: "Feed the mandate spool to every district board. Convene the Sprawl.",
          target: "a2-end-charter",
          requirements: [{ type: "item", itemId: "msc-cordon-orders" }],
        },
        {
          id: "takeover",
          label: "Open the directorate uplink and hand Voss the ring.",
          target: "a2-end-takeover",
          requirements: [{ type: "flag-equals", key: "ally-voss", value: true }],
        },
        {
          id: "sever-court",
          label: "Throw the governors into reverse. The Court takes it from here.",
          target: "a2-end-severance",
          requirements: [
            { type: "flag-equals", key: "ally-cistern-court", value: true },
          ],
        },
        {
          id: "sever-hex",
          label: "Give Hex the governors. Let the ghost keep the parish.",
          target: "a2-end-severance",
          requirements: [
            { type: "flag-equals", key: "hex-exchange", value: true },
          ],
        },
        {
          id: "sever-tech",
          label: "Re-key the governors yourself, line by line.",
          target: "a2-end-severance",
          requirements: [{ type: "stat", stat: "tech", value: 8 }],
          ifUnavailable: "disabled",
        },
      ],
    },
    // ------------------------------------------------------------------
    // Chapter endings
    // ------------------------------------------------------------------
    {
      id: "a2-end-charter",
      text:
        "The spool unwinds into every district board at once, and then — " +
        "because some machines remember being civic — into both " +
        "emergency channels of the Meridian Charter. Cycler shutdown, " +
        "cost projections, 'to self-resolve', all of it signed in " +
        "Halex's own key. The boards light district by district like a " +
        "city taking a roll call. You can't un-convene a Charter " +
        "session. By the time you reach the concourse, nobody is trying.",
      location: "exchange:core-ring",
      choices: [
        {
          id: "walk-out",
          label: "Walk out through the front gate, past scanners told to look away.",
          effects: [
            { type: "set-flag", key: "act2-outcome", value: "charter" },
            { type: "set-flag", key: "cordon-broken", value: true },
            { type: "set-flag", key: "halex-deposed", value: true },
            { type: "set-flag", key: "undercroft-charter", value: true },
            { type: "set-flag", key: "wanted-by-auric", value: false },
            { type: "set-flag", key: "act2-complete", value: true },
            { type: "credits", amount: 280 },
            { type: "remove-item", itemId: "msc-cordon-orders" },
            { type: "end", endingId: "act2-charter" },
          ],
          standing: { auric: -10, court: 20, market: 12 },
        },
      ],
    },
    {
      id: "a2-end-takeover",
      speaker: "Director Voss",
      text:
        "Voss answers the uplink on the first tone, as if the hand had " +
        "been resting on it for days. You feed the ring's authority up " +
        "the wire and listen to a coup conducted in committee grammar: " +
        "Halex's mandate reclassified as Halex's confession, the Cordon " +
        "rebranded as a 'continuity exercise', the embargo lifted as an " +
        "act of magnanimity with cameras present. \"Reclamation thanks " +
        "its field partners,\" Voss says at last, and the salt-plant " +
        "smile comes down the wire almost warm. \"Act three will be " +
        "along shortly.\"",
      location: "exchange:core-ring",
      choices: [
        {
          id: "uplink",
          label: "Let the transfer settle. Learn what it costs later.",
          effects: [
            { type: "set-flag", key: "act2-outcome", value: "takeover" },
            { type: "set-flag", key: "cordon-broken", value: true },
            { type: "set-flag", key: "halex-deposed", value: true },
            { type: "set-flag", key: "voss-ascendant", value: true },
            { type: "set-flag", key: "auric-patron", value: true },
            { type: "set-flag", key: "act2-complete", value: true },
            { type: "credits", amount: 300 },
            { type: "end", endingId: "act2-takeover" },
          ],
          standing: { auric: 30, court: -20 },
        },
      ],
    },
    {
      id: "a2-end-severance",
      text:
        "The governors go over one by one, and the Exchange's grip on " +
        "the deep levels lets go — not dying, changing hands. Court " +
        "cyclers spin up on terrace power; siphon lines wake; on the " +
        "master board, every meter below Ledge Four flatlines to zero " +
        "at once, and stays there. Auric can't strangle what it no " +
        "longer feeds. Somewhere below Greywater, a bell that isn't the " +
        "storm bell begins to ring, and doesn't stop.",
      location: "exchange:core-ring",
      choices: [
        {
          id: "throw",
          label: "Throw the last governor and cut the Undercroft free.",
          effects: [
            { type: "set-flag", key: "act2-outcome", value: "severance" },
            { type: "set-flag", key: "cordon-broken", value: true },
            { type: "set-flag", key: "undercroft-severed", value: true },
            { type: "set-flag", key: "steps-independent", value: true },
            { type: "set-flag", key: "act2-complete", value: true },
            { type: "end", endingId: "act2-severance" },
          ],
          standing: { auric: -25, court: 25, market: -10 },
        },
      ],
    },
  ],
};
