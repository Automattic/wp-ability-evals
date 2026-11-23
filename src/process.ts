// Runs an outside program (Docker, wp-env, an agent) and returns what it printed. It is in one place
// so that every failure names the command and repeats what the program said.

import { spawn } from 'node:child_process';
import { open } from 'node:fs/promises';
import { CommandFailedError } from './errors.ts';

const ERROR_STREAM = 2;

export interface RunOptions {
  cwd?: string;
  /** The only environment variables the program gets. Without it, the program gets this process's own. */
  env?: NodeJS.ProcessEnv;
  /** Text the program reads as its input. */
  input?: string;
  /** A file the program reads as its input. */
  inputFile?: string;
  /** A file that receives what the program prints, instead of it being returned. */
  outputFile?: string;
  /** Show what the program prints while it runs, on this process's error stream, instead of returning it. */
  showOutput?: boolean;
  /** Stop the program if it has not ended by then. Without it, a program that never answers would hang the command. */
  timeoutMs?: number;
  /** Exit codes that count as success in addition to 0, for programs whose exit code reports a finding (such as MCP Inspector's `--strict`, exit 6). */
  okCodes?: number[];
}

/** What the program printed, trimmed. Throws `CommandFailedError` if it can't start or ends with an error. */
export async function run(command: string, args: string[], options: RunOptions = {}): Promise<string> {
  const input = options.inputFile ? await open(options.inputFile, 'r') : undefined;
  const output = options.outputFile ? await open(options.outputFile, 'w') : undefined;
  const shown = options.showOutput ? ERROR_STREAM : 'pipe';
  try {
    return await new Promise<string>((resolve, reject) => {
      const stdin = input?.fd ?? (options.input === undefined ? 'ignore' : 'pipe');
      const child = spawn(command, args, { cwd: options.cwd, env: options.env, stdio: [stdin, output?.fd ?? shown, shown] });
      child.stdin?.end(options.input);
      let printed = '';
      let complaints = '';
      let timedOut = false;
      const timer = options.timeoutMs === undefined ? undefined : setTimeout(() => {
        timedOut = true;
        child.kill();
      }, options.timeoutMs);
      child.stdout?.setEncoding('utf8').on('data', (text: string) => (printed += text));
      child.stderr?.setEncoding('utf8').on('data', (text: string) => (complaints += text));
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(new CommandFailedError(command, args, error.message));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0 || (code !== null && options.okCodes?.includes(code) === true)) return resolve(printed.trim());
        const stopped = `it did not end within ${Math.round((options.timeoutMs ?? 0) / 1000)} seconds and was stopped`;
        // Some programs report their error on the output stream, so its end stands in when the error stream is empty.
        const said = complaints.trim() || printed.trim().slice(-500) || `it ended with exit code ${code}`;
        reject(new CommandFailedError(command, args, timedOut ? stopped : said));
      });
    });
  } finally {
    await input?.close();
    await output?.close();
  }
}
