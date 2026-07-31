import { SIDE_CHAIN_STEP, scaleStanding } from "../factions";
import type { StoryNode } from "../../narrative/types";

/**
 * "Under the Waterline" — the Flooded Quays' side-quest chain.
 *
 * Dredge works the basin alone, and for a season now she has not been
 * working it for herself. The Longshore — a crew who move cargo up out
 * of the drowned levels and out of everybody's paperwork — have a
 * bonded store two streets down with the doors shut on it, and they run
 * every consignment up the quays on her salvage licence. She gets a cut
 * she did not ask for and a number on a book she has never seen.
 *
 * Three scenes: the ask, the ring, the settlement. The ask forks at its
 * very first choice into two roads that never rejoin — help her, or go
 * and sell the conversation to the man she is frightened of — and those
 * two roads carry three exclusive endings between them.
 *
 * The chain hangs off Dredge on the salvage platform, so these nodes
 * are part of the quays arc (`fq-diver` opens `uw-ask`) rather than an
 * arc of their own; a choice target only ever resolves inside one arc.
 * They live in their own file because they are the only thing in the
 * district that writes story state, starts a fight, or pays.
 *
 * Optional and missable, never breakable. Every node offers an ungated
 * way out, the stage flag records how far a run got, and `uw-ask`
 * routes a returning player back to the scene they left — except on the
 * one road where Dredge is no longer standing there to be asked, and
 * there the map itself is the door (see ../mapDressing.ts).
 *
 * Flag surface (one namespace, all of it prefixed `under-waterline`):
 *
 *   under-waterline             stage: see UNDER_WATERLINE_STAGES
 *   under-waterline-side        which road the first choice took
 *   under-waterline-entry       how the bonded store was got into
 *   under-waterline-broken      terminal: the ring is off her water
 *   under-waterline-partner     terminal: the ring kept running, with you in it
 *   under-waterline-abandoned   terminal: she was what got sold
 *
 * The three terminals are mutually exclusive by construction. The two
 * settlement choices on the diver's road gate on the stage being
 * "inside" and both move it off; the one on the ring's road gates on
 * "sold" and moves it off; and "sold" and "inside" are reached by
 * choices that both gate on the stage being unset. So a run can only
 * ever be on one road, can only ever settle once, and cannot collect a
 * settlement's pay twice.
 */

/** Stage flag: where a run currently stands in the chain. */
export const UNDER_WATERLINE_STAGE_FLAG = "under-waterline";

/**
 * Stage values. A run takes one of two paths through them: the diver's
 * road (taken -> inside -> broken | partner) or the ring's road
 * (sold -> abandoned). Nothing crosses between them.
 */
export const UNDER_WATERLINE_STAGES = [
  "taken",
  "inside",
  "sold",
  "broken",
  "partner",
  "abandoned",
] as const;

export type UnderWaterlineStage = (typeof UNDER_WATERLINE_STAGES)[number];

/**
 * What each settlement is worth, to whom, and what it leaves standing
 * on the salvage platform afterwards.
 *
 * Faction reputation is a later task; `standing` is the contract it
 * consumes, keyed the same way the Vertical Market's chain keys it
 * (see ./lastMile.ts) so the reputation pass reads one table shape for
 * both chains. Each settlement sets exactly one boolean flag, so
 * "which way did the quays go" is one flag lookup per outcome.
 *
 * `platform` is the lasting change to the district: who is standing out
 * on the working platform from here on and what talking to them opens.
 * The quays' map dressing (../mapDressing.ts) is built from it, which
 * is why the outcome owns it rather than the map — the settlement
 * decides what the map says, permanently, and the two can never drift.
 */
export const UNDER_WATERLINE_OUTCOMES = {
  /** The bonded store is on the bottom and the basin is hers again. */
  broken: {
    flag: "under-waterline-broken",
    credits: 90,
    items: ["msc-longshore-ledger"],
    /** Nobody up top minds a smuggler less; the quays mind losing cheap. */
    standing: { auric: 1, market: -1, court: 2 },
    platform: { label: "Dredge", nodeId: "uw-settled-broken" },
  },
  /** The runs kept running, and a share of them is yours. */
  partner: {
    flag: "under-waterline-partner",
    credits: 240,
    items: ["out-tender-coat"],
    /** Cheap goods keep coming up; nobody signing anything is pleased. */
    standing: { auric: -1, market: 2, court: -2 },
    platform: { label: "Dredge", nodeId: "uw-settled-partner" },
  },
  /** Her licence went across a table she was not sitting at. */
  abandoned: {
    flag: "under-waterline-abandoned",
    credits: 180,
    items: ["msc-basin-licence"],
    /** A licence-holder Auric can lean on; a diver the water remembers. */
    standing: { auric: 2, market: -2, court: -1 },
    platform: { label: "Keel", nodeId: "uw-settled-abandoned" },
  },
} as const;

export type UnderWaterlineOutcome = keyof typeof UNDER_WATERLINE_OUTCOMES;

export const underWaterlineNodes: StoryNode[] = [
  // --- Scene one: the ask, and the way back in
  //
  // One door from the platform for every state the chain can be in. The
  // fork is the first two choices and it is the whole quest: after
  // either of them the other is gone for good.
  {
    id: "uw-ask",
    speaker: "Dredge",
    text:
      "She does not look up from the line. \"You've been down here " +
      "twice now and you've asked me about the water both times, so " +
      "I'll save you the third.\" The coil goes round her fist, once. " +
      "\"Two streets down there's a bonded store the Combine shut the " +
      "doors on. It isn't shut any more. There's a crew called the " +
      "Longshore working out of it, and every crate they walk up these " +
      "quays goes up on my licence number, because a diver's licence is " +
      "the only paper down here that means anything.\" Now she looks up. " +
      "\"I take a cut I never asked for. And if it ever lands, it lands " +
      "on me.\"",
    location: "flooded-quays:platform",
    comments: [
      {
        companionId: "vesper",
        text:
          "\"She's been carrying that since spring,\" Kade says quietly. " +
          "\"I offered. She said it was hers to carry.\"",
        requirements: [
          { type: "flag-equals", key: "vesper-joined", value: "assisted" },
        ],
      },
      {
        companionId: "vesper",
        text:
          "\"Huh.\" Kade's arms fold. \"She never told *me* that, and I " +
          "paid to be told things.\"",
        requirements: [
          { type: "flag-equals", key: "vesper-joined", value: "pressed" },
        ],
      },
      {
        companionId: "vesper",
        text: "\"A number on somebody else's book,\" Kade says. \"Lovely.\"",
      },
      {
        companionId: "sill",
        text:
          "\"A licence number on every line.\" Sill has gone very still. " +
          "\"That is not a crew using her. That is a crew building a " +
          "case against her, one entry at a time, and calling it " +
          "bookkeeping.\"",
      },
    ],
    choices: [
      {
        id: "uw-ask-what",
        label: "\"What happens if you just stop?\"",
        target: "uw-squeeze",
        requirements: [
          { type: "flag-unset", key: UNDER_WATERLINE_STAGE_FLAG },
        ],
      },
      {
        // Recruited off this same strand, and the chain knows it. The
        // gate is the recruitment flag rather than the party, so it
        // opens whether or not she came down with you tonight.
        id: "uw-ask-kade",
        label: "\"Kade works this basin. Does she know about the store?\"",
        target: "uw-kade-water",
        requirements: [{ type: "flag-set", key: "vesper-joined" }],
      },
      {
        id: "uw-help",
        label: "\"Then they come off your water. Where's the store?\"",
        target: "uw-taken",
        requirements: [
          { type: "flag-unset", key: UNDER_WATERLINE_STAGE_FLAG },
        ],
        effects: [
          {
            type: "set-flag",
            key: UNDER_WATERLINE_STAGE_FLAG,
            value: "taken",
          },
          { type: "set-flag", key: "under-waterline-side", value: "diver" },
        ],
        reactions: ["mercy"],
      },
      {
        id: "uw-sell-out",
        label:
          "\"A crew that careful would pay to know who you've been " +
          "telling.\"",
        target: "uw-sell",
        requirements: [
          { type: "flag-unset", key: UNDER_WATERLINE_STAGE_FLAG },
        ],
        effects: [
          { type: "set-flag", key: UNDER_WATERLINE_STAGE_FLAG, value: "sold" },
          { type: "set-flag", key: "under-waterline-side", value: "ring" },
        ],
        reactions: ["deception"],
      },
      {
        id: "uw-resume-ring",
        label: "\"Your store. I haven't been down yet.\"",
        target: "uw-ring",
        requirements: [
          {
            type: "flag-equals",
            key: UNDER_WATERLINE_STAGE_FLAG,
            value: "taken",
          },
        ],
      },
      {
        id: "uw-resume-inside",
        label: "\"I've been inside it. I'm not finished.\"",
        target: "uw-inside",
        requirements: [
          {
            type: "flag-equals",
            key: UNDER_WATERLINE_STAGE_FLAG,
            value: "inside",
          },
        ],
      },
      {
        id: "uw-resume-sold",
        label: "\"Nothing. Go back to your line.\"",
        target: "uw-sell",
        requirements: [
          {
            type: "flag-equals",
            key: UNDER_WATERLINE_STAGE_FLAG,
            value: "sold",
          },
        ],
      },
      {
        id: "uw-account-broken",
        label: "\"How's the water?\"",
        target: "uw-settled-broken",
        requirements: [
          {
            type: "flag-equals",
            key: UNDER_WATERLINE_STAGE_FLAG,
            value: "broken",
          },
        ],
      },
      {
        id: "uw-account-partner",
        label: "\"Still working, then.\"",
        target: "uw-settled-partner",
        requirements: [
          {
            type: "flag-equals",
            key: UNDER_WATERLINE_STAGE_FLAG,
            value: "partner",
          },
        ],
      },
      {
        id: "uw-ask-leave",
        label: "Not your basin, not your book. Leave it.",
        effects: [{ type: "end" }],
      },
    ],
  },
  {
    id: "uw-squeeze",
    speaker: "Dredge",
    expression: "grim",
    text:
      "\"Stop.\" She turns the word over like she is checking it for " +
      "rot. \"If I stop, the licence stops, and a licence that stops " +
      "gets pulled, and a pulled licence gets bought inside a week by " +
      "whoever is standing nearest. That's them.\" The net shifts under " +
      "the platform. \"They don't threaten me. That's the thing nobody " +
      "up top believes. They're *polite*. They ask after my knees.\"",
    location: "flooded-quays:platform",
    choices: [
      {
        id: "uw-squeeze-back",
        label: "\"Right. Where's the store?\"",
        target: "uw-ask",
      },
      {
        id: "uw-squeeze-leave",
        label: "Let her keep her arrangement. Go.",
        effects: [{ type: "end" }],
      },
    ],
  },
  {
    // The recruitment beat's small dividend: somebody the player pulled
    // a winch with on this exact strand turns out to be part of the
    // story here, and Dredge says so whether or not she is standing
    // beside you to hear it.
    id: "uw-kade-water",
    speaker: "Dredge",
    text:
      "\"Kade knows. Kade has known since she started going past the " +
      "tram, which she'll tell you I've never done and she's right.\" A " +
      "shrug that costs her something. \"She wanted to put a grapnel " +
      "through their tender's hull and let the basin have it. I told her " +
      "the tender isn't the problem, the book is, and she called me a " +
      "coward in a very polite way and hasn't brought it up since.\"",
    location: "flooded-quays:platform",
    comments: [
      {
        companionId: "vesper",
        text:
          "\"I called you *careful*,\" Kade says, to the water. \"I said " +
          "careful.\" A pause. \"I meant coward.\"",
        requirements: [
          { type: "flag-equals", key: "vesper-joined", value: "assisted" },
        ],
      },
      {
        companionId: "vesper",
        text:
          "\"Still forty for the pull,\" Kade says, to nobody. \"Still " +
          "worth it.\" She does not look at Dredge at all.",
        requirements: [
          { type: "flag-equals", key: "vesper-joined", value: "pressed" },
        ],
      },
    ],
    choices: [
      {
        id: "uw-kade-back",
        label: "\"Then let's talk about the book.\"",
        target: "uw-ask",
      },
      {
        id: "uw-kade-leave",
        label: "Leave the two of them their argument.",
        effects: [{ type: "end" }],
      },
    ],
  },
  {
    id: "uw-taken",
    speaker: "Dredge",
    text:
      "\"East of the barge, past the second trestle. You'll know it when " +
      "the water goes still — that's roof under you.\" She draws it on " +
      "the wet plank with a finger and the rain takes it as fast as she " +
      "makes it. \"Loading tube on the north face, flooded to the top. " +
      "Boom chain off the old crane on the south. Container stack up the " +
      "east end that somebody keeps restacking. And a tender on the " +
      "water the whole time, with a man called Keel on it who is dry, " +
      "which down here is the only thing you need to know about anyone.\"",
    location: "flooded-quays:platform",
    choices: [
      {
        id: "uw-taken-go",
        label: "Go east along the bank.",
        target: "uw-ring",
      },
      {
        id: "uw-taken-hold",
        label: "Not tonight. The water is not going anywhere.",
        effects: [{ type: "end" }],
      },
    ],
  },

  // --- Scene two, the diver's road: the ring
  //
  // Seven ways in and no build locked out: gills or a rigged line take
  // the flooded tube, shoulders take the boom chain, reflexes take the
  // container stack, the district's own salvage cage gets you walked in
  // as a delivery, a cool head gets invited, and anybody at all can go
  // through the walkway the hard way. All seven land on the same beat
  // and record which one it was.
  {
    id: "uw-ring",
    text:
      "The water goes still where she said it would, and the stillness " +
      "is a roof: a Combine bonded store sunk to its eaves, one course " +
      "of brick and a run of clerestory glass standing proud of the " +
      "basin with lamplight coming up through it from underneath. A " +
      "crane lies half-drowned across the south face with its boom chain " +
      "still rigged. Containers are stacked four high off the east end, " +
      "restacked recently and badly. And out on the black water, riding " +
      "at anchor with no light showing, a tender with a man standing on " +
      "it who has not moved since you came round the trestle.",
    location: "flooded-quays:bonded-store",
    comments: [
      {
        companionId: "vesper",
        text:
          "\"Four high and badly,\" Kade says, looking at the containers " +
          "the way other people look at a staircase. \"They're not " +
          "stacking for space. They're stacking for a *ramp*.\"",
      },
      {
        companionId: "sill",
        text:
          "\"A bonded store,\" Sill says. \"Bonded means somebody sealed " +
          "it and somebody countersigned the seal. Whatever is under that " +
          "glass, there is a piece of paper somewhere that says it is " +
          "still there.\"",
      },
    ],
    choices: [
      {
        // Two ways down the flooded tube, and they are alternatives
        // rather than a pair: chrome in the ribs, or the wit to build
        // what the chrome does out of what is lying on the strand.
        id: "uw-dive-gills",
        label: "Go down the loading tube on your own gills.",
        target: "uw-inside",
        requirements: [{ type: "enhancement", itemId: "cyb-silt-gills" }],
        effects: [
          { type: "set-flag", key: "under-waterline-entry", value: "dived" },
          {
            type: "set-flag",
            key: UNDER_WATERLINE_STAGE_FLAG,
            value: "inside",
          },
        ],
      },
      {
        id: "uw-dive-rig",
        label: "Rig a breather off the wreck's tanks and take the tube.",
        target: "uw-inside",
        requirements: [{ type: "stat", stat: "tech", value: 7 }],
        ifUnavailable: "disabled",
        effects: [
          { type: "set-flag", key: "under-waterline-entry", value: "rigged" },
          {
            type: "set-flag",
            key: UNDER_WATERLINE_STAGE_FLAG,
            value: "inside",
          },
        ],
      },
      {
        id: "uw-boom",
        label: "Haul yourself down the crane's boom chain hand over hand.",
        target: "uw-inside",
        requirements: [{ type: "stat", stat: "body", value: 7 }],
        ifUnavailable: "disabled",
        effects: [
          { type: "set-flag", key: "under-waterline-entry", value: "hauled" },
          {
            type: "set-flag",
            key: UNDER_WATERLINE_STAGE_FLAG,
            value: "inside",
          },
        ],
      },
      {
        id: "uw-stack",
        label: "Go up the container stack and in through the clerestory.",
        target: "uw-inside",
        requirements: [{ type: "stat", stat: "reflexes", value: 7 }],
        ifUnavailable: "disabled",
        effects: [
          { type: "set-flag", key: "under-waterline-entry", value: "climbed" },
          {
            type: "set-flag",
            key: UNDER_WATERLINE_STAGE_FLAG,
            value: "inside",
          },
        ],
      },
      {
        // The district's gated container, cashed in: whichever way the
        // salvage cage on the strand came open, its chain had a
        // consignment number stamped on it, and a consignment number is
        // a way to be walked in through the front rather than a way in.
        id: "uw-manifest",
        label:
          "Walk in behind the cage's consignment number, like a delivery.",
        target: "uw-inside",
        requirements: [{ type: "flag-set", key: "quays-cage" }],
        effects: [
          { type: "set-flag", key: "under-waterline-entry", value: "tagged" },
          {
            type: "set-flag",
            key: UNDER_WATERLINE_STAGE_FLAG,
            value: "inside",
          },
        ],
        reactions: ["deception"],
      },
      {
        id: "uw-parley",
        label: "Stand on the bank in the open and wait to be rowed over.",
        target: "uw-inside",
        requirements: [{ type: "stat", stat: "cool", value: 8 }],
        ifUnavailable: "disabled",
        effects: [
          { type: "set-flag", key: "under-waterline-entry", value: "invited" },
          {
            type: "set-flag",
            key: UNDER_WATERLINE_STAGE_FLAG,
            value: "inside",
          },
        ],
      },
      {
        id: "uw-force",
        label: "Take the walkway to the store's door and go through it.",
        target: "uw-inside",
        effects: [
          { type: "start-combat", encounterId: "enc-quays-salvage" },
          { type: "set-flag", key: "under-waterline-entry", value: "fought" },
          {
            type: "set-flag",
            key: UNDER_WATERLINE_STAGE_FLAG,
            value: "inside",
          },
        ],
        reactions: ["defiance"],
      },
      {
        id: "uw-ring-leave",
        label: "Look at it a while and go back the way you came.",
        effects: [{ type: "end" }],
      },
    ],
  },

  // --- The eighth way in, and the way it goes wrong
  //
  // Neither of these is a choice on the ring: they are opened by the
  // *map*. Once the chain is at "taken", Keel's crew is on the two
  // plate walkways with their own beat and their own eyes, and crossing
  // the basin becomes something played on the tiles rather than picked
  // off a list (see the store-crossing zone in src/data/stealth.ts).
  // Getting to the trestle unseen lands here; being seen on the boards
  // lands on the one below, which is the ring's own fight entered from
  // the wrong side of it.
  //
  // Both are declared as doorways on the quays arc, because a beat the
  // map opens is reached from no choice anywhere.
  {
    id: "uw-quiet",
    text:
      "You come off the east span onto the wharf between one pass of the " +
      "lamp and the next, and the trestle takes you round out of the " +
      "light. Behind you the crossing goes on being crossed by nobody: " +
      "two hands walking two lines of plate, and something under the " +
      "boards keeping its own hours. The store's face is a course of " +
      "brick and a run of lit glass, and its door is standing open " +
      "because nobody out here has any reason to think it should not be.",
    location: "flooded-quays:bonded-store",
    comments: [
      {
        companionId: "vesper",
        text:
          "\"You didn't touch anybody,\" Kade says, almost put out about " +
          "it. \"A whole crew, and you just — went round.\"",
      },
    ],
    choices: [
      {
        id: "quiet-in",
        label: "Walk in through the open door.",
        target: "uw-inside",
        effects: [
          { type: "set-flag", key: "under-waterline-entry", value: "slipped" },
          {
            type: "set-flag",
            key: UNDER_WATERLINE_STAGE_FLAG,
            value: "inside",
          },
        ],
      },
      {
        // Being past the crossing is not the same as being committed to
        // what is on the other side of it. The chain is still at
        // "taken", so the diver's own conversation opens the ring again
        // and every other road in is still on it.
        id: "quiet-hold",
        label: "Stand out of the light a while and look at it first.",
        effects: [{ type: "end" }],
      },
    ],
  },
  {
    id: "uw-spotted",
    text:
      "The plate carries sound the way a drum carries it, and the hand " +
      "on the span has been listening to this crossing every night for a " +
      "season. The lamp comes round and stops. \"On the boards!\" — and " +
      "the shout goes out over the water and comes back off the far bank " +
      "twice, so that by the time it has finished arriving there is " +
      "somebody at both ends of the span and nowhere on it to be.",
    location: "flooded-quays:walkway",
    choices: [
      {
        id: "spotted-through",
        label: "The boards are a bad place to be caught. Go forward.",
        target: "uw-inside",
        effects: [
          { type: "start-combat", encounterId: "enc-quays-salvage" },
          { type: "set-flag", key: "under-waterline-entry", value: "caught" },
          {
            type: "set-flag",
            key: UNDER_WATERLINE_STAGE_FLAG,
            value: "inside",
          },
        ],
        reactions: ["defiance"],
      },
      {
        // Back off the boards. The crew keeps the crossing and keeps
        // being up — the alert the watch wrote is still written, so the
        // fight this becomes later starts the same way this one would
        // have (see alertFlag in ../stealth.ts).
        id: "spotted-back",
        label: "Go back the way you came and let them have the water.",
        effects: [{ type: "end" }],
      },
    ],
  },

  // --- Scene three, the diver's road: the settlement
  //
  // The fork, and the only place on this road that pays. Both roads
  // gate on the stage being "inside" and both move it off, so exactly
  // one terminal is ever written, once.
  {
    id: "uw-inside",
    speaker: "Keel",
    text:
      "The store's upper floor is dry, which after the tube or the chain " +
      "or the glass is the strangest thing about it: pallets on brick " +
      "piers a foot above the water, lamps on stands, and a man in a " +
      "waxed coat sitting at a clerk's desk with a grease-paper tally " +
      "book open in front of him. He does not stand and he does not " +
      "reach for anything. \"You came in the interesting way,\" he says. " +
      "\"I'm Keel. Before you say the diver's name — yes. Every line in " +
      "this book has her number on it. That is not leverage, it's " +
      "*carriage*. Paper has to belong to somebody.\"",
    location: "flooded-quays:bonded-store",
    comments: [
      {
        companionId: "vesper",
        text:
          "\"He's got a book and no guard,\" Kade murmurs. \"That means " +
          "the book is the guard.\"",
      },
      {
        companionId: "sill",
        text:
          "\"Carriage.\" Sill says it the way you would repeat a slur. " +
          "\"He has written a woman's name on nine hundred crimes and " +
          "he is calling it *carriage*.\"",
      },
    ],
    choices: [
      {
        id: "uw-break",
        label:
          "Take the book and open the flood doors behind you. (Break them)",
        target: "uw-broken",
        requirements: [
          {
            type: "flag-equals",
            key: UNDER_WATERLINE_STAGE_FLAG,
            value: "inside",
          },
        ],
        effects: [
          {
            type: "set-flag",
            key: UNDER_WATERLINE_STAGE_FLAG,
            value: "broken",
          },
          { type: "set-flag", key: "under-waterline-broken", value: true },
          { type: "credits", amount: 90 },
          { type: "add-item", itemId: "msc-longshore-ledger" },
        ],
        // Straight off the table above, at the shared chain weight.
        standing: scaleStanding(
          UNDER_WATERLINE_OUTCOMES.broken.standing,
          SIDE_CHAIN_STEP,
        ),
        reactions: ["record", "defiance"],
      },
      {
        id: "uw-terms",
        label:
          "\"Her number comes off the book. Mine goes on, for a share.\"",
        target: "uw-partner",
        requirements: [
          {
            type: "flag-equals",
            key: UNDER_WATERLINE_STAGE_FLAG,
            value: "inside",
          },
          { type: "stat", stat: "cool", value: 8 },
        ],
        ifUnavailable: "disabled",
        effects: [
          {
            type: "set-flag",
            key: UNDER_WATERLINE_STAGE_FLAG,
            value: "partner",
          },
          { type: "set-flag", key: "under-waterline-partner", value: true },
          { type: "credits", amount: 240 },
          { type: "add-item", itemId: "out-tender-coat" },
        ],
        standing: scaleStanding(
          UNDER_WATERLINE_OUTCOMES.partner.standing,
          SIDE_CHAIN_STEP,
        ),
        reactions: ["deception"],
      },
      {
        id: "uw-inside-leave",
        label: "Say nothing. Go back out the way you came in.",
        effects: [{ type: "end" }],
      },
    ],
  },
  {
    id: "uw-broken",
    speaker: "Keel",
    expression: "grim",
    text:
      "You take the book off the desk and he lets you, because a man who " +
      "reaches for a book is a man admitting what the book is. It is the " +
      "flood doors he objects to. He is still objecting, from a pallet " +
      "raft, when the basin comes up through the brick piers and takes " +
      "the lamps out one at a time and the whole drowned street below " +
      "goes back to being a drowned street. \"You have not stopped " +
      "anything,\" he calls, unhurried, across the black. \"You have " +
      "moved it.\" Which is true, and is a different thing from her " +
      "number being on it.",
    location: "flooded-quays:bonded-store",
    choices: [
      {
        id: "uw-broken-done",
        label: "Go back west along the bank with the book under your coat.",
        effects: [{ type: "end" }],
      },
    ],
  },
  {
    id: "uw-partner",
    speaker: "Keel",
    text:
      "He hears you out without once looking up, and then he does the " +
      "only thing that has cost him anything all night: he takes a pen " +
      "and strikes a line through a licence number nine hundred entries " +
      "deep, and writes another one over it. \"You understand that this " +
      "is not mercy,\" he says. \"It is a change of address. The paper " +
      "still has to belong to somebody, and now it belongs to you.\" The " +
      "oilskin comes off the back of the chair and across the desk. \"So " +
      "does the coat. The water knows the coat.\"",
    location: "flooded-quays:bonded-store",
    choices: [
      {
        id: "uw-partner-done",
        label: "Take the coat. It is not even the wrong size.",
        effects: [{ type: "end" }],
      },
    ],
  },

  // --- Scene two and three, the ring's road
  //
  // Short, because selling somebody is short. Gated on the stage being
  // "sold", which only the first scene's second choice can write, and
  // which the settlement moves off — so this road can never be walked
  // by a player who took the diver's, and never pays twice.
  {
    id: "uw-sell",
    speaker: "Keel",
    text:
      "The tender is easy to find once you stop pretending you are not " +
      "looking for it: riding at the wharf steps at slack water with no " +
      "light showing and a man in a waxed coat on the afterdeck who has " +
      "clearly been told that somebody might come. He hears the whole " +
      "thing out — the licence, the cut, the words *if it ever lands, it " +
      "lands on me* — without any expression arriving on his face at " +
      "all. \"Thank you,\" he says. \"I'm Keel. She's right, by the way. " +
      "That is exactly what the arrangement is for.\"",
    location: "flooded-quays:wharf",
    comments: [
      {
        companionId: "vesper",
        text:
          "Kade has stopped a full pace back on the steps and is not " +
          "coming any further. She does not say anything. That is the " +
          "part you will remember.",
      },
      {
        companionId: "sill",
        text:
          "\"I want it noted,\" Sill says, to no one, \"that I am " +
          "standing here.\"",
      },
    ],
    choices: [
      {
        id: "uw-sell-licence",
        label:
          "\"You don't want her quiet. You want her licence. Name a price.\"",
        target: "uw-abandoned",
        requirements: [
          {
            type: "flag-equals",
            key: UNDER_WATERLINE_STAGE_FLAG,
            value: "sold",
          },
        ],
        effects: [
          {
            type: "set-flag",
            key: UNDER_WATERLINE_STAGE_FLAG,
            value: "abandoned",
          },
          { type: "set-flag", key: "under-waterline-abandoned", value: true },
          { type: "credits", amount: 180 },
          { type: "add-item", itemId: "msc-basin-licence" },
        ],
        standing: scaleStanding(
          UNDER_WATERLINE_OUTCOMES.abandoned.standing,
          SIDE_CHAIN_STEP,
        ),
        reactions: ["deception"],
      },
      {
        id: "uw-sell-leave",
        label: "Leave it there. Walk back up the steps.",
        effects: [{ type: "end" }],
      },
    ],
  },
  {
    id: "uw-abandoned",
    speaker: "Keel",
    text:
      "It takes four minutes and one signature, and the signature is not " +
      "hers. The chits come across in a fold of oilcloth; the licence " +
      "goes into the tally book, struck through once, countersigned, and " +
      "the book shuts on it. \"She'll work three more weeks,\" Keel says, " +
      "conversationally, coiling a line. \"That's how long it takes for " +
      "a pulled number to reach the water. Then she'll go and find out " +
      "why, and she'll be told, and after that I genuinely do not know. " +
      "People go different ways.\"",
    location: "flooded-quays:wharf",
    choices: [
      {
        id: "uw-abandoned-done",
        label: "Walk back down the strand. Look out at the platform.",
        target: "uw-settled-abandoned",
      },
      {
        id: "uw-abandoned-go",
        label: "Take the Lockgate Stair. Do not look at the water at all.",
        effects: [{ type: "end" }],
      },
    ],
  },

  // --- Afterwards
  //
  // What the district is from here on. Reached from `uw-ask`'s terminal
  // routes and, permanently, from the salvage platform itself: the map
  // dressing built from UNDER_WATERLINE_OUTCOMES points the platform at
  // whichever of these the run earned. Nothing here pays.
  {
    id: "uw-settled-broken",
    speaker: "Dredge",
    expression: "smile",
    text:
      "She is out on the platform with her boots in the basin and a net " +
      "beside her that is hers, and the mast lamp on the wreck is the " +
      "only light on the water again. \"They're two districts over " +
      "and they took the pallets with them,\" she says. \"I'm still on " +
      "somebody's book somewhere. I'd have to be a fool to think " +
      "otherwise.\" She works a shoulder, and the slits along it open " +
      "and shut once. \"But it's my number on my licence on my water, " +
      "and I've been down there twice this week just because I wanted " +
      "to see it.\"",
    location: "flooded-quays:platform",
    choices: [
      {
        id: "uw-broken-topics",
        label: "\"Something else —\"",
        target: "fq-diver",
      },
      {
        id: "uw-broken-go",
        label: "Leave her to the water she got back.",
        effects: [{ type: "end" }],
      },
    ],
  },
  {
    id: "uw-settled-partner",
    speaker: "Dredge",
    expression: "grim",
    text:
      "She is working, and she goes on working while she talks, which " +
      "she did not used to do. \"My number came off the book,\" she " +
      "says. \"Took a season and a stranger and four minutes. I've said " +
      "thank you and I meant it and I'm going to say the other thing " +
      "now.\" The line goes round her fist. \"The crates still come up " +
      "past my platform. Somebody's number is still on them. And the " +
      "man who put yours there did it with the same pen.\" She lets that " +
      "sit. \"Mind the third plank.\"",
    location: "flooded-quays:platform",
    choices: [
      {
        id: "uw-partner-topics",
        label: "\"Something else —\"",
        target: "fq-diver",
      },
      {
        id: "uw-partner-go",
        label: "Take the hint and the plank both.",
        effects: [{ type: "end" }],
      },
    ],
  },
  {
    id: "uw-settled-abandoned",
    speaker: "Keel",
    text:
      "The working platform has a man on it now, dry in a waxed coat, " +
      "with a tally book open on his knee and the diver's own net stacked " +
      "behind him still stiff with silt. The mast lamp on the wreck has " +
      "gone out. \"Three weeks, near enough,\" Keel says, without " +
      "looking up. \"She went up the Lockgate Stair to ask about it and " +
      "she has not come back down, and I would not read very much into " +
      "that if I were you. People go up those stairs all the time.\" He " +
      "turns a page. \"Your number's holding, by the way. Nobody's " +
      "queried it once.\"",
    location: "flooded-quays:platform",
    choices: [
      {
        id: "uw-abandoned-go",
        label: "Get off the platform.",
        effects: [{ type: "end" }],
      },
    ],
  },
];
