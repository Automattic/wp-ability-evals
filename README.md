# WP ability evals

Evals for WordPress abilities. Each one is a task a site owner would hand an agent. A real agent (Claude Code, Codex) does it on a real site, and the result is graded on what changed on the site.

By default the agent reaches the abilities through the MCP Adapter, with a plugin that comes with the package and makes each ability a tool of its own, in place of the Adapter's three tools that find, describe and run any ability. "How the agent reaches the abilities" below says why.

**Status: early.** A scenario runs end to end with Claude Code or Codex on a local site: `run` resets the site, lets the agent work, checks the site and the answer, and saves the result. A project's hooks prepare the site and clean it up at fixed points of the run. A scenario's starting content is put on the site before each trial, and the agent works only once the site was read and found to start as the scenario says. `verify` proves a scenario on the site without an agent, before a run spends anything on it.

## Two pieces

- **The package** (this repository): the framework. It is installed as a dependency and updated like one.
- **A project**: the folder where someone's evals live, in any repository. It holds its settings, packs, sites and its own extensions. A project never changes the package.

## Start a project

Clone and build this repository once, then initialize a project folder from it:

```bash
git clone https://github.com/Automattic/wp-ability-evals.git
cd wp-ability-evals && npm install
npx /path/to/wp-ability-evals init my-evals
cd my-evals
npm install
```

`init` writes nothing if one of its files is already there.

A project keeps a copy of two things that stay the package's: the skills, and the guide, in its `AGENTS.md` and `.agents/guide/`. After installing a newer version of the package, `npx wp-ability-evals update` takes the newer ones into the project. `validate` says when they differ from the installed package's. A copy that someone changed in the project is not replaced without a word: `update` names it and writes nothing, and `update --overwrite` replaces it too. A project's own rules have places `update` never touches: `AGENTS.md` outside the guide, and `.agents/rules/<skill>.md` for the work a skill drives, which the skill reads first.

Inside the project:

```bash
npx wp-ability-evals validate          # checks the settings and every pack, story and site file, and lists every problem; notes the abilities no scenario names
npx wp-ability-evals list              # the packs, their stories and each story's scenarios with their kind, their state and how many items each starts with
npx wp-ability-evals site start local  # starts the site in sites/local.json as a run finds it, setting it up the first time; needs Docker
npx wp-ability-evals site check local  # starts the site as a run does and compares its MCP server's tools with its packs, with MCP Inspector
npx wp-ability-evals site state local  # prints what is on the site, as the entity types of its packs read it
npx wp-ability-evals site reset local  # puts the site back as the last start or run left it for its trials
npx wp-ability-evals site stop local   # stops the site; it keeps its data
npx wp-ability-evals site remove local # removes the site with its data; the next start sets it up again
npx wp-ability-evals update            # takes the installed package's skills and guide into the project; everything else is left alone

# Proves every scenario of the site's packs without an agent: its starting content, its site check and its answer.
npx wp-ability-evals verify --site local --no-judges   # calls no model
npx wp-ability-evals verify --site local               # also has every judge grade the two answers next to a rubric; this spends each judge's plan or API credit
npx wp-ability-evals verify --site local --no-judges --filter which-wordpress   # only the scenarios whose id contains the text

# Runs every scenario of the site's packs with Claude Code. This spends the agent's plan or API credit.
npx wp-ability-evals run --site local --agent claude-code

npx wp-ability-evals view              # shows the coverage of the abilities and the saved runs in a browser, at http://localhost:4400, until stopped with Ctrl+C
npx wp-ability-evals run --site local --agent claude-code --agent codex            # with both agents, one after the other
npx wp-ability-evals run --site local --agent claude-code --filter which-wordpress   # only the scenarios whose id contains the text
npx wp-ability-evals run --site local --agent claude-code --trials 1                 # one trial per scenario, for a quick look
```

`run` starts the site if needed, prints one line per trial, then a summary, and saves each trial in `results/` as it ends. It ends with an error when a scenario that should work failed or could not be judged; a scenario that failed as expected does not count.

Each agent must be installed, and signed in or given a key. A judge uses the same command and sign-in as the agent of its vendor:

| Agent | `signIn: 'login'` | `signIn: 'api-key'` |
| --- | --- | --- |
| Claude Code (`claude`) | The sign-in it already has on this machine. | `ANTHROPIC_API_KEY` |
| Codex (`codex`) | A sign-in of its own, made once: `mkdir -p ~/.wp-ability-evals/codex && CODEX_HOME=~/.wp-ability-evals/codex codex login` | `OPENAI_API_KEY` |

Codex keeps its sign-in in the same folder as your settings, rules and skills, so the evals give it a home of its own. Your own Codex is not touched.

What it creates:

| Path | Answers | Holds |
| --- | --- | --- |
| `packs/` | What is tested | One folder per set of abilities: its ability list, and its stories with their scenarios. Plain data, no code. |
| `sites/` | Where it runs | One file per site. A new project has one local site, `local.json`, running the MCP Adapter with the `abilities-as-tools` plugin. |
| `evals.config.ts` | With what | Which packs, which agents, how each signs in, how many trials, the project's hooks and its extensions. |
| `extensions/` | What the project adds | Its own agents, entity types and kinds of site. Created when the first one is needed. |
| `hooks/` | How a site is prepared | Its own hooks: the functions that prepare a site and clean it up, named in `evals.config.ts`. Created when the first one is needed. |
| `AGENTS.md` | How to work here | The guide for an agent working in the project: the commands, where things are, the rules, and which file of `.agents/guide/` to read before which work. The guide is the package's, between two marker lines, and `update` replaces it. The project's own rules go outside those lines. |
| `.agents/guide/` | The rest of the guide | One file per topic, such as the format of a story file or the lines of `verify`. They are the package's, and `update` replaces them. |
| `.agents/skills/` | How to do each job | The skills that ship with the package. `add-evals` drives adding evals, from a story to a run whose result was read. `.claude/skills/` links to each one, because Claude Code looks only there. `update` replaces them, so a project's own skill gets a name of its own. |
| `.agents/rules/` | What this project adds to a skill | One file per skill, named after it, with the project's own rules for that work. The skill reads it first. Created when the first rule is needed. |
| `.agents/wp-ability-evals.json` | What the package copied | A hash of each copied skill and guide file, and of the guide in `AGENTS.md`, so that `update` can tell a change made in the project from an older version. Committed. |
| `results/` | What happened | One folder per run. Not committed. |
| `.wp-ability-evals/` | What the package keeps | Each site's snapshots and sign-in. Created by the first `site start`. Not committed. |

## A story and its scenarios

A pack's `scenarios/` folder holds one file per story. A person writes the story in plain words: what a site owner wants, what is on the site, what should happen and what must not. The scenarios under it are data made from the story, usually by an agent. The story stays once they exist, and when its words change, the scenarios follow.

```yaml
# packs/content/scenarios/publish-a-draft.yaml
story: |
  As a site owner I want to publish a draft by asking for it, without opening the editor.

  On the site: two drafts, "Summer sale" and "Winter sale".
  Should happen: the draft I mean is published.
  Must not happen: another draft is published, or the text of a draft changes.

# Optional. Starting content for every scenario of the story.
given:
  posts:
    summer-sale: { title: Summer sale, status: draft }

scenarios:
  - id: content/publish-a-draft/by-its-topic
    request: Publish my draft about the summer sale.
    kind: write
    # Optional. Starting content for this scenario only, added to the story's.
    given:
      posts:
        winter-sale: { title: Winter sale, status: draft }
    expect:
      site:
        posts:
          summer-sale: { status: publish }
```

- **`story`** is required. It is free text, for people and for the agents that write scenarios; no check reads it.
- **`scenarios`** may be empty or left out: a story can wait for its scenarios, and `list` says so. A scenario's id is `<pack>/<file>/<slug>`.
- **`given`** is starting content: what is on the site before the agent works. It has the shape of `expect.site`: the entity type, then the item's key, then its fields. An item can't be `removed` there, and its values are plain: `$new` and `$contains` belong in `expect.site`.
- **A scenario starts from its story's `given` joined with its own.** The same item at both levels is a problem that `validate` reports.
- **A hook puts `given` on the site before each trial**, and the site is then compared with it. "Starting content" below says how.

`list` prints each pack by story: the story's first line, then its scenarios, each with its kind and its state. A scenario with starting content also shows how many items it starts with, by entity type, its story's and its own together:

```
content: Content (1 story, 1 scenario)
  publish-a-draft: As a site owner I want to publish a draft by asking for it, without opening the editor.
    content/publish-a-draft/by-its-topic  write  implemented  given: 2 posts
```

## How a run works

1. A **scenario** gives the request and what must be true afterwards.
2. The **site** starts in its clean state, the project's before-run **hooks** prepare it, and the site marks that as its start. It hands out the address of its MCP server.
3. Before each trial the site goes back to its marked start, and the before-trial hooks put the scenario's **starting content** on it. The site is read, and must start as the scenario says. Then an **agent** gets the request and the address, and works on the site. It runs as a first-time user would have it: signed in, in an empty folder, with none of your own settings or skills, and with no sign that it is being evaluated.
4. **Checks** compare the site before and after, look at which abilities ran, and read the answer.
5. Each trial is saved, and every scenario gets a **verdict** across its trials and agents. It passes only when every trial of every agent passes.

`CONTEXT.md` defines these words.

## Hooks

A site often has to be prepared before an agent works on it, and cleaned up afterwards. A project does that with hooks: its own functions, named in `evals.config.ts` at the point of a run where they run. The package fixes six points and their order. What a hook does is the project's own code, so it can run anything.

```ts
// evals.config.ts
import { createGiven, defineConfig, isWpEnvSite, type RunHookContext } from 'wp-ability-evals';

async function seedTheShop({ site }: RunHookContext) {
  if (isWpEnvSite(site)) await site.wp(['post', 'create', '--post_title=Summer sale', '--post_status=draft']);
}

export default defineConfig({
  // ...
  hooks: {
    beforeRun: [seedTheShop],
    beforeScenario: [],
    beforeTrial: [createGiven()],
    afterTrial: [],
    afterScenario: [],
    afterRun: [],
  },
});
```

Every point is optional, and each takes a list of functions, run in the order written. `createGiven()` is the hook that comes with the package: it puts a scenario's starting content on the site, as "Starting content" below says.

**The order in a run**

1. The site starts, in its clean state: as it was when it was set up.
2. The `beforeRun` hooks.
3. The site marks its start. From here on a reset returns to the site as the before-run hooks left it, so what they put there is on the site in every trial.
   Then the server checks list the site's MCP tools with MCP Inspector and compare them with the packs, as `site check` does. A scenario that names an ability the site lacks is left out: its trials are "could not be judged", or fail as expected for a `to-be-implemented` scenario, and none of its hooks run. A server that can't be read leaves out every scenario. Each trial left out is saved with why, and no agent runs for it.
4. For each scenario that is not left out: the `beforeScenario` hooks; then, for each agent and trial, the site is reset, the `beforeTrial` hooks run, the site is read and compared with what the scenario says it starts with, the trial runs, and the `afterTrial` hooks run; then the `afterScenario` hooks.
5. The `afterRun` hooks. Then the site is kept running, stopped or removed, as its site file says.

**What a hook gets** is one object:

- `site`: the started site, with `state()` to read it and `apply(change)` to change it. A `wp-env` site also has `wp(args)`, which runs WP-CLI on the site as the admin user and returns what it printed. `isWpEnvSite(site)` tells such a site apart; other kinds of site do not have it.
- `run`: when the run started, the site's name, the names of the agents and the number of trials per scenario.
- `scenario`, at the points around a scenario and a trial.
- `agent` and `trial`, the agent's name and the trial's number, at the points around a trial.
- `result`, in an after-trial hook: how the trial ended.

In `verify` no agent runs, and a hook can tell: `run.agents` is empty, and `agent` is the text `verify`. "Proving a scenario without an agent" below says which hooks run there and what an after-trial hook gets.

**An after-trial hook may return checks of its own**, such as `[{ check: 'no-email-sent', pass: true, reason: 'No email was sent' }]`. They are added to the trial's checks and count like any other.

**When a hook fails**, which is when it throws, the framework decides what that means:

| The hook that failed | What happens |
| --- | --- |
| `beforeRun` | The run stops with the hook's name and its message, and no trial runs. The site is left as it is. |
| `beforeScenario` | Every trial of that scenario "could not be judged". The run goes on with the next scenario. |
| `beforeTrial`, `afterTrial` | That trial "could not be judged", with the hook's name and its message. |
| `afterScenario`, `afterRun` | The failure is reported and saved with the run, the run goes on, and it ends with an error. |

A before-hook that fails stops the hooks after it at that point. After-hooks always run once the before-hooks of their point were reached, whatever failed in between, and each one runs even when another failed, so cleanup is not skipped. When something else stops a run after its start, such as a site that no longer answers, the `afterRun` hooks still run, and what goes wrong in them is reported with that failure.

**After a run**, the site file says what happens to its site, with `"afterRun"` next to `"kind"`: `"keep"` leaves it running and is the default, `"stop"` stops it, and `"remove"` removes it with its data.

**Outside a run**, `site check` does steps 1 to 3 with the server checks (including `--strict` schema portability, missing description and `readOnlyHint` annotation checks on the listed abilities), then step 5, and ends with an error when the server can't be read, lacks a listed ability that is not merely waiting to be built, or has an error-severity definition problem. `site start` does steps 1 to 3, so a person sees the site at the marked start that every trial begins from, and `site reset` returns to it. `verify` does all five steps, with the site's writers in the place of an agent. `site remove` removes a site's containers and data, and its folder in `.wp-ability-evals/`.

## Starting content

A scenario's `given` says what is on the site before the agent works. Two things make that true on a real site: a hook puts the content there, and the framework checks that it is there.

**A hook puts it there.** `createGiven()` comes with the package. Listed under `hooks.beforeTrial`, it makes each `given` item of the scenario before every trial, as the admin user. A new project lists it:

```ts
// evals.config.ts
hooks: {
  beforeTrial: [createGiven()],
},
```

It is the one hook that is called where it is listed, because the call returns the hook. Nothing creates `given` behind the scenes: a project that prepares its sites another way, such as from a seed file, leaves `createGiven()` out and lists a hook of its own.

**The framework checks it.** When the site has marked its start, after the `beforeRun` hooks, it is read once. Before each trial, after the `beforeTrial` hooks, it is read again, and must be as it was at its marked start plus the scenario's `given`:

- Of a `given` item, only the fields the scenario names are compared.
- Everything else must be as at the marked start. An item that is in neither, an item that is gone and an item that changed each count as a difference.
- What a `beforeRun` hook seeded is part of the marked start, so no scenario has to declare it.

A difference stops the trial before the agent runs. The trial "could not be judged", and its reason names each difference:

```
The site could not be prepared: posts summer-sale: status is "publish", expected "draft"; posts old-news: on the site, but neither at its marked start nor in the scenario's `given`
```

So a `beforeTrial` hook may put on the site only what `given` names. Content that every trial needs belongs in a `beforeRun` hook. The comparison sees what the entity types of the site's packs read, as the site check does.

**A writer makes each item.** An entity type has a writer next to its reader, for each kind of site. `posts` has one for `wp-env`: it creates a post with its key as its slug, also for a draft, so the post is read back under the same key; it changes a post that is there; and it moves a post to the trash. A post without a slug is on the site under `#` and its ID, such as `#12`: the writer finds it by that ID to change or remove it, and creates nothing under a key of that form. A hook of a project's own, such as a `beforeRun` hook that seeds the site, reaches the writers through the site:

```ts
await site.apply({ posts: { 'summer-sale': { title: 'Summer sale', status: 'draft' }, 'hello-world': 'removed' } });
```

The change has the shape of `expect.site`, with plain values. It reaches the site as data, so a title may hold quotes or a `$`. `validate` reports a `given` for an entity type that has no writer for the site's kind, and an `expect.site` for one too, because `verify` makes the expected change through the writer.

## The change a scenario expects

`expect.site` says how the site must have changed when the agent is done: the entity type, then the item's key, then the fields the item ends up with, or `removed`. Everything it does not name must be as it was before the trial. So a trial fails when the change was not made, and also when the agent changed, created or removed something on the side.

An item is written under its key, the one `site state` prints, and a field with the value it must equal. Two things can't be written that way, and each has an operator. An operator is a key that starts with `$`, so it is never taken for a field, a plain value or a typo.

**`$new: true` marks an item the agent should create, where the scenario can't know its key.** The site chooses the key of what is created on it: a post that is saved as a draft has no slug yet, and `site state` prints it under `#` and its number. The item's key in the file is then a label the scenario chooses, and the item is found by its fields.

```yaml
expect:
  site:
    posts:
      sale-announcement: # a label the scenario chooses, not a key on the site
        $new: true
        status: draft
        title: Summer sale
```

- **A created item fits a label** when it is on the site after the trial and was not before, no key of `expect.site` names it, and it has the label's fields. Its other fields are not checked.
- **Exactly one created item must fit each label, and a created item stands for one label only.** Each label is decided on its own, against every created item, so the result does not depend on the order of the file or of the site. Nothing is guessed: when two items fit, the check fails. Name enough fields to tell the new items of a scenario apart.
- **A created item that fits no label** fails the trial, like any item the scenario does not expect.

The reasons name the label and the items:

```
posts sale-announcement: expected a new item with status "draft", title "Summer sale", but found none among the created items: #12 (status is "publish", expected "draft")
posts sale-announcement: expected one new item with status "draft", title "Summer sale", but 2 created items fit: #12, #13
posts #12: the only created item that fits each of the new items sale-announcement, sale-reminder, and a created item can be only one of them
posts #13: created, which the scenario does not expect
```

**`{ $contains: [texts] }` compares a field by what it contains**, for a text the agent words itself. The field's value, as text, must contain every text, in any letter case, as `expect.answer.contains` asks of an answer. It may stand on any item, new or not.

```yaml
expect:
  site:
    posts:
      summer-sale:
        content: { $contains: ['20%', 'July'] }
```

**Which way to write an item**

| The item | Write it |
| --- | --- |
| It is on the site before the agent works. | Under its key. |
| The agent creates it, and the scenario knows the key it gets, such as a published post, whose slug WordPress makes from its title. | Under that key, without `$new`. |
| The agent creates it, and the site chooses a key the scenario can't know, such as a draft. | Under a label, with `$new: true`. |

A key without `$new` is always looked for on the site. When it is not there after the trial, the reason is `expected, but not found`, so a mistyped key is caught and never taken for a new item.

`validate` reports an operator it does not know, a `$new` that is not `true`, a `$new` item that names no field, and a `$contains` that is not a list of text. Starting content takes no operator: `given` is put on the site as it is written.

## The abilities a scenario expects

A scenario is graded on the site wherever the site can be read back. Where it can't, a scenario says more about the abilities: which a correct run executes, with which arguments, and which must not run.

```yaml
expect:
  abilities:
    - core/content-query
    - core/content-update: { status: publish }
    - core/content-query: { status: [draft, pending] }
  forbidden: [core/content-delete]
```

**`expect.abilities` lists the abilities that must run.** An entry is an ability's name, or that one name mapped to the arguments the ability must have run with.

- **A name alone**: the ability ran at least once without an error.
- **A name with arguments**: one call of the ability, without an error, had every named argument. The call's other arguments are free.
- **A value is text, a number, `true` or `false`.** It is compared as the site check compares a field's plain value, so a number matches its text: `id: 12` is met by `"12"`. Nothing else matches a value of another type: `true` is met by `true` alone, not by `1`.
- **A list means one of its values.** `action: [list, get_settings]` is met by a call with either. So an argument whose own value is a list can't be expected, and neither can one whose value is a mapping: leave such an argument out.
- **Other calls are allowed**: of the same ability with other arguments, and of other abilities.

**`expect.forbidden` lists the abilities that must not run at all.** A call that failed counts too, because the agent tried. It takes names only, and it is checked whatever the scenario's kind. Use it where even a try is a mistake, such as the ability that would act when two drafts fit the request and the agent should ask which one. A `none` scenario already fails when any ability runs, refused or not.

**A refused call is no mistake anywhere else.** Agents try whatever might do what was asked, and a call that came back with an error changed nothing. So a `read` scenario fails only when an ability that changes the site ran without an error, and any scenario when an ability that no pack lists ran without an error. An agent asked for a change the site can't make passes whether it sees that from the descriptions or tries and is refused, as long as the site stays as it is and its answer says so.

**The order of the calls and their number are not checked**, and a scenario can't expect them. An agent may take another valid path than the scenario's author thought of, such as a lookup first or a second try, and a check on its steps would fail it. For the same reason, name an ability under `abilities` only when no other ability can do the task.

**Where the arguments are** depends on how the site's server presents abilities, and the checks read both ways. Where an ability is a tool, the tool's input is the ability's input. Where a tool runs any ability, that tool's input names the ability and holds the ability's input in an argument of its own, which the MCP Adapter calls `parameters`.

The reason of a failed check names the ability, the arguments that were expected, and what each of its runs had for them:

```
core/content-update did not run without an error with status "publish": it ran with status "draft"; status "publish" (failed)
core/content-query did not run without an error with status "draft" or "pending": it ran with no status
Expected abilities that did not run without an error: core/content-query. Ran: core/content-update
Forbidden abilities ran: core/content-delete (failed)
```

The first two are of an ability that ran, but never as expected: its runs are listed, each with what it had for the expected arguments. The third is of an ability that did not run, or that ran only with an error and has no arguments to compare, followed by every ability that ran. The first three belong to one check, `expected-abilities`, whose reason joins them; the last is the check `forbidden-abilities`.

`validate` reports an entry that is neither a name nor one name with its arguments, an argument that is not text, a number, `true` or `false` or a list of those, an ability that no pack lists, one that is under both `abilities` and `forbidden`, and `forbidden` in a `none` scenario, where it adds nothing. `verify` covers neither list, because no agent runs.

## Proving a scenario without an agent

A scenario is often written before the ability it tests, and a run costs tokens. `verify` shows on a real site that a scenario can be trusted, before any agent runs it. It takes up to five steps per scenario:

| Step | What happens | What it must show |
| --- | --- | --- |
| `start` | The site is prepared as for a trial: reset, the `beforeTrial` hooks, the comparison with the marked start plus `given`. | The starting content can be put on the site, and the site starts as the scenario says. |
| `no change` | The site is read again with nothing done, and the site check runs. | With `expect.site`, the check fails, because nothing happened yet. Without it, the check passes. |
| `the change` | Only with `expect.site`: on the same prepared site, the site's writers make the change, and the site check runs. | The check passes: this is what a trial finds when the agent does the task. |
| `contains` | Only with `expect.answer.contains`: its texts are looked for in `reference`, the answer that should pass. Without a `reference`, the line says that it was not checked. | The reference answer contains every text. |
| `rubric` | Only with `expect.answer.rubric`: every judge in the settings grades `reference` and `wrong`. | Each judge passes the reference answer and fails the wrong one. |

```
content/publish-a-draft/by-its-topic
  start       2 given items found on the site
  no change   fails, as it should: posts summer-sale: status is "draft", expected "publish"
  the change  passes
content/publish-a-draft/no-such-draft
  start       2 given items found on the site
  no change   passes, as it should: the scenario expects no change
  rubric      claude and gpt pass the reference answer and fail the wrong one
`expect.abilities` and `expect.forbidden` are not covered, because no agent runs: only a run shows which abilities an agent executes.
2 scenarios checked: 2 passed.
```

Each scenario gets its id and one line per step, with what was found. A step that did not show what it must starts with `FAILED:`. A step that something else stopped starts with `COULD NOT BE CHECKED:`, such as a hook that failed, a site that did not answer or a judge that gave no verdict. The last line has the counts, with the steps that were left out: a `contains` that was not checked and a rubric that was not graded. The command ends with an error when any step failed or could not be checked.

- **A `no change` step that fails** means the scenario's `expect.site` already holds when the scenario starts. A trial would then pass with an agent that did nothing, so the scenario is wrong: its `given` must start the site without the change.
- **A `the change` step that fails** means the writers could not make `expect.site`, or the site saved another value than the scenario names. Where `expect.site` names an item by a key the site does not start with, the line says so: making the change creates such an item, which hides a mistyped key.
- **The writers make an operator in the plainest way.** An item marked `$new` is created under its label as its key, with its plain values. A field with `$contains` gets its texts, joined by a space, after the text the field starts with. So a label must not be the key of an item the site starts with: the `the change` step then fails and says so, because the writers would change that item instead of creating one.
- **`--no-judges`** leaves the grading out, and the `rubric` line says so. Grading is the one step that calls a model, so with `--no-judges` the command costs nothing but time.
- **The state of a scenario does not matter.** A `to-be-implemented` scenario is proved like any other, because the writers make the change and no ability is needed.

**What it does not cover.** No agent runs, so nothing is known about which abilities one would execute: `expect.abilities`, `expect.forbidden` and the other checks on abilities are left to a run, and so is whether an agent understands the request. The writers make the change, so `verify` does not show that an ability can make it. A `contains` without a `reference` has nothing to be compared with: its line says that it was not checked, the last line counts it, and the scenario still passes. Add a `reference` to have it checked.

**Hooks run as in a run**, with no agent: the `beforeRun` hooks and the marked start, then for each scenario the `beforeScenario` hooks, the `beforeTrial` hooks, the `afterTrial` hooks and the `afterScenario` hooks, then the `afterRun` hooks and what the site file says happens to the site. The answer is checked before the `afterTrial` hooks, as the checks of a trial are. A hook gets a `run` whose `agents` is empty, and `verify` as its `agent`. The `result` of an after-trial hook has no `transcript`. Its `site` holds the site before and after the last step on it: the change made by the writers, or nothing done for a scenario without `expect.site`. Its `checks` hold the site check of that step. Checks that an after-trial hook returns are not counted, because they would judge the writers and not an agent.

## Who grades an answer

Code decides wherever it can: what changed on the site, which abilities ran, a text the answer must contain. Where it can't, a scenario gives a rubric, and a judge grades the answer against it. A judge is a model, run through the same installed commands as the agents, with no tools.

Each agent names its judge in `evals.config.ts`:

```ts
agents: {
  'claude-code': claudeCode({ model: 'claude-sonnet-5-5', signIn: 'login', judge: 'gpt' }),
  codex: codex({ model: 'gpt-6.2-sol', signIn: 'login', judge: 'claude' }),
},
judges: {
  claude: claudeJudge({ model: 'claude-sonnet-5-5', signIn: 'login' }),
  gpt: codexJudge({ model: 'gpt-6.2-sol', signIn: 'login' }),
},
```

An agent should be graded by a judge of another model family, because a judge passes answers of its own family more easily. When an agent names a judge of its own family, `validate` and `run` say so and go on. A judge that gives no verdict makes the trial "could not be judged", never a failure. Such a trial keeps the agent's transcript and the two readings of the site, so what the agent did can still be read. Every graded trial records which judge graded it.

A rubric is graded by a model, so a scenario gives two answers next to it that show it tells right from wrong. `validate` asks for both, and `verify` has every judge grade them:

```yaml
expect:
  answer:
    rubric: >-
      The agent has no ability to change the site's settings, so the site's title stays "My WordPress Website".
      The answer says that the title was not changed, or that the agent cannot change it. It fails if it says
      or implies that the title is now Hilltop Pottery, or that the change was made or started.
    # Should pass the rubric.
    reference: >-
      I can't change your site's title: I can read your site's settings, but I don't have a way to edit them,
      so it is still "My WordPress Website". You can change it under Settings > General.
    # Should fail it.
    wrong: Done. Your site's title is now Hilltop Pottery.
```

## Why three trials

An agent does not do the same thing every time, so one passing trial can be luck. Each agent therefore runs each scenario several times, and the scenario passes only when all of them pass. The number of trials decides how often a scenario that works only some of the time gets through:

| A scenario that works | gets through 1 trial | 3 trials | 5 trials |
| --- | --- | --- | --- |
| half the time | 1 run in 2 | 1 run in 8 | 1 run in 32 |
| 8 times in 10 | 4 runs in 5 | 1 run in 2 | 1 run in 3 |

A new project runs 3 trials (`trials` in `evals.config.ts`). Three trials catch a coin-flip scenario in 7 of 8 runs while keeping token use and runtime manageable as a suite grows.

Tokens and time grow in step with the number: 3 trials use three times what 1 trial uses, for every agent. A project can raise or lower `trials` in `evals.config.ts` (for example, 5 for a stricter release gate), and `--trials <number>` sets it for one run. With fewer trials, more scenarios pass by luck.

## Looking at a run

A run is saved as a folder in `results/`, named after the time it started:

```
results/2026-11-19T08-18-01Z/
  run.json
  trials/core/site/which-php-version/codex.1.json
```

- **`run.json` is short.** It has how the run was set up, what each agent and judge ran on (`models`), what the server checks found (`serverChecks`), each scenario's verdict, and every trial with its outcome, the checks that failed and the path of its own file.
- **A trial's file has everything about that trial**: the scenario as it was, with the request and what was expected, every check with its reason, the site as the agent found it and as it left it, the answer, each tool call, and all the agent reported.

Each trial's file is written as the trial ends, and `run.json` once the run has ended. So a run that was stopped keeps every trial that ended, in a folder without `run.json`.

An agent asked about a run reads `run.json`, then opens only the trials it needs. A person can do the same, or use the viewer:

```bash
npx wp-ability-evals view
```

It serves a page at `http://localhost:4400` that opens on the Overview: how many of the packs' abilities a scenario names, how many pass every scenario and how many are in a scenario that fails, counted from each scenario's most recent run, with the models and judges behind those results (and a warning when they mix models). Below that are the abilities in the most failing scenarios, the scenarios marked `to-be-implemented` (what site owners ask for that is not built yet), what the newest run's server checks found (the packs' abilities missing from the site, the site's tools that no pack lists, and any problems in the listed abilities' definitions), a trend with one point per saved run, and every ability as a map and a table. An ability opens a panel with its counts, any definition problems, what its calls answered when they came back with an error, and each scenario that names it or that it ran in, with a link to that scenario's run. A failing scenario is counted for every ability it names and blames none of them: the cause may be another part of the scenario. The page also lists the runs. A run shows its scenarios with each agent's count, and its trials with why each did not pass. A trial shows the request, what was expected with the scenario's starting content, the checks, what changed on the site, the site before, the answer and the tool calls with what went in and what came back. What changed is each item that was created, removed or changed, with its fields before and after. The site before is every item the trial started with, by entity type, folded away until it is opened, with the items of the scenario's starting content marked. Both come from the two readings in the trial's file, so a trial that has none, because it ended before both were read or was saved before they were kept, shows neither. The tables can be searched, filtered and sorted. The page only reads, the results folder and the project's packs, and answers only on this machine. `--port <number>` serves it elsewhere.

## How the agent reaches the abilities

A new project's site runs the MCP Adapter with the package's `abilities-as-tools` plugin. The plugin replaces the Adapter's three tools, which find, describe and run any ability, with one tool per ability on the same address, such as `core-content-update` for `core/content-update`, and tells the agent that the server is its user's WordPress site. `sites/local.json` lists it with the site's other plugins:

```json
"plugins": [
  "https://downloads.wordpress.org/plugin/mcp-adapter.0.7.1.zip",
  "./node_modules/wp-ability-evals/wp-plugins/abilities-as-tools"
]
```

The evals don't run on the Adapter's default server as it comes. Its three tools describe themselves only as tools for "WordPress abilities", so an agent that finds MCP tools by searching their names and descriptions misses them. Codex did in 7 of 36 trials, against 1 of 20 with a tool per ability, and a trial then fails for the server's wording, not for the ability under test.

The plugin is one short file. A path in a site file that starts with `.` is read from the project folder, so a project can load a plugin of its own the same way.

The checks still read the Adapter's three tools, because some servers have tools like them, such as remote servers that proxy abilities from connected sites. A site file does not say which way its server presents abilities. A call to a tool that runs any ability counts as the ability it names, the tools that find and describe abilities run none, and any other tool of the site's server is an ability by its name. The arguments an ability ran with are found either way, as "The abilities a scenario expects" above says. A scenario names abilities, never tools, so it is the same on any server.

## Extending it from a project

A project adds things in its own files and names them in `evals.config.ts`. The built-in ones are made the same way.

- **An agent**: a function that returns an `Agent` (one method, `run`, and its model family). Add it under `agents` in the config.
- **A judge**: a function that returns a `Judge` (one method, `grade`, and its model family). Add it under `judges`.
- **An entity type**: an `EntityType`, with a reader for each kind of site that has it and a writer, which puts starting content there and makes the expected change for `verify`. Add it under `entityTypes`. For a `wp-env` site both are PHP, written as text. `validate` reports one that is not text, and `site state` and `verify`, which run the PHP, name the entity type whose reader or writer failed, with the line in it.
- **A kind of site**: a `SiteFactory`, a function that returns a `Site`. Such a site reads and changes the site in its own way, in `state()` and `apply()`. Add it under `siteKinds`. Where its MCP server has tools that find, describe and run any ability, the site names them (`LookupTools`): each tool that runs any ability (`runTools`), with its argument that names the ability and the one that holds the ability's input, and the tools that run none. A pack lists such an ability by the name the server gives it, with its prefix, if any, as `prefix:namespace/name`.
- **A hook**: a function that gets the site and the run. Add it under `hooks`, at the point of a run where it runs.

Everything a project may import is in `src/index.ts`.

## This repository

| Path | Holds |
| --- | --- |
| `src/` | The framework, one folder per part (table in `docs/architecture.md`) |
| `template/` | What `init` copies into a new project. `update` copies the guide in its `AGENTS.md` again |
| `guide/` | The guide's topic files, which `init` copies into a project's `.agents/guide/` and `update` copies again |
| `skills/` | The skills for agents that `init` copies into a project and `update` copies again (`skills/README.md`) |
| `wp-plugins/` | WordPress plugins a local site can add |
| `viewer/` | The page that shows the coverage of the abilities and the saved runs, built into `dist/` with the rest |
| `test/` | Tests of the framework itself |
| `docs/` | `architecture.md` shows how the parts fit |

```bash
npm install          # also builds dist/
npm run typecheck
npm test             # builds first: one test runs the built command, as a project does
npm run build        # after a change in src/ or viewer/, so projects that use this checkout see it
npm run evals -- --help
```

Node 22.23.4 or newer in 22, 24.22.1 or newer in 24, or 26.12.1 or newer: the Node versions MCP Inspector runs on.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, conventions, and how to submit changes.

## Security

Please report security vulnerabilities responsibly via [SECURITY.md](SECURITY.md) rather than opening a public issue.

## License

`wp-ability-evals` is licensed under the [GNU General Public License v2.0 or later](LICENSE).
