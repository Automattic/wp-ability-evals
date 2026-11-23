// What coverage is counted from: each scenario's latest verdict, with what its trials did. What it counts, an
// ability's coverage and the Overview, is in `src/results/types.ts`, because the viewer's page takes the shape
// of everything it shows from there.

import type { ToolCall, Transcript } from '../agents/types.ts';
import type { AgentModels, SavedServer, Verdict } from '../results/types.ts';

/** One trial of a scenario's latest verdict, with its tool calls and pointer back to the saved trial file. */
export interface LatestTrial {
  agent: string;
  trial?: number;
  pass: boolean;
  error?: string;
  notRun?: string;
  file?: string;
  reason?: string;
  toolCalls: ToolCall[];
  versions?: Transcript['versions'];
}

/** A scenario's latest verdict, with what its trials did. */
export interface LatestResult {
  /** The name of the run's folder. */
  runId: string;
  startedAt: string;
  verdict: Verdict;
  /** The site's MCP server in that run. Not set for a run saved before it was saved. */
  mcpServer?: SavedServer;
  /** What each agent ran on in that run. Not set for a run saved before it was saved. */
  models?: AgentModels[];
  /**
   * Each trial of the scenario in that run: its agent, whether it passed, every tool call the agent made in it,
   * and the program and model that ran, which a trial that ended before the agent answered does not have.
   */
  trials: LatestTrial[];
}
