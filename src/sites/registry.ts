// The kinds of site that ship with the package. A project adds its own in its config, not here.

import type { SiteFactory } from './types.ts';
import { createWpEnvSite } from './wp-env.ts';

export const BUILT_IN_SITE_KINDS: Record<string, SiteFactory> = {
  'wp-env': createWpEnvSite,
};
