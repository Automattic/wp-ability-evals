# The change a scenario expects

How to write `expect.site`, its two operators, and what a failed site check says. Part of the package's guide, which `npx wp-ability-evals update` replaces: write this project's own rules in `AGENTS.md`.

`expect.site` says how the site must have changed when the agent is done: the entity type, then the item's key, then the fields the item ends up with, or `removed`. Anything it does not name must be as it was before the trial, also a field it does not name of an item it names, so an item the agent changed, created or removed on the side fails the trial. Write an item under the key `site state` prints for it, and a field with the value `site state` prints, which is the value as WordPress stores it: a tagline saved as `Ana's pots & pans` prints as `Ana&#039;s pots &amp; pans`. A plain value must be equal, in letter case, spaces and line breaks too, and a number matches its text. Where `site state` prints `\n` in a text, write the text as a YAML block: `|-` for one that does not end with a line break.

Two things can't be written that way, and each has an operator, a key that starts with `$`:

```yaml
expect:
  site:
    posts:
      # `$new: true` marks an item the agent should create. `sale-announcement` is a label you choose, not a key on the site.
      sale-announcement:
        $new: true
        status: draft
        title: Summer sale
      # `$contains`: the field's text must contain every text, in any letter case.
      summer-sale:
        content: { $contains: ['20%', 'July'] }
```

- Use `$new: true` when the agent should create an item and you can't know the key the site gives it. A post saved as a draft is the usual case: it has no slug, and `site state` prints it under `#` and a number. The item is then found by its fields, so name at least one.
- Don't use `$new` for an item that is on the site, or for one the agent creates under a key you know, such as a published post, whose slug WordPress makes from its title. Write those under their key. A key without `$new` is always looked for on the site, so a mistyped key fails as `expected, but not found` and is never taken for a new item.
- Exactly one item that was created in the trial must fit each label: it has the label's fields, the plain values equal and the `$contains` texts contained. Its other fields are not checked. A created item stands for one label only, and nothing is guessed when several fit. So name enough fields to tell the new items of a scenario apart, and choose a label that is not the key of an item on the site.
- Use `$contains` for a text the agent words itself, on a new item or on one that is there. Name texts a correct result can't lack, such as a number or a name from the request, each as text: put a number in quotes.
- `$contains` looks in the field as WordPress stores it. A post's `content` holds its block markup, such as `<!-- wp:heading {"level":3} -->`, so a short text such as `3` is found there whatever the agent wrote. Name texts that only the agent's words can hold and that it can't word another way, such as a name or `20%`, and not a small number, which an agent may also spell out.
- `given` takes no operator. `validate` reports one there, and in `expect.site` an operator it does not know, a `$new` that is not `true` and a `$contains` that is not a list of text.
- A failed site check names the label and the items:
  - `posts sale-announcement: expected a new item with status "draft", title "Summer sale", but found none among the created items: #12 (status is "publish", expected "draft")`: the agent created an item, and it lacks a field of the label. Without the part after "found none", nothing was created.
  - `posts sale-announcement: expected one new item with status "draft", but 2 created items fit: #12, #13`: the agent created one too many, or the label names too few fields to tell which one is meant.
  - `posts #12: the only created item that fits each of the new items sale-announcement, sale-reminder, and a created item can be only one of them`: the scenario expects two new items, and only one item that fits them was created.
  - `posts #13: created, which the scenario does not expect`: a created item that fits no label.
  - `posts summer-sale: content does not contain "July"`: the field lacks a text of its `$contains`.
