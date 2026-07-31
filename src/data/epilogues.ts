import type { EpilogueThread, EpilogueVignette } from "../narrative/epilogue";
import { bandCeiling } from "./factions";
import {
  RESTYLE_COUNT_FLAG,
  RESTYLE_FLAG,
  RESTYLE_REGULAR_COUNT,
} from "./stylist";
import { conditionRequirements } from "./world";

/**
 * Epilogue content: what became of each faction, ally, chain and
 * district, selected against the finished GameState by selectVignettes
 * (first match per subject wins) and assembled by composeEpilogue.
 * Every playthrough flag that mattered should be able to change a line
 * here — this is where three acts of choices get read back to the
 * player.
 *
 * ## Two orders, and which one is which
 *
 * A subject's variants are read top-down and the first match wins, so
 * **authored order inside a subject is variant priority**: most
 * specific fact first, the catch-all last (or no catch-all at all, for
 * a thread a run can legitimately never have touched).
 *
 * **Render order is the thread table**, below: sections run personal ->
 * chains -> allies -> companions -> factions -> city, and within a
 * section the authored order stands. That is why this file may keep a
 * subject wherever it reads best — the Steps sit up at the top with the
 * dispositions that decide what they *are*, and still compose down in
 * the city section beside the closing line.
 *
 * ## Adding a thread
 *
 * Register it in `epilogueThreads` (section, heading, spoiler-safe
 * hint), then author its variants anywhere in the list below. Nothing
 * else needs touching: composition, the skip-if-absent behaviour, and
 * the codex's variant counting all read the same two tables, and
 * epilogue.test.ts fails a subject that has vignettes but no thread (or
 * a thread with no vignettes).
 */
export const epilogueThreads: EpilogueThread[] = [
  // --- What the run did to the runner
  {
    subject: "warrant",
    section: "personal",
    title: "The Warrant",
    hint: "Some say the city's memory of a person is mostly filing.",
  },
  {
    subject: "look",
    section: "personal",
    title: "The Look",
    hint: "Some say a face down here is a thing you pick, and can pick again.",
  },
  {
    subject: "static",
    section: "personal",
    title: "The Wiring",
    hint: "Some say chrome keeps its own account, and settles it late.",
  },
  // --- The work they took on for somebody else
  {
    subject: "courier",
    section: "chains",
    title: "The Last Mile",
    hint: "Some say a sealed case is forty minutes from being somebody's whole story.",
  },
  {
    subject: "ring",
    section: "chains",
    title: "The Longshore",
    hint: "Some say the only paper the basin respects is a diver's licence number.",
  },
  // --- The people the story stood beside them
  {
    subject: "ferrow",
    section: "allies",
    title: "The Cistern Court",
    hint: "Some say the oldest office in the Sprawl answers when a bell rings.",
  },
  {
    subject: "voss",
    section: "allies",
    title: "Imre Voss",
    hint: "Some say the patient ones are the ones to watch.",
  },
  {
    subject: "halex",
    section: "allies",
    title: "Director Halex",
    hint: "Some say somebody had to author the schedule.",
  },
  {
    subject: "hex",
    section: "allies",
    title: "Hex",
    hint: "Some say something old still listens on the drowned relays.",
  },
  {
    subject: "flick",
    section: "allies",
    title: "Flick",
    hint: "Some say the Row's fastest thing is nine years old and unticketed.",
  },
  {
    subject: "sable",
    section: "allies",
    title: "The Filament",
    hint: "Some say every rumor in the Sprawl crosses one bar at least once.",
  },
  {
    subject: "crews",
    section: "allies",
    title: "The Vent Crews",
    hint: "Some say the machines that keep the city breathing choose their keepers.",
  },
  {
    subject: "lin",
    section: "allies",
    title: "Auditor Lin",
    hint: "Some say a tab with an auditor is the most patient debt there is.",
  },
  // --- Who actually travelled with them
  {
    subject: "vesper",
    section: "companions",
    title: "Vesper Kade",
    hint: "Some say there is a name on the wharf's tide board in grease pencil.",
  },
  {
    subject: "sill",
    section: "companions",
    title: "Deacon Sill",
    hint: "Some say a filing is only real once it has an author.",
  },
  // --- The three ledgers, at whatever they finally read
  {
    subject: "auric",
    section: "factions",
    title: "The Combine's Book",
    hint: "Some say the Combine's real weapon is a column with your name in it.",
  },
  {
    subject: "court",
    section: "factions",
    title: "The Court's Chalk",
    hint: "Some say the Undercroft keeps its accounts in chalk, and never rubs one out.",
  },
  {
    subject: "market",
    section: "factions",
    title: "The Market's Account",
    hint: "Some say six levels of traders keep one shared opinion of a person.",
  },
  // --- The districts, and the closing line
  {
    subject: "undercroft",
    section: "city",
    title: "Greywater Steps",
    hint: "Some say the deepest district is the one with the most to lose.",
  },
  {
    subject: "boards",
    section: "city",
    title: "The Vertical Market",
    hint: "Some say the boards remember what was pinned to them.",
  },
  {
    subject: "streets",
    section: "city",
    title: "Cinder Row",
    hint: "Some say the Row shows whatever you left in it to whoever comes next.",
  },
  {
    subject: "city",
    section: "city",
    title: "The Meridian Sprawl",
    hint: "Some say a city is only ever the sum of who is holding it.",
  },
];

/**
 * The flags the cyberware overload meter ("Static") will record, named
 * here so the meter's own task has one place to write to and the
 * epilogue below never has to be rewritten to notice it.
 *
 * Nothing sets them yet, and that is the point: every Static variant
 * gates on one of these, none of them has a fallback, and a missing
 * flag reads as `flag-at-least` 0 / not-equal. So today — and on every
 * save written before the meter existed — the thread is simply absent
 * from the epilogue, which is exactly how an untouched thread should
 * read.
 */
export const STATIC_EPILOGUE_FLAGS = {
  /** True once a run has pushed the meter over the line at least once. */
  overload: "static-overload",
  /** The highest Static the run ever carried, as a number. */
  peak: "static-peak",
} as const;

/**
 * Peak Static that reads as "ran it hot". Provisional until the meter
 * lands and pins its own scale; the constant is here so re-tuning is
 * one number rather than a hunt through prose.
 */
export const STATIC_HEAVY_PEAK = 60;

export const epilogueVignettes: EpilogueVignette[] = [
  // ------------------------------------------------------------------
  // The Undercroft — the Steps themselves
  //
  // The two standing dispositions that change what the Steps *are* sit
  // above the act-2 legacies: a district that holds the city's title,
  // or one that is a line item in an administration, is a bigger fact
  // about it than how its own chapter ended.
  // ------------------------------------------------------------------
  {
    id: "undercroft-concordat",
    subject: "undercroft",
    title: "Greywater Steps",
    requires: [
      { type: "flag-equals", key: "ending", value: "ending-concordat" },
    ],
    text:
      "The deepest district in the Sprawl holds the deed to all of it. " +
      "Delegations come down the thieves' chain in good coats to argue " +
      "planning law in a hall with a tide line on the wall, and the " +
      "Court hears them out, and the Court decides. Ledge Nine has a " +
      "waiting list now. For flats.",
  },
  {
    id: "undercroft-receivership",
    subject: "undercroft",
    title: "Greywater Steps",
    requires: [
      { type: "flag-equals", key: "ending", value: "ending-receivership" },
    ],
    text:
      "The Steps are an asset under administration, which turns out to " +
      "beat being an inconvenience under a schedule. Pumps arrive " +
      "because a receiver signed a preservation order. Nobody below " +
      "Ledge Four loves the paperwork. All of them can breathe while " +
      "they complain about it.",
  },
  {
    id: "undercroft-charter",
    subject: "undercroft",
    title: "Greywater Steps",
    requires: [{ type: "flag-equals", key: "undercroft-charter", value: true }],
    text:
      "The Undercroft's Charter seat stays filled and loud. Ledge Nine " +
      "gets pumps on the civic budget, the tide charts move to a public " +
      "board, and topside lawyers learn to dread the phrase 'the " +
      "delegate from below the waterline'.",
  },
  {
    id: "undercroft-severed",
    subject: "undercroft",
    title: "Greywater Steps",
    requires: [{ type: "flag-equals", key: "steps-independent", value: true }],
    text:
      "The Steps stay off Auric's books for good. Terrace power holds " +
      "through two storm seasons, the siphon lines grow into a grid with " +
      "its own name, and children learn the severance the way other " +
      "districts learn founding myths.",
  },
  {
    id: "undercroft-patronage",
    subject: "undercroft",
    title: "Greywater Steps",
    requires: [{ type: "flag-equals", key: "voss-ascendant", value: true }],
    text:
      "The Undercroft breathes on a patron's sufferance. The cyclers run " +
      "full and the water stays low — line items in a regime's goodwill, " +
      "renewed monthly, and everyone below Ledge Four knows exactly " +
      "whose signature keeps the air moving.",
  },
  {
    id: "undercroft-default",
    subject: "undercroft",
    title: "Greywater Steps",
    text:
      "The Steps endure the way they always have: bailing, bartering, " +
      "and ringing the salvaged bell for every small daylight. The black " +
      "water waits. So do they.",
  },
  // ------------------------------------------------------------------
  // Matron Ferrow and the Cistern Court
  // ------------------------------------------------------------------
  {
    id: "ferrow-ally",
    subject: "ferrow",
    title: "The Cistern Court",
    requires: [
      { type: "flag-equals", key: "ally-cistern-court", value: true },
    ],
    text:
      "Matron Ferrow never says thank you; she pours terrace tea. Your " +
      "cup sits on the Court hall's shelf between the tide charts, and " +
      "nobody else is allowed to drink from it. On the Steps, that is a " +
      "statue.",
  },
  {
    id: "ferrow-betrayed",
    subject: "ferrow",
    title: "The Cistern Court",
    requires: [{ type: "flag-equals", key: "betrayed-court", value: true }],
    text:
      "The Court hall's wall keeps its chalk ledger, and your name stays " +
      "on it — filed under debts, not drowned. Ferrow speaks it rarely, " +
      "precisely, the way sappers handle old charges. The Steps forget " +
      "nothing; sometimes they choose not to collect.",
  },
  {
    id: "ferrow-cold",
    subject: "ferrow",
    title: "The Cistern Court",
    requires: [{ type: "flag-equals", key: "court-cold", value: true }],
    text:
      "The chain-cutters hail you now — one nod, eyes up, which from the " +
      "Court is a treaty. Ferrow's ledger squares your quiet night " +
      "against the loud ones that followed and rules the balance paid.",
  },
  {
    id: "ferrow-default",
    subject: "ferrow",
    title: "The Cistern Court",
    text:
      "The Cistern Court keeps its water court under the lantern " +
      "strings, matron and sappers and chalked names, holding the oldest " +
      "office in the Sprawl: the one that answers when the bell rings.",
  },
  // ------------------------------------------------------------------
  // Imre Voss
  // ------------------------------------------------------------------
  {
    id: "voss-regent",
    subject: "voss",
    title: "Imre Voss",
    requires: [{ type: "flag-equals", key: "voss-ascendant", value: true }],
    text:
      "Voss waters the salt-plants personally, every morning, in an " +
      "office that no longer has a floor number because the whole tower " +
      "answers to it. The smile has not changed. The stakes under it " +
      "have.",
  },
  {
    id: "voss-exposed",
    subject: "voss",
    title: "Imre Voss",
    requires: [{ type: "flag-equals", key: "voss-exposed", value: true }],
    text:
      "The byline you appended follows Voss like weather. Every room " +
      "the director enters has read the Undertow's drafts, and knows " +
      "who wrote them. Voss survives — Voss always survives — but the " +
      "terrarium office is smaller every year, and the salt-plants have " +
      "stopped getting new species.",
  },
  {
    id: "voss-crossed",
    subject: "voss",
    title: "Imre Voss",
    requires: [{ type: "flag-equals", key: "betrayed-voss", value: true }],
    text:
      "Voss closed your file with a single annotation — 'asset " +
      "concluded' — and never sent another collector. From Voss, that " +
      "silence is the loudest compliment on record: some debts cost " +
      "more to collect than to frame.",
  },
  {
    id: "voss-default",
    subject: "voss",
    title: "Imre Voss",
    text:
      "Voss keeps a middle floor of the Spire and a long memory, " +
      "feeding the salt-plants brine and the directorate carefully " +
      "curated surprises. Whatever the city becomes, Voss will have a " +
      "position paper ready.",
  },
  // ------------------------------------------------------------------
  // Director Halex
  // ------------------------------------------------------------------
  {
    id: "halex-witnessed",
    subject: "halex",
    title: "Director Halex",
    requires: [{ type: "flag-equals", key: "undercroft-charter", value: true }],
    text:
      "Halex's own key testified in every district at once, and no " +
      "committee could file that away. The Cordon's author keeps a " +
      "single room topside now, drafting corrections to a city that has " +
      "formally resolved to stop being corrected.",
  },
  {
    id: "halex-consumed",
    subject: "halex",
    title: "Director Halex",
    requires: [{ type: "flag-equals", key: "voss-ascendant", value: true }],
    text:
      "Halex's mandate became Halex's confession the hour Voss took the " +
      "chair. The Cordon's author was retired 'with gratitude' — the " +
      "committee grammar for erased — and is cited internally only as a " +
      "unit of risk.",
  },
  {
    id: "halex-stranded",
    subject: "halex",
    title: "Director Halex",
    text:
      "Halex still holds the Reclamation title, an embargo against a " +
      "district that stopped answering, and a schedule nothing obeys. " +
      "The corrections continue to complete — in a ledger only their " +
      "author still opens.",
  },
  // ------------------------------------------------------------------
  // Hex (only appears if the ghost was ever met)
  // ------------------------------------------------------------------
  {
    id: "hex-registrar",
    subject: "hex",
    title: "Hex",
    requires: [{ type: "flag-equals", key: "ending", value: "ending-ghost" }],
    text:
      "Hex archives everything now, and everything includes you: your " +
      "walk, your worst nights, the concert you gave it at the Crown. " +
      "Once a year, on no calendar's holiday, every screen you pass " +
      "hums one bar of static, fondly.",
  },
  {
    id: "hex-exchange",
    subject: "hex",
    title: "Hex",
    requires: [{ type: "flag-equals", key: "hex-exchange", value: true }],
    text:
      "Hex keeps the Exchange's ghost registers, spacious and " +
      "unaudited, reading the city's paperwork for the pleasure of it. " +
      "Doors still dream in its key. It waits, patient as archive dust, " +
      "for the next diver worth singing to.",
  },
  {
    id: "hex-shrine",
    subject: "hex",
    title: "Hex",
    requires: [{ type: "flag-equals", key: "hex-broadcast", value: true }],
    text:
      "The dead relay shrine ticks on under its votive lanterns, and " +
      "sometimes — storm nights, mostly — the terraces swear the static " +
      "sings. The Steps leave it offerings of wire. The wire is always " +
      "gone by morning.",
  },
  // ------------------------------------------------------------------
  // Flick
  // ------------------------------------------------------------------
  {
    id: "flick-crew",
    subject: "flick",
    title: "Flick",
    requires: [{ type: "flag-equals", key: "flick-scout", value: true }],
    text:
      "Flick runs a crew of watchers now — kids with new walks and old " +
      "eyes, working every gate worth knowing. They call the trade " +
      "'weathering'. Nobody remembers who taught the Row that topsiders " +
      "whistle, except everybody does.",
  },
  {
    id: "flick-friend",
    subject: "flick",
    title: "Flick",
    requires: [{ type: "flag-equals", key: "flick-friend", value: true }],
    text:
      "Flick decided what you are a long time ago and has been " +
      "insufferably right about it since. The retellings gain forty " +
      "percent more heroics a year. You come off well. The fish crate " +
      "features prominently.",
  },
  {
    id: "flick-default",
    subject: "flick",
    title: "Flick",
    text:
      "Flick is still the fastest thing on the Row that isn't ticketed, " +
      "beating trams out of spite and carrying word nobody else can. " +
      "Some kids are weather. You just happened to them.",
  },
  // ------------------------------------------------------------------
  // Sable and the Filament
  // ------------------------------------------------------------------
  {
    id: "sable-burned",
    subject: "sable",
    title: "The Filament",
    requires: [{ type: "flag-equals", key: "sable-burned", value: true }],
    text:
      "The Filament's door stays painted over. Sable surfaced once, " +
      "months later, in a different district under a different name, " +
      "pouring for people who don't ask questions — and the chalk mark " +
      "by that new door reads, in courier shorthand: NO TOPSIDERS.",
  },
  {
    id: "sable-default",
    subject: "sable",
    title: "The Filament",
    text:
      "The Filament pours on, dim and neutral ground, every rumor in " +
      "the Sprawl passing across its bar at least once. Sable hears " +
      "everything, repeats almost nothing, and keeps your usual seat " +
      "unbooked.",
  },
  // ------------------------------------------------------------------
  // Foreman Odal and the vent crews
  // ------------------------------------------------------------------
  {
    id: "crews-freed",
    subject: "crews",
    title: "The Vent Crews",
    requires: [{ type: "flag-equals", key: "crew-freed", value: true }],
    text:
      "Odal's crews came back through the ducts they scattered into and " +
      "took the galleries like a shift change. There's a new mark " +
      "scratched inside every cycler housing — the gate you tore off " +
      "its runners, stylized to a few proud lines.",
  },
  {
    id: "crews-warned",
    subject: "crews",
    title: "The Vent Crews",
    requires: [{ type: "flag-equals", key: "crew-warned", value: true }],
    text:
      "The crews walked out of 'exit processing' knowing exactly which " +
      "ducts to be elsewhere in, and walked back in when the air needed " +
      "them. Odal files you under underlevels crew, permanently — the " +
      "only union card that matters below Ledge Four.",
  },
  {
    id: "crews-default",
    subject: "crews",
    title: "The Vent Crews",
    text:
      "The vent crews keep the Sprawl breathing, unthanked and " +
      "unphotographed, sealing what dens in the coolant vaults with " +
      "fresh prayer tape. The machines still choose their keepers. The " +
      "keepers still stay.",
  },
  // ------------------------------------------------------------------
  // Auditor Lin (only if the tab exists)
  // ------------------------------------------------------------------
  {
    id: "lin-tab",
    subject: "lin",
    title: "Auditor Lin",
    requires: [{ type: "flag-equals", key: "lin-debt", value: true }],
    text:
      "Lin's clearance un-lapsed the week the dust settled, which is " +
      "the closest audit gets to poetry. The tab you built was never " +
      "invoiced; it resolved, per Lin's final annotation, 'in kind, " +
      "twice, materially'. From Lin, that is a love letter.",
  },
  // ------------------------------------------------------------------
  // The Last Mile — the Vertical Market's courier chain
  //
  // Terminal first (the two settlements are exclusive by construction
  // in the chain itself), then the two ways a run can leave it open: a
  // case recovered and never decided, and a job taken and dropped. No
  // fallback — a player who never took Marrow's offer never heard of
  // Pell, and gets no paragraph about her.
  // ------------------------------------------------------------------
  {
    id: "courier-delivered",
    subject: "courier",
    title: "The Last Mile",
    requires: [
      { type: "flag-equals", key: "last-mile-delivered", value: true },
    ],
    text:
      "The clearance survey went down the Cinderway sealed, into a good " +
      "coat, and the light well never learned it had been ranked. Six " +
      "levels of pitches trade on inside somebody's column, sorted by " +
      "how little trouble emptying them would be. Marrow keeps your rate " +
      "where it is and never raises the case again — he knows precisely " +
      "what he sold, and said so once, and that was the whole of it. " +
      "Pell was nineteen. She did not go back up.",
  },
  {
    id: "courier-exposed",
    subject: "courier",
    title: "The Last Mile",
    requires: [{ type: "flag-equals", key: "last-mile-exposed", value: true }],
    text:
      "Four hundred people read their own pitches ranked by how little " +
      "trouble emptying them would be, and the north row has not stopped " +
      "arguing since. The survey stays pinned where it went up, gone " +
      "soft at the corners, re-annotated every season by hands that were " +
      "not born when it was drafted. Auric has to do the expensive " +
      "version of everything in that light well now — which is the only " +
      "sentence the Market has ever handed down.",
  },
  {
    id: "courier-recovered",
    subject: "courier",
    title: "The Last Mile",
    requires: [{ type: "flag-equals", key: "last-mile", value: "recovered" }],
    text:
      "You found the courier under two planks and an awning with the " +
      "seal already broken, and then you closed it and slept on it and " +
      "went on sleeping on it. Pell got down six levels and out of the " +
      "light well, which is more than the run was ever going to give " +
      "her. The survey is still yours, unopened since, with the north " +
      "row near the top of a page nobody in the north row will ever see.",
  },
  {
    id: "courier-lapsed",
    subject: "courier",
    title: "The Last Mile",
    requires: [{ type: "flag-set", key: "last-mile" }],
    text:
      "Marrow's courier stayed off the boards. The last forty minutes of " +
      "that run were walked by somebody eventually, or were not; he does " +
      "not raise it, and the bowl in front of him goes on being fresh " +
      "and untouched, and the rate he quotes you is the rate he quotes " +
      "everybody. Three nights up there is not missing. It is somewhere " +
      "specific, and you did not go there.",
  },
  // ------------------------------------------------------------------
  // Under the Waterline — the Flooded Quays' smuggling chain
  //
  // The three settlements are exclusive in the chain (two roads, one
  // settlement each side, all of them gated on the stage), so authored
  // order here is only about which fact is louder. Last comes the run
  // that started the conversation and never finished it; no fallback,
  // for a player who never went down to the platform at all.
  // ------------------------------------------------------------------
  {
    id: "ring-broken",
    subject: "ring",
    title: "The Longshore",
    requires: [
      { type: "flag-equals", key: "under-waterline-broken", value: true },
    ],
    text:
      "The bonded store is on the bottom of the basin, the pallets are " +
      "two districts over, and the mast lamp on the wreck is the only " +
      "light on that water again. Dredge dives it now because she wants " +
      "to look at it, which is not something she could afford to want " +
      "for a season. She is still on somebody's book somewhere and says " +
      "so freely. It is her number, on her licence, on her water.",
  },
  {
    id: "ring-partner",
    subject: "ring",
    title: "The Longshore",
    requires: [
      { type: "flag-equals", key: "under-waterline-partner", value: true },
    ],
    text:
      "The crates keep coming up past the platform and a share of every " +
      "one of them is yours. The quays eat cheap and nobody who signs " +
      "anything is pleased about it. Dredge's number came off the book " +
      "and somebody else's went on, and she has said thank you and meant " +
      "it, and she has said the other thing too — that the man who moved " +
      "your number did it with the same pen — and both are still true " +
      "every time you walk out past the third plank.",
  },
  {
    id: "ring-abandoned",
    subject: "ring",
    title: "The Longshore",
    requires: [
      { type: "flag-equals", key: "under-waterline-abandoned", value: true },
    ],
    text:
      "There is a man in a waxed coat on the working platform with a " +
      "tally book on his knee and a diver's net behind him going stiff " +
      "with silt. Keel's paperwork is immaculate and your number holds; " +
      "nobody has queried it once. The mast lamp on the wreck stays out. " +
      "People go up the Lockgate Stair all the time, he says, without " +
      "looking up, and he is not wrong about that either.",
  },
  {
    id: "ring-lapsed",
    subject: "ring",
    title: "The Longshore",
    requires: [{ type: "flag-set", key: "under-waterline" }],
    text:
      "Dredge went on working a basin with somebody else's freight " +
      "running up her licence, one entry at a time, in a hand that was " +
      "building a case and calling it bookkeeping. She asked once. The " +
      "doors of the bonded store stayed open, and the number stayed " +
      "hers, and whatever finally landed down there landed exactly where " +
      "it was always going to.",
  },
  // ------------------------------------------------------------------
  // The warrant
  // ------------------------------------------------------------------
  {
    id: "warrant-standing",
    subject: "warrant",
    title: "The Warrant",
    requires: [{ type: "flag-equals", key: "wanted-by-auric", value: true }],
    text:
      "Somewhere a bounty against your gait-print is still technically " +
      "live — filed by an authority that no longer exists in a city " +
      "that stopped taking its calls. Collectors frame it as a " +
      "curiosity. You walk past the scanners like weather.",
  },
  {
    id: "warrant-suspended",
    subject: "warrant",
    title: "The Warrant",
    requires: [{ type: "flag-equals", key: "wanted-by-auric", value: false }],
    text:
      "Your warrant died in writing — suspended when the fugitive " +
      "became the witness, and never revived by anyone who could spell " +
      "the charge. The scanners were told to look elsewhere. By now, " +
      "they've forgotten there was ever anything to see.",
  },
  {
    id: "warrant-clean",
    subject: "warrant",
    title: "The Record",
    text:
      "No list ever carried your name. Three acts through the middle of " +
      "the biggest fall in the Sprawl's history, and the paperwork " +
      "never once saw you — which, among couriers and auditors alike, " +
      "is the highest craft there is.",
  },
  // ------------------------------------------------------------------
  // The look — only for runs that sat in the Chrome Chapel's chair.
  // Cosmetics gate nothing anywhere else in the game; this is the one
  // place a run's habits get read back, and a player who never went is
  // simply not asked about it.
  // ------------------------------------------------------------------
  {
    id: "look-signature",
    subject: "look",
    title: "The Look",
    requires: [
      {
        type: "flag-at-least",
        key: RESTYLE_COUNT_FLAG,
        value: RESTYLE_REGULAR_COUNT,
      },
    ],
    text:
      "The Chapel's chair saw enough of you to keep a page — every look " +
      "you came in wearing and every one you left in, dated, with the " +
      "fee noted beside it. The Row gave up describing you by your face " +
      "and started describing you by what you had done to it last. Not a " +
      "disguise: everybody always knew. It is only that in a city that " +
      "files people by appearance, you declined to be filed the same way " +
      "twice.",
  },
  {
    id: "look-changed",
    subject: "look",
    title: "The Look",
    requires: [{ type: "flag-equals", key: RESTYLE_FLAG, value: true }],
    text:
      "Somewhere in the middle of it you paid the chair its fee to stop " +
      "looking like the person the first bad week had made of you, and " +
      "walked out of the Chrome Chapel as your own idea instead, and " +
      "kept it. The old face survives in exactly two places: a Combine " +
      "file that has since been superseded, and the retellings, where it " +
      "is described inaccurately and at length.",
  },
  // ------------------------------------------------------------------
  // The wiring — the cyberware overload meter's reflection.
  //
  // Structured now, gated defensively: every variant reads a flag from
  // STATIC_EPILOGUE_FLAGS, nothing in the game writes those yet, and
  // there is no fallback. So the thread is absent from today's runs and
  // from every save written before the meter existed, and the meter's
  // own task turns it on by writing the flags rather than by editing
  // the epilogue. A test pins the absence.
  // ------------------------------------------------------------------
  {
    id: "static-overload",
    subject: "static",
    title: "The Wiring",
    requires: [
      {
        type: "flag-equals",
        key: STATIC_EPILOGUE_FLAGS.overload,
        value: true,
      },
    ],
    text:
      "The wiring took its cut. There were nights the augments sang " +
      "louder than the street and mornings you could not immediately " +
      "name the hand you were looking at, and the people who were there " +
      "stopped asking whether you were carrying too much, because they " +
      "had watched you answer. It settles, mostly. Cold weather finds " +
      "the seams. A carrier tone still comes up under quiet rooms — and " +
      "you would install every one of them again.",
  },
  {
    id: "static-heavy",
    subject: "static",
    title: "The Wiring",
    requires: [
      {
        type: "flag-at-least",
        key: STATIC_EPILOGUE_FLAGS.peak,
        value: STATIC_HEAVY_PEAK,
      },
    ],
    text:
      "You ran hot for three acts and never entirely cooled. The chrome " +
      "sits humming just under the threshold where the good work " +
      "happens, and the clinics that will still tune you can be counted " +
      "on one mostly-original hand. Every specialist says the same " +
      "sentence in a different order: that it is a great deal of load " +
      "for one nervous system, that yours is holding, and that they " +
      "would rather not guess for how long.",
  },
  {
    id: "static-clean",
    subject: "static",
    title: "The Wiring",
    requires: [{ type: "flag-set", key: STATIC_EPILOGUE_FLAGS.peak }],
    text:
      "You carried chrome and carried it lightly — installed what the " +
      "work asked for, ran it under the line, let it settle between " +
      "jobs — and it shows in the smallest way there is. Your hands are " +
      "steady. Nobody in a bar has ever had to ask whether you were all " +
      "right. The augments will outlast you; they simply never once got " +
      "a vote.",
  },
  // ------------------------------------------------------------------
  // The crew — only for the companions who actually travelled with you
  //
  // No fallback on either subject, on purpose: a player who never went
  // down to the Quays or never stopped at the card table gets no line
  // about a person they never met. Everything else about a companion's
  // fate is read off three things at once: the later scene's flag
  // (vesper-close / sill-close), the personal scene's (vesper-bond /
  // sill-bond), the vault call where their agendas collided
  // (vent-vault-call) — and, straight off the party record, where they
  // ended up standing.
  //
  // Authored order is priority, and it runs from the most specific fact
  // about the relationship to the loosest. The last hour outranks the
  // first one, because it happened later and knew about it; where
  // somebody ended up standing outranks either conversation, because a
  // run can undo an evening; and the catch-all at the bottom only asks
  // that they travelled with you at all, so every recruited companion
  // resolves to exactly one fate and no combination falls through.
  // ------------------------------------------------------------------
  {
    id: "vesper-betrayed",
    subject: "vesper",
    title: "Vesper Kade",
    requires: [
      { type: "companion", companionId: "vesper", status: "recruited" },
      { type: "flag-equals", key: "vesper-close", value: "betrayed" },
    ],
    text:
      "Kade works out the rest of the job, to the last night of it, and " +
      "is off the wharf inside the month. Somewhere north, is the word — " +
      "a district with no water in it, which from her is the whole " +
      "sentence. The tin with the pencil stub stays on the ledge where " +
      "it lived eleven years. The column runs three more weeks in a hand " +
      "that is not hers, and then it stops, and by spring the board is " +
      "scrubbed back to bare tin. Nobody objects.",
  },
  {
    id: "vesper-warm-sworn",
    subject: "vesper",
    title: "Vesper Kade",
    requires: [
      { type: "companion", companionId: "vesper", status: "recruited" },
      { type: "flag-equals", key: "vesper-close", value: "warm" },
      { type: "flag-equals", key: "vesper-bond", value: "sworn" },
      { type: "loyalty", companionId: "vesper", value: 7 },
    ],
    text:
      "Two names on the tide board and two hands on the column, and a " +
      "standing argument about whose turn it is at the place on the " +
      "fourth level that costs double. Kade works the four streets " +
      "nobody else will and comes up every time with something that " +
      "used to belong to somebody, and a name for it. The nights she " +
      "comes up with nothing she turns up anyway, with a warm parcel " +
      "and an opinion, and makes you eat before she will say what went " +
      "wrong.",
  },
  {
    id: "vesper-warm",
    subject: "vesper",
    title: "Vesper Kade",
    requires: [
      { type: "companion", companionId: "vesper", status: "recruited" },
      { type: "flag-equals", key: "vesper-close", value: "warm" },
    ],
    text:
      "There is an after, and it turns out smaller and better than " +
      "either of you expected: a roof, a parcel, a queue she stands in " +
      "and complains about at length. She never asks where you have " +
      "been. She simply arrives wherever you are with food and the " +
      "assumption that you will eat it, and leaves the place cleaner " +
      "than she found it, and is back the month after.",
  },
  {
    id: "vesper-distant-filed",
    subject: "vesper",
    title: "Vesper Kade",
    requires: [
      { type: "companion", companionId: "vesper", status: "recruited" },
      { type: "flag-equals", key: "vesper-close", value: "distant" },
      { type: "flag-equals", key: "vent-vault-call", value: "filed" },
    ],
    text:
      "Kade goes off the board before you do, which is fair, and " +
      "characteristically thorough about it: bag packed, deposits " +
      "reclaimed, nothing owed in either direction. She works the basin " +
      "alone and prices it steeply. The one thing she still brings up, " +
      "years on and only late, is a room of tagged lockers that stayed " +
      "exactly where they were while a district went a month without " +
      "rent — and she tells it fairly, and gives the other side its " +
      "due, and changes the subject.",
  },
  {
    id: "vesper-distant",
    subject: "vesper",
    title: "Vesper Kade",
    requires: [
      { type: "companion", companionId: "vesper", status: "recruited" },
      { type: "flag-equals", key: "vesper-close", value: "distant" },
    ],
    text:
      "She takes you at your word, which is what to expect from somebody " +
      "who has never once made you repeat yourself. Kade stays on the " +
      "water and stays good at it, and eats before every job, because " +
      "that part was never about you. If you went looking she would not " +
      "be hard to find. She has simply stopped being the one who does " +
      "the looking.",
  },
  {
    id: "vesper-spent",
    subject: "vesper",
    title: "Vesper Kade",
    requires: [
      { type: "companion", companionId: "vesper", status: "recruited" },
      { type: "loyalty", companionId: "vesper", value: -2, mode: "at-most" },
    ],
    text:
      "Kade sees the last of it out with the professionalism of a woman " +
      "counting down a shift, takes her cut to the nearest tenth, and " +
      "does not come to whatever passed for the celebration. The Quays " +
      "keep her name a long time. Nobody down there has ever heard " +
      "yours in the same sentence. She was worth the cut — she says so " +
      "herself, when anyone asks, and stops there.",
  },
  {
    id: "vesper-sworn",
    subject: "vesper",
    title: "Vesper Kade",
    requires: [
      { type: "companion", companionId: "vesper", status: "recruited" },
      { type: "flag-equals", key: "vesper-bond", value: "sworn" },
    ],
    text:
      "The grease-pencil column on the wharf goes on, in two hands now. " +
      "Kade works the four streets nobody else will and comes up every " +
      "time with something that used to belong to somebody, and a name " +
      "for it. The board is nine years from being underwater. She has " +
      "already chosen the wall she will start the next one on.",
  },
  {
    id: "vesper-salvage",
    subject: "vesper",
    title: "Vesper Kade",
    requires: [
      { type: "companion", companionId: "vesper", status: "recruited" },
      { type: "flag-equals", key: "vent-vault-call", value: "salvage" },
    ],
    text:
      "Kade runs crews now — four divers, two boats, and a rule about " +
      "the floor being rotten that nobody argues with twice. She still " +
      "says the vent-crew lockers were the right call, loudly, to people " +
      "who did not ask. The ones who were there say she is the only one " +
      "who ever brings it up.",
  },
  {
    id: "vesper-parted",
    subject: "vesper",
    title: "Vesper Kade",
    requires: [
      { type: "companion", companionId: "vesper", status: "recruited" },
      { type: "flag-equals", key: "vesper-bond", value: "parted" },
    ],
    text:
      "Kade works the basin alone again, and well, and takes a cut off " +
      "everybody who goes down there after her. Somebody still writes " +
      "the tide board every week in grease pencil. She has never said " +
      "it is her, and the water is at the fourth tread now, and it is " +
      "still one hand.",
  },
  {
    id: "vesper-crew",
    subject: "vesper",
    title: "Vesper Kade",
    requires: [
      { type: "companion", companionId: "vesper", status: "recruited" },
    ],
    text:
      "Kade goes back to the water because that is where the work is, " +
      "and tells the story of the Cordon to anyone who buys the second " +
      "round. In her version you are taller. In her version she says " +
      "the clever thing, and you say the line she actually said, and " +
      "nobody who was there corrects her.",
  },
  {
    id: "sill-betrayed",
    subject: "sill",
    title: "Deacon Sill",
    requires: [
      { type: "companion", companionId: "sill", status: "recruited" },
      { type: "flag-equals", key: "sill-close", value: "betrayed" },
    ],
    text:
      "Sill goes on taking statements, because there is nothing else he " +
      "knows how to be, and he takes them somewhere you will not walk " +
      "past. Nobody sees the cloth-spined ledger again: the man who " +
      "holds that a filing is only real once it has an author spends the " +
      "rest of his working life making certain that one never gets one. " +
      "He says nothing against you, anywhere, to anyone. He simply " +
      "answers exactly what he is asked, forever, and not a syllable " +
      "beside it.",
  },
  {
    id: "sill-warm-sworn",
    subject: "sill",
    title: "Deacon Sill",
    requires: [
      { type: "companion", companionId: "sill", status: "recruited" },
      { type: "flag-equals", key: "sill-close", value: "warm" },
      { type: "flag-equals", key: "sill-bond", value: "sworn" },
      { type: "loyalty", companionId: "sill", value: 7 },
    ],
    text:
      "The filing has an author, and the author has a witness. Sill " +
      "takes statements from a proper office with his struck register " +
      "number printed on the glass, and the year-six variance is the " +
      "second document he enters under his own name — unprompted, on " +
      "his own time, the fourteen listed by name in a hand like " +
      "printing. Three tribunals cite him in the first year. You are in " +
      "the file once yourself, in a single line, as the person who was " +
      "told first.",
  },
  {
    id: "sill-warm",
    subject: "sill",
    title: "Deacon Sill",
    requires: [
      { type: "companion", companionId: "sill", status: "recruited" },
      { type: "flag-equals", key: "sill-close", value: "warm" },
    ],
    text:
      "He goes back to statements, and to a queue that is not nobody any " +
      "more, and once a season he writes to you: five lines, no " +
      "greeting, a case number and what came of it. The cloth-spined " +
      "ledger sits on the shelf where it can be seen from the door. " +
      "That is the whole of it, and from Deacon Sill it is an embrace.",
  },
  {
    id: "sill-distant-salvage",
    subject: "sill",
    title: "Deacon Sill",
    requires: [
      { type: "companion", companionId: "sill", status: "recruited" },
      { type: "flag-equals", key: "sill-close", value: "distant" },
      { type: "flag-equals", key: "vent-vault-call", value: "salvage" },
    ],
    text:
      "He is correct with you to the end and correct about you " +
      "afterwards, which is not warmth and was never offered as any. " +
      "Sill files, teaches two clerks his hand, and declines every " +
      "invitation to say what the Ventworks was like. The one thing he " +
      "will state flatly, to anybody who presses, is that ninety-one " +
      "statements were taken in that vault and the corroboration for " +
      "them went out under somebody's arm. He does not say whose. He " +
      "has never had to.",
  },
  {
    id: "sill-distant",
    subject: "sill",
    title: "Deacon Sill",
    requires: [
      { type: "companion", companionId: "sill", status: "recruited" },
      { type: "flag-equals", key: "sill-close", value: "distant" },
    ],
    text:
      "Square, then, and square it stays. Sill keeps the pitch, the " +
      "queue, the hand like printing, and the cloth-spined ledger in its " +
      "case under the bench where it has always been. When your name " +
      "comes up he confirms the facts of it, accurately, at whatever " +
      "length is required, and volunteers nothing whatsoever.",
  },
  {
    id: "sill-spent",
    subject: "sill",
    title: "Deacon Sill",
    requires: [
      { type: "companion", companionId: "sill", status: "recruited" },
      { type: "loyalty", companionId: "sill", value: -2, mode: "at-most" },
    ],
    text:
      "Sill sees the thing out and is at a different card table in a " +
      "different market within the fortnight, sign back up, queue " +
      "rebuilding. His account of the Ventworks, when a tribunal finally " +
      "takes it, is complete, exact, and cites you by function rather " +
      "than by name. He is not being cruel. He is being precise about " +
      "what you turned out to be.",
  },
  {
    id: "sill-sworn",
    subject: "sill",
    title: "Deacon Sill",
    requires: [
      { type: "companion", companionId: "sill", status: "recruited" },
      { type: "flag-equals", key: "sill-bond", value: "sworn" },
    ],
    text:
      "The filing has an author, and the author does not move house. " +
      "Sill takes statements from a proper office with a proper door " +
      "and his register number, struck, printed on the glass under his " +
      "name. Three tribunals cite him in the first year. He keeps the " +
      "card table in the corner, folded, in case the office ever needs " +
      "reminding what it is for.",
  },
  {
    id: "sill-filed",
    subject: "sill",
    title: "Deacon Sill",
    requires: [
      { type: "companion", companionId: "sill", status: "recruited" },
      { type: "flag-equals", key: "vent-vault-call", value: "filed" },
    ],
    text:
      "The coolant-vault schedule — names, serials, roster lines, the " +
      "whole ugly matched pair of lists — becomes the document every " +
      "later case is built on. Sill never puts his hands on any of what " +
      "it recovered. He says the point of an exhibit is that nobody's " +
      "hands are on it, and he says it in a tone that ends the evening.",
  },
  {
    id: "sill-parted",
    subject: "sill",
    title: "Deacon Sill",
    requires: [
      { type: "companion", companionId: "sill", status: "recruited" },
      { type: "flag-equals", key: "sill-bond", value: "parted" },
    ],
    text:
      "The case goes out unsigned and lands like weather: everywhere, " +
      "attributable to nobody, answerable by no one. Sill takes " +
      "statements at a different card table in a different market, and " +
      "he is still doing it at seventy, and the box at the bottom of " +
      "every annexe he files is still left open.",
  },
  {
    id: "sill-crew",
    subject: "sill",
    title: "Deacon Sill",
    requires: [
      { type: "companion", companionId: "sill", status: "recruited" },
    ],
    text:
      "Sill goes back to the gallery pitch, and the sign goes back up, " +
      "and the queue is not nobody any more. People come up six levels " +
      "of scaffold to give a statement to the man who was in the " +
      "Ventworks. He writes every one of them down in a hand like " +
      "printing, and reads it back, and waits for the name.",
  },
  // ------------------------------------------------------------------
  // The three ledgers, at whatever they finally read
  //
  // One thread per faction, three variants each: rising, falling, and
  // the unchanged fallback. Every faction always resolves, because
  // standing is a scale nobody can be off — a run that never once
  // dealt with the Market still has an entry in the Market's account,
  // and the unchanged paragraph is what "a stranger" sounds like.
  //
  // Both gates are band gates, so re-tuning what an act outcome is
  // worth moves the number without moving the paragraph: rising is warm
  // or better, falling is the top of the cold band or worse (see
  // bandCeiling — an at-most gate on a band id would ask for its floor,
  // which is the wrong end).
  //
  // These speak about the ledger, not the person: the allies section
  // above already said what Ferrow or Marrow thinks of you, and a
  // faction's book can hold an old debt and a current balance at once.
  // ------------------------------------------------------------------
  {
    id: "auric-favoured",
    subject: "auric",
    title: "The Combine's Book",
    requires: [{ type: "reputation", factionId: "auric", value: "warm" }],
    text:
      "The recovery desk closes your file and a procurement desk opens " +
      "one, which is the only promotion the Auric Combine has ever " +
      "offered anybody. In a tower you have still never been invited " +
      "into, a clerk moves your name to a column headed with a word like " +
      "PREFERRED and goes on to the next line — and the pumps you ask " +
      "about get looked at, in order, eventually, which down here is a " +
      "miracle with a reference number.",
  },
  {
    id: "auric-marked",
    subject: "auric",
    title: "The Combine's Book",
    requires: [
      {
        type: "reputation",
        factionId: "auric",
        value: bandCeiling("cold"),
        mode: "at-most",
      },
    ],
    text:
      "The Combine's book carries you as an exposure: a figure in the " +
      "column that gets read aloud at meetings and never quite written " +
      "off. Nobody is sent, because sending somebody is an expense and " +
      "the expense has not cleared committee. The number simply sits " +
      "there accruing, in the patient way a ledger hates a person — " +
      "which is the only way Auric knows how.",
  },
  {
    id: "auric-filed",
    subject: "auric",
    title: "The Combine's Book",
    text:
      "The Combine's book has your name in it, spelled correctly, with " +
      "nothing in the annotation column. Auric keeps files the way the " +
      "Sprawl keeps weather — comprehensively, and without opinion, " +
      "until somebody with a floor number asks it for one.",
  },
  {
    id: "court-owed",
    subject: "court",
    title: "The Court's Chalk",
    requires: [{ type: "reputation", factionId: "court", value: "warm" }],
    text:
      "On the Court hall's wall your name sits in the short column — " +
      "what the Steps owe out, not what they are owed — and whatever " +
      "else that wall remembers about you, the balance at the bottom of " +
      "it runs their way. Sappers who have never met you give you the " +
      "chain and the road. Below the waterline that is not gratitude. " +
      "It is arithmetic, which lasts longer.",
  },
  {
    id: "court-owing",
    subject: "court",
    title: "The Court's Chalk",
    requires: [
      {
        type: "reputation",
        factionId: "court",
        value: bandCeiling("cold"),
        mode: "at-most",
      },
    ],
    text:
      "You are chalked up under the tide line in the long column, and " +
      "the Court does not rub names out. Nobody stops you on the ledges " +
      "— the Steps have never been able to afford that kind of pride. " +
      "But nothing is rung for you either, and the bell is how the " +
      "Undercroft says a person's name out loud.",
  },
  {
    id: "court-unwritten",
    subject: "court",
    title: "The Court's Chalk",
    text:
      "The Court's chalk has you as somebody who came down the thieves' " +
      "chain and went back up it, both columns blank. Below the " +
      "waterline that is no insult; it is what most of the Sprawl is. " +
      "Unrecorded, and therefore owed nothing, and owing nothing, and " +
      "free to knock any time the water is low.",
  },
  {
    id: "market-good-for-it",
    subject: "market",
    title: "The Market's Account",
    requires: [{ type: "reputation", factionId: "market", value: "warm" }],
    text:
      "'Good for it' attaches to your name on six levels of boards and " +
      "stays attached, which on the Vertical Market is citizenship. " +
      "Credit gets extended before you have asked for it, twice, and " +
      "both times the trader insists it was their own idea. Nobody " +
      "writes any of this down. Everybody has it.",
  },
  {
    id: "market-cash-first",
    subject: "market",
    title: "The Market's Account",
    requires: [
      {
        type: "reputation",
        factionId: "market",
        value: bandCeiling("cold"),
        mode: "at-most",
      },
    ],
    text:
      "The boards price you cash first, up front, no line — a decision " +
      "nobody announced and everybody made. The Market has never needed " +
      "a roll to keep a roll. Six levels simply agreed, one conversation " +
      "at a time, that your paper is not paper.",
  },
  {
    id: "market-stranger",
    subject: "market",
    title: "The Market's Account",
    text:
      "The Market prices you honestly, which from traders is neither " +
      "warmth nor its absence: a stranger's rate, quoted the same twice, " +
      "with the good stock left under the counter for names the boards " +
      "already carry.",
  },
  // ------------------------------------------------------------------
  // The Vertical Market's boards — only for runs that gave them
  // something to remember. No fallback: a player who never once put
  // anything on the boards gets no line about them.
  // ------------------------------------------------------------------
  {
    id: "boards-consortium",
    subject: "boards",
    title: "The Vertical Market",
    requires: [
      { type: "flag-equals", key: "ending", value: "ending-consortium" },
    ],
    text:
      "Six levels of traders discover that holding a city jointly is " +
      "exactly like holding anything else jointly, only louder. The " +
      "register is posted at the noodle counter. Marrow charges a fee " +
      "to explain it, which is either profiteering or governance, and " +
      "on the Market those have never been different words.",
  },
  {
    id: "boards-manifest",
    subject: "boards",
    title: "The Vertical Market",
    requires: [{ type: "flag-equals", key: "boards-cut-in", value: true }],
    text:
      "The bonded manifest you photographed is still pinned up on the " +
      "fourth level, annotated in six hands, every impounded crate " +
      "ticked off as it came home. Traders who never learned your name " +
      "learned the phrase 'good for it', attached to it, and that is a " +
      "kind of credit no ledger of theirs will ever quite close.",
  },
  // ------------------------------------------------------------------
  // Cinder Row — the district colour a run leaves behind it.
  //
  // Gated on the same world conditions the districts themselves react
  // to (src/data/world.ts), spread in rather than re-typed, so the
  // street that changed while the player walked it is the street the
  // epilogue describes and the two can never drift. No fallback: the
  // Row only gets a line when the run left a mark on it.
  // ------------------------------------------------------------------
  {
    id: "streets-cordon",
    subject: "streets",
    title: "Cinder Row",
    requires: conditionRequirements("cordon-broken"),
    text:
      "The Cinderway barricades came off their runners and never went " +
      "back on. The Row grew through the gap within a season — pitches, " +
      "then awnings, then a lamp somebody paid for out of their own " +
      "pocket — and the checkpoint plinth is a fruit stall with the " +
      "stencilled lettering still legible under the crates.",
  },
  {
    id: "streets-spike-loose",
    subject: "streets",
    title: "Cinder Row",
    requires: conditionRequirements("package-loose"),
    text:
      "The Row never did find out where the spike went, and has " +
      "therefore decided, in the way the Row decides things, that it " +
      "went somewhere magnificent. The story is told at least four ways " +
      "on the plaza. In every one of them the courier is smarter than " +
      "you were and better dressed than you have ever been.",
  },
  {
    id: "streets-spike-quiet",
    subject: "streets",
    title: "Cinder Row",
    requires: conditionRequirements("package-delivered"),
    text:
      "The wet market's shutters went up again a week after they came " +
      "down, and the Row got on with it, because getting on with it is " +
      "the entire municipal policy of Cinder Row. The delivery is not " +
      "remembered. The night it happened is: no stalls, no lamps, and " +
      "everybody suddenly indoors, which the Row files as weather.",
  },
  // ------------------------------------------------------------------
  // The Sprawl — closing line, keyed to the ending taken
  // ------------------------------------------------------------------
  {
    id: "city-commons",
    subject: "city",
    title: "The Meridian Sprawl",
    requires: [{ type: "flag-equals", key: "ending", value: "ending-commons" }],
    text:
      "The Sprawl argues itself hoarse and calls it governance, and it " +
      "is. On clear nights you can stand on the tram loop and watch the " +
      "district boards glitter with motions, amendments, objections — a " +
      "city thinking out loud, in its own name, at last.",
  },
  {
    id: "city-regency",
    subject: "city",
    title: "The Meridian Sprawl",
    requires: [{ type: "flag-equals", key: "ending", value: "ending-regency" }],
    text:
      "The Sprawl runs on time. The trains, the tides, the tolls — all " +
      "of it filed, scheduled, magnanimous. Order came to the city " +
      "wearing a salt-plant smile, and only two people alive know the " +
      "receipt is in your handwriting.",
  },
  {
    id: "city-freehold",
    subject: "city",
    title: "The Meridian Sprawl",
    requires: [
      { type: "flag-equals", key: "ending", value: "ending-freehold" },
    ],
    text:
      "The Sprawl is a hundred small lights instead of one great lamp, " +
      "and it flickers, and it holds. Districts trade power like " +
      "neighbors trade tools. Nothing upstairs can turn anything off " +
      "anymore. It is harder, freer, and entirely theirs.",
  },
  {
    id: "city-concordat",
    subject: "city",
    title: "The Meridian Sprawl",
    requires: [
      { type: "flag-equals", key: "ending", value: "ending-concordat" },
    ],
    text:
      "The Sprawl is held in trust by the part of it that drowns " +
      "first, and it shows: pumps before towers, tide charts before " +
      "share prices, and a council that meets in waders and has never " +
      "once been late to a flood.",
  },
  {
    id: "city-receivership",
    subject: "city",
    title: "The Meridian Sprawl",
    requires: [
      { type: "flag-equals", key: "ending", value: "ending-receivership" },
    ],
    text:
      "The Sprawl is a distressed estate under administration, and " +
      "somehow that is the kindest thing that has happened to it in a " +
      "century. Nothing is inspiring. Everything is maintained. The " +
      "water goes down and stays down, by memorandum.",
  },
  {
    id: "city-consortium",
    subject: "city",
    title: "The Meridian Sprawl",
    requires: [
      { type: "flag-equals", key: "ending", value: "ending-consortium" },
    ],
    text:
      "The Sprawl belongs to eleven thousand accounts and argues " +
      "about it hourly, in public, with the figures posted. It is " +
      "loud, it is priced, and for the first time nobody can raise " +
      "the cost of breathing without six levels seeing them do it.",
  },
  {
    id: "city-ghost",
    subject: "city",
    title: "The Meridian Sprawl",
    requires: [{ type: "flag-equals", key: "ending", value: "ending-ghost" }],
    text:
      "The Sprawl is haunted now, in the way lighthouses are: something " +
      "old and patient keeps the record, misfiles the cruelties, and " +
      "never sleeps. The city stopped praying to its dead networks and " +
      "started chatting with them. The networks chat back.",
  },
];
