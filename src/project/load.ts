// Loads a whole project: its settings, then every pack with its scenarios and every site file, then the
// rules that span files. Loading and validating are one step, so `validate` can never accept something a
// run would then reject.

import { relative, resolve } from 'node:path';
import { loadConfig } from '../config/load.ts';
import { InvalidProjectError, problemsIn, type Problem } from '../errors.ts';
import { loadPack } from '../packs/load.ts';
import type { Pack } from '../packs/types.ts';
import { loadSiteFiles } from '../sites/load.ts';
import { crossCheckProblems } from './cross-checks.ts';
import type { Project } from './types.ts';

async function loadPacks(dirs: string[]): Promise<Pack[]> {
  const packs: Pack[] = [];
  const problems: Problem[] = [];
  for (const dir of dirs) {
    try {
      packs.push(await loadPack(dir));
    } catch (error) {
      problems.push(...problemsIn(error));
    }
  }
  if (problems.length > 0) throw new InvalidProjectError(problems);
  return packs;
}

/** What was loaded, or `undefined` once the problems that stopped it are added to the list. */
async function orProblems<T>(loading: Promise<T>, problems: Problem[]): Promise<T | undefined> {
  try {
    return await loading;
  } catch (error) {
    problems.push(...problemsIn(error));
    return undefined;
  }
}

/** The project in `projectDir`. Throws `InvalidProjectError` with every problem found, each file relative to the project. */
export async function loadProject(projectDir: string): Promise<Project> {
  const dir = resolve(projectDir);
  try {
    const config = await loadConfig(dir);
    const problems: Problem[] = [];
    const packs = await orProblems(loadPacks(config.packs), problems);
    const sites = await orProblems(loadSiteFiles(config.sitesDir), problems);
    if (packs === undefined || sites === undefined) throw new InvalidProjectError(problems);

    problems.push(...crossCheckProblems(packs, sites, config, dir));
    if (problems.length > 0) throw new InvalidProjectError(problems);
    return { dir, config, packs, sites };
  } catch (error) {
    throw new InvalidProjectError(problemsIn(error).map((problem) => ({ ...problem, file: relative(dir, problem.file) })));
  }
}
