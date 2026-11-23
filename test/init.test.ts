// `init` is how every project starts, and it writes into a folder the user chose.

import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, readlink, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { test, type TestContext } from 'node:test';
import { ProjectExistsError } from '../src/errors.ts';
import { initProject } from '../src/init/init.ts';

async function emptyFolder(t: TestContext): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'evals-init-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

async function filesIn(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => relative(dir, join(entry.parentPath, entry.name))).sort();
}

test('init creates a project from the template, with the package as its dependency', async (t) => {
  const dir = await emptyFolder(t);

  await initProject(dir);

  assert.deepEqual(await filesIn(dir), [
    '.agents/guide/entity-types.md',
    '.agents/guide/expect-abilities.md',
    '.agents/guide/expect-site.md',
    '.agents/guide/hooks.md',
    '.agents/guide/packs.md',
    '.agents/guide/results.md',
    '.agents/guide/starting-content.md',
    '.agents/guide/story-files.md',
    '.agents/guide/verify.md',
    '.agents/skills/add-evals/SKILL.md',
    '.agents/wp-ability-evals.json',
    '.gitignore',
    'AGENTS.md',
    'CLAUDE.md',
    'evals.config.ts',
    'package.json',
    'packs/core/pack.yaml',
    'packs/core/scenarios/site.yaml',
    'sites/local.json',
  ]);
  // Claude Code reads only `.claude/skills/`, so a skill it can't reach from there does not exist for it.
  assert.equal(await readlink(join(dir, '.claude/skills/add-evals')), '../../.agents/skills/add-evals');
  const manifest = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
    dependencies: Record<string, string>;
  };
  assert.deepEqual(manifest.scripts, { evals: 'wp-ability-evals' });
  assert.deepEqual(Object.keys(manifest.dependencies), ['wp-ability-evals']);
});

test('init writes nothing into a folder that already has one of its files', async (t) => {
  const dir = await emptyFolder(t);
  await writeFile(join(dir, 'evals.config.ts'), 'mine');

  await assert.rejects(initProject(dir), (error: unknown) => {
    assert.ok(error instanceof ProjectExistsError);
    assert.deepEqual(error.existing, ['evals.config.ts']);
    return true;
  });

  assert.equal(await readFile(join(dir, 'evals.config.ts'), 'utf8'), 'mine');
  assert.deepEqual(await filesIn(dir), ['evals.config.ts']);
});
