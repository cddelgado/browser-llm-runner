import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  loadSkillPackages,
  removeSkillPackage,
  saveSkillPackage,
} from '../../src/state/skill-store.js';

function createFakeIndexedDb() {
  const stores = new Map();

  function ensureStore(name) {
    if (!stores.has(name)) {
      stores.set(name, new Map());
    }
    return stores.get(name);
  }

  function createRequest(executor) {
    const request = {
      onsuccess: null,
      onerror: null,
      result: undefined,
      error: null,
    };
    setTimeout(() => {
      try {
        request.result = executor();
        request.onsuccess?.();
      } catch (error) {
        request.error = error;
        request.onerror?.();
      }
    }, 0);
    return request;
  }

  function makeDb() {
    return {
      objectStoreNames: {
        contains(name) {
          return stores.has(name);
        },
      },
      createObjectStore(name) {
        ensureStore(name);
      },
      transaction(storeNames) {
        const names = Array.isArray(storeNames) ? storeNames : [storeNames];
        names.forEach((name) => ensureStore(name));
        return {
          error: null,
          onerror: null,
          onabort: null,
          objectStore(name) {
            const store = ensureStore(name);
            return {
              getAll() {
                return createRequest(() => [...store.values()]);
              },
              put(value) {
                store.set(value.id, value);
              },
              delete(key) {
                store.delete(key);
              },
            };
          },
        };
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
        request.onupgradeneeded?.();
        request.onsuccess?.();
      }, 0);

      return request;
    },
  };
}

describe('skill-store', () => {
  let originalIndexedDb;

  beforeEach(() => {
    originalIndexedDb = globalThis.indexedDB;
  });

  afterEach(() => {
    globalThis.indexedDB = originalIndexedDb;
  });

  test('returns empty/falsey results when indexedDB is unavailable', async () => {
    globalThis.indexedDB = undefined;

    await expect(loadSkillPackages()).resolves.toEqual([]);
    await expect(saveSkillPackage({ name: 'Lesson Planner' })).resolves.toBeNull();
    await expect(removeSkillPackage('skill-1')).resolves.toBe(false);
  });

  test('saves, loads, and removes skill packages in the dedicated store', async () => {
    globalThis.indexedDB = /** @type {any} */ (createFakeIndexedDb());

    const savedSkillPackage = await saveSkillPackage({
      packageName: 'lesson-planner.zip',
      name: 'Lesson Planner',
      lookupName: 'lesson planner',
      description: 'Plan lessons with objectives.',
      importedAt: 1710000000000,
      hasSkillMarkdown: true,
      isUsable: true,
      skillFilePath: 'lesson-planner/SKILL.md',
      skillMarkdown: '# Lesson Planner\n\nPlan lessons with objectives.',
      filePaths: ['lesson-planner/SKILL.md'],
    });

    expect(savedSkillPackage?.id).toBeTruthy();
    await expect(loadSkillPackages()).resolves.toEqual([
      expect.objectContaining({
        id: savedSkillPackage?.id,
        name: 'Lesson Planner',
        lookupName: 'lesson planner',
        isUsable: true,
      }),
    ]);

    await expect(removeSkillPackage(savedSkillPackage?.id)).resolves.toBe(true);
    await expect(loadSkillPackages()).resolves.toEqual([]);
  });
});
