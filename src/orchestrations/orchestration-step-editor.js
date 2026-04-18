import { validateOrchestrationDefinition } from '../llm/orchestration-runner.js';

export const ORCHESTRATION_STEP_TYPES = ['prompt', 'transform', 'forEach', 'join'];

export function normalizeOrchestrationStepType(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return ORCHESTRATION_STEP_TYPES.includes(normalized) ? normalized : 'prompt';
}

export function cloneOrchestrationDefinition(definition) {
  try {
    return JSON.parse(JSON.stringify(definition || {}));
  } catch {
    throw new Error('The orchestration definition must be valid JSON data.');
  }
}

export function parseOrchestrationDefinitionText(definitionText) {
  let parsed;
  try {
    parsed = JSON.parse(String(definitionText || ''));
  } catch {
    throw new Error('The orchestration definition must be valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('The orchestration definition must be a JSON object.');
  }
  return parsed;
}

export function formatOrchestrationEditorJson(value) {
  return JSON.stringify(value || {}, null, 2);
}

export function buildOrchestrationStepTemplate(stepType = 'prompt', stepNumber = 1) {
  const normalizedType = normalizeOrchestrationStepType(stepType);
  const stepName = `Step ${Math.max(1, Number.parseInt(String(stepNumber), 10) || 1)}`;

  if (normalizedType === 'transform') {
    return {
      type: 'transform',
      stepName,
      transform: 'chunkText',
      source: '',
      outputKey: '',
      parameters: {},
    };
  }

  if (normalizedType === 'forEach') {
    return {
      type: 'forEach',
      stepName,
      input: '',
      itemName: 'item',
      outputKey: '',
      prompt: '',
      responseFormat: {
        type: 'plain_text',
        instructions: 'Return plain text only.',
      },
      outputProcessing: {
        stripThinking: true,
      },
    };
  }

  if (normalizedType === 'join') {
    return {
      type: 'join',
      stepName,
      source: '',
      outputKey: '',
      separator: '\n\n',
    };
  }

  return {
    stepName,
    prompt: '',
    outputKey: '',
    responseFormat: {
      type: 'plain_text',
      instructions: 'Return plain text only.',
    },
    outputProcessing: {
      stripThinking: true,
    },
  };
}

export function buildOrchestrationStepForTypeChange(
  nextType,
  previousStep = {},
  stepNumber = 1
) {
  const normalizedType = normalizeOrchestrationStepType(nextType);
  const template = buildOrchestrationStepTemplate(normalizedType, stepNumber);
  const previousType = normalizeOrchestrationStepType(previousStep?.type);
  const nextStep = {
    ...template,
    stepName:
      typeof previousStep?.stepName === 'string' && previousStep.stepName.trim()
        ? previousStep.stepName.trim()
        : template.stepName,
  };

  if (typeof previousStep?.outputKey === 'string' && previousStep.outputKey.trim()) {
    nextStep.outputKey = previousStep.outputKey.trim();
  }

  if (
    (normalizedType === 'prompt' || normalizedType === 'forEach') &&
    (previousType === 'prompt' || previousType === 'forEach') &&
    typeof previousStep?.prompt === 'string'
  ) {
    nextStep.prompt = previousStep.prompt;
  }

  if (
    normalizedType === 'forEach' &&
    typeof previousStep?.itemName === 'string' &&
    previousStep.itemName.trim()
  ) {
    nextStep.itemName = previousStep.itemName.trim();
  }

  return nextStep;
}

export function validateOrchestrationDefinitionForEditor(definition) {
  try {
    validateOrchestrationDefinition(definition);
    return { valid: true, message: '' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      valid: false,
      message: message || 'The orchestration definition is incomplete.',
    };
  }
}

function stepLikelyProducesCollection(step = {}) {
  const stepType = normalizeOrchestrationStepType(step?.type);
  if (stepType === 'forEach') {
    return true;
  }
  if (stepType === 'transform') {
    return !step?.transform || String(step.transform).trim() === 'chunkText';
  }
  return false;
}

export function buildOrchestrationStepFlow(step = {}, stepIndex = 0) {
  const stepNumber = stepIndex + 1;
  const outputKey =
    typeof step?.outputKey === 'string' && step.outputKey.trim() ? step.outputKey.trim() : '';
  const producesCollection = stepLikelyProducesCollection(step);
  return {
    producesCollection,
    latestOutputTokens: [
      '{{previousStepOutput}}',
      '{{lastStepOutput}}',
      `{{step${stepNumber}Output}}`,
    ],
    collectionTokens: producesCollection
      ? ['{{previousStepOutputs}}', '{{lastStepOutputs}}', `{{step${stepNumber}Outputs}}`]
      : [],
    namedOutputToken: outputKey ? `{{${outputKey}}}` : '',
  };
}

export function parseOptionalJsonObjectText(value, fieldLabel) {
  const normalizedValue = typeof value === 'string' ? value.trim() : '';
  if (!normalizedValue) {
    return undefined;
  }
  let parsed;
  try {
    parsed = JSON.parse(normalizedValue);
  } catch {
    throw new Error(`${fieldLabel} must be valid JSON.`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${fieldLabel} must be a JSON object.`);
  }
  return parsed;
}

export function formatOptionalJsonObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length) {
    return '';
  }
  return JSON.stringify(value, null, 2);
}
