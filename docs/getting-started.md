# Getting started

Set up an evals project, configure agent and judge sign-in, understand the generated folder layout, and run the core CLI workflow.

## Contents

- [Prerequisites](#prerequisites)
- [Create a project](#create-a-project)
- [Configure agent and judge sign-in](#configure-agent-and-judge-sign-in)
- [Project layout](#project-layout)
- [Core CLI workflow](#core-cli-workflow)
- [Keep package skills and guide in sync](#keep-package-skills-and-guide-in-sync)

## Prerequisites

Install these before creating or running a project:

- **Node.js**: `^22.23.4`, `^24.22.1`, or `>=26.12.1` (required by `@modelcontextprotocol/inspector`).
- **Docker**: required for local `wp-env` sites (`site start`, `site check`, `site state`, `verify`, and `run`).
- **Agent CLIs**: install Claude Code (`claude`) and/or Codex (`codex`) for any agent or judge configured in `evals.config.ts`.

## Create a project

`wp-ability-evals` splits into two pieces: **the package** (this repository, installed as a dependency) and **a project** (your evals folder in any repository, holding packs, sites, settings, hooks, and extensions without editing the package).

Clone and build the package once, then initialize a project folder from it:

```bash
git clone https://github.com/Automattic/wp-ability-evals.git
cd wp-ability-evals && npm install
npx /path/to/wp-ability-evals init my-evals
cd my-evals
npm install
```

`init` refuses to overwrite existing files: if any template file is already present in the target folder, it stops without writing.

## Configure agent and judge sign-in

Each built-in agent and judge runs through its installed CLI (`claude` or `codex`) and supports `signIn: 'login'` or `signIn: 'api-key'` in `evals.config.ts`. A judge uses the same CLI and sign-in mechanism as the agent of its vendor.

| Agent / Judge | `signIn: 'login'` | `signIn: 'api-key'` |
| --- | --- | --- |
| Claude Code (`claude`) | Existing local sign-in on this machine | `ANTHROPIC_API_KEY` (optional: `ANTHROPIC_BASE_URL`, `ANTHROPIC_CUSTOM_HEADERS`) |
| Codex (`codex`) | Dedicated evals sign-in (see below) | `OPENAI_API_KEY` (optional: `OPENAI_BASE_URL`) |

Codex stores its sign-in in the same folder as your personal settings, rules, and skills, so `wp-ability-evals` isolates it in `~/.wp-ability-evals/codex` instead of reading your personal Codex home. Create that sign-in once before running Codex with `signIn: 'login'`:

```bash
mkdir -p ~/.wp-ability-evals/codex && CODEX_HOME=~/.wp-ability-evals/codex codex login
```

When an agent is not signed in, its trials end as "could not be judged" with the sign-in command needed to fix it.

## Project layout

`init` creates a self-contained project folder:

- `packs/` — One folder per set of abilities (`pack.yaml` plus `scenarios/*.yaml`). Plain data, no code.
- `sites/` — One JSON file per site. Starts with `sites/local.json`, configured as a `wp-env` site running the MCP Adapter with the bundled `abilities-as-tools` plugin.
- `evals.config.ts` — Project configuration: pack paths, agents, judges, trial count, timeout, hooks, and extensions.
- `extensions/` — Optional project-owned agents, entity types, and site kinds (create when needed).
- `hooks/` — Optional project-owned hooks referenced by `evals.config.ts` (create when needed).
- `AGENTS.md` — Agent guide for working in the project. The package owns the section between the `BEGIN` / `END` marker lines (`update` refreshes it); project-specific rules go outside those markers.
- `.agents/guide/` — Package-managed topic files referenced from `AGENTS.md` (`update` refreshes them).
- `.agents/skills/` and `.claude/skills/` — Package-managed skills (`add-evals`), symlinked into `.claude/skills/` for Claude Code. Put project-specific skill rules in `.agents/rules/<skill>.md` instead of editing copied skills.
- `.agents/wp-ability-evals.json` — Hashes of copied skills and guide files so `update` can detect local edits. Commit this file.
- `results/` — Saved run folders (`run.json`, `server.json`, `trials/`). Gitignored.
- `.wp-ability-evals/` — Local site working state (wp-env config, database snapshots, MCP sign-in). Created on first `site start`. Gitignored.

## Core CLI workflow

Run `npx wp-ability-evals --help` for the full command and option reference. The usual workflow inside a project is:

1. **Validate files without Docker or models:**

   ```bash
   npx wp-ability-evals validate
   npx wp-ability-evals list
   ```

2. **Check the site's MCP server and inspect its readable state** (requires Docker):

   ```bash
   npx wp-ability-evals site check local
   npx wp-ability-evals site state local
   ```

   Use `site start local`, `site reset local`, `site stop local`, and `site remove local` to manage local site lifecycle directly. Warning: `site remove` deletes the site's containers, data, and `.wp-ability-evals/sites/<name>/` folder; the next start sets it up from scratch.

3. **Prove scenarios without an agent** (requires Docker; free with `--no-judges`):

   ```bash
   npx wp-ability-evals verify --site local --no-judges
   ```

   > [!WARNING]
   > Omitting `--no-judges` runs every configured judge against each rubric's `reference` and `wrong` answers, which spends each judge's plan or API credit.

4. **Run scenarios with real agents** (requires Docker and signed-in agents):

   > [!WARNING]
   > `run` executes live agents and rubric judges, spending your agent plan or API credit. Use `--filter <text>` and `--trials 1` for a quick check while iterating on a new scenario.

   ```bash
   npx wp-ability-evals run --site local --agent claude-code
   npx wp-ability-evals run --site local --agent claude-code --agent codex --filter which-wordpress
   ```

   `run` starts the site if needed, prints one line per trial plus a summary, saves each trial under `results/` as it finishes, and exits non-zero when an implemented scenario fails or cannot be judged.

5. **Inspect coverage and saved runs in the viewer:**

   ```bash
   npx wp-ability-evals view
   npx wp-ability-evals view --export ./viewer-export --results ./results
   ```

See [Running, verifying, and reading results](running-and-results.md) for `verify` output, sharding with `--shard`, combining runs with `merge`, and viewer details.

## Keep package skills and guide in sync

A project holds a versioned copy of the package's skills (`.agents/skills/`), topic guide files (`.agents/guide/`), and the marked guide block in `AGENTS.md`. After upgrading the `wp-ability-evals` dependency, pull the newer copies into the project:

```bash
npx wp-ability-evals update
```

`validate` warns whenever the project's copies differ from the installed package. If any copied file was edited locally, `update` lists the modified files and writes nothing; pass `--overwrite` only when you want to discard those local edits and replace them with the package's version. Keep project-owned rules outside the markers in `AGENTS.md` and in `.agents/rules/<skill>.md` so `update` never touches them.
