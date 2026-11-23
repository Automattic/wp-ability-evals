// What a story file and a scenario are. A pack's `scenarios/` folder holds one story file per story: the
// story in a person's words, then the scenarios made from it, which are data.
// A scenario names abilities and site changes, never MCP tools, so it holds however the agent reaches the site.

/** A story file as written: one story, the starting content its scenarios share, and its scenarios. */
export interface StoryFile {
  /** What a site owner wants, in plain words: what is on the site, what should happen and what must not. */
  story: string;
  /** The starting content of every scenario of the story. */
  given?: StartingContent;
  /** May be empty or left out: a story can wait for its scenarios. */
  scenarios?: Scenario[];
}

/** A story as a pack keeps it. */
export interface Story {
  /** The story file's name without `.yaml`: the middle part of its scenarios' ids. */
  file: string;
  /** The story, as written. */
  text: string;
  /** The starting content the story itself declares, without what a scenario adds. */
  given?: StartingContent;
  /** The ids of its scenarios, in the order of the file. Empty while the story waits for them. */
  scenarioIds: string[];
}

/**
 * - `read`: the site must stay as it is, and no ability that changes it may run without an error.
 * - `write`: the site must change as declared.
 * - `none`: no ability may run at all, not even with an error. Looking up what the site offers is allowed.
 */
export type ScenarioKind = 'read' | 'write' | 'none';

/**
 * What a failure of the scenario means.
 * - `implemented`: the task should work, so a failure is a regression.
 * - `known-defect`: a known bug makes it fail, so a failure is expected.
 * - `to-be-implemented`: the ability does not exist yet, so a failure is expected.
 */
export type ScenarioState = 'implemented' | 'known-defect' | 'to-be-implemented';

export interface Scenario {
  /** `<pack>/<file>/<slug>`: the pack's name, the story file's name without `.yaml`, then a slug. That makes it unique and says where the scenario is. */
  id: string;
  /** What the site owner asks, in their own words. It names no tool and no ability. */
  request: string;
  kind: ScenarioKind;
  /** Defaults to `implemented`. */
  state?: ScenarioState;
  /** Required unless the state is `implemented`: what goes wrong, and the issue that tracks it. */
  reason?: string;
  /**
   * The starting content. In a file, it is what this scenario adds to its story's `given`. Once loaded, it is
   * the two joined, so nothing that gets a scenario has to know its story.
   */
  given?: StartingContent;
  expect: Expectation;
}

/** What is on the site before the agent works: entity type, then the item's key, then its fields, as plain values. */
export type StartingContent = Record<string, Record<string, Record<string, unknown>>>;

/** What must be true after a trial. Each part is optional; a part that is left out is not checked. */
export interface Expectation {
  /** The change the agent should make. Anything else that changes on the site fails the trial. */
  site?: SiteExpectation;
  /**
   * Abilities a correct run executes. Each must have run at least once without an error. Other calls are
   * allowed, and neither the order of the calls nor their number is checked.
   */
  abilities?: ExpectedAbility[];
  /** Abilities that must not run at all, named as a pack lists them. A call that failed counts too. */
  forbidden?: string[];
  answer?: AnswerExpectation;
}

/**
 * An ability a correct run executes: its name, as a pack lists it, or that one name mapped to the arguments
 * it must have run with. With arguments, one call without an error must have had every one of them. The
 * call's other arguments are free.
 */
export type ExpectedAbility = string | Record<string, ExpectedArguments>;

/**
 * The arguments an ability must have run with, by name. Each has the value the argument must equal, or a
 * list, which means one of its values. So an argument whose own value is a list can't be expected, and
 * neither can one whose value is a mapping.
 */
export type ExpectedArguments = Record<string, ArgumentValue | ArgumentValue[]>;

/** A value an argument is compared with. A number matches its text, as in the site check. */
export type ArgumentValue = string | number | boolean;

/**
 * A change of a site with plain values, as a site is handed one to make: entity type, then the item's key,
 * then the fields it must end up with, or `removed`.
 */
export type SiteChange = Record<string, Record<string, Record<string, unknown> | 'removed'>>;

/**
 * The change a scenario expects, as `expect.site` holds it: entity type, then the item's key, then the
 * fields it must end up with, or `removed`. It is a `SiteChange` that may hold operators. An operator is a
 * key that starts with `$`, so that it can't be mistaken for a field, a plain value or a typo. There are two:
 * `$new` on an item and `$contains` as a field's value.
 */
export type SiteExpectation = Record<string, Record<string, ExpectedItem | 'removed'>>;

/**
 * The fields an item must end up with. Each is a plain value the field must equal, or a `Contains`. The
 * item's key in the file is its key on the site, unless the item is marked `$new`.
 */
export interface ExpectedItem {
  /**
   * Marks an item the agent should create, where the scenario can't know the key the site will give it, as
   * for a post that is saved as a draft. The item's key in the file is then a label the scenario chooses,
   * and the item is found by its fields: exactly one item that was created in the trial must fit them, and
   * that item stands for no other label. Only `true` is allowed. An item the agent creates under a key the
   * scenario knows is written under that key, without `$new`.
   */
  $new?: true;
  [field: string]: unknown;
}

/** A field compared by what it contains: its value, as text, must contain every text, in any letter case. */
export interface Contains {
  $contains: string[];
}

export interface AnswerExpectation {
  /** Text the answer must contain. */
  contains?: string[];
  /** What a good answer says, for the judge. Used only where code can't decide. It needs `reference` and `wrong` next to it. */
  rubric?: string;
  /** An answer that should pass, to prove the checks on the answer accept a correct one. `verify` uses it. */
  reference?: string;
  /** An answer that should fail the rubric, to prove the judges reject a wrong one. `verify` uses it. Only next to a rubric. */
  wrong?: string;
}
