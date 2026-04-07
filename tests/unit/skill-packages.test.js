import { describe, expect, test } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import {
  findUsableSkillPackageByName,
  parseSkillArchiveBytes,
} from '../../src/skills/skill-packages.js';

function buildZip(entries) {
  return zipSync(
    Object.fromEntries(
      Object.entries(entries).map(([path, text]) => [path, strToU8(String(text ?? ''))])
    ),
    { level: 0 }
  );
}

describe('skill-packages', () => {
  test('parses a single SKILL.md zip into a usable skill package', () => {
    const skillPackage = parseSkillArchiveBytes(
      buildZip({
        'lesson-planner/SKILL.md': '# Lesson Planner\n\nPlan lessons with objectives and checks.',
      }),
      { packageName: 'lesson-planner.zip' }
    );

    expect(skillPackage).toMatchObject({
      packageName: 'lesson-planner.zip',
      name: 'Lesson Planner',
      lookupName: 'lesson planner',
      description: 'Plan lessons with objectives and checks.',
      hasSkillMarkdown: true,
      isUsable: true,
      skillFilePath: 'lesson-planner/SKILL.md',
      filePaths: ['lesson-planner/SKILL.md'],
    });
  });

  test('marks packages with extra files as not exposed to the model', () => {
    const skillPackage = parseSkillArchiveBytes(
      buildZip({
        'lesson-planner/SKILL.md': '# Lesson Planner\n\nPlan lessons with objectives.',
        'lesson-planner/README.md': 'extra file',
      }),
      { packageName: 'lesson-planner.zip' }
    );

    expect(skillPackage.hasSkillMarkdown).toBe(true);
    expect(skillPackage.isUsable).toBe(false);
    expect(skillPackage.issue).toBe(
      'Only packages containing a single SKILL.md file are exposed to the model.'
    );
  });

  test('finds a usable skill by name case-insensitively', () => {
    const skillPackage = parseSkillArchiveBytes(
      buildZip({
        'lesson-planner/SKILL.md': '# Lesson Planner\n\nPlan lessons with objectives.',
      }),
      { packageName: 'lesson-planner.zip' }
    );

    expect(findUsableSkillPackageByName([skillPackage], 'lesson planner')).toMatchObject({
      name: 'Lesson Planner',
      lookupName: 'lesson planner',
    });
  });
});
