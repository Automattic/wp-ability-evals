# A run's results

What a run saves in `results/`, and the order to read it in. Part of the package's guide, which `npx wp-ability-evals update` replaces: write this project's own rules in `AGENTS.md`.

- `results/` holds one folder per run, named after the time it started. It is not committed.
- Read the run's `run.json` first: it is short, and has what each agent and judge ran on (`models`), what the server checks found (`serverChecks`), each scenario's verdict and, for every trial, whether it passed, the checks that failed with their reasons, and the path of the trial's own file.
- A folder without `run.json` is a run that did not end, because it was stopped or failed, or one that is still going. Each trial's file is written as the trial ends, so its `trials/` holds every trial that ended. It has no verdicts.
- Open a trial's file only for the detail: the request, what was expected, every check, the site as the agent found it and as it left it (`site.before` and `site.after`), the answer, each tool call and the agent's raw output.
- A trial that could not be judged keeps what it had by then: where a judge gave no verdict, the answer, the tool calls and the two readings of the site are still there.
