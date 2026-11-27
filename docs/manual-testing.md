# Manual testing checklists

Verification steps for subsystems that require Docker, a signed-in agent, or a browser and are not fully covered by `npm test`. Run these in a real evals project after changing the corresponding code in `wp-ability-evals`.

## Contents

- [wp-env sites (`src/sites/wp-env.ts`)](#wp-env-sites-srcsiteswp-envts)
- [Server checks (`src/server-checks/`)](#server-checks-srcserver-checks)
- [Starting content and entity writers (`src/entities/`, `src/hooks/`)](#starting-content-and-entity-writers-srcentities-srchooks)
- [Scenario proofs (`src/verify/`)](#scenario-proofs-srcverify)
- [Hooks (`src/hooks/`, `src/runner/`, `src/verify/`)](#hooks-srchooks-srcrunner-srcverify)
- [Agent adapters (`src/agents/`, `src/programs/`)](#agent-adapters-srcagents-srcprograms)
- [Judges (`src/judge/`)](#judges-srcjudge)
- [Viewer (`viewer/`, `src/viewer/`, `src/coverage/`)](#viewer-viewer-srcviewer-srccoverage)
- [Project sync (`src/init/update.ts`, `src/cli/main.ts`)](#project-sync-srcinitupdatets-srcclimaints)

> [!WARNING]
> Live `run` commands and `verify` without `--no-judges` invoke real models and spend the user's agent plan or API credit. Ask the user before executing any step that calls a model.

## wp-env sites (`src/sites/wp-env.ts`)

1. Configure a `beforeRun` hook in `evals.config.ts` that creates a post via `site.wp`.
2. Run `site start`, `site state`, mutate the site, `site reset`, `site state` again, and `site stop`. Verify the hook-seeded post exists after start and after reset, without the mutation, and that the MCP server still accepts the saved sign-in after reset.
3. Stop only the WordPress container with `docker stop`: verify `site start` brings it back up and `site check` reads the MCP server.
4. Test `site remove` only on a disposable site with its own port in a project copy.
5. Add two temporary site files—one sharing the port of a running site and one using a port held by another local process—and verify `site start` fails on each with a message naming the port, the holder, and the site file without starting anything. Remove both temporary files and their folders under `.wp-ability-evals/sites/` afterward.

## Server checks (`src/server-checks/`)

1. Run `site check` on a healthy `wp-env` site and verify every listed ability is reported present.
2. Add a nonexistent ability to `pack.yaml`: verify `site check` names it as missing and exits non-zero.
3. Remove an exposed ability from `pack.yaml`: verify it is listed as a tool in no pack and `site check` exits zero.
4. Expose a listed ability with a broken schema (e.g., bare `true`), empty description, or contradictory `readOnlyHint`: verify `site check` prints severity, path, issue, and fix and exits non-zero on error-severity findings; verify a warning-severity schema finding prints without failing `site check`, and that `run` still executes trials while recording `definitionFindings` in `run.json`.
5. Configure opt-in `serverChecks` (`requiredHints`, `hints`, and `directTools`) in `evals.config.ts` and override per site in `sites/<name>.json`: verify omitted hints fail as `missing-hint` (even when `false` is expected), explicit `false` passes, conflicting values fail as `hint-mismatch`, and removing `abilities-as-tools` on a site with `directTools` enabled fails `site check` with `not-direct-tool` naming the ability and lookup tool.
6. Add a temporary `beforeRun` hook that stops the WordPress container (`docker stop`): verify `site check` reports that the server could not be read, names its address, and exits non-zero. Remove the hook afterward and confirm the next `site start` recovers the container.
7. Confirm MCP Inspector leaves nothing in `~/.mcp-inspector` by comparing its files and timestamps before and after `site check`.
8. Add a missing ability to `pack.yaml`, reference it in a scenario's `expect.abilities`, and `run --filter` that scenario: verify no agent starts (zero spend), trials end as "could not be judged" naming the ability, `run.json` contains `serverChecks`, and the viewer trial page shows the reason. Repeat with `state: to-be-implemented` and verify trials report "not built yet", the scenario reports "failed as expected", and `site check` labels it not built yet and exits zero.

## Starting content and entity writers (`src/entities/`, `src/hooks/`)

1. Add a story file with `given` items (including a title containing a quote, `$`, and a non-ASCII character) and a scenario whose `expect.site` updates one item. Run `verify --site local --no-judges`: confirm `start` and `the change` pass and `site state` shows each item under its key.
2. Create a slugless draft via WP-CLI in the CLI container, locate its `#<ID>` key in `site state`, and call `site.apply` from a script using the built package: verify the post updates in place without creating a duplicate.
3. Re-run `verify --no-judges` with no hooks configured, and again with a `beforeTrial` hook that creates an undeclared item: verify `start` fails listing the exact differences.
4. Break a project entity type's PHP one error at a time: confirm a syntax error or undefined function call in a reader makes `site state` name the entity type and line number, and a syntax error in a writer makes `verify`'s `start` step name the writer.

## Scenario proofs (`src/verify/`)

1. Run `verify --site local --no-judges` on a story file whose scenarios modify, rename, and remove a `given` item, plus one using `$new` and `$contains`: verify all steps pass and `site state` reflects the last scenario's created draft under its label.
2. Break one condition at a time and confirm each exits non-zero with a clear message:
   - `expect.site` that already holds at start (`no change` fails);
   - `expect.site` referencing a key not in `given` (`the change` fails or notes creation);
   - `reference` missing a text from `expect.answer.contains`;
   - `$new` label colliding with an existing item key;
   - two `$new` items with identical fields matching the same created item.
3. Confirm `contains` without `reference` prints as not checked, is counted on the summary line, and exits zero. Remove any temporary story file afterward.

## Hooks (`src/hooks/`, `src/runner/`, `src/verify/`)

1. Throw inside a `beforeRun` hook and run `site start`: verify the error names the point and hook and that `afterRun` hooks still ran.
2. Register logging hooks at all six points and run `verify --no-judges`: verify execution order, then make each hook throw one at a time and check how each failure is reported.
3. Testing scenario/trial hooks inside a live `run` spends agent credit—ask the user first.

## Agent adapters (`src/agents/`, `src/programs/`)

- **Live trial check (ask before running):** Execute one `run` with the adapter and inspect its trial JSON under `results/`. Confirm the session exposed only the site's MCP tools and the agent's own tool search, with none of the user's skills, plugins, rules, or other MCP servers.
- **Codex zero-cost tool inspection:** Codex does not log its tool list during normal execution. Run `codex debug prompt-input` with the adapter's `--disable` and `--config` flags and `HOME` pointed at an empty directory to inspect the exact tools and prompt sent to the model without calling an API.

## Judges (`src/judge/`)

- **Live grading check (ask before running):** Run `verify --site local --filter <rubric-scenario>` without `--no-judges` so every configured judge grades both `reference` and `wrong` answers, and inspect both verdicts.

## Viewer (`viewer/`, `src/viewer/`, `src/coverage/`)

1. Run `npm run build` and start the viewer on a separate port (`npx wp-ability-evals view --port 4420`) so any already-running viewer stays unaffected. Note: rebuilding `dist/viewer/page/` changes what an existing viewer serves, so tell the user to restart their viewer after changing `src/viewer/`.
2. Open the Overview, Runs list, one run, and one trial in a browser and check the console for errors (reload after each rebuild).
3. Inspect a trial with `site` readings (shows computed diffs and collapsible pre-trial site state) and one without (shows neither). If needed, test with a temporary copied run folder and delete it afterward.
4. Exercise Overview features: headline, pack bar and legend, Needs attention, Asked for not built yet, ability map hover + drawer, searchable/filterable table + drawer, scenario links to runs, and trend continuity across filtered runs. To test failing/missing/unlisted/filtered states without altering real data, copy the newest run folder under a newer timestamp, edit its `run.json` (`startedAt`, failing verdict, `isError` tool call, `serverChecks` with `missing` and `inNoPack`, single-scenario subset), add a temporary `to-be-implemented` story file, verify all sections, and remove both copies afterward.
5. Run `npx wp-ability-evals view --export <tmp-dir>` and open the exported static bundle over a local static server to confirm Overview, Runs, and Trials load cleanly without the Node API server.

## Project sync (`src/init/update.ts`, `src/cli/main.ts`)

1. In a test project, modify one line in `.agents/skills/add-evals/SKILL.md`, modify one line inside the guide markers in `AGENTS.md`, and add a project-specific line above the `BEGIN` marker.
2. Confirm `validate` flags both modified package files, `update` names both and writes nothing, `update --overwrite` refreshes both while preserving the project line above `BEGIN`, and a second `update` reports no changes.
3. In a copy of the project, delete both marker lines from `AGENTS.md`: confirm `update` fails with an actionable error message and writes nothing.
