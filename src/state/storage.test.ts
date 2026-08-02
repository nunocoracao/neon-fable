import { describe, expect, it, vi } from "vitest";
import {
  GENERIC_QUOTA_GUIDANCE,
  StorageWriteError,
  createMemoryStorage,
  formatBytes,
  isQuotaError,
  quotaGuidance,
  removeItem,
  scratchKey,
  storedBytes,
  writeItem,
} from "./storage";
import {
  createAmnesiacStorage,
  createBudgetStorage,
  createReadOnlyStorage,
  quotaError,
} from "./testSupport";

/**
 * The guarded write path. Every test here is about the same promise:
 * a write that cannot happen leaves the key holding exactly what it
 * held before, and says so out loud.
 */

describe("recognizing a full storage", () => {
  it("accepts every dialect of quota browsers speak", () => {
    expect(isQuotaError(quotaError())).toBe(true);
    expect(isQuotaError({ name: "NS_ERROR_DOM_QUOTA_REACHED" })).toBe(true);
    expect(isQuotaError({ code: 22 })).toBe(true);
    expect(isQuotaError({ code: 1014 })).toBe(true);
    expect(isQuotaError(new Error("exceeded the quota"))).toBe(true);
  });

  it("does not mistake an ordinary failure for a full disk", () => {
    expect(isQuotaError(new Error("the operation is insecure"))).toBe(false);
    expect(isQuotaError(null)).toBe(false);
    expect(isQuotaError("quota")).toBe(false);
  });
});

describe("writing", () => {
  it("writes, and leaves no scratch key behind", () => {
    const storage = createMemoryStorage();
    writeItem(storage, "k", "value");
    expect(storage.getItem("k")).toBe("value");
    expect(storage.getItem(scratchKey("k"))).toBeNull();
  });

  it("keeps the previous value when the new one does not fit", () => {
    // Room for the old value and its key, and nothing like enough for
    // the new one.
    const storage = createBudgetStorage(200);
    storage.setItem("neon-fable:save:slot1", "the last good save");

    expect(() =>
      writeItem(storage, "neon-fable:save:slot1", "x".repeat(500)),
    ).toThrow(StorageWriteError);
    expect(storage.getItem("neon-fable:save:slot1")).toBe("the last good save");
  });

  it("fails on quota with a code and a sentence naming what to delete", () => {
    const storage = createBudgetStorage(200);
    storage.setItem("neon-fable:save:slot1", "the last good save");

    let caught: StorageWriteError | null = null;
    try {
      writeItem(storage, "neon-fable:save:slot1", "x".repeat(500), {
        guidance: () =>
          quotaGuidance([
            { key: "a", label: "Slot 2", bytes: 90 * 1024 },
            { key: "b", label: "Slot 2's backup", bytes: 40 * 1024 },
          ]),
      });
    } catch (error) {
      caught = error as StorageWriteError;
    }

    expect(caught?.code).toBe("quota");
    expect(caught?.key).toBe("neon-fable:save:slot1");
    expect(caught?.guidance).toMatch(/Slot 2 \(90 KB\)/);
    expect(caught?.message).toMatch(/storage is full/i);
  });

  it("still writes when the probe does not fit but the overwrite does", () => {
    // Exactly enough room for one copy of the payload and no more, so
    // the probe's second copy fails and the overwrite succeeds.
    const key = "k";
    const value = "y".repeat(100);
    const storage = createBudgetStorage((key.length + value.length) * 2);
    storage.setItem(key, "z".repeat(100));

    writeItem(storage, key, value);
    expect(storage.getItem(key)).toBe(value);
  });

  it("reports an unavailable storage as unavailable, not as full", () => {
    const storage = createReadOnlyStorage();
    let caught: StorageWriteError | null = null;
    try {
      writeItem(storage, "k", "v");
    } catch (error) {
      caught = error as StorageWriteError;
    }
    expect(caught?.code).toBe("unavailable");
    expect(caught?.guidance).toMatch(/private browsing/i);
  });

  it("refuses to call a write that vanished a success", () => {
    expect(() => writeItem(createAmnesiacStorage(), "k", "v")).toThrow(
      StorageWriteError,
    );
  });

  it("does not let a broken guidance thunk swallow the error", () => {
    const storage = createBudgetStorage(50);
    expect(() =>
      writeItem(storage, "k", "x".repeat(500), {
        guidance: () => {
          throw new Error("reading the slots failed too");
        },
      }),
    ).toThrow(StorageWriteError);
  });

  it("clears a scratch key a crashed write left behind", () => {
    const storage = createMemoryStorage();
    storage.setItem(scratchKey("k"), "half a save");
    writeItem(storage, "k", "whole save");
    expect(storage.getItem(scratchKey("k"))).toBeNull();
  });

  it("removes a key and its shadow together", () => {
    const storage = createMemoryStorage();
    storage.setItem("k", "v");
    storage.setItem(scratchKey("k"), "leftover");
    removeItem(storage, "k");
    expect(storage.getItem("k")).toBeNull();
    expect(storage.getItem(scratchKey("k"))).toBeNull();
  });

  it("survives a storage that throws on every operation", () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error("no");
      }),
      setItem: vi.fn(() => {
        throw new Error("no");
      }),
      removeItem: vi.fn(() => {
        throw new Error("no");
      }),
    };
    expect(() => writeItem(storage, "k", "v")).toThrow(StorageWriteError);
    expect(() => removeItem(storage, "k")).not.toThrow();
  });
});

describe("guidance", () => {
  it("names the biggest three, largest first", () => {
    const sentence = quotaGuidance([
      { key: "a", label: "Slot 1", bytes: 10 * 1024 },
      { key: "b", label: "Slot 2", bytes: 90 * 1024 },
      { key: "c", label: "Slot 3", bytes: 50 * 1024 },
      { key: "d", label: "Autosave", bytes: 70 * 1024 },
    ]);
    expect(sentence).toMatch(/Slot 2 \(90 KB\), Autosave \(70 KB\), Slot 3 \(50 KB\)/);
    expect(sentence).not.toMatch(/Slot 1/);
  });

  it("falls back to the generic sentence when there is nothing to name", () => {
    expect(quotaGuidance([])).toBe(GENERIC_QUOTA_GUIDANCE);
    expect(quotaGuidance([{ key: "a", label: "Slot 1", bytes: 0 }])).toBe(
      GENERIC_QUOTA_GUIDANCE,
    );
  });

  it("sizes stored strings the way storage charges for them", () => {
    expect(storedBytes(null)).toBe(0);
    expect(storedBytes("abcd")).toBe(8);
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(90 * 1024)).toBe("90 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});
