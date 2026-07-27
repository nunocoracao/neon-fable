/**
 * Developer-mode gate: dev-only routes and shortcuts (e.g. the Explore
 * entry on the main menu) only appear when the page is opened with a
 * `?dev` query flag.
 */
export function isDevMode(): boolean {
  return new URLSearchParams(window.location.search).has("dev");
}
