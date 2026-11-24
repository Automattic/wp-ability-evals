// Errors the evals raise on purpose. Each has its own class, so a caller can tell them apart.

/** `init` found files it would have to overwrite, and wrote nothing. */
export class ProjectExistsError extends Error {
  readonly existing: string[];

  constructor(dir: string, existing: string[]) {
    super(`${dir} already has ${existing.join(', ')}. Nothing was written. Choose an empty folder, or move those files away.`);
    this.name = 'ProjectExistsError';
    this.existing = existing;
  }
}

/** A command that needs a project ran in a folder that is not one. */
export class ProjectNotFoundError extends Error {
  constructor(dir: string) {
    super(
      `${dir} is not an evals project: it has no evals.config.ts. Run the command in a project folder, or create a project with \`wp-ability-evals init <folder>\`.`,
    );
    this.name = 'ProjectNotFoundError';
  }
}

/** A project's guide file does not mark the package's guide, so `update` can't replace it and writes nothing. */
export class GuideNotMarkedError extends Error {
  constructor(file: string, packageFile: string) {
    super(
      `${file} does not mark the package's guide: it lacks the lines \`<!-- BEGIN wp-ability-evals guide ... -->\` and \`<!-- END wp-ability-evals guide -->\`. So \`wp-ability-evals update\` can't tell the guide from this project's own rules, and changes nothing. Copy the lines of ${packageFile} from its BEGIN line to its END line into ${file}, in the place of the guide it has now, keep this project's own rules outside the two lines, then run \`npx wp-ability-evals update\`.`,
    );
    this.name = 'GuideNotMarkedError';
  }
}

/** A copy of one of the package's files in a project, with the package's file to compare it with. Both relative to the project. */
export interface ChangedCopy {
  file: string;
  packageFile: string;
}

/** `update` found copies of the package's skills or guide that someone changed in the project, and wrote nothing. */
export class ChangedInProjectError extends Error {
  readonly changed: string[];

  constructor(changed: ChangedCopy[]) {
    const list = changed.map(({ file, packageFile }) => `  ${file}  (the package's: ${packageFile})`).join('\n');
    super(
      `These came with the package and are no longer what it copied: someone changed them in this project, or the project has no record of what was copied. Nothing was written.\n${list}\nCompare each with the package's file. What this project needs of its own version belongs where \`update\` leaves it alone: rules for a skill in .agents/rules/<the skill's name>.md, other rules in AGENTS.md outside its two guide lines. Then \`npx wp-ability-evals update --overwrite\` replaces them with the package's. That discards the changes, so ask the person first.`,
    );
    this.name = 'ChangedInProjectError';
    this.changed = changed.map(({ file }) => file);
  }
}

/** A command was typed in a way the command line does not understand. */
export class UsageError extends Error {
  constructor(usage: string) {
    super(`Usage: ${usage}`);
    this.name = 'UsageError';
  }
}

/** A command named a site the project has no file for. */
export class UnknownSiteError extends Error {
  constructor(name: string, sites: string[]) {
    const known = sites.length > 0 ? `This project's sites: ${sites.join(', ')}.` : 'This project has no sites yet.';
    super(`No site named ${name}. ${known} A site is a file in the project's sites folder, named \`<name>.json\`.`);
    this.name = 'UnknownSiteError';
  }
}

/** A site was asked for something it can only do once it has been started. */
export class SiteNotRunningError extends Error {
  constructor(name: string) {
    super(`Site ${name} is not running. Start it with \`wp-ability-evals site start ${name}\`.`);
    this.name = 'SiteNotRunningError';
  }
}

/** Another site or program on this machine holds the port a site starts on. */
export class SitePortTakenError extends Error {
  constructor(name: string, port: number, holder: string) {
    super(
      `Site ${name} can't start: its port ${port} is in use by ${holder}. Give the site a port of its own, which nothing else on this machine uses, not even another project's site, under \`wpEnv.port\` in its site file, ${name}.json.`,
    );
    this.name = 'SitePortTakenError';
  }
}

/** A site file names a folder or a file on this machine that is not there, so the site would start without it. */
export class SiteSourceMissingError extends Error {
  constructor(name: string, missing: string[]) {
    super(
      `Site ${name} can't be set up: ${missing.join(', ')} ${missing.length === 1 ? 'does' : 'do'} not exist. Check the paths in sites/${name}.json; a path that starts with \`.\` is read from the project folder. What comes with the package is in node_modules after \`npm install\`.`,
    );
    this.name = 'SiteSourceMissingError';
  }
}

/** The viewer's page is not in `dist/`, which happens in a checkout of the package that was never built. */
export class ViewerNotBuiltError extends Error {
  constructor() {
    super("The viewer's page is not built. Run `npm run build` in the wp-ability-evals package, then try again.");
    this.name = 'ViewerNotBuiltError';
  }
}

/** The viewer could not start, because another program listens on its port. */
export class ViewerPortInUseError extends Error {
  constructor(port: number) {
    super(`Port ${port} is in use, so the viewer can't start there. If a viewer is already running, open http://localhost:${port}. Otherwise choose another port: \`wp-ability-evals view --port <number>\`.`);
    this.name = 'ViewerPortInUseError';
  }
}

/** A command named an agent the project's config does not have. */
export class UnknownAgentError extends Error {
  constructor(name: string, agents: string[]) {
    super(`No agent named ${name}. The agents in evals.config.ts: ${agents.join(', ') || 'none'}.`);
    this.name = 'UnknownAgentError';
  }
}

/** No scenario matched what a run asked for. */
export class NothingToRunError extends Error {
  constructor(site: string, filter: string | undefined, shard?: { index: number; total: number }) {
    const matching = filter ? ` with an id that contains "${filter}"` : '';
    const slice = shard ? ` in shard ${shard.index}/${shard.total}` : '';
    super(`No scenario to run on site ${site}${matching}${slice}. \`wp-ability-evals list\` shows the scenarios; a site runs those of the packs it names.`);
    this.name = 'NothingToRunError';
  }
}

/** An agent can't run as it is set up, for example its API key is missing. */
export class AgentNotReadyError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'AgentNotReadyError';
  }
}

/** An agent ran and did not end with an answer. */
export class AgentFailedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'AgentFailedError';
  }
}

/** A judge ran and did not give a verdict. */
export class JudgeFailedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'JudgeFailedError';
  }
}

/** A scenario with a rubric was to run with an agent that names no judge. */
export class AgentHasNoJudgeError extends Error {
  constructor(agent: string, scenarioId: string, judges: string[]) {
    const known = judges.length > 0 ? `The judges there: ${judges.join(', ')}.` : 'Add `judges` there too, such as `{ claude: claudeJudge({ ... }) }`.';
    super(`${scenarioId} has a rubric, and the agent ${agent} names no judge to grade its answers. Add \`judge: '<name>'\` to the agent in evals.config.ts. ${known}`);
    this.name = 'AgentHasNoJudgeError';
  }
}

/** One or more of a project's hooks failed at a point of a run. Each failure names the point and the hook. */
export class HookFailedError extends Error {
  constructor(failures: string[]) {
    super(failures.join('; '));
    this.name = 'HookFailedError';
  }
}

/** A site could not be put back at its marked start before a trial. Nothing of the trial ran, its hooks included. */
export class SiteNotResetError extends Error {
  constructor(site: string, reason: string) {
    super(`Site ${site} could not be put back at its marked start: ${reason}`);
    this.name = 'SiteNotResetError';
  }
}

/** A site does not start a trial as its scenario declares: as it was at its marked start, plus the scenario's starting content. */
export class SiteNotPreparedError extends Error {
  constructor(problem: string) {
    super(problem);
    this.name = 'SiteNotPreparedError';
  }
}

/** A site could not make a change it was asked for, such as a scenario's starting content. */
/** A site could not be read. The reason names the entity type whose reader failed, where one did. */
export class SiteReadFailedError extends Error {
  constructor(site: string, reason: string) {
    super(`Site ${site} could not be read: ${reason}`);
    this.name = 'SiteReadFailedError';
  }
}

export class SiteChangeFailedError extends Error {
  constructor(site: string, reason: string) {
    super(`Site ${site} could not be changed: ${reason}`);
    this.name = 'SiteChangeFailedError';
  }
}

/** Docker, which a wp-env site runs in, is not installed, not running or not answering. */
export class DockerNotAvailableError extends Error {
  constructor(reason: string) {
    super(`Docker is not available, and a wp-env site runs in it. Install it, start it or restart it, then try again. (${reason})`);
    this.name = 'DockerNotAvailableError';
  }
}

/** The server checks could not list the tools of a site's MCP server. */
export class ServerNotReadError extends Error {
  constructor(url: string, reason: string) {
    super(
      `The site's MCP server at ${url} could not be read, so no scenario can be judged on it: ${reason}. Check that the site runs (\`wp-ability-evals site start <name>\`) and that the server answers at that address with the site's sign-in.`,
    );
    this.name = 'ServerNotReadError';
  }
}

/** An outside program (Docker, wp-env, an agent) could not be started, or ended with an error. */
export class CommandFailedError extends Error {
  /** What the program said, or why it could not run, without the command. */
  readonly reason: string;

  constructor(command: string, args: string[], reason: string) {
    const typed = [command, ...args].join(' ');
    super(`\`${typed.length > 200 ? `${typed.slice(0, 200)}…` : typed}\` failed: ${reason}`);
    this.name = 'CommandFailedError';
    this.reason = reason;
  }
}

/** What an error says, whatever was thrown: a project's own code may throw something that is not an `Error`. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** One thing that is wrong in a project's files. */
export interface Problem {
  file: string;
  /** What is wrong and, where it is not obvious, what to write instead. */
  message: string;
}

/** A project's files do not follow the format. It holds every problem found, so they can all be fixed in one pass. */
export class InvalidProjectError extends Error {
  readonly problems: Problem[];

  constructor(problems: Problem[]) {
    const count = problems.length === 1 ? '1 problem' : `${problems.length} problems`;
    const lines = problems.map((problem) => `  ${problem.file}: ${problem.message}`);
    super(`${count} in the project's files:\n${lines.join('\n')}`);
    this.name = 'InvalidProjectError';
    this.problems = problems;
  }
}

/** The problems an `InvalidProjectError` holds. Any other error is not about the project's files, and is thrown again. */
export function problemsIn(error: unknown): Problem[] {
  if (error instanceof InvalidProjectError) return error.problems;
  throw error;
}
