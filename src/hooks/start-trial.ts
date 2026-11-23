// The start of a trial on a site: back at the marked start, then the before-trial hooks, then the proof that
// the site starts as the scenario says. It is apart from the runner so that whatever prepares a site for a
// scenario does it this one way, with an agent or without one.
//
// The proof is what keeps a scenario's words and the site in step. However the starting content got onto the
// site, by the package's own hook or by a project's, an agent only works on a site that was read and found
// to be as declared.

import { startDifferences } from '../checks/site.ts';
import type { SiteState } from '../entities/types.ts';
import { SiteNotPreparedError, SiteNotResetError, messageOf } from '../errors.ts';
import type { StartingContent } from '../scenarios/types.ts';
import { runHooks } from './run.ts';
import type { Hooks, TrialHookContext } from './types.ts';

/** Whether the site lacks an item that the starting content names. */
function lacksGiven(found: SiteState, given: StartingContent): boolean {
  return Object.entries(given).some(([type, items]) => Object.keys(items).some((key) => found[type]?.[key] === undefined));
}

/**
 * Why a trial can't start on the site as it was found, or nothing when the site starts as its scenario
 * declares: as it was read at its marked start, plus the scenario's starting content. Each difference is
 * named on its own. Where a `given` item is missing and the project has no before-trial hook, it also says
 * which hook puts `given` on a site.
 */
export function startProblem(markedStart: SiteState, found: SiteState, given: StartingContent = {}, hooks: Hooks): string | undefined {
  const differences = startDifferences(markedStart, found, given);
  if (differences.length === 0) return undefined;
  const nothingCreatesGiven = lacksGiven(found, given) && (hooks.beforeTrial ?? []).length === 0;
  const hint = nothingCreatesGiven
    ? ". No `beforeTrial` hook is set, so nothing put the scenario's `given` on the site: add `createGiven()`, which comes with the package, to `hooks.beforeTrial` in evals.config.ts"
    : '';
  return `The site could not be prepared: ${differences.join('; ')}${hint}`;
}

/**
 * Starts a trial on a started site and returns the site as the trial finds it: the site back at its marked
 * start, then the before-trial hooks, then the site read and compared with `markedStart` plus the scenario's
 * starting content. `markedStart` is the site as it was read once, right after the run marked its start.
 *
 * It throws when the trial can't start. A `SiteNotResetError` means the before-trial hooks were not reached.
 * After any other failure they were, so the caller still owes the trial its after-trial hooks: a hook that
 * failed, a site that could not be read, or a `SiteNotPreparedError` for a site that is not as declared.
 */
export async function startTrial(hooks: Hooks, context: TrialHookContext, markedStart: SiteState): Promise<SiteState> {
  const { site, scenario } = context;
  try {
    await site.reset();
  } catch (error) {
    throw new SiteNotResetError(site.name, messageOf(error));
  }
  await runHooks(hooks, 'beforeTrial', context);
  const found = await site.state();
  const problem = startProblem(markedStart, found, scenario.given, hooks);
  if (problem !== undefined) throw new SiteNotPreparedError(problem);
  return found;
}
