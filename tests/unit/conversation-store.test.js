import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { loadConversationState, saveConversationState } from '../../src/state/conversation-store.js';

function createFakeIndexedDb() {
  let hasStore = false;
  const records = new Map();

  function makeDb() {
    return {
      objectStoreNames: {
        contains(name) {
          return hasStore && name === 'appState';
        },
      },
      createObjectStore(name) {
        if (name === 'appState') {
          hasStore = true;
        }
      },
      transaction() {
        const tx = {
          oncomplete: null,
          onerror: null,
          onabort: null,
          objectStore() {
            return {
              get(key) {
                const request = {
                  onsuccess: null,
                  onerror: null,
                  result: undefined,
                };
                setTimeout(() => {
                  request.result = records.get(key);
                  request.onsuccess?.();
                  tx.oncomplete?.();
                }, 0);
                return request;
              },
              put(value) {
                records.set(value.key, value);
                setTimeout(() => {
                  tx.oncomplete?.();
                }, 0);
              },
            };
          },
        };
        return tx;
      },
      close() {},
    };
  }

  return {
    open() {
      const request = {
        result: null,
        error: null,
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
      };

      setTimeout(() => {
        const db = makeDb();
        request.result = db;
        if (!hasStore) {
          request.onupgradeneeded?.();
        }
        request.onsuccess?.();
      }, 0);

      return request;
    },
  };
}

describe('conversation-store', () => {
  let originalIndexedDb;

  beforeEach(() => {
    originalIndexedDb = globalThis.indexedDB;
  });

  afterEach(() => {
    globalThis.indexedDB = originalIndexedDb;
  });

  test('returns null/false when indexedDB is unavailable', async () => {
    globalThis.indexedDB = undefined;

    await expect(loadConversationState()).resolves.toBeNull();
    await expect(saveConversationState({ conversations: [] })).resolves.toBe(false);
  });

  test('saves and loads conversation state', async () => {
    globalThis.indexedDB = /** @type {any} */ (createFakeIndexedDb());

    const state = {
      conversations: [{ id: 'conv-1', messages: [] }],
      activeConversationId: 'conv-1',
    };

    await expect(saveConversationState(state)).resolves.toBe(true);
    await expect(loadConversationState()).resolves.toEqual(state);
  });
});
