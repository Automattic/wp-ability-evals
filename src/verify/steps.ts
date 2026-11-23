// What each step of a proof decides, from what was found on the site or said by the judges. Nothing here
// reaches a site or a judge, so the rules that turn a finding into a step can be tested with plain values.
// A step passes when it shows what a run relies on, which for the "no change" step is a site check that fails.
// Which change the writers make for a scenario's `expect.site` is decided here too.

import { textsMissingFrom } from '../checks/answer.ts';
import type { CheckResult } from '../checks/types.ts';
import type { SiteState } from '../entities/types.ts';
import { SiteChangeFailedError, SiteNotPreparedError, messageOf } from '../errors.ts';
import { isText } from '../files/shape.ts';
import { containsOf, fieldsOf, isNew } from '../scenarios/operators.ts';
import type { ExpectedItem, SiteChange, SiteExpectation, StartingContent } from '../scenarios/types.ts';
import type { Grading, JudgeGradings, Step, StepName } from './types.ts';

/** The rubric step of a proof that was asked to leave the judges out. */
export const RUBRIC_NOT_GRADED: Step = { step: 'rubric', outcome: 'skipped', found: 'not graded, because of --no-judges' };

/** "claude", "claude and gpt", "claude, gpt and gemini". */
function listed(names: string[]): string {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** The start step of a scenario whose site was prepared and found to start as declared. */
export function startStep(given: StartingContent = {}): Step {
  const items = Object.values(given).reduce((count, ofType) => count + Object.keys(ofType).length, 0);
  const found = items === 0 ? 'no given items; the site is at its marked start' : `${items} given ${items === 1 ? 'item' : 'items'} found on the site`;
  return { step: 'start', outcome: 'pass', found };
}

/**
 * A step that an error stopped. The scenario is at fault where the site does not start as it declares, or
 * where the writers can't make the change it expects. Anything else, such as a hook that failed or a site
 * that did not answer, says nothing about the scenario: the step could not be checked.
 */
export function stoppedStep(step: StepName, error: unknown): Step {
  const atFault = error instanceof SiteNotPreparedError || error instanceof SiteChangeFailedError;
  return { step, outcome: atFault ? 'fail' : 'unchecked', found: messageOf(error) };
}

/**
 * The "no change" step, from what the site check found on a site that was read twice with nothing done in
 * between. A scenario that expects a change must fail it: one that passes would also pass a trial in which
 * the agent did nothing. A scenario that expects no change must pass it.
 */
export function noChangeStep(check: CheckResult, expected: SiteExpectation | undefined): Step {
  const step = 'no change';
  if (expected !== undefined) {
    if (!check.pass) return { step, outcome: 'pass', found: `fails, as it should: ${check.reason}` };
    const found =
      'the site check passes with nothing done, and it must fail. The site already is as `expect.site` says when the scenario starts, so a trial would pass with an agent that did nothing. That is a mistake in the scenario: its `given` must start the site without the change that `expect.site` names';
    return { step, outcome: 'fail', found };
  }
  if (check.pass) return { step, outcome: 'pass', found: 'passes, as it should: the scenario expects no change' };
  const found = `the site check fails with nothing done, and it must pass: ${check.reason}. The site was read twice with nothing done in between, so the reader of an entity type reports a value that changes by itself`;
  return { step, outcome: 'fail', found };
}

/** The items of `expect.site` that `chosen` picks, each as its entity type and its key. */
function itemsWhere(expected: SiteExpectation, chosen: (item: ExpectedItem | 'removed', type: string, key: string) => boolean): string[] {
  return Object.entries(expected).flatMap(([type, items]) =>
    Object.entries(items)
      .filter(([key, item]) => chosen(item, type, key))
      .map(([key]) => `${type} ${key}`),
  );
}

/**
 * The "the change" step of a scenario that marks an item `$new` under a label that is the key of an item the
 * site starts with, or nothing where no label is. The writers create a new item under its label. Here they
 * would change the item that is there instead, which proves nothing about a new one, so the change is not made.
 */
export function labelInUseStep(before: SiteState, expected: SiteExpectation): Step | undefined {
  const inUse = itemsWhere(expected, (item, type, key) => isNew(item) && before[type]?.[key] !== undefined);
  if (inUse.length === 0) return undefined;
  const [anItem, thatKey] = inUse.length === 1 ? ['an item', 'that key'] : ['items', 'those keys'];
  const found = `\`expect.site\` marks ${listed(inUse)} as \`$new\`, and the site starts with ${anItem} under ${thatKey}. The writers create a new item under its label, so they can't make this change. If the scenario means the item that is there, remove \`$new\`. If the agent should create another one, choose a label that is not a key on the site`;
  return { step: 'the change', outcome: 'fail', found };
}

/**
 * The change the site's writers make in the agent's place: what `expect.site` says, with plain values only,
 * as a site takes a change. An item marked `$new` is created under its label as its key. A field with
 * `$contains` gets its texts, joined by a space. On an item the site starts with they follow the text the
 * field starts with, so that the change adds to the field, as an agent that was asked for the texts would.
 */
export function changeToMake(expected: SiteExpectation, before: SiteState): SiteChange {
  const made = (type: string, key: string, item: ExpectedItem): Record<string, unknown> => {
    const fields = Object.entries(fieldsOf(item)).map(([field, value]) => {
      const texts = containsOf(value);
      if (texts === undefined) return [field, value];
      const current = before[type]?.[key]?.[field];
      return [field, [...(isText(current) ? [current] : []), ...texts].join(' ')];
    });
    return Object.fromEntries(fields);
  };
  const changes = Object.entries(expected).map(([type, items]) => {
    const ofType = Object.entries(items).map(([key, item]) => [key, item === 'removed' ? item : made(type, key, item)]);
    return [type, Object.fromEntries(ofType)];
  });
  return Object.fromEntries(changes);
}

/**
 * What was found, with what to know about a change that names items by a key the site does not start with.
 * Making such a change creates the item, which is right for an item the agent should create under that very
 * key and hides a mistyped key of one that is there. An item marked `$new` is not named: it says itself that
 * it is created.
 */
function withCreated(found: string, before: SiteState, expected: SiteExpectation): string {
  const created = itemsWhere(expected, (item, type, key) => item !== 'removed' && !isNew(item) && before[type]?.[key] === undefined);
  if (created.length === 0) return found;
  const [them, keys] = created.length === 1 ? ['it', 'this key'] : ['them', 'these keys'];
  // Said as what happened, not as a warning: a scenario where the agent creates an item under a key it can
  // know, such as a slug made from a name, passes with this line too.
  const note = `the change creates ${listed(created)}, which the site does not start with: right where the agent creates ${them} under ${keys}. Otherwise either a key is mistyped, so check it against \`given\` and \`site state\`, or the site chooses the key, so mark ${them} \`$new: true\``;
  // What a site said may end with a full stop of its own.
  return `${found.replace(/\.$/, '')}; ${note}`;
}

/**
 * The "the change" step, from what the site check found once the site's writers made `expect.site` on a
 * site that started as `before`. It must pass: this is what a trial finds when the agent does the task.
 */
export function changeStep(check: CheckResult, before: SiteState, expected: SiteExpectation): Step {
  const step = 'the change';
  if (check.pass) return { step, outcome: 'pass', found: withCreated('passes', before, expected) };
  // The writers create one item for each item marked `$new`, so several fit one of them only where two are written alike.
  const alike = itemsWhere(expected, (item) => isNew(item)).length > 1 ? '. Where several created items fit an item marked `$new`, its fields do not tell it apart from another new item: name one that does' : '';
  const found = `the site check does not accept the change that the writers made from \`expect.site\`: ${check.reason}. Where the site saved another value than \`expect.site\` names, write the value as \`site state\` prints it${alike}`;
  return { step, outcome: 'fail', found: withCreated(found, before, expected) };
}

/** The "the change" step that an error stopped, such as a writer that could not make the change on a site that started as `before`. */
export function changeStoppedStep(error: unknown, before: SiteState, expected: SiteExpectation): Step {
  const step = stoppedStep('the change', error);
  return { ...step, found: withCreated(step.found, before, expected) };
}

/**
 * The "contains" step: an answer that should pass must hold every text the scenario asks an answer for. A
 * scenario may leave that answer out, and its texts are then compared with nothing: the step says so, and it
 * is left out as the grading of a rubric is with `--no-judges`, so that the scenario does not read as proved in full.
 */
export function containsStep(reference: string | undefined, texts: string[]): Step {
  const step = 'contains';
  if (reference === undefined) {
    const found = 'not checked, because the scenario has no `expect.answer.reference`: an answer that should pass, in which the texts are looked for';
    return { step, outcome: 'skipped', found };
  }
  const missing = textsMissingFrom(reference, texts);
  if (missing.length === 0) return { step, outcome: 'pass', found: 'the reference answer contains every text' };
  const found = `the reference answer does not contain ${missing.map((text) => JSON.stringify(text)).join(', ')}. \`expect.answer.reference\` is an answer that should pass, so it must hold every text of \`expect.answer.contains\``;
  return { step, outcome: 'fail', found };
}

function hasNoVerdict(grading: Grading): grading is { noVerdict: string } {
  return 'noVerdict' in grading;
}

/**
 * The "rubric" step, from what every judge said of the two answers next to the rubric. Each judge must pass
 * the reference answer and fail the wrong one. A judge that gave no verdict decides nothing: without a judge
 * that decided wrongly, the step could not be checked, and it never counts as a failure.
 */
export function rubricStep(gradings: JudgeGradings[]): Step {
  const step = 'rubric';
  if (gradings.length === 0) {
    const found = 'no judge graded the answers, because evals.config.ts has no `judges`. Add them there, or pass --no-judges to leave the grading out';
    return { step, outcome: 'unchecked', found };
  }
  const wronglyGraded: string[] = [];
  const notGraded: string[] = [];
  for (const { judge, reference, wrong } of gradings) {
    if (hasNoVerdict(reference)) notGraded.push(`${judge} gave no verdict on the reference answer (${reference.noVerdict})`);
    else if (!reference.pass) wronglyGraded.push(`${judge} fails the reference answer ("${reference.reason}")`);
    if (hasNoVerdict(wrong)) notGraded.push(`${judge} gave no verdict on the wrong answer (${wrong.noVerdict})`);
    else if (wrong.pass) wronglyGraded.push(`${judge} passes the wrong answer ("${wrong.reason}")`);
  }
  if (wronglyGraded.length > 0) {
    const advice = 'A judge grades by the rubric alone: make it say what `reference` has and `wrong` lacks, or correct the answer that is not what its name says';
    return { step, outcome: 'fail', found: `${[...wronglyGraded, ...notGraded].join('; ')}. ${advice}` };
  }
  if (notGraded.length > 0) return { step, outcome: 'unchecked', found: notGraded.join('; ') };
  const judges = gradings.map(({ judge }) => judge);
  const found = judges.length === 1 ? `${judges[0]} passes the reference answer and fails the wrong one` : `${listed(judges)} pass the reference answer and fail the wrong one`;
  return { step, outcome: 'pass', found };
}
