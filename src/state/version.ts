/**
 * The two numbers every save is judged against, kept in a module of
 * their own so the validator and the migration runner can both read
 * them without importing the state they validate and migrate.
 */

/** Save-format version; bump when GameState shape changes incompatibly. */
export const GAME_STATE_VERSION = 17;

/**
 * Oldest save version the migration runner can bring forward. Saves
 * from before this version predate the migration system and fail to
 * load with a version-mismatch error, exactly as they always have.
 */
export const OLDEST_MIGRATABLE_VERSION = 6;
