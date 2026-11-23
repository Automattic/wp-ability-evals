// Creates a new project: the folder where someone's evals live. It copies the template, the skills and the
// guide's files that ship with the package, records what it copied, and writes a package.json that depends on the package. A project is separate from
// the package so that it can take a new version of the package without losing anything of its own.

import { readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';
import { ProjectExistsError } from '../errors.ts';
import { PACKAGE_ROOT, isThere, packageCopies, placeIn, templateFiles } from './package-files.ts';
import { RECORD_FILE, packageCopied, recordText, writeRecord } from './record.ts';

const PACKAGE_NAME = 'wp-ability-evals';

export interface InitResult {
  dir: string;
  /** Every file and link written, relative to `dir`, sorted. */
  created: string[];
}

/** How the project depends on the package: by version when the package was installed, by folder when it runs from a checkout. */
async function dependencySpec(): Promise<string> {
  if (!PACKAGE_ROOT.includes(`${sep}node_modules${sep}`)) return `file:${PACKAGE_ROOT.replace(/[\\/]$/, '')}`;
  const manifest: unknown = JSON.parse(await readFile(join(PACKAGE_ROOT, 'package.json'), 'utf8'));
  const version = typeof manifest === 'object' && manifest !== null && 'version' in manifest ? manifest.version : undefined;
  return typeof version === 'string' ? `^${version}` : 'latest';
}

async function projectManifest(dir: string): Promise<string> {
  const name = basename(dir).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'evals';
  const manifest = {
    name,
    private: true,
    type: 'module',
    scripts: { evals: PACKAGE_NAME },
    dependencies: { [PACKAGE_NAME]: await dependencySpec() },
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/** Creates a project in `targetDir`. If any file it would write is already there, it writes nothing. */
export async function initProject(targetDir: string): Promise<InitResult> {
  const dir = resolve(targetDir);
  const kept = await packageCopies();
  const copies = [...(await templateFiles()), ...kept.copies];
  const created = [...copies.map((copy) => copy.to), ...kept.links.map((link) => link.at), RECORD_FILE, 'package.json'].sort();

  const existing = created.filter((file) => isThere(join(dir, file)));
  if (existing.length > 0) throw new ProjectExistsError(dir, existing);

  await placeIn(dir, copies, kept.links);
  await writeRecord(dir, recordText(await packageCopied()));
  await writeFile(join(dir, 'package.json'), await projectManifest(dir));
  return { dir, created };
}
