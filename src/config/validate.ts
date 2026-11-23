// The rules a project's settings must follow. Node runs `evals.config.ts` without checking its types, so a
// wrong setting would otherwise show up only in the middle of a run.

import { isRecord, isText, isTextList, unknownKeyProblems } from '../files/shape.ts';
import type { HookPoint } from '../hooks/types.ts';

const KEYS = ['packs', 'sitesDir', 'resultsDir', 'agents', 'judges', 'trials', 'trialTimeoutMs', 'entityTypes', 'siteKinds', 'hooks'];
/** The points of a run, in the order they are reached. */
const HOOK_POINTS: readonly HookPoint[] = ['beforeRun', 'beforeScenario', 'beforeTrial', 'afterTrial', 'afterScenario', 'afterRun'];

function judgeProblems(judges: unknown): string[] {
  if (judges === undefined) return [];
  if (!isRecord(judges)) return ['`judges` must map a name to a judge, such as `{ claude: claudeJudge({ ... }) }`'];
  return Object.entries(judges)
    .filter(([, judge]) => !isRecord(judge) || typeof judge.grade !== 'function' || !isText(judge.family))
    .map(([name]) => `\`judges.${name}\` must be a judge: an object with a \`grade\` method and its model \`family\`, such as what \`claudeJudge(...)\` returns`);
}

function agentProblems(agents: unknown, judges: unknown): string[] {
  if (!isRecord(agents)) return ['`agents` must map a name to an agent, such as `{ \'claude-code\': claudeCode({ ... }) }`'];
  const judgeNames = isRecord(judges) ? Object.keys(judges) : [];
  return Object.entries(agents).flatMap(([name, agent]) => {
    if (!isRecord(agent) || typeof agent.run !== 'function' || !isText(agent.family)) {
      return [`\`agents.${name}\` must be an agent: an object with a \`run\` method and its model \`family\`, such as what \`claudeCode(...)\` returns`];
    }
    if (agent.judge === undefined || (isText(agent.judge) && judgeNames.includes(agent.judge))) return [];
    const known = judgeNames.length > 0 ? `there are: ${judgeNames.join(', ')}` : 'there are none: add `judges` to the settings';
    return [`\`agents.${name}\` names the judge \`${String(agent.judge)}\`, which is not in \`judges\`; ${known}`];
  });
}

/**
 * What the reader and the writer of an entity type must be for a `wp-env` site, the built-in kind: PHP that
 * the package runs itself, so each is text. Those of another kind are that kind's own business, because a
 * project's own kind of site reads and writes in its own way.
 */
const WP_ENV_PHP = {
  readers: "a PHP expression that returns one row per item, each with a `key` and the fields, such as `array_map(fn($p) => ['key' => $p->post_name, 'title' => $p->post_title], get_pages())`",
  writers:
    "PHP statements that make one item have its fields, or remove it: they get `$key`, the item's key, and `$fields`, the fields to give it by name or the text `removed`, and they throw an exception to fail",
} as const;

/** A problem for each `wp-env` reader and writer that is not text. `types` has the shape of a list of entity types. */
function wpEnvPhpProblems(types: Record<string, unknown>[]): string[] {
  const problems: string[] = [];
  for (const [index, type] of types.entries()) {
    for (const side of ['readers', 'writers'] as const) {
      const php = isRecord(type[side]) ? type[side]['wp-env'] : undefined;
      if (php === undefined || isText(php)) continue;
      const found = typeof php === 'string' ? 'it is empty' : `it is of type \`${typeof php}\``;
      problems.push(`\`entityTypes\` entry ${index + 1} (\`${String(type.name)}\`): \`${side}.wp-env\` must be text, and ${found}. Write ${WP_ENV_PHP[side]}`);
    }
  }
  return problems;
}

function entityTypeProblems(entityTypes: unknown): string[] {
  if (entityTypes === undefined) return [];
  const isEntityType = (type: unknown): type is Record<string, unknown> =>
    isRecord(type) && isText(type.name) && isTextList(type.fields) && isRecord(type.readers) && (type.writers === undefined || isRecord(type.writers));
  if (Array.isArray(entityTypes) && entityTypes.every(isEntityType)) return wpEnvPhpProblems(entityTypes);
  return ['`entityTypes` must be a list of entity types, each with a `name`, a list of `fields`, its `readers` and, to put starting content on a site, its `writers`'];
}

function siteKindProblems(siteKinds: unknown): string[] {
  if (siteKinds === undefined) return [];
  if (isRecord(siteKinds) && Object.values(siteKinds).every((factory) => typeof factory === 'function')) return [];
  return ['`siteKinds` must map the `kind` a site file names to a function that returns a site'];
}

function hookProblems(hooks: unknown): string[] {
  if (hooks === undefined) return [];
  if (!isRecord(hooks)) return ['`hooks` must map a point of a run to a list of functions, such as `{ beforeRun: [seedTheShop] }`'];
  const problems = unknownKeyProblems(hooks, HOOK_POINTS, '`hooks`');
  for (const point of HOOK_POINTS.filter((name) => hooks[name] !== undefined)) {
    const list = hooks[point];
    if (!Array.isArray(list)) {
      problems.push(`\`hooks.${point}\` must be a list of functions, such as \`[seedTheShop]\`; write one hook as a list of one`);
      continue;
    }
    for (const [index, hook] of list.entries()) {
      if (typeof hook === 'function') continue;
      problems.push(`\`hooks.${point}\` entry ${index + 1} must be a function, and it is of type \`${typeof hook}\`. Write the hook's name without calling it, such as \`[seedTheShop]\`: the run calls it`);
    }
  }
  return problems;
}

/** Everything wrong with the default export of an `evals.config.ts`. An empty list means `value` is a `Config`. */
export function configProblems(value: unknown): string[] {
  if (!isRecord(value)) return ['must have the settings as its default export: `export default defineConfig({ ... })`'];
  const problems = unknownKeyProblems(value, KEYS);
  if (!isTextList(value.packs)) problems.push("`packs` must be a list of pack folders, such as `['./packs/core']`");
  for (const key of ['sitesDir', 'resultsDir']) {
    if (!isText(value[key])) problems.push(`\`${key}\` must be a folder, such as \`'./${key.replace('Dir', '')}'\``);
  }
  problems.push(...judgeProblems(value.judges), ...agentProblems(value.agents, value.judges));
  if (typeof value.trials !== 'number' || !Number.isInteger(value.trials) || value.trials < 1) {
    problems.push('`trials` must be a whole number, 1 or more');
  }
  if (typeof value.trialTimeoutMs !== 'number' || !(value.trialTimeoutMs > 0)) {
    problems.push('`trialTimeoutMs` must be a number of milliseconds above 0');
  }
  problems.push(...entityTypeProblems(value.entityTypes), ...siteKindProblems(value.siteKinds), ...hookProblems(value.hooks));
  return problems;
}
