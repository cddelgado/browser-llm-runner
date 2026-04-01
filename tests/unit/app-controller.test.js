import { describe, expect, test, vi } from 'vitest';
import { createAppController } from '../../src/state/app-controller.js';
import {
  addMessageToConversation,
  buildPromptForConversationLeaf,
  createConversation,
  deriveConversationName,
  getMessageNodeById,
  normalizeConversationName,
} from '../../src/state/conversation-model.js';

function createControllerHarness() {
  const state = {
    modelReady: false,
    isGenerating: false,
    isLoadingModel: false,
    isRunningOrchestration: false,
    activeGenerationConfig: {
      maxOutputTokens: 256,
      maxContextTokens: 2048,
      temperature: 0.6,
      topK: 50,
      topP: 0.9,
    },
    activeUserEditMessageId: null,
  };
  const conversations = [];
  const activeConversationId = { value: null };
  const callLog = [];
  const engine = {
    config: {
      modelId: 'test-model',
      backendPreference: 'auto',
      generationConfig: state.activeGenerationConfig,
    },
    worker: null,
    initialize: vi.fn().mockResolvedValue({ backend: 'wasm' }),
    generate: vi.fn(),
    cancelGeneration: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(() => {
      engine.worker = null;
      engine.loadedModelId = null;
    }),
  };

  function getActiveConversation() {
    return conversations.find((conversation) => conversation.id === activeConversationId.value) || null;
  }

  const dependencies = {
    state,
    engine,
    runOrchestration: vi.fn(),
    renameOrchestration: { id: 'rename-chat', steps: [{ prompt: 'Title {{userPrompt}}' }] },
    fixOrchestration: { id: 'fix-response', steps: [{ prompt: 'Fix {{assistantResponse}}' }] },
    readEngineConfig: () => ({
      modelId: 'test-model',
      backendPreference: 'auto',
      runtime: {},
      generationConfig: state.activeGenerationConfig,
    }),
    persistInferencePreferences: vi.fn(() => callLog.push('persistInferencePreferences')),
    getActiveConversation,
    findConversationById: (conversationId) =>
      conversations.find((conversation) => conversation.id === conversationId) || null,
    hasSelectedConversationWithHistory: () => Boolean(getActiveConversation()?.messageNodes.length),
    normalizeModelId: (value) => value,
    getLoadedModelId: () => engine.loadedModelId,
    getThinkingTagsForModel: () => null,
    detectToolCalls: vi.fn(() => []),
    executeToolCall: vi.fn(),
    getSelectedModelId: () => 'test-model',
    addMessageToConversation,
    buildPromptForConversationLeaf,
    getMessageNodeById,
    deriveConversationName,
    normalizeConversationName,
    removeLeafMessageFromConversation: vi.fn(() => true),
    parseThinkingText: (rawText) => ({
      response: String(rawText || ''),
      thoughts: '',
      hasThinking: false,
      isThinkingComplete: false,
    }),
    findMessageElement: () => null,
    addMessageElement: vi.fn(() => ({ nodeName: 'LI' })),
    updateModelMessageElement: vi.fn(),
    renderTranscript: vi.fn(() => callLog.push('renderTranscript')),
    renderConversationList: vi.fn(() => callLog.push('renderConversationList')),
    updateChatTitle: vi.fn(() => callLog.push('updateChatTitle')),
    updateActionButtons: vi.fn(() => callLog.push('updateActionButtons')),
    updateWelcomePanelVisibility: vi.fn(() => callLog.push('updateWelcomePanelVisibility')),
    queueConversationStateSave: vi.fn(() => callLog.push('queueConversationStateSave')),
    scrollTranscriptToBottom: vi.fn(() => callLog.push('scrollTranscriptToBottom')),
    setStatus: vi.fn((message) => callLog.push(`status:${message}`)),
    appendDebug: vi.fn((message) => callLog.push(`debug:${message}`)),
    showProgressRegion: vi.fn((visible) => callLog.push(`progress:${visible}`)),
    clearLoadError: vi.fn(() => callLog.push('clearLoadError')),
    resetLoadProgressFiles: vi.fn(() => callLog.push('resetLoadProgressFiles')),
    setLoadProgress: vi.fn((progress) => callLog.push(`load:${progress.message}`)),
    showLoadError: vi.fn((message) => callLog.push(`loadError:${message}`)),
    applyPendingGenerationSettingsIfReady: vi.fn(() =>
      callLog.push('applyPendingGenerationSettingsIfReady'),
    ),
    markActiveIncompleteModelMessageComplete: vi.fn(() =>
      callLog.push('markActiveIncompleteModelMessageComplete'),
    ),
    scheduleTask: (callback) => callback(),
  };

  return {
    controller: createAppController(dependencies),
    state,
    engine,
    conversations,
    activeConversationId,
    dependencies,
    callLog,
  };
}

describe('app-controller', () => {
  test('initializes the engine and updates loading state', async () => {
    const harness = createControllerHarness();

    await harness.controller.initializeEngine();

    expect(harness.engine.initialize).toHaveBeenCalledWith({
      modelId: 'test-model',
      backendPreference: 'auto',
      runtime: {},
      generationConfig: harness.state.activeGenerationConfig,
    });
    expect(harness.state.modelReady).toBe(true);
    expect(harness.state.isLoadingModel).toBe(false);
    expect(harness.callLog).toContain('status:Loading model...');
    expect(harness.callLog).toContain('load:Model ready.');
    expect(harness.callLog).toContain('updateWelcomePanelVisibility');
    expect(harness.callLog).toContain('updateChatTitle');
  });

  test('stops generation and performs cleanup', async () => {
    const harness = createControllerHarness();
    harness.state.isGenerating = true;

    await harness.controller.stopGeneration();

    expect(harness.engine.cancelGeneration).toHaveBeenCalledTimes(1);
    expect(harness.state.isGenerating).toBe(false);
    expect(harness.state.modelReady).toBe(true);
    expect(harness.callLog).toContain('status:Stopped');
    expect(harness.callLog).toContain('markActiveIncompleteModelMessageComplete');
    expect(harness.callLog).toContain('applyPendingGenerationSettingsIfReady');
  });

  test('runs rename orchestration through the controller and updates the conversation', async () => {
    const harness = createControllerHarness();
    const conversation = createConversation({ id: 'conversation-1', name: 'New Conversation' });
    const userMessage = addMessageToConversation(conversation, 'user', 'Explain photosynthesis.');
    addMessageToConversation(conversation, 'model', 'Plants convert light into energy.', {
      parentId: userMessage.id,
    }).isResponseComplete = true;
    harness.conversations.push(conversation);
    harness.activeConversationId.value = conversation.id;
    harness.state.modelReady = true;
    harness.dependencies.runOrchestration.mockResolvedValue({
      finalPrompt: 'ignored',
      finalOutput: 'Plant Energy Basics',
    });

    await harness.controller.runRenameChatOrchestration(conversation.id, {
      userPrompt: 'Explain photosynthesis.',
      assistantResponse: 'Plants convert light into energy.',
    });

    expect(harness.dependencies.runOrchestration).toHaveBeenCalledWith(
      harness.dependencies.renameOrchestration,
      {
        userPrompt: 'Explain photosynthesis.',
        assistantResponse: 'Plants convert light into energy.',
      },
    );
    expect(conversation.name).toBe('Plant Energy Basics');
    expect(conversation.hasGeneratedName).toBe(true);
    expect(harness.callLog).toContain('renderConversationList');
    expect(harness.callLog).toContain('updateChatTitle');
    expect(harness.state.isRunningOrchestration).toBe(false);
  });

  test('reloads the selected conversation model when a different model is currently loaded', async () => {
    const harness = createControllerHarness();
    harness.state.modelReady = true;
    harness.engine.worker = {};
    harness.engine.loadedModelId = 'other-model';
    const conversation = createConversation({ id: 'conversation-1', modelId: 'test-model' });
    addMessageToConversation(conversation, 'user', 'Hello');
    harness.conversations.push(conversation);
    harness.activeConversationId.value = conversation.id;

    await harness.controller.loadModelForSelectedConversation();

    expect(harness.engine.dispose).toHaveBeenCalledTimes(1);
    expect(harness.engine.initialize).toHaveBeenCalledTimes(1);
  });

  test('unloads the current model when selecting a different model before the next send', async () => {
    const harness = createControllerHarness();
    harness.state.modelReady = true;
    harness.engine.worker = {};
    harness.engine.loadedModelId = 'other-model';
    harness.dependencies.readEngineConfig = () => ({
      modelId: 'test-model',
      backendPreference: 'auto',
      runtime: {},
      generationConfig: harness.state.activeGenerationConfig,
    });

    await harness.controller.reinitializeEngineFromSettings();

    expect(harness.engine.dispose).toHaveBeenCalledTimes(1);
    expect(harness.state.modelReady).toBe(false);
    expect(harness.callLog).toContain('status:Settings updated. Send a message to load the selected model.');
  });

  test('captures emitted tool calls on completed model messages', () => {
    const harness = createControllerHarness();
    const conversation = createConversation({ id: 'conversation-1', modelId: 'test-model' });
    const userMessage = addMessageToConversation(conversation, 'user', 'Weather?');
    harness.conversations.push(conversation);
    harness.activeConversationId.value = conversation.id;
    harness.state.modelReady = true;
    harness.dependencies.detectToolCalls
      .mockReturnValueOnce([
        {
          name: 'get_weather',
          arguments: { location: 'Milwaukee, WI' },
          rawText: '{"name":"get_weather","parameters":{"location":"Milwaukee, WI"}}',
          format: 'json',
        },
      ])
      .mockReturnValueOnce([]);
    harness.dependencies.executeToolCall = undefined;

    harness.engine.generate.mockImplementation((_prompt, handlers) => {
      handlers.onComplete('{"name":"get_weather","parameters":{"location":"Milwaukee, WI"}}');
    });

    harness.controller.startModelGeneration(conversation, buildPromptForConversationLeaf(conversation), {
      parentMessageId: userMessage.id,
    });

    const modelMessage = conversation.messageNodes.find((message) => message.role === 'model');
    expect(modelMessage?.toolCalls).toEqual([
      {
        name: 'get_weather',
        arguments: { location: 'Milwaukee, WI' },
        rawText: '{"name":"get_weather","parameters":{"location":"Milwaukee, WI"}}',
        format: 'json',
      },
    ]);
  });

  test('executes detected tool calls and continues generation', async () => {
    const harness = createControllerHarness();
    const conversation = createConversation({ id: 'conversation-1', modelId: 'test-model' });
    const userMessage = addMessageToConversation(conversation, 'user', 'What time is it?');
    harness.conversations.push(conversation);
    harness.activeConversationId.value = conversation.id;
    harness.state.modelReady = true;
    harness.dependencies.detectToolCalls
      .mockReturnValueOnce([
        {
          name: 'get_current_date_time',
          arguments: {},
          rawText: '{"name":"get_current_date_time","parameters":{}}',
          format: 'json',
        },
      ])
      .mockReturnValueOnce([]);
    harness.dependencies.executeToolCall.mockResolvedValue({
      toolName: 'get_current_date_time',
      arguments: {},
      resultText: '{"iso":"2026-03-26T06:00:00.000Z"}',
    });

    harness.engine.generate
      .mockImplementationOnce((_prompt, handlers) => {
        handlers.onComplete('{"name":"get_current_date_time","parameters":{}}');
      })
      .mockImplementationOnce((_prompt, handlers) => {
        handlers.onComplete('It is currently 1:00 AM local time.');
      });

    harness.controller.startModelGeneration(conversation, buildPromptForConversationLeaf(conversation), {
      parentMessageId: userMessage.id,
      updateLastSpokenOnComplete: true,
    });

    await Promise.resolve();
    await Promise.resolve();

    const toolMessage = conversation.messageNodes.find((message) => message.role === 'tool');
    const finalModelMessages = conversation.messageNodes.filter((message) => message.role === 'model');
    expect(harness.dependencies.executeToolCall).toHaveBeenCalledWith({
      name: 'get_current_date_time',
      arguments: {},
      rawText: '{"name":"get_current_date_time","parameters":{}}',
      format: 'json',
    });
    expect(toolMessage?.toolName).toBe('get_current_date_time');
    expect(toolMessage?.toolResult).toBe('{"iso":"2026-03-26T06:00:00.000Z"}');
    expect(finalModelMessages.at(-1)?.text).toBe('It is currently 1:00 AM local time.');
  });

  test('preserves visible narration while storing a tool-call-only continuation payload', () => {
    const harness = createControllerHarness();
    const conversation = createConversation({ id: 'conversation-1', modelId: 'test-model' });
    const userMessage = addMessageToConversation(conversation, 'user', 'Test the tools.');
    harness.conversations.push(conversation);
    harness.activeConversationId.value = conversation.id;
    harness.state.modelReady = true;
    harness.dependencies.detectToolCalls.mockReturnValueOnce([
      {
        name: 'tasklist',
        arguments: {},
        rawText: '{"name":"tasklist","parameters":{}}',
        format: 'json',
      },
      {
        name: 'get_current_date_time',
        arguments: {},
        rawText: '{"name":"get_current_date_time","parameters":{}}',
        format: 'json',
      },
    ]);
    harness.dependencies.executeToolCall = undefined;

    harness.engine.generate.mockImplementation((_prompt, handlers) => {
      handlers.onComplete(
        '{"name":"tasklist","parameters":{}}\nI checked the list.\n{"name":"get_current_date_time","parameters":{}}\nNow I have the time.'
      );
    });

    harness.controller.startModelGeneration(conversation, buildPromptForConversationLeaf(conversation), {
      parentMessageId: userMessage.id,
    });

    const modelMessage = conversation.messageNodes.find((message) => message.role === 'model');
    expect(modelMessage?.response).toContain('I checked the list.');
    expect(modelMessage?.response).toContain('Now I have the time.');
    expect(modelMessage?.content?.llmRepresentation).toBe(
      '{"name":"tasklist","parameters":{}}\n\n{"name":"get_current_date_time","parameters":{}}'
    );
  });
});
