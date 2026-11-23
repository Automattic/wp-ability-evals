// Reads saved runs back from the results folder, for the viewer.

import { existsSync, realpathSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { basename, extname, join, resolve, sep } from 'node:path';
import { ranOn } from './models.ts';
import type { AgentModels, RunFile, RunListing, TrialFile } from './types.ts';

const RUN_FILE = 'run.json';
const SERVER_FILE = 'server.json';

/**
 * What each agent ran on in a run saved before runs saved it, from the program and model in its trial files.
 * Which judge graded the answers was not saved, so it stays unknown.
 */
async function modelsOfTrials(resultsDir: string, id: string, run: RunFile): Promise<AgentModels[]> {
  const transcripts = await Promise.all(
    run.trials.map(async ({ agent, file }) => {
      const path = runFilePath(resultsDir, id, file);
      const transcript = path === undefined ? undefined : (JSON.parse(await readFile(path, 'utf8')) as TrialFile).transcript;
      return { agent, transcript };
    }),
  );
  return run.agents.map((agent) => ({
    agent,
    ran: ranOn(transcripts.flatMap((trial) => (trial.agent === agent && trial.transcript !== undefined ? [trial.transcript.versions] : []))),
  }));
}

/** Every saved run, the newest first, each with what its agents ran on. A results folder that does not exist yet has none. */
export async function listRuns(resultsDir: string): Promise<RunListing[]> {
  if (!existsSync(resultsDir)) return [];
  const folders = (await readdir(resultsDir, { withFileTypes: true })).filter((entry) => entry.isDirectory() && existsSync(join(resultsDir, entry.name, RUN_FILE)));
  const runs = await Promise.all(
    folders.map(async ({ name }) => {
      const runFile = JSON.parse(await readFile(join(resultsDir, name, RUN_FILE), 'utf8')) as RunFile;
      const { trials: _trials, ...run } = runFile;
      const hasServerSnapshot = existsSync(join(resultsDir, name, SERVER_FILE));
      return {
        id: name,
        ...run,
        models: run.models ?? (await modelsOfTrials(resultsDir, name, runFile)),
        ...(hasServerSnapshot ? { hasServerSnapshot: true as const } : {}),
      };
    }),
  );
  return runs.sort((one, other) => other.startedAt.localeCompare(one.startedAt));
}

/**
 * The path of a JSON file of the run `id`, such as `run.json` or a trial's file, or undefined when there is
 * none. The viewer's server passes what a request asked for, so a name that leads out of the run's folder
 * gets undefined too, and so does a symbolic link that does: the file is judged by where it really is.
 */
export function runFilePath(resultsDir: string, id: string, file: string): string | undefined {
  if (id === '' || basename(id) !== id || id === '.' || id === '..') return undefined;
  const dir = resolve(resultsDir, id);
  const path = resolve(dir, file);
  if (!path.startsWith(dir + sep) || !existsSync(path)) return undefined;
  const real = realpathSync(path);
  if (!real.startsWith(realpathSync(resultsDir) + sep + id + sep) || extname(real) !== '.json') return undefined;
  return real;
}
