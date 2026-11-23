// The verdict decides whether a run fails. An expected failure must not fail it, a regression must, and a
// trial that could not be judged must count as neither.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TrialResult } from '../src/results/types.ts';
import { verdictFor } from '../src/runner/verdict.ts';
import type { Scenario, ScenarioState } from '../src/scenarios/types.ts';

const ID = 'core/posts/publish-the-draft';

function trial(agent: string, outcome: string, number: number): TrialResult {
  const error = outcome === 'error' ? { error: 'The agent did not end within 300 seconds.' } : {};
  return { scenarioId: ID, agent, trial: number, pass: outcome === 'pass', checks: [], durationMs: 1000, ...error };
}

function scenario(state: ScenarioState): Scenario {
  return { id: ID, request: 'Publish my draft about the summer sale.', kind: 'write', state, reason: 'Tracked in an issue.', expect: {} };
}

interface Case {
  state: ScenarioState;
  /** What each agent's trials did, in order. */
  trials: Record<string, string[]>;
  outcome: string;
  agents: { agent: string; trials: number; passed: number }[];
}

const CASES: Case[] = [
  { state: 'implemented', trials: { 'claude-code': ['pass', 'pass'] }, outcome: 'pass', agents: [{ agent: 'claude-code', trials: 2, passed: 2 }] },
  {
    state: 'implemented',
    trials: { 'claude-code': ['pass', 'pass'], codex: ['pass', 'fail', 'pass'] },
    outcome: 'fail',
    agents: [
      { agent: 'claude-code', trials: 2, passed: 2 },
      { agent: 'codex', trials: 3, passed: 2 },
    ],
  },
  { state: 'known-defect', trials: { codex: ['fail', 'fail'] }, outcome: 'expected-failure', agents: [{ agent: 'codex', trials: 2, passed: 0 }] },
  { state: 'to-be-implemented', trials: { codex: ['pass', 'pass'] }, outcome: 'unexpected-pass', agents: [{ agent: 'codex', trials: 2, passed: 2 }] },
  { state: 'known-defect', trials: { codex: ['fail', 'error'] }, outcome: 'error', agents: [{ agent: 'codex', trials: 2, passed: 0 }] },
];

for (const { state, trials, outcome, agents } of CASES) {
  const described = Object.entries(trials).map(([agent, results]) => `${agent}'s trials ${results.join(', ')}`);
  test(`a scenario that is ${state}, with ${described.join(' and ')}, gets the verdict ${outcome}`, () => {
    const results = Object.entries(trials).flatMap(([agent, outcomes]) => outcomes.map((result, index) => trial(agent, result, index + 1)));

    assert.deepEqual(verdictFor(scenario(state), results), { scenarioId: ID, state, outcome, agents });
  });
}
