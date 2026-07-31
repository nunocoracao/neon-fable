import type { StoryArc } from "../../narrative/types";
import { lastMileNodes } from "./lastMile";

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
 *
 * The district also hands over the game's second companion. Deacon Sill
 * keeps a rented pitch under the north gallery and takes statements
 * nobody has asked him for, and the fork in his chain — give him
 * something for the file, or make him buy it — is what he remembers
 * about the player: recorded as `sill-joined` ("witnessed" | "priced")
 * and as the loyalty his party record opens on. Only one companion
 * walks out at a time, so taking him on benches whoever was already
 * along (see recruitCompanion) — the scene says so rather than letting
 * it happen quietly.
 *
 * Marrow's contracts have since arrived, and they are the one thing in
 * the district that writes story state: "The Last Mile" hangs off his
 * stool at `lm-offer`. Its nodes live in ./lastMile.ts and are spread
 * into this arc rather than registered as an arc of their own, because
 * a choice target only ever resolves inside one arc and the chain has
 * to be opened by a choice on `vm-fixer`. Everything the district said
 * about itself above still holds for the district's own nodes; the
 * chain's flag surface, gating, and rewards are documented where they
 * are authored.
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
          id: "to-auditor",
          label: "A man under the gallery is taking statements at a card table.",
          target: "vm-auditor",
        },
        {
          id: "to-bench",
          label: "Somebody at the east scaffold is working on a gun.",
          target: "vm-bench",
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
          // The boards' bonded counter. Quill books everything, which is
          // why it costs more across the counter and pays more into your
          // hand than anything on the Row — the spread is a property of
          // the counter, not of the goods (see src/data/economy.ts).
          id: "quill-trade",
          label: "\"Storage. And whatever's booked in against it.\"",
          target: "vm-broker",
          effects: [
            { type: "open-vendor", vendorId: "vm-broker-counter" },
            { type: "set-flag", key: "ledger-known", value: true },
          ],
        },
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
          // The one door into "The Last Mile" (./lastMile.ts). Ungated:
          // `lm-offer` reads the chain's stage flag and routes a first
          // visit, a resumed run, and a finished one to different beats,
          // so Marrow never has to be asked twice for the same thing.
          id: "the-job",
          label: "\"You said I'd need something. Try me.\"",
          target: "lm-offer",
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
    // --- Deacon Sill: the pitch, the fork, and the man who comes with you
    //
    // A self-contained recruitment chain, built like Kade's on the
    // Quays: two roads to the same offer, and what the fork decides is
    // what he thinks of the player on the way out — recorded as
    // `sill-joined` and as an opening loyalty figure on the party
    // member itself.
    {
      id: "vm-auditor",
      speaker: "Deacon Sill",
      text:
        "Under the gallery, between a bootleg tea stall and the " +
        "consignment lockers, somebody has rented a pitch and furnished " +
        "it with a card table, a folding stool, and a hand-lettered sign " +
        "reading STATEMENTS TAKEN — NO FEE. The man behind it wears a " +
        "tower suit gone shiny at the elbows and an auditor's visor " +
        "pushed up on his forehead, and he is writing when you stop, and " +
        "keeps writing. \"Name optional,\" he says. \"Date isn't.\"",
      location: "vertical-market:gallery",
      comments: [
        {
          companionId: "vesper",
          text:
            "\"Auric cut,\" she says, of the suit. \"Nobody wears that " +
            "up here unless they can't afford anything else.\"",
        },
      ],
      choices: [
        {
          id: "sill-what",
          label: "\"Statements about what?\"",
          target: "vm-auditor-case",
        },
        {
          id: "sill-form",
          label: "Read the form upside down. You have filed that form.",
          target: "vm-auditor-form",
          requirements: [{ type: "background", tag: "corp" }],
        },
        {
          id: "sill-give",
          label: "Give him something worth writing down. Sign it.",
          target: "vm-auditor-witness",
          effects: [{ type: "set-flag", key: "sill-met", value: "witnessed" }],
          // Putting your name under a thing is the tag itself.
          reactions: ["record"],
        },
        {
          id: "sill-price",
          label: "\"Everyone in this market sells something. What's yours?\"",
          target: "vm-auditor-price",
          effects: [{ type: "set-flag", key: "sill-met", value: "priced" }],
        },
        {
          id: "sill-leave",
          label: "Leave him to his queue of nobody.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "vm-auditor-case",
      speaker: "Deacon Sill",
      text:
        "\"The cyclers. Nine years I certified them, and the last year I " +
        "wrote a variance report saying the wind-down schedule would kill " +
        "the levels under Four by arithmetic rather than by accident.\" He " +
        "sets the stylus down, squarely. \"Auric struck me off the " +
        "register at four in the morning by notice slid under a door. Not " +
        "a hearing. A notice.\" The visor catches the lamp. \"So I take " +
        "statements. A case is only ever a stack of small true things, " +
        "and I have nothing else to do with my evenings.\"",
      location: "vertical-market:gallery",
      choices: [
        {
          id: "case-back",
          label: "\"All right. Then —\"",
          target: "vm-auditor",
        },
        {
          id: "case-leave",
          label: "Leave the stack where it is.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "vm-auditor-form",
      speaker: "Deacon Sill",
      expression: "smile",
      text:
        "It is a Schedule Nine variance annexe, and you have filled in " +
        "enough of them to know he has been keeping the box for the " +
        "authorising key open at the bottom instead of closing it out — " +
        "which is not sloppiness. It is a man leaving room for a name he " +
        "has not been able to prove yet. Sill watches you read it and " +
        "something goes out of his shoulders. \"Well,\" he says. \"That's " +
        "the first time in two years anybody's known what they were " +
        "looking at.\"",
      location: "vertical-market:gallery",
      choices: [
        {
          id: "form-back",
          label: "Hand the slate back the right way up.",
          target: "vm-auditor",
        },
        {
          id: "form-leave",
          label: "Say nothing about the empty box. Go.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "vm-auditor-witness",
      speaker: "Deacon Sill",
      text:
        "He takes it down in a hand like printing, reads it back to you " +
        "word for word, and waits while you put your name under it. Then " +
        "he does something the market has clearly never seen him do: he " +
        "closes the slate. \"That is the ninety-first,\" he says. \"Ninety " +
        "of them are people telling me what happened to their sister. " +
        "Yours is the first from somebody who was in the room where it " +
        "was decided.\" He looks up. \"I have been sitting at this table " +
        "for two years waiting for the file to grow legs.\"",
      location: "vertical-market:gallery",
      choices: [
        {
          id: "witness-on",
          label: "\"So stop sitting at it.\"",
          target: "vm-auditor-join",
        },
      ],
    },
    {
      id: "vm-auditor-price",
      speaker: "Deacon Sill",
      expression: "grim",
      text:
        "\"Nothing. That's rather the point of the sign.\" He says it " +
        "without heat, the way a man states a figure he has already lost " +
        "an argument about. Then the visor comes down an inch and he " +
        "looks at you properly — the walk, the wear on your gear, what " +
        "you are plainly in the market to do. \"But you are not asking " +
        "what I sell. You are asking what I pay.\" A long pause. \"Third " +
        "of anything the case recovers. Which is currently a third of " +
        "nothing, and I would like it noted that you asked anyway.\"",
      location: "vertical-market:gallery",
      choices: [
        {
          id: "price-take",
          label: "\"A third. In writing.\"",
          target: "vm-auditor-terms",
        },
      ],
    },
    {
      id: "vm-auditor-join",
      speaker: "Deacon Sill",
      text:
        "He stands, and folds the table, and it takes him three tries " +
        "because the hinge has rusted into the shape of two years. \"I " +
        "can read any civic system in this city and most of the private " +
        "ones,\" he says. \"I can tell you which signature on a door " +
        "order is real. I cannot fight, and I will not pretend to be " +
        "surprised when that becomes relevant.\" The sign goes under his " +
        "arm, face in. \"Where are we going?\"",
      location: "vertical-market:gallery",
      comments: [
        {
          companionId: "vesper",
          text:
            "\"He's a clipboard, and clipboards are how they took the " +
            "Quays.\" She does not lower her voice. \"Bring him. I want " +
            "to watch.\"",
        },
      ],
      choices: [
        {
          id: "join-yes",
          label: "\"Somewhere they'll want to see the paperwork.\"",
          target: "vm-auditor-aboard",
          effects: [
            { type: "recruit-companion", companionId: "sill" },
            // He was given the thing he had given up asking for.
            { type: "companion-loyalty", companionId: "sill", amount: 2 },
            { type: "set-flag", key: "sill-joined", value: "witnessed" },
          ],
        },
        {
          id: "join-no",
          label: "\"Nowhere you'd survive. Keep the table.\"",
          effects: [
            { type: "set-flag", key: "sill-declined", value: true },
            { type: "end" },
          ],
        },
      ],
    },
    {
      id: "vm-auditor-terms",
      speaker: "Deacon Sill",
      text:
        "He writes the terms out twice, signs both, and hands you one — " +
        "and the copy in your hand is, you notice, the one with the date " +
        "on it. \"There. You are retained.\" He folds the table under his " +
        "arm with the sign face in. \"Understand what you have just " +
        "bought, though. I do not need a bodyguard. I need somebody who " +
        "can get me into rooms, and who will still be standing in them " +
        "when I ask the question I came to ask.\"",
      location: "vertical-market:gallery",
      comments: [
        {
          companionId: "vesper",
          text:
            "\"He *paid* you.\" She sounds delighted and slightly " +
            "appalled. \"With a contract. Out loud. In this market.\"",
        },
      ],
      choices: [
        {
          id: "terms-yes",
          label: "\"Then let's go and find you a room.\"",
          target: "vm-auditor-aboard",
          effects: [
            { type: "recruit-companion", companionId: "sill" },
            // Retained is not trusted, and he has been sold before.
            { type: "companion-loyalty", companionId: "sill", amount: -1 },
            { type: "set-flag", key: "sill-joined", value: "priced" },
          ],
        },
        {
          id: "terms-no",
          label: "\"Keep your third. I don't work on paper.\"",
          effects: [
            { type: "set-flag", key: "sill-declined", value: true },
            { type: "end" },
          ],
        },
      ],
    },
    {
      id: "vm-auditor-aboard",
      speaker: "Deacon Sill",
      text:
        "He falls in at your shoulder with the table under one arm, and " +
        "in the aisle he stops at the consignment lockers, reads three " +
        "expired tags without appearing to slow down, and files them " +
        "somewhere behind the visor. \"One condition,\" he says. \"When " +
        "I ask you what a thing's serial number was, you tell me, and we " +
        "do not have the argument about why.\" Whoever else was walking " +
        "with you tonight has already stepped back a pace, the way " +
        "people do when a queue forms.",
      location: "vertical-market:gallery",
      choices: [
        {
          id: "aboard-go",
          label: "Get off the boards before the drones come round again.",
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
            // A half-used tin of boards-crew colour, in with the rest
            // of somebody's abandoned week. Not sold anywhere.
            { type: "add-item", itemId: "dye-rust-vigil" },
            { type: "credits", amount: 25 },
            { type: "set-flag", key: "market-locker", value: "forced" },
          ],
          reactions: ["salvage"],
        },
        {
          id: "pick",
          label: "Read the hasp. Old mechanism — talk it open.",
          target: "vm-stash-open",
          requirements: [{ type: "stat", stat: "tech", value: 7 }],
          ifUnavailable: "disabled",
          effects: [
            { type: "add-item", itemId: "con-field-kit" },
            // Somebody's rent-a-week consignment: a field kit and a
            // sight nobody came back for. Loot, not stock — the only
            // Smartlink on the boards that costs nothing.
            { type: "add-item", itemId: "mod-smartlink-sight" },
            { type: "add-item", itemId: "dye-rust-vigil" },
            { type: "credits", amount: 25 },
            { type: "set-flag", key: "market-locker", value: "picked" },
          ],
          reactions: ["salvage"],
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
        "yellow at the seals, a ranging head still foil-wrapped, a half-used " +
        "tin of the amber the boards crews wore the year the scaffolds went " +
        "up, a hand of loose credit chits, and a child's drawing of the " +
        "market done in four colours, folded into eighths. You leave the " +
        "drawing where it is and close the door on it.",
      location: "vertical-market:gallery",
      choices: [
        {
          id: "locker-done",
          label: "Push the door shut and get back in the crowd.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      // The bench. `open-workbench` is the only door to the fitting
      // screen — the "only at a bench" rule is that there is nowhere
      // else the effect is authored (see maps.test's node lint).
      id: "vm-bench",
      text:
        "Against the east scaffold, where the stall row runs out, somebody " +
        "has bolted a steel bench to the uprights and hung a work lamp over " +
        "it on a wire. A woman with a machinist's squint and both sleeves " +
        "cut off at the shoulder is running a bore brush through something " +
        "that is not, strictly, hers. She does not look up.\n\n" +
        "\"Bench is open,\" she says. \"Sabbat. I fit, I pull, I don't ask. " +
        "Fitting's free — you brought the part. Pulling one back out costs " +
        "forty, because that's my time and your threads.\"",
      location: "vertical-market:east-scaffold",
      speaker: "Sabbat",
      choices: [
        {
          id: "bench-work",
          label: "Put your weapon on the bench.",
          // The bench screen replaces the dialogue and resumes here.
          target: "vm-bench",
          effects: [
            { type: "open-workbench" },
            { type: "set-flag", key: "bench-known", value: true },
          ],
        },
        {
          id: "bench-buy-choke",
          label: "\"What's in the tray?\" — Splitbore Choke. (70 cr)",
          target: "vm-bench",
          requirements: [{ type: "credits", value: 70 }],
          ifUnavailable: "disabled",
          effects: [
            { type: "credits", amount: -70 },
            { type: "add-item", itemId: "mod-splitbore-choke" },
          ],
        },
        {
          id: "bench-buy-sleeve",
          label: "Gyro Sleeve, off the tray. (90 cr)",
          target: "vm-bench",
          requirements: [{ type: "credits", value: 90 }],
          ifUnavailable: "disabled",
          effects: [
            { type: "credits", amount: -90 },
            { type: "add-item", itemId: "mod-gyro-sleeve" },
          ],
        },
        {
          id: "bench-scrap",
          label: "Read the scrap bin under the bench.",
          target: "vm-bench-scrap",
          requirements: [
            { type: "stat", stat: "tech", value: 5 },
            // A bin is emptied once. `flag-not-equals` is what makes a
            // genuinely one-time find expressible on a node the player
            // can walk back to.
            { type: "flag-not-equals", key: "bench-scrap", value: true },
          ],
          ifUnavailable: "hidden",
          effects: [
            { type: "add-item", itemId: "mod-ballast-shim" },
            { type: "set-flag", key: "bench-scrap", value: true },
          ],
        },
        {
          id: "bench-leave",
          label: "Leave her to it.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "vm-bench-scrap",
      text:
        "The bin under the bench is half offcuts and half things that were " +
        "nearly right. Near the bottom, under a coil of swarf, there is a " +
        "grip shim: four hundred grams of dead stock machined to a taper, " +
        "rejected for a burr you can feel but not see.\n\n" +
        "Sabbat watches you find it and goes back to her brush. \"Bin's " +
        "bin,\" she says. \"Burr's on the inside face. Won't matter to you.\"",
      location: "vertical-market:east-scaffold",
      speaker: "Sabbat",
      choices: [
        {
          id: "scrap-back",
          label: "Pocket it and get back to the bench.",
          target: "vm-bench",
        },
      ],
    },
    // Marrow's side-quest chain, authored in ./lastMile.ts and part of
    // this arc so `vm-fixer` can open it.
    ...lastMileNodes,
  ],
};
