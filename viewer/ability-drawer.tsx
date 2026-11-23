// Unified slide-over panel for one ability or MCP tool: switches cleanly between its Evaluation results
// (scenarios, pass/fail, detailed errored calls with trial links) and its MCP Contract (description,
// annotations, Inspector findings, and raw input/output JSON Schemas when `server.json` is available).

import { Badge, CollapsibleCard, Drawer, Link, Notice, Stack, Tabs, Text } from '@wordpress/ui';
import { useEffect, useState, type ReactNode } from 'react';
import type { AbilityCoverage, DefinitionFinding, ErroredCall, ListedTool, Overview, ScenarioCoverage } from '../src/results/types.ts';
import { Swatch, groupLabel } from './charts.tsx';
import { runHref, trialHref } from './data.ts';
import { findingScope, type InspectedToolRow } from './inspector-summary.ts';
import { AnnotationBadges, Data, DefinitionList, OutcomeBadge, counted, when } from './parts.tsx';

function packTitle(overview: Overview, name: string): string {
  return overview.packs.find((pack) => pack.name === name)?.title ?? name;
}

function errored({ calls, errored: count }: AbilityCoverage): string {
  return calls === 0 ? 'no calls' : `${count} of ${calls}`;
}

function Stat({ label, value, bad = false }: { label: string; value: ReactNode; bad?: boolean }) {
  return (
    <div className="stat">
      <span className={`stat-value ${bad ? 'num-bad' : ''}`}>{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

function ScenarioLine({ result }: { result: ScenarioCoverage }) {
  const { latest } = result;
  return (
    <li className="scenario-line">
      <Stack direction="row" gap="sm" align="center" wrap="wrap">
        {latest === undefined ? <Badge intent="none">Not run yet</Badge> : <OutcomeBadge outcome={latest.outcome} />}
        <code>{result.scenarioId}</code>
        {!result.named && <Badge intent="none">ran in it, not named</Badge>}
      </Stack>
      <Text variant="body-sm" className="prose">
        “{result.request}”
      </Text>
      {latest !== undefined && (
        <Stack direction="row" gap="sm" align="center" wrap="wrap">
          <div className="agent-pills">
            {latest.agents.map(({ agent, passed, trials }) => {
              const matching = (latest.trials ?? []).filter((one) => one.agent === agent);
              const firstFailed = matching.find((one) => !one.pass);
              const href =
                firstFailed !== undefined
                  ? trialHref(latest.runId, firstFailed.file)
                  : matching.length === 1 && matching[0] !== undefined
                    ? trialHref(latest.runId, matching[0].file)
                    : runHref(latest.runId);
              const allPass = trials > 0 && passed === trials;
              return (
                <a key={agent} href={href} className={`agent-pill ${allPass ? 'agent-pill-pass' : 'agent-pill-fail'}`}>
                  <span>{agent}</span>
                  <strong>{`${passed}/${trials}`}</strong>
                </a>
              );
            })}
          </div>
          <Text variant="body-sm" className="muted">
            <Link href={runHref(latest.runId)}>{when(latest.startedAt)}</Link>
          </Text>
        </Stack>
      )}
    </li>
  );
}

function ErroredCallCard({ call }: { call: ErroredCall }) {
  const href = call.file === undefined ? runHref(call.runId) : trialHref(call.runId, call.file);
  return (
    <li className="errored-call-card">
      <Stack direction="row" gap="sm" align="center" justify="space-between" wrap="wrap">
        <Stack direction="row" gap="xs" align="center" wrap="wrap">
          <Badge intent="high">Error</Badge>
          <code>{call.scenarioId}</code>
        </Stack>
        <Link href={href}>{`${call.agent} · trial ${call.trial} →`}</Link>
      </Stack>
      <div className="errored-call-body">
        <Text variant="body-sm" className="fact-label">
          Input to <code>{call.tool}</code>
        </Text>
        <Data value={call.input} />
        <Text variant="body-sm" className="fact-label">
          Error returned
        </Text>
        <div className="diff-before">
          <Data value={call.output} />
        </div>
      </div>
    </li>
  );
}

export interface DrawerTarget {
  ability?: AbilityCoverage;
  tool?: InspectedToolRow;
  initialTab?: 'evaluation' | 'contract';
}

function ContractTab({ ability, tool, rawTool }: { ability?: AbilityCoverage; tool?: InspectedToolRow; rawTool?: ListedTool }) {
  const findings = tool?.findings ?? ability?.definitionFindings ?? [];
  const description = tool?.description ?? rawTool?.description;
  const title = tool?.title ?? rawTool?.title;
  const annotations = tool?.annotations ?? rawTool?.annotations;
  const inputSchema = tool?.inputSchema ?? rawTool?.inputSchema;
  const outputSchema = tool?.outputSchema ?? rawTool?.outputSchema;
  const toolName = tool?.toolName ?? ability?.ability.replaceAll('/', '-') ?? '';
  const hasSnapshotData = description !== undefined || annotations !== undefined || inputSchema !== undefined || outputSchema !== undefined;

  return (
    <Stack direction="column" gap="lg">
      <div className="contract-meta">
        <div className="fact">
          <Text variant="body-sm" className="fact-label">
            MCP tool name
          </Text>
          <code>{toolName}</code>
        </div>
        {title !== undefined && (
          <div className="fact">
            <Text variant="body-sm" className="fact-label">
              Title
            </Text>
            <Text variant="body-sm">{title}</Text>
          </div>
        )}
        <div className="fact">
          <Text variant="body-sm" className="fact-label">
            Annotations
          </Text>
          <AnnotationBadges annotations={annotations} fallbackKind={ability?.kind ?? tool?.kind} />
        </div>
        {description !== undefined && (
          <div className="fact">
            <Text variant="body-sm" className="fact-label">
              Description
            </Text>
            <Text variant="body-sm" className="prose">
              {description || '(empty description)'}
            </Text>
          </div>
        )}
      </div>

      {!hasSnapshotData && (
        <Notice.Root intent="info">
          <Notice.Description>
            Full tool description, annotations, and JSON Schemas are captured in <code>server.json</code> on runs created with this version.
          </Notice.Description>
        </Notice.Root>
      )}

      <div>
        <Text variant="heading-sm" render={<h3 />}>
          {findings.length === 0 ? 'MCP Inspector findings (none)' : `MCP Inspector findings (${findings.length})`}
        </Text>
        {findings.length === 0 ? (
          <Text variant="body-sm" className="muted">
            No schema portability, description, or read/write annotation problems found on this tool.
          </Text>
        ) : (
          <DefinitionList findings={findings} />
        )}
      </div>

      {inputSchema !== undefined && (
        <CollapsibleCard.Root defaultOpen={false}>
          <CollapsibleCard.Header>Input JSON Schema</CollapsibleCard.Header>
          <CollapsibleCard.Content>
            <Data value={inputSchema} />
          </CollapsibleCard.Content>
        </CollapsibleCard.Root>
      )}

      {outputSchema !== undefined && (
        <CollapsibleCard.Root defaultOpen={false}>
          <CollapsibleCard.Header>Output JSON Schema</CollapsibleCard.Header>
          <CollapsibleCard.Content>
            <Data value={outputSchema} />
          </CollapsibleCard.Content>
        </CollapsibleCard.Root>
      )}
    </Stack>
  );
}

function findingsBreakdown(findings: DefinitionFinding[]): string {
  const input = findings.filter((item) => findingScope(item) === 'input').length;
  const output = findings.filter((item) => findingScope(item) === 'output').length;
  const metadata = findings.length - input - output;
  return [input > 0 ? `${input} input schema` : '', output > 0 ? `${output} output schema` : '', metadata > 0 ? `${metadata} metadata` : ''].filter(Boolean).join(', ');
}

function EvaluationTab({ ability, findings, onOpenContract }: { ability: AbilityCoverage; findings: DefinitionFinding[]; onOpenContract: () => void }) {
  const errorCount = findings.filter(({ severity }) => severity === 'error').length;
  const warningCount = findings.length - errorCount;
  const summaryParts = [errorCount > 0 ? counted(errorCount, 'error') : '', warningCount > 0 ? counted(warningCount, 'warning') : ''].filter(Boolean).join(', ');
  const breakdown = findingsBreakdown(findings);

  return (
    <Stack direction="column" gap="lg">
      {findings.length > 0 && (
        <Notice.Root intent={errorCount > 0 ? 'error' : 'warning'}>
          <Notice.Description>
            <div className="drawer-notice-row">
              <span>
                MCP Inspector found <strong>{summaryParts}</strong>
                {breakdown !== '' && ` (${breakdown})`}.
              </span>
              <button type="button" className="inline-link-button" onClick={onOpenContract}>
                Inspect MCP Contract →
              </button>
            </div>
          </Notice.Description>
        </Notice.Root>
      )}
      <div className="stat-row">
        <Stat label="Scenarios" value={ability.scenarios} />
        <Stat label="Passed" value={ability.passed} />
        <Stat label="Failed" value={ability.failed} bad={ability.failed > 0} />
        <Stat label="Known defect / waiting" value={ability.knownDefect + ability.notBuilt} />
        <Stat label="Ran in" value={ability.ranIn} />
        <Stat label="Calls that errored" value={errored(ability)} bad={ability.errored > 0} />
      </div>
      {ability.failed > 0 && (
        <Notice.Root intent="warning">
          <Notice.Description>
            {ability.failed} of {counted(ability.scenarios, 'scenario')} naming it failed. The cause may be this ability or another part of the scenario: open each trial to see.
          </Notice.Description>
        </Notice.Root>
      )}
      {(ability.erroredCalls !== undefined && ability.erroredCalls.length > 0) || ability.errors.length > 0 ? (
        <div>
          <Text variant="heading-sm" render={<h3 />}>
            {`Calls that errored (${ability.errored} of ${ability.calls})`}
          </Text>
          {ability.erroredCalls !== undefined && ability.erroredCalls.length > 0 ? (
            <ul className="errored-calls-list" role="list">
              {ability.erroredCalls.map((call, index) => (
                <ErroredCallCard key={`${call.scenarioId}-${call.agent}-${call.trial}-${index}`} call={call} />
              ))}
            </ul>
          ) : (
            <ul className="errors" role="list">
              {ability.errors.map((error, index) => (
                <li key={index}>
                  <code>{error}</code>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
      <div>
        <Text variant="heading-sm" render={<h3 />}>
          Scenarios
        </Text>
        {ability.results.length === 0 ? (
          <Text className="muted">No scenario names it, and it ran in none.</Text>
        ) : (
          <ul className="scenario-list" role="list">
            {ability.results.map((result) => (
              <ScenarioLine key={result.scenarioId} result={result} />
            ))}
          </ul>
        )}
      </div>
    </Stack>
  );
}

export function AbilityDrawer({
  overview,
  target,
  rawTools,
  onClose,
}: {
  overview: Overview;
  target?: DrawerTarget;
  rawTools?: ListedTool[];
  onClose: () => void;
}) {
  const ability = target?.ability ?? (target?.tool?.ability === undefined ? undefined : overview.abilities.find((one) => one.ability === target.tool?.ability));
  const tool = target?.tool;
  const toolName = tool?.toolName ?? ability?.ability.replaceAll('/', '-');
  const rawTool = toolName === undefined ? undefined : rawTools?.find((one) => one.name === toolName);
  const title = ability?.ability ?? tool?.toolName ?? '';
  const findings = tool?.findings ?? ability?.definitionFindings ?? [];
  const hasErrors = findings.some(({ severity }) => severity === 'error');
  const defaultTab: 'evaluation' | 'contract' = ability === undefined ? 'contract' : target?.initialTab ?? 'evaluation';
  const [tab, setTab] = useState<'evaluation' | 'contract'>(defaultTab);

  useEffect(() => {
    setTab(defaultTab);
  }, [title, defaultTab]);

  return (
    <Drawer.Root open={target !== undefined} onOpenChange={(open) => !open && onClose()} swipeDirection="right">
      <Drawer.Popup size="large">
        {target !== undefined && (
          <>
            <Drawer.Header>
              <Drawer.Title>{title}</Drawer.Title>
              <Drawer.CloseIconButton />
            </Drawer.Header>
            <Drawer.Content>
              <Stack direction="column" gap="lg">
                <Stack direction="row" gap="sm" align="center" wrap="wrap">
                  {ability !== undefined && (
                    <span className="group-cell">
                      <Swatch group={ability.group} />
                      {groupLabel(ability.group)}
                    </span>
                  )}
                  {(ability?.pack ?? tool?.pack) !== undefined && <Badge intent="none">{packTitle(overview, (ability?.pack ?? tool?.pack) as string)}</Badge>}
                  {(ability?.kind ?? tool?.kind) !== undefined && (
                    <Badge intent="none">{(ability?.kind ?? tool?.kind) === 'read' ? 'reads the site' : 'changes the site'}</Badge>
                  )}
                  {tool?.status === 'unlisted' && <Badge intent="medium">in no pack</Badge>}
                </Stack>

                {ability !== undefined ? (
                  <Tabs.Root value={tab} onValueChange={(next) => setTab(next === 'contract' ? 'contract' : 'evaluation')}>
                    <Tabs.List>
                      <Tabs.Tab value="evaluation">{`Evaluation (${ability.results.length})`}</Tabs.Tab>
                      <Tabs.Tab value="contract">
                        <span className="tab-label-row">
                          <span>MCP Contract</span>
                          {findings.length > 0 && <Badge intent={hasErrors ? 'high' : 'medium'}>{String(findings.length)}</Badge>}
                        </span>
                      </Tabs.Tab>
                    </Tabs.List>
                    <Tabs.Panel value="evaluation" className="drawer-tab-panel">
                      <EvaluationTab ability={ability} findings={findings} onOpenContract={() => setTab('contract')} />
                    </Tabs.Panel>
                    <Tabs.Panel value="contract" className="drawer-tab-panel">
                      <ContractTab ability={ability} tool={tool} rawTool={rawTool} />
                    </Tabs.Panel>
                  </Tabs.Root>
                ) : (
                  <ContractTab tool={tool} rawTool={rawTool} />
                )}
              </Stack>
            </Drawer.Content>
          </>
        )}
      </Drawer.Popup>
    </Drawer.Root>
  );
}
