import type { StoryArc } from "../../narrative/types";

/**
 * The street's answers.
 *
 * Almost every node here belongs to somebody a world condition put on a
 * map (see SCENE_REACTIONS in ../world.ts): the notice-server at the
 * head of a shuttered stall row, the watch Voss posts once the Row is
 * theirs, the clerk holding a charter that did not exist last week. The
 * exception is the plaza's public terminal, which is bolted to the wall
 * and therefore always there — same doctrine, permanent fixture.
 *
 * They are the city talking about itself, so none of them writes a
 * flag, moves a standing, starts a fight, or opens a door. A player who
 * never speaks to one of these people misses nothing but the texture —
 * which is the point: the change is legible from the pavement, and the
 * conversation only says out loud what the street already showed.
 *
 * Each scene therefore ends where it began. A choice whose effects are
 * a bare end marker closes the box silently, which is the right shape
 * for a exchange nobody needed to have.
 */
export const streetsArc: StoryArc = {
  id: "streets",
  title: "What the Row Is Saying",
  // This arc is a bundle of doorways, not a thread: every scene here
  // is opened directly by the interactable a reaction spawned, and none
  // of them leads to another. The first stands in as the nominal entry
  // and the rest are declared beside it, so reachability validates
  // against how the world actually opens them (see arcEntryNodeIds).
  // world.test.ts fails if a spawn ever opens a node not on this list.
  entryNodeId: "st-picket",
  entryNodeIds: [
    "st-plaza-board",
    "st-syndicate-watch",
    "st-court-runner",
    "st-listener",
    "st-crier",
    "st-market-runner",
    "st-market-overflow",
    "st-spire-checkpoint",
    "st-warrant-post",
    "st-steps-clerk",
    "st-steps-watch",
  ],
  nodes: [
    {
      // The plaza's public terminal (see cinder-plaza in ../maps.ts).
      // A fixture, not a hook: it is the only interactable on the hub
      // that belongs to nobody's quest, and it stays exactly that — a
      // screen you can read on your way past. The Row's actual news
      // runs on the district's own tickers (src/world/news.ts).
      id: "st-plaza-board",
      text:
        "The public terminal has been kicked, tagged, and repaired often " +
        "enough that the repairs are the oldest part of it. Civic " +
        "notices scroll past a cracked corner: tram loop running to " +
        "holiday timings, storm drain works, a lost-persons list that " +
        "does not get shorter. Underneath, in the free-posting band, the " +
        "Row talks to itself in ninety characters at a time.",
      location: "cinder-row:plaza",
      choices: [
        {
          id: "read-postings",
          label: "Read the free-posting band.",
          target: "st-plaza-board-postings",
        },
        {
          id: "leave-board",
          label: "Let the queue behind you have it.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "st-plaza-board-postings",
      text:
        "Room going, dry, no chrome. Rigger wants a second pair of hands " +
        "and won't say for what. Somebody looking for a grey courier " +
        "slicker, distinctive, sentimental value. Three separate people " +
        "advertising the same tram pass. And, pinned to the top by " +
        "whoever pays to pin things: a reminder that the Meridian Sprawl " +
        "does not recognise unlicensed work, followed by four hundred " +
        "lines of unlicensed work.",
      location: "cinder-row:plaza",
      choices: [
        {
          id: "board-back",
          label: "Scroll back up.",
          target: "st-plaza-board",
        },
        {
          id: "board-done",
          label: "Step away from the screen.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "st-picket",
      speaker: "Combine Notice-Server",
      text:
        "She has a board, a stylus, and the flat patience of somebody " +
        "paid by the hour. Behind her, half the wet-market row is " +
        "roller-shuttered and the other half is pretending to be. " +
        "\"Trading licences, renewals, and any stall that changed hands " +
        "in the last week. You're not on my board. Keep it that way and " +
        "we'll both have a pleasant evening.\"",
      location: "cinder-row:wet-market",
      choices: [
        {
          id: "ask-why",
          label: "\"What's the inspection actually for?\"",
          target: "st-picket-why",
        },
        {
          id: "walk-past",
          label: "Walk past the board.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "st-picket-why",
      speaker: "Combine Notice-Server",
      text:
        "\"Something went missing under the Undercroft and somebody " +
        "upstairs decided the Row is where it gets sold.\" The stylus " +
        "taps twice. \"It won't be. It'll be sold two levels up by " +
        "people with an accountant. But they don't send me up there.\"",
      location: "cinder-row:wet-market",
      choices: [
        {
          id: "leave",
          label: "Leave her to her board.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "st-syndicate-watch",
      speaker: "Syndicate Watch",
      text:
        "He is leaning on the curb rail in a coat too good for the " +
        "weather, and he has been watching the plaza long enough to have " +
        "stopped pretending otherwise. \"Evening. Nothing's happening " +
        "here.\" A slow, unbothered smile. \"That's the job. Nothing " +
        "happening. You'd be amazed what it costs.\"",
      location: "cinder-row:plaza",
      choices: [
        {
          id: "nod",
          label: "Nod, and go about your evening.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "st-court-runner",
      speaker: "Steps Runner",
      text:
        "The runner is pinning a notice at eye height on a plaza post, " +
        "unhurried, in daylight, which is the whole message. \"Cistern " +
        "Court sitting, third bell, open floor. Yes, up here. Yes, on a " +
        "post.\" She steps back to check it hangs straight. \"Six months " +
        "ago I'd have been fined for the tape.\"",
      location: "cinder-row:plaza",
      choices: [
        {
          id: "read",
          label: "Read the notice through and move on.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "st-listener",
      speaker: "Rooftop Listener",
      text:
        "He has a battered handset pressed to the screen post and a coil " +
        "of splice wire over one shoulder, taping the feed straight off " +
        "the public board. \"They pull it every forty minutes,\" he says " +
        "without looking round. \"Takes them forty-one to notice. That's " +
        "a whole minute of the truth, four times an hour.\"",
      location: "cinder-row:plaza",
      choices: [
        {
          id: "listen",
          label: "Stand and listen to a minute of it.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "st-crier",
      speaker: "Regency Crier",
      text:
        "She stands in the middle of the glow ring reading continuity " +
        "off a card, in the voice people use for weather. \"—and the " +
        "Board affirms that the transition is orderly, that services are " +
        "uninterrupted, and that the Combine remains, as it has always " +
        "been, the Sprawl's steady hand.\" She turns the card over. " +
        "There is nothing on the back.",
      location: "cinder-row:plaza",
      choices: [
        {
          id: "move-on",
          label: "Let her finish to somebody else.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "st-market-runner",
      speaker: "Market Runner",
      text:
        "A kid with a chalk board and a hand-lettered placard is standing " +
        "on an empty square of decking in the north aisle, holding it " +
        "against all comers. \"This one's spoken for,\" they announce, " +
        "then see who is asking and go pink. \"Spoken for by you. The " +
        "boards said keep it warm. I've been keeping it warm since the " +
        "second bell.\"",
      location: "vertical-market:north-aisle",
      choices: [
        {
          id: "thank",
          label: "Tell them to go and get something to eat.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "st-market-overflow",
      speaker: "Displaced Stallholder",
      text:
        "His whole shop is four crates and a folding rail, and he is " +
        "selling off it as though it were a shopfront. \"Row's shut, so " +
        "the Row came upstairs. Rent's murder and the lamps are too " +
        "bright.\" He shrugs, entirely cheerful. \"Turnover's up forty " +
        "percent. Don't tell the inspectors that.\"",
      location: "vertical-market:north-aisle",
      choices: [
        {
          id: "browse",
          label: "Look over the crates and move on.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "st-spire-checkpoint",
      speaker: "Spire Security",
      text:
        "The concourse has grown a checkpoint since your last visit: a " +
        "folding scanner arch, two chairs, and an officer who does not " +
        "sit in either of them. \"Posture's standing red,\" she says. " +
        "\"Bags, chrome, and intent. I can't scan the third one, so I " +
        "look at faces instead. Try not to make mine interesting.\"",
      location: "auric-spire:concourse",
      choices: [
        {
          id: "comply",
          label: "Hold still for the arch and walk on through.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "st-warrant-post",
      speaker: "Spire Security",
      text:
        "He is fixing a retrieval notice to the registry-side glass, and " +
        "the notice has a height, a build, and a blurred concourse " +
        "still where a name should be. \"Retrieval, not arrest,\" he " +
        "says, smoothing a corner. \"There's a difference, legally. " +
        "There is no difference at all in the van.\"",
      location: "auric-spire:concourse",
      choices: [
        {
          id: "study",
          label: "Study the notice a moment longer than is wise.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "st-steps-clerk",
      speaker: "Charter Clerk",
      text:
        "A trestle desk on the pump walk, a strongbox of seals, and a " +
        "queue of three that has been a queue of three all evening. " +
        "\"Charter copies, signatures witnessed, disputes heard on the " +
        "hour,\" he recites. Then, quieter, with the pride of somebody " +
        "who never expected the sentence to exist: \"By the Steps. For " +
        "the Steps. In writing.\"",
      location: "greywater:steps",
      choices: [
        {
          id: "read-copy",
          label: "Ask to read a copy.",
          target: "st-steps-clerk-copy",
        },
        {
          id: "leave-desk",
          label: "Leave the queue to it.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "st-steps-clerk-copy",
      speaker: "Charter Clerk",
      text:
        "It is two pages, hand-set, and the second page is nothing but " +
        "names — everybody who stood in the cistern the night it was " +
        "agreed. He watches you find the line where yours would go if " +
        "you had wanted it there. \"We left room,\" he says. \"We left " +
        "quite a lot of room.\"",
      location: "greywater:steps",
      choices: [
        {
          id: "hand-back",
          label: "Hand the pages back.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "st-steps-watch",
      speaker: "Steps Watch",
      text:
        "She has a pump wrench through her belt and somebody's old " +
        "cordon plate cut down to fit, and she is walking the walk " +
        "properly — corners, water line, back again. \"No patrol's " +
        "coming down here and none's coming to move us on either,\" she " +
        "says. \"Turns out those were the same patrol. Nobody told us " +
        "that for thirty years.\"",
      location: "greywater:steps",
      choices: [
        {
          id: "let-pass",
          label: "Stand aside and let her finish the round.",
          effects: [{ type: "end" }],
        },
      ],
    },
  ],
};
