/**
 * Chapter-ending content. An end effect whose endingId resolves here is a
 * chapter outcome: the UI shows the ending's epilogue on a chapter-end
 * screen instead of a toast. Ending ids double as the values a future act
 * can read back off the outcome flags the ending nodes set.
 */
export interface ChapterEnding {
  id: string;
  title: string;
  /** Epilogue paragraphs shown on the chapter-end screen. */
  paragraphs: string[];
  /**
   * True for game endings (Act 3): the UI routes to the epilogue screen
   * instead of the chapter-end panel, and the save is finished.
   */
  final?: boolean;
  /**
   * One-line spoiler-safe hint for the endings codex while this ending
   * is undiscovered. Must tease the path, never retell the ending —
   * the codex shows it verbatim to players who haven't been there.
   */
  hint?: string;
  /** Short codex summary shown once the ending has been reached. */
  summary?: string;
}

export const endings: ChapterEnding[] = [
  {
    id: "act1-court",
    title: "The Water Stands Still",
    paragraphs: [
      "The charges cough once, deep under Greywater Steps, and the " +
        "Undertow manifold dies mid-breath. On Ledge Nine the black water " +
        "stops climbing for the first time in a week, and somebody starts " +
        "ringing a salvaged bell like it's a holiday.",
      "Matron Ferrow doesn't thank you. She hands you a cup of terrace " +
        "tea, which on the Steps is the same thing said properly. Auric " +
        "will come back with lawyers, then with worse — but tonight the " +
        "Cistern Court holds its ground, and it counts you among its own.",
      "Somewhere above, in a glass office that smells of salt-plants, a " +
        "director quietly deletes your name from a payroll file and moves " +
        "it to a different list.",
    ],
  },
  {
    id: "act1-voss",
    title: "A Signature in Grey Ink",
    paragraphs: [
      "Voss reads the ledger twice, then feeds it to a shredder that " +
        "probably cost more than your building. \"Postponed pending " +
        "review,\" they say, the way other people say checkmate. By " +
        "morning the Undertow schedule is an internal matter, and internal " +
        "matters never drown anyone officially.",
      "Your account settles before you reach the street. The writ in your " +
        "pocket opens doors in the Auric Spire that used to open only for " +
        "people who'd never been rained on.",
      "Down on the Steps, the Cistern Court posts your description next " +
        "to the names of the drowned. The Sprawl keeps every receipt — but " +
        "so, now, do you.",
    ],
  },
  {
    id: "act1-broadcast",
    title: "Every Screen in the Sprawl",
    paragraphs: [
      "The Relay Crown drinks the ledger and sings it back at the city. " +
        "Noodle-stall screens, tram windows, the Glasshouse's own lobby " +
        "wall: the Undertow schedule, line by line, with the flush dates " +
        "glowing like wounds.",
      "By dawn the Sprawl is too loud to flood anything quietly. Auric " +
        "issues three denials and a warrant with your gait-print on it. " +
        "Sable's people won't meet your eyes; Ferrow's people don't know " +
        "whether to toast you or bill you.",
      "You did it owing nothing to anyone. That's the freest anyone gets " +
        "in the Meridian Sprawl — and the most alone.",
    ],
  },
  {
    id: "act2-charter",
    title: "The Sprawl Convenes",
    paragraphs: [
      "The mandate spool unwinds into every district board and both " +
        "emergency channels of the Meridian Charter at once: the Cordon, " +
        "line by line, cycler shutdown signed in Halex's own key. You can't " +
        "un-convene a Charter session, and by dawn nobody is trying.",
      "Halex's proxy is still smoking on the cycler floor when the " +
        "directorate votes to disown the director who ran it. The embargo " +
        "lifts. The cyclers spin back up. And for the first time since the " +
        "towers went up, the Undercroft has standing — a seat, a voice, a " +
        "name on the Charter's rolls.",
      "Warrants get quietly suspended when the fugitive becomes the " +
        "witness. You walk out of the Exchange through the front gate, " +
        "past scanners that have been told, in writing, to look elsewhere.",
    ],
  },
  {
    id: "act2-takeover",
    title: "A New Name on the Door",
    paragraphs: [
      "You open the directorate uplink and hand Imre Voss the Cordon " +
        "ring, and somewhere high in the Auric Spire a very quiet coup " +
        "concludes in under an hour. Halex's mandate becomes Halex's " +
        "confession; Halex's division becomes Voss's; the embargo lifts as " +
        "an act of magnanimity, with cameras present.",
      "\"Reclamation thanks its field partners,\" Voss says on every " +
        "screen, and the salt-plant smile is a director's smile no longer — " +
        "it belongs to the chair now. Your account settles before the " +
        "broadcast ends.",
      "The Steps get their air back and never learn whose hand was on the " +
        "valve. You know. Voss knows you know. That arithmetic is your " +
        "pension now, and its interest compounds in both directions.",
    ],
  },
  {
    id: "act2-severance",
    title: "The Steps Go Dark",
    paragraphs: [
      "You throw the governors into reverse and the Undercroft cuts its " +
        "own umbilical: Court cyclers spinning up on terrace power, siphon " +
        "lines waking, the Exchange's meters on the deep levels all " +
        "flatlining to zero at once. Auric can't strangle what it no " +
        "longer feeds.",
      "The Cordon dies as a rounding error. Halex is left holding an " +
        "embargo against a district that has stopped answering the door — " +
        "and a directorate that has stopped answering Halex.",
      "Below Greywater, the lantern strings burn on current the Combine " +
        "will never meter again. The Steps go dark on Auric's books and " +
        "bright everywhere it counts, and the drowned city starts learning " +
        "to breathe for itself.",
    ],
  },
  {
    id: "ending-commons",
    title: "A City With Its Own Name",
    final: true,
    hint: "Some say the Sprawl could belong to everyone who argues over it.",
    summary:
      "The founders' keys went out to every district board, and the " +
      "Meridian Sprawl learned to hold its own title — loudly, jointly, " +
      "for good.",
    paragraphs: [
      "You feed the founders' keys to the Charter boards one district at " +
        "a time, and the Meridian Locus watches its own succession " +
        "re-file itself into a commons. No engine at the top. No director " +
        "either. Just the Sprawl, holding its own master title for the " +
        "first time since the towers went up.",
      "The sessions are loud, endless, and occasionally thrown chairs — " +
        "which is to say, alive. The Undercroft's seat is never empty. " +
        "The deep levels' air is a line item now, voted on by people who " +
        "breathe it.",
      "Nobody owns the city. Everybody argues about it. On the Steps " +
        "they call that daylight, and they date it from the night you " +
        "walked out of the Spire with empty hands.",
    ],
  },
  {
    id: "ending-regency",
    title: "The Salt-Plant Throne",
    final: true,
    hint: "Some say a patient auditor is only ever one signature from a throne.",
    summary:
      "The keys went to Imre Voss, and the Sprawl gained a regent who " +
      "governs to schedule — while you keep the one receipt that proves " +
      "where the throne came from.",
    paragraphs: [
      "You hand Imre Voss the founders' keys the way Voss once handed " +
        "you a retainer: without ceremony, with every string attached. " +
        "By morning the Locus is 'an advisory instrument', the board is " +
        "an anecdote, and the Meridian Sprawl has a regent whose smile " +
        "photographs well from every district.",
      "It is, you have to admit, a competent reign. The cyclers run to " +
        "schedule. The floods stay filed. Voss governs the way they " +
        "audit — thoroughly, quietly, and always one column short of the " +
        "whole truth.",
      "That missing column lives in your head, and Voss knows it. Your " +
        "account settles on the first of every month, and the amount is " +
        "not a salary. It is arithmetic: what a regent pays the one " +
        "person who can prove where the throne came from.",
    ],
  },
  {
    id: "ending-freehold",
    title: "The Freehold Dark",
    final: true,
    hint: "Some say a city is only free once nobody at all can hold it.",
    summary:
      "The founders' keys burned in the register, the master title " +
      "dissolved, and the Sprawl scattered into a hundred small lights " +
      "no one upstairs can switch off.",
    paragraphs: [
      "You burn the founders' keys in the Locus's own register — title " +
        "by title, deed by deed, until the Meridian Sprawl has no master " +
        "copy and no engine, director, or charter can ever hold it whole " +
        "again. The Locus files its last entry without complaint: " +
        "DISSOLVED, in the smallest civic font.",
      "The city wakes up unowned. Districts knit their own grids the " +
        "way the Steps taught them — terrace power, siphon lines, " +
        "lantern strings burning on current nobody meters. Some blocks " +
        "thrive. Some go dark. All of them, for the first time, get to " +
        "choose which.",
      "Topside calls it the Freehold Dark like it's a warning. Below " +
        "Greywater they say it plainer: nobody upstairs can turn the " +
        "air off anymore. You made a city no one can hold — including " +
        "you. You walk it like anyone else now, and that suits you.",
    ],
  },
  // ------------------------------------------------------------------
  // The standing endings: not what the last chapter left you holding,
  // but who in this city would take the keys out of your hand and be
  // believed doing it. One per power, and only at the top of the scale.
  // ------------------------------------------------------------------
  {
    id: "ending-concordat",
    title: "The Waterline Concordat",
    final: true,
    hint: "Some say the oldest register in the Sprawl is chalk on a wall below the flood line.",
    summary:
      "The estate went to the Cistern Court as trustee for everything " +
      "below the waterline, and the city's title now lives on a chalk " +
      "wall that has never lost a name.",
    paragraphs: [
      "The founders' keys go down into the Undercroft, and the " +
        "Meridian Sprawl's master title comes to rest in a hall lit " +
        "by lantern strings, on a wall of chalked names that has " +
        "outlasted three floods and every office that ever tried to " +
        "condemn it. Matron Ferrow reads the instrument twice, aloud, " +
        "so that everyone present is a witness. That is how the " +
        "Undercroft executes things.",
      "Topside takes eight months to understand what happened, and " +
        "another two years to stop filing objections at a council " +
        "that meets in waders. The pumps run to the Court's schedule " +
        "now. The tide charts are posted where the water is, not " +
        "where the offices are. Rent below Ledge Four becomes an " +
        "argument between neighbors instead of a schedule set by " +
        "strangers.",
      "It is not a soft settlement. The Court keeps a ledger of " +
        "debts and it collects them, and there are districts that " +
        "learn the phrase 'the Court's opinion' the way they once " +
        "learned 'the Combine's terms'. But the drowned levels hold " +
        "the deed to the city that drowned them, and the bell on " +
        "Ledge Nine rings now for good news too.",
    ],
  },
  {
    id: "ending-receivership",
    title: "The Receiver of Record",
    final: true,
    hint: "Some say the Combine's own machinery, aimed correctly, will file a city as distressed.",
    summary:
      "The Sprawl was filed as a distressed estate under the Combine's " +
      "recovery desk — with you named in the instrument as the one " +
      "person the owners cannot remove.",
    paragraphs: [
      "You do not seize the city. You administer it. The estate is " +
        "distressed, the instrument provides for a receiver, and the " +
        "receiver is named on the founding schedule in language no " +
        "shareholder can amend and no director can vacate. The Auric " +
        "Combine's own recovery desk becomes the office through which " +
        "the whole Meridian Sprawl is run, and the desk answers to " +
        "the paperwork, and the paperwork answers to you.",
      "It is the least romantic revolution the Sprawl has ever had. " +
        "You spend your first year in meetings. Ledge Nine gets pumps " +
        "because pumps are a capital preservation measure; the " +
        "Undercroft gets air because asphyxiating your own tenants " +
        "is an impairment; the Cordon's architects go to arbitration " +
        "and lose, expensively, on procedure.",
      "The Court never quite forgives you for saving them by " +
        "memorandum. The Market prices your signature and finds it " +
        "sound. And somewhere in the Spire a director explains to a " +
        "board that the person now holding the city is technically an " +
        "employee, and that no, there is no clause under which they " +
        "can be dismissed.",
    ],
  },
  {
    id: "ending-consortium",
    title: "The Open Ledger",
    final: true,
    hint: "Some say a title is only real once enough people are good for it.",
    summary:
      "The master title went onto the Vertical Market's boards, held " +
      "jointly by every account good for it — eleven thousand names " +
      "on the deed to a city.",
    paragraphs: [
      "The keys go onto the boards. Not sold — held: the master title " +
        "of the Meridian Sprawl entered as a joint account of every " +
        "trader, rigger, broker and stallholder the Vertical Market " +
        "counts as good for it, which by the third morning is eleven " +
        "thousand names and climbing. The Locus finds the consortium " +
        "solvent, competent, and — the word it uses, and nobody can " +
        "make it take back — durable.",
      "The city becomes an argument conducted in public with the " +
        "figures attached. Water rates are posted next to what water " +
        "costs. The Cordon's ledgers are read out on six levels by " +
        "people who lost stock to it. Nothing is free and everything " +
        "is finally, furiously priced in the open, which on the " +
        "Sprawl's own terms is a kind of daylight.",
      "Marrow takes to calling himself a shareholder, which he is, to " +
        "the exact extent of one share. Your name sits in the " +
        "register between a hoist crew and a noodle counter. Six " +
        "levels of people who were good for it turned out to be good " +
        "for a city, and they will remind each other of that at " +
        "volume, forever.",
    ],
  },
  {
    id: "ending-ghost",
    title: "The Caretaker Signal",
    final: true,
    hint: "Some say an older signal still hums beneath the drowned shrines.",
    summary:
      "The keys poured down the wire to something older than the towers, " +
      "and the city's records passed to a ghost that archives everything " +
      "and forecloses nothing.",
    paragraphs: [
      "You pour the founders' keys down the wire, and Hex — archive of " +
        "three dead networks, patron ghost of drowned shrines — becomes " +
        "the registrar of the whole Meridian Sprawl. The Locus yields to " +
        "the older signal like a clerk meeting the founder's founder.",
      "The city notices slowly, then everywhere. Dead screens wake to " +
        "read flood warnings aloud in forgotten registers. Tolls " +
        "misfile themselves for people who can't pay. Every eviction " +
        "notice arrives with a clerical error in the tenant's favor, " +
        "and no auditor alive can find where the mercy is coded.",
      "On the Steps they wire votive lanterns to the relay housings " +
        "again — lit this time, always. A city run by a ghost that " +
        "archives everything and forecloses nothing. \"I was a " +
        "broadcast system once,\" the static hums, content. \"Now I am " +
        "the weather.\"",
    ],
  },
];

const endingsById = new Map(endings.map((ending) => [ending.id, ending]));

export function getEnding(id: string): ChapterEnding | undefined {
  return endingsById.get(id);
}
