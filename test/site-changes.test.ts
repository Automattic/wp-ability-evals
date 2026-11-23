// A trial's page shows what the agent changed on the site, which a person reads in place of the two readings.
// A change that is named wrongly there, or a field that is missing from it, would mislead whoever reads a
// trial. The function is plain code without a browser, so it is tested here; the page around it is checked
// by hand.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SiteState } from '../src/entities/types.ts';
import { changesOf, type ItemChange } from '../viewer/site-changes.ts';

const HELLO = { title: 'Hello world!', status: 'publish', content: 'Welcome.' };
const DRAFT = { title: 'Summer sale', status: 'draft', content: 'Everything is 20% off.' };
const BEFORE: SiteState = { posts: { 'hello-world': HELLO, 'summer-sale': DRAFT } };
const ANNOUNCEMENT = { title: 'Sale announcement', status: 'draft', content: 'From July.' };
const PUBLISHED = { ...DRAFT, title: 'Summer sale!', status: 'publish' };

const CASES: { name: string; after: SiteState; changes: ItemChange[] }[] = [
  {
    name: 'an item that only the second reading has is created, with all its fields',
    after: { posts: { ...BEFORE.posts, '#12': ANNOUNCEMENT } },
    changes: [{ type: 'posts', key: '#12', change: 'created', before: undefined, after: ANNOUNCEMENT, fields: ['title', 'status', 'content'] }],
  },
  {
    name: 'an item that is now in the trash is removed',
    after: { posts: { 'hello-world': { ...HELLO, status: 'trash' }, 'summer-sale': DRAFT } },
    changes: [{ type: 'posts', key: 'hello-world', change: 'removed', before: HELLO, after: { ...HELLO, status: 'trash' }, fields: ['status'] }],
  },
  {
    name: 'an item with other values is changed, with exactly the fields that differ',
    after: { posts: { 'hello-world': HELLO, 'summer-sale': PUBLISHED } },
    changes: [{ type: 'posts', key: 'summer-sale', change: 'changed', before: DRAFT, after: PUBLISHED, fields: ['title', 'status'] }],
  },
];

for (const { name, after, changes } of CASES) {
  test(`what a trial changed on the site: ${name}`, () => {
    assert.deepEqual(changesOf({ before: BEFORE, after }), changes);
  });
}
