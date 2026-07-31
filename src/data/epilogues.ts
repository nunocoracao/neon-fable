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
