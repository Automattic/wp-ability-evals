// Saves a run in the results folder, a trial at a time, and writes the summary a person reads at the end of a run.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Scenario } from '../scenarios/types.ts';
import type { AgentModels, RunFile, RunResult, ServerSnapshot, TrialFile, TrialResult, VerdictOutcome } from './types.ts';

const LABELS: Record<VerdictOutcome, string> = {
  pass: 'passed',
  fail: 'failed',
  'expected-failure': 'failed as expected',
  'unexpected-pass': 'passed unexpectedly',
  error: 'could not be judged',
};

/** The file's content: JSON a person can read, with a line break at the end. */
function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** A trial's own file, from the run's folder: the scenario's id as folders, then the agent and the trial's number. */
function trialFile({ scenarioId, agent, trial }: Pick<TrialResult, 'scenarioId' | 'agent' | 'trial'>): string {
  // An agent's name is a key in the project's settings, so it may hold what a file name can't.
  return `trials/${scenarioId}/${agent.replace(/[^A-Za-z0-9._-]/g, '-')}.${trial}.json`;
}

/** The folder a run is saved in: in `<resultsDir>`, named after the time the run started. */
export function runFolder(resultsDir: string, startedAt: string): string {
  // The start time without its milliseconds, and without the colons a folder name can't have everywhere.
  return join(resultsDir, startedAt.replace(/\.\d+Z$/, 'Z').replaceAll(':', '-'));
}

/**
 * Writes one trial's own file under `trials/` in the run's folder `dir`. The runner writes it as soon as the
 * trial ends, so that a run that is stopped keeps every trial that ended.
 */
export async function writeTrial(dir: string, scenario: Scenario, trial: TrialResult): Promise<void> {
  const { scenarioId, agent, trial: number, pass, error, notRun, durationMs, checks, site, transcript } = trial;
  // The two readings of the site are here only: `run.json` stays small.
  const content: TrialFile = {
    scenarioId,
    agent,
    trial: number,
    pass,
    ...(error === undefined ? {} : { error }),
    ...(notRun === undefined ? {} : { notRun }),
    durationMs,
    scenario,
    checks,
    site,
    transcript,
  };
  const file = join(dir, trialFile(trial));
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, json(content));
}

/** Writes `server.json` in the run's folder `dir` with the full MCP tool definitions read by Inspector. */
export async function writeServerSnapshot(dir: string, snapshot: ServerSnapshot): Promise<string> {
  await mkdir(dir, { recursive: true });
  const file = join(dir, 'server.json');
  await writeFile(file, json(snapshot));
  return file;
}

/** Writes `run.json` in the run's folder `dir`, once the run has ended. Returns its path. */
export async function writeRunFile(dir: string, run: RunResult): Promise<string> {
  const { scenarios: _scenarios, trials, ...setup } = run;
  const runFile: RunFile = {
    ...setup,
    trials: trials.map(({ scenarioId, agent, trial, pass, error, notRun, checks, durationMs }) => ({
      scenarioId,
      agent,
      trial,
      pass,
      ...(error === undefined ? {} : { error }),
      ...(notRun === undefined ? {} : { notRun }),
      failed: checks.filter((check) => !check.pass),
      durationMs,
      file: trialFile({ scenarioId, agent, trial }),
    })),
  };
  await mkdir(dir, { recursive: true });
  const file = join(dir, 'run.json');
  await writeFile(file, json(runFile));
  return file;
}

/** Why a trial did not pass: its error, why it was not run, or the reason of each check that failed. */
function reasonsOf(trial: TrialResult): string {
  if (trial.error !== undefined) return trial.error;
  if (trial.notRun !== undefined) return trial.notRun;
  return trial.checks
    .filter((check) => !check.pass)
    .map((check) => `${check.check}: ${check.reason}${check.judge === undefined ? '' : ` (judge: ${check.judge})`}`)
    .join('; ');
}

/** What one agent ran on, as one line, such as `codex ran gpt-6.2-sol (program 0.165.0), graded by claude (claude-sonnet-5-5).` */
function modelLine({ agent, ran, judge }: AgentModels): string {
  const models = ran.length === 0 ? 'no model: no trial got as far as an answer' : ran.map(({ model, program }) => `${model} (program ${program})`).join(' and ');
  const graded = judge === undefined ? '' : `, graded by ${judge.name}${judge.model === undefined ? '' : ` (${judge.model})`}`;
  return `${agent} ran ${models}${graded}.`;
}

/**
 * The lines shown when a run ends: one block per scenario that did not simply pass, with each agent's count
 * and why each of its trials did not pass, then the counts of scenarios, what each agent ran on, and what went
 * wrong around the trials.
 */
export function summarize(run: RunResult): string[] {
  const lines: string[] = [];
  for (const verdict of run.verdicts.filter((candidate) => candidate.outcome !== 'pass')) {
    lines.push(`${verdict.scenarioId} ${LABELS[verdict.outcome]}`);
    const width = Math.max(...verdict.agents.map(({ agent }) => agent.length));
    for (const { agent, trials, passed } of verdict.agents) {
      lines.push(`  ${agent.padEnd(width)}  ${passed} of ${trials} passed`);
      const notPassed = run.trials.filter((trial) => trial.scenarioId === verdict.scenarioId && trial.agent === agent && !trial.pass);
      for (const trial of notPassed) lines.push(`    trial ${trial.trial}: ${reasonsOf(trial)}`);
    }
  }
  const counts = Object.entries(LABELS)
    .map(([outcome, label]) => ({ label, count: run.verdicts.filter((verdict) => verdict.outcome === outcome).length }))
    .filter(({ count }) => count > 0)
    .map(({ label, count }) => `${count} ${label}`);
  lines.push(`${run.verdicts.length} ${run.verdicts.length === 1 ? 'scenario' : 'scenarios'}: ${counts.join(', ')}.`);
  lines.push(...run.models.map(modelLine));
  if (run.errors !== undefined) lines.push('The run ended with an error:', ...run.errors.map((error) => `  ${error}`));
  return lines;
}
