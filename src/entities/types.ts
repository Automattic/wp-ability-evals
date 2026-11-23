// An entity type is one kind of thing on a site that scenarios make claims about, such as posts or products.
// It says which fields the evals read, and how to read and write them on each kind of site.

/** The site as the entity types report it: entity type, then the item's key, then its fields. */
export type SiteState = Record<string, Record<string, Record<string, unknown>>>;

export interface EntityType {
  /** The name scenarios and packs use, such as `posts`. */
  name: string;
  /** The fields a scenario may name. Every item is read with all of them. */
  fields: string[];
  readers: EntityReaders;
  /** May be left out by a type that no starting content names: its items are then only read. */
  writers?: EntityWriters;
}

/** How to read every item of the type, per kind of site. A kind without a reader can't serve the type. */
// Only the built-in kinds are listed. A project's own kind of site reads and writes in its own way.
export interface EntityReaders {
  /** A PHP expression that returns one row per item, each with a `key` and the fields. Run with WP-CLI. */
  'wp-env'?: string;
}

/**
 * How to make one item of the type have given fields, per kind of site: create it under its key, change it,
 * or remove it. The item must then be read under the same key, with those fields. Where the reader makes up
 * a key for an item that has none of its own, as `posts` does for a post without a slug, the writer finds
 * the item by that key and refuses to create one under it. A kind without a writer can't put the type's
 * starting content on a site.
 */
export interface EntityWriters {
  /**
   * PHP statements, run with WP-CLI as the admin user, as the body of a function: `return` ends them. They
   * get `$key`, the item's key, and `$fields`: the fields to give it, by name, or the text `removed` to remove
   * it. Both are data and never part of the code. To fail, they throw an exception that says why.
   */
  'wp-env'?: string;
}
