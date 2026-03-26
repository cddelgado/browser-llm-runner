import { beforeAll, describe, expect, test } from 'vitest';

let resolvePrompt;

beforeAll(async () => {
  globalThis.self = {
    postMessage: () => {},
    onmessage: null,
  };
  ({ resolvePrompt } = await import('../../src/workers/llm.worker.js'));
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
});
