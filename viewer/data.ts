// Where the page gets its data, and the addresses of its own screens. The data is the JSON the viewer's
// server reads from the results folder. A screen's address is in the part after `#`, so the browser's back
// button and a copied link both work without the server knowing about screens.

import { useEffect, useState } from 'react';

export type Loaded<T> = { state: 'loading' } | { state: 'failed'; message: string } | { state: 'ready'; data: T };

/** The JSON at `url`, loaded again whenever `url` changes. */
export function useJson<T>(url: string): Loaded<T> {
  const [loaded, setLoaded] = useState<Loaded<T>>({ state: 'loading' });
  useEffect(() => {
    let current = true;
    setLoaded({ state: 'loading' });
    fetch(url)
      .then(async (response) => {
        if (!response.ok) throw new Error(`The viewer answered ${response.status} for ${url}.`);
        return (await response.json()) as T;
      })
      .then((data) => current && setLoaded({ state: 'ready', data }))
      .catch((error: unknown) => current && setLoaded({ state: 'failed', message: error instanceof Error ? error.message : String(error) }));
    return () => {
      current = false;
    };
  }, [url]);
  return loaded;
}

/** Lazily loads optional JSON at `url` when defined; stays `undefined` without fetching when absent (avoiding 404s on older runs). */
export function useOptionalJson<T>(url: string | undefined): T | undefined {
  const [data, setData] = useState<T>();
  useEffect(() => {
    if (url === undefined) {
      setData(undefined);
      return;
    }
    let current = true;
    fetch(url)
      .then(async (response) => (response.ok ? ((await response.json()) as T) : undefined))
      .then((value) => {
        if (current) setData(value);
      })
      .catch(() => {
        if (current) setData(undefined);
      });
    return () => {
      current = false;
    };
  }, [url]);
  return data;
}

const STATIC = (globalThis as { __WP_ABILITY_EVALS_STATIC__?: boolean }).__WP_ABILITY_EVALS_STATIC__ === true;

export const OVERVIEW_URL = STATIC ? './data/overview.json' : '/api/overview';
export const RUNS_URL = STATIC ? './data/runs.json' : '/api/runs';
const RUNS_BASE = STATIC ? './data/runs' : '/api/runs';

export function runUrl(id: string): string {
  return `${RUNS_BASE}/${encodeURIComponent(id)}/run.json`;
}

export function serverUrl(id: string): string {
  return `${RUNS_BASE}/${encodeURIComponent(id)}/server.json`;
}

/** `file` is a trial's file as `run.json` names it. */
export function trialUrl(id: string, file: string): string {
  return `${RUNS_BASE}/${encodeURIComponent(id)}/${encodeURI(file)}`;
}

export type PrimarySection = 'overview' | 'stories' | 'abilities' | 'inspector' | 'runs';

export type Screen =
  | { name: 'overview' }
  | { name: 'stories'; pack?: string }
  | { name: 'abilities'; pack?: string }
  | { name: 'inspector' }
  | { name: 'runs' }
  | { name: 'run'; id: string }
  | { name: 'trial'; id: string; file: string };

export const OVERVIEW_HREF = '#/';
export const STORIES_HREF = '#/stories';
export const ABILITIES_HREF = '#/abilities';
export const INSPECTOR_HREF = '#/inspector';
export const RUNS_HREF = '#/runs';

export function packStoriesHref(pack: string): string {
  return `#/stories/${encodeURIComponent(pack)}`;
}

export function packAbilitiesHref(pack: string): string {
  return `#/abilities/${encodeURIComponent(pack)}`;
}

export function runHref(id: string): string {
  return `#/runs/${encodeURIComponent(id)}`;
}

export function trialHref(id: string, file: string): string {
  return `${runHref(id)}/${encodeURI(file)}`;
}

/** The screen an address names. An address that names none is the Overview. */
export function screenOf(hash: string): Screen {
  const [, section, first, ...rest] = decodeURI(hash.replace(/^#/, '')).split('/');
  if (section === 'stories') return first ? { name: 'stories', pack: first } : { name: 'stories' };
  if (section === 'abilities') return first ? { name: 'abilities', pack: first } : { name: 'abilities' };
  if (section === 'inspector') return { name: 'inspector' };
  if (section !== 'runs') return { name: 'overview' };
  if (first === undefined || first === '') return { name: 'runs' };
  return rest.length === 0 ? { name: 'run', id: first } : { name: 'trial', id: first, file: rest.join('/') };
}
