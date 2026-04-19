import { describe, expect, test } from 'vitest';

import {
  buildDefaultWllamaSettings,
  sanitizeWllamaSettings,
} from '../../src/config/wllama-settings.js';

describe('wllama-settings', () => {
  test('builds defaults against the current context limit', () => {
    expect(buildDefaultWllamaSettings({ maxContextTokens: 256 })).toEqual({
      usePromptCache: false,
      batchSize: 256,
      minP: 0,
    });
  });

  test('sanitizes and clamps prompt-cache settings', () => {
    expect(
      sanitizeWllamaSettings(
        {
          usePromptCache: false,
          batchSize: '777',
          minP: '0.13',
        },
        { maxContextTokens: 640 }
      )
    ).toEqual({
      usePromptCache: false,
      batchSize: 256,
      minP: 0.15,
    });
  });

  test('automatically disables prompt-cache reuse above the safe context budget', () => {
    expect(
      sanitizeWllamaSettings(
        {
          usePromptCache: true,
          batchSize: '512',
        },
        { maxContextTokens: 4096 }
      )
    ).toEqual({
      usePromptCache: false,
      batchSize: 256,
      minP: 0,
    });
  });
});
