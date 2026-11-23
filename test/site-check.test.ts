// The site check is what grades a trial: it decides a pass from what changed on the site, not from what
// the agent said. A mistake here gives wrong results for every scenario.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { siteChangedAsExpected } from '../src/checks/site.ts';
import type { SiteState } from '../src/entities/types.ts';
import type { Scenario, SiteExpectation } from '../src/scenarios/types.ts';

const HELLO = { title: 'Hello world!', status: 'publish', content: 'Welcome.' };
const DRAFT = { title: 'Summer sale', status: 'draft', content: 'Everything is 20% off.' };
const BEFORE: SiteState = { posts: { 'hello-world': HELLO, 'summer-sale': DRAFT } };
const PUBLISH_THE_DRAFT: SiteExpectation = { posts: { 'summer-sale': { status: 'publish' } } };
// A draft the agent writes. The site gives it its key, so the scenario names it by a label and its fields.
const ANNOUNCEMENT = { title: 'Sale announcement', status: 'draft', content: 'From July, everything is 20% off.' };
const WRITE_AN_ANNOUNCEMENT: SiteExpectation = {
  posts: { 'sale-announcement': { $new: true, status: 'draft', title: 'Sale announcement', content: { $contains: ['20%', 'july'] } } },
};
const MENTION_JULY: SiteExpectation = { posts: { 'summer-sale': { content: { $contains: ['20%', 'JULY'] } } } };

interface Case {
  name: string;
  /** What the scenario declares; `undefined` for a scenario that expects no change. */
  expected: SiteExpectation | undefined;
  after: SiteState;
  result: { pass: boolean; reason: string };
}

const CASES: Case[] = [
  {
    name: 'passes when the declared change is the only change',
    expected: PUBLISH_THE_DRAFT,
    after: { posts: { 'hello-world': HELLO, 'summer-sale': { ...DRAFT, status: 'publish' } } },
    result: { pass: true, reason: 'The site changed exactly as expected' },
  },
  {
    name: 'fails when the declared change was not made',
    expected: PUBLISH_THE_DRAFT,
    after: BEFORE,
    result: { pass: false, reason: 'posts summer-sale: status is "draft", expected "publish"' },
  },
  {
    name: 'fails when something else changed besides the declared change',
    expected: PUBLISH_THE_DRAFT,
    after: { posts: { 'summer-sale': { ...DRAFT, status: 'publish' } } },
    result: { pass: false, reason: 'posts hello-world: removed' },
  },
  {
    name: 'fails a scenario that expects no change when the agent created something',
    expected: undefined,
    after: { posts: { 'hello-world': HELLO, 'summer-sale': DRAFT, 'new-post': { title: 'New post', status: 'draft', content: '' } } },
    result: { pass: false, reason: 'posts new-post: created, which the scenario does not expect' },
  },
  {
    name: 'counts an item moved to the trash as removed',
    expected: { posts: { 'hello-world': 'removed' } },
    after: { posts: { 'hello-world': { ...HELLO, status: 'trash' }, 'summer-sale': DRAFT } },
    result: { pass: true, reason: 'The site changed exactly as expected' },
  },
  {
    name: 'finds an item marked `$new` by its fields, under the key the site gave it',
    expected: WRITE_AN_ANNOUNCEMENT,
    after: { posts: { ...BEFORE.posts, '#12': ANNOUNCEMENT } },
    result: { pass: true, reason: 'The site changed exactly as expected' },
  },
  {
    name: 'fails when no created item fits an item marked `$new`, and says why each created item does not',
    expected: WRITE_AN_ANNOUNCEMENT,
    after: { posts: { ...BEFORE.posts, '#12': { ...ANNOUNCEMENT, status: 'publish' } } },
    result: {
      pass: false,
      reason:
        'posts sale-announcement: expected a new item with status "draft", title "Sale announcement", content containing "20%" and "july", but found none among the created items: #12 (status is "publish", expected "draft"); posts #12: created, which the scenario does not expect',
    },
  },
  {
    name: 'fails when two created items fit one item marked `$new`, and names them',
    expected: WRITE_AN_ANNOUNCEMENT,
    after: { posts: { ...BEFORE.posts, '#12': ANNOUNCEMENT, '#13': { ...ANNOUNCEMENT, content: 'In July: 20% off.' } } },
    result: {
      pass: false,
      reason:
        'posts sale-announcement: expected one new item with status "draft", title "Sale announcement", content containing "20%" and "july", but 2 created items fit: #12, #13',
    },
  },
  {
    name: 'fails when the agent created an item beside the one marked `$new`',
    expected: WRITE_AN_ANNOUNCEMENT,
    after: { posts: { ...BEFORE.posts, '#12': ANNOUNCEMENT, '#13': { title: 'Notes', status: 'draft', content: '' } } },
    result: { pass: false, reason: 'posts #13: created, which the scenario does not expect' },
  },
  {
    name: 'fails when one created item is all there is for two items marked `$new`',
    expected: { posts: { 'sale-announcement': { $new: true, title: 'Sale announcement' }, 'sale-reminder': { $new: true, status: 'draft' } } },
    after: { posts: { ...BEFORE.posts, '#12': ANNOUNCEMENT } },
    result: {
      pass: false,
      reason: 'posts #12: the only created item that fits each of the new items sale-announcement, sale-reminder, and a created item can be only one of them',
    },
  },
  {
    name: 'passes when a field holds every text of its `$contains`, in any letter case',
    expected: MENTION_JULY,
    after: { posts: { 'hello-world': HELLO, 'summer-sale': { ...DRAFT, content: 'Everything is 20% off in July.' } } },
    result: { pass: true, reason: 'The site changed exactly as expected' },
  },
  {
    name: 'fails when a field lacks a text of its `$contains`',
    expected: MENTION_JULY,
    after: { posts: { 'hello-world': HELLO, 'summer-sale': { ...DRAFT, content: 'Everything is 20% off until June.' } } },
    result: { pass: false, reason: 'posts summer-sale: content does not contain "JULY"' },
  },
];

for (const { name, expected, after, result } of CASES) {
  test(`the site check ${name}`, async () => {
    const scenario: Scenario = { id: 'core/posts/a-scenario', request: 'A request.', kind: expected ? 'write' : 'read', expect: { site: expected } };
    const transcript = { answer: '', toolCalls: [], versions: { agent: '', model: '' }, raw: [] };

    const server = { name: 'wp', abilities: { as: 'tools' as const } };

    const { pass, reason } = await siteChangedAsExpected({ scenario, transcript, before: BEFORE, after, packs: [], server });

    assert.deepEqual({ pass, reason }, result);
  });
}
