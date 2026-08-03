import type { AuditCode } from "../narrative/audit/types";

/**
 * Waivers: the narrative audit's findings that a human has looked at and
 * decided to keep.
 *
 * The audit fails on errors and prints its warnings, which leaves
 * exactly one honest way to ship a finding: name it here and say why in
 * a sentence somebody would accept in review. A waiver is about the
 * story rather than about the checker, so it lives with the story data.
 *
 * Two rules for adding one:
 *
 *  - **Say what makes it deliberate**, not what it is. "Foreshadowing"
 *    is a reason; "known issue" is a shrug.
 *  - **Waive the narrowest thing that works.** A waiver names a code
 *    *and* the subjects it covers, so silencing one flag never silences
 *    a whole check. There is deliberately no way to waive a code
 *    outright, and a subject that stops matching anything is reported
 *    as a stale waiver — a fixed problem cannot leave a permanent hole
 *    behind it.
 */
export interface AuditWaiver {
  code: AuditCode;
  /** The ids, flag keys, or node ids this waiver covers. */
  subjects: readonly string[];
  /** Why these are deliberate. Written for a reviewer, not a log. */
  why: string;
}

export const AUDIT_WAIVERS: readonly AuditWaiver[] = [
  // ------------------------------------------------------------------
  // Gates on flags nothing writes yet
  // ------------------------------------------------------------------
  {
    code: "unwritten-flag",
    subjects: ["static-overload", "static-peak"],
    why:
      "The Static epilogue thread was authored ahead of the meter that " +
      "writes it (see the note over STATIC_EPILOGUE_FLAGS in " +
      "./epilogues.ts). A missing flag reads as 0 and not-set, so the " +
      "thread is simply absent from an epilogue until the meter lands — " +
      "the gate is correct today and correct after.",
  },

  // ------------------------------------------------------------------
  // Nodes whose every choice is gated
  //
  // Each of these is a scene whose gates are exhaustive: some earlier
  // beat every run passes through guarantees that one of them opens.
  // The argument is written out because it is the only thing standing
  // between the scene and a dialogue with no options in it.
  // ------------------------------------------------------------------
  {
    code: "all-gated-node",
    subjects: ["filament-door"],
    why:
      "The cover charge and the known face are exact complements — " +
      "pay-cover asks for intro-outcome unset, known-face asks for it " +
      "set — so one of the two is open to every run at every moment, " +
      "whatever the background and whatever is in the bag.",
  },
  {
    code: "all-gated-node",
    subjects: ["bar-floor"],
    why:
      "Both chairs read sable-terms, which every one of the three " +
      "choices on the intro's first node writes; the game opens on that " +
      "node, so no run can stand in the Filament without having " +
      "answered Sable. Afterwards sit-after covers it on intro-outcome.",
  },
  {
    code: "all-gated-node",
    subjects: ["a2-lone-safehouse"],
    why:
      "Patch's cellar is only reached on act1-outcome \"broadcast\", and " +
      "every route to the Relay Crown either required act1-side " +
      "\"open\" or wrote betrayed-court / betrayed-voss on the way past " +
      "(see a1-chainwell and a1-voss-strike). The three move-out " +
      "choices cover exactly those three states.",
  },
  {
    code: "all-gated-node",
    subjects: ["a2-core-console"],
    why:
      "The three ally routes and the bare-handed one are complements: " +
      "sever-hand asks for none of ally-voss, ally-cistern-court, or " +
      "hex-exchange, so a runner who has no patron and left the spool " +
      "in the wreck still has the governor bank and a pair of hands.",
  },
  {
    code: "all-gated-node",
    subjects: ["a3-keys"],
    why:
      "Every disposition reads one of the four flags Act 2's endings " +
      "write — a2-end-charter, a2-end-takeover, and a2-end-severance " +
      "each set exactly one — and the crown ring is behind " +
      "act2-complete. A run that reaches the keys is holding one.",
  },

  // ------------------------------------------------------------------
  // Flags written and not read
  //
  // Grouped by what the beat was recording, because the reason is the
  // same inside a group and different between them. None of these is a
  // broken join: every gate in the game reads a flag something writes
  // (the audit would say otherwise), so these are the other direction —
  // the story keeping a record ahead of the content that will read it.
  // ------------------------------------------------------------------
  {
    code: "unread-flag",
    subjects: [
      "door-entry",
      "scout-outcome",
      "gate-route",
      "gate2-route",
      "gate3-route",
      "crown-route",
      "under-waterline-entry",
      "exec-known",
      "exec-forced",
      "exec-quiet",
    ],
    why:
      "Approach ledger: which way a run got through a door it was " +
      "always going to get through. Authored as one flag per threshold " +
      "so an epilogue or a later scene can recognise a runner who " +
      "talked their way in from one who cut the hinges, and deliberately " +
      "not gated on today — the beat behind the door has to read the " +
      "same for everyone who reached it.",
  },
  {
    code: "unread-flag",
    subjects: [
      "back-shelf-known",
      "market-known",
      "ledger-known",
      "bench-known",
      "quays-known",
      "foreman-found",
      "sill-met",
      "vesper-met",
      "sill-declined",
      "vesper-declined",
      "last-mile-lead",
      "last-mile-crew",
    ],
    why:
      "Introductions the city keeps: you have stood at this counter, " +
      "you have met this person, you turned them down. The scenes " +
      "themselves gate on party membership and on their own stage " +
      "flags; these are the record of the meeting for the epilogue and " +
      "codex work the side chains were written toward.",
  },
  {
    code: "unread-flag",
    subjects: [
      "echo-noticed",
      "market-theft",
      "job-accepted",
      "only-copy",
      "lin-favor",
      "steps-goodwill",
      "charges-marked",
      "siphon-pulled",
      "deck-scouted",
      "filament-dark",
      "collectors-paid",
      "cyclers-stalled",
      "crawler-skipped",
      "auric-patron",
      "ferrow-blessing",
      "crown-remembered",
      "trust-bought",
      "trust-paid",
      "hex-lattice",
      "a3-crews",
      "a3-flick",
      "exec-ledger",
      "exec-minutes",
      "exec-lockbox",
      "warden-primed",
      "warden-woken",
      "warden-down",
      "under-waterline-side",
    ],
    why:
      "The acts' own working notes: a favour banked, a charge set, a " +
      "wreck searched, a price paid. Each is written where it happens so " +
      "that a run's texture survives into content that has not been " +
      "written yet; none of them is read today, and none of them is a " +
      "gate somebody forgot to hook up — every gate in the game reads a " +
      "flag something writes.",
  },
];

/** The waiver covering a finding, if one does. */
export function findWaiver(
  code: AuditCode,
  subject: string | undefined,
): AuditWaiver | undefined {
  if (subject == null) return undefined;
  return AUDIT_WAIVERS.find(
    (waiver) => waiver.code === code && waiver.subjects.includes(subject),
  );
}

/** Every (code, subject) pair the waiver list claims to cover. */
export function waivedPairs(): { code: AuditCode; subject: string }[] {
  return AUDIT_WAIVERS.flatMap((waiver) =>
    waiver.subjects.map((subject) => ({ code: waiver.code, subject })),
  );
}
