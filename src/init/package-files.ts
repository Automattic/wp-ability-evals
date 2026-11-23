// What the package places in a project: the template, the skills, and the guide, which is the part of the
// template's `AGENTS.md` between two marker lines and the files of `guide/`. `init` copies all of it once. The
// skills and the guide stay the package's, so `update` copies them again when the package has newer ones. Both read the same lists here, so they can't disagree on what
// a project gets.

import { copyFile, mkdir, readFile, readdir, symlink } from 'node:fs/promises';
import { existsSync, lstatSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// The same number of levels up from `src/init/` and from the built `dist/init/`.
export const PACKAGE_ROOT = fileURLToPath(new URL('../../', import.meta.url));
// npm leaves `.gitignore` files out of a published package, so the template keeps its one without the dot.
const RENAMED = new Map([['gitignore', '.gitignore']]);

/** The file that holds the guide, in the template and in a project. */
export const GUIDE_FILE = 'AGENTS.md';
export const TEMPLATE_GUIDE_FILE = join(PACKAGE_ROOT, 'template', GUIDE_FILE);
// The two lines that mark the package's guide in a guide file. The first goes on after these words, with a
// note for whoever edits the file, so it is found by how it starts.
const GUIDE_BEGIN = '<!-- BEGIN wp-ability-evals guide';
const GUIDE_END = '<!-- END wp-ability-evals guide -->';

export interface FileToCopy {
  from: string;
  /** Relative to the project folder. */
  to: string;
}

export interface LinkToMake {
  /** Where the link is, relative to the project folder. */
  at: string;
  /** What it points to, relative to the folder the link is in. */
  target: string;
}

async function filesUnder(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => relative(dir, join(entry.parentPath, entry.name)));
}

export async function templateFiles(): Promise<FileToCopy[]> {
  const templateDir = join(PACKAGE_ROOT, 'template');
  return (await filesUnder(templateDir)).map((file) => ({ from: join(templateDir, file), to: RENAMED.get(file) ?? file }));
}

/**
 * Every folder in `skills/` that holds a SKILL.md, placed where agents look for a project's skills:
 * `.agents/skills/`, which Codex and most other agents read. Claude Code reads only `.claude/skills/`, so
 * each skill gets a link there. A link, not a second copy, so that a skill is one set of files to change.
 */
async function skillFiles(): Promise<{ copies: FileToCopy[]; links: LinkToMake[] }> {
  const skillsDir = join(PACKAGE_ROOT, 'skills');
  const files = await filesUnder(skillsDir);
  const skills = new Set(files.filter((file) => basename(file) === 'SKILL.md').map((file) => dirname(file)));
  const copies = files
    .filter((file) => skills.has(file.split(sep)[0] ?? ''))
    .map((file) => ({ from: join(skillsDir, file), to: join('.agents', 'skills', file) }));
  const links = [...skills].map((skill) => ({
    at: join('.claude', 'skills', skill),
    target: join('..', '..', '.agents', 'skills', skill),
  }));
  return { copies, links };
}

/**
 * The guide's own files, one per topic, which the guide in `AGENTS.md` points to: `guide/` in the package,
 * `.agents/guide/` in a project. `AGENTS.md` holds only what an agent needs in every session, and an agent
 * reads one of these before the work it names.
 */
export async function guideFiles(): Promise<FileToCopy[]> {
  const guideDir = join(PACKAGE_ROOT, 'guide');
  return (await filesUnder(guideDir)).map((file) => ({ from: join(guideDir, file), to: join('.agents', 'guide', file) }));
}

/**
 * Every file of the package that a project keeps a copy of, apart from the guide in `AGENTS.md`, and the links
 * to its skills. `init` places them, `update` replaces them, and the record holds a hash of each.
 */
export async function packageCopies(): Promise<{ copies: FileToCopy[]; links: LinkToMake[] }> {
  const skills = await skillFiles();
  return { copies: [...skills.copies, ...(await guideFiles())], links: skills.links };
}

/** Copies the files and makes the links in the project folder `dir`, with the folders they need. */
export async function placeIn(dir: string, copies: FileToCopy[], links: LinkToMake[]): Promise<void> {
  for (const copy of copies) {
    await mkdir(dirname(join(dir, copy.to)), { recursive: true });
    await copyFile(copy.from, join(dir, copy.to));
  }
  for (const link of links) {
    await mkdir(dirname(join(dir, link.at)), { recursive: true });
    await symlink(link.target, join(dir, link.at), 'dir');
  }
}

/** Whether anything is at the path. A link that points nowhere counts, which `existsSync` would not see. */
export function isThere(path: string): boolean {
  return lstatSync(path, { throwIfNoEntry: false }) !== undefined;
}

/** Where the package's guide is in the lines of a guide file, its two marker lines included. Nothing when it is not marked. */
function guideIn(lines: string[]): { from: number; to: number } | undefined {
  const from = lines.findIndex((line) => line.startsWith(GUIDE_BEGIN));
  const to = lines.findIndex((line, index) => index > from && line.trim() === GUIDE_END);
  return from === -1 || to === -1 ? undefined : { from, to };
}

/** The package's guide in the text of a guide file, with its two marker lines. Nothing when the file does not mark one. */
export function guideOf(text: string): string | undefined {
  const lines = text.split('\n');
  const guide = guideIn(lines);
  return guide === undefined ? undefined : lines.slice(guide.from, guide.to + 1).join('\n');
}

/**
 * The text of a project's guide file with the guide in it replaced by `guide`. Everything outside the two
 * marker lines is the project's and stays as it is. Nothing when the file does not mark a guide, because the
 * package's part can then not be told from the project's.
 */
export function withGuide(text: string, guide: string): string | undefined {
  const lines = text.split('\n');
  const old = guideIn(lines);
  return old === undefined ? undefined : [...lines.slice(0, old.from), guide, ...lines.slice(old.to + 1)].join('\n');
}

/** The package's own guide file, and the guide in it. */
export async function packageGuide(): Promise<{ file: string; guide: string }> {
  const file = await readFile(TEMPLATE_GUIDE_FILE, 'utf8');
  const guide = guideOf(file);
  if (guide === undefined) throw new Error(`${TEMPLATE_GUIDE_FILE} does not mark its guide with the lines \`${GUIDE_BEGIN} ... -->\` and \`${GUIDE_END}\`.`);
  return { file, guide };
}
