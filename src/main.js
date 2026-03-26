import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import 'bootstrap-icons/font/bootstrap-icons.css';
import Modal from 'bootstrap/js/dist/modal';
import Tooltip from 'bootstrap/js/dist/tooltip';
import MarkdownIt from 'markdown-it';
import { bindComposerEvents } from './app/composer-events.js';
import { createConversationEditors } from './app/conversation-editors.js';
import './styles.css';
import { bindConversationListEvents } from './app/conversation-list-events.js';
import { createPreferencesController } from './app/preferences.js';
import { createRoutingShell } from './app/routing-shell.js';
import { bindShellEvents } from './app/shell-events.js';
import { bindSettingsEvents } from './app/settings-events.js';
import { createShortcutHandlers } from './app/shortcut-events.js';
import { bindTranscriptEvents } from './app/transcript-events.js';
import { LLMEngineClient } from './llm/engine-client.js';
import { createOrchestrationRunner } from './llm/orchestration-runner.js';
import {
  buildToolCallingSystemPrompt,
  executeToolCall,
  getEnabledToolDefinitions,
  getEnabledToolNames,
  getToolDisplayName,
  sniffToolCalls,
} from './llm/tool-calling.js';
import renameChatOrchestration from './config/orchestrations/rename-chat.json';
import fixResponseOrchestration from './config/orchestrations/fix-response.json';
import {
  buildDefaultGenerationConfig,
  sanitizeGenerationConfig,
} from './config/generation-config.js';
import {
  DEFAULT_GENERATION_LIMITS,
  DEFAULT_MODEL,
  DEFAULT_TOP_K,
  DEFAULT_TOP_P,
  MAX_TOP_K,
  MAX_TOP_P,
  MIN_TOKEN_LIMIT,
  MIN_TOP_K,
  MIN_TOP_P,
  MODEL_OPTIONS_BY_ID,
  TEMPERATURE_STEP,
  TOKEN_STEP,
  TOP_K_STEP,
  TOP_P_STEP,
  getModelAvailability,
  clamp,
  browserSupportsWebGpu,
  normalizeGenerationLimits,
  normalizeModelId,
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
  normalizeMessageContentParts,
  normalizeConversationPromptMode,
  normalizeSystemPrompt,
  pruneDescendantsFromMessage,
  setUserMessageText,
} from './state/conversation-model.js';
import { createAppController } from './state/app-controller.js';
import {
  applyStoredConversationState,
  buildConversationStateSnapshot,
} from './state/conversation-serialization.js';
import {
  clearUserMessageEditState,
  createAppState,
  findConversationById as selectConversationById,
  getActiveConversation as selectActiveConversation,
  getActiveUserEditMessageId,
  getCurrentViewRoute as selectCurrentViewRoute,
  hasConversationHistory as selectHasConversationHistory,
  hasSelectedConversationWithHistory as selectHasSelectedConversationWithHistory,
  hasStartedWorkspace as selectHasStartedWorkspace,
  isChatTitleEditingState,
  isEngineBusy,
  isEngineReady,
  isGeneratingResponse,
  isMessageEditActive,
  isOrchestrationRunningState,
  isSettingsView,
  isVariantSwitchingState,
  isLoadingModelState,
  setChatTitleEditing,
  setChatWorkspaceStarted,
  setSwitchingVariant,
  setUserMessageEditState,
  shouldShowNewConversationButton as selectShouldShowNewConversationButton,
  shouldDisableComposerForPreChatConversationSelection as selectShouldDisableComposerForPreChatConversationSelection,
} from './state/app-state.js';
import { loadConversationState, saveConversationState } from './state/conversation-store.js';
import { renderConversationListView } from './ui/conversation-list-view.js';
import { createTranscriptView } from './ui/transcript-view.js';

const THEME_STORAGE_KEY = 'ui-theme-preference';
const SHOW_THINKING_STORAGE_KEY = 'ui-show-thinking';
const ENABLE_TOOL_CALLING_STORAGE_KEY = 'conversation-enable-tool-calling';
const SINGLE_KEY_SHORTCUTS_STORAGE_KEY = 'ui-enable-single-key-shortcuts';
const TRANSCRIPT_VIEW_STORAGE_KEY = 'ui-transcript-view';
const DEFAULT_SYSTEM_PROMPT_STORAGE_KEY = 'conversation-default-system-prompt';
const MODEL_STORAGE_KEY = 'llm-model-preference';
const BACKEND_STORAGE_KEY = 'llm-backend-preference';
const MODEL_GENERATION_SETTINGS_STORAGE_KEY = 'llm-model-generation-settings';
const UNTITLED_CONVERSATION_PREFIX = 'New Conversation';
const SUPPORTED_BACKEND_PREFERENCES = new Set(['auto', 'webgpu', 'wasm', 'cpu']);
const WEBGPU_REQUIRED_MODEL_SUFFIX = ' (WebGPU required)';

function base64FromArrayBuffer(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 32768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return window.btoa(binary);
}

async function computeSha256Hex(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function loadImageDimensions(src) {
  return new Promise((resolve) => {
    const image = new window.Image();
    image.onload = () => {
      resolve({
        width: Number.isFinite(image.naturalWidth) ? image.naturalWidth : null,
        height: Number.isFinite(image.naturalHeight) ? image.naturalHeight : null,
      });
    };
    image.onerror = () => resolve({ width: null, height: null });
    image.src = src;
  });
}

function formatAttachmentSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '';
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${Math.round(bytes)} B`;
}

const FIX_RESPONSE_ORCHESTRATION = fixResponseOrchestration;
const RENAME_CHAT_ORCHESTRATION = renameChatOrchestration;
const CONVERSATION_SAVE_DEBOUNCE_MS = 300;
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
  inlineMath: [
    ['$', '$'],
    ['\\(', '\\)'],
  ],
  displayMath: [
    ['$$', '$$'],
    ['\\[', '\\]'],
  ],
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
const enableToolCallingToggle = document.getElementById('enableToolCallingToggle');
const defaultSystemPromptInput = document.getElementById('defaultSystemPromptInput');
const modelSelect = document.getElementById('modelSelect');
const backendSelect = document.getElementById('backendSelect');
const maxOutputTokensInput = document.getElementById('maxOutputTokensInput');
const maxContextTokensInput = document.getElementById('maxContextTokensInput');
const temperatureInput = document.getElementById('temperatureInput');
const resetContextTokensButton = document.getElementById('resetContextTokensButton');
const resetTemperatureButton = document.getElementById('resetTemperatureButton');
const resetTopKButton = document.getElementById('resetTopKButton');
const resetTopPButton = document.getElementById('resetTopPButton');
const topKInput = document.getElementById('topKInput');
const topPInput = document.getElementById('topPInput');
const maxOutputTokensHelp = document.getElementById('maxOutputTokensHelp');
const maxContextTokensHelp = document.getElementById('maxContextTokensHelp');
const temperatureHelp = document.getElementById('temperatureHelp');
const topKHelp = document.getElementById('topKHelp');
const topPHelp = document.getElementById('topPHelp');
const statusRegion = document.getElementById('statusRegion');
const statusRegionHeading = document.getElementById('statusRegionHeading');
const statusRegionMessage = document.getElementById('statusRegionMessage');
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
const imageAttachmentInput = document.getElementById('imageAttachmentInput');
const composerAttachmentTray = document.getElementById('composerAttachmentTray');
const addImagesButton = document.getElementById('addImagesButton');
const messageInput = document.getElementById('messageInput');
const chatTranscript = document.getElementById('chatTranscript');
const chatTranscriptWrap = document.getElementById('chatTranscriptWrap');
const chatTranscriptStart = document.getElementById('chatTranscriptStart');
const chatTranscriptEnd = document.getElementById('chatTranscriptEnd');
const jumpToTopButton = document.getElementById('jumpToTopButton');
const jumpToPreviousUserButton = document.getElementById('jumpToPreviousUserButton');
const jumpToNextModelButton = document.getElementById('jumpToNextModelButton');
const jumpToLatestButton = document.getElementById('jumpToLatestButton');
const chatMain = document.querySelector('.chat-main');
const homePanel = document.getElementById('homePanel');
const preChatPanel = document.getElementById('preChatPanel');
const topBar = document.getElementById('topBar');
const conversationPanel = document.getElementById('conversationPanel');
const onboardingStatusRegion = document.getElementById('onboardingStatusRegion');
const onboardingStatusRegionHeading = document.getElementById('onboardingStatusRegionHeading');
const onboardingStatusRegionMessage = document.getElementById('onboardingStatusRegionMessage');
const preChatActions = document.getElementById('preChatActions');
const preChatLoadModelBtn = document.getElementById('preChatLoadModelBtn');
const preChatEditConversationSystemPromptBtn = document.getElementById(
  'preChatEditConversationSystemPromptBtn'
);
const chatTitle = document.getElementById('chatTitle');
const chatTitleInput = document.getElementById('chatTitleInput');
const saveChatTitleBtn = document.getElementById('saveChatTitleBtn');
const cancelChatTitleBtn = document.getElementById('cancelChatTitleBtn');
const openKeyboardShortcutsButton = document.getElementById('openKeyboardShortcutsButton');
const keyboardShortcutsModal = document.getElementById('keyboardShortcutsModal');
const conversationSystemPromptModal = document.getElementById('conversationSystemPromptModal');
const conversationSystemPromptInput = document.getElementById('conversationSystemPromptInput');
const conversationSystemPromptAppendToggle = document.getElementById(
  'conversationSystemPromptAppendToggle'
);
const saveConversationSystemPromptBtn = document.getElementById('saveConversationSystemPromptBtn');
const openSettingsButton = document.getElementById('openSettingsButton');
const closeSettingsButton = document.getElementById('closeSettingsButton');
const enableSingleKeyShortcutsToggle = document.getElementById('enableSingleKeyShortcutsToggle');
const transcriptViewSelect = document.getElementById('transcriptViewSelect');
const settingsPage = document.getElementById('settingsPage');
const settingsTabContainer = document.querySelector('.settings-tabs');
const settingsTabButtons = settingsTabContainer
  ? settingsTabContainer.querySelectorAll('[data-settings-tab]')
  : [];
const settingsTabPanels = settingsPage
  ? settingsPage.querySelectorAll('[data-settings-tab-panel]')
  : [];
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
const SHORTCUT_KEY = {
  branch: 'b',
  copy: 'c',
  edit: 'e',
  fix: 'f',
  help: 'h',
  jumpLatest: 'j',
  jumpPrompt: 'k',
  loadModel: 'l',
  newConversation: 'n',
  systemPrompt: 'p',
  regenerate: 'r',
  settings: 's',
  title: 't',
};
const mathTypesetTimers = new WeakMap();
const PRE_CHAT_STATUS_HINT_DEFAULT = 'Send your first message to load the selected model.';
const PRE_CHAT_STATUS_HINT_EXISTING_CONVERSATION = 'To see your conversation, load a model first.';
const appState = createAppState({
  activeGenerationConfig: {
    ...normalizeGenerationLimits(null),
    topK: DEFAULT_TOP_K,
    topP: DEFAULT_TOP_P,
  },
  defaultSystemPrompt: '',
  enableToolCalling: true,
  maxDebugEntries: MAX_DEBUG_ENTRIES,
});
void ensureMathJaxLoaded();
appState.webGpuAdapterAvailable = browserSupportsWebGpu();

function initializeTooltips(root = document) {
  if (!root || !(root instanceof Element || root instanceof Document)) {
    return;
  }
  root.querySelectorAll('[data-bs-toggle="tooltip"], [data-icon-tooltip]').forEach((element) => {
    Tooltip.getOrCreateInstance(element, { animation: false });
  });
}

function startUserMessageEditSession(messageId, { branchSourceMessageId = null } = {}) {
  setUserMessageEditState(appState, { messageId, branchSourceMessageId });
}

function clearUserMessageEditSession() {
  clearUserMessageEditState(appState);
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

function isAnyModalOpen() {
  return Boolean(document.querySelector('.modal.show'));
}

function findConversationMenuButton(conversationId, selector) {
  if (!conversationList || !conversationId) {
    return null;
  }
  const item = Array.from(conversationList.querySelectorAll('.conversation-item')).find(
    (candidate) => candidate instanceof HTMLElement && candidate.dataset.conversationId === conversationId
  );
  return item?.querySelector(selector) || null;
}

function closeConversationMenus({ restoreFocusTo = null } = {}) {
  if (!(conversationList instanceof HTMLElement)) {
    return;
  }
  conversationList.querySelectorAll('.conversation-item.menu-open').forEach((item) => {
    item.classList.remove('menu-open');
  });
  conversationList.querySelectorAll('.conversation-menu').forEach((menu) => {
    menu.classList.add('d-none');
  });
  conversationList.querySelectorAll('.conversation-submenu').forEach((menu) => {
    menu.classList.add('d-none');
  });
  conversationList.querySelectorAll('.conversation-menu-toggle').forEach((button) => {
    button.setAttribute('aria-expanded', 'false');
  });
  conversationList.querySelectorAll('.conversation-download-toggle').forEach((button) => {
    button.setAttribute('aria-expanded', 'false');
  });
  if (restoreFocusTo instanceof HTMLElement) {
    restoreFocusTo.focus();
  }
}

function openConversationMenu(item, toggleButton) {
  if (!(item instanceof HTMLElement) || !(toggleButton instanceof HTMLButtonElement)) {
    return;
  }
  const menu = item.querySelector('.conversation-menu');
  if (!(menu instanceof HTMLElement)) {
    return;
  }
  const isOpen = item.classList.contains('menu-open');
  closeConversationMenus();
  if (isOpen) {
    return;
  }
  item.classList.add('menu-open');
  menu.classList.remove('d-none');
  toggleButton.setAttribute('aria-expanded', 'true');
}

function toggleConversationDownloadMenu(item, toggleButton) {
  if (!(item instanceof HTMLElement) || !(toggleButton instanceof HTMLButtonElement)) {
    return;
  }
  const submenu = item.querySelector('.conversation-submenu');
  if (!(submenu instanceof HTMLElement)) {
    return;
  }
  const isOpen = !submenu.classList.contains('d-none');
  submenu.classList.toggle('d-none', isOpen);
  toggleButton.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
}

function getConversationMenuState(conversation) {
  const pathMessages = conversation ? getConversationPathMessages(conversation) : [];
  const hasCompletedGeneration = pathMessages.some(
    (message) => message?.role === 'model' && Boolean(message.isResponseComplete)
  );
  return {
    canEditName: isEngineReady(appState) && Boolean(conversation?.hasGeneratedName),
    canEditPrompt: Boolean(conversation),
    canDownload: isEngineReady(appState) && hasCompletedGeneration,
    controlsDisabled: isUiBusy(),
  };
}

function runConversationMenuAction(conversationId, actionButton, callback) {
  if (!conversationId) {
    return;
  }
  if (appState.activeConversationId !== conversationId) {
    setActiveConversationById(conversationId);
  }
  closeConversationMenus();
  const refreshedActionButton =
    actionButton instanceof HTMLElement
      ? findConversationMenuButton(conversationId, `.${Array.from(actionButton.classList).join('.')}`)
      : null;
  callback(refreshedActionButton);
}

function getKeyboardShortcutsModalInstance() {
  if (!(keyboardShortcutsModal instanceof HTMLElement)) {
    return null;
  }
  if (!appState.keyboardShortcutsModalInstance) {
    appState.keyboardShortcutsModalInstance = Modal.getOrCreateInstance(keyboardShortcutsModal);
  }
  return appState.keyboardShortcutsModalInstance;
}

function openKeyboardShortcuts(trigger = null) {
  if (isAnyModalOpen() && !keyboardShortcutsModal?.classList.contains('show')) {
    return;
  }
  if (trigger instanceof HTMLElement) {
    appState.lastKeyboardShortcutsTrigger = trigger;
  }
  const modalInstance = getKeyboardShortcutsModalInstance();
  if (modalInstance) {
    modalInstance.show();
  }
}

function closeKeyboardShortcuts() {
  const modalInstance = getKeyboardShortcutsModalInstance();
  if (modalInstance) {
    modalInstance.hide();
  }
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
    if (message.role === 'model') {
      const toolResultTexts = Array.isArray(message.childIds)
        ? message.childIds
            .map((childId) => getMessageNodeById(activeConversation, childId))
            .filter((childMessage) => childMessage?.role === 'tool')
            .map((toolMessage) => String(toolMessage.toolResult || toolMessage.text || '').trim())
            .filter(Boolean)
        : [];
      textToCopy = [String(message.response || message.text || '').trim(), ...toolResultTexts]
        .filter(Boolean)
        .join('\n\n');
    } else {
      textToCopy = '';
    }
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
    .replace(
      MATH_BLOCK_LINE_PATTERN,
      (_match, leading, expression) => `${leading}$$\n${expression}\n$$`
    );
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
        appendDebug(
          `MathJax failed to load: ${error instanceof Error ? error.message : String(error)}`
        );
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
      appendDebug(
        `MathJax render failed: ${error instanceof Error ? error.message : String(error)}`
      );
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
    MODEL_OPTIONS_BY_ID.get(normalizeModelId(modelId))?.generation ||
    normalizeGenerationLimits(null)
  );
}

function sanitizeGenerationConfigForModel(modelId, candidateConfig) {
  return sanitizeGenerationConfig(candidateConfig, getModelGenerationLimits(modelId));
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

function buildGenerationConfigFromUI(modelId) {
  return sanitizeGenerationConfig(
    {
      maxOutputTokens: maxOutputTokensInput?.value,
      maxContextTokens: maxContextTokensInput?.value,
      temperature: temperatureInput?.value,
      topK: topKInput?.value,
      topP: topPInput?.value,
    },
    getModelGenerationLimits(modelId)
  );
}

function renderGenerationSettingsHelpText(config, limits) {
  if (maxOutputTokensHelp) {
    maxOutputTokensHelp.textContent = `Allowed: ${formatInteger(MIN_TOKEN_LIMIT)} to ${formatInteger(
      Math.min(limits.maxOutputTokens, config.maxContextTokens)
    )} in steps of ${formatInteger(TOKEN_STEP)}. Estimated words: about ${formatWordEstimateFromTokens(config.maxOutputTokens)}.`;
  }
  if (maxContextTokensHelp) {
    maxContextTokensHelp.textContent = `Allowed: ${formatInteger(MIN_TOKEN_LIMIT)} to ${formatInteger(
      limits.maxContextTokens
    )} in steps of ${formatInteger(TOKEN_STEP)}. Estimated words: about ${formatWordEstimateFromTokens(config.maxContextTokens)}.`;
  }
  if (temperatureHelp) {
    temperatureHelp.textContent = `Allowed: ${limits.minTemperature.toFixed(1)} to ${limits.maxTemperature.toFixed(
      1
    )} in steps of ${TEMPERATURE_STEP.toFixed(1)}.`;
  }
  if (topKHelp) {
    topKHelp.textContent = `Top K picks from the K most likely next-token options. Lower values are more predictable. Current model default: ${formatInteger(limits.defaultTopK)}.`;
  }
  if (topPHelp) {
    topPHelp.textContent = `Also called nucleus sampling. Higher values can make responses more varied. Allowed: ${MIN_TOP_P.toFixed(
      2
    )} to ${MAX_TOP_P.toFixed(2)} in steps of ${TOP_P_STEP.toFixed(2)}. Current model default: ${limits.defaultTopP.toFixed(2)}.`;
  }
}

function syncGenerationSettingsFromModel(modelId, useDefaults = true) {
  const normalizedModelId = normalizeModelId(modelId);
  const limits = getModelGenerationLimits(normalizedModelId);
  const defaultConfig = buildDefaultGenerationConfig(limits);
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
  const disabled = !isEngineReady(appState);
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
  if (resetTopKButton instanceof HTMLButtonElement) {
    resetTopKButton.disabled = disabled;
  }
  if (resetTopPButton instanceof HTMLButtonElement) {
    resetTopPButton.disabled = disabled;
  }
  if (topKInput) {
    topKInput.disabled = disabled;
  }
  if (topPInput) {
    topPInput.disabled = disabled;
  }
}

function applyPendingGenerationSettingsIfReady() {
  if (isGeneratingResponse(appState) || !appState.pendingGenerationConfig) {
    return;
  }
  const selectedModel = normalizeModelId(modelSelect?.value || DEFAULT_MODEL);
  const nextConfig = sanitizeGenerationConfig(
    appState.pendingGenerationConfig,
    getModelGenerationLimits(selectedModel)
  );
  appState.pendingGenerationConfig = null;
  appState.activeGenerationConfig = nextConfig;
  engine.setGenerationConfig(nextConfig);
  syncGenerationSettingsFromModel(selectedModel, false);
  setStatus('Generation settings updated.');
  appendDebug(
    `Generation settings applied (maxOutputTokens=${nextConfig.maxOutputTokens}, maxContextTokens=${nextConfig.maxContextTokens}, temperature=${nextConfig.temperature.toFixed(1)}, topK=${nextConfig.topK}, topP=${nextConfig.topP.toFixed(2)}).`
  );
}

function onGenerationSettingInputChanged() {
  const selectedModel = normalizeModelId(modelSelect?.value || DEFAULT_MODEL);
  const nextConfig = buildGenerationConfigFromUI(selectedModel);
  appState.activeGenerationConfig = nextConfig;
  syncGenerationSettingsFromModel(selectedModel, false);
  persistGenerationConfigForModel(selectedModel, nextConfig);
  if (isGeneratingResponse(appState)) {
    appState.pendingGenerationConfig = nextConfig;
    setStatus('Generation settings will apply after current response.');
    appendDebug('Generation settings change queued until current response completes.');
    return;
  }
  engine.setGenerationConfig(nextConfig);
  setStatus('Generation settings updated.');
  appendDebug(
    `Generation settings applied (maxOutputTokens=${nextConfig.maxOutputTokens}, maxContextTokens=${nextConfig.maxContextTokens}, temperature=${nextConfig.temperature.toFixed(1)}, topK=${nextConfig.topK}, topP=${nextConfig.topP.toFixed(2)}).`
  );
}

function appendDebug(message) {
  const timestamp = new Date().toLocaleTimeString();
  appState.debugEntries.push(`[${timestamp}] ${message}`);
  if (appState.debugEntries.length > appState.maxDebugEntries) {
    appState.debugEntries.shift();
  }
  if (debugInfo) {
    debugInfo.textContent = appState.debugEntries.join('\n');
  }
}

function getStatusTone(message) {
  const normalized = String(message || '').trim();
  if (!normalized) {
    return { heading: 'Chat status', variant: 'secondary', role: 'status', live: 'polite' };
  }
  if (/error|failed|unable|cannot|no active|copy failed/i.test(normalized)) {
    return { heading: 'Chat error', variant: 'danger', role: 'alert', live: 'assertive' };
  }
  if (/loading|preparing|stopping|please wait|apply after current response/i.test(normalized)) {
    return { heading: 'Chat status', variant: 'warning', role: 'status', live: 'polite' };
  }
  if (
    /ready|saved|downloaded|copied|stopped|generated|updated|canceled|branch mode enabled/i.test(
      normalized
    )
  ) {
    return { heading: 'Chat status', variant: 'success', role: 'status', live: 'polite' };
  }
  return { heading: 'Chat status', variant: 'secondary', role: 'status', live: 'polite' };
}

function applyStatusRegion(region, headingElement, messageElement, message, headingOverride = '') {
  if (!(region instanceof HTMLElement) || !(messageElement instanceof HTMLElement)) {
    return;
  }
  const normalizedMessage = String(message || '').trim();
  region.classList.toggle('d-none', !normalizedMessage);
  if (!normalizedMessage) {
    messageElement.textContent = '';
    return;
  }
  const tone = getStatusTone(normalizedMessage);
  region.classList.remove(
    'alert-secondary',
    'alert-success',
    'alert-warning',
    'alert-danger',
    'alert-info'
  );
  region.classList.add(`alert-${tone.variant}`);
  region.setAttribute('role', tone.role);
  region.setAttribute('aria-live', tone.live);
  if (headingElement instanceof HTMLElement) {
    headingElement.textContent = headingOverride || tone.heading;
  }
  messageElement.textContent = normalizedMessage;
}

function setStatus(message) {
  if (statusRegion instanceof HTMLElement) {
    applyStatusRegion(
      statusRegion,
      statusRegionHeading,
      statusRegionMessage,
      message,
      'Chat status'
    );
  }
  if (onboardingStatusRegion instanceof HTMLElement) {
    applyStatusRegion(
      onboardingStatusRegion,
      onboardingStatusRegionHeading,
      onboardingStatusRegionMessage,
      message,
      'Setup status'
    );
  }
  appendDebug(`Status: ${message}`);
}

function updatePreChatStatusHint() {
  if (!(onboardingStatusRegion instanceof HTMLElement)) {
    return;
  }
  if (selectHasStartedWorkspace(appState) && !isEngineReady(appState) && !isLoadingModelState(appState)) {
    applyStatusRegion(
      onboardingStatusRegion,
      onboardingStatusRegionHeading,
      onboardingStatusRegionMessage,
      hasSelectedConversationWithHistory()
        ? PRE_CHAT_STATUS_HINT_EXISTING_CONVERSATION
        : PRE_CHAT_STATUS_HINT_DEFAULT,
      'Setup status'
    );
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

function shouldShowNewConversationButton() {
  return selectShouldShowNewConversationButton(appState);
}

function getPendingComposerAttachments() {
  return Array.isArray(appState.pendingComposerAttachments)
    ? appState.pendingComposerAttachments
    : [];
}

function selectedModelSupportsImageInput() {
  const selectedModelId = normalizeModelId(modelSelect?.value || DEFAULT_MODEL);
  const model = MODEL_OPTIONS_BY_ID.get(selectedModelId);
  return model?.features?.imageInput === true && model?.runtime?.multimodalGeneration === true;
}

function modelSupportsToolCalling(modelId) {
  return MODEL_OPTIONS_BY_ID.get(normalizeModelId(modelId))?.features?.toolCalling === true;
}

function getToolCallingConfigForModel(modelId) {
  return MODEL_OPTIONS_BY_ID.get(normalizeModelId(modelId))?.toolCalling || null;
}

function getToolCallingContext(modelId) {
  const enabled = appState.enableToolCalling === true;
  const config = enabled ? getToolCallingConfigForModel(modelId) : null;
  const supported = enabled && modelSupportsToolCalling(modelId) && Boolean(config);
  const enabledToolDefinitions = getEnabledToolDefinitions();
  const enabledTools = getEnabledToolNames();
  return {
    enabled,
    supported,
    enabledTools,
    enabledToolDefinitions,
    config,
  };
}

function getToolCallingSystemPromptSuffix(modelId) {
  const toolContext = getToolCallingContext(modelId);
  if (!toolContext.supported || !toolContext.config) {
    return '';
  }
  return buildToolCallingSystemPrompt(
    toolContext.config,
    toolContext.enabledTools,
    toolContext.enabledToolDefinitions
  );
}

function detectToolCallsForModel(rawText, modelId) {
  const toolCallingConfig = getToolCallingConfigForModel(modelId);
  if (!toolCallingConfig) {
    return [];
  }
  return sniffToolCalls(rawText, toolCallingConfig);
}

function clearPendingComposerAttachments({ resetInput = true } = {}) {
  appState.pendingComposerAttachments = [];
  if (resetInput && imageAttachmentInput instanceof HTMLInputElement) {
    imageAttachmentInput.value = '';
  }
  renderComposerAttachments();
}

function renderComposerAttachments() {
  if (!(composerAttachmentTray instanceof HTMLElement)) {
    return;
  }
  const attachments = getPendingComposerAttachments();
  composerAttachmentTray.replaceChildren();
  composerAttachmentTray.classList.toggle('d-none', attachments.length === 0);
  attachments.forEach((attachment, index) => {
    const item = document.createElement('article');
    item.className = 'composer-attachment-card';
    item.dataset.attachmentId = attachment.id;
    const image = document.createElement('img');
    image.className = 'composer-attachment-thumb';
    image.src = attachment.url;
    image.alt = attachment.alt;
    item.appendChild(image);

    const meta = document.createElement('div');
    meta.className = 'composer-attachment-meta';
    const name = document.createElement('p');
    name.className = 'composer-attachment-name';
    name.textContent = attachment.filename;
    meta.appendChild(name);
    const size = document.createElement('p');
    size.className = 'small text-body-secondary mb-0';
    size.textContent = formatAttachmentSize(attachment.size);
    meta.appendChild(size);
    item.appendChild(meta);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'btn btn-sm btn-light composer-attachment-remove';
    removeButton.setAttribute('aria-label', `Remove ${attachment.filename}`);
    removeButton.dataset.attachmentIndex = String(index);
    setIconButtonContent(removeButton, 'bi-x-lg', `Remove ${attachment.filename}`);
    item.appendChild(removeButton);
    composerAttachmentTray.appendChild(item);
  });
}

async function createComposerAttachmentFromFile(file) {
  const buffer = await file.arrayBuffer();
  const base64 = base64FromArrayBuffer(buffer);
  const mimeType = file.type || 'application/octet-stream';
  const url = `data:${mimeType};base64,${base64}`;
  const hashValue = await computeSha256Hex(buffer);
  const dimensions = await loadImageDimensions(url);
  const id = crypto.randomUUID();
  return {
    id,
    kind: 'binary',
    mimeType,
    encoding: 'base64',
    data: base64,
    url,
    filename: file.name || 'image',
    size: Number.isFinite(file.size) ? file.size : buffer.byteLength,
    width: dimensions.width,
    height: dimensions.height,
    alt: file.name ? `Selected image: ${file.name}` : 'Selected image',
    hash: {
      algorithm: 'sha256',
      value: hashValue,
    },
  };
}

function buildUserMessageAttachmentPayload(attachments) {
  const normalizedAttachments = Array.isArray(attachments) ? attachments : [];
  const contentParts = normalizedAttachments.map((attachment) => ({
    type: 'image',
    artifactId: attachment.id,
    mimeType: attachment.mimeType,
    base64: attachment.data,
    url: attachment.url,
    filename: attachment.filename,
    width: attachment.width,
    height: attachment.height,
    alt: attachment.alt,
  }));
  const artifactRefs = normalizedAttachments.map((attachment) => ({
    id: attachment.id,
    kind: 'binary',
    mimeType: attachment.mimeType,
    filename: attachment.filename,
    hash: attachment.hash,
  }));
  return { contentParts, artifactRefs };
}

function getMessageArtifacts(message, conversationId) {
  const refs = Array.isArray(message?.artifactRefs) ? message.artifactRefs : [];
  const imageParts = Array.isArray(message?.content?.parts)
    ? message.content.parts.filter((part) => part?.type === 'image')
    : [];
  return imageParts
    .map((part) => {
      const ref = refs.find((candidate) => candidate?.id === part.artifactId) || null;
      const artifactId =
        typeof part.artifactId === 'string' && part.artifactId.trim() ? part.artifactId.trim() : '';
      const data = typeof part.base64 === 'string' && part.base64.trim() ? part.base64.trim() : '';
      const mimeType =
        typeof part.mimeType === 'string' && part.mimeType.trim()
          ? part.mimeType.trim()
          : typeof ref?.mimeType === 'string'
            ? ref.mimeType
            : '';
      if (!artifactId || !data || !mimeType) {
        return null;
      }
      return {
        id: artifactId,
        conversationId,
        messageId: message.id,
        kind: 'binary',
        mimeType,
        encoding: 'base64',
        data,
        hash:
          ref?.hash && typeof ref.hash === 'object'
            ? {
                algorithm: ref.hash.algorithm,
                value: ref.hash.value,
              }
            : undefined,
        filename:
          typeof part.filename === 'string' && part.filename.trim()
            ? part.filename.trim()
            : typeof ref?.filename === 'string' && ref.filename.trim()
              ? ref.filename.trim()
              : null,
      };
    })
    .filter(Boolean);
}

async function persistConversationStateNow() {
  try {
    await saveConversationState(
      buildConversationStateSnapshot(appState, {
        getMessageArtifacts,
      })
    );
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

async function restoreConversationStateFromStorage() {
  try {
    const storedState = await loadConversationState();
    if (
      !applyStoredConversationState(storedState, appState, {
        untitledPrefix: UNTITLED_CONVERSATION_PREFIX,
      })
    ) {
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
    modelId: getAvailableModelId(
      modelSelect?.value || DEFAULT_MODEL,
      normalizeBackendPreference(backendSelect?.value || 'auto')
    ),
    untitledPrefix: UNTITLED_CONVERSATION_PREFIX,
    systemPrompt: appState.defaultSystemPrompt,
    startedAt: Date.now(),
  });
}

function getConversationModelId(conversation) {
  const loadedModelId = getLoadedModelId();
  return getAvailableModelId(
    conversation?.modelId || loadedModelId || modelSelect?.value || DEFAULT_MODEL,
    normalizeBackendPreference(backendSelect?.value || 'auto')
  );
}

function assignConversationModelId(conversation, modelId) {
  if (!conversation) {
    return { changed: false, modelId: getAvailableModelId(modelId || DEFAULT_MODEL) };
  }
  const nextModelId = getAvailableModelId(
    modelId || conversation.modelId || DEFAULT_MODEL,
    normalizeBackendPreference(backendSelect?.value || 'auto')
  );
  const changed = conversation.modelId !== nextModelId;
  conversation.modelId = nextModelId;
  return { changed, modelId: nextModelId };
}

function syncConversationModelSelection(
  conversation,
  { announceFallback = false, useDefaults = true } = {}
) {
  const selectedBackend = normalizeBackendPreference(backendSelect?.value || 'auto');
  const hasStoredModelId = Boolean(
    typeof conversation?.modelId === 'string' && conversation.modelId.trim()
  );
  const loadedModelId = getLoadedModelId();
  const requestedModelId = hasStoredModelId
    ? normalizeModelId(conversation.modelId)
    : normalizeModelId(loadedModelId || modelSelect?.value || DEFAULT_MODEL);

  populateModelSelect();

  const selectedModelId = getAvailableModelId(requestedModelId, selectedBackend);
  if (conversation) {
    conversation.modelId = selectedModelId;
  }
  if (modelSelect && modelSelect.value !== selectedModelId) {
    modelSelect.value = selectedModelId;
  }
  syncGenerationSettingsFromModel(selectedModelId, useDefaults);

  if (announceFallback && selectedModelId !== requestedModelId) {
    const requestedModel = MODEL_OPTIONS_BY_ID.get(requestedModelId);
    const availability = getModelAvailability(requestedModelId, {
      backendPreference: selectedBackend,
      webGpuAvailable: getWebGpuAvailability(),
    });
    if (requestedModel?.runtime?.requiresWebGpu) {
      setStatus(
        `${requestedModel.label} is unavailable with ${formatBackendPreferenceLabel(selectedBackend)}. ${availability.reason} Switched to ${selectedModelId}.`
      );
    }
  }

  return {
    selectedModelId,
    hadStoredModelId: hasStoredModelId,
  };
}

function getLoadedModelId() {
  if (typeof engine?.loadedModelId === 'string' && engine.loadedModelId.trim()) {
    return normalizeModelId(engine.loadedModelId.trim());
  }
  return null;
}

function activeConversationNeedsModelLoad(
  conversation = getActiveConversation(),
  { hadStoredModelId = false } = {}
) {
  if (!conversation || !hasConversationHistory(conversation)) {
    return false;
  }
  if (!hadStoredModelId) {
    return false;
  }
  const loadedModelId = getLoadedModelId();
  return !isEngineReady(appState) || loadedModelId !== getConversationModelId(conversation);
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
  bubble.classList.toggle(
    'has-variant-prev',
    Boolean(variantState?.hasVariants && variantState.canGoPrev)
  );
  bubble.classList.toggle(
    'has-variant-next',
    Boolean(variantState?.hasVariants && variantState.canGoNext)
  );
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
  getToolDisplayName,
  getShowThinkingByDefault: () => appState.showThinkingByDefault,
  getActiveUserEditMessageId: () => getActiveUserEditMessageId(appState),
  getControlsState: () => ({
    isGenerating: isGeneratingResponse(appState),
    isLoadingModel: isLoadingModelState(appState),
    isRunningOrchestration: isOrchestrationRunningState(appState),
    isSwitchingVariant: isVariantSwitchingState(appState),
  }),
  getEmptyStateVisible: () => isEngineReady(appState) && appState.conversations.length > 0,
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
  closeConversationMenus();
  disposeTooltips(conversationList);
  renderConversationListView({
    container: conversationList,
    conversations: appState.conversations,
    activeConversationId: appState.activeConversationId,
    getConversationMenuState,
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
  conversation.messageNodes = conversation.messageNodes.filter(
    (candidate) => candidate.id !== messageId
  );
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
  target.scrollIntoView({
    behavior: getPreferredScrollBehavior(),
    block: 'nearest',
    inline: 'nearest',
  });
  updateTranscriptNavigationButtonVisibility();
}

function isTranscriptNearBottom() {
  if (!chatMain) {
    return true;
  }
  const distanceToBottom = chatMain.scrollHeight - (chatMain.scrollTop + chatMain.clientHeight);
  return distanceToBottom <= TRANSCRIPT_BOTTOM_THRESHOLD_PX;
}

function isTranscriptNearTop() {
  if (!chatMain) {
    return true;
  }
  return chatMain.scrollTop <= TRANSCRIPT_BOTTOM_THRESHOLD_PX;
}

function getTranscriptMessageRows(role = null) {
  if (!chatTranscript) {
    return [];
  }
  return Array.from(chatTranscript.querySelectorAll('.message-row')).filter((item) => {
    if (!(item instanceof HTMLElement)) {
      return false;
    }
    if (role === 'user') {
      return item.classList.contains('user-message');
    }
    if (role === 'model') {
      return item.classList.contains('model-message');
    }
    return true;
  });
}

function findTranscriptStepTarget(role, direction) {
  if (!(chatMain instanceof HTMLElement)) {
    return null;
  }
  const rows = getTranscriptMessageRows(role);
  if (!rows.length) {
    return null;
  }
  const containerRect = chatMain.getBoundingClientRect();
  const referenceLine = containerRect.top + Math.max(getElementClearanceFromTop(topBar, containerRect), 16) + 24;
  if (direction < 0) {
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const rect = rows[index].getBoundingClientRect();
      if (rect.top < referenceLine - 4) {
        return rows[index];
      }
    }
    return rows[0];
  }
  for (let index = 0; index < rows.length; index += 1) {
    const rect = rows[index].getBoundingClientRect();
    if (rect.top > referenceLine + 4) {
      return rows[index];
    }
  }
  return rows[rows.length - 1];
}

function hasTranscriptStepTarget(role, direction) {
  if (!(chatMain instanceof HTMLElement)) {
    return false;
  }
  const rows = getTranscriptMessageRows(role);
  if (!rows.length) {
    return false;
  }
  const containerRect = chatMain.getBoundingClientRect();
  const referenceLine = containerRect.top + Math.max(getElementClearanceFromTop(topBar, containerRect), 16) + 24;
  if (direction < 0) {
    return rows.some((row) => row.getBoundingClientRect().top < referenceLine - 4);
  }
  return rows.some((row) => row.getBoundingClientRect().top > referenceLine + 4);
}

function getElementClearanceFromTop(element, containerRect) {
  if (!(element instanceof HTMLElement) || element.classList.contains('d-none')) {
    return 0;
  }
  const rect = element.getBoundingClientRect();
  return rect.bottom > containerRect.top ? Math.max(0, rect.bottom - containerRect.top) : 0;
}

function getElementClearanceFromBottom(element, containerRect) {
  if (!(element instanceof HTMLElement) || element.classList.contains('d-none')) {
    return 0;
  }
  const rect = element.getBoundingClientRect();
  return rect.top < containerRect.bottom ? Math.max(0, containerRect.bottom - rect.top) : 0;
}

function scrollElementIntoAccessibleView(element, { align = 'start' } = {}) {
  if (!(chatMain instanceof HTMLElement) || !(element instanceof HTMLElement)) {
    return;
  }
  const containerRect = chatMain.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  const topClearance =
    Math.max(
      getElementClearanceFromTop(topBar, containerRect),
      getElementClearanceFromTop(jumpToTopButton, containerRect)
    ) + 16;
  const bottomClearance =
    Math.max(
      getElementClearanceFromBottom(jumpToLatestButton, containerRect),
      getElementClearanceFromBottom(openSettingsButton, containerRect)
    ) + 16;
  let delta = 0;
  if (align === 'end') {
    delta = elementRect.bottom - (containerRect.bottom - bottomClearance);
  } else if (align === 'center') {
    const visibleHeight = Math.max(
      0,
      containerRect.height - topClearance - bottomClearance - elementRect.height
    );
    delta = elementRect.top - (containerRect.top + topClearance + Math.max(0, visibleHeight / 2));
  } else {
    delta = elementRect.top - (containerRect.top + topClearance);
  }
  chatMain.scrollBy({
    top: delta,
    behavior: reducedMotionQuery.matches ? 'auto' : 'smooth',
  });
}

function focusTranscriptBoundary(boundary, { align = 'start' } = {}) {
  if (!(boundary instanceof HTMLElement)) {
    return;
  }
  boundary.focus({ preventScroll: true });
  scrollElementIntoAccessibleView(boundary, { align });
}

function stepTranscriptNavigation(role, direction) {
  const target = findTranscriptStepTarget(role, direction);
  if (!(target instanceof HTMLElement)) {
    return;
  }
  scrollElementIntoAccessibleView(target, { align: 'start' });
}

function updateTranscriptNavigationButtonVisibility() {
  if (
    !(jumpToTopButton instanceof HTMLButtonElement) ||
    !(jumpToPreviousUserButton instanceof HTMLButtonElement) ||
    !(jumpToNextModelButton instanceof HTMLButtonElement) ||
    !(jumpToLatestButton instanceof HTMLButtonElement)
  ) {
    return;
  }
  const hasTranscriptItems = Boolean(chatTranscript?.children.length);
  const engineReady = isEngineReady(appState);
  jumpToTopButton.setAttribute(
    'aria-disabled',
    !engineReady || !hasTranscriptItems || isTranscriptNearTop() ? 'true' : 'false'
  );
  jumpToPreviousUserButton.setAttribute(
    'aria-disabled',
    !engineReady || !hasTranscriptItems || !hasTranscriptStepTarget('user', -1)
      ? 'true'
      : 'false'
  );
  jumpToNextModelButton.setAttribute(
    'aria-disabled',
    !engineReady || !hasTranscriptItems || !hasTranscriptStepTarget('model', 1)
      ? 'true'
      : 'false'
  );
  jumpToLatestButton.setAttribute(
    'aria-disabled',
    !engineReady || !hasTranscriptItems || isTranscriptNearBottom() ? 'true' : 'false'
  );
}

function renderTranscript(options = {}) {
  transcriptView.renderTranscript(options);
}

function isUiBusy() {
  return isEngineBusy(appState) || isOrchestrationRunningState(appState);
}

function buildActiveConversationExportPayload(activeConversation) {
  const selectedModelId = getConversationModelId(activeConversation);
  const temperature = Number.isFinite(engine?.config?.generationConfig?.temperature)
    ? Number(engine.config.generationConfig.temperature)
    : Number(
        appState.activeGenerationConfig?.temperature ?? DEFAULT_GENERATION_LIMITS.defaultTemperature
      );
  const toolContext = getToolCallingContext(selectedModelId);
  return buildConversationDownloadPayload(activeConversation, {
    modelId: selectedModelId,
    temperature,
    systemPromptSuffix: getToolCallingSystemPromptSuffix(selectedModelId),
    toolContext,
  });
}

function buildPromptForActiveConversation(
  conversation,
  leafMessageId = conversation?.activeLeafMessageId
) {
  return buildPromptForConversationLeaf(conversation, leafMessageId, {
    systemPromptSuffix: getToolCallingSystemPromptSuffix(getConversationModelId(conversation)),
  });
}

function downloadActiveConversationBranchAsJson() {
  const activeConversation = getActiveConversation();
  if (!activeConversation) {
    setStatus('No active conversation to download.');
    return;
  }
  const payload = buildActiveConversationExportPayload(activeConversation);
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
  const payload = buildActiveConversationExportPayload(activeConversation);
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

function updatePreChatActionButtons() {
  const activeConversation = getActiveConversation();
  const hasExistingConversation = hasConversationHistory(activeConversation);
  const canShowPreChatActions =
    selectHasStartedWorkspace(appState) &&
    !isEngineReady(appState) &&
    !isSettingsView(appState) &&
    Boolean(activeConversation);
  const isBusy = isUiBusy();

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
    selectHasStartedWorkspace(appState) &&
    !isSettingsView(appState) &&
    (!isEngineReady(appState) || Boolean(getActiveConversation()));
  setRegionVisibility(chatForm, showComposer);
  if (chatForm instanceof HTMLElement) {
    chatForm.classList.remove('is-prechat');
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
  let nextTitle = '';
  if (isEngineReady(appState) && !activeConversation && appState.conversations.length) {
    nextTitle = 'Select a Conversation';
    chatTitle.textContent = nextTitle;
    chatTitle.classList.toggle('d-none', !nextTitle);
    updateComposerVisibility();
    updateChatTitleEditorVisibility();
    return;
  }
  if (activeConversation?.hasGeneratedName) {
    nextTitle = activeConversation.name;
    chatTitle.textContent = nextTitle;
    chatTitle.classList.toggle('d-none', !nextTitle);
    if (!isChatTitleEditingState(appState) && chatTitleInput) {
      chatTitleInput.value = activeConversation.name;
    }
    updateComposerVisibility();
    updateChatTitleEditorVisibility();
    return;
  }
  nextTitle = isEngineReady(appState) ? 'Start Your Chat Now' : '';
  chatTitle.textContent = nextTitle;
  chatTitle.classList.toggle('d-none', !nextTitle);
  if (!isChatTitleEditingState(appState) && chatTitleInput && activeConversation) {
    chatTitleInput.value = activeConversation.name;
  }
  updateComposerVisibility();
  updateChatTitleEditorVisibility();
}

function setActiveConversationById(conversationId) {
  if (appState.activeConversationId === conversationId) {
    return;
  }
  if (isChatTitleEditingState(appState)) {
    setChatTitleEditing(appState, false);
  }
  appState.activeConversationId = conversationId;
  const activeConversation = getActiveConversation();
  if (
    activeConversation?.lastSpokenLeafMessageId &&
    getMessageNodeById(activeConversation, activeConversation.lastSpokenLeafMessageId)
  ) {
    activeConversation.activeLeafMessageId = activeConversation.lastSpokenLeafMessageId;
  }
  let shouldLoadConversationModel = false;
  if (activeConversation) {
    const selection = syncConversationModelSelection(activeConversation, { useDefaults: true });
    shouldLoadConversationModel = activeConversationNeedsModelLoad(activeConversation, selection);
  }
  clearUserMessageEditSession();
  clearPendingComposerAttachments();
  renderConversationList();
  renderTranscript();
  updateChatTitle();
  queueConversationStateSave();
  if (shouldLoadConversationModel) {
    void appController.loadModelForSelectedConversation();
  }
}

function updateActionButtons() {
  updateSendButtonMode();
  updateGenerationSettingsEnabledState();
  updateChatTitleEditorVisibility();
  updatePreChatActionButtons();
  const disableComposerForPreChatSelection = shouldDisableComposerForPreChatConversationSelection();
  const composerControlsDisabled =
    isLoadingModelState(appState) ||
    isOrchestrationRunningState(appState) ||
    isMessageEditActive(appState) ||
    disableComposerForPreChatSelection;
  const imageInputSupported = selectedModelSupportsImageInput();
  if (messageInput instanceof HTMLTextAreaElement) {
    messageInput.disabled = disableComposerForPreChatSelection;
  }
  if (addImagesButton instanceof HTMLButtonElement) {
    addImagesButton.classList.toggle('d-none', !imageInputSupported);
    addImagesButton.disabled =
      !imageInputSupported || composerControlsDisabled || isGeneratingResponse(appState);
  }
  if (imageAttachmentInput instanceof HTMLInputElement) {
    imageAttachmentInput.disabled =
      !imageInputSupported || composerControlsDisabled || isGeneratingResponse(appState);
  }
  if (!imageInputSupported && getPendingComposerAttachments().length) {
    clearPendingComposerAttachments();
  }
  if (sendButton) {
    sendButton.disabled =
      composerControlsDisabled ||
      (!isGeneratingResponse(appState) && !selectHasStartedWorkspace(appState)) ||
      false;
  }
  if (newConversationBtn) {
    newConversationBtn.classList.toggle('d-none', !shouldShowNewConversationButton());
    newConversationBtn.disabled =
      isGeneratingResponse(appState) ||
      isOrchestrationRunningState(appState) ||
      !selectHasStartedWorkspace(appState);
  }
  updateRegenerateButtons();
  updateUserMessageButtons();
}

function updateRegenerateButtons() {
  if (!chatTranscript) {
    return;
  }
  const disabled =
    isLoadingModelState(appState) ||
    isGeneratingResponse(appState) ||
    isOrchestrationRunningState(appState) ||
    isVariantSwitchingState(appState) ||
    !isEngineReady(appState) ||
    isMessageEditActive(appState);
  chatTranscript.querySelectorAll('.message-row.model-message').forEach((item) => {
    if (!(item instanceof HTMLElement)) {
      return;
    }
    const messageId = item.dataset.messageId;
    const activeConversation = getActiveConversation();
    const modelMessage = activeConversation?.messageNodes.find(
      (message) => message.id === messageId && message.role === 'model'
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
      (message) => message.id === messageId && message.role === 'user'
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
  const pendingItem = chatTranscript?.querySelector(
    `[data-message-id="${pendingModelMessage.id}"]`
  );
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
  if (isGeneratingResponse(appState)) {
    sendButton.type = 'button';
    sendButton.classList.remove('btn-primary');
    sendButton.classList.add('btn-outline-secondary');
    sendButton.setAttribute('aria-label', 'Stop generating');
    sendButton.setAttribute('aria-keyshortcuts', 'Alt+.');
    sendButton.setAttribute('data-bs-title', 'Stop generating (Alt+.)');
    setIconButtonContent(sendButton, 'bi-sign-stop', 'Stop generating');
    initializeTooltips(document);
    return;
  }
  sendButton.type = 'submit';
  sendButton.classList.remove('btn-outline-secondary');
  sendButton.classList.add('btn-primary');
  sendButton.setAttribute('aria-label', 'Send message');
  sendButton.setAttribute('aria-keyshortcuts', 'Enter');
  sendButton.setAttribute('data-bs-title', 'Send message (Enter)');
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
  const entries = [...appState.loadProgressFiles.values()].sort(
    (a, b) => b.updatedAt - a.updatedAt
  );
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
    loadedBytes: previous
      ? Math.max(previous.loadedBytes || 0, numericLoadedBytes)
      : numericLoadedBytes,
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

function getThinkingTagsForModel(modelId) {
  return MODEL_OPTIONS_BY_ID.get(normalizeModelId(modelId))?.thinkingTags || null;
}

function getRuntimeConfigForModel(modelId) {
  const normalizedModelId = normalizeModelId(modelId);
  const model = MODEL_OPTIONS_BY_ID.get(normalizedModelId);
  const runtime = model?.runtime || {};
  const features = model?.features || {};
  const multimodalGeneration = runtime.multimodalGeneration === true;
  return {
    ...runtime,
    ...(multimodalGeneration && features.imageInput ? { imageInput: true } : {}),
    ...(multimodalGeneration && features.audioInput ? { audioInput: true } : {}),
    ...(multimodalGeneration && features.videoInput ? { videoInput: true } : {}),
  };
}

const {
  updateChatTitleEditorVisibility,
  beginConversationSystemPromptEdit,
  saveConversationSystemPromptEdit,
  beginChatTitleEdit,
  cancelChatTitleEdit,
  saveChatTitleEdit,
} = createConversationEditors({
  appState,
  conversationSystemPromptModal,
  conversationSystemPromptInput,
  conversationSystemPromptAppendToggle,
  chatTitle,
  chatTitleInput,
  saveChatTitleBtn,
  cancelChatTitleBtn,
  getActiveConversation,
  getConversationMenuState,
  isUiBusy,
  isChatTitleEditingState,
  setChatTitleEditing,
  normalizeSystemPrompt,
  normalizeConversationPromptMode,
  queueConversationStateSave,
  setStatus,
  renderConversationList,
  updateChatTitle,
  normalizeConversationName,
  createConversationSystemPromptModalInstance: (element) => Modal.getOrCreateInstance(element),
});

const routingShell = createRoutingShell({
  appState,
  routeHome: ROUTE_HOME,
  routeChat: ROUTE_CHAT,
  routeSettings: ROUTE_SETTINGS,
  windowRef: window,
  selectCurrentViewRoute,
  setRegionVisibility,
  settingsPage,
  homePanel,
  preChatPanel,
  topBar,
  conversationPanel,
  chatTranscriptWrap,
  chatForm,
  chatMain,
  openSettingsButton,
  settingsTabButtons,
  settingsTabPanels,
  updateComposerVisibility,
  updateChatTitleEditorVisibility,
  updateTranscriptNavigationButtonVisibility,
  updateActionButtons,
  updatePreChatStatusHint,
  updatePreChatActionButtons,
  playEntranceAnimation,
});

const {
  applyRouteFromHash,
  setActiveSettingsTab,
  setSettingsPageVisibility,
  updateWelcomePanelVisibility,
} = routingShell;

const preferencesController = createPreferencesController({
  appState,
  storage: localStorage,
  navigatorRef: navigator,
  documentRef: document,
  themeStorageKey: THEME_STORAGE_KEY,
  showThinkingStorageKey: SHOW_THINKING_STORAGE_KEY,
  enableToolCallingStorageKey: ENABLE_TOOL_CALLING_STORAGE_KEY,
  singleKeyShortcutsStorageKey: SINGLE_KEY_SHORTCUTS_STORAGE_KEY,
  transcriptViewStorageKey: TRANSCRIPT_VIEW_STORAGE_KEY,
  defaultSystemPromptStorageKey: DEFAULT_SYSTEM_PROMPT_STORAGE_KEY,
  modelStorageKey: MODEL_STORAGE_KEY,
  backendStorageKey: BACKEND_STORAGE_KEY,
  supportedBackendPreferences: SUPPORTED_BACKEND_PREFERENCES,
  webGpuRequiredModelSuffix: WEBGPU_REQUIRED_MODEL_SUFFIX,
  themeSelect,
  showThinkingToggle,
  enableToolCallingToggle,
  enableSingleKeyShortcutsToggle,
  transcriptViewSelect,
  defaultSystemPromptInput,
  modelSelect,
  backendSelect,
  colorSchemeQuery,
  refreshModelThinkingVisibility,
  getRuntimeConfigForModel,
  syncGenerationSettingsFromModel,
  persistGenerationConfigForModel,
  setStatus,
  appendDebug,
});

const {
  applyDefaultSystemPrompt,
  applyShowThinkingPreference,
  applyTheme,
  applyToolCallingPreference,
  applyTranscriptViewPreference,
  applySingleKeyShortcutPreference,
  formatBackendPreferenceLabel,
  getAvailableModelId,
  getStoredDefaultSystemPrompt,
  getStoredShowThinkingPreference,
  getStoredSingleKeyShortcutPreference,
  getStoredThemePreference,
  getStoredToolCallingPreference,
  getStoredTranscriptViewPreference,
  getWebGpuAvailability,
  normalizeBackendPreference,
  persistInferencePreferences,
  populateModelSelect,
  probeWebGpuAvailability,
  readEngineConfigFromUI,
  restoreInferencePreferences,
  syncModelSelectionForCurrentEnvironment,
} = preferencesController;

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
  readEngineConfig: () => readEngineConfigFromUI(appState.activeGenerationConfig),
  persistInferencePreferences: () => persistInferencePreferences(appState.activeGenerationConfig),
  getActiveConversation,
  findConversationById,
  hasSelectedConversationWithHistory,
  normalizeModelId,
  getLoadedModelId,
  getThinkingTagsForModel,
  detectToolCalls: detectToolCallsForModel,
  executeToolCall,
  getSelectedModelId: () => modelSelect?.value || DEFAULT_MODEL,
  addMessageToConversation,
  buildPromptForConversationLeaf: buildPromptForActiveConversation,
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

const { handleFocusedMessageShortcut, handleGlobalShortcut } = createShortcutHandlers({
  appState,
  documentRef: document,
  keyboardShortcutsModal,
  shortcutKeys: SHORTCUT_KEY,
  isAnyModalOpen,
  openKeyboardShortcuts,
  closeKeyboardShortcuts,
  messageInput,
  sendButton,
  isSettingsView,
  setSettingsPageVisibility,
  openSettingsButton,
  hasStartedWorkspace: selectHasStartedWorkspace,
  startConversationButton,
  newConversationBtn,
  preChatLoadModelBtn,
  jumpToPreviousUserButton,
  jumpToLatestButton,
  downloadActiveConversationBranchAsJson,
  downloadActiveConversationBranchAsMarkdown,
  getActiveConversation,
  beginConversationSystemPromptEdit,
  preChatEditConversationSystemPromptBtn,
  beginChatTitleEdit,
  isGeneratingResponse,
  getMessageNodeById,
  switchModelVariant,
  switchUserVariant,
  regenerateFromMessage: (messageId) => appController.regenerateFromMessage(messageId),
  fixResponseFromMessage: (messageId) => appController.fixResponseFromMessage(messageId),
  handleMessageCopyAction,
  beginUserMessageEdit,
  branchFromUserMessage,
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
          chatMain.clientHeight
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
    setSwitchingVariant(appState, false);
    updateActionButtons();
    queueConversationStateSave();
  }, 170);
}

function switchModelVariant(messageId, direction) {
  if (
    !messageId ||
    isEngineBusy(appState) ||
    isOrchestrationRunningState(appState) ||
    isVariantSwitchingState(appState) ||
    isMessageEditActive(appState)
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
  setSwitchingVariant(appState, true);
  activeConversation.activeLeafMessageId = targetLeafId || targetMessage.id;
  updateActionButtons();
  animateVariantSwitch(modelMessage.id, targetMessage.id, direction, {
    ensureModelControlsVisible: true,
  });
}

function switchUserVariant(messageId, direction) {
  if (
    !messageId ||
    isEngineBusy(appState) ||
    isOrchestrationRunningState(appState) ||
    isVariantSwitchingState(appState) ||
    isMessageEditActive(appState)
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
  setSwitchingVariant(appState, true);
  activeConversation.activeLeafMessageId = targetLeafId || targetMessage.id;
  updateActionButtons();
  animateVariantSwitch(userMessage.id, targetMessage.id, direction);
}

function beginUserMessageEdit(messageId) {
  if (
    !messageId ||
    isEngineBusy(appState) ||
    isOrchestrationRunningState(appState) ||
    isVariantSwitchingState(appState)
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
  activeConversation.activeLeafMessageId =
    findPreferredLeafForVariant(activeConversation, userMessage) || userMessage.id;
  startUserMessageEditSession(messageId);
  renderTranscript({ scrollToBottom: false });
  updateActionButtons();
  const editor = chatTranscript?.querySelector(
    `[data-message-id="${messageId}"] .user-message-editor`
  );
  if (editor instanceof HTMLTextAreaElement) {
    editor.focus();
    editor.setSelectionRange(editor.value.length, editor.value.length);
  }
}

function cancelUserMessageEdit(messageId) {
  if (
    !isMessageEditActive(appState) ||
    (messageId && getActiveUserEditMessageId(appState) !== messageId)
  ) {
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
    isEngineBusy(appState) ||
    isOrchestrationRunningState(appState) ||
    isVariantSwitchingState(appState) ||
    getActiveUserEditMessageId(appState) !== messageId
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
  const editor = chatTranscript?.querySelector(
    `[data-message-id="${messageId}"] .user-message-editor`
  );
  if (!(editor instanceof HTMLTextAreaElement)) {
    return;
  }
  const nextText = editor.value.trim();
  const hasAttachments = Array.isArray(userMessage.content?.parts)
    ? userMessage.content.parts.some((part) => part?.type === 'image')
    : false;
  if (!nextText && !hasAttachments) {
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
      contentParts: normalizeMessageContentParts(
        userMessage.content?.parts,
        userMessage.text || ''
      ),
      artifactRefs: Array.isArray(userMessage.artifactRefs) ? userMessage.artifactRefs : [],
    });
    setUserMessageText(branchMessage, nextText);
    activeConversation.activeLeafMessageId = branchMessage.id;
    activeConversation.lastSpokenLeafMessageId = branchMessage.id;
    clearUserMessageEditSession();
    renderTranscript();
    updateActionButtons();
    queueConversationStateSave();
    if (!isEngineReady(appState)) {
      setStatus('Branch saved. Send a message to load the model and generate a new response.');
      return;
    }
    setStatus('Branch saved. Generating response...');
    appController.startModelGeneration(
      activeConversation,
      buildPromptForActiveConversation(activeConversation),
      {
        parentMessageId: branchMessage.id,
        updateLastSpokenOnComplete: true,
      }
    );
    return;
  }
  setUserMessageText(userMessage, nextText);
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
  if (!isEngineReady(appState)) {
    setStatus(`${saveStatus} Send a message to load the model and generate a new response.`);
    return;
  }
  setStatus(`${saveStatus} Generating updated response...`);
  appController.startModelGeneration(
    activeConversation,
    buildPromptForActiveConversation(activeConversation),
    {
      parentMessageId: userMessage.id,
      updateLastSpokenOnComplete: true,
    }
  );
}

function branchFromUserMessage(messageId) {
  if (
    !messageId ||
    isEngineBusy(appState) ||
    isOrchestrationRunningState(appState) ||
    isVariantSwitchingState(appState) ||
    isMessageEditActive(appState)
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
  activeConversation.activeLeafMessageId =
    findPreferredLeafForVariant(activeConversation, userMessage) || userMessage.id;
  startUserMessageEditSession(messageId, { branchSourceMessageId: messageId });
  renderTranscript({ scrollToBottom: false });
  updateActionButtons();
  const editor = chatTranscript?.querySelector(
    `[data-message-id="${messageId}"] .user-message-editor`
  );
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
applyToolCallingPreference(getStoredToolCallingPreference());
applySingleKeyShortcutPreference(getStoredSingleKeyShortcutPreference());
applyTranscriptViewPreference(getStoredTranscriptViewPreference());
applyDefaultSystemPrompt(getStoredDefaultSystemPrompt());
populateModelSelect();
restoreInferencePreferences();
void probeWebGpuAvailability();
showProgressRegion(false);
renderComposerAttachments();
updateActionButtons();
setActiveSettingsTab(appState.activeSettingsTab);
updateWelcomePanelVisibility();
applyRouteFromHash();
void restoreConversationStateFromStorage();

bindSettingsEvents({
  appState,
  documentRef: document,
  themeStorageKey: THEME_STORAGE_KEY,
  storage: localStorage,
  settingsTabContainer,
  settingsTabButtons,
  openSettingsButton,
  closeSettingsButton,
  themeSelect,
  showThinkingToggle,
  enableToolCallingToggle,
  enableSingleKeyShortcutsToggle,
  transcriptViewSelect,
  defaultSystemPromptInput,
  modelSelect,
  backendSelect,
  maxOutputTokensInput,
  maxContextTokensInput,
  temperatureInput,
  resetContextTokensButton,
  resetTemperatureButton,
  topKInput,
  topPInput,
  resetTopKButton,
  resetTopPButton,
  colorSchemeQuery,
  setActiveSettingsTab,
  setSettingsPageVisibility,
  getStoredThemePreference,
  applyTheme,
  applyShowThinkingPreference,
  applyToolCallingPreference,
  applySingleKeyShortcutPreference,
  applyTranscriptViewPreference,
  applyDefaultSystemPrompt,
  syncModelSelectionForCurrentEnvironment,
  syncGenerationSettingsFromModel,
  getActiveConversation,
  assignConversationModelId,
  queueConversationStateSave,
  reinitializeEngineFromSettings: () => appController.reinitializeEngineFromSettings(),
  onGenerationSettingInputChanged,
  getModelGenerationLimits,
  normalizeModelId,
  defaultModelId: DEFAULT_MODEL,
  setStatus,
  isAnyModalOpen,
});

bindConversationListEvents({
  appState,
  documentRef: document,
  conversationList,
  isGeneratingResponse,
  clearUserMessageEditSession,
  setChatTitleEditing,
  getActiveConversation,
  syncConversationModelSelection,
  activeConversationNeedsModelLoad,
  loadModelForSelectedConversation: () => appController.loadModelForSelectedConversation(),
  renderConversationList,
  renderTranscript,
  updateChatTitle,
  queueConversationStateSave,
  openConversationMenu,
  toggleConversationDownloadMenu,
  closeConversationMenus,
  runConversationMenuAction,
  beginChatTitleEdit,
  beginConversationSystemPromptEdit,
  downloadActiveConversationBranchAsJson,
  downloadActiveConversationBranchAsMarkdown,
  setActiveConversationById,
});

bindComposerEvents({
  appState,
  chatForm,
  messageInput,
  sendButton,
  addImagesButton,
  imageAttachmentInput,
  composerAttachmentTray,
  isGeneratingResponse,
  isOrchestrationRunningState,
  isMessageEditActive,
  isEngineReady,
  hasStartedWorkspace: selectHasStartedWorkspace,
  setChatWorkspaceStarted,
  updateWelcomePanelVisibility,
  getPendingComposerAttachments,
  selectedModelSupportsImageInput,
  createComposerAttachmentFromFile,
  renderComposerAttachments,
  setStatus,
  clearPendingComposerAttachments,
  createConversation,
  clearUserMessageEditSession,
  setChatTitleEditing,
  renderConversationList,
  renderTranscript,
  updateChatTitle,
  queueConversationStateSave,
  getActiveConversation,
  syncConversationModelSelection,
  getLoadedModelId,
  persistInferencePreferences,
  initializeEngine: () => appController.initializeEngine(),
  appendDebug,
  buildUserMessageAttachmentPayload,
  addMessageToConversation,
  addMessageElement,
  buildPromptForActiveConversation,
  startModelGeneration: (conversation, prompt, options) =>
    appController.startModelGeneration(conversation, prompt, options),
  stopGeneration: () => appController.stopGeneration(),
});

bindTranscriptEvents({
  chatTranscript,
  chatMain,
  jumpToTopButton,
  jumpToPreviousUserButton,
  jumpToNextModelButton,
  jumpToLatestButton,
  chatTranscriptStart,
  chatTranscriptEnd,
  messageInput,
  switchModelVariant,
  regenerateFromMessage: (messageId) => appController.regenerateFromMessage(messageId),
  fixResponseFromMessage: (messageId) => appController.fixResponseFromMessage(messageId),
  switchUserVariant,
  beginUserMessageEdit,
  saveUserMessageEdit,
  cancelUserMessageEdit,
  branchFromUserMessage,
  handleMessageCopyAction,
  updateTranscriptNavigationButtonVisibility,
  focusTranscriptBoundary,
  stepTranscriptNavigation,
});

bindShellEvents({
  appState,
  documentRef: document,
  windowRef: window,
  keyboardShortcutsModal,
  conversationSystemPromptModal,
  openKeyboardShortcutsButton,
  startConversationButton,
  messageInput,
  newConversationBtn,
  isGeneratingResponse,
  setChatWorkspaceStarted,
  updateWelcomePanelVisibility,
  createConversation,
  clearUserMessageEditSession,
  setChatTitleEditing,
  renderConversationList,
  renderTranscript,
  updateChatTitle,
  queueConversationStateSave,
  openKeyboardShortcuts,
  closeKeyboardShortcuts,
  handleGlobalShortcut,
  handleFocusedMessageShortcut,
  applyRouteFromHash,
  persistConversationStateNow,
  disposeEngine: () => engine.dispose(),
  preChatEditConversationSystemPromptBtn,
  beginConversationSystemPromptEdit,
  preChatLoadModelBtn,
  loadModelForSelectedConversation: () => appController.loadModelForSelectedConversation(),
  saveChatTitleBtn,
  saveChatTitleEdit,
  cancelChatTitleBtn,
  cancelChatTitleEdit,
  conversationSystemPromptInput,
  saveConversationSystemPromptBtn,
  saveConversationSystemPromptEdit,
  chatTitleInput,
  updateChatTitleEditorVisibility,
});
