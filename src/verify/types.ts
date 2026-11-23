// What `verify` finds: a proof of each scenario, made on a site without an agent. A scenario decides what a
// run costs and what its result means, so it is proved before an agent spends anything on it: its starting
// content can be on the site, its site check tells a site that changed as expected from one that did not,
// and its rubric tells a right answer from a wrong one.

import type { JudgeVerdict } from '../judge/types.ts';

/**
 * The steps of a proof, by the name the output shows.
 * - `start`: the site is prepared as for a trial, and must start as the scenario declares.
 * - `no change`: with nothing done, the site check must fail where a change is expected, and pass where none is.
 * - `the change`: with `expect.site` made through the site's writers, the site check must pass.
 * - `contains`: the reference answer must contain every text of `expect.answer.contains`. Without a reference
 *   answer the texts are compared with nothing, and the step says so.
 * - `rubric`: every judge must pass the reference answer and fail the wrong one.
 */
export type StepName = 'start' | 'no change' | 'the change' | 'contains' | 'rubric';

/**
 * How a step ended.
 * - `pass`: it showed what it must show.
 * - `fail`: it showed the opposite, so the scenario, or what prepares the site for it, has a mistake.
 * - `unchecked`: something else stopped it, such as a hook that failed, a site that did not answer or a judge
 *   that gave no verdict. It says nothing about the scenario, and it is never a failure.
 * - `skipped`: it was left out, as the grading of a rubric is with `--no-judges`, and `contains` where the
 *   scenario has no reference answer. It is never a failure, and the last line of the output counts it.
 */
export type StepOutcome = 'pass' | 'fail' | 'unchecked' | 'skipped';

export interface Step {
  step: StepName;
  outcome: StepOutcome;
  /** What was found, in words an agent can act on. */
  found: string;
}

/** The proof of one scenario: the steps that apply to it, in the order they were taken. */
export interface Proof {
  scenarioId: string;
  steps: Step[];
}

/** What a judge said of one answer: its verdict, or why it gave none. */
export type Grading = JudgeVerdict | { noVerdict: string };

/** What one judge said of the two answers next to a rubric. */
export interface JudgeGradings {
  /** The judge's name in the project's settings. */
  judge: string;
  /** Of `expect.answer.reference`, which should pass the rubric. */
  reference: Grading;
  /** Of `expect.answer.wrong`, which should fail it. */
  wrong: Grading;
}

export interface VerifyResult {
  /** One proof per scenario, in the order of the project's files. */
  proofs: Proof[];
  /**
   * Set when something went wrong around the steps, one line each: an after-trial, an after-scenario or an
   * after-run hook failed, or the site could not be stopped or removed afterwards. The proofs still count,
   * and the command ends with an error.
   */
  errors?: string[];
}
