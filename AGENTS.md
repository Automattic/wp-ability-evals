# WP ability evals: agent guide

This repository is the `wp-ability-evals` framework package for evaluating WordPress abilities with real agents on real sites. Downstream eval projects have their own guide seeded from `template/AGENTS.md` and `guide/`.

## Build, test, and lint

- Install and build: `npm install`
- Typecheck: `npm run typecheck`
- Test: `npm test` (builds `dist/` first because tests exercise the built CLI)
- Build: `npm run build` (required after `src/` or `viewer/` edits for linked projects)
- Run from source: `npm run evals -- --help`

## Core conventions

- **Shared vocabulary:** Use the exact terms defined in `CONTEXT.md` across code, comments, docs, and CLI output.
- **Project-extensible contracts:** Projects must never edit `src/` to add an agent, judge, entity type, site kind, or hook—extend `src/config/types.ts` instead. `src/index.ts` is the sole public import surface for projects.
- **Agent-actionable output:** Write error messages and CLI output so an agent can act on them: state what is wrong, where, and what to do.
- **Direct TypeScript on Node:** Include `.ts` extensions in relative imports, use `import type` for type-only imports, and write only erasable syntax (no `enum`, `namespace`, or parameter properties).
- **File headers and boundaries:** Start every file with a short comment stating what it owns and why it exists. Keep dependencies strictly one-way (`docs/architecture.md`): each folder's `types.ts` is its contract, and nothing imports `runner`, `verify`, or `cli`.
- **Co-located validation:** Every project-authored file format requires a `validate.ts` next to its `types.ts` that collects all problems into `InvalidProjectError` instead of stopping at the first error.
- **Data apart from code:** Packs are plain YAML data; executable site logic lives in `src/`, or in a project's `hooks/` and `extensions/`.
- **Clean eval boundary:** Nothing visible to an agent under test may reveal it is an evaluation—requests, starting content, MCP server names, temp folders, or bundled `wp-plugins/` names and copy.

## Non-obvious invariants and coupled files

- **Single-owner parsers and lifecycle gates:** Only `src/scenarios/operators.ts` distinguishes `$` operators (`$new`, `$contains`); only `src/scenarios/abilities.ts` parses `expect.abilities` entries; only `src/checks/abilities.ts` extracts ability inputs across tool presentations (never hardcode tool argument names from memory—verify against the server or a saved trial). All site starts/ends for scenarios must go through `startRunOn` / `endRunOn` (`src/hooks/run-on-site.ts`), and all trial starts through `startTrial` (`src/hooks/start-trial.ts`).
- **Grading constraints:** Never add checks on ability call order or call count, and never guess which created item a `$new` label matches (must be a strict 1-to-1 fit). Outside `expect.forbidden` and `kind: none`, refused/errored ability calls are not failures. Any new scenario expectation requires a corresponding step (or explicit uncovered-notice line) in `src/verify/steps.ts`.
- **Entity writers as data:** Entity writers and readers must agree on item keys (including `#<ID>` lookup-only keys for slugless posts). Pass site changes as JSON data on stdin, never interpolated into PHP code.
- **Viewer (`viewer/`):** Built with React, `@wordpress/dataviews` (tables), `@wordpress/ui` (pinned experimental—check types in `node_modules`), and `@wordpress/components` only where the first two lack a primitive; bundled by `scripts/build-viewer.mjs` into `dist/viewer/page/`. Import only types from `src/results/types.ts` (no runtime imports from `src/`), and keep pass/fail logic out of the browser UI.
- **Template, guide, and skills sync (`template/`, `guide/`, `skills/`):**
  - Never change the `<!-- BEGIN wp-ability-evals guide ... -->` / `<!-- END wp-ability-evals guide -->` markers in `template/AGENTS.md` or the hash record format in `src/init/record.ts`—existing projects depend on both.
  - Keep `template/AGENTS.md` as a concise map and put downstream topic fixes in `guide/`. Adding or renaming files in `template/`, `guide/`, or `skills/` requires updating `test/init.test.ts` (and updating path references in `skills/` and `template/AGENTS.md`).
  - Every bundled skill in `skills/` must point near its top to `.agents/rules/<skill-name>.md` for project-owned overrides.

## Safety

- Never read or commit `.env` files.
- Never start a live `run` without asking: it spends the user's agent plan or API credit.
- Run `verify` with `--no-judges` unless explicitly asked to grade rubrics, which spends each judge's plan or API credit.

## Read before the work

- Read `CONTEXT.md` before introducing domain terms, public types, or user-facing messages.
- Read `docs/architecture.md` before changing module imports, validation, hooks, trial start, `wp-env`, agent isolation, checks, `verify`, `merge`, or `viewer/`.
- Read `docs/manual-testing.md` before finishing changes to `wp-env`, server checks, entity writers, `verify`, hooks, agent adapters, judges, `viewer/`, or `update` (parts not fully covered by `npm test`).
- Read `docs/README.md` (and the owning guide under `docs/`) when changing CLI commands, scenario formats, hooks, or `src/index.ts` contracts so user documentation stays accurate.
- Read `skills/README.md` before adding or editing bundled skills in `skills/`.
