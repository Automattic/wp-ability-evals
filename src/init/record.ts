// The record of what the package copied into a project: a hash of each skill file and of the guide, kept in
// the project and committed with it. A copy that differs from the package's is either an older version or
// something a person changed in the project, and only what was copied can tell the two apart. `update`
// replaces the first without a word and asks before it replaces the second.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import { isRecord } from '../files/shape.ts';
import { GUIDE_FILE, packageCopies, packageGuide } from './package-files.ts';

/** Where a project keeps the record, relative to its folder. */
export const RECORD_FILE = join('.agents', 'wp-ability-evals.json');

const ABOUT =
  'What the wp-ability-evals package copied into this project: a SHA-256 of each file it copied into .agents/skills/ and .agents/guide/, and for AGENTS.md of the guide between its two marker lines. `wp-ability-evals update` reads it to tell a change made in this project from an older version of the package. Commit it, and do not edit it.';

/** A hash for each copied file, by its path in the project, written with `/` on every system. */
export type Copied = Record<string, string>;

export function hashOf(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex');
}

/** A file's name in the record: the same on every system, so that a project can be shared between them. */
export function recordKey(file: string): string {
  return file.split(sep).join('/');
}

/** What the installed package copies into a project now. */
export async function packageCopied(): Promise<Copied> {
  const copied: Copied = { [recordKey(GUIDE_FILE)]: hashOf((await packageGuide()).guide) };
  for (const copy of (await packageCopies()).copies) copied[recordKey(copy.to)] = hashOf(await readFile(copy.from));
  return copied;
}

/** The text of the record file, with the files in one order whatever order they were copied in. */
export function recordText(copied: Copied): string {
  const sorted = Object.fromEntries(Object.entries(copied).sort(([a], [b]) => (a < b ? -1 : 1)));
  return `${JSON.stringify({ about: ABOUT, copied: sorted }, null, 2)}\n`;
}

export async function writeRecord(dir: string, text: string): Promise<void> {
  await mkdir(dirname(join(dir, RECORD_FILE)), { recursive: true });
  await writeFile(join(dir, RECORD_FILE), text);
}

/**
 * What the record of the project in `dir` says was copied. Nothing was, as far as anyone can tell, when the
 * project has no record or one that can't be read: every copy that differs then counts as changed in the
 * project, which is the side that loses nothing.
 */
export async function readRecord(dir: string): Promise<Copied> {
  try {
    const record: unknown = JSON.parse(await readFile(join(dir, RECORD_FILE), 'utf8'));
    const copied = isRecord(record) ? record.copied : undefined;
    if (!isRecord(copied)) return {};
    return Object.fromEntries(Object.entries(copied).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  } catch {
    return {};
  }
}
