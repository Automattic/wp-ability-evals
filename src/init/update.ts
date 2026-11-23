// Brings a project's copy of the package's skills and guide up to date. `init` copies them once, and the
// package goes on changing them: a project that installs a newer version would otherwise keep a guide that
// describes the older one. The copies are the package's, so they are replaced, never merged. A copy that is
// still what the package last copied is replaced without a word. One that someone changed in the project is
// replaced only when asked, and until then nothing at all is written, so that a skill and the guide it points
// into stay of one version. What a project owns is left alone: every other file, a skill of its own, and
// what its guide file holds outside the two lines that mark the package's guide.

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { CONFIG_FILE } from '../config/load.ts';
import { ChangedInProjectError, GuideNotMarkedError, ProjectNotFoundError, type ChangedCopy } from '../errors.ts';
import { GUIDE_FILE, TEMPLATE_GUIDE_FILE, guideOf, isThere, packageCopies, packageGuide, placeIn, withGuide, type FileToCopy, type LinkToMake } from './package-files.ts';
import { RECORD_FILE, hashOf, packageCopied, readRecord, recordKey, recordText, writeRecord } from './record.ts';

export interface ProjectUpdate {
  /** The files and links the project lacks, relative to its folder, sorted. */
  added: string[];
  /** The files whose content is not the package's, relative to the project's folder, sorted. */
  updated: string[];
}

/**
 * How a project's copy stands to the package's file. `older` is still what the package last copied, so
 * replacing it loses nothing. `changed` differs from that too: someone changed it in the project, or nothing
 * records what was copied.
 */
type Standing = 'same' | 'missing' | 'older' | 'changed';

function standingOf(current: string | undefined, wanted: string, recorded: string | undefined): Standing {
  if (current === undefined) return 'missing';
  if (current === wanted) return 'same';
  return current === recorded ? 'older' : 'changed';
}

interface Pending extends ProjectUpdate {
  copies: FileToCopy[];
  links: LinkToMake[];
  /** The new text of the project's guide file, when it has to change. */
  guide: string | undefined;
  /** The new text of the project's record, when it has to change. */
  record: string | undefined;
  /** The copies that differ and were changed in the project. They are among `copies` and `guide`, and not in `updated`. */
  changed: ChangedCopy[];
}

/** What separates the project in `dir` from the installed package's skills and guide. It writes nothing. */
async function pendingIn(dir: string): Promise<Pending> {
  if (!existsSync(join(dir, CONFIG_FILE))) throw new ProjectNotFoundError(dir);
  const added: string[] = [];
  const updated: string[] = [];
  const changed: ChangedCopy[] = [];
  const recorded = await readRecord(dir);

  /** Notes how a copy stands, from the hash of what the project has and of what the package has. Whether it has to be written. */
  const toWrite = (file: string, packageFile: string, current: string | undefined, wanted: string): boolean => {
    const standing = standingOf(current, wanted, recorded[recordKey(file)]);
    if (standing === 'missing') added.push(file);
    if (standing === 'older') updated.push(file);
    if (standing === 'changed') changed.push({ file, packageFile: relative(dir, packageFile) });
    return standing !== 'same';
  };

  const kept = await packageCopies();
  const copies: FileToCopy[] = [];
  for (const copy of kept.copies) {
    const current = isThere(join(dir, copy.to)) ? hashOf(await readFile(join(dir, copy.to))) : undefined;
    if (toWrite(copy.to, copy.from, current, hashOf(await readFile(copy.from)))) copies.push(copy);
  }
  // A link that is there is left alone, wherever it points: only a missing one is the package's to make.
  const links = kept.links.filter((link) => !isThere(join(dir, link.at)));
  added.push(...links.map((link) => link.at));

  const ofPackage = await packageGuide();
  const text = isThere(join(dir, GUIDE_FILE)) ? await readFile(join(dir, GUIDE_FILE), 'utf8') : undefined;
  const current = text === undefined ? undefined : guideOf(text);
  if (text !== undefined && current === undefined) throw new GuideNotMarkedError(GUIDE_FILE, relative(dir, TEMPLATE_GUIDE_FILE));
  const guideChanges = toWrite(GUIDE_FILE, TEMPLATE_GUIDE_FILE, current === undefined ? undefined : hashOf(current), hashOf(ofPackage.guide));
  const guide = !guideChanges ? undefined : text === undefined ? ofPackage.file : withGuide(text, ofPackage.guide);

  // Once everything is written, the project holds what the package copies now, and the record says so.
  const wantedRecord = recordText(await packageCopied());
  const currentRecord = isThere(join(dir, RECORD_FILE)) ? await readFile(join(dir, RECORD_FILE), 'utf8') : undefined;
  const record = currentRecord === wantedRecord ? undefined : wantedRecord;
  if (record !== undefined) (currentRecord === undefined ? added : updated).push(RECORD_FILE);

  return { copies, links, guide, record, changed, added: added.sort(), updated: updated.sort() };
}

/**
 * Makes the skills and the guide of the project in `projectDir` those of the installed package, and says
 * what it wrote. It writes nothing when the guide file does not mark the package's guide, and nothing when
 * a copy was changed in the project, unless `overwrite` says that those may be replaced too.
 */
export async function updateProject(projectDir: string, { overwrite = false }: { overwrite?: boolean } = {}): Promise<ProjectUpdate> {
  const dir = resolve(projectDir);
  const { copies, links, guide, record, changed, added, updated } = await pendingIn(dir);
  if (changed.length > 0 && !overwrite) throw new ChangedInProjectError(changed);

  await placeIn(dir, copies, links);
  if (guide !== undefined) await writeFile(join(dir, GUIDE_FILE), guide);
  if (record !== undefined) await writeRecord(dir, record);
  return { added, updated: [...updated, ...changed.map(({ file }) => file)].sort() };
}

/** What `validate` adds when the project's skills or guide are not the installed package's. Nothing when they are. */
export async function updateNotice(projectDir: string): Promise<string | undefined> {
  try {
    const { added, updated, changed } = await pendingIn(resolve(projectDir));
    const edited = changed.map(({ file }) => file);
    const files = [...added, ...updated, ...edited].sort();
    if (files.length === 0) return undefined;
    const ofEdited = edited.length === 0 ? '' : ` Changed in this project, so it writes nothing until it is told to replace them: ${edited.join(', ')}.`;
    return `The installed package has other content for: ${files.join(', ')}. \`npx wp-ability-evals update\` takes it: whole files in .agents/skills/ and .agents/guide/, and in ${GUIDE_FILE} only the guide between its two marker lines.${ofEdited}`;
  } catch (error) {
    if (error instanceof GuideNotMarkedError) return error.message;
    throw error;
  }
}
