import {
  ORCHESTRATION_KINDS,
  getActiveOrchestrationKind,
  isBlockingOrchestrationState,
  isEngineBusy,
  isEngineReady,
  isMessageEditActive,
  isOrchestrationRunningState,
  setGenerating,
  setLoadingModel,
  setModelReady,
  setOrchestrationRunning,
} from './app-state.js';

/**
 * @param {any} value
 * @returns {string}
 */
function toErrorMessage(value) {
  if (value instanceof Error) {
    return value.message;
  }
  return String(value || 'Unknown error');
}

function isAbortError(value) {
  return globalThis.DOMException && value instanceof globalThis.DOMException
    ? value.name === 'AbortError'
    : value instanceof Error && value.name === 'AbortError';
}

function buildFailedToolResultText(toolCall, error) {
  const toolName = typeof toolCall?.name === 'string' ? toolCall.name.trim() : '';
  const result = {
    status: 'failed',
    body: toErrorMessage(error),
  };
  if (toolName === 'web_lookup') {
    result.message =
      'Use a direct https URL and retry with a simpler page if the request or extraction fails.';
  }
  return JSON.stringify(result);
}

/**
 * @param {{
 *   state: any;
 *   engine: any;
 *   runOrchestration: (orchestration: any, variables?: Record<string, any>, options?: any) => Promise<{finalPrompt: string, finalOutput: any}>;
 *   renameOrchestration: any;
 *   fixOrchestration: any;
 *   readEngineConfig: () => any;
 *   persistInferencePreferences: () => void;
 *   getActiveConversation: () => any;
 *   findConversationById: (conversationId: string) => any;
 *   hasSelectedConversationWithHistory: () => boolean;
 *   normalizeModelId: (value: string) => string;
 *   getLoadedModelId?: () => string | null;
 *   getThinkingTagsForModel: (modelId: string) => any;
 *   detectToolCalls?: (rawText: string, modelId: string) => any[];
 *   executeToolCall?: (toolCall: any) => Promise<any>;
 *   getSelectedModelId: () => string;
 *   getRuntimeConfigForConversation?: (conversation: any) => any;
 *   addMessageToConversation: (conversation: any, role: string, text: string, options?: any) => any;
 *   buildPromptForConversationLeaf: (conversation: any, leafMessageId?: string) => any;
 *   getMessageNodeById: (conversation: any, messageId: string) => any;
 *   deriveConversationName: (conversation: any) => string;
 *   normalizeConversationName: (value: string) => string;
 *   removeLeafMessageFromConversation: (conversation: any, messageId: string) => boolean;
 *   parseThinkingText: (rawText: string, thinkingTags: any) => any;
 *   findMessageElement: (messageId: string) => any;
 *   addMessageElement: (message: any, options?: any) => any;
 *   updateModelMessageElement: (message: any, element: any) => void;
 *   renderTranscript: (options?: any) => void;
 *   renderConversationList: () => void;
 *   updateChatTitle: () => void;
 *   updateActionButtons: () => void;
 *   updateWelcomePanelVisibility: () => void;
 *   queueConversationStateSave: () => void;
 *   scrollTranscriptToBottom: () => void;
 *   setStatus: (message: string) => void;
 *   appendDebug: (message: string) => void;
 *   showProgressRegion: (visible: boolean) => void;
 *   clearLoadError: () => void;
 *   resetLoadProgressFiles: () => void;
 *   setLoadProgress: (progress: any) => void;
 *   showLoadError: (message: string) => void;
 *   applyPendingGenerationSettingsIfReady: () => void;
 *   markActiveIncompleteModelMessageComplete: () => void;
 *   scheduleTask?: (callback: () => void) => void;
 *   streamUpdateIntervalMs?: number;
 * }} dependencies
 */
export function createAppController(dependencies) {
  const scheduleTask =
    typeof dependencies?.scheduleTask === 'function'
      ? dependencies.scheduleTask
      : (callback) => window.setTimeout(callback, 0);
  const streamUpdateIntervalMs =
    Number.isFinite(dependencies?.streamUpdateIntervalMs) &&
    dependencies.streamUpdateIntervalMs >= 0
      ? Math.max(0, Math.trunc(dependencies.streamUpdateIntervalMs))
      : 120;
  let activeRenameAbortController = null;
  let activeRenameConversationId = '';

  function cancelBackgroundRenameIfNeeded() {
    if (
      !isOrchestrationRunningState(dependencies.state) ||
      getActiveOrchestrationKind(dependencies.state) !== ORCHESTRATION_KINDS.RENAME
    ) {
      return null;
    }

    return (async () => {
      const renameAbortController = activeRenameAbortController;
      const renameConversationId = activeRenameConversationId;
      if (renameAbortController && !renameAbortController.signal.aborted) {
        renameAbortController.abort();
      }

      try {
        await dependencies.engine.cancelGeneration();
      } catch (error) {
        dependencies.appendDebug(`Background rename cancellation failed: ${toErrorMessage(error)}`);
      }

      if (renameConversationId) {
        const conversation = dependencies.findConversationById(renameConversationId);
        if (conversation && !conversation.hasGeneratedName) {
          conversation.name = dependencies.deriveConversationName(conversation);
          conversation.hasGeneratedName = true;
          dependencies.renderConversationList();
          dependencies.updateChatTitle();
          dependencies.queueConversationStateSave();
          dependencies.appendDebug(
            'Canceled background rename and applied a deterministic conversation title.'
          );
        }
      }
    })();
  }

  function shouldDisposeEngineBeforeInit(nextConfig = {}) {
    const nextModelId = nextConfig.modelId
      ? dependencies.normalizeModelId(nextConfig.modelId)
      : null;
    const loadedModelId = dependencies.getLoadedModelId?.();
    const normalizedLoadedModelId = loadedModelId
      ? dependencies.normalizeModelId(loadedModelId)
      : null;
    const currentBackendPreference =
      typeof dependencies.engine?.config?.backendPreference === 'string'
        ? dependencies.engine.config.backendPreference.trim().toLowerCase()
        : '';
    const nextBackendPreference =
      typeof nextConfig.backendPreference === 'string'
        ? nextConfig.backendPreference.trim().toLowerCase()
        : '';

    return Boolean(
      dependencies.engine?.worker &&
      ((nextModelId && normalizedLoadedModelId && nextModelId !== normalizedLoadedModelId) ||
        (nextBackendPreference &&
          currentBackendPreference &&
          nextBackendPreference !== currentBackendPreference))
    );
  }

  async function initializeEngine() {
    const config = dependencies.readEngineConfig();
    dependencies.appendDebug(
      `Initialize requested (model=${config.modelId}, backendPreference=${config.backendPreference})`
    );
    if (shouldDisposeEngineBeforeInit(config)) {
      dependencies.engine.dispose();
      dependencies.appendDebug('Disposed current model worker before loading the new selection.');
    }
    setLoadingModel(dependencies.state, true);
    dependencies.clearLoadError();
    dependencies.resetLoadProgressFiles();
    dependencies.showProgressRegion(true);
    dependencies.setLoadProgress({ percent: 0, message: 'Starting model load...' });
    dependencies.updateActionButtons();
    dependencies.setStatus('Loading model...');
    try {
      await dependencies.engine.initialize(config);
      setModelReady(dependencies.state, true);
      setLoadingModel(dependencies.state, false);
      dependencies.setLoadProgress({ percent: 100, message: 'Model ready.' });
      dependencies.showProgressRegion(false);
      dependencies.appendDebug('Model initialization succeeded.');
      dependencies.updateActionButtons();
      dependencies.updateWelcomePanelVisibility();
      dependencies.updateChatTitle();
    } catch (error) {
      const message = toErrorMessage(error);
      setModelReady(dependencies.state, false);
      setLoadingModel(dependencies.state, false);
      dependencies.setStatus(`Error: ${message}`);
      dependencies.showLoadError(message);
      dependencies.appendDebug(`Model initialization failed: ${message}`);
      dependencies.updateActionButtons();
      dependencies.updateWelcomePanelVisibility();
      dependencies.updateChatTitle();
      throw error;
    }
  }

  async function reinitializeEngineFromSettings() {
    const pendingBackgroundRenameCancellation = cancelBackgroundRenameIfNeeded();
    if (pendingBackgroundRenameCancellation) {
      await pendingBackgroundRenameCancellation;
    }
    const nextConfig = dependencies.readEngineConfig();
    if (shouldDisposeEngineBeforeInit(nextConfig)) {
      dependencies.engine.dispose();
      dependencies.appendDebug('Disposed current model worker after model selection changed.');
    }
    dependencies.persistInferencePreferences();
    setModelReady(dependencies.state, false);
    dependencies.setStatus('Settings updated. Send a message to load the selected model.');
    dependencies.appendDebug('Inference settings changed; awaiting first message to load model.');
    dependencies.updateActionButtons();
    dependencies.updateWelcomePanelVisibility();
    dependencies.updateChatTitle();
  }

  async function loadModelForSelectedConversation() {
    const selectedModelId = dependencies.normalizeModelId(dependencies.getSelectedModelId());
    const rawLoadedModelId = dependencies.getLoadedModelId?.();
    const loadedModelId = rawLoadedModelId ? dependencies.normalizeModelId(rawLoadedModelId) : null;
    const selectedConversationModelReady =
      isEngineReady(dependencies.state) && loadedModelId === selectedModelId;
    if (
      selectedConversationModelReady ||
      isEngineBusy(dependencies.state) ||
      isBlockingOrchestrationState(dependencies.state)
    ) {
      return;
    }
    if (!dependencies.hasSelectedConversationWithHistory()) {
      return;
    }
    const pendingBackgroundRenameCancellation = cancelBackgroundRenameIfNeeded();
    if (pendingBackgroundRenameCancellation) {
      await pendingBackgroundRenameCancellation;
    }
    dependencies.persistInferencePreferences();
    dependencies.setStatus('Loading model for selected conversation...');
    try {
      await initializeEngine();
    } catch (_error) {
      // Error state already handled in initializeEngine.
    }
  }

  async function continueGenerationAfterToolCalls(
    activeConversation,
    modelMessage,
    toolCalls,
    { updateLastSpokenOnComplete = false } = {}
  ) {
    let parentMessageId = modelMessage.id;
    for (const toolCall of toolCalls) {
      let executionResult;
      try {
        executionResult = await dependencies.executeToolCall(toolCall);
        dependencies.appendDebug(`Executed tool: ${executionResult.toolName}`);
      } catch (error) {
        const message = toErrorMessage(error);
        executionResult = {
          toolName: toolCall?.name || 'unknown_tool',
          arguments:
            toolCall?.arguments && typeof toolCall.arguments === 'object' ? toolCall.arguments : {},
          resultText: buildFailedToolResultText(toolCall, error),
        };
        dependencies.appendDebug(`Tool execution failed: ${message}`);
      }
      const toolMessage = dependencies.addMessageToConversation(
        activeConversation,
        'tool',
        executionResult.resultText || '',
        {
          parentId: parentMessageId,
          toolName: executionResult.toolName,
          toolArguments: executionResult.arguments,
          toolResultData:
            executionResult.toolName === 'run_shell_command' &&
            executionResult.result &&
            typeof executionResult.result === 'object'
              ? executionResult.result
              : undefined,
        }
      );
      parentMessageId = toolMessage.id;
      dependencies.renderTranscript({ scrollToBottom: false });
      dependencies.scrollTranscriptToBottom();
      dependencies.queueConversationStateSave();
    }
    dependencies.setStatus('Tool result ready. Continuing response...');
    void startModelGeneration(
      activeConversation,
      dependencies.buildPromptForConversationLeaf(activeConversation),
      {
        parentMessageId,
        updateLastSpokenOnComplete,
      }
    );
  }

  function findOriginatingUserMessage(conversation, message) {
    if (!conversation || !message) {
      return null;
    }
    let cursor =
      typeof message.parentId === 'string' && message.parentId
        ? dependencies.getMessageNodeById(conversation, message.parentId)
        : null;
    while (cursor) {
      if (cursor.role === 'user') {
        return cursor;
      }
      cursor =
        typeof cursor.parentId === 'string' && cursor.parentId
          ? dependencies.getMessageNodeById(conversation, cursor.parentId)
          : null;
    }
    return null;
  }

  function findVisibleModelTurnMessage(conversation, modelMessage) {
    if (!conversation || modelMessage?.role !== 'model') {
      return modelMessage || null;
    }
    let cursor = modelMessage;
    while (cursor?.parentId) {
      const parentMessage = dependencies.getMessageNodeById(conversation, cursor.parentId);
      if (!parentMessage) {
        break;
      }
      if (parentMessage.role === 'tool') {
        const originatingModelMessage =
          typeof parentMessage.parentId === 'string' && parentMessage.parentId
            ? dependencies.getMessageNodeById(conversation, parentMessage.parentId)
            : null;
        if (originatingModelMessage?.role === 'model') {
          cursor = originatingModelMessage;
          continue;
        }
      }
      break;
    }
    return cursor;
  }

  async function startModelGeneration(activeConversation, prompt, options = {}) {
    if (!activeConversation) {
      return;
    }
    if (isBlockingOrchestrationState(dependencies.state)) {
      return;
    }
    const pendingBackgroundRenameCancellation = cancelBackgroundRenameIfNeeded();
    if (pendingBackgroundRenameCancellation) {
      await pendingBackgroundRenameCancellation;
    }
    const selectedModelId = dependencies.normalizeModelId(dependencies.getSelectedModelId());
    const thinkingTags = dependencies.getThinkingTagsForModel(selectedModelId);
    const parentMessageId =
      typeof options.parentMessageId === 'string' && options.parentMessageId.trim()
        ? options.parentMessageId.trim()
        : activeConversation.activeLeafMessageId;
    const existingModelMessageId =
      typeof options.existingModelMessageId === 'string' && options.existingModelMessageId.trim()
        ? options.existingModelMessageId.trim()
        : '';
    const clearExistingMessageBeforeStream = Boolean(options.clearExistingMessageBeforeStream);
    const updateLastSpokenOnComplete = Boolean(options.updateLastSpokenOnComplete);
    const existingModelMessage = existingModelMessageId
      ? dependencies.getMessageNodeById(activeConversation, existingModelMessageId)
      : null;
    const canReuseExistingModelMessage =
      existingModelMessage?.role === 'model' &&
      !existingModelMessage.isResponseComplete &&
      existingModelMessage.parentId === parentMessageId;
    const modelMessage = canReuseExistingModelMessage
      ? existingModelMessage
      : dependencies.addMessageToConversation(activeConversation, 'model', '', {
          parentId: parentMessageId,
        });

    if (canReuseExistingModelMessage && clearExistingMessageBeforeStream) {
      modelMessage.text = '';
      modelMessage.response = '';
      modelMessage.thoughts = '';
      modelMessage.hasThinking = false;
      modelMessage.isThinkingComplete = false;
      modelMessage.toolCalls = [];
    }

    function normalizeToolCallInterception(toolCalls, visibleResponseText) {
      const detectedToolCalls = Array.isArray(toolCalls) ? toolCalls.filter(Boolean) : [];
      if (!detectedToolCalls.length) {
        return null;
      }
      const primaryToolCall = detectedToolCalls[0];
      const rawToolCallText =
        typeof primaryToolCall?.rawText === 'string' ? primaryToolCall.rawText.trim() : '';
      const fullResponseText = String(visibleResponseText || '');
      const rawIndex = rawToolCallText ? fullResponseText.indexOf(rawToolCallText) : -1;
      const narrationText =
        rawIndex >= 0 ? fullResponseText.slice(0, rawIndex).trimEnd() : fullResponseText.trimEnd();
      return {
        toolCalls: [primaryToolCall],
        toolCallPromptText: rawToolCallText,
        narrationText,
      };
    }

    modelMessage.isResponseComplete = false;
    modelMessage.toolCalls = Array.isArray(modelMessage.toolCalls) ? modelMessage.toolCalls : [];
    activeConversation.activeLeafMessageId = modelMessage.id;
    const visibleModelTurnMessage = findVisibleModelTurnMessage(activeConversation, modelMessage);
    const modelBubbleItem =
      dependencies.findMessageElement(visibleModelTurnMessage?.id || '') ||
      dependencies.addMessageElement(visibleModelTurnMessage || modelMessage);
    if (modelBubbleItem) {
      dependencies.updateModelMessageElement(
        visibleModelTurnMessage || modelMessage,
        modelBubbleItem
      );
    }
    let streamedText = '';
    let isInterceptingToolCall = false;
    let pendingStreamUpdateTimerId = null;
    let lastStreamUpdateAt = 0;

    function clearPendingStreamUpdate() {
      if (pendingStreamUpdateTimerId === null) {
        return;
      }
      globalThis.clearTimeout(pendingStreamUpdateTimerId);
      pendingStreamUpdateTimerId = null;
    }

    function getStreamUpdateTimestamp() {
      if (typeof globalThis.performance?.now === 'function') {
        return globalThis.performance.now();
      }
      return Date.now();
    }

    function applyStreamUpdate({ allowToolCallInterception = true } = {}) {
      clearPendingStreamUpdate();
      if (isInterceptingToolCall) {
        return true;
      }
      if (modelMessage.isFixPreparing) {
        modelMessage.isFixPreparing = false;
      }
      const parsed = dependencies.parseThinkingText(streamedText, thinkingTags);
      if (thinkingTags) {
        modelMessage.thoughts = parsed.thoughts;
        modelMessage.response = parsed.response.trimStart();
        modelMessage.hasThinking = parsed.hasThinking || Boolean(parsed.thoughts.trim());
        modelMessage.isThinkingComplete = parsed.isThinkingComplete;
        modelMessage.text = modelMessage.response;
      } else {
        modelMessage.response = streamedText.trimStart();
        modelMessage.text = modelMessage.response;
      }
      if (allowToolCallInterception) {
        const interceptedToolCall =
          typeof dependencies.detectToolCalls === 'function'
            ? normalizeToolCallInterception(
                dependencies.detectToolCalls(
                  modelMessage.response || modelMessage.text || '',
                  selectedModelId
                ),
                modelMessage.response || modelMessage.text || ''
              )
            : null;
        if (interceptedToolCall) {
          isInterceptingToolCall = true;
          modelMessage.toolCalls = interceptedToolCall.toolCalls;
          modelMessage.response = interceptedToolCall.narrationText;
          modelMessage.text = interceptedToolCall.narrationText;
          if (modelMessage.content && typeof modelMessage.content === 'object') {
            modelMessage.content.llmRepresentation = interceptedToolCall.toolCallPromptText;
          }
          dependencies.updateModelMessageElement(
            visibleModelTurnMessage || modelMessage,
            modelBubbleItem
          );
          dependencies.scrollTranscriptToBottom();
          dependencies.appendDebug('Detected emitted tool call during streaming.');
          dependencies.setStatus('Running tool call...');
          scheduleTask(() => {
            void dependencies.engine.cancelGeneration().then(
              () => {
                void continueGenerationAfterToolCalls(
                  activeConversation,
                  modelMessage,
                  interceptedToolCall.toolCalls,
                  {
                    updateLastSpokenOnComplete,
                  }
                );
              },
              (error) => {
                const message = toErrorMessage(error);
                modelMessage.text = `Tool call interception failed: ${message}`;
                modelMessage.response = modelMessage.text;
                modelMessage.thoughts = '';
                modelMessage.hasThinking = false;
                modelMessage.isThinkingComplete = false;
                modelMessage.isResponseComplete = true;
                setGenerating(dependencies.state, false);
                dependencies.updateModelMessageElement(
                  visibleModelTurnMessage || modelMessage,
                  modelBubbleItem
                );
                dependencies.updateActionButtons();
                dependencies.applyPendingGenerationSettingsIfReady();
                dependencies.setStatus('Generation failed');
                dependencies.appendDebug(`Tool call interception failed: ${message}`);
                dependencies.queueConversationStateSave();
              }
            );
          });
          return true;
        }
      }
      lastStreamUpdateAt = getStreamUpdateTimestamp();
      dependencies.updateModelMessageElement(
        visibleModelTurnMessage || modelMessage,
        modelBubbleItem
      );
      dependencies.scrollTranscriptToBottom();
      return false;
    }

    function scheduleStreamUpdate() {
      if (streamUpdateIntervalMs === 0) {
        applyStreamUpdate();
        return;
      }
      const now = getStreamUpdateTimestamp();
      const elapsed = lastStreamUpdateAt > 0 ? now - lastStreamUpdateAt : streamUpdateIntervalMs;
      if (elapsed >= streamUpdateIntervalMs) {
        applyStreamUpdate();
        return;
      }
      if (pendingStreamUpdateTimerId !== null) {
        return;
      }
      pendingStreamUpdateTimerId = globalThis.setTimeout(
        () => {
          applyStreamUpdate();
        },
        Math.max(0, streamUpdateIntervalMs - elapsed)
      );
    }

    setGenerating(dependencies.state, true);
    dependencies.updateActionButtons();

    try {
      dependencies.engine.generate(prompt, {
        runtime:
          typeof dependencies.getRuntimeConfigForConversation === 'function'
            ? dependencies.getRuntimeConfigForConversation(activeConversation)
            : undefined,
        generationConfig: dependencies.state.activeGenerationConfig,
        onToken: (chunk) => {
          if (isInterceptingToolCall) {
            return;
          }
          streamedText += chunk;
          scheduleStreamUpdate();
        },
        onComplete: (finalText) => {
          if (isInterceptingToolCall) {
            return;
          }
          streamedText = String(finalText || streamedText);
          if (applyStreamUpdate()) {
            return;
          }
          const parsed = dependencies.parseThinkingText(finalText || streamedText, thinkingTags);
          modelMessage.thoughts = parsed.thoughts;
          modelMessage.response = parsed.response.trimStart();
          modelMessage.hasThinking = parsed.hasThinking || Boolean(parsed.thoughts.trim());
          modelMessage.isThinkingComplete =
            parsed.isThinkingComplete || (modelMessage.hasThinking && !thinkingTags);
          modelMessage.text = modelMessage.response || '[No output]';
          modelMessage.toolCalls =
            typeof dependencies.detectToolCalls === 'function'
              ? dependencies.detectToolCalls(
                  modelMessage.response || modelMessage.text || '',
                  selectedModelId
                )
              : [];
          const interceptedToolCall = normalizeToolCallInterception(
            modelMessage.toolCalls,
            modelMessage.response || modelMessage.text || ''
          );
          if (interceptedToolCall) {
            modelMessage.toolCalls = interceptedToolCall.toolCalls;
            modelMessage.response = interceptedToolCall.narrationText;
            modelMessage.text = interceptedToolCall.narrationText;
            if (modelMessage.content && typeof modelMessage.content === 'object') {
              modelMessage.content.llmRepresentation = interceptedToolCall.toolCallPromptText;
            }
          }
          modelMessage.isResponseComplete = true;
          dependencies.updateModelMessageElement(
            visibleModelTurnMessage || modelMessage,
            modelBubbleItem
          );
          dependencies.scrollTranscriptToBottom();
          const hasDetectedToolCalls =
            Array.isArray(modelMessage.toolCalls) && modelMessage.toolCalls.length > 0;
          if (updateLastSpokenOnComplete && !hasDetectedToolCalls) {
            activeConversation.lastSpokenLeafMessageId = modelMessage.id;
          }

          if (
            !hasDetectedToolCalls &&
            !activeConversation.hasGeneratedName &&
            modelMessage.text !== '[No output]'
          ) {
            const parentUserMessage = modelMessage.parentId
              ? dependencies.getMessageNodeById(activeConversation, modelMessage.parentId)
              : null;
            const renameInputs = {
              userPrompt: parentUserMessage?.text || '',
              assistantResponse: modelMessage.response || modelMessage.text || '',
            };
            scheduleTask(() => {
              void runRenameChatOrchestration(activeConversation.id, renameInputs);
            });
          }

          dependencies.appendDebug('Generation completed.');
          if (hasDetectedToolCalls) {
            dependencies.appendDebug(
              `Detected ${modelMessage.toolCalls.length} emitted tool call${modelMessage.toolCalls.length === 1 ? '' : 's'}.`
            );
          }
          dependencies.queueConversationStateSave();
          if (hasDetectedToolCalls && typeof dependencies.executeToolCall === 'function') {
            dependencies.setStatus('Running tool call...');
            scheduleTask(() => {
              void continueGenerationAfterToolCalls(
                activeConversation,
                modelMessage,
                modelMessage.toolCalls,
                {
                  updateLastSpokenOnComplete,
                }
              );
            });
            return;
          }
          setGenerating(dependencies.state, false);
          dependencies.updateActionButtons();
          dependencies.applyPendingGenerationSettingsIfReady();
        },
        onError: (message) => {
          if (isInterceptingToolCall) {
            return;
          }
          clearPendingStreamUpdate();
          modelMessage.text = `Generation error: ${message}`;
          modelMessage.response = modelMessage.text;
          modelMessage.thoughts = '';
          modelMessage.hasThinking = false;
          modelMessage.isThinkingComplete = false;
          modelMessage.isResponseComplete = true;
          dependencies.updateModelMessageElement(
            visibleModelTurnMessage || modelMessage,
            modelBubbleItem
          );
          dependencies.scrollTranscriptToBottom();
          if (updateLastSpokenOnComplete) {
            activeConversation.lastSpokenLeafMessageId = modelMessage.id;
          }
          setGenerating(dependencies.state, false);
          dependencies.updateActionButtons();
          dependencies.applyPendingGenerationSettingsIfReady();
          dependencies.setStatus('Generation failed');
          dependencies.appendDebug(`Generation error: ${message}`);
          dependencies.queueConversationStateSave();
        },
      });
    } catch (error) {
      clearPendingStreamUpdate();
      const message = toErrorMessage(error);
      modelMessage.text = `Generation error: ${message}`;
      modelMessage.response = modelMessage.text;
      modelMessage.thoughts = '';
      modelMessage.hasThinking = false;
      modelMessage.isThinkingComplete = false;
      modelMessage.isResponseComplete = true;
      dependencies.updateModelMessageElement(
        visibleModelTurnMessage || modelMessage,
        modelBubbleItem
      );
      dependencies.scrollTranscriptToBottom();
      if (updateLastSpokenOnComplete) {
        activeConversation.lastSpokenLeafMessageId = modelMessage.id;
      }
      setGenerating(dependencies.state, false);
      dependencies.updateActionButtons();
      dependencies.applyPendingGenerationSettingsIfReady();
      dependencies.setStatus('Generation failed');
      dependencies.appendDebug(`Generation error: ${message}`);
      dependencies.queueConversationStateSave();
    }
  }

  async function stopGeneration() {
    dependencies.setStatus('Stopping generation...');
    try {
      await dependencies.engine.cancelGeneration();
      setModelReady(dependencies.state, true);
      dependencies.setStatus('Stopped');
      dependencies.appendDebug('Generation canceled by user.');
    } catch (error) {
      const message = toErrorMessage(error);
      setModelReady(dependencies.state, false);
      dependencies.setStatus(`Error: ${message}`);
      dependencies.appendDebug(`Cancel failed: ${message}`);
    } finally {
      dependencies.markActiveIncompleteModelMessageComplete();
      setGenerating(dependencies.state, false);
      dependencies.updateActionButtons();
      dependencies.applyPendingGenerationSettingsIfReady();
      dependencies.queueConversationStateSave();
    }
  }

  async function regenerateFromMessage(messageId) {
    if (
      !messageId ||
      isEngineBusy(dependencies.state) ||
      isBlockingOrchestrationState(dependencies.state) ||
      isMessageEditActive(dependencies.state)
    ) {
      return;
    }
    if (!isEngineReady(dependencies.state)) {
      dependencies.setStatus('Send a message first to load the model before regenerating.');
      dependencies.appendDebug('Regenerate blocked: model not ready.');
      return;
    }

    const activeConversation = dependencies.getActiveConversation();
    if (!activeConversation) {
      return;
    }
    const pendingBackgroundRenameCancellation = cancelBackgroundRenameIfNeeded();
    if (pendingBackgroundRenameCancellation) {
      await pendingBackgroundRenameCancellation;
    }

    const targetModelMessage = dependencies.getMessageNodeById(activeConversation, messageId);
    if (!targetModelMessage || targetModelMessage.role !== 'model') {
      return;
    }

    const parentUserMessage = findOriginatingUserMessage(activeConversation, targetModelMessage);
    if (!parentUserMessage || parentUserMessage.role !== 'user') {
      dependencies.setStatus('Unable to regenerate: no user message found.');
      dependencies.appendDebug(
        'Regenerate failed: target model message has no preceding user message.'
      );
      return;
    }

    activeConversation.activeLeafMessageId = parentUserMessage.id;
    dependencies.renderTranscript();
    dependencies.queueConversationStateSave();
    void startModelGeneration(
      activeConversation,
      dependencies.buildPromptForConversationLeaf(activeConversation),
      {
        parentMessageId: parentUserMessage.id,
      }
    );
  }

  async function runRenameChatOrchestration(conversationId, inputs) {
    if (
      !conversationId ||
      isEngineBusy(dependencies.state) ||
      isOrchestrationRunningState(dependencies.state) ||
      !isEngineReady(dependencies.state)
    ) {
      return;
    }
    const activeConversation = dependencies.findConversationById(conversationId);
    if (!activeConversation || activeConversation.hasGeneratedName) {
      return;
    }
    const renameAbortController = new AbortController();
    activeRenameAbortController = renameAbortController;
    activeRenameConversationId = conversationId;
    setOrchestrationRunning(dependencies.state, true, {
      kind: ORCHESTRATION_KINDS.RENAME,
      blocksUi: false,
    });
    dependencies.updateActionButtons();
    dependencies.setStatus('Generating conversation title...');
    try {
      const { finalOutput } = await dependencies.runOrchestration(
        dependencies.renameOrchestration,
        inputs,
        {
          signal: renameAbortController.signal,
        }
      );
      const nextName = dependencies.normalizeConversationName(finalOutput);
      activeConversation.name = nextName || dependencies.deriveConversationName(activeConversation);
      activeConversation.hasGeneratedName = true;
      dependencies.renderConversationList();
      dependencies.updateChatTitle();
      dependencies.queueConversationStateSave();
      dependencies.setStatus('Conversation title generated.');
    } catch (error) {
      if (isAbortError(error)) {
        dependencies.appendDebug('Background conversation rename canceled.');
        return;
      }
      const message = toErrorMessage(error);
      activeConversation.name = dependencies.deriveConversationName(activeConversation);
      activeConversation.hasGeneratedName = true;
      dependencies.renderConversationList();
      dependencies.updateChatTitle();
      dependencies.queueConversationStateSave();
      dependencies.appendDebug(`Rename orchestration failed: ${message}`);
      dependencies.setStatus('Conversation title generated.');
    } finally {
      if (activeRenameAbortController === renameAbortController) {
        activeRenameAbortController = null;
        activeRenameConversationId = '';
      }
      setOrchestrationRunning(dependencies.state, false);
      dependencies.updateActionButtons();
    }
  }

  async function fixResponseFromMessage(messageId) {
    if (
      !messageId ||
      isEngineBusy(dependencies.state) ||
      isBlockingOrchestrationState(dependencies.state) ||
      isMessageEditActive(dependencies.state)
    ) {
      return;
    }
    if (!isEngineReady(dependencies.state)) {
      dependencies.setStatus('Send a message first to load the model before using Fix.');
      dependencies.appendDebug('Fix blocked: model not ready.');
      return;
    }

    const activeConversation = dependencies.getActiveConversation();
    if (!activeConversation) {
      return;
    }
    const pendingBackgroundRenameCancellation = cancelBackgroundRenameIfNeeded();
    if (pendingBackgroundRenameCancellation) {
      await pendingBackgroundRenameCancellation;
    }
    const targetModelMessage = dependencies.getMessageNodeById(activeConversation, messageId);
    if (!targetModelMessage || targetModelMessage.role !== 'model') {
      return;
    }
    if (!targetModelMessage.isResponseComplete) {
      return;
    }
    const parentUserMessage = findOriginatingUserMessage(activeConversation, targetModelMessage);
    if (!parentUserMessage || parentUserMessage.role !== 'user') {
      dependencies.setStatus('Unable to fix response: no user message found.');
      dependencies.appendDebug('Fix failed: target model message has no preceding user message.');
      return;
    }

    const conversationId = activeConversation.id;
    const parentUserMessageId = parentUserMessage.id;
    const previousActiveLeafMessageId = activeConversation.activeLeafMessageId;
    const orchestrationInputs = {
      userPrompt: parentUserMessage.text || '',
      assistantResponse: targetModelMessage.response || targetModelMessage.text || '',
    };
    const pendingFixMessage = dependencies.addMessageToConversation(
      activeConversation,
      'model',
      '',
      {
        parentId: parentUserMessage.id,
      }
    );
    pendingFixMessage.thoughts = '';
    pendingFixMessage.response = targetModelMessage.response || targetModelMessage.text || '';
    pendingFixMessage.text = pendingFixMessage.response;
    pendingFixMessage.hasThinking = false;
    pendingFixMessage.isThinkingComplete = false;
    pendingFixMessage.isResponseComplete = false;
    pendingFixMessage.isFixPreparing = true;
    dependencies.renderTranscript({ scrollToBottom: false });
    dependencies.queueConversationStateSave();

    let fixPrompt = '';
    setOrchestrationRunning(dependencies.state, true, {
      kind: ORCHESTRATION_KINDS.FIX,
      blocksUi: true,
    });
    dependencies.updateActionButtons();
    dependencies.setStatus('Preparing response fix...');
    try {
      const result = await dependencies.runOrchestration(
        dependencies.fixOrchestration,
        orchestrationInputs,
        {
          runFinalStep: false,
        }
      );
      fixPrompt = result.finalPrompt;
    } catch (error) {
      const message = toErrorMessage(error);
      dependencies.removeLeafMessageFromConversation(activeConversation, pendingFixMessage.id);
      activeConversation.activeLeafMessageId = previousActiveLeafMessageId;
      dependencies.renderTranscript({ scrollToBottom: false });
      dependencies.queueConversationStateSave();
      dependencies.setStatus('Fix orchestration failed.');
      dependencies.appendDebug(`Fix orchestration error: ${message}`);
      return;
    } finally {
      setOrchestrationRunning(dependencies.state, false);
      dependencies.updateActionButtons();
    }

    const refreshedConversation = dependencies.findConversationById(conversationId);
    if (!refreshedConversation) {
      return;
    }
    const refreshedParentUserMessage = dependencies.getMessageNodeById(
      refreshedConversation,
      parentUserMessageId
    );
    if (!refreshedParentUserMessage || refreshedParentUserMessage.role !== 'user') {
      dependencies.setStatus('Unable to fix response: no user message found.');
      dependencies.appendDebug('Fix aborted: parent user message no longer exists.');
      return;
    }

    dependencies.setStatus('Fixing response...');
    void startModelGeneration(refreshedConversation, fixPrompt, {
      parentMessageId: refreshedParentUserMessage.id,
      existingModelMessageId: pendingFixMessage.id,
      clearExistingMessageBeforeStream: true,
    });
  }

  return {
    fixResponseFromMessage,
    initializeEngine,
    loadModelForSelectedConversation,
    regenerateFromMessage,
    reinitializeEngineFromSettings,
    runRenameChatOrchestration,
    startModelGeneration,
    stopGeneration,
  };
}
