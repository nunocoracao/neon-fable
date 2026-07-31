import { injuryTreatCost } from "../injuries";
import type { StoryArc } from "../../narrative/types";

/**
 * Act 1 — "The Undertow Ledger". The cracked Auric spike from the intro
 * turns out to hold the Undertow schedule: Auric Combine's plan to
 * flood-purge the inhabited Undercroft levels under Cinder Row. The
 * chapter runs from the Cinder Row plaza (Flick, node "a1-start") down
 * to Greywater Steps, and ends on one of three mutually exclusive
 * outcomes recorded for Act 2 on the flags:
 *
 *   act1-complete: true
 *   act1-outcome:  "court" | "voss" | "broadcast"
 *   plus route flags (ally-cistern-court, ally-voss, wanted-by-auric,
 *   betrayed-court, betrayed-voss, sable-burned, voss-exposed,
 *   undertow-stopped / undertow-delayed).
 *
 * Side commitment uses the act1-side flag: "open" (set on leaving the
 * first node) until the player swears to the Cistern Court ("court") or
 * takes Voss's deal ("voss"). Gating commits on act1-side = "open" keeps
 * the two factions mutually exclusive without negative requirements.
 */
export const act1Arc: StoryArc = {
  id: "act1",
  title: "The Undertow Ledger",
  entryNodeId: "a1-start",
  nodes: [
    // ------------------------------------------------------------------
    // Hook — Cinder Row plaza
    // ------------------------------------------------------------------
    {
      id: "a1-start",
      text:
        "A kid in a cut-down rain cape plants themselves in your path — " +
        "Flick, who runs messages for half of Cinder Row and lies for the " +
        "other half. \"Sable's calling everyone in. The pumps under " +
        "Greywater ran backwards last night. Backwards. People woke up " +
        "with the water over their door-sills.\"",
      location: "cinder-row:plaza",
      comments: [
        {
          companionId: "vesper",
          text:
            "\"Backwards.\" She has stopped walking. \"Pumps don't run " +
            "backwards. Somebody runs them backwards.\"",
        },
        {
          companionId: "sill",
          text:
            "\"Reverse flow is a two-key operation,\" he says, quietly. " +
            "\"There is a name on the second key. There always is.\"",
        },
      ],
      choices: [
        {
          id: "quiet-now",
          label: "\"It's done, Flick.\" (The Steps are quiet now.)",
          target: "a1-quiet",
          requirements: [
            { type: "flag-equals", key: "act1-complete", value: true },
          ],
        },
        {
          id: "follow",
          label: "Flip Flick a coin-chit and follow. \"Lead on.\"",
          target: "a1-sable",
          effects: [
            { type: "set-flag", key: "flick-friend", value: true },
            { type: "set-flag", key: "act1-side", value: "open" },
          ],
        },
        {
          id: "brush-off",
          label: "Brush the kid off. You don't jump when fixers whistle.",
          target: "a1-brushoff",
          effects: [
            { type: "set-flag", key: "flick-slighted", value: true },
            { type: "set-flag", key: "act1-side", value: "open" },
          ],
        },
      ],
    },
    {
      id: "a1-quiet",
      speaker: "Flick",
      text:
        "\"Yeah.\" Flick scuffs a boot against the plaza glow-tiles, " +
        "suddenly shy of you the way the Row gets shy of people who've " +
        "become weather. \"Whole Sprawl's still chewing on what you did.\"",
      location: "cinder-row:plaza",
      choices: [
        {
          id: "ask-court",
          label: "Ask after Greywater Steps.",
          target: "a1-quiet-court",
          requirements: [
            { type: "flag-equals", key: "act1-outcome", value: "court" },
          ],
        },
        {
          id: "ask-voss",
          label: "Ask what Auric is saying upstairs.",
          target: "a1-quiet-voss",
          requirements: [
            { type: "flag-equals", key: "act1-outcome", value: "voss" },
          ],
        },
        {
          id: "ask-lone",
          label: "Ask what the screens are showing now.",
          target: "a1-quiet-lone",
          requirements: [
            { type: "flag-equals", key: "act1-outcome", value: "broadcast" },
          ],
        },
        {
          id: "move-along",
          label: "Move along.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "a1-quiet-court",
      speaker: "Flick",
      text:
        "\"Ferrow's got work gangs shoring the terraces, and they hung a " +
        "pump valve over the hall door like a trophy. Kids down there " +
        "play a game now. It's called Undertow. You lose if you drown.\"",
      location: "cinder-row:plaza",
      choices: [
        { id: "done", label: "Some games you want them to win.", effects: [{ type: "end" }] },
      ],
    },
    {
      id: "a1-quiet-voss",
      speaker: "Flick",
      text:
        "\"Auric says 'deferred pending infrastructural review', which in " +
        "tower-talk means somebody important got embarrassed. Your name " +
        "moves through the Glasshouse in a whisper now. Careful it stays " +
        "a nice whisper.\"",
      location: "cinder-row:plaza",
      choices: [
        { id: "done", label: "Whispers pay better than shouting.", effects: [{ type: "end" }] },
      ],
    },
    {
      id: "a1-quiet-lone",
      speaker: "Flick",
      text:
        "\"Every screen from here to the tram loop, three days straight. " +
        "They've started scrubbing it, but you can't scrub what a million " +
        "people already memorized.\" Flick grins. \"There's a warrant out " +
        "with your walk in it. I'd learn a new walk.\"",
      location: "cinder-row:plaza",
      choices: [
        { id: "done", label: "New walk. Same direction.", effects: [{ type: "end" }] },
      ],
    },
    {
      id: "a1-brushoff",
      speaker: "Flick",
      text:
        "Flick spits neatly between your boots. \"Fine. But two sleepers " +
        "drowned on Ledge Nine last night, and the Court's ringing the " +
        "storm bell, and Sable said your name specific.\" The kid's " +
        "already walking. \"Filament. Or don't.\"",
      location: "cinder-row:plaza",
      choices: [
        {
          id: "go-anyway",
          label: "Fine. The Filament.",
          target: "a1-sable",
        },
      ],
    },
    // ------------------------------------------------------------------
    // Sable's brief — the Filament Bar
    // ------------------------------------------------------------------
    {
      id: "a1-sable",
      speaker: "Sable",
      text:
        "Sable's corner table has grown a paper problem: tide charts, " +
        "pump schematics, a dead courier's manifest. \"The spike our " +
        "late friend was carrying. It wasn't product. It was Auric's " +
        "Reclamation division talking to itself — a schedule called the " +
        "Undertow. They're going to flush the inhabited levels under " +
        "Greywater Steps and file the bodies as storm loss.\"",
      location: "cinder-row:filament-bar",
      choices: [
        {
          id: "about-spike",
          label: "\"The spike I brought you. You read it.\"",
          target: "a1-sable-delivered",
          requirements: [
            { type: "flag-equals", key: "spike-delivered", value: true },
          ],
          effects: [
            { type: "set-flag", key: "sable-trust", value: true },
            { type: "credits", amount: 25 },
          ],
        },
        {
          id: "show-spike",
          label: "Set the cracked spike on the table. You never handed it over.",
          target: "a1-sable-kept",
          requirements: [{ type: "item", itemId: "msc-cracked-spike" }],
          effects: [{ type: "set-flag", key: "only-copy", value: true }],
          reactions: ["deception", "record"],
        },
        {
          id: "just-job",
          label: "\"Skip the history. What's the job?\"",
          target: "a1-brief",
        },
      ],
    },
    {
      id: "a1-sable-delivered",
      speaker: "Sable",
      text:
        "\"Read it twice, then wished I hadn't.\" A chit slides across " +
        "the table — a finder's cut, unasked. \"You brought me a bomb " +
        "with a calendar on it. The least I can do is pay you before it " +
        "goes off.\"",
      location: "cinder-row:filament-bar",
      choices: [
        {
          id: "on-to-business",
          label: "\"Then let's beat the calendar.\"",
          target: "a1-brief",
        },
      ],
    },
    {
      id: "a1-sable-kept",
      speaker: "Sable",
      text:
        "Sable looks at the spike, then at you, doing arithmetic that " +
        "doesn't flatter either of you. \"You lied to my face. And the " +
        "courier's backup drive corroded in the flood, so that casing " +
        "in your jacket is now the only complete copy in the Sprawl.\" " +
        "A thin smile. \"Congratulations. You're load-bearing.\"",
      location: "cinder-row:filament-bar",
      choices: [
        {
          id: "on-to-business",
          label: "\"Then tell me what I'm carrying.\"",
          target: "a1-brief",
        },
      ],
    },
    {
      id: "a1-brief",
      speaker: "Sable",
      text:
        "\"First flush test ran last night — two dead on Ledge Nine. The " +
        "Cistern Court is begging for proof they can rally the districts " +
        "with. Meanwhile Auric parked a 'community liaison' in the " +
        "Glasshouse, a director named Voss, and Voss is buying silence " +
        "at very good rates.\" Sable leans back. \"Two doors. Or find a " +
        "third. But decide fast — the water won't wait.\"",
      location: "cinder-row:filament-bar",
      choices: [
        {
          id: "descend",
          label: "Take the Chainwell down to Greywater Steps.",
          target: "a1-steps-arrival",
          effects: [{ type: "travel", mapId: "greywater-steps" }],
        },
        {
          id: "glasshouse",
          label: "Call on the Glasshouse first. Know your buyer.",
          target: "a1-glasshouse-door",
        },
        {
          id: "counsel",
          label: "\"If both doors are bad — what's the third?\"",
          target: "a1-sable-read",
          effects: [{ type: "set-flag", key: "knows-relay", value: true }],
        },
      ],
    },
    {
      id: "a1-sable-read",
      speaker: "Sable",
      text:
        "\"The old Relay Crown, on the tower over the tram loop. Dead " +
        "since the Combine bought the broadcast bands — but dead isn't " +
        "dismantled. Feed it the ledger and every screen in the Sprawl " +
        "reads it at once. No faction owns you afterward.\" Sable's eyes " +
        "go flat. \"Also no faction protects you afterward. Third doors " +
        "are like that.\"",
      location: "cinder-row:filament-bar",
      choices: [
        { id: "back", label: "Noted. Back to it.", target: "a1-brief" },
      ],
    },
    // ------------------------------------------------------------------
    // The Glasshouse — Auric's field office
    // ------------------------------------------------------------------
    {
      id: "a1-glasshouse-door",
      text:
        "The Glasshouse is a lobe of Auric glass grafted onto Cinder " +
        "Row's stone face, lobby air scrubbed so clean it tastes of " +
        "nothing at all. A greeter drone orbits a young Auditor — LIN, " +
        "per the lapel — who is pretending very hard not to watch the " +
        "door.",
      location: "cinder-row:glasshouse",
      choices: [
        {
          id: "audit-cadence",
          label: "Quote the internal audit calendar at Lin, ninetieth-floor cadence.",
          target: "a1-lin-corp",
          requirements: [{ type: "background", tag: "corp" }],
          effects: [
            { type: "add-item", itemId: "msc-glasshouse-pass" },
            { type: "set-flag", key: "lin-favor", value: true },
          ],
        },
        {
          id: "liaison",
          label: "Ask for the community liaison.",
          target: "a1-voss-meet",
        },
        {
          id: "leave",
          label: "Step back into the rain.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "a1-lin-corp",
      speaker: "Auditor Lin",
      text:
        "Lin's posture snaps a centimeter straighter — tower recognizing " +
        "tower. \"They deleted your floor, you know. Renamed the cost " +
        "center.\" A duty pass changes hands under the greeter drone's " +
        "blind spot. \"Reclamation rotates wardens off the pump deck at " +
        "the shift bell. That pass says the water is your business. I " +
        "was never this helpful.\"",
      location: "cinder-row:glasshouse",
      choices: [
        {
          id: "walk-up",
          label: "\"One more thing — walk me in to the liaison.\"",
          target: "a1-voss-meet",
        },
        {
          id: "leave-pass",
          label: "Pocket the pass and go while the drone's still blind.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "a1-voss-meet",
      speaker: "Director Voss",
      text:
        "Imre Voss keeps a terrarium of salt-plants where a family photo " +
        "would go. \"The Undertow schedule is Director Halex's project. " +
        "I think it's wasteful. Bring me the ledger and I bury Halex in " +
        "committee, the flush dies quietly, and you bank three hundred " +
        "credits plus a clean file.\" The smile is excellent. It has " +
        "been practiced on better liars than you.",
      location: "cinder-row:glasshouse",
      choices: [
        {
          id: "take-deal",
          label: "Shake on it. Auric money spends like anyone's.",
          target: "a1-voss-task",
          requirements: [
            { type: "flag-equals", key: "act1-side", value: "open" },
          ],
          effects: [
            { type: "set-flag", key: "act1-side", value: "voss" },
            { type: "set-flag", key: "voss-deal", value: true },
          ],
          standing: { auric: 10, court: -6 },
        },
        {
          id: "string-along",
          label: "Smile back. Take the task, promise nothing.",
          target: "a1-voss-task",
          effects: [{ type: "set-flag", key: "voss-string", value: true }],
        },
        {
          id: "refuse",
          label: "\"People drowned last night. Keep your committee.\"",
          target: "a1-voss-refused",
          effects: [{ type: "set-flag", key: "voss-refused", value: true }],
        },
      ],
    },
    {
      id: "a1-voss-task",
      speaker: "Director Voss",
      text:
        "\"Good. Two errands, then. The ledger — every copy; I'll know " +
        "if you're creative about 'every'. And the Cistern Court has " +
        "siphon taps bleeding our mains on the pump deck. Close them. " +
        "Think of it as showing me your work.\" Voss feeds the salt-" +
        "plants a pipette of brine. \"The water is patient. I am less.\"",
      location: "cinder-row:glasshouse",
      choices: [
        {
          id: "descend",
          label: "Take the Chainwell down to Greywater Steps.",
          target: "a1-steps-arrival",
          effects: [{ type: "travel", mapId: "greywater-steps" }],
        },
        {
          id: "leave",
          label: "Leave the Glasshouse.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "a1-voss-refused",
      speaker: "Director Voss",
      text:
        "Voss doesn't flinch; directors are upholstered against " +
        "sincerity. \"An opinion. How refreshing.\" The terrarium mists " +
        "itself. \"The Undertow doesn't need your permission, and " +
        "neither do I. Mind the door — it's glass, and so, currently, " +
        "is your standing with the Combine.\"",
      location: "cinder-row:glasshouse",
      choices: [
        {
          id: "descend",
          label: "Down to Greywater Steps, then. Fast.",
          target: "a1-steps-arrival",
          effects: [{ type: "travel", mapId: "greywater-steps" }],
        },
        {
          id: "leave",
          label: "Step out onto the plaza.",
          effects: [{ type: "end" }],
        },
      ],
    },
    // ------------------------------------------------------------------
    // Greywater Steps — arrival and locals
    // ------------------------------------------------------------------
    {
      id: "a1-steps-arrival",
      text:
        "Greywater Steps opens below the Chainwell like a lung: terraces " +
        "of salvaged housing stacked over a black cistern pool, lantern " +
        "strings doubled in the water, sandbag walls with fresh " +
        "waterlines a hand higher than the old ones. The Cistern " +
        "Court's hall glows at the center of it all. Someone has chalked " +
        "names on the wall by the stair — two of them ringed in white.",
      location: "greywater:terraces",
      choices: [
        { id: "to-hall", label: "Seek the Court hall and Matron Ferrow.", target: "a1-ferrow" },
        { id: "to-den", label: "Find Patch's courier den.", target: "a1-patch" },
        { id: "to-shrine", label: "Look over the dead relay shrine.", target: "a1-shrine" },
        { id: "to-flick", label: "Catch up with Flick by the glow-court.", target: "a1-flick-steps" },
        { id: "to-board", label: "Read the notice board.", target: "a1-board" },
        { id: "to-gate", label: "Walk down to the pump-deck gate.", target: "a1-pumpgate" },
        { id: "to-stair", label: "Head back to the Chainwell stair.", target: "a1-ascend" },
        {
          id: "walk",
          label: "Walk the terraces awhile.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "a1-ferrow",
      speaker: "Matron Ferrow",
      text:
        "Idra Ferrow stands where the water reached last night, boots " +
        "still in it, directing sandbag gangs with a voice that has " +
        "given up being tired. \"Topsider. You're either Auric's new " +
        "face or Sable's new hands, and I've no time to guess which.\" " +
        "Behind her, the Court hall doors stand open — two shrouded " +
        "shapes laid out under the lanterns. \"Ledge Nine. Say whatever " +
        "you came to say over them.\"",
      location: "greywater:court-hall",
      choices: [
        {
          id: "oath",
          label: "\"I'm the hands. Auric drowns no one else down here.\"",
          target: "a1-court-task",
          requirements: [
            { type: "flag-equals", key: "act1-side", value: "open" },
          ],
          effects: [
            { type: "set-flag", key: "act1-side", value: "court" },
            { type: "set-flag", key: "court-oath", value: true },
          ],
          standing: { court: 12 },
        },
        {
          id: "ask-doubt",
          label: "\"And if the districts don't rally? What then?\"",
          target: "a1-ferrow-doubt",
        },
        {
          id: "probe",
          label: "Ask about the Court's defenses. Professionally.",
          target: "a1-spy-court",
          requirements: [
            { type: "flag-equals", key: "act1-side", value: "voss" },
          ],
          effects: [{ type: "set-flag", key: "court-scouted", value: true }],
        },
        {
          id: "leave",
          label: "Leave the hall.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "a1-ferrow-doubt",
      speaker: "Matron Ferrow",
      text:
        "\"Then we lose slow instead of fast.\" She wrings cistern water " +
        "from her cuff, unhurried. \"The Steps have drowned three times " +
        "since I was a girl. Every time, the ones who stayed dug the " +
        "terraces one course higher. Auric thinks patience is a thing " +
        "you buy.\" A grim near-smile. \"We grow it.\"",
      location: "greywater:court-hall",
      choices: [
        { id: "back", label: "Turn back to the Matron.", target: "a1-ferrow" },
      ],
    },
    {
      id: "a1-court-task",
      speaker: "Matron Ferrow",
      text:
        "Ferrow grips your forearm once, hard — the Court's whole " +
        "ceremony. \"Then here's the shape of it. My sappers can kill " +
        "the Undertow at the manifold, but the pump deck is sealed " +
        "under an Auric override, and the gate's grown wardens since " +
        "last night. Get us onto that deck and mark the charge points. " +
        "The ledger buys us the districts; the charges buy us time.\"",
      location: "greywater:court-hall",
      choices: [
        { id: "to-gate", label: "\"Then I'm for the gate.\"", target: "a1-pumpgate" },
        {
          id: "terraces",
          label: "\"First I work the terraces. Preparation wins sieges.\"",
          target: "a1-steps-arrival",
        },
      ],
    },
    {
      id: "a1-spy-court",
      text:
        "You walk the sandbag lines with a professional eye and a " +
        "borrowed frown. Two dozen sappers, cutting tools, no firearms " +
        "worth the name; their whole defense assumes the water is the " +
        "enemy, not the people who own it. Ferrow answers your questions " +
        "openly. That's the part you don't write down.",
      location: "greywater:court-hall",
      choices: [
        {
          id: "slip-out",
          label: "Thank her and slip out with the count in your head.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "a1-patch",
      text:
        "Patch's den hangs off the third terrace, a shipping pod strung " +
        "with cable spools and drying slickers. Patch — one arm, three " +
        "opinions about everything — is splicing a junction by lantern " +
        "light. \"Buy something or bleed somewhere else,\" they say, " +
        "without looking up.",
      location: "greywater:patch-den",
      choices: [
        {
          id: "knock",
          label: "Rap the courier knock on the doorframe. The old one.",
          target: "a1-patch-street",
          requirements: [{ type: "background", tag: "street" }],
          effects: [
            { type: "set-flag", key: "knows-culvert", value: true },
            { type: "set-flag", key: "knows-relay", value: true },
            { type: "add-item", itemId: "con-trauma-patch" },
          ],
        },
        {
          id: "browse",
          label: "\"Buying, then. Show me the shelf.\"",
          target: "a1-patch-shop",
        },
        // The clinic half of the den. Exactly one of these three can
        // ever be visible — a character carries at most one injury —
        // and each opens the beat where Patch names the specific thing
        // that is wrong, because a clinic that says "you're hurt" is
        // not a clinic. All hidden when unhurt, which is most visits.
        {
          id: "clinic-winged",
          label: "Show them the arm.",
          target: "a1-patch-winged",
          requirements: [{ type: "injury", injuryId: "inj-winged" }],
        },
        {
          id: "clinic-concussed",
          label: "Admit the room has not stopped moving.",
          target: "a1-patch-concussed",
          requirements: [{ type: "injury", injuryId: "inj-concussed" }],
        },
        {
          id: "clinic-servo",
          label: "Hold out the arm that stopped answering.",
          target: "a1-patch-servo",
          requirements: [{ type: "injury", injuryId: "inj-servo-lock" }],
        },
        // And the crew's side of the same counter, split the same way
        // and for the same reason: the line has to name what it is
        // looking at.
        {
          id: "clinic-crew-arm",
          label: "\"Not me. Look at their arm.\"",
          target: "a1-patch-crew-arm",
          requirements: [
            { type: "companion", companionId: "vesper" },
            { type: "injury", companionId: "vesper", injuryId: "inj-winged" },
          ],
        },
        {
          id: "clinic-crew-head",
          label: "\"Not me. They took one to the head.\"",
          target: "a1-patch-crew-head",
          requirements: [
            { type: "companion", companionId: "vesper" },
            { type: "injury", companionId: "vesper", injuryId: "inj-concussed" },
          ],
        },
        {
          id: "leave",
          label: "Leave the den.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "a1-patch-winged",
      speaker: "Patch",
      expression: "grim",
      text:
        "Patch cuts the field dressing off without asking and looks at " +
        "what somebody's round did on its way past. \"Winged. Through " +
        "and out — lucky, if you like that word.\" They press two " +
        "fingers below the wound and watch your hand. \"That is going " +
        "to be slow for a week unless somebody closes it properly. I " +
        "am somebody.\"",
      location: "greywater:patch-den",
      choices: [
        {
          id: "pay",
          label: `"Close it, then." (${injuryTreatCost("inj-winged")} cr)`,
          target: "a1-patch-treated",
          requirements: [{ type: "credits", value: injuryTreatCost("inj-winged") }],
          ifUnavailable: "disabled",
          effects: [{ type: "treat-injury" }],
        },
        {
          id: "wait",
          label: "\"It'll close on its own.\"",
          target: "a1-patch",
        },
      ],
    },
    {
      id: "a1-patch-concussed",
      speaker: "Patch",
      expression: "grim",
      text:
        "Patch holds a lantern up and moves it, and watches your eyes " +
        "not quite keep up with it. \"Right. You are concussed, and you " +
        "are about to tell me you are fine, and the sentence is going to " +
        "get away from you halfway through.\" A shrug. \"Rest fixes it. " +
        "So does a shunt and forty minutes of me not being paid.\"",
      location: "greywater:patch-den",
      choices: [
        {
          id: "pay",
          label: `"Take the forty minutes." (${injuryTreatCost("inj-concussed")} cr)`,
          target: "a1-patch-treated",
          requirements: [
            { type: "credits", value: injuryTreatCost("inj-concussed") },
          ],
          ifUnavailable: "disabled",
          effects: [{ type: "treat-injury" }],
        },
        {
          id: "wait",
          label: "\"I'm fine.\" You are almost sure of it.",
          target: "a1-patch",
        },
      ],
    },
    {
      id: "a1-patch-servo",
      speaker: "Patch",
      expression: "grim",
      text:
        "Patch does not touch the chrome. They listen to it, head tilted, " +
        "the way they listened to your Static. \"Servo-lock. Something " +
        "hit you hard enough that the hardware filed a complaint and " +
        "stopped taking calls.\" They set a jack on the crate. \"It is " +
        "not broken. It is sulking. Resetting a sulk is skilled work.\"",
      location: "greywater:patch-den",
      choices: [
        {
          id: "pay",
          label: `"Reset it." (${injuryTreatCost("inj-servo-lock")} cr)`,
          target: "a1-patch-treated",
          requirements: [
            { type: "credits", value: injuryTreatCost("inj-servo-lock") },
          ],
          ifUnavailable: "disabled",
          effects: [{ type: "treat-injury" }],
        },
        {
          id: "wait",
          label: "\"It'll come back up.\"",
          target: "a1-patch",
        },
      ],
    },
    {
      // The crew's side of the same counter. Two beats rather than one,
      // for the same reason the player has three: the line has to name
      // what it is treating.
      id: "a1-patch-crew-arm",
      speaker: "Patch",
      text:
        "Patch looks past you at the one holding their arm wrong, and " +
        "their whole manner changes — the trader goes out of it and " +
        "something older comes in. \"Sit,\" they say, to somebody who is " +
        "not you. \"Not you. Winged is winged whoever it happened to, " +
        "and you can stand there and pay for it.\"",
      location: "greywater:patch-den",
      choices: [
        {
          id: "pay",
          label: `"Close it." (${injuryTreatCost("inj-winged")} cr)`,
          target: "a1-patch-treated",
          requirements: [{ type: "credits", value: injuryTreatCost("inj-winged") }],
          ifUnavailable: "disabled",
          effects: [{ type: "treat-injury", companionId: "vesper" }],
          reactions: ["mercy"],
        },
        {
          id: "wait",
          label: "\"Later. We're working.\"",
          target: "a1-patch",
        },
      ],
    },
    {
      id: "a1-patch-crew-head",
      speaker: "Patch",
      text:
        "Patch takes one look at how your crew is standing and stops " +
        "pretending to be a shopkeeper. \"Concussed. I have seen better " +
        "balance on the quay in a swell.\" The lantern comes up. \"Sit " +
        "down before you fall down. You —\" a nod at you \"— pay.\"",
      location: "greywater:patch-den",
      choices: [
        {
          id: "pay",
          label: `"See to it." (${injuryTreatCost("inj-concussed")} cr)`,
          target: "a1-patch-treated",
          requirements: [
            { type: "credits", value: injuryTreatCost("inj-concussed") },
          ],
          ifUnavailable: "disabled",
          effects: [{ type: "treat-injury", companionId: "vesper" }],
          reactions: ["mercy"],
        },
        {
          id: "wait",
          label: "\"Later. We're working.\"",
          target: "a1-patch",
        },
      ],
    },
    {
      id: "a1-patch-treated",
      speaker: "Patch",
      expression: "smile",
      text:
        "It takes less time than the argument about paying for it did. " +
        "Patch works without narrating, wipes their hand on the slicker, " +
        "and goes back to the junction they were splicing. \"Try to come " +
        "back for the shelf next time,\" they say. \"Buying is cheaper " +
        "than bleeding.\"",
      location: "greywater:patch-den",
      choices: [
        { id: "back", label: "\"No promises.\"", target: "a1-patch" },
      ],
    },
    {
      id: "a1-patch-street",
      speaker: "Patch",
      expression: "smile",
      text:
        "Patch's head comes up at the knock, and twenty years fall off " +
        "their face. \"Underlevels crew. Ha!\" They press a trauma patch " +
        "on you like an aunt pressing food. \"Listen — the flush " +
        "foreman drowned at his own post; the culvert under the gate " +
        "still runs past him, if you've the lungs for floodwater. And " +
        "if it all goes sideways, the old Relay Crown topside still has " +
        "teeth. Couriers used to bounce pirate signal off it. Didn't " +
        "hear either thing from me.\"",
      location: "greywater:patch-den",
      choices: [
        { id: "back", label: "\"Never do. Thanks, Patch.\"", target: "a1-patch" },
      ],
    },
    {
      id: "a1-patch-shop",
      speaker: "Patch",
      text:
        "The shelf is a cargo net: dermal packs in trade-grade wrap, one " +
        "surge stim with a hand-lettered warranty (\"no\"), and a " +
        "surgery case holding a set of Silt Gills, still in their " +
        "clinic seals. \"Flood season prices. Complaints go to the " +
        "flood.\" Under the net, in a foil sleeve marked in grease " +
        "pencil, sit two things nobody browsing asks about: a Baffle " +
        "Weave and a Null Collar.",
      location: "greywater:patch-den",
      choices: [
        {
          id: "buy-patch",
          label: "Buy a trauma patch. (20 cr)",
          target: "a1-patch-shop",
          requirements: [{ type: "credits", value: 20 }],
          ifUnavailable: "disabled",
          effects: [
            { type: "credits", amount: -20 },
            { type: "add-item", itemId: "con-trauma-patch" },
          ],
        },
        {
          id: "buy-stim",
          label: "Buy the surge stim. (30 cr)",
          target: "a1-patch-shop",
          requirements: [{ type: "credits", value: 30 }],
          ifUnavailable: "disabled",
          effects: [
            { type: "credits", amount: -30 },
            { type: "add-item", itemId: "con-surge-stim" },
          ],
        },
        {
          id: "buy-gills",
          label: "Buy the Silt Gills. (150 cr)",
          target: "a1-patch-shop",
          requirements: [{ type: "credits", value: 150 }],
          ifUnavailable: "disabled",
          effects: [
            { type: "credits", amount: -150 },
            { type: "add-item", itemId: "cyb-silt-gills" },
          ],
        },
        // Dampeners. The clinic is the only counter in the city that
        // sells the quiet, and Patch sells it the way they sell
        // everything: flatly, and cheaper to somebody who already
        // knows why they need it.
        {
          id: "buy-baffle-weave",
          label: "Buy the Baffle Weave. (90 cr)",
          target: "a1-patch-shop",
          requirements: [{ type: "credits", value: 90 }],
          ifUnavailable: "disabled",
          effects: [
            { type: "credits", amount: -90 },
            { type: "add-item", itemId: "cyb-baffle-weave" },
          ],
        },
        {
          id: "buy-null-collar",
          label: "Buy the Null Collar. (220 cr)",
          target: "a1-patch-shop",
          requirements: [
            { type: "credits", value: 220 },
            // Off the shelf entirely for the visibly chromed, who are
            // offered the same collar below at the price Patch charges
            // somebody who is going to come back needing it fitted.
            { type: "static", band: "humming", mode: "at-most" },
          ],
          ifUnavailable: "hidden",
          effects: [
            { type: "credits", amount: -220 },
            { type: "add-item", itemId: "cyb-null-collar" },
          ],
        },
        {
          // The chrome-affinity offer: Patch reads the noise off you
          // before you have said a word, and prices accordingly. Shown
          // greyed rather than hidden to a quiet runner, because a
          // door you cannot open yet is how this one gets taught.
          id: "buy-null-collar-chromed",
          label:
            "\"You can hear it too, then.\" Buy the Null Collar. (160 cr)",
          target: "a1-patch-shop",
          requirements: [
            { type: "static", band: "loud" },
            { type: "credits", value: 160 },
          ],
          ifUnavailable: "disabled",
          effects: [
            { type: "credits", amount: -160 },
            { type: "add-item", itemId: "cyb-null-collar" },
          ],
        },
        {
          id: "ask-static",
          label: "Ask what the foil sleeve is for.",
          target: "a1-patch-static",
        },
        { id: "done", label: "\"That's the lot.\"", target: "a1-patch" },
      ],
    },
    {
      // The Static explainer, in a clinician's mouth rather than a
      // tutorial's. Reachable by anybody; the version a screaming
      // runner gets is the same speech with the diagnosis attached.
      id: "a1-patch-static",
      speaker: "Patch",
      text:
        "\"Chrome talks. Every piece you put in is a second nervous " +
        "system with opinions, and the more of them you carry the " +
        "louder they argue.\" Patch taps their own temple, where a " +
        "seam runs grey under the hairline. \"Static, we call it. " +
        "Quiet, you're fine. Loud, people hear you coming and half of " +
        "them respect you for it. Screaming —\" they shrug \"— " +
        "screaming, you drop a half-second behind the room, and one " +
        "day the room notices before you do. A dampener buys the " +
        "quiet back. Costs you a socket. Everything costs a socket.\"",
      location: "greywater:patch-den",
      choices: [
        {
          id: "static-mine",
          label: "\"How bad is mine?\"",
          target: "a1-patch-static-read",
          requirements: [{ type: "static", band: "loud" }],
        },
        {
          id: "static-back",
          label: "\"Show me the sleeve, then.\"",
          target: "a1-patch-shop",
        },
        { id: "static-leave", label: "Leave the den.", effects: [{ type: "end" }] },
      ],
    },
    {
      id: "a1-patch-static-read",
      speaker: "Patch",
      expression: "grim",
      text:
        "Patch does not need instruments. They stand close, tilt their " +
        "head, and listen the way a mechanic listens to a bearing. " +
        "\"Bad enough that I heard it from the door. You're not " +
        "broken — you're crowded. Give one of them a socket back, or " +
        "give me one and I'll shut the rest up for you.\" A beat. " +
        "\"Or don't. Some people like being audible. I've buried a few " +
        "of them.\"",
      location: "greywater:patch-den",
      choices: [
        {
          id: "read-shop",
          label: "\"Then sell me the collar.\"",
          target: "a1-patch-shop",
        },
        {
          id: "read-refuse",
          label: "\"I like being audible.\"",
          target: "a1-patch",
        },
      ],
    },
    {
      id: "a1-shrine",
      text:
        "A dead relay junction stands at the terrace end, votive " +
        "lanterns wired to its casing — the Steps' shrine to signals " +
        "that never came. Under the wax and ribbon, a maintenance port " +
        "sits unscarred. Something in the housing ticks, slow as a " +
        "sleeping thing's pulse.",
      location: "greywater:shrine",
      choices: [
        {
          id: "jack-in",
          label: "Jack in. Whatever ticks in there knows things.",
          target: "a1-dive",
          requirements: [{ type: "background", tag: "net" }],
          effects: [
            { type: "set-flag", key: "hex-assist", value: true },
            { type: "set-flag", key: "voss-lie-known", value: true },
            { type: "set-flag", key: "knows-relay", value: true },
          ],
        },
        {
          id: "patch-feed",
          label: "Re-splice the junction's power feed.",
          target: "a1-shrine-fixed",
          requirements: [{ type: "stat", stat: "tech", value: 7 }],
          ifUnavailable: "disabled",
          effects: [
            { type: "increment-flag", key: "steps-goodwill" },
            { type: "set-flag", key: "knows-relay", value: true },
          ],
        },
        {
          id: "leave",
          label: "Leave the lanterns to their vigil.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "a1-dive",
      speaker: "Hex",
      text:
        "The Weave down here is drowned architecture, and something " +
        "lives in it: HEX, a fragmentary archive persona wearing three " +
        "dead networks like coats. \"A diver. How nostalgic.\" It turns " +
        "your ghost-image of the ledger over in the dark. \"Correction " +
        "to your metadata: the Undertow schedule was not authored by " +
        "Director Halex. It was authored, drafted, and thrice revised " +
        "by Imre Voss. I archived every draft. I archive everything. " +
        "When you reach the pump deck, I can sing its doors open — the " +
        "locks still dream in my key.\"",
      location: "greywater:shrine",
      choices: [
        {
          id: "ask-crown",
          label: "\"And the Relay Crown? Could you sing through that?\"",
          target: "a1-dive-relay",
          effects: [{ type: "set-flag", key: "hex-broadcast", value: true }],
        },
        {
          id: "surface",
          label: "Surface with the ledger's real byline.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "a1-dive-relay",
      speaker: "Hex",
      text:
        "The dark rearranges itself into something almost eager. " +
        "\"Loudly. Bring the ledger to the Crown and I will read it to " +
        "the whole Sprawl in every register I own — and I own " +
        "registers they've never heard.\" A pause, wistful as static. " +
        "\"I was a broadcast system once. I would enjoy the exercise.\"",
      location: "greywater:shrine",
      choices: [
        {
          id: "surface",
          label: "Surface, carrying a very dangerous friendship.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "a1-shrine-fixed",
      text:
        "You strip the corroded feed and bridge it clean. The junction " +
        "hums; every votive lantern flares at once, and somewhere down " +
        "the terrace a woman laughs in disbelief. In the static under " +
        "your palms, just once, something whispers coordinates — the " +
        "old Relay Crown, topside — and a single word: 'louder.'",
      location: "greywater:shrine",
      choices: [
        {
          id: "leave",
          label: "Step back from the humming shrine.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "a1-flick-steps",
      text:
        "Flick has beaten you down the Chainwell, naturally, and holds " +
        "court by the glow-tiles with a circle of Steps kids, retelling " +
        "the morning with forty percent more heroics.",
      location: "greywater:terraces",
      choices: [
        {
          id: "chat",
          label: "\"Earn that coin-chit. What have you seen?\"",
          target: "a1-flick-rumor",
          requirements: [
            { type: "flag-equals", key: "flick-friend", value: true },
          ],
          effects: [{ type: "set-flag", key: "knows-culvert", value: true }],
        },
        {
          id: "cold",
          label: "Try to get a word in.",
          target: "a1-flick-cold",
          requirements: [
            { type: "flag-equals", key: "flick-slighted", value: true },
          ],
        },
        {
          id: "leave",
          label: "Leave the kids to their epic.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "a1-flick-rumor",
      speaker: "Flick",
      text:
        "Flick peels off from the audience, voice dropping to business. " +
        "\"The flush foreman never made it out — went down at his post " +
        "in the drowned culvert under the gate, keys still on him. " +
        "Court won't send divers, out of respect.\" A shrug. \"Respect's " +
        "free. Keys aren't.\"",
      location: "greywater:terraces",
      choices: [
        { id: "back", label: "Back to the terraces.", target: "a1-steps-arrival" },
      ],
    },
    {
      id: "a1-flick-cold",
      speaker: "Flick",
      text:
        "Flick looks straight through you, the way only a slighted " +
        "twelve-year-old can. \"Sorry. Don't jump when topsiders " +
        "whistle.\" The circle of kids closes like a fist, and whatever " +
        "Flick knows stays on their side of it.",
      location: "greywater:terraces",
      choices: [
        { id: "leave", label: "Fair enough. Walk on.", effects: [{ type: "end" }] },
      ],
    },
    {
      id: "a1-board",
      text:
        "The Court's notice board is half memorial, half war office: " +
        "work-gang rosters, a tide table annotated in three hands, and " +
        "a fresh column of names under a strip of white cloth. Pinned " +
        "dead center, an Auric notice in cheerful sans-serif.",
      location: "greywater:terraces",
      choices: [
        { id: "read", label: "Read the Auric notice.", target: "a1-board-notice" },
        { id: "leave", label: "Leave the board.", effects: [{ type: "end" }] },
      ],
    },
    {
      id: "a1-board-notice",
      text:
        "\"NOTICE OF SCHEDULED RECLAMATION. Auric Combine will conduct " +
        "essential water-management operations in sub-levels 30-46. " +
        "Residents are advised that unauthorized habitation of " +
        "infrastructure corridors is a safety violation. We appreciate " +
        "your cooperation during this exciting infrastructure renewal.\" " +
        "Someone has written under it, in careful chalk: WE LIVE HERE.",
      location: "greywater:terraces",
      choices: [
        {
          id: "step-back",
          label: "Step back from the board.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "a1-ascend",
      text:
        "The Chainwell stair coils up toward Cinder Row's sodium glow, " +
        "links thick as your wrist groaning under their counterweights. " +
        "From here you can see the whole of the Steps — and the dark " +
        "line on every wall where the water means to come back.",
      location: "greywater:terraces",
      choices: [
        {
          id: "climb",
          label: "Climb to Cinder Row.",
          effects: [{ type: "travel", mapId: "cinder-plaza" }],
        },
        { id: "stay", label: "Stay below.", effects: [{ type: "end" }] },
      ],
    },
    // ------------------------------------------------------------------
    // The pump-deck gate — a fight you can refuse to have
    // ------------------------------------------------------------------
    {
      id: "a1-pumpgate",
      text:
        "The pump-deck gate squats at the bottom of the Steps, new " +
        "Auric plate bolted over old Undercroft iron. Two wardens in " +
        "flood-grey hold it, riot pistols slung lazy — the calm of men " +
        "guarding a door nobody's supposed to argue with. Below the " +
        "walkway, floodwater slides past a culvert mouth, black and " +
        "patient.",
      location: "greywater:pump-gate",
      choices: [
        {
          id: "fight",
          label: "Go through them.",
          target: "a1-deck-entry",
          effects: [
            { type: "set-flag", key: "gate-route", value: "fight" },
            { type: "start-combat", encounterId: "enc-pump-gate" },
          ],
        },
        {
          id: "talk",
          label: "Walk up like the shift bell rang for you. \"Reclamation inspection.\"",
          target: "a1-deck-entry",
          requirements: [{ type: "stat", stat: "cool", value: 8 }],
          ifUnavailable: "disabled",
          effects: [{ type: "set-flag", key: "gate-route", value: "talk" }],
        },
        {
          id: "pass",
          label: "Show the Reclamation duty pass.",
          target: "a1-deck-entry",
          requirements: [{ type: "item", itemId: "msc-glasshouse-pass" }],
          ifUnavailable: "disabled",
          effects: [{ type: "set-flag", key: "gate-route", value: "pass" }],
        },
        {
          id: "hex",
          label: "Let Hex sing the service door open.",
          target: "a1-deck-entry",
          requirements: [
            { type: "flag-equals", key: "hex-assist", value: true },
          ],
          effects: [{ type: "set-flag", key: "gate-route", value: "hex" }],
        },
        {
          id: "culvert",
          label: "Slip into the drowned culvert and breathe the flood.",
          target: "a1-culvert",
          requirements: [
            { type: "flag-equals", key: "knows-culvert", value: true },
            { type: "enhancement", itemId: "cyb-silt-gills" },
          ],
          effects: [{ type: "set-flag", key: "gate-route", value: "culvert" }],
        },
        {
          id: "back-off",
          label: "Back off. Not yet.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "a1-culvert",
      text:
        "The gills bite cold as the flood closes over you, and then " +
        "you're breathing it — silt and rust and the taste of the whole " +
        "drowned city. The foreman is where Flick said, lashed to his " +
        "post by his own safety line, lanyard drifting. His keys are " +
        "brass and chip-steel, and one of them is stamped with the " +
        "Undertow's valve sigil. You take it gently. He's past minding.",
      location: "undercroft:culvert",
      choices: [
        {
          id: "take-key",
          label: "Take the override key and follow the culvert up.",
          target: "a1-deck-entry",
          effects: [
            { type: "add-item", itemId: "msc-override-key" },
            { type: "set-flag", key: "foreman-found", value: true },
          ],
        },
      ],
    },
    {
      id: "a1-deck-entry",
      text:
        "The pump deck is a cathedral the city forgot it built: the " +
        "Undertow manifold, six throats of riveted steel dropping into " +
        "the dark, condensation raining slow from the vault. Gauges " +
        "tick toward a red line labeled only FLUSH. From up here you " +
        "can see the Court's siphon taps bleeding the mains — and " +
        "every place a charge, or a closure order, would go.",
      location: "greywater:pump-deck",
      comments: [
        {
          companionId: "vesper",
          text:
            "\"Six throats.\" She looks down one of them for a long " +
            "moment. \"That's not drainage. That's a decision.\"",
        },
        {
          companionId: "sill",
          text:
            "\"Every gauge on this deck logs to a schedule,\" he says, " +
            "already writing. \"Which means somebody signed the red line.\"",
        },
      ],
      choices: [
        {
          id: "mark",
          label: "Mark the charge points for Ferrow's sappers.",
          target: "a1-deck-out",
          requirements: [
            { type: "flag-equals", key: "act1-side", value: "court" },
          ],
          effects: [{ type: "set-flag", key: "charges-marked", value: true }],
          reactions: ["defiance"],
        },
        {
          id: "siphon-deal",
          label: "Close the Court's siphon taps. A deal's a deal.",
          target: "a1-deck-out",
          requirements: [
            { type: "flag-equals", key: "voss-deal", value: true },
          ],
          effects: [{ type: "set-flag", key: "siphon-pulled", value: true }],
          reactions: ["procedure"],
        },
        {
          id: "siphon-string",
          label: "Close the taps — keep Voss believing in you.",
          target: "a1-deck-out",
          requirements: [
            { type: "flag-equals", key: "voss-string", value: true },
          ],
          effects: [{ type: "set-flag", key: "siphon-pulled", value: true }],
          reactions: ["deception"],
        },
        {
          id: "scout",
          label: "Touch nothing. Memorize everything.",
          target: "a1-deck-out",
          effects: [{ type: "set-flag", key: "deck-scouted", value: true }],
          reactions: ["record"],
        },
      ],
    },
    {
      id: "a1-deck-out",
      text:
        "You're barely off the deck when the manifold shudders — a " +
        "test-spin, teeth in it this time. Up the shaft, on the Steps, " +
        "a bell starts ringing that isn't the shift bell.",
      location: "greywater:pump-deck",
      choices: [
        {
          id: "back",
          label: "Get back up to the terraces.",
          target: "a1-alarm",
        },
      ],
    },
    // ------------------------------------------------------------------
    // Escalation — the flush comes tonight
    // ------------------------------------------------------------------
    {
      id: "a1-alarm",
      text:
        "The Steps have gone loud and bright: storm bell hammering, " +
        "work gangs hauling children and stores uphill, the Court hall " +
        "blazing. Word runs the terraces faster than you can walk — " +
        "Auric moved the schedule. The Undertow flushes TONIGHT. " +
        "Whatever you were going to do, the deciding part is over.",
      location: "greywater:terraces",
      comments: [
        {
          companionId: "vesper",
          text:
            "\"Bell like that on the Quays means the water's already in " +
            "the stair.\" She checks her spool without looking at it. " +
            "\"Tell me where to stand.\"",
        },
        {
          companionId: "sill",
          text:
            "\"They moved the schedule,\" he says, and there is " +
            "something almost like relief in it. \"Schedules are " +
            "amended in writing. Whatever happens tonight, it is " +
            "already a document.\"",
        },
      ],
      choices: [
        {
          id: "court",
          label: "Stand with the Court. To the pump hall.",
          target: "a1-court-plan",
          requirements: [
            { type: "flag-equals", key: "court-oath", value: true },
          ],
        },
        {
          id: "voss",
          label: "Signal Voss. The deck is in play.",
          target: "a1-voss-plan",
          requirements: [
            { type: "flag-equals", key: "voss-deal", value: true },
          ],
        },
        {
          id: "commit-voss",
          label: "Call Voss and take the deal you dangled.",
          target: "a1-voss-plan",
          requirements: [
            { type: "flag-equals", key: "voss-string", value: true },
            { type: "flag-equals", key: "act1-side", value: "open" },
          ],
          effects: [
            { type: "set-flag", key: "act1-side", value: "voss" },
            { type: "set-flag", key: "voss-deal", value: true },
          ],
          standing: { auric: 10, court: -6 },
        },
        {
          id: "crown-open",
          label: "Neither door. The Relay Crown.",
          target: "a1-lone-plan",
          requirements: [
            { type: "flag-equals", key: "knows-relay", value: true },
            { type: "flag-equals", key: "act1-side", value: "open" },
          ],
          effects: [{ type: "travel", mapId: "cinder-plaza" }],
        },
        {
          id: "crown-betray-court",
          label: "Abandon the Court's fight. The Crown will do more than charges.",
          target: "a1-lone-plan",
          requirements: [
            { type: "flag-equals", key: "knows-relay", value: true },
            { type: "flag-equals", key: "act1-side", value: "court" },
          ],
          effects: [
            { type: "set-flag", key: "betrayed-court", value: true },
            { type: "travel", mapId: "cinder-plaza" },
          ],
          standing: { court: -25 },
          reactions: ["deception"],
        },
        {
          id: "crown-betray-voss",
          label: "Burn Voss's deal. The Crown answers to no director.",
          target: "a1-lone-plan",
          requirements: [
            { type: "flag-equals", key: "knows-relay", value: true },
            { type: "flag-equals", key: "act1-side", value: "voss" },
          ],
          effects: [
            { type: "set-flag", key: "betrayed-voss", value: true },
            { type: "travel", mapId: "cinder-plaza" },
          ],
          standing: { auric: -20 },
          reactions: ["deception", "defiance"],
        },
        {
          id: "find-sable",
          label: "Find Sable in the chaos.",
          target: "a1-sable-push",
        },
      ],
    },
    {
      id: "a1-sable-push",
      speaker: "Sable",
      text:
        "Sable is on the second terrace, improbably dry, watching the " +
        "evacuation like a debt coming due. \"Still shopping for a " +
        "side? The water isn't.\" They count your options off on ringed " +
        "fingers. \"Ferrow will take any hands she can get. And if you " +
        "can't stomach flags — old couriers used to whisper about the " +
        "Relay Crown, topside. Ask me nothing else. Move.\"",
      location: "greywater:terraces",
      choices: [
        {
          id: "to-court",
          label: "\"Ferrow, then. Tell her I'm coming.\"",
          target: "a1-court-plan",
          requirements: [
            { type: "flag-equals", key: "act1-side", value: "open" },
          ],
          effects: [
            { type: "set-flag", key: "act1-side", value: "court" },
            { type: "set-flag", key: "court-oath", value: true },
          ],
          standing: { court: 12 },
        },
        {
          id: "another-way",
          label: "\"The Crown. Tell me I heard that right.\"",
          target: "a1-alarm",
          effects: [{ type: "set-flag", key: "knows-relay", value: true }],
        },
        { id: "back", label: "Turn back to the bells.", target: "a1-alarm" },
      ],
    },
    // ------------------------------------------------------------------
    // Climax A — with the Cistern Court
    // ------------------------------------------------------------------
    {
      id: "a1-court-plan",
      speaker: "Matron Ferrow",
      text:
        "The Court hall is a war room now, tide charts pinned over the " +
        "memorial cloth. \"Sappers are staged in the stairwell with " +
        "every charge we own,\" Ferrow says. \"Between them and the " +
        "manifold: an Auric holdout on the deck. Crack it open and my " +
        "people do the rest.\" She looks at you the way she looks at " +
        "load-bearing walls. \"How do we go in?\"",
      location: "greywater:court-hall",
      choices: [
        {
          id: "inner-key",
          label: "\"Through the inner door. I hold the foreman's key.\"",
          target: "a1-court-inner",
          requirements: [{ type: "item", itemId: "msc-override-key" }],
        },
        {
          id: "inner-hex",
          label: "\"Quietly. A friend of mine sings to locks.\"",
          target: "a1-court-inner",
          requirements: [
            { type: "flag-equals", key: "hex-assist", value: true },
          ],
        },
        {
          id: "frontal",
          label: "\"Straight down their throat. Sappers on my flanks.\"",
          target: "a1-court-charges",
          effects: [
            { type: "start-combat", encounterId: "enc-pumpworks-court" },
          ],
        },
      ],
    },
    {
      id: "a1-court-inner",
      text:
        "The inner route bypasses the holdout entirely — service " +
        "passages the wardens never learned, down to the manifold's " +
        "heart. One obstacle remains: the deck's original custodian " +
        "machine, mineral-crusted and vast, unfolding from its alcove " +
        "between you and the charge points. It has kept this deck for " +
        "fifty years. It does not recognize your key's authority over " +
        "its orders.",
      location: "greywater:pump-deck",
      choices: [
        {
          id: "face-custodian",
          label: "Put it down. The deck changes keepers tonight.",
          target: "a1-court-charges",
          effects: [
            { type: "start-combat", encounterId: "enc-pumpworks-inner" },
          ],
        },
      ],
    },
    {
      id: "a1-court-charges",
      text:
        "The deck is yours. Ferrow's sappers pour past you and swarm " +
        "the manifold like surgeons, charges going onto your chalk " +
        "marks — where you mapped them, the work goes twice as fast. " +
        "Ferrow herself sets the last fuse, unhurried, over the throat " +
        "marked FLUSH. \"For Ledge Nine,\" she says, to nobody in " +
        "particular. To everybody.",
      location: "greywater:pump-deck",
      choices: [
        { id: "light-it", label: "Get clear and light it.", target: "a1-end-court" },
      ],
    },
    {
      id: "a1-end-court",
      text:
        "From the stairwell you feel it more than hear it: one deep " +
        "cough, and the Undertow dies in its sleep. The gauges bleed " +
        "back to zero. On the terraces above, the storm bell falters, " +
        "changes its mind, and starts ringing a rhythm the Steps " +
        "haven't heard in years — the all-clear.",
      location: "greywater:pump-deck",
      choices: [
        {
          id: "rest",
          label: "Climb toward the bells.",
          effects: [
            { type: "set-flag", key: "act1-outcome", value: "court" },
            { type: "set-flag", key: "ally-cistern-court", value: true },
            { type: "set-flag", key: "undertow-stopped", value: true },
            { type: "set-flag", key: "act1-complete", value: true },
            { type: "credits", amount: 150 },
            { type: "remove-item", itemId: "msc-cracked-spike" },
            { type: "end", endingId: "act1-court" },
          ],
          standing: { auric: -20, court: 25 },
        },
      ],
    },
    // ------------------------------------------------------------------
    // Climax B — with Director Voss
    // ------------------------------------------------------------------
    {
      id: "a1-voss-plan",
      speaker: "Director Voss",
      text:
        "Voss arrives at the Chainwell foot with six wardens and no " +
        "umbrella, as if the weather wouldn't dare. \"The Court has " +
        "barricaded my pump deck — sappers, cutting torches, welded " +
        "plate across the stairs. Sentiment with a hammer.\" A field " +
        "medic straps kit to your harness without asking. \"Clear the " +
        "deck. I'll handle the paperwork, and then we'll handle the " +
        "ledger. Together.\"",
      location: "greywater:terraces",
      choices: [
        {
          id: "confront",
          label: "\"One question first. Halex didn't write the Undertow. You did.\"",
          target: "a1-voss-confront",
          requirements: [
            { type: "flag-equals", key: "voss-lie-known", value: true },
          ],
        },
        {
          id: "proceed",
          label: "Take the kit. Do the job you're paid for.",
          target: "a1-voss-strike",
          effects: [
            { type: "add-item", itemId: "con-trauma-patch", quantity: 2 },
          ],
        },
      ],
    },
    {
      id: "a1-voss-confront",
      speaker: "Director Voss",
      text:
        "For exactly one second, the terrarium smile is a dead thing on " +
        "a wire. Then Voss laughs, softly, with something that might be " +
        "respect. \"An archivist in the walls. Of course.\" They " +
        "straighten a cuff. \"Yes. My draft. A director who authors a " +
        "disaster and then kills it is twice promoted, and Greywater " +
        "was never going to matter to anyone who signs budgets. It " +
        "matters to you? Fine. My offer improves — and the flush still " +
        "dies either way. Choose.\"",
      location: "greywater:terraces",
      choices: [
        {
          id: "proceed-anyway",
          label: "\"Your money, your monsters. Let's clear the deck.\"",
          target: "a1-voss-strike",
          effects: [
            { type: "set-flag", key: "voss-confronted", value: true },
            { type: "credits", amount: 100 },
            { type: "add-item", itemId: "con-trauma-patch", quantity: 2 },
          ],
        },
        {
          id: "walk-crown",
          label: "Walk away, up the Chainwell — the Crown will judge the draft.",
          target: "a1-lone-plan",
          requirements: [
            { type: "flag-equals", key: "knows-relay", value: true },
          ],
          effects: [
            { type: "set-flag", key: "betrayed-voss", value: true },
            { type: "travel", mapId: "cinder-plaza" },
          ],
          standing: { auric: -20 },
        },
      ],
    },
    {
      id: "a1-voss-strike",
      text:
        "The pump deck again — but held against you now. Sappers " +
        "crouch behind the manifold throats with cutters sparking, " +
        "shock-darts racked in easy reach, holding the only home " +
        "they've got left the only way that's ever worked: completely.",
      location: "greywater:pump-deck",
      choices: [
        {
          id: "recon",
          label: "Hit the seam you spotted in their sandbag line. (Your recon pays off.)",
          target: "a1-voss-seal",
          requirements: [
            { type: "flag-equals", key: "court-scouted", value: true },
          ],
          effects: [
            { type: "add-item", itemId: "con-surge-stim" },
            { type: "start-combat", encounterId: "enc-pumpworks-voss" },
          ],
        },
        {
          id: "fight",
          label: "Take the deck.",
          target: "a1-voss-seal",
          effects: [
            { type: "start-combat", encounterId: "enc-pumpworks-voss" },
          ],
        },
      ],
    },
    {
      id: "a1-voss-seal",
      text:
        "The deck goes quiet except for the manifold's idle and the " +
        "wardens zip-tying what's left of the barricade. Voss walks the " +
        "charge points the sappers never got to blow, nodding like an " +
        "auditor at a clean ledger. \"Last item of business,\" they " +
        "say, and hold out one gloved hand. \"Every copy.\"",
      location: "greywater:pump-deck",
      choices: [
        {
          id: "hand-spike",
          label: "Surrender the cracked spike — the only complete copy.",
          target: "a1-end-voss",
          requirements: [{ type: "item", itemId: "msc-cracked-spike" }],
          effects: [{ type: "remove-item", itemId: "msc-cracked-spike" }],
        },
        {
          id: "burn-sable",
          label: "Give up where Sable keeps the ghost-copy.",
          target: "a1-end-voss",
          effects: [{ type: "set-flag", key: "sable-burned", value: true }],
          standing: { market: -12 },
        },
      ],
    },
    {
      id: "a1-end-voss",
      speaker: "Director Voss",
      text:
        "\"A pleasure doing structured business.\" Voss produces a " +
        "writ, countersigned before you ever said yes, and a credit " +
        "transfer that lands with a weight you feel in your back " +
        "teeth. \"The flush is deferred, the Court is contained, and " +
        "you are, as of tonight, a line item Auric protects.\" The " +
        "salt-plant smile. \"Act two will be along shortly.\"",
      location: "greywater:pump-deck",
      choices: [
        {
          id: "sign",
          label: "Take the writ. Learn what it costs later.",
          effects: [
            { type: "set-flag", key: "act1-outcome", value: "voss" },
            { type: "set-flag", key: "ally-voss", value: true },
            { type: "set-flag", key: "undertow-delayed", value: true },
            { type: "set-flag", key: "act1-complete", value: true },
            { type: "credits", amount: 300 },
            { type: "add-item", itemId: "msc-auric-writ" },
            { type: "end", endingId: "act1-voss" },
          ],
          standing: { auric: 25, court: -20 },
        },
      ],
    },
    // ------------------------------------------------------------------
    // Climax C — the Relay Crown, owing nothing to anyone
    // ------------------------------------------------------------------
    {
      id: "a1-lone-plan",
      text:
        "Topside, Cinder Row is all sirens and rumor, Auric klaxons " +
        "rolling up from the Chainwell mouth. Above the tram loop the " +
        "old broadcast tower leans into the rain, and at its top — " +
        "past the dead floors and the roosting drones — the Relay " +
        "Crown waits, a circlet of antennae that once talked to the " +
        "whole Sprawl at once. It only needs something worth saying.",
      location: "cinder-row:relay-tower",
      choices: [
        {
          id: "own-copy",
          label: "The only copy rides in your jacket. Climb.",
          target: "a1-crown-climb",
          requirements: [{ type: "item", itemId: "msc-cracked-spike" }],
        },
        {
          id: "sable-copy",
          label: "First: pry the ghost-copy out of Sable's hands.",
          target: "a1-sable-ledger",
        },
      ],
    },
    {
      id: "a1-sable-ledger",
      speaker: "Sable",
      text:
        "Sable meets you in the Filament's doorway with the ghost-copy " +
        "already in hand and no intention of handing it over. \"The " +
        "Crown. You're going to burn every bridge in the Sprawl at " +
        "once and call it daylight.\" Their fingers drum the casing. " +
        "\"This is the only leverage I've ever held over Auric " +
        "Combine. Convince me.\"",
      location: "cinder-row:filament-bar",
      choices: [
        {
          id: "trust",
          label: "\"I've dealt straight with you from the first job. You know it.\"",
          target: "a1-crown-climb",
          requirements: [
            { type: "flag-equals", key: "sable-trust", value: true },
          ],
          effects: [{ type: "add-item", itemId: "msc-ledger-ghost" }],
        },
        {
          id: "talk",
          label: "\"Leverage you hold is leverage they'll come to collect. Loose it.\"",
          target: "a1-crown-climb",
          requirements: [{ type: "stat", stat: "cool", value: 7 }],
          ifUnavailable: "disabled",
          effects: [{ type: "add-item", itemId: "msc-ledger-ghost" }],
        },
        {
          id: "pay",
          label: "Buy it outright. (100 cr)",
          target: "a1-crown-climb",
          requirements: [{ type: "credits", value: 100 }],
          ifUnavailable: "disabled",
          effects: [
            { type: "credits", amount: -100 },
            { type: "add-item", itemId: "msc-ledger-ghost" },
          ],
        },
        {
          id: "promise",
          label: "Promise Sable the first read of whatever comes back on the wire.",
          target: "a1-crown-climb",
          effects: [
            { type: "set-flag", key: "sable-skeptical", value: true },
            { type: "add-item", itemId: "msc-ledger-ghost" },
          ],
        },
      ],
    },
    {
      id: "a1-crown-climb",
      text:
        "The tower's dead floors go past in rust and pigeon-bone, and " +
        "then the Crown opens above you, antennae fingering the storm. " +
        "You're not alone. An Auric interdiction team is already " +
        "rigging charges to the mast anchors — a gray-slickered agent " +
        "and a halo of stinging drones, turning as one toward the " +
        "sound of your boots. Whatever you came to say, they came to " +
        "make sure the Crown never says anything again.",
      location: "cinder-row:relay-tower",
      choices: [
        {
          id: "fight",
          label: "The Sprawl gets its broadcast. Clear the Crown.",
          target: "a1-broadcast",
          effects: [
            { type: "start-combat", encounterId: "enc-relay-crown" },
          ],
        },
      ],
    },
    {
      id: "a1-broadcast",
      text:
        "The Crown drinks the ledger like rain after drought. Relays " +
        "older than you shudder awake floor by floor, and the Sprawl " +
        "lights up beneath the tower — tram windows, noodle stalls, " +
        "the Glasshouse's own pristine lobby wall — every screen " +
        "reading out the Undertow schedule, flush dates burning like " +
        "signal flares. The storm carries it. Nothing will carry it " +
        "back.",
      location: "cinder-row:relay-tower",
      choices: [
        {
          id: "name-author",
          label: "Append the byline Hex archived: drafted by Imre Voss.",
          target: "a1-end-lone",
          requirements: [
            { type: "flag-equals", key: "voss-lie-known", value: true },
          ],
          effects: [{ type: "set-flag", key: "voss-exposed", value: true }],
          standing: { auric: -10, market: 6 },
        },
        {
          id: "raw",
          label: "Send it raw. The schedule speaks for itself.",
          target: "a1-end-lone",
        },
      ],
    },
    {
      id: "a1-end-lone",
      text:
        "Below, the city is rearranging itself around what it now " +
        "knows: crowds thickening at the Chainwell mouth, Auric " +
        "klaxons discovering they're outnumbered. No flush happens " +
        "tonight. No faction owns the reason. On the tower's dead " +
        "floors the wind moves through you like you're already a " +
        "rumor — the one the Sprawl will be telling for years.",
      location: "cinder-row:relay-tower",
      choices: [
        {
          id: "vanish",
          label: "Vanish into the crowd you just created.",
          effects: [
            { type: "set-flag", key: "act1-outcome", value: "broadcast" },
            { type: "set-flag", key: "wanted-by-auric", value: true },
            { type: "set-flag", key: "undertow-stopped", value: true },
            { type: "set-flag", key: "act1-complete", value: true },
            { type: "remove-item", itemId: "msc-cracked-spike" },
            { type: "remove-item", itemId: "msc-ledger-ghost" },
            { type: "end", endingId: "act1-broadcast" },
          ],
          standing: { auric: -25, court: 10, market: 12 },
        },
      ],
    },
  ],
};
