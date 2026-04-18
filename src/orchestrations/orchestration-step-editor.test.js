import { describe, expect, it } from 'vitest';

import {
  buildOrchestrationStepFlow,
  buildOrchestrationStepForTypeChange,
  buildOrchestrationStepTemplate,
  parseOptionalJsonObjectText,
  validateOrchestrationDefinitionForEditor,
} from './orchestration-step-editor.js';

describe('buildOrchestrationStepTemplate', () => {
  it('creates prompt steps with prompt-friendly defaults', () => {
    expect(buildOrchestrationStepTemplate('prompt', 2)).toEqual({
      stepName: 'Step 2',
      prompt: '',
      outputKey: '',
      responseFormat: {
        type: 'plain_text',
        instructions: 'Return plain text only.',
      },
      outputProcessing: {
        stripThinking: true,
      },
    });
  });

  it('creates join steps with a default separator', () => {
    expect(buildOrchestrationStepTemplate('join', 3)).toEqual({
      type: 'join',
      stepName: 'Step 3',
      source: '',
      outputKey: '',
      separator: '\n\n',
    });
  });
});

describe('buildOrchestrationStepForTypeChange', () => {
  it('keeps shared fields when switching from prompt to forEach', () => {
    expect(
      buildOrchestrationStepForTypeChange(
        'forEach',
        {
          stepName: 'Review chunk',
          prompt: 'Review {{chunk.text}}',
          outputKey: 'chunkReview',
        },
        1
      )
    ).toEqual({
      type: 'forEach',
      stepName: 'Review chunk',
      input: '',
      itemName: 'item',
      outputKey: 'chunkReview',
      prompt: 'Review {{chunk.text}}',
      responseFormat: {
        type: 'plain_text',
        instructions: 'Return plain text only.',
      },
      outputProcessing: {
        stripThinking: true,
      },
    });
  });
});

describe('buildOrchestrationStepFlow', () => {
  it('describes named outputs and collection outputs for forEach steps', () => {
    expect(
      buildOrchestrationStepFlow(
        {
          type: 'forEach',
          outputKey: 'chunkMarkdown',
        },
        1
      )
    ).toEqual({
      producesCollection: true,
      latestOutputTokens: ['{{previousStepOutput}}', '{{lastStepOutput}}', '{{step2Output}}'],
      collectionTokens: ['{{previousStepOutputs}}', '{{lastStepOutputs}}', '{{step2Outputs}}'],
      namedOutputToken: '{{chunkMarkdown}}',
    });
  });
});

describe('parseOptionalJsonObjectText', () => {
  it('accepts blank JSON text as undefined', () => {
    expect(parseOptionalJsonObjectText('', 'Parameters')).toBeUndefined();
  });

  it('rejects non-object JSON values', () => {
    expect(() => parseOptionalJsonObjectText('[]', 'Parameters')).toThrow(
      'Parameters must be a JSON object.'
    );
  });
});

describe('validateOrchestrationDefinitionForEditor', () => {
  it('reports incomplete steps without throwing', () => {
    expect(
      validateOrchestrationDefinitionForEditor({
        steps: [{ stepName: 'Broken prompt step' }],
      })
    ).toEqual({
      valid: false,
      message: 'Invalid orchestration step at index 0.',
    });
  });
});
