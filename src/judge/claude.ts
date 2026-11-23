// Claude as a judge: the installed `claude` command (`programs/claude.ts`) with no tools at all, the grading
// instructions in place of its own, and a verdict in a fixed shape.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JudgeFailedError } from '../errors.ts';
import { isRecord } from '../files/shape.ts';
import { run } from '../process.ts';
import { CLAUDE, CLAUDE_FAMILY, claudeEnvironment, claudeOptions } from '../programs/claude.ts';
import { INSTRUCTIONS, partsOf, VERDICT_SCHEMA, verdictIn } from './grading.ts';
import type { Judge, JudgeSettings, JudgeVerdict } from './types.ts';

const TIMEOUT_MS = 120_000;

/** The verdict in what Claude Code printed: one JSON object that holds the structured output. Throws `JudgeFailedError` when it holds none. */
export function verdictFrom(output: string): JudgeVerdict {
  let result: unknown;
  try {
    result = JSON.parse(output);
  } catch {
    result = undefined;
  }
  if (!isRecord(result) || result.is_error === true) throw new JudgeFailedError(`The Claude judge ended with an error: ${output.slice(-500)}`);
  return verdictIn(result.structured_output ?? result.result, 'Claude');
}

export function claudeJudge(settings: JudgeSettings): Judge {
  return {
    family: CLAUDE_FAMILY,
    model: settings.model,
    async grade(input): Promise<JudgeVerdict> {
      const args = [
        ...claudeOptions(settings.model),
        ...['--output-format', 'json'],
        ...['--system-prompt', INSTRUCTIONS],
        ...['--json-schema', JSON.stringify(VERDICT_SCHEMA)],
        // No tools: the judge decides from the three parts alone.
        ...['--tools', ''],
      ];
      // An empty folder, as for an agent, so nothing on this machine reaches the judge.
      const cwd = await mkdtemp(join(tmpdir(), 'judge-'));
      try {
        return verdictFrom(await run(CLAUDE, args, { cwd, env: claudeEnvironment(settings.signIn), input: partsOf(input), timeoutMs: TIMEOUT_MS }));
      } finally {
        await rm(cwd, { recursive: true, force: true });
      }
    },
  };
}
