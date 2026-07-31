import { describe, expect, it } from "vitest";
import {
  INJURY_CAUSES,
  INJURY_CAUSE_ORDER,
  drawInjury,
  getInjury,
  injuries,
  injuryForCause,
  injuryTreatCost,
  requireInjury,
} from "./injuries";

/**
 * Content lint for the injury pool. The load-bearing one is the last:
 * an injury nobody can walk off or pay off would be a permanent debuff,
 * and this file is the only place one could be authored.
 */

describe("the injury pool", () => {
  it("has unique ids", () => {
    const ids = injuries.map((injury) => injury.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("names every injury and says what it costs", () => {
    for (const injury of injuries) {
      expect(injury.name.length).toBeGreaterThan(0);
      expect(injury.description.length).toBeGreaterThan(0);
      expect(injury.effect.length).toBeGreaterThan(0);
    }
  });

  it("gives every injury a distinct severity, so worst-replaces is total", () => {
    const severities = injuries.map((injury) => injury.severity);
    expect(new Set(severities).size).toBe(severities.length);
  });

  it("does nothing to a character it does not visibly cost", () => {
    for (const injury of injuries) {
      const doesSomething =
        injury.effects.length > 0 ||
        (injury.dialogueCool ?? 0) > 0 ||
        injury.chromeOffline === true;
      expect(doesSomething, injury.id).toBe(true);
    }
  });

  it("only ever takes stats away", () => {
    for (const injury of injuries) {
      for (const effect of injury.effects) {
        expect(effect.type, injury.id).toBe("stat-mod");
        if (effect.type === "stat-mod") {
          expect(effect.amount, injury.id).toBeLessThan(0);
        }
      }
    }
  });

  it("can always be walked off, and always be paid off", () => {
    for (const injury of injuries) {
      expect(injury.scenes, injury.id).toBeGreaterThan(0);
      expect(injury.treatCost, injury.id).toBeGreaterThan(0);
    }
  });

  it("keeps the effects bounded — no wound costs more than 2 of a stat", () => {
    for (const injury of injuries) {
      for (const effect of injury.effects) {
        if (effect.type === "stat-mod") {
          expect(Math.abs(effect.amount), injury.id).toBeLessThanOrEqual(2);
        }
      }
      expect(injury.dialogueCool ?? 0, injury.id).toBeLessThanOrEqual(2);
    }
  });
});

describe("causes", () => {
  it("answers every cause the union declares", () => {
    for (const cause of INJURY_CAUSES) {
      expect(injuryForCause(cause), cause).toBeDefined();
    }
  });

  it("orders every cause exactly once", () => {
    expect([...INJURY_CAUSE_ORDER].sort()).toEqual([...INJURY_CAUSES].sort());
  });

  it("always draws something for a fight that only matched 'shot'", () => {
    expect(drawInjury(["shot"])?.cause).toBe("shot");
  });

  it("draws the most specific cause a fight matched", () => {
    expect(drawInjury(["shot", "concussion"])?.cause).toBe("concussion");
    expect(drawInjury(["shot", "concussion", "chrome"])?.cause).toBe("chrome");
    expect(drawInjury(["shot", "chrome"])?.cause).toBe("chrome");
  });

  it("draws nothing for a fight that matched nothing", () => {
    expect(drawInjury([])).toBeNull();
  });
});

describe("lookups", () => {
  it("resolves an authored id and refuses an unknown one", () => {
    expect(getInjury("inj-winged")?.name).toBe("Winged");
    expect(getInjury("inj-nonexistent")).toBeUndefined();
    expect(() => requireInjury("inj-nonexistent")).toThrow(/inj-nonexistent/);
  });

  it("quotes the authored fee, and nothing for an unknown id", () => {
    expect(injuryTreatCost("inj-winged")).toBe(
      requireInjury("inj-winged").treatCost,
    );
    expect(injuryTreatCost("inj-nonexistent")).toBe(0);
  });
});
