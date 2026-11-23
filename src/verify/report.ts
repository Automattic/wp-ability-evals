// What `verify` prints, and whether it ends with an error. Agents read this output to learn what to fix in
// a scenario, so every scenario gets its id and one line per step with what was found, and a step that did
// not pass starts with a word in capitals that can be searched for.

import type { Proof, Step, StepName, StepOutcome, VerifyResult } from './types.ts';

/** What a step's line starts with, after the step's name. A step that passed or was left out reads as what was found. */
const MARKS: Record<StepOutcome, string> = { pass: '', skipped: '', fail: 'FAILED: ', unchecked: 'COULD NOT BE CHECKED: ' };

/** How a proof ended, in the order the last line counts them. */
const ENDINGS = ['passed', 'failed', 'could not be checked'] as const;
type Ending = (typeof ENDINGS)[number];

// The longest name of a step, so that what was found starts in one column.
const LONGEST_NAME: StepName = 'the change';

/** A proof fails with one failed step. Without one, a step that could not be checked leaves the scenario unproved. */
function endingOf({ steps }: Proof): Ending {
  if (steps.some((step) => step.outcome === 'fail')) return 'failed';
  return steps.some((step) => step.outcome === 'unchecked') ? 'could not be checked' : 'passed';
}

function counted(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

/** The lines of one scenario: its id, then each step with what was found. */
export function proofLines(proof: Proof): string[] {
  return [proof.scenarioId, ...proof.steps.map((step: Step) => `  ${step.step.padEnd(LONGEST_NAME.length)}  ${MARKS[step.outcome]}${step.found}`)];
}

/**
 * The lines shown when every scenario was proved: what went wrong around the steps, what the command does
 * not cover, and a last line with the counts, among them the steps that were left out.
 */
export function summaryLines({ proofs, errors }: VerifyResult): string[] {
  const lines: string[] = [];
  if (errors !== undefined) lines.push('Something went wrong around the steps:', ...errors.map((error) => `  ${error}`));
  lines.push('`expect.abilities` and `expect.forbidden` are not covered, because no agent runs: only a run shows which abilities an agent executes.');
  const counts = ENDINGS.map((ending) => ({ ending, count: proofs.filter((proof) => endingOf(proof) === ending).length }))
    .filter(({ count }) => count > 0)
    .map(({ ending, count }) => `${count} ${ending}`);
  // A step that was left out says nothing against its scenario, so it is counted here for what stays unproved.
  const leftOut = (name: StepName): number => proofs.flatMap((proof) => proof.steps).filter((step) => step.step === name && step.outcome === 'skipped').length;
  const [notChecked, notGraded] = [leftOut('contains'), leftOut('rubric')];
  const last = [`${counted(proofs.length, 'scenario')} checked: ${counts.join(', ')}.`];
  if (notChecked > 0) last.push(`${notChecked} \`contains\` not checked, without a \`reference\` answer.`);
  if (notGraded > 0) last.push(`${counted(notGraded, 'rubric')} not graded, because of --no-judges.`);
  if (errors !== undefined) last.push(`${counted(errors.length, 'error')} around the steps.`);
  return [...lines, last.join(' ')];
}

/** Whether every scenario passed every step that was taken, and nothing went wrong around them. Anything else ends the command with an error. */
export function isProved(result: VerifyResult): boolean {
  return result.errors === undefined && result.proofs.every((proof) => endingOf(proof) === 'passed');
}
