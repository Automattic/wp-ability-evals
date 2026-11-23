// Compares the tools a site's MCP server lists with the abilities its packs list, and checks each listed
// ability's definition (schema portability, description, and read/write annotation). It is plain code, apart
// from reading the server, so that what it decides is tested with plain values.

import { type LookupTools, lookupToolNames, toolOf } from '../mcp-server.ts';
import type { Pack } from '../packs/types.ts';
import type { DefinitionFinding, ListedServer, ListedTool, ServerFindings } from './types.ts';

/** Every ability the packs list, reads and writes, in the packs' order. */
export function listedAbilities(packs: Pick<Pack, 'abilities'>[]): string[] {
  return packs.flatMap((pack) => [...pack.abilities.reads, ...pack.abilities.writes]);
}

function definitionProblems(
  onSite: string[],
  reads: Set<string>,
  writes: Set<string>,
  toolsByName: Map<string, ListedTool>,
  schemaFindings: ListedServer['schemaFindings'],
): DefinitionFinding[] {
  const findings: DefinitionFinding[] = [];
  for (const ability of onSite) {
    const toolName = toolOf(ability);
    const tool = toolsByName.get(toolName);
    for (const item of schemaFindings) {
      if (item.toolName !== toolName) continue;
      findings.push({ ability, severity: item.severity, rule: item.rule, path: item.path, issue: item.issue, suggestion: item.suggestion });
    }
    if ((tool?.description ?? '').trim() === '') {
      findings.push({
        ability,
        severity: 'error',
        rule: 'missing-description',
        path: 'description',
        issue: 'The tool has no description.',
        suggestion: 'Give the ability a clear description when registering it: agents choose tools by their names and descriptions.',
      });
    }
    const readOnly = tool?.annotations?.readOnlyHint;
    if (readOnly === true && writes.has(ability)) {
      findings.push({
        ability,
        severity: 'error',
        rule: 'read-only-mismatch',
        path: 'annotations.readOnlyHint',
        issue: 'The tool advertises `readOnlyHint: true`, but its pack lists it under `writes`.',
        suggestion: 'Set `readonly` to `false` in the ability\'s annotations, or move the ability to `reads` in `pack.yaml` if it does not change the site.',
      });
    } else if (readOnly === false && reads.has(ability)) {
      findings.push({
        ability,
        severity: 'error',
        rule: 'read-only-mismatch',
        path: 'annotations.readOnlyHint',
        issue: 'The tool advertises `readOnlyHint: false`, but its pack lists it under `reads`.',
        suggestion: 'Set `readonly` to `true` in the ability\'s annotations, or move the ability to `writes` in `pack.yaml` if it changes the site.',
      });
    }
  }
  return findings;
}

/**
 * What the server's tools say about the listed abilities. An ability is on the site when the server has the
 * tool that presents it (`toolOf`), the rule the checks use to tell which ability a call ran.
 */
export function compareWithPacks(packs: Pick<Pack, 'abilities'>[], server: ListedServer, lookup: LookupTools | undefined): ServerFindings {
  const version = server.inspectorVersion === undefined ? {} : { inspectorVersion: server.inspectorVersion };
  const toolNames = server.tools.map((tool) => tool.name);
  const lookupTools = new Set(lookupToolNames(lookup));
  const activeRunTools = (lookup?.runTools ?? []).filter((one) => toolNames.includes(one.tool));
  const runTools = activeRunTools.map((one) => one.tool);
  const hasDirectTools = toolNames.some((tool) => !lookupTools.has(tool));
  if (runTools.length > 0 && !hasDirectTools) return { outcome: 'behind-lookup', ...version, runTools };
  const listed = listedAbilities(packs);
  const reads = new Set(packs.flatMap((pack) => pack.abilities.reads));
  const writes = new Set(packs.flatMap((pack) => pack.abilities.writes));
  const toolsByName = new Map(server.tools.map((tool) => [tool.name, tool]));
  const listedTools = new Set(listed.map(toolOf));
  const prefixes = activeRunTools.map((one) => one.prefix).filter((prefix): prefix is string => prefix !== undefined && prefix !== '');
  const behindLookup = (ability: string): boolean => prefixes.some((prefix) => ability.startsWith(prefix));
  const onSite = listed.filter((ability) => toolsByName.has(toolOf(ability)));
  const definitionFindings = definitionProblems(onSite, reads, writes, toolsByName, server.schemaFindings);
  return {
    outcome: 'compared',
    ...version,
    onSite,
    missing: listed.filter((ability) => !toolsByName.has(toolOf(ability)) && !behindLookup(ability)),
    inNoPack: toolNames.filter((tool) => !listedTools.has(tool) && !lookupTools.has(tool)),
    ...(definitionFindings.length === 0 ? {} : { definitionFindings }),
  };
}
