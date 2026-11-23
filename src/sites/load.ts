// Reads the site files of a project: one JSON file per site, named after the site.

import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { InvalidProjectError, problemsIn, type Problem } from '../errors.ts';
import { readJsonFile } from '../files/read.ts';
import { isSlug } from '../files/shape.ts';
import type { SiteFile } from './types.ts';
import { siteFileProblems } from './validate.ts';

const EXTENSION = '.json';

/** The file of the site with this name. */
export function siteFilePath(sitesDir: string, name: string): string {
  return join(sitesDir, `${name}${EXTENSION}`);
}

async function loadSiteFile(file: string): Promise<SiteFile> {
  const content = await readJsonFile(file);
  const problems = siteFileProblems(content);
  if (problems.length > 0) throw new InvalidProjectError(problems.map((message) => ({ file, message })));
  // No problems means the content follows the format, which is what makes it a `SiteFile`.
  return content as SiteFile;
}

/** Every site file in the folder, by the site's name. Throws `InvalidProjectError` with every problem found. */
export async function loadSiteFiles(sitesDir: string): Promise<Record<string, SiteFile>> {
  const names = existsSync(sitesDir) ? (await readdir(sitesDir)).filter((name) => name.endsWith(EXTENSION)).sort() : [];
  const sites: Record<string, SiteFile> = {};
  const problems: Problem[] = [];
  for (const fileName of names) {
    const file = join(sitesDir, fileName);
    const name = fileName.slice(0, -EXTENSION.length);
    if (!isSlug(name)) {
      problems.push({ file, message: 'a site file is named in lowercase letters, digits and hyphens, then `.json`: the name is how commands refer to the site' });
      continue;
    }
    try {
      sites[name] = await loadSiteFile(file);
    } catch (error) {
      problems.push(...problemsIn(error));
    }
  }
  if (problems.length > 0) throw new InvalidProjectError(problems);
  return sites;
}
