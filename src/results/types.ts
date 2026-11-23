// What a run leaves behind: one record per trial, one verdict per scenario, and how the run was set up.
// A run is saved as a folder: a small `run.json` that says how everything ended, and one file per trial with
// everything about it. A person, an agent or the viewer reads `run.json` first, then only the trials it needs.

import type { Transcript } from '../agents/types.ts';
import type { CheckResult } from '../checks/types.ts';
import type { SiteState } from '../entities/types.ts';
import type { McpServer } from '../mcp-server.ts';
import type { Scenario, ScenarioState } from '../scenarios/types.ts';
import type { DefinitionFinding, ServerFindings } from '../server-checks/types.ts';

// What a trial's file is made of. The viewer's page takes the shape of everything it shows from this file,
// and from no other part of `src/`, so the parts of a trial are named here too.
export type { ToolCall, Transcript } from '../agents/types.ts';
export type { CheckResult } from '../checks/types.ts';
export type { SiteState } from '../entities/types.ts';
export type { ExpectedAbility, Expectation, Scenario, ScenarioState } from '../scenarios/types.ts';
export type { DefinitionFinding, ListedTool, ServerFindings, ServerSnapshot, ToolAnnotations } from '../server-checks/types.ts';
export type { LookupTools } from '../mcp-server.ts';

/**
 * The site's MCP server as a run saves it: what tells which ability a tool call ran, without its address or its
 * sign-in. Coverage reads it to count calls as the checks do.
 */
export type SavedServer = Pick<McpServer, 'name' | 'lookup'>;

/** The two readings of the site that a trial is judged on. */
export interface SiteReadings {
  /** The site as the agent found it: after the before-trial hooks, and compared with the scenario's starting content. */
  before: SiteState;
  /** The site as the agent left it. */
  after: SiteState;
}

/** One run of one scenario by one agent. */
export interface TrialResult {
  scenarioId: string;
  agent: string;
  /** 1 for the first trial of this scenario by this agent, then 2, 3 and so on. */
  trial: number;
  /** True when every check passed. */
  pass: boolean;
  /** Set when the trial could not be judged, for example the agent timed out. An error is never a pass or a fail. */
  error?: string;
  /**
   * Set when no agent ran because the scenario is `to-be-implemented` and the server checks found that the site
   * does not have an ability it names yet: why. Such a trial does not pass and is no error, so its scenario
   * fails as expected.
   */
  notRun?: string;
  /** Empty for a trial that could not be judged or was not run. */
  checks: CheckResult[];
  /**
   * The site before and after the agent worked. Not set when the trial ended before both were read. A trial
   * that could not be judged after that, as when a judge gave no verdict, keeps them.
   */
  site?: SiteReadings;
  /** What the agent did. Not set when the trial ended before the agent answered. A trial that could not be judged after that keeps it. */
  transcript?: Transcript;
  durationMs: number;
}

/** How one agent did on a scenario. */
export interface AgentTally {
  agent: string;
  trials: number;
  passed: number;
}

/**
 * The conclusion for one scenario, drawn from all its trials by all agents. An agent does not do the same
 * thing every time, so one passing trial can be luck: a scenario passes only when every trial of every agent does.
 * - `pass`: every trial passed.
 * - `fail`: an `implemented` scenario had a failing trial.
 * - `expected-failure`: a scenario in another state had a failing trial.
 * - `unexpected-pass`: a scenario in another state passed every trial, so its state can change.
 * - `error`: a trial could not be judged.
 */
export type VerdictOutcome = 'pass' | 'fail' | 'expected-failure' | 'unexpected-pass' | 'error';

export interface Verdict {
  scenarioId: string;
  state: ScenarioState;
  outcome: VerdictOutcome;
  /** How each agent did, in the order the run named them. One agent failing does not hide that another passed. */
  agents: AgentTally[];
}

/** The agent program's version and the model it ran, as a trial's transcript reports them. */
export interface RanOn {
  program: string;
  model: string;
}

/** A judge by its name in the config, with its model where the judge says it. */
export interface JudgeModel {
  name: string;
  model?: string;
}

/**
 * What one agent ran on in a run. The model decides much of a result, so a run saves it, and the viewer shows
 * it wherever results are read.
 */
export interface AgentModels {
  agent: string;
  /** Each program version and model its trials reported, usually one. Empty when no trial got as far as an answer. */
  ran: RanOn[];
  /** The judge that grades its answers against rubrics. Not set for an agent that names none. */
  judge?: JudgeModel;
}

/** How a run is set up. A hook gets it too. */
export interface RunSetup {
  /** When the run started, as an ISO date and time. */
  startedAt: string;
  /** The site's name. */
  site: string;
  /** The names of the agents that run. Empty when none does, as for `site start` and `verify`. */
  agents: string[];
  trialsPerScenario: number;
}

export interface RunResult extends RunSetup {
  /** What the server checks found before the first trial: they decide which scenarios ran. */
  serverChecks: ServerFindings;
  /** The site's MCP server the agents worked through. */
  mcpServer: SavedServer;
  /** What each agent ran on, in the order the run named them. */
  models: AgentModels[];
  /** The scenarios that ran, as they were. */
  scenarios: Scenario[];
  trials: TrialResult[];
  verdicts: Verdict[];
  /**
   * Set when something went wrong around the trials, one line each: an after-scenario or an after-run hook
   * failed, or the site could not be stopped or removed afterwards. The trials still count, and the run ends
   * with an error.
   */
  errors?: string[];
}

/** A trial as `run.json` lists it: how it ended, and where everything about it is. */
export interface TrialSummary {
  scenarioId: string;
  agent: string;
  trial: number;
  pass: boolean;
  /** Set when the trial could not be judged. */
  error?: string;
  /** Set when no agent ran because an ability the scenario waits for is not built yet, as in `TrialResult`. */
  notRun?: string;
  /** The checks that failed, each with its reason. Empty for a trial that passed, could not be judged or was not run. */
  failed: CheckResult[];
  durationMs: number;
  /** The trial's own file, from the run's folder. */
  file: string;
}

/** What a run's `run.json` holds. It stays small, so it can be read whole. */
export interface RunFile extends RunSetup {
  /** What the server checks found. Not set in a run saved before there were server checks. */
  serverChecks?: ServerFindings;
  /** The site's MCP server. Not set in a run saved before it was saved. */
  mcpServer?: SavedServer;
  /** What each agent ran on. Not set in a run saved before it was saved: each trial's file still has its agent's program and model. */
  models?: AgentModels[];
  verdicts: Verdict[];
  trials: TrialSummary[];
  /** Set when something went wrong around the trials, as in `RunResult`. */
  errors?: string[];
}

/** A saved run in a list of runs: its `run.json` without the trials, and the name of its folder. */
export interface RunListing extends Omit<RunFile, 'trials' | 'models'> {
  /** The name of the run's folder in the results folder. */
  id: string;
  /** What each agent ran on. For a run saved before runs saved it, read from its trial files, without the judges. */
  models: AgentModels[];
  /** True when the run folder holds `server.json` with full MCP tool definitions and schemas. */
  hasServerSnapshot?: true;
}

/** What a trial's own file holds: everything about one trial. */
export interface TrialFile extends TrialResult {
  /** The scenario as it was when the trial ran: the request, and what was expected. */
  scenario: Scenario;
}

/**
 * The one group an ability falls in, for the colours and the headline, decided in this order:
 * `missing-from-site`: the server checks found no tool for it, and it is not merely waiting to be built.
 * `not-tested`: no scenario names it.
 * `in-failing-scenario`: a scenario that names it failed.
 * `known-defect-or-not-built`: a scenario that names it failed as expected, or it is not built yet.
 * `no-result-yet`: no scenario that names it has passed.
 * `passing`: every other.
 */
export type CoverageGroup = 'missing-from-site' | 'not-tested' | 'in-failing-scenario' | 'known-defect-or-not-built' | 'no-result-yet' | 'passing';

/** One errored tool call of an ability, with the scenario, agent, input and trial link for direct inspection. */
export interface ErroredCall {
  scenarioId: string;
  runId: string;
  agent: string;
  trial: number;
  file?: string;
  tool: string;
  input: unknown;
  output: string;
}

/** One scenario on an ability's panel. */
export interface ScenarioCoverage {
  scenarioId: string;
  request: string;
  state: ScenarioState;
  /** The scenario names the ability in `expect.abilities`. */
  named: boolean;
  /** The ability ran in it without an error, in a trial that passed. */
  ranIn: boolean;
  /** Its latest verdict. Not set for a scenario that no saved run has. */
  latest?: { runId: string; startedAt: string; outcome: VerdictOutcome; agents: AgentTally[]; trials?: TrialLink[] };
}

/** The coverage of one ability a pack lists: facts about the scenarios, never a verdict on the ability. */
export interface AbilityCoverage {
  ability: string;
  pack: string;
  /** What the ability is about, from its name, such as `site` for `core/get-site-info`. The Overview's map groups by it. */
  area: string;
  /** `read` for an ability the pack lists under `reads`, `write` for one under `writes`. */
  kind: 'read' | 'write';
  group: CoverageGroup;
  /** How many scenarios name it in `expect.abilities`, run or not. */
  scenarios: number;
  /** How the latest verdicts of those scenarios ended. A pass includes an unexpected one. */
  passed: number;
  failed: number;
  knownDefect: number;
  notBuilt: number;
  notJudged: number;
  notRunYet: number;
  /** In how many scenarios, named or not, it ran without an error in a trial that passed. */
  ranIn: number;
  /** Its calls in the trials of every scenario's latest verdict, and how many of them came back with an error. */
  calls: number;
  errored: number;
  /** What the first few calls that came back with an error answered. */
  errors: string[];
  /** Detailed records for the first few errored calls, including scenario, agent, input, output, and trial link. */
  erroredCalls?: ErroredCall[];
  /** Problems the newest server checks found in this ability's MCP tool definition. Omitted when none were found. */
  definitionFindings?: DefinitionFinding[];
  /** Each scenario that names it or that it ran in, in the packs' order. */
  results: ScenarioCoverage[];
}

/** How many abilities there are, how many a scenario names, and how many fall in each group. */
export interface CoverageSummary {
  abilities: number;
  tested: number;
  groups: Record<CoverageGroup, number>;
}

export interface PackCoverage extends CoverageSummary {
  name: string;
  title: string;
  /** Scenario outcomes across this pack's stories, from each scenario's latest verdict. */
  scenarios: ScenarioSummary;
}

/** Counts of scenarios across their latest verdicts. */
export interface ScenarioSummary {
  total: number;
  passed: number;
  failed: number;
  knownDefect: number;
  notBuilt: number;
  error: number;
  notRunYet: number;
}

/** How one agent performed across every scenario's latest verdict. */
export interface AgentSummary {
  agent: string;
  scenarios: number;
  passed: number;
  failed: number;
  trials: number;
  passedTrials: number;
}

/** A lightweight pointer to one saved trial file, with its pass status and one-line failure reason. */
export interface TrialLink {
  agent: string;
  trial: number;
  pass: boolean;
  error?: string;
  notRun?: string;
  file: string;
  reason?: string;
}

/** A scenario whose latest verdict failed, surfaced on the Overview even when it names no ability. */
export interface FailingScenario {
  scenarioId: string;
  pack: string;
  story: string;
  request: string;
  kind: Scenario['kind'];
  runId: string;
  startedAt: string;
  agents: AgentTally[];
  failedTrials: TrialLink[];
}

/** Which check layers a scenario uses, for non-technical and engineering readers alike. */
export type GradingLayer = 'site' | 'abilities' | 'forbidden' | 'contains' | 'rubric';

/** One scenario inside a plain-English story on the Stories view. */
export interface StoryScenario {
  id: string;
  request: string;
  kind: Scenario['kind'];
  state: ScenarioState;
  reason?: string;
  expectedAbilities: string[];
  forbiddenAbilities: string[];
  grading: GradingLayer[];
  latest?: {
    runId: string;
    startedAt: string;
    outcome: VerdictOutcome;
    agents: AgentTally[];
    trials: TrialLink[];
  };
}

/** One site-owner story with its scenarios and latest verdicts. */
export interface StoryOverview {
  pack: string;
  packTitle: string;
  file: string;
  text: string;
  scenarios: StoryScenario[];
}

/** A `to-be-implemented` scenario: something a site owner asks for that the site can't do yet. */
export interface NotBuiltScenario {
  scenarioId: string;
  request: string;
  pack: string;
  /** The name of its story file. */
  story: string;
}

/** What the newest run with server checks found on the site, against the packs. */
export interface SiteAgainstPacks {
  /** The run that found it. */
  runId: string;
  startedAt: string;
  findings: ServerFindings;
  /** The missing abilities that only `to-be-implemented` scenarios name: not built yet, rather than missing by mistake. */
  notBuilt: string[];
  /** True when the run folder also holds `server.json` with full MCP tool definitions and schemas. */
  hasServerSnapshot?: true;
}

/** The counts as they stood right after one saved run, from each scenario's most recent result up to then. */
export interface TrendPoint {
  runId: string;
  startedAt: string;
  /** The listed abilities that the newest server checks up to then found on the site; every listed ability before any checks. */
  onSite: number;
  tested: number;
  failing: number;
  scenariosPassed: number;
  scenariosFailed: number;
  scenariosTotal: number;
}

/**
 * What one agent ran on across the latest verdicts, each with the number of scenarios it accounts for, the most
 * first. More than one program, model or judge means that the Overview's counts mix them.
 */
export interface ModelsBehind {
  agent: string;
  ran: (RanOn & { scenarios: number })[];
  /** Counted over the scenarios with a rubric only, because only those are graded by a judge. */
  judges: (JudgeModel & { scenarios: number })[];
}

/** What the viewer's server serves for the Overview: the coverage of every ability the project's packs list. */
export interface Overview {
  packs: PackCoverage[];
  /** Every pack together. */
  summary: CoverageSummary;
  /** Every scenario together, from its latest verdict. */
  scenarioSummary: ScenarioSummary;
  /** Per-agent reliability across the latest scenario verdicts. */
  agentSummaries: AgentSummary[];
  /** Every scenario whose latest verdict failed, including ones that name no ability. */
  failingScenarios: FailingScenario[];
  /** All site-owner stories and their scenarios, in pack order. */
  stories: StoryOverview[];
  abilities: AbilityCoverage[];
  /** Up to 10 abilities in a failing scenario, by failed scenarios and then by calls that errored. */
  needsAttention: string[];
  notBuiltYet: NotBuiltScenario[];
  /** The agents and the numbers of trials per scenario of the latest verdicts, and the oldest and newest run they come from. */
  agents: string[];
  trialsPerScenario: number[];
  /** What each of those agents ran on. */
  models: ModelsBehind[];
  oldest?: string;
  newest?: string;
  /** Not set until a saved run has server checks. */
  site?: SiteAgainstPacks;
  /** One point per saved run, the oldest first. */
  trend: TrendPoint[];
}
