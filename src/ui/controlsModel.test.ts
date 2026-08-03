import { describe, expect, it } from "vitest";
import { CONTROL_GROUPS, allControlBindings } from "./controlsModel";
import { STRINGS, isStringKey } from "./strings";

/**
 * The key map has to be complete and it has to be readable, and the
 * only way to keep it either is to make the table the place a key is
 * declared. These are the rules that make a half-written row fail the
 * suite rather than ship as a blank line in the reference.
 */

describe("the control map", () => {
  it("groups the keys by where the player is standing", () => {
    expect(CONTROL_GROUPS.length).toBeGreaterThan(3);
    for (const group of CONTROL_GROUPS) {
      expect(group.bindings.length, group.id).toBeGreaterThan(0);
    }
  });

  it("covers every activity the game has", () => {
    // Not a stylistic list: each of these is a thing a player does, and
    // a group missing from here is an activity with no documented way
    // through it.
    const ids = CONTROL_GROUPS.map((group) => group.id);
    expect(ids).toContain("panels");
    expect(ids).toContain("explore");
    expect(ids).toContain("dialogue");
    expect(ids).toContain("combat");
    expect(ids).toContain("breach");
    expect(ids).toContain("create");
  });

  it("gives every row keys and a line saying what they do", () => {
    for (const binding of allControlBindings()) {
      expect(isStringKey(binding.keys), binding.id).toBe(true);
      expect(isStringKey(binding.what), binding.id).toBe(true);
      expect(STRINGS[binding.keys].trim().length, binding.id).toBeGreaterThan(0);
      expect(STRINGS[binding.what].trim().length, binding.id).toBeGreaterThan(4);
    }
  });

  it("names every group and every blurb it declares", () => {
    for (const group of CONTROL_GROUPS) {
      expect(isStringKey(group.title), group.id).toBe(true);
      if (group.blurb !== null) {
        expect(isStringKey(group.blurb), group.id).toBe(true);
      }
    }
  });

  it("reads its ids as one namespace, so no row can shadow another", () => {
    const ids = allControlBindings().map((binding) => binding.id);
    expect(new Set(ids).size).toBe(ids.length);
    const groupIds = CONTROL_GROUPS.map((group) => group.id);
    expect(new Set(groupIds).size).toBe(groupIds.length);
  });

  it("documents the keys the street actually answers", () => {
    // The exploration keys are the ones the pass added, and a reference
    // that forgot them would be the same gap in a different place.
    const explore = CONTROL_GROUPS.find((group) => group.id === "explore");
    const said = (explore?.bindings ?? [])
      .map((binding) => STRINGS[binding.keys])
      .join(" | ");
    expect(said).toContain("WASD");
    expect(said).toContain("]");
    expect(said).toContain("[");
    expect(said).toContain("Enter");
  });
});
