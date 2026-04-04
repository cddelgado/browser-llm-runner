import { describe, expect, test } from 'vitest';
import {
  buildFactCheckingPrompt,
  buildLanguagePreferencePrompt,
  buildMathRenderingFeaturePrompt,
  buildOptionalFeaturePromptSection,
  buildThinkingModePrompt,
} from '../../src/llm/system-prompt.js';

describe('system prompt feature sections', () => {
  test('omits the fact-checking instruction when web lookup is disabled', () => {
    expect(buildFactCheckingPrompt()).toBe('');
  });

  test('omits the optional feature section when no feature prompts are enabled', () => {
    expect(buildOptionalFeaturePromptSection([])).toBe('');
    expect(buildOptionalFeaturePromptSection(['', '   '])).toBe('');
  });

  test('builds a dedicated optional feature section for math rendering', () => {
    const prompt = buildOptionalFeaturePromptSection([
      buildFactCheckingPrompt({ webLookupEnabled: true }),
      buildMathRenderingFeaturePrompt({ renderMathMl: true }),
    ]);

    expect(prompt).toContain('**Rules:**');
    expect(prompt).toContain('- Use web_lookup to confirm facts before responding.');
    expect(prompt).toContain('- Present mathematical notation in LaTeX');
    expect(
      prompt.indexOf('- Use web_lookup to confirm facts before responding.')
    ).toBeLessThan(prompt.indexOf('- Present mathematical notation in LaTeX'));
    expect(prompt).not.toContain('Math rendering is enabled.');
    expect(prompt).toContain('Present mathematical notation in LaTeX');
    expect(prompt).toContain('use $...$ for inline math');
    expect(prompt).toContain('$$...$$ for display math');
  });

  test('omits the math rendering instruction when math rendering is disabled', () => {
    expect(buildMathRenderingFeaturePrompt({ renderMathMl: false })).toBe('');
  });

  test('builds a language preference instruction when a language is selected', () => {
    expect(buildLanguagePreferencePrompt({ languageName: 'Spanish' })).toBe(
      'Write the final answer in Spanish unless the user explicitly asks for a different language.'
    );
    expect(buildLanguagePreferencePrompt({ languageName: '' })).toBe('');
  });

  test('builds a thinking mode switch prompt only when switch instructions exist', () => {
    expect(
      buildThinkingModePrompt({
        enabled: false,
        disabledInstruction: '/no_think',
      })
    ).toContain('/no_think');
    expect(
      buildThinkingModePrompt({
        enabled: true,
        enabledInstruction: '/think',
      })
    ).toContain('Thinking mode is enabled');
    expect(buildThinkingModePrompt({ enabled: true })).toBe('');
  });
});
