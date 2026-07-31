import type { EpilogueVignette } from "../narrative/epilogue";

/**
 * Epilogue content: what became of each faction and ally, selected
 * against the finished GameState by selectVignettes (first match per
 * subject wins, authored order is render order). Every playthrough flag
 * that mattered should be able to change a line here — this is where
 * three acts of choices get read back to the player.
 */
export const epilogueVignettes: EpilogueVignette[] = [
  // ------------------------------------------------------------------
  // The Undercroft — the Steps themselves
  // ------------------------------------------------------------------
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
  // The crew — only for the companions who actually travelled with you
  //
  // No fallback on either subject, on purpose: a player who never went
  // down to the Quays or never stopped at the card table gets no line
  // about a person they never met. The bond flags come from each
  // companion's personal scene, the vault call from the beat where
  // their agendas collided, and where they stand is read straight off
  // the party record.
  // ------------------------------------------------------------------
  {
    id: "vesper-sworn",
    subject: "vesper",
    title: "Vesper Kade",
    requires: [{ type: "flag-equals", key: "vesper-bond", value: "sworn" }],
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
    requires: [{ type: "flag-equals", key: "vesper-bond", value: "parted" }],
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
    requires: [{ type: "companion", companionId: "vesper", status: "recruited" }],
    text:
      "Kade goes back to the water because that is where the work is, " +
      "and tells the story of the Cordon to anyone who buys the second " +
      "round. In her version you are taller. In her version she says " +
      "the clever thing, and you say the line she actually said, and " +
      "nobody who was there corrects her.",
  },
  {
    id: "sill-sworn",
    subject: "sill",
    title: "Deacon Sill",
    requires: [{ type: "flag-equals", key: "sill-bond", value: "sworn" }],
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
    requires: [{ type: "flag-equals", key: "vent-vault-call", value: "filed" }],
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
    requires: [{ type: "flag-equals", key: "sill-bond", value: "parted" }],
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
    requires: [{ type: "companion", companionId: "sill", status: "recruited" }],
    text:
      "Sill goes back to the gallery pitch, and the sign goes back up, " +
      "and the queue is not nobody any more. People come up six levels " +
      "of scaffold to give a statement to the man who was in the " +
      "Ventworks. He writes every one of them down in a hand like " +
      "printing, and reads it back, and waits for the name.",
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
