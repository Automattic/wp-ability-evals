#!/usr/bin/env node
// The command line: `npx wp-ability-evals <command>`, run inside a project (or anywhere, for `init`).
// It only reads the command and hands over; nothing that decides a result lives here.

import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { unnamedNote } from '../coverage/coverage.ts';
import { UsageError } from '../errors.ts';
import { endRunOn, startRunOn } from '../hooks/run-on-site.ts';
import { initProject } from '../init/init.ts';
import { updateNotice, updateProject } from '../init/update.ts';
import { unlistedEntityTypeNotices } from '../project/cross-checks.ts';
import { loadProject } from '../project/load.ts';
import { sameFamilyNotices } from '../project/judges.ts';
import { parseShard, siteOf } from '../project/site.ts';
import type { Project } from '../project/types.ts';
import { mergeRuns } from '../results/merge.ts';
import type { TrialResult } from '../results/types.ts';
import { summarize } from '../results/write.ts';
import { run } from '../runner/run.ts';
import { checkServer, findingLines, hasProblem } from '../server-checks/check.ts';
import type { ServerFindings } from '../server-checks/types.ts';
import type { Site } from '../sites/types.ts';
import { isProved, proofLines, summaryLines } from '../verify/report.ts';
import { verify } from '../verify/verify.ts';
import { exportViewer } from '../viewer/export.ts';
import { startViewer } from '../viewer/server.ts';

const SITE_USAGE = 'wp-ability-evals site <start|check|state|reset|stop|remove> <name>';
const VIEW_USAGE = 'wp-ability-evals view [--port <number>] [--export <folder>] [--results <folder>]';
// A port few programs use, so the viewer's address stays the same from one day to the next.
const VIEW_PORT = 4400;
const RUN_USAGE = 'wp-ability-evals run --site <name> --agent <name> [--agent <name>] [--filter <text>] [--shard <index>/<total>] [--trials <number>]';
const MERGE_USAGE = 'wp-ability-evals merge --out <results-folder> <run-folder> [<run-folder>...]';
const UPDATE_USAGE = 'wp-ability-evals update [--overwrite]';
const VERIFY_USAGE = 'wp-ability-evals verify --site <name> [--filter <text>] [--shard <index>/<total>] [--no-judges]';

const USAGE = `Usage: wp-ability-evals <command> [options]

Commands:
  init [folder]         Create a new evals project in the folder (default: the current one)
  update                Take the installed package's skills and guide into this project, after installing a
                        newer version of the package. It replaces the skills in .agents/skills and the
                        guide's files in .agents/guide that came with the package, and the guide between
                        the two marker lines of AGENTS.md, and leaves everything else alone. Where one of them was changed in this project, it
                        names it and writes nothing, unless --overwrite says to replace those too
  run                   Run scenarios with one or more agents on a site, starting the site if needed.
                        This spends the agent's plan or API credit
  merge                 Combine sharded run folders into one run folder inside an output results folder
  verify                Prove scenarios on a site without an agent, starting the site if needed: the
                        starting content, the site check and the answer. Grading the answers next to a
                        rubric spends each judge's plan or API credit, unless --no-judges leaves it out
  view                  Show the coverage of the abilities and the saved runs in a browser, on this
                        machine. It runs until stopped with Ctrl+C
  list                  List the packs, their stories and each story's scenarios with their kind, their
                        state and how many items of starting content each has
  validate              Check the settings and every pack, story and site file, without running anything
  site <action> <name>  Work with the site in sites/<name>.json:
                          start   make it reachable as a run finds it: set up the first time, in its clean
                                  state, with the before-run hooks of evals.config.ts run on it
                          check   start it as a run does, list its MCP server's tools with MCP Inspector and
                                  compare them with its packs: the abilities the packs list that the site
                                  lacks, the site's tools that no pack lists, and problems in the listed
                                  abilities' definitions (schema portability, descriptions, annotations). A run does this first
                          state   print what is on it, as the entity types of its packs read it
                          reset   put it back at its marked start: as the last start or run left it for
                                  its trials
                          stop    stop it; it keeps its data
                          remove  remove it with its data; the next start sets it up again

Options for update:
  --overwrite       Replace also what was changed in this project. Those changes are lost

Options for run:
  --site <name>     A file in the project's sites folder, without .json
  --agent <name>    An agent from evals.config.ts; repeat for several
  --filter <text>   Run only scenarios whose id contains the text; repeat for several
  --shard <n>/<m>   Run only slice n of m (1-based round-robin), sequentially or in parallel
  --trials <number> How many times each agent runs each scenario, instead of the number in
                    evals.config.ts. A scenario passes only when every trial passes

Options for merge:
  --out <folder>    Destination results root where the combined run folder is created

Options for verify:
  --site <name>     A file in the project's sites folder, without .json
  --filter <text>   Prove only scenarios whose id contains the text; repeat for several
  --shard <n>/<m>   Prove only slice n of m (1-based round-robin)
  --no-judges       Leave out the grading of the answers next to a rubric, which is the one step that
                    calls a model

Options for view:
  --port <number>   The port to serve the page on (default: ${VIEW_PORT})
  --export <folder> Write a static self-contained viewer (HTML/JS/CSS + JSON data) into the folder and exit
  --results <dir>   Read saved runs from this folder instead of resultsDir in evals.config.ts
`;

function counted(count: number, noun: string, plural = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : plural}`;
}

/** The first line of a story that has text on it: enough to tell the stories of a pack apart. */
function firstLine(text: string): string {
  return text.split('\n').find((line) => line.trim() !== '')?.trim() ?? '';
}

/**
 * What a scenario starts with, as `list` shows it: how many items its starting content has, by entity type,
 * such as `given: 2 posts, 1 pages`. Nothing for a scenario without starting content. `given` is that
 * content: entity type, then the item's key.
 */
function givenOf(given: Record<string, Record<string, unknown>> = {}): string {
  const counts = Object.entries(given)
    .map(([type, items]) => ({ type, count: Object.keys(items).length }))
    .filter(({ count }) => count > 0)
    .map(({ type, count }) => `${count} ${type}`);
  return counts.length === 0 ? '' : `given: ${counts.join(', ')}`;
}

async function init(folder: string): Promise<void> {
  const { dir, created } = await initProject(folder);
  console.log(`Created an evals project in ${dir}:`);
  for (const file of created) console.log(`  ${file}`);
  console.log(`\nNext: run \`npm install\` there. Its AGENTS.md says how to work in the project.`);
}

async function update(args: string[]): Promise<void> {
  let values;
  try {
    ({ values } = parseArgs({ args, options: { overwrite: { type: 'boolean' } } }));
  } catch {
    throw new UsageError(UPDATE_USAGE);
  }
  const { added, updated } = await updateProject(process.cwd(), { overwrite: values.overwrite === true });
  if (added.length + updated.length === 0) {
    console.log("Nothing to update: this project's skills and guide are the installed package's.");
    return;
  }
  console.log("Took the installed package's skills and guide into this project:");
  for (const file of added) console.log(`  added    ${file}`);
  for (const file of updated) console.log(`  updated  ${file}`);
  if (updated.includes('AGENTS.md')) console.log('In AGENTS.md only the guide between its two marker lines was replaced.');
}

async function list(): Promise<void> {
  const { packs } = await loadProject(process.cwd());
  const all = packs.flatMap((pack) => pack.scenarios);
  // The widest id and the widest state, so that each column starts in one place.
  const width = Math.max(0, ...all.map((scenario) => scenario.id.length));
  const stateWidth = Math.max(0, ...all.map((scenario) => (scenario.state ?? 'implemented').length));
  for (const pack of packs) {
    console.log(`${pack.name}: ${pack.title} (${counted(pack.stories.length, 'story', 'stories')}, ${counted(pack.scenarios.length, 'scenario')})`);
    for (const story of pack.stories) {
      console.log(`  ${story.file}: ${firstLine(story.text)}`);
      const scenarios = pack.scenarios.filter(({ id }) => story.scenarioIds.includes(id));
      if (scenarios.length === 0) console.log('    no scenarios yet: the story waits for them');
      for (const { id, kind, state, given } of scenarios) {
        // The starting content comes last, and a scenario without any ends at its state.
        console.log(`    ${id.padEnd(width)}  ${kind.padEnd(5)}  ${(state ?? 'implemented').padEnd(stateWidth)}  ${givenOf(given)}`.trimEnd());
      }
    }
  }
}

async function validate(): Promise<void> {
  const { packs, sites, config } = await loadProject(process.cwd());
  const stories = packs.reduce((count, pack) => count + pack.stories.length, 0);
  const scenarios = packs.reduce((count, pack) => count + pack.scenarios.length, 0);
  const counts = [counted(packs.length, 'pack'), counted(stories, 'story', 'stories'), counted(scenarios, 'scenario'), counted(Object.keys(sites).length, 'site')];
  console.log(`Valid: ${counts.join(', ')}.`);
  const unnamed = unnamedNote(packs);
  for (const notice of [...sameFamilyNotices(Object.keys(config.agents), config), ...unlistedEntityTypeNotices(packs, config), ...(unnamed === undefined ? [] : [unnamed])]) console.log(notice);
  // The project is valid either way: an older guide or skill is something to know about, not a problem in its files.
  const notice = await updateNotice(process.cwd());
  if (notice !== undefined) console.log(notice);
}

async function site(action: string | undefined, name: string | undefined): Promise<void> {
  const known = action === 'start' || action === 'check' || action === 'state' || action === 'reset' || action === 'stop' || action === 'remove';
  if (!known || name === undefined) throw new UsageError(SITE_USAGE);
  const project = await loadProject(process.cwd());
  const target = siteOf(project, name);

  if (action === 'start') {
    // A run starts its site the same way, so what is on the site now is what a trial starts from. No agent runs here.
    const { hooks, trials } = project.config;
    const server = await startRunOn(target, hooks, { startedAt: new Date().toISOString(), site: name, agents: [], trialsPerScenario: trials });
    const ran = (hooks.beforeRun ?? []).length;
    console.log(`Site ${name} is ready${ran === 0 ? '' : `, with ${counted(ran, 'before-run hook')} run on it`}. Its MCP server: ${server.url}`);
  } else if (action === 'check') {
    await checkSite(project, target, name);
  } else if (action === 'state') {
    console.log(JSON.stringify(await target.state(), null, 2));
  } else if (action === 'reset') {
    await target.reset();
    console.log(`Site ${name} is back at its marked start, as the last \`site start\`, run or \`verify\` left it for its trials, or in its clean state if none was marked.`);
  } else if (action === 'stop') {
    await target.stop();
    console.log(`Site ${name} is stopped.`);
  } else {
    await target.remove();
    console.log(`Site ${name} is removed, with its data. \`wp-ability-evals site start ${name}\` sets it up again.`);
  }
}

/**
 * `site check`: the site started as a run starts it, its server checked as a run checks it first, and the run
 * on the site ended as a run ends. It ends with an error when an ability is missing or the server could not be read.
 */
async function checkSite(project: Project, target: Site, name: string): Promise<void> {
  const { hooks, trials } = project.config;
  const setup = { startedAt: new Date().toISOString(), site: name, agents: [], trialsPerScenario: trials };
  const server = await startRunOn(target, hooks, setup);
  // Set by the work on the site, which `endRunOn` runs before it ends the run.
  const checked: { findings?: ServerFindings } = {};
  const packs = project.packs.filter((pack) => target.packs.includes(pack.name));
  const scenarios = packs.flatMap((pack) => pack.scenarios);
  const problems = await endRunOn(target, hooks, setup, project.sites[name]?.afterRun ?? 'keep', async () => {
    checked.findings = await checkServer(server, packs);
  });
  const findings = checked.findings ?? { outcome: 'unreadable', reason: 'The server checks did not run.' };
  for (const line of [...findingLines(findings, scenarios), ...problems]) console.log(line);
  if (hasProblem(findings, scenarios) || problems.length > 0) process.exitCode = 1;
}

function trialLine(trial: TrialResult): string {
  const outcome = trial.error !== undefined ? 'ERROR' : trial.notRun !== undefined ? 'NOT BUILT YET' : trial.pass ? 'pass ' : 'FAIL ';
  return `${outcome}  ${trial.scenarioId}  ${trial.agent}  trial ${trial.trial}  (${Math.round(trial.durationMs / 1000)}s)`;
}

async function runScenarios(args: string[]): Promise<void> {
  const options = { site: { type: 'string' }, agent: { type: 'string', multiple: true }, filter: { type: 'string', multiple: true }, shard: { type: 'string' }, trials: { type: 'string' } } as const;
  let values;
  try {
    ({ values } = parseArgs({ args, options }));
  } catch {
    throw new UsageError(RUN_USAGE);
  }
  if (values.site === undefined || values.agent === undefined) throw new UsageError(RUN_USAGE);
  const shard = values.shard === undefined ? undefined : parseShard(values.shard);
  if (values.shard !== undefined && shard === undefined) throw new UsageError(RUN_USAGE);
  const trials = values.trials === undefined ? undefined : Number(values.trials);
  if (trials !== undefined && !(Number.isInteger(trials) && trials >= 1)) throw new UsageError(RUN_USAGE);

  const project = await loadProject(process.cwd());
  let folder = '';
  const onFolder = (dir: string): void => {
    folder = relative(project.dir, dir);
    // Said before the first trial, because whoever started the run may stop it before it ends.
    console.log(`Each trial is saved in ${folder}/ as it ends, and run.json once the run has ended.`);
  };
  const result = await run(
    { site: values.site, agents: values.agent, filter: values.filter, shard, trials, onNotice: (notice) => console.log(notice), onFolder, onTrial: (trial) => console.log(trialLine(trial)) },
    project,
  );
  console.log(`\n${summarize(result).join('\n')}\nResults: ${join(folder, 'run.json')}`);
  // An expected failure is not a failure of the run; a scenario that should work and did not, or could not be judged, is.
  // So is what went wrong around the trials, such as an after-run hook that failed.
  if (result.verdicts.some((verdict) => verdict.outcome === 'fail' || verdict.outcome === 'error') || result.errors !== undefined) process.exitCode = 1;
}

async function merge(args: string[]): Promise<void> {
  let values;
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({ args, options: { out: { type: 'string' } }, allowPositionals: true }));
  } catch {
    throw new UsageError(MERGE_USAGE);
  }
  if (values.out === undefined || values.out.trim() === '' || positionals.length === 0) throw new UsageError(MERGE_USAGE);
  const merged = await mergeRuns({ sources: positionals, resultsDir: values.out });
  console.log(
    `Merged ${counted(positionals.length, 'run')} (${counted(merged.runFile.verdicts.length, 'scenario')}, ${counted(merged.runFile.trials.length, 'trial')}) into ${merged.dir}`,
  );
}

async function verifyScenarios(args: string[]): Promise<void> {
  const options = { site: { type: 'string' }, filter: { type: 'string', multiple: true }, shard: { type: 'string' }, 'no-judges': { type: 'boolean' } } as const;
  let values;
  try {
    ({ values } = parseArgs({ args, options }));
  } catch {
    throw new UsageError(VERIFY_USAGE);
  }
  if (values.site === undefined) throw new UsageError(VERIFY_USAGE);
  const shard = values.shard === undefined ? undefined : parseShard(values.shard);
  if (values.shard !== undefined && shard === undefined) throw new UsageError(VERIFY_USAGE);

  const project = await loadProject(process.cwd());
  const result = await verify(
    { site: values.site, filter: values.filter, shard, judges: values['no-judges'] !== true, onProof: (proof) => console.log(proofLines(proof).join('\n')) },
    project,
  );
  console.log(summaryLines(result).join('\n'));
  // A step that could not be checked proves nothing, so it ends the command with an error as a failed one does.
  if (!isProved(result)) process.exitCode = 1;
}

async function view(args: string[]): Promise<void> {
  let values;
  try {
    ({ values } = parseArgs({ args, options: { port: { type: 'string' }, export: { type: 'string' }, results: { type: 'string' } } }));
  } catch {
    throw new UsageError(VIEW_USAGE);
  }
  if (values.results !== undefined && values.results.trim() === '') throw new UsageError(VIEW_USAGE);
  if (values.export !== undefined) {
    if (values.port !== undefined || values.export.trim() === '') throw new UsageError(VIEW_USAGE);
    const { config, packs } = await loadProject(process.cwd());
    const resultsDir = values.results === undefined ? config.resultsDir : resolve(values.results);
    const { outDir, runs } = await exportViewer({ resultsDir, packs, outDir: values.export });
    console.log(`Exported static viewer (${counted(runs, 'run')}) to ${outDir}`);
    return;
  }
  const port = values.port === undefined ? VIEW_PORT : Number(values.port);
  if (!(Number.isInteger(port) && port >= 0 && port <= 65535)) throw new UsageError(VIEW_USAGE);

  const { config, dir } = await loadProject(process.cwd());
  const resultsDir = values.results === undefined ? config.resultsDir : resolve(values.results);
  const { url } = await startViewer({ resultsDir, packs: async () => (await loadProject(dir)).packs, port });
  console.log(`The coverage of the abilities and the saved runs are at ${url}\nStop with Ctrl+C.`);
}

async function main(args: string[]): Promise<void> {
  const command = args[0];
  if (command === undefined || command === '--help' || command === '-h') {
    console.log(USAGE);
    return;
  }
  if (command === 'init') return init(args[1] ?? '.');
  if (command === 'update') return update(args.slice(1));
  if (command === 'list') return list();
  if (command === 'validate') return validate();
  if (command === 'site') return site(args[1], args[2]);
  if (command === 'run') return runScenarios(args.slice(1));
  if (command === 'merge') return merge(args.slice(1));
  if (command === 'verify') return verifyScenarios(args.slice(1));
  if (command === 'view') return view(args.slice(1));
  console.error(`Unknown command: ${command}\n\n${USAGE}`);
  process.exitCode = 1;
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
