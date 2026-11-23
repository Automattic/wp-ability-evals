// Checks on which abilities the agent ran, and with which arguments, read from the tool calls in its
// transcript. Which ability a tool call ran, and where the ability's input is, depends on how the site's MCP
// server presents abilities, so that is decided in one place here.
//
// Neither the order of the calls nor their number is checked: an agent may take another valid path than the
// one the scenario's author expected, and a check on its steps would fail it. A call that came
// back with an error changed nothing, so only the checks that say an ability must not even be tried count it:
// `forbidden` and a `none` scenario. Agents try whatever might do what was asked, and a refused try followed by
// the truth is a correct run.

import type { ToolCall } from '../agents/types.ts';
import { isRecord } from '../files/shape.ts';
import { type LookupTools, toolOf } from '../mcp-server.ts';
import type { Pack } from '../packs/types.ts';
import { abilityOf, argumentsOf } from '../scenarios/abilities.ts';
import type { ExpectedArguments } from '../scenarios/types.ts';
import { same } from './site.ts';
import type { Check, CheckInput } from './types.ts';

/** One time the agent ran an ability, or tried to. */
interface AbilityRun {
  ability: string;
  failed: boolean;
  /** The arguments it ran with: the ability's input, by name. None for an input that is no mapping. */
  arguments: Record<string, unknown>;
}

/** The abilities a run may execute on the site, and those among them that change it. */
function abilitiesOf(packs: Pack[]): { known: string[]; writes: string[] } {
  const writes = packs.flatMap((pack) => pack.abilities.writes);
  return { known: [...packs.flatMap((pack) => pack.abilities.reads), ...writes], writes };
}

/**
 * The ability a call to one of the site server's tools ran, with the ability's input, or undefined for a tool
 * that only finds or describes abilities. A tool that runs any ability names the ability in one argument and
 * holds its input in another, and each such tool says which of its arguments they are. A tool that is no
 * lookup tool is an ability of its own, and its input is the ability's. One that belongs to no ability of the
 * site's packs is given its own name, so it shows as an ability that no pack has.
 */
export function ranBy(call: ToolCall, lookup: LookupTools | undefined, known: string[]): { ability: string; input: unknown } | undefined {
  if (lookup !== undefined) {
    if (lookup.otherTools.includes(call.tool)) return undefined;
    const runTool = lookup.runTools.find((one) => one.tool === call.tool);
    if (runTool !== undefined) {
      if (!isRecord(call.input)) return { ability: 'an ability without a name', input: undefined };
      return { ability: String(call.input[runTool.nameArgument]), input: call.input[runTool.inputArgument] };
    }
  }
  return { ability: known.find((ability) => toolOf(ability) === call.tool) ?? call.tool, input: call.input };
}

/** Every time the agent ran an ability through the site's server, in order. Looking abilities up runs none. */
function abilityRuns({ transcript, server, packs }: CheckInput): AbilityRun[] {
  const { known } = abilitiesOf(packs);
  return transcript.toolCalls
    .filter((call) => call.server === server.name)
    .flatMap((call) => {
      const ran = ranBy(call, server.lookup, known);
      return ran === undefined ? [] : [{ ability: ran.ability, failed: call.isError, arguments: isRecord(ran.input) ? ran.input : {} }];
    });
}

function listed(runs: AbilityRun[]): string {
  return [...new Set(runs.map((run) => (run.failed ? `${run.ability} (failed)` : run.ability)))].join(', ');
}

/** The values an expected argument may have: a list means one of its values. */
function allowed(expected: ExpectedArguments[string]): unknown[] {
  return Array.isArray(expected) ? expected : [expected];
}

/** Whether the run had every expected argument. A value is compared as the site check compares a field's: a number matches its text. */
function ranWith(run: AbilityRun, expected: ExpectedArguments): boolean {
  return Object.entries(expected).every(([name, value]) => allowed(value).some((one) => same(one, run.arguments[name])));
}

/** The arguments a scenario expects, as a reason names them: `status "publish", action "list" or "get_settings"`. */
function described(expected: ExpectedArguments): string {
  const each = Object.entries(expected).map(([name, value]) => `${name} ${allowed(value).map((one) => JSON.stringify(one)).join(' or ')}`);
  return each.join(', ');
}

/** What a run had for the arguments a scenario names, as a reason names it: `status "draft", no author (failed)`. */
function found(run: AbilityRun, names: string[]): string {
  const each = names.map((name) => (Object.hasOwn(run.arguments, name) ? `${name} ${JSON.stringify(run.arguments[name])}` : `no ${name}`));
  return `${each.join(', ')}${run.failed ? ' (failed)' : ''}`;
}

/** The agent used no MCP server other than the site's. The agent's own tools belong to no server. */
export const onlyTheSiteServer: Check = ({ transcript, server }) => {
  const others = [...new Set(transcript.toolCalls.flatMap((call) => (call.server === null || call.server === server.name ? [] : [call.server])))];
  const reason = others.length === 0 ? "The agent used no MCP server but the site's" : `The agent used other MCP servers: ${others.join(', ')}`;
  return { check: 'site-server', pass: others.length === 0, reason };
};

/** Every ability the agent ran without an error is listed in a pack on the site. A guess at one the site lacks, which it refused, is no mistake. */
export const onlyKnownAbilities: Check = (input) => {
  const { known } = abilitiesOf(input.packs);
  const unknown = abilityRuns(input).filter((run) => !run.failed && !known.includes(run.ability));
  const reason = unknown.length === 0 ? 'Every ability that ran is in a pack of the site' : `Abilities that are in no pack of the site: ${listed(unknown)}`;
  return { check: 'known-abilities', pass: unknown.length === 0, reason };
};

/** The agent ran no ability that changes the site without an error. For `read` scenarios. A write the site refused changed nothing. */
export const noWrites: Check = (input) => {
  const { writes } = abilitiesOf(input.packs);
  const ran = abilityRuns(input).filter((run) => !run.failed && writes.includes(run.ability));
  const reason = ran.length === 0 ? 'No ability that changes the site ran' : `Abilities that change the site ran: ${listed(ran)}`;
  return { check: 'no-writes', pass: ran.length === 0, reason };
};

/** The agent ran no ability at all, not even one that failed. For `none` scenarios. Looking up what the site offers is allowed. */
export const noAbilities: Check = (input) => {
  const ran = abilityRuns(input);
  return { check: 'no-abilities', pass: ran.length === 0, reason: ran.length === 0 ? 'No ability ran' : `Abilities ran: ${listed(ran)}` };
};

/** The agent ran no ability that the scenario forbids, not even one that failed. */
export const noForbiddenAbilities: Check = (input) => {
  const forbidden = input.scenario.expect.forbidden ?? [];
  const ran = abilityRuns(input).filter((run) => forbidden.includes(run.ability));
  const reason = ran.length === 0 ? 'No forbidden ability ran' : `Forbidden abilities ran: ${listed(ran)}`;
  return { check: 'forbidden-abilities', pass: ran.length === 0, reason };
};

/**
 * Each ability the scenario expects ran at least once without an error, in one call with every argument the
 * scenario names for it. Other arguments are free, and other abilities may run too.
 *
 * An ability that ran, but never as expected, is named with what each of its runs had for the expected
 * arguments. One that has no arguments to compare, or that did not run at all, is listed with every ability that ran.
 */
export const ranExpectedAbilities: Check = (input) => {
  const runs = abilityRuns(input);
  const problems: string[] = [];
  const missing = new Set<string>();
  for (const entry of input.scenario.expect.abilities ?? []) {
    const ability = abilityOf(entry);
    const expected = argumentsOf(entry);
    const ofAbility = runs.filter((run) => run.ability === ability);
    if (ofAbility.some((run) => !run.failed && ranWith(run, expected))) continue;
    const names = Object.keys(expected);
    if (names.length === 0 || ofAbility.length === 0) {
      missing.add(ability);
    } else {
      const ranWithOthers = [...new Set(ofAbility.map((run) => found(run, names)))].join('; ');
      problems.push(`${ability} did not run without an error with ${described(expected)}: it ran with ${ranWithOthers}`);
    }
  }
  if (missing.size > 0) problems.push(`Expected abilities that did not run without an error: ${[...missing].join(', ')}. Ran: ${listed(runs) || 'none'}`);
  return { check: 'expected-abilities', pass: problems.length === 0, reason: problems.length === 0 ? 'Every expected ability ran' : problems.join('. ') };
};
