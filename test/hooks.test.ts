// A hook is a project's own code. When one fails, its author has to learn which hook and at which point, and
// what cleans up must still run. These tests hold the rules of one point, and that the end of a run loses no
// failure. The order of the points across a run needs a site and an agent, so it is checked by hand.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HookFailedError } from '../src/errors.ts';
import { createGiven } from '../src/hooks/create-given.ts';
import { endRunOn } from '../src/hooks/run-on-site.ts';
import { runHooks } from '../src/hooks/run.ts';
import type { AfterTrialHookContext, Hooks } from '../src/hooks/types.ts';
import { createWpEnvSite } from '../src/sites/wp-env.ts';

/** What an after-trial hook gets, which holds what the hooks of every other point get. */
const CONTEXT: AfterTrialHookContext = {
  // A wp-env site that is never started. No hook here asks it for anything but its name.
  site: createWpEnvSite({ name: 'local', file: { kind: 'wp-env', packs: ['core'], wpEnv: {} }, projectDir: '/project', workDir: '/project/.wp-ability-evals/sites/local', entityTypes: [] }),
  run: { startedAt: '2026-11-19T07:33:53.788Z', site: 'local', agents: ['claude-code'], trialsPerScenario: 5 },
  scenario: { id: 'core/site/which-php-version', request: 'Which PHP version does my site run on?', kind: 'read', expect: { answer: { contains: ['8.3'] } } },
  agent: 'claude-code',
  trial: 2,
  result: { scenarioId: 'core/site/which-php-version', agent: 'claude-code', trial: 2, pass: true, checks: [], durationMs: 9000 },
};

test('the hooks of a point run in the order written, with what the point gives them, and an after-trial hook adds its checks', async () => {
  const ran: string[] = [];
  const hooks: Hooks = {
    afterTrial: [
      async function removeUploads({ agent, trial }) {
        // The next hook must not start before this one has ended.
        await new Promise((resolve) => setTimeout(resolve, 5));
        ran.push(`removeUploads after trial ${trial} of ${agent}`);
      },
      function noEmailWasSent({ site, result }) {
        ran.push(`noEmailWasSent on ${site.name}`);
        return [{ check: 'no-email-sent', pass: result.pass, reason: 'No email was sent' }];
      },
    ],
  };

  const checks = await runHooks(hooks, 'afterTrial', CONTEXT);

  assert.deepEqual(ran, ['removeUploads after trial 2 of claude-code', 'noEmailWasSent on local']);
  assert.deepEqual(checks, [{ check: 'no-email-sent', pass: true, reason: 'No email was sent' }]);
});

const FAILURES: { name: string; point: 'beforeTrial' | 'afterTrial'; hooks: (ran: string[]) => Hooks; ran: string[]; message: string }[] = [
  {
    name: 'a before-hook that fails stops the hooks after it',
    point: 'beforeTrial',
    hooks: (ran) => ({
      beforeTrial: [
        function createTheDrafts() {
          ran.push('createTheDrafts');
        },
        function seedTheShop() {
          ran.push('seedTheShop');
          throw new Error('The shop plugin is not active');
        },
        function fillTheMenu() {
          ran.push('fillTheMenu');
        },
      ],
    }),
    ran: ['createTheDrafts', 'seedTheShop'],
    message: 'The `beforeTrial` hook `seedTheShop` failed: The shop plugin is not active',
  },
  {
    name: 'an after-hook that fails does not stop the hooks after it, and each failure names its hook',
    point: 'afterTrial',
    hooks: (ran) => ({
      afterTrial: [
        function removeUploads() {
          ran.push('removeUploads');
          throw new Error('The uploads folder can not be written to');
        },
        () => {
          ran.push('a hook without a name');
          throw new Error('The mail log is missing');
        },
        function emptyTheTrash() {
          ran.push('emptyTheTrash');
        },
      ],
    }),
    ran: ['removeUploads', 'a hook without a name', 'emptyTheTrash'],
    message:
      'The `afterTrial` hook `removeUploads` failed: The uploads folder can not be written to; The `afterTrial` hook number 2 (a function without a name) failed: The mail log is missing',
  },
  {
    name: 'an after-trial hook that returns something that is not a list of checks has failed',
    point: 'afterTrial',
    hooks: (ran) => ({
      afterTrial: [
        function noEmailWasSent() {
          ran.push('noEmailWasSent');
          // What a project's code can return, because Node runs it without checking its types.
          return [{ name: 'no-email-sent', passed: true }] as never;
        },
      ],
    }),
    ran: ['noEmailWasSent'],
    message:
      "The `afterTrial` hook `noEmailWasSent` failed: it returned something that is not a list of checks. Return nothing, or a list such as `[{ check: 'no-email-sent', pass: true, reason: 'No email was sent' }]`: each check has its name, whether it passed and what was found",
  },
  {
    name: "the package's own hook has failed when it is listed without the call that returns it",
    point: 'beforeTrial',
    // Every other hook is named without calling it, so this one is easily written the same way.
    hooks: () => ({ beforeTrial: [createGiven] }),
    ran: [],
    message:
      'The `beforeTrial` hook `createGiven` failed: `createGiven` is listed without being called. Write `createGiven()` under `hooks.beforeTrial` in evals.config.ts: the call returns the hook',
  },
];

for (const { name, point, hooks, ran: expected, message } of FAILURES) {
  test(name, async () => {
    const ran: string[] = [];

    await assert.rejects(runHooks(hooks(ran), point, CONTEXT), (error: unknown) => {
      assert.ok(error instanceof HookFailedError);
      assert.equal(error.message, message);
      return true;
    });

    assert.deepEqual(ran, expected);
  });
}

test('a failure in the work of a run is thrown once the after-run hooks ran, with what went wrong in them', async () => {
  const ran: string[] = [];
  const hooks: Hooks = {
    afterRun: [
      function removeUploads() {
        ran.push('removeUploads');
        throw new Error('The uploads folder can not be written to');
      },
    ],
  };
  // The site is kept after the run, so nothing is asked of it at the end.
  const ended = endRunOn(CONTEXT.site, hooks, CONTEXT.run, 'keep', async () => {
    throw new Error('Site local did not answer');
  });

  await assert.rejects(ended, { message: 'Site local did not answer; The `afterRun` hook `removeUploads` failed: The uploads folder can not be written to' });
  assert.deepEqual(ran, ['removeUploads']);
});
