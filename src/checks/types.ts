// What a check is: a rule that looks at one trial and passes or fails it, with a reason a person can read.
// Checks are plain functions of what happened; they never run an agent or change the site.

import type { Transcript } from '../agents/types.ts';
import type { SiteState } from '../entities/types.ts';
import type { NamedJudge } from '../judge/types.ts';
import type { McpServer } from '../mcp-server.ts';
import type { Pack } from '../packs/types.ts';
import type { Scenario } from '../scenarios/types.ts';

/** Everything a check may look at. */
export interface CheckInput {
  scenario: Scenario;
  transcript: Transcript;
  /** The site as the trial started, and as it ended. */
  before: SiteState;
  after: SiteState;
  /** The packs on the site, for their ability lists. */
  packs: Pack[];
  /** The site's MCP server: its name and its lookup tools. Its address is left out, because it holds the sign-in. */
  server: Pick<McpServer, 'name' | 'lookup'>;
  /** The judge the agent names, for a scenario with a rubric. */
  judge?: NamedJudge;
}

export interface CheckResult {
  /** The check's name, as shown in results. */
  check: string;
  pass: boolean;
  /** What was found, whether it passed or not. */
  reason: string;
  /** The name of the judge that decided, for a check a judge decides. */
  judge?: string;
}

export type Check = (input: CheckInput) => CheckResult | Promise<CheckResult>;
