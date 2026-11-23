// The operators of `expect.site`: a key that starts with `$` says that an item or a field's value is more
// than a plain value. The rules of a story file, the site check and `verify` all read them, so how each is
// told apart from a plain value is said once, here.

import { isRecord, isTextList } from '../files/shape.ts';
import type { ExpectedItem } from './types.ts';

/** On an item: the agent should create it, and its key in the file is a label. */
export const NEW = '$new';
/** As a field's value: the field's text must contain every text of the list. */
export const CONTAINS = '$contains';

/** Whether a key is an operator's, and not a field's. */
export function isOperator(key: string): boolean {
  return key.startsWith('$');
}

/** Whether what is written for a field is an operator: a mapping with a `$` key is always one, and never a plain value. */
export function isOperatorValue(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && Object.keys(value).some(isOperator);
}

/** Whether `expect.site` marks the item as one the agent should create. */
export function isNew(item: ExpectedItem | 'removed' | undefined): item is ExpectedItem {
  return item !== undefined && item !== 'removed' && item[NEW] === true;
}

/** The fields an expected item names, without the operator that marks it as new. */
export function fieldsOf(item: ExpectedItem): Record<string, unknown> {
  return Object.fromEntries(Object.entries(item).filter(([name]) => !isOperator(name)));
}

/** The texts a field must contain, or nothing when the field is expected to equal a plain value. */
export function containsOf(expected: unknown): string[] | undefined {
  return isRecord(expected) && isTextList(expected[CONTAINS]) ? expected[CONTAINS] : undefined;
}
