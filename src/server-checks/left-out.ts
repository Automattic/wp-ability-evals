// Which scenarios a run leaves out after the server checks, and why. A finding never stops a run: it leaves out
// only the scenarios it concerns, so one missing ability out of hundreds costs only the scenarios that name it.
// It is plain code, so that what it decides is tested with plain values.

import { abilityOf } from '../scenarios/abilities.ts';
import type { Scenario } from '../scenarios/types.ts';
import type { ServerFindings } from './types.ts';

/**
 * Why no agent runs a scenario. `error`: it can't be judged on this site, and its trials are "could not be
 * judged". `not-built`: it is `to-be-implemented` and waits for an ability the site does not have yet, so its
 * trials fail as the scenario expects.
 */
export interface LeftOut {
  as: 'error' | 'not-built';
  reason: string;
}

function named(abilities: string[]): string {
  return abilities.length === 1 ? (abilities[0] ?? '') : `${abilities.slice(0, -1).join(', ')} and ${abilities.at(-1)}`;
}

/**
 * The missing abilities that are not built yet: some scenario names each, and every scenario that names it is
 * `to-be-implemented`. The site is expected to lack them, so they are no mistake of the pack or the site.
 */
export function abilitiesNotBuilt(missing: string[], scenarios: Scenario[]): string[] {
  return missing.filter((ability) => {
    const naming = scenarios.filter((scenario) => (scenario.expect.abilities ?? []).some((entry) => abilityOf(entry) === ability));
    return naming.length > 0 && naming.every((scenario) => scenario.state === 'to-be-implemented');
  });
}

/** The scenarios that no agent runs, by id, with why. Every other scenario runs. */
export function scenariosLeftOut(scenarios: Scenario[], findings: ServerFindings): Map<string, LeftOut> {
  const leftOut = new Map<string, LeftOut>();
  if (findings.outcome === 'unreadable') {
    for (const scenario of scenarios) leftOut.set(scenario.id, { as: 'error', reason: findings.reason });
    return leftOut;
  }
  if (findings.outcome === 'behind-lookup') return leftOut;
  const missing = new Set(findings.missing);
  for (const scenario of scenarios) {
    const lacking = (scenario.expect.abilities ?? []).map(abilityOf).filter((ability) => missing.has(ability));
    if (lacking.length === 0) continue;
    leftOut.set(
      scenario.id,
      scenario.state === 'to-be-implemented'
        ? { as: 'not-built', reason: `Not built yet: the site's MCP server has no tool for ${named(lacking)}, which this scenario waits for, so no agent ran. Once the site has it, the scenario runs.` }
        : {
            as: 'error',
            reason: `The site's MCP server has no tool for ${named(lacking)}, which this scenario names, so it can't be judged on this site and no agent ran. Check the name in pack.yaml, and that the site registers the ability and makes it public for MCP.`,
          },
    );
  }
  return leftOut;
}
