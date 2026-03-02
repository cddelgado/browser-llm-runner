import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import './styles.css';
import { LLMEngineClient } from './llm/engine-client.js';
import modelCatalog from './config/models.json';

const THEME_STORAGE_KEY = 'ui-theme-preference';
const MODEL_STORAGE_KEY = 'llm-model-preference';
const BACKEND_STORAGE_KEY = 'llm-backend-preference';
const UNTITLED_CONVERSATION_PREFIX = 'New Conversation';
const TOKEN_STEP = 8;
const MIN_TOKEN_LIMIT = 8;
const DEFAULT_GENERATION_LIMITS = Object.freeze({
  defaultMaxOutputTokens: 1024,
  maxOutputTokens: 32768,
  defaultMaxContextTokens: 32768,
  maxContextTokens: 32768,
});

function toPositiveInt(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeGenerationLimits(rawLimits) {
  const maxContextTokens = toPositiveInt(rawLimits?.maxContextTokens, DEFAULT_GENERATION_LIMITS.maxContextTokens);
  const maxOutputTokens = toPositiveInt(rawLimits?.maxOutputTokens, maxContextTokens);
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

const themeSelect = document.getElementById('themeSelect');
const modelSelect = document.getElementById('modelSelect');
const backendSelect = document.getElementById('backendSelect');
const maxOutputTokensInput = document.getElementById('maxOutputTokensInput');
const maxContextTokensInput = document.getElementById('maxContextTokensInput');
const maxOutputTokensHelp = document.getElementById('maxOutputTokensHelp');
const maxContextTokensHelp = document.getElementById('maxContextTokensHelp');
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

function formatInteger(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

function getModelGenerationLimits(modelId) {
  return (
    MODEL_OPTIONS_BY_ID.get(normalizeModelId(modelId))?.generation || normalizeGenerationLimits(null)
  );
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
  return { maxOutputTokens, maxContextTokens };
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
}

function syncGenerationSettingsFromModel(modelId, useDefaults = true) {
  const limits = getModelGenerationLimits(modelId);
  const config = useDefaults
    ? {
        maxOutputTokens: Math.min(limits.defaultMaxOutputTokens, limits.defaultMaxContextTokens),
        maxContextTokens: limits.defaultMaxContextTokens,
      }
    : buildGenerationConfigFromUI(modelId);
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
  };
  pendingGenerationConfig = null;
  activeGenerationConfig = nextConfig;
  engine.setGenerationConfig(nextConfig);
  syncGenerationSettingsFromModel(selectedModel, false);
  setStatus('Generation settings updated.');
  appendDebug(
    `Generation settings applied (maxOutputTokens=${nextConfig.maxOutputTokens}, maxContextTokens=${nextConfig.maxContextTokens}).`,
  );
}

function onGenerationSettingInputChanged() {
  const selectedModel = normalizeModelId(modelSelect?.value || DEFAULT_MODEL);
  const nextConfig = buildGenerationConfigFromUI(selectedModel);
  activeGenerationConfig = nextConfig;
  syncGenerationSettingsFromModel(selectedModel, false);
  if (isGenerating) {
    pendingGenerationConfig = nextConfig;
    setStatus('Generation settings will apply after current response.');
    appendDebug('Generation settings change queued until current response completes.');
    return;
  }
  engine.setGenerationConfig(nextConfig);
  setStatus('Generation settings updated.');
  appendDebug(
    `Generation settings applied (maxOutputTokens=${nextConfig.maxOutputTokens}, maxContextTokens=${nextConfig.maxContextTokens}).`,
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

function getActiveConversation() {
  return conversations.find((conversation) => conversation.id === activeConversationId) || null;
}

function createConversation(name) {
  conversationCount += 1;
  return {
    id: `conversation-${++conversationIdCounter}`,
    name: name || `${UNTITLED_CONVERSATION_PREFIX} ${conversationCount}`,
    messages: [],
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
  const firstUserMessage = conversation.messages.find((message) => message.role === 'user')?.text || '';
  const firstModelMessage = conversation.messages.find((message) => message.role === 'model')?.text || '';
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

function addMessageToConversation(conversation, role, text) {
  const normalizedRole = role === 'user' ? 'user' : 'model';
  const normalizedText = String(text || '');
  const message = {
    id: `${conversation.id}-message-${conversation.messages.length + 1}`,
    role: normalizedRole,
    speaker: normalizedRole === 'user' ? 'User' : 'Model',
    text: normalizedText,
  };
  if (normalizedRole === 'model') {
    message.thoughts = '';
    message.response = normalizedText;
    message.hasThinking = false;
    message.isThinkingComplete = false;
  }
  conversation.messages.push(message);
  return message;
}

function renderConversationList() {
  if (!conversationList) {
    return;
  }
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
    deleteButton.className = 'btn btn-sm btn-link text-danger conversation-delete';
    deleteButton.setAttribute('aria-label', `Delete ${conversation.name} conversation`);
    deleteButton.innerHTML = `
      <svg class="icon" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M6.5 1h3l.5 1H13a.5.5 0 0 1 0 1h-.6l-.7 10.2A2 2 0 0 1 9.7 15H6.3a2 2 0 0 1-2-1.8L3.6 3H3a.5.5 0 0 1 0-1h3zM5 3l.7 10.1a1 1 0 0 0 1 .9h2.6a1 1 0 0 0 1-.9L11 3zM7 5a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0v-6A.5.5 0 0 1 7 5m2 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0v-6A.5.5 0 0 1 9 5"></path>
      </svg>
    `;

    item.append(selectButton, deleteButton);
    conversationList.appendChild(item);
  });
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

function addMessageElement(message) {
  if (!chatTranscript) {
    return null;
  }
  const item = document.createElement('li');
  item.className = `message-row ${message.role === 'user' ? 'user-message' : 'model-message'}`;
  if (message.role === 'model') {
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
      </div>
    `;
    const thinkingRegion = item.querySelector('.thoughts-region');
    const thinkingToggle = item.querySelector('.thinking-toggle');
    const thinkingBody = item.querySelector('.thoughts-content');
    const thoughtsText = item.querySelector('.thoughts-content');
    const responseText = item.querySelector('.response-content');
    if (thinkingRegion && thinkingToggle && thinkingBody && thoughtsText && responseText) {
      const refs = { thinkingRegion, thinkingToggle, thinkingBody, thoughtsText, responseText };
      thinkingToggle.addEventListener('click', (event) => {
        event.preventDefault();
        const expanded = thinkingToggle.getAttribute('aria-expanded') === 'true';
        thinkingToggle.setAttribute('aria-expanded', String(!expanded));
        thinkingBody.hidden = expanded;
        setModelBubbleContent(message, refs);
      });
      setModelBubbleContent(message, refs);
      item._modelBubbleRefs = refs;
    }
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
  scrollTranscriptToBottom();
  return item;
}

function updateModelMessageElement(message, item) {
  if (!item || message.role !== 'model') {
    return;
  }
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
  chatTranscript.replaceChildren();
  const conversation = getActiveConversation();
  if (!conversation) {
    return;
  }
  conversation.messages.forEach((message) => {
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
  renderConversationList();
  renderTranscript();
  updateChatTitle();
}

function ensureConversation() {
  if (getActiveConversation()) {
    return;
  }
  const conversation = createConversation();
  conversations.unshift(conversation);
  activeConversationId = conversation.id;
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
}

function updateSendButtonMode() {
  if (!sendButton) {
    return;
  }
  if (isGenerating) {
    sendButton.type = 'button';
    sendButton.textContent = 'Stop generating';
    sendButton.classList.remove('btn-primary');
    sendButton.classList.add('btn-outline-secondary');
    sendButton.setAttribute('aria-label', 'Stop generating');
    return;
  }
  sendButton.type = 'submit';
  sendButton.textContent = 'Send';
  sendButton.classList.remove('btn-outline-secondary');
  sendButton.classList.add('btn-primary');
  sendButton.setAttribute('aria-label', 'Send message');
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
  localStorage.setItem(MODEL_STORAGE_KEY, normalizeModelId(modelSelect?.value || DEFAULT_MODEL));
  localStorage.setItem(BACKEND_STORAGE_KEY, backendSelect?.value || 'auto');
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
populateModelSelect();
restoreInferencePreferences();
ensureConversation();
renderConversationList();
renderTranscript();
setStatus('Welcome. Choose a model, then select Load model.');
showProgressRegion(false);
updateActionButtons();
updateWelcomePanelVisibility();
updateChatTitle();

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
    addMessageElement(userMessage);
    messageInput.value = '';

    const selectedModelId = normalizeModelId(modelSelect?.value || DEFAULT_MODEL);
    const thinkingTags = getThinkingTagsForModel(selectedModelId);
    const modelMessage = addMessageToConversation(activeConversation, 'model', '');
    const modelBubbleItem = addMessageElement(modelMessage);
    let streamedText = '';

    isGenerating = true;
    updateActionButtons();

    try {
      await engine.generate(value, {
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
        },
        onComplete: (finalText) => {
          const parsed = parseThinkingText(finalText || streamedText, thinkingTags);
          modelMessage.thoughts = parsed.thoughts;
          modelMessage.response = parsed.response.trimStart();
          modelMessage.hasThinking = parsed.hasThinking || Boolean(parsed.thoughts.trim());
          modelMessage.isThinkingComplete =
            parsed.isThinkingComplete || (modelMessage.hasThinking && !thinkingTags);
          modelMessage.text = modelMessage.response || '[No output]';
          updateModelMessageElement(modelMessage, modelBubbleItem);
          scrollTranscriptToBottom();

          if (!activeConversation.hasGeneratedName && modelMessage.text !== '[No output]') {
            activeConversation.name = deriveConversationName(activeConversation);
            activeConversation.hasGeneratedName = true;
            renderConversationList();
            updateChatTitle();
          }

          appendDebug('Generation completed.');
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
          updateModelMessageElement(modelMessage, modelBubbleItem);
          scrollTranscriptToBottom();
          isGenerating = false;
          updateActionButtons();
          applyPendingGenerationSettingsIfReady();
          setStatus('Generation failed');
          appendDebug(`Generation error: ${message}`);
        },
      });
    } catch (error) {
      modelMessage.text = `Generation error: ${error.message}`;
      modelMessage.response = modelMessage.text;
      modelMessage.thoughts = '';
      modelMessage.hasThinking = false;
      modelMessage.isThinkingComplete = false;
      updateModelMessageElement(modelMessage, modelBubbleItem);
      scrollTranscriptToBottom();
      isGenerating = false;
      updateActionButtons();
      applyPendingGenerationSettingsIfReady();
      setStatus('Generation failed');
      appendDebug(`Generation error: ${error.message}`);
    }
  });
}

window.addEventListener('beforeunload', () => {
  engine.dispose();
});
