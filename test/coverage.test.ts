// Coverage is the number an executive reads per ability, so it must count by the agreed rule: from each
// scenario's latest verdict, a failing scenario counted against every ability it names without calling any of
// them an error, "ran in" for a passing scenario whether it names the ability or not, and calls mapped to
// abilities as the checks map them, through either presentation of the site's server. The Overview's headline,
// what needs attention and the gap list are read from the same counts.

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { ToolCall } from '../src/agents/types.ts';
import { trendOf } from '../src/coverage/coverage.ts';
import { readOverview } from '../src/coverage/read.ts';
import type { Pack } from '../src/packs/types.ts';
import type { DefinitionFinding, RunListing, RunResult, TrialResult } from '../src/results/types.ts';
import { runFolder, writeRunFile, writeServerSnapshot, writeTrial } from '../src/results/write.ts';
import type { Scenario } from '../src/scenarios/types.ts';

const RENAME: Scenario = { id: 'core/site/rename', request: 'Call my site Bakery.', kind: 'write', expect: { abilities: ['core/get-site-info', 'core/update-site-title'] } };
const READ: Scenario = { id: 'core/site/read', request: 'What is my site called?', kind: 'read', expect: { abilities: ['core/get-site-info'], answer: { rubric: 'It names the site.' } } };
const PUBLISH: Scenario = { id: 'core/posts/publish', request: 'Publish my draft.', kind: 'write', state: 'to-be-implemented', reason: 'Not built.', expect: { abilities: ['core/publish-post'] } };
const PACK: Pack = {
  name: 'core',
  title: 'WordPress',
  abilities: { reads: ['core/get-site-info', 'core/get-user-info'], writes: ['core/update-site-title', 'core/publish-post'] },
  entities: [],
  dir: '',
  stories: [
    { file: 'site', text: 'As a site owner I want to manage my site by asking.', scenarioIds: [RENAME.id, READ.id] },
    { file: 'posts', text: 'As a site owner I want to publish by asking.', scenarioIds: [PUBLISH.id] },
  ],
  scenarios: [RENAME, READ, PUBLISH],
};
const LOOKUP = {
  runTools: [{ tool: 'mcp-adapter-execute-ability', nameArgument: 'ability_name', inputArgument: 'parameters' }],
  otherTools: ['mcp-adapter-discover-abilities'],
};

function call(server: string, tool: string, input: unknown, isError = false): ToolCall {
  return { server, tool, input, output: isError ? 'Sorry, you are not allowed to do that.' : '{}', isError };
}

function trial(scenario: Scenario, pass: boolean, toolCalls: ToolCall[], model = 'gpt-6.2-sol'): TrialResult {
  return { scenarioId: scenario.id, agent: 'codex', trial: 1, pass, checks: [], durationMs: 1, transcript: { answer: '', toolCalls, versions: { agent: '0.165.0', model }, raw: [] } };
}

function run(startedAt: string, trials: TrialResult[], outcomes: Record<string, 'pass' | 'fail'>, missing: string[], definitionFindings?: DefinitionFinding[]): RunResult {
  const scenarios = [RENAME, READ].filter((scenario) => outcomes[scenario.id] !== undefined);
  return {
    startedAt,
    site: 'local',
    agents: ['codex'],
    trialsPerScenario: 1,
    serverChecks: { outcome: 'compared', onSite: [], missing, inNoPack: [], ...(definitionFindings === undefined ? {} : { definitionFindings }) },
    mcpServer: { name: 'wp', lookup: LOOKUP },
    models: [{ agent: 'codex', ran: [], judge: { name: 'claude', model: 'claude-sonnet-5-5' } }],
    scenarios,
    trials,
    verdicts: scenarios.map((scenario) => ({
      scenarioId: scenario.id,
      state: 'implemented',
      outcome: outcomes[scenario.id] ?? 'pass',
      agents: [{ agent: 'codex', trials: 1, passed: outcomes[scenario.id] === 'pass' ? 1 : 0 }],
    })),
  };
}

// The rename passed in the older run and failed in the newer one. In the failing trial the site title's update
// came back with an error through the tool that runs any ability, and a call on another server has a tool of
// the same name as an ability. The question passed, and ran `core/get-user-info`, which it does not name. The
// newer run's server checks found `core/publish-post` missing, which only a `to-be-implemented` scenario names.
// The rename's latest trial ran on an older model than the question's, so the counts mix two models.
const OLDER = run('2026-11-18T09:00:00.000Z', [trial(RENAME, true, [call('wp', 'core-get-site-info', {})])], { [RENAME.id]: 'pass' }, []);
const TITLE_FINDING: DefinitionFinding = {
  ability: 'core/update-site-title',
  severity: 'error',
  rule: 'boolean-schema',
  path: 'inputSchema.properties.title',
  issue: 'Bare `true`.',
  suggestion: 'Declare a type.',
};
const NEWER = run(
  '2026-11-19T09:00:00.000Z',
  [
    trial(
      RENAME,
      false,
      [
        call('wp', 'core-get-site-info', {}),
        call('wp', 'mcp-adapter-execute-ability', { ability_name: 'core/update-site-title', parameters: { title: 'Bakery' } }, true),
        call('github', 'core-get-site-info', {}),
      ],
      'gpt-5.6-sol',
    ),
    trial(READ, true, [call('wp', 'core-get-site-info', {}), call('wp', 'core-get-user-info', {})]),
  ],
  { [RENAME.id]: 'fail', [READ.id]: 'pass' },
  ['core/publish-post'],
  [TITLE_FINDING],
);

test("coverage counts each ability from every scenario's latest verdict and the calls of its trials", async (t) => {
  const resultsDir = await mkdtemp(join(tmpdir(), 'evals-coverage-'));
  t.after(() => rm(resultsDir, { recursive: true, force: true }));
  for (const saved of [OLDER, NEWER]) {
    const dir = runFolder(resultsDir, saved.startedAt);
    for (const one of saved.trials) await writeTrial(dir, saved.scenarios.find((scenario) => scenario.id === one.scenarioId) as Scenario, one);
    await writeRunFile(dir, saved);
    if (saved === NEWER) await writeServerSnapshot(dir, { inspectorVersion: '2.16.0', tools: [{ name: 'core-get-site-info', description: 'Reads site info.' }] });
  }

  const { abilities, trend: _trend, ...overview } = await readOverview(resultsDir, [PACK]);

  assert.deepEqual(
    abilities.map(({ ability, area, group, scenarios, passed, failed, notBuilt, notRunYet, ranIn, calls, errored, erroredCalls, definitionFindings }) => ({
      ability,
      area,
      group,
      scenarios,
      passed,
      failed,
      notBuilt,
      notRunYet,
      ranIn,
      calls,
      errored,
      ...(erroredCalls === undefined ? {} : { erroredCalls }),
      ...(definitionFindings === undefined ? {} : { definitionFindings }),
    })),
    [
      { ability: 'core/get-site-info', area: 'site', group: 'in-failing-scenario', scenarios: 2, passed: 1, failed: 1, notBuilt: 0, notRunYet: 0, ranIn: 1, calls: 2, errored: 0 },
      { ability: 'core/get-user-info', area: 'user', group: 'not-tested', scenarios: 0, passed: 0, failed: 0, notBuilt: 0, notRunYet: 0, ranIn: 1, calls: 1, errored: 0 },
      {
        ability: 'core/update-site-title',
        area: 'site',
        group: 'in-failing-scenario',
        scenarios: 1,
        passed: 0,
        failed: 1,
        notBuilt: 0,
        notRunYet: 0,
        ranIn: 0,
        calls: 1,
        errored: 1,
        erroredCalls: [
          {
            scenarioId: RENAME.id,
            runId: '2026-11-19T09-00-00Z',
            agent: 'codex',
            trial: 1,
            file: 'trials/core/site/rename/codex.1.json',
            tool: 'mcp-adapter-execute-ability',
            input: { title: 'Bakery' },
            output: 'Sorry, you are not allowed to do that.',
          },
        ],
        definitionFindings: [TITLE_FINDING],
      },
      { ability: 'core/publish-post', area: 'post', group: 'known-defect-or-not-built', scenarios: 1, passed: 0, failed: 0, notBuilt: 0, notRunYet: 1, ranIn: 0, calls: 0, errored: 0 },
    ],
  );
  const groups = { passing: 0, 'in-failing-scenario': 2, 'known-defect-or-not-built': 1, 'no-result-yet': 0, 'not-tested': 1, 'missing-from-site': 0 };
  const scenarioSummary = { total: 3, passed: 1, failed: 1, knownDefect: 0, notBuilt: 0, error: 0, notRunYet: 1 };
  assert.deepEqual(overview, {
    packs: [{ name: 'core', title: 'WordPress', abilities: 4, tested: 3, groups, scenarios: scenarioSummary }],
    summary: { abilities: 4, tested: 3, groups },
    scenarioSummary,
    agentSummaries: [{ agent: 'codex', scenarios: 2, passed: 1, failed: 1, trials: 2, passedTrials: 1 }],
    failingScenarios: [
      {
        scenarioId: RENAME.id,
        pack: 'core',
        story: 'site',
        request: RENAME.request,
        kind: 'write',
        runId: '2026-11-19T09-00-00Z',
        startedAt: NEWER.startedAt,
        agents: [{ agent: 'codex', trials: 1, passed: 0 }],
        failedTrials: [{ agent: 'codex', trial: 1, pass: false, file: 'trials/core/site/rename/codex.1.json' }],
      },
    ],
    stories: [
      {
        pack: 'core',
        packTitle: 'WordPress',
        file: 'site',
        text: 'As a site owner I want to manage my site by asking.',
        scenarios: [
          {
            id: RENAME.id,
            request: RENAME.request,
            kind: 'write',
            state: 'implemented',
            expectedAbilities: ['core/get-site-info', 'core/update-site-title'],
            forbiddenAbilities: [],
            grading: ['abilities'],
            latest: {
              runId: '2026-11-19T09-00-00Z',
              startedAt: NEWER.startedAt,
              outcome: 'fail',
              agents: [{ agent: 'codex', trials: 1, passed: 0 }],
              trials: [{ agent: 'codex', trial: 1, pass: false, file: 'trials/core/site/rename/codex.1.json' }],
            },
          },
          {
            id: READ.id,
            request: READ.request,
            kind: 'read',
            state: 'implemented',
            expectedAbilities: ['core/get-site-info'],
            forbiddenAbilities: [],
            grading: ['abilities', 'rubric'],
            latest: {
              runId: '2026-11-19T09-00-00Z',
              startedAt: NEWER.startedAt,
              outcome: 'pass',
              agents: [{ agent: 'codex', trials: 1, passed: 1 }],
              trials: [{ agent: 'codex', trial: 1, pass: true, file: 'trials/core/site/read/codex.1.json' }],
            },
          },
        ],
      },
      {
        pack: 'core',
        packTitle: 'WordPress',
        file: 'posts',
        text: 'As a site owner I want to publish by asking.',
        scenarios: [
          {
            id: PUBLISH.id,
            request: PUBLISH.request,
            kind: 'write',
            state: 'to-be-implemented',
            reason: 'Not built.',
            expectedAbilities: ['core/publish-post'],
            forbiddenAbilities: [],
            grading: ['abilities'],
          },
        ],
      },
    ],
    needsAttention: ['core/update-site-title', 'core/get-site-info'],
    notBuiltYet: [{ scenarioId: PUBLISH.id, request: PUBLISH.request, pack: 'core', story: 'posts' }],
    agents: ['codex'],
    trialsPerScenario: [1],
    models: [
      {
        agent: 'codex',
        ran: [
          { program: '0.165.0', model: 'gpt-5.6-sol', scenarios: 1 },
          { program: '0.165.0', model: 'gpt-6.2-sol', scenarios: 1 },
        ],
        judges: [{ name: 'claude', model: 'claude-sonnet-5-5', scenarios: 1 }],
      },
    ],
    oldest: NEWER.startedAt,
    newest: NEWER.startedAt,
    site: { runId: '2026-11-19T09-00-00Z', startedAt: NEWER.startedAt, findings: NEWER.serverChecks, notBuilt: ['core/publish-post'], hasServerSnapshot: true },
  });
});

function listing(startedAt: string, outcomes: Record<string, 'pass' | 'fail'>, checks?: { onSite: string[]; missing: string[] }): RunListing {
  return {
    id: startedAt,
    startedAt,
    site: 'local',
    agents: ['codex'],
    trialsPerScenario: 1,
    models: [],
    ...(checks === undefined ? {} : { serverChecks: { outcome: 'compared' as const, ...checks, inNoPack: [] } }),
    verdicts: Object.entries(outcomes).map(([scenarioId, outcome]) => ({ scenarioId, state: 'implemented' as const, outcome, agents: [] })),
  };
}

test('a run with --filter leaves the trend at the other scenarios\' earlier results, so the line does not drop', () => {
  // The first run has no server checks and every scenario, with the rename failing. The second ran the question
  // alone, and its server checks found two abilities on the site and `core/publish-post` missing, when the pack
  // listed three: a point counts the site as that run found it, not as the pack lists it now.
  const first = listing('2026-11-18T09:00:00.000Z', { [RENAME.id]: 'fail', [READ.id]: 'pass' });
  const filtered = listing('2026-11-19T09:00:00.000Z', { [READ.id]: 'pass' }, { onSite: ['core/get-site-info', 'core/update-site-title'], missing: ['core/publish-post'] });

  assert.deepEqual(trendOf([PACK], [filtered, first]), [
    { runId: first.id, startedAt: first.startedAt, onSite: 4, tested: 3, failing: 2, scenariosPassed: 1, scenariosFailed: 1, scenariosTotal: 3 },
    { runId: filtered.id, startedAt: filtered.startedAt, onSite: 2, tested: 3, failing: 2, scenariosPassed: 1, scenariosFailed: 1, scenariosTotal: 3 },
  ]);
});
