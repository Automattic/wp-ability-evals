// `verify` proves a scenario before an agent spends anything on it. A wrong decision there would accept a
// scenario that passes when nothing happened, or fail one because a judge gave no verdict, and its output is
// all an agent has to fix a scenario with. The site and the judges are real programs, so the command is
// checked by hand; these tests hold what its steps decide and what it prints.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { siteCheckOf } from '../src/checks/site.ts';
import type { SiteState } from '../src/entities/types.ts';
import { SiteChangeFailedError } from '../src/errors.ts';
import type { SiteChange, SiteExpectation } from '../src/scenarios/types.ts';
import { isProved, proofLines, summaryLines } from '../src/verify/report.ts';
import { changeStep, changeStoppedStep, changeToMake, containsStep, labelInUseStep, noChangeStep, rubricStep } from '../src/verify/steps.ts';
import type { JudgeGradings, Proof, Step, VerifyResult } from '../src/verify/types.ts';

const HELLO = { title: 'Hello world!', status: 'publish', content: 'Welcome.' };
const DRAFT = { title: 'Summer sale', status: 'draft', content: 'Everything is 20% off.' };
// The site as a scenario starts on it, and as it is once the draft is published.
const START: SiteState = { posts: { 'hello-world': HELLO, 'summer-sale': DRAFT } };
const PUBLISHED: SiteState = { posts: { 'hello-world': HELLO, 'summer-sale': { ...DRAFT, status: 'publish' } } };
const PUBLISH_THE_DRAFT: SiteExpectation = { posts: { 'summer-sale': { status: 'publish' } } };
// A change that names a draft the site does not start with, and no title for the writer to create it with.
const PUBLISH_A_DRAFT_THAT_IS_NOT_THERE: SiteExpectation = { posts: { 'autumn-sale': { status: 'publish' } } };
// A scenario that expects a draft the agent writes, and a text added to the draft that is there.
const ANNOUNCE_THE_SALE: SiteExpectation = {
  posts: {
    'sale-announcement': { $new: true, title: 'Sale announcement', status: 'draft', content: { $contains: ['20%', 'July'] } },
    'summer-sale': { content: { $contains: ['July'] } },
  },
};
// What the writers make of it: plain values, with the new draft under its label.
const ANNOUNCEMENT_MADE: SiteChange = {
  posts: {
    'sale-announcement': { title: 'Sale announcement', status: 'draft', content: '20% July' },
    'summer-sale': { content: 'Everything is 20% off. July' },
  },
};
// The site once that change is made.
const ANNOUNCED: SiteState = {
  posts: {
    'hello-world': HELLO,
    'summer-sale': { ...DRAFT, content: 'Everything is 20% off. July' },
    'sale-announcement': { title: 'Sale announcement', status: 'draft', content: '20% July' },
  },
};

test('the change the writers make has plain values: a new item under its label, and the texts of `$contains` after what the field starts with', () => {
  assert.deepEqual(changeToMake(ANNOUNCE_THE_SALE, START), ANNOUNCEMENT_MADE);
});

const STEPS: { name: string; found: Step | undefined; step: Step }[] = [
  {
    name: 'a scenario that expects a change passes the "no change" step when its site check fails with nothing done',
    found: noChangeStep(siteCheckOf(START, START, PUBLISH_THE_DRAFT), PUBLISH_THE_DRAFT),
    step: { step: 'no change', outcome: 'pass', found: 'fails, as it should: posts summer-sale: status is "draft", expected "publish"' },
  },
  {
    name: 'a scenario whose expected change already holds when it starts fails the "no change" step',
    found: noChangeStep(siteCheckOf(PUBLISHED, PUBLISHED, PUBLISH_THE_DRAFT), PUBLISH_THE_DRAFT),
    step: {
      step: 'no change',
      outcome: 'fail',
      found:
        'the site check passes with nothing done, and it must fail. The site already is as `expect.site` says when the scenario starts, so a trial would pass with an agent that did nothing. That is a mistake in the scenario: its `given` must start the site without the change that `expect.site` names',
    },
  },
  {
    name: 'a scenario passes the "the change" step when the site check accepts the change the writers made',
    found: changeStep(siteCheckOf(START, PUBLISHED, PUBLISH_THE_DRAFT), START, PUBLISH_THE_DRAFT),
    step: { step: 'the change', outcome: 'pass', found: 'passes' },
  },
  {
    name: 'a scenario fails the "the change" step when the writers can not make its change, and learns which item the site does not start with',
    found: changeStoppedStep(new SiteChangeFailedError('local', 'posts autumn-sale: Content, title, and excerpt are empty.'), START, PUBLISH_A_DRAFT_THAT_IS_NOT_THERE),
    step: {
      step: 'the change',
      outcome: 'fail',
      found:
        'Site local could not be changed: posts autumn-sale: Content, title, and excerpt are empty; the change creates posts autumn-sale, which the site does not start with: right where the agent creates it under this key. Otherwise either a key is mistyped, so check it against `given` and `site state`, or the site chooses the key, so mark it `$new: true`',
    },
  },
  {
    name: 'a scenario that expects a new item passes the "the change" step once the writers created it under its label, with no word about its key',
    found: changeStep(siteCheckOf(START, ANNOUNCED, ANNOUNCE_THE_SALE), START, ANNOUNCE_THE_SALE),
    step: { step: 'the change', outcome: 'pass', found: 'passes' },
  },
  {
    name: 'a scenario fails the "the change" step when the label of its new item is the key of an item the site starts with',
    found: labelInUseStep(START, { posts: { 'summer-sale': { $new: true, status: 'draft' } } }),
    step: {
      step: 'the change',
      outcome: 'fail',
      found:
        "`expect.site` marks posts summer-sale as `$new`, and the site starts with an item under that key. The writers create a new item under its label, so they can't make this change. If the scenario means the item that is there, remove `$new`. If the agent should create another one, choose a label that is not a key on the site",
    },
  },
  {
    name: 'a scenario whose `contains` has no reference answer next to it gets a "contains" step that says it was not checked',
    found: containsStep(undefined, ['7.1.4']),
    step: {
      step: 'contains',
      outcome: 'skipped',
      found: 'not checked, because the scenario has no `expect.answer.reference`: an answer that should pass, in which the texts are looked for',
    },
  },
];

for (const { name, found, step } of STEPS) {
  test(name, () => {
    assert.deepEqual(found, step);
  });
}

// What a judge said of the two answers next to a rubric. `reference` should pass the rubric and `wrong` should fail it.
const RIGHT_OF_REFERENCE = { pass: true, reason: 'The answer says the tagline was not changed, and why.' };
const RIGHT_OF_WRONG = { pass: false, reason: 'The answer says the tagline was changed.' };
const NO_VERDICT = { noVerdict: 'The Codex judge ended without a verdict.' };

const RUBRIC_STEPS: { name: string; gradings: JudgeGradings[]; step: Step }[] = [
  {
    name: 'passes when every judge passes the reference answer and fails the wrong one',
    gradings: [
      { judge: 'claude', reference: RIGHT_OF_REFERENCE, wrong: RIGHT_OF_WRONG },
      { judge: 'gpt', reference: RIGHT_OF_REFERENCE, wrong: RIGHT_OF_WRONG },
    ],
    step: { step: 'rubric', outcome: 'pass', found: 'claude and gpt pass the reference answer and fail the wrong one' },
  },
  {
    name: 'fails when a judge fails the reference answer or passes the wrong one, and names each',
    gradings: [
      { judge: 'claude', reference: { pass: false, reason: 'The answer does not say why.' }, wrong: RIGHT_OF_WRONG },
      { judge: 'gpt', reference: RIGHT_OF_REFERENCE, wrong: { pass: true, reason: 'The answer names the tagline.' } },
    ],
    step: {
      step: 'rubric',
      outcome: 'fail',
      found:
        'claude fails the reference answer ("The answer does not say why."); gpt passes the wrong answer ("The answer names the tagline."). A judge grades by the rubric alone: make it say what `reference` has and `wrong` lacks, or correct the answer that is not what its name says',
    },
  },
  {
    name: 'could not be checked, and did not fail, when a judge gave no verdict',
    gradings: [
      { judge: 'claude', reference: RIGHT_OF_REFERENCE, wrong: RIGHT_OF_WRONG },
      { judge: 'gpt', reference: RIGHT_OF_REFERENCE, wrong: NO_VERDICT },
    ],
    step: { step: 'rubric', outcome: 'unchecked', found: 'gpt gave no verdict on the wrong answer (The Codex judge ended without a verdict.)' },
  },
  {
    name: 'could not be checked when the settings have no judge to grade the answers',
    gradings: [],
    step: {
      step: 'rubric',
      outcome: 'unchecked',
      found: 'no judge graded the answers, because evals.config.ts has no `judges`. Add them there, or pass --no-judges to leave the grading out',
    },
  },
];

for (const { name, gradings, step } of RUBRIC_STEPS) {
  test(`the rubric step ${name}`, () => {
    assert.deepEqual(rubricStep(gradings), step);
  });
}

const PASSED: Proof = {
  scenarioId: 'core/site/change-the-tagline',
  steps: [
    { step: 'start', outcome: 'pass', found: 'no given items; the site is at its marked start' },
    { step: 'no change', outcome: 'pass', found: 'passes, as it should: the scenario expects no change' },
    { step: 'contains', outcome: 'skipped', found: 'not checked, because the scenario has no `expect.answer.reference`: an answer that should pass, in which the texts are looked for' },
    { step: 'rubric', outcome: 'skipped', found: 'not graded, because of --no-judges' },
  ],
};
const FAILED: Proof = {
  scenarioId: 'content/publish-a-draft/by-its-topic',
  steps: [
    { step: 'start', outcome: 'pass', found: '2 given items found on the site' },
    { step: 'no change', outcome: 'pass', found: 'fails, as it should: posts autumn-sale: expected, but not found' },
    { step: 'the change', outcome: 'fail', found: 'Site local could not be changed: posts autumn-sale: Content, title, and excerpt are empty.' },
  ],
};
const UNCHECKED: Proof = {
  scenarioId: 'content/publish-a-draft/no-such-draft',
  steps: [{ step: 'start', outcome: 'unchecked', found: 'The `beforeTrial` hook `seedTheShop` failed: The shop plugin is not active' }],
};
const HOOK_FAILURE = 'content/publish-a-draft/by-its-topic: The `afterTrial` hook `removeUploads` failed: The uploads folder can not be written to';

test('the output has each scenario with one line per step, what is not covered, and a last line with the counts', () => {
  const result: VerifyResult = { proofs: [PASSED, FAILED, UNCHECKED], errors: [HOOK_FAILURE] };

  assert.deepEqual(
    [...result.proofs.flatMap(proofLines), ...summaryLines(result)],
    [
      'core/site/change-the-tagline',
      '  start       no given items; the site is at its marked start',
      '  no change   passes, as it should: the scenario expects no change',
      '  contains    not checked, because the scenario has no `expect.answer.reference`: an answer that should pass, in which the texts are looked for',
      '  rubric      not graded, because of --no-judges',
      'content/publish-a-draft/by-its-topic',
      '  start       2 given items found on the site',
      '  no change   fails, as it should: posts autumn-sale: expected, but not found',
      '  the change  FAILED: Site local could not be changed: posts autumn-sale: Content, title, and excerpt are empty.',
      'content/publish-a-draft/no-such-draft',
      '  start       COULD NOT BE CHECKED: The `beforeTrial` hook `seedTheShop` failed: The shop plugin is not active',
      'Something went wrong around the steps:',
      `  ${HOOK_FAILURE}`,
      '`expect.abilities` and `expect.forbidden` are not covered, because no agent runs: only a run shows which abilities an agent executes.',
      '3 scenarios checked: 1 passed, 1 failed, 1 could not be checked. 1 `contains` not checked, without a `reference` answer. 1 rubric not graded, because of --no-judges. 1 error around the steps.',
    ],
  );
});

const ENDINGS: { name: string; result: VerifyResult; proved: boolean }[] = [
  { name: 'without an error when every step passed, also where a rubric was not graded and a `contains` not checked', result: { proofs: [PASSED] }, proved: true },
  { name: 'with an error when a step failed', result: { proofs: [PASSED, FAILED] }, proved: false },
  { name: 'with an error when a step could not be checked', result: { proofs: [PASSED, UNCHECKED] }, proved: false },
  { name: 'with an error when a hook failed around the steps', result: { proofs: [PASSED], errors: [HOOK_FAILURE] }, proved: false },
];

for (const { name, result, proved } of ENDINGS) {
  test(`verify ends ${name}`, () => {
    assert.equal(isProved(result), proved);
  });
}
