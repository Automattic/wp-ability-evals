// One trial: summary metadata, what was asked, what was expected, every check verdict, visual before/after
// site changes, the agent's answer, and a numbered step-by-step tool-call timeline with argument previews.

import { Badge, Card, CollapsibleCard, Notice, Stack, Text } from '@wordpress/ui';
import type { ReactNode } from 'react';
import type { CheckResult, ExpectedAbility, Expectation, Scenario, SiteReadings, ToolCall, TrialFile } from '../src/results/types.ts';
import { OVERVIEW_HREF, RUNS_HREF, runHref, trialUrl, useJson } from './data.ts';
import { toolInputPreview } from './inspector-summary.ts';
import { Data, Frame, Loading, TrialBadge, seconds, trialOutcomeOf, whenOfRun, type Crumb } from './parts.tsx';
import { changesOf, type Fields, type ItemChange } from './site-changes.ts';

function crumbsOf(id: string): Crumb[] {
  return [
    { label: 'Overview', href: OVERVIEW_HREF },
    { label: 'Runs', href: RUNS_HREF },
    { label: whenOfRun(id), href: runHref(id) },
  ];
}

function Section({ title, badge, children }: { title: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <Card.Root>
      <Card.Header>
        <Stack direction="row" gap="sm" align="center" wrap="wrap">
          <Card.Title>{title}</Card.Title>
          {badge}
        </Stack>
      </Card.Header>
      <Card.Content>{children}</Card.Content>
    </Card.Root>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fact">
      <Text variant="body-sm" className="fact-label">
        {label}
      </Text>
      <div className="fact-value">{children}</div>
    </div>
  );
}

function expectedAbility(entry: ExpectedAbility): string {
  if (typeof entry === 'string') return entry;
  return Object.entries(entry)
    .map(([ability, expected]) => {
      const each = Object.entries(expected).map(([name, value]) => `${name} ${(Array.isArray(value) ? value : [value]).map((one) => JSON.stringify(one)).join(' or ')}`);
      return `${ability} (${each.join(', ')})`;
    })
    .join(', ');
}

function Expected({ scenario }: { scenario: Scenario }) {
  const { site, abilities, forbidden, answer }: Expectation = scenario.expect;
  return (
    <Stack direction="column" gap="md">
      <Fact label="Kind">
        {scenario.kind}
        {scenario.state !== undefined && scenario.state !== 'implemented' && ` (${scenario.state}: ${scenario.reason ?? 'no reason given'})`}
      </Fact>
      {scenario.given !== undefined && (
        <Fact label="Starting content">
          <Data value={scenario.given} />
        </Fact>
      )}
      {abilities !== undefined && <Fact label="Abilities that must run">{abilities.map(expectedAbility).join(', ')}</Fact>}
      {forbidden !== undefined && <Fact label="Abilities that must not run">{forbidden.join(', ')}</Fact>}
      {site !== undefined && (
        <Fact label="The site must change this way">
          <Data value={site} />
        </Fact>
      )}
      {answer?.contains !== undefined && <Fact label="The answer must contain">{answer.contains.join(', ')}</Fact>}
      {answer?.rubric !== undefined && (
        <Fact label="Judge rubric">
          <span className="prose">{answer.rubric}</span>
        </Fact>
      )}
    </Stack>
  );
}

function Checks({ checks }: { checks: CheckResult[] }) {
  return (
    <Stack direction="column" gap="sm">
      {checks.map(({ check, pass, reason, judge }) => (
        <div key={check} className={`check ${pass ? '' : 'check-failed'}`}>
          <Badge intent={pass ? 'stable' : 'high'}>{pass ? 'Passed' : 'Failed'}</Badge>
          <code>{check}</code>
          <span>
            {reason}
            {judge !== undefined && ` (judge: ${judge})`}
          </span>
        </div>
      ))}
    </Stack>
  );
}

function ItemFields({ fields, tone }: { fields: Fields; tone?: 'created' | 'removed' }) {
  return Object.entries(fields).map(([name, value]) => (
    <Fact key={name} label={name}>
      <div className={tone === 'created' ? 'diff-after' : tone === 'removed' ? 'diff-before' : undefined}>
        <Data value={value} />
      </div>
    </Fact>
  ));
}

const CHANGES: Record<ItemChange['change'], { label: string; intent: 'stable' | 'high' | 'informational' }> = {
  created: { label: 'Created', intent: 'stable' },
  removed: { label: 'Removed', intent: 'high' },
  changed: { label: 'Changed', intent: 'informational' },
};

function Change({ change: { type, key, change, before, after, fields } }: { change: ItemChange }) {
  const badge = CHANGES[change];
  return (
    <div className={`diff-card diff-card-${change}`}>
      <Stack direction="column" gap="sm">
        <Stack direction="row" gap="sm" align="center" wrap="wrap">
          <Badge intent={badge.intent}>{badge.label}</Badge>
          <code>{`${type} ${key}`}</code>
        </Stack>
        {before !== undefined && after !== undefined ? (
          <>
            <Fact label="">
              <div className="before-and-after">
                <Text variant="body-sm" className="fact-label">
                  Before
                </Text>
                <Text variant="body-sm" className="fact-label">
                  After
                </Text>
              </div>
            </Fact>
            {fields.map((field) => (
              <Fact key={field} label={field}>
                <div className="before-and-after">
                  <div className="diff-before">
                    <Data value={before[field]} />
                  </div>
                  <div className="diff-after">
                    <Data value={after[field]} />
                  </div>
                </div>
              </Fact>
            ))}
          </>
        ) : (
          <ItemFields fields={before ?? after ?? {}} tone={change === 'created' ? 'created' : 'removed'} />
        )}
      </Stack>
    </div>
  );
}

function Changes({ site }: { site: SiteReadings }) {
  const changes = changesOf(site);
  if (changes.length === 0) return <Text className="muted">Nothing on the site changed.</Text>;
  return (
    <Stack direction="column" gap="md">
      {changes.map((change) => (
        <Change key={`${change.type} ${change.key}`} change={change} />
      ))}
    </Stack>
  );
}

function SiteBefore({ before, given = {} }: { before: SiteReadings['before']; given?: Scenario['given'] }) {
  const count = Object.values(before).reduce((sum, items) => sum + Object.keys(items).length, 0);
  return (
    <CollapsibleCard.Root defaultOpen={false}>
      <CollapsibleCard.Header>{`The site before (${count} ${count === 1 ? 'item' : 'items'})`}</CollapsibleCard.Header>
      <CollapsibleCard.Content>
        <Stack direction="column" gap="xl">
          {Object.entries(before).map(([type, items]) => (
            <Stack key={type} direction="column" gap="lg">
              <Text variant="heading-md" render={<h3 />}>
                {`${type} (${Object.keys(items).length})`}
              </Text>
              {Object.entries(items).map(([key, fields]) => (
                <Stack key={key} direction="column" gap="sm">
                  <Stack direction="row" gap="sm" align="center" wrap="wrap">
                    <code>{key}</code>
                    {given[type]?.[key] !== undefined && <Badge intent="informational">The scenario&apos;s starting content</Badge>}
                  </Stack>
                  <ItemFields fields={fields} />
                </Stack>
              ))}
            </Stack>
          ))}
        </Stack>
      </CollapsibleCard.Content>
    </CollapsibleCard.Root>
  );
}

function Call({ call, step }: { call: ToolCall; step: number }) {
  const preview = toolInputPreview(call.input);
  return (
    <CollapsibleCard.Root defaultOpen={call.isError}>
      <CollapsibleCard.Header>
        <div className="call-header">
          <span className="step-num step-num-sm" aria-hidden="true">
            {step}
          </span>
          <code>{call.tool}</code>
          <Badge intent={call.server === null ? 'none' : 'informational'}>{call.server === null ? "agent's tool" : `mcp:${call.server}`}</Badge>
          {call.isError && <Badge intent="high">Error</Badge>}
          {preview !== '' && <code className="call-preview">{preview}</code>}
        </div>
      </CollapsibleCard.Header>
      <CollapsibleCard.Content>
        <Stack direction="column" gap="md">
          <Fact label="Input">
            <Data value={call.input} />
          </Fact>
          <Fact label="Output">
            <Data value={call.output} />
          </Fact>
        </Stack>
      </CollapsibleCard.Content>
    </CollapsibleCard.Root>
  );
}

function Trial({ id, trial }: { id: string; trial: TrialFile }) {
  const { scenario, transcript } = trial;
  const passedChecks = trial.checks.filter((check) => check.pass).length;
  const failedChecks = trial.checks.length - passedChecks;

  return (
    <Frame
      active="runs"
      crumbs={crumbsOf(id)}
      title={`${scenario.id} · ${trial.agent} · trial ${trial.trial}`}
      badges={<TrialBadge outcome={trialOutcomeOf(trial)} />}
      subtitle={
        <div className="trial-meta-strip">
          <span>
            Agent: <strong>{trial.agent}</strong>
          </span>
          {transcript !== undefined && (
            <>
              <span>
                Model: <strong>{transcript.versions.model}</strong> ({transcript.versions.agent})
              </span>
              <span>
                Tool calls: <strong>{transcript.toolCalls.length}</strong>
              </span>
            </>
          )}
          <span>
            Duration: <strong>{seconds(trial.durationMs)}</strong>
          </span>
          {trial.checks.length > 0 && (
            <span>
              Checks:{' '}
              <strong className={failedChecks > 0 ? 'num-bad' : 'num-good'}>
                {passedChecks}/{trial.checks.length} passed
              </strong>
            </span>
          )}
        </div>
      }
    >
      {trial.error !== undefined && (
        <Notice.Root intent="error">
          <Notice.Title>The trial could not be judged</Notice.Title>
          <Notice.Description>{trial.error}</Notice.Description>
        </Notice.Root>
      )}
      {trial.notRun !== undefined && (
        <Notice.Root intent="info">
          <Notice.Title>Not run</Notice.Title>
          <Notice.Description>{trial.notRun}</Notice.Description>
        </Notice.Root>
      )}
      <Section title="Request sent to the agent">
        <Text variant="body-lg" className="prose">
          {scenario.request}
        </Text>
      </Section>
      {trial.checks.length > 0 && (
        <Section title="Checks" badge={<Badge intent={failedChecks > 0 ? 'high' : 'stable'}>{`${passedChecks}/${trial.checks.length} passed`}</Badge>}>
          <Checks checks={trial.checks} />
        </Section>
      )}
      {trial.site !== undefined && (
        <>
          <Section title="What changed on the site">
            <Changes site={trial.site} />
          </Section>
          <SiteBefore before={trial.site.before} given={scenario.given} />
        </>
      )}
      {transcript !== undefined && (
        <>
          <Section title="Agent's answer">
            <div className="prose">{transcript.answer || 'The agent gave no answer.'}</div>
          </Section>
          <Stack direction="column" gap="sm">
            <Text variant="heading-md" render={<h2 />}>
              {`Tool call timeline (${transcript.toolCalls.length})`}
            </Text>
            {transcript.toolCalls.length === 0 && <Text className="muted">The agent called no tool.</Text>}
            {transcript.toolCalls.map((call, index) => (
              <Call key={index} call={call} step={index + 1} />
            ))}
          </Stack>
        </>
      )}
      <CollapsibleCard.Root defaultOpen={false}>
        <CollapsibleCard.Header>Scenario expectations &amp; starting content</CollapsibleCard.Header>
        <CollapsibleCard.Content>
          <Expected scenario={scenario} />
        </CollapsibleCard.Content>
      </CollapsibleCard.Root>
      {transcript !== undefined && (
        <CollapsibleCard.Root defaultOpen={false}>
          <CollapsibleCard.Header>Raw transcript JSON</CollapsibleCard.Header>
          <CollapsibleCard.Content>
            <Data value={transcript.raw} />
          </CollapsibleCard.Content>
        </CollapsibleCard.Root>
      )}
    </Frame>
  );
}

export function TrialPage({ id, file }: { id: string; file: string }) {
  const loaded = useJson<TrialFile>(trialUrl(id, file));
  return (
    <Loading loaded={loaded} active="runs" title={file} crumbs={crumbsOf(id)}>
      {(trial) => <Trial id={id} trial={trial} />}
    </Loading>
  );
}
