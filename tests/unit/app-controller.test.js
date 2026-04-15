import { describe, expect, test, vi } from 'vitest';
import { createAppController } from '../../src/state/app-controller.js';
import { parseThinkingText } from '../../src/llm/thinking-parser.js';
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
    activeOrchestrationKind: 'none',
    isBlockingOrchestration: false,
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
      backendPreference: 'webgpu',
      generationConfig: state.activeGenerationConfig,
    },
    worker: null,
    initialize: vi.fn().mockResolvedValue({ backend: 'cpu' }),
    generate: vi.fn(),
    cancelGeneration: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(() => {
      engine.worker = null;
      engine.loadedModelId = null;
    }),
  };

  function getActiveConversation() {
    return (
      conversations.find((conversation) => conversation.id === activeConversationId.value) || null
    );
  }

  const dependencies = {
    state,
    engine,
    runOrchestration: vi.fn(),
    renameOrchestration: { id: 'rename-chat', steps: [{ prompt: 'Title {{userPrompt}}' }] },
    fixOrchestration: { id: 'fix-response', steps: [{ prompt: 'Fix {{assistantResponse}}' }] },
    readEngineConfig: () => ({
      modelId: 'test-model',
      backendPreference: 'webgpu',
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
    getRuntimeConfigForConversation: vi.fn(() => ({ enableThinking: false })),
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
      callLog.push('applyPendingGenerationSettingsIfReady')
    ),
    markActiveIncompleteModelMessageComplete: vi.fn(() =>
      callLog.push('markActiveIncompleteModelMessageComplete')
    ),
    scheduleTask: (callback) => callback(),
    streamUpdateIntervalMs: 0,
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
      backendPreference: 'webgpu',
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

  test('unloads the current model after a fatal generation memory error', () => {
    const harness = createControllerHarness();
    const conversation = createConversation({ id: 'conversation-1', modelId: 'test-model' });
    const userMessage = addMessageToConversation(conversation, 'user', 'What time is it?');
    harness.conversations.push(conversation);
    harness.activeConversationId.value = conversation.id;
    harness.state.modelReady = true;
    harness.engine.loadedBackend = 'cpu';

    harness.engine.generate.mockImplementation((_prompt, handlers) => {
      handlers.onError(
        'failed to call OrtRun(). ERROR_CODE: 6, ERROR_MESSAGE: std::bad_alloc'
      );
    });

    harness.controller.startModelGeneration(
      conversation,
      buildPromptForConversationLeaf(conversation),
      {
        parentMessageId: userMessage.id,
      }
    );

    const modelMessage = conversation.messageNodes.find((message) => message.role === 'model');
    expect(modelMessage?.text).toContain('Browser memory was exhausted during generation on CPU.');
    expect(modelMessage?.text).toContain('Lower Context size, choose a smaller model');
    expect(modelMessage?.isResponseComplete).toBe(true);
    expect(harness.engine.dispose).toHaveBeenCalledTimes(1);
    expect(harness.state.modelReady).toBe(false);
    expect(harness.state.isGenerating).toBe(false);
    expect(harness.callLog).toContain(
      'status:Generation failed. Model unloaded after running out of memory.'
    );
    expect(harness.callLog).toContain(
      'debug:Disposed current model worker after fatal generation error.'
    );
  });

  test('unloads the current model after a WebGPU device-loss generation error', () => {
    const harness = createControllerHarness();
    const conversation = createConversation({ id: 'conversation-1', modelId: 'test-model' });
    const userMessage = addMessageToConversation(conversation, 'user', 'Explain WebGPU issues.');
    harness.conversations.push(conversation);
    harness.activeConversationId.value = conversation.id;
    harness.state.modelReady = true;
    harness.engine.loadedBackend = 'webgpu';

    harness.engine.generate.mockImplementation((_prompt, handlers) => {
      handlers.onError(
        "failed to call OrtRun(). ERROR_CODE: 1, ERROR_MESSAGE: /onnxruntime/core/providers/webgpu/buffer_manager.cc:543 status == wgpu::MapAsyncStatus::Success was false. Failed to download data from buffer: Failed to execute 'mapAsync' on 'GPUBuffer': [Device] is lost."
      );
    });

    harness.controller.startModelGeneration(
      conversation,
      buildPromptForConversationLeaf(conversation),
      {
        parentMessageId: userMessage.id,
      }
    );

    const modelMessage = conversation.messageNodes.find((message) => message.role === 'model');
    expect(modelMessage?.text).toContain(
      'WebGPU lost the active graphics device during generation on WEBGPU.'
    );
    expect(modelMessage?.text).toContain(
      'Retry the prompt, switch to CPU mode, or reload the page if this keeps happening.'
    );
    expect(modelMessage?.isResponseComplete).toBe(true);
    expect(harness.engine.dispose).toHaveBeenCalledTimes(1);
    expect(harness.state.modelReady).toBe(false);
    expect(harness.state.isGenerating).toBe(false);
    expect(harness.callLog).toContain(
      'status:Generation failed. Model unloaded after WebGPU device loss. Retry or switch to CPU.'
    );
    expect(harness.callLog).toContain(
      'debug:Disposed current model worker after WebGPU device loss.'
    );
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
      expect.objectContaining({
        signal: expect.any(Object),
      })
    );
    expect(conversation.name).toBe('Plant Energy Basics');
    expect(conversation.hasGeneratedName).toBe(true);
    expect(harness.callLog).toContain('renderConversationList');
    expect(harness.callLog).toContain('updateChatTitle');
    expect(harness.state.isRunningOrchestration).toBe(false);
  });

  test('cancels a background rename and falls back to a deterministic title before regenerating', async () => {
    const harness = createControllerHarness();
    const conversation = createConversation({ id: 'conversation-1', name: 'New Conversation' });
    const userMessage = addMessageToConversation(conversation, 'user', 'Explain recursion simply.');
    const modelMessage = addMessageToConversation(
      conversation,
      'model',
      'Recursion is when a function solves a problem by calling itself on a smaller version.',
      {
        parentId: userMessage.id,
      }
    );
    modelMessage.isResponseComplete = true;
    harness.conversations.push(conversation);
    harness.activeConversationId.value = conversation.id;
    harness.state.modelReady = true;
    const fallbackTitle = deriveConversationName(conversation);

    harness.dependencies.runOrchestration.mockImplementation(
      (_orchestration, _inputs, options = {}) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener(
            'abort',
            () => {
              const abortError = new Error('Generation canceled.');
              abortError.name = 'AbortError';
              reject(abortError);
            },
            { once: true }
          );
        })
    );

    void harness.controller.runRenameChatOrchestration(conversation.id, {
      userPrompt: userMessage.text,
      assistantResponse: modelMessage.text,
    });
    await Promise.resolve();

    harness.engine.generate.mockImplementation((_prompt, handlers) => {
      handlers.onComplete('Here is a regenerated answer.');
    });

    await harness.controller.regenerateFromMessage(modelMessage.id);

    expect(harness.engine.cancelGeneration).toHaveBeenCalledTimes(1);
    expect(conversation.hasGeneratedName).toBe(true);
    expect(conversation.name).toBe(fallbackTitle);
    expect(harness.engine.generate).toHaveBeenCalledTimes(1);
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
      backendPreference: 'webgpu',
      runtime: {},
      generationConfig: harness.state.activeGenerationConfig,
    });

    await harness.controller.reinitializeEngineFromSettings();

    expect(harness.engine.dispose).toHaveBeenCalledTimes(1);
    expect(harness.state.modelReady).toBe(false);
    expect(harness.callLog).toContain(
      'status:Settings updated. Send a message to load the selected model.'
    );
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

    harness.controller.startModelGeneration(
      conversation,
      buildPromptForConversationLeaf(conversation),
      {
        parentMessageId: userMessage.id,
      }
    );

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

  test('passes conversation-specific runtime overrides into generation', () => {
    const harness = createControllerHarness();
    const conversation = createConversation({ id: 'conversation-1', modelId: 'test-model' });
    const userMessage = addMessageToConversation(conversation, 'user', 'Short answer please.');
    harness.conversations.push(conversation);
    harness.activeConversationId.value = conversation.id;
    harness.state.modelReady = true;

    harness.engine.generate.mockImplementation((_prompt, handlers) => {
      handlers.onComplete('Done.');
    });

    harness.controller.startModelGeneration(
      conversation,
      buildPromptForConversationLeaf(conversation),
      {
        parentMessageId: userMessage.id,
      }
    );

    expect(harness.dependencies.getRuntimeConfigForConversation).toHaveBeenCalledWith(
      conversation,
      [{ role: 'user', content: 'Short answer please.' }]
    );
    expect(harness.engine.generate.mock.calls[0][1]).toMatchObject({
      runtime: { enableThinking: false },
    });
  });

  test('logs raw model output entries without trimming the streamed text', () => {
    const harness = createControllerHarness();
    const conversation = createConversation({ id: 'conversation-1', modelId: 'test-model' });
    const userMessage = addMessageToConversation(conversation, 'user', 'Show the exact output.');
    harness.conversations.push(conversation);
    harness.activeConversationId.value = conversation.id;
    harness.state.modelReady = true;

    harness.engine.generate.mockImplementation((_prompt, handlers) => {
      handlers.onToken('  Exact');
      handlers.onToken(' output  ');
      handlers.onComplete('Exact output');
    });

    harness.controller.startModelGeneration(
      conversation,
      buildPromptForConversationLeaf(conversation),
      {
        parentMessageId: userMessage.id,
      }
    );

    const rawOutputCall = harness.dependencies.appendDebug.mock.calls.find(
      ([entry]) => entry && typeof entry === 'object' && entry.kind === 'raw-model-output'
    );
    expect(rawOutputCall?.[0]).toMatchObject({
      kind: 'raw-model-output',
      details: '  Exact output  ',
    });
  });

  test('uses raw streamed text to preserve Gemma-style thinking blocks on completion', () => {
    const harness = createControllerHarness();
    const conversation = createConversation({
      id: 'conversation-gemma-thinking',
      modelId: 'test-model',
    });
    const userMessage = addMessageToConversation(conversation, 'user', 'Say hello.');
    harness.conversations.push(conversation);
    harness.activeConversationId.value = conversation.id;
    harness.state.modelReady = true;
    harness.dependencies.getThinkingTagsForModel = () => ({
      open: '<|channel>',
      close: '<channel|>',
      stripLeadingText: 'thought',
    });
    harness.dependencies.parseThinkingText = parseThinkingText;

    harness.engine.generate.mockImplementation((_prompt, handlers) => {
      handlers.onToken('<|channel>thought\n');
      handlers.onToken('considering options<channel|>Final answer');
      handlers.onComplete('Final answer');
    });

    harness.controller.startModelGeneration(
      conversation,
      buildPromptForConversationLeaf(conversation),
      {
        parentMessageId: userMessage.id,
      }
    );

    const modelMessage = conversation.messageNodes.find((message) => message.role === 'model');
    expect(modelMessage?.thoughts).toBe('considering options');
    expect(modelMessage?.response).toBe('Final answer');
    expect(modelMessage?.hasThinking).toBe(true);
    expect(modelMessage?.isThinkingComplete).toBe(true);
  });

  test('executes detected tool calls and continues generation', async () => {
    const harness = createControllerHarness();
    const conversation = createConversation({ id: 'conversation-1', modelId: 'test-model' });
    const userMessage = addMessageToConversation(conversation, 'user', 'What time is it?');
    harness.conversations.push(conversation);
    harness.activeConversationId.value = conversation.id;
    harness.state.modelReady = true;
    harness.dependencies.detectToolCalls.mockImplementation((rawText) =>
      String(rawText || '').includes('{"name":"get_current_date_time","parameters":{}}')
        ? [
            {
              name: 'get_current_date_time',
              arguments: {},
              rawText: '{"name":"get_current_date_time","parameters":{}}',
              format: 'json',
            },
          ]
        : []
    );
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

    harness.controller.startModelGeneration(
      conversation,
      buildPromptForConversationLeaf(conversation),
      {
        parentMessageId: userMessage.id,
        updateLastSpokenOnComplete: true,
      }
    );

    await Promise.resolve();
    await Promise.resolve();

    const toolMessage = conversation.messageNodes.find((message) => message.role === 'tool');
    const finalModelMessages = conversation.messageNodes.filter(
      (message) => message.role === 'model'
    );
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

  test('logs one complete raw output blob across tool interception and continuation', async () => {
    const harness = createControllerHarness();
    const conversation = createConversation({ id: 'conversation-1', modelId: 'test-model' });
    const userMessage = addMessageToConversation(conversation, 'user', 'Check the time.');
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
        handlers.onToken('Let me check.\n{"name":"get_current_date_time","parameters":{}}');
        handlers.onComplete('Let me check.\n{"name":"get_current_date_time","parameters":{}}');
      })
      .mockImplementationOnce((_prompt, handlers) => {
        handlers.onToken('\nIt is currently 1:00 AM local time.');
        handlers.onComplete('\nIt is currently 1:00 AM local time.');
      });

    harness.controller.startModelGeneration(
      conversation,
      buildPromptForConversationLeaf(conversation),
      {
        parentMessageId: userMessage.id,
      }
    );

    await Promise.resolve();
    await Promise.resolve();

    const rawOutputCalls = harness.dependencies.appendDebug.mock.calls.filter(
      ([entry]) => entry && typeof entry === 'object' && entry.kind === 'raw-model-output'
    );
    expect(rawOutputCalls).toHaveLength(1);
    expect(rawOutputCalls[0][0]).toMatchObject({
      kind: 'raw-model-output',
      details:
        'Let me check.\n{"name":"get_current_date_time","parameters":{}}\nIt is currently 1:00 AM local time.',
    });
  });

  test('stores validated shell tool results with terminal metadata on the raw conversation object', async () => {
    const harness = createControllerHarness();
    const conversation = createConversation({ id: 'conversation-shell', modelId: 'test-model' });
    const userMessage = addMessageToConversation(conversation, 'user', 'List the workspace.');
    harness.conversations.push(conversation);
    harness.activeConversationId.value = conversation.id;
    harness.state.modelReady = true;
    harness.dependencies.detectToolCalls
      .mockReturnValueOnce([
        {
          name: 'run_shell_command',
          arguments: { cmd: 'ls' },
          rawText: '{"name":"run_shell_command","parameters":{"cmd":"ls"}}',
          format: 'json',
        },
      ])
      .mockReturnValueOnce([]);
    harness.dependencies.executeToolCall.mockResolvedValue({
      toolName: 'run_shell_command',
      arguments: { cmd: 'ls' },
      result: {
        shellFlavor: 'GNU/Linux-like shell subset',
        currentWorkingDirectory: '/workspace',
        command: 'ls',
        exitCode: 0,
        stdout: 'notes.txt',
        stderr: '',
      },
      resultText: '{"status":"success","body":"notes.txt"}',
    });

    harness.engine.generate
      .mockImplementationOnce((_prompt, handlers) => {
        handlers.onComplete('{"name":"run_shell_command","parameters":{"cmd":"ls"}}');
      })
      .mockImplementationOnce((_prompt, handlers) => {
        handlers.onComplete('I found notes.txt.');
      });

    harness.controller.startModelGeneration(
      conversation,
      buildPromptForConversationLeaf(conversation),
      {
        parentMessageId: userMessage.id,
      }
    );

    await Promise.resolve();
    await Promise.resolve();

    const toolMessage = conversation.messageNodes.find((message) => message.role === 'tool');
    expect(toolMessage).toMatchObject({
      toolName: 'run_shell_command',
      toolArguments: { cmd: 'ls' },
      toolResult: '{"status":"success","body":"notes.txt"}',
      toolResultData: {
        shellFlavor: 'GNU/Linux-like shell subset',
        currentWorkingDirectory: '/workspace',
        command: 'ls',
        exitCode: 0,
        stdout: 'notes.txt',
        stderr: '',
      },
    });
  });

  test('keeps only pre-tool narration visible while storing a tool-call-only continuation payload', () => {
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
        'I need to check something first.\n{"name":"tasklist","parameters":{}}\nI checked the list.\n{"name":"get_current_date_time","parameters":{}}\nNow I have the time.'
      );
    });

    harness.controller.startModelGeneration(
      conversation,
      buildPromptForConversationLeaf(conversation),
      {
        parentMessageId: userMessage.id,
      }
    );

    const modelMessage = conversation.messageNodes.find((message) => message.role === 'model');
    expect(modelMessage?.response).toBe('I need to check something first.');
    expect(modelMessage?.content?.llmRepresentation).toBe('{"name":"tasklist","parameters":{}}');
  });

  test('intercepts a streamed tool call and continues after executing it', async () => {
    const harness = createControllerHarness();
    const conversation = createConversation({ id: 'conversation-1', modelId: 'test-model' });
    const userMessage = addMessageToConversation(conversation, 'user', 'Please test the tool.');
    harness.conversations.push(conversation);
    harness.activeConversationId.value = conversation.id;
    harness.state.modelReady = true;
    harness.dependencies.detectToolCalls
      .mockReturnValueOnce([])
      .mockReturnValueOnce([
        {
          name: 'tasklist',
          arguments: { command: 'list' },
          rawText: '{"name":"tasklist","parameters":{"command":"list"}}',
          format: 'json',
        },
      ])
      .mockReturnValueOnce([]);
    harness.dependencies.executeToolCall.mockResolvedValue({
      toolName: 'tasklist',
      arguments: { command: 'list' },
      resultText: '{"items":[]}',
    });

    harness.engine.generate
      .mockImplementationOnce((_prompt, handlers) => {
        handlers.onToken('I am checking the planner now. ');
        handlers.onToken('{"name":"tasklist","parameters":{"command":"list"}}');
        handlers.onComplete(
          'I am checking the planner now. {"name":"tasklist","parameters":{"command":"list"}} extra text that should never surface as final assistant output.'
        );
      })
      .mockImplementationOnce((_prompt, handlers) => {
        handlers.onComplete('The task list is currently empty.');
      });

    harness.controller.startModelGeneration(
      conversation,
      buildPromptForConversationLeaf(conversation),
      {
        parentMessageId: userMessage.id,
        updateLastSpokenOnComplete: true,
      }
    );

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const modelMessages = conversation.messageNodes.filter((message) => message.role === 'model');
    const interceptedModelMessage = modelMessages[0];
    const finalModelMessage = modelMessages.at(-1);
    const toolMessage = conversation.messageNodes.find((message) => message.role === 'tool');

    expect(harness.engine.cancelGeneration).toHaveBeenCalledTimes(1);
    expect(interceptedModelMessage?.text).toBe('I am checking the planner now.');
    expect(interceptedModelMessage?.toolCalls).toEqual([
      {
        name: 'tasklist',
        arguments: { command: 'list' },
        rawText: '{"name":"tasklist","parameters":{"command":"list"}}',
        format: 'json',
      },
    ]);
    expect(interceptedModelMessage?.content?.llmRepresentation).toBe(
      '{"name":"tasklist","parameters":{"command":"list"}}'
    );
    expect(toolMessage?.toolResult).toBe('{"items":[]}');
    expect(finalModelMessage?.text).toBe('The task list is currently empty.');
  });

  test('intercepts a streamed tool call emitted during thinking', async () => {
    const harness = createControllerHarness();
    const conversation = createConversation({ id: 'conversation-thinking', modelId: 'test-model' });
    const userMessage = addMessageToConversation(
      conversation,
      'user',
      'Think through it and then use the planner.'
    );
    harness.conversations.push(conversation);
    harness.activeConversationId.value = conversation.id;
    harness.state.modelReady = true;
    harness.dependencies.getThinkingTagsForModel = () => ({
      open: '<think>',
      close: '</think>',
    });
    harness.dependencies.parseThinkingText = (rawText, thinkingTags) => {
      if (!thinkingTags) {
        return {
          response: String(rawText || ''),
          thoughts: '',
          hasThinking: false,
          isThinkingComplete: false,
        };
      }
      const text = String(rawText || '');
      const openIndex = text.indexOf(thinkingTags.open);
      if (openIndex < 0) {
        return {
          response: text,
          thoughts: '',
          hasThinking: false,
          isThinkingComplete: false,
        };
      }
      const closeIndex = text.indexOf(thinkingTags.close, openIndex + thinkingTags.open.length);
      if (closeIndex < 0) {
        return {
          response: text.slice(0, openIndex),
          thoughts: text.slice(openIndex + thinkingTags.open.length),
          hasThinking: true,
          isThinkingComplete: false,
        };
      }
      return {
        response: text.slice(0, openIndex) + text.slice(closeIndex + thinkingTags.close.length),
        thoughts: text.slice(openIndex + thinkingTags.open.length, closeIndex),
        hasThinking: true,
        isThinkingComplete: true,
      };
    };
    harness.dependencies.detectToolCalls
      .mockReturnValueOnce([])
      .mockReturnValueOnce([
        {
          name: 'tasklist',
          arguments: { command: 'list' },
          rawText: '{"name":"tasklist","parameters":{"command":"list"}}',
          format: 'json',
        },
      ])
      .mockReturnValueOnce([]);
    harness.dependencies.executeToolCall.mockResolvedValue({
      toolName: 'tasklist',
      arguments: { command: 'list' },
      resultText: '{"items":[]}',
    });

    harness.engine.generate
      .mockImplementationOnce((_prompt, handlers) => {
        handlers.onToken('<think>I should inspect the task list first. ');
        handlers.onToken('{"name":"tasklist","parameters":{"command":"list"}}');
        handlers.onComplete(
          '<think>I should inspect the task list first. {"name":"tasklist","parameters":{"command":"list"}}'
        );
      })
      .mockImplementationOnce((_prompt, handlers) => {
        handlers.onComplete('<think>The list is empty.</think>The planner is empty.');
      });

    harness.controller.startModelGeneration(
      conversation,
      buildPromptForConversationLeaf(conversation),
      {
        parentMessageId: userMessage.id,
        updateLastSpokenOnComplete: true,
      }
    );

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const modelMessages = conversation.messageNodes.filter((message) => message.role === 'model');
    const interceptedModelMessage = modelMessages[0];
    const finalModelMessage = modelMessages.at(-1);

    expect(harness.engine.cancelGeneration).toHaveBeenCalledTimes(1);
    expect(interceptedModelMessage?.thoughts).toBe('I should inspect the task list first. ');
    expect(interceptedModelMessage?.hasThinking).toBe(true);
    expect(interceptedModelMessage?.isThinkingComplete).toBe(false);
    expect(interceptedModelMessage?.text).toBe('');
    expect(interceptedModelMessage?.content?.llmRepresentation).toBe(
      '{"name":"tasklist","parameters":{"command":"list"}}'
    );
    expect(finalModelMessage?.thoughts).toBe('The list is empty.');
    expect(finalModelMessage?.text).toBe('The planner is empty.');
  });

  test('regenerates from a continuation model message after a tool call', () => {
    const harness = createControllerHarness();
    const conversation = createConversation({ id: 'conversation-1', modelId: 'test-model' });
    const userMessage = addMessageToConversation(conversation, 'user', 'Please test the tool.');
    const interceptedModelMessage = addMessageToConversation(
      conversation,
      'model',
      'I am checking the planner now.',
      {
        parentId: userMessage.id,
        toolCalls: [
          {
            name: 'tasklist',
            arguments: { command: 'list' },
            rawText: '{"name":"tasklist","parameters":{"command":"list"}}',
            format: 'json',
          },
        ],
      }
    );
    interceptedModelMessage.isResponseComplete = true;
    const toolMessage = addMessageToConversation(conversation, 'tool', '{"items":[]}', {
      parentId: interceptedModelMessage.id,
      toolName: 'tasklist',
      toolArguments: { command: 'list' },
    });
    const continuationModelMessage = addMessageToConversation(
      conversation,
      'model',
      'The task list is currently empty.',
      {
        parentId: toolMessage.id,
      }
    );
    continuationModelMessage.isResponseComplete = true;
    harness.conversations.push(conversation);
    harness.activeConversationId.value = conversation.id;
    harness.state.modelReady = true;

    harness.engine.generate.mockImplementation((_prompt, handlers) => {
      handlers.onComplete('Here is a regenerated answer.');
    });

    harness.controller.regenerateFromMessage(continuationModelMessage.id);

    expect(harness.engine.generate).toHaveBeenCalledTimes(1);
    expect(harness.engine.generate.mock.calls[0][0]).toEqual([
      {
        role: 'user',
        content: 'Please test the tool.',
      },
    ]);
    const regeneratedModelMessages = conversation.messageNodes.filter(
      (message) => message.role === 'model' && message.parentId === userMessage.id
    );
    expect(regeneratedModelMessages).toHaveLength(2);
    expect(regeneratedModelMessages.at(-1)?.text).toBe('Here is a regenerated answer.');
  });

  test('reuses the originating model card when continuing after a tool call', async () => {
    const harness = createControllerHarness();
    const conversation = createConversation({ id: 'conversation-1', modelId: 'test-model' });
    const userMessage = addMessageToConversation(conversation, 'user', 'Where am I?');
    harness.conversations.push(conversation);
    harness.activeConversationId.value = conversation.id;
    harness.state.modelReady = true;

    const originatingModelElement = { nodeName: 'LI', dataset: { messageId: 'originating-model' } };
    harness.dependencies.findMessageElement = vi
      .fn()
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(originatingModelElement);
    harness.dependencies.detectToolCalls
      .mockReturnValueOnce([
        {
          name: 'get_current_location',
          arguments: {},
          rawText: '{"name":"get_current_location","parameters":{}}',
          format: 'json',
        },
      ])
      .mockReturnValueOnce([]);
    harness.dependencies.executeToolCall.mockResolvedValue({
      toolName: 'get_current_location',
      arguments: {},
      resultText: '{"location":"Milwaukee, Wisconsin, United States"}',
    });

    harness.engine.generate
      .mockImplementationOnce((_prompt, handlers) => {
        handlers.onComplete('{"name":"get_current_location","parameters":{}}');
      })
      .mockImplementationOnce((_prompt, handlers) => {
        handlers.onComplete('You are currently located in Milwaukee, Wisconsin, United States.');
      });

    harness.controller.startModelGeneration(
      conversation,
      buildPromptForConversationLeaf(conversation),
      {
        parentMessageId: userMessage.id,
      }
    );

    await Promise.resolve();
    await Promise.resolve();

    const modelMessages = conversation.messageNodes.filter((message) => message.role === 'model');
    expect(modelMessages).toHaveLength(2);
    expect(harness.dependencies.addMessageElement).toHaveBeenCalledTimes(1);
    const firstAddMessageCall = /** @type {any[] | undefined} */ (
      harness.dependencies.addMessageElement.mock.calls.at(0)
    );
    expect(firstAddMessageCall?.[0]?.id).toBe(modelMessages[0]?.id);
    expect(harness.dependencies.findMessageElement).toHaveBeenNthCalledWith(
      2,
      modelMessages[0]?.id
    );
    expect(harness.dependencies.updateModelMessageElement).toHaveBeenLastCalledWith(
      modelMessages[0],
      originatingModelElement
    );
  });

  test('stores a failed web lookup envelope when tool execution throws', async () => {
    const harness = createControllerHarness();
    const conversation = createConversation({ id: 'conversation-web', modelId: 'test-model' });
    const userMessage = addMessageToConversation(conversation, 'user', 'Find current world news.');
    harness.conversations.push(conversation);
    harness.activeConversationId.value = conversation.id;
    harness.state.modelReady = true;
    harness.dependencies.detectToolCalls
      .mockReturnValueOnce([
        {
          name: 'web_lookup',
          arguments: { input: 'world news today' },
          rawText: '{"name":"web_lookup","parameters":{"input":"world news today"}}',
          format: 'json',
        },
      ])
      .mockReturnValueOnce([]);
    harness.dependencies.executeToolCall.mockRejectedValue(new Error('Failed to fetch'));

    harness.engine.generate
      .mockImplementationOnce((_prompt, handlers) => {
        handlers.onComplete('{"name":"web_lookup","parameters":{"input":"world news today"}}');
      })
      .mockImplementationOnce((_prompt, handlers) => {
        handlers.onComplete('The lookup failed, so I need another approach.');
      });

    harness.controller.startModelGeneration(
      conversation,
      buildPromptForConversationLeaf(conversation),
      {
        parentMessageId: userMessage.id,
      }
    );

    await Promise.resolve();
    await Promise.resolve();

    const toolMessage = conversation.messageNodes.find((message) => message.role === 'tool');
    expect(toolMessage?.toolName).toBe('web_lookup');
    expect(toolMessage?.toolResult).toBe(
      JSON.stringify({
        status: 'failed',
        body: 'Failed to fetch',
        message:
          'Use a direct https URL and retry with a simpler page if the request or extraction fails.',
      })
    );
  });

  test('fixes a continuation model message after a tool call', async () => {
    const harness = createControllerHarness();
    const conversation = createConversation({ id: 'conversation-1', modelId: 'test-model' });
    const userMessage = addMessageToConversation(conversation, 'user', 'Please test the tool.');
    const interceptedModelMessage = addMessageToConversation(
      conversation,
      'model',
      'I am checking the planner now.',
      {
        parentId: userMessage.id,
        toolCalls: [
          {
            name: 'tasklist',
            arguments: { command: 'list' },
            rawText: '{"name":"tasklist","parameters":{"command":"list"}}',
            format: 'json',
          },
        ],
      }
    );
    interceptedModelMessage.isResponseComplete = true;
    const toolMessage = addMessageToConversation(conversation, 'tool', '{"items":[]}', {
      parentId: interceptedModelMessage.id,
      toolName: 'tasklist',
      toolArguments: { command: 'list' },
    });
    const continuationModelMessage = addMessageToConversation(
      conversation,
      'model',
      'The task list is currently empty.',
      {
        parentId: toolMessage.id,
      }
    );
    continuationModelMessage.isResponseComplete = true;
    harness.conversations.push(conversation);
    harness.activeConversationId.value = conversation.id;
    harness.state.modelReady = true;
    harness.dependencies.runOrchestration.mockResolvedValue({
      finalPrompt: 'Rewrite the answer clearly.',
      finalOutput: '',
    });

    harness.engine.generate.mockImplementation((_prompt, handlers) => {
      handlers.onComplete('Here is a fixed answer.');
    });

    await harness.controller.fixResponseFromMessage(continuationModelMessage.id);

    expect(harness.dependencies.runOrchestration).toHaveBeenCalledWith(
      harness.dependencies.fixOrchestration,
      {
        userPrompt: 'Please test the tool.',
        assistantResponse: 'The task list is currently empty.',
      },
      {
        runFinalStep: false,
      }
    );
    expect(harness.engine.generate).toHaveBeenCalledTimes(1);
  });

  test('queues conversation persistence after completion instead of on every streamed token', () => {
    const harness = createControllerHarness();
    const conversation = createConversation({ id: 'conversation-1', modelId: 'test-model' });
    const userMessage = addMessageToConversation(conversation, 'user', 'Stream a short reply.');
    harness.conversations.push(conversation);
    harness.activeConversationId.value = conversation.id;
    harness.state.modelReady = true;

    harness.engine.generate.mockImplementation((_prompt, handlers) => {
      handlers.onToken('Hello');
      handlers.onToken(' world');
      expect(harness.dependencies.queueConversationStateSave).not.toHaveBeenCalled();
      handlers.onComplete('Hello world');
    });

    harness.controller.startModelGeneration(
      conversation,
      buildPromptForConversationLeaf(conversation),
      {
        parentMessageId: userMessage.id,
      }
    );

    expect(harness.dependencies.queueConversationStateSave).toHaveBeenCalledTimes(1);
  });
});
