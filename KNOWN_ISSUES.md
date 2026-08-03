# Known issues — Neon Fable 1.0

Everything here is a thing 1.0 ships with, on purpose, with a reason.
None of it stops a run. Each entry says what was measured, why it was
left, and — where there is one — the lever a future change would pull,
so the next person does not have to rediscover the mechanism before
they can argue with the decision.

What is *not* here is anything that was fixable in the release sweep;
that got fixed. See [CHANGELOG.md](CHANGELOG.md) for what closed.

---

## Verification gaps

### No visual or screen-reader pass has ever been run

**What it is.** Every claim this repository makes is either machine-
checked or unverified — there is no third state. The Chrome extension
has not been connected in any environment this game was built in, so
nothing rendered has been *looked* at except through the offline
postcard renderer (`docs/AUTHORING.md`), and nothing has been *heard*
through a screen reader. The suite's 5,236 tests, the DOM sweeps, the
scripted playthroughs and the production-bundle smoke are all
structural: they prove a screen mounted, a control existed, a label
read as a sentence, a save came back. They cannot see a sprite drawn
one pixel low, or hear an announcement interrupt something worth
hearing.

**Why it ships.** The gap is honest and documented rather than papered
over, and everything a machine *can* check is checked. `npm run smoke`
now plays the built bundle end to end (fresh run and a v1-era save),
which closes the "was the release bundle ever run at all" half of it.

**The lever.** A person with a browser and half an hour: walk the three
trace profiles in `src/data/story/traceProfiles.ts`, then repeat with
VoiceOver on, per `docs/ACCESSIBILITY.md`. `?dev` gives the art gallery
and the perf scene.

### 60fps is a claim, not a measurement

**What it is.** The frame budget work (task 106) measured JS cost, draw
counts and allocation, all with the draw calls stubbed. The scripted
worst case is 0.27ms of JS against a 16.6ms budget and ~850 draws at
peak — but wall-clock frame rate on real hardware has never been read.

**Why it ships.** The instrument is built and the analysis says JS is
not the constraint. If the game is short somewhere, the data points at
fill rate (the glow pass, 1.5–2.0 Mpx of additive per frame) and draw
count, not at the loop.

**The lever.** `?dev` → **Perf Scene (dev)** on a mid-tier laptop, let
the camera lap its circuit, read `fps` and `p95` off the HUD. `bakes`
must read 0 in a warmed scene.

---

## Balance findings, measured and left

These came out of the combat sweep (~15k simulated battles, task 110)
and the credit ledger (task 111). All three sweeps still run in CI, so
any of these can be re-measured by changing a number and watching what
goes red.

### Injuries never fire below Blackout

**Measured.** Forty seeds of the Court road on Drift and on Grind,
chromed and with a companion: **zero** marks on anybody. The lowest a
fight left the player was 69% of frame on Drift and 49% on Grind,
against bloodied lines of 10% and 20%. Blackout marks 13 runs in 18.
So the whole injury system — wounds, the clinic scenes, the companion
clinic scenes — is dormant in ordinary play.

**Why it ships.** Making injuries bite on Grind means roughly doubling
the bloodied share, which is a difficulty-curve decision rather than a
bug fix, and Grind is the preset most people will play. It was
measured, not missed.

**The lever.** `BLOODIED_SHARE` (0.2, `src/combat/injury.ts`) or the
presets' `injuryThresholdPct` (`src/data/difficulty.ts`) — never the
encounters. The `street-chrome` trace pins the Drift half of this as a
measurement (`lowestFightShare`), so a retune moves a number in a test
rather than silently.

### Static is not a real cost at the top band

**Measured.** The screaming-chrome build *out-performs* the clear one:
100% vs 90% win rate, and four rounds faster. The heavy implants' stat
mods swamp the one lost turn and the initiative place.

**Why it ships.** Static reads correctly everywhere else — the meter,
the portrait tear, the barks, the dialogue gates — and the top band is
the one a player has to work hardest to reach. Making it a genuine
trade would change what the endgame build feels like.

**The lever.** The band effects in `src/data/static.ts`, not the
implants.

### A companion is worth more than any gear tier

**Measured.** Every `+vesper` cell wins 100%; the same build solo wins
87–100% and takes roughly twice as many rounds.

**Why it ships.** This is design, not drift. `BALANCE_TARGETS.standard
.maxWinRate` is deliberately open at 1 — the promise a standard fight
makes is about its floor, and a crew is supposed to change a fight.

### The `low` stat spread ends the game at 27 HP

**Measured.** `maxHp = 12 + body * 3` with body 5. Every remaining
marginal cell in the balance sweep belongs to that build.

**Why it ships.** Raising the constant is an engine change with a
save-migration tail, at the end of a release. The build still finishes
the game; it finishes it thin, which is what choosing it said.

### Money arrives after the last shop

**Measured.** Every road earns 40–70% of its Act 3 income in scenes
that come after the final chapter break — so a ledger's "surplus" is
partly an epilogue.

**Why it ships.** Measuring it properly needs a third shopping break
inside Act 3, and there is no in-fiction counter between the concourse
and the crown. Inventing one to satisfy a metric is the wrong order.

### The ghost road has almost no economy

**Measured.** 225 credits over a lifetime, three fights, no purchases
beyond patches. Cosmetics, mods and chrome are effectively unavailable
to a run played that way.

**Why it ships.** Coherent: that road needs none of it and resolves its
finale without drawing a weapon.

**The lever.** The breach faucet — `CREDITS_PER_DATA` (2) and
`CREDITS_PER_CHAIN` (5), both tiny — which is exactly the faucet a
talker/diver would be using. The economy harness has a `breach` ledger
category ready; the sweep does not play terminals because that needs a
routing policy for the lattice.

### A chrome-heavy build cannot buy its own chrome

**Measured.** Reaching the screaming band needs ~860 credits of
implants; the Court road holds ~350 at the chapter-1 break.

**Why it ships.** Whether a fully chromed build should be reachable by
playing is a pricing question (`src/data/economy.ts`), not a bug. The
`street-chrome` trace grants the kit and says so in a comment, so the
harness is honest about what it is simulating.

---

## Shape of the build

### One content chunk, 652 kB (198 kB gzipped)

**What it is.** Vite warns that a chunk is over 500 kB. It is
`data-*.js`: every story arc, every map, every catalog, loaded up
front.

**Why it ships.** The game is a single page with no backend and nothing
to fetch at runtime — that is the whole architecture. Splitting the
content would trade one honest 198 kB download for a set of loading
seams inside a story that currently has none. The three screens that
*are* dev-only (art gallery, perf scene, action icons) already split
out on their own.

### The README's screenshots are still a recipe

**What it is.** `README.md` describes four screenshots and links a
recipe for taking them (`docs/images/README.md`); the images are not in
the repository.

**Why it ships.** See the first entry — nothing has been looked at in a
browser, so there is nothing to screenshot from. The live build is the
honest preview until somebody takes them.
