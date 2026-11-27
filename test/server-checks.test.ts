// The server checks compare the tools a site's MCP server lists with the abilities its packs list, and check
// each listed ability's MCP tool definition (schema portability, description and read/write annotation). What
// they find decides which scenarios a run judges and whether `site check` fails.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LookupTools } from '../src/mcp-server.ts';
import type { TrialResult, VerdictOutcome } from '../src/results/types.ts';
import { trialLeftOut } from '../src/runner/run.ts';
import { verdictFor } from '../src/runner/verdict.ts';
import type { Scenario } from '../src/scenarios/types.ts';
import { findingLines, hasProblem } from '../src/server-checks/check.ts';
import { compareWithPacks } from '../src/server-checks/compare.ts';
import { parseToolsOutput } from '../src/server-checks/inspector.ts';
import { scenariosLeftOut } from '../src/server-checks/left-out.ts';
import type { DefinitionFinding, ListedServer, ListedTool, ServerFindings, ToolAnnotations } from '../src/server-checks/types.ts';
import { resolveServerChecks } from '../src/server-checks/validate.ts';

const PACK = { abilities: { reads: ['core/get-site-info'], writes: ['core/update-site-title'] } };
const LOOKUP: LookupTools = {
  runTools: [{ tool: 'mcp-adapter-execute-ability', nameArgument: 'ability_name', inputArgument: 'parameters' }],
  otherTools: ['mcp-adapter-discover-abilities', 'mcp-adapter-get-ability-info'],
};

function tool(name: string, description = 'Describes what the ability does.', annotations?: boolean | ToolAnnotations): ListedTool {
  if (annotations === undefined) return { name, description };
  return { name, description, annotations: typeof annotations === 'boolean' ? { readOnlyHint: annotations } : annotations };
}

const CASES: { name: string; server: ListedServer; findings: ServerFindings }[] = [
  {
    name: 'a tool per ability: one listed ability is missing, one tool is in no pack, and a lookup tool is neither',
    server: { tools: [tool('core-get-site-info'), tool('core-get-environment-info'), tool('mcp-adapter-discover-abilities')], schemaFindings: [] },
    findings: { outcome: 'compared', onSite: ['core/get-site-info'], missing: ['core/update-site-title'], inNoPack: ['core-get-environment-info'] },
  },
  {
    name: 'a tool that runs any ability: the abilities may sit behind it, so nothing is compared',
    server: { tools: [tool('mcp-adapter-discover-abilities'), tool('mcp-adapter-get-ability-info'), tool('mcp-adapter-execute-ability')], schemaFindings: [] },
    findings: { outcome: 'behind-lookup', runTools: ['mcp-adapter-execute-ability'] },
  },
  {
    name: 'definition checks: schema findings, missing description and contradictory readOnlyHint on listed abilities only',
    server: {
      tools: [
        tool('core-get-site-info', '   ', false),
        tool('core-update-site-title', 'Updates the site title.', true),
        tool('other-unlisted-tool', ''),
      ],
      schemaFindings: [
        { toolName: 'core-update-site-title', rule: 'boolean-schema', severity: 'error', path: 'inputSchema.properties.title', issue: 'Bare `true` used.', suggestion: 'Declare a type.' },
        { toolName: 'core-get-site-info', rule: 'type-union', severity: 'warning', path: 'outputSchema.properties.tagline', issue: 'Array type.', suggestion: 'Use anyOf.' },
        { toolName: 'other-unlisted-tool', rule: 'boolean-schema', severity: 'error', path: 'inputSchema', issue: 'Ignored: not in any pack.', suggestion: '' },
      ],
    },
    findings: {
      outcome: 'compared',
      onSite: ['core/get-site-info', 'core/update-site-title'],
      missing: [],
      inNoPack: ['other-unlisted-tool'],
      definitionFindings: [
        { ability: 'core/get-site-info', severity: 'warning', rule: 'type-union', path: 'outputSchema.properties.tagline', issue: 'Array type.', suggestion: 'Use anyOf.' },
        {
          ability: 'core/get-site-info',
          severity: 'error',
          rule: 'missing-description',
          path: 'description',
          issue: 'The tool has no description.',
          suggestion: 'Give the ability a clear description when registering it: agents choose tools by their names and descriptions.',
        },
        {
          ability: 'core/get-site-info',
          severity: 'error',
          rule: 'read-only-mismatch',
          path: 'annotations.readOnlyHint',
          issue: 'The tool advertises `readOnlyHint: false`, but its pack lists it under `reads`.',
          suggestion: 'Set `readonly` to `true` in the ability\'s annotations, or move the ability to `writes` in `pack.yaml` if it changes the site.',
        },
        { ability: 'core/update-site-title', severity: 'error', rule: 'boolean-schema', path: 'inputSchema.properties.title', issue: 'Bare `true` used.', suggestion: 'Declare a type.' },
        {
          ability: 'core/update-site-title',
          severity: 'error',
          rule: 'read-only-mismatch',
          path: 'annotations.readOnlyHint',
          issue: 'The tool advertises `readOnlyHint: true`, but its pack lists it under `writes`.',
          suggestion: 'Set `readonly` to `false` in the ability\'s annotations, or move the ability to `reads` in `pack.yaml` if it does not change the site.',
        },
      ],
    },
  },
];

for (const { name, server, findings } of CASES) {
  test(`server checks: ${name}`, () => {
    assert.deepEqual(compareWithPacks([PACK], server, LOOKUP), findings);
  });
}

test('server checks: a hybrid server compares direct tools and their definitions while treating prefixed lookup abilities as behind lookup', () => {
  const pack = { abilities: { reads: ['core/get-site-info', 'remote:plugin/read-status'], writes: ['core/update-site-title'] } };
  const hybridLookup: LookupTools = {
    runTools: [{ tool: 'execute_remote_ability', nameArgument: 'name', inputArgument: 'input', prefix: 'remote:' }],
    otherTools: ['search_remote_abilities', 'docs'],
  };
  const server: ListedServer = {
    tools: [
      tool('core-get-site-info', 'Reads site info.', true),
      tool('docs', 'Reads workflow docs.', true),
      tool('search_remote_abilities', 'Searches remote abilities.', true),
      tool('execute_remote_ability', 'Runs remote abilities.', false),
      tool('extra-tool', 'Not in any pack.', true),
    ],
    schemaFindings: [
      { toolName: 'core-get-site-info', rule: 'type-union', severity: 'warning', path: 'outputSchema.properties.name', issue: 'Array type.', suggestion: 'Use anyOf.' },
    ],
  };

  assert.deepEqual(compareWithPacks([pack], server, hybridLookup), {
    outcome: 'compared',
    onSite: ['core/get-site-info'],
    missing: ['core/update-site-title'],
    inNoPack: ['extra-tool'],
    definitionFindings: [
      { ability: 'core/get-site-info', severity: 'warning', rule: 'type-union', path: 'outputSchema.properties.name', issue: 'Array type.', suggestion: 'Use anyOf.' },
    ],
  });
});

test('server checks: opt-in hint rules distinguish explicit false from omitted, catch conflicts, and do not duplicate readOnlyHint errors', () => {
  const server: ListedServer = {
    tools: [
      tool('core-get-site-info', 'Reads site info.', { readOnlyHint: true, destructiveHint: false, idempotentHint: true }),
      tool('core-update-site-title', 'Updates the site title.', { readOnlyHint: true, idempotentHint: true }),
    ],
    schemaFindings: [],
  };

  const findings = compareWithPacks([PACK], server, LOOKUP, {
    requiredHints: ['readOnlyHint', 'destructiveHint'],
    hints: {
      'core/get-site-info': { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      'core/update-site-title': { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
  });

  assert.deepEqual(findings, {
    outcome: 'compared',
    onSite: ['core/get-site-info', 'core/update-site-title'],
    missing: [],
    inNoPack: [],
    definitionFindings: [
      {
        ability: 'core/update-site-title',
        severity: 'error',
        rule: 'read-only-mismatch',
        path: 'annotations.readOnlyHint',
        issue: 'The tool advertises `readOnlyHint: true`, but its pack lists it under `writes`.',
        suggestion: "Set `readonly` to `false` in the ability's annotations, or move the ability to `reads` in `pack.yaml` if it does not change the site.",
      },
      {
        ability: 'core/update-site-title',
        severity: 'error',
        rule: 'missing-hint',
        path: 'annotations.destructiveHint',
        issue: 'The tool `core-update-site-title` omits `annotations.destructiveHint`, expected `false` explicitly.',
        suggestion: 'Advertise `annotations.destructiveHint: false` explicitly on the tool (an omitted hint is not treated as `false`), or update `serverChecks.hints` if this value is not expected.',
      },
      {
        ability: 'core/update-site-title',
        severity: 'error',
        rule: 'hint-mismatch',
        path: 'annotations.idempotentHint',
        issue: 'The tool `core-update-site-title` advertises `annotations.idempotentHint: true`, expected `false`.',
        suggestion: "Update the tool's `annotations.idempotentHint` to `false`, or change `serverChecks.hints` if `true` is intentional.",
      },
    ],
  });
  assert.equal(hasProblem(findings, SCENARIOS), true);
});

test('server checks: requiredHints alone passes explicit false and flags omitted hints on listed tools', () => {
  const server: ListedServer = {
    tools: [
      tool('core-get-site-info', 'Reads site info.', { readOnlyHint: true, destructiveHint: false }),
      tool('core-update-site-title', 'Updates the site title.', {}),
    ],
    schemaFindings: [],
  };

  const findings = compareWithPacks([PACK], server, LOOKUP, { requiredHints: ['readOnlyHint', 'destructiveHint'] });

  assert.equal(findings.outcome, 'compared');
  assert.deepEqual(
    (findings.definitionFindings ?? []).map(({ ability, rule, path, severity }) => ({ ability, rule, path, severity })),
    [
      { ability: 'core/update-site-title', rule: 'missing-hint', path: 'annotations.readOnlyHint', severity: 'error' },
      { ability: 'core/update-site-title', rule: 'missing-hint', path: 'annotations.destructiveHint', severity: 'error' },
    ],
  );
});

test('server checks: directTools fails site check when an operation is only behind lookup without skipping lookup scenarios in a run', () => {
  const lookupOnly: ListedServer = {
    tools: [tool('mcp-adapter-discover-abilities'), tool('mcp-adapter-get-ability-info'), tool('mcp-adapter-execute-ability')],
    schemaFindings: [],
  };

  // Disabled (false): unchanged pure-lookup behavior.
  assert.deepEqual(compareWithPacks([PACK], lookupOnly, LOOKUP, { directTools: false }), {
    outcome: 'behind-lookup',
    runTools: ['mcp-adapter-execute-ability'],
  });

  // Enabled for selected ability: reports not-direct-tool error, fails site check, does not skip scenarios.
  const lookupFindings = compareWithPacks([PACK], lookupOnly, LOOKUP, { directTools: ['core/get-site-info'] });
  assert.deepEqual(lookupFindings, {
    outcome: 'behind-lookup',
    runTools: ['mcp-adapter-execute-ability'],
    definitionFindings: [
      {
        ability: 'core/get-site-info',
        severity: 'error',
        rule: 'not-direct-tool',
        path: 'tools',
        issue: 'The ability `core/get-site-info` is not exposed as a direct tool (`core-get-site-info`) in `tools/list`; it is only reachable through `mcp-adapter-execute-ability`.',
        suggestion: 'Expose `core/get-site-info` as an individually callable MCP tool (`core-get-site-info`) on the server, or remove it from `serverChecks.directTools`.',
      },
    ],
  });
  assert.equal(hasProblem(lookupFindings, SCENARIOS), true);
  assert.equal(scenariosLeftOut(SCENARIOS, lookupFindings).size, 0);
  assert.ok(findingLines(lookupFindings, SCENARIOS).some((line) => line.includes('core/get-site-info') && line.includes('mcp-adapter-execute-ability')));

  // Hybrid server: direct tool passes, prefixed lookup ability fails directTools without landing in missing.
  const hybridPack = { abilities: { reads: ['core/get-site-info', 'remote:plugin/read-status'], writes: [] } };
  const hybridLookup: LookupTools = {
    runTools: [{ tool: 'execute_remote_ability', nameArgument: 'name', inputArgument: 'input', prefix: 'remote:' }],
    otherTools: ['search_remote_abilities'],
  };
  const hybridServer: ListedServer = {
    tools: [
      tool('core-get-site-info', 'Reads site info.', { readOnlyHint: true }),
      tool('search_remote_abilities', 'Searches remote abilities.', { readOnlyHint: true }),
      tool('execute_remote_ability', 'Runs remote abilities.', { readOnlyHint: false }),
    ],
    schemaFindings: [],
  };

  const hybridFindings = compareWithPacks([hybridPack], hybridServer, hybridLookup, { directTools: true });
  assert.deepEqual(hybridFindings, {
    outcome: 'compared',
    onSite: ['core/get-site-info'],
    missing: [],
    inNoPack: [],
    definitionFindings: [
      {
        ability: 'remote:plugin/read-status',
        severity: 'error',
        rule: 'not-direct-tool',
        path: 'tools',
        issue: 'The ability `remote:plugin/read-status` is not exposed as a direct tool (`remote:plugin-read-status`) in `tools/list`; it is only reachable through `execute_remote_ability`.',
        suggestion: 'Expose `remote:plugin/read-status` as an individually callable MCP tool (`remote:plugin-read-status`) on the server, or remove it from `serverChecks.directTools`.',
      },
    ],
  });
  assert.equal(hasProblem(hybridFindings, SCENARIOS), true);

  // Unprefixed hybrid server: direct tool + unprefixed lookup run tool. Non-direct ability stays behind lookup
  // when directTools is disabled, and reports not-direct-tool (not missing) when directTools requires it.
  const unprefixedHybrid: ListedServer = {
    tools: [
      tool('core-get-site-info', 'Reads site info.', { readOnlyHint: true }),
      tool('mcp-adapter-discover-abilities'),
      tool('mcp-adapter-execute-ability'),
    ],
    schemaFindings: [],
  };
  assert.deepEqual(compareWithPacks([PACK], unprefixedHybrid, LOOKUP), {
    outcome: 'compared',
    onSite: ['core/get-site-info'],
    missing: [],
    inNoPack: [],
  });
  const unprefixedFindings = compareWithPacks([PACK], unprefixedHybrid, LOOKUP, { directTools: ['core/update-site-title'] });
  assert.deepEqual(unprefixedFindings, {
    outcome: 'compared',
    onSite: ['core/get-site-info'],
    missing: [],
    inNoPack: [],
    definitionFindings: [
      {
        ability: 'core/update-site-title',
        severity: 'error',
        rule: 'not-direct-tool',
        path: 'tools',
        issue: 'The ability `core/update-site-title` is not exposed as a direct tool (`core-update-site-title`) in `tools/list`; it is only reachable through `mcp-adapter-execute-ability`.',
        suggestion: 'Expose `core/update-site-title` as an individually callable MCP tool (`core-update-site-title`) on the server, or remove it from `serverChecks.directTools`.',
      },
    ],
  });
  assert.equal(hasProblem(unprefixedFindings, SCENARIOS), true);
  assert.equal(scenariosLeftOut(SCENARIOS, unprefixedFindings).size, 0);
});

test('resolveServerChecks merges project defaults with per-site overrides', () => {
  assert.deepEqual(
    resolveServerChecks(
      {
        requiredHints: ['readOnlyHint', 'destructiveHint'],
        hints: {
          'core/get-site-info': { readOnlyHint: true, openWorldHint: false },
          'core/update-site-title': { destructiveHint: true },
        },
        directTools: true,
      },
      {
        requiredHints: [],
        hints: { 'core/get-site-info': { openWorldHint: true } },
        directTools: false,
      },
    ),
    {
      requiredHints: [],
      hints: {
        'core/get-site-info': { readOnlyHint: true, openWorldHint: true },
        'core/update-site-title': { destructiveHint: true },
      },
      directTools: false,
    },
  );
});

test('inspector output parser keeps tool metadata, annotations, schemas, version and schemaFindings paths', () => {
  const inputSchema = { type: 'object', properties: { fields: { type: 'array' } } };
  const outputSchema = { type: 'object', properties: { name: { type: 'string' } } };
  const parsed = parseToolsOutput(
    {
      result: {
        tools: [
          {
            name: 'core-get-site-info',
            title: 'Get Site Info',
            description: 'Reads site info.',
            annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
            inputSchema,
            outputSchema,
          },
          { name: 'core-update-site-title', annotations: {} },
        ],
      },
      schemaFindings: [
        {
          toolName: 'core-update-site-title',
          findings: [
            { rule: 'boolean-schema', severity: 'error', schema: 'inputSchema', path: 'properties.title', issue: 'Bare true.', suggestion: 'Declare a type.' },
            { rule: 'untyped-schema', severity: 'warning', schema: 'outputSchema', path: '', issue: 'No validation keyword.', suggestion: 'Declare object.' },
          ],
        },
      ],
    },
    '2.16.0',
  );

  assert.deepEqual(parsed, {
    inspectorVersion: '2.16.0',
    tools: [
      {
        name: 'core-get-site-info',
        title: 'Get Site Info',
        description: 'Reads site info.',
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        inputSchema,
        outputSchema,
      },
      { name: 'core-update-site-title' },
    ],
    schemaFindings: [
      { toolName: 'core-update-site-title', rule: 'boolean-schema', severity: 'error', path: 'inputSchema.properties.title', issue: 'Bare true.', suggestion: 'Declare a type.' },
      { toolName: 'core-update-site-title', rule: 'untyped-schema', severity: 'warning', path: 'outputSchema', issue: 'No validation keyword.', suggestion: 'Declare object.' },
    ],
  });
});

// Which scenarios a run leaves out after the server checks, and the verdict that follows. A missing ability must
// cost only the scenarios that name it, a scenario that waits for an ability must fail as it expects, and a
// server that can't be read must leave every scenario unjudged rather than let agents work against it.
// Definition findings fail `site check` on errors only, and never skip scenarios in a run.
const READ_SITE: Scenario = { id: 'core/site/read', request: 'What is my site called?', kind: 'read', expect: { abilities: ['core/get-site-info'] } };
const RENAME_SITE: Scenario = { id: 'core/site/rename', request: 'Call my site Bakery.', kind: 'write', expect: { abilities: [{ 'core/update-site-title': { title: 'Bakery' } }] } };
const PUBLISH: Scenario = { id: 'core/posts/publish', request: 'Publish my draft.', kind: 'write', state: 'to-be-implemented', expect: { abilities: ['core/publish-post'] } };
const SCENARIOS = [READ_SITE, RENAME_SITE, PUBLISH];
const ON_SITE = ['core/get-site-info', 'core/update-site-title', 'core/publish-post'];
const UNREAD = "The site's MCP server at http://localhost:8897/wp-json/mcp/mcp-adapter-default-server could not be read, so no scenario can be judged on it: fetch failed (unreachable).";
const DEF_ERROR: DefinitionFinding = { ability: 'core/update-site-title', severity: 'error', rule: 'boolean-schema', path: 'inputSchema.properties.title', issue: 'Bare `true`.', suggestion: 'Declare a type.' };
const DEF_WARNING: DefinitionFinding = { ability: 'core/get-site-info', severity: 'warning', rule: 'type-union', path: 'outputSchema.properties.tagline', issue: 'Array type.', suggestion: 'Use anyOf.' };

// `problem`: whether `site check` ends with an error for it. An ability that is merely not built yet, or a definition warning alone, is none.
const RUNS: { name: string; findings: ServerFindings; problem: boolean; verdicts: Record<string, { outcome: VerdictOutcome; why?: string }> }[] = [
  {
    name: 'every named ability is on the site, so every scenario runs',
    findings: { outcome: 'compared', onSite: ON_SITE, missing: [], inNoPack: [] },
    problem: false,
    verdicts: { [READ_SITE.id]: { outcome: 'pass' }, [RENAME_SITE.id]: { outcome: 'pass' }, [PUBLISH.id]: { outcome: 'unexpected-pass' } },
  },
  {
    name: 'a missing ability leaves out only the scenario that names it, as could not be judged',
    findings: { outcome: 'compared', onSite: ['core/get-site-info', 'core/publish-post'], missing: ['core/update-site-title'], inNoPack: [] },
    problem: true,
    verdicts: {
      [READ_SITE.id]: { outcome: 'pass' },
      [RENAME_SITE.id]: {
        outcome: 'error',
        why: "The site's MCP server has no tool for core/update-site-title, which this scenario names, so it can't be judged on this site and no agent ran. Check the name in pack.yaml, and that the site registers the ability and makes it public for MCP.",
      },
      [PUBLISH.id]: { outcome: 'unexpected-pass' },
    },
  },
  {
    name: 'a to-be-implemented scenario that waits for a missing ability fails as expected',
    findings: { outcome: 'compared', onSite: ['core/get-site-info', 'core/update-site-title'], missing: ['core/publish-post'], inNoPack: [] },
    problem: false,
    verdicts: {
      [READ_SITE.id]: { outcome: 'pass' },
      [RENAME_SITE.id]: { outcome: 'pass' },
      [PUBLISH.id]: {
        outcome: 'expected-failure',
        why: "Not built yet: the site's MCP server has no tool for core/publish-post, which this scenario waits for, so no agent ran. Once the site has it, the scenario runs.",
      },
    },
  },
  {
    name: 'an error-severity definition finding fails site check without skipping any scenario in a run',
    findings: { outcome: 'compared', onSite: ON_SITE, missing: [], inNoPack: [], definitionFindings: [DEF_ERROR, DEF_WARNING] },
    problem: true,
    verdicts: { [READ_SITE.id]: { outcome: 'pass' }, [RENAME_SITE.id]: { outcome: 'pass' }, [PUBLISH.id]: { outcome: 'unexpected-pass' } },
  },
  {
    name: 'a warning-severity definition finding alone neither fails site check nor skips any scenario',
    findings: { outcome: 'compared', onSite: ON_SITE, missing: [], inNoPack: [], definitionFindings: [DEF_WARNING] },
    problem: false,
    verdicts: { [READ_SITE.id]: { outcome: 'pass' }, [RENAME_SITE.id]: { outcome: 'pass' }, [PUBLISH.id]: { outcome: 'unexpected-pass' } },
  },
  {
    name: 'abilities behind lookup tools are not compared, so every scenario runs',
    findings: { outcome: 'behind-lookup', runTools: ['mcp-adapter-execute-ability'] },
    problem: false,
    verdicts: { [READ_SITE.id]: { outcome: 'pass' }, [RENAME_SITE.id]: { outcome: 'pass' }, [PUBLISH.id]: { outcome: 'unexpected-pass' } },
  },
  {
    name: 'a server that can not be read leaves every scenario unjudged',
    findings: { outcome: 'unreadable', reason: UNREAD },
    problem: true,
    verdicts: { [READ_SITE.id]: { outcome: 'error', why: UNREAD }, [RENAME_SITE.id]: { outcome: 'error', why: UNREAD }, [PUBLISH.id]: { outcome: 'error', why: UNREAD } },
  },
];

for (const { name, findings, problem, verdicts } of RUNS) {
  test(`a run after the server checks: ${name}`, () => {
    const leftOut = scenariosLeftOut(SCENARIOS, findings);
    // A scenario that runs is given a passing trial here: what matters is what the checks leave out.
    const found = Object.fromEntries(
      SCENARIOS.map((scenario) => {
        const why = leftOut.get(scenario.id);
        const trial: TrialResult = why === undefined ? { scenarioId: scenario.id, agent: 'codex', trial: 1, pass: true, checks: [], durationMs: 1 } : trialLeftOut(scenario.id, 'codex', 1, why);
        return [scenario.id, { outcome: verdictFor(scenario, [trial]).outcome, ...(why === undefined ? {} : { why: trial.error ?? trial.notRun }) }];
      }),
    );
    assert.deepEqual(found, verdicts);
    assert.equal(hasProblem(findings, SCENARIOS), problem);
  });
}
