// The server checks of a run: read the site's MCP server once, compare it with the packs, check the listed
// abilities' definitions, and say what was found. A server that can't be read is a finding too, never a failure
// that stops the run.

import { messageOf } from '../errors.ts';
import type { McpServer } from '../mcp-server.ts';
import type { Pack } from '../packs/types.ts';
import type { Scenario } from '../scenarios/types.ts';
import { compareWithPacks } from './compare.ts';
import { listTools } from './inspector.ts';
import { abilitiesNotBuilt } from './left-out.ts';
import type { DefinitionFinding, ServerCheckConfig, ServerFindings, ServerSnapshot } from './types.ts';

/** Reads the server once, returning both the pack comparison findings and the raw tool snapshot for `server.json`. */
export async function inspectServer(
  server: McpServer,
  packs: Pack[],
  config?: ServerCheckConfig,
): Promise<{ findings: ServerFindings; snapshot?: ServerSnapshot }> {
  try {
    const listed = await listTools(server);
    return {
      findings: compareWithPacks(packs, listed, server.lookup, config),
      snapshot: { ...(listed.inspectorVersion === undefined ? {} : { inspectorVersion: listed.inspectorVersion }), tools: listed.tools },
    };
  } catch (error) {
    return { findings: { outcome: 'unreadable', reason: messageOf(error) } };
  }
}

export async function checkServer(server: McpServer, packs: Pack[], config?: ServerCheckConfig): Promise<ServerFindings> {
  return (await inspectServer(server, packs, config)).findings;
}

/**
 * True when the findings show a mistake to fix: the server could not be read, it lacks an ability that the
 * packs list and that is not merely waiting to be built, or a listed ability has an error-severity definition
 * or contract finding.
 */
export function hasProblem(findings: ServerFindings, scenarios: Scenario[]): boolean {
  if (findings.outcome === 'unreadable') return true;
  if (findings.outcome === 'behind-lookup') {
    return (findings.definitionFindings ?? []).some((finding) => finding.severity === 'error');
  }
  if (findings.missing.length > abilitiesNotBuilt(findings.missing, scenarios).length) return true;
  return (findings.definitionFindings ?? []).some((finding) => finding.severity === 'error');
}

function these(count: number, noun: string, plural = `${noun}s`): string {
  return count === 1 ? `this ${noun}` : `these ${count} ${plural}`;
}

function counted(count: number, noun: string, plural = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : plural}`;
}

function definitionLines(findings: DefinitionFinding[], detail: boolean): string[] {
  if (findings.length === 0) return [];
  const errors = findings.filter(({ severity }) => severity === 'error').length;
  const warnings = findings.length - errors;
  const breakdown = [errors > 0 ? counted(errors, 'error') : '', warnings > 0 ? counted(warnings, 'warning') : ''].filter(Boolean).join(', ');
  const abilities = new Set(findings.map(({ ability }) => ability)).size;
  if (!detail) {
    return [`Note: ${counted(findings.length, 'problem')} in ability definitions (${breakdown}) across ${counted(abilities, 'ability', 'abilities')}; run \`wp-ability-evals site check\` or open the viewer for details.`];
  }
  const abilityWidth = Math.max(...findings.map(({ ability }) => ability.length));
  return [
    `Note: ${counted(findings.length, 'problem')} in ability definitions (${breakdown}) across ${counted(abilities, 'ability', 'abilities')}:`,
    ...findings.map(({ severity, ability, path, issue, suggestion }) => {
      const fix = suggestion === '' ? '' : ` Fix: ${suggestion}`;
      return `  ${severity.padEnd(7)}  ${ability.padEnd(abilityWidth)}  ${path}: ${issue}${fix}`;
    }),
  ];
}

/** What the server checks found, for a person or an agent to read, one line each. Set `detail: false` to summarize definition findings in one line. */
export function findingLines(findings: ServerFindings, scenarios: Scenario[], { detail = true }: { detail?: boolean } = {}): string[] {
  if (findings.outcome === 'unreadable') return [findings.reason];
  if (findings.outcome === 'behind-lookup') {
    return [
      `Note: the site's MCP server runs abilities through ${findings.runTools.map((tool) => `\`${tool}\``).join(', ')}, so its list of tools need not show every ability, and nothing was compared with the packs.`,
      ...definitionLines(findings.definitionFindings ?? [], detail),
    ];
  }
  const lines = [`The site's MCP server presents ${findings.onSite.length} of the ${findings.onSite.length + findings.missing.length} abilities its packs list.`];
  const notBuilt = abilitiesNotBuilt(findings.missing, scenarios);
  const missing = findings.missing.filter((ability) => !notBuilt.includes(ability));
  if (missing.length > 0) {
    lines.push(
      `Note: the packs list ${these(missing.length, 'ability', 'abilities')}, and the site's MCP server has no tool for ${missing.length === 1 ? 'it' : 'them'}, so a scenario that names one can't be judged on this site: ${missing.join(', ')}. Check the name in pack.yaml, and that the site registers the ability and makes it public for MCP.`,
    );
  }
  if (notBuilt.length > 0) {
    lines.push(
      `Note: ${these(notBuilt.length, 'ability', 'abilities')} ${notBuilt.length === 1 ? 'is' : 'are'} not built yet: the site has no tool for ${notBuilt.length === 1 ? 'it' : 'them'}, and only \`to-be-implemented\` scenarios name ${notBuilt.length === 1 ? 'it' : 'them'}, which fail as expected without an agent: ${notBuilt.join(', ')}.`,
    );
  }
  if (findings.inNoPack.length > 0) {
    lines.push(
      `Note: ${these(findings.inNoPack.length, 'tool')} of the site's MCP server present${findings.inNoPack.length === 1 ? 's' : ''} no ability that its packs list: ${findings.inNoPack.join(', ')}. A tool is named after its ability, with \`/\` written as \`-\`: list that ability as \`namespace/name\` under \`abilities\` in the pack.yaml of the pack it belongs to.`,
    );
  }
  lines.push(...definitionLines(findings.definitionFindings ?? [], detail));
  return lines;
}
