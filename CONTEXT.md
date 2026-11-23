# WP ability evals

The language of evaluating WordPress abilities with real agents: what is tested, where, by whom, and how a result is decided.

## Language

### What is tested

**Ability**:
A unit of functionality registered with the WordPress Abilities API, with a name, a description and input and output schemas.
_Avoid_: tool (a tool is how an MCP server presents an ability to an agent), capability

**Pack**:
Everything the evals know about one set of abilities: the list of its abilities, and its stories with their scenarios.
_Avoid_: suite, plugin

**Story**:
What a site owner wants, in a person's plain words: what is on the site, what should happen and what must not. Its scenarios are made from it.
_Avoid_: feature, spec, epic

**Scenario**:
One task a site owner would hand an agent, in their own words, with what is on the site before and what must be true afterwards. It is data, made from a story.
_Avoid_: test, eval, case

**Starting content**:
What a story or a scenario says is on the site before the agent works, written as `given`. A scenario starts from its story's joined with its own.
_Avoid_: fixture, precondition, setup

**Expectation**:
What a scenario says must be true after a trial: the change on the site, the abilities that ran and those that did not, the answer.
_Avoid_: assertion

**Argument**:
One named value of the input an ability ran with. A scenario may name the arguments an expected ability must have run with.
_Avoid_: parameter (the MCP Adapter's name for an ability's whole input), param, option

**Operator**:
A key that starts with `$` in the change a scenario expects, which says that an item or a field's value is more than a plain value: `$new` marks an item the agent should create, `$contains` compares a field by the texts it contains.
_Avoid_: matcher, modifier, directive

**Label**:
The name a scenario gives an item it marks `$new`, in the place of a key, because the site chooses the key of what is created on it. The item is found by its fields.
_Avoid_: alias, placeholder, id

**State**:
What a failure of a scenario means: implemented (a regression), known defect (expected, because of a bug) or to be implemented (expected, because the ability does not exist yet).
_Avoid_: status, expected failure

**Entity type**:
One kind of thing on a site that scenarios make claims about, such as posts or products.
_Avoid_: resource, object

**Reader**:
How an entity type's items are read on one kind of site: every item, with its key and its fields.
_Avoid_: getter, fetcher, query

**Writer**:
How one item of an entity type is made to have given fields on one kind of site: created under its key, changed or removed. What a writer makes, the reader reports under the same key.
_Avoid_: seeder, factory, setter

### The two pieces

**Package**:
The framework that runs the evals, installed as a dependency and updated like one.
_Avoid_: framework repo, core, library

**Project**:
The folder where someone's evals live: its settings, packs, sites and extensions. It uses the package and never changes it.
_Avoid_: workspace, repo, suite

**Guide**:
What an agent working in a project needs to know about the package: the commands, the formats and what the output means. It is the package's. What every session needs is in the project's `AGENTS.md`, between two marker lines next to the project's own rules, with a map of the rest: one file per topic, read before the work it names.
_Avoid_: docs, manual, instructions

**Extension**:
An agent, entity type or site kind that a project adds through its settings.
_Avoid_: plugin, addition, custom code

**Hook**:
A function of a project that the package runs at a fixed point of a run, to prepare the site or to clean up: before and after the run, each scenario and each trial. The package fixes the points and their order; what a hook does is the project's own code.
_Avoid_: callback, lifecycle script, fixture, setup and teardown

### Where and by whom

**Site**:
A WordPress site the evals run against.
_Avoid_: profile, stack, target, store

**Site kind**:
The way a site is hosted, which decides how it is set up, reset and read.
_Avoid_: target, driver

**Clean state**:
A site as it was when it was set up, before any hook or agent changed it. Every start returns to it.
_Avoid_: fresh install, baseline

**Marked start**:
A site as the before-run hooks of a run left it. Every trial of the run starts from it, and a reset returns to it.
_Avoid_: snapshot (how a wp-env site keeps it), baseline, checkpoint

**Presentation**:
How a site's MCP server offers abilities to an agent: through lookup tools that find, describe and run any ability, or as one tool per ability. A server may do both.
_Avoid_: server type, mode, version

**Agent**:
An outside program that receives the request and works on the site through its MCP server, such as Claude Code or Codex.
_Avoid_: harness, provider, client, model

**Environment**:
What an agent starts a trial with: its sign-in, an empty folder, and anything a scenario adds on purpose, such as a skill.
_Avoid_: sandbox, workspace

### How a result is decided

**Trial**:
One run of one scenario by one agent.
_Avoid_: attempt, repeat, test

**Run**:
One start of the evals: a set of scenarios, on one site, by one or more agents, each for one or more trials.
_Avoid_: job, session

**Transcript**:
What an agent did in a trial: its answer and every tool call.
_Avoid_: trace, trajectory, output

**Check**:
A rule that looks at one trial and passes or fails it, with a reason.
_Avoid_: assertion, grader, scorer

**Server check**:
A look at a site's MCP server itself, once per run and without an agent: which abilities it presents, compared with the abilities its packs list. What it finds decides which scenarios a run can judge. Unlike a check, it judges no trial.
_Avoid_: preflight, health check, smoke test

**Judge**:
A model that grades an answer against a rubric, used only where code can't decide. Each agent names the judge that grades it.
_Avoid_: grader, evaluator

**Model family**:
The line of models an agent or a judge runs, such as claude or gpt. A judge passes answers of its own family more easily.
_Avoid_: vendor, provider

**Verdict**:
The conclusion for one scenario, drawn from all its trials by all agents.
_Avoid_: outcome, score

**Coverage**:
What the evals know about one ability, counted from each scenario's latest verdict: how many scenarios name it and how they ended, in how many it ran without an error in a passing trial, and how many of its calls came back with an error. It states facts about scenarios and never blames the ability: a scenario that fails may fail for another reason.
_Avoid_: score, health, pass rate

**Proof**:
What `verify` shows about one scenario on a site, without an agent: its starting content can be put there, its site check fails when nothing changed and passes once the expected change is made, and its rubric tells a right answer from a wrong one. It is made in steps, and it says nothing about which abilities an agent would run.
_Avoid_: dry run, self-test, validation
