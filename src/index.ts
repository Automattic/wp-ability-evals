// What a project may import from the package: the config helper, the built-in agents, the contracts an
// extension implements, the hook that comes with the package, and what a hook gets. Everything else in `src/`
// is internal and may change between versions.

export { defineConfig } from './config/define.ts';
export type { Config } from './config/types.ts';
export type { ExpectedHints, ServerCheckConfig, ToolHint } from './server-checks/types.ts';

export { claudeCode } from './agents/claude-code.ts';
export { codex } from './agents/codex.ts';
export type { Agent, AgentSettings, AgentTask, SignIn, ToolCall, Transcript } from './agents/types.ts';

export type { EntityReaders, EntityType, EntityWriters, SiteState } from './entities/types.ts';
export type { LookupTools, McpServer, RunTool } from './mcp-server.ts';
export { isWpEnvSite } from './sites/wp-env.ts';
export type { AfterRun, Site, SiteContext, SiteFactory, SiteFile, WpEnvSite } from './sites/types.ts';

export { createGiven } from './hooks/create-given.ts';
export type { AfterTrialHook, AfterTrialHookContext, Hook, HookPoint, Hooks, RunHookContext, ScenarioHookContext, TrialHookContext } from './hooks/types.ts';
export type { CheckResult } from './checks/types.ts';
export type { RunSetup, SiteReadings, TrialResult } from './results/types.ts';

export { claudeJudge } from './judge/claude.ts';
export { codexJudge } from './judge/codex.ts';
export type { Judge, JudgeInput, JudgeSettings, JudgeVerdict } from './judge/types.ts';
export type { Pack, PackManifest } from './packs/types.ts';
export type {
  AnswerExpectation,
  ArgumentValue,
  Contains,
  ExpectedAbility,
  ExpectedArguments,
  ExpectedItem,
  Expectation,
  Scenario,
  ScenarioKind,
  ScenarioState,
  SiteChange,
  SiteExpectation,
  StartingContent,
  StoryFile,
} from './scenarios/types.ts';
