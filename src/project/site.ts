// Builds one of a project's sites from its file, with the factory for its kind. This is where a site learns
// what the project knows and a site file does not say: where it may keep its files, and which entity types
// its packs need read. It also says which of the project's scenarios a site serves.

import { join } from 'node:path';
import { NothingToRunError, UnknownSiteError } from '../errors.ts';
import type { Pack } from '../packs/types.ts';
import type { Scenario } from '../scenarios/types.ts';
import type { Site } from '../sites/types.ts';
import type { Project } from './types.ts';

/** The folder in a project where the package keeps what it needs between commands. Not committed. */
export const WORK_FOLDER = '.wp-ability-evals';

/** The site that `<name>.json` in the project's sites folder describes. */
export function siteOf(project: Project, name: string): Site {
  const file = project.sites[name];
  if (file === undefined) throw new UnknownSiteError(name, Object.keys(project.sites));
  const factory = project.config.siteKinds[file.kind];
  // Loading the project already rejected a site file whose kind does not exist.
  if (factory === undefined) throw new Error(`Site ${name} is of kind ${file.kind}, which does not exist.`);

  const needed = new Set(project.packs.filter((pack) => file.packs.includes(pack.name)).flatMap((pack) => pack.entities));
  return factory({
    name,
    file,
    projectDir: project.dir,
    workDir: join(project.dir, WORK_FOLDER, 'sites', name),
    entityTypes: project.config.entityTypes.filter((type) => needed.has(type.name)),
  });
}

/** One 1-based slice of a project's selected scenarios, for running a suite in shards sequentially or in parallel. */
export interface Shard {
  index: number;
  total: number;
}

/** Parses `<index>/<total>` (1-based, `1 <= index <= total`), or returns undefined when malformed. */
export function parseShard(value: string): Shard | undefined {
  const match = /^(\d+)\/(\d+)$/.exec(value.trim());
  if (match === null) return undefined;
  const index = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isInteger(index) || !Number.isInteger(total) || total < 1 || index < 1 || index > total) return undefined;
  return { index, total };
}

/** Deterministic round-robin slice so slower packs spread evenly across shards instead of bunching in shard 1. */
export function shardScenarios(scenarios: Scenario[], shard: Shard | undefined): Scenario[] {
  if (shard === undefined) return scenarios;
  return scenarios.filter((_, index) => index % shard.total === shard.index - 1);
}

/**
 * The packs a site names, and those of their scenarios whose id contains `filter` (and belong to `shard` when set):
 * what `run` and `verify` work through on the site. Throws `NothingToRunError` when no scenario is left.
 */
export function scenariosOn(project: Project, site: Site, filter: string | undefined, shard?: Shard): { packs: Pack[]; scenarios: Scenario[] } {
  const packs = project.packs.filter((pack) => site.packs.includes(pack.name));
  const filtered = packs.flatMap((pack) => pack.scenarios).filter((scenario) => scenario.id.includes(filter ?? ''));
  const scenarios = shardScenarios(filtered, shard);
  if (scenarios.length === 0) throw new NothingToRunError(site.name, filter, shard);
  return { packs, scenarios };
}
