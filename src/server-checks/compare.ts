// Compares the tools a site's MCP server lists with the abilities its packs list, and checks each listed
// ability's definition and opt-in contract rules (schema portability, description, annotation hints, and direct
// tool exposure). It is plain code, apart from reading the server, so that what it decides is tested with plain values.

import { type LookupTools, type RunTool, lookupToolNames, toolOf } from '../mcp-server.ts';
import type { Pack } from '../packs/types.ts';
import type { DefinitionFinding, ListedServer, ListedTool, ServerCheckConfig, ServerFindings, ToolHint } from './types.ts';
import { TOOL_HINTS } from './validate.ts';

/** Every ability the packs list, reads and writes, in the packs' order. */
export function listedAbilities(packs: Pick<Pack, 'abilities'>[]): string[] {
  return packs.flatMap((pack) => [...pack.abilities.reads, ...pack.abilities.writes]);
}

function hintProblems(
  ability: string,
  toolName: string,
  tool: ListedTool | undefined,
  reads: Set<string>,
  requiredHints: readonly ToolHint[],
  expectedHints: Partial<Record<ToolHint, boolean>> | undefined,
  reportedReadOnlyMismatch: boolean,
): DefinitionFinding[] {
  const hintsToCheck = TOOL_HINTS.filter(
    (hint) => requiredHints.includes(hint) || (expectedHints !== undefined && Object.hasOwn(expectedHints, hint)),
  );
  if (hintsToCheck.length === 0) return [];

  const findings: DefinitionFinding[] = [];
  const annotations = tool?.annotations;
  for (const hint of hintsToCheck) {
    const actual = annotations?.[hint];
    const hasExpected = expectedHints !== undefined && Object.hasOwn(expectedHints, hint);
    const expected = hasExpected ? expectedHints[hint] : undefined;
    const path = `annotations.${hint}`;

    if (actual === undefined) {
      findings.push({
        ability,
        severity: 'error',
        rule: 'missing-hint',
        path,
        issue: hasExpected
          ? `The tool \`${toolName}\` omits \`${path}\`, expected \`${String(expected)}\` explicitly.`
          : `The tool \`${toolName}\` omits \`${path}\`, which this project requires to be explicit.`,
        suggestion: hasExpected
          ? `Advertise \`${path}: ${String(expected)}\` explicitly on the tool (an omitted hint is not treated as \`false\`), or update \`serverChecks.hints\` if this value is not expected.`
          : hint === 'readOnlyHint'
            ? `Advertise \`annotations.readOnlyHint: ${reads.has(ability) ? 'true' : 'false'}\` explicitly on the tool (matching \`pack.yaml\`), or remove \`readOnlyHint\` from \`serverChecks.requiredHints\`.`
            : `Advertise \`${path}\` explicitly as \`true\` or \`false\` on the tool (an omitted hint is not treated as \`false\`), or remove \`${hint}\` from \`serverChecks.requiredHints\`.`,
      });
    } else if (hasExpected && actual !== expected) {
      // Avoid emitting a second error on `annotations.readOnlyHint` when `read-only-mismatch` already reported it.
      if (hint === 'readOnlyHint' && reportedReadOnlyMismatch) continue;
      findings.push({
        ability,
        severity: 'error',
        rule: 'hint-mismatch',
        path,
        issue: `The tool \`${toolName}\` advertises \`${path}: ${String(actual)}\`, expected \`${String(expected)}\`.`,
        suggestion: `Update the tool's \`${path}\` to \`${String(expected)}\`, or change \`serverChecks.hints\` if \`${String(actual)}\` is intentional.`,
      });
    }
  }
  return findings;
}

function definitionProblems(
  onSite: string[],
  reads: Set<string>,
  writes: Set<string>,
  toolsByName: Map<string, ListedTool>,
  schemaFindings: ListedServer['schemaFindings'],
  config?: ServerCheckConfig,
): DefinitionFinding[] {
  const findings: DefinitionFinding[] = [];
  const requiredHints = config?.requiredHints ?? [];
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
    let reportedReadOnlyMismatch = false;
    if (readOnly === true && writes.has(ability)) {
      reportedReadOnlyMismatch = true;
      findings.push({
        ability,
        severity: 'error',
        rule: 'read-only-mismatch',
        path: 'annotations.readOnlyHint',
        issue: 'The tool advertises `readOnlyHint: true`, but its pack lists it under `writes`.',
        suggestion: 'Set `readonly` to `false` in the ability\'s annotations, or move the ability to `reads` in `pack.yaml` if it does not change the site.',
      });
    } else if (readOnly === false && reads.has(ability)) {
      reportedReadOnlyMismatch = true;
      findings.push({
        ability,
        severity: 'error',
        rule: 'read-only-mismatch',
        path: 'annotations.readOnlyHint',
        issue: 'The tool advertises `readOnlyHint: false`, but its pack lists it under `reads`.',
        suggestion: 'Set `readonly` to `true` in the ability\'s annotations, or move the ability to `writes` in `pack.yaml` if it changes the site.',
      });
    }
    findings.push(...hintProblems(ability, toolName, tool, reads, requiredHints, config?.hints?.[ability], reportedReadOnlyMismatch));
  }
  return findings;
}

/** Listed abilities that the project requires to appear as individual direct tools in `tools/list`. */
function requiredDirectAbilities(listed: string[], directTools: ServerCheckConfig['directTools']): string[] {
  if (directTools === true) return listed;
  if (!Array.isArray(directTools) || directTools.length === 0) return [];
  const listedSet = new Set(listed);
  const seen = new Set<string>();
  const required: string[] = [];
  for (const ability of directTools) {
    if (!listedSet.has(ability) || seen.has(ability)) continue;
    seen.add(ability);
    required.push(ability);
  }
  return required;
}

function directToolFinding(ability: string, viaTools: string[]): DefinitionFinding {
  const toolName = toolOf(ability);
  const formatted = viaTools.map((tool) => `\`${tool}\``).join(', ');
  return {
    ability,
    severity: 'error',
    rule: 'not-direct-tool',
    path: 'tools',
    issue: `The ability \`${ability}\` is not exposed as a direct tool (\`${toolName}\`) in \`tools/list\`; it is only reachable through ${formatted}.`,
    suggestion: `Expose \`${ability}\` as an individually callable MCP tool (\`${toolName}\`) on the server, or remove it from \`serverChecks.directTools\`.`,
  };
}

/** Active lookup run tools that route `ability`. On a hybrid server, only prefixed tools route abilities behind lookup. */
function lookupRunToolsFor(ability: string, activeRunTools: RunTool[], pureLookup: boolean): string[] {
  if (pureLookup) {
    const matched = activeRunTools
      .filter((one) => one.prefix === undefined || one.prefix === '' || ability.startsWith(one.prefix))
      .map((one) => one.tool);
    return matched.length > 0 ? matched : activeRunTools.map((one) => one.tool);
  }
  return activeRunTools
    .filter((one) => one.prefix !== undefined && one.prefix !== '' && ability.startsWith(one.prefix))
    .map((one) => one.tool);
}

/**
 * What the server's tools say about the listed abilities. An ability is on the site when the server has the
 * tool that presents it (`toolOf`), the rule the checks use to tell which ability a call ran.
 */
export function compareWithPacks(
  packs: Pick<Pack, 'abilities'>[],
  server: ListedServer,
  lookup: LookupTools | undefined,
  config?: ServerCheckConfig,
): ServerFindings {
  const version = server.inspectorVersion === undefined ? {} : { inspectorVersion: server.inspectorVersion };
  const toolNames = server.tools.map((tool) => tool.name);
  const lookupTools = new Set(lookupToolNames(lookup));
  const activeRunTools = (lookup?.runTools ?? []).filter((one) => toolNames.includes(one.tool));
  const runTools = activeRunTools.map((one) => one.tool);
  const hasDirectTools = toolNames.some((tool) => !lookupTools.has(tool));
  const listed = listedAbilities(packs);
  const requiredDirect = requiredDirectAbilities(listed, config?.directTools);

  if (runTools.length > 0 && !hasDirectTools) {
    const definitionFindings = requiredDirect.map((ability) => directToolFinding(ability, lookupRunToolsFor(ability, activeRunTools, true)));
    return {
      outcome: 'behind-lookup',
      ...version,
      runTools,
      ...(definitionFindings.length === 0 ? {} : { definitionFindings }),
    };
  }

  const reads = new Set(packs.flatMap((pack) => pack.abilities.reads));
  const writes = new Set(packs.flatMap((pack) => pack.abilities.writes));
  const toolsByName = new Map(server.tools.map((tool) => [tool.name, tool]));
  const listedTools = new Set(listed.map(toolOf));
  const prefixes = activeRunTools.map((one) => one.prefix).filter((prefix): prefix is string => prefix !== undefined && prefix !== '');
  const behindLookup = (ability: string): boolean => prefixes.some((prefix) => ability.startsWith(prefix));
  const onSite = listed.filter((ability) => toolsByName.has(toolOf(ability)));
  const directFindings = requiredDirect
    .filter((ability) => !toolsByName.has(toolOf(ability)) && behindLookup(ability))
    .map((ability) => directToolFinding(ability, lookupRunToolsFor(ability, activeRunTools, false)));
  const definitionFindings = [...definitionProblems(onSite, reads, writes, toolsByName, server.schemaFindings, config), ...directFindings];
  return {
    outcome: 'compared',
    ...version,
    onSite,
    missing: listed.filter((ability) => !toolsByName.has(toolOf(ability)) && !behindLookup(ability)),
    inNoPack: toolNames.filter((tool) => !listedTools.has(tool) && !lookupTools.has(tool)),
    ...(definitionFindings.length === 0 ? {} : { definitionFindings }),
  };
}
