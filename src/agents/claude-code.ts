// Claude Code as an agent: the installed `claude` command (`programs/claude.ts`) with only the site's MCP
// server and its own tool search: no shell, no file tools, no web. It is the program a site owner would have.

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentFailedError } from '../errors.ts';
import { isRecord } from '../files/shape.ts';
import type { McpServer } from '../mcp-server.ts';
import { run } from '../process.ts';
import { CLAUDE, CLAUDE_FAMILY, claudeEnvironment, claudeOptions } from '../programs/claude.ts';
import { textOf } from './content.ts';
import type { Agent, AgentSettings, ToolCall, Transcript } from './types.ts';

/** What the agent adds to the options every run of Claude Code gets: its output as a stream, the site's MCP server and no other tool. */
function options(model: string, server: McpServer, mcpConfigFile: string): string[] {
  return [
    ...claudeOptions(model),
    ...['--output-format', 'stream-json', '--verbose'],
    ...['--mcp-config', mcpConfigFile],
    // Nobody is there to approve a tool, so what is not allowed below is refused without asking.
    ...['--permission-mode', 'dontAsk'],
    ...['--tools', 'ToolSearch'],
    ...['--allowedTools', `mcp__${server.name}__*`, 'ToolSearch'],
  ];
}

/** The content blocks of an assistant or user message. */
function blocksOf(message: Record<string, unknown>): Record<string, unknown>[] {
  const content = isRecord(message.message) ? message.message.content : undefined;
  return Array.isArray(content) ? content.filter(isRecord) : [];
}

function toolCallsIn(messages: Record<string, unknown>[]): ToolCall[] {
  const calls = new Map<unknown, ToolCall>();
  for (const block of messages.flatMap(blocksOf)) {
    if (block.type === 'tool_use') {
      // An MCP tool is named `mcp__<server>__<tool>`; anything else is one of Claude Code's own tools.
      const [, server = null, tool = String(block.name)] = /^mcp__(.+?)__(.+)$/.exec(String(block.name)) ?? [];
      calls.set(block.id, { server, tool, input: block.input, output: '', isError: false });
    }
    const call = block.type === 'tool_result' ? calls.get(block.tool_use_id) : undefined;
    if (call) {
      call.output = textOf(block.content);
      call.isError = block.is_error === true;
    }
  }
  return [...calls.values()];
}

/**
 * What Claude Code printed (one JSON message per line), as a transcript. Throws `AgentFailedError` when the
 * output does not end with an answer.
 */
export function transcriptFrom(output: string): Transcript {
  const messages = output
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line): unknown => JSON.parse(line))
    .filter(isRecord);
  const start = messages.find((message) => message.type === 'system' && message.subtype === 'init');
  const end = messages.findLast((message) => message.type === 'result');
  if (end === undefined) throw new AgentFailedError('Claude Code ended without a result.');
  if (end.is_error === true || typeof end.result !== 'string') {
    throw new AgentFailedError(`Claude Code ended with ${String(end.subtype)}: ${textOf(end.result)}`);
  }
  return {
    answer: end.result,
    toolCalls: toolCallsIn(messages),
    versions: { agent: String(start?.claude_code_version ?? 'unknown'), model: String(start?.model ?? 'unknown') },
    raw: messages,
  };
}

export function claudeCode(settings: AgentSettings): Agent {
  return {
    family: CLAUDE_FAMILY,
    judge: settings.judge,
    async run({ request, mcpServer, workDir, timeoutMs }): Promise<Transcript> {
      const env = claudeEnvironment(settings.signIn);
      // The MCP server's address holds the sign-in to the site, so it goes in a file that only this user can
      // read, outside the agent's folder, and not on the command line, where other programs could see it.
      const configDir = await mkdtemp(join(tmpdir(), 'mcp-'));
      const configFile = join(configDir, 'servers.json');
      const servers = { [mcpServer.name]: { type: 'http', url: mcpServer.url, headers: mcpServer.headers } };
      try {
        await writeFile(configFile, JSON.stringify({ mcpServers: servers }), { mode: 0o600 });
        const args = options(settings.model, mcpServer, configFile);
        // The request goes in as input, not as an argument, so one that starts with a dash is not read as an option.
        return transcriptFrom(await run(CLAUDE, args, { cwd: workDir, env, input: request, timeoutMs }));
      } finally {
        await rm(configDir, { recursive: true, force: true });
      }
    },
  };
}
