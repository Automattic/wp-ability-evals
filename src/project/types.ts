// A project as loaded: the folder where someone's evals live, with its settings, its packs and its site
// files read and validated. Every command that needs a project starts from this.

import type { LoadedConfig } from '../config/types.ts';
import type { Pack } from '../packs/types.ts';
import type { SiteFile } from '../sites/types.ts';

export interface Project {
  dir: string;
  config: LoadedConfig;
  packs: Pack[];
  /** The site files, by the site's name. */
  sites: Record<string, SiteFile>;
}
