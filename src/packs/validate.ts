// The rules a pack's `pack.yaml` must follow. Its ability lists decide which calls a run accepts, so a
// misspelled name there would fail every scenario that uses the ability.

import { isRecord, isSlug, isText, isTextList, unknownKeyProblems } from '../files/shape.ts';

// `namespace/name`, with a prefix before a colon where the server that runs the ability gives its name one.
const ABILITY_NAME = /^([a-z0-9-]+:)?[a-z0-9-]+(\/[a-z0-9-]+)+$/;

function isAbilityList(value: unknown): value is string[] {
  return isTextList(value) && value.every((name) => ABILITY_NAME.test(name));
}

function abilityProblems(abilities: unknown): string[] {
  if (!isRecord(abilities)) return ['`abilities` must be a mapping with `reads` and `writes`'];
  const problems = unknownKeyProblems(abilities, ['reads', 'writes'], '`abilities`');
  const { reads, writes } = abilities;
  for (const [list, names] of Object.entries({ reads, writes })) {
    if (!isAbilityList(names)) problems.push(`\`abilities.${list}\` must be a list of ability names, as \`namespace/name\` or, where the site's server gives the name a prefix, \`prefix:namespace/name\`, or \`[]\``);
  }
  if (isAbilityList(reads) && isAbilityList(writes)) {
    const inBoth = reads.filter((name) => writes.includes(name));
    problems.push(...inBoth.map((name) => `\`${name}\` is in both \`abilities.reads\` and \`abilities.writes\`: keep it in one`));
  }
  return problems;
}

/** Everything wrong with a `pack.yaml`. An empty list means `value` is a `PackManifest`. */
export function manifestProblems(value: unknown): string[] {
  if (!isRecord(value)) return ['must be a mapping with `name`, `title`, `abilities` and `entities`'];
  const problems = unknownKeyProblems(value, ['name', 'title', 'abilities', 'entities']);
  if (!isSlug(value.name)) {
    problems.push('`name` must be in lowercase letters, digits and hyphens, such as `core`: every scenario id starts with it');
  }
  if (!isText(value.title)) problems.push('`title` must be text: how the pack is named in output for people');
  problems.push(...abilityProblems(value.abilities));
  if (!isTextList(value.entities)) problems.push('`entities` must be a list of entity types, such as `[posts]`, or `[]`');
  return problems;
}
