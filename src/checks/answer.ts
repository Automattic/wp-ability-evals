// Checks on the agent's answer. Code decides where it can; the judge grades only what code can't.

import { JudgeFailedError } from '../errors.ts';
import type { Check } from './types.ts';

/** The texts an answer does not contain, in any letter case. `verify` asks the same of a scenario's reference answer. */
export function textsMissingFrom(answer: string, texts: string[]): string[] {
  const lowered = answer.toLowerCase();
  return texts.filter((text) => !lowered.includes(text.toLowerCase()));
}

/** The answer contains every text the scenario names, in any letter case. */
export const answerContains: Check = ({ scenario, transcript }) => {
  const missing = textsMissingFrom(transcript.answer, scenario.expect.answer?.contains ?? []);
  const reason = missing.length > 0 ? `The answer does not contain ${missing.map((text) => JSON.stringify(text)).join(', ')}` : 'The answer contains every expected text';
  return { check: 'answer-contains', pass: missing.length === 0, reason };
};

/** The judge the agent names finds that the answer meets the scenario's rubric. A judge that gives no verdict throws, which makes the trial an error. */
export const answerMeetsRubric: Check = async ({ scenario, transcript, judge }) => {
  const rubric = scenario.expect.answer?.rubric;
  // A run does not start when a scenario with a rubric has no judge, so this only stops a caller that skipped that.
  if (rubric === undefined || judge === undefined) throw new JudgeFailedError(`${scenario.id} has no rubric, or its agent names no judge.`);
  const { pass, reason } = await judge.judge.grade({ request: scenario.request, answer: transcript.answer, rubric });
  return { check: 'answer-rubric', pass, reason, judge: judge.name };
};
