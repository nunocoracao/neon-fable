/**
 * Composed isometric scenes, painted by the game's own renderer.
 *
 * Everything else in this directory lays grids out on a page. This
 * module does the thing the page cannot: it hands `renderScene`
 * (src/iso/render.ts) a 2d context backed by a framebuffer and lets it
 * paint a district exactly as the browser would — the ground pass, the
 * depth sort, the glow pass, the weather curtain, the affordances. If a
 * prop sorts behind a wall it should be in front of, or a character's
 * feet float above the diamond they stand on, this is where it shows.
 *
 * The maps are the shipped maps, dressed and populated through the same
 * `resolveDistrict` the game screen uses, off a deterministic new-game
 * state. The clock is a fixed number rather than a real one, so a
 * scene postcard is the same picture every run.
 */
import { composeVisual } from "../character/appearance";
import { interactableVisual } from "../character/npc";
import { enemies, enemyLook } from "../data/enemies";
import { companions } from "../data/companions";
import { HUB_MAP_ID } from "../data/maps";
import type { Facing } from "../iso/animation";
import { focusCamera } from "../iso/camera";
import { characterArt, mechArt, type EntityArt } from "../iso/art/entity";
import { MECH_ART_IDS } from "../iso/art/mech";
import { createPixelArtSprites } from "../iso/art/provider";
import { renderScene, type SceneEntity, type SceneTint } from "../iso/render";
import { collectSetPieces } from "../iso/setpiece";
import { collectTickers } from "../iso/ticker";
import { requireSpawn, type DayPhaseId, type IsoMap } from "../iso/tilemap";
import { resolveWeather } from "../iso/weather";
import { createNewGame } from "../state/gameState";
import { resolveDistrict } from "../ui/district";
import { createSurface, installCanvasShim, drawText } from "./canvas2d";
import {
  fillRect,
  flattenOnto,
  parseColor,
  type Framebuffer,
} from "./framebuffer";

/** One rendered scene, ready to write. */
export interface ScenePostcard {
  readonly name: string;
  readonly title: string;
  readonly note: string;
  readonly framebuffer: Framebuffer;
}

/** How a scene is framed and what is standing in it. */
interface SceneSpec {
  readonly name: string;
  readonly title: string;
  readonly note: string;
  readonly mapId: string;
  /** The spawn the player stands on. */
  readonly spawnId: string;
  /** Tile the camera centres on; the spawn when absent. */
  readonly focus?: { readonly x: number; readonly y: number };
  readonly dayPhase: DayPhaseId;
  readonly rain: boolean;
  /** Draw the ground affordances (markers, hover, path). */
  readonly marks: boolean;
  /** Tinted ground, as the combat grid paints it. */
  readonly tints?: readonly SceneTint[];
  /** Extra figures beyond the player, placed relative to the spawn. */
  readonly extras?: readonly {
    readonly id: string;
    readonly dx: number;
    readonly dy: number;
    readonly facing: Facing;
    readonly moving: boolean;
  }[];
}

const VIEWPORT_W = 1280;
const VIEWPORT_H = 720;
/** A fixed clock: a postcard of a moving city, taken at one instant. */
const CLOCK_MS = 8_400;
const CAPTION_INK = "#7ff5ea";
const CAPTION_SUB = "#9aa3b8";
const CAPTION_BG = "#0d0f18";
const CAPTION_H = 34;
/**
 * `--nf-bg-deep` from src/ui/theme.css: the page the scene canvas sits
 * on. The renderer clears to transparent, so past the map edge a player
 * sees this — and so should a postcard.
 */
const PAGE_BG = "#0a0a12";

/**
 * Entity art for the ids the scenes place. Enemy ids resolve through
 * the enemy roster's look records and companion ids through theirs, so
 * the figures in an arena postcard are the figures a fight puts there.
 */
function sceneEntityArt(id: string): EntityArt | undefined {
  const mech = MECH_ART_IDS.find((art) => id === `mech:${art}`);
  if (mech) return mechArt(mech);
  const companion = companions.find((who) => id === `companion:${who.id}`);
  if (companion) {
    const look =
      companion.looks.find((entry) => entry.id === companion.defaultLookId) ??
      companion.looks[0];
    return look ? characterArt(composeVisual(look.visual)) : undefined;
  }
  const enemy = enemies.find((who) => id === `enemy:${who.id}`);
  if (enemy) {
    const visual = enemyLook(enemy, 0);
    return visual ? characterArt(composeVisual(visual)) : undefined;
  }
  return undefined;
}

/** Render one scene spec onto its own framebuffer. */
function paint(spec: SceneSpec): ScenePostcard {
  const state = createNewGame({ seed: 0x5eed, playerName: "POSTCARD" });
  const { map, newsStrips } = resolveDistrict(state, spec.mapId);
  const spawn = requireSpawn(map, spec.spawnId);
  const npcAt = new Map<string, IsoMap["interactables"][number]>();
  for (const npc of map.interactables) npcAt.set(`${npc.x},${npc.y}`, npc);

  const sprites = createPixelArtSprites({
    dayPhase: spec.dayPhase,
    entity: sceneEntityArt,
    npc: (x, y) => {
      const npc = npcAt.get(`${x},${y}`);
      return npc ? composeVisual(interactableVisual(map.id, npc)) : undefined;
    },
  });

  const entities: SceneEntity[] = [
    {
      spriteId: "player",
      position: { x: spawn.x, y: spawn.y },
      facing: "s",
      moving: false,
    },
    ...(spec.extras ?? []).map((extra) => ({
      spriteId: extra.id,
      position: { x: spawn.x + extra.dx, y: spawn.y + extra.dy },
      facing: extra.facing,
      moving: extra.moving,
    })),
  ];

  const { ctx, fb } = createSurface(VIEWPORT_W, VIEWPORT_H + CAPTION_H);
  renderScene(ctx as unknown as CanvasRenderingContext2D, sprites, {
    map,
    camera: focusCamera(map, spec.focus ?? spawn, VIEWPORT_W, VIEWPORT_H),
    viewportW: VIEWPORT_W,
    viewportH: VIEWPORT_H,
    hoverTile: spec.marks ? { x: spawn.x + 1, y: spawn.y } : null,
    path: spec.marks
      ? [
          { x: spawn.x + 1, y: spawn.y },
          { x: spawn.x + 2, y: spawn.y },
        ]
      : [],
    entities,
    timeMs: CLOCK_MS,
    dpr: 1,
    zoom: 1,
    glowEnabled: true,
    weather: resolveWeather(map, {
      enabled: spec.rain,
      ...(spec.rain ? { weather: "rain" as const } : {}),
    }),
    dayPhase: spec.dayPhase,
    setPieces: collectSetPieces(map, CLOCK_MS, { rain: spec.rain }),
    tickers: collectTickers(map, newsStrips, CLOCK_MS),
    ...(spec.tints ? { tints: spec.tints } : {}),
    marks: spec.marks,
  });

  flattenOnto(fb, parseColor(PAGE_BG));
  // The caption band sits under the frame rather than over it, so
  // nothing in the picture is covered by a label about the picture.
  fillRect(fb, 0, VIEWPORT_H, fb.width, CAPTION_H, parseColor(CAPTION_BG));
  drawText(fb, spec.title, 12, VIEWPORT_H + 8, 2, CAPTION_INK);
  drawText(fb, spec.note, 12, VIEWPORT_H + 22, 1, CAPTION_SUB);
  return {
    name: spec.name,
    title: spec.title,
    note: spec.note,
    framebuffer: fb,
  };
}

const SCENES: readonly SceneSpec[] = [
  {
    name: "scene-street-night",
    title: "CINDER PLAZA AT NIGHT",
    note: "the dressed hub, glow pass on, affordances off - a photograph",
    mapId: HUB_MAP_ID,
    spawnId: "player-start",
    dayPhase: "night",
    rain: false,
    marks: false,
    extras: [
      { id: "companion:vesper", dx: 1, dy: 1, facing: "e", moving: true },
      { id: "companion:sill", dx: -1, dy: 1, facing: "s", moving: false },
    ],
  },
  {
    name: "scene-street-rain-dusk",
    title: "CINDER PLAZA IN RAIN AT DUSK",
    note: "puddle variants, splashes, reflections, and the dusk palette",
    mapId: HUB_MAP_ID,
    spawnId: "player-start",
    dayPhase: "dusk",
    rain: true,
    marks: true,
  },
  {
    name: "scene-street-marks",
    title: "CINDER PLAZA WITH THE AFFORDANCES UP",
    note: "interactable markers, hover diamond, and the walk preview",
    mapId: HUB_MAP_ID,
    spawnId: "player-start",
    dayPhase: "late",
    rain: false,
    marks: true,
  },
  {
    name: "scene-interior",
    title: "AURIC EXECUTIVE FLOOR",
    note: "an interior: floor trim, wall props, and standing NPCs",
    mapId: "auric-executive",
    spawnId: "player-start",
    dayPhase: "night",
    rain: false,
    marks: false,
  },
  {
    name: "scene-market",
    title: "VERTICAL MARKET",
    note: "the busiest dressing in the game, with its public screens lit",
    mapId: "vertical-market",
    spawnId: "player-start",
    dayPhase: "night",
    rain: false,
    marks: false,
  },
  {
    name: "scene-arena",
    title: "RUSTYARD ARENA, MID FIGHT",
    note: "telegraph tints under a boss chassis and two hostiles",
    mapId: "rustyard-arena",
    spawnId: "player-start",
    focus: { x: 3, y: 3 },
    dayPhase: "night",
    rain: false,
    marks: true,
    tints: [
      { x: 3, y: 5, tint: "origin" },
      { x: 3, y: 4, tint: "reach" },
      { x: 3, y: 3, tint: "path" },
      { x: 3, y: 2, tint: "impact" },
      { x: 2, y: 2, tint: "threat" },
      { x: 4, y: 3, tint: "range" },
      { x: 2, y: 4, tint: "denied" },
    ],
    extras: [
      { id: "enemy:nme-rustyard-bruiser", dx: -1, dy: -3, facing: "n", moving: false },
      { id: "enemy:nme-cordon-enforcer", dx: 1, dy: -4, facing: "w", moving: true },
      { id: "mech:warden-chassis", dx: 0, dy: -5, facing: "s", moving: false },
    ],
  },
];

/**
 * Every scene postcard. Installs the canvas shim for the duration —
 * the sprite bakes reach for `document.createElement` directly — and
 * takes it back out again, so importing this module never leaves a
 * fake document lying around for anything else in the process.
 */
export function renderScenePostcards(): ScenePostcard[] {
  const uninstall = installCanvasShim();
  try {
    return SCENES.map(paint);
  } finally {
    uninstall();
  }
}
