import { SIDE_CHAIN_STEP, scaleStanding } from "../factions";
import type { StoryNode } from "../../narrative/types";

/**
 * "The Last Mile" — the Vertical Market's side-quest chain.
 *
 * A courier named Pell took a sealed case out of the north gallery
 * three nights ago and never came off the boards. Three parties want
 * it: the client who paid for the run (and is buying silence as much as
 * carriage), Auric's recovery desk working quietly through
 * intermediaries, and the Rung — the crew who hold the sixth-level
 * scaffold and were paid to take it off her on the way down.
 *
 * Three scenes: investigation, confrontation, resolution. It hangs off
 * Marrow at the noodle counter, so these nodes are part of the market
 * arc (`vm-fixer` opens `lm-offer`) rather than an arc of their own —
 * a choice target only ever resolves inside one arc. They live in their
 * own file because they are the only thing in the district that writes
 * story state.
 *
 * Optional and missable by design, never breakable. Every node offers a
 * way out, the stage flag records how far the player got, and `lm-offer`
 * routes a returning player back to exactly the scene they abandoned —
 * so walking away is always a pause, never a broken quest. There is no
 * quest log: the whole state of the chain is derivable from the flags
 * below.
 *
 * Flag surface (one namespace, all of it prefixed `last-mile`):
 *
 *   last-mile            stage: taken -> found -> recovered -> a terminal
 *   last-mile-lead       how scene one was cracked
 *   last-mile-route      the maintenance run behind the crew, if seen
 *   last-mile-crew       how scene two went
 *   last-mile-delivered  terminal: the run was finished
 *   last-mile-exposed    terminal: the market was told
 *
 * The two terminals are mutually exclusive by construction: both
 * resolution choices gate on the stage being "recovered" and both move
 * it off "recovered", so exactly one can ever fire and it can only fire
 * once — which is also what keeps the rewards from paying twice.
 */

/** Stage flag: where a run currently stands in the chain. */
export const LAST_MILE_STAGE_FLAG = "last-mile";

/** Stage values, in the order a playthrough passes through them. */
export const LAST_MILE_STAGES = [
  "taken",
  "found",
  "recovered",
  "delivered",
  "exposed",
] as const;

export type LastMileStage = (typeof LAST_MILE_STAGES)[number];

/**
 * What each ending of the chain is worth, and to whom.
 *
 * The faction reputation system is a later task; this is the contract
 * it consumes. Each terminal sets its own boolean flag — never both —
 * and declares the standing swing that outcome is meant to be worth,
 * keyed by faction. Reading it is one flag lookup per outcome, so the
 * reputation task can apply these without this content knowing anything
 * about how standing is stored.
 *
 * `credits` and `items` are what the arc actually pays out on the spot;
 * they are listed here so the two roads can be compared in one place
 * and kept honestly different by a test.
 */
export const LAST_MILE_OUTCOMES = {
  /** The run was finished: the case went to the client, sealed. */
  delivered: {
    flag: "last-mile-delivered",
    credits: 200,
    items: ["out-highline-rig"],
    /** Paid, quiet, and useful — to everyone except the Court. */
    standing: { auric: 1, market: 1, court: -1 },
  },
  /** The seal came off in public: the boards were told what was in it. */
  exposed: {
    flag: "last-mile-exposed",
    credits: 60,
    items: ["out-highline-rig", "msc-assessment-roll"],
    /** The traders remember it; Auric remembers it differently. */
    standing: { auric: -2, market: 2, court: 1 },
  },
} as const;

export type LastMileOutcome = keyof typeof LAST_MILE_OUTCOMES;

export const lastMileNodes: StoryNode[] = [
  // --- The offer, and the way back in
  //
  // One door from Marrow for every state the chain can be in. A
  // returning player is routed to the scene they left rather than being
  // asked to find it again, and a finished one gets Marrow's account of
  // what it cost him.
  {
    id: "lm-offer",
    speaker: "Marrow",
    text:
      "\"Something, then.\" The chopstick turns over once. \"Three " +
      "nights ago a courier named Pell took a sealed case out of the " +
      "north gallery, bound for the foot of the Cinderway. Forty " +
      "minutes of walking. She has not come off the boards since, and " +
      "the case has not arrived, and I am the man who said out loud " +
      "that she was reliable.\" The optics click. \"I would like the " +
      "last mile of that run walked. By somebody.\"",
    location: "vertical-market:noodle-counter",
    comments: [
      {
        companionId: "vesper",
        text:
          "\"Three nights,\" Kade says, flat. \"Up here that's not " +
          "missing. That's somewhere specific.\"",
      },
      {
        companionId: "sill",
        text:
          "\"Sealed by whom,\" Sill says, to nobody, already writing.",
      },
    ],
    choices: [
      {
        id: "lm-who-wants-it",
        label: "\"Who else is looking for it?\"",
        target: "lm-parties",
        requirements: [{ type: "flag-unset", key: LAST_MILE_STAGE_FLAG }],
      },
      {
        id: "lm-take-job",
        label: "\"I'll walk it. Where did she go up?\"",
        target: "lm-trail",
        requirements: [{ type: "flag-unset", key: LAST_MILE_STAGE_FLAG }],
        effects: [
          { type: "set-flag", key: LAST_MILE_STAGE_FLAG, value: "taken" },
        ],
      },
      {
        id: "lm-resume-trail",
        label: "\"Your courier. I'm still looking.\"",
        target: "lm-trail",
        requirements: [
          { type: "flag-equals", key: LAST_MILE_STAGE_FLAG, value: "taken" },
        ],
      },
      {
        id: "lm-resume-scaffold",
        label: "\"I know where she is. I haven't been up yet.\"",
        target: "lm-scaffold",
        requirements: [
          { type: "flag-equals", key: LAST_MILE_STAGE_FLAG, value: "found" },
        ],
      },
      {
        id: "lm-resume-case",
        label: "\"I have your courier. We should talk about the case.\"",
        target: "lm-case",
        requirements: [
          {
            type: "flag-equals",
            key: LAST_MILE_STAGE_FLAG,
            value: "recovered",
          },
        ],
      },
      {
        id: "lm-account-paid",
        label: "\"Your client. Are we square?\"",
        target: "lm-settled-paid",
        requirements: [
          {
            type: "flag-equals",
            key: LAST_MILE_STAGE_FLAG,
            value: "delivered",
          },
        ],
      },
      {
        id: "lm-account-burned",
        label: "\"You've been quiet since the board went up.\"",
        target: "lm-settled-burned",
        requirements: [
          { type: "flag-equals", key: LAST_MILE_STAGE_FLAG, value: "exposed" },
        ],
      },
      {
        id: "lm-not-mine",
        label: "\"Not my run. Find somebody who owes you.\"",
        effects: [{ type: "end" }],
      },
    ],
  },
  {
    id: "lm-parties",
    speaker: "Marrow",
    expression: "grim",
    text:
      "\"Three, and I will be honest about all three because you will " +
      "find out anyway.\" He counts them on the chopstick. \"My client, " +
      "who paid for carriage and is now paying for quiet. An Auric " +
      "recovery desk, working through two intermediaries and a very " +
      "polite man who has asked me the same question four times in " +
      "different words. And the Rung — the crew who hold the sixth " +
      "level's scaffold, who are not looking for it at all, because " +
      "somebody paid them to be standing where it was going.\"",
    location: "vertical-market:noodle-counter",
    choices: [
      {
        id: "lm-parties-back",
        label: "\"Right. Where did she go up?\"",
        target: "lm-offer",
      },
      {
        id: "lm-parties-leave",
        label: "\"Three buyers and one courier. Bad arithmetic. No.\"",
        effects: [{ type: "end" }],
      },
    ],
  },

  // --- Scene one: the investigation
  //
  // Four roads out, three of them gated and each on a different part of
  // the character: Tech traces the tag, Cool leans on the people who
  // watched her go, and either set of optics reads the run itself. The
  // fourth is open to anybody and costs nothing but noise — it gets the
  // same answer and gets it loudly, which is what closes the quiet way
  // through the next scene.
  {
    id: "lm-trail",
    text:
      "Pell went up at the gallery end, where the consignment lockers " +
      "give onto the scaffold ladders, and after that the market stops " +
      "agreeing with itself. The locker clerk says she went up at nine. " +
      "The tea stall says half past and empty-handed. Above the fourth " +
      "level the lamps are out in a run of six, which nobody has " +
      "mentioned and everybody has noticed.",
    location: "vertical-market:gallery",
    comments: [
      {
        companionId: "vesper",
        text:
          "\"Six lamps in a row don't fail,\" Kade says. \"Six lamps in " +
          "a row get *turned off*.\"",
      },
      {
        companionId: "sill",
        text:
          "\"Two witnesses, half an hour apart, both certain.\" Sill " +
          "sounds almost happy. \"One of them is lying and the liar is " +
          "the one who volunteered a time.\"",
      },
    ],
    choices: [
      {
        id: "lm-trace",
        label: "Pull the case's consignment tag off the market mesh.",
        target: "lm-lead",
        requirements: [{ type: "stat", stat: "tech", value: 7 }],
        ifUnavailable: "disabled",
        effects: [{ type: "set-flag", key: "last-mile-lead", value: "traced" }],
      },
      {
        id: "lm-press",
        label: "Go back to the tea stall and take the half past apart.",
        target: "lm-lead",
        requirements: [{ type: "stat", stat: "cool", value: 7 }],
        ifUnavailable: "disabled",
        effects: [
          { type: "set-flag", key: "last-mile-lead", value: "pressed" },
        ],
      },
      {
        // Either set of eyes reads the same thing off the dark run.
        // Only one enhancement can sit in the eye slot, so these two
        // are exclusive by construction rather than by gating.
        id: "lm-optics-suite",
        label: "Take the dark run on low-light. Read what used it.",
        target: "lm-route",
        requirements: [{ type: "enhancement", itemId: "cyb-optic-suite" }],
        effects: [
          { type: "set-flag", key: "last-mile-lead", value: "seen" },
          { type: "set-flag", key: "last-mile-route", value: true },
        ],
      },
      {
        id: "lm-optics-warden",
        label: "Sweep the dark run on the Warden band. Read what used it.",
        target: "lm-route",
        requirements: [{ type: "enhancement", itemId: "cyb-warden-optics" }],
        effects: [
          { type: "set-flag", key: "last-mile-lead", value: "seen" },
          { type: "set-flag", key: "last-mile-route", value: true },
        ],
      },
      {
        id: "lm-ask-around",
        label: "Work the aisles out loud. Somebody up here saw something.",
        target: "lm-lead",
        effects: [{ type: "set-flag", key: "last-mile-lead", value: "asked" }],
      },
      {
        id: "lm-trail-leave",
        label: "Leave the trail where it is for now.",
        effects: [{ type: "end" }],
      },
    ],
  },
  {
    id: "lm-route",
    text:
      "The dark run is not dark. Under the low band the whole ladder " +
      "flares with two nights of handprints, and behind it — bolted flat " +
      "to the light well's wall, painted the colour of the wall — a " +
      "cycler maintenance catwalk runs the length of the sixth level and " +
      "comes out above the scaffold court from behind. Nobody has swept " +
      "it in years. Somebody small has been using it every night since " +
      "Tuesday.",
    location: "vertical-market:gallery",
    choices: [
      {
        id: "lm-route-on",
        label: "Follow the handprints up.",
        target: "lm-lead",
      },
      {
        id: "lm-route-leave",
        label: "Log the catwalk and come back for it.",
        effects: [{ type: "end" }],
      },
    ],
  },
  {
    id: "lm-lead",
    text:
      "It all lands in the same place. Pell got as far as the sixth " +
      "level, found the Rung standing across the only way down, and did " +
      "the one thing nobody expects a courier to do: she went further " +
      "up. She is in a dead pitch behind the scaffold court, three days " +
      "without water, with a sealed case and a crew sitting on the stair " +
      "waiting for the arithmetic to finish.",
    location: "vertical-market:gallery",
    choices: [
      {
        id: "lm-lead-go",
        label: "Climb to the sixth level.",
        target: "lm-scaffold",
        effects: [
          { type: "set-flag", key: LAST_MILE_STAGE_FLAG, value: "found" },
        ],
      },
      {
        id: "lm-lead-hold",
        label: "Six levels up against a crew. Not tonight.",
        effects: [
          { type: "set-flag", key: LAST_MILE_STAGE_FLAG, value: "found" },
          { type: "end" },
        ],
      },
    ],
  },

  // --- Scene two: the confrontation
  //
  // Four ways past the Rung and no way that is only available to a
  // build: talk (Cool), buy (credits), come round behind them (the
  // catwalk the optics found), or go through them. All four land on the
  // same beat and record which one it was.
  {
    id: "lm-scaffold",
    text:
      "The sixth level is scaffold row: plank walkways on pipe couplers, " +
      "the light well dropping away black on one side and the tenement " +
      "wall on the other. The Rung have the stair-head — three of them " +
      "and a drone on a tether, arranged like people who have been paid " +
      "by the day and are on day three. Behind them, past a dead pitch " +
      "with its awning still up, something small shifts and goes very " +
      "still.",
    location: "vertical-market:scaffold-row",
    comments: [
      {
        companionId: "vesper",
        text:
          "\"Day three,\" Kade murmurs. \"They're bored, they're not " +
          "paid enough, and that drone's on a *string*. I've seen worse " +
          "odds on a Tuesday.\"",
      },
      {
        companionId: "sill",
        text:
          "\"Somebody is paying three people a day rate to stand on a " +
          "walkway,\" Sill says. \"That is an invoice. Invoices have " +
          "names on them.\"",
      },
    ],
    choices: [
      {
        id: "lm-talk",
        label: "Walk up talking. Tell them whose run they're standing on.",
        target: "lm-pell",
        requirements: [{ type: "stat", stat: "cool", value: 8 }],
        ifUnavailable: "disabled",
        effects: [
          { type: "set-flag", key: "last-mile-crew", value: "talked" },
          { type: "set-flag", key: LAST_MILE_STAGE_FLAG, value: "recovered" },
        ],
        reactions: ["deception"],
      },
      {
        id: "lm-pay",
        label: "\"Day three. I'll buy out day four.\" (80 cr)",
        target: "lm-pell",
        requirements: [{ type: "credits", value: 80 }],
        ifUnavailable: "disabled",
        effects: [
          { type: "credits", amount: -80 },
          { type: "set-flag", key: "last-mile-crew", value: "paid" },
          { type: "set-flag", key: LAST_MILE_STAGE_FLAG, value: "recovered" },
        ],
      },
      {
        id: "lm-slip",
        label: "Take the maintenance catwalk and come out behind them.",
        target: "lm-pell",
        requirements: [
          { type: "flag-equals", key: "last-mile-route", value: true },
        ],
        effects: [
          { type: "set-flag", key: "last-mile-crew", value: "slipped" },
          { type: "set-flag", key: LAST_MILE_STAGE_FLAG, value: "recovered" },
        ],
      },
      {
        id: "lm-fight",
        label: "Take the stair-head off them.",
        target: "lm-pell",
        effects: [
          { type: "start-combat", encounterId: "enc-market-scaffold" },
          { type: "set-flag", key: "last-mile-crew", value: "fought" },
          { type: "set-flag", key: LAST_MILE_STAGE_FLAG, value: "recovered" },
        ],
        reactions: ["defiance"],
      },
      {
        id: "lm-scaffold-leave",
        label: "Go back down. She has lasted three days; she has tonight.",
        effects: [{ type: "end" }],
      },
    ],
  },
  {
    id: "lm-pell",
    speaker: "Pell",
    text:
      "The dead pitch is two planks and an awning, and the courier under " +
      "it is nineteen at the outside, slicker torn off one shoulder, " +
      "clip line still on the harness. The case is between her boots " +
      "with the seal broken. \"I opened it Tuesday,\" she says, before " +
      "you have asked anything at all. \"Second day up here. I thought " +
      "if I knew what it was, I'd know why they were waiting.\" She " +
      "wipes her mouth. \"I know why they're waiting.\"",
    location: "vertical-market:scaffold-row",
    comments: [
      {
        companionId: "vesper",
        text:
          "Kade is already unhooking her own line for the drop. \"Water " +
          "first,\" she says. \"Story after. I've done three days.\"",
      },
      {
        companionId: "sill",
        text:
          "\"Do not touch the seal further,\" Sill says gently, kneeling " +
          "to her level. \"Not because of the case. Because of you — you " +
          "are the witness now, and witnesses keep better than paper.\"",
      },
    ],
    choices: [
      {
        id: "lm-pell-look",
        label: "\"Show me.\"",
        target: "lm-case",
      },
      {
        id: "lm-pell-down",
        label: "Get her down six levels first. The case can wait a night.",
        effects: [{ type: "end" }],
      },
    ],
  },

  // --- Scene three: the resolution
  //
  // The fork, and the only place in the chain that pays. Both roads are
  // gated on the stage being "recovered" and both move it off, so
  // exactly one terminal can ever be written, once.
  {
    id: "lm-case",
    speaker: "Pell",
    text:
      "It is not money and it is not a weapon. It is a survey: Auric's " +
      "clearance assessment for the whole light well, six levels of " +
      "pitches ranked by how little trouble emptying them would be, with " +
      "a hand-written column at the back for who would have to be paid " +
      "and who could simply be moved. The north row is near the top. " +
      "\"Forty minutes,\" Pell says. \"That's all the run was. Somebody " +
      "was buying it so nobody up here would ever see it.\"",
    location: "vertical-market:scaffold-row",
    comments: [
      {
        companionId: "vesper",
        text:
          "\"That's not a market being sold,\" Kade says. \"That's a " +
          "market being *scheduled*. I've seen the Quays version. It " +
          "came with tide charts.\"",
      },
      {
        companionId: "sill",
        text:
          "\"A clearance survey is an internal document,\" Sill says, " +
          "very quietly. \"It does not exist until somebody authorises " +
          "it. Which means somewhere there is a key on this, and a name " +
          "under the key.\"",
      },
    ],
    choices: [
      {
        id: "lm-deliver",
        label:
          "Seal it and walk the last mile. The run was the job. (Finish it)",
        target: "lm-delivered",
        requirements: [
          {
            type: "flag-equals",
            key: LAST_MILE_STAGE_FLAG,
            value: "recovered",
          },
        ],
        effects: [
          { type: "set-flag", key: LAST_MILE_STAGE_FLAG, value: "delivered" },
          { type: "set-flag", key: "last-mile-delivered", value: true },
          { type: "credits", amount: 200 },
          { type: "add-item", itemId: "out-highline-rig" },
        ],
        // Straight off the table above: the outcome declared what it
        // was worth long before there was a scale to put it on.
        standing: scaleStanding(
          LAST_MILE_OUTCOMES.delivered.standing,
          SIDE_CHAIN_STEP,
        ),
        reactions: ["procedure"],
      },
      {
        id: "lm-expose",
        label: "Take it to the boards. Let six levels read their own names.",
        target: "lm-exposed",
        requirements: [
          {
            type: "flag-equals",
            key: LAST_MILE_STAGE_FLAG,
            value: "recovered",
          },
        ],
        effects: [
          { type: "set-flag", key: LAST_MILE_STAGE_FLAG, value: "exposed" },
          { type: "set-flag", key: "last-mile-exposed", value: true },
          { type: "credits", amount: 60 },
          { type: "add-item", itemId: "out-highline-rig" },
          { type: "add-item", itemId: "msc-assessment-roll" },
        ],
        standing: scaleStanding(
          LAST_MILE_OUTCOMES.exposed.standing,
          SIDE_CHAIN_STEP,
        ),
        reactions: ["record", "defiance"],
      },
      {
        id: "lm-case-wait",
        label: "Close it. Sleep on it. It has kept three days.",
        effects: [{ type: "end" }],
      },
    ],
  },
  {
    id: "lm-delivered",
    speaker: "Pell",
    text:
      "You re-seal it with market wax and walk the last forty minutes of " +
      "somebody else's run, and at the foot of the Cinderway a woman in " +
      "a good coat takes it without looking at you and pays the whole " +
      "fee in chits, because the fee was never the expensive part. Pell " +
      "watches the coat go. Then she unclips the harness over her head " +
      "and pushes it into your hands. \"I'm not going back up,\" she " +
      "says. \"It knows the way. You take it.\"",
    location: "vertical-market:cinderway-stair",
    choices: [
      {
        id: "lm-delivered-done",
        label: "Take the rig. Watch her walk down into Cinder Row.",
        effects: [{ type: "end" }],
      },
    ],
  },
  {
    id: "lm-exposed",
    speaker: "Pell",
    text:
      "The survey goes up on the north row's board at the busiest hour " +
      "of the night, every page, and Quill reads four lines of it and " +
      "stops counting anybody's free minute. It takes eleven minutes for " +
      "the shouting to start and about forty for it to become something " +
      "with a shape. Pell holds a ghost-copy back and presses it on you " +
      "with both hands. \"You'll need it after,\" she says, and then " +
      "gives you the harness too, because she has nothing else and will " +
      "not be told no.",
    location: "vertical-market:north-row",
    choices: [
      {
        id: "lm-exposed-done",
        label: "Get off the boards before the shape finishes forming.",
        effects: [{ type: "end" }],
      },
    ],
  },

  // --- Afterwards
  //
  // Marrow's account, once. Reached only from `lm-offer`'s terminal
  // routes, so replaying it costs and pays nothing.
  {
    id: "lm-settled-paid",
    speaker: "Marrow",
    text:
      "\"Square.\" The bowl in front of him is a fresh one, and just as " +
      "untouched. \"My client is pleased, which for that client is a " +
      "sound rather than a word. You finished a run somebody else " +
      "started, up six levels, and you did not tell anybody what was in " +
      "it.\" The optics click. \"That last part is the part I sold. I " +
      "want you to know I know what I sold.\"",
    location: "vertical-market:noodle-counter",
    choices: [
      {
        id: "lm-settled-paid-done",
        label: "Leave him with the bowl and the arithmetic.",
        effects: [{ type: "end" }],
      },
    ],
  },
  {
    id: "lm-settled-burned",
    speaker: "Marrow",
    expression: "grim",
    text:
      "\"I have been quiet because I am down a client and up an " +
      "education.\" No heat in it, which is somehow worse. \"You cost " +
      "me a name I had spent two years being useful to. You also put a " +
      "clearance survey on a public board in front of four hundred " +
      "people, which means Auric now has to do the expensive version of " +
      "everything.\" A pause. \"I am not going to pretend that was the " +
      "wrong call. I am going to charge you more.\"",
    location: "vertical-market:noodle-counter",
    choices: [
      {
        id: "lm-settled-burned-done",
        label: "\"Fair.\" Leave him to his new rates.",
        effects: [{ type: "end" }],
      },
    ],
  },
];
