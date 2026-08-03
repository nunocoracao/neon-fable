/**
 * One home for every player-facing word that is *chrome*.
 *
 * ## The boundary
 *
 * **Chrome lives here.** Chrome is the frame around the game: button
 * captions, screen headings, field labels, settings descriptions, hint
 * text, confirmation prompts, error copy, empty-state lines, save-slot
 * furniture, combat action names. It is written by the interface, not by
 * the story, and it would be the first thing a translator asks for.
 *
 * **Content stays in `src/data/`.** Story nodes, dialogue, barks, lore
 * shards, epilogues, item names and descriptions, ability and enemy
 * names, faction and companion names — all of it stays in the typed
 * content files it already lives in. Those are authored fiction with
 * their own schemas, tests, and narrative gating; dragging them through
 * a flat key table would buy nothing and cost a lot.
 *
 * The test of which side a string falls on: *would rewriting it change
 * the story?* "Load Game" would not. A courier's threat would. When a
 * line is chrome wrapped around content — "Equipped: {item}" — the
 * wrapper is chrome and belongs here; `{item}` arrives from the data
 * file.
 *
 * **Diagnostics stay put too.** `console.error` text, `throw` messages,
 * and the crash report `errorReport.ts` assembles are written for
 * whoever is debugging, not for whoever is playing. The report is on
 * screen, but its audience is an issue tracker: a translated field name
 * makes a bug harder to triage and easier to misread, so it stays in
 * English beside the code that produces it. The crash *screen* around
 * it — the heading, the ledes, the buttons — is chrome and is here.
 *
 * ## Using it
 *
 * ```ts
 * button.textContent = t("menu.newGame");
 * label.textContent = t("combat.damageDealt", { n: 12 });
 * ```
 *
 * `t()` is typed against the table: an unknown key is a compile error,
 * and a string with `{placeholders}` demands exactly those parameters.
 * Keys are hierarchical and dot-separated, grouped by the screen or
 * overlay that renders them (`save.slot.empty`, `combat.end.victory`).
 * The dotted shape is shared with the audio event ids in
 * `src/data/sfx.ts`, so a new group checks there for a name clash — two
 * meanings behind one string is a bug waiting on a careless grep.
 *
 * One rule about writing entries: **every value is a single string
 * literal**. Splitting a long line with `+` widens its inferred type
 * from the literal to `string`, and a `string` has no placeholders TS
 * can see — the parameters would silently stop being checked. Long
 * lines are the price; `strings.test.ts` enforces it.
 *
 * A lint-style sweep (`stringLint.ts`, run by `stringLint.test.ts`)
 * walks `src/ui` looking for words written into DOM sinks, so a new
 * hard-coded caption fails the suite rather than quietly shipping.
 */

/* ------------------------------------------------------------------ *
 * The table
 * ------------------------------------------------------------------ */

export const STRINGS = {
  /* -------------------------------------------------------------- *
   * Common — words shared by more screens than any one of them owns
   * -------------------------------------------------------------- */
  "common.back": "Back",
  "common.closeEsc": "Close [Esc]",
  "common.doneEsc": "Done [Esc]",
  /** What a counter charges in, on every screen that has one. */
  "counter.credits": "{credits} cr",

  /* -------------------------------------------------------------- *
   * Main menu
   * -------------------------------------------------------------- */
  "menu.title": "Neon Fable",
  "menu.subtitle": "A cyberpunk story",
  "menu.newGame": "New Game",
  "menu.newGamePlus": "New Game+",
  "menu.continue": "Continue",
  "menu.recoverRun": "Recover Run",
  "menu.loadGame": "Load Game",
  "menu.codex": "Codex",
  "menu.settings": "Settings",
  "menu.error.loadRecent": "Could not load the most recent save.",
  "menu.error.recover": "The stashed run could not be recovered.",
  "menu.dev.explore": "Explore (dev)",
  "menu.dev.gallery": "Art Gallery (dev)",
  "menu.dev.perf": "Perf Scene (dev)",

  /* -------------------------------------------------------------- *
   * Explore, art gallery and perf scene — the dev-only routes
   * -------------------------------------------------------------- */
  "explore.help": "Click a tile to move. Drag to pan.",
  "explore.hour": "Hour: {phase}",
  "gallery.title": "Art Gallery",
  "gallery.filter.placeholder": "Filter by id…",
  "gallery.filter.label": "Filter art by id",
  "gallery.section": "{title} ({count})",
  "gallery.density": "d{density}",
  "perf.scroll.on": "Scroll: on",
  "perf.scroll.off": "Scroll: off",

  /* -------------------------------------------------------------- *
   * Crash screen
   * -------------------------------------------------------------- */
  "crash.title": "Something glitched",
  "crash.lede.stashed":
    "The game hit an error it could not carry on from. The run you were in has been stashed — pick it up from the main menu.",
  "crash.lede.clean":
    "The game hit an error it could not carry on from. Your last save is untouched; head back to the main menu to pick the thread up.",
  "crash.report.label": "Diagnostic report",
  "crash.includeSave": "Include save data (adds the whole run to the report)",
  "crash.copy": "Copy report",
  "crash.mainMenu": "Main Menu",
  "crash.reload": "Reload",
  "crash.status.copied": "Report copied.",
  "crash.status.copyFailed":
    "Could not reach the clipboard — select the text and copy it.",
  "crash.status.saveIncluded": "The whole save is in the report now.",
  "crash.status.saveOmitted": "The report is back to a summary of the run.",

  /* -------------------------------------------------------------- *
   * Interludes, hints and the epilogue
   * -------------------------------------------------------------- */
  "interlude.continueHint": "Click or press Enter to continue.",
  "hint.dismiss": "Dismiss hint: {title}",
  "epilogue.kicker": "Epilogue — The Meridian Sprawl",
  "epilogue.closer": "{name}'s story is told. The Sprawl keeps every receipt.",
  "epilogue.ngPlus":
    "New Game+ is open from the main menu — a fresh run with a small legacy carry-over.",
  "epilogue.returnToMenu": "Return to Main Menu",

  /* -------------------------------------------------------------- *
   * The game screen: HUD, system menu, chapter-end panel
   * -------------------------------------------------------------- */
  "game.paused": "Paused",
  "game.chapterComplete": "Chapter complete",
  "game.chapter.keepExploring": "Keep Exploring",
  "game.chapter.mainMenu": "Main Menu",
  "game.chapter.spendPoints": "Spend Advancement Points",
  "game.chapter.choosePerk": "Choose a Perk",
  "game.menu.resume": "Resume",
  "game.menu.saveLoad": "Save / Load",
  "game.menu.codex": "Codex",
  "game.menu.settings": "Settings",
  "game.menu.quit": "Quit to Main Menu",
  "game.hud.inventory": "Inventory [I]",
  "game.hud.crew": "Crew [C]",
  "game.hud.advance": "Advance [P]",
  "game.hud.saves": "Saves",
  "game.hud.menu": "Menu [Esc]",

  /* -------------------------------------------------------------- *
   * Photo mode — the district, held still and framed
   * -------------------------------------------------------------- */
  "photo.title": "Photo Mode",
  "photo.hints":
    "Arrows or WASD pan · + and − zoom · [ and ] change the hour · R rain · H people · 2 double resolution · Enter takes the shot · Esc leaves",
  "photo.zoom": "{zoom}×",
  "photo.zoomOut": "Zoom out [−]",
  "photo.zoomIn": "Zoom in [+]",
  "photo.hour": "Hour: {phase}",
  "photo.phase.dusk": "Dusk",
  "photo.phase.night": "Night",
  "photo.phase.late": "Small hours",
  "photo.weather.on": "Rain: on [R]",
  "photo.weather.off": "Rain: off [R]",
  "photo.people.shown": "People: in frame [H]",
  "photo.people.hidden": "People: out of frame [H]",
  "photo.supersample.off": "Resolution: screen [2]",
  "photo.supersample.on": "Resolution: double [2]",
  "photo.capture": "Take the shot [Enter]",
  "photo.exit": "Leave [Esc]",
  "photo.saved": "Saved {file}",
  "photo.saveFailed": "This browser would not save the shot.",

  /* -------------------------------------------------------------- *
   * Combat: how a fight ends
   * -------------------------------------------------------------- */
  "combat.end.victory": "Victory",
  "combat.end.continue": "Continue",
  "combat.end.fled": "Clean Break",
  "combat.end.fledNote":
    "You break contact and melt back into Cinder Row. Word of it will travel.",
  "combat.end.return": "Return",
  "combat.end.defeat": "Flatlined",
  "combat.end.defeatNote":
    "The Sprawl goes dark. Load a save to pick the thread back up.",
  "combat.end.loadAutosave": "Load Autosave",
  "combat.end.autosaveError": "Could not load the autosave.",
  "combat.end.loadGame": "Load Game",
  "combat.end.mainMenu": "Main Menu",

  /* -------------------------------------------------------------- *
   * Appearance picker and its live preview
   * -------------------------------------------------------------- */
  "appearance.categories": "Appearance category",
  "appearance.preview.keys": "Q/E rotate · W walk · +/− zoom",

  /* -------------------------------------------------------------- *
   * Breach minigame
   * -------------------------------------------------------------- */
  "breach.lattice": "Signal lattice",
  "breach.help": "Arrows to move, Enter to route. [U] back up, [W] pull out.",

  /* -------------------------------------------------------------- *
   * Advancement overlay
   * -------------------------------------------------------------- */
  "advance.title": "Advancement",
  "advance.unspent": "Unspent: {points}",
  "advance.chapter.granted": "{label} · +{points}",
  "advance.chapter.pending": "{label} · not yet complete",
  "advance.nextMilestone": "{label} at {cred} cred",
  "advance.allMilestones": "Every milestone reached",
  "advance.perks": "Perks",
  "advance.viewPerks": "View Perks",
  "advance.choosePerk": "Choose a Perk — {picks}",
  "advance.noPerks": "None yet. Street cred milestones are what grant them.",
  "advance.raiseStat": "Raise a stat ({cost} each)",
  "advance.raise": "Raise",
  "advance.atCap": "At cap",
  "advance.unlockAbility": "Unlock an ability",
  "advance.abilityCost": "Ability · {cost}",
  "advance.unlock": "Unlock",
  "advance.unlocked": "Unlocked",

  /* -------------------------------------------------------------- *
   * Perks — the pick screen and the cred readouts it shares
   * -------------------------------------------------------------- */
  "perk.title": "Perks",
  "perk.taken": "Yours",
  "perk.take": "Take",
  "perk.confirm": "Confirm — this is permanent",
  "perk.confirmPrompt": "{name} is a permanent choice. Confirm to take it.",
  "perk.next": "Next: {label} at {cred}",
  "perk.noCredYet": "Nothing the city has noticed yet.",
  "perk.cred.plain": "Street cred {cred}",
  "perk.cred.milestone": "Street cred {cred} · {milestone}",
  "perk.picks.none": "No pick waiting",
  "perk.picks.one": "1 perk pick waiting",
  "perk.picks.many": "{picks} perk picks waiting",
  "perk.headline.exhausted": "You are everything the street has to teach.",
  "perk.headline.next": "{remaining} more cred and the Sprawl wants a word.",
  "perk.headline.known": "The city knows exactly who you are.",

  /* -------------------------------------------------------------- *
   * Crew overlay
   * -------------------------------------------------------------- */
  "party.title": "Crew",
  "party.hp": "HP {hp}/{max}",
  "party.waiting": "{name} has something to say.",
  "party.withYou": "With you",
  "party.standDown": "Stand down",
  "party.takeAlong": "Take along",
  "party.empty": "Nobody has thrown in with you yet.",
  "party.note": "One of them walks with you at a time. Swap between jobs.",

  /* -------------------------------------------------------------- *
   * Codex — the between-runs record. The entries themselves are
   * content; the tallies wrapped around them are not.
   * -------------------------------------------------------------- */
  "codex.title": "Codex",
  "codex.endings": "Endings",
  "codex.endings.stats":
    "Endings found {found}/{total} · Playthroughs completed: {completions}",
  "codex.threads": "Epilogue Threads",
  "codex.threads.stats":
    "Threads found {found}/{threads} · Outcomes recorded {outcomes}/{total}",
  "codex.threads.outcomes": "Outcomes seen: {found}/{total}",
  "codex.shards": "Memory Shards",
  "codex.shards.statsInRun":
    "Shards this run {collected}/{total} · Ever found {discovered}/{total}",
  "codex.shards.statsEver": "Shards ever found {discovered}/{total}",
  "codex.shards.locked": "Shard {number}",

  /* -------------------------------------------------------------- *
   * Inventory overlay
   * -------------------------------------------------------------- */
  "inventory.title": "Inventory",
  "inventory.hp": "HP {hp}/{max}",
  "inventory.credits": "{credits} cr",
  "inventory.neuralLoad": "Neural load {load}/{capacity}",
  "inventory.equipped": "Equipped",
  "inventory.slot.weapon": "Weapon",
  "inventory.slot.outfit": "Outfit",
  "inventory.slot.empty": "Empty",
  "inventory.fitted": "Fitted: {mods}",
  "inventory.dyed": "Dyed: {channels}",
  "inventory.pulling": "Pulling it: {projection}",
  "inventory.equip": "Equip",
  "inventory.unequip": "Unequip",
  "inventory.install": "Install",
  "inventory.uninstall": "Uninstall",
  "inventory.confirmExtraction": "Confirm extraction",
  "inventory.extractionWarning": "Extraction destroys the implant.",
  "inventory.use": "Use",
  "inventory.combatOnly": "Only in a fight.",
  "inventory.standing": "Standing",
  "inventory.carried": "Carried",
  "inventory.nothingCarried": "Nothing carried.",

  /* -------------------------------------------------------------- *
   * Save / load panel
   * -------------------------------------------------------------- */
  "save.title.game": "Save / Load",
  "save.title.load": "Load Game",
  "save.slot.empty": "Empty",
  "save.cancel": "Cancel",
  "save.previously": "Previously",
  "save.replay": "Replay",
  "save.action.save": "Save",
  "save.action.saved": "Saved to {slot}.",
  "save.action.load": "Load",
  "save.action.name": "Name",
  "save.action.rename": "Rename",
  "save.action.delete": "Delete",
  "save.action.restoreBackup": "Restore backup",
  "save.action.restored": "{slot} restored from the save before it.",
  "save.rename.label": "Name this save",
  "save.rename.placeholder": "Before the Undercroft",
  "save.rename.commit": "Save name",
  "save.rename.done": "{slot} is now \"{name}\".",
  "save.rename.cleared": "{slot} label cleared.",
  "save.delete.confirm": "Confirm delete",
  "save.delete.done": "{slot} deleted.",
  "save.delete.prompt": "Delete {slot}? This cannot be undone.",
  "save.delete.needsName": "Deleting {slot} needs the runner's name typed back.",
  "save.delete.typePrompt": "Type \"{word}\" to delete this run",

  /* -------------------------------------------------------------- *
   * Vendor counter
   * -------------------------------------------------------------- */
  "vendor.sellSummary": "{summary} · {condition}",
  "vendor.empty.buy": "The shelf is bare tonight.",
  "vendor.empty.sell": "You are carrying nothing this counter would take.",

  /* -------------------------------------------------------------- *
   * Rig-up bench
   * -------------------------------------------------------------- */
  "bench.title": "Rig-Up Bench",
  "bench.rack": "On the rack",
  "bench.rack.label": "Weapon to work on",
  "bench.rack.empty": "You are carrying nothing to work on.",
  "bench.sockets": "Sockets",
  "bench.sockets.of": "{name} — sockets",
  "bench.noSockets": "Nothing on this one takes a part.",
  "bench.socket": "{label} — {fitted}",
  "bench.socket.empty": "empty",
  "bench.fit": "Fit",
  "bench.fitPart": "Fit a part",
  "bench.parts": "Parts in the bag",
  "bench.parts.hint": "Pick a socket to see what fits it.",
  "bench.parts.empty": "You carry nothing that fits that socket.",

  /* -------------------------------------------------------------- *
   * The Chrome Chapel — the stylist's chair
   * -------------------------------------------------------------- */
  "stylist.title": "The Chrome Chapel",
  "stylist.fee": "Restyle fee: {price} cr",
  "stylist.dyes": "Colour work",
  "stylist.dyes.noCoat": "\"Bring me a coat and I'll bring you a colour, love.\"",
  "stylist.coat": "{place}: {name}",
  "stylist.tin": "{name} — {colors} · {action}",
  "stylist.strip": "Strip to factory colours (free)",
  "stylist.cancel": "Cancel",
  "stylist.confirm": "Confirm ({price} cr)",
  "stylist.status.unchanged":
    "Pick a new look — the chair charges only for what changes.",
  "stylist.status.price": "{price} cr on confirm — you carry {credits} cr.",

  /* -------------------------------------------------------------- *
   * Settings — the chrome. The blurb under each row comes from the
   * setting's own definition in src/data, not from here.
   * -------------------------------------------------------------- */
  "settings.title": "Settings",
  "settings.on": "On",
  "settings.off": "Off",
  "settings.startOver": "Start over",
  "settings.text": "Text",
  "settings.text.speed": "Text speed",

  "settings.audio": "Audio",
  "settings.audio.volume": "{bus} volume",
  "settings.audio.test": "Test",
  "settings.audio.testLabel": "Play a test tone on {bus}",
  "settings.audio.mute": "Mute",
  "settings.audio.unmute": "Unmute",
  "settings.audio.muteLabel": "Mute {bus}",
  "settings.audio.unmuteLabel": "Unmute {bus}",
  "settings.audio.duck": "When you look away",
  "settings.audio.duck.quiet": "Quiet down",
  "settings.audio.duck.keep": "Keep playing",
  "settings.audio.duck.note":
    "Clicking away turns the game down; switching to another tab stops it altogether, and it picks up where it was when you come back. Keep playing if you run it on a second screen.",

  "settings.graphics": "Graphics & Comfort",
  "settings.graphics.note":
    "How the game looks and how much of it moves. None of these change what happens, what you are told, or how hard anything hits.",
  "settings.graphics.reset": "Reset graphics & comfort",
  "settings.graphics.reset.note":
    "Puts every switch in this section back to how the game shipped. Nothing else on this panel is touched.",

  "settings.difficulty": "Difficulty",
  "settings.difficulty.thisRun": "This run",
  "settings.difficulty.newRuns": "New runs start on",
  "settings.difficulty.confirm":
    "Switch this run to {preset}? It takes effect at once, and the save will record that the difficulty was changed.",
  "settings.difficulty.switch": "Switch to {preset}",
  "settings.difficulty.keep": "Keep playing",
  "settings.difficulty.changed":
    "This run has had its difficulty changed. Nothing is locked out by that — the save simply says so.",

  "settings.assists": "Assists",
  "settings.assists.noteInRun":
    "Independent of difficulty, and of each other. Every one of them takes effect immediately and none of them changes a die roll.",
  "settings.assists.noteOutOfRun":
    "Independent of difficulty, and of each other. These are what a new run will start with.",

  "settings.guidance": "Guidance",
  "settings.guidance.hints": "Contextual hints",
  "settings.guidance.note":
    "One line the first time a system comes up — walking, the action bar, a wound, a counter. Each appears once and is dismissed on the spot. Off silences every one of them and forgets none, so switching back on carries on where you left off.",
  "settings.guidance.reset": "Reset hints",
  "settings.guidance.reset.noRun":
    "This run's hints are recorded in its save, so they can only be replayed from inside a game.",
  "settings.guidance.reset.note":
    "{seen} shown so far. Resetting makes this run teach itself again from the next street you stand on.",

  "settings.controls": "Controls",
  "settings.controls.note":
    "Every key the game answers, grouped by where you are standing when it works. Nothing here needs a mouse: the street is walked with the arrows, and everything on it is reached with the pick.",
  "settings.controls.open": "Full controls reference",
  "controls.title": "Controls",
  "controls.lede":
    "Neon Fable is playable end to end from the keyboard alone — creation, the street, a conversation, a fight, a lattice, and every panel in between.",

  "controls.group.panels": "Menus and panels",
  "controls.group.panels.blurb":
    "Anywhere a panel is open: the main menu, settings, inventory, the codex, a counter, the chair.",
  "controls.focus.keys": "Arrows / Tab",
  "controls.focus.what": "Move focus through menus, choices, and items",
  "controls.confirm.keys": "Enter / Space",
  "controls.confirm.what": "Confirm the focused control",
  "controls.back.keys": "Esc",
  "controls.back.what": "Back out of a panel, the way its own Close does",
  "controls.grid.keys": "Arrows / Home / End",
  "controls.grid.what": "Move inside a grid of thumbnails, swatches, or tabs",

  "controls.group.explore": "On the street",
  "controls.group.explore.blurb":
    "While a district is on screen and no panel is open over it.",
  "controls.walk.keys": "Arrows / WASD",
  "controls.walk.what": "Walk one tile in that direction",
  "controls.pick.keys": "] / [",
  "controls.pick.what": "Pick the next or previous thing on the map, nearest first",
  "controls.use.keys": "Enter / E",
  "controls.use.what": "Use what is picked or in reach — walking there first if it is across the map",
  "controls.dropPick.keys": "Esc",
  "controls.dropPick.what": "Drop the pick; with nothing picked, pause the game",
  "controls.inventory.keys": "I",
  "controls.inventory.what": "Open or close the character screen",
  "controls.crew.keys": "C",
  "controls.crew.what": "Open or close the crew",
  "controls.advance.keys": "P",
  "controls.advance.what": "Open or close advancement",
  "controls.minimap.keys": "M",
  "controls.minimap.what": "Expand or collapse the minimap",
  "controls.crouch.keys": "X",
  "controls.crouch.what": "Crouch-walk, where somebody is watching",
  "controls.takedown.keys": "F",
  "controls.takedown.what": "Take down a guard · lunge past a gap",
  "controls.zoom.keys": "+ / − / wheel",
  "controls.zoom.what": "Zoom the camera",
  "controls.photo.keys": "V",
  "controls.photo.what": "Enter photo mode — the street held still, ready to frame",
  "controls.pointer.keys": "Click / drag",
  "controls.pointer.what": "Move and interact · pan the camera",

  "controls.group.photo": "In photo mode",
  "controls.group.photo.blurb":
    "The district is held still and the HUD is off screen. Nothing here touches the run: the hour, the rain, and the zoom are the shot's alone, and leaving puts the street back exactly as it was.",
  "controls.photoPan.keys": "Arrows / WASD / drag",
  "controls.photoPan.what": "Move the camera anywhere inside the district",
  "controls.photoZoom.keys": "+ / − / wheel",
  "controls.photoZoom.what": "Zoom, including one level deeper than the game plays at",
  "controls.photoHour.keys": "] / [",
  "controls.photoHour.what": "Stage the shot at another hour",
  "controls.photoRain.keys": "R",
  "controls.photoRain.what": "Rain in the shot, or none",
  "controls.photoPeople.keys": "H",
  "controls.photoPeople.what": "Leave every figure out, for the city on its own",
  "controls.photoResolution.keys": "2",
  "controls.photoResolution.what": "Capture at double the screen's resolution",
  "controls.photoCapture.keys": "Enter",
  "controls.photoCapture.what": "Take the shot and save it as a PNG",
  "controls.photoLeave.keys": "Esc",
  "controls.photoLeave.what": "Leave photo mode, back to exactly where you were",

  "controls.group.dialogue": "In a conversation",
  "controls.choice.keys": "1–9",
  "controls.choice.what": "Take a choice by its number in the list",
  "controls.choiceFocus.keys": "Arrows / Enter",
  "controls.choiceFocus.what": "Walk the choices and take the focused one",
  "controls.skipReveal.keys": "Click the line",
  "controls.skipReveal.what": "Skip the typewriter to the end of the line",

  "controls.group.combat": "In a fight",
  "controls.group.combat.blurb":
    "The action bar is numbered in the order it is drawn, so the key and the button never disagree.",
  "controls.action.keys": "1–9",
  "controls.action.what": "Take an action off the bar",
  "controls.step.keys": "Arrows",
  "controls.step.what": "Step across the grid while moving",
  "controls.cycle.keys": "Tab",
  "controls.cycle.what": "Cycle the action buttons",
  "controls.cancel.keys": "Esc",
  "controls.cancel.what": "Cancel targeting and go back to the bar",

  "controls.group.breach": "In a breach",
  "controls.group.breach.blurb":
    "A run cannot be closed away from — it is finished, withdrawn from, or lost.",
  "controls.route.keys": "Arrows",
  "controls.route.what": "Move between the nodes around the head of the route",
  "controls.stepOn.keys": "Enter / Space",
  "controls.stepOn.what": "Step onto the focused node",
  "controls.undo.keys": "U",
  "controls.undo.what": "Undo the last step",
  "controls.withdraw.keys": "W",
  "controls.withdraw.what": "Withdraw with what you are holding",

  "controls.group.create": "Making a runner",
  "controls.group.create.blurb":
    "The wizard's own keys, on top of the panel keys above.",
  "controls.stepJump.keys": "1–5",
  "controls.stepJump.what": "Jump to a step you have already reached",
  "controls.turn.keys": "Q / E",
  "controls.turn.what": "Turn the live preview",
  "controls.motion.keys": "W",
  "controls.motion.what": "Switch the preview between standing and walking",
  "controls.previewZoom.keys": "+ / −",
  "controls.previewZoom.what": "Zoom the live preview",

  /* -------------------------------------------------------------- *
   * Character creation. Backgrounds, appearance options and their
   * blurbs are content; the wizard around them is not.
   * -------------------------------------------------------------- */
  "create.live.label": "Creation status",
  "create.step.announce": "Step {index} of {total}: {label}",
  "create.title": "New Runner",
  "create.title.ngPlus": "New Runner — New Game+",
  "create.menu": "Menu",
  "create.steps": "Creation steps",
  "create.next": "Next",
  "create.done": "Done",
  "create.jackIn": "Jack In",
  "create.edit": "Edit",
  "create.edit.label": "Edit {section}",
  /** "Hair: Undercut" — the shape every labelled read-out on the wizard takes. */
  "create.labelledValue": "{label}: {value}",

  "create.problem.background": "Pick a background",
  "create.problem.appearance": "This look references unknown options",
  "create.problem.review": "Finish the earlier steps before jacking in",

  "create.name": "Name",
  "create.name.placeholder": "Your street name",
  "create.ngPlus.bonus":
    "New Game+ bonus: +{points} point-buy points and one piece of your last runner's gear. Their perks do not come along — street cred is earned, never inherited.",
  "create.ngPlus.look":
    " Their look carries over too — restyle it on the Appearance step.",

  "create.background": "Background",
  "create.background.picked": "Background: {name}",
  "create.startingGear": "Starting gear: {items}",
  "create.legacy": "Legacy carry-over",
  "create.legacy.note": "One piece of your last runner's gear comes along.",
  "create.legacy.picked": "Legacy carry-over: {title}",
  "create.legacy.travelLight": "Travel light",
  "create.legacy.travelLight.note":
    "Carry nothing forward but the bonus points.",

  "create.stats": "Stats ({pool} points)",
  "create.stats.withLegacy": "Stats ({pool} + {legacy} legacy points)",
  "create.stats.remaining": "Points remaining: {remaining}",
  "create.stats.decrease": "Decrease {stat}",
  "create.stats.increase": "Increase {stat}",
  "create.derived": "Derived",
  "create.derived.row": "{label}: {amount}",
  "create.derived.maxHp": "Max HP",
  "create.derived.initiative": "Initiative",
  "create.derived.neuralCapacity": "Neural capacity",
  "create.derived.meleeBonus": "Melee damage bonus",
  "create.derived.rangedBonus": "Ranged damage bonus",

  "create.presets": "Preset looks",
  "create.preset.label": "Preset: {label}",
  "create.preset.applied": "Preset applied: {label}",
  "create.locks": "Locks — kept on Surprise Me",
  "create.lock.locked": "{label}: locked (survives Surprise Me)",
  "create.lock.unlocked": "{label}: unlocked",
  "create.surpriseMe": "Surprise Me",
  "create.surpriseMe.applied": "Randomized look applied",
  "create.stockLook": "Stock Look",
  "create.stockLook.applied": "Stock look applied",

  "create.review.identity": "Identity",
  "create.review.stats": "Stats",
  "create.review.appearance": "Appearance",
  "create.review.startingGear": "Starting gear:",
  "create.difficulty": "Difficulty",
  "create.difficulty.note":
    "Changeable later from Settings, along with the assists — the save will simply record that it happened.",

  "create.abandon.title": "Abandon this runner?",
  "create.abandon.note":
    "Drafts aren't saved — backing out to the menu discards every choice.",
  "create.abandon.keep": "Keep Editing",
  "create.abandon.discard": "Discard Draft",
  "create.name.required": "Enter a name",
  "create.name.tooLong": "Names cap at {max} characters",

  /* -------------------------------------------------------------- *
   * Counted things. English needs two forms and the game counts in
   * five places, so the pair is written out rather than assembled —
   * a language that needs three forms adds a third key here.
   * -------------------------------------------------------------- */
  "count.point.one": "{amount} point",
  "count.point.many": "{amount} points",
  "count.turn.one": "{amount} turn",
  "count.turn.many": "{amount} turns",
  "count.step.one": "{amount} step",
  "count.step.many": "{amount} steps",
  "count.hint.one": "{amount} hint",
  "count.hint.many": "{amount} hints",
  "count.socket.one": "{amount} socket",
  "count.socket.many": "{amount} sockets",
  "count.chain.one": "{amount} chain",
  "count.chain.many": "{amount} chains",
  "count.tile.one": "{amount} tile",
  "count.tile.many": "{amount} tiles",

  /* -------------------------------------------------------------- *
   * Companions and factions — where somebody stands, in a word
   * -------------------------------------------------------------- */
  "loyalty.sworn": "Sworn to you",
  "loyalty.loyal": "Loyal",
  "loyalty.warm": "Warm",
  "loyalty.professional": "Professional",
  "loyalty.wary": "Wary",
  "loyalty.cold": "Cold",
  "loyalty.done": "Done with you",
  "loyalty.approves": "{name} approves",
  "loyalty.disapproves": "{name} disapproves",
  "standing.note": "{faction}: {band}",

  /* -------------------------------------------------------------- *
   * Requirement labels — the bracketed reason a choice is greyed out
   * -------------------------------------------------------------- */
  "req.stat": "[{stat} {value}]",
  "req.background": "[Background: {tag}]",
  "req.static.atMost": "[Static: {band} at most]",
  "req.static.atLeast": "[Static: {band}+]",
  "req.item": "[Requires: {name}]",
  "req.item.many": "[Requires: {quantity}× {name}]",
  "req.enhancement": "[Installed: {name}]",
  "req.flag.equals": "[{key}: {value}]",
  "req.flag.notEquals": "[{key}: not {value}]",
  "req.flag.atLeast": "[{key} {value}+]",
  "req.flag.set": "[{key}: settled]",
  "req.flag.unset": "[{key}: unsettled]",
  "req.credits": "[{value} cr]",
  "req.companion.knows": "[Knows: {name}]",
  "req.companion.with": "[With: {name}]",
  "req.loyalty.low": "[{name} has had enough]",
  "req.loyalty.high": "[{name} trusts you]",
  "req.injury": "[{who}{what}]",
  "req.injury.any": "hurt",
  "req.reputation.atMost": "[{faction}: {band} at best]",
  "req.reputation.atLeast": "[{faction}: {band}+]",
  "req.dominant": "[{faction}: your strongest tie]",
  "req.dominant.none": "[No power stands above the others]",

  "pointBuy.range": "Stats must be between {min} and {max}",
  "pointBuy.range.stat": "{stat} must be between {min} and {max}",
  "pointBuy.overspent": "Allocation spends more points than the pool holds",
  "pointBuy.underspent": "Spend all remaining points before confirming",

  /* -------------------------------------------------------------- *
   * Item shelf labels. The item's own name and description are
   * content; the vocabulary describing its kind and numbers is not.
   * -------------------------------------------------------------- */
  "item.melee": "Melee",
  "item.ranged": "Ranged",
  "item.weapon": "{range} weapon · {damage} dmg{requirement}",
  "item.weapon.needs": " · needs {stat} {value}",
  "item.outfit": "Outfit · armor {armor}",
  "item.consumable": "{kind} · {effect} · {context}",
  "item.enhancement": "Cyberware · {slot} · {load} neural load · {static} Static",
  "item.mod": "Weapon mod · {socket} socket",
  "item.dye": "Outfit dye · {colors}",
  "item.misc": "Item",
  "item.kind.stim": "Stim",
  "item.kind.food": "Street food",
  "item.kind.kit": "Field kit",
  "item.kind.oddity": "Oddity",
  "item.context.either": "either side of a fight",
  "item.context.combat": "in a fight",
  "item.context.exploration": "out of combat",
  "item.context.none": "nowhere",

  "effect.timed": "{amount} {stat} for {turns}",
  "effect.timed.after": "{lift}, then {amount} {stat} for {turns}",
  "effect.heal": "heals {amount} HP",
  "effect.readied": "next fight: {effect}",
  "effect.treatInjury": "closes an injury",
  "effect.settle": "settles the chrome, clears the crash",
  "effect.none": "does nothing",
  "outcome.heal": "+{amount} HP",
  "outcome.treatsInjury": "closes the injury",
  "outcome.settles": "settles the chrome",
  "outcome.none": "no effect right now",

  "material.concrete": "grey",
  "material.chrome": "chrome",
  "material.glass": "pale",
  "material.dark": "black",
  "material.amber": "amber",
  "material.blue": "blue",
  "material.cyan": "cyan",
  "dye.cloth": "{color} cloth",
  "dye.trim": "{color} trim",
  "dye.none": "no color",

  "socket.barrel": "Barrel",
  "socket.core": "Core",
  "socket.grip": "Grip",
  "socket.none": "No mod sockets",
  "mod.stat": "{amount} {stat}",
  "mod.grantAbility": "Grants {ability}",
  "mod.unlockDialogue": "Unlocks \"{tag}\" dialogue",
  "mod.damage": "{amount} damage",
  "mod.pierce": "{amount} armor pierce",
  "mod.accuracy": "{amount} accuracy",
  "mod.range": "{amount} range",
  "mod.crit.sooner": "Crits land sooner",
  "mod.crit.later": "Crits land later",

  /* -------------------------------------------------------------- *
   * Static, injuries and the extraction warning
   * -------------------------------------------------------------- */
  "static.line": "Static {level} — {band}",
  "static.cool": "{amount} Cool in conversation",
  "static.affinity": "Opens chrome-affinity talk",
  "static.initiative": "{amount} initiative",
  "static.surge": "Static surge, once a fight",
  "static.noChange": "No change to Static",
  "static.shift": "{delta} Static → {level}",
  "static.shift.band": "{move} · {band}",
  "injury.line": "{name} — {effect}",
  "injury.closesNext": "Closes after your next move across the city.",
  "injury.closesIn": "Closes after {scenes} more moves across the city.",
  "inventory.extractionCost":
    "Extraction destroys the {name} and deals {trauma} HP of trauma.",

  /* -------------------------------------------------------------- *
   * Save slots and the errors a load can fail with
   * -------------------------------------------------------------- */
  "save.slot.1": "Slot 1",
  "save.slot.2": "Slot 2",
  "save.slot.3": "Slot 3",
  "save.slot.autosave": "Autosave",
  "save.slot.recovery": "Recovered run",
  "save.error.missing": "That slot is empty.",
  "save.error.corrupt": "That save is corrupted and cannot be loaded.",
  "save.error.version": "That save comes from an incompatible game version.",
  "save.error.checksum":
    "That save failed its integrity check — something changed it after it was written.",
  "save.error.migration":
    "That save could not be brought up to date for this version of the game.",

  /* -------------------------------------------------------------- *
   * The interact prompt, and shards
   * -------------------------------------------------------------- */
  "interact.key": "Enter",
  "interact.walkTo": "{key} — walk to {name}",
  "interact.verb.talk": "talk to",
  "interact.verb.open": "open",
  "interact.verb.use": "use",
  "interact.verb.search": "search",
  "interact.verb.pickUp": "pick up",
  "interact.verb.take": "take",
  "interact.verb.fight": "fight",
  "interact.verb.breach": "breach",
  "shard.lockedHint": "Recovered somewhere in {district}.",
  "shard.pickup": "Memory shard recovered — \"{title}\" ({tally}). Filed in the codex.",
  "shard.pickup.complete":
    "Memory shard recovered — \"{title}\" ({tally}). The Grey Choir is whole; read it in the codex.",

  /* -------------------------------------------------------------- *
   * Combat log. Every line is the engine reporting, not the story
   * speaking — the names inside come from content.
   * -------------------------------------------------------------- */
  "log.started": "Hostiles engaged.",
  "log.round": "— Round {round} —",
  "log.stunned": "{name} is stunned and loses the turn.",
  "log.hit": "{attacker} hits {target} for {damage} damage.",
  "log.miss": "{attacker} misses {target}.",
  "log.ability": "{name} hits {target} with {ability} for {damage} damage{stun}.",
  "log.ability.self": "{name} uses {ability}.",
  "log.ability.stun": ", stunning them",
  "log.charge.started":
    "{name} winds up {ability} — the marked ground is hit on its next turn.",
  "log.charge.released": "{name} looses {ability}.",
  "log.charge.empty": "{name} looses {ability} into empty ground.",
  "log.static.armed":
    "{name}'s chrome is howling — hold the next turn's action to bleed it off, or lose the turn after it.",
  "log.static.vented": "{name} rides the static out. It settles.",
  "log.static.surge":
    "Static surges through {name} — every implant firing at once.",
  "log.item": "{name} uses a {item}.",
  "log.healed": "{name} recovers {amount} HP.",
  "log.secondWind":
    "{name} goes down and does not stay down — second wind, {amount} HP.",
  "log.boosted": "{name} gains {amount} {stat} for {turns} turns.",
  "log.crashed": "The stim leaves {name} — {amount} {stat} for {turns} turns.",
  "log.settled": "{name} settles. The chrome goes quiet.",
  "log.flee.success": "{name} breaks away from the fight!",
  "log.flee.failed": "{name} tries to flee but finds no opening.",
  "log.defeated": "{name} goes down.",
  "log.end.victory": "All hostiles are down.",
  "log.end.defeat": "You collapse. The fight is over.",
  "log.end.fled": "You are clear of the fight.",

  /* -------------------------------------------------------------- *
   * Narration — what the canvas says out loud.
   *
   * The district and the arena are pixels; a screen reader gets these
   * instead. They narrate *events*, never pixels: whose turn it is,
   * what moved where, what is in focus and how far off. Anything the
   * log already says in words is left to the log.
   * -------------------------------------------------------------- */
  "dialogue.label": "Conversation",
  "breach.label": "Breach",
  "perks.label": "Perks",
  "save.label": "Save and load",
  "vendor.label": "Counter",
  "workbench.label": "Workbench",
  "menu.pause.label": "Pause menu",
  "interlude.label": "Previously",
  "dialogue.spoken": "{speaker}: {line}",
  "combat.log.label": "Combat log",
  "combat.narrator.label": "Arena",
  /* The initiative rail read aloud. Every chip draws its facts — whose
     turn, how far off, how hurt, what is stuck to them — as a portrait,
     a colour, and a bar, none of which a screen reader can see; these
     are the same facts as a sentence. */
  "combat.rail.label": "Initiative order",
  "combat.rail.chip": "{name}, {turn}, {hp}",
  "combat.rail.turn.now": "acting now",
  "combat.rail.turn.next": "next up",
  "combat.rail.turn.away": "{turns} turns away",
  "combat.rail.turn.down": "defeated",
  "combat.rail.injury": "injured: {name}, {effect}",
  "explore.narrator.label": "The street",
  "narrate.turn": "{name}'s turn.",
  "narrate.moved": "{name} moves to column {x}, row {y}.",
  "narrate.arrived": "{map}. {things} within reach of you.",
  "narrate.arrived.alone": "{map}. Nothing here to use.",
  "narrate.focus": "{label}, {distance} tiles away.",
  "narrate.focus.inReach": "{label}, within reach.",
  "narrate.crouched": "Crouched.",
  "narrate.standing": "Standing.",
  "count.thing.one": "{amount} thing",
  "count.thing.many": "{amount} things",

  /* -------------------------------------------------------------- *
   * Combat HUD: the action bar, why a button is off, and what the
   * engine's figures read as on a tooltip.
   * -------------------------------------------------------------- */
  "combat.action.attack": "Attack",
  "combat.action.ability": "Ability",
  "combat.action.item": "Item",
  "combat.action.move": "Move",
  "combat.action.flee": "Flee",
  "combat.action.flee.odds": "Flee ({chance})",
  "combat.action.endTurn": "End Turn",

  "combat.blocked.over": "The fight is over.",
  "combat.blocked.notYourTurn": "Not your turn.",
  "combat.blocked.actionUsed": "No AP — this turn's action is spent.",
  "combat.blocked.noTargets": "Nothing left to target.",
  "combat.blocked.outOfRange": "Out of range — move closer.",
  "combat.blocked.noAbilities": "No abilities installed.",
  "combat.blocked.allCooling": "Every ability is still cooling down.",
  "combat.blocked.noItems": "No usable items carried.",
  "combat.blocked.noSteps": "No steps left this turn.",
  "combat.blocked.noRoom": "Nowhere to step.",
  "combat.blocked.cannotFlee": "No way out of this one.",
  "combat.blocked.playerOnly": "Yours to call, not theirs.",

  "combat.idle.choose": "Choose an action.",
  "combat.idle.outOfRange": "Nothing in reach — Move closer, then Attack.",
  "combat.idle.actionUsed": "This turn's action is spent. Move, or End Turn.",
  "combat.idle.noTargets": "Nothing left to fight.",

  "combat.tip.attack": "{weapon} — {damage} dmg · {chance} to hit · {targets} in range",
  "combat.tip.item": "{name} ×{quantity} — {outcome}",
  "combat.tip.move": "{steps} left · {tiles} in reach",
  "combat.tip.flee": "{chance} to break contact and leave the fight",
  "combat.tip.endTurn": "Pass the turn; unspent steps are lost.",
  "combat.tip.ability": "{name} — {damage} dmg{stun}{bodies}",
  "combat.tip.ability.cooling": "{name} — cooling down ({turns})",
  "combat.tip.ability.boost": "{name} — +{amount} {stat} for {turns} turns",
  "combat.tip.ability.noTarget": "{name} — nothing within {range}",
  "combat.tip.ability.stun": " · stuns {turns}",
  "combat.tip.ability.bodies": " · hits {bodies}",

  "combat.tile.offGrid": "Outside the arena.",
  "combat.tile.sameTile": "You are already standing here.",
  "combat.tile.occupied": "Someone is standing here.",
  "combat.tile.outOfRange": "Out of range.",
  "combat.tile.noTarget": "Nothing to hit here.",
  "combat.tile.cooling": "Still cooling down.",
  "combat.tile.selfOnly": "This one only ever hits you.",

  "combat.damage": "{damage} dmg",
  "combat.damage.range": "{min}–{max} dmg",
  "combat.hitChance": "{chance} to hit",
  "combat.status.stun": "stuns {turns}",
  "combat.status.boost": "+{amount} {stat} for {turns} turns",
  "combat.noEffect": "no effect",
  "combat.surge.armed":
    "Static armed — end this turn with your action unspent to bleed it off.",
  "combat.surge.building": "Static building — {turns} until it peaks.",

  /* -------------------------------------------------------------- *
   * Graphics & Comfort controls. Each row's caption and the sentence
   * under it; the option words come from the setting's own catalog in
   * src/data/accessibility.ts where one exists.
   * -------------------------------------------------------------- */
  "graphics.group.comfort": "Comfort",
  "graphics.group.comfort.blurb":
    "Nothing in here changes how the game plays, what it tells you, or what you can reach. They change how much of it moves and how easily it reads.",
  "graphics.group.world": "The city",
  "graphics.group.world.blurb":
    "What the streets are doing while you walk through them.",
  "graphics.group.camera": "Camera",
  "graphics.group.hud": "Heads-up display",

  "graphics.motion": "Screen motion",
  "graphics.motion.blurb":
    "The master switch for everything that moves on its own. System follows what this device asks for; the other two override it either way. Nothing is ever hidden by reducing motion — it is stilled.",
  "graphics.colorMode": "Marker colours",
  "graphics.colorMode.blurb":
    "Which palette every marked tile is painted from: the tinted ground in a fight, the vision cones of anyone watching, the walk preview, the cursor, and the ring around whatever you are standing next to.",
  "graphics.textScale": "Interface text",
  "graphics.textScale.blurb":
    "Scales every panel, label, and HUD readout together. The pixel lettering stays as crisp at the larger sizes — it is the same type drawn bigger, not stretched.",

  "graphics.glow": "Neon glow",
  "graphics.glow.blurb":
    "Layers soft light from signage, screens, and streetlights over the streets. Off is a flatter, faster picture.",
  "graphics.weather": "Weather",
  "graphics.weather.blurb":
    "Rain, puddles, and splashes on the districts that have them. It never changes how the game plays. Reduced motion stills the rain on its own; this takes it away entirely.",
  "graphics.setPieces": "Set pieces",
  "graphics.setPieces.blurb":
    "The trains crossing the viaducts, the drones on their routes, the steam off the vents. Scenery on a clock — off leaves the streets standing still, and nothing you can walk to or talk to changes.",
  "graphics.barks": "Street chatter",
  "graphics.barks.blurb":
    "Passers-by, the people standing on the map, and whoever is walking with you say short unprompted lines over their heads. Nothing said this way matters to the story.",

  "graphics.zoom": "Camera zoom",
  "graphics.zoom.blurb":
    "How close the exploring camera sits. The wheel and the + and − keys move it too; this is where it starts.",
  "graphics.combatFeel": "Combat camera",
  "graphics.combatFeel.blurb":
    "The camera glides to whoever is acting, holds for a few frames when a blow connects, and takes a small knock off the heavy ones. Off keeps the arena still, as does reduced motion.",
  "graphics.combatFeel.fixed": "Fixed",
  "graphics.shake": "Screen shake",
  "graphics.shake.blurb":
    "How hard heavy hits and blasts knock the view. Off stills the shake alone and leaves the glide and the hit-pause as they are.",
  "graphics.shake.off": "Off",
  "graphics.shake.light": "Light",
  "graphics.shake.standard": "Standard",
  "graphics.shake.strong": "Strong",

  "graphics.minimap": "Minimap",
  "graphics.minimap.blurb":
    "The corner map shows the whole district, where you stand and face, the ways out, and who is worth walking to. Collapsed it leaves a tab; M expands it again while exploring.",
  "graphics.minimap.shown": "Shown",
  "graphics.minimap.collapsed": "Collapsed",

  /* -------------------------------------------------------------- *
   * Breach: the lattice, its nodes, and how a run reads afterward.
   * The terminal's own briefing and spent lines are content.
   * -------------------------------------------------------------- */
  "breach.jackIn": "Jack in",
  "breach.walkAway": "Walk away",
  "breach.jackOut": "Jack out [Esc]",
  "breach.stepBack": "Step back [Esc]",
  "breach.backUp": "Back up [U]",
  "breach.pullOut": "Pull out [W]",
  "breach.undo": "You back off the node. The hop is spent either way.",
  "breach.cannotClose": "Pull out with [W] — you cannot simply close the channel.",
  "breach.rescue": "Let it route itself",
  "breach.rescue.note":
    "Assist: the lattice will route itself to the core. You take what the core holds and none of the data along the way.",
  "breach.buffer":
    "Buffer {budget} — {minimum} to route it clean, {slack} to be wrong with.",
  "breach.warning.partial":
    "One attempt. Pull out early and you keep the data you carried.",
  "breach.warning.allOrNothing":
    "One attempt. There is nothing here to carry out early.",

  "breach.node.entry": "Entry node",
  "breach.node.core": "The core",
  "breach.node.dead": "Corrupt — nothing routes through",
  "breach.node.trace": "Trace node, {fragment}",
  "breach.node.fragment": "{fragment} fragment",
  "breach.node.unread": "yield unread",
  "breach.node.yield": "yield {value}",
  "breach.node.cost": "costs {cost}",
  "breach.node.here": "you are here",
  "breach.node.routed": "routed",
  "breach.fragment.carrier": "carrier",
  "breach.fragment.cipher": "cipher",
  "breach.fragment.pulse": "pulse",
  "breach.fragment.ghost": "ghost",

  "breach.report.breached": "Core reached",
  "breach.report.breached.body":
    "{hops} hops, {chains} banked, {harvest} fragments of data out, {left} left in the buffer.",
  "breach.report.withdrawn": "Pulled out",
  "breach.report.withdrawn.body":
    "You back the route out one node at a time and let the lattice close over it. {harvest} fragments of data came with you.",
  "breach.report.lockedOut": "Locked out",
  "breach.report.lockedOut.body":
    "The buffer runs dry with the core still ahead of you, and the trace closes on an empty channel. Whatever was in there stays in there.",
  "breach.spent.withdrawn": "{spent} You did not finish what you started here.",
  "breach.spent.lockedOut":
    "The channel is dead. Whatever logged you the first time is still logging, and it will not open again.",

  /* -------------------------------------------------------------- *
   * Counters and the bench, continued: prices, haggling, dye tins,
   * and the fields a weapon mod moves.
   * -------------------------------------------------------------- */
  "vendor.worth": "Worth {credits} cr",
  "vendor.youPay": "You pay {credits} cr",
  "vendor.youGet": "You get {credits} cr",
  "vendor.buy": "Buy — {price}",
  "vendor.soldOut": "Sold out",
  "vendor.stock": "{remaining} of {stocked} left this chapter",
  "vendor.stock.out": "Sold out this chapter",
  "vendor.tab.buy": "On the shelf",
  "vendor.tab.sell": "In your bag",
  "vendor.why": "Why?",
  "vendor.hideBreakdown": "Hide breakdown",
  "vendor.kind.stall": "Street stall",
  "vendor.kind.bonded": "Bonded counter",
  "vendor.haggle": "Haggle",
  "vendor.haggle.hint":
    "One go, this chapter. Win and every price here shifts {shift}% your way; lose and they stop moving.",
  "vendor.haggle.tooCool":
    "Talking a price down takes Cool {needed}; yours is {cool}.",
  "vendor.haggle.won": "Price argued down",
  "vendor.haggle.won.hint":
    "{keeper} has already come down; it holds until the chapter turns over.",
  "vendor.haggle.locked": "They stopped moving",
  "vendor.haggle.locked.hint":
    "{keeper} is not discussing price again this chapter.",

  "bench.socketLine": "{sockets} · {filled} filled",
  "bench.place.equipped": "In hand",
  "bench.place.carried": "Carried",
  "bench.field.damage": "damage",
  "bench.field.accuracy": "accuracy",
  "bench.field.pierce": "armor pierce",
  "bench.field.range": "range",
  "bench.field.crit": "crit threshold",

  "dye.notDyeable": "Nothing on it to dye",
  "dye.wearing": "Wearing {colors}",
  "dye.factory": "Factory colours",
  "dye.action.worn": "Already worn",
  "dye.action.carried": "Apply — carried",
  "dye.action.buy": "Buy & apply — {price} cr",
  "dye.action.unavailable": "Not for sale",

  /* -------------------------------------------------------------- *
   * Remaining model copy: save-card notices, the review sheet's
   * appearance labels, stealth refusals, the preview controls.
   * -------------------------------------------------------------- */
  "save.unnamed": "Unnamed runner",
  "save.rename.error.blank":
    "Enter a name, or leave it blank to clear the label.",
  "save.rename.error.tooLong": "Labels cap at {max} characters.",
  "save.notice.version":
    "Saved by a different version of the game — it cannot be loaded here.",
  "save.notice.corrupt": "This save could not be read. Everything else is fine.",
  "save.notice.corrupt.backup":
    "This save could not be read. The backup from before it was written is still here.",
  "save.notice.checksum":
    "This save changed after it was written and cannot be trusted.",
  "save.notice.checksum.backup":
    "This save changed after it was written and cannot be trusted. The backup from before it was written is still here.",
  "save.notice.migration":
    "This save could not be updated for this version of the game. It has been left exactly as it was.",

  "appearance.field.skinTone": "Skin tone",
  "appearance.field.build": "Build",
  "appearance.field.hairStyle": "Hair",
  "appearance.field.hairColor": "Hair color",
  "appearance.field.eyes": "Eyes",
  "appearance.field.eyeColor": "Eye color",
  "appearance.field.brows": "Brows",
  "appearance.field.mouth": "Mouth",
  "appearance.field.faceDetail": "Face detail",
  "appearance.field.headwear": "Headwear",

  "create.legacy.line": "{pick} · +{points} bonus point-buy points",
  "create.legacy.lookCarried": " · last runner's look carried over",
  "create.legacy.excludes":
    "Perks stay with the runner who earned them — street cred is a reputation, and nobody inherits one.",

  "preview.rotateLeft": "Rotate left (Q)",
  "preview.rotateRight": "Rotate right (E)",
  "preview.walk": "Walk",
  "preview.walkToggle": "Toggle walk animation (W)",
  "preview.zoomOut": "Zoom out (−)",
  "preview.zoomIn": "Zoom in (+)",
  "preview.facing.frontLeft": "front left",
  "preview.facing.frontRight": "front right",
  "preview.facing.backRight": "back right",
  "preview.facing.backLeft": "back left",

  "minimap.tab": "Map [M]",
  "party.talk": "A word in private",
  "perk.section.taken": "Taken",
  "perk.section.taken.empty":
    "Nothing yet — the street has not made its mind up about you.",
  "perk.section.choose": "Choose one",
  "perk.section.offer": "On offer",
  "perk.section.offer.empty": "You have taken everything there is to take.",
  "stylist.stripped": "Stripped back. The cloth remembers nothing.",

  "stealth.refusal.spent": "No second chance at that — not with these hands.",
  "stealth.refusal.aware": "They are looking straight at you.",
  "stealth.refusal.tooSlow": "You are not quick enough for that gap.",
  "stealth.takedown": "{name} goes down quietly.",
  "stealth.heard": "A boot on the plate. ",

  "combat.status.steps": "Steps left {steps}",
  "combat.status.actionSpent": "Action spent",
  "combat.status.actionReady": "Action ready",
  "combat.status.enemyTurn": "Enemy turn…",
  "combat.select.move":
    "Click a highlighted tile to move ({steps} left) — or use the arrow keys. Esc cancels.",
  "combat.select.target": "Select a target. Esc cancels.",
  "combat.select.ability": "Select an ability. Esc cancels.",
  "combat.select.item": "Select an item. Esc cancels.",
  "combat.noSpoils": "No spoils this time.",
  "combat.wounded": "You did not walk away clean.",

  "game.threadClosed": "That thread is closed. The city keeps moving.",
  "game.shardUnreadable": "The chip's index refuses to open.",
  "game.shardAlreadyRead": "\"{title}\" is already in the codex.",
} as const;

export type StringTable = typeof STRINGS;
export type StringKey = keyof StringTable;

/* ------------------------------------------------------------------ *
 * The formatter
 * ------------------------------------------------------------------ */

/** A value a placeholder may be filled with. */
export type FormatValue = string | number;

/**
 * The placeholder names inside a template, as a union of literal types.
 * `"Deal {n} to {target}"` yields `"n" | "target"`; a template with no
 * placeholders yields `never`.
 *
 * Doubled braces escape, so `"{{n}}"` contributes nothing — the `{{`
 * arm is matched first and consumes the brace pair before the
 * placeholder arm can see it.
 */
export type Placeholders<S extends string> =
  S extends `${string}{{${string}}}${infer Rest}`
    ? Placeholders<Rest>
    : S extends `${string}{${infer Name}}${infer Rest}`
      ? Name | Placeholders<Rest>
      : never;

/** The parameter record a template demands, or `never` if it takes none. */
export type FormatParams<S extends string> = [Placeholders<S>] extends [never]
  ? never
  : Record<Placeholders<S>, FormatValue>;

/**
 * The tail of `t()`'s argument list: nothing for a plain string, a
 * required params record for a parameterized one. Splitting it this way
 * is what makes `t("menu.back", { n: 1 })` and `t("combat.hit")` both
 * compile errors.
 */
export type TArgs<K extends StringKey> = [
  Placeholders<StringTable[K]>,
] extends [never]
  ? []
  : [params: FormatParams<StringTable[K]>];

const PLACEHOLDER = /\{\{|\}\}|\{([A-Za-z][A-Za-z0-9_]*)\}/g;

/**
 * Fills `{name}` placeholders from `params`.
 *
 * - `{{` and `}}` are literal braces, so a template can say `{` at all.
 * - A placeholder with no matching parameter is left standing. Typed
 *   call sites make that unreachable; untyped ones get something
 *   obviously wrong on screen rather than the word "undefined".
 * - Numbers stringify with `String`, which is the plain decimal form
 *   this game wants everywhere it counts something.
 */
export function format(
  template: string,
  params?: Record<string, FormatValue>,
): string {
  if (!params) return template.replace(PLACEHOLDER, unescapeOnly);
  return template.replace(PLACEHOLDER, (match, name?: string) => {
    if (name === undefined) return match === "{{" ? "{" : "}";
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

function unescapeOnly(match: string): string {
  if (match === "{{") return "{";
  if (match === "}}") return "}";
  return match;
}

/**
 * Looks a string up by key and fills its placeholders.
 *
 * The overload-free signature carries the whole contract: `K` narrows to
 * a literal key, and `TArgs<K>` derives the parameters from that key's
 * template, so misuse fails at compile time.
 */
export function t<K extends StringKey>(key: K, ...args: TArgs<K>): string {
  const template: string = STRINGS[key];
  const params = args[0] as Record<string, FormatValue> | undefined;
  return format(template, params);
}

/**
 * The keys whose template takes no parameters.
 *
 * `t()` needs a *literal* key to work out what parameters that key
 * demands, so a key held in a variable — a table of control bindings, a
 * map from a discriminant to a caption — cannot go through it. Narrowing
 * to the parameterless keys makes those lookups safe again.
 */
export type PlainKey = {
  [K in StringKey]: [Placeholders<StringTable[K]>] extends [never] ? K : never;
}[StringKey];

/** Looks up a parameterless string by a key held in a variable. */
export function plain(key: PlainKey): string {
  return STRINGS[key];
}

/** Whether a runtime string names an entry in the table. */
export function isStringKey(key: string): key is StringKey {
  return Object.prototype.hasOwnProperty.call(STRINGS, key);
}
