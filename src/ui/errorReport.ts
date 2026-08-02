import { currentAct } from "../data/acts";
import { GAME_STATE_VERSION, type GameState } from "../state";

/**
 * What a crash is allowed to say about itself.
 *
 * When the game falls over, the most useful thing a player can do is
 * paste a report somewhere. The most harmful thing the game can do is
 * decide on their behalf that the whole save — every name they typed,
 * every choice they made — goes on the clipboard with it.
 *
 * So the report is built in two halves. The default half is mechanical:
 * what threw, where, which save format, which chapter, how many of
 * things there are. It contains nothing the player wrote and nothing
 * that identifies them, which is what makes it safe to paste into a
 * public issue without reading it first. The second half is the save
 * itself, and it is only ever added when the player ticks the box.
 *
 * Everything that reaches the text goes through sanitizeDiagnosticText
 * on the way, because a stack trace is not a controlled string: it can
 * carry a base64 data URL out of an image handler, a full local file
 * path, or the origin the build was served from, and none of those help
 * anybody debug anything.
 */

/** Where the exception was caught. */
export type CrashOrigin = "mount" | "unmount" | "window" | "promise";

export interface CrashContext {
  error: unknown;
  /** The screen that was up: "game", "combat", "" when unknown. */
  screen: string;
  origin: CrashOrigin;
  /** The run in progress, or null when nothing was being played. */
  state: GameState | null;
  /** Whether that run made it into the recovery stash. */
  stashed: boolean;
  /** Wall-clock, as a timestamp; the caller passes Date.now(). */
  at: number;
  /** navigator.userAgent, when the caller has one. */
  userAgent?: string;
}

export interface ReportOptions {
  /**
   * The tick-box. Off means the report carries a summary of the run;
   * on means it carries the run.
   */
  includeSaveData: boolean;
}

export interface ReportFact {
  label: string;
  value: string;
}

export interface DiagnosticReport {
  /** One line, big, at the top of the screen. */
  headline: string;
  /** What the screen lists, and what the text repeats. */
  facts: ReportFact[];
  /** Exactly what the Copy button puts on the clipboard. */
  text: string;
}

/** Cap on the error message and stack together. */
const TRACE_LIMIT = 4000;
/** Cap on the serialized save, when the player asks for it. */
const SAVE_DATA_LIMIT = 200_000;

/* ------------------------------------------------------------------ *
 * Scrubbing
 * ------------------------------------------------------------------ */

/**
 * Text that is safe to put in front of somebody. Embedded images, long
 * opaque blobs, and the origin a file was served from all go; what is
 * left is the part of a stack trace that names code.
 */
export function sanitizeDiagnosticText(value: unknown, limit = TRACE_LIMIT): string {
  const text = typeof value === "string" ? value : String(value);
  const scrubbed = text
    // A data URL in a trace is somebody's portrait, inlined.
    .replace(/data:[a-z0-9/+.-]+;base64,[A-Za-z0-9+/=]*/gi, "[data-url]")
    // Anything else long and opaque: tokens, hashes, encoded payloads.
    .replace(/[A-Za-z0-9+/=]{80,}/g, "[long-value]")
    // Where the build lives is not a clue; which file threw is.
    .replace(/\b(?:https?|file|blob):\/\/[^\s)'"]*?\/(?=[^/\s)'"]*(?::\d|\)|$))/gi, "…/")
    // Home directories carry the player's name on most systems.
    .replace(/\/(?:Users|home)\/[^/\s)'"]+/g, "…")
    .replace(/[A-Z]:\\Users\\[^\\\s)'"]+/gi, "…");
  return scrubbed.length > limit
    ? `${scrubbed.slice(0, limit)}\n… (${scrubbed.length - limit} more characters)`
    : scrubbed;
}

/** What threw, as one line. Handles the things that are not Errors. */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const name = error.name || "Error";
    return sanitizeDiagnosticText(`${name}: ${error.message}`, 400);
  }
  if (typeof error === "object" && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") {
      return sanitizeDiagnosticText(message, 400);
    }
  }
  return sanitizeDiagnosticText(error, 400);
}

/** The trace, scrubbed, or "" when the thrown thing had none. */
export function describeStack(error: unknown): string {
  const stack = error instanceof Error ? error.stack : undefined;
  return typeof stack === "string" ? sanitizeDiagnosticText(stack) : "";
}

/* ------------------------------------------------------------------ *
 * The run, counted rather than quoted
 * ------------------------------------------------------------------ */

/**
 * What the state is, in numbers.
 *
 * Every value here is mechanical: an id the game authored, a count, a
 * version. Deliberately absent is everything the *player* authored —
 * the runner's name, save labels — which identifies them and diagnoses
 * nothing. A bug report should not be a thing you have to read through
 * before you dare send it.
 */
export function summarizeStateForReport(state: GameState | null): ReportFact[] {
  if (!state) return [{ label: "run", value: "none in progress" }];
  const flags = typeof state.flags === "object" && state.flags ? state.flags : {};
  const facts: ReportFact[] = [
    { label: "save format", value: `v${state.version} (build writes v${GAME_STATE_VERSION})` },
    { label: "background", value: state.player?.backgroundId ?? "unknown" },
    { label: "chapter", value: `act ${currentAct(flags)}` },
    { label: "location", value: state.location || "unknown" },
    { label: "difficulty", value: state.rules?.difficulty ?? "unknown" },
    { label: "hp", value: `${state.player?.hp ?? "?"}` },
    { label: "credits", value: `${state.credits ?? "?"}` },
    { label: "flags set", value: `${Object.keys(flags).length}` },
    { label: "inventory stacks", value: `${state.inventory?.stacks?.length ?? 0}` },
    { label: "party", value: `${state.party?.members?.length ?? 0} recruited` },
    { label: "shards", value: `${state.lore?.collected?.length ?? 0}` },
    { label: "pending encounter", value: state.pendingEncounterId ?? "none" },
    { label: "rng seed", value: `${state.rng?.seed ?? "?"}` },
  ];
  return facts;
}

/* ------------------------------------------------------------------ *
 * The report
 * ------------------------------------------------------------------ */

function timestamp(at: number): string {
  const date = new Date(at);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "unknown";
}

function originPhrase(origin: CrashOrigin): string {
  switch (origin) {
    case "mount":
      return "while opening a screen";
    case "unmount":
      return "while closing a screen";
    case "window":
      return "during play";
    case "promise":
      return "in a background task";
  }
}

/**
 * Everything the error screen shows and copies. Pure: the caller
 * supplies the clock and the user agent, so the same crash always
 * builds the same report.
 */
export function buildErrorReport(
  context: CrashContext,
  options: ReportOptions = { includeSaveData: false },
): DiagnosticReport {
  const headline = describeError(context.error);
  const stack = describeStack(context.error);

  const facts: ReportFact[] = [
    { label: "when", value: timestamp(context.at) },
    { label: "where", value: context.screen || "unknown screen" },
    { label: "caught", value: originPhrase(context.origin) },
    {
      label: "recovery stash",
      value: context.stashed
        ? "written — the run can be picked up from the main menu"
        : "not written",
    },
    // Every value the state contributed is scrubbed on the way in: an
    // id is normally a tame little string, and normally is not a
    // guarantee when a save can be hand-edited.
    ...summarizeStateForReport(context.state).map((fact) => ({
      label: fact.label,
      value: sanitizeDiagnosticText(fact.value, 200),
    })),
  ];
  if (context.userAgent) {
    facts.push({
      label: "browser",
      value: sanitizeDiagnosticText(context.userAgent, 300),
    });
  }

  const lines = [
    "Neon Fable — crash report",
    `error: ${headline}`,
    ...facts.map((fact) => `${fact.label}: ${fact.value}`),
  ];
  if (stack) lines.push("", "stack:", stack);

  if (options.includeSaveData) {
    lines.push("", "save data:", serializeStateForReport(context.state));
  } else {
    lines.push(
      "",
      "save data: not included (tick “Include save data” to add it)",
    );
  }

  return { headline, facts, text: lines.join("\n") };
}

/**
 * The save, for a report the player has asked to include it in. Still
 * scrubbed — a state that somehow holds a data URL should not smuggle
 * one out through the one path a player did consent to.
 */
function serializeStateForReport(state: GameState | null): string {
  if (!state) return "none in progress";
  let json: string;
  try {
    json = JSON.stringify(state);
  } catch {
    return "could not be serialized";
  }
  return sanitizeDiagnosticText(json, SAVE_DATA_LIMIT);
}
