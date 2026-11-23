// What a judge is: a model that grades an answer against a rubric, used only where code can't decide.
// An agent names its judge in the settings. It should be of another model family than the agent, because a
// judge tends to pass answers of its own family more easily.

import type { SignIn } from '../programs/sign-in.ts';

/** How a built-in judge is set up, in the config. */
export interface JudgeSettings {
  model: string;
  signIn: SignIn;
}

export interface JudgeInput {
  /** What the site owner asked. */
  request: string;
  /** What the agent answered. */
  answer: string;
  /** What a correct answer says. */
  rubric: string;
}

export interface JudgeVerdict {
  pass: boolean;
  /** What in the answer decided it, in one sentence. */
  reason: string;
}

/**
 * The whole contract of a judge. A project adds its own by writing a function that returns one of these and
 * naming it under `judges` in its config; the built-in judges are made the same way.
 */
export interface Judge {
  /** The family of the model it runs, such as `claude` or `gpt`. */
  family: string;
  /** The model it runs, which a run saves next to the agents' models. A judge of a project's own may leave it out. */
  model?: string;
  /** Throws when it can't give a verdict, which makes the trial an error and never a failure. */
  grade(input: JudgeInput): Promise<JudgeVerdict>;
}

/** A judge with the name it has in the config, which the results record. */
export interface NamedJudge {
  name: string;
  judge: Judge;
}
