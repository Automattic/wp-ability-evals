// The entity types that ship with the package. A project adds its own in its config, not here.

import { posts } from './posts.ts';
import type { EntityType } from './types.ts';

export const BUILT_IN_ENTITY_TYPES: EntityType[] = [posts];
