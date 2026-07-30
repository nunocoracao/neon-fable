import type { StoryArc } from "../../narrative/types";

/**
 * The Vertical Market: a district arc rather than a chapter. It carries
 * the two ways through the door (the hub's market gate up, the
 * Cinderway stair back down), the two fixtures a player can talk to on
 * the boards, and the consignment locker in the north gallery.
 *
 * Deliberately self-contained colour. Quill and Marrow both have deeper
 * business waiting on later work — the broker's board of pitches, the
 * fixer's contracts — so nothing here sets a story flag any act reads,
 * gates on one, or moves the player anywhere but between the two maps.
 * What it does leave behind is `market-known`, which a later arc can
 * use to tell a first visit from a return.
 */
export const marketArc: StoryArc = {
  id: "vertical-market",
  title: "The Vertical Market",
  entryNodeId: "vm-gate",
  nodes: [
    {
      id: "vm-gate",
      text:
        "Past the wet-market crates, a gantry stair bolted to the tenement " +
        "wall climbs into a light well the towers forgot to close. Six " +
        "levels of scaffold hang in it, each one strung with lamps in wire " +
        "cages, and the noise coming down is the noise of several hundred " +
        "people trading at once. Somebody has stencilled VERTICAL MARKET on " +
        "the bottom tread. Somebody else has stencilled PRICES FINAL under " +
        "it.",
      location: "cinder-row:market-gate",
      choices: [
        {
          id: "climb",
          label: "Climb into the market.",
          // Travel carries the scene; the target opens as the arrival
          // beat once the new map is up.
          target: "vm-arrival",
          effects: [
            { type: "travel", mapId: "vertical-market" },
            { type: "set-flag", key: "market-known", value: true },
          ],
        },
        {
          id: "not-tonight",
          label: "Not tonight. Let the noise have it.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      // The arrival beat, and the arc's junction: everything a player
      // can walk up to on the boards is also offered here, so the whole
      // district reads as one graph from the gate down.
      id: "vm-arrival",
      text:
        "You come off the last tread into the noise. The market runs two " +
        "stall rows deep for as far as the light well goes, awnings almost " +
        "touching overhead, and where the aisles cross there is a court of " +
        "glow tile lit like a stage nobody booked. Somebody is shouting a " +
        "price. Somebody else is shouting a better one. Under it all, the " +
        "boards flex very slightly with the weight of everyone standing on " +
        "them.",
      location: "vertical-market:court",
      choices: [
        {
          id: "to-broker",
          label: "Work the north row — somebody there is keeping the ledger.",
          target: "vm-broker",
        },
        {
          id: "to-fixer",
          label: "Take a stool at the noodle counter.",
          target: "vm-fixer",
        },
        {
          id: "to-locker",
          label: "Look at the consignment locker bolted under the gallery.",
          target: "vm-stash",
        },
        {
          id: "to-stair",
          label: "Look back down the Cinderway stair.",
          target: "vm-stair",
        },
        {
          id: "wander",
          label: "Just walk the aisles awhile.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "vm-stair",
      text:
        "The Cinderway stair drops out of the market's south deck in one " +
        "long switchback, handrail worn to bare steel by everyone who ever " +
        "carried something heavy down it. From the top tread the whole " +
        "bazaar reads at once: two stall rows facing off across a court of " +
        "lamplight, awnings the colour of old hazard tape, and the crowd " +
        "moving through it like water finding a drain.",
      location: "vertical-market:cinderway-stair",
      choices: [
        {
          id: "descend",
          label: "Take the stair down to Cinder Row.",
          effects: [{ type: "travel", mapId: "cinder-plaza" }],
        },
        {
          id: "stay",
          label: "Stay up here awhile. The market is still trading.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "vm-broker",
      speaker: "Quill",
      text:
        "The broker holds the north row from a folding stool, ledger slate " +
        "across her knees, locs pinned back with what looks like a stall " +
        "bracket. She does not look up. \"Pitch, storage, or standing " +
        "about? Standing about is free for the first minute and I've been " +
        "counting since you got off the stair.\"",
      location: "vertical-market:north-row",
      choices: [
        {
          id: "pitch",
          label: "\"What does a pitch on these boards cost?\"",
          target: "vm-broker-rates",
        },
        {
          id: "who-runs-it",
          label: "\"Who actually runs this place?\"",
          target: "vm-broker-runs",
        },
        {
          id: "street-read",
          label: "Read the ledger upside-down while she talks.",
          target: "vm-broker-ledger",
          requirements: [{ type: "stat", stat: "intelligence", value: 7 }],
          ifUnavailable: "disabled",
        },
        {
          id: "leave-broker",
          label: "Let her get back to counting.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "vm-broker-rates",
      speaker: "Quill",
      expression: "smile",
      text:
        "\"Depends where you want to be seen. Court side, under the lamps — " +
        "everyone walks past you twice, and you'll pay for the privilege in " +
        "something better than credits. Back of the gallery, nobody sees " +
        "you and that's the point, so it costs more.\" She finally looks " +
        "up. \"There's a waiting list either way, and I'm the list.\"",
      location: "vertical-market:north-row",
      choices: [
        {
          id: "back-to-quill",
          label: "\"Noted. Something else —\"",
          target: "vm-broker",
        },
        {
          id: "rates-leave",
          label: "Leave her the last word. She'd take it anyway.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "vm-broker-runs",
      speaker: "Quill",
      text:
        "\"Nobody runs a market. A market is what's left when everyone " +
        "stops agreeing.\" She taps the slate with a stylus, twice, like " +
        "punctuation. \"Auric owns the shaft. The scaffold's ours because " +
        "we built it and they'd have to send people up here to take it, " +
        "and the last time they sent people up here they went home lighter " +
        "than they came. So: nobody runs it. Ask again in a year.\"",
      location: "vertical-market:north-row",
      choices: [
        {
          id: "runs-back",
          label: "\"Fair. One more thing —\"",
          target: "vm-broker",
        },
        {
          id: "runs-leave",
          label: "Leave it there.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "vm-broker-ledger",
      speaker: "Quill",
      expression: "smile",
      text:
        "Three columns: pitch, tenant, and a third she keeps in a shorthand " +
        "of her own — a hook, a slash, a circle. The circles cluster on the " +
        "court-side rows. Quill lets you get four lines in before she tips " +
        "the slate flat against her chest, entirely unbothered. \"You read " +
        "well. That's a whole trade up here, and it pays badly. Ask me " +
        "straight next time and I might even answer.\"",
      location: "vertical-market:north-row",
      choices: [
        {
          id: "ledger-back",
          label: "Ask her something straight, then.",
          target: "vm-broker",
        },
        {
          id: "ledger-leave",
          label: "Take the compliment and go.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "vm-fixer",
      speaker: "Marrow",
      text:
        "The noodle counter's end stool is occupied the way a desk is " +
        "occupied. Silver-slicked, mantle open, circuitry threading his " +
        "cheek like a watermark — and eyes that shutter-click onto you a " +
        "half-second before he turns his head. A bowl sits in front of him, " +
        "untouched and still steaming. \"Sit or don't,\" he says. \"The " +
        "broth's the best thing on six levels and I'm the second.\"",
      location: "vertical-market:noodle-counter",
      choices: [
        {
          id: "what-do-you-do",
          label: "\"And what is it you do up here, exactly?\"",
          target: "vm-fixer-trade",
        },
        {
          id: "the-bowl",
          label: "\"Your soup's going cold.\"",
          target: "vm-fixer-bowl",
        },
        {
          id: "cool-read",
          label: "Say nothing. Sit down. Wait him out.",
          target: "vm-fixer-wait",
          requirements: [{ type: "stat", stat: "cool", value: 7 }],
          ifUnavailable: "disabled",
        },
        {
          id: "leave-fixer",
          label: "Leave him to his second-best opinion of himself.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "vm-fixer-trade",
      speaker: "Marrow",
      text:
        "\"Introductions.\" He turns a chopstick over once, like a card. " +
        "\"Everything in this market is somebody needing a thing and " +
        "somebody else standing four metres away with it, and the whole " +
        "reason the two of them will never meet is that neither will say so " +
        "out loud. I say so out loud. For a fee.\" The optics click. \"You " +
        "don't need anything yet. You will.\"",
      location: "vertical-market:noodle-counter",
      choices: [
        {
          id: "trade-back",
          label: "\"Let's back up.\"",
          target: "vm-fixer",
        },
        {
          id: "trade-leave",
          label: "\"I'll know where to find you.\"",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "vm-fixer-bowl",
      speaker: "Marrow",
      expression: "smile",
      text:
        "\"It is.\" He does not look at it. \"I buy the stool, not the " +
        "soup. Chen needs the counter busy or the crowd walks past, the " +
        "crowd walking past is how I hear things, and a man sitting at an " +
        "empty counter is a man nobody talks near.\" A pause. \"Also I " +
        "cannot eat it. The jaw's rebuilt. But we don't tell Chen that.\"",
      location: "vertical-market:noodle-counter",
      choices: [
        {
          id: "bowl-back",
          label: "\"Right. Different question —\"",
          target: "vm-fixer",
        },
        {
          id: "bowl-leave",
          label: "Leave the man his prop.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "vm-fixer-wait",
      speaker: "Marrow",
      text:
        "You take the stool and say nothing at all. Marrow lets the silence " +
        "run — through two orders, a shouted price down the aisle, and a " +
        "lamp overhead deciding twice whether it wants to keep burning. " +
        "Then he smiles, and it is the first thing about him that isn't " +
        "arranged. \"Nobody does that. Everybody up here has a pitch and " +
        "they all lead with it.\" He nudges the untouched bowl an inch " +
        "toward you. \"Go on. I'm not going to eat it.\"",
      location: "vertical-market:noodle-counter",
      choices: [
        {
          id: "wait-eat",
          label: "Take the bowl. It really is the best thing on six levels.",
          target: "vm-fixer",
        },
        {
          id: "wait-leave",
          label: "Stand up and walk back into the crowd. Leave it perfect.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "vm-stash",
      text:
        "A consignment locker is bolted under the gallery boards where the " +
        "scaffold meets the wall — market storage, rented by the week. This " +
        "one's tag expired long enough ago that the ink has gone the colour " +
        "of the rust around it, and somebody has already had a serious, " +
        "unsuccessful go at the hasp.",
      location: "vertical-market:gallery",
      choices: [
        {
          id: "force",
          label: "Put a shoulder into it and finish what somebody started.",
          target: "vm-stash-open",
          requirements: [{ type: "stat", stat: "body", value: 7 }],
          ifUnavailable: "disabled",
          effects: [
            { type: "add-item", itemId: "con-trauma-patch" },
            { type: "credits", amount: 25 },
            { type: "set-flag", key: "market-locker", value: "forced" },
          ],
        },
        {
          id: "pick",
          label: "Read the hasp. Old mechanism — talk it open.",
          target: "vm-stash-open",
          requirements: [{ type: "stat", stat: "tech", value: 7 }],
          ifUnavailable: "disabled",
          effects: [
            { type: "add-item", itemId: "con-field-kit" },
            { type: "credits", amount: 25 },
            { type: "set-flag", key: "market-locker", value: "picked" },
          ],
        },
        {
          id: "leave-locker",
          label: "Leave it. Somebody up here is still paying for that week.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "vm-stash-open",
      text:
        "The hasp gives with a noise the aisle swallows whole. Inside: a " +
        "consignment nobody came back for — a trauma kit gone slightly " +
        "yellow at the seals, a hand of loose credit chits, and a child's " +
        "drawing of the market done in four colours, folded into eighths. " +
        "You leave the drawing where it is and close the door on it.",
      location: "vertical-market:gallery",
      choices: [
        {
          id: "locker-done",
          label: "Push the door shut and get back in the crowd.",
          effects: [{ type: "end" }],
        },
      ],
    },
  ],
};
