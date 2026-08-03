# Accessibility

What the game promises, and where each promise is held to account. The
player-facing version — which switch to flip, and where — is in the
[player guide](PLAYER_GUIDE.md#comfort-and-accessibility); this is the
engineering half.

Four promises, and where each one is held to account. The suite is the
enforcement: every claim below that a machine can check is checked, so
breaking one fails a test rather than shipping quietly.

- **Every activity is playable from the keyboard alone.** Creation,
  exploration (including walking the map and picking a target across
  the plaza), dialogue, combat, breach, the stealth toggles, and every
  panel — vendor, stylist, codex, crew, settings. The full key map lives
  in one table (`src/ui/controlsModel.ts`) and is rendered as a
  **Controls** reference from the main menu, the pause menu, and
  Settings; a key added to a screen without a line in that table fails
  `controlsModel.test.ts`. Every control carries a visible focus ring,
  swept out of the real stylesheet by `theme.test.ts`.
- **Screen readers get told what the pixels say.** The two screens where
  the game actually happens are canvas, so both narrate their events
  into a live region — arrival, focus, crouch, whose turn it is, what an
  action did — from the same event stream the combat log reads
  (`src/ui/announce.ts`). Dialogue announces speaker and line, the
  creation wizard announces each step, and the initiative rail states
  every chip as a sentence rather than as a portrait and a bar.
- **Nothing is carried by colour alone, and the chrome meets WCAG AA.**
  Contrast ratios are computed against the real `theme.css` tokens by
  `theme.test.ts`, not eyeballed. Every marked tile and highlight also
  answers to the colourblind-assist palette, and the marks that had been
  leaning on hue — the Static band ladder, the condition badges — carry
  shape or a word as well.
- **Motion and flash are bounded.** Reduced motion follows the device by
  default and can be overridden either way; both scenes still every
  ambient effect at once by handing the renderer a frozen clock, which
  `comfort.test.ts` sweeps for. Nothing flashes more than three times a
  second (WCAG 2.3.1): `src/iso/flash.ts` counts the worst one-second
  window of a periodic signal, and `flash.test.ts` holds the neon
  dropouts and the Static portrait tear to the budget — the neon across
  every seed a map of a few thousand tiles produces.

What a test cannot answer is how it actually sounds. The roles, names,
and live-region wiring above are asserted against the rendered DOM, but
no assertion in the suite can hear a rotor: whether the reading order of
a screen is sensible, whether an announcement interrupts something worth
hearing, and whether a label reads as a sentence are still questions for
a person with VoiceOver switched on. That pass is outstanding, and is
worth repeating whenever a screen changes shape.
