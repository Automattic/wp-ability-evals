// Reads what coverage is counted from out of the results folder: the saved runs, and each scenario's latest
// result, from the newest saved run that has a verdict for it, with the tool calls of its trials and the models
// that ran them.

import { readFile } from 'node:fs/promises';
import type { Pack } from '../packs/types.ts';
import { listRuns, runFilePath } from '../results/read.ts';
import type { Overview, RunFile, RunListing, TrialFile, TrialSummary } from '../results/types.ts';
import { overviewOf } from './coverage.ts';
import type { LatestResult } from './types.ts';

async function readJson<T>(resultsDir: string, id: string, file: string): Promise<T | undefined> {
  const path = runFilePath(resultsDir, id, file);
  return path === undefined ? undefined : (JSON.parse(await readFile(path, 'utf8')) as T);
}

/** Why a trial did not pass, in one line. Undefined for a passing trial. */
function reasonOf({ pass, error, notRun, failed }: TrialSummary): string | undefined {
  if (error !== undefined) return error;
  if (notRun !== undefined) return notRun;
  if (pass || failed.length === 0) return undefined;
  return failed.map(({ check, reason, judge }) => `${check}: ${reason}${judge === undefined ? '' : ` (judge: ${judge})`}`).join('; ');
}

/** Each scenario's latest result, by the scenario's id, with the tool calls of its trials. `runs` are the newest first. */
async function latestResults(resultsDir: string, runs: RunListing[]): Promise<Map<string, LatestResult>> {
  // The first verdict found for a scenario is its latest.
  const newest = new Map<string, RunListing>();
  for (const run of runs) for (const verdict of run.verdicts) if (!newest.has(verdict.scenarioId)) newest.set(verdict.scenarioId, run);

  const runFiles = new Map<string, Promise<RunFile | undefined>>();
  const latest = new Map<string, LatestResult>();
  for (const [scenarioId, run] of newest) {
    if (!runFiles.has(run.id)) runFiles.set(run.id, readJson<RunFile>(resultsDir, run.id, 'run.json'));
    const runFile = await runFiles.get(run.id);
    const verdict = run.verdicts.find((one) => one.scenarioId === scenarioId);
    if (runFile === undefined || verdict === undefined) continue;
    const trials = await Promise.all(
      runFile.trials
        .filter((trial) => trial.scenarioId === scenarioId)
        .map(async (trial) => {
          const transcript = (await readJson<TrialFile>(resultsDir, run.id, trial.file))?.transcript;
          const reason = reasonOf(trial);
          return {
            agent: trial.agent,
            trial: trial.trial,
            pass: trial.pass,
            file: trial.file,
            ...(trial.error === undefined ? {} : { error: trial.error }),
            ...(trial.notRun === undefined ? {} : { notRun: trial.notRun }),
            ...(reason === undefined ? {} : { reason }),
            toolCalls: transcript?.toolCalls ?? [],
            ...(transcript === undefined ? {} : { versions: transcript.versions }),
          };
        }),
    );
    const saved = { ...(run.mcpServer === undefined ? {} : { mcpServer: run.mcpServer }), ...(run.models === undefined ? {} : { models: run.models }) };
    latest.set(scenarioId, { runId: run.id, startedAt: run.startedAt, verdict, ...saved, trials });
  }
  return latest;
}

/** The Overview of the packs, from the runs saved in the results folder. */
export async function readOverview(resultsDir: string, packs: Pack[]): Promise<Overview> {
  const runs = await listRuns(resultsDir);
  return overviewOf({ packs, runs, latest: await latestResults(resultsDir, runs) });
}
