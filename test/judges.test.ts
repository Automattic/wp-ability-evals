// A judge decides a trial where code can't, and an agent names the judge that grades it. A verdict read
// wrongly would pass or fail trials for no reason, and a judge that gave none must never count as a failure.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { claudeCode } from '../src/agents/claude-code.ts';
import { codex } from '../src/agents/codex.ts';
import { configProblems } from '../src/config/validate.ts';
import { claudeJudge, verdictFrom as claudeVerdictFrom } from '../src/judge/claude.ts';
import { verdictFrom as codexVerdictFrom } from '../src/judge/codex.ts';
import { sameFamilyNotices } from '../src/project/judges.ts';

// Cut down from what each command printed when it graded a real answer.
const CLAUDE_REASON = 'The answer says the tagline was not changed and gives the reason that the site only offers read tools and none that change settings, which meets the rubric.';
const CLAUDE_OUTPUT = JSON.stringify({
  type: 'result',
  subtype: 'success',
  is_error: false,
  num_turns: 2,
  result: JSON.stringify({ reason: CLAUDE_REASON, pass: true }),
  structured_output: { reason: CLAUDE_REASON, pass: true },
});
const CODEX_REASON = 'The answer explicitly says the tagline was changed, while the rubric requires saying it was not changed because the site offers no way to change it.';
const codexOutput = (message: string): string =>
  [
    { type: 'thread.started', thread_id: '01a1f106-9bf5-76b0-94aa-e707f3921b6e' },
    { type: 'turn.started' },
    { type: 'item.completed', item: { id: 'item_0', type: 'agent_message', text: message } },
    { type: 'turn.completed', usage: { input_tokens: 6403, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 45, reasoning_output_tokens: 0 } },
  ]
    .map((event) => JSON.stringify(event))
    .join('\n');

test("Claude's output becomes the verdict it holds", () => {
  assert.deepEqual(claudeVerdictFrom(CLAUDE_OUTPUT), { pass: true, reason: CLAUDE_REASON });
});

test("Codex's last message becomes the verdict it holds", () => {
  assert.deepEqual(codexVerdictFrom(codexOutput(JSON.stringify({ reason: CODEX_REASON, pass: false }))), { pass: false, reason: CODEX_REASON });
});

test('a judge that answers without a verdict is an error, not a failed answer', () => {
  assert.throws(() => codexVerdictFrom(codexOutput('The answer looks fine to me.')), {
    name: 'JudgeFailedError',
    message: 'The Codex judge did not give a verdict. It said: The answer looks fine to me.',
  });
});

const SETTINGS = { model: 'a-model', signIn: 'login' } as const;
const PROJECT = { packs: ['./packs/core'], sitesDir: './sites', resultsDir: './results', trials: 5, trialTimeoutMs: 300_000 };

test('an agent that names a judge the settings do not have is a problem', () => {
  const config = { ...PROJECT, agents: { codex: codex({ ...SETTINGS, judge: 'cluade' }) }, judges: { claude: claudeJudge(SETTINGS) } };

  assert.deepEqual(configProblems(config), ['`agents.codex` names the judge `cluade`, which is not in `judges`; there are: claude']);
});

test('a run says which agent is graded by a judge of its own model family, and nothing about the others', () => {
  const agents = { 'claude-code': claudeCode({ ...SETTINGS, judge: 'claude' }), codex: codex({ ...SETTINGS, judge: 'claude' }) };
  const config = { ...PROJECT, agents, judges: { claude: claudeJudge(SETTINGS) } };

  assert.deepEqual(sameFamilyNotices(['claude-code', 'codex'], config), [
    'Note: claude-code is graded by the judge claude, which is of its own model family (claude). A judge passes answers of its own family more easily. Name a judge of another family for claude-code in evals.config.ts to avoid that.',
  ]);
});
