// The wp-env configuration of a site file, made ready for wp-env. wp-env runs in the site's own folder, which
// is hidden inside the project, and reads a path such as `./plugins/mine` from where it runs. A site file is
// written in a project, so its paths are read from the project folder.

import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { isRecord } from '../files/shape.ts';

type WpEnvConfig = Record<string, unknown>;

/** The keys of a wp-env configuration that hold a list of sources: a path, a URL or a repository each. */
const SOURCE_LISTS = ['plugins', 'themes'];

/** `config` with `change` applied to everything wp-env takes a source for, in its per-environment overrides too. */
function withSources(config: WpEnvConfig, change: (source: string) => string): WpEnvConfig {
  const changed = (value: unknown): unknown => (typeof value === 'string' ? change(value) : value);
  const result: WpEnvConfig = { ...config };
  if (config.core !== undefined) result.core = changed(config.core);
  for (const key of SOURCE_LISTS) {
    const list = config[key];
    if (Array.isArray(list)) result[key] = list.map(changed);
  }
  if (isRecord(config.mappings)) {
    result.mappings = Object.fromEntries(Object.entries(config.mappings).map(([target, source]) => [target, changed(source)]));
  }
  if (isRecord(config.env)) {
    result.env = Object.fromEntries(Object.entries(config.env).map(([name, override]) => [name, isRecord(override) ? withSources(override, change) : override]));
  }
  return result;
}

/** A site file's `wpEnv` as wp-env gets it: every path that starts with `.` is made a full path, from the project folder. */
export function wpEnvConfigOf(wpEnv: WpEnvConfig, projectDir: string): WpEnvConfig {
  return withSources(wpEnv, (source) => (source.startsWith('.') ? resolve(projectDir, source) : source));
}

/**
 * The paths in a configuration from `wpEnvConfigOf` that are not on this machine. Docker would make an empty
 * folder for each, and the site would start without that plugin or theme and say nothing.
 */
export function missingSourcesOf(config: WpEnvConfig): string[] {
  const missing: string[] = [];
  withSources(config, (source) => {
    if (isAbsolute(source) && !existsSync(source)) missing.push(source);
    return source;
  });
  return missing;
}
