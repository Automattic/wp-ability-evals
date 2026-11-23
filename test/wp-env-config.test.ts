// A site file names a plugin by a path in the project. wp-env runs in another folder, so a path that is not
// rewritten points nowhere, Docker makes an empty folder for it, and the site starts without the plugin.

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { missingSourcesOf, wpEnvConfigOf } from '../src/sites/wp-env-config.ts';

test('a wp-env site reads the paths of its site file from the project folder, and finds the ones that are not there', async (t) => {
  const project = await mkdtemp(join(tmpdir(), 'evals-project-'));
  t.after(() => rm(project, { recursive: true, force: true }));
  await mkdir(join(project, 'plugins', 'mine'), { recursive: true });

  const config = wpEnvConfigOf(
    {
      core: 'WordPress/WordPress#7.1.4',
      port: 8897,
      plugins: ['https://downloads.wordpress.org/plugin/mcp-adapter.0.7.1.zip', './plugins/mine', './plugins/misspelled'],
      mappings: { 'wp-content/mu-plugins': './mu-plugins' },
    },
    project,
  );

  assert.deepEqual(config, {
    core: 'WordPress/WordPress#7.1.4',
    port: 8897,
    plugins: ['https://downloads.wordpress.org/plugin/mcp-adapter.0.7.1.zip', join(project, 'plugins', 'mine'), join(project, 'plugins', 'misspelled')],
    mappings: { 'wp-content/mu-plugins': join(project, 'mu-plugins') },
  });
  assert.deepEqual(missingSourcesOf(config), [join(project, 'plugins', 'misspelled'), join(project, 'mu-plugins')]);
});
