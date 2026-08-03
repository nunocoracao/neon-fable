/**
 * `npm run postcards`: render every contact sheet and scene to PNG.
 *
 * The output goes to a gitignored directory (postcards/ at the repo
 * root) rather than into the repo. These are large, they are derived
 * from the art rather than being it, and the point is to open them —
 * not to diff them. Every written path is printed, so an agent or a
 * person can go straight from the command to an image viewer.
 *
 * The canvas shim is installed around the whole run because the scene
 * pass bakes sprites through the shipping provider, which calls
 * `document.createElement` on its own.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { installCanvasShim } from "./canvas2d";
import { encodePng } from "./png";
import { renderScenePostcards } from "./scenes";
import { renderSheet, sheetSize, type SheetSpec } from "./sheet";
import { allGridSheets } from "./sheets";
import type { Framebuffer } from "./framebuffer";

/** Where the sheets land, relative to the repo root. */
export const OUTPUT_DIR = "postcards";

function write(dir: string, name: string, fb: Framebuffer): string {
  const path = join(dir, `${name}.png`);
  writeFileSync(
    path,
    encodePng({ width: fb.width, height: fb.height, data: fb.data }),
  );
  return path;
}

export interface PostcardRunOptions {
  /** Repo-root-relative output directory; defaults to OUTPUT_DIR. */
  readonly out?: string;
  /** Only render sheets whose name contains this, plus matching scenes. */
  readonly filter?: string;
  /** Where to report progress; silent when absent. */
  readonly log?: (line: string) => void;
}

/** Render everything and write it out; returns the paths written. */
export function runPostcards(options: PostcardRunOptions = {}): string[] {
  const dir = options.out ?? OUTPUT_DIR;
  const log = options.log ?? ((): void => {});
  const matches = (name: string): boolean =>
    !options.filter || name.includes(options.filter);

  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const uninstall = installCanvasShim();
  const written: string[] = [];
  try {
    const sheets: SheetSpec[] = allGridSheets().filter((sheet) =>
      matches(sheet.name),
    );
    log(`${sheets.length} sheets`);
    for (const sheet of sheets) {
      const size = sheetSize(sheet);
      const fb = renderSheet(sheet);
      written.push(write(dir, sheet.name, fb));
      log(
        `  ${sheet.name}.png  ${size.width}x${size.height}  ` +
          `${sheet.cells.length} entries`,
      );
    }
  } finally {
    uninstall();
  }

  const scenes = renderScenePostcards().filter((scene) => matches(scene.name));
  log(`${scenes.length} scenes`);
  for (const scene of scenes) {
    written.push(write(dir, scene.name, scene.framebuffer));
    log(
      `  ${scene.name}.png  ` +
        `${scene.framebuffer.width}x${scene.framebuffer.height}  ${scene.note}`,
    );
  }
  return written;
}

/** CLI entry: `node ... run.ts [--out dir] [--filter substring]`. */
export function main(argv: readonly string[] = process.argv.slice(2)): void {
  const arg = (flag: string): string | undefined => {
    const at = argv.indexOf(flag);
    return at >= 0 ? argv[at + 1] : undefined;
  };
  const out = arg("--out");
  const filter = arg("--filter");
  const started = Date.now();
  const written = runPostcards({
    ...(out ? { out } : {}),
    ...(filter ? { filter } : {}),
    log: (line) => console.log(line),
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `\n${written.length} PNGs in ${seconds}s under ` +
      `${relative(process.cwd(), out ?? OUTPUT_DIR) || "."}/`,
  );
}
