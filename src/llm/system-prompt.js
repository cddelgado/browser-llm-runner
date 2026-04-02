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
  return normalizedInstructions.join('\n');
}

export function buildMathRenderingFeaturePrompt({ renderMathMl = false } = {}) {
  if (!renderMathMl) {
    return '';
  }
  return (
    'Math rendering is enabled. Present mathematical notation in LaTeX, use $...$ for inline math and $$...$$ ' +
    'for display math, and include matching delimiters so expressions render correctly.'
  );
}
