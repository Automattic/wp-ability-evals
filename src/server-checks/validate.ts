// The rules an opt-in `serverChecks` block must follow, shared by `evals.config.ts` and `sites/<name>.json`,
// plus how a site's override merges with the project's default settings.

import { isOneOf, isRecord, isText, isTextList, unknownKeyProblems } from '../files/shape.ts';
import type { ExpectedHints, ServerCheckConfig, ToolHint } from './types.ts';

/** The four boolean MCP tool annotation hints recognized in `serverChecks`. */
export const TOOL_HINTS: readonly ToolHint[] = ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint'];

const KEYS = ['requiredHints', 'hints', 'directTools'] as const;

function requiredHintsProblems(value: unknown, where: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    return [`\`${where}.requiredHints\` must be a list of MCP hint names: ${TOOL_HINTS.join(', ')}`];
  }
  const invalid = value.filter((item) => !isOneOf(item, TOOL_HINTS));
  if (invalid.length === 0) return [];
  return [
    `\`${where}.requiredHints\` has invalid entries (${invalid.map((item) => `\`${String(item)}\``).join(', ')}); valid hints are: ${TOOL_HINTS.join(', ')}`,
  ];
}

function hintsProblems(value: unknown, where: string): string[] {
  if (value === undefined) return [];
  if (!isRecord(value)) {
    return [`\`${where}.hints\` must map ability names to expected boolean hints, such as \`{ 'core/update-site-title': { destructiveHint: true } }\``];
  }
  const problems: string[] = [];
  for (const [ability, expected] of Object.entries(value)) {
    const entryWhere = `${where}.hints['${ability}']`;
    if (!isText(ability)) {
      problems.push(`\`${where}.hints\` has an empty ability name`);
      continue;
    }
    if (!isRecord(expected) || Object.keys(expected).length === 0) {
      problems.push(`\`${entryWhere}\` must map at least one hint (${TOOL_HINTS.join(', ')}) to \`true\` or \`false\``);
      continue;
    }
    problems.push(...unknownKeyProblems(expected, TOOL_HINTS, `\`${entryWhere}\``));
    for (const [hint, expectedValue] of Object.entries(expected)) {
      if (!isOneOf(hint, TOOL_HINTS)) continue;
      if (typeof expectedValue !== 'boolean') {
        problems.push(`\`${entryWhere}.${hint}\` must be \`true\` or \`false\`, and it is of type \`${typeof expectedValue}\``);
      }
    }
  }
  return problems;
}

function directToolsProblems(value: unknown, where: string): string[] {
  if (value === undefined) return [];
  if (typeof value === 'boolean' || isTextList(value)) return [];
  return [`\`${where}.directTools\` must be \`true\`, \`false\`, or a list of ability names, such as \`['core/get-site-info']\``];
}

/** Everything wrong with a `serverChecks` block in `evals.config.ts` or a site file. */
export function serverCheckConfigProblems(value: unknown, where = 'serverChecks'): string[] {
  if (value === undefined) return [];
  if (!isRecord(value)) return [`\`${where}\` must be an object with optional \`requiredHints\`, \`hints\` and \`directTools\``];
  return [
    ...unknownKeyProblems(value, KEYS, `\`${where}\``),
    ...requiredHintsProblems(value.requiredHints, where),
    ...hintsProblems(value.hints, where),
    ...directToolsProblems(value.directTools, where),
  ];
}

/**
 * Combines project-level `serverChecks` with an optional site-level override. Site-level `requiredHints` and
 * `directTools` replace the project value (so a lookup site can set `directTools: false` or `requiredHints: []`),
 * while `hints` merges per ability and per hint with site values taking precedence.
 */
export function resolveServerChecks(project?: ServerCheckConfig, site?: ServerCheckConfig): ServerCheckConfig | undefined {
  if (project === undefined && site === undefined) return undefined;
  if (site === undefined) return project;
  if (project === undefined) return site;

  const requiredHints = site.requiredHints !== undefined ? site.requiredHints : project.requiredHints;
  const directTools = site.directTools !== undefined ? site.directTools : project.directTools;
  let hints: Record<string, ExpectedHints> | undefined;
  if (project.hints !== undefined || site.hints !== undefined) {
    hints = {};
    for (const [ability, expected] of Object.entries(project.hints ?? {})) {
      hints[ability] = { ...expected };
    }
    for (const [ability, expected] of Object.entries(site.hints ?? {})) {
      hints[ability] = { ...hints[ability], ...expected };
    }
  }
  return {
    ...(requiredHints === undefined ? {} : { requiredHints }),
    ...(hints === undefined ? {} : { hints }),
    ...(directTools === undefined ? {} : { directTools }),
  };
}
