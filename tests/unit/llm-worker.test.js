import { beforeAll, describe, expect, test } from 'vitest';

let resolvePrompt;
let buildMultimodalChatTemplateOptions;
let buildGenerationOptions;
let shouldSkipSpecialTokensInMultimodalOutput;
let buildMultimodalDecodeOptions;

beforeAll(async () => {
  globalThis.self = /** @type {any} */ ({
    postMessage: () => {},
    onmessage: null,
  });
  ({
    resolvePrompt,
    buildMultimodalChatTemplateOptions,
    buildGenerationOptions,
    shouldSkipSpecialTokensInMultimodalOutput,
    buildMultimodalDecodeOptions,
  } = await import(
    '../../src/workers/llm.worker.js'
  ));
});

describe('llm.worker resolvePrompt', () => {
  test('preserves tool roles in structured prompts', () => {
    expect(
      resolvePrompt([
        { role: 'system', content: 'Use tools when needed.' },
        { role: 'user', content: 'What time is it?' },
        { role: 'assistant', content: '{"name":"get_current_date_time","parameters":{}}' },
        { role: 'tool', content: '{"iso":"2026-03-26T06:00:00.000Z"}' },
      ])
    ).toEqual([
      { role: 'system', content: 'Use tools when needed.' },
      { role: 'user', content: 'What time is it?' },
      { role: 'assistant', content: '{"name":"get_current_date_time","parameters":{}}' },
      { role: 'tool', content: '{"iso":"2026-03-26T06:00:00.000Z"}' },
    ]);
  });

  test('preserves structured audio parts in multimodal prompts', () => {
    expect(
      resolvePrompt([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Transcribe this.' },
            {
              type: 'audio',
              mimeType: 'audio/mpeg',
              samplesBase64: 'abcd',
              sampleRate: 16000,
              sampleCount: 4,
            },
          ],
        },
      ])
    ).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Transcribe this.' },
          {
            type: 'audio',
            mimeType: 'audio/mpeg',
            samplesBase64: 'abcd',
            sampleRate: 16000,
            sampleCount: 4,
          },
        ],
      },
    ]);
  });
});

describe('llm.worker multimodal chat template options', () => {
  test('forwards the thinking flag when runtime thinking is enabled', () => {
    expect(buildMultimodalChatTemplateOptions({ enableThinking: true })).toEqual({
      add_generation_prompt: true,
      enable_thinking: true,
    });
  });

  test('omits the thinking flag when runtime thinking is disabled', () => {
    expect(buildMultimodalChatTemplateOptions({ enableThinking: false })).toEqual({
      add_generation_prompt: true,
    });
  });

  test('preserves special tokens in multimodal output when thinking is enabled', () => {
    expect(shouldSkipSpecialTokensInMultimodalOutput({ enableThinking: true })).toBe(false);
    expect(buildMultimodalDecodeOptions({ enableThinking: true })).toEqual({
      skip_special_tokens: false,
    });
  });

  test('skips special tokens in multimodal output when thinking is disabled', () => {
    expect(shouldSkipSpecialTokensInMultimodalOutput({ enableThinking: false })).toBe(true);
    expect(buildMultimodalDecodeOptions({ enableThinking: false })).toEqual({
      skip_special_tokens: true,
    });
  });
});

describe('llm.worker generation options', () => {
  test('maps runtime-supported sampling fields to Transformers.js generate options', () => {
    expect(
      buildGenerationOptions(
        {
          maxOutputTokens: 512,
          maxContextTokens: 4096,
          temperature: 0.6,
          topK: 20,
          topP: 0.95,
          repetitionPenalty: 1.05,
        },
        { enableThinking: true }
      )
    ).toEqual({
      max_new_tokens: 512,
      max_length: 4096,
      temperature: 0.6,
      top_k: 20,
      top_p: 0.95,
      repetition_penalty: 1.05,
      do_sample: true,
      enable_thinking: true,
    });
  });
});
