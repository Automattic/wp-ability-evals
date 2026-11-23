# Starting content on the site

How a scenario's `given` gets onto the site, how the site is compared with it before the agent works, and what each difference means. Part of the package's guide, which `npx wp-ability-evals update` replaces: write this project's own rules in `AGENTS.md`.

- `createGiven()` puts a scenario's `given` on the site before each trial, as the admin user. It is a hook that comes with the package, and `evals.config.ts` lists it under `hooks.beforeTrial`. Keep it there, unless this project prepares its sites with a hook of its own that creates the same items.
- `given` may name an item the site already has at its marked start, such as the site's title in an entity type for settings: the writer changes the fields `given` names, and the comparison then expects them.
- Before each trial, after the `beforeTrial` hooks, the site is read and must be as it was at its marked start plus the scenario's `given`. Of a `given` item only the fields the scenario names are compared. Everything else must be as at the marked start, which already holds what a `beforeRun` hook seeded.
- A difference stops the trial before the agent runs. The trial "could not be judged", and its reason starts with "The site could not be prepared:" and names each difference:
  - `posts summer-sale: expected, but not found`: nothing created the item. List `createGiven()` under `hooks.beforeTrial`, or look at the hook that should have created it.
  - `posts summer-sale: status is "publish", expected "draft"`: the item is there with another value than `given` says. A hook changed it after it was created, or the site saves the value in another form than `given` writes it: use the form `site state` prints.
  - ``posts old-news: on the site, but neither at its marked start nor in the scenario's `given` ``: a `beforeTrial` hook created something the scenario does not declare, or an earlier trial left it on a site that can't go back to its marked start. Add the item to `given`, create it in a `beforeRun` hook instead, or remove it in an `afterTrial` hook.
  - `posts hello-world: not found, but it was on the site at its marked start`: a hook removed it.
- When `createGiven()` can't create an item, the trial's reason is ``The `beforeTrial` hook `createGiven` failed: Site local could not be changed: posts summer-sale: ...``, ending with what WordPress said about that item.
- `validate` reports a `given` for an entity type that has no writer for the site's kind, and an `expect.site` for one too, because `verify` makes the expected change through the writer. The built-in `posts` has one for `wp-env`. `.agents/guide/entity-types.md` says how to write one for an entity type of this project.
