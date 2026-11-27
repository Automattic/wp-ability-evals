// The rules a site file must follow. Only `kind`, `packs`, `afterRun` and `serverChecks` are the same for every
// kind of site; the rest belongs to the kind, so keys this file does not know are left alone.

import { isOneOf, isRecord, isText, isTextList } from '../files/shape.ts';
import { serverCheckConfigProblems } from '../server-checks/validate.ts';
import type { AfterRun } from './types.ts';

const AFTER_RUN: readonly AfterRun[] = ['keep', 'stop', 'remove'];

function wpEnvProblems({ wpEnv }: Record<string, unknown>): string[] {
  if (!isRecord(wpEnv)) return ['a `wp-env` site needs `wpEnv`: its wp-env configuration, as in a `.wp-env.json`'];
  const { port } = wpEnv;
  if (port !== undefined && !(typeof port === 'number' && Number.isInteger(port) && port > 0)) {
    return ['`wpEnv.port` must be a port number, such as `8897`'];
  }
  return [];
}

/** Everything wrong with a site file. An empty list means `value` is a `SiteFile`. */
export function siteFileProblems(value: unknown): string[] {
  if (!isRecord(value)) return ['must be an object with `kind` and `packs`'];
  const problems: string[] = [];
  if (!isText(value.kind)) problems.push('`kind` must be the kind of site, such as `"wp-env"`');
  if (!isTextList(value.packs)) problems.push('`packs` must be a list of pack names, such as `["core"]`');
  if (value.afterRun !== undefined && !isOneOf(value.afterRun, AFTER_RUN)) {
    problems.push(`\`afterRun\` must be one of: ${AFTER_RUN.join(', ')}. It says what happens to the site after a run; leave it out to keep the site running`);
  }
  problems.push(...serverCheckConfigProblems(value.serverChecks));
  if (value.kind === 'wp-env') problems.push(...wpEnvProblems(value));
  return problems;
}
