# WP ability evals

End-to-end evaluations for WordPress abilities: real coding agents (Claude Code, Codex) execute site-owner tasks against a real WordPress site over MCP, graded primarily on what actually changed on the site rather than what the agent claims it did.

This repository is the **framework package** (`wp-ability-evals`). Your evals live in a separate **project** folder initialized from this package, holding packs, sites, hooks, and extensions without modifying the framework.

## How it works

```mermaid
flowchart LR
  Story["Story & scenario YAML"] --> Site["Reset site & apply given"]
  Site --> Agent["Isolated agent via MCP"]
  Agent --> Checks["Grade site diff, abilities & answer"]
  Checks --> Verdict["Multi-trial verdict & viewer"]
```

A scenario starts from a site owner's story and declares the starting content (`given`) and expected site change (`expect.site`):

```yaml
story: As a site owner I want to publish a draft by asking for it.
given:
  posts:
    summer-sale: { title: Summer sale, status: draft }
scenarios:
  - id: content/publish-a-draft/by-its-topic
    request: Publish my draft about the summer sale.
    kind: write
    expect:
      site:
        posts:
          summer-sale: { status: publish }
```

## Prerequisites

- **Node.js**: `^22.23.4`, `^24.22.1`, or `>=26.12.1` (required by `@modelcontextprotocol/inspector`).
- **Docker**: required for local `wp-env` sites.
- **Agent CLIs**: Claude Code (`claude`) and/or Codex (`codex`) installed and signed in for live runs (see [Getting started](docs/getting-started.md#configure-agent-and-judge-sign-in)).

## Quickstart

Clone and build the package once, then initialize a project and verify its starter scenarios before spending any model tokens:

```bash
git clone https://github.com/Automattic/wp-ability-evals.git
cd wp-ability-evals && npm install
npx /path/to/wp-ability-evals init my-evals
cd my-evals && npm install

npx wp-ability-evals validate                         # check packs, scenarios, and config (no Docker)
npx wp-ability-evals verify --site local --no-judges  # prove starting content and site checks without an agent
```

> [!WARNING]
> `run` executes live agents (and rubric judges when configured), spending your agent plan or API credit. Pass `--trials 1` and `--filter <text>` for a cheap first look before a full multi-trial run.

```bash
npx wp-ability-evals run --site local --agent claude-code --trials 1
npx wp-ability-evals view                             # open the coverage & results dashboard at http://localhost:4400
```

Run `npx wp-ability-evals --help` for the full list of commands and options, or see [Getting started](docs/getting-started.md) for sign-in setup, project layout, and syncing package updates with `update`.

## What you get

- **Site-state grading first:** Compares WordPress before and after each trial—catching unintended side effects alongside missing changes—and supports `$new` and `$contains` operators for created items and free-form text.
- **Zero-cost scenario proofs (`verify`):** Proves `given`, `expect.site`, and answer checks against a live site using entity writers before any agent runs, including for `to-be-implemented` abilities.
- **Isolated agent environments:** Runs Claude Code and Codex in empty temporary directories with no personal rules, skills, memory, or evaluation hints—only the target site's MCP tools.
- **MCP Inspector audits & tool presentation:** Audits every site's MCP server against packs (missing abilities, `--strict` schema portability, descriptions, and `readOnlyHint` annotations) and bundles `abilities-as-tools` to expose one tool per ability.
- **Multi-trial verdicts, sharding, and viewer:** Requires every trial across configured agents to pass, splits large suites with `--shard` / `merge`, and renders coverage trends and trial diffs via `view` or `view --export`.
- **Extensible without forking:** Add lifecycle hooks, custom entity types, agents, judges, and site kinds in `evals.config.ts`, and pull newer bundled skills and guides into existing projects with `npx wp-ability-evals update`.

## Documentation

Browse the full index in [docs/README.md](docs/README.md), or jump straight to what you need:

- [Getting started](docs/getting-started.md) — Project initialization, agent/judge sign-in (`login` vs `api-key`), folder layout, core CLI workflow, and `update`; open first when setting up a project.
- [Scenarios, starting content, and expectations](docs/scenarios.md) — Story files, `given` verification, `expect.site` (`$new`, `$contains`), `expect.abilities` / `expect.forbidden`, and answer rubrics; open when writing or editing evals.
- [Running, verifying, and reading results](docs/running-and-results.md) — `verify` steps, live run lifecycle, MCP Inspector server checks, `abilities-as-tools`, cross-family judges, `--shard` / `merge`, `results/` files, and live/static `view`; open when running evals or diagnosing failures.
- [Extending a project](docs/extending.md) — Lifecycle hooks (`beforeRun`–`afterRun`), custom entity types, custom agents/judges, and custom site kinds; open before writing code in `hooks/` or `extensions/`.
- [Architecture](docs/architecture.md) — Module dependency map, subsystem boundaries, and core invariants; open before changing `src/` or `viewer/`.
- [Manual testing checklists](docs/manual-testing.md) — Docker, agent, and browser verification steps for package changes not covered by unit tests.
- [Domain glossary](CONTEXT.md) — Canonical definitions for terms used across docs, code, and CLI output.
- [Bundled agent skills](skills/README.md) — Skills copied into projects (`add-evals`) and how project rules extend them.

## Developing this repository

```bash
npm install               # install dependencies and build dist/
npm run typecheck         # typecheck src/ and viewer/
npm test                  # build and run node:test suite
npm run evals -- --help   # run the CLI directly from TypeScript source
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for conventions and PR guidelines, [SECURITY.md](SECURITY.md) for responsible disclosure, and [LICENSE](LICENSE) for GPL-2.0-or-later licensing.
