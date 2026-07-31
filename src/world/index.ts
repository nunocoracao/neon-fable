/**
 * The reactive world layer: pure joins between what a run has done and
 * what its districts look like. Content lives in src/data/world.ts and
 * src/data/story/streets.ts; nothing here holds state or reads a clock.
 */
export {
  EMPTY_WORLD,
  conditionsAllow,
  deriveWorldState,
  hasCondition,
  worldOf,
  type WorldState,
} from "./state";
export { liveReactions, populateMap, reactionLive } from "./population";
export {
  mapShards,
  placeShards,
  shardInteractable,
  shardOpens,
} from "./shards";
export {
  eligibleHeadlines,
  newsStrip,
  rotateHeadlines,
  screenSeed,
} from "./news";
export { vendorCatalog, vendorPrice, vendorStock } from "./vendor";
