// The hook that puts a scenario's starting content on the site. It comes with the package, and a project
// lists it under `hooks.beforeTrial` in its settings like a hook of its own: nothing creates `given` behind
// the scenes. A project that prepares its sites another way leaves it out, and the comparison before the
// agent works holds either way (`start-trial.ts`).

import type { Hook, TrialHookContext } from './types.ts';

/**
 * A before-trial hook that makes the site have the scenario's `given`, through `site.apply`. Call it where it
 * is listed: `beforeTrial: [createGiven()]`.
 */
export function createGiven(): Hook<TrialHookContext> {
  // Listed without the call, a run would call this function with the trial, and the hook it returns would never run.
  if (arguments.length > 0) {
    throw new Error('`createGiven` is listed without being called. Write `createGiven()` under `hooks.beforeTrial` in evals.config.ts: the call returns the hook');
  }
  // It carries the name a failure is reported under.
  return async function createGiven({ site, scenario }: TrialHookContext): Promise<void> {
    if (scenario.given !== undefined) await site.apply(scenario.given);
  };
}
