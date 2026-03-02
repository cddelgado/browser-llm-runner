import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import 'bootstrap-icons/font/bootstrap-icons.css';
import Tooltip from 'bootstrap/js/dist/tooltip';
import './styles.css';
import { LLMEngineClient } from './llm/engine-client.js';
import modelCatalog from './config/models.json';
import { loadConversationState, saveConversationState } from './state/conversation-store.js';

const THEME_STORAGE_KEY = 'ui-theme-preference';
const SHOW_THINKING_STORAGE_KEY = 'ui-show-thinking';
const MODEL_STORAGE_KEY = 'llm-model-preference';
const BACKEND_STORAGE_KEY = 'llm-backend-preference';
const MODEL_GENERATION_SETTINGS_STORAGE_KEY = 'llm-model-generation-settings';
const UNTITLED_CONVERSATION_PREFIX = 'New Conversation';
const TOKEN_STEP = 8;
const MIN_TOKEN_LIMIT = 8;
const TEMPERATURE_STEP = 0.1;
const DEFAULT_GENERATION_LIMITS = Object.freeze({
  defaultMaxOutputTokens: 1024,
  maxOutputTokens: 32768,
  defaultMaxContextTokens: 32768,
  maxContextTokens: 32768,
  minTemperature: 0.1,
  maxTemperature: 2.0,
  defaultTemperature: 0.6,
});

function toPositiveInt(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function toFiniteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function quantizeTemperature(value, min, max) {
  const parsed = Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed)) {
    return Number(min.toFixed(1));
  }
  const bounded = clamp(parsed, min, max);
  const steps = Math.round((bounded - min) / TEMPERATURE_STEP);
  const quantized = min + steps * TEMPERATURE_STEP;
  return Number(clamp(quantized, min, max).toFixed(1));
}

function normalizeGenerationLimits(rawLimits) {
  const maxContextTokens = toPositiveInt(rawLimits?.maxContextTokens, DEFAULT_GENERATION_LIMITS.maxContextTokens);
  const maxOutputTokens = toPositiveInt(rawLimits?.maxOutputTokens, maxContextTokens);
  const minTemperature = toFiniteNumber(
    rawLimits?.minTemperature,
    DEFAULT_GENERATION_LIMITS.minTemperature,
  );
  const maxTemperature = toFiniteNumber(
    rawLimits?.maxTemperature,
    DEFAULT_GENERATION_LIMITS.maxTemperature,
  );
  const boundedMinTemperature = Number(Math.min(minTemperature, maxTemperature).toFixed(1));
  const boundedMaxTemperature = Number(Math.max(minTemperature, maxTemperature).toFixed(1));
  const defaultTemperature = quantizeTemperature(
    toFiniteNumber(rawLimits?.defaultTemperature, DEFAULT_GENERATION_LIMITS.defaultTemperature),
    boundedMinTemperature,
    boundedMaxTemperature,
  );
  const defaultMaxContextTokens = clamp(
    toPositiveInt(rawLimits?.defaultMaxContextTokens, maxContextTokens),
    MIN_TOKEN_LIMIT,
    maxContextTokens,
  );
  const defaultMaxOutputTokens = clamp(
    toPositiveInt(rawLimits?.defaultMaxOutputTokens, DEFAULT_GENERATION_LIMITS.defaultMaxOutputTokens),
    MIN_TOKEN_LIMIT,
    maxOutputTokens,
  );
  return {
    defaultMaxOutputTokens: Math.min(defaultMaxOutputTokens, defaultMaxContextTokens),
    maxOutputTokens,
    defaultMaxContextTokens,
    maxContextTokens,
    minTemperature: boundedMinTemperature,
    maxTemperature: boundedMaxTemperature,
    defaultTemperature,
  };
}
const configuredModels = Array.isArray(modelCatalog?.models)
  ? modelCatalog.models
      .map((model) => {
        const id = typeof model?.id === 'string' ? model.id.trim() : '';
        if (!id) {
          return null;
        }
        const label =
          typeof model?.label === 'string' && model.label.trim() ? model.label.trim() : id;
        const openThinkingTag = model?.thinkingTags?.open;
        const closeThinkingTag = model?.thinkingTags?.close;
        const thinkingTags =
          typeof openThinkingTag === 'string' &&
          openThinkingTag &&
          typeof closeThinkingTag === 'string' &&
          closeThinkingTag &&
          openThinkingTag !== closeThinkingTag
            ? { open: openThinkingTag, close: closeThinkingTag }
            : null;
        const generation = normalizeGenerationLimits(model?.generation);
        return { id, label, features: model?.features || {}, thinkingTags, generation };
      })
      .filter(Boolean)
  : [];
const configuredDefaultModel =
  typeof modelCatalog?.defaultModelId === 'string' ? modelCatalog.defaultModelId.trim() : '';
const DEFAULT_MODEL = configuredDefaultModel || configuredModels[0]?.id || 'onnx-community/Qwen3-0.6B-ONNX';
if (!configuredModels.some((model) => model.id === DEFAULT_MODEL)) {
  configuredModels.unshift({
    id: DEFAULT_MODEL,
    label: DEFAULT_MODEL,
    features: {},
    generation: normalizeGenerationLimits(null),
  });
}
const MODEL_OPTIONS = Object.freeze(configuredModels);
const MODEL_OPTIONS_BY_ID = new Map(MODEL_OPTIONS.map((model) => [model.id, model]));
const LEGACY_MODEL_ALIASES = Object.fromEntries(
  Object.entries(modelCatalog?.legacyAliases || {})
    .map(([alias, canonical]) => [
      typeof alias === 'string' ? alias.trim() : '',
      typeof canonical === 'string' ? canonical.trim() : '',
    ])
    .filter(([alias, canonical]) => alias && canonical),
);
const SUPPORTED_MODELS = new Set(MODEL_OPTIONS.map((model) => model.id));
const TITLE_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'how',
  'i',
  'in',
  'is',
  'it',
  'its',
  'me',
  'my',
  'of',
  'on',
  'or',
  'our',
  'that',
  'the',
  'this',
  'to',
  'we',
  'with',
  'you',
  'your',
]);
const CONVERSATION_SAVE_DEBOUNCE_MS = 300;
const CONVERSATION_COLLECTION_FORMAT = 'browser-llm-runner.conversation-collection';
const CONVERSATION_SCHEMA_VERSION = 4;

const themeSelect = document.getElementById('themeSelect');
const showThinkingToggle = document.getElementById('showThinkingToggle');
const modelSelect = document.getElementById('modelSelect');
const backendSelect = document.getElementById('backendSelect');
const maxOutputTokensInput = document.getElementById('maxOutputTokensInput');
const maxContextTokensInput = document.getElementById('maxContextTokensInput');
const temperatureInput = document.getElementById('temperatureInput');
const maxOutputTokensHelp = document.getElementById('maxOutputTokensHelp');
const maxContextTokensHelp = document.getElementById('maxContextTokensHelp');
const temperatureHelp = document.getElementById('temperatureHelp');
const statusRegion = document.getElementById('statusRegion');
const loadModelButton = document.getElementById('loadModelButton');
const debugInfo = document.getElementById('debugInfo');
const modelLoadProgressWrap = document.getElementById('modelLoadProgressWrap');
const modelLoadProgressLabel = document.getElementById('modelLoadProgressLabel');
const modelLoadProgressValue = document.getElementById('modelLoadProgressValue');
const modelLoadProgressBar = document.getElementById('modelLoadProgressBar');
const modelLoadError = document.getElementById('modelLoadError');
const modelLoadErrorSummary = document.getElementById('modelLoadErrorSummary');
const modelLoadErrorDetails = document.getElementById('modelLoadErrorDetails');
const sendButton = document.getElementById('sendButton');
const conversationList = document.getElementById('conversationList');
const newConversationBtn = document.getElementById('newConversationBtn');
const chatForm = document.querySelector('.composer');
const messageInput = document.getElementById('messageInput');
const chatTranscript = document.getElementById('chatTranscript');
const chatMain = document.querySelector('.chat-main');
const welcomePanel = document.querySelector('.welcome-panel');
const chatTitle = document.getElementById('chatTitle');
const colorSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');

const engine = new LLMEngineClient();
let modelReady = false;
let isGenerating = false;
let isLoadingModel = false;
let conversationCount = 0;
let conversationIdCounter = 0;
let activeConversationId = null;
const conversations = [];
const debugEntries = [];
const MAX_DEBUG_ENTRIES = 120;
let activeGenerationConfig = normalizeGenerationLimits(null);
let pendingGenerationConfig = null;
let conversationSaveTimerId = null;
let showThinkingByDefault = false;

function initializeTooltips(root = document) {
  if (!root || !(root instanceof Element || root instanceof Document)) {
    return;
  }
  root.querySelectorAll('[data-bs-toggle="tooltip"], [data-icon-tooltip]').forEach((element) => {
    Tooltip.getOrCreateInstance(element);
  });
}

function disposeTooltips(root) {
  if (!root || !(root instanceof Element || root instanceof Document)) {
    return;
  }
  root.querySelectorAll('[data-bs-toggle="tooltip"], [data-icon-tooltip]').forEach((element) => {
    const instance = Tooltip.getInstance(element);
    if (instance) {
      instance.dispose();
    }
  });
}

function setIconButtonContent(button, iconClass, label) {
  if (!button) {
    return;
  }
  button.innerHTML = `
    <i class="bi ${iconClass}" aria-hidden="true"></i>
    <span class="visually-hidden">${label}</span>
  `;
}

function formatInteger(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

function getModelGenerationLimits(modelId) {
  return (
    MODEL_OPTIONS_BY_ID.get(normalizeModelId(modelId))?.generation || normalizeGenerationLimits(null)
  );
}

function sanitizeGenerationConfigForModel(modelId, candidateConfig) {
  const limits = getModelGenerationLimits(modelId);
  const maxContextTokens = quantizeTokenInput(
    candidateConfig?.maxContextTokens,
    MIN_TOKEN_LIMIT,
    limits.maxContextTokens,
  );
  return {
    maxContextTokens,
    maxOutputTokens: quantizeTokenInput(
      candidateConfig?.maxOutputTokens,
      MIN_TOKEN_LIMIT,
      Math.min(limits.maxOutputTokens, maxContextTokens),
    ),
    temperature: quantizeTemperature(
      candidateConfig?.temperature,
      limits.minTemperature,
      limits.maxTemperature,
    ),
  };
}

function getStoredModelGenerationSettings() {
  try {
    const raw = localStorage.getItem(MODEL_GENERATION_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function getStoredGenerationConfigForModel(modelId) {
  const normalizedModelId = normalizeModelId(modelId);
  const byModel = getStoredModelGenerationSettings();
  const stored = byModel[normalizedModelId];
  if (!stored || typeof stored !== 'object') {
    return null;
  }
  return sanitizeGenerationConfigForModel(normalizedModelId, stored);
}

function persistGenerationConfigForModel(modelId, config) {
  const normalizedModelId = normalizeModelId(modelId);
  const sanitized = sanitizeGenerationConfigForModel(normalizedModelId, config);
  const byModel = getStoredModelGenerationSettings();
  byModel[normalizedModelId] = sanitized;
  localStorage.setItem(MODEL_GENERATION_SETTINGS_STORAGE_KEY, JSON.stringify(byModel));
}

function quantizeTokenInput(value, min, max) {
  const numeric = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(numeric)) {
    return min;
  }
  const bounded = clamp(numeric, min, max);
  const steps = Math.round((bounded - min) / TOKEN_STEP);
  return clamp(min + steps * TOKEN_STEP, min, max);
}

function buildGenerationConfigFromUI(modelId) {
  const limits = getModelGenerationLimits(modelId);
  const maxContextTokens = quantizeTokenInput(
    maxContextTokensInput?.value ?? limits.defaultMaxContextTokens,
    MIN_TOKEN_LIMIT,
    limits.maxContextTokens,
  );
  const maxOutputTokens = quantizeTokenInput(
    maxOutputTokensInput?.value ?? limits.defaultMaxOutputTokens,
    MIN_TOKEN_LIMIT,
    Math.min(limits.maxOutputTokens, maxContextTokens),
  );
  const temperature = quantizeTemperature(
    temperatureInput?.value ?? limits.defaultTemperature,
    limits.minTemperature,
    limits.maxTemperature,
  );
  return { maxOutputTokens, maxContextTokens, temperature };
}

function renderGenerationSettingsHelpText(config, limits) {
  if (maxOutputTokensHelp) {
    maxOutputTokensHelp.textContent = `Allowed: ${formatInteger(MIN_TOKEN_LIMIT)} to ${formatInteger(
      Math.min(limits.maxOutputTokens, config.maxContextTokens),
    )}. Current: ${formatInteger(config.maxOutputTokens)}.`;
  }
  if (maxContextTokensHelp) {
    maxContextTokensHelp.textContent = `Allowed: ${formatInteger(MIN_TOKEN_LIMIT)} to ${formatInteger(
      limits.maxContextTokens,
    )}. Current: ${formatInteger(config.maxContextTokens)}.`;
  }
  if (temperatureHelp) {
    temperatureHelp.textContent = `Allowed: ${limits.minTemperature.toFixed(1)} to ${limits.maxTemperature.toFixed(
      1,
    )} in steps of ${TEMPERATURE_STEP.toFixed(1)}. Current: ${config.temperature.toFixed(1)}.`;
  }
}

function syncGenerationSettingsFromModel(modelId, useDefaults = true) {
  const normalizedModelId = normalizeModelId(modelId);
  const limits = getModelGenerationLimits(normalizedModelId);
  const defaultConfig = {
    maxOutputTokens: Math.min(limits.defaultMaxOutputTokens, limits.defaultMaxContextTokens),
    maxContextTokens: limits.defaultMaxContextTokens,
    temperature: limits.defaultTemperature,
  };
  const config = useDefaults
    ? getStoredGenerationConfigForModel(normalizedModelId) || defaultConfig
    : buildGenerationConfigFromUI(normalizedModelId);
  const boundedOutputMax = Math.min(limits.maxOutputTokens, config.maxContextTokens);

  if (maxContextTokensInput) {
    maxContextTokensInput.min = String(MIN_TOKEN_LIMIT);
    maxContextTokensInput.max = String(limits.maxContextTokens);
    maxContextTokensInput.step = String(TOKEN_STEP);
    maxContextTokensInput.value = String(config.maxContextTokens);
  }

  if (maxOutputTokensInput) {
    maxOutputTokensInput.min = String(MIN_TOKEN_LIMIT);
    maxOutputTokensInput.max = String(boundedOutputMax);
    maxOutputTokensInput.step = String(TOKEN_STEP);
    maxOutputTokensInput.value = String(config.maxOutputTokens);
  }
  if (temperatureInput) {
    temperatureInput.min = limits.minTemperature.toFixed(1);
    temperatureInput.max = limits.maxTemperature.toFixed(1);
    temperatureInput.step = TEMPERATURE_STEP.toFixed(1);
    temperatureInput.value = config.temperature.toFixed(1);
  }

  activeGenerationConfig = { ...config };
  engine.setGenerationConfig(activeGenerationConfig);
  renderGenerationSettingsHelpText(config, limits);
}

function updateGenerationSettingsEnabledState() {
  const disabled = !modelReady;
  if (maxOutputTokensInput) {
    maxOutputTokensInput.disabled = disabled;
  }
  if (maxContextTokensInput) {
    maxContextTokensInput.disabled = disabled;
  }
  if (temperatureInput) {
    temperatureInput.disabled = disabled;
  }
}

function applyPendingGenerationSettingsIfReady() {
  if (isGenerating || !pendingGenerationConfig) {
    return;
  }
  const selectedModel = normalizeModelId(modelSelect?.value || DEFAULT_MODEL);
  const limits = getModelGenerationLimits(selectedModel);
  const nextMaxContextTokens = quantizeTokenInput(
    pendingGenerationConfig.maxContextTokens,
    MIN_TOKEN_LIMIT,
    limits.maxContextTokens,
  );
  const nextConfig = {
    maxContextTokens: nextMaxContextTokens,
    maxOutputTokens: quantizeTokenInput(
      pendingGenerationConfig.maxOutputTokens,
      MIN_TOKEN_LIMIT,
      Math.min(limits.maxOutputTokens, nextMaxContextTokens),
    ),
    temperature: quantizeTemperature(
      pendingGenerationConfig.temperature,
      limits.minTemperature,
      limits.maxTemperature,
    ),
  };
  pendingGenerationConfig = null;
  activeGenerationConfig = nextConfig;
  engine.setGenerationConfig(nextConfig);
  syncGenerationSettingsFromModel(selectedModel, false);
  setStatus('Generation settings updated.');
  appendDebug(
    `Generation settings applied (maxOutputTokens=${nextConfig.maxOutputTokens}, maxContextTokens=${nextConfig.maxContextTokens}, temperature=${nextConfig.temperature.toFixed(1)}).`,
  );
}

function onGenerationSettingInputChanged() {
  const selectedModel = normalizeModelId(modelSelect?.value || DEFAULT_MODEL);
  const nextConfig = buildGenerationConfigFromUI(selectedModel);
  activeGenerationConfig = nextConfig;
  syncGenerationSettingsFromModel(selectedModel, false);
  persistGenerationConfigForModel(selectedModel, nextConfig);
  if (isGenerating) {
    pendingGenerationConfig = nextConfig;
    setStatus('Generation settings will apply after current response.');
    appendDebug('Generation settings change queued until current response completes.');
    return;
  }
  engine.setGenerationConfig(nextConfig);
  setStatus('Generation settings updated.');
  appendDebug(
    `Generation settings applied (maxOutputTokens=${nextConfig.maxOutputTokens}, maxContextTokens=${nextConfig.maxContextTokens}, temperature=${nextConfig.temperature.toFixed(1)}).`,
  );
}

function appendDebug(message) {
  const timestamp = new Date().toLocaleTimeString();
  debugEntries.push(`[${timestamp}] ${message}`);
  if (debugEntries.length > MAX_DEBUG_ENTRIES) {
    debugEntries.shift();
  }
  if (debugInfo) {
    debugInfo.textContent = debugEntries.join('\n');
  }
}

function setStatus(message) {
  if (statusRegion) {
    statusRegion.textContent = message;
  }
  appendDebug(`Status: ${message}`);
}

function buildConversationStateSnapshot() {
  return {
    format: CONVERSATION_COLLECTION_FORMAT,
    schemaVersion: CONVERSATION_SCHEMA_VERSION,
    savedAt: Date.now(),
    storage: {
      artifactPolicy: {
        textEncoding: 'utf-8',
        binaryEncoding: 'base64',
        integrityHash: 'sha256',
      },
      artifactRecordShape: {
        id: 'string',
        conversationId: 'string',
        messageId: 'string|null',
        kind: 'text|binary',
        mimeType: 'string',
        encoding: 'utf-8|base64',
        data: 'string',
        hash: { algorithm: 'sha256', value: 'hex' },
        filename: 'string|null',
      },
    },
    artifacts: [],
    activeConversationId,
    conversationCount,
    conversationIdCounter,
    conversations: conversations.map((conversation) => {
      const pathMessages = getConversationPathMessages(conversation);
      const serializeMessage = (message) => ({
        id: message.id,
        role: message.role,
        speaker: message.speaker,
        text: String(message.text || ''),
        thoughts: typeof message.thoughts === 'string' ? message.thoughts : '',
        response:
          typeof message.response === 'string'
            ? message.response
            : String(message.text || ''),
        hasThinking: Boolean(message.hasThinking),
        isThinkingComplete: Boolean(message.isThinkingComplete),
        isResponseComplete: Boolean(message.isResponseComplete ?? true),
        parentId: typeof message.parentId === 'string' ? message.parentId : null,
        childIds: Array.isArray(message.childIds)
          ? message.childIds.filter((childId) => typeof childId === 'string' && childId.trim())
          : [],
        // Future-ready structure:
        // - `content.parts` can mix text and artifact references.
        // - `content.llmRepresentation` stores exactly what is sent to/received from the model.
        content: {
          parts: [
            {
              type: 'text',
              text: String(message.text || ''),
            },
          ],
          llmRepresentation: {
            type: 'text',
            text:
              message.role === 'model'
                ? typeof message.response === 'string'
                  ? message.response
                  : String(message.text || '')
                : String(message.text || ''),
          },
        },
        artifactRefs: [],
      });

      return {
        id: conversation.id,
        name: conversation.name,
        hasGeneratedName: Boolean(conversation.hasGeneratedName),
        artifacts: [],
        activeLeafMessageId:
          typeof conversation.activeLeafMessageId === 'string' ? conversation.activeLeafMessageId : null,
        lastSpokenLeafMessageId:
          typeof conversation.lastSpokenLeafMessageId === 'string'
            ? conversation.lastSpokenLeafMessageId
            : null,
        messageNodeCounter: Number.isInteger(conversation.messageNodeCounter)
          ? conversation.messageNodeCounter
          : conversation.messageNodes.length,
        messageNodes: conversation.messageNodes.map((message) => serializeMessage(message)),
        // Keep `messages` for backward compatibility with old clients.
        messages: pathMessages.map((message) => serializeMessage(message)),
      };
    }),
  };
}

async function persistConversationStateNow() {
  try {
    await saveConversationState(buildConversationStateSnapshot());
  } catch (error) {
    appendDebug(`Conversation save failed: ${error.message}`);
  }
}

function queueConversationStateSave() {
  if (conversationSaveTimerId !== null) {
    return;
  }
  conversationSaveTimerId = window.setTimeout(() => {
    conversationSaveTimerId = null;
    void persistConversationStateNow();
  }, CONVERSATION_SAVE_DEBOUNCE_MS);
}

function coerceStoredMessage(rawMessage, fallbackMessageId) {
  if (!rawMessage || typeof rawMessage !== 'object') {
    return null;
  }
  const role = rawMessage.role === 'user' ? 'user' : rawMessage.role === 'model' ? 'model' : '';
  if (!role) {
    return null;
  }

  const id =
    typeof rawMessage.id === 'string' && rawMessage.id.trim() ? rawMessage.id.trim() : fallbackMessageId;
  const contentParts = Array.isArray(rawMessage.content?.parts) ? rawMessage.content.parts : [];
  const firstTextPart = contentParts.find((part) => part?.type === 'text' && typeof part.text === 'string');
  const llmText =
    typeof rawMessage.content?.llmRepresentation?.text === 'string'
      ? rawMessage.content.llmRepresentation.text
      : '';
  const text = String(rawMessage.text || rawMessage.response || firstTextPart?.text || llmText || '');
  const message = {
    id,
    role,
    speaker: role === 'user' ? 'User' : 'Model',
    text,
  };

  if (role === 'model') {
    message.thoughts = typeof rawMessage.thoughts === 'string' ? rawMessage.thoughts : '';
    message.response = String(
      rawMessage.response ||
        rawMessage.inference?.output?.verbatimText ||
        rawMessage.content?.llmRepresentation?.text ||
        text,
    );
    message.hasThinking = Boolean(rawMessage.hasThinking || message.thoughts.trim());
    message.isThinkingComplete = Boolean(rawMessage.isThinkingComplete);
    message.isResponseComplete = Boolean(
      rawMessage.isResponseComplete ?? rawMessage.inference?.status?.complete ?? true,
    );
    message.text = message.response;
  } else {
    message.text = String(rawMessage.inference?.input?.verbatimText || rawMessage.content?.llmRepresentation?.text || message.text);
  }

  return message;
}

function coerceStoredMessageNode(rawMessage, fallbackMessageId) {
  const message = coerceStoredMessage(rawMessage, fallbackMessageId);
  if (!message) {
    return null;
  }
  message.parentId =
    typeof rawMessage.parentId === 'string' && rawMessage.parentId.trim() ? rawMessage.parentId.trim() : null;
  message.childIds = Array.isArray(rawMessage.childIds)
    ? rawMessage.childIds.filter((childId) => typeof childId === 'string' && childId.trim())
    : [];
  return message;
}

function parseConversationCounterFromId(conversationId) {
  if (typeof conversationId !== 'string') {
    return 0;
  }
  const match = conversationId.match(/^conversation-(\d+)$/);
  if (!match) {
    return 0;
  }
  const counter = Number.parseInt(match[1], 10);
  return Number.isInteger(counter) && counter > 0 ? counter : 0;
}

function applyStoredConversationState(rawState) {
  if (!rawState || typeof rawState !== 'object' || !Array.isArray(rawState.conversations)) {
    return false;
  }

  const restoredConversations = rawState.conversations
    .map((rawConversation, conversationIndex) => {
      if (!rawConversation || typeof rawConversation !== 'object') {
        return null;
      }

      const id =
        typeof rawConversation.id === 'string' && rawConversation.id.trim()
          ? rawConversation.id.trim()
          : `conversation-${conversationIndex + 1}`;
      const name = normalizeConversationName(rawConversation.name) || `${UNTITLED_CONVERSATION_PREFIX} ${conversationIndex + 1}`;
      const rawMessageNodes = Array.isArray(rawConversation.messageNodes) ? rawConversation.messageNodes : [];
      const hasNodeSchema = rawMessageNodes.length > 0;
      const rawMessages = hasNodeSchema
        ? rawMessageNodes
        : Array.isArray(rawConversation.messages)
          ? rawConversation.messages
          : [];
      const messageNodes = rawMessages
        .map((rawMessage, messageIndex) =>
          hasNodeSchema
            ? coerceStoredMessageNode(rawMessage, `${id}-node-${messageIndex + 1}`)
            : coerceStoredMessage(rawMessage, `${id}-node-${messageIndex + 1}`),
        )
        .filter(Boolean);

      if (!hasNodeSchema) {
        let previousId = null;
        messageNodes.forEach((message) => {
          message.parentId = previousId;
          message.childIds = [];
          if (previousId) {
            const previousMessage = messageNodes.find((candidate) => candidate.id === previousId);
            if (previousMessage) {
              previousMessage.childIds = [...(previousMessage.childIds || []), message.id];
            }
          }
          previousId = message.id;
        });
      } else {
        const byId = new Map(messageNodes.map((message) => [message.id, message]));
        messageNodes.forEach((message) => {
          message.childIds = [];
        });
        messageNodes.forEach((message) => {
          if (!message.parentId) {
            return;
          }
          const parentMessage = byId.get(message.parentId);
          if (!parentMessage) {
            message.parentId = null;
            return;
          }
          parentMessage.childIds.push(message.id);
        });
      }

      const messageNodeCounterFromIds = messageNodes.reduce(
        (maxCounter, message) => Math.max(maxCounter, parseMessageNodeCounterFromId(message.id)),
        0,
      );
      const storedNodeCounter = Number.parseInt(String(rawConversation.messageNodeCounter || ''), 10);
      const messageNodeCounter =
        Number.isInteger(storedNodeCounter) && storedNodeCounter > 0
          ? Math.max(storedNodeCounter, messageNodeCounterFromIds)
          : Math.max(messageNodeCounterFromIds, messageNodes.length);
      const requestedActiveLeaf =
        typeof rawConversation.activeLeafMessageId === 'string'
          ? rawConversation.activeLeafMessageId
          : messageNodes[messageNodes.length - 1]?.id || null;
      const activeLeafMessageId = messageNodes.some((message) => message.id === requestedActiveLeaf)
        ? requestedActiveLeaf
        : messageNodes[messageNodes.length - 1]?.id || null;
      const requestedLastSpokenLeaf =
        typeof rawConversation.lastSpokenLeafMessageId === 'string'
          ? rawConversation.lastSpokenLeafMessageId
          : activeLeafMessageId;
      const lastSpokenLeafMessageId = messageNodes.some((message) => message.id === requestedLastSpokenLeaf)
        ? requestedLastSpokenLeaf
        : activeLeafMessageId;

      return {
        id,
        name,
        messageNodes,
        messageNodeCounter,
        activeLeafMessageId,
        lastSpokenLeafMessageId,
        hasGeneratedName: Boolean(rawConversation.hasGeneratedName),
      };
    })
    .filter(Boolean);

  if (!restoredConversations.length) {
    return false;
  }

  conversations.length = 0;
  conversations.push(...restoredConversations);

  const requestedActiveId =
    typeof rawState.activeConversationId === 'string' ? rawState.activeConversationId : '';
  activeConversationId = conversations.some((conversation) => conversation.id === requestedActiveId)
    ? requestedActiveId
    : conversations[0].id;

  const maxCounterFromIds = conversations.reduce(
    (maxCounter, conversation) => Math.max(maxCounter, parseConversationCounterFromId(conversation.id)),
    0,
  );
  const storedIdCounter = Number.parseInt(String(rawState.conversationIdCounter || ''), 10);
  const storedConversationCount = Number.parseInt(String(rawState.conversationCount || ''), 10);
  conversationIdCounter =
    Number.isInteger(storedIdCounter) && storedIdCounter > 0
      ? Math.max(storedIdCounter, maxCounterFromIds)
      : maxCounterFromIds;
  conversationCount =
    Number.isInteger(storedConversationCount) && storedConversationCount > 0
      ? storedConversationCount
      : conversations.length;

  return true;
}

async function restoreConversationStateFromStorage() {
  try {
    const storedState = await loadConversationState();
    if (!applyStoredConversationState(storedState)) {
      ensureConversation();
      queueConversationStateSave();
    }
  } catch (error) {
    appendDebug(`Conversation restore failed: ${error.message}`);
    ensureConversation();
  }

  renderConversationList();
  renderTranscript();
  updateChatTitle();
}

function getActiveConversation() {
  return conversations.find((conversation) => conversation.id === activeConversationId) || null;
}

function createConversation(name) {
  conversationCount += 1;
  return {
    id: `conversation-${++conversationIdCounter}`,
    name: name || `${UNTITLED_CONVERSATION_PREFIX} ${conversationCount}`,
    messageNodes: [],
    messageNodeCounter: 0,
    activeLeafMessageId: null,
    lastSpokenLeafMessageId: null,
    hasGeneratedName: false,
  };
}

function normalizeConversationName(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.length <= 64) {
    return trimmed;
  }
  return `${trimmed.slice(0, 61).trimEnd()}...`;
}

function deriveConversationName(conversation) {
  const pathMessages = getConversationPathMessages(conversation);
  const firstUserMessage = pathMessages.find((message) => message.role === 'user')?.text || '';
  const firstModelMessage = pathMessages.find((message) => message.role === 'model')?.text || '';
  const source = `${firstUserMessage} ${firstModelMessage}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!source) {
    return conversation.name;
  }

  const scoredTokens = new Map();
  source.split(' ').forEach((token) => {
    if (token.length < 3 || TITLE_STOP_WORDS.has(token)) {
      return;
    }
    const existing = scoredTokens.get(token) || { count: 0, order: scoredTokens.size };
    existing.count += 1;
    scoredTokens.set(token, existing);
  });

  const topTokens = [...scoredTokens.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[1].order - b[1].order)
    .slice(0, 4)
    .map(([token]) => token.charAt(0).toUpperCase() + token.slice(1));

  if (!topTokens.length) {
    return conversation.name;
  }

  return normalizeConversationName(topTokens.join(' '));
}

function parseMessageNodeCounterFromId(nodeId) {
  if (typeof nodeId !== 'string') {
    return 0;
  }
  const match = nodeId.match(/-node-(\d+)$/);
  if (!match) {
    return 0;
  }
  const counter = Number.parseInt(match[1], 10);
  return Number.isInteger(counter) && counter > 0 ? counter : 0;
}

function getMessageNodeById(conversation, messageId) {
  if (!conversation || !messageId) {
    return null;
  }
  return conversation.messageNodes.find((message) => message.id === messageId) || null;
}

function getConversationPathMessages(conversation, leafMessageId = conversation?.activeLeafMessageId) {
  if (!conversation || !leafMessageId) {
    return [];
  }
  const byId = new Map(conversation.messageNodes.map((message) => [message.id, message]));
  const path = [];
  let cursor = byId.get(leafMessageId) || null;
  while (cursor) {
    path.push(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) || null : null;
  }
  return path.reverse();
}

function getModelSiblingMessages(conversation, modelMessage) {
  if (!conversation || !modelMessage || modelMessage.role !== 'model' || !modelMessage.parentId) {
    return [];
  }
  const parentMessage = getMessageNodeById(conversation, modelMessage.parentId);
  if (!parentMessage || parentMessage.role !== 'user') {
    return [];
  }
  return (parentMessage.childIds || [])
    .map((childId) => getMessageNodeById(conversation, childId))
    .filter((child) => child?.role === 'model');
}

function getModelVariantState(conversation, modelMessage) {
  const siblings = getModelSiblingMessages(conversation, modelMessage);
  const index = siblings.findIndex((candidate) => candidate.id === modelMessage.id);
  const total = siblings.length;
  return {
    siblings,
    index,
    total,
    hasVariants: total > 1,
    canGoPrev: index > 0,
    canGoNext: index >= 0 && index < total - 1,
  };
}

function applyVariantCardSignals(item, variantState) {
  if (!item) {
    return;
  }
  const bubble = item.querySelector('.message-bubble');
  if (!bubble) {
    return;
  }
  bubble.classList.toggle('has-variant-prev', Boolean(variantState?.hasVariants && variantState.canGoPrev));
  bubble.classList.toggle('has-variant-next', Boolean(variantState?.hasVariants && variantState.canGoNext));
}

function buildPromptForConversationLeaf(conversation, leafMessageId = conversation?.activeLeafMessageId) {
  return buildConversationPrompt(getConversationPathMessages(conversation, leafMessageId));
}

function addMessageToConversation(conversation, role, text, options = {}) {
  const normalizedRole = role === 'user' ? 'user' : 'model';
  const normalizedText = String(text || '');
  const requestedParentId =
    typeof options.parentId === 'string' && options.parentId.trim()
      ? options.parentId.trim()
      : conversation.activeLeafMessageId;
  const parentId = requestedParentId && getMessageNodeById(conversation, requestedParentId)
    ? requestedParentId
    : null;
  const message = {
    id: `${conversation.id}-node-${++conversation.messageNodeCounter}`,
    role: normalizedRole,
    speaker: normalizedRole === 'user' ? 'User' : 'Model',
    text: normalizedText,
    parentId: parentId || null,
    childIds: [],
  };
  if (normalizedRole === 'model') {
    message.thoughts = '';
    message.response = normalizedText;
    message.hasThinking = false;
    message.isThinkingComplete = false;
    message.isResponseComplete = false;
  }
  conversation.messageNodes.push(message);
  if (parentId) {
    const parentMessage = getMessageNodeById(conversation, parentId);
    if (parentMessage && Array.isArray(parentMessage.childIds)) {
      parentMessage.childIds.push(message.id);
    }
  }
  conversation.activeLeafMessageId = message.id;
  return message;
}

function buildConversationPrompt(messages) {
  const lines = ['Continue this conversation and answer as the Model:'];
  messages.forEach((message) => {
    if (!message || (message.role !== 'user' && message.role !== 'model')) {
      return;
    }
    const content = String(message.response || message.text || '').trim();
    if (!content) {
      return;
    }
    const speaker = message.role === 'user' ? 'User' : 'Model';
    lines.push(`${speaker}: ${content}`);
  });
  lines.push('Model:');
  return lines.join('\n');
}

function renderConversationList() {
  if (!conversationList) {
    return;
  }
  disposeTooltips(conversationList);
  conversationList.replaceChildren();

  conversations.forEach((conversation) => {
    const item = document.createElement('li');
    item.className = `conversation-item${conversation.id === activeConversationId ? ' is-active' : ''}`;
    item.dataset.conversationId = conversation.id;

    const selectButton = document.createElement('button');
    selectButton.type = 'button';
    selectButton.className = 'conversation-select';
    selectButton.textContent = conversation.name;
    if (conversation.id === activeConversationId) {
      selectButton.setAttribute('aria-current', 'page');
    }

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'btn btn-sm conversation-delete';
    deleteButton.setAttribute('aria-label', `Delete ${conversation.name} conversation`);
    deleteButton.setAttribute('data-bs-toggle', 'tooltip');
    deleteButton.setAttribute('data-bs-title', 'Delete conversation');
    setIconButtonContent(deleteButton, 'bi-trash-fill', 'Delete conversation');

    item.append(selectButton, deleteButton);
    conversationList.appendChild(item);
  });
  initializeTooltips(conversationList);
}

function setModelBubbleContent(message, refs) {
  if (!refs) {
    return;
  }

  const hasThinking = Boolean(message.hasThinking || message.thoughts?.trim());
  const isExpanded = refs.thinkingToggle.getAttribute('aria-expanded') === 'true';
  const thinkingLabel = message.isThinkingComplete
    ? isExpanded
      ? 'Done thinking. Hide thoughts.'
      : 'Done thinking. View thoughts.'
    : 'Thinking';

  refs.thinkingRegion.classList.toggle('d-none', !hasThinking);
  refs.thinkingToggle.textContent = thinkingLabel;
  refs.thinkingToggle.setAttribute('aria-expanded', String(hasThinking && isExpanded));
  refs.thinkingBody.hidden = !hasThinking || !isExpanded;
  refs.thoughtsText.textContent = message.thoughts || '';
  refs.responseText.textContent = message.response || message.text || '';
}

function refreshModelThinkingVisibility() {
  if (!chatTranscript) {
    return;
  }
  chatTranscript.querySelectorAll('.message-row.model-message').forEach((item) => {
    const refs = item._modelBubbleRefs || null;
    const message = item._modelMessage || null;
    if (!refs || !message || message.role !== 'model') {
      return;
    }
    refs.thinkingToggle.setAttribute('aria-expanded', String(showThinkingByDefault));
    refs.thinkingBody.hidden = !showThinkingByDefault;
    setModelBubbleContent(message, refs);
  });
}

function addMessageElement(message) {
  if (!chatTranscript) {
    return null;
  }
  const item = document.createElement('li');
  item.className = `message-row ${message.role === 'user' ? 'user-message' : 'model-message'}`;
  item.dataset.messageId = message.id;
  if (message.role === 'model') {
    const activeConversation = getActiveConversation();
    const variantState = getModelVariantState(activeConversation, message);
    const variantLabel = `${Math.max(variantState.index + 1, 1)}/${Math.max(variantState.total, 1)}`;
    item.innerHTML = `
      <p class="message-speaker">${message.speaker}</p>
      <div class="message-bubble">
        <section class="thoughts-region d-none">
          <h3 class="visually-hidden">Thoughts</h3>
          <a href="#" class="thinking-toggle" aria-expanded="false">Thinking</a>
          <p class="thoughts-content" hidden></p>
        </section>
        <section class="response-region">
          <h3 class="visually-hidden">Response</h3>
          <p class="response-content mb-0"></p>
        </section>
        <section class="response-actions">
          <button
            type="button"
            class="btn btn-sm btn-outline-primary regenerate-response-btn"
            data-message-id="${message.id}"
            aria-label="Regenerate response"
            data-bs-toggle="tooltip"
            data-bs-title="Regenerate response"
          >
            <i class="bi bi-arrow-clockwise" aria-hidden="true"></i>
            <span class="visually-hidden">Regenerate response</span>
          </button>
          <div class="response-variant-nav${variantState.hasVariants ? '' : ' d-none'}">
            <button
              type="button"
              class="btn btn-sm btn-outline-primary response-variant-prev"
              data-message-id="${message.id}"
              aria-label="Previous regenerated response"
              data-bs-toggle="tooltip"
              data-bs-title="Previous regenerated response"
              ${variantState.canGoPrev ? '' : 'disabled'}
            >
              <i class="bi bi-arrow-bar-left" aria-hidden="true"></i>
              <span class="visually-hidden">Previous regenerated response</span>
            </button>
            <p class="response-variant-status mb-0" aria-live="off">${variantLabel}</p>
            <button
              type="button"
              class="btn btn-sm btn-outline-primary response-variant-next"
              data-message-id="${message.id}"
              aria-label="Next regenerated response"
              data-bs-toggle="tooltip"
              data-bs-title="Next regenerated response"
              ${variantState.canGoNext ? '' : 'disabled'}
            >
              <i class="bi bi-arrow-bar-right" aria-hidden="true"></i>
              <span class="visually-hidden">Next regenerated response</span>
            </button>
          </div>
        </section>
      </div>
    `;
    const responseActions = item.querySelector('.response-actions');
    if (responseActions) {
      responseActions.classList.toggle('d-none', !message.isResponseComplete);
    }
    const thinkingRegion = item.querySelector('.thoughts-region');
    const thinkingToggle = item.querySelector('.thinking-toggle');
    const thinkingBody = item.querySelector('.thoughts-content');
    const thoughtsText = item.querySelector('.thoughts-content');
    const responseText = item.querySelector('.response-content');
    if (thinkingRegion && thinkingToggle && thinkingBody && thoughtsText && responseText) {
      const refs = { thinkingRegion, thinkingToggle, thinkingBody, thoughtsText, responseText };
      thinkingToggle.setAttribute('aria-expanded', String(showThinkingByDefault));
      thinkingBody.hidden = !showThinkingByDefault;
      thinkingToggle.addEventListener('click', (event) => {
        event.preventDefault();
        const expanded = thinkingToggle.getAttribute('aria-expanded') === 'true';
        thinkingToggle.setAttribute('aria-expanded', String(!expanded));
        thinkingBody.hidden = expanded;
        setModelBubbleContent(message, refs);
      });
      setModelBubbleContent(message, refs);
      item._modelBubbleRefs = refs;
      item._modelMessage = message;
    }
    applyVariantCardSignals(item, variantState);
  } else {
    item.innerHTML = `
      <p class="message-speaker">${message.speaker}</p>
      <p class="message-bubble"></p>
    `;
    const bubble = item.querySelector('.message-bubble');
    if (bubble) {
      bubble.textContent = message.text;
    }
  }
  chatTranscript.appendChild(item);
  initializeTooltips(item);
  scrollTranscriptToBottom();
  return item;
}

function updateModelMessageElement(message, item) {
  if (!item || message.role !== 'model') {
    return;
  }
  item._modelMessage = message;
  const responseActions = item.querySelector('.response-actions');
  if (responseActions) {
    responseActions.classList.toggle('d-none', !message.isResponseComplete);
  }
  const activeConversation = getActiveConversation();
  const variantState = getModelVariantState(activeConversation, message);
  const variantNav = item.querySelector('.response-variant-nav');
  const variantLabel = item.querySelector('.response-variant-status');
  const prevButton = item.querySelector('.response-variant-prev');
  const nextButton = item.querySelector('.response-variant-next');
  if (variantNav) {
    variantNav.classList.toggle('d-none', !variantState.hasVariants || !message.isResponseComplete);
  }
  if (variantLabel) {
    variantLabel.textContent = `${Math.max(variantState.index + 1, 1)}/${Math.max(variantState.total, 1)}`;
  }
  if (prevButton instanceof HTMLButtonElement) {
    prevButton.disabled = !variantState.canGoPrev || !message.isResponseComplete;
  }
  if (nextButton instanceof HTMLButtonElement) {
    nextButton.disabled = !variantState.canGoNext || !message.isResponseComplete;
  }
  applyVariantCardSignals(item, variantState);
  setModelBubbleContent(message, item._modelBubbleRefs || null);
}

function scrollTranscriptToBottom() {
  if (!chatMain) {
    return;
  }
  chatMain.scrollTop = chatMain.scrollHeight;
}

function renderTranscript() {
  if (!chatTranscript) {
    return;
  }
  disposeTooltips(chatTranscript);
  chatTranscript.replaceChildren();
  const conversation = getActiveConversation();
  if (!conversation) {
    return;
  }
  getConversationPathMessages(conversation).forEach((message) => {
    addMessageElement(message);
  });
  scrollTranscriptToBottom();
}

function updateWelcomePanelVisibility() {
  if (!welcomePanel) {
    return;
  }
  welcomePanel.classList.toggle('d-none', modelReady);
}

function updateChatTitle() {
  if (!chatTitle) {
    return;
  }
  const activeConversation = getActiveConversation();
  if (activeConversation?.hasGeneratedName) {
    chatTitle.textContent = activeConversation.name;
    return;
  }
  chatTitle.textContent = modelReady ? 'Start Your Chat Now' : 'Choose a Model to Chat';
}

function setActiveConversationById(conversationId) {
  if (activeConversationId === conversationId) {
    return;
  }
  activeConversationId = conversationId;
  const activeConversation = getActiveConversation();
  if (
    activeConversation?.lastSpokenLeafMessageId &&
    getMessageNodeById(activeConversation, activeConversation.lastSpokenLeafMessageId)
  ) {
    activeConversation.activeLeafMessageId = activeConversation.lastSpokenLeafMessageId;
  }
  renderConversationList();
  renderTranscript();
  updateChatTitle();
  queueConversationStateSave();
}

function ensureConversation() {
  if (getActiveConversation()) {
    return;
  }
  const conversation = createConversation();
  conversations.unshift(conversation);
  activeConversationId = conversation.id;
  queueConversationStateSave();
}

function updateActionButtons() {
  updateSendButtonMode();
  updateGenerationSettingsEnabledState();
  if (sendButton) {
    sendButton.disabled = isLoadingModel || (!isGenerating && !modelReady);
  }
  if (loadModelButton) {
    loadModelButton.disabled = isGenerating || isLoadingModel;
  }
  if (newConversationBtn) {
    newConversationBtn.disabled = isGenerating;
  }
  updateRegenerateButtons();
}

function updateRegenerateButtons() {
  if (!chatTranscript) {
    return;
  }
  const disabled = isLoadingModel || isGenerating || !modelReady;
  chatTranscript.querySelectorAll('.regenerate-response-btn').forEach((button) => {
    if (button instanceof HTMLButtonElement) {
      const item = button.closest('.message-row');
      const messageId = item?.dataset.messageId;
      const activeConversation = getActiveConversation();
      const modelMessage = activeConversation?.messageNodes.find(
        (message) => message.id === messageId && message.role === 'model',
      );
      const hideActions = !modelMessage?.isResponseComplete;
      const responseActions = button.closest('.response-actions');
      if (responseActions) {
        responseActions.classList.toggle('d-none', hideActions);
      }
      button.disabled = disabled || hideActions;
      const prevButton = responseActions?.querySelector('.response-variant-prev');
      const nextButton = responseActions?.querySelector('.response-variant-next');
      const variantNav = responseActions?.querySelector('.response-variant-nav');
      const variantLabel = responseActions?.querySelector('.response-variant-status');
      const variantState = getModelVariantState(activeConversation, modelMessage);
      if (variantNav) {
        variantNav.classList.toggle('d-none', !variantState.hasVariants || hideActions);
      }
      if (variantLabel) {
        variantLabel.textContent = `${Math.max(variantState.index + 1, 1)}/${Math.max(variantState.total, 1)}`;
      }
      if (prevButton instanceof HTMLButtonElement) {
        prevButton.disabled = disabled || hideActions || !variantState.canGoPrev;
      }
      if (nextButton instanceof HTMLButtonElement) {
        nextButton.disabled = disabled || hideActions || !variantState.canGoNext;
      }
    }
  });
}

function markActiveIncompleteModelMessageComplete() {
  const activeConversation = getActiveConversation();
  if (!activeConversation) {
    return;
  }
  const pendingModelMessage = [...getConversationPathMessages(activeConversation)]
    .reverse()
    .find((message) => message.role === 'model' && !message.isResponseComplete);
  if (!pendingModelMessage) {
    return;
  }
  pendingModelMessage.isResponseComplete = true;
  const pendingItem = chatTranscript?.querySelector(`[data-message-id="${pendingModelMessage.id}"]`);
  if (pendingItem instanceof HTMLElement) {
    updateModelMessageElement(pendingModelMessage, pendingItem);
  }
  queueConversationStateSave();
}

function updateSendButtonMode() {
  if (!sendButton) {
    return;
  }
  sendButton.setAttribute('data-bs-toggle', 'tooltip');
  const tooltipInstance = Tooltip.getInstance(sendButton);
  if (tooltipInstance) {
    tooltipInstance.dispose();
  }
  if (isGenerating) {
    sendButton.type = 'button';
    sendButton.classList.remove('btn-primary');
    sendButton.classList.add('btn-outline-secondary');
    sendButton.setAttribute('aria-label', 'Stop generating');
    sendButton.setAttribute('data-bs-title', 'Stop generating');
    setIconButtonContent(sendButton, 'bi-sign-stop', 'Stop generating');
    initializeTooltips(document);
    return;
  }
  sendButton.type = 'submit';
  sendButton.classList.remove('btn-outline-secondary');
  sendButton.classList.add('btn-primary');
  sendButton.setAttribute('aria-label', 'Send message');
  sendButton.setAttribute('data-bs-title', 'Send message');
  setIconButtonContent(sendButton, 'bi-send', 'Send message');
  initializeTooltips(document);
}

function showProgressRegion(show) {
  if (!modelLoadProgressWrap) {
    return;
  }
  modelLoadProgressWrap.classList.toggle('d-none', !show);
}

function clearLoadError() {
  if (modelLoadError) {
    modelLoadError.classList.add('d-none');
  }
  if (modelLoadErrorSummary) {
    modelLoadErrorSummary.textContent = '';
  }
  if (modelLoadErrorDetails) {
    modelLoadErrorDetails.replaceChildren();
  }
}

function setLoadProgress({ percent = 0, message = 'Preparing model...' }) {
  const numericPercent = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
  if (modelLoadProgressLabel) {
    modelLoadProgressLabel.textContent = message;
  }
  if (modelLoadProgressValue) {
    modelLoadProgressValue.textContent = `${Math.round(numericPercent)}%`;
  }
  if (modelLoadProgressBar) {
    modelLoadProgressBar.style.width = `${numericPercent}%`;
    modelLoadProgressBar.setAttribute('aria-valuenow', `${Math.round(numericPercent)}`);
  }
}

function showLoadError(errorMessage) {
  if (!modelLoadError) {
    return;
  }

  const parts = String(errorMessage || 'Unknown initialization error')
    .split(' | ')
    .map((segment) => segment.trim())
    .filter(Boolean);

  const [summary, ...details] = parts;
  if (modelLoadErrorSummary) {
    modelLoadErrorSummary.textContent = summary || 'Failed to initialize the selected model.';
  }
  if (modelLoadErrorDetails) {
    modelLoadErrorDetails.replaceChildren();
    details.forEach((detail) => {
      const item = document.createElement('li');
      item.textContent = detail;
      modelLoadErrorDetails.appendChild(item);
    });
  }
  modelLoadError.classList.remove('d-none');
}

function getStoredShowThinkingPreference() {
  return localStorage.getItem(SHOW_THINKING_STORAGE_KEY) === 'true';
}

function applyShowThinkingPreference(value, { persist = false, refresh = false } = {}) {
  showThinkingByDefault = Boolean(value);
  if (showThinkingToggle) {
    showThinkingToggle.checked = showThinkingByDefault;
  }
  if (persist) {
    localStorage.setItem(SHOW_THINKING_STORAGE_KEY, String(showThinkingByDefault));
  }
  if (refresh) {
    refreshModelThinkingVisibility();
  }
}

function getStoredThemePreference() {
  const storedPreference = localStorage.getItem(THEME_STORAGE_KEY);
  if (storedPreference === 'light' || storedPreference === 'dark' || storedPreference === 'system') {
    return storedPreference;
  }
  return 'system';
}

function resolveTheme(preference) {
  if (preference === 'system') {
    return colorSchemeQuery.matches ? 'dark' : 'light';
  }
  return preference;
}

function applyTheme(preference) {
  const resolvedTheme = resolveTheme(preference);
  document.documentElement.setAttribute('data-theme', resolvedTheme);
  document.documentElement.setAttribute('data-bs-theme', resolvedTheme);
  if (themeSelect) {
    themeSelect.value = preference;
  }
}

function populateModelSelect() {
  if (!modelSelect) {
    return;
  }
  modelSelect.replaceChildren();
  MODEL_OPTIONS.forEach((model) => {
    const option = document.createElement('option');
    option.value = model.id;
    option.textContent = model.label;
    modelSelect.appendChild(option);
  });
  modelSelect.value = DEFAULT_MODEL;
}

function restoreInferencePreferences() {
  const storedModel = localStorage.getItem(MODEL_STORAGE_KEY);
  const storedBackend = localStorage.getItem(BACKEND_STORAGE_KEY);
  if (modelSelect && storedModel) {
    const normalizedModel = normalizeModelId(storedModel);
    modelSelect.value = normalizedModel;
    localStorage.setItem(MODEL_STORAGE_KEY, normalizedModel);
  }
  if (backendSelect && storedBackend) {
    backendSelect.value = storedBackend;
  }
  const selectedModel = normalizeModelId(modelSelect?.value || DEFAULT_MODEL);
  syncGenerationSettingsFromModel(selectedModel, true);
}

function normalizeModelId(modelId) {
  const canonical = LEGACY_MODEL_ALIASES[modelId] || modelId;
  if (SUPPORTED_MODELS.has(canonical)) {
    return canonical;
  }
  return DEFAULT_MODEL;
}

function getThinkingTagsForModel(modelId) {
  return MODEL_OPTIONS_BY_ID.get(normalizeModelId(modelId))?.thinkingTags || null;
}

function parseThinkingText(rawText, thinkingTags) {
  const text = String(rawText || '');
  if (!thinkingTags?.open || !thinkingTags?.close) {
    return {
      response: text,
      thoughts: '',
      hasThinking: false,
      isThinkingComplete: false,
    };
  }

  const { open, close } = thinkingTags;
  let response = '';
  let thoughts = '';
  let cursor = 0;
  let hasThinking = false;
  let isThinkingComplete = false;

  while (cursor < text.length) {
    const openIndex = text.indexOf(open, cursor);
    if (openIndex < 0) {
      response += text.slice(cursor);
      break;
    }

    response += text.slice(cursor, openIndex);
    hasThinking = true;

    const contentStart = openIndex + open.length;
    const closeIndex = text.indexOf(close, contentStart);
    if (closeIndex < 0) {
      thoughts += text.slice(contentStart);
      break;
    }

    thoughts += text.slice(contentStart, closeIndex);
    isThinkingComplete = true;
    cursor = closeIndex + close.length;
  }

  return { response, thoughts, hasThinking, isThinkingComplete };
}

function readEngineConfigFromUI() {
  const selectedModel = normalizeModelId(modelSelect?.value || DEFAULT_MODEL);
  if (modelSelect && modelSelect.value !== selectedModel) {
    modelSelect.value = selectedModel;
  }
  syncGenerationSettingsFromModel(selectedModel, false);
  return {
    modelId: selectedModel,
    backendPreference: backendSelect?.value || 'auto',
    generationConfig: activeGenerationConfig,
  };
}

function persistInferencePreferences() {
  const selectedModel = normalizeModelId(modelSelect?.value || DEFAULT_MODEL);
  localStorage.setItem(MODEL_STORAGE_KEY, selectedModel);
  localStorage.setItem(BACKEND_STORAGE_KEY, backendSelect?.value || 'auto');
  persistGenerationConfigForModel(selectedModel, activeGenerationConfig);
}

async function initializeEngine() {
  const config = readEngineConfigFromUI();
  appendDebug(
    `Initialize requested (model=${config.modelId}, backendPreference=${config.backendPreference})`,
  );
  isLoadingModel = true;
  clearLoadError();
  showProgressRegion(true);
  setLoadProgress({ percent: 0, message: 'Starting model load...' });
  updateActionButtons();
  setStatus('Loading model...');
  try {
    await engine.initialize(config);
    modelReady = true;
    isLoadingModel = false;
    setLoadProgress({ percent: 100, message: 'Model ready.' });
    window.setTimeout(() => {
      if (modelReady && !isLoadingModel) {
        showProgressRegion(false);
      }
    }, 300);
    appendDebug('Model initialization succeeded.');
    updateActionButtons();
    updateWelcomePanelVisibility();
    updateChatTitle();
  } catch (error) {
    modelReady = false;
    isLoadingModel = false;
    setStatus(`Error: ${error.message}`);
    showLoadError(error.message);
    appendDebug(`Model initialization failed: ${error.message}`);
    updateActionButtons();
    updateWelcomePanelVisibility();
    updateChatTitle();
    throw error;
  }
}

async function reinitializeEngineFromSettings() {
  persistInferencePreferences();
  modelReady = false;
  setStatus('Settings updated. Select Load model to apply.');
  appendDebug('Inference settings changed; awaiting manual load.');
  updateActionButtons();
  updateWelcomePanelVisibility();
  updateChatTitle();
  if (isGenerating) {
    return;
  }
}

function startModelGeneration(activeConversation, prompt, options = {}) {
  const selectedModelId = normalizeModelId(modelSelect?.value || DEFAULT_MODEL);
  const thinkingTags = getThinkingTagsForModel(selectedModelId);
  const parentMessageId =
    typeof options.parentMessageId === 'string' && options.parentMessageId.trim()
      ? options.parentMessageId.trim()
      : activeConversation.activeLeafMessageId;
  const updateLastSpokenOnComplete = Boolean(options.updateLastSpokenOnComplete);
  const modelMessage = addMessageToConversation(activeConversation, 'model', '', {
    parentId: parentMessageId,
  });
  const modelBubbleItem = addMessageElement(modelMessage);
  let streamedText = '';

  isGenerating = true;
  updateActionButtons();

  try {
    engine.generate(prompt, {
      generationConfig: activeGenerationConfig,
      onToken: (chunk) => {
        streamedText += chunk;
        const parsed = parseThinkingText(streamedText, thinkingTags);
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
        updateModelMessageElement(modelMessage, modelBubbleItem);
        scrollTranscriptToBottom();
        queueConversationStateSave();
      },
      onComplete: (finalText) => {
        const parsed = parseThinkingText(finalText || streamedText, thinkingTags);
        modelMessage.thoughts = parsed.thoughts;
        modelMessage.response = parsed.response.trimStart();
        modelMessage.hasThinking = parsed.hasThinking || Boolean(parsed.thoughts.trim());
        modelMessage.isThinkingComplete = parsed.isThinkingComplete || (modelMessage.hasThinking && !thinkingTags);
        modelMessage.text = modelMessage.response || '[No output]';
        modelMessage.isResponseComplete = true;
        updateModelMessageElement(modelMessage, modelBubbleItem);
        scrollTranscriptToBottom();
        if (updateLastSpokenOnComplete) {
          activeConversation.lastSpokenLeafMessageId = modelMessage.id;
        }

        if (!activeConversation.hasGeneratedName && modelMessage.text !== '[No output]') {
          activeConversation.name = deriveConversationName(activeConversation);
          activeConversation.hasGeneratedName = true;
          renderConversationList();
          updateChatTitle();
        }

        appendDebug('Generation completed.');
        queueConversationStateSave();
        isGenerating = false;
        updateActionButtons();
        applyPendingGenerationSettingsIfReady();
      },
      onError: (message) => {
        modelMessage.text = `Generation error: ${message}`;
        modelMessage.response = modelMessage.text;
        modelMessage.thoughts = '';
        modelMessage.hasThinking = false;
        modelMessage.isThinkingComplete = false;
        modelMessage.isResponseComplete = true;
        updateModelMessageElement(modelMessage, modelBubbleItem);
        scrollTranscriptToBottom();
        if (updateLastSpokenOnComplete) {
          activeConversation.lastSpokenLeafMessageId = modelMessage.id;
        }
        isGenerating = false;
        updateActionButtons();
        applyPendingGenerationSettingsIfReady();
        setStatus('Generation failed');
        appendDebug(`Generation error: ${message}`);
        queueConversationStateSave();
      },
    });
  } catch (error) {
    modelMessage.text = `Generation error: ${error.message}`;
    modelMessage.response = modelMessage.text;
    modelMessage.thoughts = '';
    modelMessage.hasThinking = false;
    modelMessage.isThinkingComplete = false;
    modelMessage.isResponseComplete = true;
    updateModelMessageElement(modelMessage, modelBubbleItem);
    scrollTranscriptToBottom();
    if (updateLastSpokenOnComplete) {
      activeConversation.lastSpokenLeafMessageId = modelMessage.id;
    }
    isGenerating = false;
    updateActionButtons();
    applyPendingGenerationSettingsIfReady();
    setStatus('Generation failed');
    appendDebug(`Generation error: ${error.message}`);
    queueConversationStateSave();
  }
}

function animateTranscriptSlide(direction = 'next') {
  if (!chatTranscript) {
    return;
  }
  chatTranscript.classList.remove('transcript-slide-next', 'transcript-slide-prev');
  // Force reflow so repeated clicks retrigger the animation.
  void chatTranscript.offsetWidth;
  chatTranscript.classList.add(direction === 'prev' ? 'transcript-slide-prev' : 'transcript-slide-next');
  window.setTimeout(() => {
    chatTranscript.classList.remove('transcript-slide-next', 'transcript-slide-prev');
  }, 280);
}

function switchModelVariant(messageId, direction) {
  if (!messageId || isGenerating || isLoadingModel) {
    return;
  }
  const activeConversation = getActiveConversation();
  if (!activeConversation) {
    return;
  }
  const modelMessage = getMessageNodeById(activeConversation, messageId);
  if (!modelMessage || modelMessage.role !== 'model') {
    return;
  }
  const variantState = getModelVariantState(activeConversation, modelMessage);
  if (!variantState.hasVariants) {
    return;
  }
  const targetIndex = variantState.index + direction;
  if (targetIndex < 0 || targetIndex >= variantState.total) {
    return;
  }
  const targetMessage = variantState.siblings[targetIndex];
  if (!targetMessage) {
    return;
  }
  activeConversation.activeLeafMessageId = targetMessage.id;
  animateTranscriptSlide(direction < 0 ? 'prev' : 'next');
  renderTranscript();
  updateActionButtons();
  queueConversationStateSave();
}

function regenerateFromMessage(messageId) {
  if (!messageId || isGenerating || isLoadingModel) {
    return;
  }
  if (!modelReady) {
    setStatus('Please load a model before regenerating a response.');
    appendDebug('Regenerate blocked: model not ready.');
    if (loadModelButton) {
      loadModelButton.focus();
    }
    return;
  }

  const activeConversation = getActiveConversation();
  if (!activeConversation) {
    return;
  }

  const targetModelMessage = getMessageNodeById(activeConversation, messageId);
  if (!targetModelMessage || targetModelMessage.role !== 'model') {
    return;
  }

  const parentUserMessage = targetModelMessage.parentId
    ? getMessageNodeById(activeConversation, targetModelMessage.parentId)
    : null;
  if (!parentUserMessage || parentUserMessage.role !== 'user') {
    setStatus('Unable to regenerate: no user message found.');
    appendDebug('Regenerate failed: target model message has no preceding user message.');
    return;
  }

  activeConversation.activeLeafMessageId = parentUserMessage.id;
  animateTranscriptSlide('next');
  renderTranscript();
  queueConversationStateSave();
  startModelGeneration(activeConversation, buildPromptForConversationLeaf(activeConversation), {
    parentMessageId: parentUserMessage.id,
  });
}

engine.onStatus = (message) => {
  setStatus(message);
};

engine.onBackendResolved = (backend) => {
  setStatus(`Ready (${backend.toUpperCase()})`);
};

engine.onProgress = (progress) => {
  const message = progress?.message || 'Loading model files...';
  const percent = Number.isFinite(progress?.percent) ? progress.percent : 0;
  setLoadProgress({ percent, message });
};

const themePreference = getStoredThemePreference();
applyTheme(themePreference);
applyShowThinkingPreference(getStoredShowThinkingPreference());
populateModelSelect();
restoreInferencePreferences();
setStatus('Welcome. Choose a model, then select Load model.');
showProgressRegion(false);
updateActionButtons();
updateWelcomePanelVisibility();
void restoreConversationStateFromStorage();

if (themeSelect) {
  themeSelect.addEventListener('change', (event) => {
    const value = event.target.value;
    if (value !== 'light' && value !== 'dark' && value !== 'system') {
      return;
    }
    localStorage.setItem(THEME_STORAGE_KEY, value);
    applyTheme(value);
  });
}

if (showThinkingToggle) {
  showThinkingToggle.addEventListener('change', (event) => {
    const value = event.target instanceof HTMLInputElement ? event.target.checked : false;
    applyShowThinkingPreference(value, { persist: true, refresh: true });
  });
}

colorSchemeQuery.addEventListener('change', () => {
  if (getStoredThemePreference() === 'system') {
    applyTheme('system');
  }
});

if (modelSelect) {
  modelSelect.addEventListener('change', () => {
    const selectedModel = normalizeModelId(modelSelect.value || DEFAULT_MODEL);
    syncGenerationSettingsFromModel(selectedModel, true);
    reinitializeEngineFromSettings();
  });
}

if (backendSelect) {
  backendSelect.addEventListener('change', () => {
    reinitializeEngineFromSettings();
  });
}

if (maxOutputTokensInput) {
  maxOutputTokensInput.addEventListener('change', onGenerationSettingInputChanged);
}

if (maxContextTokensInput) {
  maxContextTokensInput.addEventListener('change', onGenerationSettingInputChanged);
}

if (temperatureInput) {
  temperatureInput.addEventListener('change', onGenerationSettingInputChanged);
}

if (loadModelButton) {
  loadModelButton.addEventListener('click', async () => {
    if (isGenerating) {
      return;
    }
    persistInferencePreferences();
    try {
      await initializeEngine();
    } catch (error) {
      // Status is already updated in initializeEngine.
    }
  });
}

if (newConversationBtn) {
  newConversationBtn.addEventListener('click', () => {
    if (isGenerating) {
      return;
    }
    const conversation = createConversation();
    conversations.unshift(conversation);
    activeConversationId = conversation.id;
    renderConversationList();
    renderTranscript();
    updateChatTitle();
    queueConversationStateSave();
  });
}

if (conversationList) {
  conversationList.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    if (isGenerating) {
      return;
    }

    const deleteButton = target.closest('.conversation-delete');
    if (deleteButton) {
      const item = deleteButton.closest('.conversation-item');
      const conversationId = item?.dataset.conversationId;
      if (!conversationId) {
        return;
      }

      const index = conversations.findIndex((conversation) => conversation.id === conversationId);
      if (index < 0) {
        return;
      }

      const wasActive = activeConversationId === conversationId;
      conversations.splice(index, 1);

      if (!conversations.length) {
        const replacement = createConversation();
        conversations.push(replacement);
      }

      if (wasActive) {
        activeConversationId = conversations[0].id;
      }
      renderConversationList();
      renderTranscript();
      updateChatTitle();
      queueConversationStateSave();
      return;
    }

    const selectButton = target.closest('.conversation-select');
    if (selectButton) {
      const item = selectButton.closest('.conversation-item');
      const conversationId = item?.dataset.conversationId;
      if (conversationId) {
        setActiveConversationById(conversationId);
      }
    }
  });
}

if (sendButton) {
  sendButton.addEventListener('click', async (event) => {
    if (!isGenerating) {
      return;
    }
    event.preventDefault();
    setStatus('Stopping generation...');
    try {
      await engine.cancelGeneration();
      modelReady = true;
      setStatus('Stopped');
      appendDebug('Generation canceled by user.');
    } catch (error) {
      modelReady = false;
      setStatus(`Error: ${error.message}`);
      appendDebug(`Cancel failed: ${error.message}`);
    } finally {
      markActiveIncompleteModelMessageComplete();
      isGenerating = false;
      updateActionButtons();
      applyPendingGenerationSettingsIfReady();
    }
  });
}

if (chatForm && messageInput && chatTranscript) {
  chatForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = messageInput.value.trim();
    if (!value || isGenerating) {
      return;
    }

    if (!modelReady) {
      setStatus('Please load a model before sending a message.');
      appendDebug('Send blocked: model not ready.');
      if (loadModelButton) {
        loadModelButton.focus();
      }
      return;
    }

    const activeConversation = getActiveConversation();
    if (!activeConversation) {
      return;
    }

    const userMessage = addMessageToConversation(activeConversation, 'user', value);
    activeConversation.lastSpokenLeafMessageId = userMessage.id;
    addMessageElement(userMessage);
    messageInput.value = '';
    queueConversationStateSave();
    startModelGeneration(activeConversation, buildPromptForConversationLeaf(activeConversation), {
      updateLastSpokenOnComplete: true,
    });
  });
}

if (chatTranscript) {
  chatTranscript.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const prevVariantButton = target.closest('.response-variant-prev');
    if (prevVariantButton instanceof HTMLButtonElement) {
      switchModelVariant(prevVariantButton.dataset.messageId || '', -1);
      return;
    }
    const nextVariantButton = target.closest('.response-variant-next');
    if (nextVariantButton instanceof HTMLButtonElement) {
      switchModelVariant(nextVariantButton.dataset.messageId || '', 1);
      return;
    }
    const regenerateButton = target.closest('.regenerate-response-btn');
    if (regenerateButton instanceof HTMLButtonElement) {
      regenerateFromMessage(regenerateButton.dataset.messageId || '');
    }
  });
}

window.addEventListener('beforeunload', () => {
  if (conversationSaveTimerId !== null) {
    window.clearTimeout(conversationSaveTimerId);
    conversationSaveTimerId = null;
  }
  void persistConversationStateNow();
  engine.dispose();
});

