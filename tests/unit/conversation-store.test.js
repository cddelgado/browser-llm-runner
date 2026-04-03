import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { loadConversationState, saveConversationState } from '../../src/state/conversation-store.js';

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
              get(key) {
                return createRequest(() => store.get(key));
              },
              getAll() {
                return createRequest(() => [...store.values()]);
              },
              put(value) {
                store.set(value.key ?? value.id, value);
              },
              clear() {
                store.clear();
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
    seedLegacyState(state) {
      ensureStore('appState').set('conversations.v1', {
        key: 'conversations.v1',
        state,
      });
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

  test('saves and loads conversation state through normalized stores', async () => {
    globalThis.indexedDB = /** @type {any} */ (createFakeIndexedDb());

    const state = {
      activeConversationId: 'conv-1',
      conversationCount: 1,
      conversationIdCounter: 1,
      conversations: [
        {
          id: 'conv-1',
          name: 'Biology',
          modelId: 'model-1',
          systemPrompt: '',
          conversationSystemPrompt: '',
          appendConversationSystemPrompt: true,
          startedAt: 1710000000000,
          hasGeneratedName: true,
          currentWorkingDirectory: '/workspace/coursework',
          shellVariables: {
            COURSE: 'biology',
          },
          activeLeafMessageId: 'conv-1-node-1',
          lastSpokenLeafMessageId: 'conv-1-node-1',
          messageNodeCounter: 1,
          messageNodes: [
            {
              id: 'conv-1-node-1',
              role: 'user',
              speaker: 'User',
              text: 'Explain photosynthesis',
              createdAt: 1710000001000,
              parentId: null,
              childIds: [],
              content: {
                parts: [
                  { type: 'text', text: 'Explain photosynthesis' },
                  {
                    type: 'file',
                    artifactId: 'artifact-1',
                    mimeType: 'text/plain',
                    filename: 'notes.txt',
                    text: 'Plants make sugar from light.',
                    normalizedText: 'Plants make sugar from light.',
                    workspacePath: '/workspace/notes.txt',
                    llmText:
                      'Attached file: notes.txt\nMIME type: text/plain\nWorkspace path: /workspace/notes.txt\nThis file is available to inspect or modify with run_shell_command.\nContents:\nPlants make sugar from light.',
                  },
                ],
                llmRepresentation:
                  'Explain photosynthesis\nAttached file: notes.txt\nMIME type: text/plain\nWorkspace path: /workspace/notes.txt\nThis file is available to inspect or modify with run_shell_command.\nContents:\nPlants make sugar from light.',
              },
              artifactRefs: [
                {
                  id: 'artifact-1',
                  kind: 'text',
                  mimeType: 'text/plain',
                  filename: 'notes.txt',
                  workspacePath: '/workspace/notes.txt',
                },
              ],
            },
          ],
        },
      ],
      artifacts: [
        {
          id: 'artifact-1',
          conversationId: 'conv-1',
          messageId: 'conv-1-node-1',
          kind: 'text',
          mimeType: 'text/plain',
          encoding: 'utf-8',
          data: 'Plants make sugar from light.',
          filename: 'notes.txt',
        },
      ],
    };

    await expect(saveConversationState(state)).resolves.toBe(true);
    await expect(loadConversationState()).resolves.toMatchObject({
      activeConversationId: 'conv-1',
      conversationCount: 1,
      conversationIdCounter: 1,
      schemaVersion: 2,
      conversations: [
        expect.objectContaining({
          id: 'conv-1',
          name: 'Biology',
          modelId: 'model-1',
          currentWorkingDirectory: '/workspace/coursework',
          shellVariables: {
            COURSE: 'biology',
          },
          messageNodes: [
            expect.objectContaining({
              id: 'conv-1-node-1',
              role: 'user',
              text: 'Explain photosynthesis',
              content: {
                llmRepresentation: null,
                parts: [
                  { type: 'text', text: 'Explain photosynthesis' },
                  expect.objectContaining({
                    type: 'file',
                    artifactId: 'artifact-1',
                    filename: 'notes.txt',
                    normalizedText: 'Plants make sugar from light.',
                    workspacePath: '/workspace/notes.txt',
                    llmText:
                      'Attached file: notes.txt\nMIME type: text/plain\nWorkspace path: /workspace/notes.txt\nThis file is available to inspect or modify with run_shell_command.\nContents:\nPlants make sugar from light.',
                  }),
                ],
              },
            }),
          ],
        }),
      ],
      artifacts: [
        expect.objectContaining({
          id: 'artifact-1',
          kind: 'text',
          mimeType: 'text/plain',
          data: 'Plants make sugar from light.',
        }),
      ],
    });
  });

  test('persists shell tool-call arguments and terminal metadata through normalized stores', async () => {
    globalThis.indexedDB = /** @type {any} */ (createFakeIndexedDb());

    const state = {
      activeConversationId: 'conv-shell',
      conversationCount: 1,
      conversationIdCounter: 1,
      conversations: [
        {
          id: 'conv-shell',
          name: 'Shell session',
          modelId: 'model-1',
          startedAt: 1710000000000,
          activeLeafMessageId: 'conv-shell-node-3',
          lastSpokenLeafMessageId: 'conv-shell-node-3',
          messageNodeCounter: 3,
          messageNodes: [
            {
              id: 'conv-shell-node-1',
              role: 'user',
              speaker: 'User',
              text: 'List files',
              createdAt: 1710000001000,
              parentId: null,
              childIds: ['conv-shell-node-2'],
              content: {
                parts: [{ type: 'text', text: 'List files' }],
                llmRepresentation: 'List files',
              },
              artifactRefs: [],
            },
            {
              id: 'conv-shell-node-2',
              role: 'model',
              speaker: 'Model',
              text: '{"name":"run_shell_command","parameters":{"cmd":"ls"}}',
              response: '{"name":"run_shell_command","parameters":{"cmd":"ls"}}',
              createdAt: 1710000002000,
              parentId: 'conv-shell-node-1',
              childIds: ['conv-shell-node-3'],
              isResponseComplete: true,
              toolCalls: [
                {
                  name: 'run_shell_command',
                  arguments: { cmd: 'ls' },
                  rawText: '{"name":"run_shell_command","parameters":{"cmd":"ls"}}',
                  format: 'json',
                },
              ],
              content: {
                parts: [{ type: 'text', text: '{"name":"run_shell_command","parameters":{"cmd":"ls"}}' }],
                llmRepresentation: '{"name":"run_shell_command","parameters":{"cmd":"ls"}}',
              },
              artifactRefs: [],
            },
            {
              id: 'conv-shell-node-3',
              role: 'tool',
              speaker: 'Tool',
              text: '{"status":"success","body":"notes.txt"}',
              toolResult: '{"status":"success","body":"notes.txt"}',
              createdAt: 1710000003000,
              parentId: 'conv-shell-node-2',
              childIds: [],
              toolName: 'run_shell_command',
              toolArguments: { cmd: 'ls' },
              toolResultData: {
                shellFlavor: 'GNU/Linux-like shell subset',
                currentWorkingDirectory: '/workspace',
                command: 'ls',
                exitCode: 0,
                stdout: 'notes.txt',
                stderr: '',
              },
              isToolResultComplete: true,
              content: {
                parts: [{ type: 'text', text: '{"status":"success","body":"notes.txt"}' }],
                llmRepresentation: '{"status":"success","body":"notes.txt"}',
              },
              artifactRefs: [],
            },
          ],
        },
      ],
      artifacts: [],
    };

    await expect(saveConversationState(state)).resolves.toBe(true);
    await expect(loadConversationState()).resolves.toMatchObject({
      conversations: [
        expect.objectContaining({
          id: 'conv-shell',
          messageNodes: [
            expect.objectContaining({
              id: 'conv-shell-node-1',
            }),
            expect.objectContaining({
              id: 'conv-shell-node-2',
              toolCalls: [
                expect.objectContaining({
                  name: 'run_shell_command',
                  arguments: { cmd: 'ls' },
                  rawText: '{"name":"run_shell_command","parameters":{"cmd":"ls"}}',
                  format: 'json',
                }),
              ],
            }),
            expect.objectContaining({
              id: 'conv-shell-node-3',
              toolName: 'run_shell_command',
              toolArguments: { cmd: 'ls' },
              toolResultData: {
                shellFlavor: 'GNU/Linux-like shell subset',
                currentWorkingDirectory: '/workspace',
                command: 'ls',
                exitCode: 0,
                stdout: 'notes.txt',
                stderr: '',
              },
            }),
          ],
        }),
      ],
    });
  });

  test('loads legacy snapshot data and migrates it to normalized stores', async () => {
    const fakeIndexedDb = createFakeIndexedDb();
    fakeIndexedDb.seedLegacyState({
      conversations: [{ id: 'conv-1', name: 'Legacy', messageNodes: [] }],
      activeConversationId: 'conv-1',
      conversationCount: 1,
      conversationIdCounter: 1,
    });
    globalThis.indexedDB = /** @type {any} */ (fakeIndexedDb);

    await expect(loadConversationState()).resolves.toEqual({
      conversations: [{ id: 'conv-1', name: 'Legacy', messageNodes: [] }],
      activeConversationId: 'conv-1',
      conversationCount: 1,
      conversationIdCounter: 1,
    });

    await expect(loadConversationState()).resolves.toMatchObject({
      conversations: [
        expect.objectContaining({ id: 'conv-1', name: 'Legacy', messageNodes: [] }),
      ],
      activeConversationId: 'conv-1',
      conversationCount: 1,
      conversationIdCounter: 1,
      schemaVersion: 2,
    });
  });
});
