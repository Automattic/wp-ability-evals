// What an agent is to the evals: an outside program that gets a request and an MCP server, works on the site,
// and reports what it did. Every agent (Claude Code, Codex, later others) is one adapter that implements `Agent`
// and returns the same `Transcript`, so nothing else in the framework knows which agent ran.
//
// An adapter runs its agent as a first-time user would have it: signed in, in an empty folder, with none of
// the user's settings, rules, skills or memory, and with nothing that says it is an evaluation.

import type { McpServer } from '../mcp-server.ts';
import type { SignIn } from '../programs/sign-in.ts';

export type { SignIn };

/** How a built-in agent is set up, in the config. */
export interface AgentSettings {
  model: string;
  signIn: SignIn;
  /** The name of the judge, in the config's `judges`, that grades this agent's answers where a scenario has a rubric. */
  judge?: string;
}

/** What an agent is asked to do in one trial. */
export interface AgentTask {
  request: string;
  mcpServer: McpServer;
  /** An empty folder outside any repository, made for this trial. The agent starts there and sees no code. */
  workDir: string;
  /** A trial that takes longer is stopped and counted as an error. */
  timeoutMs: number;
}

/** One tool call the agent made, in the same shape for every agent. */
export interface ToolCall {
  /** The MCP server the tool belongs to, or null for one of the agent's own tools. */
  server: string | null;
  tool: string;
  input: unknown;
  /** What the call returned, as text. */
  output: string;
  isError: boolean;
}

/** What an agent did in one trial. */
export interface Transcript {
  /** The agent's final answer to the request. */
  answer: string;
  /** Every tool call, in order. It includes the agent's own tool-search calls. */
  toolCalls: ToolCall[];
  /** The agent program's version and the model that ran, to tell a server change from a client change. */
  versions: {
    agent: string;
    model: string;
  };
  /** Everything the agent reported, unchanged, for debugging. */
  raw: unknown;
}

/**
 * The whole contract of an agent. A project adds its own by writing a function that returns one of these and
 * naming it in its config; the built-in agents are made the same way.
 */
export interface Agent {
  /**
   * The family of the model it runs, such as `claude` or `gpt`. A judge tends to pass answers of its own
   * family more easily, so a run says when an agent is graded by one.
   */
  family: string;
  /** The name of the judge, in the config's `judges`, that grades its answers where a scenario has a rubric. */
  judge?: string;
  run(task: AgentTask): Promise<Transcript>;
}
