import { describe, expect, it, vi } from "vitest";
import { fixtureAppearance } from "../character/testSupport";
import { endings } from "../data/endings";
import { epilogueThreads, epilogueVignettes } from "../data/epilogues";
import { sectionRank } from "../narrative/epilogue";
import {
  META_PROGRESS_KEY,
  META_PROGRESS_VERSION,
  clampMetaProgress,
  deriveCodex,
  deriveEpilogueCodex,
  emptyMetaProgress,
  loadMetaProgress,
  mergeMetaProgress,
  migrateMetaProgress,
  parseMetaProgress,
  recordCompletion,
  recordCompletionToStorage,
  saveMetaProgress,
  serializeMetaProgress,
  type MetaProgress,
} from "./meta";
import { createMemoryStorage } from "./save";

function sampleMeta(overrides: Partial<MetaProgress> = {}): MetaProgress {
  return {
    endingsSeen: ["ending-freehold"],
    epiloguesSeen: ["city-freehold", "undercroft-severed"],
    shardsSeen: [],
    completions: 1,
    ngPlusUnlocked: true,
    legacyItemIds: ["wpn-arc-lash", "cyb-warden-optics"],
    legacyAppearance: fixtureAppearance({
      skinTone: "deep-umber",
      hairStyle: "mohawk",
      hairColor: "synth-violet",
    }),
    ...overrides,
  };
}

describe("meta-progress serialization", () => {
  it("round-trips through serialize and parse", () => {
    const meta = sampleMeta();
    expect(parseMetaProgress(serializeMetaProgress(meta))).toEqual(meta);
  });

  it("stamps the current version on serialization", () => {
    const raw = JSON.parse(serializeMetaProgress(emptyMetaProgress()));
    expect(raw.version).toBe(META_PROGRESS_VERSION);
  });

  it("parses null and malformed JSON to an empty record", () => {
    expect(parseMetaProgress(null)).toEqual(emptyMetaProgress());
    expect(parseMetaProgress("{nope")).toEqual(emptyMetaProgress());
    expect(parseMetaProgress('"just a string"')).toEqual(emptyMetaProgress());
  });

  it("migrates unknown or future payloads field-tolerantly", () => {
    const migrated = migrateMetaProgress({
      version: 99,
      endingsSeen: ["ending-ghost", 7, "ending-ghost", ""],
      epiloguesSeen: "not-a-list",
      completions: -3,
      ngPlusUnlocked: "yes",
      legacyItemIds: [null, "wpn-arc-lash"],
      legacyAppearance: "not-a-look",
    });
    expect(migrated).toEqual({
      endingsSeen: ["ending-ghost"],
      epiloguesSeen: [],
      shardsSeen: [],
      completions: 0,
      ngPlusUnlocked: false,
      legacyItemIds: ["wpn-arc-lash"],
      legacyAppearance: null,
    });
  });

  it("parses records from before the appearance carry-over to a null look", () => {
    // Verbatim v1 payload as written before legacyAppearance existed.
    const meta = parseMetaProgress(
      JSON.stringify({
        version: 1,
        endingsSeen: ["ending-freehold"],
        epiloguesSeen: ["city-freehold"],
        completions: 1,
        ngPlusUnlocked: true,
        legacyItemIds: ["wpn-arc-lash"],
      }),
    );
    expect(meta.legacyAppearance).toBeNull();
    expect(meta.endingsSeen).toEqual(["ending-freehold"]);
  });

  it("clamps a stored look to null when any field is missing or unknown", () => {
    const partial = clampMetaProgress({
      legacyAppearance: { skinTone: "porcelain" },
    });
    expect(partial.legacyAppearance).toBeNull();
    const retired = clampMetaProgress({
      legacyAppearance: fixtureAppearance({ hairStyle: "retired-style" }),
    });
    expect(retired.legacyAppearance).toBeNull();
    const valid = clampMetaProgress({
      legacyAppearance: fixtureAppearance({ headwear: "cap" }),
    });
    expect(valid.legacyAppearance).toEqual(fixtureAppearance({ headwear: "cap" }));
  });

  it("clamp derives the NG+ unlock from a completed run", () => {
    const meta = clampMetaProgress({ completions: 2, ngPlusUnlocked: false });
    expect(meta.ngPlusUnlocked).toBe(true);
  });
});

describe("meta-progress persistence", () => {
  it("saves and loads through an injectable storage", () => {
    const storage = createMemoryStorage();
    const meta = sampleMeta();
    saveMetaProgress(meta, storage);
    expect(loadMetaProgress(storage)).toEqual(meta);
  });

  it("uses a key separate from save slots and settings", () => {
    expect(META_PROGRESS_KEY).toBe("neon-fable:meta");
  });

  it("loading never writes to storage", () => {
    const storage = createMemoryStorage();
    const setItem = vi.spyOn(storage, "setItem");
    loadMetaProgress(storage);
    expect(setItem).not.toHaveBeenCalled();
  });

  it("survives null and throwing storage", () => {
    expect(loadMetaProgress(null)).toEqual(emptyMetaProgress());
    expect(() => saveMetaProgress(sampleMeta(), null)).not.toThrow();
    const broken = {
      getItem: () => {
        throw new Error("privacy mode");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(loadMetaProgress(broken)).toEqual(emptyMetaProgress());
    expect(() => saveMetaProgress(sampleMeta(), broken)).not.toThrow();
  });
});

describe("recording completions", () => {
  const completion = {
    endingId: "ending-commons",
    epilogueIds: ["city-commons", "flick-friend"],
    legacyItemIds: ["wpn-stun-baton"],
    legacyAppearance: fixtureAppearance({ headwear: "hood" }),
  };

  it("adds the ending, counts the run, and unlocks NG+", () => {
    const meta = recordCompletion(emptyMetaProgress(), completion);
    expect(meta.endingsSeen).toEqual(["ending-commons"]);
    expect(meta.epiloguesSeen).toEqual(["city-commons", "flick-friend"]);
    expect(meta.completions).toBe(1);
    expect(meta.ngPlusUnlocked).toBe(true);
    expect(meta.legacyItemIds).toEqual(["wpn-stun-baton"]);
    expect(meta.legacyAppearance).toEqual(fixtureAppearance({ headwear: "hood" }));
  });

  it("records a repeated ending once but still counts the run", () => {
    const once = recordCompletion(emptyMetaProgress(), completion);
    const twice = recordCompletion(once, {
      ...completion,
      epilogueIds: ["city-commons", "hex-shrine"],
    });
    expect(twice.endingsSeen).toEqual(["ending-commons"]);
    expect(twice.epiloguesSeen).toEqual([
      "city-commons",
      "flick-friend",
      "hex-shrine",
    ]);
    expect(twice.completions).toBe(2);
  });

  it("replaces the legacy candidates and look with the newest run's", () => {
    const first = recordCompletion(emptyMetaProgress(), completion);
    const second = recordCompletion(first, {
      ...completion,
      legacyItemIds: ["out-spire-suit", "cyb-optic-suite"],
      legacyAppearance: fixtureAppearance({ hairColor: "silver" }),
    });
    expect(second.legacyItemIds).toEqual(["out-spire-suit", "cyb-optic-suite"]);
    expect(second.legacyAppearance).toEqual(
      fixtureAppearance({ hairColor: "silver" }),
    );
  });

  it("recordCompletionToStorage is the explicit write path", () => {
    const storage = createMemoryStorage();
    const returned = recordCompletionToStorage(completion, storage);
    expect(loadMetaProgress(storage)).toEqual(returned);
    expect(returned.completions).toBe(1);
    // A second completion merges on top of what is stored.
    recordCompletionToStorage(
      { ...completion, endingId: "ending-ghost" },
      storage,
    );
    const stored = loadMetaProgress(storage);
    expect(stored.endingsSeen).toEqual(["ending-commons", "ending-ghost"]);
    expect(stored.completions).toBe(2);
  });
});

describe("merging meta-progress", () => {
  it("unions discoveries, keeps the higher count, prefers the newer legacy", () => {
    const base = sampleMeta();
    const next = sampleMeta({
      endingsSeen: ["ending-freehold", "ending-regency"],
      epiloguesSeen: ["voss-regent"],
      completions: 3,
      legacyItemIds: ["wpn-rail-spitter"],
    });
    const merged = mergeMetaProgress(base, next);
    expect(merged.endingsSeen).toEqual(["ending-freehold", "ending-regency"]);
    expect(merged.epiloguesSeen).toEqual([
      "city-freehold",
      "undercroft-severed",
      "voss-regent",
    ]);
    expect(merged.completions).toBe(3);
    expect(merged.legacyItemIds).toEqual(["wpn-rail-spitter"]);
  });

  it("keeps the base legacy when the newer record has none", () => {
    const merged = mergeMetaProgress(
      sampleMeta(),
      sampleMeta({ legacyItemIds: [], legacyAppearance: null }),
    );
    expect(merged.legacyItemIds).toEqual(["wpn-arc-lash", "cyb-warden-optics"]);
    expect(merged.legacyAppearance).toEqual(sampleMeta().legacyAppearance);
  });

  it("the newer record's look wins when both sides have one", () => {
    const merged = mergeMetaProgress(
      sampleMeta(),
      sampleMeta({ legacyAppearance: fixtureAppearance({ eyes: "cyber-band" }) }),
    );
    expect(merged.legacyAppearance).toEqual(
      fixtureAppearance({ eyes: "cyber-band" }),
    );
  });
});

describe("codex derivation", () => {
  it("locks everything with no progress and counts the finals", () => {
    const codex = deriveCodex(endings, emptyMetaProgress());
    const finals = endings.filter((e) => e.final === true);
    expect(codex.total).toBe(finals.length);
    expect(codex.total).toBeGreaterThanOrEqual(4);
    expect(codex.found).toBe(0);
    for (const entry of codex.entries) {
      expect(entry.discovered).toBe(false);
      expect(entry.title).toBeNull();
      expect(entry.summary).toBeNull();
      expect(entry.hint.length).toBeGreaterThan(0);
    }
  });

  it("excludes chapter endings from the codex", () => {
    const codex = deriveCodex(endings, emptyMetaProgress());
    const ids = codex.entries.map((entry) => entry.id);
    expect(ids).not.toContain("act1-court");
    expect(ids).not.toContain("act2-charter");
  });

  it("unlocks exactly the recorded endings", () => {
    const meta = sampleMeta({ endingsSeen: ["ending-freehold"] });
    const codex = deriveCodex(endings, meta);
    expect(codex.found).toBe(1);
    const found = codex.entries.find((entry) => entry.id === "ending-freehold");
    expect(found?.discovered).toBe(true);
    expect(found?.title).toBe("The Freehold Dark");
    expect(found?.summary).toBeTruthy();
    const locked = codex.entries.find((entry) => entry.id === "ending-ghost");
    expect(locked?.discovered).toBe(false);
    expect(locked?.title).toBeNull();
  });

  it("every final ending authors a hint and summary that leak no epilogue text", () => {
    for (const ending of endings.filter((e) => e.final === true)) {
      expect(ending.hint, ending.id).toBeTruthy();
      expect(ending.summary, ending.id).toBeTruthy();
      // The hint must tease, not retell: no sentence of it may appear in
      // the ending's paragraphs, and it must not contain the title.
      const body = ending.paragraphs.join(" ");
      expect(body.includes(ending.hint!)).toBe(false);
      expect(
        ending.hint!.toLowerCase().includes(ending.title.toLowerCase()),
      ).toBe(false);
    }
  });
});

describe("epilogue codex derivation", () => {
  const codexOf = (meta: MetaProgress) =>
    deriveEpilogueCodex(epilogueThreads, epilogueVignettes, meta);

  it("counts every authored thread and variant, with nothing found", () => {
    const codex = codexOf(emptyMetaProgress());
    expect(codex.threads).toBe(epilogueThreads.length);
    expect(codex.total).toBe(epilogueVignettes.length);
    expect(codex.found).toBe(0);
    expect(codex.threadsFound).toBe(0);
    for (const entry of codex.entries) {
      expect(entry.title, entry.subject).toBeNull();
      expect(entry.hint.length, entry.subject).toBeGreaterThan(0);
      expect(entry.total, entry.subject).toBeGreaterThan(0);
    }
  });

  it("picks up threads the content adds, without a list of its own", () => {
    // Counting is derived, so the v2 threads are in it by construction.
    const codex = codexOf(emptyMetaProgress());
    const subjects = codex.entries.map((entry) => entry.subject);
    for (const subject of ["courier", "ring", "auric", "court", "market"]) {
      expect(subjects, subject).toContain(subject);
    }
    const courier = codex.entries.find((e) => e.subject === "courier")!;
    expect(courier.total).toBe(
      epilogueVignettes.filter((v) => v.subject === "courier").length,
    );
  });

  it("lists threads in the epilogue's own running order", () => {
    const ranks = codexOf(emptyMetaProgress()).entries.map((entry) =>
      sectionRank(entry.section),
    );
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  });

  it("unlocks a thread on its first variant and tallies the rest", () => {
    const codex = codexOf(
      sampleMeta({ epiloguesSeen: ["ring-broken", "ring-partner"] }),
    );
    const ring = codex.entries.find((entry) => entry.subject === "ring")!;
    expect(ring.title).toBe("The Longshore");
    expect(ring.found).toBe(2);
    expect(codex.found).toBe(2);
    expect(codex.threadsFound).toBe(1);
    // Everything else stays locked to its hint.
    const courier = codex.entries.find((e) => e.subject === "courier")!;
    expect(courier.title).toBeNull();
    expect(courier.found).toBe(0);
  });

  it("ignores recorded ids that no longer name a variant", () => {
    const codex = codexOf(
      sampleMeta({ epiloguesSeen: ["retired-variant", "ring-broken"] }),
    );
    expect(codex.found).toBe(1);
    for (const entry of codex.entries) {
      expect(entry.found, entry.subject).toBeLessThanOrEqual(entry.total);
    }
  });

  it("keeps every locked hint free of the outcome it hides", () => {
    for (const entry of codexOf(emptyMetaProgress()).entries) {
      const thread = epilogueThreads.find((t) => t.subject === entry.subject)!;
      expect(
        entry.hint.toLowerCase().includes(thread.title.toLowerCase()),
        entry.subject,
      ).toBe(false);
      for (const variant of epilogueVignettes.filter(
        (v) => v.subject === entry.subject,
      )) {
        expect(variant.text.includes(entry.hint), variant.id).toBe(false);
      }
    }
  });
});
