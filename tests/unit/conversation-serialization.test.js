import { describe, expect, test } from 'vitest';
import {
  addMessageToConversation,
  createConversation,
} from '../../src/state/conversation-model.js';
import {
  applyStoredConversationState,
  buildConversationStateSnapshot,
} from '../../src/state/conversation-serialization.js';
import { createAppState } from '../../src/state/app-state.js';

describe('conversation-serialization', () => {
  test('builds a snapshot with normalized model ids and aggregated artifacts', () => {
    const appState = createAppState();
    const conversation = createConversation({
      id: 'conversation-1',
      name: 'Images',
      modelId: 'onnx-community/Qwen3.5-2B-ONNX',
      startedAt: 1710000000000,
      taskList: [
        { text: 'Inspect attachment', status: 0 },
      ],
    });
    const userMessage = addMessageToConversation(conversation, 'user', 'Describe this image', {
      createdAt: 1710000001000,
      contentParts: [
        { type: 'text', text: 'Describe this image' },
        {
          type: 'image',
          artifactId: 'artifact-1',
          mimeType: 'image/png',
          base64: 'abc123',
          filename: 'cat.png',
        },
      ],
      artifactRefs: [
        {
          id: 'artifact-1',
          kind: 'binary',
          mimeType: 'image/png',
          filename: 'cat.png',
          hash: { algorithm: 'sha256', value: 'deadbeef' },
        },
      ],
    });
    addMessageToConversation(conversation, 'model', 'A cat.', {
      parentId: userMessage.id,
      createdAt: 1710000002000,
    }).isResponseComplete = true;
    appState.conversations.push(conversation);
    appState.conversationCount = 1;
    appState.conversationIdCounter = 1;
    appState.activeConversationId = conversation.id;

    const snapshot = buildConversationStateSnapshot(appState, {
      getMessageArtifacts(message, conversationId) {
        if (message.id !== userMessage.id) {
          return [];
        }
        return [
          {
            id: 'artifact-1',
            conversationId,
            messageId: message.id,
            kind: 'binary',
            mimeType: 'image/png',
            encoding: 'base64',
            data: 'abc123',
            hash: { algorithm: 'sha256', value: 'deadbeef' },
            filename: 'cat.png',
          },
        ];
      },
    });

    expect(snapshot.conversations[0]?.modelId).toBe('onnx-community/Qwen3-0.6B-ONNX');
    expect(snapshot.conversations[0]?.taskList).toEqual([
      { text: 'Inspect attachment', status: 0 },
    ]);
    expect(snapshot.artifacts).toEqual([
      expect.objectContaining({
        id: 'artifact-1',
        conversationId: 'conversation-1',
        messageId: userMessage.id,
        filename: 'cat.png',
      }),
    ]);
  });

  test('restores conversations, normalizes legacy ids, and resolves image artifacts', () => {
    const appState = createAppState();
    const restored = applyStoredConversationState(
      {
        conversations: [
          {
            id: 'conversation-1',
            name: 'New Conversation 2',
            modelId: 'onnx-community/Qwen3.5-2B-ONNX',
            startedAt: 1710000000000,
            taskList: [
              { text: 'Inspect image', status: 0 },
              { text: 'Write caption', status: 1 },
            ],
            activeLeafMessageId: 'conversation-1-node-2',
            lastSpokenLeafMessageId: 'conversation-1-node-2',
            messageNodeCounter: 2,
            messageNodes: [
              {
                id: 'conversation-1-node-1',
                role: 'user',
                text: 'Look at this',
                createdAt: 1710000001000,
                parentId: null,
                childIds: ['conversation-1-node-2'],
                content: {
                  parts: [
                    { type: 'text', text: 'Look at this' },
                    {
                      type: 'image',
                      artifactId: 'artifact-1',
                      mimeType: 'image/png',
                      filename: 'cat.png',
                    },
                  ],
                },
                artifactRefs: [{ id: 'artifact-1', mimeType: 'image/png', filename: 'cat.png' }],
              },
              {
                id: 'conversation-1-node-2',
                role: 'model',
                text: 'A cat',
                response: 'A cat',
                createdAt: 1710000002000,
                parentId: 'conversation-1-node-1',
                childIds: [],
                isResponseComplete: true,
              },
            ],
          },
          {
            id: 'conversation-2',
            name: 'New Conversation 9',
            messageNodes: [],
            hasGeneratedName: false,
          },
        ],
        artifacts: [
          {
            id: 'artifact-1',
            mimeType: 'image/png',
            data: 'abc123',
          },
        ],
        conversationCount: 2,
        conversationIdCounter: 2,
      },
      appState,
      { untitledPrefix: 'New Conversation' },
    );

    expect(restored).toBe(true);
    expect(appState.conversations).toHaveLength(1);
    expect(appState.conversationCount).toBe(2);
    expect(appState.conversationIdCounter).toBe(2);
    expect(appState.activeConversationId).toBeNull();
    expect(appState.conversations[0]?.name).toBe('New Conversation');
    expect(appState.conversations[0]?.modelId).toBe('onnx-community/Qwen3-0.6B-ONNX');
    expect(appState.conversations[0]?.taskList).toEqual([
      { text: 'Inspect image', status: 0 },
      { text: 'Write caption', status: 1 },
    ]);
    expect(appState.conversations[0]?.messageNodes[0]?.content.parts[1]).toMatchObject({
      type: 'image',
      mimeType: 'image/png',
      base64: 'abc123',
      url: 'data:image/png;base64,abc123',
    });
  });

  test('restores text file attachments with model-visible text intact', () => {
    const appState = createAppState();
    const restored = applyStoredConversationState(
      {
        conversations: [
          {
            id: 'conversation-1',
            name: 'Files',
            activeLeafMessageId: 'conversation-1-node-1',
            lastSpokenLeafMessageId: 'conversation-1-node-1',
            messageNodeCounter: 1,
            messageNodes: [
              {
                id: 'conversation-1-node-1',
                role: 'user',
                text: 'Read this file',
                createdAt: 1710000001000,
                parentId: null,
                childIds: [],
                content: {
                  parts: [
                    { type: 'text', text: 'Read this file' },
                    {
                      type: 'file',
                      artifactId: 'artifact-2',
                      mimeType: 'text/plain',
                      filename: 'notes.txt',
                      normalizedText: 'The mitochondria is the powerhouse of the cell.',
                      normalizedFormat: 'text',
                      conversionWarnings: ['Formatting may differ from the source document.'],
                      memoryHint: {
                        ingestible: true,
                        preferredSource: 'normalizedText',
                        documentRole: 'attachment',
                      },
                      llmText:
                        'Attached file: notes.txt\nMIME type: text/plain\nContents:\nThe mitochondria is the powerhouse of the cell.',
                    },
                  ],
                },
                artifactRefs: [{ id: 'artifact-2', kind: 'text', mimeType: 'text/plain', filename: 'notes.txt' }],
              },
            ],
          },
        ],
        artifacts: [
          {
            id: 'artifact-2',
            mimeType: 'text/plain',
            encoding: 'utf-8',
            data: 'The mitochondria is the powerhouse of the cell.',
          },
        ],
        conversationCount: 1,
        conversationIdCounter: 1,
      },
      appState,
    );

    expect(restored).toBe(true);
    expect(appState.conversations[0]?.messageNodes[0]?.content.parts[1]).toMatchObject({
      type: 'file',
      mimeType: 'text/plain',
      text: 'The mitochondria is the powerhouse of the cell.',
      normalizedText: 'The mitochondria is the powerhouse of the cell.',
      normalizedFormat: 'text',
      conversionWarnings: ['Formatting may differ from the source document.'],
      memoryHint: {
        ingestible: true,
        preferredSource: 'normalizedText',
        documentRole: 'attachment',
      },
      llmText:
        'Attached file: notes.txt\nMIME type: text/plain\nContents:\nThe mitochondria is the powerhouse of the cell.',
    });
    expect(appState.conversations[0]?.messageNodes[0]?.content.llmRepresentation).toBe(
      'Read this file\nAttached file: notes.txt\nMIME type: text/plain\nContents:\nThe mitochondria is the powerhouse of the cell.'
    );
  });
});
