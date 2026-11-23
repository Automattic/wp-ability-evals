// `update` writes into a project that holds its owner's work, so it must replace the package's part and
// nothing else.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readlink, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ChangedInProjectError, GuideNotMarkedError } from '../src/errors.ts';
import { initProject } from '../src/init/init.ts';
import { updateProject } from '../src/init/update.ts';

const TEMPLATE_GUIDE = fileURLToPath(new URL('../template/AGENTS.md', import.meta.url));
const PACKAGE_SKILL = fileURLToPath(new URL('../skills/add-evals/SKILL.md', import.meta.url));
// Written out here, not imported: projects hold these two lines, so changing them would leave every
// existing project with a guide `update` no longer finds.
const BEGIN = '<!-- BEGIN wp-ability-evals guide';
const END = '<!-- END wp-ability-evals guide -->';

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

async function newProject(t: TestContext): Promise<{ dir: string; guide: string; skill: string; link: string; record: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'evals-update-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await initProject(dir);
  return { dir, guide: join(dir, 'AGENTS.md'), skill: join(dir, '.agents/skills/add-evals/SKILL.md'), link: join(dir, '.claude/skills/add-evals'), record: join(dir, '.agents/wp-ability-evals.json') };
}

test("update replaces an older skill and guide with the package's, and keeps the project's own rules", async (t) => {
  const project = await newProject(t);
  // The project as an older version of the package left it, with rules of its own around the guide.
  const ownAbove = '# Our evals\n\nNever start a run on a Friday.\n\n';
  const ownBelow = '\n## Our sites\n\nThe shop runs on port 8899.\n';
  const olderGuide = `${BEGIN}. An older note. -->\n\n## Commands\n\n- An older command.\n\n${END}`;
  await writeFile(project.guide, `${ownAbove}${olderGuide}\n${ownBelow}`);
  await writeFile(project.skill, 'An older skill.');
  // The record of that older version, written out here because projects hold this file too.
  await writeFile(project.record, JSON.stringify({ copied: { '.agents/skills/add-evals/SKILL.md': sha256('An older skill.'), 'AGENTS.md': sha256(olderGuide) } }));
  await rm(project.link);
  // A project made before the guide had files of its own lacks them all; one stands for the rest here.
  await rm(join(project.dir, '.agents/guide/hooks.md'));

  const result = await updateProject(project.dir);

  assert.deepEqual(result, { added: ['.agents/guide/hooks.md', '.claude/skills/add-evals'], updated: ['.agents/skills/add-evals/SKILL.md', '.agents/wp-ability-evals.json', 'AGENTS.md'] });
  const template = await readFile(TEMPLATE_GUIDE, 'utf8');
  const packageGuide = template.slice(template.indexOf(BEGIN), template.indexOf(END) + END.length);
  assert.equal(await readFile(project.guide, 'utf8'), `${ownAbove}${packageGuide}\n${ownBelow}`);
  assert.equal(await readFile(project.skill, 'utf8'), await readFile(PACKAGE_SKILL, 'utf8'));
  assert.equal(await readlink(project.link), '../../.agents/skills/add-evals');
  // Nothing is left to take, which is also what stops `validate` from saying the project is behind.
  assert.deepEqual(await updateProject(project.dir), { added: [], updated: [] });
});

test("update writes nothing when the guide file does not mark the package's guide", async (t) => {
  const project = await newProject(t);
  await writeFile(project.guide, 'Our own guide, from before the package marked its part.');
  await writeFile(project.skill, 'An older skill.');

  await assert.rejects(updateProject(project.dir), GuideNotMarkedError);

  assert.equal(await readFile(project.guide, 'utf8'), 'Our own guide, from before the package marked its part.');
  assert.equal(await readFile(project.skill, 'utf8'), 'An older skill.');
});

test('update replaces what was changed in the project only when it is told to', async (t) => {
  const project = await newProject(t);
  const packageGuide = await readFile(project.guide, 'utf8');
  const packageSkill = await readFile(project.skill, 'utf8');
  const changedGuide = packageGuide.replace('## Commands', '## Commands\n\n- Ask in our channel before a run.');
  await writeFile(project.guide, changedGuide);
  await writeFile(project.skill, `${packageSkill}\nName the issue in every story.\n`);

  await assert.rejects(updateProject(project.dir), (error: unknown) => {
    assert.ok(error instanceof ChangedInProjectError);
    assert.deepEqual(error.changed, ['.agents/skills/add-evals/SKILL.md', 'AGENTS.md']);
    return true;
  });
  assert.equal(await readFile(project.guide, 'utf8'), changedGuide);
  assert.equal(await readFile(project.skill, 'utf8'), `${packageSkill}\nName the issue in every story.\n`);

  const result = await updateProject(project.dir, { overwrite: true });

  assert.deepEqual(result, { added: [], updated: ['.agents/skills/add-evals/SKILL.md', 'AGENTS.md'] });
  assert.equal(await readFile(project.guide, 'utf8'), packageGuide);
  assert.equal(await readFile(project.skill, 'utf8'), packageSkill);
});
