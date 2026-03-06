import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import 'bootstrap-icons/font/bootstrap-icons.css';
import Modal from 'bootstrap/js/dist/modal';
import Tooltip from 'bootstrap/js/dist/tooltip';
import MarkdownIt from 'markdown-it';
import './styles.css';
import { LLMEngineClient } from './llm/engine-client.js';
import { createOrchestrationRunner } from './llm/orchestration-runner.js';
import renameChatOrchestration from './config/orchestrations/rename-chat.json';
import fixResponseOrchestration from './config/orchestrations/fix-response.json';
import {
  DEFAULT_GENERATION_LIMITS,
  DEFAULT_MODEL,
  DEFAULT_TOP_K,
  DEFAULT_TOP_P,
  LEGACY_MODEL_ALIASES,
  MAX_TOP_K,
  MAX_TOP_P,
  MIN_TOKEN_LIMIT,
  MIN_TOP_K,
  MIN_TOP_P,
  MODEL_OPTIONS,
  MODEL_OPTIONS_BY_ID,
  SUPPORTED_MODELS,
  TEMPERATURE_STEP,
  TOKEN_STEP,
  TOP_K_STEP,
  TOP_P_STEP,
  clamp,
  normalizeGenerationLimits,
  quantizeTemperature,
  quantizeTopKInput,
  quantizeTopPInput,
} from './config/model-settings.js';
import {
  addMessageToConversation,
  buildConversationDownloadMarkdown,
  buildConversationDownloadPayload,
  buildConversationJsonDownloadFileName,
  buildConversationMarkdownDownloadFileName,
  buildPromptForConversationLeaf,
  createConversation as createConversationRecord,
  deriveConversationName,
  findPreferredLeafForVariant,
  getConversationCardHeading,
  getConversationPathMessages,
  getMessageNodeById,
  getModelVariantState,
  getUserVariantState,
  normalizeConversationName,
  normalizeConversationPromptMode,
  normalizeSystemPrompt,
  parseMessageNodeCounterFromId,
  pruneDescendantsFromMessage,
} from './state/conversation-model.js';
import { createAppController } from './state/app-controller.js';
import {
  createAppState,
  findConversationById as selectConversationById,
  getActiveConversation as selectActiveConversation,
  getCurrentViewRoute as selectCurrentViewRoute,
  hasConversationHistory as selectHasConversationHistory,
  hasSelectedConversationWithHistory as selectHasSelectedConversationWithHistory,
  shouldDisableComposerForPreChatConversationSelection as selectShouldDisableComposerForPreChatConversationSelection,
} from './state/app-state.js';
import { loadConversationState, saveConversationState } from './state/conversation-store.js';
import { renderConversationListView } from './ui/conversation-list-view.js';
import { createTranscriptView } from './ui/transcript-view.js';

const THEME_STORAGE_KEY = 'ui-theme-preference';
const SHOW_THINKING_STORAGE_KEY = 'ui-show-thinking';
const DEFAULT_SYSTEM_PROMPT_STORAGE_KEY = 'conversation-default-system-prompt';
const MODEL_STORAGE_KEY = 'llm-model-preference';
const BACKEND_STORAGE_KEY = 'llm-backend-preference';
const MODEL_GENERATION_SETTINGS_STORAGE_KEY = 'llm-model-generation-settings';
const GLOBAL_SAMPLING_SETTINGS_STORAGE_KEY = 'llm-global-sampling-settings';
const UNTITLED_CONVERSATION_PREFIX = 'New Conversation';
const SUPPORTED_BACKEND_PREFERENCES = new Set(['auto', 'webgpu', 'wasm', 'cpu']);

function normalizeTimestamp(value) {
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : null;
}

const FIX_RESPONSE_ORCHESTRATION = fixResponseOrchestration;
const RENAME_CHAT_ORCHESTRATION = renameChatOrchestration;
const CONVERSATION_SAVE_DEBOUNCE_MS = 300;
const CONVERSATION_COLLECTION_FORMAT = 'browser-llm-runner.conversation-collection';
const CONVERSATION_SCHEMA_VERSION = 5;
const TRANSCRIPT_BOTTOM_THRESHOLD_PX = 24;
const MARKDOWN_LINK_REL = 'noopener noreferrer nofollow';
const MATHJAX_TYPESET_DEBOUNCE_MS = 150;
const MATH_DELIMITER_PATTERN = /(^|[^\\])(\$\$|\$|\\\(|\\\[|\\begin\{)/;
const MATH_BLOCK_LINE_PATTERN = /(^|\n)\[\s*\n([\s\S]*?)\n\](?=\n|$)/g;
const MATH_DISPLAY_DELIMITER_PATTERN = /\\\[([\s\S]*?)\\\]/g;
const MATH_INLINE_DELIMITER_PATTERN = /\\\(([\s\S]*?)\\\)/g;

window.MathJax = window.MathJax || {};
window.MathJax.tex = {
  ...(window.MathJax.tex || {}),
  inlineMath: [['$', '$'], ['\\(', '\\)']],
  displayMath: [['$$', '$$'], ['\\[', '\\]']],
  processEscapes: true,
};
window.MathJax.options = {
  ...(window.MathJax.options || {}),
  skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
};
window.MathJax.startup = {
  ...(window.MathJax.startup || {}),
  typeset: false,
};

const themeSelect = document.getElementById('themeSelect');
const showThinkingToggle = document.getElementById('showThinkingToggle');
const defaultSystemPromptInput = document.getElementById('defaultSystemPromptInput');
const modelSelect = document.getElementById('modelSelect');
const backendSelect = document.getElementById('backendSelect');
const maxOutputTokensInput = document.getElementById('maxOutputTokensInput');
const maxContextTokensInput = document.getElementById('maxContextTokensInput');
const temperatureInput = document.getElementById('temperatureInput');
const resetContextTokensButton = document.getElementById('resetContextTokensButton');
const resetTemperatureButton = document.getElementById('resetTemperatureButton');
const topKInput = document.getElementById('topKInput');
const topPInput = document.getElementById('topPInput');
const maxOutputTokensHelp = document.getElementById('maxOutputTokensHelp');
const maxContextTokensHelp = document.getElementById('maxContextTokensHelp');
const temperatureHelp = document.getElementById('temperatureHelp');
const topKHelp = document.getElementById('topKHelp');
const topPHelp = document.getElementById('topPHelp');
const statusRegion = document.getElementById('statusRegion');
const startConversationButton = document.getElementById('startConversationButton');
const debugInfo = document.getElementById('debugInfo');
const modelLoadProgressWrap = document.getElementById('modelLoadProgressWrap');
const modelLoadProgressLabel = document.getElementById('modelLoadProgressLabel');
const modelLoadProgressValue = document.getElementById('modelLoadProgressValue');
const modelLoadProgressBar = document.getElementById('modelLoadProgressBar');
const modelLoadProgressSummary = document.getElementById('modelLoadProgressSummary');
const modelLoadCurrentFileLabel = document.getElementById('modelLoadCurrentFileLabel');
const modelLoadCurrentFileValue = document.getElementById('modelLoadCurrentFileValue');
const modelLoadCurrentFileBar = document.getElementById('modelLoadCurrentFileBar');
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
const homePanel = document.getElementById('homePanel');
const preChatPanel = document.getElementById('preChatPanel');
const topBar = document.getElementById('topBar');
const conversationPanel = document.getElementById('conversationPanel');
const onboardingStatusRegion = document.getElementById('onboardingStatusRegion');
const preChatActions = document.getElementById('preChatActions');
const preChatLoadModelBtn = document.getElementById('preChatLoadModelBtn');
const preChatEditConversationSystemPromptBtn = document.getElementById(
  'preChatEditConversationSystemPromptBtn',
);
const chatTitle = document.getElementById('chatTitle');
const chatTitleInput = document.getElementById('chatTitleInput');
const editChatTitleBtn = document.getElementById('editChatTitleBtn');
const editConversationSystemPromptBtn = document.getElementById('editConversationSystemPromptBtn');
const downloadConversationMenu = document.getElementById('downloadConversationMenu');
const downloadConversationBtn = document.getElementById('downloadConversationBtn');
const downloadConversationJsonBtn = document.getElementById('downloadConversationJsonBtn');
const downloadConversationMarkdownBtn = document.getElementById('downloadConversationMarkdownBtn');
const saveChatTitleBtn = document.getElementById('saveChatTitleBtn');
const cancelChatTitleBtn = document.getElementById('cancelChatTitleBtn');
const conversationSystemPromptModal = document.getElementById('conversationSystemPromptModal');
const conversationSystemPromptInput = document.getElementById('conversationSystemPromptInput');
const conversationSystemPromptAppendToggle = document.getElementById(
  'conversationSystemPromptAppendToggle',
);
const saveConversationSystemPromptBtn = document.getElementById('saveConversationSystemPromptBtn');
const openSettingsButton = document.getElementById('openSettingsButton');
const closeSettingsButton = document.getElementById('closeSettingsButton');
const settingsPage = document.getElementById('settingsPage');
const settingsTabContainer = document.querySelector('.settings-tabs');
const settingsTabButtons = settingsTabContainer
  ? settingsTabContainer.querySelectorAll('[data-settings-tab]')
  : [];
const settingsTabPanels = settingsPage ? settingsPage.querySelectorAll('[data-settings-tab-panel]') : [];
const colorSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

const engine = new LLMEngineClient();
const markdown = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
});

const defaultLinkRenderer =
  markdown.renderer.rules.link_open ||
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
markdown.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  token.attrSet('target', '_blank');
  token.attrSet('rel', MARKDOWN_LINK_REL);
  return defaultLinkRenderer(tokens, idx, options, env, self);
};

const MAX_DEBUG_ENTRIES = 120;
const ROUTE_HOME = 'home';
const ROUTE_CHAT = 'chat';
const ROUTE_SETTINGS = 'settings';
const mathTypesetTimers = new WeakMap();
const PRE_CHAT_STATUS_HINT_DEFAULT = 'Send your first message to load the selected model.';
const PRE_CHAT_STATUS_HINT_EXISTING_CONVERSATION =
  'To see your conversation, load a model first.';
const appState = createAppState({
  activeGenerationConfig: {
    ...normalizeGenerationLimits(null),
    topK: DEFAULT_TOP_K,
    topP: DEFAULT_TOP_P,
  },
  defaultSystemPrompt: '',
  maxDebugEntries: MAX_DEBUG_ENTRIES,
});
void ensureMathJaxLoaded();

function initializeTooltips(root = document) {
  if (!root || !(root instanceof Element || root instanceof Document)) {
    return;
  }
  root.querySelectorAll('[data-bs-toggle="tooltip"], [data-icon-tooltip]').forEach((element) => {
    Tooltip.getOrCreateInstance(element);
  });
}

function startUserMessageEditSession(messageId, { branchSourceMessageId = null } = {}) {
  appState.activeUserEditMessageId = messageId;
  appState.activeUserBranchSourceMessageId = branchSourceMessageId;
}

function clearUserMessageEditSession() {
  appState.activeUserEditMessageId = null;
  appState.activeUserBranchSourceMessageId = null;
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

function playEntranceAnimation(element, className = 'animate-in') {
  if (!(element instanceof HTMLElement) || reducedMotionQuery.matches) {
    return;
  }
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  window.setTimeout(() => {
    element.classList.remove(className);
  }, 450);
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

function formatWordEstimateFromTokens(tokenCount) {
  const wordEstimate = Math.round(Number(tokenCount) * 0.75);
  return formatInteger(Math.max(0, wordEstimate));
}

function renderModelMarkdown(content) {
  const normalizedContent = normalizeMathDelimitersForMarkdown(String(content || ''));
  if (!normalizedContent) {
    return '';
  }
  return markdown.render(normalizedContent);
}

function normalizeMathDelimitersForMarkdown(content) {
  if (!content) {
    return '';
  }
  return content
    .replace(MATH_DISPLAY_DELIMITER_PATTERN, (_match, expression) => `\n$$\n${expression}\n$$\n`)
    .replace(MATH_INLINE_DELIMITER_PATTERN, (_match, expression) => `$${expression}$`)
    .replace(MATH_BLOCK_LINE_PATTERN, (_match, leading, expression) => `${leading}$$\n${expression}\n$$`);
}

function containsMathDelimiters(text) {
  return MATH_DELIMITER_PATTERN.test(String(text || ''));
}

function ensureMathJaxLoaded() {
  if (window.MathJax?.typesetPromise && window.MathJax?.startup?.promise) {
    return Promise.resolve();
  }
  if (!appState.mathJaxLoadPromise) {
    appState.mathJaxLoadPromise = import('mathjax/es5/tex-mml-svg.js').catch((error) => {
      if (!appState.hasLoggedMathJaxError) {
        appendDebug(`MathJax failed to load: ${error instanceof Error ? error.message : String(error)}`);
        appState.hasLoggedMathJaxError = true;
      }
    });
  }
  return appState.mathJaxLoadPromise;
}

async function typesetMathInElement(element) {
  if (!(element instanceof HTMLElement) || !containsMathDelimiters(element.textContent)) {
    return;
  }
  await ensureMathJaxLoaded();
  const mathJax = window.MathJax;
  if (!mathJax?.typesetPromise || !mathJax.startup?.promise) {
    return;
  }
  try {
    await mathJax.startup.promise;
    await mathJax.typesetPromise([element]);
  } catch (error) {
    if (!appState.hasLoggedMathJaxError) {
      appendDebug(`MathJax render failed: ${error instanceof Error ? error.message : String(error)}`);
      appState.hasLoggedMathJaxError = true;
    }
  }
}

function scheduleMathTypeset(element, options = {}) {
  if (!(element instanceof HTMLElement) || !containsMathDelimiters(element.textContent)) {
    if (element instanceof HTMLElement) {
      const timerId = mathTypesetTimers.get(element);
      if (timerId !== undefined) {
        window.clearTimeout(timerId);
        mathTypesetTimers.delete(element);
      }
    }
    return;
  }
  const timerId = mathTypesetTimers.get(element);
  if (timerId !== undefined) {
    window.clearTimeout(timerId);
    mathTypesetTimers.delete(element);
  }
  if (options.immediate) {
    void typesetMathInElement(element);
    return;
  }
  const nextTimerId = window.setTimeout(() => {
    mathTypesetTimers.delete(element);
    void typesetMathInElement(element);
  }, MATHJAX_TYPESET_DEBOUNCE_MS);
  mathTypesetTimers.set(element, nextTimerId);
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

function sanitizeGlobalSamplingSettings(candidateSettings) {
  return {
    topK: quantizeTopKInput(candidateSettings?.topK),
    topP: quantizeTopPInput(candidateSettings?.topP),
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

function getStoredGlobalSamplingSettings() {
  try {
    const raw = localStorage.getItem(GLOBAL_SAMPLING_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return sanitizeGlobalSamplingSettings(parsed);
  } catch (_error) {
    return null;
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

function persistGlobalSamplingSettings(settings) {
  const sanitized = sanitizeGlobalSamplingSettings(settings);
  localStorage.setItem(GLOBAL_SAMPLING_SETTINGS_STORAGE_KEY, JSON.stringify(sanitized));
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
  const topK = quantizeTopKInput(topKInput?.value ?? DEFAULT_TOP_K);
  const topP = quantizeTopPInput(topPInput?.value ?? DEFAULT_TOP_P);
  return { maxOutputTokens, maxContextTokens, temperature, topK, topP };
}

function renderGenerationSettingsHelpText(config, limits) {
  if (maxOutputTokensHelp) {
    maxOutputTokensHelp.textContent = `Allowed: ${formatInteger(MIN_TOKEN_LIMIT)} to ${formatInteger(
      Math.min(limits.maxOutputTokens, config.maxContextTokens),
    )} in steps of ${formatInteger(TOKEN_STEP)}. Estimated words: about ${formatWordEstimateFromTokens(config.maxOutputTokens)}.`;
  }
  if (maxContextTokensHelp) {
    maxContextTokensHelp.textContent = `Allowed: ${formatInteger(MIN_TOKEN_LIMIT)} to ${formatInteger(
      limits.maxContextTokens,
    )} in steps of ${formatInteger(TOKEN_STEP)}. Estimated words: about ${formatWordEstimateFromTokens(config.maxContextTokens)}.`;
  }
  if (temperatureHelp) {
    temperatureHelp.textContent = `Allowed: ${limits.minTemperature.toFixed(1)} to ${limits.maxTemperature.toFixed(
      1,
    )} in steps of ${TEMPERATURE_STEP.toFixed(1)}.`;
  }
  if (topKHelp) {
    topKHelp.textContent = `Top K picks from the K most likely next-token options. Lower values are more predictable. Good default: ${formatInteger(DEFAULT_TOP_K)}.`;
  }
  if (topPHelp) {
    topPHelp.textContent = `Also called nucleus sampling. Higher values can make responses more varied. Allowed: ${MIN_TOP_P.toFixed(
      2,
    )} to ${MAX_TOP_P.toFixed(2)} in steps of ${TOP_P_STEP.toFixed(2)}.`;
  }
}

function syncGenerationSettingsFromModel(modelId, useDefaults = true) {
  const normalizedModelId = normalizeModelId(modelId);
  const limits = getModelGenerationLimits(normalizedModelId);
  const globalSamplingSettings = getStoredGlobalSamplingSettings() || {
    topK: DEFAULT_TOP_K,
    topP: DEFAULT_TOP_P,
  };
  const defaultConfig = {
    maxOutputTokens: Math.min(limits.defaultMaxOutputTokens, limits.defaultMaxContextTokens),
    maxContextTokens: limits.defaultMaxContextTokens,
    temperature: limits.defaultTemperature,
    topK: globalSamplingSettings.topK,
    topP: globalSamplingSettings.topP,
  };
  const config = useDefaults
    ? { ...(getStoredGenerationConfigForModel(normalizedModelId) || defaultConfig), ...globalSamplingSettings }
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
  if (topKInput) {
    topKInput.min = String(MIN_TOP_K);
    topKInput.max = String(MAX_TOP_K);
    topKInput.step = String(TOP_K_STEP);
    topKInput.value = String(config.topK);
  }
  if (topPInput) {
    topPInput.min = MIN_TOP_P.toFixed(2);
    topPInput.max = MAX_TOP_P.toFixed(2);
    topPInput.step = TOP_P_STEP.toFixed(2);
    topPInput.value = config.topP.toFixed(2);
  }

  appState.activeGenerationConfig = { ...config };
  engine.setGenerationConfig(appState.activeGenerationConfig);
  renderGenerationSettingsHelpText(config, limits);
}

function updateGenerationSettingsEnabledState() {
  const disabled = !appState.modelReady;
  if (maxOutputTokensInput) {
    maxOutputTokensInput.disabled = disabled;
  }
  if (maxContextTokensInput) {
    maxContextTokensInput.disabled = disabled;
  }
  if (temperatureInput) {
    temperatureInput.disabled = disabled;
  }
  if (resetContextTokensButton instanceof HTMLButtonElement) {
    resetContextTokensButton.disabled = disabled;
  }
  if (resetTemperatureButton instanceof HTMLButtonElement) {
    resetTemperatureButton.disabled = disabled;
  }
  if (topKInput) {
    topKInput.disabled = disabled;
  }
  if (topPInput) {
    topPInput.disabled = disabled;
  }
}

function applyPendingGenerationSettingsIfReady() {
  if (appState.isGenerating || !appState.pendingGenerationConfig) {
    return;
  }
  const selectedModel = normalizeModelId(modelSelect?.value || DEFAULT_MODEL);
  const limits = getModelGenerationLimits(selectedModel);
  const nextMaxContextTokens = quantizeTokenInput(
    appState.pendingGenerationConfig.maxContextTokens,
    MIN_TOKEN_LIMIT,
    limits.maxContextTokens,
  );
  const nextConfig = {
    maxContextTokens: nextMaxContextTokens,
    maxOutputTokens: quantizeTokenInput(
      appState.pendingGenerationConfig.maxOutputTokens,
      MIN_TOKEN_LIMIT,
      Math.min(limits.maxOutputTokens, nextMaxContextTokens),
    ),
    temperature: quantizeTemperature(
      appState.pendingGenerationConfig.temperature,
      limits.minTemperature,
      limits.maxTemperature,
    ),
    topK: quantizeTopKInput(appState.pendingGenerationConfig.topK),
    topP: quantizeTopPInput(appState.pendingGenerationConfig.topP),
  };
  appState.pendingGenerationConfig = null;
  appState.activeGenerationConfig = nextConfig;
  engine.setGenerationConfig(nextConfig);
  syncGenerationSettingsFromModel(selectedModel, false);
  setStatus('Generation settings updated.');
  appendDebug(
    `Generation settings applied (maxOutputTokens=${nextConfig.maxOutputTokens}, maxContextTokens=${nextConfig.maxContextTokens}, temperature=${nextConfig.temperature.toFixed(1)}, topK=${nextConfig.topK}, topP=${nextConfig.topP.toFixed(2)}).`,
  );
}

function onGenerationSettingInputChanged() {
  const selectedModel = normalizeModelId(modelSelect?.value || DEFAULT_MODEL);
  const nextConfig = buildGenerationConfigFromUI(selectedModel);
  appState.activeGenerationConfig = nextConfig;
  syncGenerationSettingsFromModel(selectedModel, false);
  persistGenerationConfigForModel(selectedModel, nextConfig);
  persistGlobalSamplingSettings(nextConfig);
  if (appState.isGenerating) {
    appState.pendingGenerationConfig = nextConfig;
    setStatus('Generation settings will apply after current response.');
    appendDebug('Generation settings change queued until current response completes.');
    return;
  }
  engine.setGenerationConfig(nextConfig);
  setStatus('Generation settings updated.');
  appendDebug(
    `Generation settings applied (maxOutputTokens=${nextConfig.maxOutputTokens}, maxContextTokens=${nextConfig.maxContextTokens}, temperature=${nextConfig.temperature.toFixed(1)}, topK=${nextConfig.topK}, topP=${nextConfig.topP.toFixed(2)}).`,
  );
}

function appendDebug(message) {
  const timestamp = new Date().toLocaleTimeString();
  appState.debugEntries.push(`[${timestamp}] ${message}`);
  if (appState.debugEntries.length > MAX_DEBUG_ENTRIES) {
    appState.debugEntries.shift();
  }
  if (debugInfo) {
    debugInfo.textContent = appState.debugEntries.join('\n');
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

function updatePreChatStatusHint() {
  if (!(onboardingStatusRegion instanceof HTMLElement)) {
    return;
  }
  if (appState.hasStartedChatWorkspace && !appState.modelReady && !appState.isLoadingModel) {
    onboardingStatusRegion.textContent = hasSelectedConversationWithHistory()
      ? PRE_CHAT_STATUS_HINT_EXISTING_CONVERSATION
      : PRE_CHAT_STATUS_HINT_DEFAULT;
  }
}

function hasConversationHistory(conversation) {
  return selectHasConversationHistory(conversation);
}

function hasSelectedConversationWithHistory() {
  return selectHasSelectedConversationWithHistory(appState);
}

function shouldDisableComposerForPreChatConversationSelection() {
  return selectShouldDisableComposerForPreChatConversationSelection(appState);
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
    activeConversationId: appState.activeConversationId,
    conversationCount: appState.conversationCount,
    conversationIdCounter: appState.conversationIdCounter,
    conversations: appState.conversations.map((conversation) => {
      const pathMessages = getConversationPathMessages(conversation);
      const serializeMessage = (message) => ({
        id: message.id,
        role: message.role,
        speaker: message.speaker,
        text: String(message.text || ''),
        createdAt: normalizeTimestamp(message.createdAt),
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
        systemPrompt:
          typeof conversation.systemPrompt === 'string' && conversation.systemPrompt.trim()
            ? conversation.systemPrompt
            : undefined,
        conversationSystemPrompt:
          typeof conversation.conversationSystemPrompt === 'string' &&
          conversation.conversationSystemPrompt.trim()
            ? conversation.conversationSystemPrompt
            : undefined,
        appendConversationSystemPrompt:
          conversation.appendConversationSystemPrompt === false ? false : undefined,
        startedAt: normalizeTimestamp(conversation.startedAt),
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
  if (appState.conversationSaveTimerId !== null) {
    return;
  }
  appState.conversationSaveTimerId = window.setTimeout(() => {
    appState.conversationSaveTimerId = null;
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
    createdAt: normalizeTimestamp(rawMessage.createdAt ?? rawMessage.timestamp),
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

function isLegacyUntitledConversationName(name) {
  return /^new conversation(?:\s+\d+)?$/i.test(String(name || '').trim());
}

function isLegacyNumberedUntitledConversationName(name) {
  return /^new conversation\s+\d+$/i.test(String(name || '').trim());
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
      const normalizedStoredName = normalizeConversationName(rawConversation.name);
      const name = isLegacyUntitledConversationName(normalizedStoredName)
        ? UNTITLED_CONVERSATION_PREFIX
        : normalizedStoredName || UNTITLED_CONVERSATION_PREFIX;
      const systemPrompt = normalizeSystemPrompt(rawConversation.systemPrompt);
      const conversationSystemPrompt = normalizeSystemPrompt(rawConversation.conversationSystemPrompt);
      const appendConversationSystemPrompt = normalizeConversationPromptMode(
        rawConversation.appendConversationSystemPrompt,
      );
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
      const earliestMessageTimestamp = messageNodes.reduce((earliest, message) => {
        const candidate = normalizeTimestamp(message.createdAt);
        if (!candidate) {
          return earliest;
        }
        return earliest ? Math.min(earliest, candidate) : candidate;
      }, null);
      const startedAt =
        normalizeTimestamp(rawConversation.startedAt ?? rawConversation.createdAt) ||
        earliestMessageTimestamp ||
        Date.now();

      return {
        id,
        name,
        systemPrompt,
        conversationSystemPrompt,
        appendConversationSystemPrompt,
        startedAt,
        messageNodes,
        messageNodeCounter,
        activeLeafMessageId,
        lastSpokenLeafMessageId,
        hasGeneratedName: Boolean(rawConversation.hasGeneratedName),
      };
    })
    .filter(Boolean)
    .filter((conversation) => {
      const isPlaceholderConversation =
        conversation.messageNodes.length === 0 &&
        !conversation.hasGeneratedName &&
        isLegacyNumberedUntitledConversationName(conversation.name);
      return !isPlaceholderConversation;
    });

  if (!restoredConversations.length) {
    return false;
  }

  appState.conversations.length = 0;
  appState.conversations.push(...restoredConversations);

  appState.activeConversationId = null;

  const maxCounterFromIds = appState.conversations.reduce(
    (maxCounter, conversation) => Math.max(maxCounter, parseConversationCounterFromId(conversation.id)),
    0,
  );
  const storedIdCounter = Number.parseInt(String(rawState.conversationIdCounter || ''), 10);
  const storedConversationCount = Number.parseInt(String(rawState.conversationCount || ''), 10);
  appState.conversationIdCounter =
    Number.isInteger(storedIdCounter) && storedIdCounter > 0
      ? Math.max(storedIdCounter, maxCounterFromIds)
      : maxCounterFromIds;
  appState.conversationCount =
    Number.isInteger(storedConversationCount) && storedConversationCount > 0
      ? storedConversationCount
      : appState.conversations.length;

  return true;
}

async function restoreConversationStateFromStorage() {
  try {
    const storedState = await loadConversationState();
    if (!applyStoredConversationState(storedState)) {
      appState.conversations.length = 0;
      appState.activeConversationId = null;
    }
  } catch (error) {
    appendDebug(`Conversation restore failed: ${error.message}`);
    appState.conversations.length = 0;
    appState.activeConversationId = null;
  }

  renderConversationList();
  renderTranscript();
  updateChatTitle();
}

function getActiveConversation() {
  return selectActiveConversation(appState);
}

function findConversationById(conversationId) {
  return selectConversationById(appState, conversationId);
}

function createConversation(name) {
  appState.conversationCount += 1;
  return createConversationRecord({
    id: `conversation-${++appState.conversationIdCounter}`,
    name,
    untitledPrefix: UNTITLED_CONVERSATION_PREFIX,
    systemPrompt: appState.defaultSystemPrompt,
    startedAt: Date.now(),
  });
}

function requestSingleGeneration(prompt) {
  return new Promise((resolve, reject) => {
    let streamedText = '';
    try {
      engine.generate(prompt, {
        generationConfig: appState.activeGenerationConfig,
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

function removeGenericThinkingSections(text) {
  return String(text || '').replace(/<think\b[^>]*>[\s\S]*?(?:<\/think>|$)/gi, '');
}

function formatOrchestrationStepOutput(step, rawOutput, thinkingTags) {
  const output = String(rawOutput || '').trim();
  if (!output) {
    return '';
  }

  const stripThinking = Boolean(step?.outputProcessing?.stripThinking);
  if (!stripThinking) {
    return output;
  }

  const parsed = parseThinkingText(output, thinkingTags);
  const withoutThinking = parsed.response.trim();
  if (withoutThinking) {
    return withoutThinking;
  }

  return removeGenericThinkingSections(output).trim();
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

function applyFixCardSignals(item, message) {
  if (!item || message?.role !== 'model') {
    return;
  }
  const bubble = item.querySelector('.message-bubble');
  if (!bubble) {
    return;
  }
  bubble.classList.toggle('is-fix-preparing', Boolean(message.isFixPreparing));
}

const transcriptView = createTranscriptView({
  container: chatTranscript,
  getActiveConversation,
  getConversationPathMessages,
  getConversationCardHeading,
  getModelVariantState,
  getUserVariantState,
  renderModelMarkdown,
  scheduleMathTypeset,
  getShowThinkingByDefault: () => appState.showThinkingByDefault,
  getActiveUserEditMessageId: () => appState.activeUserEditMessageId,
  getControlsState: () => ({
    isGenerating: appState.isGenerating,
    isLoadingModel: appState.isLoadingModel,
    isRunningOrchestration: appState.isRunningOrchestration,
    isSwitchingVariant: appState.isSwitchingVariant,
  }),
  getEmptyStateVisible: () => appState.modelReady && appState.conversations.length > 0,
  initializeTooltips,
  disposeTooltips,
  applyVariantCardSignals,
  applyFixCardSignals,
  scrollTranscriptToBottom,
  updateTranscriptNavigationButtonVisibility,
  cancelUserMessageEdit,
  saveUserMessageEdit,
});

function renderConversationList() {
  if (!conversationList) {
    return;
  }
  disposeTooltips(conversationList);
  renderConversationListView({
    container: conversationList,
    conversations: appState.conversations,
    activeConversationId: appState.activeConversationId,
    setIconButtonContent,
  });
  initializeTooltips(conversationList);
  updatePreChatStatusHint();
  updatePreChatActionButtons();
}

function findMessageElement(messageId) {
  return transcriptView.findMessageElement(messageId);
}

function refreshModelThinkingVisibility() {
  transcriptView.refreshModelThinkingVisibility();
}

function addMessageElement(message, options = {}) {
  return transcriptView.addMessageElement(message, options);
}

function updateModelMessageElement(message, item) {
  transcriptView.updateModelMessageElement(message, item);
}

function removeLeafMessageFromConversation(conversation, messageId) {
  if (!conversation || !messageId) {
    return false;
  }
  const message = getMessageNodeById(conversation, messageId);
  if (!message || !Array.isArray(message.childIds) || message.childIds.length) {
    return false;
  }
  conversation.messageNodes = conversation.messageNodes.filter((candidate) => candidate.id !== messageId);
  if (message.parentId) {
    const parentMessage = getMessageNodeById(conversation, message.parentId);
    if (parentMessage && Array.isArray(parentMessage.childIds)) {
      parentMessage.childIds = parentMessage.childIds.filter((childId) => childId !== messageId);
    }
  }
  if (conversation.activeLeafMessageId === messageId) {
    conversation.activeLeafMessageId = message.parentId || null;
  }
  if (conversation.lastSpokenLeafMessageId === messageId) {
    conversation.lastSpokenLeafMessageId = message.parentId || null;
  }
  return true;
}

function updateUserMessageElement(message, item) {
  transcriptView.updateUserMessageElement(message, item);
}

function scrollTranscriptToBottom() {
  if (!chatMain) {
    return;
  }
  chatMain.scrollTop = chatMain.scrollHeight;
  updateTranscriptNavigationButtonVisibility();
}

function getPreferredScrollBehavior() {
  return reducedMotionQuery.matches ? 'auto' : 'smooth';
}

function ensureModelVariantControlsVisible(messageId) {
  if (!chatTranscript || !chatMain || !messageId) {
    return;
  }
  const messageItem = chatTranscript.querySelector(`[data-message-id="${messageId}"]`);
  if (!(messageItem instanceof HTMLElement)) {
    return;
  }
  const variantNav = messageItem.querySelector('.response-variant-nav');
  const responseActions = messageItem.querySelector('.response-actions');
  const target =
    variantNav instanceof HTMLElement
      ? variantNav
      : responseActions instanceof HTMLElement
        ? responseActions
        : messageItem;
  target.scrollIntoView({ behavior: getPreferredScrollBehavior(), block: 'nearest', inline: 'nearest' });
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
  const shouldShowJumpToLatest = appState.modelReady && hasTranscriptItems && !isTranscriptNearBottom();
  jumpToLatestButton.classList.toggle('d-none', !shouldShowJumpToLatest);

  const lastPromptMessageId = getLastPromptMessageId();
  const shouldShowJumpToPrompt =
    appState.modelReady && hasTranscriptItems && Boolean(lastPromptMessageId) && !isMessageInView(lastPromptMessageId);
  jumpToLastPromptButton.classList.toggle('d-none', !shouldShowJumpToPrompt);
}

function renderTranscript(options = {}) {
  transcriptView.renderTranscript(options);
}

function updateChatTitleEditorVisibility() {
  if (
    !chatTitle ||
    !chatTitleInput ||
    !editChatTitleBtn ||
    !editConversationSystemPromptBtn ||
    !downloadConversationMenu ||
    !downloadConversationBtn ||
    !downloadConversationJsonBtn ||
    !downloadConversationMarkdownBtn ||
    !saveChatTitleBtn ||
    !cancelChatTitleBtn
  ) {
    return;
  }
  const activeConversation = getActiveConversation();
  const pathMessages = activeConversation ? getConversationPathMessages(activeConversation) : [];
  const hasCompletedGeneration = pathMessages.some(
    (message) => message?.role === 'model' && Boolean(message.isResponseComplete),
  );
  const canEditTitle = appState.modelReady && Boolean(activeConversation?.hasGeneratedName);
  const canEditConversationSystemPrompt = Boolean(activeConversation);
  const canDownloadConversation = appState.modelReady && hasCompletedGeneration;
  const controlsDisabled = appState.isGenerating || appState.isLoadingModel || appState.isRunningOrchestration;
  const showEditor = canEditTitle && appState.isChatTitleEditing;
  chatTitle.classList.toggle('d-none', showEditor);
  chatTitleInput.classList.toggle('d-none', !showEditor);
  editChatTitleBtn.classList.toggle('d-none', !canEditTitle || showEditor);
  editConversationSystemPromptBtn.classList.toggle('d-none', !canEditConversationSystemPrompt);
  downloadConversationMenu.classList.toggle('d-none', !canDownloadConversation);
  saveChatTitleBtn.classList.toggle('d-none', !showEditor);
  cancelChatTitleBtn.classList.toggle('d-none', !showEditor);
  chatTitleInput.disabled = !showEditor || controlsDisabled;
  editChatTitleBtn.disabled = controlsDisabled;
  editConversationSystemPromptBtn.disabled = controlsDisabled || !canEditConversationSystemPrompt;
  downloadConversationBtn.disabled = controlsDisabled || !canDownloadConversation;
  downloadConversationJsonBtn.disabled = controlsDisabled || !canDownloadConversation;
  downloadConversationMarkdownBtn.disabled = controlsDisabled || !canDownloadConversation;
  saveChatTitleBtn.disabled = controlsDisabled || !chatTitleInput.value.trim();
  cancelChatTitleBtn.disabled = controlsDisabled;
}

function downloadActiveConversationBranchAsJson() {
  const activeConversation = getActiveConversation();
  if (!activeConversation) {
    setStatus('No active conversation to download.');
    return;
  }
  const selectedModelId =
    typeof engine?.config?.modelId === 'string' && engine.config.modelId.trim()
      ? engine.config.modelId.trim()
      : normalizeModelId(modelSelect?.value || DEFAULT_MODEL);
  const temperature = Number.isFinite(engine?.config?.generationConfig?.temperature)
    ? Number(engine.config.generationConfig.temperature)
    : Number(appState.activeGenerationConfig?.temperature ?? DEFAULT_GENERATION_LIMITS.defaultTemperature);
  const payload = buildConversationDownloadPayload(activeConversation, {
    modelId: selectedModelId,
    temperature,
  });
  if (!payload.exchanges.length) {
    setStatus('No messages to download on this branch.');
    return;
  }
  const serialized = JSON.stringify(payload, null, 2);
  const blob = new Blob([serialized], { type: 'application/json' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = buildConversationJsonDownloadFileName(activeConversation.name);
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
  setStatus('Conversation downloaded as JSON.');
}

function downloadActiveConversationBranchAsMarkdown() {
  const activeConversation = getActiveConversation();
  if (!activeConversation) {
    setStatus('No active conversation to download.');
    return;
  }
  const selectedModelId =
    typeof engine?.config?.modelId === 'string' && engine.config.modelId.trim()
      ? engine.config.modelId.trim()
      : normalizeModelId(modelSelect?.value || DEFAULT_MODEL);
  const temperature = Number.isFinite(engine?.config?.generationConfig?.temperature)
    ? Number(engine.config.generationConfig.temperature)
    : Number(appState.activeGenerationConfig?.temperature ?? DEFAULT_GENERATION_LIMITS.defaultTemperature);
  const payload = buildConversationDownloadPayload(activeConversation, {
    modelId: selectedModelId,
    temperature,
  });
  if (!payload.exchanges.length) {
    setStatus('No messages to download on this branch.');
    return;
  }
  const markdownDocument = buildConversationDownloadMarkdown(payload);
  const blob = new Blob([markdownDocument], { type: 'text/markdown;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = buildConversationMarkdownDownloadFileName(activeConversation.name);
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
  setStatus('Conversation downloaded as Markdown.');
}

function getConversationSystemPromptModalInstance() {
  if (!(conversationSystemPromptModal instanceof HTMLElement)) {
    return null;
  }
  if (!appState.conversationSystemPromptModalInstance) {
    appState.conversationSystemPromptModalInstance = Modal.getOrCreateInstance(conversationSystemPromptModal);
  }
  return appState.conversationSystemPromptModalInstance;
}

function beginConversationSystemPromptEdit({ trigger = null } = {}) {
  if (
    appState.isGenerating ||
    appState.isLoadingModel ||
    appState.isRunningOrchestration ||
    !(conversationSystemPromptInput instanceof HTMLTextAreaElement) ||
    !(conversationSystemPromptAppendToggle instanceof HTMLInputElement)
  ) {
    return;
  }
  const activeConversation = getActiveConversation();
  if (!activeConversation) {
    return;
  }
  if (trigger instanceof HTMLElement) {
    appState.lastConversationSystemPromptTrigger = trigger;
  }
  conversationSystemPromptInput.value = normalizeSystemPrompt(
    activeConversation.conversationSystemPrompt,
  );
  conversationSystemPromptAppendToggle.checked = normalizeConversationPromptMode(
    activeConversation.appendConversationSystemPrompt,
  );
  const modalInstance = getConversationSystemPromptModalInstance();
  if (modalInstance) {
    modalInstance.show();
  }
}

function saveConversationSystemPromptEdit() {
  if (
    !(conversationSystemPromptInput instanceof HTMLTextAreaElement) ||
    !(conversationSystemPromptAppendToggle instanceof HTMLInputElement)
  ) {
    return;
  }
  const activeConversation = getActiveConversation();
  if (!activeConversation) {
    return;
  }
  activeConversation.conversationSystemPrompt = normalizeSystemPrompt(conversationSystemPromptInput.value);
  activeConversation.appendConversationSystemPrompt = Boolean(conversationSystemPromptAppendToggle.checked);
  queueConversationStateSave();
  setStatus('Conversation system prompt saved.');
  const modalInstance = getConversationSystemPromptModalInstance();
  if (modalInstance) {
    modalInstance.hide();
  }
}

function beginChatTitleEdit() {
  if (appState.isGenerating || appState.isLoadingModel || appState.isRunningOrchestration) {
    return;
  }
  const activeConversation = getActiveConversation();
  if (!activeConversation?.hasGeneratedName || !chatTitleInput) {
    return;
  }
  appState.isChatTitleEditing = true;
  chatTitleInput.value = activeConversation.name;
  updateChatTitleEditorVisibility();
  chatTitleInput.focus();
  chatTitleInput.select();
}

function cancelChatTitleEdit({ restoreFocus = true } = {}) {
  if (!appState.isChatTitleEditing) {
    return;
  }
  appState.isChatTitleEditing = false;
  updateChatTitle();
  if (restoreFocus && editChatTitleBtn instanceof HTMLButtonElement) {
    editChatTitleBtn.focus();
  }
}

function saveChatTitleEdit() {
  if (!appState.isChatTitleEditing || !chatTitleInput) {
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
  appState.isChatTitleEditing = false;
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

function getRouteFromHash(hashValue = window.location.hash) {
  const normalized = String(hashValue || '')
    .replace(/^#\/?/, '')
    .trim()
    .toLowerCase();
  if (normalized === ROUTE_SETTINGS) {
    return ROUTE_SETTINGS;
  }
  if (normalized === ROUTE_CHAT) {
    return ROUTE_CHAT;
  }
  return ROUTE_HOME;
}

function getCurrentViewRoute() {
  return selectCurrentViewRoute(appState, {
    routeHome: ROUTE_HOME,
    routeChat: ROUTE_CHAT,
    routeSettings: ROUTE_SETTINGS,
  });
}

function setRouteHash(targetRoute, { replace = true } = {}) {
  const route = targetRoute === ROUTE_SETTINGS || targetRoute === ROUTE_CHAT ? targetRoute : ROUTE_HOME;
  const targetHash = route === ROUTE_HOME ? '#/' : `#/${route}`;
  if (window.location.hash === targetHash) {
    return;
  }
  if (replace) {
    window.history.replaceState(null, '', targetHash);
    return;
  }
  appState.ignoreNextHashChange = true;
  window.location.hash = targetHash;
}

function syncRouteToCurrentView({ replace = true } = {}) {
  setRouteHash(getCurrentViewRoute(), { replace });
}

function applyRouteFromHash() {
  const requestedRoute = getRouteFromHash();
  if (requestedRoute === ROUTE_SETTINGS) {
    setSettingsPageVisibility(true, { syncRoute: false });
    return;
  }

  setSettingsPageVisibility(false, { syncRoute: false });
  appState.hasStartedChatWorkspace = requestedRoute === ROUTE_CHAT;
  updateWelcomePanelVisibility({ syncRoute: false });
  if (appState.isSettingsPageOpen) {
    return;
  }
}

function setActiveSettingsTab(targetTabName, { focus = false } = {}) {
  const tabName = typeof targetTabName === 'string' ? targetTabName.trim() : '';
  if (!tabName || !settingsTabButtons.length || !settingsTabPanels.length) {
    return;
  }
  appState.activeSettingsTab = tabName;
  settingsTabButtons.forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    const isActive = button.dataset.settingsTab === appState.activeSettingsTab;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', String(isActive));
    button.tabIndex = isActive ? 0 : -1;
  });

  settingsTabPanels.forEach((panel) => {
    if (!(panel instanceof HTMLElement)) {
      return;
    }
    const isActive = panel.dataset.settingsTabPanel === appState.activeSettingsTab;
    panel.classList.toggle('d-none', !isActive);
    if (isActive) {
      panel.removeAttribute('aria-hidden');
      panel.inert = false;
    } else {
      panel.setAttribute('aria-hidden', 'true');
      panel.inert = true;
    }
  });

  if (focus) {
    const activeButton = Array.from(settingsTabButtons).find(
      (button) => button instanceof HTMLButtonElement && button.dataset.settingsTab === appState.activeSettingsTab,
    );
    if (activeButton instanceof HTMLButtonElement) {
      activeButton.focus();
    }
  }
}

function setSettingsPageVisibility(visible, { syncRoute = true, replaceRoute = true } = {}) {
  if (!settingsPage || !topBar) {
    return;
  }
  appState.isSettingsPageOpen = Boolean(visible);
  setRegionVisibility(settingsPage, appState.isSettingsPageOpen);
  const conversationPanelToggle = topBar.querySelector('[data-bs-target="#conversationPanel"]');
  if (openSettingsButton) {
    openSettingsButton.setAttribute('aria-expanded', String(appState.isSettingsPageOpen));
  }
  if (conversationPanelToggle) {
    conversationPanelToggle.classList.toggle('d-none', appState.isSettingsPageOpen);
  }
  if (appState.isSettingsPageOpen) {
    setRegionVisibility(homePanel, false);
    setRegionVisibility(preChatPanel, false);
    setRegionVisibility(conversationPanel, false);
    setRegionVisibility(chatTranscriptWrap, false);
    setRegionVisibility(chatForm, false);
    setRegionVisibility(topBar, true);
    setActiveSettingsTab(appState.activeSettingsTab);
    if (topBar instanceof HTMLElement) {
      topBar.setAttribute('aria-label', 'Settings');
    }
    if (syncRoute) {
      syncRouteToCurrentView({ replace: replaceRoute });
    }
    return;
  }

  if (topBar) {
    topBar.removeAttribute('aria-label');
  }
  updateWelcomePanelVisibility({ syncRoute: false });
  if (syncRoute) {
    syncRouteToCurrentView({ replace: replaceRoute });
  }
}

function updateWelcomePanelVisibility({ syncRoute = true, replaceRoute = true } = {}) {
  if (appState.isSettingsPageOpen) {
    return;
  }
  const previousView = appState.currentWorkspaceView;
  const showHome = !appState.hasStartedChatWorkspace;
  const showPreChat = appState.hasStartedChatWorkspace && !appState.modelReady;
  const showChat = appState.hasStartedChatWorkspace && appState.modelReady;
  appState.currentWorkspaceView = showHome ? ROUTE_HOME : showPreChat ? 'prechat' : ROUTE_CHAT;
  if (chatMain instanceof HTMLElement) {
    chatMain.classList.toggle('is-home', showHome);
    chatMain.classList.toggle('is-prechat', showPreChat);
    chatMain.classList.toggle('is-chat', showChat);
  }
  setRegionVisibility(homePanel, showHome);
  setRegionVisibility(preChatPanel, showPreChat);
  setRegionVisibility(topBar, true);
  setRegionVisibility(conversationPanel, appState.hasStartedChatWorkspace);
  const conversationPanelToggle = topBar?.querySelector('[data-bs-target="#conversationPanel"]');
  if (conversationPanelToggle instanceof HTMLElement) {
    conversationPanelToggle.classList.toggle('d-none', !appState.hasStartedChatWorkspace);
  }
  setRegionVisibility(chatTranscriptWrap, showChat);
  updateComposerVisibility();
  if (!showChat && appState.isChatTitleEditing) {
    appState.isChatTitleEditing = false;
  }
  updateChatTitleEditorVisibility();
  updateTranscriptNavigationButtonVisibility();
  updateActionButtons();
  updatePreChatStatusHint();
  updatePreChatActionButtons();
  if (appState.currentWorkspaceView !== previousView) {
    if (showPreChat) {
      playEntranceAnimation(preChatPanel);
      playEntranceAnimation(chatForm, 'animate-dock');
    } else if (showChat) {
      playEntranceAnimation(topBar);
      playEntranceAnimation(chatTranscriptWrap);
      playEntranceAnimation(chatForm, 'animate-dock');
    } else if (showHome) {
      playEntranceAnimation(homePanel);
    }
  }
  if (syncRoute) {
    syncRouteToCurrentView({ replace: replaceRoute });
  }
}

function updatePreChatActionButtons() {
  const activeConversation = getActiveConversation();
  const hasExistingConversation = hasConversationHistory(activeConversation);
  const canShowPreChatActions =
    appState.hasStartedChatWorkspace && !appState.modelReady && !appState.isSettingsPageOpen && Boolean(activeConversation);
  const isBusy = appState.isGenerating || appState.isLoadingModel || appState.isRunningOrchestration;

  if (preChatActions instanceof HTMLElement) {
    preChatActions.classList.toggle('d-none', !canShowPreChatActions);
  }
  if (preChatLoadModelBtn instanceof HTMLButtonElement) {
    preChatLoadModelBtn.classList.toggle('d-none', !hasExistingConversation);
    preChatLoadModelBtn.disabled = !canShowPreChatActions || !hasExistingConversation || isBusy;
  }
  if (preChatEditConversationSystemPromptBtn instanceof HTMLButtonElement) {
    preChatEditConversationSystemPromptBtn.disabled = !canShowPreChatActions || isBusy;
  }
}

function updateComposerVisibility() {
  const showComposer =
    appState.hasStartedChatWorkspace &&
    !appState.isSettingsPageOpen &&
    (!appState.modelReady || Boolean(getActiveConversation()));
  setRegionVisibility(chatForm, showComposer);
  if (chatForm instanceof HTMLElement) {
    const showPreChatComposer = appState.hasStartedChatWorkspace && !appState.modelReady && !appState.isSettingsPageOpen;
    chatForm.classList.toggle('is-prechat', showPreChatComposer);
  }
  if (messageInput instanceof HTMLTextAreaElement) {
    messageInput.disabled = shouldDisableComposerForPreChatConversationSelection();
  }
}

function updateChatTitle() {
  if (!chatTitle) {
    return;
  }
  const activeConversation = getActiveConversation();
  if (appState.modelReady && !activeConversation && appState.conversations.length) {
    chatTitle.textContent = 'Select a Conversation';
    updateComposerVisibility();
    updateChatTitleEditorVisibility();
    return;
  }
  if (activeConversation?.hasGeneratedName) {
    chatTitle.textContent = activeConversation.name;
    if (!appState.isChatTitleEditing && chatTitleInput) {
      chatTitleInput.value = activeConversation.name;
    }
    updateComposerVisibility();
    updateChatTitleEditorVisibility();
    return;
  }
  chatTitle.textContent = appState.modelReady ? 'Start Your Chat Now' : 'Ready to Chat?';
  if (!appState.isChatTitleEditing && chatTitleInput && activeConversation) {
    chatTitleInput.value = activeConversation.name;
  }
  updateComposerVisibility();
  updateChatTitleEditorVisibility();
}

function setActiveConversationById(conversationId) {
  if (appState.activeConversationId === conversationId) {
    return;
  }
  if (appState.isChatTitleEditing) {
    appState.isChatTitleEditing = false;
  }
  appState.activeConversationId = conversationId;
  const activeConversation = getActiveConversation();
  if (
    activeConversation?.lastSpokenLeafMessageId &&
    getMessageNodeById(activeConversation, activeConversation.lastSpokenLeafMessageId)
  ) {
    activeConversation.activeLeafMessageId = activeConversation.lastSpokenLeafMessageId;
  }
  clearUserMessageEditSession();
  renderConversationList();
  renderTranscript();
  updateChatTitle();
  queueConversationStateSave();
}

function updateActionButtons() {
  updateSendButtonMode();
  updateGenerationSettingsEnabledState();
  updateChatTitleEditorVisibility();
  updatePreChatActionButtons();
  const disableComposerForPreChatSelection = shouldDisableComposerForPreChatConversationSelection();
  if (messageInput instanceof HTMLTextAreaElement) {
    messageInput.disabled = disableComposerForPreChatSelection;
  }
  if (sendButton) {
    sendButton.disabled =
      appState.isLoadingModel ||
      appState.isRunningOrchestration ||
      (!appState.isGenerating && !appState.hasStartedChatWorkspace) ||
      Boolean(appState.activeUserEditMessageId) ||
      disableComposerForPreChatSelection;
  }
  if (newConversationBtn) {
    newConversationBtn.disabled =
      appState.isGenerating || appState.isRunningOrchestration || !appState.hasStartedChatWorkspace || !appState.modelReady;
  }
  updateRegenerateButtons();
  updateUserMessageButtons();
}

function updateRegenerateButtons() {
  if (!chatTranscript) {
    return;
  }
  const disabled =
    appState.isLoadingModel ||
    appState.isGenerating ||
    appState.isRunningOrchestration ||
    appState.isSwitchingVariant ||
    !appState.modelReady ||
    Boolean(appState.activeUserEditMessageId);
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
  if (appState.isGenerating) {
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

function formatBytes(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const decimals = size >= 100 || unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(decimals)} ${units[unitIndex]}`;
}

function setCurrentFileProgressBar({ percent = 0, indeterminate = false, animate = true }) {
  if (!modelLoadCurrentFileBar) {
    return;
  }
  const boundedPercent = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
  if (!animate) {
    modelLoadCurrentFileBar.classList.add('model-load-bar-no-transition');
  }
  modelLoadCurrentFileBar.classList.toggle('model-load-bar-indeterminate', indeterminate);
  if (indeterminate) {
    modelLoadCurrentFileBar.style.width = '35%';
    modelLoadCurrentFileBar.removeAttribute('aria-valuenow');
  } else {
    modelLoadCurrentFileBar.style.width = `${boundedPercent}%`;
    modelLoadCurrentFileBar.setAttribute('aria-valuenow', `${Math.round(boundedPercent)}`);
  }
  if (!animate) {
    requestAnimationFrame(() => {
      modelLoadCurrentFileBar.classList.remove('model-load-bar-no-transition');
    });
  }
}

function resetLoadProgressFiles() {
  appState.maxObservedLoadPercent = 0;
  appState.loadProgressFiles.clear();
  renderLoadProgressFiles();
}

function renderLoadProgressFiles() {
  if (!modelLoadProgressSummary && !modelLoadCurrentFileLabel && !modelLoadCurrentFileValue) {
    return;
  }
  const entries = [...appState.loadProgressFiles.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  const completeCount = entries.filter((entry) => entry.isComplete).length;
  const latestEntry = entries[0] || null;
  if (modelLoadProgressSummary) {
    if (!entries.length) {
      modelLoadProgressSummary.textContent = '0/0 stages complete';
    } else {
      modelLoadProgressSummary.textContent = `${completeCount}/${entries.length} stages complete`;
    }
  }
  if (!latestEntry) {
    if (modelLoadCurrentFileLabel) {
      modelLoadCurrentFileLabel.textContent = 'Current file';
    }
    if (modelLoadCurrentFileValue) {
      modelLoadCurrentFileValue.textContent = 'Waiting...';
    }
    setCurrentFileProgressBar({ percent: 0, indeterminate: false, animate: false });
    return;
  }

  if (modelLoadCurrentFileLabel) {
    modelLoadCurrentFileLabel.textContent = latestEntry.label || 'Current file';
  }
  if (modelLoadCurrentFileValue) {
    if (latestEntry.hasKnownTotal && latestEntry.totalBytes > 0) {
      modelLoadCurrentFileValue.textContent = `${formatBytes(latestEntry.loadedBytes)} / ${formatBytes(latestEntry.totalBytes)}`;
    } else if (latestEntry.loadedBytes > 0) {
      modelLoadCurrentFileValue.textContent = `${formatBytes(latestEntry.loadedBytes)} downloaded`;
    } else {
      modelLoadCurrentFileValue.textContent = 'Downloading...';
    }
  }
  setCurrentFileProgressBar({
    percent: latestEntry.percent,
    indeterminate: latestEntry.isIndeterminate,
  });
}

function trackLoadFileProgress(file, percent, status, loadedBytes, totalBytes) {
  if (typeof file !== 'string' || !file.trim()) {
    return;
  }
  const key = file.trim();
  const numericPercent = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
  const statusText = typeof status === 'string' ? status.trim() : '';
  const numericLoadedBytes = Number.isFinite(loadedBytes) && loadedBytes > 0 ? loadedBytes : 0;
  const numericTotalBytes = Number.isFinite(totalBytes) && totalBytes > 0 ? totalBytes : 0;
  const hasKnownTotal = numericTotalBytes > 0;
  const percentFromBytes = hasKnownTotal ? (numericLoadedBytes / numericTotalBytes) * 100 : null;
  const effectivePercent = Number.isFinite(percentFromBytes) ? percentFromBytes : numericPercent;
  const previous = appState.loadProgressFiles.get(key);
  const isComplete =
    effectivePercent >= 100 ||
    (hasKnownTotal && numericLoadedBytes >= numericTotalBytes) ||
    /complete|ready|loaded|done|cached/i.test(statusText);
  appState.loadProgressFiles.set(key, {
    label: formatLoadFileLabel(key),
    percent: previous ? Math.max(previous.percent, effectivePercent) : effectivePercent,
    status: statusText || previous?.status || '',
    loadedBytes: previous ? Math.max(previous.loadedBytes || 0, numericLoadedBytes) : numericLoadedBytes,
    totalBytes: hasKnownTotal ? numericTotalBytes : previous?.totalBytes || 0,
    hasKnownTotal: hasKnownTotal || Boolean(previous?.hasKnownTotal),
    isIndeterminate: !hasKnownTotal && !isComplete,
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

function setLoadProgress({
  percent = 0,
  message = 'Preparing model...',
  file = '',
  status = '',
  loadedBytes = 0,
  totalBytes = 0,
}) {
  const numericPercent = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
  const isCompletedMessage =
    /^model ready\.$/i.test(String(message || '').trim()) ||
    /^loaded .+ \((webgpu|wasm|cpu)\)\.$/i.test(String(message || '').trim());
  const normalizedPercent = isCompletedMessage ? 100 : numericPercent;
  const displayPercent = Math.max(appState.maxObservedLoadPercent, normalizedPercent);
  appState.maxObservedLoadPercent = displayPercent;
  if (modelLoadProgressLabel) {
    modelLoadProgressLabel.textContent = message;
  }
  if (modelLoadProgressValue) {
    modelLoadProgressValue.textContent = `${Math.round(displayPercent)}%`;
  }
  if (modelLoadProgressBar) {
    modelLoadProgressBar.style.width = `${displayPercent}%`;
    modelLoadProgressBar.setAttribute('aria-valuenow', `${Math.round(displayPercent)}`);
    modelLoadProgressBar.classList.toggle('progress-bar-animated', displayPercent < 100);
  }
  trackLoadFileProgress(file, normalizedPercent, status || message, loadedBytes, totalBytes);
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

function getStoredDefaultSystemPrompt() {
  return normalizeSystemPrompt(localStorage.getItem(DEFAULT_SYSTEM_PROMPT_STORAGE_KEY));
}

function applyDefaultSystemPrompt(value, { persist = false } = {}) {
  appState.defaultSystemPrompt = normalizeSystemPrompt(value);
  if (defaultSystemPromptInput instanceof HTMLTextAreaElement) {
    defaultSystemPromptInput.value = appState.defaultSystemPrompt;
  }
  if (persist) {
    localStorage.setItem(DEFAULT_SYSTEM_PROMPT_STORAGE_KEY, appState.defaultSystemPrompt);
  }
}

function applyShowThinkingPreference(value, { persist = false, refresh = false } = {}) {
  appState.showThinkingByDefault = Boolean(value);
  if (showThinkingToggle) {
    showThinkingToggle.checked = appState.showThinkingByDefault;
  }
  if (persist) {
    localStorage.setItem(SHOW_THINKING_STORAGE_KEY, String(appState.showThinkingByDefault));
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

function normalizeBackendPreference(value) {
  if (SUPPORTED_BACKEND_PREFERENCES.has(value)) {
    return value;
  }
  return 'auto';
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
    const normalizedBackend = normalizeBackendPreference(storedBackend);
    backendSelect.value = normalizedBackend;
    localStorage.setItem(BACKEND_STORAGE_KEY, normalizedBackend);
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

function getRuntimeConfigForModel(modelId) {
  return MODEL_OPTIONS_BY_ID.get(normalizeModelId(modelId))?.runtime || {};
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
  const selectedBackend = normalizeBackendPreference(backendSelect?.value || 'auto');
  if (modelSelect && modelSelect.value !== selectedModel) {
    modelSelect.value = selectedModel;
  }
  if (backendSelect && backendSelect.value !== selectedBackend) {
    backendSelect.value = selectedBackend;
  }
  syncGenerationSettingsFromModel(selectedModel, false);
  return {
    modelId: selectedModel,
    backendPreference: selectedBackend,
    runtime: getRuntimeConfigForModel(selectedModel),
    generationConfig: appState.activeGenerationConfig,
  };
}

function persistInferencePreferences() {
  const selectedModel = normalizeModelId(modelSelect?.value || DEFAULT_MODEL);
  const selectedBackend = normalizeBackendPreference(backendSelect?.value || 'auto');
  if (backendSelect && backendSelect.value !== selectedBackend) {
    backendSelect.value = selectedBackend;
  }
  localStorage.setItem(MODEL_STORAGE_KEY, selectedModel);
  localStorage.setItem(BACKEND_STORAGE_KEY, selectedBackend);
  persistGenerationConfigForModel(selectedModel, appState.activeGenerationConfig);
  persistGlobalSamplingSettings(appState.activeGenerationConfig);
}

const runOrchestration = createOrchestrationRunner({
  generateText: requestSingleGeneration,
  formatStepOutput: (step, rawOutput) => {
    const selectedModelId = normalizeModelId(modelSelect?.value || DEFAULT_MODEL);
    return formatOrchestrationStepOutput(step, rawOutput, getThinkingTagsForModel(selectedModelId));
  },
  onDebug: appendDebug,
});

const appController = createAppController({
  state: appState,
  engine,
  runOrchestration,
  renameOrchestration: RENAME_CHAT_ORCHESTRATION,
  fixOrchestration: FIX_RESPONSE_ORCHESTRATION,
  readEngineConfig: readEngineConfigFromUI,
  persistInferencePreferences,
  getActiveConversation,
  findConversationById,
  hasSelectedConversationWithHistory,
  normalizeModelId,
  getThinkingTagsForModel,
  getSelectedModelId: () => modelSelect?.value || DEFAULT_MODEL,
  addMessageToConversation,
  buildPromptForConversationLeaf,
  getMessageNodeById,
  deriveConversationName,
  normalizeConversationName,
  removeLeafMessageFromConversation,
  parseThinkingText,
  findMessageElement,
  addMessageElement,
  updateModelMessageElement,
  renderTranscript,
  renderConversationList,
  updateChatTitle,
  updateActionButtons,
  updateWelcomePanelVisibility,
  queueConversationStateSave,
  scrollTranscriptToBottom,
  setStatus,
  appendDebug,
  showProgressRegion,
  clearLoadError,
  resetLoadProgressFiles,
  setLoadProgress,
  showLoadError,
  applyPendingGenerationSettingsIfReady,
  markActiveIncompleteModelMessageComplete,
});

function animateVariantSwitch(outgoingMessageId, incomingMessageId, direction, options = {}) {
  if (!chatTranscript) {
    return;
  }
  const ensureModelControlsVisible = Boolean(options.ensureModelControlsVisible);
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
    if (ensureModelControlsVisible) {
      ensureModelVariantControlsVisible(incomingMessageId);
    }
    appState.isSwitchingVariant = false;
    updateActionButtons();
    queueConversationStateSave();
  }, 170);
}

function switchModelVariant(messageId, direction) {
  if (
    !messageId ||
    appState.isGenerating ||
    appState.isLoadingModel ||
    appState.isRunningOrchestration ||
    appState.isSwitchingVariant ||
    appState.activeUserEditMessageId
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
  appState.isSwitchingVariant = true;
  activeConversation.activeLeafMessageId = targetLeafId || targetMessage.id;
  updateActionButtons();
  animateVariantSwitch(modelMessage.id, targetMessage.id, direction, {
    ensureModelControlsVisible: true,
  });
}

function switchUserVariant(messageId, direction) {
  if (
    !messageId ||
    appState.isGenerating ||
    appState.isLoadingModel ||
    appState.isRunningOrchestration ||
    appState.isSwitchingVariant ||
    appState.activeUserEditMessageId
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
  appState.isSwitchingVariant = true;
  activeConversation.activeLeafMessageId = targetLeafId || targetMessage.id;
  updateActionButtons();
  animateVariantSwitch(userMessage.id, targetMessage.id, direction);
}

function beginUserMessageEdit(messageId) {
  if (!messageId || appState.isGenerating || appState.isLoadingModel || appState.isRunningOrchestration || appState.isSwitchingVariant) {
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
  startUserMessageEditSession(messageId);
  renderTranscript({ scrollToBottom: false });
  updateActionButtons();
  const editor = chatTranscript?.querySelector(`[data-message-id="${messageId}"] .user-message-editor`);
  if (editor instanceof HTMLTextAreaElement) {
    editor.focus();
    editor.setSelectionRange(editor.value.length, editor.value.length);
  }
}

function cancelUserMessageEdit(messageId) {
  if (!appState.activeUserEditMessageId || (messageId && appState.activeUserEditMessageId !== messageId)) {
    return;
  }
  clearUserMessageEditSession();
  renderTranscript({ scrollToBottom: false });
  updateActionButtons();
  setStatus('Edit canceled.');
}

function saveUserMessageEdit(messageId) {
  if (
    !messageId ||
    appState.isGenerating ||
    appState.isLoadingModel ||
    appState.isRunningOrchestration ||
    appState.isSwitchingVariant ||
    appState.activeUserEditMessageId !== messageId
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
  const isBranchEdit = appState.activeUserBranchSourceMessageId === messageId;
  if (isBranchEdit) {
    const currentText = (userMessage.text || '').trim();
    if (nextText === currentText) {
      clearUserMessageEditSession();
      renderTranscript({ scrollToBottom: false });
      updateActionButtons();
      setStatus('Branch not created. Change the message and save to create a branch.');
      return;
    }
    const branchMessage = addMessageToConversation(activeConversation, 'user', nextText, {
      parentId: userMessage.parentId || null,
    });
    activeConversation.activeLeafMessageId = branchMessage.id;
    activeConversation.lastSpokenLeafMessageId = branchMessage.id;
    clearUserMessageEditSession();
    renderTranscript();
    updateActionButtons();
    queueConversationStateSave();
    if (!appState.modelReady) {
      setStatus('Branch saved. Send a message to load the model and generate a new response.');
      return;
    }
    setStatus('Branch saved. Generating response...');
    appController.startModelGeneration(activeConversation, buildPromptForConversationLeaf(activeConversation), {
      parentMessageId: branchMessage.id,
      updateLastSpokenOnComplete: true,
    });
    return;
  }
  userMessage.text = nextText;
  const { removedCount } = pruneDescendantsFromMessage(activeConversation, userMessage.id);
  activeConversation.activeLeafMessageId = userMessage.id;
  activeConversation.lastSpokenLeafMessageId = userMessage.id;
  clearUserMessageEditSession();
  renderTranscript();
  updateActionButtons();
  queueConversationStateSave();
  const saveStatus =
    removedCount > 0
      ? 'Message saved. Later turns were removed from this branch.'
      : 'Message saved.';
  if (!appState.modelReady) {
    setStatus(`${saveStatus} Send a message to load the model and generate a new response.`);
    return;
  }
  setStatus(`${saveStatus} Generating updated response...`);
  appController.startModelGeneration(activeConversation, buildPromptForConversationLeaf(activeConversation), {
    parentMessageId: userMessage.id,
    updateLastSpokenOnComplete: true,
  });
}

function branchFromUserMessage(messageId) {
  if (
    !messageId ||
    appState.isGenerating ||
    appState.isLoadingModel ||
    appState.isRunningOrchestration ||
    appState.isSwitchingVariant ||
    appState.activeUserEditMessageId
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
  activeConversation.activeLeafMessageId = findPreferredLeafForVariant(activeConversation, userMessage) || userMessage.id;
  startUserMessageEditSession(messageId, { branchSourceMessageId: messageId });
  renderTranscript({ scrollToBottom: false });
  updateActionButtons();
  const editor = chatTranscript?.querySelector(`[data-message-id="${messageId}"] .user-message-editor`);
  if (editor instanceof HTMLTextAreaElement) {
    editor.focus();
    editor.setSelectionRange(editor.value.length, editor.value.length);
  }
  setStatus('Branch mode enabled. Edit and save to create a branch.');
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
  const loadedBytes = Number.isFinite(progress?.loadedBytes) ? progress.loadedBytes : 0;
  const totalBytes = Number.isFinite(progress?.totalBytes) ? progress.totalBytes : 0;
  setLoadProgress({ percent, message, file, status, loadedBytes, totalBytes });
};

const themePreference = getStoredThemePreference();
applyTheme(themePreference);
applyShowThinkingPreference(getStoredShowThinkingPreference());
applyDefaultSystemPrompt(getStoredDefaultSystemPrompt());
populateModelSelect();
restoreInferencePreferences();
setStatus('Ready.');
showProgressRegion(false);
updateActionButtons();
setActiveSettingsTab(appState.activeSettingsTab);
updateWelcomePanelVisibility();
applyRouteFromHash();
void restoreConversationStateFromStorage();

if (settingsTabContainer) {
  settingsTabContainer.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }
    const tab = target.dataset.settingsTab;
    if (tab && tab === appState.activeSettingsTab) {
      return;
    }
    setActiveSettingsTab(tab, { focus: true });
  });

  settingsTabContainer.addEventListener('keydown', (event) => {
    if (!(event.target instanceof HTMLButtonElement)) {
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') {
      if (event.key === 'Enter' || event.key === ' ') {
        setActiveSettingsTab(event.target.dataset.settingsTab, { focus: false });
      }
      return;
    }
    const buttons = Array.from(settingsTabButtons).filter((button) => button instanceof HTMLButtonElement);
    const currentIndex = buttons.indexOf(event.target);
    if (currentIndex < 0) {
      return;
    }
    event.preventDefault();
    let nextIndex = currentIndex;
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      nextIndex = (currentIndex + direction + buttons.length) % buttons.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = buttons.length - 1;
    }
    const nextTab = buttons[nextIndex];
    const nextTabName = nextTab?.dataset?.settingsTab;
    if (typeof nextTabName === 'string') {
      setActiveSettingsTab(nextTabName, { focus: false });
      nextTab.focus();
    }
  });
}

if (openSettingsButton) {
  openSettingsButton.addEventListener('click', () => {
    setSettingsPageVisibility(true, { replaceRoute: false });
    if (settingsTabButtons[0] instanceof HTMLButtonElement) {
      settingsTabButtons[0].focus();
    }
  });
}

if (closeSettingsButton) {
  closeSettingsButton.addEventListener('click', () => {
    setSettingsPageVisibility(false, { replaceRoute: false });
    if (openSettingsButton instanceof HTMLButtonElement) {
      openSettingsButton.focus();
    }
  });
}

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !appState.isSettingsPageOpen) {
    return;
  }
  event.preventDefault();
  setSettingsPageVisibility(false, { replaceRoute: false });
  if (openSettingsButton instanceof HTMLButtonElement) {
    openSettingsButton.focus();
  }
});

window.addEventListener('hashchange', () => {
  if (appState.ignoreNextHashChange) {
    appState.ignoreNextHashChange = false;
    return;
  }
  applyRouteFromHash();
});

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

if (defaultSystemPromptInput instanceof HTMLTextAreaElement) {
  defaultSystemPromptInput.addEventListener('change', (event) => {
    const value = event.target instanceof HTMLTextAreaElement ? event.target.value : '';
    applyDefaultSystemPrompt(value, { persist: true });
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
    void appController.reinitializeEngineFromSettings();
  });
}

if (backendSelect) {
  backendSelect.addEventListener('change', () => {
    void appController.reinitializeEngineFromSettings();
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

if (resetContextTokensButton instanceof HTMLButtonElement) {
  resetContextTokensButton.addEventListener('click', () => {
    if (!appState.modelReady || !maxContextTokensInput) {
      return;
    }
    const selectedModel = normalizeModelId(modelSelect?.value || DEFAULT_MODEL);
    const limits = getModelGenerationLimits(selectedModel);
    maxContextTokensInput.value = String(limits.defaultMaxContextTokens);
    onGenerationSettingInputChanged();
  });
}

if (resetTemperatureButton instanceof HTMLButtonElement) {
  resetTemperatureButton.addEventListener('click', () => {
    if (!appState.modelReady || !temperatureInput) {
      return;
    }
    const selectedModel = normalizeModelId(modelSelect?.value || DEFAULT_MODEL);
    const limits = getModelGenerationLimits(selectedModel);
    temperatureInput.value = limits.defaultTemperature.toFixed(1);
    onGenerationSettingInputChanged();
  });
}

if (topKInput) {
  topKInput.addEventListener('change', onGenerationSettingInputChanged);
}

if (topPInput) {
  topPInput.addEventListener('change', onGenerationSettingInputChanged);
}

if (startConversationButton instanceof HTMLButtonElement) {
  startConversationButton.addEventListener('click', () => {
    appState.hasStartedChatWorkspace = true;
    updateWelcomePanelVisibility({ replaceRoute: false });
    if (messageInput instanceof HTMLTextAreaElement) {
      messageInput.focus();
    }
  });
}

if (newConversationBtn) {
  newConversationBtn.addEventListener('click', () => {
    if (appState.isGenerating) {
      return;
    }
    appState.hasStartedChatWorkspace = true;
    const conversation = createConversation();
    appState.conversations.unshift(conversation);
    appState.activeConversationId = conversation.id;
    clearUserMessageEditSession();
    appState.isChatTitleEditing = false;
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

    if (appState.isGenerating) {
      return;
    }

    const deleteButton = target.closest('.conversation-delete');
    if (deleteButton) {
      const item = deleteButton.closest('.conversation-item');
      const conversationId = item?.dataset.conversationId;
      if (!conversationId) {
        return;
      }

      const index = appState.conversations.findIndex((conversation) => conversation.id === conversationId);
      if (index < 0) {
        return;
      }

      const wasActive = appState.activeConversationId === conversationId;
      appState.conversations.splice(index, 1);

      if (wasActive) {
        appState.activeConversationId = appState.conversations[0]?.id || null;
        clearUserMessageEditSession();
        appState.isChatTitleEditing = false;
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
    if (!appState.isGenerating) {
      return;
    }
    event.preventDefault();
    await appController.stopGeneration();
  });
}

if (chatForm && messageInput && chatTranscript) {
  chatForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = messageInput.value.trim();
    if (!value || appState.isGenerating || appState.isRunningOrchestration || appState.activeUserEditMessageId) {
      if (appState.activeUserEditMessageId) {
        setStatus('Save or cancel the current message edit before sending a new message.');
      } else if (appState.isRunningOrchestration) {
        setStatus('Please wait for the current orchestration step to finish.');
      }
      return;
    }

    if (!appState.hasStartedChatWorkspace) {
      appState.hasStartedChatWorkspace = true;
      updateWelcomePanelVisibility({ replaceRoute: false });
    }

    let activeConversation = getActiveConversation();
    if (!activeConversation) {
      const conversation = createConversation();
      appState.conversations.unshift(conversation);
      appState.activeConversationId = conversation.id;
      activeConversation = conversation;
      clearUserMessageEditSession();
      appState.isChatTitleEditing = false;
      renderConversationList();
      renderTranscript();
      updateChatTitle();
      queueConversationStateSave();
    }

    if (!appState.modelReady) {
      persistInferencePreferences();
      setStatus('Loading model for your first message...');
      try {
        await appController.initializeEngine();
      } catch (_error) {
        return;
      }
      activeConversation = getActiveConversation();
      if (!activeConversation) {
        setStatus('Select a conversation or start a new conversation before sending a message.');
        appendDebug('Send blocked: no active conversation selected after model load.');
        return;
      }
    }

    const userMessage = addMessageToConversation(activeConversation, 'user', value);
    activeConversation.lastSpokenLeafMessageId = userMessage.id;
    addMessageElement(userMessage);
    messageInput.value = '';
    queueConversationStateSave();
    appController.startModelGeneration(activeConversation, buildPromptForConversationLeaf(activeConversation), {
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
      appController.regenerateFromMessage(regenerateButton.dataset.messageId || '');
      return;
    }
    const fixButton = target.closest('.fix-response-btn');
    if (fixButton instanceof HTMLButtonElement) {
      void appController.fixResponseFromMessage(fixButton.dataset.messageId || '');
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
  if (appState.conversationSaveTimerId !== null) {
    window.clearTimeout(appState.conversationSaveTimerId);
    appState.conversationSaveTimerId = null;
  }
  void persistConversationStateNow();
  engine.dispose();
});

if (editChatTitleBtn instanceof HTMLButtonElement) {
  editChatTitleBtn.addEventListener('click', () => {
    beginChatTitleEdit();
  });
}

if (editConversationSystemPromptBtn instanceof HTMLButtonElement) {
  editConversationSystemPromptBtn.addEventListener('click', (event) => {
    beginConversationSystemPromptEdit({ trigger: event.currentTarget });
  });
}

if (preChatEditConversationSystemPromptBtn instanceof HTMLButtonElement) {
  preChatEditConversationSystemPromptBtn.addEventListener('click', (event) => {
    beginConversationSystemPromptEdit({ trigger: event.currentTarget });
  });
}

if (preChatLoadModelBtn instanceof HTMLButtonElement) {
  preChatLoadModelBtn.addEventListener('click', () => {
    void appController.loadModelForSelectedConversation();
  });
}

if (downloadConversationJsonBtn instanceof HTMLButtonElement) {
  downloadConversationJsonBtn.addEventListener('click', () => {
    if (appState.isGenerating) {
      return;
    }
    downloadActiveConversationBranchAsJson();
  });
}

if (downloadConversationMarkdownBtn instanceof HTMLButtonElement) {
  downloadConversationMarkdownBtn.addEventListener('click', () => {
    if (appState.isGenerating) {
      return;
    }
    downloadActiveConversationBranchAsMarkdown();
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

if (conversationSystemPromptModal instanceof HTMLElement) {
  conversationSystemPromptModal.addEventListener('shown.bs.modal', () => {
    if (conversationSystemPromptInput instanceof HTMLTextAreaElement) {
      conversationSystemPromptInput.focus();
      conversationSystemPromptInput.setSelectionRange(
        conversationSystemPromptInput.value.length,
        conversationSystemPromptInput.value.length,
      );
    }
  });
  conversationSystemPromptModal.addEventListener('hidden.bs.modal', () => {
    if (appState.lastConversationSystemPromptTrigger instanceof HTMLButtonElement) {
      appState.lastConversationSystemPromptTrigger.focus();
      appState.lastConversationSystemPromptTrigger = null;
      return;
    }
    if (preChatEditConversationSystemPromptBtn instanceof HTMLButtonElement) {
      const isVisible = !preChatEditConversationSystemPromptBtn.classList.contains('d-none');
      if (isVisible) {
        preChatEditConversationSystemPromptBtn.focus();
        return;
      }
    }
    if (editConversationSystemPromptBtn instanceof HTMLButtonElement) {
      editConversationSystemPromptBtn.focus();
    }
  });
}

if (saveConversationSystemPromptBtn instanceof HTMLButtonElement) {
  saveConversationSystemPromptBtn.addEventListener('click', () => {
    saveConversationSystemPromptEdit();
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



