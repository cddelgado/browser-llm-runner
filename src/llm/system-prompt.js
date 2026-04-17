function normalizePromptInstruction(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function buildOptionalFeaturePromptSection(instructions = []) {
  const normalizedInstructions = Array.isArray(instructions)
    ? instructions.map(normalizePromptInstruction).filter(Boolean)
    : [];
  if (!normalizedInstructions.length) {
    return '';
  }
  return [
    '**Assistant Behavior:**',
    '- When possible, do the work instead of explain how.',
    ...normalizedInstructions.map((instruction) => `- ${instruction}`),
  ].join('\n');
}

export function buildFactCheckingPrompt({ toolUseAvailable = false, webLookupEnabled = false } = {}) {
  if (!toolUseAvailable && !webLookupEnabled) {
    return '';
  }
  return 'Use the appropriate tool to confirm facts before responding.';
}

export function buildMathRenderingFeaturePrompt({ renderMathMl = false } = {}) {
  if (!renderMathMl) {
    return '';
  }
  return (
    'When writing mathematical notation in LaTeX, use $...$ for inline math and $$...$$ ' +
    'for display math. Include matching delimiters so expressions render correctly.'
  );
}

export function buildLanguagePreferencePrompt({ languageName = '' } = {}) {
  const normalizedLanguageName = normalizePromptInstruction(languageName);
  if (!normalizedLanguageName) {
    return '';
  }
  return `Write the final answer in ${normalizedLanguageName} unless the user explicitly asks for a different language.`;
}

export function buildThinkingModePrompt({
  enabled = true,
  enabledInstruction = '',
  disabledInstruction = '',
} = {}) {
  const normalizedEnabledInstruction = normalizePromptInstruction(enabledInstruction);
  const normalizedDisabledInstruction = normalizePromptInstruction(disabledInstruction);
  const switchInstruction = enabled
    ? normalizedEnabledInstruction
    : normalizedDisabledInstruction;
  if (!switchInstruction) {
    return '';
  }
  return enabled
    ? `${switchInstruction}\nThinking mode is enabled for this conversation.`
    : `${switchInstruction}\nThinking mode is disabled for this conversation.`;
}
