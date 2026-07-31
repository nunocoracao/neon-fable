import { afterEach, describe, expect, it, vi } from "vitest";
import {
  composeVisual,
  defaultAppearance,
  interactableVisual,
  seededAppearance,
} from "../character";
import {
  companionLook,
  companionSpriteId,
  companions,
  getCompanion,
} from "../data/companions";
import { enemies, enemySpriteId, requireEnemy } from "../data/enemies";
import { encounters, spawnLookIndex } from "../data/encounters";
import { BODY_TIMING } from "../iso/animation";
import { attackFrameCount } from "../iso/attack";
import { reactionFrameCount } from "../iso/reaction";
import {
  characterArt,
  droneArt,
  entityAttackClass,
  entityGrid,
} from "../iso/art/entity";
import { gridErrors } from "../iso/art/pixel";
import { requireMap } from "../data/maps";
import { ambientSpriteId, createCrowd } from "../iso/ambient";
import {
  ambientSpriteSource,
  companionSpriteSource,
  enemyDeathStyle,
  enemySpriteSource,
  npcSpriteSource,
  sceneSpriteSource,
} from "./entitySprites";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("npcSpriteSource", () => {
  const hub = requireMap("cinder-plaza");

  it("composes authored and seeded NPC looks by map position", () => {
    const source = npcSpriteSource(hub);
    const flick = hub.interactables.find((i) => i.id === "flick");
    if (!flick?.visual) throw new Error("flick should carry an authored visual");
    expect(source(flick.x, flick.y)).toEqual(composeVisual(flick.visual));

    const crowd = requireMap("auric-spire").interactables.find(
      (i) => i.id === "muster-crowd",
    );
    if (!crowd) throw new Error("missing muster-crowd");
    const spire = npcSpriteSource(requireMap("auric-spire"));
    expect(spire(crowd.x, crowd.y)).toEqual(
      composeVisual(interactableVisual("auric-spire", crowd)),
    );
  });

  it("memoizes per position and misses cleanly off-NPC tiles", () => {
    const source = npcSpriteSource(hub);
    const flick = hub.interactables.find((i) => i.id === "flick");
    if (!flick) throw new Error("missing flick");
    expect(source(flick.x, flick.y)).toBe(source(flick.x, flick.y));
    // A door is not an npc; an empty tile resolves nothing either.
    const door = hub.interactables.find((i) => i.spriteId === "door");
    if (!door) throw new Error("missing door");
    expect(source(door.x, door.y)).toBeUndefined();
    expect(source(0, 0)).toBeUndefined();
  });

  it("degrades a corrupt authored visual to the stock look", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const broken = {
      ...hub,
      interactables: [
        {
          id: "glitch",
          x: 1,
          y: 1,
          label: "Glitch",
          spriteId: "npc" as const,
          interaction: { kind: "dialogue" as const, nodeId: "start" },
          visual: {
            appearance: { ...seededAppearance(1), hairStyle: "bogus" },
          },
        },
      ],
    };
    const source = npcSpriteSource(broken);
    expect(source(1, 1)).toEqual(
      composeVisual({ appearance: defaultAppearance() }),
    );
    expect(consoleError).toHaveBeenCalledOnce();
  });
});

describe("enemySpriteSource", () => {
  it("composes the look a sprite id names and memoizes it", () => {
    const source = enemySpriteSource();
    const agent = requireEnemy("nme-auric-agent");
    if (agent.spriteKind !== "humanoid") throw new Error("expected a humanoid");
    const first = source(enemySpriteId("nme-auric-agent", 0));
    expect(first).toEqual(characterArt(composeVisual(agent.looks[0])));
    expect(source(enemySpriteId("nme-auric-agent", 0))).toBe(first);
  });

  it("draws a different look for a different record of the same family", () => {
    const source = enemySpriteSource();
    const first = source(enemySpriteId("nme-auric-agent", 0));
    const second = source(enemySpriteId("nme-auric-agent", 1));
    expect(second).not.toEqual(first);
  });

  it("resolves the archetype's canonical look for a bare id", () => {
    const source = enemySpriteSource();
    expect(source("nme-auric-agent")).toEqual(
      source(enemySpriteId("nme-auric-agent", 0)),
    );
  });

  it("hands back an authored chassis for the archetypes that were never people", () => {
    const source = enemySpriteSource();
    expect(source(enemySpriteId("nme-static-drone", 0))).toEqual(
      droneArt("static-drone"),
    );
  });

  it("resolves nothing for unknown ids, letting the provider fall back", () => {
    const source = enemySpriteSource();
    expect(source("nme-nobody")).toBeUndefined();
    expect(source("nme-nobody")).toBeUndefined();
  });
});

describe("enemyDeathStyle", () => {
  it("reads how an archetype dies off its chassis", () => {
    for (const enemy of enemies) {
      expect(enemyDeathStyle(enemy.id), enemy.id).toBe(
        enemy.chassis === "machine" ? "sparkout" : "collapse",
      );
    }
  });

  it("reads a sprite id with a look suffix as the archetype it names", () => {
    expect(enemyDeathStyle(enemySpriteId("nme-static-drone", 0))).toBe(
      "sparkout",
    );
    expect(enemyDeathStyle(enemySpriteId("nme-court-sapper", 2))).toBe(
      "collapse",
    );
  });

  it("crumples anything it cannot identify", () => {
    expect(enemyDeathStyle("nme-nobody")).toBe("collapse");
    expect(enemyDeathStyle(undefined)).toBe("collapse");
  });
});

describe("ambientSpriteSource", () => {
  it("composes a pedestrian's seeded look and memoizes it per id", () => {
    const source = ambientSpriteSource();
    const id = ambientSpriteId(12345);
    expect(source(id)).toEqual(
      characterArt(composeVisual({ appearance: seededAppearance(12345) })),
    );
    // Memoized: a whole crowd sharing a look composes exactly once.
    expect(source(id)).toBe(source(id));
  });

  it("resolves nothing for the player and enemy ids", () => {
    const source = ambientSpriteSource();
    expect(source("player")).toBeUndefined();
    expect(source("nme-auric-agent")).toBeUndefined();
  });

  it("shares one descriptor across every pedestrian with the same look", () => {
    const source = ambientSpriteSource();
    const crowd = createCrowd(requireMap("cinder-plaza"));
    const descriptors = crowd.pedestrians.map((ped) =>
      source(ambientSpriteId(ped.lookSeed)),
    );
    expect(descriptors.every(Boolean)).toBe(true);
    // Same look seed -> the identical object, so downstream bake keys
    // (which serialize the descriptor) collide and share one canvas.
    for (const ped of crowd.pedestrians) {
      const id = ambientSpriteId(ped.lookSeed);
      expect(source(id)).toBe(source(id));
    }
  });
});

describe("companionSpriteSource", () => {
  it("composes the look a companion sprite id names, and memoizes it", () => {
    const source = companionSpriteSource();
    const vesper = getCompanion("vesper")!;
    const id = companionSpriteId("vesper", vesper.defaultLookId);
    expect(source(id)).toEqual(
      characterArt(
        composeVisual(companionLook(vesper, vesper.defaultLookId).visual),
      ),
    );
    expect(source(id)).toBe(source(id));
  });

  it("draws every companion's every look, in every pose it can be asked for", () => {
    // The same coverage guarantee the enemy spawns get: a companion
    // walks maps and fights fights, so every frame of every set must
    // resolve to sound art before either can put her on screen.
    const source = companionSpriteSource();
    for (const companion of companions) {
      for (const look of companion.looks) {
        const where = `${companion.id}/${look.id}`;
        const art = source(companionSpriteId(companion.id, look.id));
        expect(art, `${where} resolves`).toBeDefined();
        if (!art) continue;
        for (const facing of ["n", "e", "s", "w"] as const) {
          for (const state of ["idle", "walk"] as const) {
            for (let f = 0; f < BODY_TIMING[state].frameCount; f++) {
              expect(
                gridErrors(entityGrid(art, facing, state, f)),
                `${where} ${state} ${facing} f${f}`,
              ).toEqual([]);
            }
          }
          const swing = entityAttackClass(art);
          for (let f = 0; f < attackFrameCount(swing); f++) {
            expect(
              gridErrors(entityGrid(art, facing, "attack", f)),
              `${where} attack ${facing} f${f}`,
            ).toEqual([]);
          }
          // And the way she goes down, which benches her for a fight.
          for (let f = 0; f < reactionFrameCount("collapse"); f++) {
            expect(
              gridErrors(
                entityGrid(art, facing, "react", f, {
                  kind: "collapse",
                  awayX: 1,
                }),
              ),
              `${where} collapse ${facing} f${f}`,
            ).toEqual([]);
          }
        }
      }
    }
  });

  it("resolves nothing for anybody else's sprite id", () => {
    const source = companionSpriteSource();
    expect(source("player")).toBeUndefined();
    expect(source("nme-auric-agent")).toBeUndefined();
    // A companion a later build removed degrades to the provider's own
    // fallback rather than a crash on the render loop.
    expect(source(companionSpriteId("ghost", "any"))).toBeUndefined();
  });

  it("is what the explorable-map source hands back for a companion id", () => {
    const scene = sceneSpriteSource();
    const id = companionSpriteId("vesper", "quays-runner");
    expect(scene(id)).toEqual(companionSpriteSource()(id));
  });
});

describe("every enemy on every board", () => {
  /**
   * The coverage guarantee: walk every spawn of every authored
   * encounter through the exact resolution the combat screen uses —
   * spawnLookIndex, enemySpriteId, enemySpriteSource — and draw every
   * frame of every set it could ever be asked for. Nothing the
   * narrative can start may reach the renderer with no art.
   */
  const FACINGS = ["n", "e", "s", "w"] as const;

  it("resolves to art that renders in every pose the fight can ask for", () => {
    const source = enemySpriteSource();
    let checked = 0;
    for (const encounter of encounters) {
      encounter.enemies.forEach((spawn, slot) => {
        const look = spawnLookIndex(encounter.id, slot, spawn);
        const spriteId = enemySpriteId(spawn.enemyId, look);
        const art = source(spriteId);
        const where = `${encounter.id} slot ${slot} (${spriteId})`;
        expect(art, `${where} resolves`).toBeDefined();
        if (!art) return;
        for (const facing of FACINGS) {
          for (const state of ["idle", "walk"] as const) {
            for (let f = 0; f < BODY_TIMING[state].frameCount; f++) {
              expect(
                gridErrors(entityGrid(art, facing, state, f)),
                `${where} ${state} ${facing} f${f}`,
              ).toEqual([]);
            }
          }
          const swing = entityAttackClass(art);
          for (let f = 0; f < attackFrameCount(swing); f++) {
            expect(
              gridErrors(entityGrid(art, facing, "attack", f)),
              `${where} attack ${facing} f${f}`,
            ).toEqual([]);
          }
          // Including the way it goes down, which its chassis decides.
          const death = enemyDeathStyle(spriteId);
          for (let f = 0; f < reactionFrameCount(death); f++) {
            expect(
              gridErrors(
                entityGrid(art, facing, "react", f, { kind: death, awayX: 1 }),
              ),
              `${where} ${death} ${facing} f${f}`,
            ).toEqual([]);
          }
        }
        checked++;
      });
    }
    expect(checked, "every authored spawn was checked").toBe(
      encounters.reduce((sum, e) => sum + e.enemies.length, 0),
    );
  });
});

describe("sceneSpriteSource", () => {
  it("draws a street's pedestrians and, if a map places one, its enemies", () => {
    const source = sceneSpriteSource();
    const pedestrian = ambientSpriteId(4242);
    expect(source(pedestrian)).toEqual(ambientSpriteSource()(pedestrian));
    expect(source(enemySpriteId("nme-cordon-enforcer", 1))).toEqual(
      enemySpriteSource()(enemySpriteId("nme-cordon-enforcer", 1)),
    );
    expect(source(enemySpriteId("nme-static-drone", 0))).toEqual(
      droneArt("static-drone"),
    );
  });

  it("still resolves nothing for the player and for ids it does not know", () => {
    const source = sceneSpriteSource();
    expect(source("player")).toBeUndefined();
    expect(source("nobody-at-all")).toBeUndefined();
  });
});
