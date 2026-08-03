/**
 * The release smoke: drive the *built* bundle, not the sources.
 *
 * Every other test in this repo imports TypeScript out of `src/`, which
 * means none of them can see anything the build does to the code — the
 * chunk split, the minifier's name mangling, `base: "./"` resolving,
 * a dynamic import that only exists once rollup has moved it. This
 * loads `dist/` into a DOM the way a browser would and plays the two
 * openings that matter:
 *
 *   1. A fresh run: the main menu comes up, New Game reaches the
 *      character wizard, and the wizard's first step is on screen.
 *   2. A v1-era save: a frozen v6 envelope (scripts/fixtures) is put
 *      into localStorage before boot, Continue reads it, the migration
 *      ladder brings it forward, and the game screen mounts on the hub.
 *
 * Run it with `npm run smoke`, which builds first. It is deliberately
 * not part of `npm test`: it needs a `dist/` to exist, and a test that
 * silently skips when its subject is missing is worse than no test.
 *
 * The canvas is stubbed — happy-dom has no 2d context and this is not
 * where pixels are checked — so what this proves is that the built
 * bundle boots, routes, reads a decade-old save and puts a screen up
 * without throwing. Everything visual is still a person's job.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Window } from "happy-dom";

const DIST = new URL("../dist/", import.meta.url).pathname;
/** Kept in step with src/state/version.ts by hand, on purpose: the point
 * of this check is that the *built* bundle brought the save to the
 * version this release claims, so reading the number out of the source
 * it is testing would prove nothing. */
const CURRENT_SAVE_VERSION = 17;
const FIXTURE = new URL("./fixtures/v6-save.json", import.meta.url).pathname;

const checks = [];
const record = (ok, what, detail = "") => {
  checks.push({ ok, what, detail });
  console.log(`${ok ? "  ok  " : " FAIL "} ${what}${detail ? ` — ${detail}` : ""}`);
};

/** The 2d context members the scenes and the bakes reach for. */
function stubContext() {
  const noop = () => {};
  return new Proxy(
    {
      canvas: { width: 0, height: 0 },
      measureText: () => ({ width: 40 }),
      createRadialGradient: () => ({ addColorStop: noop }),
      createLinearGradient: () => ({ addColorStop: noop }),
      getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    },
    {
      get: (target, key) =>
        key in target ? target[key] : typeof key === "string" ? noop : undefined,
      set: () => true,
    },
  );
}

/** The entry chunk vite emitted, found the way index.html finds it. */
function entryChunk() {
  const html = readFileSync(join(DIST, "index.html"), "utf8");
  const match = /<script[^>]*src="\.?\/?(assets\/[^"]+\.js)"/.exec(html);
  if (!match) throw new Error("dist/index.html declares no module script");
  const named = readdirSync(join(DIST, "assets"));
  if (!named.includes(match[1].split("/")[1])) {
    throw new Error(`dist/index.html points at a missing chunk: ${match[1]}`);
  }
  return join(DIST, match[1]);
}

async function boot({ save } = {}) {
  const window = new Window({ url: "http://localhost/" });
  const { document } = window;
  document.body.innerHTML = readFileSync(join(DIST, "index.html"), "utf8")
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/[\s\S]*<body[^>]*>|<\/body>[\s\S]*/g, "");

  window.HTMLCanvasElement.prototype.getContext = stubContext;
  window.HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,";
  window.requestAnimationFrame = (fn) => window.setTimeout(() => fn(0), 0);
  window.cancelAnimationFrame = (id) => window.clearTimeout(id);
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  });
  window.AudioContext = class {
    constructor() {
      this.state = "suspended";
      this.destination = {};
      this.currentTime = 0;
    }
    createGain() {
      return { gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} };
    }
    resume() {
      return Promise.resolve();
    }
  };
  window.localStorage.clear();
  if (save) window.localStorage.setItem("neon-fable:save:slot1", save);

  // The bundle is browser code: it reads these off the global scope at
  // import time, so they have to be there before the import runs.
  const owned = [
    "window",
    "document",
    "navigator",
    "localStorage",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "matchMedia",
    "AudioContext",
    "HTMLElement",
    "HTMLCanvasElement",
    "Element",
    "Node",
    "Event",
    "KeyboardEvent",
    "MouseEvent",
    "CustomEvent",
    "getComputedStyle",
    "Image",
    "DOMParser",
    "ResizeObserver",
    "devicePixelRatio",
  ];
  for (const key of owned) {
    if (window[key] === undefined) continue;
    // Node defines some of these itself, getter-only; overwrite them
    // with the window's version rather than assigning through.
    Object.defineProperty(globalThis, key, {
      value: window[key],
      configurable: true,
      writable: true,
    });
  }
  globalThis.self = window;

  const errors = [];
  window.addEventListener("error", (e) => errors.push(String(e.message ?? e)));

  // Cache-bust so a second boot in the same process re-evaluates.
  await import(`${pathToFileURL(entryChunk()).href}?run=${checks.length}`);
  await new Promise((resolve) => window.setTimeout(resolve, 30));
  return { window, document, errors };
}

function text(document) {
  return document.getElementById("ui-root")?.textContent ?? "";
}

function buttonSaying(document, needle) {
  return [...document.querySelectorAll("button")].find((b) =>
    (b.textContent ?? "").toLowerCase().includes(needle.toLowerCase()),
  );
}

/* --- 1. A fresh run opens. --- */

{
  const { document, errors } = await boot();
  const menu = text(document);
  record(menu.includes("Neon Fable"), "the built bundle boots to the main menu");
  record(errors.length === 0, "boot throws nothing", errors.join("; "));

  const newGame = buttonSaying(document, "new game");
  record(Boolean(newGame), "the main menu offers New Game");
  newGame?.click();
  await new Promise((r) => setTimeout(r, 20));
  const wizard = text(document);
  record(
    wizard.includes("Identity") || wizard.toLowerCase().includes("name"),
    "New Game reaches the character wizard's first step",
    wizard.slice(0, 60).replace(/\s+/g, " "),
  );
}

/* --- 2. A v1-era save still loads. --- */

{
  const save = readFileSync(FIXTURE, "utf8");
  const { window, document, errors } = await boot({ save });
  const load = buttonSaying(document, "continue") ?? buttonSaying(document, "load");
  record(Boolean(load), "the main menu offers to continue the v6 save");
  load?.click();
  await new Promise((r) => setTimeout(r, 20));

  const opened = text(document);
  const refused = /unreadable|incompatible|could not|cannot|corrupt/i;
  record(
    !refused.test(opened),
    "the v6 save opens rather than being refused",
    opened.slice(0, 100).replace(/\s+/g, " "),
  );

  // Continue goes straight in: there is no slot picker on this road.
  const canvas = document.querySelector("#ui-root canvas");
  record(Boolean(canvas), "the game screen mounts, canvas and all");

  // The run that came up is the migrated one, not a fresh start: the
  // ladder brought a v6 envelope to the current version, and the first
  // autosave writes it back at that version with the same runner in it.
  const written = window.localStorage.getItem("neon-fable:save:autosave");
  const migrated = written ? JSON.parse(written) : null;
  record(
    migrated?.version === CURRENT_SAVE_VERSION,
    `the ladder rewrote the run at v${CURRENT_SAVE_VERSION}`,
    `read v${migrated?.version ?? "nothing"}`,
  );
  record(
    migrated?.state?.player?.name === "Sable",
    "the migrated run is the v6 runner, not a new one",
    String(migrated?.state?.player?.name),
  );
  record(
    Array.isArray(migrated?.state?.party?.members) &&
      migrated?.state?.reputation !== undefined &&
      migrated?.state?.rules !== undefined,
    "the v2 records the old save never had are there and defaulted",
  );

  record(errors.length === 0, "loading throws nothing", errors.join("; "));
}

const failed = checks.filter((c) => !c.ok);
console.log(
  `\n${checks.length - failed.length}/${checks.length} smoke checks passed`,
);
process.exit(failed.length === 0 ? 0 : 1);
