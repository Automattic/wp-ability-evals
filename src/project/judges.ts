// Which judge grades which agent. An agent names its judge in the settings, so nothing is chosen for it.

import type { Agent } from '../agents/types.ts';
import type { Config } from '../config/types.ts';
import type { NamedJudge } from '../judge/types.ts';

/** The judge an agent names, or nothing when it names none. Loading the settings made sure a named judge exists. */
export function judgeOf(agent: Agent, config: Config): NamedJudge | undefined {
  const judge = agent.judge === undefined ? undefined : config.judges?.[agent.judge];
  return agent.judge === undefined || judge === undefined ? undefined : { name: agent.judge, judge };
}

/**
 * One line for each of the agents that is graded by a judge of its own model family. Such a judge passes
 * the agent's answers more easily, so it is said, but a project with one vendor only can still use rubrics.
 */
export function sameFamilyNotices(agentNames: string[], config: Config): string[] {
  return agentNames.flatMap((name) => {
    const agent = config.agents[name];
    const named = agent === undefined ? undefined : judgeOf(agent, config);
    if (agent === undefined || named === undefined || named.judge.family !== agent.family) return [];
    return [
      `Note: ${name} is graded by the judge ${named.name}, which is of its own model family (${agent.family}). A judge passes answers of its own family more easily. Name a judge of another family for ${name} in evals.config.ts to avoid that.`,
    ];
  });
}
