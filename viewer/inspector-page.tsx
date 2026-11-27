// Dedicated MCP Inspector audit screen: shows every contract check performed by `@modelcontextprotocol/inspector
// --strict` (both passed checks and problems), groups portability findings by rule so explanations appear once,
// separates inputSchema vs outputSchema findings, and provides a searchable tool-contract explorer.

import { DataViews, filterSortAndPaginate, type Field, type View } from '@wordpress/dataviews';
import { Badge, Card, CollapsibleCard, Link, Notice, Stack, Text } from '@wordpress/ui';
import { useMemo, useState } from 'react';
import type { DefinitionFinding, Overview, ServerSnapshot } from '../src/results/types.ts';
import { AbilityDrawer, type DrawerTarget } from './ability-drawer.tsx';
import { OVERVIEW_URL, runHref, serverUrl, useJson, useOptionalJson } from './data.ts';
import { buildInspectorAudit, findingScope, type InspectedToolRow, type InspectorCheck, type RuleGroup } from './inspector-summary.ts';
import { AnnotationBadges, Frame, Loading, counted, when } from './parts.tsx';

type FindingFilter = 'all' | 'errors' | 'input' | 'output' | 'metadata';

function filterFinding(finding: DefinitionFinding, filter: FindingFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'errors') return finding.severity === 'error';
  return findingScope(finding) === filter;
}

function StatusBadge({ status }: { status: InspectorCheck['status'] }) {
  if (status === 'pass') return <Badge intent="stable">Passed</Badge>;
  if (status === 'warning') return <Badge intent="medium">Warning</Badge>;
  return <Badge intent="high">Failed</Badge>;
}

function ToolStatusBadge({ status }: { status: InspectedToolRow['status'] }) {
  if (status === 'on-site') return <Badge intent="stable">Exposed</Badge>;
  if (status === 'not-built') return <Badge intent="draft">Not built yet</Badge>;
  if (status === 'missing') return <Badge intent="high">Missing</Badge>;
  if (status === 'behind-lookup') return <Badge intent="informational">Behind lookup</Badge>;
  if (status === 'lookup') return <Badge intent="none">Lookup tool</Badge>;
  return <Badge intent="medium">In no pack</Badge>;
}

function RuleGroupCard({
  group,
  filter,
  onSelectAbility,
}: {
  group: RuleGroup;
  filter: FindingFilter;
  onSelectAbility: (ability: string) => void;
}) {
  const items = group.items.filter((item) => filterFinding(item, filter));
  if (items.length === 0) return null;
  const abilitiesCount = new Set(items.map((item) => item.ability)).size;
  const inputCount = items.filter((item) => findingScope(item) === 'input').length;
  const outputCount = items.filter((item) => findingScope(item) === 'output').length;
  const scopeSummary = [inputCount > 0 ? `${inputCount} input` : '', outputCount > 0 ? `${outputCount} output` : ''].filter(Boolean).join(' · ');
  const distinctIssues = new Set(items.map((item) => `${item.issue}\0${item.suggestion}`)).size > 1;
  const representative = items[0];

  return (
    <CollapsibleCard.Root defaultOpen={group.severity === 'error' || items.length <= 15}>
      <CollapsibleCard.Header>
        <Stack direction="row" gap="sm" align="center" wrap="wrap">
          <Badge intent={group.severity === 'error' ? 'high' : 'medium'}>{group.severity}</Badge>
          <code>{group.rule}</code>
          <Text variant="body-sm">
            {`${counted(items.length, 'occurrence')} across ${counted(abilitiesCount, 'ability', 'abilities')}`}
            {scopeSummary !== '' && ` (${scopeSummary})`}
          </Text>
        </Stack>
      </CollapsibleCard.Header>
      <CollapsibleCard.Content>
        <Stack direction="column" gap="md">
          {!distinctIssues && representative !== undefined && (
            <div className="rule-explanation">
              <Text variant="body-sm">{representative.issue}</Text>
              {representative.suggestion !== '' && (
                <Text variant="body-sm" className="muted">
                  <strong>Suggested fix:</strong> {representative.suggestion}
                </Text>
              )}
            </div>
          )}
          <div className="table-scroll">
            <table className="compact-table">
              <thead>
                <tr>
                  <th scope="col">Ability</th>
                  <th scope="col">Schema</th>
                  <th scope="col">Path</th>
                  {distinctIssues && <th scope="col">Details</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => {
                  const scope = findingScope(item);
                  return (
                    <tr key={`${item.ability}-${item.path}-${index}`}>
                      <td>
                        <button type="button" className="inline-link-button" onClick={() => onSelectAbility(item.ability)}>
                          <code>{item.ability}</code>
                        </button>
                      </td>
                      <td>
                        <Badge intent={scope === 'input' ? 'informational' : 'none'}>
                          {scope === 'input' ? 'inputSchema' : scope === 'output' ? 'outputSchema' : 'metadata'}
                        </Badge>
                      </td>
                      <td>
                        <code className="schema-path">{item.path}</code>
                      </td>
                      {distinctIssues && (
                        <td>
                          <Stack direction="column" gap="xs">
                            <Text variant="body-sm">{item.issue}</Text>
                            {item.suggestion !== '' && (
                              <Text variant="body-sm" className="muted">
                                <strong>Suggested fix:</strong> {item.suggestion}
                              </Text>
                            )}
                          </Stack>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Stack>
      </CollapsibleCard.Content>
    </CollapsibleCard.Root>
  );
}

function ToolsCatalogTable({ overview, tools, onOpen }: { overview: Overview; tools: InspectedToolRow[]; onOpen: (tool: InspectedToolRow) => void }) {
  const [view, setView] = useState<View>({
    type: 'table',
    titleField: 'toolName',
    fields: ['status', 'pack', 'annotations', 'errors', 'inputWarnings', 'outputWarnings'],
    sort: { field: 'inputWarnings', direction: 'desc' },
    layout: {
      styles: {
        status: { width: '115px' },
        pack: { width: '120px' },
        annotations: { width: '210px' },
        errors: { width: '80px' },
        inputWarnings: { width: '120px' },
        outputWarnings: { width: '130px' },
      },
    },
    perPage: 50,
    page: 1,
    filters: [],
    search: '',
  });
  const fields = useMemo<Field<InspectedToolRow>[]>(
    () => [
      {
        id: 'toolName',
        label: 'MCP tool',
        getValue: ({ item }) => item.ability ?? item.toolName,
        render: ({ item }) => (
          <Stack direction="column" gap="xs">
            <code className="ability-name">{item.ability ?? item.toolName}</code>
            {item.title !== undefined && (
              <Text variant="body-sm" className="muted">
                {item.title}
              </Text>
            )}
          </Stack>
        ),
        enableHiding: false,
        enableGlobalSearch: true,
      },
      {
        id: 'status',
        label: 'Status',
        getValue: ({ item }) => item.status,
        render: ({ item }) => <ToolStatusBadge status={item.status} />,
        elements: [
          { value: 'on-site', label: 'Exposed' },
          { value: 'missing', label: 'Missing' },
          { value: 'not-built', label: 'Not built yet' },
          { value: 'behind-lookup', label: 'Behind lookup' },
          { value: 'lookup', label: 'Lookup tool' },
          { value: 'unlisted', label: 'In no pack' },
        ],
        filterBy: { operators: ['isAny'] },
      },
      {
        id: 'pack',
        label: 'Pack',
        getValue: ({ item }) => item.pack ?? '',
        render: ({ item }) => item.packTitle ?? <span className="muted">—</span>,
        elements: overview.packs.map(({ name, title }) => ({ value: name, label: title })),
        filterBy: { operators: ['isAny'] },
      },
      {
        id: 'annotations',
        label: 'Annotations',
        getValue: ({ item }) => (item.annotations?.readOnlyHint === true ? 'read-only' : item.annotations?.readOnlyHint === false ? 'mutating' : item.kind ?? ''),
        render: ({ item }) => <AnnotationBadges annotations={item.annotations} fallbackKind={item.kind} />,
        enableSorting: false,
      },
      {
        id: 'errors',
        label: 'Errors',
        type: 'integer',
        getValue: ({ item }) => item.errors,
        render: ({ item }) => <span className={item.errors > 0 ? 'num-bad' : 'muted'}>{item.errors}</span>,
      },
      {
        id: 'inputWarnings',
        label: 'Input warnings',
        type: 'integer',
        getValue: ({ item }) => item.inputWarnings,
        render: ({ item }) => (item.inputWarnings > 0 ? <Badge intent="medium">{String(item.inputWarnings)}</Badge> : <span className="muted">0</span>),
      },
      {
        id: 'outputWarnings',
        label: 'Output warnings',
        type: 'integer',
        getValue: ({ item }) => item.outputWarnings,
        render: ({ item }) => (item.outputWarnings > 0 ? <Badge intent="none">{String(item.outputWarnings)}</Badge> : <span className="muted">0</span>),
      },
    ],
    [overview.packs],
  );
  const { data, paginationInfo } = useMemo(() => filterSortAndPaginate(tools, view, fields), [tools, view, fields]);

  return (
    <DataViews
      data={data}
      fields={fields}
      view={view}
      onChangeView={setView}
      paginationInfo={paginationInfo}
      defaultLayouts={{ table: {} }}
      getItemId={(row) => row.id}
      isItemClickable={() => true}
      onClickItem={onOpen}
    />
  );
}

function InspectorContent({ overview }: { overview: Overview }) {
  const { site } = overview;
  const [filter, setFilter] = useState<FindingFilter>('all');
  const [selected, setSelected] = useState<DrawerTarget>();
  const snapshot = useOptionalJson<ServerSnapshot>(site?.hasServerSnapshot ? serverUrl(site.runId) : undefined);

  const audit = useMemo(
    () => (site === undefined ? undefined : buildInspectorAudit(site.findings, site.notBuilt, overview.abilities, overview.packs, snapshot)),
    [site, overview.abilities, overview.packs, snapshot],
  );

  const version = site?.findings.outcome !== 'unreadable' ? (site?.findings.inspectorVersion ?? snapshot?.inspectorVersion) : undefined;
  const overallBadge =
    audit === undefined
      ? <Badge intent="none">Not checked yet</Badge>
      : audit.checks.some((check) => check.status === 'fail')
        ? <Badge intent="high">Errors found</Badge>
        : audit.checks.some((check) => check.status === 'warning')
          ? <Badge intent="medium">Passed with warnings</Badge>
          : <Badge intent="stable">All checks passed</Badge>;

  const openAbilityContract = (abilityName: string) => {
    const tool = audit?.tools.find((one) => one.ability === abilityName);
    const ability = overview.abilities.find((one) => one.ability === abilityName);
    setSelected({ ...(ability === undefined ? {} : { ability }), ...(tool === undefined ? {} : { tool }), initialTab: 'contract' });
  };

  return (
    <Frame
      active="inspector"
      crumbs={[]}
      title="MCP Inspector audit"
      badges={
        <Stack direction="row" gap="xs" align="center" wrap="wrap">
          {overallBadge}
          <Badge intent="informational">{version === undefined ? '@modelcontextprotocol/inspector --strict' : `MCP Inspector v${version} --strict`}</Badge>
        </Stack>
      }
      subtitle={
        site === undefined ? (
          <Text variant="body-sm" className="muted">
            No saved run has MCP Inspector server checks yet. Run <code>npx wp-ability-evals site check &lt;site&gt;</code> or <code>npx wp-ability-evals run</code> to audit the server.
          </Text>
        ) : (
          <Text variant="body-sm" className="muted">
            Captured automatically before trial execution in the run of <Link href={runHref(site.runId)}>{when(site.startedAt)}</Link>. Inspects protocol handshake, pack registration, descriptions, read/write annotations, and strict JSON Schema portability.
          </Text>
        )
      }
    >
      {audit === undefined ? (
        <Card.Root>
          <Card.Content>
            <Text className="muted">Run an evaluation on a site to record its MCP Inspector audit.</Text>
          </Card.Content>
        </Card.Root>
      ) : (
        <Stack direction="column" gap="xl">
          {site !== undefined && site.hasServerSnapshot !== true && site.findings.outcome !== 'unreadable' && (
            <Notice.Root intent="info">
              <Notice.Title>Showing summary from run.json</Notice.Title>
              <Notice.Description>
                This run was saved before per-tool snapshots (<code>server.json</code>) were recorded. All Inspector findings and check statuses are shown below; run an evaluation again to also inspect each tool&apos;s description, full annotations, and raw input/output JSON Schemas here.
              </Notice.Description>
            </Notice.Root>
          )}

          <section className="section-block">
            <Text variant="heading-lg" render={<h2 />}>
              Contract scorecard
            </Text>
            <ul className="scorecard-grid" role="list">
              {audit.checks.map((check) => (
                <li key={check.id} className={`scorecard-item scorecard-${check.status}`}>
                  <div className="card-head-row">
                    <Text variant="heading-sm" render={<h3 />}>
                      {check.label}
                    </Text>
                    <span className="nowrap-badge">
                      <StatusBadge status={check.status} />
                    </span>
                  </div>
                  <Text variant="body-md">
                    <strong>{check.summary}</strong>
                  </Text>
                  <Text variant="body-sm" className="muted">
                    {check.detail}
                  </Text>
                </li>
              ))}
            </ul>
          </section>

          {audit.ruleGroups.length > 0 && (
            <section className="section-block">
              <Stack direction="row" gap="md" align="center" justify="space-between" wrap="wrap">
                <div>
                  <Text variant="heading-lg" render={<h2 />}>
                    {`Portability & definition findings (${audit.counts.errors + audit.counts.warnings})`}
                  </Text>
                  <Text variant="body-sm" className="muted">
                    Grouped by rule so each issue and fix appears once. Input schema warnings matter most for strict single-type clients; errors fail <code>site check</code>.
                  </Text>
                </div>
                <div className="pill-group" role="group" aria-label="Filter findings">
                  {(
                    [
                      ['all', `All (${audit.counts.errors + audit.counts.warnings})`],
                      ['errors', `Errors (${audit.counts.errors})`],
                      ['input', `Input schema (${audit.counts.inputWarnings})`],
                      ['output', `Output schema (${audit.counts.outputWarnings})`],
                      ...(audit.counts.metadataIssues > 0 ? ([['metadata', `Metadata (${audit.counts.metadataIssues})`]] as const) : []),
                    ] as const
                  ).map(([value, label]) => (
                    <button key={value} type="button" className="pill-button" aria-pressed={filter === value} onClick={() => setFilter(value)}>
                      {label}
                    </button>
                  ))}
                </div>
              </Stack>
              <Stack direction="column" gap="md">
                {audit.ruleGroups.map((group) => (
                  <RuleGroupCard key={`${group.severity}:${group.rule}`} group={group} filter={filter} onSelectAbility={openAbilityContract} />
                ))}
                {audit.ruleGroups.every((group) => group.items.every((item) => !filterFinding(item, filter))) && (
                  <Card.Root>
                    <Card.Content>
                      <Text className="muted">No findings in this category.</Text>
                    </Card.Content>
                  </Card.Root>
                )}
              </Stack>
            </section>
          )}

          {audit.tools.length > 0 && (
            <section className="section-block">
              <Text variant="heading-lg" render={<h2 />}>
                {`Inspected tools (${audit.tools.length})`}
              </Text>
              <Text variant="body-sm" className="muted">
                Click any tool to inspect its MCP description, annotations, Inspector findings, JSON Schemas, and linked evaluation scenarios.
              </Text>
              <Card.Root className="abilities-table">
                <ToolsCatalogTable
                  overview={overview}
                  tools={audit.tools}
                  onOpen={(tool) => setSelected({ tool, initialTab: 'contract' })}
                />
              </Card.Root>
            </section>
          )}
        </Stack>
      )}
      <AbilityDrawer overview={overview} target={selected} rawTools={snapshot?.tools} onClose={() => setSelected(undefined)} />
    </Frame>
  );
}

export function InspectorPage() {
  const loaded = useJson<Overview>(OVERVIEW_URL);
  return (
    <Loading loaded={loaded} active="inspector" title="MCP Inspector audit" crumbs={[]}>
      {(overview) => <InspectorContent overview={overview} />}
    </Loading>
  );
}
