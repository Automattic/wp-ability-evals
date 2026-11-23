// One run: summary KPI strip, its MCP Inspector snapshot, how each scenario ended with direct per-agent trial
// links, and every trial with why it did not pass.

import { DataViews, filterSortAndPaginate, type Field, type View } from '@wordpress/dataviews';
import { Badge, Card, CollapsibleCard, Link, Notice, Stack, Text } from '@wordpress/ui';
import { useMemo, useState } from 'react';
import type { AgentModels, RunFile, RunListing, TrialSummary, Verdict } from '../src/results/types.ts';
import { INSPECTOR_HREF, OVERVIEW_HREF, RUNS_HREF, RUNS_URL, runUrl, trialHref, useJson } from './data.ts';
import { findingScope, groupFindingsByRule } from './inspector-summary.ts';
import { Frame, Loading, OUTCOME_OPTIONS, OutcomeBadge, TRIAL_OUTCOME_OPTIONS, TrialBadge, VerdictCounts, counted, percent, seconds, trialOutcomeOf, when, whenOfRun } from './parts.tsx';

const CRUMBS = [
  { label: 'Overview', href: OVERVIEW_HREF },
  { label: 'Runs', href: RUNS_HREF },
];
const STATES = ['implemented', 'known-defect', 'to-be-implemented'].map((state) => ({ value: state, label: state }));

function options(values: string[]): { value: string; label: string }[] {
  return [...new Set(values)].map((value) => ({ value, label: value }));
}

/** Why a trial did not pass, in one line: what stopped it, why it was not run, or the reason of each check that failed. */
function whyOf({ error, notRun, failed }: TrialSummary): string {
  return error ?? notRun ?? failed.map(({ check, reason, judge }) => `${check}: ${reason}${judge === undefined ? '' : ` (judge: ${judge})`}`).join('; ');
}

function AgentCell({ id, trials, verdict, agent }: { id: string; trials: TrialSummary[]; verdict: Verdict; agent: string }) {
  const tally = verdict.agents.find((candidate) => candidate.agent === agent);
  if (tally === undefined) return <span className="muted">—</span>;
  const matching = trials.filter((trial) => trial.scenarioId === verdict.scenarioId && trial.agent === agent);
  const firstFailed = matching.find((trial) => !trial.pass);
  const target = firstFailed ?? matching[0];
  const allPass = tally.trials > 0 && tally.passed === tally.trials && verdict.outcome !== 'error';
  const label = `${tally.passed}/${tally.trials}`;
  if (target === undefined) return <span>{label}</span>;
  return (
    <a href={trialHref(id, target.file)} className={`agent-pill ${allPass ? 'agent-pill-pass' : 'agent-pill-fail'}`}>
      <strong>{label}</strong>
      <span>{allPass ? 'pass' : 'inspect'}</span>
    </a>
  );
}

function ScenariosTable({ id, run, failedOnly }: { id: string; run: RunFile; failedOnly: boolean }) {
  const [view, setView] = useState<View>({
    type: 'table',
    titleField: 'scenario',
    fields: ['outcome', ...run.agents.map((agent) => `agent:${agent}`), 'state'],
    perPage: 50,
    page: 1,
    filters: [],
    search: '',
  });
  const verdicts = useMemo(() => (failedOnly ? run.verdicts.filter((verdict) => verdict.outcome !== 'pass') : run.verdicts), [run.verdicts, failedOnly]);
  const fields = useMemo<Field<Verdict>[]>(
    () => [
      { id: 'scenario', label: 'Scenario', getValue: ({ item }) => item.scenarioId, render: ({ item }) => <code>{item.scenarioId}</code>, enableHiding: false, enableGlobalSearch: true },
      {
        id: 'outcome',
        label: 'Verdict',
        getValue: ({ item }) => item.outcome,
        render: ({ item }) => <OutcomeBadge outcome={item.outcome} />,
        elements: OUTCOME_OPTIONS,
        filterBy: { operators: ['isAny'] },
      },
      ...run.agents.map<Field<Verdict>>((agent) => ({
        id: `agent:${agent}`,
        label: agent,
        enableSorting: false,
        getValue: ({ item }) => {
          const tally = item.agents.find((candidate) => candidate.agent === agent);
          return tally === undefined ? '' : `${tally.passed} of ${tally.trials} passed`;
        },
        render: ({ item }) => <AgentCell id={id} trials={run.trials} verdict={item} agent={agent} />,
      })),
      { id: 'state', label: 'State', getValue: ({ item }) => item.state, elements: STATES, filterBy: { operators: ['isAny'] } },
    ],
    [id, run],
  );
  const { data, paginationInfo } = useMemo(() => filterSortAndPaginate(verdicts, view, fields), [verdicts, view, fields]);

  return (
    <DataViews
      data={data}
      fields={fields}
      view={view}
      onChangeView={setView}
      paginationInfo={paginationInfo}
      defaultLayouts={{ table: {} }}
      getItemId={(verdict) => verdict.scenarioId}
    />
  );
}

function TrialsTable({ id, run, failedOnly }: { id: string; run: RunFile; failedOnly: boolean }) {
  const [view, setView] = useState<View>({
    type: 'table',
    titleField: 'scenario',
    fields: ['agent', 'trial', 'outcome', 'why', 'duration'],
    layout: { styles: { agent: { width: '120px' }, trial: { width: '70px' }, outcome: { width: '120px' }, why: { width: '42%' }, duration: { width: '80px' } } },
    perPage: 50,
    page: 1,
    filters: [],
    search: '',
  });
  const trials = useMemo(() => (failedOnly ? run.trials.filter((trial) => !trial.pass) : run.trials), [run.trials, failedOnly]);
  const fields = useMemo<Field<TrialSummary>[]>(
    () => [
      { id: 'scenario', label: 'Scenario', getValue: ({ item }) => item.scenarioId, render: ({ item }) => <code>{item.scenarioId}</code>, enableHiding: false, enableGlobalSearch: true },
      { id: 'agent', label: 'Agent', getValue: ({ item }) => item.agent, elements: options(run.agents), filterBy: { operators: ['isAny'] } },
      { id: 'trial', label: 'Trial', type: 'integer', getValue: ({ item }) => item.trial },
      {
        id: 'outcome',
        label: 'Result',
        getValue: ({ item }) => trialOutcomeOf(item),
        render: ({ item }) => <TrialBadge outcome={trialOutcomeOf(item)} />,
        elements: TRIAL_OUTCOME_OPTIONS,
        filterBy: { operators: ['isAny'] },
      },
      { id: 'why', label: 'Why it did not pass', getValue: ({ item }) => whyOf(item), render: ({ item }) => <span className="reason">{whyOf(item)}</span>, enableSorting: false, enableGlobalSearch: true },
      { id: 'duration', label: 'Took', getValue: ({ item }) => item.durationMs, render: ({ item }) => seconds(item.durationMs) },
    ],
    [run],
  );
  const { data, paginationInfo } = useMemo(() => filterSortAndPaginate(trials, view, fields), [trials, view, fields]);

  return (
    <DataViews
      data={data}
      fields={fields}
      view={view}
      onChangeView={setView}
      paginationInfo={paginationInfo}
      defaultLayouts={{ table: {} }}
      getItemId={(trial) => trial.file}
      isItemClickable={() => true}
      renderItemLink={({ item, ...props }) => <a {...props} href={trialHref(id, item.file)} />}
    />
  );
}

function RunInspectorCard({ run }: { run: RunFile }) {
  const checks = run.serverChecks;
  if (checks === undefined) return null;
  if (checks.outcome === 'unreadable') {
    return (
      <Notice.Root intent="error">
        <Notice.Title>MCP Inspector could not read the server</Notice.Title>
        <Notice.Description>{checks.reason}</Notice.Description>
      </Notice.Root>
    );
  }
  if (checks.outcome === 'behind-lookup') {
    return (
      <Notice.Root intent="info">
        <Notice.Title>MCP Inspector found lookup execution tools</Notice.Title>
        <Notice.Description>Abilities ran through {checks.runTools.join(', ')}, so tools/list did not enumerate individual abilities.</Notice.Description>
      </Notice.Root>
    );
  }
  const findings = checks.definitionFindings ?? [];
  const groups = groupFindingsByRule(findings);
  const errors = findings.filter(({ severity }) => severity === 'error').length;
  const inputWarnings = findings.filter((item) => item.severity === 'warning' && findingScope(item) === 'input').length;
  const outputWarnings = findings.filter((item) => item.severity === 'warning' && findingScope(item) === 'output').length;
  const total = checks.onSite.length + checks.missing.length;

  return (
    <CollapsibleCard.Root defaultOpen={false}>
      <CollapsibleCard.Header>
        <Stack direction="row" gap="sm" align="center" wrap="wrap">
          <span>MCP Inspector server checks</span>
          <Badge intent={errors > 0 || checks.missing.length > 0 ? 'high' : findings.length > 0 ? 'medium' : 'stable'}>
            {`${checks.onSite.length}/${total} tools · ${errors} errors · ${findings.length - errors} warnings`}
          </Badge>
          {checks.inspectorVersion !== undefined && <Badge intent="informational">{`v${checks.inspectorVersion}`}</Badge>}
        </Stack>
      </CollapsibleCard.Header>
      <CollapsibleCard.Content>
        <Stack direction="column" gap="md">
          <Text variant="body-sm">
            Exposed <strong>{checks.onSite.length}</strong> of <strong>{total}</strong> listed pack abilities
            {checks.missing.length > 0 && ` (${checks.missing.length} missing: ${checks.missing.join(', ')})`}
            {checks.inNoPack.length > 0 && ` · ${checks.inNoPack.length} unlisted tools`}
            {findings.length > 0 && ` · ${inputWarnings} inputSchema warnings, ${outputWarnings} outputSchema warnings`}.{' '}
            <Link href={INSPECTOR_HREF}>Open full MCP Inspector view</Link>
          </Text>
          {groups.length > 0 && (
            <ul className="run-rule-list" role="list">
              {groups.map((group) => (
                <li key={`${group.severity}:${group.rule}`}>
                  <Badge intent={group.severity === 'error' ? 'high' : 'medium'}>{group.severity}</Badge>{' '}
                  <code>{group.rule}</code>: {counted(group.count, 'finding')} across {counted(group.abilities.length, 'ability', 'abilities')} ({group.inputCount} input, {group.outputCount} output)
                </li>
              ))}
            </ul>
          )}
        </Stack>
      </CollapsibleCard.Content>
    </CollapsibleCard.Root>
  );
}

function modelSentence({ agent, ran, judge }: AgentModels): string {
  const models = ran.length === 0 ? 'no model: no trial got as far as an answer' : ran.map(({ model, program }) => `${model} (program ${program})`).join(' and ');
  return `${agent} ran ${models}${judge === undefined ? '' : `, graded by ${judge.name}${judge.model === undefined ? '' : ` (${judge.model})`}`}.`;
}

function RunDetail({ id, run, fallbackModels }: { id: string; run: RunFile; fallbackModels?: AgentModels[] }) {
  const [failedOnly, setFailedOnly] = useState(false);
  const passedScenarios = run.verdicts.filter((verdict) => verdict.outcome === 'pass' || verdict.outcome === 'unexpected-pass').length;
  const failedScenarios = run.verdicts.filter((verdict) => verdict.outcome !== 'pass').length;
  const totalDuration = run.trials.reduce((sum, trial) => sum + trial.durationMs, 0);
  const models = run.models ?? fallbackModels;

  return (
    <Frame
      active="runs"
      crumbs={CRUMBS}
      title={when(run.startedAt)}
      badges={<VerdictCounts verdicts={run.verdicts} />}
      subtitle={
        <Stack direction="column" gap="xs">
          <Text variant="body-sm" className="muted">
            Site <strong>{run.site}</strong> · {run.agents.join(' and ')} · {counted(run.trialsPerScenario, 'trial')} per scenario · {counted(run.trials.length, 'total trial')} ({seconds(totalDuration)})
          </Text>
          {models !== undefined && models.length > 0 && <Text variant="body-sm">{models.map(modelSentence).join(' ')}</Text>}
        </Stack>
      }
    >
      {run.errors !== undefined && run.errors.length > 0 && (
        <Notice.Root intent="error">
          <Notice.Title>The run ended with hook or teardown errors</Notice.Title>
          <Notice.Description>{run.errors.join(' · ')}</Notice.Description>
        </Notice.Root>
      )}

      <div className="kpi-grid kpi-grid-compact">
        <div className="kpi-card kpi-card-static">
          <span className="kpi-label">Scenarios passed</span>
          <span className="kpi-value">
            {percent(passedScenarios, run.verdicts.length)}
            <span className="kpi-ratio">{`${passedScenarios}/${run.verdicts.length}`}</span>
          </span>
        </div>
        {run.agents.map((agent) => {
          const ownTrials = run.trials.filter((trial) => trial.agent === agent);
          const ownPassed = ownTrials.filter((trial) => trial.pass).length;
          return (
            <div key={agent} className="kpi-card kpi-card-static">
              <span className="kpi-label">{agent}</span>
              <span className="kpi-value">
                {percent(ownPassed, ownTrials.length)}
                <span className="kpi-ratio">{`${ownPassed}/${ownTrials.length} trials`}</span>
              </span>
            </div>
          );
        })}
        <div className="kpi-card kpi-card-static">
          <span className="kpi-label">Total trial time</span>
          <span className="kpi-value">{seconds(totalDuration)}</span>
        </div>
      </div>

      <RunInspectorCard run={run} />

      <Card.Root className="abilities-table">
        <Card.Header>
          <Stack direction="row" gap="md" align="center" justify="space-between" wrap="wrap" style={{ width: '100%' }}>
            <Stack direction="column" gap="xs">
              <Card.Title>{`Scenarios (${run.verdicts.length})`}</Card.Title>
              <Text variant="body-sm" className="muted">
                Click any agent pill to jump straight to that agent&apos;s trial.
              </Text>
            </Stack>
            {failedScenarios > 0 && (
              <button type="button" className="pill-button" aria-pressed={failedOnly} onClick={() => setFailedOnly((current) => !current)}>
                {failedOnly ? `Showing non-passing (${failedScenarios})` : `Filter to non-passing (${failedScenarios})`}
              </button>
            )}
          </Stack>
        </Card.Header>
        <ScenariosTable id={id} run={run} failedOnly={failedOnly} />
      </Card.Root>

      <Card.Root className="abilities-table">
        <Card.Header>
          <Stack direction="column" gap="xs">
            <Card.Title>{`Trials (${run.trials.length})`}</Card.Title>
            <Text variant="body-sm" className="muted">
              Open any trial row to inspect site diffs, checks, answer, and step-by-step tool calls.
            </Text>
          </Stack>
        </Card.Header>
        <TrialsTable id={id} run={run} failedOnly={failedOnly} />
      </Card.Root>
    </Frame>
  );
}

export function RunPage({ id }: { id: string }) {
  const loaded = useJson<RunFile>(runUrl(id));
  const runs = useJson<RunListing[]>(RUNS_URL);
  return (
    <Loading loaded={loaded} active="runs" title={whenOfRun(id)} crumbs={CRUMBS}>
      {(run) => <RunDetail id={id} run={run} fallbackModels={runs.state === 'ready' ? runs.data.find((listed) => listed.id === id)?.models : undefined} />}
    </Loading>
  );
}
