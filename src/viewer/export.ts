// Exports a self-contained static copy of the viewer (HTML, JS, CSS, and precomputed JSON data) so CI builds
// or static hosts can publish the interactive Overview, MCP Inspector audit, and run transcripts without a server.

import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readOverview } from '../coverage/read.ts';
import { ViewerNotBuiltError } from '../errors.ts';
import type { Pack } from '../packs/types.ts';
import { listRuns, runFilePath } from '../results/read.ts';
import type { RunFile } from '../results/types.ts';

const PAGE_DIR = fileURLToPath(new URL('../../dist/viewer/page/', import.meta.url));
const STATIC_BOOT = '<script>window.__WP_ABILITY_EVALS_STATIC__ = true;</script>\n    <script type="module" src="./main.js"></script>';

export interface ExportViewerOptions {
  /** The project's results folder. */
  resultsDir: string;
  /** The project's loaded packs. */
  packs: Pack[];
  /** Destination folder for the static bundle. Replaced if it already exists. */
  outDir: string;
}

export interface ExportedViewer {
  outDir: string;
  runs: number;
}

async function copyRunFile(resultsDir: string, runId: string, relFile: string, destRunDir: string): Promise<boolean> {
  const source = runFilePath(resultsDir, runId, relFile);
  if (source === undefined) return false;
  const target = join(destRunDir, relFile);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
  return true;
}

/** Writes the viewer page and all precomputed JSON data for `resultsDir` into `outDir`. */
export async function exportViewer({ resultsDir, packs, outDir }: ExportViewerOptions): Promise<ExportedViewer> {
  const indexPath = join(PAGE_DIR, 'index.html');
  if (!existsSync(indexPath)) throw new ViewerNotBuiltError();

  const destination = resolve(outDir);
  await rm(destination, { recursive: true, force: true });
  await mkdir(join(destination, 'data'), { recursive: true });

  const html = (await readFile(indexPath, 'utf8')).replace('<script type="module" src="./main.js"></script>', STATIC_BOOT);
  await writeFile(join(destination, 'index.html'), html);
  await copyFile(join(PAGE_DIR, 'main.js'), join(destination, 'main.js'));
  await copyFile(join(PAGE_DIR, 'main.css'), join(destination, 'main.css'));

  const [overview, runs] = await Promise.all([readOverview(resultsDir, packs), listRuns(resultsDir)]);
  await writeFile(join(destination, 'data', 'overview.json'), JSON.stringify(overview));
  await writeFile(join(destination, 'data', 'runs.json'), JSON.stringify(runs));

  for (const listing of runs) {
    const destRunDir = join(destination, 'data', 'runs', listing.id);
    const runJson = runFilePath(resultsDir, listing.id, 'run.json');
    if (runJson === undefined) continue;
    await copyRunFile(resultsDir, listing.id, 'run.json', destRunDir);
    await copyRunFile(resultsDir, listing.id, 'server.json', destRunDir);
    const saved = JSON.parse(await readFile(runJson, 'utf8')) as Partial<RunFile>;
    for (const trial of saved.trials ?? []) {
      if (typeof trial.file === 'string' && trial.file !== '') {
        await copyRunFile(resultsDir, listing.id, trial.file, destRunDir);
      }
    }
  }

  return { outDir: destination, runs: runs.length };
}
