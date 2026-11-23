// Small questions about a value read from a project's file, shared by everything that validates one.
// The files are written by agents and by people, so each format is checked by hand: that lets every rule
// answer with a message that says what to write instead.

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Text with something in it. */
export function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/** A list where every item is text. An empty list counts. */
export function isTextList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isText);
}

export function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return options.some((option) => option === value);
}

/** Lowercase letters, digits and hyphens: what a pack's name and each part of a scenario id are made of. */
export function isSlug(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9-]+$/.test(value);
}

/** A problem for every key the format does not have. A misspelled key would otherwise be dropped without a word. */
export function unknownKeyProblems(record: Record<string, unknown>, keys: readonly string[], where?: string): string[] {
  return Object.keys(record)
    .filter((key) => !keys.includes(key))
    .map((key) => `unknown key \`${key}\`${where ? ` in ${where}` : ''}; the keys are: ${keys.join(', ')}`);
}
