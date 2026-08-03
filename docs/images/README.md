# Screenshots

The four images the [README](../../README.md) is written around, and how
to take them — the first time and every time the art moves. The recipe
is written down rather than remembered because a stale screenshot is a
promise the game has stopped keeping.

**None of them are here yet.** The README's screenshot section says so
plainly rather than linking four missing files; once these exist,
replace that note with the markdown at the bottom of this page.

Take them from `npm run dev` — never from a stale `dist` — in a window
sized **1280×800**, at the default zoom, with the default Graphics &
Comfort settings (glow, weather and set pieces on, motion following the
device). Crop to the game viewport, nothing of the browser.

| File | What it shows | How to get there |
| --- | --- | --- |
| `hub.png` | Cinder Row Plaza, the hub district | New Game through to the first arrival on the plaza, or `?dev` → Explore. Stand near the middle of the plaza with the minimap expanded, and wait for the overline to cross the viaduct behind the north terrace. |
| `creation-appearance.png` | The appearance step of creation | New Game → step 4. Open the hair tab so a thumbnail grid and a swatch row are both visible, with the live preview turned three-quarters (`Q`/`E`). |
| `combat-telegraph.png` | A fight, mid-decision | Any encounter. Open an ability with an area and point at a target, so the shot carries reach, range and impact at once — a wind-up already declared against you is better still. |
| `dialogue.png` | A conversation | Any scene with a companion along, so the speaker's portrait and the crew aside are both in frame, and at least one greyed-out choice shows its requirement. |

Keep the filenames: the README links to them by name, and a renamed
file is a broken image on the front page.

## The section to paste

Once the four files are in this folder, this replaces the "Pending"
note under `## Screenshots` in the README:

```markdown
| | |
| --- | --- |
| ![Cinder Row Plaza, the hub district](docs/images/hub.png) | ![The appearance step of character creation](docs/images/creation-appearance.png) |
| **Cinder Row Plaza.** The hub: an overline train on the viaduct behind the north terrace, news strips on the boards, and the minimap under the HUD. | **Making a runner.** The appearance step: category tabs, swatch rows, and a live preview you can turn, walk, and zoom — all of it the same sprite the map will draw. |
| ![A fight with the telegraph layer showing reach and impact](docs/images/combat-telegraph.png) | ![A conversation, with portraits for the speaker and the crew](docs/images/dialogue.png) |
| **A fight.** Turn-based on an iso arena. The ground says what an action would touch before you commit to it — your reach, your range, the impact, and any wind-up somebody has already aimed at you. | **A conversation.** Portraits are composed from the same appearance data as the sprites. Choices gate on stats, gear, chrome, flags, and standing; a locked one shows you what it wanted. |
```
