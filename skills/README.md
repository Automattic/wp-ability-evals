# Skills

Skills that teach an agent how to work with the evals. `init` copies every folder here that holds a `SKILL.md` into a project's `.agents/skills/`, where Codex and most other agents look, and links each one from `.claude/skills/`, the only place Claude Code looks. A project's copy stays the package's: after installing a newer version of the package, `update` replaces it with the newer skills, and `validate` says when it differs. Where someone changed a copy in the project, `update` names it and writes nothing until it is told to replace it.

| Skill | What it does |
| --- | --- |
| `add-evals` | Drives adding evals: the story with the person, the scenarios made from it, `validate` and `verify`, a run when the person asks for one, and reading its result. It stops for the person after the story, after the scenarios and before anything that spends their plan. |

## What goes in a skill

- **The order of the work and the judgment in it.** The commands are in a project's `AGENTS.md` (`template/AGENTS.md` here), which an agent has in every session, and the formats and what the output means in its `.agents/guide/` (`guide/` here), one file per topic. A skill names the file to read and repeats none of it, so each rule has one place.
- **Only what an agent gets wrong without it.** A skill is revised from what agents were seen to do with it and without it, on a real story in a real project.
- **Nothing a project owns, and a place for what it does.** A project's own rules for a skill's work go in `.agents/rules/<the skill's name>.md` in the project. Every skill here names that file near its top and tells the agent to read it first, with the project's rule winning where the two differ. So a project never has a reason to change its copy of a skill. Rules for all work in a project go in its `AGENTS.md`, outside the guide.

A skill is for the people and agents who write evals. An agent under test never gets one, unless a scenario adds it on purpose.

`add-evals` was written from the design of the story format and from the skill of the first harness, before it was tried on a fresh agent. Its first trial is the evals project for `WordPress/abilities`.

## Not written yet

- adding a pack
- adding an entity type, a hook or an agent
