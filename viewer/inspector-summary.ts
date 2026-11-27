// Summarizes what MCP Inspector found on the site's server for the viewer: contract checks that passed and
// failed, findings grouped by rule so repeated portability explanations appear once, and a unified tool list
// joining pack abilities with lazy-loaded `server.json` tool definitions. Pure code, tested with plain values.

import type { AbilityCoverage, DefinitionFinding, ListedTool, PackCoverage, ServerFindings, ServerSnapshot, ToolAnnotations } from '../src/results/types.ts';

export type FindingScope = 'input' | 'output' | 'metadata';

export interface InspectorCheck {
  id: string;
  label: string;
  status: 'pass' | 'warning' | 'fail';
  summary: string;
  detail: string;
}

export interface RuleGroup {
  rule: string;
  severity: 'error' | 'warning';
  issue: string;
  suggestion: string;
  count: number;
  inputCount: number;
  outputCount: number;
  metadataCount: number;
  abilities: string[];
  items: DefinitionFinding[];
}

export interface InspectedToolRow {
  id: string;
  toolName: string;
  ability?: string;
  pack?: string;
  packTitle?: string;
  kind?: 'read' | 'write';
  status: 'on-site' | 'missing' | 'not-built' | 'behind-lookup' | 'lookup' | 'unlisted';
  title?: string;
  description?: string;
  annotations?: ToolAnnotations;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  errors: number;
  inputWarnings: number;
  outputWarnings: number;
  findings: DefinitionFinding[];
}

export interface InspectorAudit {
  checks: InspectorCheck[];
  ruleGroups: RuleGroup[];
  tools: InspectedToolRow[];
  counts: {
    errors: number;
    warnings: number;
    inputWarnings: number;
    outputWarnings: number;
    metadataIssues: number;
    affectedAbilities: number;
  };
}

export function findingScope(finding: Pick<DefinitionFinding, 'path'>): FindingScope {
  if (finding.path === 'inputSchema' || finding.path.startsWith('inputSchema.')) return 'input';
  if (finding.path === 'outputSchema' || finding.path.startsWith('outputSchema.')) return 'output';
  return 'metadata';
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

function scopeRank(scope: FindingScope): number {
  return scope === 'metadata' ? 0 : scope === 'input' ? 1 : 2;
}

/** Groups findings by `(rule, severity)` with errors first, and `inputSchema` paths ahead of `outputSchema`. */
export function groupFindingsByRule(findings: DefinitionFinding[]): RuleGroup[] {
  const byKey = new Map<string, RuleGroup>();
  for (const finding of findings) {
    const key = `${finding.severity}:${finding.rule}`;
    const scope = findingScope(finding);
    const group = byKey.get(key) ?? {
      rule: finding.rule,
      severity: finding.severity,
      issue: finding.issue,
      suggestion: finding.suggestion,
      count: 0,
      inputCount: 0,
      outputCount: 0,
      metadataCount: 0,
      abilities: [],
      items: [],
    };
    group.count += 1;
    if (scope === 'input') group.inputCount += 1;
    else if (scope === 'output') group.outputCount += 1;
    else group.metadataCount += 1;
    if (!group.abilities.includes(finding.ability)) group.abilities.push(finding.ability);
    group.items.push(finding);
    byKey.set(key, group);
  }
  return [...byKey.values()]
    .map((group) => ({
      ...group,
      items: [...group.items].sort((one, other) => scopeRank(findingScope(one)) - scopeRank(findingScope(other)) || one.ability.localeCompare(other.ability) || one.path.localeCompare(other.path)),
    }))
    .sort((one, other) => (one.severity === other.severity ? other.count - one.count : one.severity === 'error' ? -1 : 1));
}

/** Builds the complete MCP Inspector contract scorecard, rule groups and per-tool rows from saved findings and an optional `server.json` snapshot. */
export function buildInspectorAudit(
  findings: ServerFindings,
  notBuilt: string[],
  abilities: AbilityCoverage[],
  packs: PackCoverage[],
  snapshot?: ServerSnapshot,
): InspectorAudit {
  const emptyCounts = { errors: 0, warnings: 0, inputWarnings: 0, outputWarnings: 0, metadataIssues: 0, affectedAbilities: 0 };
  if (findings.outcome === 'unreadable') {
    return {
      checks: [
        {
          id: 'handshake',
          label: 'MCP server handshake & tool listing',
          status: 'fail',
          summary: 'Server could not be read',
          detail: findings.reason,
        },
      ],
      ruleGroups: [],
      tools: [],
      counts: emptyCounts,
    };
  }

  const versionNote = findings.inspectorVersion ?? snapshot?.inspectorVersion;
  const inspectorLabel = versionNote === undefined ? 'MCP Inspector (--strict)' : `MCP Inspector v${versionNote} (--strict)`;

  if (findings.outcome === 'behind-lookup') {
    const definitions = findings.definitionFindings ?? [];
    const errors = definitions.filter((item) => item.severity === 'error');
    const warnings = definitions.filter((item) => item.severity === 'warning');
    const metadataIssues = definitions.filter((item) => findingScope(item) === 'metadata').length;
    const directToolFindings = definitions.filter((item) => item.rule === 'not-direct-tool');
    const packTitles = new Map(packs.map((pack) => [pack.name, pack.title]));
    const abilitiesByName = new Map(abilities.map((ability) => [ability.ability, ability]));
    const findingsByAbility = new Map<string, DefinitionFinding[]>();
    for (const item of definitions) findingsByAbility.set(item.ability, [...(findingsByAbility.get(item.ability) ?? []), item]);

    const rawTools: ListedTool[] = snapshot?.tools ?? findings.runTools.map((name) => ({ name }));
    const tools: InspectedToolRow[] = [
      ...rawTools.map((tool): InspectedToolRow => ({
        id: `lookup:${tool.name}`,
        toolName: tool.name,
        status: 'lookup',
        ...(tool.title === undefined ? {} : { title: tool.title }),
        ...(tool.description === undefined ? {} : { description: tool.description }),
        ...(tool.annotations === undefined ? {} : { annotations: tool.annotations }),
        ...(tool.inputSchema === undefined ? {} : { inputSchema: tool.inputSchema }),
        ...(tool.outputSchema === undefined ? {} : { outputSchema: tool.outputSchema }),
        errors: 0,
        inputWarnings: 0,
        outputWarnings: 0,
        findings: [],
      })),
      ...[...findingsByAbility.entries()].map(([abilityName, itemFindings]): InspectedToolRow => {
        const covered = abilitiesByName.get(abilityName);
        return {
          id: abilityName,
          toolName: abilityName.replaceAll('/', '-'),
          ability: abilityName,
          ...(covered === undefined ? {} : { pack: covered.pack, packTitle: packTitles.get(covered.pack) ?? covered.pack, kind: covered.kind }),
          status: 'behind-lookup',
          errors: itemFindings.filter((item) => item.severity === 'error').length,
          inputWarnings: itemFindings.filter((item) => item.severity === 'warning' && findingScope(item) === 'input').length,
          outputWarnings: itemFindings.filter((item) => item.severity === 'warning' && findingScope(item) === 'output').length,
          findings: itemFindings,
        };
      }),
    ];
    const checks: InspectorCheck[] = [
      {
        id: 'handshake',
        label: 'MCP server handshake & tool listing',
        status: 'pass',
        summary: `Connected via ${inspectorLabel}`,
        detail: `Server exposes lookup execution tools (${findings.runTools.join(', ')}), so individual abilities are discovered at runtime rather than listed directly by tools/list.`,
      },
      ...(directToolFindings.length === 0
        ? []
        : [
            {
              id: 'direct-tools',
              label: 'Required direct tools',
              status: 'fail' as const,
              summary: `${plural(directToolFindings.length, 'ability', 'abilities')} behind lookup`,
              detail: `${plural(directToolFindings.length, 'required ability', 'required abilities')} (${directToolFindings.map((item) => item.ability).join(', ')}) are only reachable through lookup tools instead of appearing directly in tools/list.`,
            },
          ]),
    ];
    return {
      checks,
      ruleGroups: groupFindingsByRule(definitions),
      tools,
      counts: {
        errors: errors.length,
        warnings: warnings.length,
        inputWarnings: 0,
        outputWarnings: 0,
        metadataIssues,
        affectedAbilities: new Set(definitions.map((item) => item.ability)).size,
      },
    };
  }

  const definitions = findings.definitionFindings ?? [];
  const errors = definitions.filter((item) => item.severity === 'error');
  const warnings = definitions.filter((item) => item.severity === 'warning');
  const inputFindings = definitions.filter((item) => findingScope(item) === 'input');
  const outputFindings = definitions.filter((item) => findingScope(item) === 'output');
  const inputErrors = inputFindings.filter((item) => item.severity === 'error');
  const inputWarnings = inputFindings.filter((item) => item.severity === 'warning');
  const outputErrors = outputFindings.filter((item) => item.severity === 'error');
  const outputWarnings = outputFindings.filter((item) => item.severity === 'warning');
  const missingDescriptions = definitions.filter((item) => item.rule === 'missing-description');
  const annotationFindings = definitions.filter((item) => item.rule === 'read-only-mismatch' || item.rule === 'missing-hint' || item.rule === 'hint-mismatch');
  const annotationAbilities = new Set(annotationFindings.map((item) => item.ability)).size;
  const directToolFindings = definitions.filter((item) => item.rule === 'not-direct-tool');
  const metadataIssues = definitions.filter((item) => findingScope(item) === 'metadata').length;

  const notBuiltSet = new Set(notBuilt);
  const missingSet = new Set(findings.missing);
  const missingReal = findings.missing.filter((ability) => !notBuiltSet.has(ability));
  const onSiteSet = new Set(findings.onSite);
  const listedTotal = findings.onSite.length + findings.missing.length;
  const totalToolsListed = snapshot?.tools.length ?? findings.onSite.length + findings.inNoPack.length;

  const checks: InspectorCheck[] = [
    {
      id: 'handshake',
      label: 'MCP handshake & tools/list',
      status: 'pass',
      summary: `${plural(totalToolsListed, 'tool')} listed`,
      detail: `Connected over Streamable HTTP using ${inspectorLabel} and retrieved the server's tool catalog.`,
    },
    {
      id: 'registration',
      label: 'Pack registration alignment',
      status: missingReal.length > 0 ? 'fail' : findings.inNoPack.length > 0 ? 'warning' : 'pass',
      summary: `${findings.onSite.length} of ${listedTotal} pack abilities exposed`,
      detail:
        missingReal.length > 0
          ? `${plural(missingReal.length, 'ability', 'abilities')} listed in packs are missing from the server (${missingReal.join(', ')}).`
          : findings.inNoPack.length > 0
            ? `Every implemented pack ability is exposed; ${plural(findings.inNoPack.length, 'extra tool')} on the server ${findings.inNoPack.length === 1 ? 'is' : 'are'} not listed in any pack.`
            : notBuilt.length > 0
              ? `Every implemented pack ability is exposed (${plural(notBuilt.length, 'ability', 'abilities')} waiting in to-be-implemented scenarios).`
              : 'Every ability declared in packs is registered on the MCP server, with no unlisted tools.',
    },
    {
      id: 'descriptions',
      label: 'Tool descriptions',
      status: missingDescriptions.length > 0 ? 'fail' : 'pass',
      summary: `${findings.onSite.length - missingDescriptions.length} of ${findings.onSite.length} described`,
      detail:
        missingDescriptions.length > 0
          ? `${plural(missingDescriptions.length, 'listed ability', 'listed abilities')} expose an empty description, impairing tool discovery.`
          : 'Every listed ability exposes a non-empty description so agents can select it accurately.',
    },
    {
      id: 'annotations',
      label: 'Tool annotations & hints',
      status: annotationFindings.length > 0 ? 'fail' : 'pass',
      summary: `${findings.onSite.length - annotationAbilities} of ${findings.onSite.length} aligned`,
      detail:
        annotationFindings.length > 0
          ? `${plural(annotationFindings.length, 'annotation issue')} across ${plural(annotationAbilities, 'ability', 'abilities')} (readOnlyHint alignment or configured hint contract).`
          : 'All tool annotations match pack.yaml reads/writes and any configured hint contract.',
    },
    ...(directToolFindings.length === 0
      ? []
      : [
          {
            id: 'direct-tools',
            label: 'Required direct tools',
            status: 'fail' as const,
            summary: `${plural(directToolFindings.length, 'ability', 'abilities')} behind lookup`,
            detail: `${plural(directToolFindings.length, 'required ability', 'required abilities')} (${directToolFindings.map((item) => item.ability).join(', ')}) are only reachable through lookup tools instead of appearing directly in tools/list.`,
          },
        ]),
    {
      id: 'input-schemas',
      label: 'Input schema portability (--strict)',
      status: inputErrors.length > 0 ? 'fail' : inputWarnings.length > 0 ? 'warning' : 'pass',
      summary:
        inputFindings.length === 0
          ? `All ${findings.onSite.length} input schemas portable`
          : [inputErrors.length > 0 ? plural(inputErrors.length, 'error') : '', inputWarnings.length > 0 ? plural(inputWarnings.length, 'warning') : ''].filter(Boolean).join(', '),
      detail:
        inputFindings.length === 0
          ? 'No JSON Schema portability issues found in any tool inputSchema.'
          : `${plural(inputFindings.length, 'finding')} across ${plural(new Set(inputFindings.map((f) => f.ability)).size, 'ability', 'abilities')}. Input schema issues affect whether stricter clients (such as OpenAPI single-type dialects) accept tool calls.`,
    },
    {
      id: 'output-schemas',
      label: 'Output schema portability (--strict)',
      status: outputErrors.length > 0 ? 'fail' : outputWarnings.length > 0 ? 'warning' : 'pass',
      summary:
        outputFindings.length === 0
          ? `All ${findings.onSite.length} output schemas portable`
          : [outputErrors.length > 0 ? plural(outputErrors.length, 'error') : '', outputWarnings.length > 0 ? plural(outputWarnings.length, 'warning') : ''].filter(Boolean).join(', '),
      detail:
        outputFindings.length === 0
          ? 'No JSON Schema portability issues found in any tool outputSchema.'
          : `${plural(outputFindings.length, 'finding')} across ${plural(new Set(outputFindings.map((f) => f.ability)).size, 'ability', 'abilities')}. Output schema warnings are typically nullable ["string","null"] response fields.`,
    },
  ];

  const packTitles = new Map(packs.map((pack) => [pack.name, pack.title]));
  const snapshotByName = new Map<string, ListedTool>((snapshot?.tools ?? []).map((tool) => [tool.name, tool]));
  const findingsByAbility = new Map<string, DefinitionFinding[]>();
  for (const item of definitions) findingsByAbility.set(item.ability, [...(findingsByAbility.get(item.ability) ?? []), item]);

  const tools: InspectedToolRow[] = abilities.map((ability) => {
    const toolName = ability.ability.replaceAll('/', '-');
    const raw = snapshotByName.get(toolName);
    const itemFindings = findingsByAbility.get(ability.ability) ?? [];
    const status: InspectedToolRow['status'] = onSiteSet.has(ability.ability)
      ? 'on-site'
      : notBuiltSet.has(ability.ability)
        ? 'not-built'
        : missingSet.has(ability.ability)
          ? 'missing'
          : 'behind-lookup';
    return {
      id: ability.ability,
      toolName,
      ability: ability.ability,
      pack: ability.pack,
      packTitle: packTitles.get(ability.pack) ?? ability.pack,
      kind: ability.kind,
      status,
      ...(raw?.title === undefined ? {} : { title: raw.title }),
      ...(raw?.description === undefined ? {} : { description: raw.description }),
      ...(raw?.annotations === undefined ? {} : { annotations: raw.annotations }),
      ...(raw?.inputSchema === undefined ? {} : { inputSchema: raw.inputSchema }),
      ...(raw?.outputSchema === undefined ? {} : { outputSchema: raw.outputSchema }),
      errors: itemFindings.filter((item) => item.severity === 'error').length,
      inputWarnings: itemFindings.filter((item) => item.severity === 'warning' && findingScope(item) === 'input').length,
      outputWarnings: itemFindings.filter((item) => item.severity === 'warning' && findingScope(item) === 'output').length,
      findings: itemFindings,
    };
  });

  for (const toolName of findings.inNoPack) {
    const raw = snapshotByName.get(toolName);
    tools.push({
      id: `unlisted:${toolName}`,
      toolName,
      status: 'unlisted',
      ...(raw?.title === undefined ? {} : { title: raw.title }),
      ...(raw?.description === undefined ? {} : { description: raw.description }),
      ...(raw?.annotations === undefined ? {} : { annotations: raw.annotations }),
      ...(raw?.inputSchema === undefined ? {} : { inputSchema: raw.inputSchema }),
      ...(raw?.outputSchema === undefined ? {} : { outputSchema: raw.outputSchema }),
      errors: 0,
      inputWarnings: 0,
      outputWarnings: 0,
      findings: [],
    });
  }

  return {
    checks,
    ruleGroups: groupFindingsByRule(definitions),
    tools,
    counts: {
      errors: errors.length,
      warnings: warnings.length,
      inputWarnings: inputWarnings.length,
      outputWarnings: outputWarnings.length,
      metadataIssues,
      affectedAbilities: new Set(definitions.map((item) => item.ability)).size,
    },
  };
}

/** One-line compact preview of a tool call's input arguments for the scannable Trial timeline. */
export function toolInputPreview(input: unknown, maxLength = 92): string {
  if (input === null || input === undefined) return '';
  if (typeof input !== 'object') return String(input).slice(0, maxLength);
  if (Array.isArray(input)) return input.length === 0 ? '' : JSON.stringify(input).slice(0, maxLength);
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length === 0) return '';
  const formatted = entries
    .map(([key, value]) => {
      const rendered = typeof value === 'string' ? JSON.stringify(value.length > 36 ? `${value.slice(0, 33)}…` : value) : JSON.stringify(value);
      return `${key}: ${rendered}`;
    })
    .join(', ');
  return formatted.length > maxLength ? `${formatted.slice(0, maxLength - 1)}…` : formatted;
}
