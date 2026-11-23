// The viewer's server reads files for whoever asks, so it must hand out a run's files and nothing else:
// not a file outside the run's folder, and nothing to a web page that points its own domain at this machine.

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { RunResult } from '../src/results/types.ts';
import { runFolder, writeRunFile, writeServerSnapshot, writeTrial } from '../src/results/write.ts';
import type { Scenario } from '../src/scenarios/types.ts';
import { exportViewer } from '../src/viewer/export.ts';
import { startViewer } from '../src/viewer/server.ts';

const SCENARIO: Scenario = { id: 'core/site/which-php-version', request: 'Which PHP version does my site run on?', kind: 'read', expect: { answer: { contains: ['8.3'] } } };
const CHECK = { check: 'answer-contains', pass: true, reason: 'The answer contains every expected text' };
const VERDICT = { scenarioId: SCENARIO.id, state: 'implemented' as const, outcome: 'pass' as const, agents: [{ agent: 'codex', trials: 1, passed: 1 }] };
const SERVER_CHECKS = { outcome: 'compared' as const, onSite: ['core/get-environment-info'], missing: [], inNoPack: [] };
const MODELS = [{ agent: 'codex', ran: [{ program: '0.165.0', model: 'gpt-6.2-sol' }] }];
const RUN: RunResult = {
  startedAt: '2026-11-19T07:33:53.788Z',
  site: 'local',
  agents: ['codex'],
  trialsPerScenario: 1,
  serverChecks: SERVER_CHECKS,
  mcpServer: { name: 'wp' },
  models: MODELS,
  scenarios: [SCENARIO],
  trials: [{ scenarioId: SCENARIO.id, agent: 'codex', trial: 1, pass: true, checks: [CHECK], durationMs: 14000 }],
  verdicts: [VERDICT],
};

/** What the viewer answers to a request for `path`, asked under the host name `host`. */
function get(url: string, path: string, host?: string): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const { hostname, port } = new URL(url);
    request({ hostname, port, path, headers: host === undefined ? {} : { Host: host } }, (response) => {
      let text = '';
      response.on('data', (chunk: Buffer) => (text += chunk.toString()));
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body: JSON.parse(text) as unknown }));
    })
      .on('error', reject)
      .end();
  });
}

test("the viewer hands out the saved runs and a run's files, and nothing else on the machine", async (t) => {
  const project = await mkdtemp(join(tmpdir(), 'evals-viewer-'));
  t.after(() => rm(project, { recursive: true, force: true }));
  const resultsDir = join(project, 'results');
  await mkdir(resultsDir);
  const dir = runFolder(resultsDir, RUN.startedAt);
  const SNAPSHOT = { inspectorVersion: '2.16.0', tools: [{ name: 'core-get-environment-info', title: 'Get Environment Info', description: 'Reads environment.' }] };
  for (const trial of RUN.trials) await writeTrial(dir, SCENARIO, trial);
  await writeServerSnapshot(dir, SNAPSHOT);
  await writeRunFile(dir, RUN);
  await writeFile(join(project, 'secret.json'), '{"password":"hunter2"}');
  await symlink(join(project, 'secret.json'), join(dir, 'link.json'));
  await symlink(project, join(resultsDir, '2026-11-19T08-00-00Z'));
  const viewer = await startViewer({ resultsDir, packs: async () => [], port: 0 });
  t.after(() => viewer.close());
  const run = '/api/runs/2026-11-19T07-33-53Z';

  assert.deepEqual(await get(viewer.url, '/api/runs'), {
    status: 200,
    body: [{ id: '2026-11-19T07-33-53Z', startedAt: '2026-11-19T07:33:53.788Z', site: 'local', agents: ['codex'], trialsPerScenario: 1, serverChecks: SERVER_CHECKS, mcpServer: { name: 'wp' }, models: MODELS, verdicts: [VERDICT], hasServerSnapshot: true }],
  });
  assert.deepEqual(await get(viewer.url, `${run}/server.json`), { status: 200, body: SNAPSHOT });
  assert.deepEqual(await get(viewer.url, `${run}/trials/core/site/which-php-version/codex.1.json`), {
    status: 200,
    body: { scenarioId: SCENARIO.id, agent: 'codex', trial: 1, pass: true, durationMs: 14000, scenario: SCENARIO, checks: [CHECK] },
  });
  assert.deepEqual(await get(viewer.url, `${run}/..%2F..%2Fsecret.json`), { status: 404, body: { error: `Nothing at ${run}/../../secret.json.` } });
  assert.deepEqual(await get(viewer.url, `${run}/link.json`), { status: 404, body: { error: `Nothing at ${run}/link.json.` } });
  assert.deepEqual(await get(viewer.url, '/api/runs/2026-11-19T08-00-00Z/secret.json'), { status: 404, body: { error: 'Nothing at /api/runs/2026-11-19T08-00-00Z/secret.json.' } });
  assert.deepEqual(await get(viewer.url, '/api/runs', 'results.example.com'), { status: 403, body: { error: 'The viewer answers only on this machine.' } });
});

test('exportViewer writes a self-contained static viewer with run, server, and trial JSON without copying symlinks', async (t) => {
  const project = await mkdtemp(join(tmpdir(), 'evals-viewer-export-'));
  t.after(() => rm(project, { recursive: true, force: true }));
  const resultsDir = join(project, 'results');
  const outDir = join(project, 'static-viewer');
  await mkdir(resultsDir);
  const dir = runFolder(resultsDir, RUN.startedAt);
  const SNAPSHOT = { inspectorVersion: '2.16.0', tools: [{ name: 'core-get-environment-info', title: 'Get Environment Info', description: 'Reads environment.' }] };
  for (const trial of RUN.trials) await writeTrial(dir, SCENARIO, trial);
  await writeServerSnapshot(dir, SNAPSHOT);
  await writeRunFile(dir, RUN);
  await writeFile(join(project, 'secret.json'), '{"password":"hunter2"}');
  await symlink(join(project, 'secret.json'), join(dir, 'link.json'));

  const exported = await exportViewer({ resultsDir, packs: [], outDir });
  assert.equal(exported.runs, 1);
  const html = await readFile(join(outDir, 'index.html'), 'utf8');
  assert.ok(html.includes('window.__WP_ABILITY_EVALS_STATIC__ = true;'));
  assert.equal(existsSync(join(outDir, 'main.js')), true);
  assert.equal(existsSync(join(outDir, 'main.css')), true);

  const runs = JSON.parse(await readFile(join(outDir, 'data', 'runs.json'), 'utf8')) as { id: string; hasServerSnapshot?: boolean }[];
  assert.equal(runs.length, 1);
  assert.equal(runs[0]?.id, '2026-11-19T07-33-53Z');
  assert.equal(runs[0]?.hasServerSnapshot, true);
  const server = JSON.parse(await readFile(join(outDir, 'data', 'runs', '2026-11-19T07-33-53Z', 'server.json'), 'utf8')) as unknown;
  assert.deepEqual(server, SNAPSHOT);
  const trial = JSON.parse(
    await readFile(join(outDir, 'data', 'runs', '2026-11-19T07-33-53Z', 'trials', 'core', 'site', 'which-php-version', 'codex.1.json'), 'utf8'),
  ) as { scenarioId: string; pass: boolean };
  assert.equal(trial.scenarioId, SCENARIO.id);
  assert.equal(trial.pass, true);
  assert.equal(existsSync(join(outDir, 'data', 'runs', '2026-11-19T07-33-53Z', 'link.json')), false);
});
