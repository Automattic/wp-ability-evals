// The rules a story file and each of its scenarios must follow as written. A scenario that breaks one would
// run and then fail for a reason nobody can see, or pass without checking anything, so it is rejected before
// a run spends anything.

import { isOneOf, isRecord, isText, isTextList, unknownKeyProblems } from '../files/shape.ts';
import { abilityOf } from './abilities.ts';
import { CONTAINS, NEW, isOperator, isOperatorValue } from './operators.ts';
import type { ExpectedAbility, ScenarioKind, ScenarioState } from './types.ts';

const KINDS: readonly ScenarioKind[] = ['read', 'write', 'none'];
const STATES: readonly ScenarioState[] = ['implemented', 'known-defect', 'to-be-implemented'];

function isFilledRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && Object.keys(value).length > 0;
}

function isFilledTextList(value: unknown): value is string[] {
  return isTextList(value) && value.length > 0;
}

function stateProblems(state: unknown, reason: unknown): string[] {
  if (state !== undefined && !isOneOf(state, STATES)) return [`\`state\` must be one of: ${STATES.join(', ')}`];
  const failureIsExpected = state === 'known-defect' || state === 'to-be-implemented';
  if (failureIsExpected && !isText(reason)) {
    return [`a \`${state}\` scenario needs a \`reason\`: what goes wrong, and the issue that tracks it`];
  }
  if (reason !== undefined && !isText(reason)) return ['`reason` must be text'];
  return [];
}

/**
 * A problem for every operator in a `given` item, on the item or as the value of one of its fields. Starting
 * content is put on the site as it is written, so there is nothing in it to find or to compare.
 */
function givenOperatorProblems(where: string, fields: Record<string, unknown>): string[] {
  const operators = Object.entries(fields).flatMap(([name, value]) => {
    if (isOperator(name)) return [{ at: where, operator: name }];
    return isOperatorValue(value) ? Object.keys(value).filter(isOperator).map((operator) => ({ at: `${where}.${name}`, operator })) : [];
  });
  return operators.map(
    ({ at, operator }) => `\`${at}\` can't have \`${operator}\`: starting content is put on the site as it is written, so it takes plain values only. \`${NEW}\` and \`${CONTAINS}\` belong in \`expect.site\``,
  );
}

/** What is wrong with a `given`, at the story or at a scenario: both have the shape of `expect.site`, without `removed` and without operators. */
function givenProblems(given: unknown): string[] {
  if (!isFilledRecord(given)) {
    return ['`given` must map an entity type to the items the site starts with, such as `posts: { summer-sale: { title: Summer sale, status: draft } }`; leave it out when nothing has to be there'];
  }
  const problems: string[] = [];
  for (const [type, items] of Object.entries(given)) {
    if (!isFilledRecord(items)) {
      problems.push(`\`given.${type}\` must map each item's key to the fields it starts with`);
      continue;
    }
    for (const [key, fields] of Object.entries(items)) {
      if (fields === 'removed') {
        problems.push(`\`given.${type}.${key}\` can't be \`removed\`: starting content says what is on the site before the agent works. Write the fields the item starts with, or leave the item out`);
      } else if (!isFilledRecord(fields)) {
        problems.push(`\`given.${type}.${key}\` must be the fields the item starts with, such as \`{ title: Summer sale, status: draft }\``);
      } else {
        problems.push(...givenOperatorProblems(`given.${type}.${key}`, fields));
      }
    }
  }
  return problems;
}

/** What is wrong with what `expect.site` writes for one field, where that is an operator: a mapping with a `$` key. */
function operatorValueProblems(where: string, value: Record<string, unknown>): string[] {
  const problems = Object.keys(value)
    .filter((key) => key !== CONTAINS)
    .map((key) =>
      isOperator(key)
        ? `\`${where}\` has the unknown operator \`${key}\`. A mapping with a \`$\` key is always an operator, and there is one for a field: \`{ ${CONTAINS}: [texts] }\`, which compares the field by the texts its value must contain`
        : `\`${where}\` has the key \`${key}\` next to an operator. A mapping with a \`$\` key is always an operator and holds nothing else: write \`{ ${CONTAINS}: [texts] }\`, or a plain value`,
    );
  if (Object.hasOwn(value, CONTAINS) && !isFilledTextList(value[CONTAINS])) {
    problems.push(`\`${where}.${CONTAINS}\` must be a list of text, such as \`{ ${CONTAINS}: ['20%', 'July'] }\`; put a number in quotes`);
  }
  return problems;
}

/** What is wrong with the operators of one item of `expect.site`: `$new` on the item, and `$contains` as the value of a field. */
function expectedItemProblems(where: string, item: Record<string, unknown>): string[] {
  const problems: string[] = [];
  for (const [name, value] of Object.entries(item)) {
    if (name === NEW) {
      if (value !== true) {
        problems.push(`\`${where}.${NEW}\` must be \`true\`: it marks an item the agent should create. Leave it out for an item that is on the site before the agent works`);
      }
    } else if (isOperator(name)) {
      problems.push(`\`${where}\` has the unknown operator \`${name}\`. A key that starts with \`$\` is an operator, and there is one for an item: \`${NEW}: true\`, which marks an item the agent should create`);
    } else if (isOperatorValue(value)) {
      problems.push(...operatorValueProblems(`${where}.${name}`, value));
    }
  }
  if (Object.hasOwn(item, NEW) && Object.keys(item).every(isOperator)) {
    problems.push(`\`${where}\` is marked \`${NEW}\` and names no field. A new item is found by its fields: write those it ends up with, such as \`{ ${NEW}: true, title: Summer sale, status: draft }\``);
  }
  return problems;
}

function siteChangeProblems(site: unknown): string[] {
  if (!isFilledRecord(site)) {
    return ['`expect.site` must map an entity type to its items, such as `posts: { hello-world: { status: publish } }`'];
  }
  const problems: string[] = [];
  for (const [type, items] of Object.entries(site)) {
    if (!isFilledRecord(items)) {
      problems.push(`\`expect.site.${type}\` must map each item's key to the fields it ends up with, or to \`removed\``);
      continue;
    }
    for (const [key, change] of Object.entries(items)) {
      if (change === 'removed') continue;
      if (!isFilledRecord(change)) {
        problems.push(`\`expect.site.${type}.${key}\` must be the fields the item ends up with, or \`removed\``);
      } else {
        problems.push(...expectedItemProblems(`expect.site.${type}.${key}`, change));
      }
    }
  }
  return problems;
}

/**
 * A rubric is graded by a model, so nothing but two graded answers shows that it tells right from wrong:
 * `reference` must pass it and `wrong` must fail it. `verify` has every judge grade both.
 */
function rubricAnswerProblems(answer: Record<string, unknown>): string[] {
  if (answer.rubric === undefined) {
    return answer.wrong === undefined ? [] : ['`expect.answer.wrong` is an answer that should fail the rubric, and there is no `rubric`: remove it, or add the rubric it fails'];
  }
  const problems: string[] = [];
  if (answer.reference === undefined) {
    problems.push('a rubric needs `expect.answer.reference` next to it: an answer that should pass the rubric. `verify` has every judge grade it');
  }
  if (answer.wrong === undefined) {
    problems.push('a rubric needs `expect.answer.wrong` next to it: an answer that should fail the rubric. `verify` has every judge grade it');
  }
  return problems;
}

function answerProblems(answer: unknown): string[] {
  if (!isRecord(answer)) return ['`expect.answer` must be a mapping with `contains` or `rubric`'];
  const problems = unknownKeyProblems(answer, ['contains', 'rubric', 'reference', 'wrong'], '`expect.answer`');
  if (answer.contains !== undefined && !isFilledTextList(answer.contains)) {
    problems.push('`expect.answer.contains` must be a list of text; put a number in quotes');
  }
  for (const key of ['rubric', 'reference', 'wrong']) {
    if (answer[key] !== undefined && !isText(answer[key])) problems.push(`\`expect.answer.${key}\` must be text`);
  }
  if (answer.contains === undefined && answer.rubric === undefined) {
    problems.push('`expect.answer` checks nothing: add `contains` or `rubric`');
  }
  problems.push(...rubricAnswerProblems(answer));
  return problems;
}

/** Whether an argument of an expected ability is written as a value to compare it with, or as a list of such values. */
function isExpectedArgument(value: unknown): boolean {
  const isValue = (one: unknown): boolean => ['string', 'number', 'boolean'].includes(typeof one);
  return isValue(value) || (Array.isArray(value) && value.length > 0 && value.every(isValue));
}

/**
 * What is wrong with one entry of `expect.abilities`: an ability's name, or that one name mapped to the
 * arguments the ability must have run with.
 */
function expectedAbilityProblems(where: string, entry: unknown): string[] {
  if (isText(entry)) return [];
  const example = '`core/content-update: { status: publish }`';
  if (!isFilledRecord(entry)) {
    return [`${where} must be an ability's name, as \`namespace/name\`, or one name mapped to the arguments it must have run with, such as ${example}`];
  }
  const keys = Object.keys(entry);
  const [ability] = keys;
  if (ability === undefined || keys.length > 1) {
    const listed = keys.map((key) => `\`${key}\``).join(', ');
    return [`${where} has ${keys.length} keys (${listed}), and an entry names one ability. Its arguments go one level below its name, such as ${example}, and another ability is an entry of its own`];
  }
  const expected = entry[ability];
  if (!isFilledRecord(expected)) {
    return [`${where}: \`${ability}\` must map each argument to the value it must have run with, such as ${example}. Write the name alone, without a colon after it, to expect only that it ran`];
  }
  return Object.entries(expected)
    .filter(([, value]) => !isExpectedArgument(value))
    .map(
      ([name]) =>
        `${where}: the argument \`${name}\` of \`${ability}\` must be text, a number, \`true\` or \`false\`, or a list of those, which means one of them. An argument whose own value is a list or a mapping can't be expected: leave it out`,
    );
}

/**
 * What is wrong with `expect.abilities` and `expect.forbidden`: the abilities that must run, each with the
 * arguments it must have run with where the scenario names them, and the abilities that must not run at all.
 */
function abilityExpectationProblems(abilities: unknown, forbidden: unknown): string[] {
  const problems: string[] = [];
  const expected: string[] = [];
  if (Array.isArray(abilities) && abilities.length > 0) {
    abilities.forEach((entry, index) => {
      const found = expectedAbilityProblems(`\`expect.abilities\` entry ${index + 1}`, entry);
      problems.push(...found);
      // No problems means the entry follows the format, which is what makes it an `ExpectedAbility`.
      if (found.length === 0) expected.push(abilityOf(entry as ExpectedAbility));
    });
  } else if (abilities !== undefined) {
    problems.push('`expect.abilities` must be a list of abilities, each a name, as `namespace/name`, or one name mapped to the arguments it must have run with');
  }
  if (isFilledTextList(forbidden)) {
    const inBoth = forbidden.filter((ability) => expected.includes(ability));
    problems.push(...inBoth.map((ability) => `\`${ability}\` is in both \`expect.abilities\` and \`expect.forbidden\`, and no run can meet both: keep it in one`));
  } else if (forbidden !== undefined) {
    problems.push('`expect.forbidden` must be a list of ability names, as `namespace/name`, without arguments: an ability named there must not run at all');
  }
  return problems;
}

function expectationProblems(expect: unknown, kind: unknown): string[] {
  if (!isFilledRecord(expect)) return ['`expect` must be a mapping with at least one of `site`, `abilities`, `forbidden` and `answer`'];
  const problems = unknownKeyProblems(expect, ['site', 'abilities', 'forbidden', 'answer'], '`expect`');
  if (expect.site !== undefined) problems.push(...siteChangeProblems(expect.site));
  problems.push(...abilityExpectationProblems(expect.abilities, expect.forbidden));
  if (expect.answer !== undefined) problems.push(...answerProblems(expect.answer));

  if (kind === 'write' && expect.site === undefined) {
    problems.push('a `write` scenario must declare its change in `expect.site`');
  }
  if ((kind === 'read' || kind === 'none') && expect.site !== undefined) {
    problems.push(`a \`${kind}\` scenario must leave the site as it is, so it can't have \`expect.site\``);
  }
  if (kind === 'none' && expect.abilities !== undefined) {
    problems.push("a `none` scenario must not touch the site, so it can't have `expect.abilities`");
  }
  if (kind === 'none' && expect.forbidden !== undefined) {
    problems.push('a `none` scenario may run no ability at all, so `expect.forbidden` adds nothing to it: remove it');
  }
  return problems;
}

/**
 * Everything wrong with a story file apart from what is wrong inside each scenario. An empty list means
 * `value` is a `StoryFile` once each of its scenarios is a `Scenario`.
 */
export function storyFileProblems(value: unknown): string[] {
  if (Array.isArray(value)) {
    return ['is a list of scenarios, and a story file is one story with its scenarios. Add `story:` at the top with what the site owner wants, in plain words, and move the list under a `scenarios:` key'];
  }
  if (!isRecord(value)) return ['must be a mapping with `story`, and with `given` and `scenarios` where the story has them'];
  const problems = unknownKeyProblems(value, ['story', 'given', 'scenarios']);
  if (!isText(value.story)) {
    problems.push('`story` must be text: what the site owner wants, in plain words, with what is on the site, what should happen and what must not');
  }
  if (value.given !== undefined) problems.push(...givenProblems(value.given));
  if (value.scenarios !== undefined && !Array.isArray(value.scenarios)) {
    problems.push('`scenarios` must be a list of scenarios, each starting with `- id:`; write `[]` or leave it out while the story waits for its scenarios');
  }
  return problems;
}

/** Everything wrong with one scenario as written in a story file. An empty list means `value` is a `Scenario`. */
export function scenarioProblems(value: unknown): string[] {
  if (!isRecord(value)) return ['must be a mapping with `id`, `request`, `kind` and `expect`'];
  const problems = unknownKeyProblems(value, ['id', 'request', 'kind', 'state', 'reason', 'given', 'expect']);
  if (!isText(value.id)) problems.push('`id` must be text');
  if (!isText(value.request)) problems.push('`request` must be text: what the site owner asks, in their own words');
  if (!isOneOf(value.kind, KINDS)) problems.push(`\`kind\` must be one of: ${KINDS.join(', ')}`);
  problems.push(...stateProblems(value.state, value.reason));
  if (value.given !== undefined) problems.push(...givenProblems(value.given));
  problems.push(...expectationProblems(value.expect, value.kind));
  return problems;
}

/**
 * A problem for every item that a scenario's `given` and its story's both name. The two are joined into the
 * scenario's starting content, and an item written twice would leave open which of the two the site starts with.
 */
export function givenTwiceProblems(storyGiven: unknown, scenarioGiven: unknown): string[] {
  if (!isRecord(storyGiven) || !isRecord(scenarioGiven)) return [];
  return Object.entries(scenarioGiven).flatMap(([type, items]) => {
    const storyItems = Object.hasOwn(storyGiven, type) ? storyGiven[type] : undefined;
    if (!isRecord(items) || !isRecord(storyItems)) return [];
    return Object.keys(items)
      .filter((key) => Object.hasOwn(storyItems, key))
      .map((key) => `\`given.${type}.${key}\` is in the story's \`given\` too. The two are joined, so an item is written once: remove it here, or take it out of the story's \`given\` and write it in each scenario that needs it`);
  });
}
