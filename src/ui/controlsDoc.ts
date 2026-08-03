/**
 * The key map, as the player guide prints it.
 *
 * `docs/PLAYER_GUIDE.md` documents every key the game answers, and a
 * manual that disagrees with the game is worse than no manual: a player
 * who presses the key it names and gets nothing has been lied to by the
 * only thing they had to go on. So the guide does not *write down* the
 * key map — it carries a generated block, and this module is the
 * generator. One table (./controlsModel.ts), one string table
 * (./strings.ts), three readers: the Controls screen, the Settings
 * panel, and the guide.
 *
 * Nothing here touches the DOM. It is markdown assembly over the same
 * data ./controlsScreen.ts renders as a definition list, which is what
 * lets `controlsDoc.test.ts` fail the suite when the two drift —
 * adding a key to a screen without regenerating the block is caught by
 * the same commit that would have shipped the stale manual.
 *
 * To regenerate after a key changes: run the suite, and paste the block
 * the failing test prints between the markers below.
 */
import { CONTROL_GROUPS } from "./controlsModel";
import { plain } from "./strings";

/** Opens the generated region in the guide. */
export const CONTROLS_DOC_BEGIN = "<!-- BEGIN GENERATED CONTROLS -->";
/** Closes it. */
export const CONTROLS_DOC_END = "<!-- END GENERATED CONTROLS -->";

/** A markdown table cell: pipes would end the column early. */
function cell(text: string): string {
  return text.replace(/\|/g, "\\|");
}

/**
 * The whole key map as markdown: one `###` section per group, each a
 * two-column table of keys and what they do. Group order, binding
 * order, and every word come from the table — this function chooses
 * punctuation and nothing else.
 */
export function controlsMarkdown(): string {
  const lines: string[] = [];
  for (const group of CONTROL_GROUPS) {
    lines.push(`### ${plain(group.title)}`, "");
    if (group.blurb !== null) {
      lines.push(plain(group.blurb), "");
    }
    lines.push("| Keys | What it does |", "| --- | --- |");
    for (const binding of group.bindings) {
      lines.push(
        `| \`${cell(plain(binding.keys))}\` | ${cell(plain(binding.what))} |`,
      );
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

/** The generated block, markers included, ready to paste into the guide. */
export function controlsDocBlock(): string {
  return [CONTROLS_DOC_BEGIN, "", controlsMarkdown(), "", CONTROLS_DOC_END].join(
    "\n",
  );
}

/**
 * The generated region of a guide, markers included, or null when the
 * markers are missing or out of order — which is itself a failure the
 * test reports, since a guide with no generated block has quietly
 * stopped being checked.
 */
export function extractControlsBlock(markdown: string): string | null {
  const start = markdown.indexOf(CONTROLS_DOC_BEGIN);
  const end = markdown.indexOf(CONTROLS_DOC_END);
  if (start < 0 || end < 0 || end < start) return null;
  return markdown.slice(start, end + CONTROLS_DOC_END.length);
}
