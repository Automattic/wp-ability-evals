// What a hook is: a function of a project that runs at one of six fixed points of a run. The framework fixes
// the points, their order and what a failure means. What a hook does is the project's own code, so a local
// site and a hosted one can be prepared and cleaned up in different ways.
//
// The points, in the order of a run:
//
//   beforeRun              once, on the site in its clean state; the site's start is marked after it
//     beforeScenario       once per scenario
//       beforeTrial        before each trial, after the site is back at its marked start; the site must then
//                          be that start plus the scenario's starting content, or the trial does not run
//       afterTrial         after each trial, with its result
//     afterScenario
//   afterRun
//
// `verify` runs the same points without an agent, with the site's writers in its place. A hook can tell: the
// run names no agent, and the hooks around a trial get `verify` as the agent's name.

import type { CheckResult } from '../checks/types.ts';
import type { RunSetup, TrialResult } from '../results/types.ts';
import type { Scenario } from '../scenarios/types.ts';
import type { Site } from '../sites/types.ts';

/** What every hook gets. */
export interface RunHookContext {
  /**
   * The started site: `site.state()` reads it, and `site.apply(change)` changes it. A `wp-env` site can also
   * run WP-CLI: `if (isWpEnvSite(site)) await site.wp([...])`.
   */
  site: Site;
  run: RunSetup;
}

/** What a hook around a scenario gets. */
export interface ScenarioHookContext extends RunHookContext {
  scenario: Scenario;
}

/** What a hook around a trial gets. */
export interface TrialHookContext extends ScenarioHookContext {
  /** The agent's name in the project's settings. In `verify`, where no agent runs, it is the text `verify`. */
  agent: string;
  /** 1 for the first trial of this scenario by this agent. */
  trial: number;
}

/** What an after-trial hook gets. */
export interface AfterTrialHookContext extends TrialHookContext {
  /**
   * How the trial ended, before the checks of the after-trial hooks are added. In `verify` it has no
   * transcript: its `site` holds the site before and after the writers made the expected change, or after
   * nothing was done for a scenario that expects none, and its `checks` hold the site check.
   */
  result: TrialResult;
}

/** A hook. It may be async, and what it returns is ignored. A hook that throws has failed. */
export type Hook<Context> = (context: Context) => unknown;

/**
 * An after-trial hook may return checks of its own, each with its name, whether it passed and what was found.
 * They are added to the trial's checks and count like any other. `verify` does not count them: they would
 * judge the site's writers, where a run judges an agent.
 */
export type AfterTrialHook = (context: AfterTrialHookContext) => CheckResult[] | void | Promise<CheckResult[] | void>;

/**
 * The hooks of a project, by the point they run at. Each point takes a list, run in the order written.
 *
 * When a hook fails:
 * - `beforeRun`: the run stops, and no trial runs.
 * - `beforeScenario`: every trial of that scenario could not be judged, and the run goes on with the next one.
 * - `beforeTrial`, `afterTrial`: that trial could not be judged.
 * - `afterScenario`, `afterRun`: the run goes on, and ends with an error.
 *
 * A before-hook that fails stops the hooks after it at the same point. The after-hooks of a point run
 * whenever its before-hooks were reached, whatever failed in between, and each of them runs even when
 * another one failed.
 */
export interface Hooks {
  beforeRun?: Hook<RunHookContext>[];
  beforeScenario?: Hook<ScenarioHookContext>[];
  beforeTrial?: Hook<TrialHookContext>[];
  afterTrial?: AfterTrialHook[];
  afterScenario?: Hook<ScenarioHookContext>[];
  afterRun?: Hook<RunHookContext>[];
}

/** A point of a run, as the settings name it. */
export type HookPoint = keyof Hooks;
