// Reads one data file of a project. Packs and scenarios are YAML so that they hold no code and can sit next
// to the abilities they cover, in a repository in any language. Site files are JSON, because a wp-env site's
// settings are wp-env's own configuration, which is JSON.

import { readFile } from 'node:fs/promises';
import { YAMLParseError, parse } from 'yaml';
import { InvalidProjectError } from '../errors.ts';

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function textOf(file: string): Promise<string> {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if (isMissingFile(error)) throw new InvalidProjectError([{ file, message: 'the file is missing' }]);
    throw error;
  }
}

/** The file's content as plain values. A file that is missing or is not YAML is a problem in the project. */
export async function readYamlFile(file: string): Promise<unknown> {
  const text = await textOf(file);
  try {
    return parse(text) as unknown;
  } catch (error) {
    if (!(error instanceof YAMLParseError)) throw error;
    // The first line says what is wrong and where; the rest is an excerpt of the file.
    const [summary = error.message] = error.message.split('\n');
    throw new InvalidProjectError([{ file, message: `not valid YAML: ${summary}` }]);
  }
}

/** The file's content as plain values. A file that is missing or is not JSON is a problem in the project. */
export async function readJsonFile(file: string): Promise<unknown> {
  const text = await textOf(file);
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new InvalidProjectError([{ file, message: `not valid JSON: ${error.message}` }]);
  }
}
