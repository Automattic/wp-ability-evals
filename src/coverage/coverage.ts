// Computes each listed ability's coverage, and the Overview built from it, from plain values: the packs, each
// scenario's latest result and the abilities the server checks found missing. `validate` uses it for its note
// and the viewer's server for the Overview, so both count the same way.

import type { ToolCall } from '../agents/types.ts';
import { ranBy } from '../checks/abilities.ts';
import type { Pack } from '../packs/types.ts';
import { selectServerAudit } from '../results/merge.ts';
import { ranOn } from '../results/models.ts';
import type {
  AbilityCoverage,
  AgentSummary,
  CoverageGroup,
  CoverageSummary,
  DefinitionFinding,
  ErroredCall,
  FailingScenario,
  GradingLayer,
  JudgeModel,
  ModelsBehind,
  Overview,
  RanOn,
  RunListing,
  ScenarioCoverage,
  ScenarioSummary,
  StoryOverview,
  StoryScenario,
  TrendPoint,
  TrialLink,
} from '../results/types.ts';
import { abilityOf } from '../scenarios/abilities.ts';
import type { Scenario } from '../scenarios/types.ts';
import { listedAbilities } from '../server-checks/compare.ts';
import { abilitiesNotBuilt } from '../server-checks/left-out.ts';
import type { LatestResult, LatestTrial } from './types.ts';

// How many error answers an ability keeps, and how much of each: enough to see what went wrong.
const ERRORS_KEPT = 5;
const ERROR_LENGTH = 300;
const NEEDS_ATTENTION = 10;
const GROUPS: CoverageGroup[] = ['passing', 'in-failing-scenario', 'known-defect-or-not-built', 'no-result-yet', 'not-tested', 'missing-from-site'];
// Words an ability's name starts with that say what it does rather than what it is about.
const VERBS = new Set(['get', 'list', 'find', 'search', 'query', 'read', 'create', 'add', 'update', 'set', 'edit', 'delete', 'remove', 'publish', 'run', 'send', 'start', 'stop', 'manage']);

export interface CoverageInput {
  packs: Pack[];
  /** Each scenario's latest result, by the scenario's id. A scenario that no saved run has is not in it. */
  latest: Map<string, LatestResult>;
  /** The abilities the latest server checks found missing from the site. */
  missing: string[];
  /** Problems the latest server checks found in the listed abilities' MCP tool definitions. */
  definitionFindings?: DefinitionFinding[];
}

export interface OverviewInput {
  packs: Pack[];
  /** The saved runs, the newest first. */
  runs: RunListing[];
  /** Each scenario's latest result, with the tool calls of its trials. */
  latest: Map<string, LatestResult>;
}

/** What the calls of one scenario's latest trials did with one ability. */
interface CallTally {
  calls: number;
  errored: number;
  errors: string[];
  erroredCalls: ErroredCall[];
  ranIn: boolean;
}

/** The calls to the site's server in a result's trials, by the ability each ran, with the checks' own rule. */
function callsByAbility(result: LatestResult, known: string[]): Map<string, CallTally> {
  const tallies = new Map<string, CallTally>();
  for (const trial of result.trials) {
    // A run saved before the server was saved says nothing of its name: then every MCP server's call counts.
    const onSite = (call: ToolCall): boolean => (result.mcpServer === undefined ? call.server !== null : call.server === result.mcpServer.name);
    for (const call of trial.toolCalls.filter(onSite)) {
      const ran = ranBy(call, result.mcpServer?.lookup, known);
      if (ran === undefined) continue;
      const tally = tallies.get(ran.ability) ?? { calls: 0, errored: 0, errors: [], erroredCalls: [], ranIn: false };
      tally.calls += 1;
      if (call.isError) {
        tally.errored += 1;
        if (tally.errors.length < ERRORS_KEPT) {
          const output = call.output.slice(0, ERROR_LENGTH);
          tally.errors.push(output);
          tally.erroredCalls.push({
            scenarioId: result.verdict.scenarioId,
            runId: result.runId,
            agent: trial.agent,
            trial: trial.trial ?? 1,
            ...(trial.file === undefined ? {} : { file: trial.file }),
            tool: call.tool,
            input: ran.input,
            output,
          });
        }
      } else if (trial.pass) {
        tally.ranIn = true;
      }
      tallies.set(ran.ability, tally);
    }
  }
  return tallies;
}

/** The abilities a scenario names in `expect.abilities`. */
function namedBy(scenario: Scenario): Set<string> {
  return new Set((scenario.expect.abilities ?? []).map(abilityOf));
}

/** What an ability is about: the first word of its name after the namespace, or the second when the first is a verb. */
function areaOf(ability: string): string {
  const words = (ability.split('/').at(-1) ?? ability).split('-');
  return VERBS.has(words[0] ?? '') && words.length > 1 ? (words[1] as string) : (words[0] ?? ability);
}

function groupOf(coverage: Omit<AbilityCoverage, 'group'>, missing: boolean, notBuilt: boolean): CoverageGroup {
  if (missing && !notBuilt) return 'missing-from-site';
  if (coverage.scenarios === 0) return 'not-tested';
  if (coverage.failed > 0) return 'in-failing-scenario';
  if (notBuilt || coverage.knownDefect + coverage.notBuilt > 0) return 'known-defect-or-not-built';
  if (coverage.passed === 0) return 'no-result-yet';
  return 'passing';
}

/** The coverage of every ability the packs list, in the packs' order. */
export function coverageOf({ packs, latest, missing, definitionFindings = [] }: CoverageInput): AbilityCoverage[] {
  const known = listedAbilities(packs);
  const scenarios = packs.flatMap((pack) => pack.scenarios);
  const notBuilt = new Set(abilitiesNotBuilt(missing, scenarios));
  const missingSet = new Set(missing);
  const findingsByAbility = new Map<string, DefinitionFinding[]>();
  for (const finding of definitionFindings) findingsByAbility.set(finding.ability, [...(findingsByAbility.get(finding.ability) ?? []), finding]);
  const named = scenarios.map(namedBy);
  const calls = scenarios.map((scenario) => (latest.has(scenario.id) ? callsByAbility(latest.get(scenario.id) as LatestResult, known) : new Map<string, CallTally>()));
  // The scenarios each ability appears in, by their place in the packs' order: those that name it, and those
  // whose trials called it. Every other scenario adds nothing to it, and with hundreds of abilities and
  // scenarios, and a trend point per run, looking only at these keeps a request fast.
  const relevant = new Map<string, number[]>();
  scenarios.forEach((_, index) => {
    for (const ability of new Set([...(named[index] as Set<string>), ...(calls[index] as Map<string, CallTally>).keys()])) relevant.set(ability, [...(relevant.get(ability) ?? []), index]);
  });

  return packs.flatMap((pack) =>
    [...pack.abilities.reads.map((ability) => ({ ability, kind: 'read' as const })), ...pack.abilities.writes.map((ability) => ({ ability, kind: 'write' as const }))].map(({ ability, kind }) => {
      const results: ScenarioCoverage[] = [];
      let ranIn = 0;
      let callCount = 0;
      let errored = 0;
      const errors: string[] = [];
      const erroredCalls: ErroredCall[] = [];
      for (const index of relevant.get(ability) ?? []) {
        const scenario = scenarios[index] as Scenario;
        const tally = calls[index]?.get(ability);
        callCount += tally?.calls ?? 0;
        errored += tally?.errored ?? 0;
        errors.push(...(tally?.errors ?? []).slice(0, ERRORS_KEPT - errors.length));
        erroredCalls.push(...(tally?.erroredCalls ?? []).slice(0, ERRORS_KEPT - erroredCalls.length));
        if (tally?.ranIn === true) ranIn += 1;
        const isNamed = named[index]?.has(ability) === true;
        if (!isNamed && tally?.ranIn !== true) continue;
        const result = latest.get(scenario.id);
        const trials = result === undefined ? [] : trialLinksOf(result.trials);
        results.push({
          scenarioId: scenario.id,
          request: scenario.request,
          state: scenario.state ?? 'implemented',
          named: isNamed,
          ranIn: tally?.ranIn === true,
          ...(result === undefined
            ? {}
            : {
                latest: {
                  runId: result.runId,
                  startedAt: result.startedAt,
                  outcome: result.verdict.outcome,
                  agents: result.verdict.agents,
                  ...(trials.length === 0 ? {} : { trials }),
                },
              }),
        });
      }
      const naming = results.filter((result) => result.named);
      const ended = (test: (result: ScenarioCoverage) => boolean): number => naming.filter(test).length;
      const abilityFindings = findingsByAbility.get(ability);
      const coverage = {
        ability,
        pack: pack.name,
        area: areaOf(ability),
        kind,
        scenarios: naming.length,
        passed: ended(({ latest: last }) => last?.outcome === 'pass' || last?.outcome === 'unexpected-pass'),
        failed: ended(({ latest: last }) => last?.outcome === 'fail'),
        knownDefect: ended(({ latest: last, state }) => last?.outcome === 'expected-failure' && state !== 'to-be-implemented'),
        notBuilt: ended(({ latest: last, state }) => last?.outcome === 'expected-failure' && state === 'to-be-implemented'),
        notJudged: ended(({ latest: last }) => last?.outcome === 'error'),
        notRunYet: ended(({ latest: last }) => last === undefined),
        ranIn,
        calls: callCount,
        errored,
        errors,
        ...(erroredCalls.length === 0 ? {} : { erroredCalls }),
        ...(abilityFindings === undefined ? {} : { definitionFindings: abilityFindings }),
        results,
      };
      return { ...coverage, group: groupOf(coverage, missingSet.has(ability), notBuilt.has(ability)) };
    }),
  );
}

function summaryOf(abilities: AbilityCoverage[]): CoverageSummary {
  return {
    abilities: abilities.length,
    tested: abilities.filter(({ scenarios }) => scenarios > 0).length,
    groups: Object.fromEntries(GROUPS.map((group) => [group, abilities.filter((ability) => ability.group === group).length])) as Record<CoverageGroup, number>,
  };
}

function scenarioSummaryOf(scenarios: Scenario[], latest: Map<string, LatestResult>): ScenarioSummary {
  const counts: ScenarioSummary = { total: scenarios.length, passed: 0, failed: 0, knownDefect: 0, notBuilt: 0, error: 0, notRunYet: 0 };
  for (const scenario of scenarios) {
    const result = latest.get(scenario.id);
    if (result === undefined) {
      counts.notRunYet += 1;
    } else if (result.verdict.outcome === 'pass' || result.verdict.outcome === 'unexpected-pass') {
      counts.passed += 1;
    } else if (result.verdict.outcome === 'fail') {
      counts.failed += 1;
    } else if (result.verdict.outcome === 'expected-failure') {
      if (scenario.state === 'to-be-implemented') counts.notBuilt += 1;
      else counts.knownDefect += 1;
    } else {
      counts.error += 1;
    }
  }
  return counts;
}

function trialLinksOf(trials: LatestTrial[]): TrialLink[] {
  return trials
    .filter((trial): trial is LatestTrial & { file: string } => trial.file !== undefined)
    .map((trial) => ({
      agent: trial.agent,
      trial: trial.trial ?? 1,
      pass: trial.pass,
      file: trial.file,
      ...(trial.error === undefined ? {} : { error: trial.error }),
      ...(trial.notRun === undefined ? {} : { notRun: trial.notRun }),
      ...(trial.reason === undefined ? {} : { reason: trial.reason }),
    }));
}

function agentSummariesOf(results: LatestResult[]): AgentSummary[] {
  const byAgent = new Map<string, AgentSummary>();
  for (const result of results) {
    for (const tally of result.verdict.agents) {
      const summary = byAgent.get(tally.agent) ?? { agent: tally.agent, scenarios: 0, passed: 0, failed: 0, trials: 0, passedTrials: 0 };
      summary.scenarios += 1;
      summary.trials += tally.trials;
      summary.passedTrials += tally.passed;
      if (tally.trials > 0 && tally.passed === tally.trials && result.verdict.outcome !== 'error') summary.passed += 1;
      else summary.failed += 1;
      byAgent.set(tally.agent, summary);
    }
  }
  return [...byAgent.values()];
}

function failingScenariosOf(packs: Pack[], latest: Map<string, LatestResult>): FailingScenario[] {
  const failing: FailingScenario[] = [];
  for (const pack of packs) {
    for (const scenario of pack.scenarios) {
      const result = latest.get(scenario.id);
      if (result?.verdict.outcome !== 'fail') continue;
      const story = pack.stories.find(({ scenarioIds }) => scenarioIds.includes(scenario.id))?.file ?? '';
      failing.push({
        scenarioId: scenario.id,
        pack: pack.name,
        story,
        request: scenario.request,
        kind: scenario.kind,
        runId: result.runId,
        startedAt: result.startedAt,
        agents: result.verdict.agents,
        failedTrials: trialLinksOf(result.trials).filter((trial) => !trial.pass),
      });
    }
  }
  return failing;
}

function gradingOf(scenario: Scenario): GradingLayer[] {
  const layers: GradingLayer[] = [];
  if (scenario.expect.site !== undefined) layers.push('site');
  if ((scenario.expect.abilities?.length ?? 0) > 0) layers.push('abilities');
  if ((scenario.expect.forbidden?.length ?? 0) > 0) layers.push('forbidden');
  if ((scenario.expect.answer?.contains?.length ?? 0) > 0) layers.push('contains');
  if (scenario.expect.answer?.rubric !== undefined) layers.push('rubric');
  return layers;
}

function storiesOf(packs: Pack[], latest: Map<string, LatestResult>): StoryOverview[] {
  return packs.flatMap((pack) => {
    const byId = new Map(pack.scenarios.map((scenario) => [scenario.id, scenario]));
    return pack.stories.map((story) => ({
      pack: pack.name,
      packTitle: pack.title,
      file: story.file,
      text: story.text,
      scenarios: story.scenarioIds.flatMap((id): StoryScenario[] => {
        const scenario = byId.get(id);
        if (scenario === undefined) return [];
        const result = latest.get(id);
        return [
          {
            id: scenario.id,
            request: scenario.request,
            kind: scenario.kind,
            state: scenario.state ?? 'implemented',
            ...(scenario.reason === undefined ? {} : { reason: scenario.reason }),
            expectedAbilities: [...new Set((scenario.expect.abilities ?? []).map(abilityOf))],
            forbiddenAbilities: scenario.expect.forbidden ?? [],
            grading: gradingOf(scenario),
            ...(result === undefined
              ? {}
              : {
                  latest: {
                    runId: result.runId,
                    startedAt: result.startedAt,
                    outcome: result.verdict.outcome,
                    agents: result.verdict.agents,
                    trials: trialLinksOf(result.trials),
                  },
                }),
          },
        ];
      }),
    }));
  });
}

/**
 * The newest of `runs` that supplies the active MCP server audit. A newest `behind-lookup` run with contract
 * findings is surfaced directly; a newer clean `behind-lookup` run clears older lookup findings while still
 * preserving an older `compared` audit when one exists.
 */
function lastChecked(runs: RunListing[]): RunListing | undefined {
  return selectServerAudit(runs, (run) => run.serverChecks);
}

/** The newest of `runs` that compared directly exposed tools against the packs. */
function lastCompared(runs: RunListing[]): RunListing | undefined {
  return runs.find((run) => run.serverChecks?.outcome === 'compared');
}

/** The abilities the newest compared server check among `runs` found missing. None when none was compared. */
function missingIn(runs: RunListing[]): string[] {
  const checked = lastCompared(runs)?.serverChecks;
  return checked?.outcome === 'compared' ? checked.missing : [];
}

/** The definition problems the active server check among `runs` found. None when the server was unreadable. */
function definitionFindingsIn(runs: RunListing[]): DefinitionFinding[] {
  const checked = lastChecked(runs)?.serverChecks;
  if (checked === undefined || checked.outcome === 'unreadable') return [];
  return checked.definitionFindings ?? [];
}

/**
 * How many listed abilities the newest compared server check among `runs` found on the site, as the packs were then.
 * Before any checks compared the site with the packs, every ability the packs list now counts as on it.
 */
function onSiteIn(runs: RunListing[], listed: string[]): number {
  const checked = lastCompared(runs)?.serverChecks;
  return checked?.outcome === 'compared' ? checked.onSite.length : listed.length;
}

/**
 * One point per run, the oldest first, with the counts as they stood right after it. A run that kept only some
 * scenarios, with `--filter`, leaves the others at their earlier results, so the line does not drop. The
 * calls are not counted, so the trials are not read.
 */
export function trendOf(packs: Pack[], runs: RunListing[]): TrendPoint[] {
  const listed = listedAbilities(packs);
  const allScenarios = packs.flatMap((pack) => pack.scenarios);
  const latest = new Map<string, LatestResult>();
  const oldestFirst = [...runs].reverse();
  return oldestFirst.map((run, index) => {
    for (const verdict of run.verdicts) latest.set(verdict.scenarioId, { runId: run.id, startedAt: run.startedAt, verdict, trials: [] });
    const upToThen = oldestFirst.slice(0, index + 1).reverse();
    const { tested, groups } = summaryOf(coverageOf({ packs, latest, missing: missingIn(upToThen) }));
    const scenarios = scenarioSummaryOf(allScenarios, latest);
    return {
      runId: run.id,
      startedAt: run.startedAt,
      onSite: onSiteIn(upToThen, listed),
      tested,
      failing: groups['in-failing-scenario'],
      scenariosPassed: scenarios.passed,
      scenariosFailed: scenarios.failed,
      scenariosTotal: scenarios.total,
    };
  });
}

/** Adds one scenario to the count of `item` in `counts`, under `key`. */
function countIn<T extends object>(counts: Map<string, T & { scenarios: number }>, key: string, item: T): void {
  const count = counts.get(key) ?? { ...item, scenarios: 0 };
  count.scenarios += 1;
  counts.set(key, count);
}

/** What each agent ran on across the latest verdicts, by the scenarios each program, model and judge accounts for. */
function modelsBehind(results: LatestResult[], packs: Pack[]): ModelsBehind[] {
  const withRubric = new Set(packs.flatMap((pack) => pack.scenarios.filter(({ expect }) => expect.answer?.rubric !== undefined).map(({ id }) => id)));
  const byAgent = new Map<string, { ran: Map<string, RanOn & { scenarios: number }>; judges: Map<string, JudgeModel & { scenarios: number }> }>();
  for (const result of results) {
    for (const { agent } of result.verdict.agents) {
      const counts = byAgent.get(agent) ?? { ran: new Map(), judges: new Map() };
      byAgent.set(agent, counts);
      const versions = result.trials.flatMap((trial) => (trial.agent === agent && trial.versions !== undefined ? [trial.versions] : []));
      for (const ran of ranOn(versions)) countIn(counts.ran, `${ran.program} ${ran.model}`, ran);
      const judge = withRubric.has(result.verdict.scenarioId) ? result.models?.find((one) => one.agent === agent)?.judge : undefined;
      if (judge !== undefined) countIn(counts.judges, `${judge.name} ${judge.model ?? ''}`, judge);
    }
  }
  const mostFirst = <T extends { scenarios: number }>(counts: Map<string, T>): T[] => [...counts.values()].sort((one, other) => other.scenarios - one.scenarios);
  return [...byAgent].map(([agent, { ran, judges }]) => ({ agent, ran: mostFirst(ran), judges: mostFirst(judges) }));
}

/** The Overview of the packs: every ability's coverage, what needs attention, what is asked for and not built yet, the site against the packs, and the trend. */
export function overviewOf({ packs, runs, latest }: OverviewInput): Overview {
  const missing = missingIn(runs);
  const input = { packs, latest, missing, definitionFindings: definitionFindingsIn(runs) };
  const abilities = coverageOf(input);
  const allScenarios = input.packs.flatMap((pack) => pack.scenarios);
  const results = [...input.latest.values()];
  const checked = lastChecked(runs);
  const dates = results.map(({ startedAt }) => startedAt).sort();
  const tallies = results.flatMap(({ verdict }) => verdict.agents);
  return {
    packs: input.packs.map((pack) => ({
      name: pack.name,
      title: pack.title,
      ...summaryOf(abilities.filter((ability) => ability.pack === pack.name)),
      scenarios: scenarioSummaryOf(pack.scenarios, latest),
    })),
    summary: summaryOf(abilities),
    scenarioSummary: scenarioSummaryOf(allScenarios, latest),
    agentSummaries: agentSummariesOf(results),
    failingScenarios: failingScenariosOf(input.packs, latest),
    stories: storiesOf(input.packs, latest),
    abilities,
    needsAttention: abilities
      .filter(({ failed }) => failed > 0)
      .sort((one, other) => other.failed - one.failed || other.errored - one.errored)
      .slice(0, NEEDS_ATTENTION)
      .map(({ ability }) => ability),
    notBuiltYet: input.packs.flatMap((pack) =>
      pack.scenarios
        .filter(({ state }) => state === 'to-be-implemented')
        .map(({ id, request }) => ({ scenarioId: id, request, pack: pack.name, story: pack.stories.find(({ scenarioIds }) => scenarioIds.includes(id))?.file ?? '' })),
    ),
    agents: [...new Set(tallies.map(({ agent }) => agent))],
    trialsPerScenario: [...new Set(tallies.map(({ trials }) => trials))].sort((one, other) => one - other),
    models: modelsBehind(results, packs),
    ...(dates.length === 0 ? {} : { oldest: dates[0], newest: dates.at(-1) }),
    ...(checked?.serverChecks === undefined
      ? {}
      : {
          site: {
            runId: checked.id,
            startedAt: checked.startedAt,
            findings: checked.serverChecks,
            notBuilt: checked.serverChecks.outcome === 'compared' ? abilitiesNotBuilt(checked.serverChecks.missing, allScenarios) : [],
            ...(checked.hasServerSnapshot ? { hasServerSnapshot: true as const } : {}),
          },
        }),
    trend: trendOf(packs, runs),
  };
}

/** `validate`'s note on the abilities no scenario names, or undefined when every ability is named. It is never a problem. */
export function unnamedNote(packs: Pack[]): string | undefined {
  const coverage = coverageOf({ packs, latest: new Map(), missing: [] });
  const unnamed = coverage.filter(({ scenarios }) => scenarios === 0).map(({ ability }) => ability);
  if (unnamed.length === 0) return undefined;
  return `Note: ${unnamed.length} of ${coverage.length} abilities ${unnamed.length === 1 ? 'is' : 'are'} named by no scenario: ${unnamed.join(', ')}. A scenario covers an ability by naming it in \`expect.abilities\`.`;
}
