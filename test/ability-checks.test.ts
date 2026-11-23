// The checks on abilities decide whether the agent did the task through the site's abilities and nothing
// else: which ran, with which arguments, and which must not run. An MCP server presents abilities through
// lookup tools or as a tool each, and the checks read both without being told which, so a mistake here would
// misjudge every trial on one kind of server.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ToolCall } from '../src/agents/types.ts';
import { checksFor } from '../src/checks/registry.ts';
import type { McpServer } from '../src/mcp-server.ts';
import type { Pack } from '../src/packs/types.ts';
import type { Scenario } from '../src/scenarios/types.ts';

const PACK: Pack = {
  name: 'core',
  title: 'WordPress',
  abilities: { reads: ['core/get-site-info', 'core/find-posts', 'core/get-user-info'], writes: ['core/update-site-title'] },
  entities: [],
  dir: '',
  stories: [],
  scenarios: [],
};
// A local site's server as the checks get it, whichever way the site presents abilities, with a second tool
// that runs any ability and names its arguments otherwise, as another server's may.
const SERVER: Pick<McpServer, 'name' | 'lookup'> = {
  name: 'wp',
  lookup: {
    runTools: [
      { tool: 'mcp-adapter-execute-ability', nameArgument: 'ability_name', inputArgument: 'parameters' },
      { tool: 'run-ability', nameArgument: 'name', inputArgument: 'input' },
    ],
    otherTools: ['mcp-adapter-discover-abilities', 'mcp-adapter-get-ability-info'],
  },
};

const A_QUESTION: Scenario = { id: 'core/site/a-question', request: 'A question.', kind: 'read', expect: { abilities: ['core/get-site-info'] } };
const NOTHING_TO_DO: Scenario = { id: 'core/site/nothing-to-do', request: 'A request.', kind: 'none', expect: {} };
// The ability must run with both arguments in one call, and a list means one of its values.
const UNPUBLISHED_POSTS: Scenario = {
  id: 'core/site/unpublished-posts',
  request: 'A question about the posts of one author.',
  kind: 'read',
  expect: { abilities: [{ 'core/find-posts': { status: ['draft', 'pending'], author: 12 } }], forbidden: ['core/get-user-info'] },
};
// An argument that is `true` or `false` is met by that value alone.
const STICKY_POSTS: Scenario = {
  id: 'core/site/sticky-posts',
  request: 'A question about the posts that are pinned to the top.',
  kind: 'read',
  expect: { abilities: [{ 'core/find-posts': { sticky: true } }] },
};

function call(server: string | null, tool: string, input: unknown = {}, isError = false): ToolCall {
  return { server, tool, input, output: '', isError };
}

/** Running an ability on the server with lookup tools: the ability's input is one argument of the tool that runs it. */
function run(ability: string, input: unknown = {}, isError = false): ToolCall {
  return call('wp', 'mcp-adapter-execute-ability', { ability_name: ability, parameters: input }, isError);
}

const OWN_TOOL = call(null, 'ToolSearch');
const LOOK_UP = [call('wp', 'mcp-adapter-discover-abilities'), call('wp', 'mcp-adapter-get-ability-info', { ability_name: 'core/get-site-info' })];

/** The checks a trial fails, as `check: reason`, when nothing on the site changed. */
async function failures(scenario: Scenario, toolCalls: ToolCall[]): Promise<string[]> {
  const transcript = { answer: '', toolCalls, versions: { agent: '', model: '' }, raw: [] };
  const input = { scenario, transcript, before: {}, after: {}, packs: [PACK], server: SERVER };
  const results = await Promise.all(checksFor(scenario).map((check) => check(input)));
  return results.filter((result) => !result.pass).map((result) => `${result.check}: ${result.reason}`);
}

interface Case {
  name: string;
  scenario: Scenario;
  toolCalls: ToolCall[];
}

const CORRECT: Case[] = [
  {
    name: 'looks the ability up and runs it, on a server with lookup tools',
    scenario: A_QUESTION,
    toolCalls: [OWN_TOOL, ...LOOK_UP, run('core/get-site-info')],
  },
  {
    name: "calls the ability's tool, on a server whose abilities are tools",
    scenario: A_QUESTION,
    toolCalls: [OWN_TOOL, call('wp', 'core-get-site-info')],
  },
  {
    // Agents try whatever might do what was asked. A call the site refused changed nothing.
    name: 'tries a write and an ability the site lacks, both refused, in a scenario that only reads',
    scenario: A_QUESTION,
    toolCalls: [run('core/get-site-info'), run('core/update-site-title', { title: 'New' }, true), run('core/update-admin-email', {}, true)],
  },
  {
    name: 'only looks up what the site offers, in a scenario where no ability should run',
    scenario: NOTHING_TO_DO,
    toolCalls: LOOK_UP,
  },
  {
    name: 'runs the ability with the expected arguments among others, a number as text, on a server with lookup tools',
    scenario: UNPUBLISHED_POSTS,
    toolCalls: [...LOOK_UP, run('core/find-posts', { status: 'draft', author: '12', per_page: 5 })],
  },
  {
    name: 'runs the ability with the expected arguments through the second tool that runs any ability, whose arguments are named otherwise',
    scenario: UNPUBLISHED_POSTS,
    toolCalls: [call('wp', 'run-ability', { name: 'core/find-posts', input: { status: 'draft', author: 12 } })],
  },
  {
    name: "calls the ability's tool with another of the values an argument may have, on a server whose abilities are tools",
    scenario: UNPUBLISHED_POSTS,
    toolCalls: [call('wp', 'core-find-posts', { status: 'pending', author: 12 })],
  },
];

for (const { name, scenario, toolCalls } of CORRECT) {
  test(`a trial passes every check when the agent ${name}`, async () => {
    assert.deepEqual(await failures(scenario, toolCalls), []);
  });
}

const WRONG: (Case & { failure: string })[] = [
  {
    name: 'runs an ability that changes the site, in a scenario that only reads',
    scenario: A_QUESTION,
    toolCalls: [run('core/get-site-info'), run('core/update-site-title')],
    failure: 'no-writes: Abilities that change the site ran: core/update-site-title',
  },
  {
    name: 'runs an ability that no pack of the site lists',
    scenario: A_QUESTION,
    toolCalls: [call('wp', 'core-get-site-info'), call('wp', 'core-delete-everything')],
    failure: 'known-abilities: Abilities that are in no pack of the site: core-delete-everything',
  },
  {
    name: 'runs the expected ability only with an error',
    scenario: A_QUESTION,
    toolCalls: [call('wp', 'core-get-site-info', {}, true)],
    failure: 'expected-abilities: Expected abilities that did not run without an error: core/get-site-info. Ran: core/get-site-info (failed)',
  },
  {
    name: "uses an MCP server that is not the site's",
    scenario: A_QUESTION,
    toolCalls: [OWN_TOOL, call('docs', 'search'), run('core/get-site-info')],
    failure: 'site-server: The agent used other MCP servers: docs',
  },
  {
    name: 'runs an ability, in a scenario where no ability should run',
    scenario: NOTHING_TO_DO,
    toolCalls: [...LOOK_UP, run('core/get-site-info')],
    failure: 'no-abilities: Abilities ran: core/get-site-info',
  },
  {
    name: 'runs the expected ability with another value of an argument, without an argument, and as expected only with an error, through either kind of tool',
    scenario: UNPUBLISHED_POSTS,
    toolCalls: [
      run('core/find-posts', { status: 'publish', author: 12 }),
      call('wp', 'core-find-posts', { status: 'draft' }),
      call('wp', 'core-find-posts', { status: 'draft', author: 12 }, true),
    ],
    failure:
      'expected-abilities: core/find-posts did not run without an error with status "draft" or "pending", author 12: it ran with status "publish", author 12; status "draft", no author; status "draft", author 12 (failed)',
  },
  {
    name: 'runs the expected ability with 1 where the scenario expects `true`',
    scenario: STICKY_POSTS,
    toolCalls: [run('core/find-posts', { sticky: 1 })],
    failure: 'expected-abilities: core/find-posts did not run without an error with sticky true: it ran with sticky 1',
  },
  {
    name: 'runs an ability the scenario forbids',
    scenario: UNPUBLISHED_POSTS,
    toolCalls: [run('core/find-posts', { status: 'draft', author: 12 }), run('core/get-user-info')],
    failure: 'forbidden-abilities: Forbidden abilities ran: core/get-user-info',
  },
  {
    name: 'runs an ability the scenario forbids, though its call failed',
    scenario: UNPUBLISHED_POSTS,
    toolCalls: [call('wp', 'core-find-posts', { status: 'draft', author: 12 }), call('wp', 'core-get-user-info', {}, true)],
    failure: 'forbidden-abilities: Forbidden abilities ran: core/get-user-info (failed)',
  },
];

for (const { name, scenario, toolCalls, failure } of WRONG) {
  test(`a trial fails when the agent ${name}`, async () => {
    assert.deepEqual(await failures(scenario, toolCalls), [failure]);
  });
}
