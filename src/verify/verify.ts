// Proves scenarios on a site without an agent: the site is started and prepared as a run does it, and the
// site's writers stand in for the agent. It exists because a scenario is often written before the ability it
// tests, and a run costs tokens. A scenario whose starting content can't be made, whose site check passes
// when nothing happened or whose rubric fails a right answer would otherwise show only in a run, as a result
// nobody can read.
//
// It covers the starting content, the site check and the answer. It does not cover `expect.abilities` or
// `expect.forbidden`: which abilities an agent executes shows only when one runs.

import { siteCheckOf } from '../checks/site.ts';
import type { CheckResult } from '../checks/types.ts';
import type { SiteState } from '../entities/types.ts';
import { SiteNotResetError, messageOf } from '../errors.ts';
import { endRunOn, startRunOn } from '../hooks/run-on-site.ts';
import { runHooks } from '../hooks/run.ts';
import { startTrial } from '../hooks/start-trial.ts';
import type { Hooks, TrialHookContext } from '../hooks/types.ts';
import type { Judge, JudgeInput } from '../judge/types.ts';
import { type Shard, scenariosOn, siteOf } from '../project/site.ts';
import type { Project } from '../project/types.ts';
import type { RunSetup, SiteReadings, TrialResult } from '../results/types.ts';
import type { Scenario } from '../scenarios/types.ts';
import type { Site } from '../sites/types.ts';
import { RUBRIC_NOT_GRADED, changeStep, changeStoppedStep, changeToMake, containsStep, labelInUseStep, noChangeStep, rubricStep, startStep, stoppedStep } from './steps.ts';
import type { Grading, JudgeGradings, Proof, Step, VerifyResult } from './types.ts';

/** What the hooks around a trial get as the agent's name, and find in the result: no agent runs, and this says what stands in its place. */
const NO_AGENT = 'verify';

export interface VerifyOptions {
  /** The name of a file in the project's sites folder. */
  site: string;
  /** Proves only scenarios whose id contains this text (or any entry when given an array). */
  filter?: string | readonly string[];
  /** Proves only one 1-based slice of the selected scenarios, such as `{ index: 1, total: 4 }`. */
  shard?: Shard;
  /** Whether the judges of the project's settings grade the answers next to a rubric. Grading spends each judge's plan or API credit. */
  judges: boolean;
  /** Called as each scenario's proof ends, to show progress. */
  onProof?: (proof: Proof) => void;
}

/** What the steps on the site found. */
interface SiteProof {
  steps: Step[];
  /** How the last of the steps ended, for the after-trial hooks. Not set when the before-trial hooks were never reached. */
  result?: TrialResult;
}

/**
 * The steps of a scenario on the site: the start, the site check with nothing done and, for a scenario that
 * expects a change, the site check once the site's writers made it. The site is prepared with `startTrial`,
 * as a trial is, once: nothing was done to it when the change is made, so the before-trial hooks run once,
 * as they do in a trial.
 */
async function siteSteps(hooks: Hooks, context: TrialHookContext, markedStart: SiteState): Promise<SiteProof> {
  const { site, scenario } = context;
  const expected = scenario.expect.site;
  const started = Date.now();
  // The result has no transcript, because no agent worked: its check is the site check of the step.
  const ended = (outcome: Pick<TrialResult, 'pass' | 'checks' | 'error' | 'site'>): TrialResult => ({
    scenarioId: scenario.id,
    agent: context.agent,
    trial: context.trial,
    ...outcome,
    durationMs: Date.now() - started,
  });
  const checked = (check: CheckResult, readings: SiteReadings): TrialResult => ended({ pass: check.pass, checks: [check], site: readings });
  const stopped = (error: unknown): TrialResult => ended({ pass: false, error: messageOf(error), checks: [] });

  let before: SiteState;
  try {
    before = await startTrial(hooks, context, markedStart);
  } catch (error) {
    // A site that could not be reset stopped the start before its before-trial hooks, so no after-trial hook is owed.
    return { steps: [stoppedStep('start', error)], ...(error instanceof SiteNotResetError ? {} : { result: stopped(error) }) };
  }
  const steps: Step[] = [startStep(scenario.given)];
  let result: TrialResult;

  try {
    // Read again with nothing done: what a trial finds when the agent does nothing.
    const after = await site.state();
    const check = siteCheckOf(before, after, expected);
    steps.push(noChangeStep(check, expected));
    result = checked(check, { before, after });
  } catch (error) {
    steps.push(stoppedStep('no change', error));
    result = stopped(error);
  }
  if (expected === undefined) return { steps, result };
  // A new item is created under its label, which can't be done where the site starts with an item under that key.
  const labelInUse = labelInUseStep(before, expected);
  if (labelInUse !== undefined) return { steps: [...steps, labelInUse], result };

  try {
    // What a trial finds when the agent does the task: the writers make the change the scenario expects.
    // The site is still as it started: the step before only read it.
    await site.apply(changeToMake(expected, before));
    const after = await site.state();
    const check = siteCheckOf(before, after, expected);
    steps.push(changeStep(check, before, expected));
    result = checked(check, { before, after });
  } catch (error) {
    steps.push(changeStoppedStep(error, before, expected));
    result = stopped(error);
  }
  return { steps, result };
}

/** What a judge says of one answer, or why it gave no verdict. This is the one place where `verify` calls a judge. */
async function gradingBy(judge: Judge, input: JudgeInput): Promise<Grading> {
  try {
    const { pass, reason } = await judge.grade(input);
    return { pass, reason };
  } catch (error) {
    return { noVerdict: messageOf(error) };
  }
}

/**
 * The steps on a scenario's answer, which need no site: its reference answer against the texts an answer
 * must contain, and both of its answers against the rubric, graded by every judge. `judges` is not set when
 * the grading is left out. A `contains` without a reference answer gets its step too, which says that it
 * was not checked.
 */
async function answerSteps(scenario: Scenario, judges: Record<string, Judge> | undefined): Promise<Step[]> {
  const { contains, rubric, reference, wrong } = scenario.expect.answer ?? {};
  const steps: Step[] = [];
  if (contains !== undefined) steps.push(containsStep(reference, contains));
  // Loading the project made sure that a rubric has both answers next to it.
  if (rubric === undefined || reference === undefined || wrong === undefined) return steps;
  if (judges === undefined) return [...steps, RUBRIC_NOT_GRADED];
  const gradings: JudgeGradings[] = [];
  // One call at a time, as in a run, where a judge grades one answer per trial.
  for (const [name, judge] of Object.entries(judges)) {
    const graded = { request: scenario.request, rubric };
    gradings.push({ judge: name, reference: await gradingBy(judge, { ...graded, answer: reference }), wrong: await gradingBy(judge, { ...graded, answer: wrong }) });
  }
  return [...steps, rubricStep(gradings)];
}

/** What went wrong in the hooks of an after-point, one line each. Nothing is thrown, so that the steps found before them are not lost. */
async function failuresOf(hooksRun: Promise<unknown>): Promise<string[]> {
  try {
    await hooksRun;
    return [];
  } catch (error) {
    return [messageOf(error)];
  }
}

/** What every scenario is proved with: the started site, the project's hooks, and the judges when they grade. */
interface Ground {
  site: Site;
  hooks: Hooks;
  run: RunSetup;
  /** The site as it was read once, right after its start was marked. */
  markedStart: SiteState;
  judges: Record<string, Judge> | undefined;
}

/**
 * The proof of one scenario, and what went wrong in the hooks after its steps. The hooks around the scenario
 * and around a trial run as in a run, with no agent: the before-trial hooks once, when the
 * site is prepared, and the after-trial hooks once, with how the last step on the site ended.
 */
async function proofOf(scenario: Scenario, { site, hooks, run, markedStart, judges }: Ground): Promise<{ proof: Proof; errors: string[] }> {
  const context = { site, run, scenario };
  const trial = { ...context, agent: NO_AGENT, trial: 1 };
  const steps: Step[] = [];
  const errors: string[] = [];
  // A scenario that could not be prepared has nothing to show on the site. Its answer is still checked.
  let prepared = true;
  try {
    await runHooks(hooks, 'beforeScenario', context);
  } catch (error) {
    prepared = false;
    steps.push(stoppedStep('start', error));
  }
  const onSite: SiteProof = prepared ? await siteSteps(hooks, trial, markedStart) : { steps: [] };
  // The answer is checked before the after-trial hooks, as the checks of a trial are, so no hook after the
  // steps can change what is checked. Its lines still follow those of the site.
  steps.push(...onSite.steps, ...(await answerSteps(scenario, judges)));
  // The checks an after-trial hook returns are not counted: they would judge the writers, where a run judges an agent.
  if (onSite.result !== undefined) errors.push(...(await failuresOf(runHooks(hooks, 'afterTrial', { ...trial, result: onSite.result }))));
  // The steps are decided by now, so a failure in these hooks costs none of them: the command goes on and ends with an error.
  errors.push(...(await failuresOf(runHooks(hooks, 'afterScenario', context))));
  return { proof: { scenarioId: scenario.id, steps }, errors: errors.map((error) => `${scenario.id}: ${error}`) };
}

/**
 * Proves every selected scenario on the site. The steps around them are those of a run: the site starts, the
 * before-run hooks run and the start is marked; at the end the after-run hooks run, and the site is kept,
 * stopped or removed as its site file says. The run that the hooks get names no agent.
 */
export async function verify(options: VerifyOptions, project: Project): Promise<VerifyResult> {
  const site = siteOf(project, options.site);
  const { scenarios } = scenariosOn(project, site, options.filter, options.shard);
  const { hooks } = project.config;
  const judges = options.judges ? (project.config.judges ?? {}) : undefined;
  const run: RunSetup = { startedAt: new Date().toISOString(), site: options.site, agents: [], trialsPerScenario: 1 };
  // A before-run hook that fails stops the command here, as it stops a run.
  await startRunOn(site, hooks, run);
  const proofs: Proof[] = [];
  const errors: string[] = [];
  // As in a run: what is thrown here is thrown again after the end, with what went wrong there.
  const atTheEnd = await endRunOn(site, hooks, run, project.sites[options.site]?.afterRun ?? 'keep', async () => {
    // Read once, now that the start is marked, as a run does: each scenario must start from it plus its `given`.
    const markedStart = await site.state();
    for (const scenario of scenarios) {
      const { proof, errors: around } = await proofOf(scenario, { site, hooks, run, markedStart, judges });
      proofs.push(proof);
      errors.push(...around);
      options.onProof?.(proof);
    }
  });
  errors.push(...atTheEnd);
  return { proofs, ...(errors.length === 0 ? {} : { errors }) };
}
