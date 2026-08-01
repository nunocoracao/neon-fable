import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ABILITY_EVENTS,
  ATTACK_EVENTS,
  IMPACT_EVENTS,
  SOUND_EVENT_IDS,
  abilityEvent,
  attackEvent,
  eventFamily,
  eventsInFamily,
  impactEvent,
  isRangedAttack,
  isSoundEvent,
  patchForEvent,
} from "./events";
import { SOUND_IDS } from "./patches";
import { SOUND_FAMILIES } from "../data/sfx";
import { ABILITY_FX_IDS } from "../iso/abilityFx";
import { ATTACK_CLASS_IDS } from "../iso/attack";
import { IMPACT_WEIGHTS } from "../iso/cameraFeel";

describe("the sound event registry", () => {
  it("has unique ids, each naming a real patch", () => {
    expect(new Set(SOUND_EVENT_IDS).size).toBe(SOUND_EVENT_IDS.length);
    for (const event of SOUND_EVENT_IDS) {
      expect(SOUND_IDS, event).toContain(patchForEvent(event));
    }
  });

  it("names every event family.system.thing, in a known family", () => {
    for (const event of SOUND_EVENT_IDS) {
      expect(event, event).toMatch(/^[a-z]+(\.[a-z0-9-]+)+$/);
      const head = event.slice(0, event.indexOf("."));
      expect(SOUND_FAMILIES, event).toContain(head);
      expect(eventFamily(event), event).toBe(head);
    }
  });

  it("sorts every event into exactly one family", () => {
    const counted = SOUND_FAMILIES.flatMap((family) => [
      ...eventsInFamily(family),
    ]);
    expect(counted.sort()).toEqual([...SOUND_EVENT_IDS].sort());
    for (const family of SOUND_FAMILIES) {
      expect(eventsInFamily(family).length, family).toBeGreaterThan(0);
    }
  });

  it("recognises registered ids and nothing else", () => {
    for (const event of SOUND_EVENT_IDS) expect(isSoundEvent(event)).toBe(true);
    expect(isSoundEvent("combat.attack.crossbow")).toBe(false);
    expect(isSoundEvent("")).toBe(false);
  });
});

// --- Completeness against the vocabularies the engine actually owns ----
//
// These are the point of the registry. A new weapon class, ability look
// or impact weight is silent until it is given a sound, and these fail
// the moment one is added without one.

describe("registry completeness", () => {
  it("gives every attack class a swing of its own", () => {
    const events = new Set<string>();
    for (const attackClass of ATTACK_CLASS_IDS) {
      const event = attackEvent(attackClass);
      expect(isSoundEvent(event), attackClass).toBe(true);
      expect(eventFamily(event), attackClass).toBe("combat");
      events.add(event);
    }
    // Distinct: telling a rifle from a blade by ear is the whole point.
    expect(events.size).toBe(ATTACK_CLASS_IDS.length);
    expect(Object.keys(ATTACK_EVENTS).sort()).toEqual(
      [...ATTACK_CLASS_IDS].sort(),
    );
  });

  it("gives every ability archetype a signature of its own", () => {
    const events = new Set<string>();
    for (const fx of ABILITY_FX_IDS) {
      const event = abilityEvent(fx);
      expect(isSoundEvent(event), fx).toBe(true);
      expect(eventFamily(event), fx).toBe("combat");
      events.add(event);
    }
    expect(events.size).toBe(ABILITY_FX_IDS.length);
    expect(Object.keys(ABILITY_EVENTS).sort()).toEqual([...ABILITY_FX_IDS].sort());
  });

  it("gives every impact weight an impact of its own", () => {
    const events = new Set<string>();
    for (const weight of IMPACT_WEIGHTS) {
      const event = impactEvent(weight);
      expect(isSoundEvent(event), weight).toBe(true);
      expect(eventFamily(event), weight).toBe("combat");
      events.add(event);
    }
    expect(events.size).toBe(IMPACT_WEIGHTS.length);
    expect(Object.keys(IMPACT_EVENTS).sort()).toEqual([...IMPACT_WEIGHTS].sort());
  });

  it("covers every v2 system that has something to say", () => {
    // The checklist, as ids. Each of these is a system that would
    // otherwise be mute; losing one is losing a system's voice.
    const required = [
      "combat.projectile.whoosh",
      "combat.hitpause.thump",
      "combat.death.collapse",
      "combat.boss.servo",
      "combat.boss.stomp",
      "world.rain.bed",
      "world.rain.splash",
      "world.train.pass",
      "world.drone.pass",
      "world.steam.burst",
      "world.door.open",
      "world.door.close",
      "world.transition.whoosh",
      "ui.wizard.step",
      "ui.wizard.thumbnail",
      "ui.wizard.swatch",
      "ui.perk.pick",
      "ui.breach.node",
      "ui.breach.alarm",
      "ui.haggle.success",
      "ui.haggle.fail",
      "ui.dye.apply",
      "ui.stylist.snip",
      "ui.shard.pickup",
      "ui.injury.taken",
      "ui.bark.pop",
      "ambient.news.blip",
    ];
    for (const event of required) {
      expect(isSoundEvent(event), `${event} is unregistered`).toBe(true);
    }
  });

  it("only calls the classes that throw something ranged", () => {
    expect(isRangedAttack("pistol")).toBe(true);
    expect(isRangedAttack("rifle")).toBe(true);
    expect(isRangedAttack("blade")).toBe(false);
    expect(isRangedAttack("unarmed")).toBe(false);
  });
});

// --- No unmapped emissions ---------------------------------------------

/** Every .ts file under src, in a stable order. */
function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (entry.endsWith(".ts")) found.push(path);
  }
  return found;
}

const SOURCES = sourceFiles("src").map((path) => ({
  path,
  text: readFileSync(path, "utf8"),
}));

describe("no unmapped emissions", () => {
  it("emits nothing the registry does not know", () => {
    const unknown: string[] = [];
    for (const { path, text } of SOURCES) {
      for (const match of text.matchAll(/\.(?:emit|at)\(\s*"([^"]+)"/g)) {
        const event = match[1] as string;
        // The cue scheduler's own `at` takes an event too; anything else
        // that reaches here with a string literal is a typo waiting to
        // be a silent cue.
        if (!isSoundEvent(event)) unknown.push(`${path}: ${event}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it("reaches the patches only through the registry", () => {
    // Game code says what happened; only the registry says what that
    // sounds like. A stray play(), or a patch looked up by name, is a
    // call site that went around the table — which is how a cue ends up
    // with an inline gain nobody can find again.
    //
    // Patch *ids* are not scanned for as bare strings: several of them
    // ("victory", "spotted", "equip") are ordinary words this codebase
    // uses for other things. The doors into the patch table are, and
    // those are unambiguous.
    const strays: string[] = [];
    for (const { path, text } of SOURCES) {
      if (path.startsWith(join("src", "audio"))) continue;
      if (/\baudio\.play\(/.test(text)) strays.push(`${path}: audio.play()`);
      if (/\bgetPatch\(/.test(text)) strays.push(`${path}: getPatch()`);
      if (/\bSOUND_PATCHES\b/.test(text)) strays.push(`${path}: SOUND_PATCHES`);
    }
    expect(strays).toEqual([]);
  });

  it("registers nothing that nothing can say", () => {
    // The other direction: an event no system names is a sound that
    // will never be heard, and a line of the catalog that has quietly
    // stopped being true. The fallbacks (combat.attack.swing,
    // combat.ability.cast) count — they are named in ./events.ts, which
    // is where they are reachable from.
    const mute: string[] = [];
    for (const event of SOUND_EVENT_IDS) {
      const named = SOURCES.some(
        ({ path, text }) =>
          !path.endsWith(join("data", "sfx.ts")) &&
          !path.endsWith(".test.ts") &&
          text.includes(`"${event}"`),
      );
      if (!named) mute.push(event);
    }
    expect(mute).toEqual([]);
  });

  it("found the sources it was meant to scan", () => {
    // Guards the two tests above from passing on an empty sweep.
    expect(SOURCES.length).toBeGreaterThan(100);
    expect(SOURCES.some(({ path }) => path.endsWith("combatScene.ts"))).toBe(
      true,
    );
  });
});
