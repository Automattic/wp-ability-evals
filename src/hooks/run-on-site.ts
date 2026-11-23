// The start and the end of a run on a site. They are apart from the runner because a run is not the only
// thing that starts a site this way: `site start` does too, so that a person sees the site as a run finds it,
// and so does `verify`, which proves scenarios on such a site without an agent.
//
// A failure never hides another: what is thrown after the after-run hooks ran carries what went wrong in them.

import { messageOf } from '../errors.ts';
import type { McpServer } from '../mcp-server.ts';
import type { RunSetup } from '../results/types.ts';
import type { AfterRun, Site } from '../sites/types.ts';
import { runHooks } from './run.ts';
import type { Hooks } from './types.ts';

/** What went wrong in the after-run hooks, one line each. Nothing is thrown, so that what happened before them is not lost. */
async function afterRunFailures(site: Site, hooks: Hooks, run: RunSetup): Promise<string[]> {
  try {
    await runHooks(hooks, 'afterRun', { site, run });
    return [];
  } catch (error) {
    return [messageOf(error)];
  }
}

/** A failure with what went wrong after it, to throw in its place, so that neither is lost. The failure itself when nothing did. */
function withLater(failure: unknown, later: string[]): unknown {
  return later.length === 0 ? failure : new Error([messageOf(failure), ...later].join('; '));
}

/**
 * Starts a run on a site and returns the address of its MCP server: the site in its clean state, then the
 * before-run hooks, then the start marked, so that every reset returns to what those hooks left on the site.
 *
 * When a before-run hook fails, or the start can't be marked, the after-run hooks still run, because the
 * before-run point was reached. The failure is thrown after them, with what went wrong in them.
 */
export async function startRunOn(site: Site, hooks: Hooks, run: RunSetup): Promise<McpServer> {
  const mcpServer = await site.start();
  try {
    await runHooks(hooks, 'beforeRun', { site, run });
    await site.markStart();
  } catch (error) {
    throw withLater(error, await afterRunFailures(site, hooks, run));
  }
  return mcpServer;
}

/** The end of a run: the after-run hooks, then what the site file says happens to the site. What went wrong, one line each; nothing is thrown. */
async function endProblems(site: Site, hooks: Hooks, run: RunSetup, afterRun: AfterRun): Promise<string[]> {
  const problems = await afterRunFailures(site, hooks, run);
  try {
    if (afterRun === 'stop') await site.stop();
    if (afterRun === 'remove') await site.remove();
  } catch (error) {
    problems.push(`Site ${site.name} could not be ${afterRun === 'stop' ? 'stopped' : 'removed'} after the run: ${messageOf(error)}`);
  }
  return problems;
}

/**
 * Ends a run that `startRunOn` started, once its `work` is done: the after-run hooks, then what the site file
 * says happens to the site. The run ends whatever the work did, also when it threw.
 *
 * Returns what went wrong at the end, one line each. Nothing is thrown for it, so a run keeps the results of
 * its trials. When the work itself threw, there are no results to keep: its failure is thrown after the end,
 * with what went wrong there.
 */
export async function endRunOn(site: Site, hooks: Hooks, run: RunSetup, afterRun: AfterRun, work: () => Promise<void>): Promise<string[]> {
  try {
    await work();
  } catch (error) {
    throw withLater(error, await endProblems(site, hooks, run, afterRun));
  }
  return endProblems(site, hooks, run, afterRun);
}
