// The viewer: a page that shows the coverage of a project's abilities and the runs saved in its results folder,
// served to a browser on this machine. The page is built from `viewer/` into `dist/viewer/page/`. The server
// only reads: the page, the Overview, the list of runs, and the JSON files of a run.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readOverview } from '../coverage/read.ts';
import { ViewerNotBuiltError, ViewerPortInUseError } from '../errors.ts';
import type { Pack } from '../packs/types.ts';
import { listRuns, runFilePath } from '../results/read.ts';

// The same number of levels up from `src/viewer/` and from the built `dist/viewer/`.
const PAGE_DIR = fileURLToPath(new URL('../../dist/viewer/page/', import.meta.url));
// The page's files, by the address each is served at.
const PAGE_FILES: Record<string, { file: string; type: string }> = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/main.js': { file: 'main.js', type: 'text/javascript; charset=utf-8' },
  '/main.css': { file: 'main.css', type: 'text/css; charset=utf-8' },
};
const JSON_TYPE = 'application/json; charset=utf-8';
const RUNS = '/api/runs';
const OVERVIEW = '/api/overview';
// Only this machine reaches the server, and only under these names. A request under another name comes from a
// web page that points its own domain here to read the results, so it is refused.
const HOST = '127.0.0.1';
const HOST_NAMES = ['localhost', HOST];

export interface ViewerOptions {
  /** The project's results folder. */
  resultsDir: string;
  /** Reads the project's packs. The Overview reads them for every request, so a changed scenario shows on a reload. */
  packs: () => Promise<Pack[]>;
  /** The port to listen on. 0 takes any free one. */
  port: number;
}

export interface Viewer {
  /** The address to open in a browser. */
  url: string;
  close(): Promise<void>;
}

function send(response: ServerResponse, status: number, type: string, body: string | Buffer): void {
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  response.end(body);
}

function refuse(response: ServerResponse, status: number, message: string): void {
  send(response, status, JSON_TYPE, JSON.stringify({ error: message }));
}

async function answer(request: IncomingMessage, response: ServerResponse, { resultsDir, packs }: Omit<ViewerOptions, 'port'>): Promise<void> {
  const host = (request.headers.host ?? '').replace(/:\d+$/, '');
  if (!HOST_NAMES.includes(host)) return refuse(response, 403, 'The viewer answers only on this machine.');
  if (request.method !== 'GET') return refuse(response, 405, 'The viewer only reads.');

  const path = decodeURIComponent(new URL(request.url ?? '/', `http://${HOST}`).pathname);
  const page = PAGE_FILES[path];
  if (page !== undefined) return send(response, 200, page.type, await readFile(join(PAGE_DIR, page.file)));
  if (path === OVERVIEW) return send(response, 200, JSON_TYPE, JSON.stringify(await readOverview(resultsDir, await packs())));
  if (path === RUNS) return send(response, 200, JSON_TYPE, JSON.stringify(await listRuns(resultsDir)));
  if (path.startsWith(`${RUNS}/`)) {
    const [id = '', ...file] = path.slice(RUNS.length + 1).split('/');
    const found = runFilePath(resultsDir, id, file.join('/'));
    if (found !== undefined) return send(response, 200, JSON_TYPE, await readFile(found));
  }
  refuse(response, 404, `Nothing at ${path}.`);
}

/** Starts the viewer. It runs until it is closed or the process ends. */
export async function startViewer({ port, ...project }: ViewerOptions): Promise<Viewer> {
  if (!existsSync(join(PAGE_DIR, 'index.html'))) throw new ViewerNotBuiltError();
  const server = createServer((request, response) => {
    answer(request, response, project).catch((error: unknown) => refuse(response, 500, error instanceof Error ? error.message : String(error)));
  });
  await new Promise<void>((started, failed) => {
    server.once('error', (error: NodeJS.ErrnoException) => failed(error.code === 'EADDRINUSE' ? new ViewerPortInUseError(port) : error));
    server.listen(port, HOST, started);
  });
  return {
    url: `http://localhost:${(server.address() as AddressInfo).port}`,
    close: () => new Promise<void>((closed, failed) => server.close((error) => (error ? failed(error) : closed()))),
  };
}
