// Plain-English site-owner stories and the concrete scenarios derived from them, grouped by pack. Bridges
// non-technical readers (what real tasks are being tested) directly to per-agent verdicts and individual trials.

import { Badge, Card, Link, Stack, Text } from '@wordpress/ui';
import { useMemo, useState } from 'react';
import type { GradingLayer, Overview, StoryOverview, StoryScenario, TrialLink } from '../src/results/types.ts';
import { OVERVIEW_URL, packStoriesHref, runHref, STORIES_HREF, trialHref, useJson } from './data.ts';
import { Frame, Loading, OutcomeBadge, counted, when } from './parts.tsx';

const GRADING_LABELS: Record<GradingLayer, string> = {
  site: 'site state',
  abilities: 'abilities',
  forbidden: 'forbidden check',
  contains: 'exact text',
  rubric: 'judge rubric',
};

type OutcomeFilter = 'all' | 'pass' | 'fail' | 'other';
type KindFilter = 'all' | 'read' | 'write' | 'none';

function matchesOutcome(scenario: StoryScenario, filter: OutcomeFilter): boolean {
  if (filter === 'all') return true;
  const outcome = scenario.latest?.outcome;
  if (filter === 'pass') return outcome === 'pass' || outcome === 'unexpected-pass';
  if (filter === 'fail') return outcome === 'fail';
  return outcome !== 'pass' && outcome !== 'unexpected-pass' && outcome !== 'fail';
}

/** Splits a story's paragraphs cleanly and highlights standard "On the site / Should happen / Must not happen" prefixes. */
function StoryProse({ text }: { text: string }) {
  const lines = text
    .trim()
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  return (
    <div className="story-prose">
      {lines.map((line, index) => {
        const match = /^(On the site|Should happen|Must not happen):\s*(.*)$/i.exec(line);
        if (match !== null) {
          return (
            <p key={index} className="story-clause">
              <strong>{match[1]}:</strong> {match[2]}
            </p>
          );
        }
        return (
          <p key={index} className="story-lead">
            {line}
          </p>
        );
      })}
    </div>
  );
}

/** Per-agent clickable links: opens the single trial directly when there is 1 trial, or the run when multiple. */
function AgentTrialPills({ runId, agents, trials }: { runId: string; agents: { agent: string; passed: number; trials: number }[]; trials: TrialLink[] }) {
  return (
    <div className="agent-pills">
      {agents.map(({ agent, passed, trials: total }) => {
        const agentTrials = trials.filter((one) => one.agent === agent);
        const firstFailed = agentTrials.find((one) => !one.pass);
        const targetHref =
          firstFailed !== undefined
            ? trialHref(runId, firstFailed.file)
            : agentTrials.length === 1 && agentTrials[0] !== undefined
              ? trialHref(runId, agentTrials[0].file)
              : runHref(runId);
        const allPass = total > 0 && passed === total;
        return (
          <a key={agent} href={targetHref} className={`agent-pill ${allPass ? 'agent-pill-pass' : 'agent-pill-fail'}`}>
            <span>{agent}</span>
            <strong>{`${passed}/${total}`}</strong>
          </a>
        );
      })}
    </div>
  );
}

function StoryCard({ story }: { story: StoryOverview }) {
  const passedCount = story.scenarios.filter(({ latest }) => latest?.outcome === 'pass' || latest?.outcome === 'unexpected-pass').length;
  const failedCount = story.scenarios.filter(({ latest }) => latest?.outcome === 'fail').length;
  return (
    <Card.Root className="story-card">
      <Card.Header>
        <Stack direction="row" gap="sm" align="center" justify="space-between" wrap="wrap" style={{ width: '100%' }}>
          <Stack direction="row" gap="sm" align="center" wrap="wrap">
            <Badge intent="none">{story.packTitle}</Badge>
            <Card.Title>{story.file}</Card.Title>
          </Stack>
          <Stack direction="row" gap="xs" align="center" wrap="wrap">
            <Badge intent="stable">{`${passedCount}/${story.scenarios.length} passing`}</Badge>
            {failedCount > 0 && <Badge intent="high">{`${failedCount} failed`}</Badge>}
          </Stack>
        </Stack>
      </Card.Header>
      <Card.Content>
        <Stack direction="column" gap="lg">
          <StoryProse text={story.text} />
          {story.scenarios.length === 0 ? (
            <Text variant="body-sm" className="muted">
              No scenarios have been written from this story yet.
            </Text>
          ) : (
            <ul className="story-scenarios" role="list">
              {story.scenarios.map((scenario) => {
                const failedTrials = (scenario.latest?.trials ?? []).filter((trial) => !trial.pass && trial.reason !== undefined);
                return (
                  <li key={scenario.id} className="story-scenario-row">
                    <Stack direction="row" gap="sm" align="center" justify="space-between" wrap="wrap">
                      <Stack direction="row" gap="xs" align="center" wrap="wrap">
                        {scenario.latest === undefined ? <Badge intent="none">Not run yet</Badge> : <OutcomeBadge outcome={scenario.latest.outcome} />}
                        <code>{scenario.id}</code>
                        <Badge intent="none">{scenario.kind === 'read' ? 'reads site' : scenario.kind === 'write' ? 'changes site' : 'no tools'}</Badge>
                        {scenario.state !== 'implemented' && <Badge intent="draft">{scenario.state}</Badge>}
                      </Stack>
                      {scenario.latest !== undefined && (
                        <Stack direction="row" gap="sm" align="center" wrap="wrap">
                          <AgentTrialPills runId={scenario.latest.runId} agents={scenario.latest.agents} trials={scenario.latest.trials} />
                          <Link href={runHref(scenario.latest.runId)}>{when(scenario.latest.startedAt)}</Link>
                        </Stack>
                      )}
                    </Stack>
                    <Text variant="body-md" className="story-request prose">
                      “{scenario.request}”
                    </Text>
                    <div className="scenario-meta-row">
                      {scenario.grading.map((layer) => (
                        <span key={layer} className="meta-tag">
                          {GRADING_LABELS[layer]}
                        </span>
                      ))}
                      {scenario.expectedAbilities.map((ability) => (
                        <code key={ability} className="meta-code">
                          {ability}
                        </code>
                      ))}
                    </div>
                    {failedTrials.length > 0 && (
                      <div className="story-failures">
                        {failedTrials.map((trial) => (
                          <div key={trial.file} className="failed-trial-inline">
                            <Link href={trialHref(scenario.latest?.runId ?? '', trial.file)}>{`${trial.agent} trial ${trial.trial}`}</Link>
                            <span className="muted">{trial.reason}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Stack>
      </Card.Content>
    </Card.Root>
  );
}

function StoriesContent({ overview, pack }: { overview: Overview; pack?: string }) {
  const [outcome, setOutcome] = useState<OutcomeFilter>('all');
  const [kind, setKind] = useState<KindFilter>('all');
  const [query, setQuery] = useState('');

  const filteredStories = useMemo(() => {
    const q = query.trim().toLowerCase();
    return overview.stories
      .filter((story) => pack === undefined || story.pack === pack)
      .map((story) => {
        const storyMatchesText = q === '' || story.text.toLowerCase().includes(q) || story.file.toLowerCase().includes(q);
        const scenarios = story.scenarios.filter((scenario) => {
          if (!matchesOutcome(scenario, outcome)) return false;
          if (kind !== 'all' && scenario.kind !== kind) return false;
          if (q === '' || storyMatchesText) return true;
          return (
            scenario.id.toLowerCase().includes(q) ||
            scenario.request.toLowerCase().includes(q) ||
            scenario.expectedAbilities.some((ability) => ability.toLowerCase().includes(q))
          );
        });
        return { ...story, scenarios };
      })
      .filter((story) => story.scenarios.length > 0 || (outcome === 'all' && kind === 'all' && (q === '' || story.text.toLowerCase().includes(q))));
  }, [overview.stories, pack, outcome, kind, query]);

  const shownScenarios = filteredStories.reduce((sum, story) => sum + story.scenarios.length, 0);

  return (
    <Frame
      active="stories"
      crumbs={[]}
      title="Stories & scenarios"
      subtitle={
        <Text variant="body-sm" className="muted">
          Every evaluation starts as a plain-English site-owner story. Showing {counted(filteredStories.length, 'story', 'stories')} and {counted(shownScenarios, 'scenario')} ({overview.scenarioSummary.passed}/{overview.scenarioSummary.total} passing overall).
        </Text>
      }
    >
      <Card.Root>
        <Card.Content>
          <Stack direction="column" gap="md">
            <div className="filter-row">
              <div className="pill-group" role="group" aria-label="Filter by pack">
                <a href={STORIES_HREF} className="pill-link" aria-current={pack === undefined ? 'true' : undefined}>
                  {`All packs (${overview.scenarioSummary.total})`}
                </a>
                {overview.packs.map((item) => (
                  <a key={item.name} href={packStoriesHref(item.name)} className="pill-link" aria-current={pack === item.name ? 'true' : undefined}>
                    {`${item.title} (${item.scenarios.passed}/${item.scenarios.total})`}
                  </a>
                ))}
              </div>
            </div>
            <div className="filter-row">
              <div className="pill-group" role="group" aria-label="Filter by verdict">
                {(
                  [
                    ['all', 'All verdicts'],
                    ['fail', `Failed (${overview.scenarioSummary.failed})`],
                    ['pass', `Passing (${overview.scenarioSummary.passed})`],
                    ['other', 'Waiting / other'],
                  ] as const
                ).map(([value, label]) => (
                  <button key={value} type="button" className="pill-button" aria-pressed={outcome === value} onClick={() => setOutcome(value)}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="pill-group" role="group" aria-label="Filter by kind">
                {(
                  [
                    ['all', 'All kinds'],
                    ['read', 'Reads site'],
                    ['write', 'Changes site'],
                  ] as const
                ).map(([value, label]) => (
                  <button key={value} type="button" className="pill-button" aria-pressed={kind === value} onClick={() => setKind(value)}>
                    {label}
                  </button>
                ))}
              </div>
              <label className="search-field" htmlFor="story-search">
                <span className="visually-hidden">Search stories and scenarios</span>
                <input
                  id="story-search"
                  type="search"
                  className="search-input"
                  placeholder="Search stories, requests, abilities…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
            </div>
          </Stack>
        </Card.Content>
      </Card.Root>

      {filteredStories.length === 0 ? (
        <Card.Root>
          <Card.Content>
            <Text className="muted">No stories or scenarios match the active filters.</Text>
          </Card.Content>
        </Card.Root>
      ) : (
        <Stack direction="column" gap="lg">
          {filteredStories.map((story) => (
            <StoryCard key={`${story.pack}/${story.file}`} story={story} />
          ))}
        </Stack>
      )}
    </Frame>
  );
}

export function StoriesPage({ pack }: { pack?: string }) {
  const loaded = useJson<Overview>(OVERVIEW_URL);
  return (
    <Loading loaded={loaded} active="stories" title="Stories & scenarios" crumbs={[]}>
      {(overview) => <StoriesContent overview={overview} pack={pack} />}
    </Loading>
  );
}
