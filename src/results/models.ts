// What an agent ran on, told from what its trials reported. A run saves it and the Overview counts it across the
// latest verdicts, so that a change of model can't hide in the numbers.

import type { Transcript } from '../agents/types.ts';
import type { RanOn } from './types.ts';

/** Each program version and model in `versions` once, in the order they first appear. */
export function ranOn(versions: Transcript['versions'][]): RanOn[] {
  const seen = new Map<string, RanOn>();
  for (const { agent: program, model } of versions) if (!seen.has(`${program} ${model}`)) seen.set(`${program} ${model}`, { program, model });
  return [...seen.values()];
}
