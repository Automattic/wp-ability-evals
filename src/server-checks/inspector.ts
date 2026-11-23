// Lists a site's MCP tools and schema portability findings with MCP Inspector's command line, the MCP project's
// own client.
//
// Inspector keeps sign-ins and a catalog in `~/.mcp-inspector`, and starts a sign-in in the browser when a server
// asks for one. So it runs with an empty home folder of its own and is told never to sign in. The server's
// headers reach it in a file there, never on its command line, which a failure would repeat.

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { CommandFailedError, ServerNotReadError } from '../errors.ts';
import { isRecord } from '../files/shape.ts';
import type { McpServer } from '../mcp-server.ts';
import { run } from '../process.ts';
import type { ListedServer, ListedTool, SchemaFinding, ToolAnnotations } from './types.ts';

const PACKAGE = '@modelcontextprotocol/inspector';
// The name the server has in the file Inspector reads. Only Inspector sees it.
const SERVER_NAME = 'site';
// Listing a local site's tools takes about two seconds; the limit only keeps a server that never answers from hanging the run.
const TIMEOUT_MS = 60_000;
// With `--strict`, Inspector prints the full JSON envelope (tools + schemaFindings) to stdout and exits 6 when
// any tool has an error-severity schema portability finding. That is a finding to report, not an unreadable server.
const SCHEMA_UNPORTABLE_EXIT = 6;

/** The file that starts Inspector and its package version. The package exports nothing, so both come from its package.json. */
async function inspectorInfo(): Promise<{ file: string; version?: string }> {
  const manifestFile = createRequire(import.meta.url).resolve(`${PACKAGE}/package.json`);
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8')) as { bin: Record<string, string>; version?: string };
  return {
    file: join(dirname(manifestFile), manifest.bin['mcp-inspector'] ?? ''),
    ...(typeof manifest.version === 'string' && manifest.version !== '' ? { version: manifest.version } : {}),
  };
}

/** What Inspector said went wrong: the message of the error it prints as JSON, or what it printed. */
function inspectorSaid(error: unknown): string {
  if (!(error instanceof CommandFailedError)) return error instanceof Error ? error.message : String(error);
  try {
    const printed: unknown = JSON.parse(error.reason);
    const said = isRecord(printed) && isRecord(printed.error) ? printed.error : undefined;
    if (said !== undefined) return `${String(said.message)} (${String(said.code)})`;
  } catch {
    // Not Inspector's JSON, such as a time limit that stopped it: what it said is the reason itself.
  }
  return error.reason;
}

function parseAnnotations(raw: unknown): ToolAnnotations | undefined {
  if (!isRecord(raw)) return undefined;
  const annotations: ToolAnnotations = {
    ...(typeof raw.title === 'string' && raw.title !== '' ? { title: raw.title } : {}),
    ...(typeof raw.readOnlyHint === 'boolean' ? { readOnlyHint: raw.readOnlyHint } : {}),
    ...(typeof raw.destructiveHint === 'boolean' ? { destructiveHint: raw.destructiveHint } : {}),
    ...(typeof raw.idempotentHint === 'boolean' ? { idempotentHint: raw.idempotentHint } : {}),
    ...(typeof raw.openWorldHint === 'boolean' ? { openWorldHint: raw.openWorldHint } : {}),
  };
  return Object.keys(annotations).length === 0 ? undefined : annotations;
}

function parseTool(entry: unknown): ListedTool {
  if (!isRecord(entry)) return { name: String(entry) };
  const annotations = parseAnnotations(entry.annotations);
  return {
    name: String(entry.name),
    ...(typeof entry.title === 'string' && entry.title !== '' ? { title: entry.title } : {}),
    ...(typeof entry.description === 'string' ? { description: entry.description } : {}),
    ...(annotations === undefined ? {} : { annotations }),
    ...(isRecord(entry.inputSchema) ? { inputSchema: entry.inputSchema } : {}),
    ...(isRecord(entry.outputSchema) ? { outputSchema: entry.outputSchema } : {}),
  };
}

function schemaPath(schema: unknown, path: unknown): string {
  const root = typeof schema === 'string' ? schema : '';
  const sub = typeof path === 'string' ? path : '';
  return root === '' ? sub : sub === '' ? root : `${root}.${sub}`;
}

function parseSchemaFindings(raw: unknown): SchemaFinding[] {
  if (!Array.isArray(raw)) return [];
  const findings: SchemaFinding[] = [];
  for (const entry of raw) {
    if (!isRecord(entry) || typeof entry.toolName !== 'string' || !Array.isArray(entry.findings)) continue;
    for (const item of entry.findings) {
      if (!isRecord(item)) continue;
      findings.push({
        toolName: entry.toolName,
        rule: typeof item.rule === 'string' ? item.rule : 'schema',
        severity: item.severity === 'error' ? 'error' : 'warning',
        path: schemaPath(item.schema, item.path),
        issue: typeof item.issue === 'string' ? item.issue : '',
        suggestion: typeof item.suggestion === 'string' ? item.suggestion : '',
      });
    }
  }
  return findings;
}

/** Parses the JSON envelope Inspector prints for `--method tools/list --format json --strict`. */
export function parseToolsOutput(printed: unknown, inspectorVersion?: string): ListedServer {
  const tools = isRecord(printed) && isRecord(printed.result) ? printed.result.tools : undefined;
  if (!Array.isArray(tools)) throw new Error(`Inspector printed no list of tools: ${JSON.stringify(printed).slice(0, 300)}`);
  return {
    tools: tools.map(parseTool),
    schemaFindings: parseSchemaFindings(isRecord(printed) ? printed.schemaFindings : undefined),
    ...(inspectorVersion === undefined ? {} : { inspectorVersion }),
  };
}

/** The tools and schema portability findings the server lists. Throws `ServerNotReadError` when it can't be reached or read. */
export async function listTools(server: McpServer): Promise<ListedServer> {
  const url = server.inspectUrl ?? server.url;
  const home = await mkdtemp(join(tmpdir(), 'wp-ability-evals-inspector-'));
  try {
    const servers = join(home, 'servers.json');
    await writeFile(servers, JSON.stringify({ mcpServers: { [SERVER_NAME]: { type: 'streamable-http', url, headers: server.headers } } }), { mode: 0o600 });
    const args = ['--cli', '--config', servers, '--server', SERVER_NAME, '--stored-auth-only', '--format', 'json', '--quiet', '--strict', '--method', 'tools/list'];
    const { file, version } = await inspectorInfo();
    const printed: unknown = JSON.parse(
      await run(process.execPath, [file, ...args], { env: { PATH: process.env.PATH, HOME: home }, timeoutMs: TIMEOUT_MS, okCodes: [SCHEMA_UNPORTABLE_EXIT] }),
    );
    return parseToolsOutput(printed, version);
  } catch (error) {
    throw new ServerNotReadError(url, inspectorSaid(error));
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}
