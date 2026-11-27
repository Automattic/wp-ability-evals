// What a site is to the evals: somewhere abilities run, that can be put back at its start, read, changed and
// reached over MCP. Each kind of site (a local wp-env site, or a project's own) implements `Site`.

import type { EntityType, SiteState } from '../entities/types.ts';
import type { McpServer } from '../mcp-server.ts';
import type { Pack } from '../packs/types.ts';
import type { Scenario, SiteChange } from '../scenarios/types.ts';
import type { ServerCheckConfig } from '../server-checks/types.ts';

/**
 * What happens to a site after a run.
 * - `keep`: it stays as the run left it, still running.
 * - `stop`: it is stopped, and keeps its data.
 * - `remove`: it is removed with its data, and set up again by the next start.
 */
export type AfterRun = 'keep' | 'stop' | 'remove';

/** The content of a file in a project's sites folder. The file's name is the site's name. */
export interface SiteFile {
  /** How the site is hosted: a built-in kind such as `wp-env`, or one the project adds in its config. */
  kind: string;
  /** The packs whose abilities this site has. Scenarios of other packs are skipped on it. */
  packs: string[];
  /** What happens to the site after a run. Defaults to `keep`. */
  afterRun?: AfterRun;
  /** Optional per-site override for `serverChecks` in `evals.config.ts`. */
  serverChecks?: ServerCheckConfig;
  /**
   * For a `wp-env` site: its wp-env configuration (WordPress version, plugins, port), as in a `.wp-env.json`.
   * A path that starts with `.` is read from the project folder.
   */
  wpEnv?: Record<string, unknown>;
  /** A project's own kind of site reads its own settings from the file. */
  [setting: string]: unknown;
}

/** What a kind of site is given to build one site. */
export interface SiteContext {
  /** The site file's name, without `.json`. */
  name: string;
  file: SiteFile;
  /** The project's folder, which a path in the site file is read from. */
  projectDir: string;
  /** A folder of the site's own inside the project, not committed, for what it keeps between commands. It may not exist yet. */
  workDir: string;
  /** The entity types the site's packs make claims about: what `state()` reports and `apply()` can change. */
  entityTypes: EntityType[];
}

export interface Site {
  readonly name: string;
  readonly packs: string[];
  /**
   * Makes the site reachable, setting it up first if needed, and returns the address of its MCP server. It
   * leaves the site in its clean state, as it was when it was set up, and forgets a marked start.
   */
  start(): Promise<McpServer>;
  /**
   * Marks a started site, as it is now, as the start that `reset()` returns to. A run marks it after its
   * before-run hooks, so what they put on the site is there in every trial.
   */
  markStart(): Promise<void>;
  /** Puts a started site back at its marked start, or in its clean state when none is marked. Runs before every trial. */
  reset(): Promise<void>;
  /** A started site as its packs' entity types report it. */
  state(): Promise<SiteState>;
  /**
   * Makes changes on a started site, as the admin user. A change has the shape of a scenario's `expect.site`,
   * which its `given` has too: the entity type, then the item's key, then the fields the item gets, or
   * `removed`. Its values are plain: the operators of `expect.site`, `$new` and `$contains`, never reach a
   * site. An item that is not on the site is created under its key, unless its entity type can create nothing
   * under a key of that form, as `posts` under `#12`. A built-in kind makes the change through each entity
   * type's writer for it; a project's own kind makes it in its own way.
   */
  apply(change: SiteChange): Promise<void>;
  /**
   * Optional per-site phrasing of a scenario's request before an agent runs it, for example naming the target
   * site on a multi-site MCP server so committed scenario files stay independent of any one site. Omitted on
   * single-site targets, where `scenario.request` is sent verbatim.
   */
  requestFor?(scenario: Scenario, pack: Pack): string;
  stop(): Promise<void>;
  /** Removes the site with its data and everything it keeps between commands. The next start sets it up again. */
  remove(): Promise<void>;
}

/** A `wp-env` site. A hook tells one apart with `isWpEnvSite(site)`, and can then run WP-CLI on it. */
export interface WpEnvSite extends Site {
  /** Runs WP-CLI on the started site as the admin user, such as `wp(['post', 'list'])`, and returns what it printed. */
  wp(args: string[]): Promise<string>;
}

/** Builds a site of one kind. A project adds a kind by naming such a function in its config. */
export type SiteFactory = (context: SiteContext) => Site;
