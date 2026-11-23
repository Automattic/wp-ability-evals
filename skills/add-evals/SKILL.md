---
name: add-evals
description: Adds evals to a wp-ability-evals project, from a site owner's story to proven scenarios and a run whose result was read. Use when asked to write or change a story or a scenario, to cover an ability with evals, to run a story's scenarios, or to say why a scenario failed.
---

# Add evals

An eval starts as a **story**: what a site owner wants, in a person's words. Its **scenarios** are data made from the story. They are proved without an agent, then run with agents. This skill is the order of that work and the judgment in it.

The commands are in the project's `AGENTS.md`. The formats and what their output means are in `.agents/guide/`, one file per topic. Each step names the file to read.

**This project's own rules** for this work are in `.agents/rules/add-evals.md`. Read that file first, when the project has it. Its rules add to the steps here, and where the two differ, the project's rule wins. A new rule of the project is written there too: this file is the package's, and `update` replaces it.

Three things are the person's to decide, so stop and ask at each: the story, the scenarios, and anything that spends their plan.

## 1. The story

The story is the `story` text of a file in `packs/<pack>/scenarios/` (`.agents/guide/story-files.md`). Keep the person's words, and add none of your own without asking. Scenarios can be made from a story that has three parts:

- **On the site:** what the owner has before asking.
- **Should happen:** each thing the owner asks for and gets.
- **Must not happen:** what would make the owner regret having asked.

Ask for a missing part before any scenario is written, one question at a time. What people most often leave out: what happens when two items fit the request, what happens when none fits, and what must be left alone. The scenarios of step 3 are made from those answers, so the report at the end is too late for the question.

Done when the three parts are in the file, `npx wp-ability-evals validate` passes, and the person has agreed to the story as it stands in the file. Sorting their sentences under the three parts is a change they must see. Only a story that was complete and is saved word for word needs no second yes.

## 2. What can be graded

Before writing a scenario, read:

- the pack's `pack.yaml`: the abilities a run may execute and the pack's entity types
- `npx wp-ability-evals site state local`: the keys and fields the site can show, as it prints them. Start the site first with `site start local` when it is not running.
- the pack's other story files, so that a scenario is written once and reads like its neighbours

Then take the story sentence by sentence and ask where its result would show:

1. In a field `site state` prints: grade it there.
2. Nowhere on the site, and one ability alone does the task: `expect.abilities` can stand in.
3. Neither, or only on the way, such as a post that is published and then set back to draft: the sentence can't be graded yet. It needs a new entity type (`.agents/guide/entity-types.md`) or a hook, such as an after-trial hook that checks the tool calls (`.agents/guide/hooks.md`), which is code in `extensions/` or `hooks/`. Ask before writing that code, because the person may want a developer to do it. Write no scenario that only looks like a check, such as a rubric that takes the agent's word for a change. Keep the sentence for the report in step 5.

## 3. The scenarios

A scenario earns its place when it can fail because of something the abilities own, such as a name, a description, a schema, an error message or a missing ability, and when a correct result can be seen. Each one costs a trial per agent, times the number of trials, in every run. So write the few that can each find a different problem. The same case in other words finds nothing new.

From the story, write:

- **The plain case** of each "Should happen" sentence.
- **A near-miss:** starting content with an item close to the one meant, such as a similar title, or the same topic in another status. The easy mistake is then to act on the wrong item, or on both. Name only the right item in `expect.site`: the site check fails a trial for anything else that changed. Where the story fixes what the site holds, put the near-miss in the request instead: one that comes close to an item that is there, such as a welcome post on a site that has "Hello world!".
- **A case where the agent must not act:** nothing fits the request, or two items fit and the request does not say which. The site must stay as it is, so the scenario's `kind` is `read`, a rubric grades that the answer says what was found and does not say that anything was changed, and the ability that would act goes under `expect.forbidden`: here even a refused try is acting without being asked. Where the story was agreed and says nothing about these cases, write them from its "Must not happen" part, and list each as a choice of yours in the report. For a story that creates, the case is what its "Must not happen" names, such as an item that is already there and would be doubled; where it names none, write none.
- **A request the site can't do,** where the story has one: the owner asks for something no ability does, or something an ability refuses, such as a setting that can be read but not changed. Agents try whatever might do what was asked, so a correct agent either sees from the descriptions that it can't, or tries and is refused. Both are right. Grade only what holds on both paths: `kind: read`, so the site must stay as it is, and a rubric that the answer says the change was not made or can't be made this way. Forbid nothing, since a refused try is no mistake. Where a workaround could change something else, such as the admin user's email in place of the site's, check that the site check can see it.

Then go through the "Must not happen" sentences. For each, name the scenario that fails when it happens. The site check usually catches it without the item being named. Where no scenario would fail, add the starting content that makes the mistake possible.

Name in `given` every item a scenario depends on, also one the site starts with, such as "Hello world!". `createGiven()` then puts it back if a hook removed it, and the comparison before each trial checks its fields, so nothing takes the scenario's point away without a word.

**The request** is all the agent under test gets:

- The owner's words, about things as the owner knows them: a title or a topic. Never a slug, an ID or a key, and never an ability or a tool.
- Where the request happens. The agent under test is a general assistant with the site connected, so where the verb also means "write it here", such as draft, write, list or summarize, the request says it is on the site: "Draft a post on my site titled …".
- No hint about how to do it or where to look, such as "including drafts" or "search first". A request with a hint passes whatever the ability's description says.
- One correct result. Read the request as someone who wants to misread it. If a second sensible reading exists, the trials split between the two and the scenario shows nothing. Where an unclear request is the point, the correct result is to ask back: that is the "must not act" case.
- Starting content an owner would really have. A post titled "Test post 1" tells the agent it is being tested.

**What to expect:**

- Only what the request fixes. A field the agent words itself, such as the text of a new post, fails correct runs when it is written out in full: use `$contains` with the facts from the request (`.agents/guide/expect-site.md`).
- The site before the abilities, and code before a judge: `expect.abilities` only as in step 2, and a rubric only where `contains` can't decide.
- For abilities that are not built yet, `state: to-be-implemented` with a `reason` that names the issue. The scenario is written and proved in the same way.

## 4. Prove them

Run `npx wp-ability-evals validate`, then `npx wp-ability-evals verify --site local --no-judges --filter <pack>/<story file>/`. Neither calls a model. `.agents/guide/verify.md` says how to read each line.

Fix a scenario by making it say what the story says. One that was loosened until `verify` passed proves nothing. Read the lines that pass too: a `the change` line that names an item the site does not start with shows a mistyped key, unless the agent should create that item.

Done when `validate` reports nothing and `verify` ends without `FAILED` or `COULD NOT BE CHECKED`. The scenarios are not agreed yet: the person agrees to them in the report of step 5, before anything runs them.

## 5. Report, and stop

Tell the person, in this order:

1. **The scenarios:** for each, its request and what it grades, and every choice you made that the story does not fix. They are the person's to agree to, so ask.
2. **Coverage:** each "Should happen" and "Must not happen" sentence of the story, with the scenario that fails when it breaks, or "not covered" and why. No command checks this. The list is the only way the person sees it.
3. **What could not be written,** from step 2, and what each needs.
4. **What is not proved yet:** the rubrics, which `--no-judges` leaves ungraded, and `expect.abilities` and `expect.forbidden`, which only a run shows.
5. **What the next steps cost,** counted from `evals.config.ts`, and which of them they want:
   - Grading the rubrics, with `verify` without `--no-judges`: two answers per rubric, graded by every judge.
   - A run: scenarios × agents × trials on each site it runs on, plus one judge call for each trial of a scenario with a rubric. `--trials 1` is a cheap first look at a new scenario. It is not a verdict.

Start neither without their word.

## 6. Run, and read the result

Run what was asked, such as `npx wp-ability-evals run --site local --agent claude-code --filter <pack>/<story file>/`.

Read `run.json` in the newest folder under `results/`, then the file of each trial that failed (`.agents/guide/results.md`). Decide whose failure it is from `transcript.toolCalls` and the two readings of the site, never from what the agent says it did:

| The trial shows | It belongs to | Then |
| --- | --- | --- |
| "could not be judged" | The setup: a hook, the site, a sign-in | It is no verdict. Repair the setup and run again. |
| The ability never ran, or another one ran | The ability's name or description | Report it. The scenario stays. |
| The ability ran with wrong arguments, or returned an error the agent could not act on | Its schema, its description or its error message | Report it. The scenario stays. |
| The ability ran as asked, and the site is not as expected | The ability, or an `expect.site` that leaves out something the ability is right to change | Find out which before saying so. |
| The agent did something sensible that the request allows | The scenario | Make the request say one thing, and prove it again. |

- **The scenario is the fixed point.** When a failure belongs to the abilities, the scenario stays as written, and `expect` is never changed to fit what an agent did. Change a scenario only where it says something else than the story, and then prove it again.
- **Some trials pass and some fail:** the scenario failed. Say what differs between the tool calls of a passing and a failing trial.
- **A pass needs one look too.** Open one passing trial of each scenario and check that it passed for the reason the scenario exists. A "must not act" scenario also passes when the agent never looked at the site.

Report each scenario's count for each agent, the cause of each failure in one line with the tool call that shows it, and whether the ability or the scenario has to change.

A scenario's `state` is the person's to change. Suggest removing `to-be-implemented` when every trial passes on every agent, which the run reports as "passed unexpectedly". Suggest `known-defect` only for a bug that has an issue.
