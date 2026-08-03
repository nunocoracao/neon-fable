/**
 * `npm run postcards` — render the art to PNG contact sheets.
 *
 * The renderer itself is TypeScript under src/postcards, because it is
 * part of the project rather than a script: it imports the real art
 * registry, the real composition pipeline, and the real scene painter.
 * This file exists only to load that TypeScript in Node, which it does
 * through Vite's own SSR module loader — already a dependency, so the
 * whole pipeline adds nothing to package.json.
 */
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  logLevel: "warn",
  server: { middlewareMode: true },
  appType: "custom",
});

try {
  const module = await server.ssrLoadModule("/src/postcards/run.ts");
  module.main(process.argv.slice(2));
} finally {
  await server.close();
}
