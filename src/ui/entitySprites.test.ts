import { afterEach, describe, expect, it, vi } from "vitest";
import {
  composeVisual,
  defaultAppearance,
  interactableVisual,
  seededAppearance,
} from "../character";
import { requireEnemy } from "../data/enemies";
import { requireMap } from "../data/maps";
import { enemySpriteSource, npcSpriteSource } from "./entitySprites";

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
  it("composes an archetype's authored visual and memoizes it", () => {
    const source = enemySpriteSource();
    const agent = source("nme-auric-agent");
    expect(agent).toEqual(
      composeVisual(requireEnemy("nme-auric-agent").visual),
    );
    expect(source("nme-auric-agent")).toBe(agent);
  });

  it("resolves nothing for unknown ids, letting the provider fall back", () => {
    const source = enemySpriteSource();
    expect(source("nme-nobody")).toBeUndefined();
    expect(source("nme-nobody")).toBeUndefined();
  });
});
