/**
 * The Neon Fable content styleguide — and the machine-checkable part of
 * it.
 *
 * Eighteen tasks of content went into this city by way of a dozen
 * separate sittings, and the thing that drifts across sittings is never
 * the systems: it is whether the ring at the top of the Spire is the
 * Crown Ring or the crown ring. This file is the one place that answers
 * questions like that, and `styleguide.test.ts` sweeps every content
 * source against the answers, so a drift fails a test rather than
 * shipping quietly into a save file somebody keeps for a year.
 *
 * It is deliberately a *narrow* checker. Prose is not lintable and this
 * does not pretend otherwise: it holds proper nouns to one spelling,
 * holds registry names to Title Case and registry ids to kebab-case,
 * and keeps a small set of typographic conventions. Everything else
 * below is written for a person to read before they write a scene.
 *
 * ------------------------------------------------------------------
 * 1. Voice
 * ------------------------------------------------------------------
 * The narration is close third person, present tense, and it addresses
 * the runner as "you". It reports what a person in the room would see
 * and hear; it does not editorialise, and it does not tell the player
 * how to feel about a choice. Nobody in the Sprawl explains the setting
 * to anybody who already lives in it — exposition arrives as somebody's
 * business, a bark, a shard of archive, or not at all.
 *
 * The city's own registers are distinct and should stay distinct:
 * - **Narration** — sentence case, em dashes, no exclamation marks.
 * - **Dialogue** — inside escaped double quotes, with the speaker
 *   carried by the node's `speaker` field rather than by a "he said".
 * - **Signage, tickers and system voice** — ALL CAPS, and the only
 *   place capitals are allowed to shout (`src/data/world.ts` news,
 *   Cordon announcements, the Locus). The proper-noun sweep exempts a
 *   fully-uppercase match for exactly this reason.
 * - **Vendor and interactable labels** — sentence case, because they
 *   are the UI describing a thing, not the thing's name.
 *
 * ------------------------------------------------------------------
 * 2. Capitalisation
 * ------------------------------------------------------------------
 * - **Proper nouns are Title Case and never drift.** `PROPER_NOUNS`
 *   below is the list the sweep enforces. A name that is also an
 *   ordinary English word — Patch, Flick, Quill, Bell, Sable — is
 *   deliberately *not* on the list, because a checker cannot tell the
 *   fixer from the trauma patch. Those are held by review.
 * - **A name is capitalised; the thing it describes is not.** The
 *   Lockgate Stair is a place; the lockgate at the head of the storm
 *   canal is a piece of ironmongery. The Cistern Court is a council;
 *   the cistern is full of water. The Charter is a document with a seat
 *   in it; a charter is a legal instrument anyone can file. Static is
 *   the meter on the HUD; static is what a dead relay hums. This split
 *   is the reason the sweep checks so few single words.
 * - **Item names are Title Case in the registry and lower case in
 *   prose.** The shelf sells a Trauma Patch; a stallkeeper presses a
 *   trauma patch into your hand. Registry `name` fields are what the UI
 *   prints, so they carry the capitals; a scene talking about the
 *   object speaks English.
 * - **Roles are lower case unless they are part of a name.** Matron
 *   Ferrow, and the matron; Director Voss, and the director.
 *
 * ------------------------------------------------------------------
 * 3. Item and ability voice
 * ------------------------------------------------------------------
 * - Names are two or three words, concrete, and made of things that
 *   exist in the world: Rail Spitter, Tender's Oilskin, Splitbore
 *   Choke. No adjectives of rarity ("Superior", "Mk II"), no numbers in
 *   a name, no franchise-shaped compounds.
 * - Descriptions are one or two sentences that say what the thing *is*
 *   and what it costs you — never a stat line. The numbers live in the
 *   effect fields and the UI prints them; a description that repeats a
 *   number will disagree with it after the next balance pass.
 * - Cyberware descriptions name the trade. Chrome in this city always
 *   takes something.
 *
 * ------------------------------------------------------------------
 * 4. Ids
 * ------------------------------------------------------------------
 * Kebab-case, lower case, ASCII: `out-cordon-plate`, `enc-crown-alone`,
 * `a3-keys`. Families carry a prefix (`wpn-`, `out-`, `cyb-`, `enc-`,
 * `ability-`, `shard-`, act nodes `a1-`/`a2-`/`a3-`). A location
 * reference joins two ids with a colon: `flooded-quays:lockgate-stair`.
 * Ids are permanent — they are written into save files, and renaming
 * one breaks every save that holds it. Add, never rename.
 *
 * ------------------------------------------------------------------
 * 5. Typography and units
 * ------------------------------------------------------------------
 * - Em dash `—` with spaces around it for an aside; `-` only inside
 *   words. Never `--`.
 * - Straight apostrophes and escaped straight double quotes. No curly
 *   quotation marks anywhere: the game renders in a pixel-era UI and
 *   the CSS stack is not chosen for them.
 * - A hesitation mid-sentence is three ASCII dots, tight against the
 *   word before it: "air that just... stops coming". The `…` character
 *   is never used, and a line never *ends* on one — a thought that
 *   trails off takes a full stop or is rewritten, and dialogue cut off
 *   by somebody else takes an em dash.
 * - Credits are `cr`, lower case, after the figure with a space:
 *   `20 cr`. Percentages have no space: `40%`.
 *
 * ------------------------------------------------------------------
 * 6. Setting
 * ------------------------------------------------------------------
 * Original names only. The Meridian Sprawl, its three powers, its
 * districts and its people were made for this game; nothing here is
 * borrowed from an existing cyberpunk franchise, and nothing should be.
 */

/** A name the city spells exactly one way. */
export interface ProperNoun {
  /** The canonical spelling, exactly as content must write it. */
  readonly text: string;
  /** Why it is on the list, when that is not obvious. */
  readonly note?: string;
}

/**
 * Names the sweep holds to one spelling.
 *
 * Every case-insensitive occurrence of one of these in content prose
 * must match its canonical casing — or be entirely uppercase, which is
 * the signage voice (see `isSignage`). Ordinary English words are
 * deliberately absent: see the capitalisation section above.
 */
export const PROPER_NOUNS: readonly ProperNoun[] = [
  // The three powers.
  { text: "Auric Combine" },
  { text: "Cistern Court" },
  { text: "Vertical Market" },
  // Districts and landmarks.
  { text: "Meridian Sprawl" },
  { text: "Sprawl" },
  { text: "Cinder Row" },
  { text: "Greywater" },
  { text: "Meridian Exchange" },
  { text: "Ventworks" },
  { text: "Auric Spire" },
  { text: "Spire", note: "Always the tower; the city has only one." },
  { text: "Crown Concourse" },
  { text: "Crown Ring" },
  { text: "Executive Floor" },
  { text: "Flooded Quays" },
  { text: "Lockgate Stair" },
  { text: "Lockgate Walkway" },
  { text: "Rustyard" },
  { text: "Scaffold Row" },
  { text: "Chainwell" },
  { text: "Junction Nine" },
  { text: "Vault Antechamber" },
  { text: "Relay Crown" },
  { text: "Longshore" },
  { text: "Undercroft" },
  { text: "Undertow", note: "The programme and the files, not a current." },
  { text: "Pumpworks" },
  { text: "Locus" },
  {
    text: "Cordon",
    note: "The Combine's instrument and everything it issues — including its plate.",
  },
  // People. Names that are also ordinary words are held by review.
  { text: "Voss" },
  { text: "Ferrow" },
  { text: "Vesper" },
  { text: "Sabbat" },
  { text: "Onder" },
  { text: "Warden" },
];

/** A place content says one of the names above in lower case on purpose. */
export interface CasingException {
  /** The phrase, verbatim, that makes the lower-case reading correct. */
  readonly phrase: string;
  /** Why it reads that way. */
  readonly reason: string;
}

/**
 * The lower-case senses that are right.
 *
 * A match is exempt when the literal it sits in contains one of these
 * phrases verbatim. Keep the list short and the reasons real: an entry
 * here is a sentence the sweep has stopped reading.
 */
export const CASING_EXCEPTIONS: readonly CasingException[] = [
  {
    phrase: "A cordon is a legal instrument",
    reason:
      "Sill is explaining the general instrument, which is the whole " +
      "point of the line: a cordon can be answered because it was filed.",
  },
  {
    phrase: "waxed longshore coat",
    reason:
      "A trade garment, the way a donkey jacket is — the cut, not the " +
      "district that wears it.",
  },
  {
    phrase: "The undercroft levels being presently unsurveyed",
    reason:
      "Minuted before the place had a name. The shard is about the " +
      "Charter declining to survey it, so the record does not name it.",
  },
];

/**
 * Words that stay lower case inside a Title Case name, unless they open
 * it. Deliberately short — the game's names are concrete nouns.
 */
export const TITLE_CASE_MINOR_WORDS: readonly string[] = [
  "a",
  "an",
  "and",
  "at",
  "by",
  "for",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
];

/** The shape every content id takes. */
export const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The shape of a story node's `location` tag: `<district>:<place>`,
 * both halves kebab-case. It is a scene's address in the fiction rather
 * than a map id — "charter:session-hall" is a room the game never
 * renders — so nothing resolves it, and the shape is all there is to
 * hold it to.
 */
export const LOCATION_REF_PATTERN =
  /^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Whether an id follows the kebab-case convention. */
export function isContentId(id: string): boolean {
  return ID_PATTERN.test(id);
}

/** Whether a story node's `location` tag has the right shape. */
export function isLocationRef(ref: string): boolean {
  return LOCATION_REF_PATTERN.test(ref);
}

/**
 * Whether text is the signage voice: it has letters and none of them is
 * lower case. Tickers, Cordon announcements and the Locus shout, and
 * the proper-noun sweep leaves them alone.
 */
export function isSignage(text: string): boolean {
  return /\p{Uppercase_Letter}/u.test(text) && !/\p{Lowercase_Letter}/u.test(text);
}

/**
 * Whether a registry `name` is Title Case: every word begins with a
 * capital or a digit, apart from the minor words above and anything
 * after an apostrophe (`Tender's`, `Quill's`).
 */
export function isTitleCase(name: string): boolean {
  const words = name.split(/\s+/).filter((w) => w !== "");
  if (words.length === 0) return false;
  return words.every((word, index) => {
    // Strip surrounding punctuation and any bracketing, then take the
    // first segment of a hyphenate: "Wire-Grill" is checked on "Wire".
    const bare = word.replace(/^[^\p{Letter}\p{Number}]+/u, "");
    const head = bare.split(/[-—/]/)[0] ?? "";
    const letters = head.replace(/[^\p{Letter}\p{Number}].*$/u, "");
    if (letters === "") return true;
    if (index > 0 && TITLE_CASE_MINOR_WORDS.includes(letters.toLowerCase())) {
      return true;
    }
    return /^[\p{Uppercase_Letter}\p{Number}]/u.test(letters);
  });
}

/** One place content spelled a name a way the styleguide does not. */
export interface CasingIssue {
  /** The canonical spelling it should have used. */
  readonly canonical: string;
  /** What it actually wrote. */
  readonly found: string;
  /** Character offset of the match inside the text it was found in. */
  readonly index: number;
}

/**
 * Every proper noun in `text` written with the wrong capitals.
 *
 * Pure, so it is unit-tested against synthetic prose rather than only
 * against the shipped city. Fully-uppercase matches are signage and are
 * skipped; so is any match in a literal carrying one of the documented
 * exceptions.
 */
export function properNounIssues(
  text: string,
  nouns: readonly ProperNoun[] = PROPER_NOUNS,
  exceptions: readonly CasingException[] = CASING_EXCEPTIONS,
): CasingIssue[] {
  const excused = exceptions.some((e) => text.includes(e.phrase));
  if (excused) return [];
  const issues: CasingIssue[] = [];
  for (const noun of nouns) {
    // Word boundaries that also refuse a hyphen or a colon on either
    // side, so kebab ids ("greywater-steps") are never read as prose.
    const pattern = new RegExp(
      `(?<![\\p{Letter}\\p{Number}_:-])${escapeRegExp(noun.text)}(?![\\p{Letter}\\p{Number}_:-])`,
      "giu",
    );
    for (const match of text.matchAll(pattern)) {
      const found = match[0];
      if (found === noun.text) continue;
      if (isSignage(found)) continue;
      issues.push({ canonical: noun.text, found, index: match.index });
    }
  }
  return issues.sort((a, b) => a.index - b.index);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
