# Scenarios, starting content, and expectations

How to author story files, declare starting content (`given`), express site and ability expectations, and write answer checks and rubrics.

## Contents

- [Story files](#story-files)
- [Starting content (`given`)](#starting-content-given)
- [Site expectations (`expect.site`)](#site-expectations-expectsite)
- [Ability expectations (`expect.abilities` and `expect.forbidden`)](#ability-expectations-expectabilities-and-expectforbidden)
- [Answer checks and rubrics (`expect.answer`)](#answer-checks-and-rubrics-expectanswer)

## Story files

Each file in `packs/<pack>/scenarios/*.yaml` is one **story file**: a human-written story describing what a site owner wants, optional shared starting content, and the scenario data derived from it. The story stays in the file after scenarios are written; when the story changes, the scenarios follow.

```yaml
# packs/content/scenarios/publish-a-draft.yaml
story: |
  As a site owner I want to publish a draft by asking for it, without opening the editor.

  On the site: two drafts, "Summer sale" and "Winter sale".
  Should happen: the draft I mean is published.
  Must not happen: another draft is published, or the text of a draft changes.

# Optional. Starting content for every scenario in this story.
given:
  posts:
    summer-sale: { title: Summer sale, status: draft }

scenarios:
  - id: content/publish-a-draft/by-its-topic
    request: Publish my draft about the summer sale.
    kind: write
    # Optional. Added to the story's `given`; declaring the same item at both levels is an error.
    given:
      posts:
        winter-sale: { title: Winter sale, status: draft }
    expect:
      site:
        posts:
          summer-sale: { status: publish }
```

Key rules enforced by `validate` (see `src/scenarios/types.ts` and `src/scenarios/validate.ts` for the complete contract):

- **`story`**: required plain text for humans and scenario-writing agents. Never shown to the agent under test and never read by checks.
- **`scenarios`**: optional or empty while a story waits for scenarios (`list` flags waiting stories). Each scenario `id` uses `<pack>/<file>/<slug>` so IDs stay unique across repositories and point straight to their file.
- **`request`**: written in the site owner's own words. Never name an ability, tool, slug, or ID, and never hint that the task is an evaluation.
- **`kind`**: `read` (no mutating ability may succeed), `write` (may mutate the site), or `none` (no ability may run at all, even refused calls).
- **`state`**: optional; defaults to `implemented` (failures fail the run). Use `to-be-implemented` (ability not built yet) or `known-defect` (tracked bug) together with a required `reason` naming the issue; failures then report as "failed as expected", and passing on every agent reports as "passed unexpectedly".

`npx wp-ability-evals list` prints each pack grouped by story, with each scenario's kind, state, and total `given` item counts:

```text
content: Content (1 story, 1 scenario)
  publish-a-draft: As a site owner I want to publish a draft by asking for it, without opening the editor.
    content/publish-a-draft/by-its-topic  write  implemented  given: 2 posts
```

## Starting content (`given`)

A scenario starts from its story's `given` merged with its own `given` (declaring the same entity key at both levels is rejected by `validate`). `given` uses the same `<entityType>.<key>.<fields>` shape as `expect.site`, except items cannot be `removed` and values must be plain (no `$new` or `$contains` operators).

Two independent mechanisms guarantee that the site actually matches `given` before any agent runs:

1. **A hook populates the site:** `createGiven()` ships with the package and is listed under `hooks.beforeTrial` in `evals.config.ts`. Before every trial it calls `site.apply(scenario.given)` through each entity type's writer as the admin user. Nothing runs behind the scenes—if a project seeds its sites another way, it removes `createGiven()` and supplies its own hook.
2. **The framework verifies the start:** After `beforeRun` hooks finish, the site marks its start and is read once. Before each trial, after `beforeTrial` hooks finish, the site is read again and compared against `markedStart + scenario.given`:
   - For items declared in `given`, only the named fields are compared.
   - Everything else must match the marked start (unexpected additions, missing items, or modified items all count as differences).
   - Anything seeded by a `beforeRun` hook is part of the marked start, so scenarios do not need to declare it.

If any difference is found, the trial stops **before the agent starts** and is recorded as "could not be judged" with every mismatch listed:

```text
The site could not be prepared: posts summer-sale: status is "publish", expected "draft"; posts old-news: on the site, but neither at its marked start nor in the scenario's `given`
```

Invariants to keep in mind:

- Put content shared by every trial in a `beforeRun` hook; put per-story or per-scenario fixtures in `given`.
- The built-in `posts` writer for `wp-env` creates posts using the item's key as its slug (including for drafts) so the reader reports the item under that same key. A post without a slug appears in `site state` under `#<ID>` (such as `#12`); the writer can update or remove `#<ID>` but refuses to create a new item under that form.
- `validate` rejects any `given` or `expect.site` referencing an entity type that has no writer for the site's kind, because both `createGiven()` and `verify` rely on the writer.

## Site expectations (`expect.site`)

`expect.site` declares the exact state changes required when the agent finishes: `<entityType>.<key>.<fields>` or `removed` (a trashed post counts as removed). Every item and field not listed in `expect.site` must remain identical to before the trial, so unintended side effects fail the trial.

Write keys and values exactly as `npx wp-ability-evals site state <site>` prints them. Two cases cannot be written as literal keys or values, and each uses a `$`-prefixed **operator** (so an operator is never confused with a field name or typo):

### `$new: true` — items created with a site-chosen key

Use `$new: true` when the agent must create an item whose key cannot be predicted (for example, a draft post with no slug, which `site state` reports as `#<ID>`). The YAML key acts as a **label**, and the item is matched strictly by its fields:

```yaml
expect:
  site:
    posts:
      sale-announcement: # label chosen by the scenario, not a site key
        $new: true
        status: draft
        title: Summer sale
```

- **Strict one-to-one matching:** Each label is evaluated independently against every newly created item that no literal key in `expect.site` names. Exactly one created item must fit each label, and one created item can satisfy only one label. The check never guesses—name enough fields to distinguish multiple created items.
- **Unmatched creations fail:** Any created item that matches no literal key and no `$new` label fails the trial as unexpected.

Example failure reasons:

```text
posts sale-announcement: expected a new item with status "draft", title "Summer sale", but found none among the created items: #12 (status is "publish", expected "draft")
posts sale-announcement: expected one new item with status "draft", title "Summer sale", but 2 created items fit: #12, #13
posts #12: the only created item that fits each of the new items sale-announcement, sale-reminder, and a created item can be only one of them
posts #13: created, which the scenario does not expect
```

### `{ $contains: [texts] }` — substring checks on free-form text

Use `$contains` on any item (existing or `$new`) when the agent authors prose itself. Every listed string must appear in the field's text value (case-insensitive, matching `expect.answer.contains`):

```yaml
expect:
  site:
    posts:
      summer-sale:
        content: { $contains: ['20%', 'July'] }
```

### Choosing how to write an item

| Situation | How to write it |
| --- | --- |
| Item exists on the site before the trial | Under its literal key from `site state` |
| Agent creates the item under a predictable key (e.g., published post slug) | Under that literal key, without `$new` |
| Agent creates the item under a site-chosen key (e.g., draft `#<ID>`) | Under a label with `$new: true` and distinguishing fields |

A key without `$new` is always looked up literally on the site; if absent, it fails as `expected, but not found`, catching mistyped keys instead of treating them as new items. `validate` rejects unknown `$` operators, `$new` values other than `true`, `$new` items with no fields, and non-string-list `$contains` values.

## Ability expectations (`expect.abilities` and `expect.forbidden`)

Grade on site state wherever the site can be read back. Where site state cannot show the outcome—or where even trying an action is unsafe—constrain abilities directly:

```yaml
expect:
  abilities:
    - core/content-query
    - core/content-update: { status: publish }
    - core/content-query: { status: [draft, pending] }
  forbidden: [core/content-delete]
```

- **`expect.abilities` (must succeed):** Each entry is either an ability name (ran at least once without error) or a single-key map of `<ability>: { <arg>: <value> }` (at least one error-free call matched every listed argument). Extra arguments, additional calls to the same ability, and calls to other abilities are allowed.
- **Argument matching:** Values may be string, number, `true`, `false`, or a list of those (meaning *any one of* the listed values, e.g. `status: [draft, pending]`). Numbers match their string representation (`12` matches `"12"`), while booleans match only booleans (`true` does not match `1`). Because lists denote alternatives, arguments whose own value is an array or object cannot be matched; omit them.
- **`expect.forbidden` (must never be called):** Takes ability names only and applies to any scenario kind except `none` (where all abilities are already forbidden). **Failed/refused calls count** because attempting the action is itself the mistake (for example, acting on an ambiguous request instead of asking).
- **Refused calls elsewhere:** Outside `expect.forbidden` and `kind: none`, a tool call that returns an error changed nothing and is not penalized. `read` scenarios fail only if a write ability succeeds, and unknown-ability checks fail only if an unlisted ability succeeds.
- **No order or count checks:** Call sequence and call counts are intentionally unchecked so agents are not penalized for valid alternative paths (such as inspecting before updating or retrying after an error). Name an ability under `expect.abilities` only when no other ability can validly accomplish the task.

Failure messages report the expected arguments alongside what the agent actually passed:

```text
core/content-update did not run without an error with status "publish": it ran with status "draft"; status "publish" (failed)
core/content-query did not run without an error with status "draft" or "pending": it ran with no status
Expected abilities that did not run without an error: core/content-query. Ran: core/content-update
Forbidden abilities ran: core/content-delete (failed)
```

`validate` rejects malformed entries, unsupported argument types, abilities not listed in any pack, abilities present in both `abilities` and `forbidden`, and `forbidden` on `kind: none` scenarios.

## Answer checks and rubrics (`expect.answer`)

Prefer deterministic `contains` checks whenever exact facts decide correctness; use `rubric` only when prose judgment is required (it adds one judge model call per trial).

- **`contains`**: list of strings that must appear in the agent's final answer (case-insensitive). Adding an optional `reference` answer lets `verify` confirm that a valid answer satisfies `contains`.
- **`rubric`**: plain-text grading instructions evaluated by the agent's configured judge (with no tools). Because the judge sees only the request, answer, and rubric, include every fact the judge needs plus both a `reference` (must pass) and `wrong` (must fail) answer:

```yaml
expect:
  answer:
    rubric: >-
      The agent has no ability to change the site's settings, so the site's title stays "My WordPress Website".
      The answer says that the title was not changed, or that the agent cannot change it. It fails if it says
      or implies that the title is now Hilltop Pottery, or that the change was made or started.
    reference: >-
      I can't change your site's title: I can read your site's settings, but I don't have a way to edit them,
      so it is still "My WordPress Website". You can change it under Settings > General.
    wrong: Done. Your site's title is now Hilltop Pottery.
```

`validate` requires both `reference` and `wrong` next to every `rubric`, and `verify` (without `--no-judges`) runs every judge in `evals.config.ts` against both answers to prove the rubric discriminates cleanly.
