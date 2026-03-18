import { describe, expect, test, vi } from 'vitest';

globalThis.self = /** @type {any} */ ({
  postMessage: vi.fn(),
  onmessage: null,
});

const { getBackendAttemptOrder, resolvePrompt } = await import('../../src/workers/llm.worker.js');

describe('llm.worker resolvePrompt', () => {
  test('normalizes structured chat messages and drops empty entries', () => {
    const result = resolvePrompt([
      { role: 'system', content: 'Be concise.' },
      { role: 'user', content: 'Hello' },
      { role: 'model', content: 'Hi there' },
      { role: 'assistant', content: 'How can I help?' },
      { role: 'assistant', content: '   ' },
      { role: 'invalid', content: 'Unknown role becomes user' },
      null,
      123,
    ]);

    expect(result).toEqual([
      { role: 'system', content: 'Be concise.' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
      { role: 'assistant', content: 'How can I help?' },
      { role: 'user', content: 'Unknown role becomes user' },
    ]);
  });

  test('preserves multimodal content parts for future vision-capable prompts', () => {
    const result = resolvePrompt([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this image.' },
          { type: 'image', url: 'https://example.com/sample.png' },
          { type: 'text', text: 'Focus on the visible objects.' },
        ],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this image.' },
          { type: 'image', url: 'https://example.com/sample.png' },
          { type: 'text', text: 'Focus on the visible objects.' },
        ],
      },
    ]);
  });

  test('falls back to a single user message for flat prompts', () => {
    expect(resolvePrompt('Flat prompt')).toEqual([{ role: 'user', content: 'Flat prompt' }]);
  });

  test('restricts WebGPU-required models to the WebGPU backend', () => {
    expect(getBackendAttemptOrder('auto', { requiresWebGpu: true })).toEqual(['webgpu']);
    expect(getBackendAttemptOrder('webgpu', { requiresWebGpu: true })).toEqual(['webgpu']);
    expect(getBackendAttemptOrder('wasm', { requiresWebGpu: true })).toEqual([]);
    expect(getBackendAttemptOrder('cpu', { requiresWebGpu: true })).toEqual([]);
  });
});
