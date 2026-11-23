// An agent must only work on a site that starts as its scenario says: as the run's marked start plus the
// scenario's starting content. A trial on any other site would be judged against the wrong start, so it
// stops before the agent runs, with what differs. The hooks and the site reading around it need a real site
// and are checked by hand.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SiteState } from '../src/entities/types.ts';
import { SiteNotResetError } from '../src/errors.ts';
import { createGiven } from '../src/hooks/create-given.ts';
import { startProblem, startTrial } from '../src/hooks/start-trial.ts';
import type { Hooks } from '../src/hooks/types.ts';
import type { StartingContent } from '../src/scenarios/types.ts';
import { createWpEnvSite } from '../src/sites/wp-env.ts';

const HELLO = { title: 'Hello world!', status: 'publish', content: 'Welcome.' };
// The site as read once, right after the run marked its start.
const MARKED_START: SiteState = { posts: { 'hello-world': HELLO } };
const GIVEN: StartingContent = { posts: { 'summer-sale': { title: 'Summer sale', status: 'draft' } } };
// The draft as the site reports it once it was created: with every field, also those `given` does not name.
const DRAFT = { title: 'Summer sale', status: 'draft', content: '' };
const WITH_CREATE_GIVEN: Hooks = { beforeTrial: [createGiven()] };

const CASES: { name: string; found: SiteState; hooks: Hooks; problem: string | undefined }[] = [
  {
    name: 'accepts a site that is its marked start plus the starting content',
    found: { posts: { 'hello-world': HELLO, 'summer-sale': DRAFT } },
    hooks: WITH_CREATE_GIVEN,
    problem: undefined,
  },
  {
    name: 'names a given item that is missing, and the hook that creates it when the project has no before-trial hook',
    found: MARKED_START,
    hooks: {},
    problem:
      "The site could not be prepared: posts summer-sale: expected, but not found. No `beforeTrial` hook is set, so nothing put the scenario's `given` on the site: add `createGiven()`, which comes with the package, to `hooks.beforeTrial` in evals.config.ts",
  },
  {
    name: 'names a given item that is missing without that hint when the project has a before-trial hook',
    found: MARKED_START,
    hooks: WITH_CREATE_GIVEN,
    problem: 'The site could not be prepared: posts summer-sale: expected, but not found',
  },
  {
    name: 'names a given item with a wrong field',
    found: { posts: { 'hello-world': HELLO, 'summer-sale': { ...DRAFT, status: 'publish' } } },
    hooks: WITH_CREATE_GIVEN,
    problem: 'The site could not be prepared: posts summer-sale: status is "publish", expected "draft"',
  },
  {
    name: 'names a leftover item that is neither in the marked start nor in the starting content',
    found: { posts: { 'hello-world': HELLO, 'summer-sale': DRAFT, 'old-news': { title: 'Old news', status: 'publish', content: '' } } },
    hooks: WITH_CREATE_GIVEN,
    problem: "The site could not be prepared: posts old-news: on the site, but neither at its marked start nor in the scenario's `given`",
  },
];

for (const { name, found, hooks, problem } of CASES) {
  test(`the comparison before a trial ${name}`, () => {
    assert.equal(startProblem(MARKED_START, found, GIVEN, hooks), problem);
  });
}

test('a trial whose site can not be reset stops before its before-trial hooks, and says so', async () => {
  const ran: string[] = [];
  const hooks: Hooks = {
    beforeTrial: [
      function createTheDrafts() {
        ran.push('createTheDrafts');
      },
    ],
  };
  // A wp-env site that was never started, so it can't go back to its marked start.
  const site = createWpEnvSite({ name: 'local', file: { kind: 'wp-env', packs: ['core'], wpEnv: {} }, projectDir: '/project', workDir: '/project/.wp-ability-evals/sites/local', entityTypes: [] });
  const context = {
    site,
    run: { startedAt: '2026-11-19T07:33:53.788Z', site: 'local', agents: ['claude-code'], trialsPerScenario: 5 },
    scenario: { id: 'core/site/which-php-version', request: 'Which PHP version does my site run on?', kind: 'read' as const, expect: { answer: { contains: ['8.3'] } } },
    agent: 'claude-code',
    trial: 1,
  };

  await assert.rejects(startTrial(hooks, context, MARKED_START), (error: unknown) => {
    assert.ok(error instanceof SiteNotResetError);
    assert.equal(error.message, 'Site local could not be put back at its marked start: Site local is not running. Start it with `wp-ability-evals site start local`.');
    return true;
  });

  assert.deepEqual(ran, []);
});
