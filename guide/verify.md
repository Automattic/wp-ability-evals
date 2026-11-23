# Proving a scenario

How `verify` proves a scenario without an agent, and what each of its lines means. Part of the package's guide, which `npx wp-ability-evals update` replaces: write this project's own rules in `AGENTS.md`.

`npx wp-ability-evals verify --site local --no-judges` proves each scenario on the site without an agent. The site's writers stand in for the agent, so it works before the ability exists: a `to-be-implemented` scenario is proved like any other. It prints each scenario's id, one line per step with what was found, a line on what it does not cover, and a last line with the counts:

```
content/publish-a-draft/by-its-topic
  start       2 given items found on the site
  no change   fails, as it should: posts summer-sale: status is "draft", expected "publish"
  the change  passes
content/publish-a-draft/no-such-draft
  start       2 given items found on the site
  no change   passes, as it should: the scenario expects no change
  rubric      not graded, because of --no-judges
`expect.abilities` and `expect.forbidden` are not covered, because no agent runs: only a run shows which abilities an agent executes.
2 scenarios checked: 2 passed. 1 rubric not graded, because of --no-judges.
```

A line that starts with `FAILED:` shows a mistake in the scenario or in what prepares the site for it. A line that starts with `COULD NOT BE CHECKED:` means something else stopped the step, such as a hook that failed or a site that did not answer. The command ends with an error in both cases. Fix the scenario and run it again until every line passes. A step that was left out ends nothing: the last line counts each rubric that was not graded and each `contains` that was not checked.

- `start`: the site is prepared as for a trial, with the `beforeTrial` hooks, and must be as it was at its marked start plus the scenario's `given`. When it fails, its line is the one a trial would stop with, and `.agents/guide/starting-content.md` says what each difference means.
- `no change`: the site check runs with nothing done. For a scenario with `expect.site` it must fail, and the line then reads "fails, as it should". `FAILED:` here means that `expect.site` already holds when the scenario starts, so a trial would pass with an agent that did nothing: change `given` so that the site starts without the change. For a scenario without `expect.site` the check must pass.
- `the change`: only for a scenario with `expect.site`. On the same prepared site, the writers make the expected change, and the site check must pass. `FAILED:` with "could not be changed" means the writers can't make the change, and ends with what WordPress said. `FAILED:` with "does not accept the change" means the site saved another value than `expect.site` names: write the value as `site state` prints it.
- When `expect.site` names an item by a key the site does not start with, the `the change` line says so, also when it passes: making the change creates that item. That is right for an item the agent creates under a key you know. For an item that should be there, the key is mistyped: compare it with `given` and `site state`. For an item whose key the site chooses, mark it `$new: true`.
- For an item marked `$new`, the writers create an item under its label as its key, with its plain values. A field with `$contains` gets its texts, joined by a space, after the text the field starts with. `FAILED:` with "the site starts with an item under that key" means the label is the key of an item on the site, which the writers would change instead: choose another label, or remove `$new` if the scenario means that item. `FAILED:` with "2 created items fit" means two items marked `$new` have fields that fit each other's item: name a field that tells them apart.
- `contains`: only with `expect.answer.contains`. The `reference` answer next to it must contain every text. Without a `reference` the line reads "not checked", and the scenario still passes: add a `reference`, an answer that should pass, to have the texts checked.
- `rubric`: only with `expect.answer.rubric`. Every judge under `judges` in `evals.config.ts` grades `reference`, which it must pass, and `wrong`, which it must fail. `FAILED:` names each judge that decided otherwise, with its reason: make the rubric say what `reference` has and `wrong` lacks. A judge that gave no verdict makes the step `COULD NOT BE CHECKED:`, never a failure. With `--no-judges` nothing is graded. Grading spends each judge's plan or API credit, so leave `--no-judges` out only when asked.

What `verify` does not cover: `expect.abilities`, `expect.forbidden` and the other checks on which abilities ran, because no agent runs; whether an agent understands the request; and whether an ability can make the change, because the writers make it. Only a run shows those.
