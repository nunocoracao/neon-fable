import type { Interlude } from "../narrative/interlude";

/**
 * Interlude content: the breath between acts, and what the chapter just
 * ended set moving.
 *
 * One entry per act boundary, in story order — `pendingInterlude` plays
 * the first unseen one whose `afterFlag` a run has written, so the list
 * is also the running order. Every strand reads flags that act actually
 * set (see the act's own header comment for its ledger), and the first
 * matching variant wins, so **authored order inside a strand is variant
 * priority**: the sharpest fact first, the catch-all last.
 *
 * Strands are authored most-important-first as well, because a busy run
 * is trimmed to MAX_INTERLUDE_BEATS from the bottom — the water and the
 * warrant outrank a fixer's mood.
 *
 * Adding a strand: give it a fallback only if the vignette would read
 * wrong without it. A strand with no fallback is simply unsaid on a run
 * that never touched it, which is how a skipped side chain leaves no
 * seam. The `connective` pool underneath is the floor: it catches any
 * combination of flags nobody predicted.
 */
export const interludes: Interlude[] = [
  {
    id: "act1-act2",
    afterFlag: "act1-complete",
    kicker: "Interlude — After the Flood Night",
    title: "What the Night Set Moving",
    backdrop: { mapId: "greywater-steps", tone: "cyan" },
    connective: [
      "The rain thins to a drizzle nobody trusts, and the Sprawl goes " +
        "back to the business of being the Sprawl.",
      "Somewhere above the cloud line, an office you will never see " +
        "opens a file with your gait-print in it.",
      "The Steps count what they still have. It takes less time than " +
        "it used to.",
    ],
    strands: [
      {
        id: "undertow",
        fallback:
          "The Undertow schedule went out into the dark, and below " +
          "Greywater the water keeps its own counsel.",
        variants: [
          {
            id: "undertow-court",
            text:
              "The Undertow manifold stays dead. On Ledge Nine the black " +
              "water sits where you left it, and somebody rings the " +
              "salvaged bell every night at nine, on principle.",
            requires: [
              { type: "flag-equals", key: "act1-outcome", value: "court" },
            ],
          },
          {
            id: "undertow-voss",
            text:
              "The flush is deferred, not cancelled. Down on the Steps " +
              "they watch the gauges the way you watch a man who has " +
              "promised to be reasonable.",
            requires: [
              { type: "flag-equals", key: "act1-outcome", value: "voss" },
            ],
          },
          {
            id: "undertow-broadcast",
            text:
              "The schedule is public property now — read aloud at " +
              "noodle stalls, chalked on tram windows. The Sprawl is far " +
              "too loud to flood anything quietly.",
            requires: [
              { type: "flag-equals", key: "act1-outcome", value: "broadcast" },
            ],
          },
          {
            id: "undertow-stopped",
            text:
              "The manifold is cold and the terraces are dry. Nobody " +
              "quite agrees on who to thank, which suits everyone.",
            requires: [
              { type: "flag-equals", key: "undertow-stopped", value: true },
            ],
          },
          {
            id: "undertow-delayed",
            text:
              "The flush slides down the calendar, and the calendar is " +
              "kept by people who have never been rained on.",
            requires: [
              { type: "flag-equals", key: "undertow-delayed", value: true },
            ],
          },
        ],
      },
      {
        id: "court",
        fallback:
          "Below the waterline the Cistern Court goes on doing what it " +
          "has always done, with or without you.",
        variants: [
          {
            id: "court-betrayed",
            text:
              "The Court posts your description beside the names of the " +
              "drowned. Matron Ferrow does not say your name at all, " +
              "which on the Steps is worse.",
            requires: [
              { type: "flag-equals", key: "betrayed-court", value: true },
            ],
          },
          {
            id: "court-oath",
            text:
              "Ferrow chalks you onto the hall wall herself. Three floods " +
              "have not taken a name off that wall yet, and she means it " +
              "to stay that way.",
            requires: [{ type: "flag-equals", key: "court-oath", value: true }],
          },
          {
            id: "court-ally",
            text:
              "Terrace tea, twice, and a standing seat at a council that " +
              "meets in waders. The Court counts you among its own now.",
            requires: [
              { type: "flag-equals", key: "ally-cistern-court", value: true },
            ],
          },
          {
            id: "court-cool",
            text:
              "The Court files you under 'topside' and keeps its lantern " +
              "strings burning anyway. They have been disappointed by " +
              "better.",
            requires: [
              { type: "flag-equals", key: "act1-outcome", value: "voss" },
            ],
          },
        ],
      },
      {
        id: "warrant",
        fallback:
          "The Auric Combine has not decided what you are yet. That is " +
          "a decision, and it is being made without you.",
        variants: [
          {
            id: "warrant-open",
            text:
              "By morning there is a warrant with your gait-print on it, " +
              "three denials nobody believes, and a scanner on every " +
              "tram loop that has been told what to look for.",
            requires: [
              { type: "flag-equals", key: "wanted-by-auric", value: true },
            ],
          },
          {
            id: "warrant-patron",
            text:
              "A director quietly moves your name off a payroll file and " +
              "onto a shorter list. Auric protects its line items — for " +
              "exactly as long as they earn out.",
            requires: [{ type: "flag-equals", key: "ally-voss", value: true }],
          },
        ],
      },
      {
        id: "voss",
        variants: [
          {
            id: "voss-exposed",
            text:
              "Imre Voss's byline rides the broadcast into every " +
              "boardroom in the Spire. Voss sends no message at all, " +
              "which from Voss is a full page of them.",
            requires: [
              { type: "flag-equals", key: "voss-exposed", value: true },
            ],
          },
          {
            id: "voss-betrayed",
            text:
              "Voss's account with you settles at zero and stays there. " +
              "Auditors do not shout. They wait, and they keep the " +
              "column open.",
            requires: [
              { type: "flag-equals", key: "betrayed-voss", value: true },
            ],
          },
          {
            id: "voss-deal",
            text:
              "The writ in your pocket opens doors in the Auric Spire " +
              "that used to open only for people who had never been " +
              "rained on.",
            requires: [{ type: "flag-equals", key: "voss-deal", value: true }],
          },
          {
            id: "voss-refused",
            text:
              "You left Voss holding a countersigned offer and a " +
              "salt-plant smile. Neither of them is the sort of thing " +
              "that gets thrown away.",
            requires: [
              { type: "flag-equals", key: "voss-refused", value: true },
            ],
          },
        ],
      },
      {
        id: "sable",
        variants: [
          {
            id: "sable-burned",
            text:
              "Sable's back room is stripped to the fixtures by dawn. " +
              "Six levels of boards agree on very little and on this: " +
              "you sold a fixer's door.",
            requires: [
              { type: "flag-equals", key: "sable-burned", value: true },
            ],
          },
          {
            id: "sable-trust",
            text:
              "Sable keeps your tab open and your name off it. In the " +
              "Filament that is closer to friendship than the word gets " +
              "down here.",
            requires: [{ type: "flag-equals", key: "sable-trust", value: true }],
          },
          {
            id: "sable-skeptical",
            text:
              "Sable is owed the first read of whatever comes back on " +
              "the wire, and Sable does not forget an invoice.",
            requires: [
              { type: "flag-equals", key: "sable-skeptical", value: true },
            ],
          },
        ],
      },
      {
        id: "hex",
        variants: [
          {
            id: "hex-broadcast",
            text:
              "In the drowned Weave, something that used to be a " +
              "broadcast system files the whole night away and hums, " +
              "content. Hex archives everything.",
            requires: [
              { type: "flag-equals", key: "hex-broadcast", value: true },
            ],
          },
          {
            id: "hex-assist",
            text:
              "Dead screens along the Chainwell wake at odd hours now, " +
              "read two lines in a forgotten register, and go dark " +
              "again. Hex is keeping in touch.",
            requires: [{ type: "flag-equals", key: "hex-assist", value: true }],
          },
        ],
      },
    ],
  },
  {
    id: "act2-act3",
    afterFlag: "act2-complete",
    kicker: "Interlude — After the Cordon",
    title: "What the Cordon Left Standing",
    backdrop: { mapId: "exchange-ventworks", tone: "amber" },
    connective: [
      "The Exchange cyclers turn over one by one, and the deep levels " +
        "get their air back before anyone upstairs files the paperwork.",
      "For a week the Sprawl argues about what happened. Then it stops " +
        "arguing, which is how you know it was real.",
      "Somewhere under all of it, an older register is still open, and " +
        "it has your name in it now.",
    ],
    strands: [
      {
        id: "cordon",
        fallback:
          "The Cordon is over. What replaced it is still deciding what " +
          "it wants to be called.",
        variants: [
          {
            id: "cordon-charter",
            text:
              "The mandate spool is read into both emergency channels of " +
              "the Meridian Charter, and a session convenes that nobody " +
              "can un-convene. The embargo lifts by dawn.",
            requires: [
              { type: "flag-equals", key: "act2-outcome", value: "charter" },
            ],
          },
          {
            id: "cordon-takeover",
            text:
              "The Cordon ring changes hands in under an hour, in a room " +
              "with cameras present. The embargo lifts as an act of " +
              "magnanimity, and the magnanimity is invoiced.",
            requires: [
              { type: "flag-equals", key: "act2-outcome", value: "takeover" },
            ],
          },
          {
            id: "cordon-severance",
            text:
              "The Undercroft cuts its own umbilical, and the Cordon " +
              "dies as a rounding error. You cannot strangle a district " +
              "that has stopped answering the door.",
            requires: [
              { type: "flag-equals", key: "act2-outcome", value: "severance" },
            ],
          },
          {
            id: "cordon-broken",
            text:
              "The Cordon's ledgers are open, its architects are " +
              "lawyering, and the cyclers are spinning back up on " +
              "somebody's authority.",
            requires: [
              { type: "flag-equals", key: "cordon-broken", value: true },
            ],
          },
        ],
      },
      {
        id: "halex",
        variants: [
          {
            id: "halex-deposed",
            text:
              "The directorate votes to disown the director who ran the " +
              "Cordon while the proxy is still smoking on the cycler " +
              "floor. Halex becomes a paragraph, then a footnote.",
            requires: [
              { type: "flag-equals", key: "halex-deposed", value: true },
            ],
          },
          {
            id: "halex-standing",
            text:
              "Halex is still in the Spire, still signing in the same " +
              "key, and now knows exactly whose boots were on the cycler " +
              "floor.",
            requires: [
              { type: "flag-equals", key: "proxy-known", value: true },
            ],
          },
        ],
      },
      {
        id: "undercroft",
        variants: [
          {
            id: "undercroft-charter",
            text:
              "For the first time since the towers went up, the " +
              "Undercroft has standing: a seat, a voice, and a name on " +
              "the Charter's rolls that no flood can wash off.",
            requires: [
              { type: "flag-equals", key: "undercroft-charter", value: true },
            ],
          },
          {
            id: "undercroft-severed",
            text:
              "Below Greywater the lantern strings burn on current the " +
              "Combine will never meter again. The Steps go dark on " +
              "Auric's books and bright everywhere it counts.",
            requires: [
              { type: "flag-equals", key: "undercroft-severed", value: true },
            ],
          },
          {
            id: "undercroft-independent",
            text:
              "The Steps run their own siphon lines now, badly and " +
              "proudly, and answer questions about it from nobody.",
            requires: [
              { type: "flag-equals", key: "steps-independent", value: true },
            ],
          },
        ],
      },
      {
        id: "patron",
        variants: [
          {
            id: "patron-voss",
            text:
              "\"Reclamation thanks its field partners,\" Voss says on " +
              "every screen, from a chair that was somebody else's last " +
              "week. Your account settles before the broadcast ends.",
            requires: [
              { type: "flag-equals", key: "voss-ascendant", value: true },
            ],
          },
          {
            id: "patron-cleared",
            text:
              "Warrants get quietly suspended when the fugitive becomes " +
              "the witness. You walk past scanners that have been told, " +
              "in writing, to look elsewhere.",
            requires: [
              { type: "flag-equals", key: "wanted-by-auric", value: false },
            ],
          },
          {
            id: "patron-hunted",
            text:
              "The warrant is still open, and now it has a second page. " +
              "Auric does not misplace paperwork about people who cost " +
              "it a division.",
            requires: [
              { type: "flag-equals", key: "wanted-by-auric", value: true },
            ],
          },
        ],
      },
      {
        id: "market",
        variants: [
          {
            id: "market-boards",
            text:
              "The bonded floor's manifest goes up on the Market boards " +
              "in full. Six levels of traders get their own stock back " +
              "and remember exactly who read it out.",
            requires: [
              { type: "flag-equals", key: "boards-cut-in", value: true },
            ],
          },
          {
            id: "market-debt",
            text:
              "The Market's ledger has a line with your name on it, and " +
              "the Market's ledger is the only scripture six levels of " +
              "traders have ever agreed on.",
            requires: [{ type: "flag-equals", key: "lin-debt", value: true }],
          },
        ],
      },
      {
        id: "crew",
        variants: [
          {
            id: "crew-freed",
            text:
              "The cycler crew get out, get paid late, and tell the " +
              "story at volume in a bar you have never been to. It is a " +
              "good version of the story.",
            requires: [{ type: "flag-equals", key: "crew-freed", value: true }],
          },
          {
            id: "crew-warned",
            text:
              "The crew you warned off the floor take the long way home " +
              "and do not talk about why. Some debts are paid by staying " +
              "quiet.",
            requires: [{ type: "flag-equals", key: "crew-warned", value: true }],
          },
        ],
      },
    ],
  },
];

/** One interlude by id — the save screen's replay entry point. */
export function getInterlude(id: string): Interlude | undefined {
  return interludes.find((interlude) => interlude.id === id);
}
