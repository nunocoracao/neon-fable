import { defineConfig } from "vite";

/**
 * Relative asset URLs, so one build works wherever it is served from:
 * the dev server at "/", a local `vite preview`, and GitHub Pages under
 * "/<repo>/". The game is a single page with no routing, so there is
 * nothing here that needs to know its own absolute path.
 */
export default defineConfig({
  base: "./",
});
