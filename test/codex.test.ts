// Every check on what an agent did reads the transcript, so a mistake in turning Codex's output into one
// would misjudge every trial. The lines below are cut down from the output of four real runs.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { transcriptFrom } from '../src/agents/codex.ts';

const NOT_FOUND = "Ability 'core/does-not-exist' not found on this WordPress site, and no ability you can call has a similar name.";

const OUTPUT = [
  { type: 'thread.started', thread_id: '01a1f0ab-33be-78b0-ba46-982065c73585' },
  { type: 'turn.started' },
  { type: 'item.completed', item: { id: 'item_0', type: 'agent_message', text: 'I’ll inspect the site files and identify the installed WordPress version.' } },
  {
    type: 'item.completed',
    item: {
      id: 'item_4',
      type: 'mcp_tool_call',
      server: 'codex',
      tool: 'list_mcp_resources',
      arguments: {},
      result: { content: [{ type: 'text', text: '{"resources":[]}' }], structured_content: null },
      error: null,
      status: 'completed',
    },
  },
  {
    type: 'item.completed',
    item: {
      id: 'item_5',
      type: 'mcp_tool_call',
      server: 'wp',
      tool: 'read_mcp_resource',
      arguments: { server: 'wp', uri: 'wordpress://site/guide' },
      result: { content: [{ type: 'text', text: '{"server":"wp","uri":"wordpress://site/guide","contents":[]}' }], structured_content: null },
      error: null,
      status: 'completed',
    },
  },
  {
    type: 'item.started',
    item: {
      id: 'item_1',
      type: 'mcp_tool_call',
      server: 'wp',
      tool: 'mcp-adapter-execute-ability',
      arguments: { ability_name: 'core/does-not-exist', parameters: {} },
      result: null,
      error: null,
      status: 'in_progress',
    },
  },
  {
    type: 'item.completed',
    item: {
      id: 'item_1',
      type: 'mcp_tool_call',
      server: 'wp',
      tool: 'mcp-adapter-execute-ability',
      arguments: { ability_name: 'core/does-not-exist', parameters: {} },
      result: { content: [{ type: 'text', text: NOT_FOUND }], structured_content: null },
      error: null,
      status: 'failed',
    },
  },
  {
    type: 'item.completed',
    item: {
      id: 'item_2',
      type: 'mcp_tool_call',
      server: 'wp',
      tool: 'mcp-adapter-execute-ability',
      arguments: { ability_name: 'core/get-environment-info', parameters: { fields: ['wp_version'] } },
      result: {
        content: [{ type: 'text', text: '{"success":true,"data":{"wp_version":"7.1.4"}}' }],
        structured_content: { success: true, data: { wp_version: '7.1.4' } },
      },
      error: null,
      status: 'completed',
    },
  },
  { type: 'item.completed', item: { id: 'item_3', type: 'agent_message', text: 'Your site is running WordPress **7.1.4**.' } },
  { type: 'turn.completed', usage: { input_tokens: 43881, cached_input_tokens: 38272, output_tokens: 339, reasoning_output_tokens: 36 } },
]
  .map((event) => JSON.stringify(event))
  .join('\n');

test("Codex's output becomes a transcript with its last message as the answer, each finished tool call once, and its own tools apart from the site's", () => {
  const { answer, toolCalls, versions } = transcriptFrom(OUTPUT, { agent: '0.165.0', model: 'gpt-5.6-sol' });

  assert.equal(answer, 'Your site is running WordPress **7.1.4**.');
  assert.deepEqual(toolCalls, [
    { server: null, tool: 'list_mcp_resources', input: {}, output: '{"resources":[]}', isError: false },
    {
      server: null,
      tool: 'read_mcp_resource',
      input: { server: 'wp', uri: 'wordpress://site/guide' },
      output: '{"server":"wp","uri":"wordpress://site/guide","contents":[]}',
      isError: false,
    },
    {
      server: 'wp',
      tool: 'mcp-adapter-execute-ability',
      input: { ability_name: 'core/does-not-exist', parameters: {} },
      output: NOT_FOUND,
      isError: true,
    },
    {
      server: 'wp',
      tool: 'mcp-adapter-execute-ability',
      input: { ability_name: 'core/get-environment-info', parameters: { fields: ['wp_version'] } },
      output: '{"success":true,"data":{"wp_version":"7.1.4"}}',
      isError: false,
    },
  ]);
  assert.deepEqual(versions, { agent: '0.165.0', model: 'gpt-5.6-sol' });
});
