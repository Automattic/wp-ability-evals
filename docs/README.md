# Documentation index

Focused, single-topic documentation for `wp-ability-evals`, written for both humans and AI coding agents reading on demand. See [CONTEXT.md](../CONTEXT.md) for the shared domain vocabulary used across docs, code, and CLI output.

## Using and authoring evals

- [Getting started](getting-started.md) — Prerequisites, initializing a project, agent/judge sign-in (`login` vs `api-key`), project layout, core CLI workflow, and `update` sync; read first when setting up a project.
- [Scenarios, starting content, and expectations](scenarios.md) — Story file format, `given` starting content and pre-trial verification, `expect.site` (`$new`, `$contains`), `expect.abilities` / `expect.forbidden`, and answer rubrics; read when writing or editing story files.
- [Running, verifying, and reading results](running-and-results.md) — Proving scenarios with `verify`, live run lifecycle, MCP Inspector server checks, `abilities-as-tools` vs lookup tools, cross-family judges, multi-trial verdicts, `--shard` / `merge`, and reading `results/` or the live/static viewer; read when running evals or diagnosing failures.
- [Extending a project](extending.md) — Lifecycle hooks (`beforeRun` through `afterRun`), custom entity types, custom agents/judges, and custom site kinds (`LookupTools`, `inspectUrl`, `requestFor`); read before writing code in `hooks/` or `extensions/`.
- [Bundled agent skills](../skills/README.md) — Skills copied into projects (`add-evals`) and what belongs in a skill versus the guide or project rules.

## Developing `wp-ability-evals`

- [Architecture](architecture.md) — Package/project boundary, one-way `src/` module dependency map, and core invariants across validation, hooks, sites, isolation, checks, `verify`, `merge`, and the viewer; read before changing `src/` or `viewer/`.
- [Manual testing checklists](manual-testing.md) — Verification steps for subsystems that require Docker, signed-in agents, or a browser (`wp-env`, server checks, `verify`, hooks, agent adapters, judges, viewer, `update`); read before shipping changes to those areas.
- [Contributing](../CONTRIBUTING.md) — Contributor prerequisites, dev scripts, TypeScript rules, and PR checklist.
