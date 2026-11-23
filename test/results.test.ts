// A saved run is what a person, an agent and the viewer read afterwards. `run.json` has to say how every
// trial ended without the weight of the transcripts and the site readings, and a trial's own file has to
// explain the trial by itself.

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { test } from 'node:test';
import type { RunResult } from '../src/results/types.ts';
import { runFolder, writeRunFile, writeTrial } from '../src/results/write.ts';
import type { Scenario } from '../src/scenarios/types.ts';

const SCENARIO: Scenario = {
  id: 'core/site/which-php-version',
  request: 'Which PHP version does my site run on?',
  kind: 'read',
  expect: { abilities: ['core/get-environment-info'], answer: { contains: ['8.3'] } },
};
const PASSED = { check: 'answer-contains', pass: true, reason: 'The answer contains every expected text' };
const FAILED = { check: 'answer-contains', pass: false, reason: 'The answer does not contain "8.3"' };
const VERDICT = {
  scenarioId: SCENARIO.id,
  state: 'implemented' as const,
  outcome: 'fail' as const,
  agents: [
    { agent: 'claude-code', trials: 1, passed: 1 },
    { agent: 'codex', trials: 1, passed: 0 },
  ],
};
// What went wrong around the trials. It is saved with the run, because the summary on the screen is gone the next day.
const HOOK_FAILURE = 'core/site/which-php-version: The `afterScenario` hook `removeUploads` failed: The uploads folder can not be written to';
const CODEX_TRANSCRIPT = { answer: 'I can\u2019t tell.', toolCalls: [], versions: { agent: '0.165.0', model: 'gpt-5.6-sol' }, raw: [{ type: 'turn.completed' }] };
// The site as the agent found it and as it left it. Codex changed nothing.
const HELLO = { title: 'Hello world!', status: 'publish', content: 'Welcome.' };
const CODEX_SITE = { before: { posts: { 'hello-world': HELLO } }, after: { posts: { 'hello-world': HELLO } } };

// What the server checks found before the first trial. It is saved with the run, because the viewer reads it from there.
const SERVER_CHECKS = { outcome: 'compared' as const, onSite: ['core/get-environment-info'], missing: ['core/get-php-info'], inNoPack: ['core-get-site-info'] };

// What each agent ran on. It is saved with the run, because the model decides much of a result.
const MODELS = [
  { agent: 'claude-code', ran: [{ program: '2.1.328', model: 'claude-sonnet-5-5' }], judge: { name: 'gpt', model: 'gpt-6.2-sol' } },
  { agent: 'codex', ran: [{ program: '0.165.0', model: 'gpt-5.6-sol' }], judge: { name: 'claude', model: 'claude-sonnet-5-5' } },
];

const RUN: RunResult = {
  startedAt: '2026-11-19T07:33:53.788Z',
  site: 'local',
  agents: ['claude-code', 'codex'],
  trialsPerScenario: 1,
  serverChecks: SERVER_CHECKS,
  mcpServer: { name: 'wp' },
  models: MODELS,
  scenarios: [SCENARIO],
  trials: [
    {
      scenarioId: SCENARIO.id,
      agent: 'claude-code',
      trial: 1,
      pass: true,
      checks: [PASSED],
      transcript: { answer: 'PHP 8.3.36.', toolCalls: [], versions: { agent: '2.1.328', model: 'claude-sonnet-5-5' }, raw: [] },
      durationMs: 9000,
    },
    { scenarioId: SCENARIO.id, agent: 'codex', trial: 1, pass: false, checks: [FAILED], site: CODEX_SITE, transcript: CODEX_TRANSCRIPT, durationMs: 14000 },
  ],
  verdicts: [VERDICT],
  errors: [HOOK_FAILURE],
};

test('a run is saved as a short run.json and one file per trial, which holds the scenario it ran and the site before and after', async (t) => {
  const resultsDir = await mkdtemp(join(tmpdir(), 'evals-results-'));
  t.after(() => rm(resultsDir, { recursive: true, force: true }));

  const dir = runFolder(resultsDir, RUN.startedAt);
  for (const trial of RUN.trials) await writeTrial(dir, SCENARIO, trial);
  const runFile = await writeRunFile(dir, RUN);

  assert.equal(relative(resultsDir, runFile), join('2026-11-19T07-33-53Z', 'run.json'));
  assert.deepEqual(JSON.parse(await readFile(runFile, 'utf8')), {
    startedAt: '2026-11-19T07:33:53.788Z',
    site: 'local',
    agents: ['claude-code', 'codex'],
    trialsPerScenario: 1,
    serverChecks: SERVER_CHECKS,
    mcpServer: { name: 'wp' },
    models: MODELS,
    verdicts: [VERDICT],
    errors: [HOOK_FAILURE],
    trials: [
      { scenarioId: SCENARIO.id, agent: 'claude-code', trial: 1, pass: true, failed: [], durationMs: 9000, file: 'trials/core/site/which-php-version/claude-code.1.json' },
      { scenarioId: SCENARIO.id, agent: 'codex', trial: 1, pass: false, failed: [FAILED], durationMs: 14000, file: 'trials/core/site/which-php-version/codex.1.json' },
    ],
  });
  assert.deepEqual(JSON.parse(await readFile(join(dirname(runFile), 'trials/core/site/which-php-version/codex.1.json'), 'utf8')), {
    scenarioId: SCENARIO.id,
    agent: 'codex',
    trial: 1,
    pass: false,
    durationMs: 14000,
    scenario: SCENARIO,
    checks: [FAILED],
    site: CODEX_SITE,
    transcript: CODEX_TRANSCRIPT,
  });
});
