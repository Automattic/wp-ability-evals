// Codex as an agent: the installed `codex` command (`programs/codex.ts`) with only the site's MCP server.
// It is the program a site owner would have.

import { AgentFailedError } from '../errors.ts';
import { isRecord } from '../files/shape.ts';
import type { McpServer } from '../mcp-server.ts';
import { CODEX_FAMILY, eventsIn, failureIn, lastMessageIn, runCodex } from '../programs/codex.ts';
import { textOf } from './content.ts';
import type { Agent, AgentSettings, ToolCall, Transcript } from './types.ts';

/** The variable that holds one of the MCP server's headers. */
function headerVariable(index: number): string {
  return `MCP_HEADER_${index}`;
}

/** The setting that gives Codex the site's MCP server. Config values are TOML, and a JSON string is a valid TOML string. */
function serverSetting(server: McpServer): string {
  const headers = Object.keys(server.headers).map((name, index) => `${JSON.stringify(name)}=${JSON.stringify(headerVariable(index))}`);
  // `required` stops the run when the site can't be reached, and `approve` lets its tools run with nobody there to ask.
  return `mcp_servers.${server.name}={url=${JSON.stringify(server.url)}, env_http_headers={${headers.join(', ')}}, required=true, default_tools_approval_mode="approve"}`;
}

const NOT_TOOLS = ['agent_message', 'reasoning', 'error', 'todo_list'];
/** The server name Codex gives its own tools, such as those that list an MCP server's resources. */
const OWN_SERVER = 'codex';
/**
 * Codex's own tools for an MCP server's resources. It reports a read under the server the resource belongs
 * to, not under its own name, so these are told apart by name.
 */
const OWN_RESOURCE_TOOLS = ['list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource'];

function toolCall(item: Record<string, unknown>): ToolCall[] {
  if (NOT_TOOLS.includes(String(item.type))) return [];
  const isError = item.status === 'failed';
  if (item.type === 'mcp_tool_call') {
    // A tool's own error comes as its result; `error` is set when the call itself could not be made.
    const returned = isRecord(item.result) ? item.result.content : isRecord(item.error) ? item.error.message : undefined;
    const own = item.server === OWN_SERVER || OWN_RESOURCE_TOOLS.includes(String(item.tool));
    const server = own ? null : String(item.server);
    return [{ server, tool: String(item.tool), input: item.arguments, output: textOf(returned), isError }];
  }
  // Anything else is one of Codex's own tools, such as a command or a web search. They are switched off, so
  // one that shows up here means an option that switches them off no longer works.
  const { id: _id, type, ...details } = item;
  return [{ server: null, tool: String(type), input: details, output: '', isError }];
}

/**
 * What Codex printed, as a transcript. Throws `AgentFailedError` when Codex gave up or did not end with an
 * answer. Codex does not report its version or its model, so they are passed in.
 */
export function transcriptFrom(output: string, versions: Transcript['versions']): Transcript {
  const events = eventsIn(output);
  const failure = failureIn(events);
  if (failure) throw failure;
  const answer = lastMessageIn(events);
  if (answer === undefined || !events.some((event) => event.type === 'turn.completed')) {
    throw new AgentFailedError('Codex ended without an answer.');
  }
  const items = events.flatMap((event) => (event.type === 'item.completed' && isRecord(event.item) ? [event.item] : []));
  return { answer, toolCalls: items.flatMap(toolCall), versions, raw: events };
}

export function codex(settings: AgentSettings): Agent {
  return {
    family: CODEX_FAMILY,
    judge: settings.judge,
    async run({ request, mcpServer, workDir, timeoutMs }): Promise<Transcript> {
      // A header holds the sign-in to the site, so Codex reads it from a variable and not from the command
      // line, where other programs could see it.
      const env = Object.fromEntries(Object.values(mcpServer.headers).map((value, index) => [headerVariable(index), value]));
      const { output, version } = await runCodex({ ...settings, request, cwd: workDir, timeoutMs, env, settings: [serverSetting(mcpServer)] });
      return transcriptFrom(output, { agent: version, model: settings.model });
    },
  };
}
