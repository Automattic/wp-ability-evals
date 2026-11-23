// The settings of a project, as written in its `evals.config.ts`. This is also where a project plugs in its
// own extensions (agents, entity types, kinds of site) and its hooks, so it never has to change the package.

import type { Agent } from '../agents/types.ts';
import type { EntityType } from '../entities/types.ts';
import type { Hooks } from '../hooks/types.ts';
import type { Judge } from '../judge/types.ts';
import type { SiteFactory } from '../sites/types.ts';

export interface Config {
  /** Pack folders, relative to the config file. A pack may live outside the project. */
  packs: string[];
  /** The folder with one file per site. */
  sitesDir: string;
  /** Where runs are saved. */
  resultsDir: string;
  /**
   * The agents that can run, by the name used on the command line. A built-in agent and a project's own are
   * set up the same way: by calling a function that returns an `Agent`.
   */
  agents: Record<string, Agent>;
  /**
   * The judges, by the name an agent gives as its `judge`. A judge grades an answer where a scenario has a
   * rubric. Each agent names its own, which should be of another model family than the agent.
   */
  judges?: Record<string, Judge>;
  /**
   * How many times each agent runs each scenario. A scenario passes only when all of them pass, so more
   * trials catch a scenario that works only some of the time, and use as many times the tokens.
   */
  trials: number;
  /** A trial that takes longer is stopped and counted as an error. */
  trialTimeoutMs: number;
  /** The project's own entity types, added to the built-in ones. */
  entityTypes?: EntityType[];
  /** The project's own kinds of site, by the `kind` a site file names, added to the built-in ones. */
  siteKinds?: Record<string, SiteFactory>;
  /**
   * The project's own code that prepares a site and cleans it up, by the point of a run it runs at:
   * `beforeRun`, `beforeScenario`, `beforeTrial`, `afterTrial`, `afterScenario`, `afterRun`. Each point takes
   * a list of functions, run in the order written.
   */
  hooks?: Hooks;
}

/**
 * A project's settings as loaded: its paths made absolute, the built-in entity types and kinds of site added
 * to its own, and its hooks, which are none when it names none.
 */
export interface LoadedConfig extends Config {
  entityTypes: EntityType[];
  siteKinds: Record<string, SiteFactory>;
  hooks: Hooks;
}
