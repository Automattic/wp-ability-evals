// What a pack is: everything the evals know about one set of abilities.
// A pack is a folder of plain data files and holds no code, so it can live in another repository.

import type { Scenario, Story } from '../scenarios/types.ts';

/** The content of a pack's `pack.yaml`. */
export interface PackManifest {
  name: string;
  /** How the pack is named in output for people. */
  title: string;
  /** The abilities a run may execute. `reads` leave the site as it is, `writes` change it. */
  abilities: {
    reads: string[];
    writes: string[];
  };
  /** The entity types its scenarios make claims about: a built-in one, such as `posts`, or one under `entityTypes` in the project's settings. */
  entities: string[];
}

/** A pack as loaded: its manifest, where it is, its stories and their scenarios. */
export interface Pack extends PackManifest {
  dir: string;
  /** One per story file, in the order of the files' names. */
  stories: Story[];
  /** Every scenario of every story in one list, each with its full starting content. */
  scenarios: Scenario[];
}
