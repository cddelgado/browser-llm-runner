import { describe, expect, it } from 'vitest';

import {
  alignPreparedTextInputs,
  isUnalignedAccessGenerationError,
} from './llm.worker.js';

describe('alignPreparedTextInputs', () => {
  it('left-truncates prompt inputs to a 4-token boundary', () => {
    const preparedTextInputs = {
      modelInputs: {
        input_ids: [[1, 2, 3, 4, 5, 6, 7]],
        attention_mask: [[1, 1, 1, 1, 1, 1, 1]],
      },
      originalPromptTokens: 7,
      promptTokens: 7,
      truncated: false,
    };

    const aligned = alignPreparedTextInputs(preparedTextInputs);

    expect(aligned).not.toBe(preparedTextInputs);
    expect(aligned.promptTokens).toBe(4);
    expect(aligned.truncated).toBe(true);
    expect(aligned.alignmentAdjusted).toBe(true);
    expect(aligned.modelInputs.input_ids).toEqual([[4, 5, 6, 7]]);
    expect(aligned.modelInputs.attention_mask).toEqual([[1, 1, 1, 1]]);
  });

  it('leaves already aligned prompt inputs unchanged', () => {
    const preparedTextInputs = {
      modelInputs: {
        input_ids: [[1, 2, 3, 4]],
      },
      originalPromptTokens: 4,
      promptTokens: 4,
      truncated: false,
    };

    expect(alignPreparedTextInputs(preparedTextInputs)).toBe(preparedTextInputs);
  });
});

describe('isUnalignedAccessGenerationError', () => {
  it('matches the WebGPU unaligned-access failure text', () => {
    expect(
      isUnalignedAccessGenerationError(
        new Error('Generation failed: operation does not support unaligned accesses')
      )
    ).toBe(true);
  });

  it('ignores unrelated errors', () => {
    expect(isUnalignedAccessGenerationError(new Error('out of memory'))).toBe(false);
  });
});
