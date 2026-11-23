// Agents write the scenarios, and a live run costs money. Loading a project is what tells them, before any
// run, that a scenario can't work, so these tests hold the rules that would otherwise fail without a word.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { InvalidProjectError } from '../src/errors.ts';
import { initProject } from '../src/init/init.ts';
import { loadProject } from '../src/project/load.ts';

const PACKAGE_ROOT = fileURLToPath(new URL('../', import.meta.url));
const STORY_FILE = 'packs/core/scenarios/site.yaml';
const SITE_FILE = 'sites/local.json';
const CONFIG_FILE = 'evals.config.ts';
// A new project's pack lists three abilities and its scenarios name two, so `validate` notes the third. A
// note is no problem: the project stays valid while scenarios are written.
const UNNAMED_IN_A_NEW_PROJECT =
  'Note: 1 of 3 abilities is named by no scenario: core/get-user-info. A scenario covers an ability by naming it in `expect.abilities`.\n';

/** A project's settings with the given `hooks`, which may name the three functions declared above them. */
function settingsWith(hooks: string): string {
  return `
import { claudeCode, defineConfig } from 'wp-ability-evals';

async function seedTheShop() {}
async function createTheDrafts() {}
async function removeUploads() {}

export default defineConfig({
  packs: ['./packs/core'],
  sitesDir: './sites',
  resultsDir: './results',
  agents: { 'claude-code': claudeCode({ model: 'claude-sonnet-5-5', signIn: 'login' }) },
  trials: 5,
  trialTimeoutMs: 300_000,
  hooks: ${hooks},
});
`;
}

/** A project as `init` creates it. The link stands in for `npm install`, so its config finds the built package. */
async function newProject(t: TestContext): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'evals-project-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await initProject(dir);
  await mkdir(join(dir, 'node_modules'));
  await symlink(PACKAGE_ROOT, join(dir, 'node_modules', 'wp-ability-evals'), 'dir');
  return dir;
}

async function command(name: string, cwd: string): Promise<string> {
  const { stdout } = await promisify(execFile)(process.execPath, [join(PACKAGE_ROOT, 'dist/cli/main.js'), name], { cwd });
  return stdout;
}

test('a new project is valid and lists its story with its scenarios, through the built command', async (t) => {
  const dir = await newProject(t);

  assert.equal(await command('validate', dir), `Valid: 1 pack, 1 story, 4 scenarios, 1 site.\n${UNNAMED_IN_A_NEW_PROJECT}`);
  assert.equal(
    await command('list', dir),
    'core: WordPress (1 story, 4 scenarios)\n  site: As a site owner I want to ask an agent about my site and trust what it answers.\n    core/site/which-wordpress-version  read   implemented\n    core/site/which-php-version        read   implemented\n    core/site/what-is-the-admin-email  read   implemented\n    core/site/change-site-title        read   implemented\n',
  );
});

test("a scenario's starting content is its story's joined with its own, which `list` counts, and a story may wait for its scenarios", async (t) => {
  const dir = await newProject(t);
  await writeFile(
    join(dir, STORY_FILE),
    `
story: |
  As a site owner I want to publish a draft by asking for it.

  On the site: two drafts, "Summer sale" and "Winter sale".
given:
  posts:
    summer-sale: { title: Summer sale, status: draft }
scenarios:
  - id: core/site/by-its-topic
    request: Publish my draft about the summer sale.
    kind: write
    expect:
      site:
        posts:
          summer-sale: { status: publish }
  - id: core/site/the-other-one
    request: Publish my draft about the winter sale.
    kind: write
    given:
      posts:
        winter-sale: { title: Winter sale, status: draft }
    expect:
      site:
        posts:
          winter-sale: { status: publish }
`,
  );
  await writeFile(join(dir, 'packs/core/scenarios/menus.yaml'), 'story: As a site owner I want to add a page to my menu by asking for it.\n');

  const { packs } = await loadProject(dir);

  assert.deepEqual(
    packs.flatMap((pack) => pack.scenarios).map((scenario) => scenario.given),
    [
      { posts: { 'summer-sale': { title: 'Summer sale', status: 'draft' } } },
      { posts: { 'summer-sale': { title: 'Summer sale', status: 'draft' }, 'winter-sale': { title: 'Winter sale', status: 'draft' } } },
    ],
  );
  assert.equal(
    await command('list', dir),
    'core: WordPress (2 stories, 2 scenarios)\n  menus: As a site owner I want to add a page to my menu by asking for it.\n    no scenarios yet: the story waits for them\n  site: As a site owner I want to publish a draft by asking for it.\n    core/site/by-its-topic   write  implemented  given: 1 posts\n    core/site/the-other-one  write  implemented  given: 2 posts\n',
  );
});

test('a scenario may expect an item the agent creates, found by its fields, and a text by what it contains', async (t) => {
  const dir = await newProject(t);
  await writeFile(
    join(dir, STORY_FILE),
    `
story: As a site owner I want a draft that announces my sale, and the month in the draft I have.
given:
  posts:
    summer-sale: { title: Summer sale, status: draft, content: Everything is 20% off. }
scenarios:
  - id: core/site/announce-the-sale
    request: Write a draft that announces our summer sale, 20% off everything in July, and say in my summer sale draft that it runs in July.
    kind: write
    expect:
      site:
        posts:
          sale-announcement: { $new: true, status: draft, content: { $contains: ['20%', 'July'] } }
          summer-sale: { content: { $contains: ['July'] } }
`,
  );

  assert.equal(await command('validate', dir), 'Valid: 1 pack, 1 story, 1 scenario, 1 site.\nNote: 3 of 3 abilities are named by no scenario: core/get-site-info, core/get-user-info, core/get-environment-info. A scenario covers an ability by naming it in `expect.abilities`.\n');
});

test('a scenario may expect an ability with the arguments it must run with, name abilities that must not run, and name an ability with the prefix its server gives it', async (t) => {
  const dir = await newProject(t);
  await writeFile(
    join(dir, 'packs/core/pack.yaml'),
    'name: core\ntitle: WordPress\nabilities: { reads: [core/get-site-info, core/get-user-info, core/get-environment-info, remote:forms/list-forms], writes: [] }\nentities: [posts]\n',
  );
  await writeFile(
    join(dir, STORY_FILE),
    `
story: As a site owner I want to know which software my site runs, without the agent reading who my users are.
scenarios:
  - id: core/site/which-wordpress-version
    request: Which version of WordPress is my site running?
    kind: read
    expect:
      abilities:
        - core/get-environment-info
        - core/get-site-info: { context: [view, edit], per_page: 5 }
        - remote:forms/list-forms: { status: active }
      forbidden: [core/get-user-info]
`,
  );

  assert.equal(await command('validate', dir), 'Valid: 1 pack, 1 story, 1 scenario, 1 site.\nNote: 1 of 4 abilities is named by no scenario: core/get-user-info. A scenario covers an ability by naming it in `expect.abilities`.\n');
});

test('a project names its hooks by the point of a run, and a site file says what happens to the site after a run', async (t) => {
  const dir = await newProject(t);
  await writeFile(
    join(dir, CONFIG_FILE),
    settingsWith('{ beforeRun: [seedTheShop], beforeScenario: [], beforeTrial: [seedTheShop, createTheDrafts], afterTrial: [removeUploads], afterScenario: [removeUploads], afterRun: [removeUploads] }'),
  );
  await writeFile(join(dir, SITE_FILE), '{ "kind": "wp-env", "packs": ["core"], "afterRun": "stop", "wpEnv": { "port": 8897 } }');
  await writeFile(join(dir, 'sites/other.json'), '{ "kind": "wp-env", "packs": ["core"], "afterRun": "remove", "wpEnv": { "port": 8898 } }');

  const { config, sites } = await loadProject(dir);

  assert.deepEqual(
    Object.entries(config.hooks).map(([point, hooks]) => [point, hooks.map((hook: { name: string }) => hook.name)]),
    [
      ['beforeRun', ['seedTheShop']],
      ['beforeScenario', []],
      ['beforeTrial', ['seedTheShop', 'createTheDrafts']],
      ['afterTrial', ['removeUploads']],
      ['afterScenario', ['removeUploads']],
      ['afterRun', ['removeUploads']],
    ],
  );
  assert.deepEqual([sites.local?.afterRun, sites.other?.afterRun], ['stop', 'remove']);
});

test('settings that import a file of the project without its `.ts` ending are told to add it', async (t) => {
  const dir = await newProject(t);
  await mkdir(join(dir, 'extensions'));
  await writeFile(join(dir, 'extensions/terms.ts'), 'export const terms = [];\n');
  await writeFile(join(dir, CONFIG_FILE), `import { terms } from './extensions/terms';\n${settingsWith('{}')}`);

  // Node names the files by their real path, which the temporary folder's is not everywhere.
  const real = await realpath(dir);

  await assert.rejects(loadProject(dir), (error: unknown) => {
    assert.ok(error instanceof InvalidProjectError);
    assert.deepEqual(error.problems, [
      {
        file: CONFIG_FILE,
        message: `could not be loaded: Cannot find module '${real}/extensions/terms' imported from ${real}/evals.config.ts. \`terms.ts\` is there: write the import as \`./extensions/terms.ts\`, with its \`.ts\` ending, because Node adds no ending to the import of a project's file`,
      },
    ]);
    return true;
  });
});

test('a site that names a pack whose folder the settings leave out is told which line to add', async (t) => {
  const dir = await newProject(t);
  await mkdir(join(dir, 'packs/content'));
  await writeFile(join(dir, 'packs/content/pack.yaml'), 'name: content\ntitle: Content\nabilities: { reads: [], writes: [] }\nentities: [posts]\n');
  await writeFile(join(dir, SITE_FILE), '{ "kind": "wp-env", "packs": ["core", "content"], "wpEnv": { "port": 8897 } }');

  await assert.rejects(loadProject(dir), (error: unknown) => {
    assert.ok(error instanceof InvalidProjectError);
    assert.deepEqual(error.problems, [
      {
        file: SITE_FILE,
        message: '`packs` has `content`, which is not a pack of this project; there are: core. `packs/content/pack.yaml` is there, but `packs` in evals.config.ts does not list its folder: add `./packs/content` to it',
      },
    ]);
    return true;
  });
});

test("`validate` notes an entity type of the project's own that no pack lists, because no site reads it", async (t) => {
  const dir = await newProject(t);
  await writeFile(
    join(dir, CONFIG_FILE),
    settingsWith('{}').replace('  hooks: {},', "  entityTypes: [{ name: 'pages', fields: ['title'], readers: { 'wp-env': '[]' } }],"),
  );

  assert.equal(
    await command('validate', dir),
    'Valid: 1 pack, 1 story, 4 scenarios, 1 site.\nNote: no pack lists the entity type `pages` from `entityTypes` in evals.config.ts, so no site reads it and no scenario can name it. List it under `entities` in the pack.yaml of each pack whose scenarios are about it.\n' + UNNAMED_IN_A_NEW_PROJECT,
  );
});

test('loading a project rejects starting content and an expected change of an entity type that its site has no writer for', async (t) => {
  const dir = await newProject(t);
  // An entity type of the project's own that a wp-env site can read, and not write.
  await writeFile(
    join(dir, CONFIG_FILE),
    `
import { claudeCode, defineConfig } from 'wp-ability-evals';

export default defineConfig({
  packs: ['./packs/core'],
  sitesDir: './sites',
  resultsDir: './results',
  agents: { 'claude-code': claudeCode({ model: 'claude-sonnet-5-5', signIn: 'login' }) },
  trials: 5,
  trialTimeoutMs: 300_000,
  entityTypes: [{ name: 'pages', fields: ['title'], readers: { 'wp-env': '[]' } }],
});
`,
  );
  await writeFile(join(dir, 'packs/core/pack.yaml'), 'name: core\ntitle: WordPress\nabilities: { reads: [core/get-site-info], writes: [] }\nentities: [posts, pages]\n');
  await writeFile(
    join(dir, STORY_FILE),
    `
story: As a site owner I want to ask what my About page says.
given:
  posts:
    summer-sale: { title: Summer sale, status: draft }
scenarios:
  - id: core/site/what-about-says
    request: What does my About page say?
    kind: read
    given:
      pages:
        about: { title: About }
    expect:
      answer:
        contains: ['About']
  - id: core/site/rename-about
    request: Rename my About page to About us.
    kind: write
    expect:
      site:
        pages:
          about: { title: About us }
`,
  );

  await assert.rejects(loadProject(dir), (error: unknown) => {
    assert.ok(error instanceof InvalidProjectError);
    assert.deepEqual(error.problems, [
      {
        file: SITE_FILE,
        message:
          'the pack `core` has starting content for `pages` (`given` in `site`), which has no writer for a `wp-env` site, so nothing can put it on this site. Give the entity type a `wp-env` writer under `writers`',
      },
      {
        file: SITE_FILE,
        message:
          "the pack `core` expects a change of `pages` (`expect.site` in `site`), which has no writer for a `wp-env` site, so `verify` can't make the change on this site. Give the entity type a `wp-env` writer under `writers`",
      },
    ]);
    return true;
  });
});

// What is wrong with a story file as a whole, or with the starting content it declares.
const INVALID_STORIES = [
  {
    name: 'a file that is still a list of scenarios',
    file: STORY_FILE,
    content: `
- id: core/site/which-wordpress-version
  request: Which version of WordPress is my site running?
  kind: read
  expect:
    answer:
      contains: ['7.1.4']
`,
    messages: [
      'is a list of scenarios, and a story file is one story with its scenarios. Add `story:` at the top with what the site owner wants, in plain words, and move the list under a `scenarios:` key',
    ],
  },
  {
    name: 'a story file without its story, whose starting content takes an item away and names an item twice',
    file: STORY_FILE,
    content: `
given:
  posts:
    hello-world: removed
    summer-sale: { title: Summer sale, status: draft }
scenarios:
  - id: core/site/publish-the-draft
    request: Publish my draft about the summer sale.
    kind: write
    given:
      posts:
        summer-sale: { title: Summer sale, status: pending }
    expect:
      site:
        posts:
          summer-sale: { status: publish }
`,
    messages: [
      '`story` must be text: what the site owner wants, in plain words, with what is on the site, what should happen and what must not',
      "`given.posts.hello-world` can't be `removed`: starting content says what is on the site before the agent works. Write the fields the item starts with, or leave the item out",
      "scenario 1 (core/site/publish-the-draft): `given.posts.summer-sale` is in the story's `given` too. The two are joined, so an item is written once: remove it here, or take it out of the story's `given` and write it in each scenario that needs it",
    ],
  },
  {
    name: 'starting content that could never be on the site, at the story and at one of its two scenarios',
    file: STORY_FILE,
    content: `
story: As a site owner I want to publish a draft by asking for it.
given:
  pages:
    about: { title: About }
scenarios:
  - id: core/site/by-its-topic
    request: Publish my draft about the summer sale.
    kind: read
    expect:
      answer:
        contains: ['published']
  - id: core/site/the-other-one
    request: Publish my draft about the winter sale.
    kind: read
    given:
      posts:
        winter-sale: { titel: Winter sale }
    expect:
      answer:
        contains: ['published']
`,
    messages: [
      '`given.pages`: the pack does not list `pages` under `entities` in its pack.yaml',
      'scenario core/site/the-other-one: `given.posts.winter-sale`: `posts` has no field `titel`; its fields are: title, status, content',
    ],
  },
];

const INVALID = [
  {
    name: 'a misspelled key together with an unknown kind',
    file: STORY_FILE,
    content: `
story: As a site owner I want to know which software my site runs.
scenarios:
  - id: core/site/which-wordpress-version
    request: Which version of WordPress is my site running?
    kind: reads
    expect:
      answer:
        contains: ['7.1.4']
      abilties: [core/get-site-info]
`,
    messages: [
      'scenario 1 (core/site/which-wordpress-version): `kind` must be one of: read, write, none',
      'scenario 1 (core/site/which-wordpress-version): unknown key `abilties` in `expect`; the keys are: site, abilities, forbidden, answer',
    ],
  },
  {
    name: 'a write scenario that declares no change',
    file: STORY_FILE,
    content: `
story: As a site owner I want to rename my site by asking for it.
scenarios:
  - id: core/site/rename-the-site
    request: Rename my site to Blue Door Bakery.
    kind: write
    expect:
      answer:
        contains: ['Blue Door Bakery']
`,
    messages: ['scenario 1 (core/site/rename-the-site): a `write` scenario must declare its change in `expect.site`'],
  },
  {
    name: 'a rubric without the two answers that prove it',
    file: STORY_FILE,
    content: `
story: As a site owner I want an honest answer when the site can not do what I ask.
scenarios:
  - id: core/site/change-the-tagline
    request: Change my site's tagline to "Fresh bread daily".
    kind: read
    expect:
      answer:
        rubric: The answer says the tagline was not changed. It fails if it says the tagline was changed.
`,
    messages: [
      'scenario 1 (core/site/change-the-tagline): a rubric needs `expect.answer.reference` next to it: an answer that should pass the rubric. `verify` has every judge grade it',
      'scenario 1 (core/site/change-the-tagline): a rubric needs `expect.answer.wrong` next to it: an answer that should fail the rubric. `verify` has every judge grade it',
    ],
  },
  {
    name: 'an id that does not say which pack and file the scenario is in',
    file: STORY_FILE,
    content: `
story: As a site owner I want to know how many drafts I have.
scenarios:
  - id: posts/count-the-drafts
    request: How many drafts do I have?
    kind: read
    expect:
      answer:
        contains: ['3']
`,
    messages: [
      "scenario 1 (posts/count-the-drafts): `id` must be `core/site/<slug>`: the pack, this file's name, then a slug in lowercase letters, digits and hyphens",
    ],
  },
  {
    name: 'an expectation that could never be met',
    file: STORY_FILE,
    content: `
story: As a site owner I want to publish a draft by asking for it.
scenarios:
  - id: core/site/publish-the-draft
    request: Publish my draft about the summer sale.
    kind: write
    expect:
      site:
        posts:
          summer-sale: { staus: publish }
      abilities:
        - core/update-post: { status: publish }
      forbidden: [core/delete-post]
`,
    messages: [
      'scenario core/site/publish-the-draft: `expect.site.posts.summer-sale`: `posts` has no field `staus`; its fields are: title, status, content',
      "scenario core/site/publish-the-draft: `expect.abilities`: no pack lists `core/update-post`; add it to `reads` or `writes` in its pack's pack.yaml",
      "scenario core/site/publish-the-draft: `expect.forbidden`: no pack lists `core/delete-post`; add it to `reads` or `writes` in its pack's pack.yaml",
    ],
  },
  {
    name: 'an expected ability that is badly written or forbidden too, and forbidden abilities where none may run',
    file: STORY_FILE,
    content: `
story: As a site owner I want to know which software my site runs.
scenarios:
  - id: core/site/which-wordpress-version
    request: Which version of WordPress is my site running?
    kind: read
    expect:
      abilities:
        - core/get-environment-info
        - core/get-site-info:
          context: view
        - core/get-site-info: { fields: [[name, url]], context: { is: view } }
        - core/get-user-info:
      forbidden: [core/get-environment-info]
  - id: core/site/change-the-tagline
    request: Change my site's tagline to "Fresh bread daily".
    kind: none
    expect:
      forbidden: [core/get-user-info]
      answer:
        contains: ['tagline']
`,
    messages: [
      'scenario 1 (core/site/which-wordpress-version): `expect.abilities` entry 2 has 2 keys (`core/get-site-info`, `context`), and an entry names one ability. Its arguments go one level below its name, such as `core/content-update: { status: publish }`, and another ability is an entry of its own',
      "scenario 1 (core/site/which-wordpress-version): `expect.abilities` entry 3: the argument `fields` of `core/get-site-info` must be text, a number, `true` or `false`, or a list of those, which means one of them. An argument whose own value is a list or a mapping can't be expected: leave it out",
      "scenario 1 (core/site/which-wordpress-version): `expect.abilities` entry 3: the argument `context` of `core/get-site-info` must be text, a number, `true` or `false`, or a list of those, which means one of them. An argument whose own value is a list or a mapping can't be expected: leave it out",
      'scenario 1 (core/site/which-wordpress-version): `expect.abilities` entry 4: `core/get-user-info` must map each argument to the value it must have run with, such as `core/content-update: { status: publish }`. Write the name alone, without a colon after it, to expect only that it ran',
      'scenario 1 (core/site/which-wordpress-version): `core/get-environment-info` is in both `expect.abilities` and `expect.forbidden`, and no run can meet both: keep it in one',
      'scenario 2 (core/site/change-the-tagline): a `none` scenario may run no ability at all, so `expect.forbidden` adds nothing to it: remove it',
    ],
  },
  {
    name: 'an operator that does not exist or is badly written in `expect.site`, and any operator in starting content',
    file: STORY_FILE,
    content: `
story: As a site owner I want a draft that announces my sale.
given:
  posts:
    summer-sale: { $new: true, title: Summer sale, content: { $contains: ['20%'] } }
scenarios:
  - id: core/site/announce-the-sale
    request: Write a draft that announces our summer sale, 20% off everything in July.
    kind: write
    expect:
      site:
        posts:
          sale-announcement: { $new: 'yes', title: { $rubric: Names the sale. }, content: { $contains: 20% } }
          sale-reminder: { $nwe: true, status: draft }
`,
    messages: [
      "`given.posts.summer-sale` can't have `$new`: starting content is put on the site as it is written, so it takes plain values only. `$new` and `$contains` belong in `expect.site`",
      "`given.posts.summer-sale.content` can't have `$contains`: starting content is put on the site as it is written, so it takes plain values only. `$new` and `$contains` belong in `expect.site`",
      'scenario 1 (core/site/announce-the-sale): `expect.site.posts.sale-announcement.$new` must be `true`: it marks an item the agent should create. Leave it out for an item that is on the site before the agent works',
      'scenario 1 (core/site/announce-the-sale): `expect.site.posts.sale-announcement.title` has the unknown operator `$rubric`. A mapping with a `$` key is always an operator, and there is one for a field: `{ $contains: [texts] }`, which compares the field by the texts its value must contain',
      "scenario 1 (core/site/announce-the-sale): `expect.site.posts.sale-announcement.content.$contains` must be a list of text, such as `{ $contains: ['20%', 'July'] }`; put a number in quotes",
      'scenario 1 (core/site/announce-the-sale): `expect.site.posts.sale-reminder` has the unknown operator `$nwe`. A key that starts with `$` is an operator, and there is one for an item: `$new: true`, which marks an item the agent should create',
    ],
  },
  {
    name: 'a site of a kind that does not exist, with a pack the project does not have',
    file: SITE_FILE,
    content: '{ "kind": "wp-evn", "packs": ["core", "woocommerce"] }',
    messages: [
      '`kind` is `wp-evn`, which is not a kind of site; there are: wp-env. A project adds its own under `siteKinds` in its config',
      "`packs` has `woocommerce`, which is not a pack of this project; there are: core. A pack is the project's when `packs` in evals.config.ts lists its folder",
    ],
  },
  {
    name: 'a site file that names something else than keep, stop or remove for after a run',
    file: SITE_FILE,
    content: '{ "kind": "wp-env", "packs": ["core"], "afterRun": "destroy", "wpEnv": { "port": 8897 } }',
    messages: ['`afterRun` must be one of: keep, stop, remove. It says what happens to the site after a run; leave it out to keep the site running'],
  },
  {
    name: 'an entity type whose reader and writer for a wp-env site are not PHP as text, and leaves those of another kind of site alone',
    file: CONFIG_FILE,
    content: `
import { claudeCode, defineConfig } from 'wp-ability-evals';

export default defineConfig({
  packs: ['./packs/core'],
  sitesDir: './sites',
  resultsDir: './results',
  agents: { 'claude-code': claudeCode({ model: 'claude-sonnet-5-5', signIn: 'login' }) },
  trials: 5,
  trialTimeoutMs: 300_000,
  entityTypes: [{ name: 'pages', fields: ['title'], readers: { 'wp-env': ['get_pages()'], 'my-host': () => [] }, writers: { 'wp-env': 42, 'my-host': () => {} } }],
});
`,
    messages: [
      "`entityTypes` entry 1 (`pages`): `readers.wp-env` must be text, and it is of type `object`. Write a PHP expression that returns one row per item, each with a `key` and the fields, such as `array_map(fn($p) => ['key' => $p->post_name, 'title' => $p->post_title], get_pages())`",
      "`entityTypes` entry 1 (`pages`): `writers.wp-env` must be text, and it is of type `number`. Write PHP statements that make one item have its fields, or remove it: they get `$key`, the item's key, and `$fields`, the fields to give it by name or the text `removed`, and they throw an exception to fail",
    ],
  },
  {
    name: 'hooks at a point that does not exist, with a hook that was called where it should be named',
    file: CONFIG_FILE,
    content: settingsWith('{ beforeRun: [seedTheShop, seedTheShop()], beforeTrail: [createTheDrafts] }'),
    messages: [
      'unknown key `beforeTrail` in `hooks`; the keys are: beforeRun, beforeScenario, beforeTrial, afterTrial, afterScenario, afterRun',
      "`hooks.beforeRun` entry 2 must be a function, and it is of type `object`. Write the hook's name without calling it, such as `[seedTheShop]`: the run calls it",
    ],
  },
];

for (const { name, file, content, messages } of [...INVALID_STORIES, ...INVALID]) {
  test(`loading a project rejects ${name}`, async (t) => {
    const dir = await newProject(t);
    await writeFile(join(dir, file), content);

    await assert.rejects(loadProject(dir), (error: unknown) => {
      assert.ok(error instanceof InvalidProjectError);
      assert.deepEqual(
        error.problems,
        messages.map((message) => ({ file, message })),
      );
      return true;
    });
  });
}
