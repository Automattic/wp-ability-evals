// One trial: start it on the site (reset, the before-trial hooks, the site read and found to start as the
// scenario declares), let the agent work, read the site again, run the checks, run the after-trial hooks.
// This is the only place where a site, an agent and the checks meet.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Agent, Transcript } from '../agents/types.ts';
import { checksFor } from '../checks/registry.ts';
import type { SiteState } from '../entities/types.ts';
import { SiteNotResetError, messageOf } from '../errors.ts';
import { runHooks } from '../hooks/run.ts';
import { startTrial } from '../hooks/start-trial.ts';
import type { Hooks } from '../hooks/types.ts';
import type { NamedJudge } from '../judge/types.ts';
import type { McpServer } from '../mcp-server.ts';
import type { Pack } from '../packs/types.ts';
import type { RunSetup, SiteReadings, TrialResult } from '../results/types.ts';
import type { Scenario } from '../scenarios/types.ts';
import type { Site } from '../sites/types.ts';

export interface TrialInput {
  scenario: Scenario;
  /** The agent's name in the project's config. */
  agentName: string;
  agent: Agent;
  /** The judge the agent names, when the scenario has a rubric. */
  judge?: NamedJudge;
  /** A started site, and the address of its MCP server. */
  site: Site;
  mcpServer: McpServer;
  packs: Pack[];
  /** 1 for the first trial of this scenario by this agent. */
  trial: number;
  timeoutMs: number;
  /** The project's hooks. Those of the trial's two points run here. */
  hooks: Hooks;
  /** How the run is set up, for the hooks. */
  run: RunSetup;
  /** The site as it was read once, right after the run marked its start. The trial must start from it plus its scenario's `given`. */
  markedStart: SiteState;
}

/**
 * The trial's result. Whatever stops the trial from being judged (the site did not start as the scenario
 * declares, the agent timed out, the site did not answer, a judge gave no verdict, a hook failed) is its
 * `error`. Such a trial has no checks, and it keeps what was obtained before it stopped: the agent's
 * transcript, and the two readings of the site once both were taken.
 */
export async function runTrial({ scenario, agentName, agent, judge, site, mcpServer, packs, trial, timeoutMs, hooks, run, markedStart }: TrialInput): Promise<TrialResult> {
  const started = Date.now();
  const result = { scenarioId: scenario.id, agent: agentName, trial };
  const context = { site, run, scenario, agent: agentName, trial };
  let reached = true;
  let outcome: TrialResult;
  // What the trial has obtained so far, so that a failure further on does not lose it.
  const obtained: { site?: SiteReadings; transcript?: Transcript } = {};
  // The agent's folder is empty and outside any repository, and its name says nothing about what runs in it.
  const workDir = await mkdtemp(join(tmpdir(), 'workspace-'));
  try {
    // The agent works only on a site that was read and found to start as the scenario declares.
    const before = await startTrial(hooks, context, markedStart);
    const pack = packs.find((one) => one.scenarios.some((item) => item.id === scenario.id));
    const request = pack === undefined ? scenario.request : (site.requestFor?.(scenario, pack) ?? scenario.request);
    const transcript = await agent.run({ request, mcpServer, workDir, timeoutMs });
    obtained.transcript = transcript;
    const after = await site.state();
    obtained.site = { before, after };
    const server = { name: mcpServer.name, lookup: mcpServer.lookup };
    const checks = await Promise.all(checksFor(scenario).map((check) => check({ scenario, transcript, before, after, packs, server, judge })));
    outcome = { ...result, pass: checks.every((check) => check.pass), checks, ...obtained, durationMs: Date.now() - started };
  } catch (error) {
    // A site that could not be reset stopped the trial before its before-trial hooks.
    reached = !(error instanceof SiteNotResetError);
    outcome = { ...result, pass: false, error: messageOf(error), checks: [], ...obtained, durationMs: Date.now() - started };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
  // The after-trial hooks run once the before-trial hooks were reached, whatever happened in between.
  if (!reached) return outcome;
  try {
    const added = await runHooks(hooks, 'afterTrial', { ...context, result: outcome });
    // A trial that could not be judged stays so: the checks of a hook can't decide it.
    if (outcome.error === undefined) outcome = { ...outcome, pass: outcome.pass && added.every((check) => check.pass), checks: [...outcome.checks, ...added] };
  } catch (error) {
    // The transcript and the readings stay, because the agent did work. The checks go: a trial that could not be judged has no verdict.
    const reason = outcome.error === undefined ? messageOf(error) : `${outcome.error}; ${messageOf(error)}`;
    outcome = { ...outcome, pass: false, error: reason, checks: [] };
  }
  return { ...outcome, durationMs: Date.now() - started };
}
