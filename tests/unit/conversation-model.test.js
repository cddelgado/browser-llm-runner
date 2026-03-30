import { describe, expect, test } from 'vitest';
import {
  addMessageToConversation,
  buildConversationDownloadMarkdown,
  buildConversationDownloadPayload,
  buildPromptForConversationLeaf,
  createConversation,
  findPreferredLeafForVariant,
  getModelVariantState,
  getTextFromMessageContentParts,
  getUserVariantState,
  pruneDescendantsFromMessage,
  setUserMessageText,
} from '../../src/state/conversation-model.js';

function completeModelMessage(message, text) {
  message.response = text;
  message.text = text;
  message.isResponseComplete = true;
  return message;
}

describe('conversation-model', () => {
  test('builds prompts from the visible branch and effective system prompt', () => {
    const conversation = createConversation({
      id: 'conversation-1',
      systemPrompt: 'Use simple language.',
    });
    conversation.conversationSystemPrompt = 'Answer as a tutor.';
    conversation.appendConversationSystemPrompt = true;

    const userMessage = addMessageToConversation(conversation, 'user', 'What is gravity?');
    const modelMessage = completeModelMessage(
      addMessageToConversation(conversation, 'model', '', { parentId: userMessage.id }),
      'Gravity pulls objects together.',
    );

    expect(buildPromptForConversationLeaf(conversation)).toEqual([
      {
        role: 'system',
        content: 'Use simple language.\n\nAnswer as a tutor.',
      },
      { role: 'user', content: 'What is gravity?' },
      { role: 'assistant', content: 'Gravity pulls objects together.' },
    ]);

    conversation.appendConversationSystemPrompt = false;

    expect(
      buildPromptForConversationLeaf(conversation, modelMessage.id, {
        systemPromptSuffix: 'Use tools when needed.',
      })
    ).toEqual([
      {
        role: 'system',
        content: 'Answer as a tutor.\n\nUse tools when needed.',
      },
      { role: 'user', content: 'What is gravity?' },
      { role: 'assistant', content: 'Gravity pulls objects together.' },
    ]);
  });

  test('preserves image parts in user prompts and text edits', () => {
    const conversation = createConversation({ id: 'conversation-1' });
    const userMessage = addMessageToConversation(conversation, 'user', 'Describe this image.', {
      contentParts: [
        { type: 'text', text: 'Describe this image.' },
        {
          type: 'image',
          artifactId: 'artifact-1',
          mimeType: 'image/png',
          base64: 'abc123',
          url: 'data:image/png;base64,abc123',
          filename: 'photo.png',
        },
      ],
      artifactRefs: [
        {
          id: 'artifact-1',
          kind: 'binary',
          mimeType: 'image/png',
          filename: 'photo.png',
          hash: { algorithm: 'sha256', value: 'deadbeef' },
        },
      ],
    });

    expect(buildPromptForConversationLeaf(conversation)).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this image.' },
          {
            type: 'image',
            artifactId: 'artifact-1',
            mimeType: 'image/png',
            base64: 'abc123',
            url: 'data:image/png;base64,abc123',
            filename: 'photo.png',
          },
        ],
      },
    ]);

    setUserMessageText(userMessage, 'Focus on the background.');

    expect(getTextFromMessageContentParts(userMessage.content.parts)).toBe('Focus on the background.');
    expect(userMessage.content.parts.find((part) => part.type === 'image')).toMatchObject({
      artifactId: 'artifact-1',
      filename: 'photo.png',
    });
  });

  test('adds text file attachments to the llm-facing user prompt while preserving file parts', () => {
    const conversation = createConversation({ id: 'conversation-1' });
    addMessageToConversation(conversation, 'user', 'Summarize these notes.', {
      contentParts: [
        { type: 'text', text: 'Summarize these notes.' },
        {
          type: 'file',
          artifactId: 'artifact-2',
          mimeType: 'text/markdown',
          filename: 'notes.md',
          text: '# Notes\n- Gravity pulls objects together.',
          llmText:
            'Attached file: notes.md\nMIME type: text/markdown\nContents:\n# Notes\n- Gravity pulls objects together.',
        },
      ],
      artifactRefs: [
        {
          id: 'artifact-2',
          kind: 'text',
          mimeType: 'text/markdown',
          filename: 'notes.md',
          hash: { algorithm: 'sha256', value: 'feedface' },
        },
      ],
    });

    expect(buildPromptForConversationLeaf(conversation)).toEqual([
      {
        role: 'user',
        content:
          'Summarize these notes.\nAttached file: notes.md\nMIME type: text/markdown\nContents:\n# Notes\n- Gravity pulls objects together.',
      },
    ]);
  });

  test('tracks branch variants and prefers a descendant leaf for the selected variant', () => {
    const conversation = createConversation({ id: 'conversation-1' });
    const rootUser = addMessageToConversation(conversation, 'user', 'Start');
    const rootModel = completeModelMessage(
      addMessageToConversation(conversation, 'model', '', { parentId: rootUser.id }),
      'Root answer',
    );
    const firstBranchUser = addMessageToConversation(conversation, 'user', 'Branch A', {
      parentId: rootModel.id,
    });
    const firstBranchModel = completeModelMessage(
      addMessageToConversation(conversation, 'model', '', { parentId: firstBranchUser.id }),
      'Answer A',
    );
    const secondBranchUser = addMessageToConversation(conversation, 'user', 'Branch B', {
      parentId: rootModel.id,
    });
    const secondBranchModel = completeModelMessage(
      addMessageToConversation(conversation, 'model', '', { parentId: secondBranchUser.id }),
      'Answer B',
    );

    conversation.activeLeafMessageId = firstBranchModel.id;
    conversation.lastSpokenLeafMessageId = secondBranchModel.id;

    const userVariantState = getUserVariantState(conversation, secondBranchUser);
    expect(userVariantState.total).toBe(2);
    expect(userVariantState.index).toBe(1);
    expect(userVariantState.canGoPrev).toBe(true);
    expect(userVariantState.canGoNext).toBe(false);

    const modelVariantState = getModelVariantState(conversation, secondBranchModel);
    expect(modelVariantState.total).toBe(1);
    expect(findPreferredLeafForVariant(conversation, secondBranchUser)).toBe(secondBranchModel.id);
  });

  test('prunes descendants without removing the edited message', () => {
    const conversation = createConversation({ id: 'conversation-1' });
    const userMessage = addMessageToConversation(conversation, 'user', 'Original');
    const modelMessage = completeModelMessage(
      addMessageToConversation(conversation, 'model', '', { parentId: userMessage.id }),
      'First answer',
    );
    const followUpUser = addMessageToConversation(conversation, 'user', 'Follow up', {
      parentId: modelMessage.id,
    });
    const followUpModel = completeModelMessage(
      addMessageToConversation(conversation, 'model', '', { parentId: followUpUser.id }),
      'Second answer',
    );

    conversation.activeLeafMessageId = followUpModel.id;
    conversation.lastSpokenLeafMessageId = followUpModel.id;

    const result = pruneDescendantsFromMessage(conversation, userMessage.id);

    expect(result.removedCount).toBe(3);
    expect(result.removedIds).toEqual([
      modelMessage.id,
      followUpUser.id,
      followUpModel.id,
    ]);
    expect(conversation.messageNodes.map((message) => message.id)).toEqual([userMessage.id]);
    expect(conversation.activeLeafMessageId).toBe(userMessage.id);
    expect(conversation.lastSpokenLeafMessageId).toBe(userMessage.id);
  });

  test('builds export payloads and markdown from the active branch only', () => {
    const conversation = createConversation({
      id: 'conversation-1',
      name: 'Physics Notes',
      modelId: 'physics-model',
      systemPrompt: 'Stay accurate.',
      startedAt: Date.UTC(2026, 0, 2, 3, 4, 5),
    });
    conversation.conversationSystemPrompt = 'Use classroom examples.';
    const firstUser = addMessageToConversation(conversation, 'user', 'Explain momentum.');
    const firstModel = completeModelMessage(
      addMessageToConversation(conversation, 'model', '', { parentId: firstUser.id }),
      'Momentum is mass times velocity.',
    );
    const branchUser = addMessageToConversation(conversation, 'user', 'Use a soccer example.', {
      parentId: firstModel.id,
    });
    const branchModel = completeModelMessage(
      addMessageToConversation(conversation, 'model', '', { parentId: branchUser.id }),
      'A fast soccer ball has more momentum than a slow one.',
    );
    addMessageToConversation(conversation, 'user', 'Use a bowling example.', {
      parentId: firstModel.id,
    });

    conversation.activeLeafMessageId = branchModel.id;

    const payload = buildConversationDownloadPayload(conversation, {
      temperature: 0.7,
      exportedAt: '2026-01-02T04:05:06.000Z',
      systemPromptSuffix: 'Tool calling is enabled.',
      toolContext: {
        enabled: true,
        supported: true,
        enabledTools: [],
      },
    });

    expect(payload).toEqual({
      conversation: {
        name: 'Physics Notes',
        startedAt: '2026-01-02T03:04:05.000Z',
        startedAtMs: Date.UTC(2026, 0, 2, 3, 4, 5),
        exportedAt: '2026-01-02T04:05:06.000Z',
      },
      model: 'physics-model',
      temperature: 0.7,
      systemPrompt: 'Stay accurate.\n\nUse classroom examples.\n\nTool calling is enabled.',
      toolCalling: {
        supported: true,
        enabledTools: ['none'],
      },
      exchanges: [
        {
          heading: 'User prompt 1',
          role: 'user',
          event: 'entered',
          timestamp: expect.any(String),
          timestampMs: expect.any(Number),
          text: 'Explain momentum.',
        },
        {
          heading: 'Model response 2',
          role: 'model',
          event: 'generated',
          timestamp: expect.any(String),
          timestampMs: expect.any(Number),
          text: 'Momentum is mass times velocity.',
          toolCalls: [],
        },
        {
          heading: 'User prompt 3',
          role: 'user',
          event: 'entered',
          timestamp: expect.any(String),
          timestampMs: expect.any(Number),
          text: 'Use a soccer example.',
        },
        {
          heading: 'Model response 4',
          role: 'model',
          event: 'generated',
          timestamp: expect.any(String),
          timestampMs: expect.any(Number),
          text: 'A fast soccer ball has more momentum than a slow one.',
          toolCalls: [],
        },
      ],
    });

    const markdown = buildConversationDownloadMarkdown(payload);

    expect(markdown).toContain('# Physics Notes');
    expect(markdown).toContain('## System prompt');
    expect(markdown).toContain('> Stay accurate.');
    expect(markdown).toContain('> Use classroom examples.');
    expect(markdown).toContain('Tool Calling Supported: Yes');
    expect(markdown).toContain('Enabled Tools: none');
    expect(markdown).toContain('## User prompt 3');
    expect(markdown).toContain('> Use a soccer example.');
    expect(markdown).not.toContain('bowling');
  });

  test('preserves tool call metadata and tool results in prompts and exports', () => {
    const conversation = createConversation({
      id: 'conversation-1',
      modelId: 'tool-model',
    });
    const userMessage = addMessageToConversation(conversation, 'user', 'Check the weather.');
    const modelMessage = completeModelMessage(
      addMessageToConversation(conversation, 'model', '', {
        parentId: userMessage.id,
        toolCalls: [
          {
            name: 'get_weather',
            arguments: { location: 'Milwaukee, WI' },
            rawText: '{"name":"get_weather","parameters":{"location":"Milwaukee, WI"}}',
            format: 'json',
          },
        ],
      }),
      '{"name":"get_weather","parameters":{"location":"Milwaukee, WI"}}',
    );
    const toolMessage = addMessageToConversation(conversation, 'tool', '72 F and sunny.', {
      parentId: modelMessage.id,
      toolName: 'get_weather',
      toolArguments: { location: 'Milwaukee, WI' },
    });
    const finalModel = completeModelMessage(
      addMessageToConversation(conversation, 'model', 'It is 72 F and sunny in Milwaukee.', {
        parentId: toolMessage.id,
      }),
      'It is 72 F and sunny in Milwaukee.',
    );

    conversation.activeLeafMessageId = finalModel.id;

    expect(buildPromptForConversationLeaf(conversation)).toEqual([
      { role: 'user', content: 'Check the weather.' },
      {
        role: 'assistant',
        content: '{"name":"get_weather","parameters":{"location":"Milwaukee, WI"}}',
      },
      { role: 'tool', content: '72 F and sunny.' },
      { role: 'assistant', content: 'It is 72 F and sunny in Milwaukee.' },
    ]);

    const payload = buildConversationDownloadPayload(conversation);
    expect(payload.exchanges).toEqual([
      expect.objectContaining({
        role: 'user',
        text: 'Check the weather.',
      }),
      expect.objectContaining({
        role: 'model',
        text: '{"name":"get_weather","parameters":{"location":"Milwaukee, WI"}}',
        toolCalls: [
          {
            name: 'get_weather',
            arguments: { location: 'Milwaukee, WI' },
            rawText: '{"name":"get_weather","parameters":{"location":"Milwaukee, WI"}}',
            format: 'json',
          },
        ],
      }),
      expect.objectContaining({
        role: 'tool',
        text: '72 F and sunny.',
        toolName: 'get_weather',
        toolArguments: { location: 'Milwaukee, WI' },
      }),
      expect.objectContaining({
        role: 'model',
        text: 'It is 72 F and sunny in Milwaukee.',
        toolCalls: [],
      }),
    ]);

    const markdown = buildConversationDownloadMarkdown(payload);
    expect(markdown).toContain('Tool: get_weather');
    expect(markdown).toContain('Tool Calls: [{"name":"get_weather"');
    expect(markdown).toContain('> 72 F and sunny.');
  });

  test('preserves conversations without a stored model id', () => {
    const conversation = createConversation({
      id: 'conversation-1',
      modelId: '',
    });

    expect(conversation.modelId).toBe('');
  });
});
