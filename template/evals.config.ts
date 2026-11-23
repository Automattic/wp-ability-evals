// The settings of this evals project. Format: Config, in the wp-ability-evals package.

import { claudeCode, claudeJudge, codex, codexJudge, createGiven, defineConfig } from 'wp-ability-evals';

export default defineConfig({
  packs: ['./packs/core'],
  sitesDir: './sites',
  resultsDir: './results',
  // `judge` names the judge, from `judges` below, that grades the agent's answers where a scenario has a
  // rubric. Each agent is graded by a judge of another model family, because a judge passes answers of its
  // own family more easily.
  agents: {
    'claude-code': claudeCode({ model: 'claude-sonnet-5-5', signIn: 'login', judge: 'gpt' }),
    codex: codex({ model: 'gpt-6.2-sol', signIn: 'login', judge: 'claude' }),
  },
  judges: {
    claude: claudeJudge({ model: 'claude-sonnet-5-5', signIn: 'login' }),
    gpt: codexJudge({ model: 'gpt-6.2-sol', signIn: 'login' }),
  },
  // Each agent runs each scenario this many times, and all must pass. A lower number uses fewer tokens and
  // lets more scenarios pass by luck.
  trials: 3,
  trialTimeoutMs: 300_000,
  hooks: {
    // `createGiven()` comes with the package. Before each trial it puts the scenario's starting content, its
    // `given`, on the site. The site is then read and must be as it was at the start of the run plus `given`,
    // or the trial stops before the agent works. Hooks of this project's own go in these lists too.
    beforeTrial: [createGiven()],
  },
});
