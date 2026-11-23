// Every check on what an agent did reads the transcript, so a mistake in turning Claude Code's output into
// one would misjudge every trial. The lines below are cut down from the output of a real run.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { transcriptFrom } from '../src/agents/claude-code.ts';

const OUTPUT = [
  { type: 'system', subtype: 'init', model: 'claude-sonnet-5-5', claude_code_version: '2.1.327', tools: ['ToolSearch'] },
  {
    type: 'assistant',
    message: { content: [{ type: 'tool_use', id: 'toolu_01', name: 'ToolSearch', input: { query: 'select:mcp__wp__mcp-adapter-execute-ability', max_results: 5 } }] },
  },
  {
    type: 'user',
    message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_01', content: [{ type: 'tool_reference', tool_name: 'mcp__wp__mcp-adapter-execute-ability' }] }] },
  },
  { type: 'rate_limit_event', rate_limit_info: { status: 'allowed' } },
  {
    type: 'assistant',
    message: {
      content: [{ type: 'tool_use', id: 'toolu_02', name: 'mcp__wp__mcp-adapter-execute-ability', input: { ability_name: 'core/get-environment-info', parameters: {} } }],
    },
  },
  {
    type: 'user',
    message: { content: [{ tool_use_id: 'toolu_02', type: 'tool_result', content: '{"success":true,"data":{"wp_version":"7.1.4"}}' }] },
  },
  { type: 'assistant', message: { content: [{ type: 'text', text: 'Your site is running WordPress **7.1.4**.' }] } },
  { type: 'result', subtype: 'success', is_error: false, result: 'Your site is running WordPress **7.1.4**.', num_turns: 3 },
]
  .map((message) => JSON.stringify(message))
  .join('\n');

test("Claude Code's output becomes a transcript with the answer and each tool call paired with its result", () => {
  const { answer, toolCalls, versions } = transcriptFrom(OUTPUT);

  assert.equal(answer, 'Your site is running WordPress **7.1.4**.');
  assert.deepEqual(toolCalls, [
    {
      server: null,
      tool: 'ToolSearch',
      input: { query: 'select:mcp__wp__mcp-adapter-execute-ability', max_results: 5 },
      output: '{"type":"tool_reference","tool_name":"mcp__wp__mcp-adapter-execute-ability"}',
      isError: false,
    },
    {
      server: 'wp',
      tool: 'mcp-adapter-execute-ability',
      input: { ability_name: 'core/get-environment-info', parameters: {} },
      output: '{"success":true,"data":{"wp_version":"7.1.4"}}',
      isError: false,
    },
  ]);
  assert.deepEqual(versions, { agent: '2.1.327', model: 'claude-sonnet-5-5' });
});
