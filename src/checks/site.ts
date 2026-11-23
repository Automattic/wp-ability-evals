// The site check: the site must have changed exactly as the scenario declares, and not at all otherwise.
// It compares the site before and after the trial, so a change the agent was not asked for fails too.
// The same comparison says, before a trial, whether the site starts as the scenario declares.
//
// A scenario names an item by its key, or marks it `$new` where the site chooses the key: such an item is
// found by its fields among the items that were created. A field is compared with a plain value, or by the
// texts it contains (`$contains`).

import type { SiteState } from '../entities/types.ts';
import { containsOf, fieldsOf, isNew } from '../scenarios/operators.ts';
import type { ExpectedItem, SiteExpectation, StartingContent } from '../scenarios/types.ts';
import { textsMissingFrom } from './answer.ts';
import type { Check, CheckResult } from './types.ts';

/** How the two differences read that nothing declares. They read one way after a trial and another before it. */
interface Words {
  /** An item that is on the site now and was not before. */
  extra: string;
  /** An item that was on the site before and is not now. */
  gone: string;
}

const AFTER_A_TRIAL: Words = { extra: 'created, which the scenario does not expect', gone: 'removed' };
const BEFORE_A_TRIAL: Words = {
  extra: "on the site, but neither at its marked start nor in the scenario's `given`",
  gone: 'not found, but it was on the site at its marked start',
};

/** Whether a value is a number, or a text that reads as one. `true` and `false` are neither, though JavaScript would count them as 1 and 0. */
function readsAsNumber(value: unknown): boolean {
  if (typeof value === 'number') return !Number.isNaN(value);
  return typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value));
}

/**
 * A value a scenario expects against the one that was found: a field as the site reports it, or an argument
 * an ability ran with. A number matches its text: YAML reads 34.50 as a number, while a site may report "34.50".
 * Nothing else matches a value of another type, so `true` is not met by `1`.
 */
export function same(expected: unknown, found: unknown): boolean {
  if (readsAsNumber(expected) && readsAsNumber(found)) return Number(expected) === Number(found);
  return JSON.stringify(expected) === JSON.stringify(found);
}

function quoted(texts: string[]): string[] {
  return texts.map((text) => JSON.stringify(text));
}

/** A field's value as the text that `$contains` looks in: a text as it is, anything else as JSON. */
function asText(value: unknown): string {
  return typeof value === 'string' ? value : (JSON.stringify(value) ?? '');
}

/** What is not as it should be in the fields of one item, one entry per field, without the item's name. */
function fieldDifferences(was: Record<string, unknown> | undefined, now: Record<string, unknown>, want: Record<string, unknown>): string[] {
  const differences: string[] = [];
  for (const field of new Set([...Object.keys(now), ...Object.keys(want)])) {
    // Of an item that was not on the site before, only the fields the scenario names are checked.
    if (was === undefined && !(field in want)) continue;
    // Only what the scenario writes can be an operator. A value the site reported before never is.
    const texts = field in want ? containsOf(want[field]) : undefined;
    if (texts !== undefined) {
      const missing = textsMissingFrom(asText(now[field]), texts);
      if (missing.length > 0) differences.push(`${field} does not contain ${quoted(missing).join(', ')}`);
      continue;
    }
    const target = field in want ? want[field] : was?.[field];
    if (!same(target, now[field])) differences.push(`${field} is ${JSON.stringify(now[field])}, expected ${JSON.stringify(target)}`);
  }
  return differences;
}

/** The fields a new item is expected with, as a reason names them: `status "draft", content containing "20%" and "July"`. */
function described(fields: Record<string, unknown>): string {
  const each = Object.entries(fields).map(([field, value]) => {
    const texts = containsOf(value);
    return texts === undefined ? `${field} ${JSON.stringify(value)}` : `${field} containing ${quoted(texts).join(' and ')}`;
  });
  return each.join(', ');
}

/** What was found for the items of one entity type that a scenario marks `$new`. */
interface NewItems {
  /** The keys of the created items that fit one of them. Such an item is not reported as one the scenario does not expect. */
  fitting: Set<string>;
  /** One line for each marked item that is not exactly one created item, and for each created item that would have to be two. */
  differences: string[];
}

/**
 * Looks for each item that a scenario marks `$new` among the created items, by its fields: a plain value must
 * be equal, and the texts of a `$contains` contained. `labelled` holds those items by their label, and
 * `created` the items that are on the site now, were not before, and are not expected under their own key.
 *
 * A label stands for exactly one created item, and a created item for one label. Each label is decided on its
 * own, against every created item, so neither the order of the file nor the order of the site changes the
 * result. Where no item fits, several fit, or two labels are left with the same item, the reason names them.
 */
function newItems(type: string, labelled: [string, ExpectedItem][], created: [string, Record<string, unknown>][]): NewItems {
  const fitting = new Set<string>();
  const differences: string[] = [];
  // The labels that each created item is the only fit of.
  const onlyFitOf = new Map<string, string[]>();
  for (const [name, item] of labelled) {
    const fields = fieldsOf(item);
    const tried = created.map(([key, found]) => ({ key, misfits: fieldDifferences(undefined, found, fields) }));
    const fits = tried.filter(({ misfits }) => misfits.length === 0).map(({ key }) => key);
    for (const key of fits) fitting.add(key);
    const [only] = fits;
    if (fits.length > 1) {
      differences.push(`${type} ${name}: expected one new item with ${described(fields)}, but ${fits.length} created items fit: ${fits.join(', ')}`);
    } else if (only !== undefined) {
      onlyFitOf.set(only, [...(onlyFitOf.get(only) ?? []), name]);
    } else {
      const others = tried.map(({ key, misfits }) => `${key} (${misfits.join(', ')})`);
      const among = others.length > 0 ? ` among the created items: ${others.join(', ')}` : '';
      differences.push(`${type} ${name}: expected a new item with ${described(fields)}, but found none${among}`);
    }
  }
  for (const [key, names] of onlyFitOf) {
    if (names.length > 1) {
      differences.push(`${type} ${key}: the only created item that fits each of the new items ${names.join(', ')}, and a created item can be only one of them`);
    }
  }
  return { fitting, differences };
}

/**
 * Every difference between the site before and after a trial that `expected` does not account for, one line
 * each. Anything the scenario does not name must be unchanged, items created or removed included. `words`
 * is how an item reads that appeared or went without being named.
 */
export function siteDifferences(before: SiteState, after: SiteState, expected: SiteExpectation = {}, words: Words = AFTER_A_TRIAL): string[] {
  const differences: string[] = [];
  for (const type of new Set([...Object.keys(before), ...Object.keys(after), ...Object.keys(expected)])) {
    const was = before[type] ?? {};
    const now = after[type] ?? {};
    const items = Object.entries(expected[type] ?? {});
    // The key of an item marked `$new` is a label, which is not looked for on the site: the item is found by its fields.
    const want = Object.fromEntries(items.filter(([, item]) => !isNew(item)));
    const labelled = items.filter((entry): entry is [string, ExpectedItem] => isNew(entry[1]));
    const created = Object.entries(now).filter(([key]) => was[key] === undefined && want[key] === undefined);
    const fresh = newItems(type, labelled, created);
    differences.push(...fresh.differences);
    for (const key of new Set([...Object.keys(was), ...Object.keys(now), ...Object.keys(want)])) {
      const label = `${type} ${key}`;
      const [itemWas, itemNow, itemWant] = [was[key], now[key], want[key]];
      if (itemWant === 'removed') {
        // An item in the trash counts as removed: that is how WordPress removes most things.
        if (itemWas === undefined) differences.push(`${label}: expected removed, but it was not on the site before`);
        else if (itemNow !== undefined && itemNow.status !== 'trash') differences.push(`${label}: expected removed, but it is still there`);
      } else if (itemNow === undefined) {
        differences.push(itemWas === undefined ? `${label}: expected, but not found` : `${label}: ${words.gone}`);
      } else if (itemWas === undefined && itemWant === undefined) {
        // A created item that fits an item marked `$new` is accounted for: it is that item, or named where the fit is not one to one.
        if (!fresh.fitting.has(key)) differences.push(`${label}: ${words.extra}`);
      } else {
        differences.push(...fieldDifferences(itemWas, itemNow, itemWant ?? {}).map((difference) => `${label}: ${difference}`));
      }
    }
  }
  return differences;
}

/**
 * Every difference between the site as a trial finds it and the start its scenario declares, one line each.
 * The site must be as it was read at its marked start, plus the scenario's starting content. Of a `given`
 * item only the named fields count. Anything else must be as at the marked start: an item that neither
 * names is a difference, and so is one of the marked start that is gone or changed. Starting content holds
 * plain values only, so nothing here is found by its fields or compared by what it contains.
 */
export function startDifferences(markedStart: SiteState, found: SiteState, given: StartingContent = {}): string[] {
  return siteDifferences(markedStart, found, given, BEFORE_A_TRIAL);
}

/**
 * What the site check finds for two readings of a site and the change a scenario declares, which is none
 * for a scenario that expects the site to stay as it is. A trial is checked with it, and so is a scenario
 * that `verify` proves without an agent.
 */
export function siteCheckOf(before: SiteState, after: SiteState, expected: SiteExpectation | undefined): CheckResult {
  const differences = siteDifferences(before, after, expected);
  const asExpected = expected === undefined ? 'The site did not change' : 'The site changed exactly as expected';
  return { check: 'site', pass: differences.length === 0, reason: differences.length > 0 ? differences.join('; ') : asExpected };
}

export const siteChangedAsExpected: Check = ({ scenario, before, after }) => siteCheckOf(before, after, scenario.expect.site);
