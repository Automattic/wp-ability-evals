# Hooks

How a hook of this project is written and named, when each runs, and what it gets. Part of the package's guide, which `npx wp-ability-evals update` replaces: write this project's own rules in `AGENTS.md`.

A hook is a function of this project that the package runs at a fixed point of a run, to prepare the site or to clean up. Write it in `hooks/` and name it in `evals.config.ts`, without calling it. Only `createGiven()`, which comes with the package, is called there, because the call returns the hook:

```ts
// hooks/seed-the-shop.ts
import { isWpEnvSite, type RunHookContext } from 'wp-ability-evals';

export async function seedTheShop({ site }: RunHookContext) {
  if (isWpEnvSite(site)) await site.wp(['post', 'create', '--post_title=Summer sale', '--post_status=draft']);
}

// evals.config.ts
hooks: {
  beforeRun: [seedTheShop],
  beforeTrial: [createGiven()],
},
```

There are six points, each optional, and each takes a list of functions that run in the order written. In a run:

1. The site starts in its clean state, as it was when it was set up.
2. `beforeRun` hooks. Then the site marks its start: every reset returns to the site as these hooks left it, so what they put there is on the site in every trial.
3. For each scenario, unless the server checks left it out because it names an ability the site lacks (`site check` shows them; none of its hooks run): `beforeScenario` hooks; for each agent and trial, the site is reset, then `beforeTrial` hooks, the comparison of the site with what the scenario says it starts with, the trial, `afterTrial` hooks; then `afterScenario` hooks.
4. `afterRun` hooks. Then the site is kept as the last trial left it, stopped or removed, as `afterRun` in its site file says.

- A hook gets one object: `site`, `run` (when it started, the site's name, the agents, the trials per scenario), and where they apply `scenario`, `agent` (its name) and `trial` (its number). An after-trial hook also gets `result`, how the trial ended. The types are in `node_modules/wp-ability-evals/dist/hooks/types.d.ts`.
- `site.state()` reads the site. `site.apply(change)` changes it as the admin user, through the entity types' writers: the change has the shape of `expect.site` with plain values, such as `{ posts: { 'summer-sale': { status: 'publish' }, 'hello-world': 'removed' } }`, and an item that is not on the site is created under its key. A post under `#` and a number is the exception: that key names a post without a slug by its ID, so the post is changed or removed when it is there, and nothing is created under it. On a `wp-env` site, `site.wp(args)` runs WP-CLI as the admin user and returns what it printed; `isWpEnvSite(site)` tells such a site apart.
- A `beforeTrial` hook may put on the site only what the scenario's `given` names, because of the comparison that follows it. Content for every trial goes in a `beforeRun` hook.
- An after-trial hook may return checks of its own, such as `[{ check: 'no-email-sent', pass: true, reason: 'No email was sent' }]`. They count like any other check of the trial. In a run, `result.transcript.toolCalls` holds every call the agent made, each with its `tool`, its `input` and `isError`, so such a check can grade what the site does not show at the end, such as a post that was published and then set back to draft.
- A hook fails by throwing, and the message it throws is shown with the hook's name and its point. A `beforeRun` hook that fails stops the run before any trial. A `beforeScenario` hook that fails makes every trial of that scenario "could not be judged", and a `beforeTrial` or `afterTrial` hook does so for its trial. An `afterScenario` or `afterRun` hook that fails is reported, and the run ends with an error.
- After-hooks run whenever the before-hooks of their point were reached, also after a failure, so put cleanup there.
- Try a `beforeRun` hook with `site start local`, then `site state local`: no agent runs, and nothing is spent.
- `verify --site local --no-judges` runs the hooks of every point without an agent, so it tries the others too. There `run.agents` is empty and `agent` is the text `verify`. The `beforeTrial` and the `afterTrial` hooks run once for each scenario, as in a trial. Their `result` has no `transcript`: its `site` holds the site before and after the writers made the change, and its `checks` the site check. Checks an after-trial hook returns are not counted there.
