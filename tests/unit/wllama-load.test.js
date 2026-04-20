import { describe, expect, test } from 'vitest';

import {
  expandWllamaModelUrls,
  normalizeWllamaThreadCount,
  shouldRetryWllamaModelLoad,
} from '../../src/llm/wllama-load.js';

describe('wllama-load', () => {
  test('retries when the load error reports an invalid GGUF magic number', () => {
    expect(shouldRetryWllamaModelLoad(new Error('Invalid magic number'))).toBe(true);
    expect(shouldRetryWllamaModelLoad('gguf_init_from_file: invalid magic number')).toBe(true);
    expect(shouldRetryWllamaModelLoad('Downloaded model file is not a GGUF. Header=466f756e64')).toBe(
      true
    );
  });

  test('does not retry unrelated load errors', () => {
    expect(shouldRetryWllamaModelLoad(new Error('Model is not initialized.'))).toBe(false);
    expect(shouldRetryWllamaModelLoad('Network failed')).toBe(false);
  });

  test('expands split gguf urls into every shard url', () => {
    expect(
      expandWllamaModelUrls(
        'https://example.com/model-00001-of-00003.gguf?download=1'
      )
    ).toEqual([
      'https://example.com/model-00001-of-00003.gguf?download=1',
      'https://example.com/model-00002-of-00003.gguf?download=1',
      'https://example.com/model-00003-of-00003.gguf?download=1',
    ]);
  });

  test('keeps single-file gguf urls unchanged', () => {
    expect(expandWllamaModelUrls('https://example.com/model.gguf')).toEqual([
      'https://example.com/model.gguf',
    ]);
  });

  test('treats zero or invalid wllama thread counts as auto mode', () => {
    expect(normalizeWllamaThreadCount(0)).toBeNull();
    expect(normalizeWllamaThreadCount('0')).toBeNull();
    expect(normalizeWllamaThreadCount(-2)).toBeNull();
    expect(normalizeWllamaThreadCount('abc')).toBeNull();
  });

  test('keeps explicit positive wllama thread counts', () => {
    expect(normalizeWllamaThreadCount(1)).toBe(1);
    expect(normalizeWllamaThreadCount('4')).toBe(4);
    expect(normalizeWllamaThreadCount(3.8)).toBe(3);
  });
});
