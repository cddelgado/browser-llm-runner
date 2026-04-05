import { describe, expect, test, vi } from 'vitest';
import {
  buildCorsProxyRequestUrl,
  createCorsAwareFetch,
  normalizeCorsProxyUrl,
  validateCorsProxyUrl,
} from '../../src/llm/browser-fetch.js';

const APP_LOCATION = {
  href: 'https://app.example/chat',
  origin: 'https://app.example',
};

describe('browser fetch helper', () => {
  test('normalizes path-prefix proxy URLs with a trailing slash and preserves query prefixes', () => {
    expect(normalizeCorsProxyUrl('https://proxy.example')).toBe('https://proxy.example/');
    expect(buildCorsProxyRequestUrl('https://proxy.example', 'https://api.example/data')).toBe(
      'https://proxy.example/https://api.example/data'
    );
    expect(normalizeCorsProxyUrl('https://proxy.example/proxy?url=')).toBe(
      'https://proxy.example/proxy?url='
    );
    expect(
      buildCorsProxyRequestUrl('https://proxy.example/proxy?url=', 'https://api.example/data')
    ).toBe('https://proxy.example/proxy?url=https://api.example/data');
  });

  test('rejects proxy URLs that do not match the supported prefix format', async () => {
    await expect(validateCorsProxyUrl('http://proxy.example')).rejects.toThrow(
      'Use an https CORS proxy URL, or http on localhost.'
    );
    await expect(validateCorsProxyUrl('https://proxy.example/#fragment')).rejects.toThrow(
      'CORS proxy URLs cannot include fragments.'
    );
  });

  test('validates a proxy by fetching the example.com probe page through it', async () => {
    const fetchRef = vi.fn(async (url, init = {}) => {
      expect(url).toBe('https://proxy.example/https://example.com/');
      expect(init.method).toBe('GET');
      return new globalThis.Response('<title>Example Domain</title><h1>Example Domain</h1>', {
        status: 200,
        headers: {
          'content-type': 'text/html',
        },
      });
    });

    await expect(
      validateCorsProxyUrl('https://proxy.example', {
        fetchRef,
      })
    ).resolves.toBe('https://proxy.example/');
    expect(fetchRef).toHaveBeenCalledTimes(1);
  });

  test('retries through the configured proxy only after a likely CORS block', async () => {
    const fetchRef = vi
      .fn()
      .mockImplementationOnce(async () => {
        throw new TypeError('Failed to fetch');
      })
      .mockImplementationOnce(async (url, init = {}) => {
        expect(url).toBe('https://api.example/data');
        expect(init.mode).toBe('no-cors');
        return new globalThis.Response('', { status: 200 });
      })
      .mockImplementationOnce(async (request) => {
        expect(request).toBeInstanceOf(globalThis.Request);
        expect(request.url).toBe('https://proxy.example/https://api.example/data');
        expect(request.method).toBe('POST');
        expect(request.headers.get('content-type')).toBe('application/json');
        expect(await request.text()).toBe('{"topic":"planets"}');
        return new globalThis.Response('proxied', { status: 200 });
      });

    const wrappedFetch = createCorsAwareFetch({
      fetchRef,
      getProxyUrl: () => 'https://proxy.example/',
      locationRef: APP_LOCATION,
    });

    const response = await wrappedFetch('https://api.example/data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: '{"topic":"planets"}',
    });

    expect(await response.text()).toBe('proxied');
    expect(fetchRef).toHaveBeenCalledTimes(3);
  });

  test('does not proxy when the direct failure is not plausibly caused by CORS', async () => {
    const fetchRef = vi.fn(async () => {
      throw Object.assign(new Error('The operation was aborted.'), {
        name: 'AbortError',
      });
    });

    const wrappedFetch = createCorsAwareFetch({
      fetchRef,
      getProxyUrl: () => 'https://proxy.example/',
      locationRef: APP_LOCATION,
    });

    await expect(wrappedFetch('https://api.example/data')).rejects.toThrow(
      'The operation was aborted.'
    );
    expect(fetchRef).toHaveBeenCalledTimes(1);
  });

  test('does not proxy requests carrying authorization headers', async () => {
    const fetchRef = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });

    const wrappedFetch = createCorsAwareFetch({
      fetchRef,
      getProxyUrl: () => 'https://proxy.example/',
      locationRef: APP_LOCATION,
    });

    await expect(
      wrappedFetch('https://api.example/data', {
        headers: {
          Authorization: 'Bearer secret',
        },
      })
    ).rejects.toThrow('Failed to fetch');
    expect(fetchRef).toHaveBeenCalledTimes(1);
  });
});
