import { defineConfig } from "vitest/config";

/**
 * Relative asset URLs, so one build works wherever it is served from:
 * the dev server at "/", a local `vite preview`, and GitHub Pages under
 * "/<repo>/". The game is a single page with no routing, so there is
 * nothing here that needs to know its own absolute path.
 */
export default defineConfig({
  base: "./",
  test: {
    /**
     * Vitest's default is five seconds, and several of this repo's
     * sweeps legitimately take three or four: the appearance
     * composition sweep renders every layer combination in every pose,
     * the balance sweep plays ~15k battles, the walkthroughs replay
     * whole runs. None of them is slow by accident, and none should go
     * red because the machine was busy — a red suite that means
     * "another process was compiling" is a suite people stop reading.
     * The ceiling is here to catch a hang, not to time anything.
     */
    testTimeout: 30_000,
  },
});
