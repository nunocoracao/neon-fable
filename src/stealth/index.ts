/**
 * Stealth: patrols, vision cones, and the quiet way past a fight. All
 * pure — content lives in src/data/stealth.ts, the tints and the keys
 * live in the UI shell, and nothing in here touches a canvas or a
 * clock.
 */
export {
  blocksSight,
  coneTiles,
  earshotTiles,
  hasLineOfSight,
  sightLine,
  visionTiles,
  SEE_THROUGH_PROPS,
} from "./vision";
export {
  PatrolError,
  patrolCycleLength,
  patrolPointAt,
  patrolStepAt,
  patrolSteps,
  type PatrolPoint,
  type PatrolStep,
} from "./patrol";
export {
  earshotOnlyTiles,
  guardSpriteId,
  guardViews,
  heardBy,
  liveGuards,
  seenBy,
  watchedTiles,
  type GuardView,
} from "./watch";
export {
  detectAt,
  withinBounds,
  type Detection,
  type DetectionQuery,
  type DetectionSense,
} from "./detect";
export {
  LUNGE_GRACE_TICKS,
  applyLunge,
  lungeOffer,
  onGoal,
  pinchAt,
  recordPassed,
  recordSpotted,
  recordTakedown,
  startStealth,
  stepStealth,
  takedownOffer,
  takedownsUsed,
  tickAt,
  tickFloat,
  toggleCrouch,
  type LungeOffer,
  type LungeRefusal,
  type StealthEvent,
  type StealthRun,
  type StealthStatus,
  type StealthStepInput,
  type StealthStepResult,
  type TakedownOffer,
  type TakedownRefusal,
} from "./run";
export { activeStealthZone, hasQuietHands, isZoneLive } from "./zone";
