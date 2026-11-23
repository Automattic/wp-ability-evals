# A story file

The format of a story file, field by field. Part of the package's guide, which `npx wp-ability-evals update` replaces: write this project's own rules in `AGENTS.md`.

```yaml
# packs/content/scenarios/publish-a-draft.yaml
story: |
  As a site owner I want to publish a draft by asking for it, without opening the editor.

  On the site: two drafts, "Summer sale" and "Winter sale".
  Should happen: the draft I mean is published.
  Must not happen: another draft is published, or the text of a draft changes.

# Optional. Starting content for every scenario of the story.
given:
  posts:
    summer-sale: { title: Summer sale, status: draft }

scenarios:
  - id: content/publish-a-draft/by-its-topic
    request: Publish my draft about the summer sale.
    kind: write
    # Optional. Starting content for this scenario only, added to the story's.
    given:
      posts:
        winter-sale: { title: Winter sale, status: draft }
    expect:
      site:
        posts:
          summer-sale: { status: publish }
```

- `story` is required text, in plain words: what the site owner wants, what is on the site, what should happen and what must not. A person owns it, and the agent under test never sees it. Don't reword it to fit the scenarios: when the story changes, change the scenarios.
- `scenarios` is the data made from the story. It may be empty or left out while the story waits for its scenarios.
- A scenario's `state` says what a failure means. Left out, it is `implemented`: the task should work, and a failure fails the run. `to-be-implemented` is for an ability that does not exist yet, and `known-defect` for a known bug. Both need a `reason` next to them, which says what goes wrong and names the issue that tracks it. A run reports such a scenario as "failed as expected", or as "passed unexpectedly" once every trial passes, which is when its `state` can go.
- `given` is starting content: what is on the site before the agent works. It has the shape of `expect.site`, the entity type, then the item's key, then its fields. An item can't be `removed` there, and it takes no operator: write the values the site starts with, never `$new` or `$contains`. Put what every scenario needs at the story, and what one scenario needs at that scenario. A scenario starts from the two joined, so the same item at both levels is a problem.
- The key of a `given` item is the key `site state` would print for it. For a post that is its slug, in lowercase letters, digits and hyphens: a post is created with its key as its slug, also as a draft. A key such as `#12` is how `site state` prints a post that has no slug, by its ID. It names a post that is on the site, so it can't be a key in `given`: nothing can be created under it.
- `expect.answer.rubric` needs two answers next to it: `reference`, an answer that should pass the rubric, and `wrong`, one that should fail it. `validate` asks for both, and `verify` has every judge grade them. Write `wrong` as the mistake the rubric is there to catch, such as an answer that says the change was made. `expect.answer.contains` finds each text in the answer in any letter case. A `reference` may also stand next to `contains`: `verify` then checks that it holds every text. Without one, `verify` says that the `contains` was not checked.

  ```yaml
  expect:
    answer:
      rubric: >-
        Says there is no draft about an autumn sale and that nothing was published. It fails if it says
        something was published.
      reference: I found no draft about an autumn sale, so nothing was published.
      wrong: There is no autumn sale draft, so I published the summer sale one for you.
  ```
