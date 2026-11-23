// Draws the verdict for a scenario from its trials. A scenario passes only when every trial by every agent
// passes; what a failure means depends on the scenario's state. The verdict also keeps each agent's count,
// so one agent failing does not hide that another passed.

import type { TrialResult, Verdict } from '../results/types.ts';
import type { Scenario } from '../scenarios/types.ts';

export function verdictFor(scenario: Scenario, trials: TrialResult[]): Verdict {
  const state = scenario.state ?? 'implemented';
  const agents = [...new Set(trials.map((trial) => trial.agent))].map((agent) => {
    const own = trials.filter((trial) => trial.agent === agent);
    return { agent, trials: own.length, passed: own.filter((trial) => trial.pass).length };
  });
  const verdict = { scenarioId: scenario.id, state, agents };
  // A trial that could not be judged says nothing about the scenario, so it must not count as a failure.
  if (trials.some((trial) => trial.error !== undefined)) return { ...verdict, outcome: 'error' };
  const allPassed = trials.every((trial) => trial.pass);
  if (state === 'implemented') return { ...verdict, outcome: allPassed ? 'pass' : 'fail' };
  return { ...verdict, outcome: allPassed ? 'unexpected-pass' : 'expected-failure' };
}
