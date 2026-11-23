// Decides which checks a scenario gets. A scenario never names a check: its kind and its expectations do.
// - every scenario: the site check, only the site's MCP server, only abilities a pack lists ran without an error
// - kind `read`: no ability that changes the site ran without an error
// - kind `none`: no ability ran at all, not even one that failed
// - `expect.abilities`: each expected ability ran without an error, with the arguments named for it
// - `expect.forbidden`: no forbidden ability ran, not even with an error
// - `expect.answer.contains`: the answer contains every text
// - `expect.answer.rubric`: the agent's judge finds that the answer meets the rubric

import type { Scenario } from '../scenarios/types.ts';
import { noAbilities, noForbiddenAbilities, noWrites, onlyKnownAbilities, onlyTheSiteServer, ranExpectedAbilities } from './abilities.ts';
import { answerContains, answerMeetsRubric } from './answer.ts';
import { siteChangedAsExpected } from './site.ts';
import type { Check } from './types.ts';

/** The checks for a scenario. */
export function checksFor(scenario: Scenario): Check[] {
  const { abilities, forbidden, answer } = scenario.expect;
  const checks: Check[] = [siteChangedAsExpected, onlyTheSiteServer, onlyKnownAbilities];
  if (scenario.kind === 'read') checks.push(noWrites);
  if (scenario.kind === 'none') checks.push(noAbilities);
  if (abilities !== undefined) checks.push(ranExpectedAbilities);
  if (forbidden !== undefined) checks.push(noForbiddenAbilities);
  if (answer?.contains !== undefined) checks.push(answerContains);
  if (answer?.rubric !== undefined) checks.push(answerMeetsRubric);
  return checks;
}
