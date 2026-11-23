// Codex as a judge: the installed `codex` command (`programs/codex.ts`) with no MCP server, the grading
// instructions ahead of the three parts, and a verdict in a fixed shape.

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JudgeFailedError } from '../errors.ts';
import { CODEX_FAMILY, eventsIn, lastMessageIn, runCodex } from '../programs/codex.ts';
import { INSTRUCTIONS, partsOf, VERDICT_SCHEMA, verdictIn } from './grading.ts';
import type { Judge, JudgeSettings, JudgeVerdict } from './types.ts';

const TIMEOUT_MS = 120_000;

/** The verdict in what Codex printed: its last message, which is JSON in the verdict's shape. Throws `JudgeFailedError` when there is none. */
export function verdictFrom(output: string): JudgeVerdict {
  const message = lastMessageIn(eventsIn(output));
  if (message === undefined) throw new JudgeFailedError('The Codex judge ended without a verdict.');
  let verdict: unknown;
  try {
    verdict = JSON.parse(message);
  } catch {
    verdict = message;
  }
  return verdictIn(verdict, 'Codex');
}

export function codexJudge(settings: JudgeSettings): Judge {
  return {
    family: CODEX_FAMILY,
    model: settings.model,
    async grade(input): Promise<JudgeVerdict> {
      const folder = await mkdtemp(join(tmpdir(), 'judge-'));
      const schemaFile = join(folder, 'verdict.json');
      // An empty folder to start in, as for an agent, so nothing on this machine reaches the judge.
      const cwd = join(folder, 'work');
      try {
        await mkdir(cwd);
        await writeFile(schemaFile, JSON.stringify(VERDICT_SCHEMA));
        // Codex takes no instructions of its own from the command line, so they go ahead of the parts.
        const request = `${INSTRUCTIONS}\n\n${partsOf(input)}`;
        const { output } = await runCodex({ ...settings, request, cwd, timeoutMs: TIMEOUT_MS, options: ['--output-schema', schemaFile] });
        return verdictFrom(output);
      } finally {
        await rm(folder, { recursive: true, force: true });
      }
    },
  };
}
