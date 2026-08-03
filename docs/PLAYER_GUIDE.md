# Neon Fable — player guide

Everything the game asks you to understand, in the order you meet it.
There are no plot spoilers here: systems, numbers where a number is
actually useful, and where to look in-game when you want the specifics.

Anything the game itself is the better source for — what a particular
gun does, what a coat is worth tonight, what an ending was called — is
in the game: the character screen, the tooltips on a counter and an
action bar, and the codex on the main menu. This guide tells you how to
read those, not what they will say.

- [Getting started](#getting-started)
- [Making a runner](#making-a-runner)
- [On the street](#on-the-street)
- [Conversations](#conversations)
- [Fights](#fights)
- [Chrome, Static and injuries](#chrome-static-and-injuries)
- [Gear: mods, dye and counters](#gear-mods-dye-and-counters)
- [Breach](#breach)
- [Going quietly](#going-quietly)
- [Crew and standing](#crew-and-standing)
- [Getting better](#getting-better)
- [Endings, the codex and New Game+](#endings-the-codex-and-new-game)
- [Difficulty and assists](#difficulty-and-assists)
- [Comfort and accessibility](#comfort-and-accessibility)
- [Controls](#controls)
- [FAQ](#faq)

## Getting started

Open the game and press **New Game**. Everything runs in the page — no
account, no download, nothing to install — and your saves live in that
browser's storage, which also means they are per-browser and clearing
site data clears them.

There are three save slots plus an autosave. The autosave is written on
the way into every district and on the way into every fight, as well as
when you pick up a memory shard, cross a chapter boundary, or reach an
ending; you can also save by hand from the pause menu (`Esc`), which
puts a picture of the scene and your runner's face on the slot. If a
fight goes badly, the defeat panel offers the autosave straight back:
there is no permadeath in Neon Fable and losing never takes anything
away from you.

The game is playable end to end from the keyboard alone. The full key
map is [below](#controls), and the same table is on the **Controls**
screen from the main menu, from the pause menu, and from Settings.

## Making a runner

Creation is five steps — identity, background, stats, appearance,
review — and you can jump back to any step you have already reached
with `1`–`5`. Nothing is committed until you confirm on the review
sheet.

### Stats

You have five stats. Every one starts at **3**, and you have **15
points** to spend on top of that, one point per `+1`, up to **10** in
any single stat at creation. Background bonuses land on top and can
push a stat as far as 12.

They are not decoration, and they are not interchangeable:

- **Body** — how much of you there is. Maximum HP is `12 + 3 × Body`,
  it is the damage bonus on melee weapons, and it is half of your
  neural capacity (see below). The most literal stat in the game.
- **Reflexes** — speed, in three senses. It *is* your initiative, so it
  decides where you fall in the turn order; it is the damage bonus on
  ranged weapons; and it sets how far you can move in a combat turn
  (`2 + Reflexes / 4` tiles, rounded down). It also drives your odds of
  getting out of a fight you would rather not finish.
- **Tech** — the machine-facing stat, and the one the content asks for
  most often. Above **Tech 5** every point buys a point of buffer on a
  breach run, and at **Tech 8** you can read what a lattice node is
  carrying before you step on it.
- **Cool** — composure, and the second most gated stat. It is the other
  half of neural capacity (`(Body + Cool) / 2`, rounded down), so it
  decides how much chrome you can carry, and it is what a counter is
  talked down with — you need at least **Cool 4** to try.
- **Intelligence** — what you know, and the thinnest of the five. It
  has no derived figure behind it at all and it is the rarest gate in
  the writing: a handful of specific doors, opened by nothing else. Buy
  it because you want those scenes, not because you expect it to carry
  a build.

There is no respec. Points earned later (see [Getting
better](#getting-better)) only ever add.

### Backgrounds

Three origins, each with its own stat bonuses, its own starting gear,
and tags that later scenes read. The tags are the part worth choosing
on: a background is not a class, it is a set of doors that only you can
open, and it stays relevant into the last chapter. Read the blurbs on
the step — they say what each one was, and the game is consistent about
it afterwards.

### Appearance

The appearance step is cosmetic, and cosmetic here means *nothing
mechanical whatsoever*: no stat, no gate, no ending reads your face.
Take skin tone, build, hair, eyes, brows, mouth, face detail and
headwear from the category tabs, colour them from the swatch rows, and
watch the live preview — which you can turn with `Q`/`E`, switch
between standing and walking with `W`, and zoom with `+`/`−`.

There are presets per background if you would rather not fiddle, and a
randomiser. What you build here is what the map sprite, the arena body,
the portraits in dialogue, and the face on your save slots are all
composed from — it is one set of data, not four drawings. Equipped
clothes and installed chrome show up on top of it as you acquire them.

Build and skin tone are the only parts you cannot change later.

### Difficulty

The review sheet is also where you pick a difficulty preset. It is not
a permanent decision — see [Difficulty and
assists](#difficulty-and-assists).

## On the street

A district is an isometric map you walk. Click a tile to walk there,
drag to pan, or use the arrow keys (or WASD) to walk a tile at a time
and `]`/`[` to pick out things on the map nearest-first without
touching the mouse. `Enter` or `E` uses whatever is picked or in reach,
walking you over to it first if it is across the plaza.

- **Things you can use** carry a soft marker: people, terminals,
  workbenches, counters, chairs, chips on the floor.
- **Ways out** carry a lit ring and a label naming where they lead.
  Taking one plays the door and fades through to the destination.
- **The minimap** sits under the HUD bar: the whole district, no fog, a
  pip with a facing tick for you, and pips for the exits, the people,
  and wherever the story is pointing. `M` collapses it. It is read-only
  — clicking it does nothing.
- **The panels** are `I` for your character (gear, chrome, Static,
  wounds, standing), `C` for your crew, `P` for advancement, `Esc` for
  the pause menu.
- **Memory shards** are chips lying around the districts. Twelve of
  them, nothing mechanical attached — they are the city's own history,
  filed in the codex once read. Three are behind a requirement, and the
  chip tells you what it wants when it refuses.
- **Hints** are one-line chips that appear the first time a system is
  actually in front of you, once each per run, never more than one at a
  time. The `×` dismisses one instantly, and Settings → Guidance turns
  them off (or resets them, if you want the game to teach itself
  again). Nothing they say is said *only* by them.

The city also notices what you have done: which stalls are shuttered,
what the news strips are running, who is standing on which corner, and
what a vendor has on the shelf all move with the state of your run.

## Conversations

Click a choice, press its number, or walk the list with the arrows and
press `Enter`. Clicking the line being typed skips to the end of it
(and Settings has a text-speed control if you would rather it never
typed at all).

Choices gate on stats, items, installed chrome, your background, flags
from earlier scenes, credits, who is travelling with you, how they feel
about you, whether you are hurt, and where you stand with the factions.
A choice you cannot take is either hidden or shown greyed out with the
requirement in brackets — `[Tech 6]` — so the game tells you what it
wanted rather than pretending the option was never there.

Choices have real consequences: flags that later scenes read, credits,
items, fights, travel, and endings. Several of them are one-way. The
game does not warn you which.

## Fights

Combat is turn-based on an isometric arena grid.

**The order** comes from Reflexes — yours, theirs, and whatever is
modifying them. The initiative rail along the top is a portrait chip
per combatant in that order: whose turn it is, how much frame each has
left, whatever is currently being done to them, and any wound they are
carrying.

**On your turn** the action bar offers: Attack, an Ability, an Item,
Move, Flee, and End Turn. It is numbered in the order it is drawn, so
`1`–`9` and the buttons never disagree, and `Tab` cycles them. Moving
spends steps (`2 + Reflexes / 4` of them, rounded down); attacking
spends your action.

**The ground tells you things.** Before you commit, the arena tints:
where you are standing, the ground your remaining steps cover, what the
open action can reach, exactly what it would touch if you pulled the
trigger here, and the path under the cursor. Point at a tile you cannot
use and it tints as refused, with the reason given — the first thing
you would have to change, not a generic "invalid".

**Threatened ground is different.** A wind-up that somebody else has
already declared is marked whether or not you have anything open,
because it is a fact about the board rather than about your intentions.
A charged attack resolves on whoever is standing in the marked tiles
when it lands, and it never re-aims — walking off them beats it. Some
enemies are bigger than one tile; reach, occupancy and every telegraph
read the whole block they stand on.

**Damage** is your weapon plus the stat bonus for its class (Body for
melee, Reflexes for ranged) against the target's armour, and a landed
hit always does at least a point. The outcome chip on a target shows
the same figures the engine will use — nothing hidden, no fudging.

**Companions** fight beside you as an ally you play through the same
action bar. If one goes down, they are out for that fight only; the
fight is lost when *you* go down.

**Losing** costs you nothing but time: the defeat panel hands you the
autosave. Losing also never leaves a wound. **Winning while nearly
dead** can — see below.

Fights are deterministic: the same seed and the same actions produce
the same fight, every time. Reloading to re-roll a bad break will not
work, and is not supposed to.

## Chrome, Static and injuries

**Cyberware** installs into body slots — eyes, arms, neural and so on —
and costs neural load against your capacity (`(Body + Cool) / 2`,
rounded down). Installed chrome can unlock dialogue and grant combat
abilities. Pulling one back out **destroys it** — it does not return to
your inventory — and costs you HP in proportion to the load it frees,
though never enough to drop you below one. Plan the sockets rather than
the shopping.

**Static** is the second price, and the one nothing caps. Every implant
carries a Static load; the loads on everything you have installed sum
into a level, and the level reads as one of four bands, shown as a
meter on the character screen (`I`):

- **Clear** and **Humming** cost nothing.
- **Loud** costs **one point of Cool in conversation only** — a fight
  reads your real figure — and it *opens* doors that are shut to a
  clean face. Some people read chrome as a pledge.
- **Screaming** costs **two points of Cool in conversation**, drops you
  by a point of Reflexes in the initiative order, and builds a **static
  surge** in every fight: after three of your turns the chrome arms
  (the log and the HUD both say so), and you then have exactly one turn
  to answer it by taking a turn without spending your main action —
  moving is free, swinging is not. Ignore it and it discharges at the
  start of your next turn and stuns you for one turn. Either way it is
  spent once per fight.

There is no roll anywhere in Static. The same loadout always arms on
the same turn, which is the point: it is a clock to plan around, not a
risk to pray through. **Dampeners** are implants with a *negative*
load — they quiet you down, but they occupy a socket and cost capacity
like anything else, so quiet is always bought with something you wanted
to wear.

**Injuries** come out of fights you *won* while being taken apart:
going down in a fight your side still wins, or finishing on a sliver of
your frame. One at a time, and a worse one replaces a lesser one rather
than stacking. Each says exactly what it costs — a point of Reflexes, a
couple of points of Cool in conversation, or your cyberware's granted
abilities going offline — and each says when it stops. They heal on
their own after a couple of moves across the city, or a clinic will
close one tonight for a fee the wound itself sets. Your character
screen (`I`), your crew screen (`C`), and the wounded party's chip on
the initiative rail all say the same three things: what it is, what it
costs, when it ends.

## Gear: mods, dye and counters

**Weapons take mods.** A starter weapon has one socket; better hardware
has two. Every part is a *trade* — a scope that costs you something, a
core that buys damage with range — and it lives on the particular
weapon you fitted it to, so two of the same gun can be different guns.
Fitting is free; pulling a part back out costs a fee and returns it
intact. Both only happen at a workbench.

**Outfits take dye.** A tin of colour repaints your coat's cloth and
trim, and that is all it does — no dye moves a figure any fight or gate
reads. Re-dyeing replaces rather than layers, the tin is consumed, and
going back to factory colours is free. The stylist's colour counter is
where tins are bought and applied in the same gesture.

**Counters price things per run.** What a thing is worth is authored
once, and every price you are quoted is derived from it: the counter's
spread, the condition of the offer, a stall's risk premium, where you
stand with that counter's faction, and whether you won an argument.
The screen prints the working — the base and every line that moved it —
so a price is never a mystery. Nothing you can buy is ever cheaper than
what anyone will pay you for it, so there is no buy-low-sell-high loop
to grind.

**Haggling** is one attempt per counter per chapter, and needs at least
Cool 4 to try. It is rolled from the counter, the chapter and your
run's seed rather than the live random stream, so reloading cannot
re-roll it. Win and every price at that counter moves in your favour
for the rest of the chapter; lose and it locks. Shelves restock at
chapter boundaries, and a lost argument is forgotten with them.

## Breach

Four terminals across the city hold a corrupted node lattice, and a
Tech build can route it.

Walk up to one and you get a briefing first — what is in the core, what
your buffer is — before you commit to anything. Jack in and the lattice
comes up as a grid: arrows move around the head of your route, `Enter`
steps onto the focused node, `U` undoes the last step, `W` withdraws
with whatever you are holding.

- Every hop costs a move off your buffer.
- Three of the same signal fragment in a row refunds two moves.
- A **trace node** bills you extra for standing on it — and you will
  not see one coming unless your Tech is high enough or you are wearing
  the right optics.
- Undo refunds nothing, so a sprung trace is a real loss.
- Run the buffer dry short of the core and the channel locks you out
  for good.

Your buffer is the grid's own cheapest route, plus the slack the
terminal's difficulty allows, plus what you bring: a point per point of
Tech above 5, and more if your background lived in the Weave.

**Each terminal is attempted once.** That is deliberate, and it is
safe: every terminal's prize also has an ordinary way in — a locker
that opens to shoulders, a paper that lies on a floor for anybody who
can read it. A failed run costs you the prize, never a route through
the story.

## Going quietly

Some floors are being walked by somebody. Two of the game's fights have
a second way through them, and the fight is never removed — it is
simply not the only door.

- Where a guard is looking is tinted on the ground. Standing there when
  the watch turns starts the fight with them already moving: you lose
  three places in the initiative order, and nothing else.
- `X` crouches. Slower, but your footsteps stop carrying to the tiles
  beside a guard. **Sight always catches you; sound only catches
  somebody standing up.**
- `F` takes whichever quiet option is under your feet: a hand over the
  mouth of somebody who has not seen you, or a dash across a gap if you
  are quick enough. How many bodies you may lay down is the zone's own
  allowance, and where a zone allows for it, the right chrome buys a
  second one.
- A guard you take down is genuinely absent from the fight if it starts
  anyway.
- Reach the far side unseen and you skip the encounter. Walking up and
  starting it is still a perfectly good route.

Detection is asked on the beat, not continuously, which is what makes
timing a crossing a decision rather than a reflex test.

## Crew and standing

**Crew.** Companions you recruit walk with you, one at a time; the rest
wait. `C` opens the panel: swap who comes along between jobs, see where
each of them stands with you, and hear out anyone who has earned a word
in private. Loyalty moves on what you *do* in front of them — the game
tags acts (mercy, salvage, defiance, and so on) and each companion
scores those tags their own way. They do not want the same things. In
exploration the active companion trails your own footsteps a couple of
tiles back; in a fight they join as an ally you play yourself.

**Standing.** Three powers keep a ledger on you: the Auric Combine, the
Cistern Court, and the Vertical Market. Choices that settle something
move where you stand, on a five-band scale from Hostile through Cold,
Neutral and Warm to Trusted. The character screen (`I`) shows all
three; the game only interrupts you when a shift crosses a band, and
you are never shown a number, because the number is bookkeeping and the
band is the fact.

Standing is meant to be spent. Bands open doors — a freight stair, a
bonded lift, a writ bought out from under somebody — and being trusted
by one of the powers opens things nothing else will, including near the
end.

## Getting better

Two currencies, both derived from what you did rather than stored, so
neither can be double-counted or lost.

- **Advancement points** are what a chapter taught you: finishing one
  grants three. `P` opens the screen. A `+1` to a stat costs two
  points; abilities off the advancement pool cost one or two each.
  There is no respec, so spend deliberately.
- **Street cred** is what the city noticed: two per fight you walked
  away from, plus authored amounts for the deeds that mattered. At
  5, 12, 20 and 30 cred the street stops merely knowing you and starts
  expecting something, and you pick a **perk** — a small permanent
  habit, drawn from a pool covering fights, conversations, and
  quartermastering. Picks are permanent and the pool shrinks by one
  each time.

Both are retroactive: a save made before a deed was worth anything
picks it up the moment it loads.

## Endings, the codex and New Game+

The last chapter reads your whole run: what you settled in each of the
first two, who you kept, who you sold, what the city thinks of you, and
what is on your record. There are **seven endings**. Four are gated on
your cumulative history — one of them resolves the whole thing without
a fight, behind steep requirements — and three more open only at
**Trusted** standing with one of the three powers, whatever else the
run did.

Afterwards, an epilogue tells you what became of each faction, ally and
thread you touched. Threads you never touched simply do not appear. A
finished save reopens to its epilogue.

The **codex**, from the main menu, is the cross-run record: every
ending you have reached (locked ones show a spoiler-safe hint rather
than a blank), how many epilogue variants you have seen per thread, and
which of the twelve memory shards you have turned up — with the
district named, so the set reads as a treasure map rather than a list
of holes.

Finishing a run unlocks **New Game+**, which is deliberately modest:
three extra point-buy points, your finished runner's look seeded into
the wizard (every field still editable), and **one** item chosen from
what that character had equipped or installed, granted into your new
inventory. Perks do not carry: they were what the street decided about
a particular runner, and a reputation is not inheritable. Neither do
credits, cred, standing, or story flags — a new run is a new run.

## Difficulty and assists

Both live on the Settings panel, from the main menu or from the pause
menu, and both can be changed at any time — a run records that its
preset moved, and nothing anywhere punishes you for it.

**Difficulty** is three presets, each a bundle of percentages over
figures the game already computed: what a hostile blow costs you, how
much frame an enemy brings, what a payday is worth, and how bloodied
you have to finish before a fight marks you.

- **Drift** — fights land lighter and leave less behind, and the work
  pays less. Easier is not strictly better here: the street pays for
  risk.
- **Grind** — the game exactly as written. This is also what every save
  from before difficulty existed loads as.
- **Blackout** — everything hits harder, stands longer, and marks you
  for it. The money is better.

No preset touches a roll. The same seed lands and misses on exactly the
same turns on all three; the blows simply weigh different amounts.
Going down still always leaves a mark, on every preset.

**Assists** are four independent switches, unrelated to the preset —
you can play Blackout with all of them on:

- **Keep previews up** — the outcome chip stays on the likeliest target
  while an action is open instead of waiting for you to point.
- **Damage floor** — a blow of yours that lands never deals less than
  two points, however much plating it met. Misses still miss.
- **Bold telegraphs** — paints the marked ground considerably stronger.
  *Which* tiles are marked does not change.
- **Breach rescue** — after three terminals have locked you out, a
  lattice will offer to route itself. You take what the core holds and
  none of the data on the way.

## Comfort and accessibility

Settings holds one **Graphics & Comfort** section with every switch
about how the game looks and how much of it moves: a motion master
switch (which follows your device by default and can be overridden
either way), a colourblind-assist palette that repaints every marked
tile and highlight, a larger interface text size, and individual
toggles for the neon glow, weather, the city's set pieces, street
chatter, camera zoom, the combat camera, screen shake, and the minimap.
Nothing in that section changes what happens or how hard anything hits,
everything applies as you pick it, and one control puts the whole
section back — leaving difficulty, assists, the mixer and text speed
where you put them.

Every activity is playable from the keyboard alone, every control has a
visible focus ring, nothing is carried by colour alone, and both canvas
screens narrate their events to a screen reader. The engineering
version of those promises, and the tests that hold them, is in
[ACCESSIBILITY.md](ACCESSIBILITY.md).

## Controls

The table below is generated from the same data the in-game **Controls**
screen and the Settings panel render, so it cannot drift from what the
game actually answers. You will find the same list under Controls on
the main menu, in the pause menu, and in Settings.

<!-- BEGIN GENERATED CONTROLS -->

### Menus and panels

Anywhere a panel is open: the main menu, settings, inventory, the codex, a counter, the chair.

| Keys | What it does |
| --- | --- |
| `Arrows / Tab` | Move focus through menus, choices, and items |
| `Enter / Space` | Confirm the focused control |
| `Esc` | Back out of a panel, the way its own Close does |
| `Arrows / Home / End` | Move inside a grid of thumbnails, swatches, or tabs |

### On the street

While a district is on screen and no panel is open over it.

| Keys | What it does |
| --- | --- |
| `Arrows / WASD` | Walk one tile in that direction |
| `] / [` | Pick the next or previous thing on the map, nearest first |
| `Enter / E` | Use what is picked or in reach — walking there first if it is across the map |
| `Esc` | Drop the pick; with nothing picked, pause the game |
| `I` | Open or close the character screen |
| `C` | Open or close the crew |
| `P` | Open or close advancement |
| `M` | Expand or collapse the minimap |
| `X` | Crouch-walk, where somebody is watching |
| `F` | Take down a guard · lunge past a gap |
| `+ / − / wheel` | Zoom the camera |
| `Click / drag` | Move and interact · pan the camera |

### In a conversation

| Keys | What it does |
| --- | --- |
| `1–9` | Take a choice by its number in the list |
| `Arrows / Enter` | Walk the choices and take the focused one |
| `Click the line` | Skip the typewriter to the end of the line |

### In a fight

The action bar is numbered in the order it is drawn, so the key and the button never disagree.

| Keys | What it does |
| --- | --- |
| `1–9` | Take an action off the bar |
| `Arrows` | Step across the grid while moving |
| `Tab` | Cycle the action buttons |
| `Esc` | Cancel targeting and go back to the bar |

### In a breach

A run cannot be closed away from — it is finished, withdrawn from, or lost.

| Keys | What it does |
| --- | --- |
| `Arrows` | Move between the nodes around the head of the route |
| `Enter / Space` | Step onto the focused node |
| `U` | Undo the last step |
| `W` | Withdraw with what you are holding |

### Making a runner

The wizard's own keys, on top of the panel keys above.

| Keys | What it does |
| --- | --- |
| `1–5` | Jump to a step you have already reached |
| `Q / E` | Turn the live preview |
| `W` | Switch the preview between standing and walking |
| `+ / −` | Zoom the live preview |

<!-- END GENERATED CONTROLS -->

## FAQ

**Can I change how I look after creation?**
Yes, everything except build and skin tone. There is a stylist's parlour
in the city — you will walk past it early — and a session is a flat fee
however many things you change. The same counter sells dye for your
coat.

**Can I respec my stats?**
No. Advancement only adds: two points buys a `+1`, and abilities are
bought outright. Perk picks are permanent too. If you want a different
build, that is what a second run is for.

**I missed something in a district. Can I go back?**
Usually. Side chains carry their own state and wait where you left
them, and walking away from one is a pause rather than a failure. Some
individual scenes close behind you, and a chapter ending closes what
belongs to that chapter.

**Is there a quest log?**
No — deliberately. The scene that opens a chain routes you back to
wherever you left off when you return to it, and the map pips point at
whatever the story is pointing at. If you have forgotten what you were
doing, go back to the person who asked.

**Do I have to fight?**
Not always, and not everything. Several fights have a conversation
around them, two have a quiet way past, and one whole ending is
non-combat — though it asks a great deal of a build. Fleeing is also a
real action, with odds from your Reflexes against theirs.

**Am I supposed to be able to afford everything?**
No. Prices are derived per run and per counter, nothing sells for more
than it buys, and a chapter's shelf is finite. Chrome in particular is
a trade against sockets, capacity and [Static](#chrome-static-and-injuries)
rather than a shopping list to complete.

**What carries into New Game+?**
Three extra creation points, your last runner's look as a starting
point, and one item they had equipped or installed. Not perks, not
credits, not standing, not story. The codex — endings, epilogue
variants, memory shards — is cross-run and keeps everything you have
ever seen.

**Are my saves safe?**
They are in your browser's storage for the site, so they survive
reloads and closing the tab, but not clearing site data, and they do
not follow you to another browser or another machine. Saves from older
builds are migrated forward on load rather than rejected.

**Something looks wrong / a screen crashed.**
The game catches a crash and shows a notice with the run stashed
rather than a blank page — from there you can get back to the last
autosave. If a piece of content is missing, the game degrades (drops
the fight, falls back to the hub) instead of stopping.
