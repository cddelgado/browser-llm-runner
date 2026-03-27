import { describe, expect, test } from 'vitest';
import {
  buildMathRenderingFeaturePrompt,
  buildOptionalFeaturePromptSection,
} from '../../src/llm/system-prompt.js';

describe('system prompt feature sections', () => {
  test('omits the optional feature section when no feature prompts are enabled', () => {
    expect(buildOptionalFeaturePromptSection([])).toBe('');
    expect(buildOptionalFeaturePromptSection(['', '   '])).toBe('');
  });

  test('builds a dedicated optional feature section for math rendering', () => {
    const prompt = buildOptionalFeaturePromptSection([
      buildMathRenderingFeaturePrompt({ renderMathMl: true }),
    ]);

    expect(prompt).toContain('Optional feature flags:');
    expect(prompt).toContain('Present mathematical notation in LaTeX');
    expect(prompt).toContain('use $...$ for inline math');
    expect(prompt).toContain('$$...$$ for display math');
  });

  test('omits the math rendering instruction when math rendering is disabled', () => {
    expect(buildMathRenderingFeaturePrompt({ renderMathMl: false })).toBe('');
  });
});
