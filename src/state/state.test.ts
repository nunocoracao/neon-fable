import { describe, expect, it } from "vitest";
import { createNewGameState } from "./index";

describe("createNewGameState", () => {
  it("creates a versioned, JSON-serializable state", () => {
    const state = createNewGameState();
    expect(state.version).toBe(1);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});
