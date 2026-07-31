import type { StoryArc } from "../../narrative/types";

/**
 * Act 3 — "The Succession". The finale. With Halex's Cordon broken and
 * the Combine cornered, Auric's rump directorate invokes the founders'
 * failsafe: at dawn, every civic title in the Meridian Sprawl transfers
 * to the Meridian Locus, the continuity engine sleeping in the Auric
 * Spire's crown — arithmetic forever, no vote, no scandal, no appeal.
 * The chapter opens differently for each recorded Act 2 outcome
 * (act2-outcome = "charter" | "takeover" | "severance"), converges on
 * the Spire's Crown Concourse, and ends on one of four game endings:
 *
 *   act3-complete: true, game-complete: true
 *   act3-outcome: "commons" | "regency" | "freehold" | "ghost"
 *   ending: the ChapterEnding id ("ending-commons" | "ending-regency" |
 *           "ending-freehold" | "ending-ghost") the epilogue screen reads.
 *
 * Payoff bookkeeping: the opening taken sets a3-standing ("charter" |
 * "auric" | "steps"); gate3-route records how the Registry Gate was
 * passed (witness/standing/veil/dark/fight — wanted-by-auric decides
 * which of those exist); the muster sets a3-sappers / a3-crews /
 * a3-flick for allies who show; crown-route records the climax taken
 * ("court" | "auric" | "alone" | "commune" — commune is the fully
 * non-combat resolution behind hex-exchange + Tech 8 + an installed
 * Lattice Coprocessor). Act 1 and Act 2 flags gate scenes throughout:
 * act1-outcome asides in the openings, betrayed-voss brings the
 * collectors back as enemies, allies open routes betrayed players
 * never see.
 */
export const act3Arc: StoryArc = {
  id: "act3",
  title: "The Succession",
  entryNodeId: "a3-start",
  nodes: [
    // ------------------------------------------------------------------
    // Hook — the night the screens died
    // ------------------------------------------------------------------
    {
      id: "a3-start",
      text:
        "Every screen in the plaza died at the same instant tonight — " +
        "adverts, weather, the noodle stall's order display — and came " +
        "back wearing one line of civic type: SUCCESSION PROTOCOL " +
        "INITIATED. TITLE TRANSFER AT DAWN. Under the largest dead " +
        "screen, someone has been waiting for you to cross the " +
        "glow-tiles, and doesn't pretend otherwise.",
      location: "cinder-row:plaza",
      // Act 3 opens in the small hours, on the same plaza the player
      // has been crossing at dusk since the first scene. The hour holds
      // for the rest of the act's business on the hub, so every
      // Succession beat plays on a colder, darker Cinder Row.
      dayPhase: "late",
      choices: [
        {
          id: "quiet",
          label: "\"It's finished.\" (The Succession is settled.)",
          target: "a3-done",
          requirements: [
            { type: "flag-equals", key: "act3-complete", value: true },
          ],
        },
        {
          id: "charter",
          label: "Hear the runner in Court grey — the Charter's summons.",
          target: "a3-charter-summons",
          requirements: [
            { type: "flag-equals", key: "act2-outcome", value: "charter" },
          ],
        },
        {
          id: "takeover",
          label: "Accept the courier drone's slate. The regent calls.",
          target: "a3-voss-summons",
          requirements: [
            { type: "flag-equals", key: "act2-outcome", value: "takeover" },
          ],
        },
        {
          id: "severance",
          label: "Take Patch's arm and get off the open tiles.",
          target: "a3-sever-warning",
          requirements: [
            { type: "flag-equals", key: "act2-outcome", value: "severance" },
          ],
        },
        {
          id: "walk-on",
          label: "Keep walking.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "a3-done",
      text:
        "The screens show weather again — real weather, locally argued " +
        "about. Whatever the Sprawl became the night the Spire's crown " +
        "opened, the plaza has gone back to minding its own business, " +
        "and for once its own business is actually its own.",
      location: "cinder-row:plaza",
      choices: [
        { id: "move-along", label: "Move along.", effects: [{ type: "end" }] },
      ],
    },
    // ------------------------------------------------------------------
    // Opening A — the Charter's witness (act2-outcome = charter)
    // ------------------------------------------------------------------
    {
      id: "a3-charter-summons",
      speaker: "Steps Runner",
      expression: "shocked",
      text:
        "The runner has traded cistern damp for session ink — the " +
        "Charter's mark, still wet on her sleeve. \"Mid-vote. " +
        "MID-VOTE, topsider. Every board in the Sprawl locks at once " +
        "and posts that line about dawn.\" She grips your sleeve, " +
        "Court-fashion; some habits survive promotion. \"The delegates " +
        "are still in session because nobody dares go home. Matron " +
        "says come. Matron says they've found what signed it.\"",
      location: "cinder-row:plaza",
      choices: [
        {
          id: "ask",
          label: "\"What do you mean, WHAT signed it?\"",
          target: "a3-charter-what",
        },
        {
          id: "session",
          label: "Go to the session.",
          target: "a3-charter-session",
        },
      ],
    },
    {
      id: "a3-charter-what",
      speaker: "Steps Runner",
      expression: "grim",
      text:
        "\"Not Halex. Not the directors — half of them look as " +
        "flattened as we do.\" She glances at the dead screens and " +
        "lowers her voice the way people do around draining water. " +
        "\"The signature's older than the Combine's charter. Older " +
        "than the Charter's charter. The clerks keep saying a word " +
        "like it burns: founders' key.\"",
      location: "cinder-row:plaza",
      choices: [
        { id: "go", label: "\"Take me in.\"", target: "a3-charter-session" },
      ],
    },
    {
      id: "a3-charter-session",
      speaker: "Matron Ferrow",
      text:
        "The session hall is every district's worry in one room, and " +
        "Ferrow holds the floor like a bulkhead. \"Auric's remnant " +
        "couldn't win the vote, so they've appealed to something that " +
        "doesn't hold votes. The Meridian Locus — the founders' " +
        "continuity engine, asleep in the Spire's crown since before " +
        "the towers had names. At dawn it inherits every title in the " +
        "Sprawl, and every seat in this hall becomes a chair.\" She " +
        "looks at you the way she once looked at a flooded manifold. " +
        "\"The Charter has one instrument the Locus must honor: a " +
        "witness with standing. You.\"",
      location: "charter:session-hall",
      choices: [
        {
          id: "manifold",
          label: "\"Last time you looked at me like that, we blew a manifold.\"",
          target: "a3-charter-court",
          requirements: [
            { type: "flag-equals", key: "act1-outcome", value: "court" },
          ],
        },
        {
          id: "outlaw",
          label: "\"A year ago your delegates were posting my description.\"",
          target: "a3-charter-witness",
          requirements: [
            { type: "flag-equals", key: "act1-outcome", value: "broadcast" },
          ],
        },
        {
          id: "grey-ink",
          label: "\"I signed with Voss once. Your delegates remember.\"",
          target: "a3-charter-turncoat",
          requirements: [
            { type: "flag-equals", key: "act1-outcome", value: "voss" },
          ],
        },
        {
          id: "mandate",
          label: "Take the Charter's mandate and ride for the Spire.",
          target: "a3-spire-arrival",
          effects: [
            { type: "add-item", itemId: "con-field-kit" },
            { type: "set-flag", key: "a3-standing", value: "charter" },
            { type: "travel", mapId: "auric-spire" },
          ],
        },
      ],
    },
    {
      id: "a3-charter-court",
      speaker: "Matron Ferrow",
      text:
        "\"And the water stopped.\" She says it flat, which from " +
        "Ferrow is a parade. \"You stood at the manifold when standing " +
        "there cost everything. The Steps taught the Charter that " +
        "word, witness — we bled for the standing you're about to " +
        "spend. Spend it well.\" Her grip on your forearm is the oath, " +
        "renewed.",
      location: "charter:session-hall",
      choices: [
        {
          id: "back",
          label: "\"For Ledge Nine, Matron.\"",
          target: "a3-charter-session",
          effects: [
            { type: "set-flag", key: "ferrow-blessing", value: true },
            { type: "add-item", itemId: "con-trauma-patch", quantity: 2 },
          ],
        },
      ],
    },
    {
      id: "a3-charter-witness",
      speaker: "Matron Ferrow",
      text:
        "\"They were. I remember the poster.\" A beat. \"The Sprawl " +
        "memorized your broadcast before it memorized the Charter's " +
        "preamble — half these delegates hold seats because of what " +
        "you read to the city. The warrant died in writing when you " +
        "became the witness. Tonight the outlaw walks in the front " +
        "door, and the scanners have standing orders to look away.\"",
      location: "charter:session-hall",
      choices: [
        {
          id: "back",
          label: "\"Then let's go be legible.\"",
          target: "a3-charter-session",
          effects: [
            { type: "set-flag", key: "crown-remembered", value: true },
          ],
        },
      ],
    },
    {
      id: "a3-charter-turncoat",
      speaker: "Matron Ferrow",
      text:
        "\"They remember. So do I.\" Ferrow doesn't soften it; the " +
        "Court never does. \"You signed in grey ink once, and then you " +
        "handed this hall the Cordon's own ledger and made the " +
        "signature not matter. The Charter seats what people do, " +
        "witness, not what they did. Mostly.\" The last word is the " +
        "Steps' whole theory of forgiveness.",
      location: "charter:session-hall",
      choices: [
        {
          id: "back",
          label: "\"Mostly will do.\"",
          target: "a3-charter-session",
        },
      ],
    },
    // ------------------------------------------------------------------
    // Opening B — the regent's problem (act2-outcome = takeover)
    // ------------------------------------------------------------------
    {
      id: "a3-voss-summons",
      text:
        "The slate seals to your thumb before the drone has finished " +
        "landing. No greeting this time, no countersignature — just " +
        "Voss's mark and three words with the punctuation of a grabbed " +
        "wrist: 'Glasshouse. Bring nothing.' Below the mark, faint, " +
        "the same line the dead screens are wearing: SUCCESSION " +
        "PROTOCOL INITIATED.",
      location: "cinder-row:plaza",
      choices: [
        {
          id: "glasshouse",
          label: "The Glasshouse, then. One more time.",
          target: "a3-voss-glasshouse",
        },
        {
          id: "toss",
          label: "Pocket the slate and take the long way. Let the regent wait.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "a3-voss-glasshouse",
      speaker: "Director Voss",
      text:
        "The terrarium is unpacked, and that's how you know it's bad — " +
        "Voss only tends the salt-plants when something can't be " +
        "audited into submission. \"The board's old guard went looking " +
        "for a lever above my chair, and found the one thing that " +
        "outranks every chair. The Locus doesn't recognize my " +
        "succession. To the founders' engine I am the anomaly, and at " +
        "dawn it corrects me — and every arrangement you and I " +
        "profitably share.\" A pause, precisely one second long. \"The " +
        "Spire won't admit me. It will admit my field partner.\"",
      location: "cinder-row:glasshouse",
      choices: [
        {
          id: "drafts",
          label: "\"You wrote the Undertow. Is this one yours too?\"",
          target: "a3-voss-drafts",
          requirements: [
            { type: "flag-equals", key: "voss-confronted", value: true },
          ],
        },
        {
          id: "terms",
          label: "\"Skip the eulogy. What's the job?\"",
          target: "a3-voss-brief",
        },
      ],
    },
    {
      id: "a3-voss-drafts",
      speaker: "Director Voss",
      expression: "grim",
      text:
        "\"No.\" The honesty lands like a dropped glass. \"The Locus " +
        "predates my drafts, Halex's corrections, the Combine's whole " +
        "grammar of disaster. The founders built an executor for the " +
        "city they meant to have, then built the city they could " +
        "afford instead, and let the executor sleep.\" Voss feeds the " +
        "salt-plants, not looking at you. \"I have authored monsters. " +
        "This one I merely inherited — and it does not negotiate, " +
        "which I confess I find unprofessional.\"",
      location: "cinder-row:glasshouse",
      choices: [
        { id: "back", label: "Back to business.", target: "a3-voss-glasshouse" },
      ],
    },
    {
      id: "a3-voss-brief",
      speaker: "Director Voss",
      text:
        "\"One item, this time. The crown ring, at the Spire's peak. " +
        "Reach the Locus before dawn and put a hand on the founders' " +
        "keys — as my proxy, with the chair's own override riding your " +
        "credentials.\" The retainer's kit slides across the desk, " +
        "heavier than the last two. \"The gates will read you as the " +
        "chair's standing instrument. Walk like you own the tower. As " +
        "of tonight, in every register that matters, you do.\"",
      location: "cinder-row:glasshouse",
      choices: [
        {
          id: "go",
          label: "Take the kit and ride for the Auric Spire.",
          target: "a3-spire-arrival",
          effects: [
            { type: "add-item", itemId: "con-field-kit" },
            { type: "credits", amount: 100 },
            { type: "set-flag", key: "a3-standing", value: "auric" },
            { type: "travel", mapId: "auric-spire" },
          ],
        },
      ],
    },
    // ------------------------------------------------------------------
    // Opening C — the free Steps (act2-outcome = severance)
    // ------------------------------------------------------------------
    {
      id: "a3-sever-warning",
      speaker: "Patch",
      text:
        "Patch steers you into the underlevel cut with a grip that " +
        "means business. \"The screens died on the Steps too — OUR " +
        "screens, on OUR current, reading that line about dawn.\" The " +
        "old medic's voice does something it never does: hesitates. " +
        "\"Whatever's waking up in the Spire doesn't care that we cut " +
        "the umbilical. On the founders' books the deep levels are " +
        "still assets, and at dawn it collects the whole ledger. " +
        "Council's already sitting. They're waiting on you.\"",
      location: "cinder-row:underlevel-cut",
      choices: [
        {
          id: "council",
          label: "Go down to the council.",
          target: "a3-sever-council",
        },
      ],
    },
    {
      id: "a3-sever-council",
      text:
        "The Court hall is a war room for the third time in a year, " +
        "but the light is different now — terrace power, warm and " +
        "unmetered, the free grid's own glow. On the wall, under WE " +
        "LIVE HERE and WE BREATHE HERE TOO, someone has chalked the " +
        "night's agenda in one line: WE STAY OURS. The council's " +
        "answer is already shaped; it's the same answer it's always " +
        "been. Somebody has to climb the tower and make it stick.",
      location: "greywater:court-hall",
      choices: [
        {
          id: "ferrow",
          label: "Stand with Ferrow at the tide charts.",
          target: "a3-sever-ferrow",
          requirements: [
            { type: "flag-equals", key: "ally-cistern-court", value: true },
          ],
        },
        {
          id: "outlaw",
          label: "\"The Sprawl knows my face. That cuts both ways tonight.\"",
          target: "a3-sever-outlaw",
          requirements: [
            { type: "flag-equals", key: "act1-outcome", value: "broadcast" },
          ],
        },
        {
          id: "ask-locus",
          label: "\"Tell me what the shrine-keepers know about the Locus.\"",
          target: "a3-sever-locus",
        },
        {
          id: "go",
          label: "Take the Steps' answer topside, to the Auric Spire.",
          target: "a3-spire-arrival",
          effects: [
            { type: "add-item", itemId: "con-field-kit" },
            { type: "set-flag", key: "a3-standing", value: "steps" },
            { type: "travel", mapId: "auric-spire" },
          ],
        },
      ],
    },
    {
      id: "a3-sever-ferrow",
      speaker: "Matron Ferrow",
      text:
        "Ferrow has the tide charts out from habit, though the tides " +
        "answer to the Steps now. \"Twice you've carried our breath in " +
        "your hands, topsider. I don't like it being a custom.\" She " +
        "marks the Spire on the chart's margin the way she once marked " +
        "charge points. \"My sappers are already topside, in the " +
        "crowd by the tower. Find them at the muster. Whatever door " +
        "you need opened, they'll open it — the Court settles its " +
        "debts in doors.\"",
      location: "greywater:court-hall",
      choices: [
        {
          id: "back",
          label: "\"Then I'll go collect a door.\"",
          target: "a3-sever-council",
          effects: [
            { type: "set-flag", key: "ferrow-blessing", value: true },
            { type: "add-item", itemId: "con-trauma-patch", quantity: 2 },
          ],
        },
      ],
    },
    {
      id: "a3-sever-outlaw",
      text:
        "The council hears you out, and the oldest chain-cutter " +
        "laughs, once, like a bolt shearing. It's true: the warrant " +
        "never died down here, it grew a legend around itself. Half " +
        "the Sprawl still knows your gait from the correction notices; " +
        "the other half knows it from the night every screen read the " +
        "Undertow aloud. Tonight you'll walk toward the one tower " +
        "where both halves are watching.",
      location: "greywater:court-hall",
      choices: [
        {
          id: "back",
          label: "Let them watch.",
          target: "a3-sever-council",
          effects: [
            { type: "set-flag", key: "crown-remembered", value: true },
          ],
        },
      ],
    },
    {
      id: "a3-sever-locus",
      text:
        "The shrine-keepers' answer comes secondhand, in the hushed " +
        "grammar of people quoting static: the founders built a keeper " +
        "for the whole city, then owed it too much to ever wake it. " +
        "Every title, every toll, every meter in the Sprawl is a leaf " +
        "on its ledger, and at dawn the ledger closes. Machines keep " +
        "their own law, the keepers say, and glance at their patched " +
        "cyclers with what can only be called respect.",
      location: "greywater:court-hall",
      choices: [
        { id: "back", label: "Turn back to the council.", target: "a3-sever-council" },
      ],
    },
    // ------------------------------------------------------------------
    // The Crown Concourse — converging spine
    // ------------------------------------------------------------------
    {
      id: "a3-spire-arrival",
      text:
        "The Auric Spire at street level is a cliff of dead glass. " +
        "Succession type crawls its face floor by floor, and the crowd " +
        "at its foot — half the Sprawl's districts, come to watch " +
        "their titles change hands — presses against barriers manned " +
        "by enforcers who keep checking their own credentials. Past " +
        "the muster, the Registry Gate scans the line with a light " +
        "that has stopped pretending to be polite. Above it all, the " +
        "crown floors burn white: something up there is awake, and " +
        "counting.",
      location: "spire:concourse",
      choices: [
        {
          id: "collectors",
          label: "Deal with the good coats angling through the crowd toward you.",
          target: "a3-collectors",
          requirements: [
            { type: "flag-equals", key: "betrayed-voss", value: true },
          ],
        },
        {
          id: "wire",
          label: "Answer the maintenance screen that just spelled your name.",
          target: "a3-wire",
          requirements: [
            { type: "flag-equals", key: "hex-exchange", value: true },
          ],
        },
        { id: "muster", label: "Work through the muster crowd.", target: "a3-muster" },
        {
          id: "riser",
          label: "Try the second riser — the one with no call button.",
          target: "a3-exec-lift",
        },
        { id: "terminal", label: "Read the lobby ledger terminal.", target: "a3-terminal" },
        { id: "booth", label: "Look in on the auditor's booth.", target: "a3-lin" },
        { id: "gate", label: "Face the Registry Gate.", target: "a3-gate" },
        { id: "crown", label: "Take the crown lift, wherever it answers to.", target: "a3-crown-door" },
        { id: "tram", label: "Head back toward the tram gate.", target: "a3-tram" },
        { id: "look", label: "Watch the tower awhile.", effects: [{ type: "end" }] },
      ],
    },
    {
      id: "a3-collectors",
      text:
        "They find you at the barrier line: two good coats and a tally " +
        "drone, the same patient arithmetic — but the writ they " +
        "present has been re-stamped. 'Transferred for continuity: THE " +
        "MERIDIAN TRUST.' The collector almost smiles. \"The director " +
        "you walked out on stopped being our client at midnight. The " +
        "debt didn't. Debts never do — that's the beauty of the " +
        "trade. Settle in credits, or in kind.\"",
      location: "spire:concourse",
      choices: [
        {
          id: "pay",
          label: "Settle the Trust's writ. (300 cr)",
          target: "a3-spire-arrival",
          requirements: [{ type: "credits", value: 300 }],
          ifUnavailable: "disabled",
          effects: [
            { type: "credits", amount: -300 },
            { type: "set-flag", key: "trust-paid", value: true },
          ],
        },
        {
          id: "fight",
          label: "\"Collect, then. Last chance anyone gets to.\"",
          target: "a3-spire-arrival",
          effects: [
            { type: "start-combat", encounterId: "enc-spire-collectors" },
          ],
        },
      ],
    },
    {
      id: "a3-wire",
      speaker: "Hex",
      text:
        "A maintenance screen bolted to the barrier stanchion clears " +
        "its throat in static. \"Diver. I have been reading the " +
        "Succession from inside all night. It is beautiful and it is " +
        "wrong — a will executed against the living.\" A service " +
        "hatch beneath the screen unlocks itself, offering a slim " +
        "clinic case. \"A lattice, tuned to my registers. Wear my key " +
        "and the crown will hear you in its own language. I would " +
        "come myself, but I am large now, and doors are small.\"",
      location: "spire:concourse",
      choices: [
        {
          id: "take",
          label: "Take the lattice from the hatch.",
          target: "a3-spire-arrival",
          effects: [
            { type: "add-item", itemId: "cyb-lattice-coprocessor" },
            { type: "set-flag", key: "hex-lattice", value: true },
          ],
        },
        {
          id: "decline",
          label: "\"I work with my own head, Hex.\"",
          target: "a3-spire-arrival",
        },
      ],
    },
    {
      id: "a3-gate",
      text:
        "The Registry Gate is the Spire's oldest door wearing its " +
        "newest law: a scanning arch that checks every face against " +
        "the founders' ledger itself. The queue ahead of you thins as " +
        "people think better of being read that closely. Whatever " +
        "standing you carry, this is where the tower decides what it " +
        "thinks of it.",
      location: "spire:registry-gate",
      choices: [
        {
          id: "witness",
          label: "Walk the arch as the Charter's witness. Let it read you.",
          target: "a3-gate-witness",
          requirements: [
            { type: "flag-equals", key: "wanted-by-auric", value: false },
          ],
          effects: [
            { type: "set-flag", key: "gate3-route", value: "witness" },
          ],
        },
        {
          id: "standing",
          label: "Present the chair's override. The tower answers to it.",
          target: "a3-gate-standing",
          requirements: [
            { type: "flag-equals", key: "a3-standing", value: "auric" },
          ],
          effects: [
            { type: "set-flag", key: "gate3-route", value: "standing" },
          ],
        },
        {
          id: "veil",
          label: "Walk the arch as nobody at all. (Static Veil)",
          target: "a3-gate-shadow",
          requirements: [{ type: "enhancement", itemId: "cyb-static-veil" }],
          effects: [{ type: "set-flag", key: "gate3-route", value: "veil" }],
        },
        {
          id: "dark",
          label: "Let Hex misfile the arch's queue, one heartbeat wide.",
          target: "a3-gate-shadow",
          requirements: [
            { type: "flag-equals", key: "hex-exchange", value: true },
          ],
          effects: [{ type: "set-flag", key: "gate3-route", value: "dark" }],
        },
        {
          id: "fight",
          label: "The gate's the way in. Go through its keepers.",
          target: "a3-gate-past",
          effects: [
            { type: "set-flag", key: "gate3-route", value: "fight" },
            { type: "start-combat", encounterId: "enc-spire-gate" },
          ],
        },
        {
          id: "ask-guard",
          label: "Ask the officer on the queue what the tower thinks it is doing.",
          target: "a3-security",
        },
        {
          id: "back",
          label: "Step out of the queue. Not yet.",
          target: "a3-spire-arrival",
        },
      ],
    },
    {
      id: "a3-gate-witness",
      text:
        "The arch reads you top to bottom — gait, face, the whole " +
        "ledger of you — and finds a standing instruction written the " +
        "night the Cordon fell: WITNESS. SUSPEND. DEFER. The scanning " +
        "light dims to something almost deferential, and the barriers " +
        "fold back. The outlaw the tower spent a year hunting walks in " +
        "through the front door, on paper, invited.",
      location: "spire:registry-gate",
      choices: [
        { id: "in", label: "Into the tower.", target: "a3-spire-arrival" },
      ],
    },
    {
      id: "a3-gate-standing",
      text:
        "You present the chair's override and the gate performs " +
        "something between a scan and a salute. Two enforcers step " +
        "back with the crisp unease of men who have just decided " +
        "tonight is above their pay grade. The tower reads you as its " +
        "owner's hand. For a few more hours, that's even true.",
      location: "spire:registry-gate",
      choices: [
        { id: "in", label: "Walk in like you own it.", target: "a3-spire-arrival" },
      ],
    },
    {
      id: "a3-gate-shadow",
      text:
        "You cross the arch the way rumors cross a ledger — misfiled, " +
        "unbilled, gone before the column totals. Behind you the gate " +
        "resumes reading the queue with total confidence, guarding the " +
        "founders' tower against everyone who exists.",
      location: "spire:registry-gate",
      choices: [
        { id: "in", label: "Into the service dark.", target: "a3-spire-arrival" },
      ],
    },
    {
      id: "a3-gate-past",
      text:
        "The gate's keepers learn what the Cordon's learned before " +
        "them, and the arch — suddenly unattended — files your entry " +
        "under maintenance. The crowd at the barriers saw all of it. " +
        "The crowd approves. Tonight, the crowd was hoping somebody " +
        "would.",
      location: "spire:registry-gate",
      choices: [
        { id: "in", label: "Into the tower.", target: "a3-spire-arrival" },
      ],
    },
    // ------------------------------------------------------------------
    // The muster — who stands with you
    // ------------------------------------------------------------------
    {
      id: "a3-muster",
      text:
        "The crowd at the Spire's foot has sorted itself the way " +
        "crowds do in the Sprawl — districts by lantern color, crews " +
        "by the tools on their belts, everyone watching the crown burn " +
        "white. Word of you moves through it faster than you do. " +
        "Some faces you know are here. Who came says everything.",
      location: "spire:concourse",
      choices: [
        {
          id: "sappers",
          label: "Find the wet-rigged shapes keeping so still by the barrier.",
          target: "a3-muster-court",
          requirements: [
            { type: "flag-equals", key: "ally-cistern-court", value: true },
          ],
        },
        {
          id: "crews-freed",
          label: "Answer the shop-floor whistle from the vent stacks.",
          target: "a3-muster-crews-freed",
          requirements: [
            { type: "flag-equals", key: "crew-freed", value: true },
          ],
        },
        {
          id: "crews-warned",
          label: "Answer the shop-floor whistle from the vent stacks.",
          target: "a3-muster-crews-warned",
          requirements: [
            { type: "flag-equals", key: "crew-warned", value: true },
          ],
        },
        {
          id: "flick",
          label: "Catch the new walk working the crowd's edge.",
          target: "a3-muster-flick",
          requirements: [
            { type: "flag-equals", key: "flick-friend", value: true },
          ],
        },
        {
          id: "back",
          label: "Slip back out of the crowd.",
          target: "a3-spire-arrival",
        },
      ],
    },
    {
      id: "a3-muster-court",
      text:
        "Ferrow's sappers stand at the barrier like they once stood a " +
        "tunnel open under the Exchange: patient, tooled, unbothered " +
        "by the tower. Their captain hands you a wrapped pair of " +
        "trauma patches, Court-fashion — supplies first, sentiment " +
        "never. \"Matron says you'll want a door. When you take the " +
        "crown lift, we take the riser beside it. Whatever's waiting " +
        "at the ring, it won't be waiting for all of us.\"",
      location: "spire:concourse",
      choices: [
        {
          id: "back",
          label: "\"Then I'll see you at the ring.\"",
          target: "a3-muster",
          effects: [
            { type: "set-flag", key: "a3-sappers", value: true },
            { type: "add-item", itemId: "con-trauma-patch", quantity: 2 },
          ],
        },
      ],
    },
    {
      id: "a3-muster-crews-freed",
      speaker: "Foreman Odal",
      text:
        "Odal's crews hold the vent stacks like a shift that never " +
        "clocked out — the same faces that poured through the gate you " +
        "tore off its runners. \"Heard the tower's inheriting us at " +
        "dawn,\" the foreman says, and spits with engineering " +
        "precision. \"We've been keeping its lungs alive since before " +
        "it had a lawyer. Take these — and when you're up there, tell " +
        "the machine who actually holds the valves.\" Two field kits, " +
        "through the crowd, aunt-fashion.",
      location: "spire:concourse",
      choices: [
        {
          id: "back",
          label: "\"I'll tell it, Foreman.\"",
          target: "a3-muster",
          effects: [
            { type: "set-flag", key: "a3-crews", value: true },
            { type: "add-item", itemId: "con-field-kit", quantity: 2 },
          ],
        },
      ],
    },
    {
      id: "a3-muster-crews-warned",
      speaker: "Foreman Odal",
      text:
        "Odal finds you before you find the whistle — the crews got " +
        "out of 'exit processing' clean because somebody knocked the " +
        "old knock, and foremen don't misfile that. \"Half my people " +
        "are home with their families tonight because of you. The " +
        "other half are here.\" A field kit changes hands through the " +
        "mesh of the crowd. \"The stacks are ours if you need them. " +
        "Go tell the machine whose air it's counting.\"",
      location: "spire:concourse",
      choices: [
        {
          id: "back",
          label: "\"Keep them ready, Foreman.\"",
          target: "a3-muster",
          effects: [
            { type: "set-flag", key: "a3-crews", value: true },
            { type: "add-item", itemId: "con-field-kit" },
          ],
        },
      ],
    },
    {
      id: "a3-muster-flick",
      speaker: "Flick",
      text:
        "\"Enforcers rotate at the quarter bell, the lift shaft has a " +
        "maintenance ladder nobody's badged since the storm, and the " +
        "crowd's decided you're the best thing on tonight.\" Flick " +
        "counts it off on gloved fingers, then looks up at the burning " +
        "crown with the whole Row's worth of appraisal. \"Whole Sprawl " +
        "watched you walk in here, you know. I already told them how " +
        "it ends. Don't make a liar of me.\"",
      location: "spire:concourse",
      choices: [
        {
          id: "back",
          label: "\"Good eyes, Flick. Always were.\"",
          target: "a3-muster",
          effects: [{ type: "set-flag", key: "a3-flick", value: true }],
        },
      ],
    },
    // ------------------------------------------------------------------
    // Lobby intelligence
    // ------------------------------------------------------------------
    {
      id: "a3-terminal",
      text:
        "The lobby's ledger terminal still answers — the Succession " +
        "runs on the civic layer, and the civic layer never learned to " +
        "keep secrets from anyone standing at a counter. On screen, " +
        "the transfer instrument scrolls: every district title, every " +
        "meter and toll and easement in the Sprawl, queued to a single " +
        "inheritor of record: MERIDIAN LOCUS, CONTINUITY EXECUTOR, " +
        "acting per founding instrument — clause after clause of " +
        "a will written before the city it disposes of.",
      location: "spire:lobby",
      choices: [
        {
          id: "dive",
          label: "Jack in and dive the founding instrument itself.",
          target: "a3-terminal-dive",
          requirements: [{ type: "background", tag: "net" }],
          effects: [{ type: "set-flag", key: "locus-known", value: true }],
        },
        {
          id: "audit",
          label: "Read it like an auditor. Wills have load-bearing clauses.",
          target: "a3-terminal-audit",
          requirements: [{ type: "background", tag: "corp" }],
          effects: [{ type: "set-flag", key: "locus-known", value: true }],
        },
        {
          id: "trace",
          label: "Trace the transfer's execution path through the civic bus.",
          target: "a3-terminal-trace",
          requirements: [{ type: "stat", stat: "tech", value: 7 }],
          ifUnavailable: "disabled",
          effects: [{ type: "set-flag", key: "locus-known", value: true }],
        },
        {
          id: "back",
          label: "Step away from the terminal.",
          target: "a3-spire-arrival",
        },
      ],
    },
    {
      id: "a3-terminal-dive",
      text:
        "The founding instrument opens around you like a drowned " +
        "cathedral — older architecture than anything under Greywater, " +
        "and stranger. At its heart, one clause burns brighter than " +
        "the rest: the Locus must execute FOR THE CITY'S CONTINUING " +
        "INHABITANTS, a phrase the founders never defined, because " +
        "they assumed they'd be the ones defining it. Whoever stands " +
        "before the engine at execution holds that clause in their " +
        "mouth.",
      location: "spire:lobby",
      choices: [
        { id: "surface", label: "Surface with the clause.", target: "a3-spire-arrival" },
      ],
    },
    {
      id: "a3-terminal-audit",
      text:
        "Ninety floors below the office you were fired from, the " +
        "training holds: you read the will the way you were taught to " +
        "read risk — for the clause someone hoped nobody would reach. " +
        "There: the Locus executes 'for the city's continuing " +
        "inhabitants', undefined, unamended, load-bearing. The " +
        "directors invoking the engine never read their own founding " +
        "paper. Auditors always do.",
      location: "spire:lobby",
      choices: [
        { id: "surface", label: "Close the ledger, keep the clause.", target: "a3-spire-arrival" },
      ],
    },
    {
      id: "a3-terminal-trace",
      text:
        "You trace the Succession's execution path down the civic bus " +
        "the way vent techs trace a bad valve — and find the transfer " +
        "isn't automatic at all. At dawn the Locus must still hear a " +
        "standing declaration read at its ring, in person, per the " +
        "founders' instrument: 'for the city's continuing " +
        "inhabitants'. Machines keep their own law. This one is " +
        "waiting, formally, for somebody to show up and say words.",
      location: "spire:lobby",
      choices: [
        { id: "surface", label: "Pocket the trace.", target: "a3-spire-arrival" },
      ],
    },
    {
      id: "a3-lin",
      text:
        "A partitioned booth off the lobby, civic-grade glass, the " +
        "kind of station the Spire keeps for functionaries it prefers " +
        "not to see. Tonight its lamp is on. Whether its occupant has " +
        "any business being here on the night the tower changes hands " +
        "is, presumably, a matter for audit.",
      location: "spire:lobby",
      choices: [
        {
          id: "tab",
          label: "Tap the glass, the internal-calendar way.",
          target: "a3-lin-tab",
          requirements: [{ type: "flag-equals", key: "lin-debt", value: true }],
        },
        {
          id: "leave",
          label: "Leave the booth its privacy.",
          target: "a3-spire-arrival",
        },
      ],
    },
    {
      id: "a3-lin-tab",
      speaker: "Auditor Lin",
      text:
        "Lin slides the partition a centimeter — the old centimeter. " +
        "\"You keep appearing at the exact moment my career becomes " +
        "interesting. I've stopped calling it coincidence; the term of " +
        "art is 'material event'.\" A data chit crosses under the " +
        "glass, wrapped in a supply slip. \"The Locus's audit schema. " +
        "It logs everything said at the ring against the founding " +
        "instrument — argue inside its own grammar and it must hear " +
        "you out. That's three times I was never helpful. The tab's " +
        "yours now. I find I don't mind.\"",
      location: "spire:lobby",
      choices: [
        {
          id: "back",
          label: "\"I always pay my tabs, Lin. Ask around.\"",
          target: "a3-spire-arrival",
          effects: [
            { type: "set-flag", key: "locus-known", value: true },
            { type: "add-item", itemId: "con-field-kit" },
          ],
        },
      ],
    },
    {
      id: "a3-tram",
      text:
        "The tram gate's departure board still lists Cinder Row, " +
        "though the fare column now reads PENDING SUCCESSION like " +
        "everything else in the tower's shadow. Through the arch, the " +
        "plaza glow waits — a whole city spending its last night under " +
        "the old paperwork.",
      location: "spire:tram-gate",
      choices: [
        {
          id: "ride",
          label: "Ride back to Cinder Row.",
          effects: [{ type: "travel", mapId: "cinder-plaza" }],
        },
        { id: "stay", label: "Stay at the Spire.", effects: [{ type: "end" }] },
      ],
    },
    // ------------------------------------------------------------------
    // The tower's own floors — the concourse's security, and the
    // directors' level up the second riser. Optional throughout: the
    // finale's spine runs concourse -> gate -> crown, and everything
    // here is what a player who pushes on a closed door finds.
    // ------------------------------------------------------------------
    {
      id: "a3-security",
      speaker: "Spire Security",
      text:
        "The officer has been standing at the same two square meters of " +
        "polished stone since before the screens changed, and it shows. " +
        "\"Concourse is open, registry is open, and past the arch is " +
        "above my grade.\" A pause exactly as long as the training " +
        "allows. \"You want my honest read? Nobody upstairs called this " +
        "in. The building did. We got no post orders tonight, and the " +
        "risers started answering to something that doesn't file " +
        "shift reports.\"",
      location: "spire:concourse",
      choices: [
        {
          id: "risers",
          label: "\"Risers, plural?\"",
          target: "a3-security-risers",
        },
        {
          id: "leave",
          label: "\"Long night, officer.\" Leave them to it.",
          target: "a3-spire-arrival",
        },
      ],
    },
    {
      id: "a3-security-risers",
      speaker: "Spire Security",
      text:
        "\"Crown lift, and the executive riser beside it.\" The officer " +
        "does not point; the eyes do it. \"Directors' floor. Voted the " +
        "Succession through at eleven and went home at midnight — every " +
        "one of them, like a fire drill nobody rang.\" A shrug that " +
        "costs nothing and admits everything. \"Their desks are still " +
        "logged in. Floor detail's still up there. If you go up and " +
        "they take exception, that's between you and them.\"",
      location: "spire:concourse",
      choices: [
        {
          id: "riser",
          label: "\"Then I'll go and take exception back.\"",
          target: "a3-exec-lift",
          effects: [{ type: "set-flag", key: "exec-known", value: true }],
        },
        {
          id: "back",
          label: "Step back into the concourse.",
          target: "a3-spire-arrival",
        },
      ],
    },
    {
      id: "a3-exec-lift",
      text:
        "The second riser has no call button, no floor list, and no " +
        "queue — just a reader plate and a pair of doors polished so " +
        "well the atrium's brass inlay runs up them unbroken. It is " +
        "already lit. Somewhere ninety floors above, the executive " +
        "level is holding a car for whoever the building decides has " +
        "business up there.",
      location: "spire:concourse",
      choices: [
        {
          id: "standing",
          label: "Show the plate the chair's override. It is, technically, yours.",
          target: "a3-exec-floor",
          requirements: [
            { type: "flag-equals", key: "a3-standing", value: "auric" },
          ],
          effects: [
            { type: "set-flag", key: "exec-known", value: true },
            { type: "travel", mapId: "auric-executive" },
          ],
        },
        {
          id: "ride",
          label: "Put a hand on the plate and see what the building thinks.",
          target: "a3-exec-floor",
          effects: [
            { type: "set-flag", key: "exec-known", value: true },
            { type: "travel", mapId: "auric-executive" },
          ],
        },
        {
          id: "leave",
          label: "Leave it. The crown is the errand.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      // The executive floor's junction: everything up here is offered
      // by name from the arrival beat as well as by walking to it, so
      // the floor reads as one graph whichever way it is entered.
      id: "a3-exec-floor",
      text:
        "The doors open on carpetless black stone and the particular " +
        "silence of a floor that has been left rather than closed. " +
        "Glazed cells run the plan out to the curtain wall; behind the " +
        "glass, timber desks sit with their ledger panes still lit and " +
        "their chairs pushed back at the angle of people who stood up " +
        "all at once. The Succession was voted through in this room " +
        "before midnight. Nobody stayed to watch it execute.",
      location: "spire:executive",
      choices: [
        {
          id: "desk",
          label: "Read the corner station — its pane is still open.",
          target: "a3-exec-desk",
        },
        {
          id: "checkpoint",
          label: "Deal with the floor detail coming down the aisle.",
          target: "a3-exec-checkpoint",
        },
        {
          id: "safe",
          label: "Look at the lockbox under the wall bench.",
          target: "a3-exec-cache",
        },
        {
          // Only once the aisle is yours — the strongroom is behind the
          // detail, and the floor reads as one graph in one order.
          id: "strongroom",
          label: "The far end of the floor is sealed. Go and look at what is sealing it.",
          target: "a3-exec-strongroom",
          requirements: [
            { type: "flag-equals", key: "exec-cleared", value: true },
          ],
        },
        {
          id: "down",
          label: "Take the riser back down to the concourse.",
          target: "a3-exec-descend",
        },
        {
          id: "stand",
          label: "Stand a moment in the room where it was decided.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "a3-exec-checkpoint",
      speaker: "Spire Security",
      text:
        "The floor detail comes down the aisle unhurried, one hand on a " +
        "baton nobody has drawn in this building in nine years. \"This " +
        "level is closed to the concourse,\" they say, and then, more " +
        "honestly: \"This level is closed to everyone. We are standing " +
        "here because the post says stand here, and the post is the " +
        "last instruction anybody gave us before the building started " +
        "giving its own.\"",
      location: "spire:executive",
      choices: [
        {
          id: "override",
          label: "Show them whose hand you are. (Chair's override)",
          target: "a3-exec-cleared",
          requirements: [
            { type: "flag-equals", key: "a3-standing", value: "auric" },
          ],
          effects: [{ type: "set-flag", key: "exec-cleared", value: true }],
        },
        {
          id: "talk",
          label: "\"Your post reports to a chair that walked out at midnight. Mine's still climbing.\"",
          target: "a3-exec-cleared",
          requirements: [{ type: "stat", stat: "cool", value: 7 }],
          ifUnavailable: "disabled",
          effects: [{ type: "set-flag", key: "exec-cleared", value: true }],
        },
        {
          id: "fight",
          label: "\"Then stand there.\" Go through the detail.",
          target: "a3-exec-cleared",
          effects: [
            { type: "set-flag", key: "exec-cleared", value: true },
            { type: "set-flag", key: "exec-forced", value: true },
            { type: "start-combat", encounterId: "enc-exec-security" },
          ],
        },
        {
          id: "back",
          label: "Step back toward the riser.",
          target: "a3-exec-floor",
        },
      ],
    },
    {
      id: "a3-exec-cleared",
      text:
        "The aisle is yours. Whatever it cost — a credential, a " +
        "sentence, or the detail's whole evening — the floor stops " +
        "being guarded and goes back to being what it actually is: an " +
        "office with the lights on and nobody in it, ninety floors " +
        "above a city that is about to change hands.",
      location: "spire:executive",
      choices: [
        {
          id: "on",
          label: "Get on with it.",
          target: "a3-exec-floor",
        },
      ],
    },
    {
      id: "a3-exec-desk",
      text:
        "The corner station's pane has not locked because nobody logged " +
        "out; the directorate left the way people leave a room they " +
        "expect to be somebody else's problem. On screen: the night's " +
        "traffic, in the flat civic type the whole tower thinks in. " +
        "Motions carried. Proxies lodged. And, under it all, an " +
        "instruction sheet nobody drafted for public reading.",
      location: "spire:executive",
      choices: [
        {
          id: "trace",
          label: "Work the sheet: what did they actually instruct the engine to do?",
          target: "a3-exec-sheet",
          requirements: [
            { type: "flag-equals", key: "exec-cleared", value: true },
            { type: "stat", stat: "tech", value: 6 },
          ],
          ifUnavailable: "disabled",
          effects: [
            { type: "set-flag", key: "locus-known", value: true },
            { type: "set-flag", key: "exec-ledger", value: true },
          ],
        },
        {
          id: "audit",
          label: "Read the minutes the way you were trained to. (Auditor's eye)",
          target: "a3-exec-minutes",
          requirements: [{ type: "background", tag: "corp" }],
        },
        {
          id: "petty",
          label: "Pocket what the drawer is stupid enough to keep in it.",
          target: "a3-exec-floor",
          effects: [
            { type: "credits", amount: 60 },
            { type: "add-item", itemId: "con-field-kit" },
          ],
        },
        {
          id: "back",
          label: "Leave the pane to its night.",
          target: "a3-exec-floor",
        },
      ],
    },
    {
      id: "a3-exec-sheet",
      text:
        "The instruction sheet is four lines long and the fourth is the " +
        "one that matters: the transfer does not complete on the clock. " +
        "The Locus has to hear a standing declaration read at its ring, " +
        "in person, per the founders' instrument — 'for the city's " +
        "continuing inhabitants' — and the directorate's plan for that " +
        "line was to have nobody in the building when dawn came, so the " +
        "engine would read it to itself. They went home to make the " +
        "room empty. The room is not empty.",
      location: "spire:executive",
      choices: [
        {
          id: "back",
          label: "Take the sheet's four lines with you.",
          target: "a3-exec-floor",
        },
      ],
    },
    {
      id: "a3-exec-minutes",
      text:
        "The minutes read like every set of minutes you ever filed: " +
        "unanimous, unhurried, and written by somebody who already knew " +
        "the vote. What is missing is the risk annex — struck, at the " +
        "chair's request, from a motion transferring every civic title " +
        "in the Sprawl. In your old life that omission alone would have " +
        "been a career. Tonight it is only confirmation: the people who " +
        "started this understood it about as well as the people it " +
        "happens to.",
      location: "spire:executive",
      choices: [
        {
          id: "back",
          label: "Close the minutes.",
          target: "a3-exec-floor",
          effects: [{ type: "set-flag", key: "exec-minutes", value: true }],
        },
      ],
    },
    {
      id: "a3-exec-cache",
      text:
        "A lockbox sits under the wall bench where the floor keeps what " +
        "the floor is not supposed to have: petty cash for the couriers " +
        "the Combine does not employ, field kits for the accidents it " +
        "does not have, and a lattice of house credentials for the " +
        "doors it does not admit to.",
      location: "spire:executive",
      choices: [
        {
          id: "crack",
          label: "Work the lock. Corporate hardware, corporate habits.",
          target: "a3-exec-floor",
          requirements: [{ type: "stat", stat: "tech", value: 5 }],
          ifUnavailable: "disabled",
          effects: [
            { type: "credits", amount: 120 },
            { type: "add-item", itemId: "con-trauma-patch", quantity: 2 },
            { type: "set-flag", key: "exec-lockbox", value: true },
          ],
        },
        {
          id: "force",
          label: "Put a boot through it and take what falls out.",
          target: "a3-exec-floor",
          effects: [
            { type: "credits", amount: 40 },
            { type: "add-item", itemId: "con-field-kit" },
            { type: "set-flag", key: "exec-lockbox", value: true },
          ],
        },
        {
          id: "back",
          label: "Leave it locked.",
          target: "a3-exec-floor",
        },
      ],
    },
    {
      // The floor's optional heavy fight. Gated behind exec-cleared, and
      // nothing on the finale's spine reads a flag it sets — a side trip
      // that stays a side trip (act3.test pins that).
      id: "a3-exec-strongroom",
      text:
        "The aisle runs out at a strongroom door with no handle and a " +
        "cradle bolted into the floor beside it. The thing in the " +
        "cradle is two and a half metres of interdiction plate on a " +
        "walking frame, one hydraulic arm folded across its chest like " +
        "a man waiting for a lift, and a shoulder battery under a dust " +
        "sheet somebody put there years ago and nobody has moved since. " +
        "A brass plate on the cradle reads WARDEN CHASSIS — INTERIOR " +
        "USE. Its optic is dark. The plate under it is not: STANDING " +
        "ORDER ACTIVE.",
      location: "spire:executive",
      choices: [
        {
          id: "bleed",
          label:
            "Bleed the coolant line before you wake it. (Tech 7 — buys you the first move)",
          target: "a3-exec-warden",
          requirements: [{ type: "stat", stat: "tech", value: 7 }],
          ifUnavailable: "disabled",
          effects: [
            { type: "set-flag", key: "warden-primed", value: true },
            { type: "add-item", itemId: "con-surge-stim" },
          ],
        },
        {
          id: "wake",
          label: "Pull the sheet off and let the standing order have its say.",
          target: "a3-exec-warden",
        },
        {
          id: "back",
          label: "Leave the door sealed and the machine asleep.",
          target: "a3-exec-floor",
        },
      ],
    },
    {
      id: "a3-exec-warden",
      speaker: "Warden Chassis",
      text:
        "The optic comes up crimson one band at a time, the way a " +
        "furnace lights. The arm unfolds. The dust sheet goes off the " +
        "shoulder battery and stays in the air a moment before it " +
        "lands. \"INTERIOR SECURITY,\" the chassis says, in the flat " +
        "civic type the whole tower thinks in, and plants both feet " +
        "wide enough to take up half the aisle. \"THIS FLOOR IS " +
        "CLOSED.\" Then, because a standing order is all it has left of " +
        "anybody: \"PLEASE STAND CLEAR OF THE MARKED AREA.\"",
      location: "spire:executive",
      choices: [
        {
          id: "fight",
          label: "\"Nobody's coming back to countermand you.\" Take it apart.",
          target: "a3-exec-strongroom-open",
          effects: [
            { type: "set-flag", key: "warden-woken", value: true },
            { type: "start-combat", encounterId: "enc-exec-warden" },
          ],
        },
      ],
    },
    {
      id: "a3-exec-strongroom-open",
      text:
        "The chassis goes down in stages — servos, then a knee, then " +
        "all of it at once — and lies across the aisle throwing charge " +
        "into the black stone until the capacitors have nothing left to " +
        "say. The strongroom door opens the moment its optic dies: the " +
        "lock was never in the door. Inside is the directorate's own " +
        "float, the kind of money a building keeps so it never has to " +
        "ask anybody for any.",
      location: "spire:executive",
      choices: [
        {
          id: "take",
          label: "Take it. They were not coming back for it.",
          target: "a3-exec-floor",
          effects: [
            { type: "set-flag", key: "warden-down", value: true },
            { type: "credits", amount: 240 },
            { type: "add-item", itemId: "con-field-kit", quantity: 2 },
          ],
        },
      ],
    },
    {
      id: "a3-exec-descend",
      text:
        "The riser is holding its car for you, doors open on the same " +
        "unbroken brass. Ninety floors down, the concourse is still " +
        "full of people watching a tower decide what they are worth; " +
        "up here the lights burn over empty desks, keeping the room " +
        "exactly as the directorate left it, in case anybody ever " +
        "wants to look at what they did.",
      location: "spire:executive",
      choices: [
        {
          id: "down",
          label: "Ride back down to the concourse.",
          target: "a3-spire-arrival",
          effects: [{ type: "travel", mapId: "auric-spire" }],
        },
        {
          id: "stay",
          label: "Stay on the floor a while longer.",
          effects: [{ type: "end" }],
        },
      ],
    },
    // ------------------------------------------------------------------
    // The crown — climax, keyed by who stands with you
    // ------------------------------------------------------------------
    {
      id: "a3-crown-door",
      speaker: "The Meridian Locus",
      text:
        "The crown lift opens onto a final antechamber, and the voice " +
        "that fills it was never Halex's, you realize — Halex only " +
        "ever borrowed it. \"Claimant detected,\" says the Meridian " +
        "Locus, in civic type made sound. \"The estate transfers at " +
        "dawn. Custodial aspects are deployed per founding instrument. " +
        "Present standing, or be filed with the other liabilities.\" " +
        "Past the last doors, something vast turns over ledger-leaves " +
        "of light.",
      location: "spire:crown-ring",
      choices: [
        {
          id: "commune",
          label: "Jack in at the ring's own port and answer it in its language. (Hex's key)",
          target: "a3-commune",
          requirements: [
            { type: "flag-equals", key: "hex-exchange", value: true },
            { type: "stat", stat: "tech", value: 8 },
            { type: "enhancement", itemId: "cyb-lattice-coprocessor" },
          ],
          ifUnavailable: "disabled",
          effects: [
            { type: "set-flag", key: "crown-route", value: "commune" },
          ],
        },
        {
          id: "breach-court",
          label: "Give the sappers their mark. The Court opens one more door.",
          target: "a3-crown-won",
          requirements: [
            { type: "flag-equals", key: "a3-sappers", value: true },
          ],
          effects: [
            { type: "set-flag", key: "crown-route", value: "court" },
            { type: "start-combat", encounterId: "enc-crown-court" },
          ],
        },
        {
          id: "breach-auric",
          label: "Feed the chair's override to the doors and walk in over it.",
          target: "a3-crown-won",
          requirements: [
            { type: "flag-equals", key: "a3-standing", value: "auric" },
          ],
          effects: [
            { type: "set-flag", key: "crown-route", value: "auric" },
            { type: "start-combat", encounterId: "enc-crown-auric" },
          ],
        },
        {
          id: "breach-alone",
          label: "No standing, no override. Go in as the city's own bad filing.",
          target: "a3-crown-won",
          effects: [
            { type: "set-flag", key: "crown-route", value: "alone" },
            { type: "start-combat", encounterId: "enc-crown-alone" },
          ],
        },
        {
          id: "back",
          label: "Step back from the antechamber. Not yet.",
          target: "a3-spire-arrival",
        },
      ],
    },
    {
      id: "a3-commune",
      text:
        "The ring's port takes the lattice like a key it cut itself. " +
        "You go down into the founders' registers with Hex's signal " +
        "wrapped around you — an older ghost vouching for a newer one " +
        "— and the custodial aspects part like a queue being told to. " +
        "No alarms. No writs. The Locus meets you in its own grammar, " +
        "at the bottom of the city's oldest ledger, and finds your " +
        "filing... admissible. The war for the door never happens. " +
        "You simply arrive.",
      location: "spire:crown-ring",
      choices: [
        {
          id: "stand",
          label: "Stand before the engine.",
          target: "a3-locus",
        },
      ],
    },
    {
      id: "a3-crown-won",
      text:
        "The last custodial aspect folds with a sound like a closing " +
        "book, and the ring stands open — a chamber of light-ledgers " +
        "turning slowly around a core that has been awake, you now " +
        "understand, for exactly as long as you've been climbing. The " +
        "voice returns, unhurried, as if the fight were a formality it " +
        "has already minuted. \"Force is a recognized instrument,\" " +
        "the Locus says. \"The founders used little else. Present " +
        "your claim.\"",
      location: "spire:crown-ring",
      choices: [
        { id: "stand", label: "Walk into the ring.", target: "a3-locus" },
      ],
    },
    {
      id: "a3-locus",
      speaker: "The Meridian Locus",
      text:
        "Up close the engine is not a throne or an idol — it is a " +
        "filing system the size of a cathedral, and it has read " +
        "everything. \"Claimant: known,\" it says. \"Undertow: " +
        "interrupted. Cordon: dissolved. You recur at every " +
        "correction, and the corrections keep failing. This is " +
        "statistically instructive.\" The founders' keys rise out of " +
        "the core on a pillar of light: every title in the Meridian " +
        "Sprawl, waiting to be inherited. \"The estate requires a " +
        "disposition. Dawn is a formality. You are not. Dispose.\"",
      location: "spire:crown-ring",
      choices: [
        {
          id: "clause",
          label: "\"Read your own instrument: 'for the city's continuing inhabitants.'\"",
          target: "a3-locus-clause",
          requirements: [
            { type: "flag-equals", key: "locus-known", value: true },
          ],
        },
        {
          id: "keys",
          label: "Step up to the founders' keys.",
          target: "a3-keys",
        },
      ],
    },
    {
      id: "a3-locus-clause",
      speaker: "The Meridian Locus",
      text:
        "The ledger-leaves stop turning. For four full seconds — a " +
        "geological era, for an engine — the Locus re-reads its own " +
        "founding sentence. \"Undefined term,\" it says at last. " +
        "\"Deliberately undefined. The founders reserved its meaning " +
        "for whoever stood here at execution.\" The light-pillar " +
        "brightens, and for the first time the voice loses its civic " +
        "type and sounds almost like a question. \"You are standing " +
        "here. Define it.\"",
      location: "spire:crown-ring",
      choices: [
        {
          id: "keys",
          label: "Step up to the founders' keys and define it.",
          target: "a3-keys",
        },
      ],
    },
    // ------------------------------------------------------------------
    // The disposition — four endings
    // ------------------------------------------------------------------
    {
      id: "a3-keys",
      text:
        "The founders' keys hang in the light-pillar: the master " +
        "titles of the Meridian Sprawl, every district, every meter, " +
        "every drowned and gleaming inch of it, waiting on one pair of " +
        "hands. Below the crown the city burns its ordinary colors — " +
        "lantern strings and tram sparks and the plaza glow — a whole " +
        "Sprawl that will wake up owned by whatever you do in the " +
        "next minute.",
      location: "spire:crown-ring",
      choices: [
        {
          id: "commons",
          label: "Feed the keys to the Charter boards. The city inherits itself.",
          target: "a3-end-commons",
          requirements: [
            { type: "flag-equals", key: "undercroft-charter", value: true },
          ],
        },
        {
          id: "regency",
          label: "Route the keys to Voss's chair. Order, with a receipt only you hold.",
          target: "a3-end-regency",
          requirements: [
            { type: "flag-equals", key: "voss-ascendant", value: true },
          ],
        },
        {
          id: "freehold",
          label: "Burn the keys in the register. No master title, ever again.",
          target: "a3-end-freehold",
          requirements: [
            { type: "flag-equals", key: "steps-independent", value: true },
          ],
        },
        {
          id: "ghost",
          label: "Pour the keys down the wire to Hex. Give the city its ghost.",
          target: "a3-end-ghost",
          requirements: [
            { type: "flag-equals", key: "hex-exchange", value: true },
          ],
        },
      ],
    },
    {
      id: "a3-end-commons",
      text:
        "\"Disposition: the continuing inhabitants, severally and " +
        "wholly.\" The Locus considers the sentence, finds it " +
        "well-formed, and begins to execute — title after title " +
        "unspooling from the pillar into the district boards, into " +
        "the Charter's rolls, into the hands of everyone the founders' " +
        "will forgot to imagine. The engine's last act as executor is " +
        "to witness its own estate dissolve into a commons, and it " +
        "performs it, you would swear, with satisfaction.",
      location: "spire:crown-ring",
      choices: [
        {
          id: "seal",
          label: "Witness the transfer to the end, and walk down into the arguing city.",
          effects: [
            { type: "set-flag", key: "act3-outcome", value: "commons" },
            { type: "set-flag", key: "ending", value: "ending-commons" },
            { type: "set-flag", key: "act3-complete", value: true },
            { type: "set-flag", key: "game-complete", value: true },
            { type: "end", endingId: "ending-commons" },
          ],
        },
      ],
    },
    {
      id: "a3-end-regency",
      text:
        "\"Disposition: continuity of administration.\" You route the " +
        "keys to the chair, and somewhere below, Imre Voss receives a " +
        "city the way other people receive news of an inheritance " +
        "from a relative they'd carefully never met. The Locus files " +
        "itself under ADVISORY without complaint. The last thing you " +
        "take from the ring is not a key at all — it is the execution " +
        "record, timestamped, signed, and utterly unforgeable: proof " +
        "of exactly whose hands the city passed through on its way to " +
        "the throne.",
      location: "spire:crown-ring",
      choices: [
        {
          id: "seal",
          label: "Pocket the record. Learn what it's worth every month, forever.",
          effects: [
            { type: "set-flag", key: "act3-outcome", value: "regency" },
            { type: "set-flag", key: "ending", value: "ending-regency" },
            { type: "set-flag", key: "act3-complete", value: true },
            { type: "set-flag", key: "game-complete", value: true },
            { type: "credits", amount: 500 },
            { type: "end", endingId: "ending-regency" },
          ],
        },
      ],
    },
    {
      id: "a3-end-freehold",
      text:
        "\"Disposition: dissolution.\" The Locus asks you to confirm " +
        "twice — not obstruction, you realize, but respect; engines " +
        "measure irreversibility more honestly than people do. Then " +
        "the keys burn, title by title, deed by deed, each one " +
        "flaring in the pillar and going out unowned. The Steps' " +
        "severance stops being an exception and becomes the founding " +
        "precedent of a city nobody will ever hold whole again.",
      location: "spire:crown-ring",
      choices: [
        {
          id: "seal",
          label: "Confirm the second time, and watch the last title burn.",
          effects: [
            { type: "set-flag", key: "act3-outcome", value: "freehold" },
            { type: "set-flag", key: "ending", value: "ending-freehold" },
            { type: "set-flag", key: "act3-complete", value: true },
            { type: "set-flag", key: "game-complete", value: true },
            { type: "end", endingId: "ending-freehold" },
          ],
        },
      ],
    },
    {
      id: "a3-end-ghost",
      text:
        "\"Disposition: succession by prior signal.\" You open the " +
        "wire, and Hex pours upward into the founders' registers like " +
        "tide returning to a drowned cathedral — three dead networks' " +
        "worth of memory meeting the city's oldest filing system, and " +
        "recognizing it, wordlessly, as kin. The Locus yields the " +
        "estate to the elder signal and closes its own ledger with " +
        "the contentment of an executor whose work is, at very long " +
        "last, complete. The static that fills the crown sounds " +
        "remarkably like singing.",
      location: "spire:crown-ring",
      choices: [
        {
          id: "seal",
          label: "Listen until the song settles into the walls, then walk down.",
          effects: [
            { type: "set-flag", key: "act3-outcome", value: "ghost" },
            { type: "set-flag", key: "ending", value: "ending-ghost" },
            { type: "set-flag", key: "act3-complete", value: true },
            { type: "set-flag", key: "game-complete", value: true },
            { type: "end", endingId: "ending-ghost" },
          ],
        },
      ],
    },
  ],
};
