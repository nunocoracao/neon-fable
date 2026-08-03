/**
 * The appearance/art validation sweep: proof that the layered character
 * system is total — that every look the UI can build composes, for
 * every facing, every animation frame, every piece of gear, and every
 * expression, without a single bad grid.
 *
 * - ./combinations — the budgeted coverage strategy (all-pairs plus
 *   every option against the default), pure and seeded.
 * - ./cases — the fourteen dimensions, built from catalogs and item
 *   data, and the readable repro line a failure prints.
 * - ./regions — where each layer slot is allowed to draw.
 * - ./report — how a sweep reports the combinations that failed.
 */
export * from "./combinations";
export * from "./cases";
export * from "./regions";
export * from "./report";
