// Reads a project's `evals.config.ts`, resolves its paths against the project folder, and adds the built-in
// entity types and kinds of site to the project's own.

import { existsSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BUILT_IN_ENTITY_TYPES } from '../entities/registry.ts';
import { InvalidProjectError, ProjectNotFoundError } from '../errors.ts';
import { isRecord } from '../files/shape.ts';
import { BUILT_IN_SITE_KINDS } from '../sites/registry.ts';
import type { Config, LoadedConfig } from './types.ts';
import { configProblems } from './validate.ts';

export const CONFIG_FILE = 'evals.config.ts';

/**
 * What to do about a module that was not found, when it is a file of the project imported without its `.ts`
 * ending: Node runs the project's TypeScript as it is written, and adds no ending to an import.
 */
function importHint(reason: string): string {
  const [, missing, importer] = /Cannot find module '([^']+)' imported from (.+)$/m.exec(reason) ?? [];
  if (missing === undefined || importer === undefined || extname(missing) !== '' || !existsSync(`${missing}.ts`)) return '';
  const written = relative(dirname(importer), `${missing}.ts`);
  return `. \`${basename(missing)}.ts\` is there: write the import as \`${written.startsWith('.') ? written : `./${written}`}\`, with its \`.ts\` ending, because Node adds no ending to the import of a project's file`;
}

async function defaultExportOf(file: string): Promise<unknown> {
  try {
    const module: unknown = await import(pathToFileURL(file).href);
    return isRecord(module) ? module.default : undefined;
  } catch (error) {
    // Whatever stops the file from loading (a syntax error, a package that is not installed) is the project's to fix.
    const reason = error instanceof Error ? error.message : String(error);
    throw new InvalidProjectError([{ file, message: `could not be loaded: ${reason}${importHint(reason)}` }]);
  }
}

/** A project's own entity type or kind of site may not take the name of an existing one: it would replace it without a word. */
function nameClashProblems(config: Config): string[] {
  const problems: string[] = [];
  const typeNames = new Set(BUILT_IN_ENTITY_TYPES.map((type) => type.name));
  for (const { name } of config.entityTypes ?? []) {
    if (typeNames.has(name)) problems.push(`\`entityTypes\` has \`${name}\`, which already exists: choose another name`);
    typeNames.add(name);
  }
  for (const kind of Object.keys(config.siteKinds ?? {})) {
    if (Object.hasOwn(BUILT_IN_SITE_KINDS, kind)) problems.push(`\`siteKinds\` has \`${kind}\`, which is built in: choose another name`);
  }
  return problems;
}

/** The settings of the project in `projectDir`. Throws `InvalidProjectError` with every problem found. */
export async function loadConfig(projectDir: string): Promise<LoadedConfig> {
  const dir = resolve(projectDir);
  const file = join(dir, CONFIG_FILE);
  if (!existsSync(file)) throw new ProjectNotFoundError(dir);

  const settings = await defaultExportOf(file);
  const problems = configProblems(settings);
  // No problems means the settings follow the format, which is what makes them a `Config`.
  if (problems.length === 0) problems.push(...nameClashProblems(settings as Config));
  if (problems.length > 0) throw new InvalidProjectError(problems.map((message) => ({ file, message })));

  const config = settings as Config;
  return {
    ...config,
    packs: config.packs.map((pack) => resolve(dir, pack)),
    sitesDir: resolve(dir, config.sitesDir),
    resultsDir: resolve(dir, config.resultsDir),
    entityTypes: [...BUILT_IN_ENTITY_TYPES, ...(config.entityTypes ?? [])],
    siteKinds: { ...BUILT_IN_SITE_KINDS, ...config.siteKinds },
    hooks: config.hooks ?? {},
  };
}
