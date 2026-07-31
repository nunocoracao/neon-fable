import type { StoryArc } from "../../narrative/types";

/**
 * The crew's own arc: the conversation each companion has earned, and
 * nothing else. It is opened from the party screen rather than from a
 * map — the beat is "a gap between missions", not a place — so the hub
 * node is the entry and every scene hangs off it.
 *
 * Each companion has two of them. The first opens on three conditions,
 * and the same three are declared twice on purpose: in content, as the
 * hub's gates, and in code, as personalSceneReady
 * (src/narrative/loyalty.ts), which is what the party screen offers the
 * conversation from. They are the companion being out with the player,
 * their loyalty having reached the threshold their record declares, and
 * the scene not having been had yet — that last one is why each fork
 * writes a bond flag, and why the gate is `flag-unset` rather than a
 * number that would keep moving.
 *
 * The second opens much later, on those three plus two: the first
 * conversation must already have happened, whichever way it went, and
 * the chapter that makes an "after" worth asking about must be behind
 * you (act2-complete). Same double declaration, against bondSceneReady.
 * Nothing in these is a mission — a roof, a parcel of fried dough, a
 * cloth-spined ledger pushed across a table.
 *
 * What the forks leave behind is the four flags the endings read:
 *
 *   vesper-bond:  "sworn" | "parted"
 *   sill-bond:    "sworn" | "parted"
 *   vesper-close: "warm" | "distant" | "betrayed"
 *   sill-close:   "warm" | "distant" | "betrayed"
 *
 * "betrayed" is gated on the coolant-vault call having already gone
 * against that person (vent-vault-call), so it is never a fresh
 * cruelty — it is the moment an old one is finally itemised.
 *
 * Every road keeps the companion in the party. Parting is not a sacking
 * — it is the moment somebody stops expecting anything of you, which
 * costs them their standing and keeps them at your shoulder anyway —
 * and neither is being spent: the ones who stay after that stay because
 * they said they would, which is worse.
 */
export const companionsArc: StoryArc = {
  id: "companions",
  title: "The Crew",
  entryNodeId: "cmp-hub",
  nodes: [
    {
      id: "cmp-hub",
      text:
        "Between one thing and the next there is always a doorway, a " +
        "stairhead, an hour where nothing is on fire. The person walking " +
        "with you has been waiting for one of those, and doing it badly — " +
        "starting sentences, filing them, starting them again.",
      choices: [
        {
          id: "hear-vesper",
          label: "\"Say it, Kade.\"",
          target: "cmp-vesper-open",
          requirements: [
            { type: "companion", companionId: "vesper" },
            { type: "loyalty", companionId: "vesper", value: 4 },
            { type: "flag-unset", key: "vesper-bond" },
          ],
        },
        {
          id: "hear-sill",
          label: "\"Out with it, Sill.\"",
          target: "cmp-sill-open",
          requirements: [
            { type: "companion", companionId: "sill" },
            { type: "loyalty", companionId: "sill", value: 4 },
            { type: "flag-unset", key: "sill-bond" },
          ],
        },
        {
          id: "hear-vesper-late",
          label: "\"You've been carrying that parcel since the tram, Kade.\"",
          target: "cmp-vesper-late",
          requirements: [
            { type: "companion", companionId: "vesper" },
            { type: "loyalty", companionId: "vesper", value: 7 },
            { type: "flag-set", key: "vesper-bond" },
            { type: "flag-set", key: "act2-complete" },
            { type: "flag-unset", key: "vesper-close" },
          ],
        },
        {
          id: "hear-sill-late",
          label: "\"That's not the slate, Sill. What is it?\"",
          target: "cmp-sill-late",
          requirements: [
            { type: "companion", companionId: "sill" },
            { type: "loyalty", companionId: "sill", value: 7 },
            { type: "flag-set", key: "sill-bond" },
            { type: "flag-set", key: "act2-complete" },
            { type: "flag-unset", key: "sill-close" },
          ],
        },
        {
          id: "hub-leave",
          label: "Let the hour go by unspent.",
          effects: [{ type: "end" }],
        },
      ],
    },
    // ------------------------------------------------------------------
    // Vesper Kade — the grease-pencil column on the tide board
    // ------------------------------------------------------------------
    {
      id: "cmp-vesper-open",
      speaker: "Vesper Kade",
      text:
        "\"The board on the wharf,\" she says, to the middle distance. " +
        "\"Grease pencil. One line a week.\" She lets that stand a while, " +
        "and then gets the rest of it out fast, like something under a " +
        "dressing. \"Eleven years. My mother started it and I finished " +
        "her column and then I just — kept going. Nobody reads it. I " +
        "know nobody reads it. A thing that isn't measured isn't " +
        "happening, so I measure it, and it is still happening, so " +
        "clearly I have proved nothing.\"",
      choices: [
        {
          id: "vesper-why",
          label: "\"Why tell me?\"",
          target: "cmp-vesper-ask",
        },
      ],
    },
    {
      id: "cmp-vesper-ask",
      speaker: "Vesper Kade",
      expression: "grim",
      text:
        "\"Because I'm asking you for something and I've never been any " +
        "good at that part.\" The spool turns over in her hands, once. " +
        "\"When the basin takes the rest of the Quays — and it will, the " +
        "column says so — somebody has to be able to say what was down " +
        "there. Streets. A tram. Two hundred people who were told the " +
        "pumps were coming back.\" She finally looks at you. \"Put your " +
        "name under mine on the board. Not for the record. So there's " +
        "two of us who can't pretend we didn't know.\"",
      choices: [
        {
          id: "vesper-sign",
          label: "Go down there with her and sign the board.",
          target: "cmp-vesper-sworn",
          effects: [
            { type: "set-flag", key: "vesper-bond", value: "sworn" },
            { type: "companion-loyalty", companionId: "vesper", amount: 3 },
          ],
        },
        {
          id: "vesper-decline",
          label: "\"I'm not going to be here, Kade. Neither are you.\"",
          target: "cmp-vesper-parted",
          effects: [
            { type: "set-flag", key: "vesper-bond", value: "parted" },
            { type: "companion-loyalty", companionId: "vesper", amount: -3 },
          ],
        },
      ],
    },
    {
      id: "cmp-vesper-sworn",
      speaker: "Vesper Kade",
      expression: "smile",
      text:
        "It takes the whole of a wet hour to get down there and four " +
        "seconds to do. She hands you the pencil, waits while you write, " +
        "reads it twice, and puts the stub back in the tin on the ledge " +
        "where it has lived for eleven years. \"Right,\" she says, and " +
        "her voice is doing something she would deny under oath. \"Rule " +
        "three. If I go in the water, you keep the column.\" A beat. " +
        "\"Weekly. It's not a lot to ask.\"",
      choices: [
        {
          id: "vesper-sworn-done",
          label: "\"Weekly.\"",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "cmp-vesper-parted",
      speaker: "Vesper Kade",
      expression: "grim",
      text:
        "She takes it the way she takes a snapped line — no argument, " +
        "one short breath, hands already doing the next thing. \"No. " +
        "You're right. That's fair.\" The spool goes back on her hip. " +
        "\"Forget I said it. I'm still on the job, I'm still worth the " +
        "cut, and you'll get no less out of me tomorrow than you got " +
        "yesterday.\" She means every word of that, and none of it is " +
        "the thing she asked for, and she does not bring it up again.",
      choices: [
        {
          id: "vesper-parted-done",
          label: "Let her have the last word. She has earned it.",
          effects: [{ type: "end" }],
        },
      ],
    },
    // ------------------------------------------------------------------
    // Vesper Kade, later — fried dough on a roof, and the word "after"
    //
    // She has never asked anybody for anything twice. This is the
    // second time, and it is smaller than the first, and it costs her
    // more. Writes vesper-close.
    // ------------------------------------------------------------------
    {
      id: "cmp-vesper-late",
      speaker: "Vesper Kade",
      text:
        "She will not say what is in the parcel until you are up the " +
        "ladder and sitting down with your back to the vent housing. It " +
        "is fried dough and two bottles of something orange, and it is " +
        "still warm, which means she paid the counter price and stood in " +
        "the queue like a person. \"Sit. Eat that. Don't make a thing of " +
        "it.\" Below the parapet the district does what it does at this " +
        "hour, which is mostly steam and other people's arguments.",
      choices: [
        {
          id: "vesper-late-sit",
          label: "Sit down and eat it.",
          target: "cmp-vesper-late-ask",
        },
      ],
    },
    {
      id: "cmp-vesper-late-ask",
      speaker: "Vesper Kade",
      text:
        "Half of it goes before she says anything, and when she does it " +
        "is at the skyline rather than at you. \"My mother did this. Not " +
        "the roof — the feeding people. Every crew she ever ran. She " +
        "said you can't ask anybody to go down a hole for you on an " +
        "empty stomach and still call yourself decent about it.\" The " +
        "bottle turns over in her hands, once. \"So this is me asking. " +
        "After. When the towers have finished eating each other and " +
        "there's no job on.\" A shrug that costs her something. \"Is " +
        "there an after where I still know where you are? Or do you go " +
        "off the board like everybody else does eventually.\"",
      choices: [
        {
          id: "vesper-late-warm",
          label: "\"You'll know where I am. I'll be the one queueing next time.\"",
          target: "cmp-vesper-warm",
          effects: [
            { type: "set-flag", key: "vesper-close", value: "warm" },
            { type: "companion-loyalty", companionId: "vesper", amount: 2 },
          ],
        },
        {
          id: "vesper-late-distant",
          label: "\"Don't build anything on me, Kade. I go off the board.\"",
          target: "cmp-vesper-distant",
          effects: [
            { type: "set-flag", key: "vesper-close", value: "distant" },
            { type: "companion-loyalty", companionId: "vesper", amount: -1 },
          ],
        },
        {
          id: "vesper-late-spend",
          label:
            "\"The lockers weren't a one-off. When it's you or the job, " +
            "it's the job.\"",
          target: "cmp-vesper-betrayed",
          // Only sayable when it is already true: the vault call went
          // against her, and this is the night it gets itemised.
          requirements: [
            { type: "flag-equals", key: "vent-vault-call", value: "filed" },
          ],
          effects: [
            { type: "set-flag", key: "vesper-close", value: "betrayed" },
            { type: "companion-loyalty", companionId: "vesper", amount: -6 },
          ],
        },
      ],
    },
    {
      id: "cmp-vesper-warm",
      speaker: "Vesper Kade",
      expression: "smile",
      text:
        "\"Right,\" she says, and eats. That is the entire reaction, and " +
        "you are meant to take it as one. Twenty minutes later, packing " +
        "the paper away so the roof is left cleaner than she found it, " +
        "she adds — to the parapet, not to you — \"There's a place on " +
        "the fourth level does this better. Costs double. We'll go when " +
        "there's an after.\" She does not look round to see whether you " +
        "agreed. She has already decided you did.",
      choices: [
        {
          id: "vesper-warm-done",
          label: "Let the hour finish itself.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "cmp-vesper-distant",
      speaker: "Vesper Kade",
      text:
        "\"Mm,\" she says, and nods twice, and that is that. She finishes " +
        "her half anyway, unhurried, because it cost money. \"Fair " +
        "enough. Better than the ones who say yes and then go off the " +
        "board anyway.\" The paper folds up small; the bottles go in her " +
        "bag to take back for the deposit. At the ladder she looks back " +
        "with the parcel string still round her fingers. \"Still eat, " +
        "though. Before jobs. That part wasn't about you.\"",
      choices: [
        {
          id: "vesper-distant-done",
          label: "Go down the ladder first.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "cmp-vesper-betrayed",
      speaker: "Vesper Kade",
      expression: "grim",
      text:
        "She does not argue and she does not leave. She puts the lid " +
        "back on her half, deliberately, and sits with it in her lap " +
        "until the steam stops coming off it. \"Okay,\" she says at last. " +
        "\"Thanks. Genuinely. People don't usually tell you which one " +
        "you are.\" The rest of the roof passes without a word in it. " +
        "She is on the next job, and the one after, and every count is " +
        "right and every line is tied off — and she never once, after " +
        "tonight, tells you what she is thinking while she does it.",
      choices: [
        {
          id: "vesper-betrayed-done",
          label: "Say nothing. There is nothing that improves it.",
          effects: [{ type: "end" }],
        },
      ],
    },
    // ------------------------------------------------------------------
    // Deacon Sill — whose name goes on the case
    // ------------------------------------------------------------------
    {
      id: "cmp-sill-open",
      speaker: "Deacon Sill",
      text:
        "He has the slate open on his knees and the visor down, which he " +
        "only does when he is not reading. \"The annexe box,\" he says. " +
        "\"The authorising key. I have it. Three statements, a shift " +
        "roster, and one crew foreman willing to be named — it holds. " +
        "Nine years of certifying, two years of a card table, and it " +
        "actually holds.\" The visor stays down. \"And I find I have " +
        "been sitting here for a quarter of an hour not filing it.\"",
      choices: [
        {
          id: "sill-why",
          label: "\"What's stopping you?\"",
          target: "cmp-sill-ask",
        },
      ],
    },
    {
      id: "cmp-sill-ask",
      speaker: "Deacon Sill",
      expression: "grim",
      text:
        "\"A filing has an author. That is what makes it a filing rather " +
        "than a rumour with numbers on.\" He pushes the visor up at last. " +
        "\"If my name goes on it, the tower knows I am alive, where I " +
        "sleep, and that I kept the seal. They struck me off with a note " +
        "under a door; they will not use a door twice.\" A dry breath. " +
        "\"I can file it as nobody. It survives. It simply never has to " +
        "be answered, because nobody can be made to answer it.\"",
      choices: [
        {
          id: "sill-name",
          label: "\"Sign it. All of it. Your name at the bottom.\"",
          target: "cmp-sill-sworn",
          effects: [
            { type: "set-flag", key: "sill-bond", value: "sworn" },
            { type: "companion-loyalty", companionId: "sill", amount: 3 },
          ],
        },
        {
          id: "sill-anon",
          label: "\"File it as nobody. Dead men answer nothing either.\"",
          target: "cmp-sill-parted",
          effects: [
            { type: "set-flag", key: "sill-bond", value: "parted" },
            { type: "companion-loyalty", companionId: "sill", amount: -3 },
          ],
        },
      ],
    },
    {
      id: "cmp-sill-sworn",
      speaker: "Deacon Sill",
      expression: "smile",
      text:
        "He writes it out longhand, which nothing has required for forty " +
        "years, and seals it with the tool he was never asked to return. " +
        "\"Deacon Sill, compliance, register number struck.\" He says it " +
        "aloud as he writes it, which is either procedure or a kind of " +
        "prayer. \"There. It has an author.\" He looks up, and the man " +
        "who folded a card table in the market is entirely gone. \"Now " +
        "we find somebody obliged to read it.\"",
      choices: [
        {
          id: "sill-sworn-done",
          label: "\"Then let's go and oblige them.\"",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "cmp-sill-parted",
      speaker: "Deacon Sill",
      text:
        "\"Yes,\" he says. \"That is the sensible reading.\" He files it " +
        "as nobody — competently, quickly, with the box at the bottom " +
        "left open the way he has left it open for two years. Then he " +
        "closes the slate and sits with his hands on it. \"You should " +
        "know that I agree with you, and that I will still be doing this " +
        "when I am seventy, and that both of those are the same problem.\" " +
        "He does not raise it again, and something in how he says your " +
        "name goes back to how he said it across the card table.",
      choices: [
        {
          id: "sill-parted-done",
          label: "Leave him with the slate shut.",
          effects: [{ type: "end" }],
        },
      ],
    },
    // ------------------------------------------------------------------
    // Deacon Sill, later — the ledger that is not the case
    //
    // The man who wants everything written down has one document he has
    // never shown anybody. Writes sill-close.
    // ------------------------------------------------------------------
    {
      id: "cmp-sill-late",
      speaker: "Deacon Sill",
      text:
        "The slate is shut and face-down, which he does not do, and " +
        "there is a paper ledger on the table instead. It is old enough " +
        "to have a cloth spine and a punched cord through the fold. " +
        "\"Year six,\" he says, without preamble, and turns it round so " +
        "it faces you. \"Variance log. Mine.\" He does not look at it " +
        "while it is open. \"I would like you to read the entry for the " +
        "ninth, and I would like to not have to say it out loud first.\"",
      choices: [
        {
          id: "sill-late-read",
          label: "Read it.",
          target: "cmp-sill-late-ask",
        },
      ],
    },
    {
      id: "cmp-sill-late-ask",
      speaker: "Deacon Sill",
      expression: "grim",
      text:
        "It is four lines and a signature and it is entirely correct. A " +
        "cycler variance in the Undercroft, certified within tolerance, " +
        "by the book, by him. \"Fourteen,\" he says, to the wall. \"Not " +
        "that night. It took eleven months, which is precisely why " +
        "nobody ever joined the two documents up. I did. In year eight, " +
        "on my own time.\" He closes the ledger with two fingers. \"Then " +
        "I filed a variance report on somebody else's cyclers, and let " +
        "them strike me off for it, and I have spent two years letting " +
        "people call that courage. I am not asking to be forgiven — I " +
        "have no mechanism for that. You are simply the only person who " +
        "has ever been owed an accurate version.\"",
      choices: [
        {
          id: "sill-late-warm",
          label: "\"Then I'll carry the accurate version. Put it back on the shelf.\"",
          target: "cmp-sill-warm",
          effects: [
            { type: "set-flag", key: "sill-close", value: "warm" },
            { type: "companion-loyalty", companionId: "sill", amount: 2 },
          ],
        },
        {
          id: "sill-late-distant",
          label: "\"You needed somewhere to put that. It's put. We're square.\"",
          target: "cmp-sill-distant",
          effects: [
            { type: "set-flag", key: "sill-close", value: "distant" },
            { type: "companion-loyalty", companionId: "sill", amount: -1 },
          ],
        },
        {
          id: "sill-late-keep",
          label:
            "\"Fourteen names and a signature. That's worth keeping " +
            "somewhere I can reach it.\"",
          target: "cmp-sill-betrayed",
          // Only sayable when the vault already taught him what you do
          // with a document somebody else is standing next to.
          requirements: [
            { type: "flag-equals", key: "vent-vault-call", value: "salvage" },
          ],
          effects: [
            { type: "set-flag", key: "sill-close", value: "betrayed" },
            { type: "companion-loyalty", companionId: "sill", amount: -6 },
          ],
        },
      ],
    },
    {
      id: "cmp-sill-warm",
      speaker: "Deacon Sill",
      expression: "smile",
      text:
        "He puts it back in the case, and the case back under the bench, " +
        "and takes rather longer over the buckles than the buckles need. " +
        "\"Thank you,\" he says, and then, because he cannot help it: " +
        "\"That was not an absolution and I did not want one. It was a " +
        "disclosure.\" The visor stays up for the rest of the evening, " +
        "which you have learned is the whole tell. When he says your " +
        "name after that he says it the way he says a witness's — as " +
        "somebody whose account of a thing he would stand behind.",
      choices: [
        {
          id: "sill-warm-done",
          label: "Let him do up the buckles in peace.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "cmp-sill-distant",
      speaker: "Deacon Sill",
      text:
        "\"Square,\" he repeats, testing it, and finds it holds. \"Yes. " +
        "That is a clean way to put it.\" The ledger goes away without " +
        "ceremony, and he is entirely himself within a minute — serial " +
        "numbers, a roster line, a question about tomorrow's route — and " +
        "the only difference is that the cloth spine never comes out on " +
        "the table again while you are in the room. He is not hurt. He " +
        "simply files you, correctly, under the people who were told.",
      choices: [
        {
          id: "sill-distant-done",
          label: "Take the question about tomorrow's route.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "cmp-sill-betrayed",
      expression: "grim",
      speaker: "Deacon Sill",
      text:
        "He nods slowly, and something in him goes back nine years and " +
        "puts a visor down. \"Of course,\" he says. \"That is what a " +
        "document is for. I have been on the other side of that sentence " +
        "and I recognise it.\" He does up the case. He does not ask for " +
        "the ledger back, because asking would concede that you might " +
        "not give it. From that night his statements to you are exact, " +
        "complete, and volunteered about nothing, and he has stopped " +
        "leaving the box at the bottom of the annexe open.",
      choices: [
        {
          id: "sill-betrayed-done",
          label: "Let him close the case.",
          effects: [{ type: "end" }],
        },
      ],
    },
  ],
};
