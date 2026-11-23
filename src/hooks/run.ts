// Runs the hooks a project names for one point of a run, in the order they are written. A hook is the
// project's own code, so a failure names the point and the hook: that is what its author needs to find it.

import type { CheckResult } from '../checks/types.ts';
import { HookFailedError, messageOf } from '../errors.ts';
import { isRecord, isText } from '../files/shape.ts';
import type { HookPoint, Hooks } from './types.ts';

/** What the hooks of a point get. */
type ContextOf<Point extends HookPoint> = Parameters<NonNullable<Hooks[Point]>[number]>[0];

/** How a failure names a hook: by the function's name, or by its place in the list when it has none. */
function nameOf(hook: { name: string }, index: number): string {
  return hook.name === '' ? `number ${index + 1} (a function without a name)` : `\`${hook.name}\``;
}

function isCheck(value: unknown): boolean {
  return isRecord(value) && isText(value.check) && typeof value.pass === 'boolean' && isText(value.reason);
}

/** The checks an after-trial hook returned. Node runs a project's code without checking its types, so their shape is checked here. */
function checksFrom(returned: unknown): CheckResult[] {
  if (returned === undefined) return [];
  if (!Array.isArray(returned) || !returned.every(isCheck)) {
    throw new Error(
      "it returned something that is not a list of checks. Return nothing, or a list such as `[{ check: 'no-email-sent', pass: true, reason: 'No email was sent' }]`: each check has its name, whether it passed and what was found",
    );
  }
  return returned.map(({ check, pass, reason }: CheckResult) => ({ check, pass, reason }));
}

/**
 * Runs the hooks of one point and returns the checks they add, which only after-trial hooks can. A
 * before-hook that fails stops the hooks after it, because they build on what it prepared. After-hooks clean
 * up, so each one runs whatever happened to the others. Throws `HookFailedError` with every failure.
 */
export async function runHooks<Point extends HookPoint>(hooks: Hooks, point: Point, context: ContextOf<Point>): Promise<CheckResult[]> {
  // `Hooks` gives each point's hooks the context this function is given for it, which the compiler can't see for a point it does not know yet.
  const ofPoint = (hooks[point] ?? []) as ((context: ContextOf<Point>) => unknown)[];
  const checks: CheckResult[] = [];
  const failures: string[] = [];
  for (const [index, hook] of ofPoint.entries()) {
    try {
      const returned = await hook(context);
      if (point === 'afterTrial') checks.push(...checksFrom(returned));
    } catch (error) {
      failures.push(`The \`${point}\` hook ${nameOf(hook, index)} failed: ${messageOf(error)}`);
      if (point.startsWith('before')) break;
    }
  }
  if (failures.length > 0) throw new HookFailedError(failures);
  return checks;
}
