# An entity type of this project's own

What the site check can see, and how to make it see more: an entity type with its reader and writer. Part of the package's guide, which `npx wp-ability-evals update` replaces: write this project's own rules in `AGENTS.md`.

The site check sees only what an entity type reads. The package has one, `posts`: items of the post type `post`, in every status but the trash, keyed by slug, or by `#` and the ID for a post without one, with the fields `title`, `status` and `content`. Pages, excerpts, slugs, authors, dates, categories, settings and anything else are not read, so a change to them is invisible: a scenario can't expect it, and an agent that makes it by mistake fails nothing. To grade such a change, add an entity type.

An entity type is a file in `extensions/`, a line in `evals.config.ts`, and its name under `entities` in the `pack.yaml` of each pack whose scenarios name it:

```ts
// extensions/settings.ts
import type { EntityType } from 'wp-ability-evals';

// The settings these scenarios are about, one item each, keyed by option name.
const NAMES = "['blogname', 'blogdescription', 'start_of_week']";

export const settings: EntityType = {
  name: 'settings',
  fields: ['value'],
  readers: {
    // A PHP expression that returns one row per item: its `key`, then every field.
    'wp-env': `array_map(fn($name) => ['key' => $name, 'value' => get_option($name)], ${NAMES})`,
  },
  writers: {
    // PHP statements that give the item under `$key` the `$fields`, or remove it when `$fields` is 'removed'.
    // They throw an exception to fail, with a message that says why.
    'wp-env': `
      if ($fields === 'removed') throw new Exception('a setting can not be removed');
      if (!in_array($key, ${NAMES}, true)) throw new Exception('it is not a setting this type reads');
      if (array_key_exists('value', $fields)) update_option($key, $fields['value']);`,
  },
};

// evals.config.ts
import { settings } from './extensions/settings.ts'; // with its `.ts` ending
// ...
entityTypes: [settings],

// packs/settings/pack.yaml
// entities: [settings]
```

- The reader returns every item of the type, each with a `key` that stays the same while the item exists, and every field under `fields`. Read values as WordPress stores them, without formatting them for display: a scenario then writes them as `site state` prints them.
- The writer finds the item by its key first, and changes it when it is there. So `given` and `expect.site` can name an item the site already has, such as a setting, and it is changed, not created twice. What it creates under a key, the reader must report under the same key. Where an item can't be created or removed, as a setting can't, it throws.
- Every scenario on a site that reads the type is compared on its items from then on, so run `verify --site local --no-judges` on all of them after adding it, not only on the new ones.
- `validate` checks that the reader and the writer are text, and nothing more: it does not run the PHP. `site state` runs the readers, and `verify` the writers. One that fails is named in the error, with the line counted from its own first line: ``the `wp-env` reader of the entity type `settings` failed: Call to undefined function get_optoin(), on line 1 of the reader``.
- The format, field by field, is in `node_modules/wp-ability-evals/dist/entities/types.d.ts`.
