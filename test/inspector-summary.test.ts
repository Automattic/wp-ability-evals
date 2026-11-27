// The MCP Inspector audit view turns saved server checks and an optional `server.json` tool snapshot into a
// contract scorecard, rule-grouped findings, and per-tool rows. Tested with plain values so input/output
// portability splits, error/warning check statuses, and tool-to-ability joins cannot drift silently.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AbilityCoverage, DefinitionFinding, PackCoverage, ServerFindings, ServerSnapshot } from '../src/results/types.ts';
import { buildInspectorAudit, toolInputPreview } from '../viewer/inspector-summary.ts';

const EMPTY_GROUPS = { passing: 2, 'in-failing-scenario': 0, 'known-defect-or-not-built': 0, 'no-result-yet': 0, 'not-tested': 0, 'missing-from-site': 0 };
const EMPTY_SCENARIOS = { total: 2, passed: 2, failed: 0, knownDefect: 0, notBuilt: 0, error: 0, notRunYet: 0 };
const PACKS: PackCoverage[] = [{ name: 'media', title: 'Media', abilities: 2, tested: 2, groups: EMPTY_GROUPS, scenarios: EMPTY_SCENARIOS }];

function ability(name: string, kind: 'read' | 'write', findings?: DefinitionFinding[]): AbilityCoverage {
  return {
    ability: name,
    pack: 'media',
    area: 'media',
    kind,
    group: 'passing',
    scenarios: 1,
    passed: 1,
    failed: 0,
    knownDefect: 0,
    notBuilt: 0,
    notJudged: 0,
    notRunYet: 0,
    ranIn: 1,
    calls: 1,
    errored: 0,
    errors: [],
    ...(findings === undefined ? {} : { definitionFindings: findings }),
    results: [],
  };
}

test('buildInspectorAudit separates input vs output schema warnings, groups rules with errors first, and joins server.json tools', () => {
  const findingsList: DefinitionFinding[] = [
    { ability: 'wp/media-query', severity: 'warning', rule: 'type-union', path: 'outputSchema.properties.caption', issue: 'Array type.', suggestion: 'Use anyOf.' },
    { ability: 'wp/media-upload', severity: 'warning', rule: 'type-union', path: 'inputSchema.properties.title', issue: 'Array type.', suggestion: 'Use anyOf.' },
    { ability: 'wp/media-upload', severity: 'error', rule: 'read-only-mismatch', path: 'annotations.readOnlyHint', issue: 'Contradicts writes.', suggestion: 'Set readonly false.' },
  ];
  const serverFindings: ServerFindings = {
    outcome: 'compared',
    inspectorVersion: '2.16.0',
    onSite: ['wp/media-query', 'wp/media-upload'],
    missing: [],
    inNoPack: ['extra-tool'],
    definitionFindings: findingsList,
  };
  const snapshot: ServerSnapshot = {
    inspectorVersion: '2.16.0',
    tools: [
      { name: 'wp-media-query', title: 'Media Query', description: 'Reads media.', annotations: { readOnlyHint: true }, inputSchema: { type: 'object' } },
      { name: 'wp-media-upload', title: 'Media Upload', description: 'Uploads media.', annotations: { readOnlyHint: true, destructiveHint: false } },
      { name: 'extra-tool', title: 'Extra', description: 'Unlisted tool.' },
    ],
  };

  const audit = buildInspectorAudit(serverFindings, [], [ability('wp/media-query', 'read', [findingsList[0]!]), ability('wp/media-upload', 'write', [findingsList[1]!, findingsList[2]!])], PACKS, snapshot);

  assert.deepEqual(
    audit.checks.map(({ id, status }) => ({ id, status })),
    [
      { id: 'handshake', status: 'pass' },
      { id: 'registration', status: 'warning' },
      { id: 'descriptions', status: 'pass' },
      { id: 'annotations', status: 'fail' },
      { id: 'input-schemas', status: 'warning' },
      { id: 'output-schemas', status: 'warning' },
    ],
  );
  assert.deepEqual(audit.counts, { errors: 1, warnings: 2, inputWarnings: 1, outputWarnings: 1, metadataIssues: 1, affectedAbilities: 2 });
  assert.deepEqual(
    audit.ruleGroups.map(({ rule, severity, count, inputCount, outputCount, metadataCount, items }) => ({
      rule,
      severity,
      count,
      inputCount,
      outputCount,
      metadataCount,
      paths: items.map(({ path }) => path),
    })),
    [
      { rule: 'read-only-mismatch', severity: 'error', count: 1, inputCount: 0, outputCount: 0, metadataCount: 1, paths: ['annotations.readOnlyHint'] },
      { rule: 'type-union', severity: 'warning', count: 2, inputCount: 1, outputCount: 1, metadataCount: 0, paths: ['inputSchema.properties.title', 'outputSchema.properties.caption'] },
    ],
  );
  assert.deepEqual(
    audit.tools.map(({ toolName, status, title, errors, inputWarnings, outputWarnings }) => ({ toolName, status, title, errors, inputWarnings, outputWarnings })),
    [
      { toolName: 'wp-media-query', status: 'on-site', title: 'Media Query', errors: 0, inputWarnings: 0, outputWarnings: 1 },
      { toolName: 'wp-media-upload', status: 'on-site', title: 'Media Upload', errors: 1, inputWarnings: 1, outputWarnings: 0 },
      { toolName: 'extra-tool', status: 'unlisted', title: 'Extra', errors: 0, inputWarnings: 0, outputWarnings: 0 },
    ],
  );
});

test('buildInspectorAudit reports opt-in hint and direct-tool failures on compared and behind-lookup servers', () => {
  const comparedAudit = buildInspectorAudit(
    {
      outcome: 'compared',
      onSite: ['wp/media-query'],
      missing: [],
      inNoPack: [],
      definitionFindings: [
        { ability: 'wp/media-query', severity: 'error', rule: 'missing-hint', path: 'annotations.destructiveHint', issue: 'Omitted destructiveHint.', suggestion: 'Set destructiveHint.' },
        { ability: 'wp/media-upload', severity: 'error', rule: 'not-direct-tool', path: 'tools', issue: 'Behind lookup.', suggestion: 'Expose directly.' },
      ],
    },
    [],
    [ability('wp/media-query', 'read'), ability('wp/media-upload', 'write')],
    PACKS,
  );

  assert.equal(comparedAudit.checks.find((check) => check.id === 'annotations')?.status, 'fail');
  assert.equal(comparedAudit.checks.find((check) => check.id === 'direct-tools')?.status, 'fail');
  assert.equal(comparedAudit.counts.metadataIssues, 2);
  assert.deepEqual(
    comparedAudit.tools.map(({ toolName, status, errors }) => ({ toolName, status, errors })),
    [
      { toolName: 'wp-media-query', status: 'on-site', errors: 1 },
      { toolName: 'wp-media-upload', status: 'behind-lookup', errors: 1 },
    ],
  );

  const lookupAudit = buildInspectorAudit(
    {
      outcome: 'behind-lookup',
      runTools: ['mcp-adapter-execute-ability'],
      definitionFindings: [
        { ability: 'wp/media-upload', severity: 'error', rule: 'not-direct-tool', path: 'tools', issue: 'Behind lookup.', suggestion: 'Expose directly.' },
      ],
    },
    [],
    [ability('wp/media-query', 'read'), ability('wp/media-upload', 'write')],
    PACKS,
  );

  assert.deepEqual(
    lookupAudit.checks.map(({ id, status }) => ({ id, status })),
    [
      { id: 'handshake', status: 'pass' },
      { id: 'direct-tools', status: 'fail' },
    ],
  );
  assert.deepEqual(
    lookupAudit.tools.map(({ toolName, status, errors }) => ({ toolName, status, errors })),
    [
      { toolName: 'mcp-adapter-execute-ability', status: 'lookup', errors: 0 },
      { toolName: 'wp-media-upload', status: 'behind-lookup', errors: 1 },
    ],
  );
  assert.equal(lookupAudit.counts.errors, 1);
  assert.equal(lookupAudit.ruleGroups[0]?.rule, 'not-direct-tool');
});

test('toolInputPreview renders compact argument summaries and truncates long values', () => {
  assert.equal(toolInputPreview({}), '');
  assert.equal(toolInputPreview({ fields: ['email'], force: true }), 'fields: ["email"], force: true');
  assert.equal(toolInputPreview({ data: 'a'.repeat(80) }), 'data: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa…"');
});
