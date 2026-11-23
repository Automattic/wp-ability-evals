// The text of what a tool returned. MCP servers answer with a list of content blocks, and every agent
// reports that list in its own way, so the adapters share the one way to read it.

import { isRecord } from '../files/shape.ts';

/** A tool result as text: text as it is, a list of content blocks as their texts, anything else as JSON. */
export function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return content === undefined || content === null ? '' : JSON.stringify(content);
  return content.map((block: unknown) => (isRecord(block) && typeof block.text === 'string' ? block.text : JSON.stringify(block))).join('\n');
}
