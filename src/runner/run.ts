// A whole run: every selected scenario, by every selected agent, for the chosen number of trials, on one
// site. Trials run one at a time, because they share the site. The project's hooks run at the fixed points
// around them: the run, each scenario, each trial. Each trial is saved as it ends, so a run that is stopped
// keeps the trials that were paid for. Before the first trial, the server checks decide which scenarios an
// agent runs at all.

import { AgentHasNoJudgeError, UnknownAgentError, messageOf } from '../errors.ts';
import { endRunOn, startRunOn } from '../hooks/run-on-site.ts';
import { runHooks } from '../hooks/run.ts';
import { judgeOf, sameFamilyNotices } from '../project/judges.ts';
import { scenariosOn, siteOf } from '../project/site.ts';
import type { Project } from '../project/types.ts';
import { ranOn } from '../results/models.ts';
import type { AgentModels, RunResult, RunSetup, TrialResult } from '../results/types.ts';
import { runFolder, writeRunFile, writeServerSnapshot, writeTrial } from '../results/write.ts';
import { findingLines, inspectServer } from '../server-checks/check.ts';
import { type LeftOut, scenariosLeftOut } from '../server-checks/left-out.ts';
import type { ServerFindings } from '../server-checks/types.ts';
import { runTrial } from './run-trial.ts';
import { verdictFor } from './verdict.ts';

export interface RunOptions {
  /** The name of a file in the project's sites folder. */
  site: string;
  /** Names from the config's agents. */
  agents: string[];
  /** Runs only scenarios whose id contains this text. */
  filter?: string;
  /** How many times each agent runs each scenario, instead of the number in the project's settings. */
  trials?: number;
  /** Called before the first trial with each thing the user should know about the run, as one line. */
  onNotice?: (notice: string) => void;
  /** Called before the first trial with the run's folder in the results folder, where each trial is saved as it ends. */
  onFolder?: (folder: string) => void;
  /** Called as each trial ends and is saved, to show progress. */
  onTrial?: (trial: TrialResult) => void;
}

/** A trial that no agent ran, because the server checks left its scenario out. */
export function trialLeftOut(scenarioId: string, agent: string, trial: number, { as, reason }: LeftOut): TrialResult {
  const why = as === 'error' ? { error: reason } : { notRun: reason };
  return { scenarioId, agent, trial, pass: false, ...why, checks: [], durationMs: 0 };
}

export async function run(options: RunOptions, project: Project): Promise<RunResult> {
  const agents = options.agents.map((name) => {
    const agent = project.config.agents[name];
    if (agent === undefined) throw new UnknownAgentError(name, Object.keys(project.config.agents));
    return { name, agent, judge: judgeOf(agent, project.config) };
  });
  const site = siteOf(project, options.site);
  const { packs, scenarios } = scenariosOn(project, site, options.filter);
  // A rubric needs a judge. Asked before the site starts, so a run that can't be judged stops before it spends anything.
  const withRubric = scenarios.find((scenario) => scenario.expect.answer?.rubric !== undefined);
  const judgeless = agents.find(({ judge }) => judge === undefined);
  if (withRubric && judgeless) throw new AgentHasNoJudgeError(judgeless.name, withRubric.id, Object.keys(project.config.judges ?? {}));
  if (withRubric) sameFamilyNotices(options.agents, project.config).forEach((notice) => options.onNotice?.(notice));

  const { hooks, trialTimeoutMs } = project.config;
  const setup: RunSetup = { startedAt: new Date().toISOString(), site: options.site, agents: options.agents, trialsPerScenario: options.trials ?? project.config.trials };
  const folder = runFolder(project.config.resultsDir, setup.startedAt);
  options.onFolder?.(folder);
  // A before-run hook that fails stops the run here, before any trial.
  const mcpServer = await startRunOn(site, hooks, setup);
  const trials: TrialResult[] = [];
  const errors: string[] = [];
  let serverChecks: ServerFindings = { outcome: 'unreadable', reason: 'The server checks did not run.' };
  // The run ends whatever happens in it. What is thrown in it is thrown again after its end, with what went wrong there.
  const atTheEnd = await endRunOn(site, hooks, setup, project.sites[options.site]?.afterRun ?? 'keep', async () => {
    // Read once, now that the start is marked. Before each trial the site must be as it is here, plus the
    // scenario's `given`: what a before-run hook seeded is in this reading, so no scenario has to declare it.
    const markedStart = await site.state();
    const inspected = await inspectServer(mcpServer, packs);
    serverChecks = inspected.findings;
    if (inspected.snapshot !== undefined) await writeServerSnapshot(folder, inspected.snapshot);
    // Whether a missing ability is merely not built yet depends on every scenario that names it, also those `--filter` left out.
    findingLines(serverChecks, packs.flatMap((pack) => pack.scenarios), { detail: false }).forEach((line) => options.onNotice?.(line));
    const leftOut = scenariosLeftOut(scenarios, serverChecks);
    for (const scenario of scenarios) {
      // No agent runs a scenario the server checks left out, so there is nothing to prepare or clean up for it.
      const why = leftOut.get(scenario.id);
      if (why !== undefined) {
        for (const { name } of agents) {
          for (let trial = 1; trial <= setup.trialsPerScenario; trial++) {
            const result = trialLeftOut(scenario.id, name, trial, why);
            trials.push(result);
            await writeTrial(folder, scenario, result);
            options.onTrial?.(result);
          }
        }
        continue;
      }
      const context = { site, run: setup, scenario };
      // A scenario that could not be prepared has nothing to judge: its trials are recorded and do not run.
      let unprepared: string | undefined;
      try {
        await runHooks(hooks, 'beforeScenario', context);
      } catch (error) {
        unprepared = messageOf(error);
      }
      for (const { name, agent, judge } of agents) {
        for (let trial = 1; trial <= setup.trialsPerScenario; trial++) {
          const result: TrialResult =
            unprepared === undefined
              ? await runTrial({ scenario, agentName: name, agent, judge, site, mcpServer, packs, trial, timeoutMs: trialTimeoutMs, hooks, run: setup, markedStart })
              : { scenarioId: scenario.id, agent: name, trial, pass: false, error: unprepared, checks: [], durationMs: 0 };
          trials.push(result);
          await writeTrial(folder, scenario, result);
          options.onTrial?.(result);
        }
      }
      // The trials are judged by now, so a failure here costs none of them: the run goes on and ends with an error.
      try {
        await runHooks(hooks, 'afterScenario', context);
      } catch (error) {
        errors.push(`${scenario.id}: ${messageOf(error)}`);
      }
    }
  });
  errors.push(...atTheEnd);
  const result: RunResult = {
    ...setup,
    serverChecks,
    mcpServer: { name: mcpServer.name, ...(mcpServer.lookup === undefined ? {} : { lookup: mcpServer.lookup }) },
    models: agents.map(({ name, judge }): AgentModels => ({
      agent: name,
      ran: ranOn(trials.flatMap((trial) => (trial.agent === name && trial.transcript !== undefined ? [trial.transcript.versions] : []))),
      ...(judge === undefined ? {} : { judge: { name: judge.name, ...(judge.judge.model === undefined ? {} : { model: judge.judge.model }) } }),
    })),
    scenarios,
    trials,
    verdicts: scenarios.map((scenario) => verdictFor(scenario, trials.filter((trial) => trial.scenarioId === scenario.id))),
    ...(errors.length === 0 ? {} : { errors }),
  };
  // Only a run that ended has `run.json`: a folder without one holds the trials of a run that was stopped.
  await writeRunFile(folder, result);
  return result;
}
