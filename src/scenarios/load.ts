// Reads a pack's story files and rejects any that does not follow the format. Each scenario comes out with
// its full starting content, its story's `given` joined with its own, so nothing later has to know which
// story a scenario belongs to.

import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { InvalidProjectError, problemsIn, type Problem } from '../errors.ts';
import { isRecord, isSlug, isText } from '../files/shape.ts';
import { readYamlFile } from '../files/read.ts';
import type { Scenario, StartingContent, Story, StoryFile } from './types.ts';
import { givenTwiceProblems, scenarioProblems, storyFileProblems } from './validate.ts';

const SCENARIOS_FOLDER = 'scenarios';
const EXTENSION = '.yaml';

/** What a pack's story files hold: its stories, and every scenario of every story in one list. */
export interface LoadedStories {
  stories: Story[];
  scenarios: Scenario[];
}

/** The story file with this name in a pack. A scenario's id names its file: `<pack>/<file>/<slug>`. */
export function storyFilePath(packDir: string, fileName: string): string {
  return join(packDir, SCENARIOS_FOLDER, `${fileName}${EXTENSION}`);
}

/** What is in the folder, sorted, without hidden files such as the `.DS_Store` a Mac adds. */
async function entriesIn(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  return (await readdir(dir)).filter((name) => !name.startsWith('.')).sort();
}

function idProblems(id: string | undefined, idPrefix: string, earlierIds: Set<string>): string[] {
  if (id === undefined) return [];
  if (!id.startsWith(idPrefix) || !isSlug(id.slice(idPrefix.length))) {
    return [`\`id\` must be \`${idPrefix}<slug>\`: the pack, this file's name, then a slug in lowercase letters, digits and hyphens`];
  }
  return earlierIds.has(id) ? ['`id` is already used by an earlier scenario in this file'] : [];
}

/** The scenario with its full starting content: its story's `given` joined with its own. No item is in both. */
function withStoryGiven(scenario: Scenario, storyGiven: StartingContent | undefined): Scenario {
  if (storyGiven === undefined) return scenario;
  const own = scenario.given ?? {};
  const types = new Set([...Object.keys(storyGiven), ...Object.keys(own)]);
  const given = Object.fromEntries([...types].map((type) => [type, { ...storyGiven[type], ...own[type] }]));
  const { expect, ...rest } = scenario;
  return { ...rest, given, expect };
}

async function storyIn(file: string, fileName: string, packName: string): Promise<{ story: Story; scenarios: Scenario[] }> {
  const content = await readYamlFile(file);
  const problems: Problem[] = storyFileProblems(content).map((message) => ({ file, message }));
  const written = isRecord(content) ? content : {};
  const items: unknown[] = Array.isArray(written.scenarios) ? written.scenarios : [];
  const idPrefix = `${packName}/${fileName}/`;
  const scenarios: Scenario[] = [];
  const ids = new Set<string>();
  items.forEach((item, index) => {
    const id = isRecord(item) && isText(item.id) ? item.id : undefined;
    const ownGiven = isRecord(item) ? item.given : undefined;
    const found = [...scenarioProblems(item), ...idProblems(id, idPrefix, ids), ...givenTwiceProblems(written.given, ownGiven)];
    const where = `scenario ${index + 1}${id ? ` (${id})` : ''}`;
    problems.push(...found.map((message) => ({ file, message: `${where}: ${message}` })));
    // No problems means the item follows the format, which is what makes it a `Scenario`.
    if (found.length === 0) scenarios.push(item as Scenario);
    if (id) ids.add(id);
  });
  if (problems.length > 0) throw new InvalidProjectError(problems);
  // No problems in the file or in any of its scenarios means the content follows the format, which is what makes it a `StoryFile`.
  const { story: text, given } = content as StoryFile;
  const story: Story = { file: fileName, text, scenarioIds: scenarios.map((scenario) => scenario.id) };
  if (given !== undefined) story.given = given;
  return { story, scenarios: scenarios.map((scenario) => withStoryGiven(scenario, given)) };
}

/**
 * Every story in `<packDir>/scenarios/*.yaml` with its scenarios, validated. Throws `InvalidProjectError` with every problem found.
 * Each scenario's id must be `<packName>/<file>/<slug>`, which keeps ids unique across packs and says where a scenario is.
 */
export async function loadStories(packDir: string, packName: string): Promise<LoadedStories> {
  const dir = join(packDir, SCENARIOS_FOLDER);
  const loaded: LoadedStories = { stories: [], scenarios: [] };
  const problems: Problem[] = [];
  for (const name of await entriesIn(dir)) {
    const file = join(dir, name);
    const fileName = name.endsWith(EXTENSION) ? name.slice(0, -EXTENSION.length) : '';
    if (!isSlug(fileName)) {
      const message = 'not a story file: those sit directly in `scenarios/`, named in lowercase letters, digits and hyphens, then `.yaml`';
      problems.push({ file, message });
      continue;
    }
    try {
      const { story, scenarios } = await storyIn(file, fileName, packName);
      loaded.stories.push(story);
      loaded.scenarios.push(...scenarios);
    } catch (error) {
      problems.push(...problemsIn(error));
    }
  }
  if (problems.length > 0) throw new InvalidProjectError(problems);
  return loaded;
}
