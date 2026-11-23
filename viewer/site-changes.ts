// What a trial changed on the site, worked out from the two readings its file keeps: the items that were
// created, removed or changed. The page shows it, so that a person does not compare two readings by eye. It
// decides nothing: whether the change is the one the scenario expects is the site check's, whose reason is
// on the page too.

import type { SiteReadings } from '../src/results/types.ts';

/** An item's fields, as a reading has them. */
export type Fields = Record<string, unknown>;

/** One item that is not as the trial found it. */
export interface ItemChange {
  /** The item's entity type, such as `posts`. */
  type: string;
  key: string;
  /** `removed` is an item that is gone, or now in the trash: that is how WordPress removes most things. */
  change: 'created' | 'removed' | 'changed';
  /** The item as the trial found it. Not set for an item that was created. */
  before?: Fields;
  /** The item as the trial left it. Not set for an item that is gone. */
  after?: Fields;
  /** The fields that differ between the two. Of an item that only one reading has, those are all its fields. */
  fields: string[];
}

function changeOf(before: Fields | undefined, after: Fields | undefined): ItemChange['change'] {
  if (before === undefined) return 'created';
  if (after === undefined || (after.status === 'trash' && before.status !== 'trash')) return 'removed';
  return 'changed';
}

/** Every item that differs between the two readings, in the order the readings list them. */
export function changesOf({ before, after }: SiteReadings): ItemChange[] {
  const changes: ItemChange[] = [];
  for (const type of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const [was, now] = [before[type] ?? {}, after[type] ?? {}];
    for (const key of new Set([...Object.keys(was), ...Object.keys(now)])) {
      const [itemWas, itemNow] = [was[key], now[key]];
      const names = new Set([...Object.keys(itemWas ?? {}), ...Object.keys(itemNow ?? {})]);
      // A value is compared as the reading has it, so `"34.50"` and `34.5` differ here.
      const fields = [...names].filter((field) => JSON.stringify(itemWas?.[field]) !== JSON.stringify(itemNow?.[field]));
      if (itemWas !== undefined && itemNow !== undefined && fields.length === 0) continue;
      changes.push({ type, key, change: changeOf(itemWas, itemNow), before: itemWas, after: itemNow, fields });
    }
  }
  return changes;
}
