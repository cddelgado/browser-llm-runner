import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import 'bootstrap-icons/font/bootstrap-icons.css';
import Tooltip from 'bootstrap/js/dist/tooltip';
import './styles.css';
import { LLMEngineClient } from './llm/engine-client.js';
import modelCatalog from './config/models.json';
import renameChatOrchestration from './config/orchestrations/rename-chat.json';
import fixResponseOrchestration from './config/orchestrations/fix-response.json';
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
const FIX_RESPONSE_ORCHESTRATION = fixResponseOrchestration;
const RENAME_CHAT_ORCHESTRATION = renameChatOrchestration;
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
const TRANSCRIPT_BOTTOM_THRESHOLD_PX = 24;

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
const modelLoadProgressSummary = document.getElementById('modelLoadProgressSummary');
const modelLoadFileList = document.getElementById('modelLoadFileList');
const modelLoadError = document.getElementById('modelLoadError');
const modelLoadErrorSummary = document.getElementById('modelLoadErrorSummary');
const modelLoadErrorDetails = document.getElementById('modelLoadErrorDetails');
const sendButton = document.getElementById('sendButton');
const conversationList = document.getElementById('conversationList');
const newConversationBtn = document.getElementById('newConversationBtn');
const chatForm = document.querySelector('.composer');
const messageInput = document.getElementById('messageInput');
const chatTranscript = document.getElementById('chatTranscript');
const chatTranscriptWrap = document.getElementById('chatTranscriptWrap');
const jumpToLastPromptButton = document.getElementById('jumpToLastPromptButton');
const jumpToLatestButton = document.getElementById('jumpToLatestButton');
const chatMain = document.querySelector('.chat-main');
const welcomePanel = document.querySelector('.welcome-panel');
const topBar = document.getElementById('topBar');
const conversationPanel = document.getElementById('conversationPanel');
const onboardingStatusRegion = document.getElementById('onboardingStatusRegion');
const chatTitle = document.getElementById('chatTitle');
const chatTitleInput = document.getElementById('chatTitleInput');
const editChatTitleBtn = document.getElementById('editChatTitleBtn');
const saveChatTitleBtn = document.getElementById('saveChatTitleBtn');
const cancelChatTitleBtn = document.getElementById('cancelChatTitleBtn');
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
let isSwitchingVariant = false;
let activeUserEditMessageId = null;
let isChatTitleEditing = false;
let isRunningOrchestration = false;
const loadProgressFiles = new Map();

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

async function copyTextToClipboard(text) {
  const normalizedText = String(text || '');
  if (!normalizedText) {
    return false;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(normalizedText);
      return true;
    }
  } catch (_error) {
    // Fall through to legacy fallback.
  }
  const fallbackTextArea = document.createElement('textarea');
  fallbackTextArea.value = normalizedText;
  fallbackTextArea.setAttribute('readonly', '');
  fallbackTextArea.style.position = 'fixed';
  fallbackTextArea.style.opacity = '0';
  fallbackTextArea.style.pointerEvents = 'none';
  document.body.appendChild(fallbackTextArea);
  fallbackTextArea.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch (_error) {
    copied = false;
  }
  document.body.removeChild(fallbackTextArea);
  return copied;
}

async function handleMessageCopyAction(messageId, copyType) {
  const activeConversation = getActiveConversation();
  if (!activeConversation || !messageId) {
    return;
  }
  const message = getMessageNodeById(activeConversation, messageId);
  if (!message) {
    return;
  }
  let textToCopy = '';
  if (copyType === 'thoughts') {
    textToCopy = message.role === 'model' ? String(message.thoughts || '') : '';
  } else if (copyType === 'response') {
    textToCopy = message.role === 'model' ? String(message.response || message.text || '') : '';
  } else {
    textToCopy = String(message.text || '');
  }
  const didCopy = await copyTextToClipboard(textToCopy);
  setStatus(didCopy ? 'Copied to clipboard.' : 'Copy failed.');
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
  if (onboardingStatusRegion) {
    onboardingStatusRegion.textContent = message;
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

  activeConversationId = null;

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

function getOrchestrationSteps(orchestration) {
  const steps = Array.isArray(orchestration?.steps) ? orchestration.steps : [];
  if (!steps.length) {
    throw new Error('Invalid orchestration definition.');
  }
  steps.forEach((step, index) => {
    if (typeof step?.prompt !== 'string' || !step.prompt.trim()) {
      throw new Error(`Invalid orchestration step at index ${index}.`);
    }
  });
  return steps;
}

function buildOrchestrationPrompt(step, variables = {}) {
  if (!step || typeof step.prompt !== 'string' || !step.prompt.trim()) {
    throw new Error('Invalid orchestration definition.');
  }
  const renderedPrompt = step.prompt.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key) =>
    String(variables[key] ?? ''),
  );
  const responseInstructions =
    typeof step?.responseFormat?.instructions === 'string'
      ? step.responseFormat.instructions.trim()
      : '';
  if (!responseInstructions) {
    return renderedPrompt.trim();
  }
  return `${renderedPrompt.trim()}\n\nResponse format:\n${responseInstructions}`;
}

function requestSingleGeneration(prompt) {
  return new Promise((resolve, reject) => {
    let streamedText = '';
    try {
      engine.generate(prompt, {
        generationConfig: activeGenerationConfig,
        onToken: (chunk) => {
          streamedText += String(chunk || '');
        },
        onComplete: (finalText) => {
          resolve(String(finalText || streamedText).trim());
        },
        onError: (message) => {
          reject(new Error(String(message || 'Generation failed.')));
        },
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function runOrchestration(orchestration, variables = {}, options = {}) {
  const orchestrationId = typeof orchestration?.id === 'string' ? orchestration.id : 'unnamed-orchestration';
  const runFinalStep = options?.runFinalStep !== false;
  const steps = getOrchestrationSteps(orchestration);
  const promptVariables = { ...variables };
  appendDebug(`Orchestration started: ${orchestrationId} (${steps.length} steps)`);

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const stepName =
      typeof step?.stepName === 'string' && step.stepName.trim()
        ? step.stepName.trim()
        : `Step ${index + 1}`;
    const stepPrompt = buildOrchestrationPrompt(step, promptVariables);
    const isFinalStep = index === steps.length - 1;

    if (isFinalStep && !runFinalStep) {
      appendDebug(`Orchestration prepared final step: ${orchestrationId} [${stepName}]`);
      appendDebug(`Orchestration completed: ${orchestrationId}`);
      return {
        finalPrompt: stepPrompt,
        finalOutput: '',
      };
    }

    appendDebug(`Orchestration step ${index + 1}/${steps.length}: ${orchestrationId} [${stepName}]`);
    const stepOutput = await requestSingleGeneration(stepPrompt);
    promptVariables.previousStepOutput = stepOutput;
    promptVariables.lastStepOutput = stepOutput;
    promptVariables[`step${index + 1}Output`] = stepOutput;
    const outputKey = typeof step?.outputKey === 'string' ? step.outputKey.trim() : '';
    if (outputKey) {
      promptVariables[outputKey] = stepOutput;
    }
    if (isFinalStep) {
      appendDebug(`Orchestration completed: ${orchestrationId}`);
      return {
        finalPrompt: stepPrompt,
        finalOutput: stepOutput,
      };
    }
  }

  throw new Error('Invalid orchestration definition.');
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

function isMessageDescendantOf(conversation, messageId, ancestorId) {
  if (!conversation || !messageId || !ancestorId) {
    return false;
  }
  let cursor = getMessageNodeById(conversation, messageId);
  while (cursor) {
    if (cursor.id === ancestorId) {
      return true;
    }
    cursor = cursor.parentId ? getMessageNodeById(conversation, cursor.parentId) : null;
  }
  return false;
}

function pruneDescendantsFromMessage(conversation, messageId) {
  if (!conversation || !messageId) {
    return 0;
  }
  const rootMessage = getMessageNodeById(conversation, messageId);
  if (!rootMessage) {
    return 0;
  }
  const idsToRemove = new Set();
  const stack = Array.isArray(rootMessage.childIds) ? [...rootMessage.childIds] : [];
  while (stack.length) {
    const candidateId = stack.pop();
    if (!candidateId || idsToRemove.has(candidateId)) {
      continue;
    }
    const candidateMessage = getMessageNodeById(conversation, candidateId);
    if (!candidateMessage) {
      continue;
    }
    idsToRemove.add(candidateId);
    (candidateMessage.childIds || []).forEach((childId) => {
      if (!idsToRemove.has(childId)) {
        stack.push(childId);
      }
    });
  }
  if (!idsToRemove.size) {
    return 0;
  }
  conversation.messageNodes = conversation.messageNodes.filter((message) => !idsToRemove.has(message.id));
  conversation.messageNodes.forEach((message) => {
    message.childIds = Array.isArray(message.childIds)
      ? message.childIds.filter((childId) => !idsToRemove.has(childId))
      : [];
  });
  rootMessage.childIds = [];
  if (idsToRemove.has(conversation.activeLeafMessageId)) {
    conversation.activeLeafMessageId = rootMessage.id;
  }
  if (idsToRemove.has(conversation.lastSpokenLeafMessageId)) {
    conversation.lastSpokenLeafMessageId = rootMessage.id;
  }
  if (activeUserEditMessageId && idsToRemove.has(activeUserEditMessageId)) {
    activeUserEditMessageId = null;
  }
  return idsToRemove.size;
}

function parseMessageSequenceFromNodeId(nodeId) {
  const sequence = parseMessageNodeCounterFromId(nodeId);
  return Number.isInteger(sequence) && sequence > 0 ? sequence : 0;
}

function findPreferredLeafForVariant(conversation, variantMessage) {
  if (!conversation || !variantMessage) {
    return null;
  }
  const activeLeafId = conversation.activeLeafMessageId;
  if (activeLeafId && isMessageDescendantOf(conversation, activeLeafId, variantMessage.id)) {
    return activeLeafId;
  }
  const lastSpokenLeafId = conversation.lastSpokenLeafMessageId;
  if (lastSpokenLeafId && isMessageDescendantOf(conversation, lastSpokenLeafId, variantMessage.id)) {
    return lastSpokenLeafId;
  }

  const stack = [variantMessage.id];
  let preferredLeafId = variantMessage.id;
  let preferredLeafSequence = parseMessageSequenceFromNodeId(preferredLeafId);
  while (stack.length) {
    const currentId = stack.pop();
    const currentMessage = getMessageNodeById(conversation, currentId);
    if (!currentMessage) {
      continue;
    }
    const childIds = Array.isArray(currentMessage.childIds) ? currentMessage.childIds : [];
    if (!childIds.length) {
      const currentSequence = parseMessageSequenceFromNodeId(currentMessage.id);
      if (currentSequence >= preferredLeafSequence) {
        preferredLeafId = currentMessage.id;
        preferredLeafSequence = currentSequence;
      }
      continue;
    }
    childIds.forEach((childId) => {
      stack.push(childId);
    });
  }
  return preferredLeafId;
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

function getUserSiblingMessages(conversation, userMessage) {
  if (!conversation || !userMessage || userMessage.role !== 'user') {
    return [];
  }
  if (!userMessage.parentId) {
    return conversation.messageNodes.filter(
      (candidate) => candidate?.role === 'user' && !candidate.parentId,
    );
  }
  const parentMessage = getMessageNodeById(conversation, userMessage.parentId);
  if (!parentMessage || parentMessage.role !== 'model') {
    return [];
  }
  return (parentMessage.childIds || [])
    .map((childId) => getMessageNodeById(conversation, childId))
    .filter((child) => child?.role === 'user');
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

function getUserVariantState(conversation, userMessage) {
  const siblings = getUserSiblingMessages(conversation, userMessage);
  const index = siblings.findIndex((candidate) => candidate.id === userMessage.id);
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
  refs.thinkingToggle.setAttribute('aria-expanded', String(isExpanded));
  refs.thinkingCopyButton.disabled = !hasThinking || !message.thoughts?.trim();
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

function addMessageElement(message, options = {}) {
  if (!chatTranscript) {
    return null;
  }
  const shouldScroll = options.scroll !== false;
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
          <div class="thoughts-toolbar">
            <a href="#" class="thinking-toggle" aria-expanded="false">Thinking</a>
            <button
              type="button"
              class="btn btn-sm btn-link thoughts-copy-btn"
              data-message-id="${message.id}"
              aria-label="Copy thoughts"
              data-copy-type="thoughts"
              data-bs-toggle="tooltip"
              data-bs-title="Copy thoughts"
            >
              <i class="bi bi-copy" aria-hidden="true"></i>
              <span class="visually-hidden">Copy thoughts</span>
            </button>
          </div>
          <p class="thoughts-content" hidden></p>
        </section>
        <section class="response-region">
          <h3 class="visually-hidden">Response</h3>
          <p class="response-content mb-0"></p>
        </section>
      </div>
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
        <button
          type="button"
          class="btn btn-sm btn-outline-primary fix-response-btn"
          data-message-id="${message.id}"
          aria-label="Fix response"
          data-bs-toggle="tooltip"
          data-bs-title="Fix response"
        >
          <i class="bi bi-wrench-adjustable-circle" aria-hidden="true"></i>
          <span class="visually-hidden">Fix response</span>
        </button>
        <button
          type="button"
          class="btn btn-sm btn-outline-primary copy-message-btn"
          data-message-id="${message.id}"
          aria-label="Copy response"
          data-copy-type="response"
          data-bs-toggle="tooltip"
          data-bs-title="Copy response"
        >
          <i class="bi bi-copy" aria-hidden="true"></i>
          <span class="visually-hidden">Copy response</span>
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
    `;
    const responseActions = item.querySelector('.response-actions');
    if (responseActions) {
      responseActions.classList.toggle('d-none', !message.isResponseComplete);
    }
    const thinkingRegion = item.querySelector('.thoughts-region');
    const thinkingToggle = item.querySelector('.thinking-toggle');
    const thinkingCopyButton = item.querySelector('.thoughts-copy-btn');
    const thinkingBody = item.querySelector('.thoughts-content');
    const thoughtsText = item.querySelector('.thoughts-content');
    const responseText = item.querySelector('.response-content');
    if (thinkingRegion && thinkingToggle && thinkingCopyButton && thinkingBody && thoughtsText && responseText) {
      const refs = { thinkingRegion, thinkingToggle, thinkingCopyButton, thinkingBody, thoughtsText, responseText };
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
    const activeConversation = getActiveConversation();
    const variantState = getUserVariantState(activeConversation, message);
    const variantLabel = `${Math.max(variantState.index + 1, 1)}/${Math.max(variantState.total, 1)}`;
    const isEditing = activeUserEditMessageId === message.id;
    item.innerHTML = `
      <p class="message-speaker">${message.speaker}</p>
      <p class="message-bubble mb-0"></p>
      <textarea
        class="form-control user-message-editor${isEditing ? '' : ' d-none'}"
        rows="3"
        aria-label="Edit user message"
      ></textarea>
      <section class="message-actions">
        <button
          type="button"
          class="btn btn-sm btn-outline-primary edit-user-message-btn${isEditing ? ' d-none' : ''}"
          data-message-id="${message.id}"
          aria-label="Edit message"
          data-bs-toggle="tooltip"
          data-bs-title="Edit message"
        >
          <i class="bi bi-pencil-fill" aria-hidden="true"></i>
          <span class="visually-hidden">Edit message</span>
        </button>
        <button
          type="button"
          class="btn btn-sm btn-outline-primary save-user-message-btn${isEditing ? '' : ' d-none'}"
          data-message-id="${message.id}"
          aria-label="Save edited message"
          data-bs-toggle="tooltip"
          data-bs-title="Save edited message"
        >
          <i class="bi bi-floppy-fill" aria-hidden="true"></i>
          <span class="visually-hidden">Save edited message</span>
        </button>
        <button
          type="button"
          class="btn btn-sm btn-outline-primary cancel-user-edit-btn${isEditing ? '' : ' d-none'}"
          data-message-id="${message.id}"
          aria-label="Cancel editing message"
          data-bs-toggle="tooltip"
          data-bs-title="Cancel editing"
        >
          <i class="bi bi-x-circle-fill" aria-hidden="true"></i>
          <span class="visually-hidden">Cancel editing</span>
        </button>
        <button
          type="button"
          class="btn btn-sm btn-outline-primary branch-user-message-btn${isEditing ? ' d-none' : ''}"
          data-message-id="${message.id}"
          aria-label="Branch from this user message"
          data-bs-toggle="tooltip"
          data-bs-title="Branch conversation"
        >
          <i class="bi bi-terminal-split" aria-hidden="true"></i>
          <span class="visually-hidden">Branch conversation</span>
        </button>
        <button
          type="button"
          class="btn btn-sm btn-outline-primary copy-message-btn${isEditing ? ' d-none' : ''}"
          data-message-id="${message.id}"
          aria-label="Copy message"
          data-copy-type="message"
          data-bs-toggle="tooltip"
          data-bs-title="Copy message"
        >
          <i class="bi bi-copy" aria-hidden="true"></i>
          <span class="visually-hidden">Copy message</span>
        </button>
        <div class="response-variant-nav user-variant-nav${variantState.hasVariants && !isEditing ? '' : ' d-none'}">
          <button
            type="button"
            class="btn btn-sm btn-outline-primary user-variant-prev"
            data-message-id="${message.id}"
            aria-label="Previous user branch"
            data-bs-toggle="tooltip"
            data-bs-title="Previous user branch"
            ${variantState.canGoPrev ? '' : 'disabled'}
          >
            <i class="bi bi-arrow-bar-left" aria-hidden="true"></i>
            <span class="visually-hidden">Previous user branch</span>
          </button>
          <p class="response-variant-status user-variant-status mb-0" aria-live="off">${variantLabel}</p>
          <button
            type="button"
            class="btn btn-sm btn-outline-primary user-variant-next"
            data-message-id="${message.id}"
            aria-label="Next user branch"
            data-bs-toggle="tooltip"
            data-bs-title="Next user branch"
            ${variantState.canGoNext ? '' : 'disabled'}
          >
            <i class="bi bi-arrow-bar-right" aria-hidden="true"></i>
            <span class="visually-hidden">Next user branch</span>
          </button>
        </div>
      </section>
    `;
    const bubble = item.querySelector('.message-bubble');
    const editor = item.querySelector('.user-message-editor');
    const editButton = item.querySelector('.edit-user-message-btn');
    const saveButton = item.querySelector('.save-user-message-btn');
    const cancelButton = item.querySelector('.cancel-user-edit-btn');
    const branchButton = item.querySelector('.branch-user-message-btn');
    const copyButton = item.querySelector('.copy-message-btn');
    const variantNav = item.querySelector('.user-variant-nav');
    const variantLabelElement = item.querySelector('.user-variant-status');
    const variantPrev = item.querySelector('.user-variant-prev');
    const variantNext = item.querySelector('.user-variant-next');
    if (
      bubble &&
      editor instanceof HTMLTextAreaElement &&
      editButton instanceof HTMLButtonElement &&
      saveButton instanceof HTMLButtonElement &&
      cancelButton instanceof HTMLButtonElement &&
      branchButton instanceof HTMLButtonElement &&
      copyButton instanceof HTMLButtonElement
    ) {
      editor.value = message.text || '';
      editor.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          cancelUserMessageEdit(message.id);
          return;
        }
        if (
          (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) ||
          (event.key === 'Enter' && event.altKey)
        ) {
          event.preventDefault();
          saveUserMessageEdit(message.id);
        }
      });
      editor.addEventListener('input', () => {
        const isCurrentEdit = activeUserEditMessageId === message.id;
        saveButton.disabled = !isCurrentEdit || !editor.value.trim();
      });
      item._userBubbleRefs = {
        bubble,
        editor,
        editButton,
        saveButton,
        cancelButton,
        branchButton,
        copyButton,
        variantNav,
        variantLabel: variantLabelElement,
        variantPrev,
        variantNext,
      };
      updateUserMessageElement(message, item);
    }
  }
  chatTranscript.appendChild(item);
  initializeTooltips(item);
  if (shouldScroll) {
    scrollTranscriptToBottom();
  }
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

function updateUserMessageElement(message, item) {
  if (!item || message.role !== 'user') {
    return;
  }
  item._userMessage = message;
  const refs = item._userBubbleRefs || null;
  if (!refs) {
    return;
  }
  refs.bubble.textContent = message.text || '';
  const activeConversation = getActiveConversation();
  const variantState = getUserVariantState(activeConversation, message);
  const isEditing = activeUserEditMessageId === message.id;
  const controlsDisabled =
    isLoadingModel ||
    isGenerating ||
    isRunningOrchestration ||
    isSwitchingVariant ||
    Boolean(activeUserEditMessageId && !isEditing);
  refs.bubble.classList.toggle('d-none', isEditing);
  refs.editor.classList.toggle('d-none', !isEditing);
  refs.editor.disabled = controlsDisabled;
  refs.editButton.classList.toggle('d-none', isEditing);
  refs.branchButton.classList.toggle('d-none', isEditing);
  refs.copyButton.classList.toggle('d-none', isEditing);
  refs.saveButton.classList.toggle('d-none', !isEditing);
  refs.cancelButton.classList.toggle('d-none', !isEditing);
  refs.editButton.disabled = controlsDisabled;
  refs.branchButton.disabled = controlsDisabled;
  refs.copyButton.disabled = controlsDisabled;
  refs.saveButton.disabled = controlsDisabled || !refs.editor.value.trim();
  refs.cancelButton.disabled = controlsDisabled;
  if (refs.variantNav) {
    refs.variantNav.classList.toggle('d-none', !variantState.hasVariants || isEditing);
  }
  if (refs.variantLabel) {
    refs.variantLabel.textContent = `${Math.max(variantState.index + 1, 1)}/${Math.max(variantState.total, 1)}`;
  }
  if (refs.variantPrev instanceof HTMLButtonElement) {
    refs.variantPrev.disabled = controlsDisabled || !variantState.canGoPrev || isEditing;
  }
  if (refs.variantNext instanceof HTMLButtonElement) {
    refs.variantNext.disabled = controlsDisabled || !variantState.canGoNext || isEditing;
  }
  applyVariantCardSignals(item, variantState);
}

function scrollTranscriptToBottom() {
  if (!chatMain) {
    return;
  }
  chatMain.scrollTop = chatMain.scrollHeight;
  updateTranscriptNavigationButtonVisibility();
}

function isTranscriptNearBottom() {
  if (!chatMain) {
    return true;
  }
  const distanceToBottom = chatMain.scrollHeight - (chatMain.scrollTop + chatMain.clientHeight);
  return distanceToBottom <= TRANSCRIPT_BOTTOM_THRESHOLD_PX;
}

function getLastPromptMessageId(conversation = getActiveConversation()) {
  if (!conversation) {
    return null;
  }
  const pathMessages = getConversationPathMessages(conversation);
  for (let index = pathMessages.length - 1; index >= 0; index -= 1) {
    if (pathMessages[index]?.role === 'user') {
      return pathMessages[index].id;
    }
  }
  return null;
}

function isMessageInView(messageId) {
  if (!chatMain || !messageId) {
    return false;
  }
  const messageItem = chatTranscript?.querySelector(`[data-message-id="${messageId}"]`);
  if (!(messageItem instanceof HTMLElement)) {
    return false;
  }
  const containerRect = chatMain.getBoundingClientRect();
  const messageRect = messageItem.getBoundingClientRect();
  return messageRect.bottom >= containerRect.top && messageRect.top <= containerRect.bottom;
}

function updateTranscriptNavigationButtonVisibility() {
  if (
    !(jumpToLatestButton instanceof HTMLButtonElement) ||
    !(jumpToLastPromptButton instanceof HTMLButtonElement)
  ) {
    return;
  }
  const hasTranscriptItems = Boolean(chatTranscript?.children.length);
  const shouldShowJumpToLatest = modelReady && hasTranscriptItems && !isTranscriptNearBottom();
  jumpToLatestButton.classList.toggle('d-none', !shouldShowJumpToLatest);

  const lastPromptMessageId = getLastPromptMessageId();
  const shouldShowJumpToPrompt =
    modelReady && hasTranscriptItems && Boolean(lastPromptMessageId) && !isMessageInView(lastPromptMessageId);
  jumpToLastPromptButton.classList.toggle('d-none', !shouldShowJumpToPrompt);
}

function renderTranscript(options = {}) {
  if (!chatTranscript) {
    return;
  }
  const shouldScrollToBottom = options.scrollToBottom !== false;
  disposeTooltips(chatTranscript);
  chatTranscript.replaceChildren();
  const conversation = getActiveConversation();
  if (!conversation) {
    if (modelReady && conversations.length) {
      const emptyItem = document.createElement('li');
      emptyItem.className = 'transcript-empty-state text-body-secondary';
      emptyItem.textContent = 'Select a conversation from the left panel, or start a new conversation.';
      chatTranscript.appendChild(emptyItem);
    }
    updateTranscriptNavigationButtonVisibility();
    return;
  }
  getConversationPathMessages(conversation).forEach((message) => {
    addMessageElement(message, { scroll: false });
  });
  if (shouldScrollToBottom) {
    scrollTranscriptToBottom();
    return;
  }
  updateTranscriptNavigationButtonVisibility();
}

function updateChatTitleEditorVisibility() {
  if (!chatTitle || !chatTitleInput || !editChatTitleBtn || !saveChatTitleBtn || !cancelChatTitleBtn) {
    return;
  }
  const activeConversation = getActiveConversation();
  const canEditTitle = modelReady && Boolean(activeConversation?.hasGeneratedName);
  const controlsDisabled = isGenerating || isLoadingModel || isRunningOrchestration;
  const showEditor = canEditTitle && isChatTitleEditing;
  chatTitle.classList.toggle('d-none', showEditor);
  chatTitleInput.classList.toggle('d-none', !showEditor);
  editChatTitleBtn.classList.toggle('d-none', !canEditTitle || showEditor);
  saveChatTitleBtn.classList.toggle('d-none', !showEditor);
  cancelChatTitleBtn.classList.toggle('d-none', !showEditor);
  chatTitleInput.disabled = !showEditor || controlsDisabled;
  editChatTitleBtn.disabled = controlsDisabled;
  saveChatTitleBtn.disabled = controlsDisabled || !chatTitleInput.value.trim();
  cancelChatTitleBtn.disabled = controlsDisabled;
}

function beginChatTitleEdit() {
  if (isGenerating || isLoadingModel || isRunningOrchestration) {
    return;
  }
  const activeConversation = getActiveConversation();
  if (!activeConversation?.hasGeneratedName || !chatTitleInput) {
    return;
  }
  isChatTitleEditing = true;
  chatTitleInput.value = activeConversation.name;
  updateChatTitleEditorVisibility();
  chatTitleInput.focus();
  chatTitleInput.select();
}

function cancelChatTitleEdit({ restoreFocus = true } = {}) {
  if (!isChatTitleEditing) {
    return;
  }
  isChatTitleEditing = false;
  updateChatTitle();
  if (restoreFocus && editChatTitleBtn instanceof HTMLButtonElement) {
    editChatTitleBtn.focus();
  }
}

function saveChatTitleEdit() {
  if (!isChatTitleEditing || !chatTitleInput) {
    return;
  }
  const activeConversation = getActiveConversation();
  if (!activeConversation) {
    cancelChatTitleEdit({ restoreFocus: false });
    return;
  }
  const nextName = normalizeConversationName(chatTitleInput.value);
  if (!nextName) {
    setStatus('Conversation title cannot be empty.');
    chatTitleInput.focus();
    chatTitleInput.select();
    return;
  }
  activeConversation.name = nextName;
  activeConversation.hasGeneratedName = true;
  isChatTitleEditing = false;
  renderConversationList();
  updateChatTitle();
  queueConversationStateSave();
  setStatus('Conversation title saved.');
  if (editChatTitleBtn instanceof HTMLButtonElement) {
    editChatTitleBtn.focus();
  }
}

function setRegionVisibility(region, visible) {
  if (!(region instanceof HTMLElement)) {
    return;
  }
  region.classList.toggle('d-none', !visible);
  if (visible) {
    region.removeAttribute('aria-hidden');
    region.inert = false;
    return;
  }
  region.setAttribute('aria-hidden', 'true');
  region.inert = true;
}

function updateWelcomePanelVisibility() {
  const showConversation = modelReady;
  setRegionVisibility(welcomePanel, !showConversation);
  setRegionVisibility(topBar, showConversation);
  setRegionVisibility(conversationPanel, showConversation);
  setRegionVisibility(chatTranscriptWrap, showConversation);
  setRegionVisibility(chatForm, showConversation);
  if (!showConversation && isChatTitleEditing) {
    isChatTitleEditing = false;
  }
  updateChatTitleEditorVisibility();
  updateTranscriptNavigationButtonVisibility();
}

function updateChatTitle() {
  if (!chatTitle) {
    return;
  }
  const activeConversation = getActiveConversation();
  if (modelReady && !activeConversation && conversations.length) {
    chatTitle.textContent = 'Select a Conversation';
    updateChatTitleEditorVisibility();
    return;
  }
  if (activeConversation?.hasGeneratedName) {
    chatTitle.textContent = activeConversation.name;
    if (!isChatTitleEditing && chatTitleInput) {
      chatTitleInput.value = activeConversation.name;
    }
    updateChatTitleEditorVisibility();
    return;
  }
  chatTitle.textContent = modelReady ? 'Start Your Chat Now' : 'Choose a Model to Chat';
  if (!isChatTitleEditing && chatTitleInput && activeConversation) {
    chatTitleInput.value = activeConversation.name;
  }
  updateChatTitleEditorVisibility();
}

function setActiveConversationById(conversationId) {
  if (activeConversationId === conversationId) {
    return;
  }
  if (isChatTitleEditing) {
    isChatTitleEditing = false;
  }
  activeConversationId = conversationId;
  const activeConversation = getActiveConversation();
  if (
    activeConversation?.lastSpokenLeafMessageId &&
    getMessageNodeById(activeConversation, activeConversation.lastSpokenLeafMessageId)
  ) {
    activeConversation.activeLeafMessageId = activeConversation.lastSpokenLeafMessageId;
  }
  activeUserEditMessageId = null;
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
  updateChatTitleEditorVisibility();
  if (sendButton) {
    sendButton.disabled =
      isLoadingModel ||
      isRunningOrchestration ||
      (!isGenerating && !modelReady) ||
      Boolean(activeUserEditMessageId);
  }
  if (loadModelButton) {
    loadModelButton.disabled = isGenerating || isLoadingModel || isRunningOrchestration;
  }
  if (newConversationBtn) {
    newConversationBtn.disabled = isGenerating || isRunningOrchestration;
  }
  updateRegenerateButtons();
  updateUserMessageButtons();
}

function updateRegenerateButtons() {
  if (!chatTranscript) {
    return;
  }
  const disabled =
    isLoadingModel ||
    isGenerating ||
    isRunningOrchestration ||
    isSwitchingVariant ||
    !modelReady ||
    Boolean(activeUserEditMessageId);
  chatTranscript.querySelectorAll('.message-row.model-message').forEach((item) => {
    if (!(item instanceof HTMLElement)) {
      return;
    }
    const messageId = item.dataset.messageId;
    const activeConversation = getActiveConversation();
    const modelMessage = activeConversation?.messageNodes.find(
      (message) => message.id === messageId && message.role === 'model',
    );
    const hideActions = !modelMessage?.isResponseComplete;
    const responseActions = item.querySelector('.response-actions');
    if (responseActions) {
      responseActions.classList.toggle('d-none', hideActions);
      responseActions
        .querySelectorAll('.regenerate-response-btn, .fix-response-btn')
        .forEach((button) => {
          if (button instanceof HTMLButtonElement) {
            button.disabled = disabled || hideActions;
          }
        });
      const prevButton = responseActions.querySelector('.response-variant-prev');
      const nextButton = responseActions.querySelector('.response-variant-next');
      const variantNav = responseActions.querySelector('.response-variant-nav');
      const variantLabel = responseActions.querySelector('.response-variant-status');
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

function updateUserMessageButtons() {
  if (!chatTranscript) {
    return;
  }
  chatTranscript.querySelectorAll('.message-row.user-message').forEach((item) => {
    if (!(item instanceof HTMLElement)) {
      return;
    }
    const messageId = item.dataset.messageId;
    const activeConversation = getActiveConversation();
    const userMessage = activeConversation?.messageNodes.find(
      (message) => message.id === messageId && message.role === 'user',
    );
    if (!userMessage) {
      return;
    }
    updateUserMessageElement(userMessage, item);
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

function formatLoadFileLabel(fileName) {
  if (typeof fileName !== 'string' || !fileName.trim()) {
    return '';
  }
  const normalized = fileName.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  return segments[segments.length - 1] || normalized;
}

function resetLoadProgressFiles() {
  loadProgressFiles.clear();
  renderLoadProgressFiles();
}

function renderLoadProgressFiles() {
  if (!modelLoadProgressSummary && !modelLoadFileList) {
    return;
  }
  const entries = [...loadProgressFiles.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  const completeCount = entries.filter((entry) => entry.isComplete).length;
  if (modelLoadProgressSummary) {
    if (!entries.length) {
      modelLoadProgressSummary.textContent = 'Waiting for download details...';
    } else {
      modelLoadProgressSummary.textContent = `${completeCount}/${entries.length} files loaded`;
    }
  }
  if (modelLoadFileList) {
    modelLoadFileList.replaceChildren();
    entries.slice(0, 10).forEach((entry) => {
      const item = document.createElement('li');
      const statusSuffix = entry.status ? ` (${entry.status})` : '';
      item.textContent = `${entry.label}: ${Math.round(entry.percent)}%${statusSuffix}`;
      modelLoadFileList.appendChild(item);
    });
    if (entries.length > 10) {
      const overflowItem = document.createElement('li');
      overflowItem.textContent = `...and ${entries.length - 10} more files`;
      modelLoadFileList.appendChild(overflowItem);
    }
  }
}

function trackLoadFileProgress(file, percent, status) {
  if (typeof file !== 'string' || !file.trim()) {
    return;
  }
  const key = file.trim();
  const numericPercent = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
  const statusText = typeof status === 'string' ? status.trim() : '';
  const previous = loadProgressFiles.get(key);
  const isComplete = numericPercent >= 100 || /complete|ready|loaded|done|cached/i.test(statusText);
  loadProgressFiles.set(key, {
    label: formatLoadFileLabel(key),
    percent: previous ? Math.max(previous.percent, numericPercent) : numericPercent,
    status: statusText || previous?.status || '',
    isComplete: Boolean(previous?.isComplete || isComplete),
    updatedAt: Date.now(),
  });
  renderLoadProgressFiles();
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

function setLoadProgress({ percent = 0, message = 'Preparing model...', file = '', status = '' }) {
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
  trackLoadFileProgress(file, numericPercent, status || message);
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
  resetLoadProgressFiles();
  showProgressRegion(true);
  setLoadProgress({ percent: 0, message: 'Starting model load...' });
  updateActionButtons();
  setStatus('Loading model...');
  try {
    await engine.initialize(config);
    modelReady = true;
    isLoadingModel = false;
    setLoadProgress({ percent: 100, message: 'Model ready.' });
    showProgressRegion(false);
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
          const parentUserMessage = modelMessage.parentId
            ? getMessageNodeById(activeConversation, modelMessage.parentId)
            : null;
          const renameInputs = {
            userPrompt: parentUserMessage?.text || '',
            assistantResponse: modelMessage.response || modelMessage.text || '',
          };
          window.setTimeout(() => {
            void runRenameChatOrchestration(activeConversation.id, renameInputs);
          }, 0);
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

function animateVariantSwitch(outgoingMessageId, incomingMessageId, direction) {
  if (!chatTranscript) {
    return;
  }
  const outgoingItem = chatTranscript.querySelector(`[data-message-id="${outgoingMessageId}"]`);
  const outgoingBubble = outgoingItem?.querySelector('.message-bubble');
  const outgoingOffsetWithinChat =
    chatMain && outgoingItem instanceof HTMLElement
      ? outgoingItem.getBoundingClientRect().top - chatMain.getBoundingClientRect().top
      : null;
  const outgoingClass = direction < 0 ? 'variant-switch-out-right' : 'variant-switch-out-left';
  if (outgoingBubble) {
    outgoingBubble.classList.add(outgoingClass);
  }

  window.setTimeout(() => {
    if (outgoingBubble) {
      outgoingBubble.classList.remove(outgoingClass);
    }
    renderTranscript({ scrollToBottom: false });
    const incomingItem = chatTranscript.querySelector(`[data-message-id="${incomingMessageId}"]`);
    if (chatMain && incomingItem instanceof HTMLElement) {
      if (Number.isFinite(outgoingOffsetWithinChat)) {
        const incomingOffsetWithinChat =
          incomingItem.getBoundingClientRect().top - chatMain.getBoundingClientRect().top;
        const boundedAdjustment = clamp(
          incomingOffsetWithinChat - outgoingOffsetWithinChat,
          -chatMain.clientHeight,
          chatMain.clientHeight,
        );
        if (Math.abs(boundedAdjustment) > 1) {
          chatMain.scrollTop += boundedAdjustment;
        }
      }
      incomingItem.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    const incomingBubble = incomingItem?.querySelector('.message-bubble');
    const incomingClass = direction < 0 ? 'variant-switch-in-left' : 'variant-switch-in-right';
    if (incomingBubble) {
      incomingBubble.classList.add(incomingClass);
      window.setTimeout(() => {
        incomingBubble.classList.remove(incomingClass);
      }, 280);
    }
    isSwitchingVariant = false;
    updateActionButtons();
    queueConversationStateSave();
  }, 170);
}

function switchModelVariant(messageId, direction) {
  if (
    !messageId ||
    isGenerating ||
    isLoadingModel ||
    isRunningOrchestration ||
    isSwitchingVariant ||
    activeUserEditMessageId
  ) {
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
  const targetLeafId = findPreferredLeafForVariant(activeConversation, targetMessage);
  isSwitchingVariant = true;
  activeConversation.activeLeafMessageId = targetLeafId || targetMessage.id;
  updateActionButtons();
  animateVariantSwitch(modelMessage.id, targetMessage.id, direction);
}

function switchUserVariant(messageId, direction) {
  if (
    !messageId ||
    isGenerating ||
    isLoadingModel ||
    isRunningOrchestration ||
    isSwitchingVariant ||
    activeUserEditMessageId
  ) {
    return;
  }
  const activeConversation = getActiveConversation();
  if (!activeConversation) {
    return;
  }
  const userMessage = getMessageNodeById(activeConversation, messageId);
  if (!userMessage || userMessage.role !== 'user') {
    return;
  }
  const variantState = getUserVariantState(activeConversation, userMessage);
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
  const targetLeafId = findPreferredLeafForVariant(activeConversation, targetMessage);
  isSwitchingVariant = true;
  activeConversation.activeLeafMessageId = targetLeafId || targetMessage.id;
  updateActionButtons();
  animateVariantSwitch(userMessage.id, targetMessage.id, direction);
}

function beginUserMessageEdit(messageId) {
  if (!messageId || isGenerating || isLoadingModel || isRunningOrchestration || isSwitchingVariant) {
    return;
  }
  const activeConversation = getActiveConversation();
  if (!activeConversation) {
    return;
  }
  const userMessage = getMessageNodeById(activeConversation, messageId);
  if (!userMessage || userMessage.role !== 'user') {
    return;
  }
  activeConversation.activeLeafMessageId = findPreferredLeafForVariant(activeConversation, userMessage) || userMessage.id;
  activeUserEditMessageId = messageId;
  renderTranscript({ scrollToBottom: false });
  updateActionButtons();
  const editor = chatTranscript?.querySelector(`[data-message-id="${messageId}"] .user-message-editor`);
  if (editor instanceof HTMLTextAreaElement) {
    editor.focus();
    editor.setSelectionRange(editor.value.length, editor.value.length);
  }
}

function cancelUserMessageEdit(messageId) {
  if (!activeUserEditMessageId || (messageId && activeUserEditMessageId !== messageId)) {
    return;
  }
  activeUserEditMessageId = null;
  renderTranscript({ scrollToBottom: false });
  updateActionButtons();
  setStatus('Edit canceled.');
}

function saveUserMessageEdit(messageId) {
  if (
    !messageId ||
    isGenerating ||
    isLoadingModel ||
    isRunningOrchestration ||
    isSwitchingVariant ||
    activeUserEditMessageId !== messageId
  ) {
    return;
  }
  const activeConversation = getActiveConversation();
  if (!activeConversation) {
    return;
  }
  const userMessage = getMessageNodeById(activeConversation, messageId);
  if (!userMessage || userMessage.role !== 'user') {
    return;
  }
  const editor = chatTranscript?.querySelector(`[data-message-id="${messageId}"] .user-message-editor`);
  if (!(editor instanceof HTMLTextAreaElement)) {
    return;
  }
  const nextText = editor.value.trim();
  if (!nextText) {
    setStatus('Message text cannot be empty.');
    editor.focus();
    return;
  }
  userMessage.text = nextText;
  const removedCount = pruneDescendantsFromMessage(activeConversation, userMessage.id);
  activeConversation.activeLeafMessageId = userMessage.id;
  activeConversation.lastSpokenLeafMessageId = userMessage.id;
  activeUserEditMessageId = null;
  renderTranscript();
  updateActionButtons();
  queueConversationStateSave();
  const saveStatus =
    removedCount > 0
      ? 'Message saved. Later turns were removed from this branch.'
      : 'Message saved.';
  if (!modelReady) {
    setStatus(`${saveStatus} Load a model to generate a new response.`);
    return;
  }
  setStatus(`${saveStatus} Generating updated response...`);
  startModelGeneration(activeConversation, buildPromptForConversationLeaf(activeConversation), {
    parentMessageId: userMessage.id,
    updateLastSpokenOnComplete: true,
  });
}

function branchFromUserMessage(messageId) {
  if (
    !messageId ||
    isGenerating ||
    isLoadingModel ||
    isRunningOrchestration ||
    isSwitchingVariant ||
    activeUserEditMessageId
  ) {
    return;
  }
  const activeConversation = getActiveConversation();
  if (!activeConversation) {
    return;
  }
  const userMessage = getMessageNodeById(activeConversation, messageId);
  if (!userMessage || userMessage.role !== 'user') {
    return;
  }
  const branchMessage = addMessageToConversation(activeConversation, 'user', userMessage.text, {
    parentId: userMessage.parentId || null,
  });
  activeConversation.lastSpokenLeafMessageId = branchMessage.id;
  activeUserEditMessageId = branchMessage.id;
  renderTranscript({ scrollToBottom: false });
  updateActionButtons();
  queueConversationStateSave();
  const editor = chatTranscript?.querySelector(`[data-message-id="${branchMessage.id}"] .user-message-editor`);
  if (editor instanceof HTMLTextAreaElement) {
    editor.focus();
    editor.setSelectionRange(editor.value.length, editor.value.length);
  }
  setStatus('User branch created. Edit and save to define this timeline.');
}

function regenerateFromMessage(messageId) {
  if (!messageId || isGenerating || isLoadingModel || isRunningOrchestration || activeUserEditMessageId) {
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
  renderTranscript();
  queueConversationStateSave();
  startModelGeneration(activeConversation, buildPromptForConversationLeaf(activeConversation), {
    parentMessageId: parentUserMessage.id,
  });
}

async function runRenameChatOrchestration(conversationId, inputs) {
  if (
    !conversationId ||
    isGenerating ||
    isLoadingModel ||
    isRunningOrchestration ||
    !modelReady
  ) {
    return;
  }
  const activeConversation = conversations.find((conversation) => conversation.id === conversationId);
  if (!activeConversation || activeConversation.hasGeneratedName) {
    return;
  }
  isRunningOrchestration = true;
  updateActionButtons();
  setStatus('Generating conversation title...');
  try {
    const { finalOutput } = await runOrchestration(RENAME_CHAT_ORCHESTRATION, inputs);
    const nextName = normalizeConversationName(
      finalOutput,
    );
    activeConversation.name = nextName || deriveConversationName(activeConversation);
    activeConversation.hasGeneratedName = true;
    renderConversationList();
    updateChatTitle();
    queueConversationStateSave();
    setStatus('Conversation title generated.');
  } catch (error) {
    activeConversation.name = deriveConversationName(activeConversation);
    activeConversation.hasGeneratedName = true;
    renderConversationList();
    updateChatTitle();
    queueConversationStateSave();
    appendDebug(`Rename orchestration failed: ${error.message}`);
    setStatus('Conversation title generated.');
  } finally {
    isRunningOrchestration = false;
    updateActionButtons();
  }
}

async function fixResponseFromMessage(messageId) {
  if (!messageId || isGenerating || isLoadingModel || isRunningOrchestration || activeUserEditMessageId) {
    return;
  }
  if (!modelReady) {
    setStatus('Please load a model before using Fix.');
    appendDebug('Fix blocked: model not ready.');
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
  if (!targetModelMessage.isResponseComplete) {
    return;
  }
  const parentUserMessage = targetModelMessage.parentId
    ? getMessageNodeById(activeConversation, targetModelMessage.parentId)
    : null;
  if (!parentUserMessage || parentUserMessage.role !== 'user') {
    setStatus('Unable to fix response: no user message found.');
    appendDebug('Fix failed: target model message has no preceding user message.');
    return;
  }

  const conversationId = activeConversation.id;
  const parentUserMessageId = parentUserMessage.id;
  const orchestrationInputs = {
    userPrompt: parentUserMessage.text || '',
    assistantResponse: targetModelMessage.response || targetModelMessage.text || '',
  };

  let fixPrompt = '';
  isRunningOrchestration = true;
  updateActionButtons();
  setStatus('Preparing response fix...');
  try {
    const { finalPrompt } = await runOrchestration(FIX_RESPONSE_ORCHESTRATION, orchestrationInputs, {
      runFinalStep: false,
    });
    fixPrompt = finalPrompt;
  } catch (error) {
    setStatus('Fix orchestration failed.');
    appendDebug(`Fix orchestration error: ${error.message}`);
    return;
  } finally {
    isRunningOrchestration = false;
    updateActionButtons();
  }

  const refreshedConversation = conversations.find((conversation) => conversation.id === conversationId);
  if (!refreshedConversation) {
    return;
  }
  const refreshedParentUserMessage = getMessageNodeById(refreshedConversation, parentUserMessageId);
  if (!refreshedParentUserMessage || refreshedParentUserMessage.role !== 'user') {
    setStatus('Unable to fix response: no user message found.');
    appendDebug('Fix aborted: parent user message no longer exists.');
    return;
  }

  refreshedConversation.activeLeafMessageId = refreshedParentUserMessage.id;
  renderTranscript();
  queueConversationStateSave();
  setStatus('Fixing response...');
  startModelGeneration(refreshedConversation, fixPrompt, {
    parentMessageId: refreshedParentUserMessage.id,
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
  const file = typeof progress?.file === 'string' ? progress.file : '';
  const status = typeof progress?.status === 'string' ? progress.status : '';
  setLoadProgress({ percent, message, file, status });
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
    activeUserEditMessageId = null;
    isChatTitleEditing = false;
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
        activeUserEditMessageId = null;
        isChatTitleEditing = false;
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
    if (!value || isGenerating || isRunningOrchestration || activeUserEditMessageId) {
      if (activeUserEditMessageId) {
        setStatus('Save or cancel the current message edit before sending a new message.');
      } else if (isRunningOrchestration) {
        setStatus('Please wait for the current orchestration step to finish.');
      }
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
      setStatus('Select a conversation or start a new conversation before sending a message.');
      appendDebug('Send blocked: no active conversation selected.');
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
  chatTranscript.addEventListener('click', async (event) => {
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
      return;
    }
    const fixButton = target.closest('.fix-response-btn');
    if (fixButton instanceof HTMLButtonElement) {
      void fixResponseFromMessage(fixButton.dataset.messageId || '');
      return;
    }
    const userVariantPrevButton = target.closest('.user-variant-prev');
    if (userVariantPrevButton instanceof HTMLButtonElement) {
      switchUserVariant(userVariantPrevButton.dataset.messageId || '', -1);
      return;
    }
    const userVariantNextButton = target.closest('.user-variant-next');
    if (userVariantNextButton instanceof HTMLButtonElement) {
      switchUserVariant(userVariantNextButton.dataset.messageId || '', 1);
      return;
    }
    const editUserButton = target.closest('.edit-user-message-btn');
    if (editUserButton instanceof HTMLButtonElement) {
      beginUserMessageEdit(editUserButton.dataset.messageId || '');
      return;
    }
    const saveUserButton = target.closest('.save-user-message-btn');
    if (saveUserButton instanceof HTMLButtonElement) {
      saveUserMessageEdit(saveUserButton.dataset.messageId || '');
      return;
    }
    const cancelUserEditButton = target.closest('.cancel-user-edit-btn');
    if (cancelUserEditButton instanceof HTMLButtonElement) {
      cancelUserMessageEdit(cancelUserEditButton.dataset.messageId || '');
      return;
    }
    const branchUserButton = target.closest('.branch-user-message-btn');
    if (branchUserButton instanceof HTMLButtonElement) {
      branchFromUserMessage(branchUserButton.dataset.messageId || '');
      return;
    }
    const copyButton = target.closest('.copy-message-btn, .thoughts-copy-btn');
    if (copyButton instanceof HTMLButtonElement) {
      await handleMessageCopyAction(copyButton.dataset.messageId || '', copyButton.dataset.copyType || 'message');
    }
  });
}

if (chatMain) {
  chatMain.addEventListener('scroll', () => {
    updateTranscriptNavigationButtonVisibility();
  });
}

if (jumpToLatestButton instanceof HTMLButtonElement) {
  jumpToLatestButton.addEventListener('click', () => {
    const restoreComposerFocus = document.activeElement === jumpToLatestButton;
    scrollTranscriptToBottom();
    if (restoreComposerFocus && messageInput instanceof HTMLTextAreaElement) {
      messageInput.focus();
    }
  });
}

if (jumpToLastPromptButton instanceof HTMLButtonElement) {
  jumpToLastPromptButton.addEventListener('click', () => {
    const lastPromptMessageId = getLastPromptMessageId();
    if (!lastPromptMessageId) {
      return;
    }
    const messageItem = chatTranscript?.querySelector(`[data-message-id="${lastPromptMessageId}"]`);
    if (!(messageItem instanceof HTMLElement)) {
      return;
    }
    const restoreComposerFocus = document.activeElement === jumpToLastPromptButton;
    messageItem.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
    updateTranscriptNavigationButtonVisibility();
    if (restoreComposerFocus && messageInput instanceof HTMLTextAreaElement) {
      messageInput.focus();
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

if (editChatTitleBtn instanceof HTMLButtonElement) {
  editChatTitleBtn.addEventListener('click', () => {
    beginChatTitleEdit();
  });
}

if (saveChatTitleBtn instanceof HTMLButtonElement) {
  saveChatTitleBtn.addEventListener('click', () => {
    saveChatTitleEdit();
  });
}

if (cancelChatTitleBtn instanceof HTMLButtonElement) {
  cancelChatTitleBtn.addEventListener('click', () => {
    cancelChatTitleEdit();
  });
}

if (chatTitleInput instanceof HTMLInputElement) {
  chatTitleInput.addEventListener('input', () => {
    updateChatTitleEditorVisibility();
  });
  chatTitleInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveChatTitleEdit();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelChatTitleEdit();
    }
  });
}

