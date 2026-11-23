# The abilities a scenario expects

How to write `expect.abilities` and `expect.forbidden`, and what a failed check on abilities says. Part of the package's guide, which `npx wp-ability-evals update` replaces: write this project's own rules in `AGENTS.md`.

Grade a scenario on the site wherever `site state` can show the result. Where it can't, say which abilities a correct run executes, with `expect.abilities`, and which must not run, with `expect.forbidden`:

```yaml
expect:
  abilities:
    - core/content-query # ran at least once without an error
    - core/content-update: { status: publish } # ran without an error with this argument
    - core/content-query: { status: [draft, pending] } # a list: with one of these values
  forbidden: [core/content-delete] # did not run, not even with an error
```

- An entry of `abilities` is an ability's name, or that one name mapped to arguments. With arguments, one call of the ability without an error must have had every one of them. The call's other arguments are free, and so are other calls and other abilities.
- Write an argument's value as text, a number, `true` or `false`. A number matches its text, so `id: 12` is met by `"12"`. `true` and `false` are met only by themselves, not by `1` or `0`. A list means one of its values, so an argument whose own value is a list or a mapping can't be expected: leave it out.
- Write the arguments in braces on the ability's line, or on lines of their own that are indented deeper than its name. At the same depth as the name they are read as more keys of the entry, which `validate` reports. A name alone has no colon.
- `forbidden` takes names only. An ability named there must not run at all, and a call that failed counts. Use it for what the scenario's kind leaves open, such as the ability that would act in a scenario where the agent must not act. A `none` scenario already fails when any ability runs, so `validate` reports `forbidden` there as adding nothing.
- A call that came back with an error changed nothing, and agents try whatever might do what was asked, so a refused try is no mistake. A `read` scenario fails when an ability under `writes` ran without an error, and every scenario when an ability that no pack lists did. `forbidden` and a `none` scenario count every try, refused or not.
- Every ability in either list must be in a pack's `pack.yaml`, and none may be in both lists.
- The order of the calls and their number are not checked, and a scenario can't expect them. An agent may take another valid path than you thought of, such as a lookup first or a second try, and a check on its steps would fail it. So name an ability under `abilities` only when no other ability can do the task, and an argument only when the request fixes its value.
- A failed check says what to look at:
  - `core/content-update did not run without an error with status "publish": it ran with status "draft"; status "publish" (failed)`: the ability ran twice, once with another value and once as expected but with an error. Each run is listed with what it had for the expected arguments, and with `no status` where it had none.
  - `Expected abilities that did not run without an error: core/content-query. Ran: core/content-update`: the ability did not run, or it ran only with an error and the scenario names no arguments for it. `Ran:` lists every ability that ran.
  - `Forbidden abilities ran: core/content-delete (failed)`: the agent tried the ability, and the call failed.
- To see what an ability ran with, read `transcript.toolCalls` in the trial's file: the input of the ability's tool is the ability's input. Where a tool runs any ability, the ability's input is one argument of that tool's input, next to the ability's name: on a site without the `abilities-as-tools` plugin, `parameters` of `mcp-adapter-execute-ability`, next to `ability_name`.
