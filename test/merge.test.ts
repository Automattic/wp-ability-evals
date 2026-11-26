// Tests for deterministic scenario sharding and merging sharded run folders back into one unified run.

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { NothingToRunError } from '../src/errors.ts';
import { parseShard, scenariosOn, shardScenarios } from '../src/project/site.ts';
import type { Project } from '../src/project/types.ts';
import { mergeRuns } from '../src/results/merge.ts';
import { listRuns } from '../src/results/read.ts';
import type { RunResult, TrialResult } from '../src/results/types.ts';
import { runFolder, writeRunFile, writeServerSnapshot, writeTrial } from '../src/results/write.ts';
import type { Scenario } from '../src/scenarios/types.ts';
import type { Site } from '../src/sites/types.ts';

const S1: Scenario = { id: 'posts/a/one', request: 'One', kind: 'read', expect: {} };
const S2: Scenario = { id: 'posts/a/two', request: 'Two', kind: 'write', expect: {} };
const S3: Scenario = { id: 'pages/a/three', request: 'Three', kind: 'write', state: 'known-defect', expect: {} };
const S4: Scenario = { id: 'terms/a/four', request: 'Four', kind: 'read', expect: {} };

test('parseShard validates 1-based bounds and shardScenarios partitions round-robin without loss or overlap', () => {
  assert.deepEqual(parseShard('2/4'), { index: 2, total: 4 });
  assert.equal(parseShard('0/4'), undefined);
  assert.equal(parseShard('5/4'), undefined);
  assert.equal(parseShard('bad'), undefined);

  const all = [S1, S2, S3, S4];
  const shard1 = shardScenarios(all, { index: 1, total: 2 });
  const shard2 = shardScenarios(all, { index: 2, total: 2 });
  assert.deepEqual(shard1.map((s) => s.id), [S1.id, S3.id]);
  assert.deepEqual(shard2.map((s) => s.id), [S2.id, S4.id]);
});

test('scenariosOn OR-matches repeatable filters without duplicates before sharding and reports all filters on empty match', () => {
  const project = {
    dir: '/tmp',
    packs: [
      { name: 'posts', title: 'Posts', dir: '/tmp/posts', abilities: { reads: [], writes: [] }, entities: [], stories: [], scenarios: [S1, S2] },
      { name: 'pages', title: 'Pages', dir: '/tmp/pages', abilities: { reads: [], writes: [] }, entities: [], stories: [], scenarios: [S3] },
      { name: 'terms', title: 'Terms', dir: '/tmp/terms', abilities: { reads: [], writes: [] }, entities: [], stories: [], scenarios: [S4] },
    ],
    sites: {},
    config: {} as Project['config'],
  } as Project;
  const site = { name: 'staging', packs: ['posts', 'pages', 'terms'] } as Site;

  // Overlapping filters (`posts/` and `posts/a/one`) must match once in pack order alongside `terms/a/four`.
  const matched = scenariosOn(project, site, ['posts/', 'posts/a/one', 'terms/a/four']);
  assert.deepEqual(
    matched.scenarios.map((s) => s.id),
    [S1.id, S2.id, S4.id],
  );

  // Sharding applies round-robin to the filtered union.
  const slice1 = scenariosOn(project, site, ['posts/a/one', 'pages/a/three', 'terms/a/four'], { index: 1, total: 2 });
  const slice2 = scenariosOn(project, site, ['posts/a/one', 'pages/a/three', 'terms/a/four'], { index: 2, total: 2 });
  assert.deepEqual(
    slice1.scenarios.map((s) => s.id),
    [S1.id, S4.id],
  );
  assert.deepEqual(
    slice2.scenarios.map((s) => s.id),
    [S3.id],
  );

  assert.throws(
    () => scenariosOn(project, site, ['missing/a', 'missing/b']),
    (error: unknown) => error instanceof NothingToRunError && error.message.includes('"missing/a", "missing/b"'),
  );
});

async function writeShard(root: string, run: RunResult, snapshot?: { inspectorVersion: string; tools: { name: string }[] }): Promise<string> {
  const dir = runFolder(root, run.startedAt);
  for (const trial of run.trials) {
    const scenario = run.scenarios.find((s) => s.id === trial.scenarioId) as Scenario;
    await writeTrial(dir, scenario, trial);
  }
  if (snapshot !== undefined) await writeServerSnapshot(dir, snapshot);
  await writeRunFile(dir, run);
  return dir;
}

test('mergeRuns combines sharded runs into one unified run, recomputing verdicts and preserving compared server audit', async (t) => {
  const work = await mkdtemp(join(tmpdir(), 'evals-merge-'));
  t.after(() => rm(work, { recursive: true, force: true }));
  const shardsRoot = join(work, 'shards');
  const mergedRoot = join(work, 'merged');

  const t1Claude: TrialResult = { scenarioId: S1.id, agent: 'claude-code', trial: 1, pass: true, checks: [], durationMs: 1000 };
  const t1Codex: TrialResult = { scenarioId: S1.id, agent: 'codex', trial: 1, pass: false, checks: [{ check: 'site', pass: false, reason: 'mismatch' }], durationMs: 2000 };
  const t3Claude: TrialResult = { scenarioId: S3.id, agent: 'claude-code', trial: 1, pass: true, checks: [], durationMs: 1500 };

  const shard1 = await writeShard(
    shardsRoot,
    {
      startedAt: '2026-11-23T03:00:00.000Z',
      site: 'staging',
      agents: ['claude-code'],
      trialsPerScenario: 1,
      serverChecks: { outcome: 'compared', onSite: ['core/posts-list'], missing: [], inNoPack: [] },
      mcpServer: { name: 'wordpress' },
      models: [{ agent: 'claude-code', ran: [{ program: '2.1.330', model: 'claude-sonnet-5-5' }], judge: { name: 'gpt', model: 'gpt-6.2-sol' } }],
      scenarios: [S1, S3],
      trials: [t1Claude, t3Claude],
      verdicts: [
        { scenarioId: S1.id, state: 'implemented', outcome: 'pass', agents: [{ agent: 'claude-code', trials: 1, passed: 1 }] },
        { scenarioId: S3.id, state: 'known-defect', outcome: 'unexpected-pass', agents: [{ agent: 'claude-code', trials: 1, passed: 1 }] },
      ],
    },
    { inspectorVersion: '2.16.0', tools: [{ name: 'core-posts-list' }] },
  );

  const shard2 = await writeShard(shardsRoot, {
    startedAt: '2026-11-23T03:15:00.000Z',
    site: 'staging',
    agents: ['codex'],
    trialsPerScenario: 1,
    serverChecks: { outcome: 'behind-lookup', runTools: ['execute'] },
    mcpServer: { name: 'wordpress' },
    models: [{ agent: 'codex', ran: [{ program: '0.171.0', model: 'gpt-6.2-sol' }], judge: { name: 'claude', model: 'claude-sonnet-5-5' } }],
    scenarios: [S1],
    trials: [t1Codex],
    verdicts: [{ scenarioId: S1.id, state: 'implemented', outcome: 'fail', agents: [{ agent: 'codex', trials: 1, passed: 0 }] }],
  });

  const merged = await mergeRuns({ sources: [shard2, shard1], resultsDir: mergedRoot });
  assert.equal(merged.id, '2026-11-23T03-00-00Z');
  assert.deepEqual(merged.runFile.agents, ['claude-code', 'codex']);
  assert.equal(merged.runFile.serverChecks?.outcome, 'compared');
  assert.equal(existsSync(join(merged.dir, 'server.json')), true);
  assert.deepEqual(merged.runFile.verdicts, [
    {
      scenarioId: S1.id,
      state: 'implemented',
      outcome: 'fail',
      agents: [
        { agent: 'claude-code', trials: 1, passed: 1 },
        { agent: 'codex', trials: 1, passed: 0 },
      ],
    },
    {
      scenarioId: S3.id,
      state: 'known-defect',
      outcome: 'unexpected-pass',
      agents: [{ agent: 'claude-code', trials: 1, passed: 1 }],
    },
  ]);

  const runs = await listRuns(mergedRoot);
  assert.equal(runs.length, 1);
  assert.equal(runs[0]?.hasServerSnapshot, true);
  const copiedTrial = JSON.parse(await readFile(join(merged.dir, 'trials/posts/a/one/codex.1.json'), 'utf8')) as { pass: boolean };
  assert.equal(copiedTrial.pass, false);
});

test('mergeRuns rejects duplicate trials or mismatched sites instead of silently corrupting verdicts', async (t) => {
  const work = await mkdtemp(join(tmpdir(), 'evals-merge-err-'));
  t.after(() => rm(work, { recursive: true, force: true }));
  const shardsRoot = join(work, 'shards');
  const mergedRoot = join(work, 'merged');
  const trial: TrialResult = { scenarioId: S1.id, agent: 'claude-code', trial: 1, pass: true, checks: [], durationMs: 500 };

  const base: RunResult = {
    startedAt: '2026-11-23T03:00:00.000Z',
    site: 'staging',
    agents: ['claude-code'],
    trialsPerScenario: 1,
    serverChecks: { outcome: 'behind-lookup', runTools: ['execute'] },
    mcpServer: { name: 'wordpress' },
    models: [],
    scenarios: [S1],
    trials: [trial],
    verdicts: [{ scenarioId: S1.id, state: 'implemented', outcome: 'pass', agents: [{ agent: 'claude-code', trials: 1, passed: 1 }] }],
  };
  const a = await writeShard(shardsRoot, base);
  const dup = await writeShard(shardsRoot, { ...base, startedAt: '2026-11-23T03:10:00.000Z' });
  const otherSite = await writeShard(shardsRoot, { ...base, startedAt: '2026-11-23T03:20:00.000Z', site: 'local', scenarios: [S2], trials: [{ ...trial, scenarioId: S2.id }], verdicts: [] });

  await assert.rejects(() => mergeRuns({ sources: [a, dup], resultsDir: mergedRoot }), /Duplicate trial/);
  await assert.rejects(() => mergeRuns({ sources: [a, otherSite], resultsDir: mergedRoot }), /different sites/);
});
