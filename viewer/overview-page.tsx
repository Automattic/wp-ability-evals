// The landing screen: a crisp executive and engineering health brief showing ability coverage, honest scenario
// verdicts, MCP Inspector contract health, agent reliability, pack breakdown, needs attention, and an
// interactive trend across saved runs. Progressive disclosure leads into Stories, Abilities, Inspector, and Runs.

import { Badge, Card, Link, Notice, Stack, Text } from '@wordpress/ui';
import { useMemo, useState } from 'react';
import type { ModelsBehind, Overview, ServerSnapshot } from '../src/results/types.ts';
import { AbilityDrawer, type DrawerTarget } from './ability-drawer.tsx';
import { GroupBar, Legend, LineChart, PassFail, type Series } from './charts.tsx';
import {
  ABILITIES_HREF,
  INSPECTOR_HREF,
  OVERVIEW_URL,
  RUNS_HREF,
  STORIES_HREF,
  packAbilitiesHref,
  runHref,
  serverUrl,
  trialHref,
  useJson,
  useOptionalJson,
} from './data.ts';
import { buildInspectorAudit } from './inspector-summary.ts';
import { Frame, Loading, MethodologyDisclosure, counted, day, percent, when } from './parts.tsx';

function titleOf(overview: Overview): string {
  return overview.packs.length === 1 ? `${overview.packs[0]?.title} abilities` : 'Abilities overview';
}

function packTitle(overview: Overview, name: string): string {
  return overview.packs.find((pack) => pack.name === name)?.title ?? name;
}

function ModelLine({ models: { agent, ran, judges } }: { models: ModelsBehind }) {
  const scenarios = (count: number, of: unknown[]) => (of.length > 1 ? ` in ${counted(count, 'scenario')}` : '');
  const models = ran.length === 0 ? 'no model: no trial got as far as an answer' : ran.map(({ model, program, scenarios: count }) => `${model} (program ${program})${scenarios(count, ran)}`).join(', ');
  const graded = judges.map(({ name, model, scenarios: count }) => `${name}${model === undefined ? '' : ` (${model})`}${scenarios(count, judges)}`).join(', ');
  return (
    <>
      <strong>{agent}</strong> ran {models}
      {graded === '' ? '' : `, rubrics graded by ${graded}`}
    </>
  );
}

function AsOf({ overview }: { overview: Overview }) {
  const { oldest, newest, agents, trialsPerScenario: trials } = overview;
  if (oldest === undefined) {
    return (
      <Text variant="body-sm" className="muted">
        No run is saved yet. Run an evaluation to populate results: <code>npx wp-ability-evals run --site &lt;name&gt; --agent &lt;name&gt;</code>.
      </Text>
    );
  }
  const sameDay = day(oldest) === day(newest);
  const span = oldest === newest ? `on ${when(oldest)}` : sameDay ? `from ${when(oldest)} to ${when(newest ?? oldest)}` : `from ${day(oldest)} to ${day(newest)}`;
  const each = trials.length === 1 ? `${trials[0]} ${trials[0] === 1 ? 'trial' : 'trials'} each` : `${trials[0]} to ${trials.at(-1)} trials each`;
  return (
    <Stack direction="column" gap="xs">
      <Text variant="body-sm" className="muted">
        Each scenario&apos;s most recent verdict, {span} · {agents.join(' and ')} · {each} · {counted(overview.trend.length, 'saved run')}
      </Text>
      {overview.models.map((models) => (
        <Text key={models.agent} variant="body-sm">
          <ModelLine models={models} />
        </Text>
      ))}
    </Stack>
  );
}

function MixedModels({ overview }: { overview: Overview }) {
  const mixed = overview.models.filter(({ ran, judges }) => ran.length > 1 || judges.length > 1);
  if (mixed.length === 0) return null;
  return (
    <Notice.Root intent="warning">
      <Notice.Title>The counts mix models</Notice.Title>
      <Notice.Description>
        {mixed.map((models) => (
          <span key={models.agent}>
            <ModelLine models={models} />.
            <br />
          </span>
        ))}
        A model decides much of a result. Run the scenarios again with one model to compare like with like.
      </Notice.Description>
    </Notice.Root>
  );
}

function KpiGrid({ overview, snapshot }: { overview: Overview; snapshot?: ServerSnapshot }) {
  const { summary, scenarioSummary, agentSummaries, site } = overview;
  const audit = useMemo(
    () => (site === undefined ? undefined : buildInspectorAudit(site.findings, site.notBuilt, overview.abilities, overview.packs, snapshot)),
    [site, overview.abilities, overview.packs, snapshot],
  );
  const inspectorHeadline =
    site === undefined
      ? 'Not checked'
      : site.findings.outcome === 'unreadable'
        ? 'Unreadable'
        : site.findings.outcome === 'behind-lookup'
          ? 'Lookup server'
          : `${site.findings.onSite.length}/${site.findings.onSite.length + site.findings.missing.length}`;
  const inspectorSub =
    audit === undefined || site === undefined
      ? 'Run an evaluation to audit the MCP server'
      : site.findings.outcome === 'unreadable'
        ? 'Server could not be reached'
        : site.findings.outcome === 'behind-lookup'
          ? audit.counts.errors > 0
            ? `${counted(audit.counts.errors, 'error')} · via ${site.findings.runTools.join(', ')}`
            : `Via ${site.findings.runTools.join(', ')}`
          : audit.counts.errors > 0
            ? `${counted(audit.counts.errors, 'error')}, ${counted(audit.counts.warnings, 'warning')}`
            : audit.counts.warnings > 0
              ? `0 errors · ${audit.counts.inputWarnings} input / ${audit.counts.outputWarnings} output warnings`
              : 'All contract & schema checks clean';

  return (
    <div className="kpi-grid">
      <a className="kpi-card" href={ABILITIES_HREF}>
        <span className="kpi-label">Abilities covered</span>
        <span className="kpi-value">
          {percent(summary.tested, summary.abilities)}
          <span className="kpi-ratio">{`${summary.tested}/${summary.abilities}`}</span>
        </span>
        <span className="kpi-detail">
          <span className="num-good">{summary.groups.passing} passing</span> ·{' '}
          <span className={summary.groups['in-failing-scenario'] > 0 ? 'num-bad' : ''}>{summary.groups['in-failing-scenario']} failing</span>
        </span>
        <span className="kpi-link">Explore abilities →</span>
      </a>

      <a className="kpi-card" href={STORIES_HREF}>
        <span className="kpi-label">Scenarios passing</span>
        <span className="kpi-value">
          {percent(scenarioSummary.passed, scenarioSummary.total)}
          <span className="kpi-ratio">{`${scenarioSummary.passed}/${scenarioSummary.total}`}</span>
        </span>
        <span className="kpi-detail">
          {counted(overview.stories.length, 'story', 'stories')} ·{' '}
          <span className={scenarioSummary.failed > 0 ? 'num-bad' : 'num-good'}>
            {scenarioSummary.failed > 0 ? `${scenarioSummary.failed} failed` : '0 failed'}
          </span>
        </span>
        <span className="kpi-link">Read site-owner stories →</span>
      </a>

      <a className="kpi-card" href={INSPECTOR_HREF}>
        <span className="kpi-label">MCP Inspector audit</span>
        <span className="kpi-value">
          {inspectorHeadline}
          {site?.findings.outcome === 'compared' && <span className="kpi-ratio">tools</span>}
        </span>
        <span className="kpi-detail">{inspectorSub}</span>
        <span className="kpi-link">Open Inspector report →</span>
      </a>

      <a className="kpi-card" href={RUNS_HREF}>
        <span className="kpi-label">Agent reliability</span>
        {agentSummaries.length === 0 ? (
          <>
            <span className="kpi-value">—</span>
            <span className="kpi-detail">No trials recorded yet</span>
          </>
        ) : (
          <div className="agent-bars">
            {agentSummaries.map((agent) => (
              <div key={agent.agent} className="agent-bar-row">
                <div className="agent-bar-head">
                  <span className="agent-bar-name">{agent.agent}</span>
                  <span className="agent-bar-score">
                    {agent.passed}/{agent.scenarios} ({percent(agent.passed, agent.scenarios)})
                  </span>
                </div>
                <PassFail passed={agent.passed} failed={agent.failed} other={0} />
              </div>
            ))}
          </div>
        )}
        <span className="kpi-link">Browse all runs →</span>
      </a>
    </div>
  );
}

function PackHealth({ overview }: { overview: Overview }) {
  const { abilities, tested, groups } = overview.summary;
  const { total, passed, failed } = overview.scenarioSummary;
  return (
    <section className="section-block">
      <Text variant="heading-lg" render={<h2 />}>
        Pack health
      </Text>
      <Text variant="body-sm" className="muted">
        <strong>{percent(tested, abilities)}</strong> of {abilities} abilities tested ({groups.passing} passing);{' '}
        <strong>
          {passed} of {total}
        </strong>{' '}
        scenarios pass (<span className={failed > 0 ? 'num-bad' : ''}>{failed} failed</span>). Click any pack to filter its abilities.
      </Text>
      <Card.Root>
        <Card.Content>
          <Stack direction="column" gap="sm">
            {overview.packs.map((pack) => (
              <a key={pack.name} className="pack-row pack-row-link" href={packAbilitiesHref(pack.name)}>
                <span className="pack-name">{pack.title}</span>
                <GroupBar groups={pack.groups} />
                <span className="pack-figures">
                  {pack.tested}/{pack.abilities} abilities ·{' '}
                  <span className={pack.scenarios.failed > 0 ? 'num-bad' : ''}>
                    {pack.scenarios.passed}/{pack.scenarios.total} scenarios
                  </span>
                </span>
              </a>
            ))}
            <Legend groups={overview.summary.groups} />
          </Stack>
        </Card.Content>
      </Card.Root>
    </section>
  );
}

function NeedsAttention({ overview, onOpenAbility }: { overview: Overview; onOpenAbility: (target: DrawerTarget) => void }) {
  const failingAbilities = overview.needsAttention.flatMap((name) => overview.abilities.filter(({ ability }) => ability === name));
  const { failingScenarios } = overview;
  const nothingFailing = failingAbilities.length === 0 && failingScenarios.length === 0;

  return (
    <section className="section-block">
      <Stack direction="row" gap="sm" align="center" wrap="wrap">
        <Text variant="heading-lg" render={<h2 />}>
          Needs attention
        </Text>
        {!nothingFailing && <Badge intent="high">{`${counted(failingScenarios.length, 'failing scenario')}`}</Badge>}
      </Stack>
      <Text variant="body-sm" className="muted">
        Every scenario and ability with a failure in its latest run. A failing scenario can point to an ability, an agent answer, or the scenario itself — open a trial to inspect the exact tool calls.
      </Text>
      {nothingFailing ? (
        <Card.Root>
          <Card.Content>
            <Text className="num-good">Every scenario and every tested ability passed its latest run.</Text>
          </Card.Content>
        </Card.Root>
      ) : (
        <Stack direction="column" gap="md">
          {failingScenarios.length > 0 && (
            <Card.Root>
              <Card.Header>
                <Card.Title>{`Failing scenarios (${failingScenarios.length})`}</Card.Title>
              </Card.Header>
              <Card.Content>
                <ul className="failing-scenarios" role="list">
                  {failingScenarios.map((item) => (
                    <li key={item.scenarioId} className="failing-scenario-row">
                      <Stack direction="row" gap="sm" align="center" wrap="wrap">
                        <Badge intent="high">Failed</Badge>
                        <code>{item.scenarioId}</code>
                        <Badge intent="none">{packTitle(overview, item.pack)}</Badge>
                        <Text variant="body-sm" className="muted">
                          {item.agents.map(({ agent, passed, trials }) => `${agent} ${passed}/${trials}`).join(' · ')} ·{' '}
                          <Link href={runHref(item.runId)}>{when(item.startedAt)}</Link>
                        </Text>
                      </Stack>
                      <Text variant="body-sm" className="prose">
                        “{item.request}”
                      </Text>
                      {item.failedTrials.map((trial) => (
                        <div key={trial.file} className="failed-trial-inline">
                          <Link href={trialHref(item.runId, trial.file)}>{`${trial.agent} trial ${trial.trial}`}</Link>
                          {trial.reason !== undefined && <span className="muted">{trial.reason}</span>}
                        </div>
                      ))}
                    </li>
                  ))}
                </ul>
              </Card.Content>
            </Card.Root>
          )}
          {failingAbilities.length > 0 && (
            <Card.Root>
              <Card.Header>
                <Card.Title>{`Abilities in failing scenarios (${failingAbilities.length})`}</Card.Title>
              </Card.Header>
              <Card.Content>
                <ol className="attention" role="list">
                  {failingAbilities.map((ability) => (
                    <li key={ability.ability}>
                      <button type="button" className="attention-row" onClick={() => onOpenAbility({ ability, initialTab: 'evaluation' })}>
                        <code className="ability-name">{ability.ability}</code>
                        <PassFail passed={ability.passed} failed={ability.failed} other={ability.scenarios - ability.passed - ability.failed} />
                        <span>
                          <span className="num-bad">{ability.failed}</span> of {counted(ability.scenarios, 'scenario')} failed
                        </span>
                        <span className="muted">{ability.calls === 0 ? 'No calls' : `${ability.errored} of ${ability.calls} calls errored`}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </Card.Content>
            </Card.Root>
          )}
        </Stack>
      )}
    </section>
  );
}

function InspectorSummaryCard({ overview, snapshot }: { overview: Overview; snapshot?: ServerSnapshot }) {
  const { site } = overview;
  const audit = useMemo(
    () => (site === undefined ? undefined : buildInspectorAudit(site.findings, site.notBuilt, overview.abilities, overview.packs, snapshot)),
    [site, overview.abilities, overview.packs, snapshot],
  );

  return (
    <section className="section-block">
      <Stack direction="row" gap="md" align="center" justify="space-between" wrap="wrap">
        <div>
          <Text variant="heading-lg" render={<h2 />}>
            MCP Inspector contract checks
          </Text>
          <Text variant="body-sm" className="muted">
            {site === undefined
              ? 'Protocol and schema checks run automatically before every evaluation.'
              : `Last inspected via @modelcontextprotocol/inspector --strict in the run of ${when(site.startedAt)}.`}
          </Text>
        </div>
        <Link href={INSPECTOR_HREF}>Open full MCP Inspector report →</Link>
      </Stack>

      <Card.Root>
        <Card.Content>
          {audit === undefined ? (
            <Text className="muted">No saved run has MCP Inspector server checks yet.</Text>
          ) : (
            <ul className="check-summary-grid" role="list">
              {audit.checks.map((check) => (
                <li key={check.id} className="check-summary-item">
                  <div className="card-head-row">
                    <Text variant="heading-sm" render={<h3 />}>
                      {check.label}
                    </Text>
                    <span className="nowrap-badge">
                      <Badge intent={check.status === 'pass' ? 'stable' : check.status === 'warning' ? 'medium' : 'high'}>
                        {check.status === 'pass' ? 'Passed' : check.status === 'warning' ? 'Warning' : 'Failed'}
                      </Badge>
                    </span>
                  </div>
                  <Text variant="body-sm">{check.summary}</Text>
                </li>
              ))}
            </ul>
          )}
        </Card.Content>
      </Card.Root>
    </section>
  );
}

function NotBuiltYet({ overview }: { overview: Overview }) {
  if (overview.notBuiltYet.length === 0) return null;
  return (
    <section className="section-block">
      <Text variant="heading-lg" render={<h2 />}>
        Asked for, not built yet
      </Text>
      <Text variant="body-sm" className="muted">
        What site owners ask that no ability can do yet: the scenarios marked <code>to-be-implemented</code>.
      </Text>
      <Card.Root>
        <Card.Content>
          <ol className="gap-list">
            {overview.notBuiltYet.map((scenario) => (
              <li key={scenario.scenarioId}>
                <span className="gap-request">“{scenario.request}”</span>
                <span className="muted">
                  {packTitle(overview, scenario.pack)} · {scenario.story}
                </span>
              </li>
            ))}
          </ol>
        </Card.Content>
      </Card.Root>
    </section>
  );
}

function Trend({ overview }: { overview: Overview }) {
  const { trend } = overview;
  const [mode, setMode] = useState<'abilities' | 'scenarios'>('abilities');
  const sameDay = day(trend[0]?.startedAt) === day(trend.at(-1)?.startedAt);
  const runs = trend.map(({ runId, startedAt }) => ({ runId, label: sameDay ? when(startedAt) : day(startedAt) }));
  const series: Series[] =
    mode === 'abilities'
      ? [
          { label: 'On the site', className: 's-total', values: trend.map(({ onSite }) => onSite) },
          { label: 'Tested', className: 's-tested', values: trend.map(({ tested }) => tested) },
          { label: 'In a failing scenario', className: 's-failing', values: trend.map(({ failing }) => failing) },
        ]
      : [
          { label: 'Total scenarios', className: 's-total', values: trend.map(({ scenariosTotal }) => scenariosTotal) },
          { label: 'Passing', className: 's-passing', values: trend.map(({ scenariosPassed }) => scenariosPassed) },
          { label: 'Failing', className: 's-failing', values: trend.map(({ scenariosFailed }) => scenariosFailed) },
        ];

  return (
    <section className="section-block">
      <Card.Root>
        <Card.Header>
          <Stack direction="row" gap="md" align="center" justify="space-between" wrap="wrap" style={{ width: '100%' }}>
            <Card.Title>{`Across the saved runs (${trend.length})`}</Card.Title>
            {trend.length >= 2 && (
              <div className="pill-group" role="group" aria-label="Trend metric">
                <button type="button" className="pill-button" aria-pressed={mode === 'abilities'} onClick={() => setMode('abilities')}>
                  Abilities
                </button>
                <button type="button" className="pill-button" aria-pressed={mode === 'scenarios'} onClick={() => setMode('scenarios')}>
                  Scenarios
                </button>
              </div>
            )}
          </Stack>
        </Card.Header>
        <Card.Content>
          {trend.length < 2 ? (
            <Text className="muted">The trend starts with the second saved run.</Text>
          ) : (
            <Stack direction="column" gap="sm">
              <LineChart runs={runs} series={series} />
              <Text variant="body-sm" className="muted">
                Hover or focus a point to inspect that run; click to open it. Filtered runs preserve earlier verdicts for untouched scenarios so counts do not dip artificially.
              </Text>
            </Stack>
          )}
        </Card.Content>
      </Card.Root>
    </section>
  );
}

function OverviewOf({ overview }: { overview: Overview }) {
  const [selected, setSelected] = useState<DrawerTarget>();
  const snapshot = useOptionalJson<ServerSnapshot>(overview.site?.hasServerSnapshot ? serverUrl(overview.site.runId) : undefined);

  return (
    <Frame active="overview" crumbs={[]} title={titleOf(overview)} subtitle={<AsOf overview={overview} />}>
      <Stack direction="column" gap="xl">
        <MixedModels overview={overview} />
        <MethodologyDisclosure />
        <KpiGrid overview={overview} snapshot={snapshot} />
        <PackHealth overview={overview} />
        <NeedsAttention overview={overview} onOpenAbility={setSelected} />
        <InspectorSummaryCard overview={overview} snapshot={snapshot} />
        <NotBuiltYet overview={overview} />
        <Trend overview={overview} />
      </Stack>
      <AbilityDrawer overview={overview} target={selected} rawTools={snapshot?.tools} onClose={() => setSelected(undefined)} />
    </Frame>
  );
}

export function OverviewPage() {
  const loaded = useJson<Overview>(OVERVIEW_URL);
  return (
    <Loading loaded={loaded} active="overview" title="Abilities overview" crumbs={[]}>
      {(overview) => <OverviewOf overview={overview} />}
    </Loading>
  );
}
