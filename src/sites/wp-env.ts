// A local WordPress site in Docker, run by wp-env. The MCP Adapter plugin serves its MCP endpoint.
// It keeps two snapshots of the database. Setup saves the clean state, which every start returns to. A run
// marks its start after its before-run hooks, and a reset restores that one, so every trial starts the same
// and finds what those hooks put on the site.
//
// The MCP Adapter presents abilities through three tools that find, describe and run them. A plugin on the
// site can present each ability as a tool of its own instead, which is how other MCP servers present them.
// The package has one, `wp-plugins/abilities-as-tools`, for a site file to name.

import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { connect } from 'node:net';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';
import type { EntityType, SiteState } from '../entities/types.ts';
import { CommandFailedError, DockerNotAvailableError, SiteChangeFailedError, SiteNotRunningError, SitePortTakenError, SiteReadFailedError, SiteSourceMissingError } from '../errors.ts';
import type { LookupTools, McpServer } from '../mcp-server.ts';
import { run, type RunOptions } from '../process.ts';
import type { SiteChange } from '../scenarios/types.ts';
import type { Site, SiteContext, WpEnvSite } from './types.ts';
import { missingSourcesOf, wpEnvConfigOf } from './wp-env-config.ts';

const KIND = 'wp-env';
const DEFAULT_PORT = 8888;
const MCP_SERVER_NAME = 'wp';
const MCP_ROUTE = '/wp-json/mcp/mcp-adapter-default-server';
// The MCP Adapter's three tools. A site whose plugins present each ability as a tool has none of them, and
// the checks then read every tool as an ability, so the site file does not have to say which it is.
// The tool that runs an ability takes the ability's name and, under `parameters`, the ability's input.
const LOOKUP: LookupTools = {
  runTools: [{ tool: 'mcp-adapter-execute-ability', nameArgument: 'ability_name', inputArgument: 'parameters' }],
  otherTools: ['mcp-adapter-discover-abilities', 'mcp-adapter-get-ability-info'],
};
// The name of the application password the agent signs in with. The agent can see it, so it reads as a site
// owner would have named it.
const SIGN_IN_NAME = 'mcp-client';
// wp-env titles a site after the folder of its config, which is the site file's name, such as `local`. An agent
// reads the title, and no owner names a site that, so setup gives it the title WordPress Playground gives a new site.
const SITE_TITLE = 'My WordPress Website';

// Docker answers these in well under a second; the limits only keep a Docker that never answers from hanging a command.
const DOCKER_TIMEOUT_MS = 30_000;
// The containers wp-env runs for a site. The site answers only while all of them run: WordPress serves the MCP
// endpoint, MySQL holds the database and the CLI container runs WP-CLI.
const SERVICES = ['wordpress', 'mysql', 'cli'];
const WP_CLI_TIMEOUT_MS = 120_000;
// The first start downloads WordPress and the plugins.
const WP_ENV_TIMEOUT_MS = 900_000;

/** One item as an entity type's reader returns it: its key, then its fields. */
interface Row {
  key: string;
  [field: string]: unknown;
}

/** The wp-env program that came with this package, so a project needs to install nothing of its own. */
function wpEnvProgram(): string {
  const manifest = createRequire(import.meta.url).resolve('@wordpress/env/package.json');
  return join(dirname(manifest), 'bin', 'wp-env');
}

function phpString(text: string): string {
  return `'${text.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

function readerOf(type: EntityType): string {
  const reader = type.readers[KIND];
  if (reader === undefined) throw new Error(`The entity type ${type.name} has no \`${KIND}\` reader, so a ${KIND} site can't read it.`);
  return reader;
}

function writerOf(type: EntityType): string {
  const writer = type.writers?.[KIND];
  if (writer === undefined) throw new Error(`The entity type ${type.name} has no \`${KIND}\` writer, so a ${KIND} site can't change it.`);
  return writer;
}

/**
 * Where in a project's PHP an error happened, for its message: the line of the reader or writer itself when
 * it was there, counted from its first line, or else the file and line of the code it called.
 */
const WHERE = `$where = fn(Throwable $error, string $part) => str_ends_with($error->getFile(), "eval()'d code")
  ? 'on line ' . $error->getLine() . ' of the ' . $part : 'in ' . $error->getFile() . ' on line ' . $error->getLine();`;

/**
 * The PHP that reads every entity type in one call, and prints what it read as JSON. Each reader runs through
 * an `eval` of its own, so that one that can't be parsed or that fails is named, with the line in it, where
 * the PHP of all of them joined would name none.
 */
function readWith(types: EntityType[]): string {
  const readers = types.map((type) => `${phpString(type.name)} => ${phpString(readerOf(type))}`);
  return [
    WHERE,
    '$read = [];',
    `foreach ([${readers.join(', ')}] as $type => $reader) {`,
    `  try { $read[$type] = eval('return ' . $reader . "\\n;"); }`,
    `  catch (Throwable $error) { WP_CLI::error('the \`${KIND}\` reader of the entity type \`' . $type . '\` failed: ' . $error->getMessage() . ', ' . $where($error, 'reader') . '.'); }`,
    '}',
    'echo wp_json_encode($read);',
  ].join('\n');
}

/**
 * The PHP that makes a change with the writers of its entity types. The change is not in it: it is read as
 * JSON from the input, so a title that holds a quote or a `$` stays data and can never become code. Each
 * writer is made through an `eval` of its own before anything changes, so that one that can't be parsed is
 * named. A writer that fails stops the change there, with the item it failed on.
 */
function changeWith(types: EntityType[]): string {
  const writers = types.map((type) => `${phpString(type.name)} => ${phpString(writerOf(type))}`);
  return [
    WHERE,
    "$change = json_decode(file_get_contents('php://stdin'), true);",
    "if (!is_array($change)) WP_CLI::error('The change did not arrive as JSON.');",
    '$writers = [];',
    `foreach ([${writers.join(', ')}] as $type => $writer) {`,
    `  try { $writers[$type] = eval('return function ($key, $fields) {' . $writer . "\\n};"); }`,
    `  catch (ParseError $error) { WP_CLI::error('the \`${KIND}\` writer of the entity type \`' . $type . '\` is not valid PHP: ' . $error->getMessage() . ', ' . $where($error, 'writer') . '.'); }`,
    '}',
    'foreach ($change as $type => $items) foreach ($items as $key => $fields) {',
    "  try { $writers[$type]((string) $key, $fields); } catch (Throwable $error) { WP_CLI::error($type . ' ' . $key . ': ' . $error->getMessage()); }",
    '}',
  ].join('\n');
}

/** Whether a program on this machine answers on the port. A Docker container that publishes it does too. */
function answersOn(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(port, 'localhost');
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

/** Whether a site is a wp-env site, so that a hook can run WP-CLI on it with `site.wp(args)`. */
export function isWpEnvSite(site: Site): site is WpEnvSite {
  return 'wp' in site && typeof site.wp === 'function';
}

export function createWpEnvSite({ name, file, projectDir, workDir, entityTypes }: SiteContext): WpEnvSite {
  const port = typeof file.wpEnv?.port === 'number' ? file.wpEnv.port : DEFAULT_PORT;
  const wpEnvConfig = wpEnvConfigOf(file.wpEnv ?? {}, projectDir);
  const config = `${JSON.stringify(wpEnvConfig, null, 2)}\n`;
  const configFile = join(workDir, '.wp-env.json');
  // The clean state: the site as setup left it.
  const snapshotFile = join(workDir, 'snapshot.sql');
  // The marked start: the site as the before-run hooks of the last run or `site start` left it.
  const markedStartFile = join(workDir, 'marked-start.sql');
  const serverFile = join(workDir, 'mcp-server.json');
  // The name of the site's Docker Compose project, which wp-env chooses, with the config file it is for.
  const projectFile = join(workDir, 'wp-env-project.json');
  let cliContainer: string | undefined;

  const wpEnv = (...args: string[]): Promise<string> =>
    run(process.execPath, [wpEnvProgram(), ...args], { cwd: workDir, showOutput: true, timeoutMs: WP_ENV_TIMEOUT_MS });

  /** The running containers of one wp-env service, each printed in the given format. Listing them is also how a Docker that does not work shows. */
  async function containers(filters: string[], format: string): Promise<string> {
    const args = ['ps', ...filters.flatMap((filter) => ['--filter', `label=com.docker.compose.${filter}`]), '--format', format];
    try {
      return await run('docker', args, { timeoutMs: DOCKER_TIMEOUT_MS });
    } catch (error) {
      throw new DockerNotAvailableError(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * The name of the site's Docker Compose project, by which its containers are found: wp-env names it after
   * the path of the config file, and says so in its status. Asking takes seconds, so the answer is kept, and
   * asked again only for another config file, as when the project was moved. Undefined before the first setup.
   */
  async function composeProject(): Promise<string | undefined> {
    if (!existsSync(configFile)) return undefined;
    if (existsSync(projectFile)) {
      const kept = JSON.parse(await readFile(projectFile, 'utf8')) as { configFile: string; project: string };
      if (kept.configFile === configFile) return kept.project;
    }
    const status = JSON.parse(await run(process.execPath, [wpEnvProgram(), 'status', '--json'], { cwd: workDir, timeoutMs: DOCKER_TIMEOUT_MS })) as { installPath: string };
    const project = basename(status.installPath);
    await writeFile(projectFile, `${JSON.stringify({ configFile, project }, null, 2)}\n`);
    return project;
  }

  // `wp-env run` takes seconds per call, too slow to use around every trial, so WP-CLI runs straight in the
  // site's CLI container. It is found by the site's own Compose project: two projects on this machine may give
  // their sites the same port, and a site found by its port could be another project's.
  async function findCliContainer(): Promise<string | undefined> {
    // Docker is asked first, so that a Docker that does not work is reported as that, in seconds.
    const running = await containers(['service=cli'], '{{.Label "com.docker.compose.project"}} {{.Names}}');
    const project = await composeProject();
    return running.split('\n').find((line) => project !== undefined && line.split(' ')[0] === project)?.split(' ')[1];
  }

  /**
   * Whether every container of the site runs. One can stop alone, as WordPress does after `docker stop`, and a
   * site whose CLI container still runs would then restore its database and serve nothing.
   */
  async function isRunning(): Promise<boolean> {
    // Docker is asked first, so that a Docker that does not work is reported as that, in seconds.
    const running = await containers([], '{{.Label "com.docker.compose.project"}} {{.Label "com.docker.compose.service"}}');
    const project = await composeProject();
    const services = running.split('\n').filter((line) => project !== undefined && line.split(' ')[0] === project).map((line) => line.split(' ')[1]);
    return SERVICES.every((service) => services.includes(service));
  }

  /** Stops a start that would fail on a port another site or program holds, with what holds it. The site's own containers may hold it. */
  async function checkPort(): Promise<void> {
    const own = await composeProject();
    const sites = await containers(['service=wordpress'], '{{.Label "com.docker.compose.project"}} {{.Ports}}');
    const holder = sites.split('\n').find((line) => line.includes(`:${port}->`))?.split(' ')[0];
    if (holder !== undefined && holder !== own) throw new SitePortTakenError(name, port, `the WordPress site ${holder}`);
    if (holder === undefined && (await answersOn(port))) throw new SitePortTakenError(name, port, 'another program');
  }

  async function wp(args: string[], options: RunOptions = {}): Promise<string> {
    cliContainer ??= await findCliContainer();
    if (!cliContainer) throw new SiteNotRunningError(name);
    const exec = options.inputFile !== undefined || options.input !== undefined ? ['exec', '-i'] : ['exec'];
    return run('docker', [...exec, cliContainer, 'wp', ...args], { timeoutMs: WP_CLI_TIMEOUT_MS, ...options });
  }

  /** The site's MCP server, if the site was set up with the settings its file has now. */
  async function preparedServer(): Promise<McpServer | undefined> {
    if (![configFile, snapshotFile, serverFile].every((path) => existsSync(path))) return undefined;
    if ((await readFile(configFile, 'utf8')) !== config) return undefined;
    const { name: serverName, url, headers } = JSON.parse(await readFile(serverFile, 'utf8')) as McpServer;
    return { name: serverName, url, headers, lookup: LOOKUP };
  }

  async function setUp(): Promise<McpServer> {
    const missing = missingSourcesOf(wpEnvConfig);
    if (missing.length > 0) throw new SiteSourceMissingError(name, missing);
    await mkdir(workDir, { recursive: true });
    // The snapshot is what marks the site as set up, so a setup that fails halfway starts over next time.
    await rm(snapshotFile, { force: true });
    await writeFile(configFile, config);
    await checkPort();
    await wpEnv('start');
    await wpEnv('reset', 'development');
    cliContainer = undefined;
    await wp(['option', 'update', 'blogname', SITE_TITLE]);

    const password = await wp(['user', 'application-password', 'create', 'admin', SIGN_IN_NAME, '--porcelain']);
    const server: McpServer = {
      name: MCP_SERVER_NAME,
      url: `http://localhost:${port}${MCP_ROUTE}`,
      headers: { Authorization: `Basic ${Buffer.from(`admin:${password}`).toString('base64')}` },
    };
    await writeFile(serverFile, `${JSON.stringify(server, null, 2)}\n`);
    // The snapshot is taken last, so it holds the sign-in too, and a restore keeps the sign-in valid.
    await snapshot(snapshotFile);
    return { ...server, lookup: LOOKUP };
  }

  /** Saves the database as it is now. The file appears only once it is whole, so half a snapshot is never restored. */
  async function snapshot(snapshotPath: string): Promise<void> {
    await wp(['db', 'export', '-'], { outputFile: `${snapshotPath}.part` });
    await rename(`${snapshotPath}.part`, snapshotPath);
  }

  async function restore(snapshotPath: string): Promise<void> {
    await wp(['db', 'import', '-'], { inputFile: snapshotPath });
    await wp(['cache', 'flush']);
  }

  return {
    name,
    packs: file.packs,

    async start(): Promise<McpServer> {
      // Asked first, so that a Docker that does not answer is reported in seconds, not after wp-env gives up.
      const running = await isRunning();
      // A marked start belongs to the run that marked it, so a start begins without one.
      await rm(markedStartFile, { force: true });
      const server = await preparedServer();
      // Setup leaves the site in its clean state.
      if (!server) return setUp();
      if (!running) {
        await checkPort();
        await wpEnv('start');
        cliContainer = undefined;
      }
      // What an earlier run or a person left on the site goes. New containers get the sign-in this way too.
      await restore(snapshotFile);
      return server;
    },

    async markStart(): Promise<void> {
      if (!existsSync(snapshotFile)) throw new SiteNotRunningError(name);
      // It is taken from a site that was restored from the clean snapshot, so it holds the sign-in too.
      await snapshot(markedStartFile);
    },

    async reset(): Promise<void> {
      if (!existsSync(snapshotFile)) throw new SiteNotRunningError(name);
      await restore(existsSync(markedStartFile) ? markedStartFile : snapshotFile);
    },

    async state(): Promise<SiteState> {
      if (!existsSync(snapshotFile)) throw new SiteNotRunningError(name);
      if (entityTypes.length === 0) return {};
      // One call for all entity types: each call into the container costs about as much as the reading itself.
      let read: Record<string, Row[]>;
      try {
        read = JSON.parse(await wp(['eval', readWith(entityTypes)])) as Record<string, Row[]>;
      } catch (error) {
        // The command is the PHP of every reader, which says nothing about what failed. What WP-CLI said does.
        if (error instanceof CommandFailedError) throw new SiteReadFailedError(name, error.reason.replace(/^Error: /, ''));
        throw error;
      }
      return Object.fromEntries(
        entityTypes.map((type) => [type.name, Object.fromEntries((read[type.name] ?? []).map(({ key, ...fields }) => [key, fields]))]),
      );
    },

    async apply(change: SiteChange): Promise<void> {
      if (!existsSync(snapshotFile)) throw new SiteNotRunningError(name);
      const types = Object.keys(change).map((typeName) => {
        const type = entityTypes.find((candidate) => candidate.name === typeName);
        if (type !== undefined) return type;
        const known = entityTypes.map((candidate) => candidate.name).join(', ') || 'none';
        throw new Error(`Site ${name} can't change \`${typeName}\`: none of its packs lists it under \`entities\`. Its entity types: ${known}.`);
      });
      if (types.length === 0) return;
      try {
        // As the admin user, so that what is created has an author, as with a hook's WP-CLI.
        await wp(['--user=admin', 'eval', changeWith(types)], { input: JSON.stringify(change) });
      } catch (error) {
        // The command is the PHP of every writer, which says nothing about this change. What WP-CLI said does.
        if (error instanceof CommandFailedError) throw new SiteChangeFailedError(name, error.reason.replace(/^Error: /, ''));
        throw error;
      }
    },

    async stop(): Promise<void> {
      if (!existsSync(configFile)) return;
      await wpEnv('stop');
      cliContainer = undefined;
    },

    async remove(): Promise<void> {
      // wp-env finds a site's containers and data by its configuration, so a site that was never set up has none.
      if (existsSync(configFile)) {
        // Asked first, as in `start`: without Docker nothing is removed, and the site's folder stays to find it by.
        await findCliContainer();
        // `cleanup` and not `destroy`, which also removes Docker images, among them the database image that the
        // other wp-env sites on this machine run on. `--force` answers the question wp-env would ask, because
        // nobody is there to answer it.
        await wpEnv('cleanup', '--force');
        cliContainer = undefined;
      }
      await rm(workDir, { recursive: true, force: true });
    },

    // A hook's WP-CLI runs as the admin user, so that what it creates has an author.
    wp: (args: string[]): Promise<string> => wp(['--user=admin', ...args]),
  };
}
