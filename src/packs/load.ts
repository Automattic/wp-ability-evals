// Reads a pack folder: its `pack.yaml`, and its stories with their scenarios.

import { join } from 'node:path';
import { InvalidProjectError } from '../errors.ts';
import { readYamlFile } from '../files/read.ts';
import { loadStories } from '../scenarios/load.ts';
import type { Pack, PackManifest } from './types.ts';
import { manifestProblems } from './validate.ts';

export const MANIFEST_FILE = 'pack.yaml';

/** The pack in `dir`, which may be outside the project. Throws `InvalidProjectError` with every problem found. */
export async function loadPack(dir: string): Promise<Pack> {
  const file = join(dir, MANIFEST_FILE);
  const content = await readYamlFile(file);
  const problems = manifestProblems(content);
  if (problems.length > 0) throw new InvalidProjectError(problems.map((message) => ({ file, message })));
  // No problems means the content follows the format, which is what makes it a `PackManifest`.
  const manifest = content as PackManifest;
  const { stories, scenarios } = await loadStories(dir, manifest.name);
  return { ...manifest, dir, stories, scenarios };
}
