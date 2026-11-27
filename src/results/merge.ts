// Combines multiple sharded or per-agent run folders into one complete run folder so the viewer and trend
// history record a single unified evaluation run.

import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { runFilePath } from './read.ts';
import type { AgentModels, RanOn, RunFile, ScenarioState, ServerFindings, TrialSummary, Verdict, VerdictOutcome } from './types.ts';
import { runFolder } from './write.ts';

const RUN_FILE = 'run.json';
const SERVER_FILE = 'server.json';

/**
 * Picks which run (in newest-first order) supplies the active MCP server audit: if the newest readable run
 * (`compared` or `behind-lookup`) is a `behind-lookup` run with contract findings, select it so direct-tool
 * regressions are not masked; otherwise prefer the newest `compared` run (so a clean lookup run preserves
 * an older full audit without reviving stale lookup errors), falling back to the newest run with any checks.
 */
export function selectServerAudit<T>(runsNewestFirst: readonly T[], checksOf: (item: T) => ServerFindings | undefined): T | undefined {
  const newestReadable = runsNewestFirst.find((item) => {
    const checks = checksOf(item);
    return checks !== undefined && checks.outcome !== 'unreadable';
  });
  if (newestReadable !== undefined) {
    const checks = checksOf(newestReadable);
    if (checks?.outcome === 'behind-lookup' && (checks.definitionFindings?.length ?? 0) > 0) return newestReadable;
  }
  return runsNewestFirst.find((item) => checksOf(item)?.outcome === 'compared') ?? runsNewestFirst.find((item) => checksOf(item) !== undefined);
}

export interface MergeRunsOptions {
  /** Paths to saved run folders (each holding `run.json` and its `trials/`). */
  sources: string[];
  /** Destination results root where the merged `<startedAt>/` folder will be created. */
  resultsDir: string;
  /** Optional ISO timestamp for the merged run (defaults to the earliest source `startedAt`). */
  startedAt?: string;
}

export interface MergedRun {
  id: string;
  dir: string;
  runFile: RunFile;
}

interface LoadedSource {
  dir: string;
  parent: string;
  id: string;
  run: RunFile;
}

function verdictFromSummaries(scenarioId: string, state: ScenarioState, agentOrder: string[], trials: TrialSummary[]): Verdict {
  const present = [...new Set(trials.map((trial) => trial.agent))].sort((one, other) => {
    const a = agentOrder.indexOf(one);
    const b = agentOrder.indexOf(other);
    return (a === -1 ? Number.MAX_SAFE_INTEGER : a) - (b === -1 ? Number.MAX_SAFE_INTEGER : b);
  });
  const agents = present.map((agent) => {
    const own = trials.filter((trial) => trial.agent === agent);
    return { agent, trials: own.length, passed: own.filter((trial) => trial.pass).length };
  });
  let outcome: VerdictOutcome;
  if (trials.some((trial) => trial.error !== undefined)) {
    outcome = 'error';
  } else {
    const allPassed = trials.every((trial) => trial.pass);
    outcome = state === 'implemented' ? (allPassed ? 'pass' : 'fail') : allPassed ? 'unexpected-pass' : 'expected-failure';
  }
  return { scenarioId, state, outcome, agents };
}

function mergeModels(sources: LoadedSource[], agentOrder: string[]): AgentModels[] | undefined {
  if (!sources.some(({ run }) => run.models !== undefined)) return undefined;
  return agentOrder.map((agent) => {
    const ran: RanOn[] = [];
    const seen = new Set<string>();
    let judge: AgentModels['judge'];
    for (const { run } of sources) {
      const entry = run.models?.find((one) => one.agent === agent);
      if (entry === undefined) continue;
      for (const one of entry.ran) {
        const key = `${one.program}\0${one.model}`;
        if (!seen.has(key)) {
          seen.add(key);
          ran.push(one);
        }
      }
      if (judge === undefined && entry.judge !== undefined) judge = entry.judge;
    }
    return { agent, ran, ...(judge === undefined ? {} : { judge }) };
  });
}

async function copySafeJson(source: LoadedSource, relPath: string, destDir: string): Promise<boolean> {
  const real = runFilePath(source.parent, source.id, relPath);
  if (real === undefined) return false;
  const target = join(destDir, relPath);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(real, target);
  return true;
}

/** Merges one or more saved run folders into a single run folder under `resultsDir`. */
export async function mergeRuns({ sources, resultsDir, startedAt: customStart }: MergeRunsOptions): Promise<MergedRun> {
  if (sources.length === 0) throw new Error('Merge requires at least one run folder.');

  const loaded: LoadedSource[] = [];
  for (const raw of sources) {
    const dir = resolve(raw);
    const runPath = join(dir, RUN_FILE);
    if (!existsSync(runPath)) throw new Error(`No ${RUN_FILE} found in ${dir}.`);
    const run = JSON.parse(await readFile(runPath, 'utf8')) as RunFile;
    loaded.push({ dir, parent: dirname(dir), id: basename(dir), run });
  }
  loaded.sort((one, other) => one.run.startedAt.localeCompare(other.run.startedAt));

  const first = loaded[0] as LoadedSource;
  for (const source of loaded.slice(1)) {
    if (source.run.site !== first.run.site) {
      throw new Error(`Cannot merge runs from different sites: "${first.run.site}" and "${source.run.site}".`);
    }
    if (source.run.trialsPerScenario !== first.run.trialsPerScenario) {
      throw new Error(`Cannot merge runs with different trialsPerScenario: ${first.run.trialsPerScenario} and ${source.run.trialsPerScenario}.`);
    }
  }

  const startedAt = customStart ?? first.run.startedAt;
  const destDir = runFolder(resolve(resultsDir), startedAt);
  if (loaded.some((source) => source.dir === destDir)) {
    throw new Error(`Merged destination ${destDir} collides with a source run folder. Choose a different --out directory.`);
  }

  const agents: string[] = [];
  for (const { run } of loaded) {
    for (const agent of run.agents) if (!agents.includes(agent)) agents.push(agent);
  }

  const seenTrials = new Set<string>();
  const trials: TrialSummary[] = [];
  const trialCopies: { source: LoadedSource; file: string }[] = [];
  for (const source of loaded) {
    for (const trial of source.run.trials) {
      const key = `${trial.scenarioId}\0${trial.agent}\0${trial.trial}`;
      if (seenTrials.has(key)) {
        throw new Error(`Duplicate trial ${trial.scenarioId} (${trial.agent} trial ${trial.trial}) across merged runs.`);
      }
      seenTrials.add(key);
      trials.push(trial);
      if (trial.file !== '') trialCopies.push({ source, file: trial.file });
    }
  }

  const scenarioStates = new Map<string, ScenarioState>();
  for (const { run } of loaded) {
    for (const verdict of run.verdicts) {
      if (!scenarioStates.has(verdict.scenarioId)) scenarioStates.set(verdict.scenarioId, verdict.state);
    }
  }
  const verdicts: Verdict[] = [...scenarioStates].map(([scenarioId, state]) =>
    verdictFromSummaries(
      scenarioId,
      state,
      agents,
      trials.filter((trial) => trial.scenarioId === scenarioId),
    ),
  );

  const serverSource = selectServerAudit([...loaded].reverse(), ({ run }) => run.serverChecks);
  const snapshotSource = serverSource !== undefined && existsSync(join(serverSource.dir, SERVER_FILE)) ? serverSource : undefined;
  const mcpServer = loaded.find(({ run }) => run.mcpServer !== undefined)?.run.mcpServer;
  const models = mergeModels(loaded, agents);
  const errors = loaded.flatMap(({ run }) => run.errors ?? []);

  const runFile: RunFile = {
    startedAt,
    site: first.run.site,
    agents,
    trialsPerScenario: first.run.trialsPerScenario,
    ...(serverSource?.run.serverChecks === undefined ? {} : { serverChecks: serverSource.run.serverChecks }),
    ...(mcpServer === undefined ? {} : { mcpServer }),
    ...(models === undefined ? {} : { models }),
    verdicts,
    trials,
    ...(errors.length === 0 ? {} : { errors }),
  };

  await mkdir(destDir, { recursive: true });
  for (const { source, file } of trialCopies) {
    await copySafeJson(source, file, destDir);
  }
  if (snapshotSource !== undefined) {
    await copySafeJson(snapshotSource, SERVER_FILE, destDir);
  }
  await writeFile(join(destDir, RUN_FILE), `${JSON.stringify(runFile, null, 2)}\n`);

  return { id: basename(destDir), dir: destDir, runFile };
}
