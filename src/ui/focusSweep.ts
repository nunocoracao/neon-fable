/**
 * The focus-visibility sweep.
 *
 * Every control the keyboard can land on has to *show* that it has
 * landed there, and in a codebase where a control is a `<button>` with
 * a class on it, the way that stops being true is quiet: somebody adds
 * `.nf-dye-tin`, styles it, and never touches the block at the bottom
 * of theme.css that lists what gets a focus ring. The control works, it
 * is reachable, and it is invisible to anybody navigating by keyboard.
 *
 * So the ring list is checked against the classes the UI sources
 * actually put on interactive elements. Pure string work, run over the
 * real tree by ./focusSweep.test.ts.
 *
 * It is a heuristic in the same way ./stringLint.ts is: it reads text,
 * not types. What it buys is that the common regression — a new control
 * class with no ring — fails the suite instead of shipping.
 */

/**
 * Classes assigned to a `<button>` or `<input>` in a UI source.
 *
 * Bound by name rather than by proximity: the variable a
 * `createElement("button")` is assigned to is remembered, and only
 * `thatName.className = …` and `thatName.classList.add("…")` count.
 * Reading the next few lines instead would sweep up whatever container
 * happened to be built underneath, which is most of the stylesheet.
 */
export function interactiveClasses(source: string): string[] {
  const controls = new Set<string>();
  for (const match of source.matchAll(
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*document\.createElement\(\s*"(?:button|input)"\s*\)/g,
  )) {
    if (match[1]) controls.add(match[1]);
  }
  const found = new Set<string>();
  const add = (text: string): void => {
    for (const name of text.split(/\s+/)) {
      if (name.startsWith("nf-")) found.add(name);
    }
  };
  for (const name of controls) {
    const escaped = name.replace(/\$/g, "\\$");
    for (const match of source.matchAll(
      new RegExp(`\\b${escaped}\\.className\\s*=\\s*[\`"]([^"\`$]*)`, "g"),
    )) {
      add(match[1] ?? "");
    }
    for (const match of source.matchAll(
      new RegExp(`\\b${escaped}\\.classList\\.add\\(([^)]*)\\)`, "g"),
    )) {
      for (const literal of (match[1] ?? "").matchAll(/"([^"]+)"/g)) {
        add(literal[1] ?? "");
      }
    }
  }
  return [...found].sort();
}

/** Every class named in a `:focus-visible` selector in a stylesheet. */
export function focusVisibleClasses(css: string): string[] {
  const found = new Set<string>();
  for (const match of css.matchAll(/\.([a-zA-Z0-9_-]+):focus-visible/g)) {
    const name = match[1];
    if (name) found.add(name);
  }
  return [...found].sort();
}

/**
 * Classes that are modifiers rather than controls in their own right:
 * they only ever appear alongside a class that does carry a ring, so
 * requiring one of their own would be requiring the same ring twice.
 */
export const FOCUS_MODIFIER_CLASSES: readonly string[] = [
  "nf-button-small",
  "nf-button-primary",
  "nf-button-danger",
  "nf-selected",
  // Wizard progress chips: state on .nf-wizard-step, which is ringed.
  "nf-current",
  "nf-done",
];

/**
 * Control classes with no visible focus indicator. An empty array is
 * the sweep passing.
 */
export function unringedClasses(
  sources: readonly string[],
  css: string,
): string[] {
  const ringed = new Set(focusVisibleClasses(css));
  const modifiers = new Set(FOCUS_MODIFIER_CLASSES);
  const missing = new Set<string>();
  for (const source of sources) {
    for (const name of interactiveClasses(source)) {
      if (ringed.has(name) || modifiers.has(name)) continue;
      missing.add(name);
    }
  }
  return [...missing].sort();
}
