// Dedicated Abilities explorer: Map grouped by domain area and searchable/filterable DataViews table, with an
// Inspector health column and a slide-over drawer showing both Evaluation results and the MCP Contract.

import { DataViews, filterSortAndPaginate, type Field, type View } from '@wordpress/dataviews';
import { Badge, Card, Stack, Tabs, Text } from '@wordpress/ui';
import { useMemo, useState } from 'react';
import type { AbilityCoverage, Overview, ServerSnapshot } from '../src/results/types.ts';
import { AbilityDrawer, type DrawerTarget } from './ability-drawer.tsx';
import { GROUPS, Legend, Swatch, groupLabel } from './charts.tsx';
import { ABILITIES_HREF, OVERVIEW_URL, packAbilitiesHref, serverUrl, useJson, useOptionalJson } from './data.ts';
import { Frame, Loading, counted } from './parts.tsx';

function errored({ calls, errored: count }: AbilityCoverage): string {
  return calls === 0 ? 'no calls' : `${count} of ${calls}`;
}

function GroupCell({ ability }: { ability: AbilityCoverage }) {
  return (
    <span className="group-cell">
      <Swatch group={ability.group} />
      {groupLabel(ability.group)}
    </span>
  );
}

type InspectorState = 'has-errors' | 'has-warnings' | 'not-exposed' | 'clean';

function inspectorStateOf(ability: AbilityCoverage): InspectorState {
  if (ability.group === 'missing-from-site') return 'not-exposed';
  const findings = ability.definitionFindings ?? [];
  if (findings.some(({ severity }) => severity === 'error')) return 'has-errors';
  if (findings.length > 0) return 'has-warnings';
  return 'clean';
}

function InspectorCell({ ability, onOpenContract }: { ability: AbilityCoverage; onOpenContract?: (ability: AbilityCoverage) => void }) {
  if (ability.group === 'missing-from-site') {
    const badge = <Badge intent="high">Not exposed</Badge>;
    if (onOpenContract === undefined) return badge;
    return (
      <button
        type="button"
        className="inspector-pill-button"
        aria-label={`Inspect MCP Contract status for ${ability.ability}`}
        onClick={(event) => {
          event.stopPropagation();
          onOpenContract(ability);
        }}
      >
        {badge}
      </button>
    );
  }
  const findings = ability.definitionFindings ?? [];
  if (findings.length === 0) return <Badge intent="stable">Clean</Badge>;
  const errors = findings.filter(({ severity }) => severity === 'error').length;
  const warnings = findings.length - errors;
  const badges = (
    <div className="badge-row">
      {errors > 0 && <Badge intent="high">{counted(errors, 'error')}</Badge>}
      {warnings > 0 && <Badge intent="medium">{counted(warnings, 'warning')}</Badge>}
    </div>
  );
  if (onOpenContract === undefined) return badges;
  return (
    <button
      type="button"
      className="inspector-pill-button"
      aria-label={`Inspect MCP Contract findings for ${ability.ability}`}
      onClick={(event) => {
        event.stopPropagation();
        onOpenContract(ability);
      }}
    >
      {badges}
    </button>
  );
}

function AbilityMap({ abilities, onOpen }: { abilities: AbilityCoverage[]; onOpen: (ability: AbilityCoverage) => void }) {
  const [hovered, setHovered] = useState<AbilityCoverage>();
  const areas = [...new Set(abilities.map(({ area }) => area))];
  return (
    <Stack direction="column" gap="md">
      <div className="hover-line">
        {hovered === undefined ? (
          <Text variant="body-sm" className="muted">
            Point at or focus a square to preview its ability; click to inspect its scenarios and MCP contract.
          </Text>
        ) : (
          <Stack direction="row" gap="md" align="center" wrap="wrap">
            <code className="ability-name">{hovered.ability}</code>
            <GroupCell ability={hovered} />
            <InspectorCell ability={hovered} />
            <Text variant="body-sm">
              {counted(hovered.scenarios, 'scenario')} · {hovered.passed} passed · <span className={hovered.failed > 0 ? 'num-bad' : ''}>{hovered.failed} failed</span> · ran in {hovered.ranIn} · errored{' '}
              {errored(hovered)}
            </Text>
          </Stack>
        )}
      </div>
      <div className="areas">
        {areas.map((area) => (
          <div key={area} className="area">
            <span className="area-name">{area}</span>
            <div className="tiles">
              {abilities
                .filter((ability) => ability.area === area)
                .map((ability) => (
                  <button
                    key={ability.ability}
                    type="button"
                    className={`tile g-${ability.group}`}
                    aria-label={`${ability.ability}: ${groupLabel(ability.group)}`}
                    onMouseEnter={() => setHovered(ability)}
                    onFocus={() => setHovered(ability)}
                    onClick={() => onOpen(ability)}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>
    </Stack>
  );
}

function AbilitiesTable({
  overview,
  abilities,
  onOpen,
  onOpenContract,
}: {
  overview: Overview;
  abilities: AbilityCoverage[];
  onOpen: (ability: AbilityCoverage) => void;
  onOpenContract: (ability: AbilityCoverage) => void;
}) {
  const [view, setView] = useState<View>({
    type: 'table',
    titleField: 'ability',
    fields: ['group', 'inspector', 'scenarios', 'passed', 'failed', 'ranIn', 'errored'],
    sort: { field: 'failed', direction: 'desc' },
    layout: {
      styles: {
        group: { width: '200px' },
        inspector: { width: '130px' },
        scenarios: { width: '90px' },
        passed: { width: '80px' },
        failed: { width: '80px' },
        ranIn: { width: '80px' },
        errored: { width: '130px' },
      },
    },
    perPage: 50,
    page: 1,
    filters: [],
    search: '',
  });
  const fields = useMemo<Field<AbilityCoverage>[]>(
    () => [
      { id: 'ability', label: 'Ability', getValue: ({ item }) => item.ability, render: ({ item }) => <code className="ability-name">{item.ability}</code>, enableHiding: false, enableGlobalSearch: true },
      ...(overview.packs.length > 1
        ? [{ id: 'pack', label: 'Pack', getValue: ({ item }: { item: AbilityCoverage }) => item.pack, elements: overview.packs.map(({ name, title }) => ({ value: name, label: title })), filterBy: { operators: ['isAny' as const] } }]
        : []),
      {
        id: 'kind',
        label: 'Kind',
        getValue: ({ item }) => item.kind,
        elements: [
          { value: 'read', label: 'Reads site' },
          { value: 'write', label: 'Changes site' },
        ],
        filterBy: { operators: ['isAny'] },
      },
      {
        id: 'group',
        label: 'Where it stands',
        getValue: ({ item }) => item.group,
        render: ({ item }) => <GroupCell ability={item} />,
        elements: GROUPS.map(({ group, label }) => ({ value: group, label })),
        filterBy: { operators: ['isAny'] },
      },
      {
        id: 'inspector',
        label: 'MCP Inspector',
        getValue: ({ item }) => inspectorStateOf(item),
        render: ({ item }) => <InspectorCell ability={item} onOpenContract={onOpenContract} />,
        elements: [
          { value: 'has-errors', label: 'Has errors' },
          { value: 'has-warnings', label: 'Has warnings' },
          { value: 'not-exposed', label: 'Not exposed' },
          { value: 'clean', label: 'Clean' },
        ],
        filterBy: { operators: ['isAny'] },
      },
      { id: 'scenarios', label: 'Scenarios', type: 'integer', getValue: ({ item }) => item.scenarios },
      { id: 'passed', label: 'Passed', type: 'integer', getValue: ({ item }) => item.passed },
      { id: 'failed', label: 'Failed', type: 'integer', getValue: ({ item }) => item.failed, render: ({ item }) => <span className={item.failed > 0 ? 'num-bad' : ''}>{item.failed}</span> },
      { id: 'known', label: 'Known / waiting', type: 'integer', getValue: ({ item }) => item.knownDefect + item.notBuilt },
      { id: 'ranIn', label: 'Ran in', type: 'integer', getValue: ({ item }) => item.ranIn },
      { id: 'errored', label: 'Errored calls', type: 'integer', getValue: ({ item }) => item.errored, render: ({ item }) => <span className={item.errored > 0 ? 'num-bad' : ''}>{errored(item)}</span> },
    ],
    [overview, onOpenContract],
  );
  const { data, paginationInfo } = useMemo(() => filterSortAndPaginate(abilities, view, fields), [abilities, view, fields]);
  return (
    <DataViews
      data={data}
      fields={fields}
      view={view}
      onChangeView={setView}
      paginationInfo={paginationInfo}
      defaultLayouts={{ table: {} }}
      getItemId={(ability) => ability.ability}
      isItemClickable={() => true}
      onClickItem={onOpen}
    />
  );
}

function AbilitiesContent({ overview, pack }: { overview: Overview; pack?: string }) {
  const [selected, setSelected] = useState<DrawerTarget>();
  const snapshot = useOptionalJson<ServerSnapshot>(overview.site?.hasServerSnapshot ? serverUrl(overview.site.runId) : undefined);
  const visible = useMemo(() => (pack === undefined ? overview.abilities : overview.abilities.filter((ability) => ability.pack === pack)), [overview.abilities, pack]);
  const groups = useMemo(
    () => Object.fromEntries(GROUPS.map(({ group }) => [group, visible.filter((ability) => ability.group === group).length])) as Overview['summary']['groups'],
    [visible],
  );

  return (
    <Frame
      active="abilities"
      crumbs={[]}
      title={`Abilities (${visible.length})`}
      subtitle={
        <Text variant="body-sm" className="muted">
          Click any ability square or table row to inspect its scenarios, error outputs, MCP annotations, Inspector findings, and JSON Schemas.
        </Text>
      }
    >
      {overview.packs.length > 1 && (
        <div className="pill-group" role="group" aria-label="Filter abilities by pack">
          <a href={ABILITIES_HREF} className="pill-link" aria-current={pack === undefined ? 'true' : undefined}>
            {`All packs (${overview.abilities.length})`}
          </a>
          {overview.packs.map((item) => (
            <a key={item.name} href={packAbilitiesHref(item.name)} className="pill-link" aria-current={pack === item.name ? 'true' : undefined}>
              {`${item.title} (${item.tested}/${item.abilities})`}
            </a>
          ))}
        </div>
      )}

      <Card.Root>
        <Card.Content>
          <Legend groups={groups} />
        </Card.Content>
      </Card.Root>

      <Tabs.Root defaultValue="table">
        <Tabs.List>
          <Tabs.Tab value="table">Table</Tabs.Tab>
          <Tabs.Tab value="map">Map</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="table">
          <Card.Root className="panel-card abilities-table">
            <AbilitiesTable
              overview={overview}
              abilities={visible}
              onOpen={(ability) => setSelected({ ability, initialTab: 'evaluation' })}
              onOpenContract={(ability) => setSelected({ ability, initialTab: 'contract' })}
            />
          </Card.Root>
        </Tabs.Panel>
        <Tabs.Panel value="map">
          <Card.Root className="panel-card">
            <Card.Content>
              <AbilityMap abilities={visible} onOpen={(ability) => setSelected({ ability, initialTab: 'evaluation' })} />
            </Card.Content>
          </Card.Root>
        </Tabs.Panel>
      </Tabs.Root>

      <AbilityDrawer overview={overview} target={selected} rawTools={snapshot?.tools} onClose={() => setSelected(undefined)} />
    </Frame>
  );
}

export function AbilitiesPage({ pack }: { pack?: string }) {
  const loaded = useJson<Overview>(OVERVIEW_URL);
  return (
    <Loading loaded={loaded} active="abilities" title="Abilities" crumbs={[]}>
      {(overview) => <AbilitiesContent overview={overview} pack={pack} />}
    </Loading>
  );
}
