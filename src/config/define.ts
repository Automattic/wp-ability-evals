// The helper a project's `evals.config.ts` wraps its settings in. It changes nothing; it is there so the
// editor and the type check know the shape of the config.

import type { Config } from './types.ts';

export function defineConfig(config: Config): Config {
  return config;
}
