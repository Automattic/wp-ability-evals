// The rules that need more than one file to check: a story and its scenarios against their pack, the packs
// against each other and against the entity types, a site against the packs it names and against what their
// stories say it starts with and ends up with. A scenario or a site that breaks one could never work, so it
// is caught before a run.

import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import type { LoadedConfig } from '../config/types.ts';
import { BUILT_IN_ENTITY_TYPES } from '../entities/registry.ts';
import type { EntityType } from '../entities/types.ts';
import type { Problem } from '../errors.ts';
import { MANIFEST_FILE } from '../packs/load.ts';
import type { Pack } from '../packs/types.ts';
import { abilityOf } from '../scenarios/abilities.ts';
import { storyFilePath } from '../scenarios/load.ts';
import { isOperator } from '../scenarios/operators.ts';
import type { Scenario, SiteExpectation, StartingContent, Story } from '../scenarios/types.ts';
import { siteFilePath } from '../sites/load.ts';
import { BUILT_IN_SITE_KINDS } from '../sites/registry.ts';
import type { SiteFile } from '../sites/types.ts';

interface Known {
  entityTypes: Map<string, EntityType>;
  reads: Set<string>;
  writes: Set<string>;
}

/**
 * What is wrong with what is written under `where`, which is `given` or `expect.site`: both name an entity
 * type, then an item's key, then its fields. The pack must list the type, and the type must have the fields.
 */
function itemProblems(where: string, content: SiteExpectation | undefined, pack: Pack, known: Known): string[] {
  const problems: string[] = [];
  for (const [typeName, items] of Object.entries(content ?? {})) {
    const type = known.entityTypes.get(typeName);
    if (!pack.entities.includes(typeName) || type === undefined) {
      problems.push(`\`${where}.${typeName}\`: the pack does not list \`${typeName}\` under \`entities\` in its ${MANIFEST_FILE}`);
      continue;
    }
    for (const [key, change] of Object.entries(items)) {
      // An operator on an item, such as `$new`, is not one of its fields: the rules of a story file know the operators.
      const fields = change === 'removed' ? [] : Object.keys(change).filter((name) => !isOperator(name));
      for (const field of fields.filter((name) => !type.fields.includes(name))) {
        problems.push(`\`${where}.${typeName}.${key}\`: \`${typeName}\` has no field \`${field}\`; its fields are: ${type.fields.join(', ')}`);
      }
    }
  }
  return problems;
}

/**
 * What is wrong with the abilities a scenario names: those it expects to run and those it forbids. Each must
 * be in a pack. A name that is in none is a typo or a missing entry, and as a forbidden ability it would
 * never be found among the abilities that ran.
 */
function abilityProblems(scenario: Scenario, known: Known): string[] {
  const problems: string[] = [];
  const isListed = (ability: string): boolean => known.reads.has(ability) || known.writes.has(ability);
  const notListed = (where: string, ability: string): string => `\`${where}\`: no pack lists \`${ability}\`; add it to \`reads\` or \`writes\` in its pack's ${MANIFEST_FILE}`;
  for (const ability of (scenario.expect.abilities ?? []).map(abilityOf)) {
    if (!isListed(ability)) {
      problems.push(notListed('expect.abilities', ability));
    } else if (scenario.kind === 'read' && known.writes.has(ability)) {
      problems.push(`\`expect.abilities\`: a \`read\` scenario can't expect \`${ability}\`, which its pack lists under \`writes\``);
    }
  }
  for (const ability of (scenario.expect.forbidden ?? []).filter((name) => !isListed(name))) {
    problems.push(notListed('expect.forbidden', ability));
  }
  return problems;
}

/** What a scenario's own `given` adds: its full starting content without the items its story declares. */
function addedToStory(scenario: Scenario, story: Story): StartingContent {
  const ofStory = new Map(Object.entries(story.given ?? {}));
  const added = Object.entries(scenario.given ?? {}).map(([typeName, items]) => {
    const own = Object.entries(items).filter(([key]) => !Object.hasOwn(ofStory.get(typeName) ?? {}, key));
    return [typeName, Object.fromEntries(own)] as const;
  });
  return Object.fromEntries(added.filter(([, items]) => Object.keys(items).length > 0));
}

/** A story's own `given` is checked once, at the story, and not again for each scenario that starts from it. */
function storyProblems(story: Story, pack: Pack, known: Known): Problem[] {
  const file = storyFilePath(pack.dir, story.file);
  const problems: Problem[] = itemProblems('given', story.given, pack, known).map((message) => ({ file, message }));
  for (const scenario of pack.scenarios.filter(({ id }) => story.scenarioIds.includes(id))) {
    const found = [
      ...itemProblems('given', addedToStory(scenario, story), pack, known),
      ...itemProblems('expect.site', scenario.expect.site, pack, known),
      ...abilityProblems(scenario, known),
    ];
    problems.push(...found.map((message) => ({ file, message: `scenario ${scenario.id}: ${message}` })));
  }
  return problems;
}

function packProblems(pack: Pack, earlierNames: Set<string>, known: Known): Problem[] {
  const file = join(pack.dir, MANIFEST_FILE);
  const problems: Problem[] = [];
  if (earlierNames.has(pack.name)) problems.push({ file, message: `another pack is already named \`${pack.name}\`` });
  for (const entity of pack.entities.filter((name) => !known.entityTypes.has(name))) {
    const names = [...known.entityTypes.keys()].join(', ');
    const message = `\`entities\` has \`${entity}\`, which is not an entity type; there are: ${names}. A project adds its own under \`entityTypes\` in its config`;
    problems.push({ file, message });
  }
  return problems;
}

/** The story files of a pack whose starting content names the entity type, at the story or at one of its scenarios. */
function storiesWithGiven(pack: Pack, entity: string): string[] {
  const names = (given: StartingContent | undefined): boolean => Object.hasOwn(given ?? {}, entity);
  return pack.stories
    .filter((story) => names(story.given) || pack.scenarios.some(({ id, given }) => story.scenarioIds.includes(id) && names(given)))
    .map((story) => story.file);
}

/** The story files of a pack with a scenario that expects a change of the entity type. */
function storiesWithChange(pack: Pack, entity: string): string[] {
  return pack.stories
    .filter((story) => pack.scenarios.some(({ id, expect }) => story.scenarioIds.includes(id) && Object.hasOwn(expect.site ?? {}, entity)))
    .map((story) => story.file);
}

/**
 * Why a site names a pack the project does not have, and what to do. A pack is the project's only when the
 * settings list its folder, so a folder of that name next to the listed packs, with a `pack.yaml`, is named.
 */
function unknownPackProblem(name: string, packs: Pack[], config: LoadedConfig, projectDir: string): string {
  const known = `\`packs\` has \`${name}\`, which is not a pack of this project; there are: ${packs.map((candidate) => candidate.name).join(', ')}`;
  const folder = [...new Set(config.packs.map((pack) => join(dirname(pack), name)))].find((dir) => existsSync(join(dir, MANIFEST_FILE)));
  if (folder === undefined) return `${known}. A pack is the project's when \`packs\` in evals.config.ts lists its folder`;
  const path = relative(projectDir, folder);
  return `${known}. \`${join(path, MANIFEST_FILE)}\` is there, but \`packs\` in evals.config.ts does not list its folder: add \`./${path}\` to it`;
}

function siteProblems(site: SiteFile, packs: Pack[], config: LoadedConfig, known: Known, projectDir: string): string[] {
  const problems: string[] = [];
  const kinds = Object.keys(config.siteKinds);
  if (!kinds.includes(site.kind)) {
    problems.push(`\`kind\` is \`${site.kind}\`, which is not a kind of site; there are: ${kinds.join(', ')}. A project adds its own under \`siteKinds\` in its config`);
  }
  for (const name of site.packs) {
    const pack = packs.find((candidate) => candidate.name === name);
    if (pack === undefined) {
      problems.push(unknownPackProblem(name, packs, config, projectDir));
      continue;
    }
    // A built-in kind reads the site through each entity type's reader for it. Through the type's writer it puts
    // starting content on the site, and `verify` makes the change a scenario expects. A project's own kind
    // reads and writes in its own way.
    if (!Object.hasOwn(BUILT_IN_SITE_KINDS, site.kind)) continue;
    for (const entity of pack.entities) {
      const type = known.entityTypes.get(entity);
      if (type === undefined) continue;
      if (!Object.hasOwn(type.readers, site.kind)) {
        problems.push(`the pack \`${name}\` makes claims about \`${entity}\`, which has no reader for a \`${site.kind}\` site`);
      }
      if (Object.hasOwn(type.writers ?? {}, site.kind)) continue;
      const listed = (stories: string[]): string => stories.map((story) => `\`${story}\``).join(', ');
      const fix = `Give the entity type a \`${site.kind}\` writer under \`writers\``;
      const withGiven = storiesWithGiven(pack, entity);
      if (withGiven.length > 0) {
        problems.push(
          `the pack \`${name}\` has starting content for \`${entity}\` (\`given\` in ${listed(withGiven)}), which has no writer for a \`${site.kind}\` site, so nothing can put it on this site. ${fix}`,
        );
      }
      const withChange = storiesWithChange(pack, entity);
      if (withChange.length > 0) {
        problems.push(
          `the pack \`${name}\` expects a change of \`${entity}\` (\`expect.site\` in ${listed(withChange)}), which has no writer for a \`${site.kind}\` site, so \`verify\` can't make the change on this site. ${fix}`,
        );
      }
    }
  }
  return problems;
}

/** What is wrong across the files of the project in `projectDir`, each of which is valid on its own. */
export function crossCheckProblems(packs: Pack[], sites: Record<string, SiteFile>, config: LoadedConfig, projectDir: string): Problem[] {
  const known: Known = {
    entityTypes: new Map(config.entityTypes.map((type) => [type.name, type])),
    reads: new Set(packs.flatMap((pack) => pack.abilities.reads)),
    writes: new Set(packs.flatMap((pack) => pack.abilities.writes)),
  };
  const problems: Problem[] = [];
  const names = new Set<string>();
  for (const pack of packs) {
    problems.push(...packProblems(pack, names, known));
    names.add(pack.name);
    for (const story of pack.stories) problems.push(...storyProblems(story, pack, known));
  }
  for (const [name, site] of Object.entries(sites)) {
    const file = siteFilePath(config.sitesDir, name);
    problems.push(...siteProblems(site, packs, config, known, projectDir).map((message) => ({ file, message })));
  }
  return problems;
}

/**
 * One line for each of the project's own entity types that no pack lists. Such a type is valid and does
 * nothing: a site reads only the entity types its packs list, so it is said, and the project stays valid.
 */
export function unlistedEntityTypeNotices(packs: Pack[], config: LoadedConfig): string[] {
  const builtIn = new Set(BUILT_IN_ENTITY_TYPES.map((type) => type.name));
  const listed = new Set(packs.flatMap((pack) => pack.entities));
  return config.entityTypes
    .filter(({ name }) => !builtIn.has(name) && !listed.has(name))
    .map(
      ({ name }) =>
        `Note: no pack lists the entity type \`${name}\` from \`entityTypes\` in evals.config.ts, so no site reads it and no scenario can name it. List it under \`entities\` in the pack.yaml of each pack whose scenarios are about it.`,
    );
}
