// Codex as installed on this machine, started without a terminal and with nothing of the user's but the
// sign-in: no shell, no web, no sub-agents, no skills, plugins, connected apps or memory. The Codex agent
// and the Codex judge both start it this way.
//
// Codex keeps its sign-in in the same folder as everything else it knows about the user, so it can't use the
// sign-in and skip the rest. It gets a home of its own instead, which the user signs in to once.

import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentFailedError, AgentNotReadyError } from '../errors.ts';
import { isRecord } from '../files/shape.ts';
import { run } from '../process.ts';
import type { SignIn } from './sign-in.ts';

const PROGRAM = 'codex';
/** The model family Codex runs. */
export const CODEX_FAMILY = 'gpt';
/** The variable a user sets, and the one `codex exec` reads a key from. */
const API_KEY = 'OPENAI_API_KEY';
const CODEX_API_KEY = 'CODEX_API_KEY';
/** Codex's home for the evals: one per machine, shared by every project. It holds a sign-in and nothing of the user's. */
const CODEX_HOME = join(homedir(), '.wp-ability-evals', 'codex');
const SIGN_IN = 'mkdir -p ~/.wp-ability-evals/codex && CODEX_HOME=~/.wp-ability-evals/codex codex login';
// Nothing else is passed on, because the evals are often started from inside another agent's session, whose
// variables would change how this one behaves. HOME is left out on purpose: Codex reads the user's skills
// from `~/.agents/skills` whatever its own home is, so it gets an empty folder as the user's.
const KEPT_VARIABLES = ['USER', 'LOGNAME', 'PATH', 'TMPDIR'];
const STATUS_TIMEOUT_MS = 30_000;

// Codex has no single switch for its own tools and extras, so each is switched off by name. What is left
// is the tool it calls every other tool through, its tools for an MCP server's resources, and its
// file-editing tool, which the read-only sandbox refuses.
const SWITCHED_OFF = [
  'shell_tool', // running commands
  'view_image',
  'image_generation',
  'goals',
  'plugins',
  'apps', // the apps connected to the user's ChatGPT account
  'memories', // would carry what one run learned into the next
];
const SETTINGS = [
  'web_search="disabled"',
  'agents.enabled=false', // no sub-agents
  'skills.bundled.enabled=false', // the skills that ship with Codex, which need the shell
];

export interface CodexRun {
  model: string;
  signIn: SignIn;
  /** What Codex is asked. It goes in as input, not as an argument, so one that starts with a dash is not read as an option. */
  request: string;
  /** The folder Codex starts in. */
  cwd: string;
  timeoutMs: number;
  /** More variables for Codex, such as one that holds a header of an MCP server. */
  env?: Record<string, string>;
  /** More `--config` settings, each as `key=value` with the value in TOML. */
  settings?: string[];
  /** More options for `codex exec`. */
  options?: string[];
}

function environment(signIn: SignIn, userHome: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { HOME: userHome };
  for (const name of KEPT_VARIABLES) {
    if (process.env[name] !== undefined) env[name] = process.env[name];
  }
  if (signIn === 'login') return { ...env, CODEX_HOME };
  // With a key, Codex needs nothing from the machine: it makes a new home in the empty user folder.
  const key = process.env[API_KEY];
  if (!key) throw new AgentNotReadyError(`Codex is set to sign in with an API key, but ${API_KEY} is not set.`);
  return { ...env, [CODEX_API_KEY]: key };
}

function options(model: string, settings: string[]): string[] {
  return [
    'exec',
    '--json',
    ...['--model', model],
    // Nothing from the Codex home but the sign-in, and no session saved in it.
    '--ignore-user-config',
    '--ephemeral',
    // The folder it starts in is not a repository, which Codex otherwise refuses to work in.
    '--skip-git-repo-check',
    // Codex's file-editing tool can't be switched off. Nothing may be written, so it is refused.
    ...['--sandbox', 'read-only'],
    ...SWITCHED_OFF.flatMap((feature) => ['--disable', feature]),
    ...[...SETTINGS, ...settings].flatMap((setting) => ['--config', setting]),
  ];
}

/** The events Codex printed, one JSON object per line. A run that was stopped can end in the middle of a line, which is skipped. */
export function eventsIn(output: string): Record<string, unknown>[] {
  return output.split('\n').flatMap((line) => {
    try {
      const event: unknown = JSON.parse(line);
      return isRecord(event) ? [event] : [];
    } catch {
      return [];
    }
  });
}

/** Why Codex gave up, when it did. */
export function failureIn(events: Record<string, unknown>[]): AgentFailedError | undefined {
  const failed = events.findLast((event) => event.type === 'turn.failed');
  if (failed === undefined) return undefined;
  return new AgentFailedError(`Codex ended with an error: ${isRecord(failed.error) ? String(failed.error.message) : JSON.stringify(failed)}`);
}

/** The last thing Codex said. It also says what it is about to do, so its answer is its last message. */
export function lastMessageIn(events: Record<string, unknown>[]): string | undefined {
  const messages = events.flatMap((event) => (event.type === 'item.completed' && isRecord(event.item) && event.item.type === 'agent_message' ? [event.item] : []));
  const text = messages.at(-1)?.text;
  return typeof text === 'string' ? text : undefined;
}

/**
 * Runs Codex once. Returns what it printed, one JSON event per line, and its version, which it does not
 * report itself. Throws `AgentNotReadyError` when Codex is not signed in, and `AgentFailedError` when it gave up.
 */
export async function runCodex({ model, signIn, request, cwd, timeoutMs, env: more = {}, settings = [], options: moreOptions = [] }: CodexRun): Promise<{ output: string; version: string }> {
  const folder = await mkdtemp(join(tmpdir(), 'agent-'));
  const userHome = join(folder, 'home');
  const outputFile = join(folder, 'output.jsonl');
  try {
    await mkdir(userHome);
    const env = { ...environment(signIn, userHome), ...more };
    // "codex-cli 0.165.0"
    const version = (await run(PROGRAM, ['--version'], { env, timeoutMs: STATUS_TIMEOUT_MS })).split(' ').at(-1) ?? 'unknown';
    if (signIn === 'login') {
      await run(PROGRAM, ['login', 'status'], { env, timeoutMs: STATUS_TIMEOUT_MS }).catch(() => {
        throw new AgentNotReadyError(
          `Codex is not signed in for the evals. It runs with a home of its own (${CODEX_HOME}), so that none of your Codex settings reach a run. Sign in to it once: \`${SIGN_IN}\``,
        );
      });
    }
    const output = (): Promise<string> => readFile(outputFile, 'utf8');
    await run(PROGRAM, [...options(model, settings), ...moreOptions], { cwd, env, input: request, outputFile, timeoutMs }).catch(async (error: unknown) => {
      // When Codex gives up it says why in its output, which is clearer than the log on its error stream.
      throw failureIn(eventsIn(await output())) ?? error;
    });
    return { output: await output(), version };
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
