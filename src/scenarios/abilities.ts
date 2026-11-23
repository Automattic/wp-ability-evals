// An entry of `expect.abilities`: an ability's name, or that name mapped to the arguments the ability must
// have run with. The rules of a story file, the cross-checks and the check on the abilities that ran all read
// an entry, so how its two forms are told apart is said once, here.

import type { ExpectedAbility, ExpectedArguments } from './types.ts';

/** The ability an entry names. */
export function abilityOf(entry: ExpectedAbility): string {
  return typeof entry === 'string' ? entry : (Object.keys(entry)[0] ?? '');
}

/** The arguments the ability must have run with. None for an entry that is a name alone. */
export function argumentsOf(entry: ExpectedAbility): ExpectedArguments {
  return typeof entry === 'string' ? {} : (Object.values(entry)[0] ?? {});
}
