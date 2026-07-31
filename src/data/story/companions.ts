import type { StoryArc } from "../../narrative/types";

/**
 * The crew's own arc: the conversation each companion has earned, and
 * nothing else. It is opened from the party screen rather than from a
 * map — the beat is "a gap between missions", not a place — so the hub
 * node is the entry and every scene hangs off it.
 *
 * A scene opens on three conditions, and the same three are declared
 * twice on purpose: in content, as the hub's gates, and in code, as
 * personalSceneReady (src/narrative/loyalty.ts), which is what the
 * party screen offers the conversation from. They are the companion
 * being out with the player, their loyalty having reached the
 * threshold their record declares, and the scene not having been had
 * yet — that last one is why each fork writes a bond flag, and why the
 * gate is `flag-unset` rather than a number that would keep moving.
 *
 * What the forks leave behind is the pair the endings read:
 *
 *   vesper-bond: "sworn" | "parted"
 *   sill-bond:   "sworn" | "parted"
 *
 * Both roads keep the companion in the party. Parting is not a sacking
 * — it is the moment somebody stops expecting anything of you, which
 * costs them their standing and keeps them at your shoulder anyway.
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
  ],
};
