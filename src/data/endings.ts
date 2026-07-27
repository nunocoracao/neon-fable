/**
 * Chapter-ending content. An end effect whose endingId resolves here is a
 * chapter outcome: the UI shows the ending's epilogue on a chapter-end
 * screen instead of a toast. Ending ids double as the values a future act
 * can read back off the outcome flags the ending nodes set.
 */
export interface ChapterEnding {
  id: string;
  title: string;
  /** Epilogue paragraphs shown on the chapter-end screen. */
  paragraphs: string[];
}

export const endings: ChapterEnding[] = [
  {
    id: "act1-court",
    title: "The Water Stands Still",
    paragraphs: [
      "The charges cough once, deep under Greywater Steps, and the " +
        "Undertow manifold dies mid-breath. On Ledge Nine the black water " +
        "stops climbing for the first time in a week, and somebody starts " +
        "ringing a salvaged bell like it's a holiday.",
      "Matron Ferrow doesn't thank you. She hands you a cup of terrace " +
        "tea, which on the Steps is the same thing said properly. Auric " +
        "will come back with lawyers, then with worse — but tonight the " +
        "Cistern Court holds its ground, and it counts you among its own.",
      "Somewhere above, in a glass office that smells of salt-plants, a " +
        "director quietly deletes your name from a payroll file and moves " +
        "it to a different list.",
    ],
  },
  {
    id: "act1-voss",
    title: "A Signature in Grey Ink",
    paragraphs: [
      "Voss reads the ledger twice, then feeds it to a shredder that " +
        "probably cost more than your building. \"Postponed pending " +
        "review,\" they say, the way other people say checkmate. By " +
        "morning the Undertow schedule is an internal matter, and internal " +
        "matters never drown anyone officially.",
      "Your account settles before you reach the street. The writ in your " +
        "pocket opens doors in the Auric Spire that used to open only for " +
        "people who'd never been rained on.",
      "Down on the Steps, the Cistern Court posts your description next " +
        "to the names of the drowned. The Sprawl keeps every receipt — but " +
        "so, now, do you.",
    ],
  },
  {
    id: "act1-broadcast",
    title: "Every Screen in the Sprawl",
    paragraphs: [
      "The Relay Crown drinks the ledger and sings it back at the city. " +
        "Noodle-stall screens, tram windows, the Glasshouse's own lobby " +
        "wall: the Undertow schedule, line by line, with the flush dates " +
        "glowing like wounds.",
      "By dawn the Sprawl is too loud to flood anything quietly. Auric " +
        "issues three denials and a warrant with your gait-print on it. " +
        "Sable's people won't meet your eyes; Ferrow's people don't know " +
        "whether to toast you or bill you.",
      "You did it owing nothing to anyone. That's the freest anyone gets " +
        "in the Meridian Sprawl — and the most alone.",
    ],
  },
];

const endingsById = new Map(endings.map((ending) => [ending.id, ending]));

export function getEnding(id: string): ChapterEnding | undefined {
  return endingsById.get(id);
}
