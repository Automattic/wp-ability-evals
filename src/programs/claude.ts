// Claude Code as installed on this machine, started without a terminal and with nothing of the user's but
// the sign-in. The Claude Code agent and the Claude judge both start it this way.

import { AgentNotReadyError } from '../errors.ts';
import type { SignIn } from './sign-in.ts';

export const CLAUDE = 'claude';
/** The model family Claude Code runs. */
export const CLAUDE_FAMILY = 'claude';
const API_KEY = 'ANTHROPIC_API_KEY';
// All that Claude Code needs from this machine: where the sign-in is kept and where programs are. Nothing
// else is passed on, because the evals are often started from inside another agent's session, whose
// variables would change how this one behaves.
const KEPT_VARIABLES = ['HOME', 'USER', 'LOGNAME', 'PATH', 'TMPDIR'];

export function claudeEnvironment(signIn: SignIn): NodeJS.ProcessEnv {
  // Memory would carry what one run learned into the next, and leave a folder per run in the user's home.
  const env: NodeJS.ProcessEnv = { CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' };
  for (const name of KEPT_VARIABLES) {
    if (process.env[name] !== undefined) env[name] = process.env[name];
  }
  if (signIn === 'api-key') {
    const key = process.env[API_KEY];
    if (!key) throw new AgentNotReadyError(`Claude Code is set to sign in with an API key, but ${API_KEY} is not set.`);
    env[API_KEY] = key;
  }
  return env;
}

/** The options every run gets. What a run adds decides its tools and the shape of what it prints. */
export function claudeOptions(model: string): string[] {
  return [
    '--print',
    ...['--model', model],
    // No user, project or local settings: none of the user's rules, plugins, hooks or MCP servers.
    ...['--setting-sources', ''],
    // Only the MCP servers a run names, which is none unless it adds `--mcp-config`.
    '--strict-mcp-config',
    '--disable-slash-commands',
    '--no-session-persistence',
  ];
}
