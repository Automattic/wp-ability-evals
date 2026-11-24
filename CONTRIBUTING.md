# Contributing

Thank you for your interest in contributing to `wp-ability-evals`.

## Prerequisites

- Node.js `^22.23.4`, `^24.22.1`, or `>=26.12.1` (required by `@modelcontextprotocol/inspector`).
- Docker, if you are manually verifying `wp-env` site commands or `verify` runs.

## Development setup

```bash
git clone https://github.com/Automattic/wp-ability-evals.git
cd wp-ability-evals
npm install
npm run typecheck
npm test
```

- `npm run build` compiles `src/` and bundles `viewer/` into `dist/`.
- `npm run evals -- --help` runs the CLI directly from TypeScript source on Node.
- `npm test` runs `npm run build` first and executes the test suite with `node --test`.

## Project structure and conventions

- [CONTEXT.md](CONTEXT.md) defines the shared vocabulary used across code, comments, and CLI output.
- [docs/architecture.md](docs/architecture.md) explains module boundaries and one-way import rules across `src/`.
- [AGENTS.md](AGENTS.md) lists implementation conventions and safety rules for package development.
- [docs/manual-testing.md](docs/manual-testing.md) lists manual verification checklists for parts that need Docker, a signed-in agent, or a browser.
- Projects should never need to edit this package to add an agent, entity type, site kind, or hook — prefer extending the contracts exported from `src/index.ts`.
- Node runs TypeScript directly in `src/` during development: include `.ts` extensions in relative imports, use `import type` for type-only imports, and avoid non-erasable TypeScript syntax (`enum`, `namespace`, parameter properties).

## Pull requests

1. Keep changes focused and ensure `npm run typecheck` and `npm test` pass.
2. If you change files in `template/`, `guide/`, or `skills/`, check whether `test/init.test.ts` or `test/update.test.ts` needs to be updated.
3. For changes touching `wp-env`, server checks, hooks, agents, judges, or `viewer/`, verify manually against a real local project as noted in [docs/manual-testing.md](docs/manual-testing.md).

## License

By contributing to this repository, you agree that your contributions will be licensed under the [GNU General Public License v2.0 or later](LICENSE).
