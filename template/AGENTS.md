# Ability evals project: agent guide

This folder holds evals for WordPress abilities, run with the `wp-ability-evals` package: tasks a site owner would hand an agent, done by real agents on a real site, graded on what changed on the site.

<!-- BEGIN wp-ability-evals guide. From this line to the END line the text comes with the package, and `npx wp-ability-evals update` replaces it. Write this project's own rules above this line or below the END line. -->

## Commands

- Install: `npm install`
- Check the settings and every pack, story and site file: `npx wp-ability-evals validate`. It lists every problem and what to write instead. Run it after each change. It also notes the abilities that no scenario names in `expect.abilities`: no evaluation covers them yet. A note is no problem.
- List the packs, their stories and each story's scenarios: `npx wp-ability-evals list`. A story with no scenarios yet shows as waiting for them. A scenario with starting content shows how many items it starts with, by entity type, such as `given: 2 posts`.
- Start a site: `npx wp-ability-evals site start local`. The first start sets the site up and takes a few minutes. It needs Docker running. Every start puts the site in its clean state, runs the `beforeRun` hooks of `evals.config.ts` and marks the result as the site's start: what every trial begins from, before its scenario's `given` is added.
- Check that a site has the abilities its packs list: `npx wp-ability-evals site check local`. It starts the site as a run does, lists its MCP server's tools with MCP Inspector (`--strict`), names the listed abilities the site lacks and the site's tools that no pack lists, and checks the listed abilities' definitions (schema portability, missing descriptions, contradictory `readOnlyHint` annotations, plus any opt-in `serverChecks` hint or direct-tool rules in `evals.config.ts` or `sites/<name>.json`). It ends with an error on missing abilities not waiting to be built or on error-severity definition problems. A run does the same first: a scenario that names a missing ability is not run ("could not be judged", unless `to-be-implemented`), while definition problems are recorded without skipping scenarios.
- See what is on a site: `npx wp-ability-evals site state local`. Use the keys and fields it prints when writing `given` and `expect.site`. Run `site reset local` first: `run` and `verify` leave the site as their last trial or scenario left it, also when they were stopped, and the reset puts it back at its marked start, as the last `site start`, run or `verify` left it for its trials.
- Prove the scenarios without an agent: `npx wp-ability-evals verify --site local --no-judges`. Run it after writing or changing a scenario, once `validate` passes. It needs Docker and starts the site if needed. With `--no-judges` it calls no model, so it costs nothing but time. Add `--filter <text>` to prove only the scenarios whose id contains the text, or `--shard <n>/<m>` for one slice. `.agents/guide/verify.md` says how to read it.
- Stop a site: `npx wp-ability-evals site stop local`. It keeps its data.
- Remove a site with its data: `npx wp-ability-evals site remove local`. The next start sets it up again, which takes a few minutes, so do this only when asked or when the site is broken.
- Run: `npx wp-ability-evals run --site local --agent claude-code`. The agents are the names under `agents` in `evals.config.ts`; repeat `--agent` to run several. Add `--filter <text>` to run only the scenarios whose id contains the text, `--shard <n>/<m>` to split scenarios into slices (run in parallel when each slice has its own site, or sequentially when they share one), and `--trials 1` for a quick look while writing a scenario. A run starts the site if needed, prints one line per trial and a summary, and saves each trial in `results/` as it ends.
- Merge split runs into one run folder: `npx wp-ability-evals merge --out <results-dir> <run-folder> [<run-folder>...]`. Combines sharded or per-agent run folders, copies their trial files and `server.json`, and recomputes verdicts across agents.
- Look at the coverage of the abilities and the saved runs in a browser: `npx wp-ability-evals view`, then open `http://localhost:4400`. It runs until stopped, so start it for a person, not to read results yourself: read the files in `results/` instead. Pass `--export <folder>` to write a static copy, and `--results <dir>` to read from another results folder.
- Take the package's newer skills and guide: `npx wp-ability-evals update`, after installing a newer version of the package, or when `validate` says that they are not the installed package's here. It replaces what came with the package, the skills in `.agents/skills/`, the guide's files in `.agents/guide/` and the guide in this file, and lists what it wrote. Nothing else in the project is touched. Where someone changed one of them in this project, it names the file, writes nothing and says what to do. Tell the person, and add `--overwrite` only on their word: it discards the change.
- An agent that is not signed in makes its trials end as "could not be judged", with the command that signs it in. Codex needs a sign-in of its own, which only the user can make: `mkdir -p ~/.wp-ability-evals/codex && CODEX_HOME=~/.wp-ability-evals/codex codex login`.

## Where things are

- `AGENTS.md`: this file. Its guide, from the `BEGIN wp-ability-evals guide` line to the `END wp-ability-evals guide` line, comes with the package, and `update` replaces it. This project's own rules go outside those two lines, where `update` leaves them alone. Here the guide holds the commands, where things are and the rules; the rest is in `.agents/guide/`.
- `evals.config.ts`: the packs, the agents and how each signs in, the judges and which one grades each agent, the number of trials, the hooks. It lists `createGiven()` under `hooks.beforeTrial`, which puts each scenario's `given` on the site. Each agent runs each scenario that many times, and the scenario passes only when every trial passes, because one pass can be luck. Tokens grow in step with the number.
- `packs/<name>/pack.yaml`: one set of abilities, with the abilities a run may execute.
- `packs/<name>/scenarios/*.yaml`: its story files, one story per file with the scenarios made from it. A scenario's id is `<pack>/<file name>/<slug>`. `.agents/guide/story-files.md` has the format.
- The formats, field by field: `node_modules/wp-ability-evals/dist/scenarios/types.d.ts` and `dist/packs/types.d.ts` there.
- `sites/<name>.json`: one site to run on. `wpEnv` is its wp-env configuration; a path there that starts with `.` is read from this folder. Its `port` must be one that no other site on this machine uses, another project's included: a start on a port in use stops and says what holds it. `afterRun` says what happens to the site after a run: `keep` leaves it running and is the default, `stop` stops it, `remove` removes it with its data. The `abilities-as-tools` plugin in `local.json` gives the agent one tool per ability, in place of the MCP Adapter's three tools that find, describe and run any ability; list it in any other site file too.
- `extensions/`: this project's own agents, entity types and kinds of site. Create it when the first one is needed.
- `hooks/`: this project's own hooks, the functions that prepare a site and clean it up. Create it when the first one is needed. `.agents/guide/hooks.md` shows how they are named and when they run.
- `results/`: one folder per run, named after the time it started. Not committed. `.agents/guide/results.md` says what its files hold and in which order to read them.
- `.wp-ability-evals/`: what the package keeps for each site, such as its snapshots and sign-in. Not committed; don't edit it.
- `.agents/skills/`: the skills that came with the package. `add-evals` drives adding evals, from a story to a run whose result was read: use it for that work. `.claude/skills/` holds a link to each, because Claude Code looks only there. They are the package's, and `update` replaces them, so this project's rules for a skill's work go in `.agents/rules/`. A skill of this project's own goes next to them under a name of its own, with a link of its own.
- `.agents/guide/`: the rest of the guide, one file per topic. They came with the package, and `update` replaces them, like the skills. The next section says which to read before which work.
- `.agents/rules/<skill>.md`: this project's own rules for the work a skill drives, such as `.agents/rules/add-evals.md`. The skill reads its file first, and where the two differ, the project's rule wins. Create the file when the first rule is needed.
- `.agents/wp-ability-evals.json`: the record of what the package copied into this project. With it, `update` tells a change made here from an older version of the package. Commit it, and don't edit it.

## Read before the work

The rest of the guide is in `.agents/guide/`, one file per topic. Read the file before the work it names, each time: the formats, the operators and what each message means are there and nowhere else.

- Writing or changing a story file: `.agents/guide/story-files.md`.
- Adding a pack, or an ability to one, or a trial that ran an ability no pack lists: `.agents/guide/packs.md`.
- Adding an entity type, or a scenario about something `site state` does not show: `.agents/guide/entity-types.md`.
- Writing `given`, or a trial or `verify` line that says "The site could not be prepared:": `.agents/guide/starting-content.md`.
- Writing `expect.site`, or a failed site check: `.agents/guide/expect-site.md`.
- Writing `expect.abilities` or `expect.forbidden`, or a failed check on abilities: `.agents/guide/expect-abilities.md`.
- Running `verify` and reading its lines: `.agents/guide/verify.md`.
- Writing or changing a hook: `.agents/guide/hooks.md`.
- Reading a run's results: `.agents/guide/results.md`.

## Rules

- Never edit anything under `node_modules/wp-ability-evals`. To add an agent, an entity type or a kind of site, write it in `extensions/` and name it in `evals.config.ts`.
- A scenario's request is in the site owner's own words. It names no tool and no ability.
- Use `expect.answer.rubric` only where `contains` can't decide: it costs one more model call per trial. Write it as what a correct answer says and what makes it fail. A judge grades by the rubric alone, so put every fact it needs in it. Give it a `reference` and a `wrong` answer.
- After writing or changing a scenario, run `validate`, then `verify --site local --no-judges`, and fix what they report before anything runs it.
- `expect.abilities` names the abilities a correct run executes, and `expect.forbidden` those that must not run. Name an ability under `abilities` only when no other ability can do the task: a run that used another one would fail. `.agents/guide/expect-abilities.md` shows both.
- Nothing an agent under test can see may say it is an evaluation or a test: not the request, the starting content in `given`, what a hook puts on the site or any name.
- Packs hold data only. Code goes in `extensions/` and `hooks/`.
- A live run spends the user's agent plan or API credit. Start one only when asked. `verify` spends each judge's plan or API credit unless it has `--no-judges`: leave that option out only when asked.

<!-- END wp-ability-evals guide -->
