// The list of saved runs, newest first, with site, agents, models, MCP Inspector check summary, and scenario verdicts.

import { DataViews, filterSortAndPaginate, type Field, type View } from '@wordpress/dataviews';
import { Badge, Card, Text } from '@wordpress/ui';
import { useMemo, useState, type ReactNode } from 'react';
import type { RunListing } from '../src/results/types.ts';
import { RUNS_URL, runHref, useJson } from './data.ts';
import { Frame, Loading, VerdictCounts, when } from './parts.tsx';

const TITLE = 'Runs';

function InspectorRunBadge({ run }: { run: RunListing }) {
  const checks = run.serverChecks;
  const wrap = (badge: ReactNode) => <span className="nowrap-badge">{badge}</span>;
  if (checks === undefined) return wrap(<Badge intent="none">Not checked</Badge>);
  if (checks.outcome === 'unreadable') return wrap(<Badge intent="high">Unreadable</Badge>);
  if (checks.outcome === 'behind-lookup') return wrap(<Badge intent="informational">Lookup</Badge>);
  const findings = checks.definitionFindings ?? [];
  const errors = findings.filter(({ severity }) => severity === 'error').length;
  const warnings = findings.length - errors;
  const total = checks.onSite.length + checks.missing.length;
  if (errors > 0 || checks.missing.length > 0) {
    return wrap(<Badge intent="high">{`${checks.onSite.length}/${total} · ${errors} err`}</Badge>);
  }
  if (warnings > 0) {
    return wrap(<Badge intent="medium">{`${checks.onSite.length}/${total} · ${warnings} warn`}</Badge>);
  }
  return wrap(<Badge intent="stable">{`${checks.onSite.length}/${total} clean`}</Badge>);
}

function RunsTable({ runs }: { runs: RunListing[] }) {
  const [view, setView] = useState<View>({
    type: 'table',
    titleField: 'started',
    fields: ['site', 'agents', 'models', 'inspector', 'trials', 'scenarios'],
    sort: { field: 'started', direction: 'desc' },
    layout: {
      styles: {
        site: { width: '80px' },
        agents: { width: '145px' },
        inspector: { width: '175px' },
        trials: { width: '70px' },
        scenarios: { width: '215px' },
      },
    },
    perPage: 25,
    page: 1,
    filters: [],
    search: '',
  });
  const fields = useMemo<Field<RunListing>[]>(
    () => [
      { id: 'started', label: 'Started', getValue: ({ item }) => item.startedAt, render: ({ item }) => when(item.startedAt), enableHiding: false, enableGlobalSearch: false },
      {
        id: 'site',
        label: 'Site',
        getValue: ({ item }) => item.site,
        elements: [...new Set(runs.map((run) => run.site))].map((site) => ({ value: site, label: site })),
        filterBy: { operators: ['isAny'] },
        enableGlobalSearch: true,
      },
      { id: 'agents', label: 'Agents', getValue: ({ item }) => item.agents.join(', '), enableSorting: false, enableGlobalSearch: true },
      {
        id: 'models',
        label: 'Models',
        getValue: ({ item }) => [...new Set(item.models.flatMap(({ ran }) => ran.map(({ model }) => model)))].join(', ') || 'none reported',
        enableSorting: false,
        enableGlobalSearch: true,
      },
      {
        id: 'inspector',
        label: 'MCP Inspector',
        getValue: ({ item }) => item.serverChecks?.outcome ?? 'none',
        render: ({ item }) => <InspectorRunBadge run={item} />,
        enableSorting: false,
      },
      { id: 'trials', label: 'Trials', type: 'integer', getValue: ({ item }) => item.trialsPerScenario },
      { id: 'scenarios', label: 'Scenarios', getValue: ({ item }) => item.verdicts.length, render: ({ item }) => <VerdictCounts verdicts={item.verdicts} />, enableSorting: false },
    ],
    [runs],
  );
  const { data, paginationInfo } = useMemo(() => filterSortAndPaginate(runs, view, fields), [runs, view, fields]);

  return (
    <DataViews
      data={data}
      fields={fields}
      view={view}
      onChangeView={setView}
      paginationInfo={paginationInfo}
      defaultLayouts={{ table: {} }}
      getItemId={(run) => run.id}
      isItemClickable={() => true}
      renderItemLink={({ item, ...props }) => <a {...props} href={runHref(item.id)} />}
      empty="No run is saved yet. A run saves itself when it ends: `npx wp-ability-evals run --site <name> --agent <name>`."
    />
  );
}

export function RunsPage() {
  const loaded = useJson<RunListing[]>(RUNS_URL);
  return (
    <Loading loaded={loaded} active="runs" title={TITLE} crumbs={[]}>
      {(runs) => (
        <Frame
          active="runs"
          crumbs={[]}
          title={TITLE}
          subtitle={
            <Text variant="body-sm" className="muted">
              Every saved evaluation run, newest first. Open a run to compare agents per scenario, inspect its MCP Inspector checks, and read individual trials.
            </Text>
          }
        >
          <Card.Root className="abilities-table">
            <RunsTable runs={runs} />
          </Card.Root>
        </Frame>
      )}
    </Loading>
  );
}
