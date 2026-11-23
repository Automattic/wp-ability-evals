// What every screen shares: the persistent top navigation bar, page frame with skip link and breadcrumbs,
// badges, methodology disclosure, shared MCP Inspector annotations & findings lists, and data formatting.

import { Badge, Breadcrumb, CollapsibleCard, Notice, Spinner, Stack, Text } from '@wordpress/ui';
import { useEffect, type ReactNode } from 'react';
import type { DefinitionFinding, ToolAnnotations, Verdict, VerdictOutcome } from '../src/results/types.ts';
import { ABILITIES_HREF, INSPECTOR_HREF, OVERVIEW_HREF, RUNS_HREF, STORIES_HREF, type Loaded, type PrimarySection } from './data.ts';
import { findingScope } from './inspector-summary.ts';

type Intent = 'high' | 'medium' | 'low' | 'stable' | 'informational' | 'draft' | 'none';

const OUTCOMES: Record<VerdictOutcome, { label: string; intent: Intent }> = {
  pass: { label: 'Passed', intent: 'stable' },
  fail: { label: 'Failed', intent: 'high' },
  'expected-failure': { label: 'Failed as expected', intent: 'draft' },
  'unexpected-pass': { label: 'Passed unexpectedly', intent: 'informational' },
  error: { label: 'Could not be judged', intent: 'medium' },
};

export const OUTCOME_OPTIONS = Object.entries(OUTCOMES).map(([value, { label }]) => ({ value, label }));

/** How a scenario ended. */
export function OutcomeBadge({ outcome }: { outcome: VerdictOutcome }) {
  const { label, intent } = OUTCOMES[outcome];
  return <Badge intent={intent}>{label}</Badge>;
}

/**
 * How one trial ended: `passed`, `failed`, `error` for a trial that could not be judged, or `not-run` for one
 * that waits for an ability the site does not have yet.
 */
export type TrialOutcome = 'passed' | 'failed' | 'error' | 'not-run';

const TRIAL_OUTCOMES: Record<TrialOutcome, { label: string; intent: Intent }> = {
  passed: { label: 'Passed', intent: 'stable' },
  failed: { label: 'Failed', intent: 'high' },
  error: { label: 'Could not be judged', intent: 'medium' },
  'not-run': { label: 'Not built yet', intent: 'draft' },
};

export const TRIAL_OUTCOME_OPTIONS = Object.entries(TRIAL_OUTCOMES).map(([value, { label }]) => ({ value, label }));

export function trialOutcomeOf({ pass, error, notRun }: { pass: boolean; error?: string; notRun?: string }): TrialOutcome {
  if (error !== undefined) return 'error';
  if (notRun !== undefined) return 'not-run';
  return pass ? 'passed' : 'failed';
}

export function TrialBadge({ outcome }: { outcome: TrialOutcome }) {
  const { label, intent } = TRIAL_OUTCOMES[outcome];
  return <Badge intent={intent}>{label}</Badge>;
}

/** How many scenarios ended each way, as one non-wrapping badge per way that happened. */
export function VerdictCounts({ verdicts }: { verdicts: Verdict[] }) {
  const counted = Object.entries(OUTCOMES)
    .map(([outcome, { label, intent }]) => ({ label, intent, count: verdicts.filter((verdict) => verdict.outcome === outcome).length }))
    .filter(({ count }) => count > 0);
  return (
    <div className="verdict-counts">
      {counted.map(({ label, intent, count }) => (
        <Badge key={label} intent={intent}>{`${count} ${label.toLowerCase()}`}</Badge>
      ))}
    </div>
  );
}

/** A time as this machine writes it, such as `Nov 22, 2026, 7:40 PM`. */
export function when(time: string): string {
  return new Date(time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Short date without time, such as `22 Nov 2026`. */
export function day(time: string | undefined): string {
  return time === undefined ? '' : new Date(time).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** When the run in the folder `id` started. The folder is named after that time, with `-` where a time has `:`. */
export function whenOfRun(id: string): string {
  const time = new Date(id.replace(/T(\d\d)-(\d\d)-(\d\d)Z$/, 'T$1:$2:$3Z'));
  return Number.isNaN(time.getTime()) ? id : when(time.toISOString());
}

export function seconds(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs} ms`;
  if (durationMs < 60_000) return `${Math.round(durationMs / 1000)} s`;
  const mins = Math.floor(durationMs / 60_000);
  const secs = Math.round((durationMs % 60_000) / 1000);
  return secs === 0 ? `${mins}m` : `${mins}m ${secs}s`;
}

export function percent(part: number, whole: number): string {
  return whole === 0 ? '0%' : `${Math.round((part / whole) * 100)}%`;
}

export function counted(count: number, word: string, plural = `${word}s`): string {
  return `${count} ${count === 1 ? word : plural}`;
}

export interface Crumb {
  label: string;
  href: string;
}

const NAV_ITEMS: { section: PrimarySection; label: string; href: string }[] = [
  { section: 'overview', label: 'Overview', href: OVERVIEW_HREF },
  { section: 'stories', label: 'Stories', href: STORIES_HREF },
  { section: 'abilities', label: 'Abilities', href: ABILITIES_HREF },
  { section: 'inspector', label: 'MCP Inspector', href: INSPECTOR_HREF },
  { section: 'runs', label: 'Runs', href: RUNS_HREF },
];

/** Persistent single-row navigation bar using native links in Tab order and `aria-current="page"`. */
function TopBar({ active }: { active: PrimarySection }) {
  return (
    <header className="top-bar">
      <div className="top-bar-inner">
        <a className="brand" href={OVERVIEW_HREF}>
          <span className="brand-dot" aria-hidden="true" />
          <span className="brand-name">WP Ability Evals</span>
        </a>
        <nav className="primary-nav" aria-label="Primary">
          <ul className="nav-list">
            {NAV_ITEMS.map(({ section, label, href }) => (
              <li key={section}>
                <a className="nav-link" href={href} aria-current={active === section ? 'page' : undefined}>
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}

/** The frame of every screen: skip link, persistent top navigation bar, breadcrumbs, heading, and main content. */
export function Frame({
  active = 'overview',
  crumbs,
  title,
  badges,
  subtitle,
  children,
}: {
  active?: PrimarySection;
  crumbs: Crumb[];
  title: string;
  badges?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    document.title = `${title} · WP Ability Evals`;
  }, [title]);
  return (
    <div className="shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <TopBar active={active} />
      <main id="main-content" className="frame">
        <Stack direction="column" gap="xl">
          <Stack direction="column" gap="sm" className="page-head">
            {crumbs.length > 0 && (
              <Breadcrumb.Root aria-label="Breadcrumb">
                {crumbs.map(({ label, href }) => (
                  <Breadcrumb.LinkItem key={href} href={href}>
                    {label}
                  </Breadcrumb.LinkItem>
                ))}
                <Breadcrumb.CurrentItem>{title}</Breadcrumb.CurrentItem>
              </Breadcrumb.Root>
            )}
            <Stack direction="row" gap="md" align="center" wrap="wrap">
              <Text variant="heading-xl" render={<h1 id="page-heading" tabIndex={-1} />}>
                {title}
              </Text>
              {badges}
            </Stack>
            {subtitle}
          </Stack>
          {children}
        </Stack>
      </main>
    </div>
  );
}

/** What a screen shows while its data loads, when it did not load, and when it is there. */
export function Loading<T>({
  loaded,
  active = 'overview',
  title,
  crumbs,
  children,
}: {
  loaded: Loaded<T>;
  active?: PrimarySection;
  title: string;
  crumbs: Crumb[];
  children: (data: T) => ReactNode;
}) {
  if (loaded.state === 'ready') return children(loaded.data);
  return (
    <Frame active={active} crumbs={crumbs} title={title}>
      {loaded.state === 'loading' ? (
        <Spinner />
      ) : (
        <Notice.Root intent="error">
          <Notice.Title>This could not be loaded</Notice.Title>
          <Notice.Description>{loaded.message}</Notice.Description>
        </Notice.Root>
      )}
    </Frame>
  );
}

/** Collapsible four-stage methodology explainer so non-technical visitors see how evaluations are verified. */
export function MethodologyDisclosure() {
  return (
    <CollapsibleCard.Root defaultOpen={false} className="methodology-card">
      <CollapsibleCard.Header>
        <Stack direction="row" gap="sm" align="center" wrap="wrap">
          <span>How this evaluation works</span>
          <Badge intent="informational">4 verification layers</Badge>
        </Stack>
      </CollapsibleCard.Header>
      <CollapsibleCard.Content>
        <ol className="methodology-steps">
          <li className="methodology-step">
            <span className="step-num" aria-hidden="true">
              1
            </span>
            <div>
              <Text variant="heading-sm" render={<h3 />}>
                MCP Inspector contract audit
              </Text>
              <Text variant="body-sm" className="muted">
                Before any agent runs, <code>@modelcontextprotocol/inspector --strict</code> connects to the site&apos;s MCP server and checks tool registration, descriptions, read/write annotations, and cross-client JSON Schema portability.
              </Text>
            </div>
          </li>
          <li className="methodology-step">
            <span className="step-num" aria-hidden="true">
              2
            </span>
            <div>
              <Text variant="heading-sm" render={<h3 />}>
                Verified WordPress snapshot
              </Text>
              <Text variant="body-sm" className="muted">
                Each trial resets a real WordPress site to a clean snapshot, seeds the scenario&apos;s starting content, and proves the site matches before the agent touches it.
              </Text>
            </div>
          </li>
          <li className="methodology-step">
            <span className="step-num" aria-hidden="true">
              3
            </span>
            <div>
              <Text variant="heading-sm" render={<h3 />}>
                Isolated real AI agents
              </Text>
              <Text variant="body-sm" className="muted">
                Agents run as first-time users in empty folders with only the site&apos;s MCP tools exposed — no personal skills, rules, or other servers — and receive plain-language site-owner requests.
              </Text>
            </div>
          </li>
          <li className="methodology-step">
            <span className="step-num" aria-hidden="true">
              4
            </span>
            <div>
              <Text variant="heading-sm" render={<h3 />}>
                Site-state, ability &amp; cross-family grading
              </Text>
              <Text variant="body-sm" className="muted">
                Results are graded on actual WordPress state diffs (posts, settings, terms, users, media), expected/forbidden ability contracts, exact answer facts, and cross-family LLM judges for nuanced rubrics.
              </Text>
            </div>
          </li>
        </ol>
      </CollapsibleCard.Content>
    </CollapsibleCard.Root>
  );
}

/** Semantic pills for MCP tool annotations returned by Inspector (`tools/list`). */
export function AnnotationBadges({ annotations, fallbackKind }: { annotations?: ToolAnnotations; fallbackKind?: 'read' | 'write' }) {
  if (annotations === undefined) {
    if (fallbackKind === undefined) return <Badge intent="none">no annotations</Badge>;
    return <Badge intent="none">{fallbackKind === 'read' ? 'pack: read' : 'pack: write'}</Badge>;
  }
  const pills: { key: string; label: string; intent: Intent }[] = [];
  if (annotations.readOnlyHint !== undefined) {
    pills.push({ key: 'ro', label: annotations.readOnlyHint ? 'read-only' : 'mutating', intent: annotations.readOnlyHint ? 'stable' : 'informational' });
  }
  if (annotations.destructiveHint === true) {
    pills.push({ key: 'dest', label: 'destructive', intent: 'high' });
  }
  if (annotations.idempotentHint === true) {
    pills.push({ key: 'idem', label: 'idempotent', intent: 'none' });
  }
  if (annotations.openWorldHint === true) {
    pills.push({ key: 'open', label: 'open-world', intent: 'medium' });
  }
  if (pills.length === 0) return <Badge intent="none">no hints set</Badge>;
  return (
    <div className="badge-row">
      {pills.map(({ key, label, intent }) => (
        <Badge key={key} intent={intent}>
          {label}
        </Badge>
      ))}
    </div>
  );
}

/** Shared list of MCP Inspector / definition findings, showing severity, scope, path, issue, and fix. */
export function DefinitionList({ findings, showAbility = false }: { findings: DefinitionFinding[]; showAbility?: boolean }) {
  return (
    <ul className="definition-findings" role="list">
      {findings.map((finding, index) => {
        const scope = findingScope(finding);
        return (
          <li key={`${finding.ability}-${finding.rule}-${finding.path}-${index}`} className="definition-finding">
            <Stack direction="row" gap="xs" align="center" wrap="wrap">
              <Badge intent={finding.severity === 'error' ? 'high' : 'medium'}>{finding.severity}</Badge>
              <Badge intent={scope === 'input' ? 'informational' : 'none'}>{scope === 'input' ? 'input schema' : scope === 'output' ? 'output schema' : 'metadata'}</Badge>
              {showAbility && <code className="ability-name">{finding.ability}</code>}
              <code>{finding.path}</code>
              <span className="muted">{finding.rule}</span>
            </Stack>
            <Text variant="body-sm">{finding.issue}</Text>
            {finding.suggestion !== '' && (
              <Text variant="body-sm" className="muted">
                {finding.suggestion}
              </Text>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** A value shown as data: text as it is, anything else as indented JSON. Text that is JSON is indented too. */
export function Data({ value }: { value: unknown }) {
  let shown = value;
  if (typeof value === 'string') {
    try {
      shown = JSON.parse(value);
    } catch {
      shown = value;
    }
  }
  return <pre className="data">{typeof shown === 'string' ? shown : JSON.stringify(shown, null, 2)}</pre>;
}
