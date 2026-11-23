# A pack

What a pack holds, how to add one, and why every ability on a site must be in one. Part of the package's guide, which `npx wp-ability-evals update` replaces: write this project's own rules in `AGENTS.md`.

A pack is one set of abilities: a folder with a `pack.yaml` and a `scenarios/` folder of story files.

```yaml
# packs/content/pack.yaml
name: content # the first part of each of its scenario ids
title: Posts and pages # how output for people names it
abilities:
  reads: [core/content-query] # leave the site as it is
  writes: [core/content-create, core/content-update] # change it
entities: [posts] # the entity types its scenarios make claims about
```

- Adding a pack takes three places: the folder, its path under `packs` in `evals.config.ts`, such as `./packs/content`, and its `name` under `packs` in each site file it runs on. `validate` reports a site that names a pack the settings do not list, and names the folder when it is there.
- Write each ability's name as the site's MCP server gives it: `namespace/name`, or `prefix:namespace/name` where the server adds a prefix. Scenarios name it the same way.
- Every ability the site's MCP server offers must be in a pack on that site, WordPress's own too, such as `core/get-site-info`. A trial fails when the agent runs an ability that no pack of the site lists and the call does not come back with an error. Agents often look at the site first, so keep the `core` pack on every site.
- Put an ability that changes the site under `writes`, also one that only sometimes does, such as one with an `action` argument. A `read` scenario fails when an ability under `writes` runs without an error, and an ability under `reads` is never taken for a change.
- `entities` lists the entity types the pack's scenarios name in `given` and `expect.site`: the built-in `posts`, or one of this project's own, which is also under `entityTypes` in `evals.config.ts`. A site reads the entity types its packs list, and no others. `validate` notes an entity type of the project that no pack lists.
- An entity type added to a pack is compared in every scenario on the site, also in other packs' scenarios: anything a scenario does not name must stay as it was, and that now includes the items of the new type. `.agents/guide/entity-types.md` says how to write one.
