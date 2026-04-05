import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import 'bootstrap/js/dist/collapse';
import 'bootstrap/js/dist/dropdown';
import 'bootstrap/js/dist/offcanvas';
import Modal from 'bootstrap/js/dist/modal';
import Tooltip from 'bootstrap/js/dist/tooltip';
import { bindComposerEvents } from './app/composer-events.js';
import { createComposerRuntimeController } from './app/composer-runtime.js';
import {
  formatAttachmentSize,
  getAttachmentButtonAcceptValue,
  getAttachmentIconClass,
} from './attachments/attachment-ui.js';
import { createConversationEditors } from './app/conversation-editors.js';
import { createModelLoadFeedbackController } from './app/model-load-feedback.js';
import './styles.css';
import { bindConversationListEvents } from './app/conversation-list-events.js';
import { createPreferencesController } from './app/preferences.js';
import { createRoutingShell } from './app/routing-shell.js';
import { bindShellEvents } from './app/shell-events.js';
import { bindSettingsEvents } from './app/settings-events.js';
import { createShortcutHandlers } from './app/shortcut-events.js';
import { createTranscriptNavigationController } from './app/transcript-navigation.js';
import { createTranscriptActions } from './app/transcript-actions.js';
import { bindTranscriptEvents } from './app/transcript-events.js';
import { createWorkspaceSidePanelsController } from './app/workspace-side-panels.js';
import { LLMEngineClient } from './llm/engine-client.js';
import { createCorsAwareFetch, validateCorsProxyUrl } from './llm/browser-fetch.js';
import { createOrchestrationRunner } from './llm/orchestration-runner.js';
import { getEnabledMcpServerConfigs, inspectMcpServerEndpoint } from './llm/mcp-client.js';
import {
  buildFactCheckingPrompt,
  buildLanguagePreferencePrompt,
  buildMathRenderingFeaturePrompt,
  buildOptionalFeaturePromptSection,
  buildThinkingModePrompt,
} from './llm/system-prompt.js';
import {
  buildToolCallingSystemPrompt,
  executeToolCall,
  getEnabledToolDefinitions,
  getEnabledToolNames,
  getImplicitlyEnabledToolNames,
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
  deriveConversationMenuCapabilities,
  deriveConversationName,
  findPreferredLeafForVariant,
  getConversationCardHeading,
  getEffectiveConversationSystemPrompt,
  getConversationPathMessages,
  getTaskListForConversationLeaf,
  getMessageNodeById,
  getModelVariantState,
  getUserVariantState,
  normalizeConversationLanguagePreference,
  normalizeConversationName,
  normalizeMessageContentParts,
  normalizeConversationPromptMode,
  normalizeConversationThinkingEnabled,
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
  beginAttachmentOperation,
  clearTerminalDismissal,
  clearUserMessageEditState,
  closeTerminal,
  createAppState,
  endAttachmentOperation,
  findConversationById as selectConversationById,
  getActiveConversation as selectActiveConversation,
  getActiveUserEditMessageId,
  getCurrentViewRoute as selectCurrentViewRoute,
  hasDismissedTerminalForConversation,
  hasConversationHistory as selectHasConversationHistory,
  hasSelectedConversationWithHistory as selectHasSelectedConversationWithHistory,
  hasStartedWorkspace as selectHasStartedWorkspace,
  isChatTitleEditingState,
  isEngineBusy,
  isEngineReady,
  isGeneratingResponse,
  isProcessingAttachments,
  isTerminalOpenForConversation,
  isMessageEditActive,
  isOrchestrationRunningState,
  isSettingsView,
  isVariantSwitchingState,
  isLoadingModelState,
  openTerminalForConversation,
  setPreparingNewConversation,
  setChatTitleEditing,
  setChatWorkspaceStarted,
  setSwitchingVariant,
  setUserMessageEditState,
  shouldShowNewConversationButton as selectShouldShowNewConversationButton,
  shouldDisableConversationControls,
  shouldDisableComposerForPreChatConversationSelection as selectShouldDisableComposerForPreChatConversationSelection,
} from './state/app-state.js';
import { loadConversationState, saveConversationState } from './state/conversation-store.js';
import { renderConversationListView } from './ui/conversation-list-view.js';
import { loadMarkdownRenderer, renderPlainTextMarkdownFallback } from './ui/markdown-renderer.js';
import { createTranscriptView } from './ui/transcript-view.js';
import { renderTaskListTray } from './ui/task-list-tray.js';
import {
  createConversationWorkspaceFileSystem,
  createWorkspaceFileSystem,
} from './workspace/workspace-file-system.js';

const THEME_STORAGE_KEY = 'ui-theme-preference';
const SHOW_THINKING_STORAGE_KEY = 'ui-show-thinking';
const ENABLE_TOOL_CALLING_STORAGE_KEY = 'conversation-enable-tool-calling';
const ENABLED_TOOLS_STORAGE_KEY = 'conversation-enabled-tools';
const RENDER_MATHML_STORAGE_KEY = 'conversation-render-mathml';
const SINGLE_KEY_SHORTCUTS_STORAGE_KEY = 'ui-enable-single-key-shortcuts';
const TRANSCRIPT_VIEW_STORAGE_KEY = 'ui-transcript-view';
const CONVERSATION_PANEL_COLLAPSED_STORAGE_KEY = 'ui-conversation-panel-collapsed';
const DEFAULT_SYSTEM_PROMPT_STORAGE_KEY = 'conversation-default-system-prompt';
const CORS_PROXY_STORAGE_KEY = 'cors-proxy-url';
const MCP_SERVERS_STORAGE_KEY = 'mcp-server-configurations';
const MODEL_STORAGE_KEY = 'llm-model-preference';
const BACKEND_STORAGE_KEY = 'llm-backend-preference';
const MODEL_GENERATION_SETTINGS_STORAGE_KEY = 'llm-model-generation-settings';
const TOOL_CONSENT_STORAGE_KEY = 'tool-consents-v1';
const UNTITLED_CONVERSATION_PREFIX = 'New Conversation';
const SUPPORTED_BACKEND_PREFERENCES = new Set(['auto', 'webgpu', 'wasm', 'cpu']);
const WEBGPU_REQUIRED_MODEL_SUFFIX = ' (WebGPU required)';
const FIX_RESPONSE_ORCHESTRATION = fixResponseOrchestration;
const RENAME_CHAT_ORCHESTRATION = renameChatOrchestration;
const CONVERSATION_SAVE_DEBOUNCE_MS = 300;
const STREAM_UPDATE_INTERVAL_MS = 100;
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
const toolSettingsList = document.getElementById('toolSettingsList');
const corsProxyForm = document.getElementById('corsProxyForm');
const corsProxyInput = document.getElementById('corsProxyInput');
const saveCorsProxyButton = document.getElementById('saveCorsProxyButton');
const clearCorsProxyButton = document.getElementById('clearCorsProxyButton');
const corsProxyFeedback = document.getElementById('corsProxyFeedback');
const mcpServerEndpointForm = document.getElementById('mcpServerEndpointForm');
const mcpServerEndpointInput = document.getElementById('mcpServerEndpointInput');
const addMcpServerButton = document.getElementById('addMcpServerButton');
const mcpServerAddFeedback = document.getElementById('mcpServerAddFeedback');
const mcpServersList = document.getElementById('mcpServersList');
const renderMathMlToggle = document.getElementById('renderMathMlToggle');
const defaultSystemPromptInput = document.getElementById('defaultSystemPromptInput');
const conversationLanguageSelect = document.getElementById('conversationLanguageSelect');
const conversationLanguageHelp = document.getElementById('conversationLanguageHelp');
const enableModelThinkingToggle = document.getElementById('enableModelThinkingToggle');
const enableModelThinkingHelp = document.getElementById('enableModelThinkingHelp');
const modelSelect = document.getElementById('modelSelect');
const modelCardList = document.getElementById('modelCardList');
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
const skipLinkElements = Array.from(document.querySelectorAll('.skip-link[data-skip-target]'));
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
const attachReferenceMenuItem = document.getElementById('attachReferenceMenuItem');
const attachWorkWithMenuItem = document.getElementById('attachWorkWithMenuItem');
const messageInput = document.getElementById('messageInput');
const chatTranscript = document.getElementById('chatTranscript');
const chatTranscriptWrap = document.getElementById('chatTranscriptWrap');
const chatTranscriptStart = document.getElementById('chatTranscriptStart');
const chatTranscriptEnd = document.getElementById('chatTranscriptEnd');
const taskListTray = document.getElementById('taskListTray');
const jumpToTopButton = document.getElementById('jumpToTopButton');
const jumpToPreviousUserButton = document.getElementById('jumpToPreviousUserButton');
const jumpToNextModelButton = document.getElementById('jumpToNextModelButton');
const jumpToLatestButton = document.getElementById('jumpToLatestButton');
const chatMain = document.querySelector('.chat-main');
let isTaskListTrayExpanded = false;
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
const conversationPanelCollapseButton = document.getElementById('conversationPanelCollapseButton');
const conversationPanelCollapseButtonText = document.getElementById(
  'conversationPanelCollapseButtonText'
);
const conversationSystemPromptModal = document.getElementById('conversationSystemPromptModal');
const conversationSystemPromptInput = document.getElementById('conversationSystemPromptInput');
const conversationSystemPromptAppendToggle = document.getElementById(
  'conversationSystemPromptAppendToggle'
);
const conversationSystemPromptComputedPreview = document.getElementById(
  'conversationSystemPromptComputedPreview'
);
const saveConversationSystemPromptBtn = document.getElementById('saveConversationSystemPromptBtn');
const openSettingsButton = document.getElementById('openSettingsButton');
const closeSettingsButton = document.getElementById('closeSettingsButton');
const enableSingleKeyShortcutsToggle = document.getElementById('enableSingleKeyShortcutsToggle');
const transcriptViewSelect = document.getElementById('transcriptViewSelect');
const settingsPage = document.getElementById('settingsPage');
const terminalPanel = document.getElementById('terminalPanel');
const terminalHost = document.getElementById('terminalHost');
const closeTerminalButton = document.getElementById('closeTerminalButton');
const webLookupPanel = document.getElementById('webLookupPanel');
const webLookupFrame = document.getElementById('webLookupFrame');
const webLookupPanelTitle = document.getElementById('webLookupPanelTitle');
const webLookupPanelDescription = document.getElementById('webLookupPanelDescription');
const closeWebLookupPanelButton = document.getElementById('closeWebLookupPanelButton');
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
let pythonRuntime = null;
let pythonRuntimeLoadPromise = null;
let composerAttachmentModulePromise = null;
let markdownRenderer = null;
let markdownRendererLoadPromise = null;
let hasQueuedMarkdownRendererRefresh = false;
let hasLoggedMarkdownRendererError = false;
const workspaceFileSystem = createWorkspaceFileSystem();
const conversationWorkspaceFileSystems = new Map();

async function getPythonRuntime() {
  if (pythonRuntime) {
    return pythonRuntime;
  }
  if (!pythonRuntimeLoadPromise) {
    pythonRuntimeLoadPromise = import('./llm/python-runtime-client.js')
      .then(({ PythonRuntimeClient }) => {
        pythonRuntime = new PythonRuntimeClient();
        return pythonRuntime;
      })
      .catch((error) => {
        pythonRuntimeLoadPromise = null;
        throw error;
      });
  }
  return pythonRuntimeLoadPromise;
}

const pythonExecutor = {
  execute: async (options) => {
    const runtime = await getPythonRuntime();
    return runtime.execute(options);
  },
};

function disposePythonRuntime() {
  pythonRuntime?.dispose();
  pythonRuntime = null;
  pythonRuntimeLoadPromise = null;
}

async function loadComposerAttachmentModule() {
  if (!composerAttachmentModulePromise) {
    composerAttachmentModulePromise = import('./attachments/composer-attachments.js').catch(
      (error) => {
        composerAttachmentModulePromise = null;
        throw error;
      }
    );
  }
  return composerAttachmentModulePromise;
}

function queueMarkdownRendererRefresh() {
  if (hasQueuedMarkdownRendererRefresh) {
    return;
  }
  hasQueuedMarkdownRendererRefresh = true;
  const refreshWhenIdle = () => {
    if (isGeneratingResponse(appState)) {
      window.setTimeout(refreshWhenIdle, STREAM_UPDATE_INTERVAL_MS);
      return;
    }
    hasQueuedMarkdownRendererRefresh = false;
    renderTranscript();
  };
  window.setTimeout(refreshWhenIdle, 0);
}

async function ensureMarkdownRendererLoaded() {
  if (markdownRenderer) {
    return markdownRenderer;
  }
  if (!markdownRendererLoadPromise) {
    markdownRendererLoadPromise = loadMarkdownRenderer({
      linkRel: MARKDOWN_LINK_REL,
    })
      .then((loadedRenderer) => {
        markdownRenderer = loadedRenderer;
        queueMarkdownRendererRefresh();
        return loadedRenderer;
      })
      .catch((error) => {
        markdownRendererLoadPromise = null;
        if (!hasLoggedMarkdownRendererError) {
          appendDebug(
            `Markdown renderer failed to load: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          hasLoggedMarkdownRendererError = true;
        }
        throw error;
      });
  }
  return markdownRendererLoadPromise;
}

const MAX_DEBUG_ENTRIES = 120;
const ROUTE_HOME = 'home';
const ROUTE_CHAT = 'chat';
const ROUTE_SETTINGS = 'settings';
const ROUTE_SYSTEM_PROMPT = 'system-prompt';
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
const PRE_CHAT_STATUS_HINT_MODEL_READY =
  'The current model is ready. Send your first message to continue with it, or choose a different model first.';
const appState = createAppState({
  activeGenerationConfig: {
    ...buildDefaultGenerationConfig(normalizeGenerationLimits(null)),
  },
  defaultSystemPrompt: '',
  enableToolCalling: true,
  enabledToolNames: getEnabledToolNames(),
  mcpServers: [],
  maxDebugEntries: MAX_DEBUG_ENTRIES,
});
appState.webGpuAdapterAvailable = browserSupportsWebGpu();
const baseFetchRef = typeof fetch === 'function' ? fetch.bind(globalThis) : null;
const corsAwareFetch = createCorsAwareFetch({
  fetchRef: baseFetchRef,
  getProxyUrl: () => appState.corsProxyUrl,
  locationRef: window.location,
});
const {
  clearLoadError,
  resetLoadProgressFiles,
  setLoadProgress,
  showLoadError,
  showProgressRegion,
} = createModelLoadFeedbackController({
  appState,
  documentRef: document,
  modelLoadProgressWrap,
  modelLoadProgressLabel,
  modelLoadProgressValue,
  modelLoadProgressBar,
  modelLoadProgressSummary,
  modelLoadCurrentFileLabel,
  modelLoadCurrentFileValue,
  modelLoadCurrentFileBar,
  modelLoadError,
  modelLoadErrorSummary,
  modelLoadErrorDetails,
});
const {
  buildRemovedComposerAttachmentStatus,
  buildUserMessageAttachmentPayload,
  clearPendingComposerAttachments,
  filterPendingComposerAttachmentsForModel,
  getMessageArtifacts,
  getPendingComposerAttachments,
  renderComposerAttachments,
} = createComposerRuntimeController({
  appState,
  documentRef: document,
  imageAttachmentInput,
  composerAttachmentTray,
  getAttachmentIconClass,
  formatAttachmentSize,
  setIconButtonContent,
});
const {
  ensureModelVariantControlsVisible,
  focusSkipTarget,
  focusTranscriptBoundary,
  scrollTranscriptToBottom,
  stepTranscriptNavigation,
  updateSkipLinkVisibility,
  updateTranscriptNavigationButtonVisibility,
} = createTranscriptNavigationController({
  appState,
  documentRef: document,
  reducedMotionQuery,
  chatMain,
  chatTranscript,
  topBar,
  openSettingsButton,
  jumpToTopButton,
  jumpToPreviousUserButton,
  jumpToNextModelButton,
  jumpToLatestButton,
  messageInput,
  skipLinkElements,
  transcriptBottomThresholdPx: TRANSCRIPT_BOTTOM_THRESHOLD_PX,
  routeChat: ROUTE_CHAT,
  hasStartedWorkspace: selectHasStartedWorkspace,
  isSettingsView,
  isEngineReady,
});

function initializeTooltips(root = document) {
  if (!root || !(root instanceof Element || root instanceof Document)) {
    return;
  }
  root.querySelectorAll('[data-bs-toggle="tooltip"], [data-icon-tooltip]').forEach((element) => {
    Tooltip.getOrCreateInstance(element, { animation: false });
  });
}

function readStoredToolConsents(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(TOOL_CONSENT_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function persistToolConsent(toolName, scope = 'default', storage = globalThis.localStorage) {
  const normalizedToolName = typeof toolName === 'string' ? toolName.trim() : '';
  const normalizedScope = typeof scope === 'string' && scope.trim() ? scope.trim() : 'default';
  if (!normalizedToolName || !storage) {
    return;
  }
  try {
    const stored = readStoredToolConsents(storage);
    const existingEntry =
      stored[normalizedToolName] && typeof stored[normalizedToolName] === 'object'
        ? stored[normalizedToolName]
        : {};
    existingEntry[normalizedScope] = true;
    stored[normalizedToolName] = existingEntry;
    storage.setItem(TOOL_CONSENT_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Ignore persistence failures and fall back to prompting again later.
  }
}

function hasStoredToolConsent(toolName, scope = 'default', storage = globalThis.localStorage) {
  const normalizedToolName = typeof toolName === 'string' ? toolName.trim() : '';
  const normalizedScope = typeof scope === 'string' && scope.trim() ? scope.trim() : 'default';
  if (!normalizedToolName || !storage) {
    return false;
  }
  const stored = readStoredToolConsents(storage);
  return stored?.[normalizedToolName]?.[normalizedScope] === true;
}

function requestToolConsent({
  toolName,
  scope = 'default',
  title = 'Allow tool use?',
  reason = '',
}) {
  if (hasStoredToolConsent(toolName, scope, localStorage)) {
    return true;
  }
  const detail = typeof reason === 'string' && reason.trim() ? `\n\n${reason.trim()}` : '';
  const allowed = window.confirm(
    `${title}\n\nThis prompt is shown once per browser for this tool.${detail}`
  );
  if (allowed) {
    persistToolConsent(toolName, scope, localStorage);
  }
  return allowed;
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
    (candidate) =>
      candidate instanceof HTMLElement && candidate.dataset.conversationId === conversationId
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
  const capabilities = deriveConversationMenuCapabilities(conversation);
  return {
    ...capabilities,
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
      ? findConversationMenuButton(
          conversationId,
          `.${Array.from(actionButton.classList).join('.')}`
        )
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
  let copiedStatus = 'Copied to clipboard.';
  let emptyStatus = 'Nothing available to copy.';
  const getModelTurnMessages = (rootMessageId) => {
    const pathMessages = getConversationPathMessages(activeConversation);
    const startIndex = pathMessages.findIndex((candidate) => candidate?.id === rootMessageId);
    if (startIndex < 0) {
      return [];
    }
    const turnMessages = [];
    for (let index = startIndex; index < pathMessages.length; index += 1) {
      const candidate = pathMessages[index];
      if (!candidate) {
        continue;
      }
      if (index > startIndex && candidate.role === 'user') {
        break;
      }
      if (candidate.role === 'model' || candidate.role === 'tool') {
        turnMessages.push(candidate);
      }
    }
    return turnMessages;
  };
  if (copyType === 'thoughts') {
    textToCopy = message.role === 'model' ? String(message.thoughts || '') : '';
  } else if (copyType === 'response') {
    if (message.role === 'model') {
      const turnMessages = getModelTurnMessages(message.id);
      textToCopy = turnMessages
        .map((turnMessage) =>
          turnMessage.role === 'tool'
            ? String(turnMessage.toolResult || turnMessage.text || '').trim()
            : String(turnMessage.response || turnMessage.text || '').trim()
        )
        .filter(Boolean)
        .join('\n\n');
    } else {
      textToCopy = '';
    }
  } else if (copyType === 'mathml') {
    if (message.role === 'model') {
      const messageElement = findMessageElement(messageId);
      const responseElements = Array.from(
        messageElement?.querySelectorAll('.response-content') || []
      );
      if (responseElements.length) {
        const mathMlBlocks = [];
        for (const responseElement of responseElements) {
          if (!(responseElement instanceof HTMLElement)) {
            continue;
          }
          await typesetMathInElement(responseElement);
          const mathMl = extractMathMlFromElement(responseElement);
          if (mathMl) {
            mathMlBlocks.push(mathMl);
          }
        }
        textToCopy = mathMlBlocks.join('\n\n');
      }
    }
    copiedStatus = 'MathML copied to clipboard.';
    emptyStatus = 'No rendered MathML available to copy.';
  } else {
    textToCopy = String(message.text || '');
  }
  if (!textToCopy) {
    setStatus(emptyStatus);
    return;
  }
  const didCopy = await copyTextToClipboard(textToCopy);
  setStatus(didCopy ? copiedStatus : 'Copy failed.');
}

function extractMathMlFromElement(element) {
  if (!(element instanceof HTMLElement)) {
    return '';
  }
  const mathMlNodes = Array.from(element.querySelectorAll('mjx-assistive-mml math'));
  const fallbackNodes = mathMlNodes.length
    ? []
    : Array.from(element.querySelectorAll('math')).filter(
        (mathNode) => !mathNode.parentElement?.closest('math')
      );
  const nodesToSerialize = mathMlNodes.length ? mathMlNodes : fallbackNodes;
  if (!nodesToSerialize.length) {
    return '';
  }
  const XMLSerializerClass = element.ownerDocument?.defaultView?.XMLSerializer;
  if (typeof XMLSerializerClass !== 'function') {
    return '';
  }
  const serializer = new XMLSerializerClass();
  return nodesToSerialize
    .map((node) => serializer.serializeToString(node).trim())
    .filter(Boolean)
    .join('\n\n');
}

function formatInteger(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatWordEstimateFromTokens(tokenCount) {
  const wordEstimate = Math.round(Number(tokenCount) * 0.75);
  return formatInteger(Math.max(0, wordEstimate));
}

function renderModelMarkdown(content) {
  const normalizedContent = appState.renderMathMl
    ? normalizeMathDelimitersForMarkdown(String(content || ''))
    : String(content || '');
  if (!normalizedContent) {
    return '';
  }
  if (markdownRenderer) {
    return markdownRenderer.render(normalizedContent);
  }
  void ensureMarkdownRendererLoaded();
  return renderPlainTextMarkdownFallback(normalizedContent);
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
  if (!appState.renderMathMl) {
    return Promise.resolve();
  }
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
  if (
    !appState.renderMathMl ||
    !(element instanceof HTMLElement) ||
    !containsMathDelimiters(element.textContent)
  ) {
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
  if (
    !appState.renderMathMl ||
    !(element instanceof HTMLElement) ||
    !containsMathDelimiters(element.textContent)
  ) {
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
    `Generation settings applied (maxOutputTokens=${nextConfig.maxOutputTokens}, maxContextTokens=${nextConfig.maxContextTokens}, temperature=${nextConfig.temperature.toFixed(1)}, topK=${nextConfig.topK}, topP=${nextConfig.topP.toFixed(2)}, repetitionPenalty=${nextConfig.repetitionPenalty.toFixed(2)}).`
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
    `Generation settings applied (maxOutputTokens=${nextConfig.maxOutputTokens}, maxContextTokens=${nextConfig.maxContextTokens}, temperature=${nextConfig.temperature.toFixed(1)}, topK=${nextConfig.topK}, topP=${nextConfig.topP.toFixed(2)}, repetitionPenalty=${nextConfig.repetitionPenalty.toFixed(2)}).`
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
  if (selectHasStartedWorkspace(appState) && !isLoadingModelState(appState)) {
    applyStatusRegion(
      onboardingStatusRegion,
      onboardingStatusRegionHeading,
      onboardingStatusRegionMessage,
      appState.isPreparingNewConversation && isEngineReady(appState)
        ? PRE_CHAT_STATUS_HINT_MODEL_READY
        : hasSelectedConversationWithHistory()
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

function normalizeAttachmentInputLimit(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function getModelAttachmentSupport(modelId) {
  const selectedModelId = normalizeModelId(modelId || modelSelect?.value || DEFAULT_MODEL);
  const model = MODEL_OPTIONS_BY_ID.get(selectedModelId);
  const runtime = model?.runtime || {};
  const features = model?.features || {};
  const inputLimits = model?.inputLimits || {};
  const multimodalEnabled = runtime.multimodalGeneration === true;
  return {
    imageInputSupported: multimodalEnabled && features.imageInput === true,
    audioInputSupported: multimodalEnabled && features.audioInput === true,
    videoInputSupported: multimodalEnabled && features.videoInput === true,
    maxImageInputs: normalizeAttachmentInputLimit(inputLimits.maxImageInputs),
    maxAudioInputs: normalizeAttachmentInputLimit(inputLimits.maxAudioInputs),
    maxVideoInputs: normalizeAttachmentInputLimit(inputLimits.maxVideoInputs),
  };
}

function getSelectedModelAttachmentSupport() {
  return getModelAttachmentSupport(modelSelect?.value || DEFAULT_MODEL);
}

function selectedModelSupportsImageInput() {
  return getSelectedModelAttachmentSupport().imageInputSupported;
}

function modelSupportsToolCalling(modelId) {
  return MODEL_OPTIONS_BY_ID.get(normalizeModelId(modelId))?.features?.toolCalling === true;
}

function getToolCallingConfigForModel(modelId) {
  return MODEL_OPTIONS_BY_ID.get(normalizeModelId(modelId))?.toolCalling || null;
}

function getConfiguredEnabledToolNames() {
  return getEnabledToolNames(appState.enabledToolNames);
}

function getConfiguredEnabledToolDefinitions() {
  return getEnabledToolDefinitions(appState.enabledToolNames);
}

function getConfiguredEnabledMcpServers() {
  return getEnabledMcpServerConfigs(appState.mcpServers);
}

function getToolCallingContext(modelId) {
  const enabled = appState.enableToolCalling === true;
  const config = enabled ? getToolCallingConfigForModel(modelId) : null;
  const supported = enabled && modelSupportsToolCalling(modelId) && Boolean(config);
  const enabledToolDefinitions = getConfiguredEnabledToolDefinitions();
  const enabledTools = getConfiguredEnabledToolNames();
  const enabledMcpServers = getConfiguredEnabledMcpServers();
  const implicitToolNames = supported ? getImplicitlyEnabledToolNames(enabledMcpServers) : [];
  return {
    enabled,
    supported,
    enabledTools,
    enabledToolDefinitions,
    enabledMcpServers,
    exposedToolNames: [...new Set([...enabledTools, ...implicitToolNames])],
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
    toolContext.enabledToolDefinitions,
    {
      mcpServers: toolContext.enabledMcpServers,
    }
  );
}

function getThinkingControlForModel(modelId) {
  return MODEL_OPTIONS_BY_ID.get(normalizeModelId(modelId))?.thinkingControl || null;
}

function getLanguageSupportForModel(modelId) {
  return MODEL_OPTIONS_BY_ID.get(normalizeModelId(modelId))?.languageSupport || null;
}

function getConversationLanguagePreference(conversation) {
  return normalizeConversationLanguagePreference(
    conversation ? conversation.languagePreference : appState.pendingConversationLanguagePreference
  );
}

function getConversationThinkingEnabled(conversation) {
  const modelId = conversation
    ? getConversationModelId(conversation)
    : normalizeModelId(modelSelect?.value || DEFAULT_MODEL);
  const defaultEnabled = getThinkingControlForModel(modelId)?.defaultEnabled !== false;
  return normalizeConversationThinkingEnabled(
    conversation ? conversation.thinkingEnabled : appState.pendingConversationThinkingEnabled,
    defaultEnabled
  );
}

function getSelectedLanguageMetadata(languagePreference) {
  const normalizedPreference = normalizeConversationLanguagePreference(languagePreference);
  if (normalizedPreference === 'auto') {
    return {
      code: 'auto',
      label: 'Auto',
      name: '',
    };
  }
  const displayNames =
    typeof Intl.DisplayNames === 'function'
      ? new Intl.DisplayNames(['en'], { type: 'language' })
      : null;
  const code = normalizedPreference.toLowerCase();
  const baseCode = code.split('-')[0];
  const name = displayNames?.of(code) || displayNames?.of(baseCode) || code.toUpperCase();
  return {
    code,
    label: `${name} (${code.toUpperCase()})`,
    name,
  };
}

function getOptionalFeatureSystemPromptSection(modelId, conversation = null) {
  const languagePreference = getConversationLanguagePreference(conversation);
  const thinkingControl = getThinkingControlForModel(modelId);
  return buildOptionalFeaturePromptSection([
    buildFactCheckingPrompt({
      webLookupEnabled: getConfiguredEnabledToolNames().includes('web_lookup'),
    }),
    buildMathRenderingFeaturePrompt({ renderMathMl: appState.renderMathMl }),
    buildLanguagePreferencePrompt({
      languageName:
        languagePreference === 'auto' ? '' : getSelectedLanguageMetadata(languagePreference).name,
    }),
    buildThinkingModePrompt({
      enabled: getConversationThinkingEnabled(conversation),
      enabledInstruction: thinkingControl?.enabledInstruction,
      disabledInstruction: thinkingControl?.disabledInstruction,
    }),
  ]);
}

function getConversationSystemPromptSuffix(modelId, conversation = null) {
  return [
    getOptionalFeatureSystemPromptSection(modelId, conversation),
    getToolCallingSystemPromptSuffix(modelId),
  ]
    .map((section) => normalizeSystemPrompt(section))
    .filter(Boolean)
    .join('\n\n');
}

function getConversationLanguageWarningText(modelId, languagePreference) {
  const normalizedPreference = normalizeConversationLanguagePreference(languagePreference);
  if (normalizedPreference === 'auto') {
    return 'Auto leaves language choice to your prompt and the model.';
  }
  const selectedLanguage = getSelectedLanguageMetadata(normalizedPreference);
  const languageSupport = getLanguageSupportForModel(modelId);
  const supportedTags = Array.isArray(languageSupport?.tags) ? languageSupport.tags : [];
  const isExplicitlySupported = supportedTags.some(
    (tag) => typeof tag?.code === 'string' && tag.code.toLowerCase() === selectedLanguage.code
  );
  if (isExplicitlySupported) {
    return `${selectedLanguage.name} is listed for this model.`;
  }
  if (languageSupport?.hasMore === true) {
    return `${selectedLanguage.name} is not listed in this app's model card preview. It may still work, but cool and scary things can happen.`;
  }
  if (supportedTags.length) {
    return `${selectedLanguage.name} is not listed for this model. It may still work, but cool and scary things can happen.`;
  }
  return `This app does not have published language support metadata for the selected model. ${selectedLanguage.name} may work, but cool and scary things can happen.`;
}

function buildConversationRuntimeConfig(conversation = null) {
  const modelId = conversation
    ? getConversationModelId(conversation)
    : normalizeModelId(modelSelect?.value || DEFAULT_MODEL);
  const model = MODEL_OPTIONS_BY_ID.get(modelId);
  const runtime = model?.runtime || {};
  const features = model?.features || {};
  const inputLimits = model?.inputLimits || {};
  const multimodalGeneration = runtime.multimodalGeneration === true;
  const thinkingControl = model?.thinkingControl || null;
  const thinkingEnabled = getConversationThinkingEnabled(conversation);
  return {
    ...runtime,
    ...(multimodalGeneration && features.imageInput ? { imageInput: true } : {}),
    ...(multimodalGeneration && features.audioInput ? { audioInput: true } : {}),
    ...(multimodalGeneration && features.videoInput ? { videoInput: true } : {}),
    ...(multimodalGeneration && Number.isInteger(inputLimits.maxImageInputs)
      ? { maxImageInputs: inputLimits.maxImageInputs }
      : {}),
    ...(multimodalGeneration && Number.isInteger(inputLimits.maxAudioInputs)
      ? { maxAudioInputs: inputLimits.maxAudioInputs }
      : {}),
    ...(multimodalGeneration && Number.isInteger(inputLimits.maxVideoInputs)
      ? { maxVideoInputs: inputLimits.maxVideoInputs }
      : {}),
    ...(thinkingControl?.runtimeParameter === 'enable_thinking'
      ? { enableThinking: thinkingEnabled }
      : {}),
  };
}

function getConversationLanguageOptions() {
  const optionsByCode = new Map([['auto', { code: 'auto', label: 'Auto' }]]);
  MODEL_OPTIONS_BY_ID.forEach((model) => {
    const tags = Array.isArray(model?.languageSupport?.tags) ? model.languageSupport.tags : [];
    tags.forEach((tag) => {
      const code = typeof tag?.code === 'string' ? tag.code.trim().toLowerCase() : '';
      const name = typeof tag?.name === 'string' ? tag.name.trim() : '';
      if (!code || !name || optionsByCode.has(code)) {
        return;
      }
      optionsByCode.set(code, {
        code,
        label: `${name} (${code.toUpperCase()})`,
      });
    });
  });
  return [...optionsByCode.values()].sort((left, right) => {
    if (left.code === 'auto') {
      return -1;
    }
    if (right.code === 'auto') {
      return 1;
    }
    return left.label.localeCompare(right.label);
  });
}

function syncConversationLanguageAndThinkingControls(conversation = getActiveConversation()) {
  const modelId = conversation
    ? getConversationModelId(conversation)
    : normalizeModelId(modelSelect?.value || DEFAULT_MODEL);
  const languagePreference = getConversationLanguagePreference(conversation);
  const thinkingControl = getThinkingControlForModel(modelId);
  if (conversationLanguageSelect instanceof HTMLSelectElement) {
    const options = getConversationLanguageOptions();
    conversationLanguageSelect.replaceChildren();
    options.forEach((option) => {
      const node = document.createElement('option');
      node.value = option.code;
      node.textContent = option.label;
      conversationLanguageSelect.appendChild(node);
    });
    if (!options.some((option) => option.code === languagePreference)) {
      const selectedLanguage = getSelectedLanguageMetadata(languagePreference);
      const node = document.createElement('option');
      node.value = selectedLanguage.code;
      node.textContent = selectedLanguage.label;
      conversationLanguageSelect.appendChild(node);
    }
    conversationLanguageSelect.value = languagePreference;
  }
  if (conversationLanguageHelp instanceof HTMLElement) {
    conversationLanguageHelp.textContent = getConversationLanguageWarningText(
      modelId,
      languagePreference
    );
  }
  if (enableModelThinkingToggle instanceof HTMLInputElement) {
    enableModelThinkingToggle.checked = getConversationThinkingEnabled(conversation);
    enableModelThinkingToggle.disabled = !thinkingControl;
  }
  if (enableModelThinkingHelp instanceof HTMLElement) {
    enableModelThinkingHelp.textContent = thinkingControl
      ? "Uses the selected model's reasoning switch when one is available."
      : 'This model does not expose a thinking switch in this app. This setting currently does nothing.';
  }
}

function buildComputedConversationSystemPromptPreview({
  conversationPrompt = '',
  appendConversationPrompt = true,
} = {}) {
  const activeConversation = getActiveConversation();
  const modelId = activeConversation
    ? getConversationModelId(activeConversation)
    : normalizeModelId(modelSelect?.value || DEFAULT_MODEL);
  const promptTarget = activeConversation
    ? {
        ...activeConversation,
        conversationSystemPrompt: normalizeSystemPrompt(conversationPrompt),
        appendConversationSystemPrompt: normalizeConversationPromptMode(appendConversationPrompt),
      }
    : {
        systemPrompt: appState.defaultSystemPrompt,
        conversationSystemPrompt: normalizeSystemPrompt(conversationPrompt),
        appendConversationSystemPrompt: normalizeConversationPromptMode(appendConversationPrompt),
        languagePreference: appState.pendingConversationLanguagePreference,
        thinkingEnabled: appState.pendingConversationThinkingEnabled,
      };
  return getEffectiveConversationSystemPrompt(promptTarget, {
    suffix: getConversationSystemPromptSuffix(modelId, promptTarget),
  });
}

function detectToolCallsForModel(rawText, modelId) {
  const toolCallingConfig = getToolCallingConfigForModel(modelId);
  const toolContext = getToolCallingContext(modelId);
  if (!toolCallingConfig || !toolContext.supported) {
    return [];
  }
  const enabledToolNameSet = new Set(toolContext.exposedToolNames);
  if (!enabledToolNameSet.size) {
    return [];
  }
  return sniffToolCalls(rawText, toolCallingConfig).filter((toolCall) =>
    enabledToolNameSet.has(toolCall?.name)
  );
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
  syncConversationLanguageAndThinkingControls();
  applyAppRouteFromHash();
}

function getActiveConversation() {
  return selectActiveConversation(appState);
}

function reservePendingConversationId() {
  if (
    typeof appState.pendingConversationDraftId === 'string' &&
    appState.pendingConversationDraftId.trim()
  ) {
    return appState.pendingConversationDraftId.trim();
  }
  const pendingConversationId = createConversationId();
  appState.pendingConversationDraftId = pendingConversationId;
  return pendingConversationId;
}

function getConversationWorkspaceFileSystem(conversationOrId = getActiveConversation()) {
  const conversationId =
    typeof conversationOrId === 'string'
      ? conversationOrId.trim()
      : typeof conversationOrId?.id === 'string'
        ? conversationOrId.id.trim()
        : '';
  if (!conversationId) {
    return null;
  }
  if (!conversationWorkspaceFileSystems.has(conversationId)) {
    conversationWorkspaceFileSystems.set(
      conversationId,
      createConversationWorkspaceFileSystem(workspaceFileSystem, conversationId)
    );
  }
  return conversationWorkspaceFileSystems.get(conversationId) || null;
}

async function deleteConversationStorage(conversationId) {
  const normalizedConversationId = typeof conversationId === 'string' ? conversationId.trim() : '';
  if (!normalizedConversationId) {
    return;
  }
  const conversationWorkspaceFileSystem =
    getConversationWorkspaceFileSystem(normalizedConversationId);
  if (!conversationWorkspaceFileSystem?.backingRootPath) {
    conversationWorkspaceFileSystems.delete(normalizedConversationId);
    return;
  }
  try {
    if (await workspaceFileSystem.exists(conversationWorkspaceFileSystem.backingRootPath)) {
      await workspaceFileSystem.deletePath(conversationWorkspaceFileSystem.backingRootPath, {
        recursive: true,
      });
    }
  } finally {
    conversationWorkspaceFileSystems.delete(normalizedConversationId);
  }
}

function isModelTurnComplete(conversation, rootModelMessage) {
  if (!conversation || rootModelMessage?.role !== 'model') {
    return false;
  }
  const pathMessages = getConversationPathMessages(conversation);
  const startIndex = pathMessages.findIndex((message) => message?.id === rootModelMessage.id);
  if (startIndex < 0) {
    return Boolean(rootModelMessage.isResponseComplete);
  }
  for (let index = pathMessages.length - 1; index >= startIndex; index -= 1) {
    const message = pathMessages[index];
    if (!message) {
      continue;
    }
    if (index > startIndex && message.role === 'user') {
      break;
    }
    if (message.role === 'model') {
      return Boolean(message.isResponseComplete);
    }
  }
  return Boolean(rootModelMessage.isResponseComplete);
}

function findConversationById(conversationId) {
  return selectConversationById(appState, conversationId);
}

function createConversationId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `conversation-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function isConversationSystemPromptModalVisible() {
  return Boolean(
    conversationSystemPromptModal instanceof HTMLElement &&
    conversationSystemPromptModal.classList.contains('show')
  );
}

function buildRouteHash(targetRoute) {
  const activeConversation = getActiveConversation();
  if (targetRoute === ROUTE_SETTINGS) {
    return '#/chat/settings';
  }
  if (targetRoute === ROUTE_CHAT) {
    if (appState.isConversationSystemPromptModalOpen && activeConversation?.id) {
      return `#/chat/${encodeURIComponent(activeConversation.id)}/${ROUTE_SYSTEM_PROMPT}`;
    }
    if (activeConversation?.id && !appState.isPreparingNewConversation) {
      return `#/chat/${encodeURIComponent(activeConversation.id)}`;
    }
    return '#/chat';
  }
  return '#/';
}

function parseAppRouteFromHash(hashValue = window.location.hash) {
  const normalized = String(hashValue || '')
    .replace(/^#\/?/, '')
    .trim();
  const segments = normalized
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
  const firstSegment = segments[0]?.toLowerCase() || '';
  const secondSegment = segments[1]?.toLowerCase() || '';
  const thirdSegment = segments[2]?.toLowerCase() || '';

  if (!segments.length) {
    return { route: ROUTE_HOME, conversationId: null, showSystemPrompt: false };
  }
  if (firstSegment === ROUTE_SETTINGS) {
    return { route: ROUTE_SETTINGS, conversationId: null, showSystemPrompt: false };
  }
  if (firstSegment !== ROUTE_CHAT) {
    return { route: ROUTE_HOME, conversationId: null, showSystemPrompt: false };
  }
  if (secondSegment === ROUTE_SETTINGS) {
    return { route: ROUTE_SETTINGS, conversationId: null, showSystemPrompt: false };
  }

  let conversationId = null;
  if (segments[1] && secondSegment !== ROUTE_SETTINGS) {
    try {
      conversationId = decodeURIComponent(segments[1]);
    } catch {
      conversationId = segments[1];
    }
  }
  return {
    route: ROUTE_CHAT,
    conversationId,
    showSystemPrompt: Boolean(conversationId) && thirdSegment === ROUTE_SYSTEM_PROMPT,
  };
}

function createConversation(name) {
  appState.conversationCount += 1;
  const conversationId =
    typeof appState.pendingConversationDraftId === 'string' &&
    appState.pendingConversationDraftId.trim()
      ? appState.pendingConversationDraftId.trim()
      : createConversationId();
  appState.pendingConversationDraftId = '';
  appState.conversationIdCounter += 1;
  const conversation = createConversationRecord({
    id: conversationId,
    name,
    modelId: getAvailableModelId(
      modelSelect?.value || DEFAULT_MODEL,
      normalizeBackendPreference(backendSelect?.value || 'auto')
    ),
    untitledPrefix: UNTITLED_CONVERSATION_PREFIX,
    systemPrompt: appState.defaultSystemPrompt,
    languagePreference: appState.pendingConversationLanguagePreference,
    thinkingEnabled: appState.pendingConversationThinkingEnabled,
    startedAt: Date.now(),
  });
  conversation.conversationSystemPrompt = normalizeSystemPrompt(
    appState.pendingConversationSystemPrompt
  );
  conversation.appendConversationSystemPrompt = normalizeConversationPromptMode(
    appState.pendingAppendConversationSystemPrompt
  );
  return conversation;
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
  conversation.thinkingEnabled = normalizeConversationThinkingEnabled(
    conversation.thinkingEnabled,
    getThinkingControlForModel(nextModelId)?.defaultEnabled !== false
  );
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
    conversation.thinkingEnabled = normalizeConversationThinkingEnabled(
      conversation.thinkingEnabled,
      getThinkingControlForModel(selectedModelId)?.defaultEnabled !== false
    );
  } else {
    appState.pendingConversationThinkingEnabled = normalizeConversationThinkingEnabled(
      appState.pendingConversationThinkingEnabled,
      getThinkingControlForModel(selectedModelId)?.defaultEnabled !== false
    );
  }
  setSelectedModelId(selectedModelId, { dispatch: false });
  syncGenerationSettingsFromModel(selectedModelId, useDefaults);
  syncConversationLanguageAndThinkingControls(conversation);

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

let transcriptActions = null;

function switchModelVariant(messageId, direction) {
  return transcriptActions?.switchModelVariant(messageId, direction);
}

function switchUserVariant(messageId, direction) {
  return transcriptActions?.switchUserVariant(messageId, direction);
}

function beginUserMessageEdit(messageId) {
  return transcriptActions?.beginUserMessageEdit(messageId);
}

function cancelUserMessageEdit(messageId) {
  return transcriptActions?.cancelUserMessageEdit(messageId);
}

function saveUserMessageEdit(messageId) {
  return transcriptActions?.saveUserMessageEdit(messageId);
}

function branchFromUserMessage(messageId) {
  return transcriptActions?.branchFromUserMessage(messageId);
}

const transcriptView = createTranscriptView({
  container: chatTranscript,
  scrollContainer: chatMain,
  getActiveConversation,
  getConversationPathMessages,
  getConversationCardHeading,
  getModelVariantState,
  getUserVariantState,
  renderModelMarkdown,
  scheduleMathTypeset,
  shouldShowMathMlCopyAction: (content) => appState.renderMathMl && containsMathDelimiters(content),
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

const {
  handleCloseTerminalPanel,
  handleCloseWebLookupPanel,
  handleShellCommandComplete,
  handleShellCommandStart,
  handleWebLookupSearchComplete,
  handleWebLookupSearchStart,
  renderWorkspaceSidePanels,
} = createWorkspaceSidePanelsController({
  appState,
  documentRef: document,
  windowRef: window,
  terminalPanel,
  terminalHost,
  webLookupPanel,
  webLookupFrame,
  webLookupPanelTitle,
  webLookupPanelDescription,
  getActiveConversation,
  getConversationPathMessages,
  findConversationById,
  isSettingsView,
  isTerminalOpenForConversation,
  hasDismissedTerminalForConversation,
  openTerminalForConversation,
  closeTerminal,
  clearTerminalDismissal,
  appendDebug,
});

if (closeTerminalButton instanceof HTMLButtonElement) {
  closeTerminalButton.addEventListener('click', handleCloseTerminalPanel);
}

if (closeWebLookupPanelButton instanceof HTMLButtonElement) {
  closeWebLookupPanelButton.addEventListener('click', handleCloseWebLookupPanel);
}

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

function renderTranscript(options = {}) {
  transcriptView.renderTranscript(options);
  renderActiveTaskListTray();
  renderWorkspaceSidePanels();
}

function renderActiveTaskListTray() {
  if (!(taskListTray instanceof HTMLElement)) {
    return;
  }
  const shouldShowTray = appState.workspaceView === 'chat' && !isSettingsView(appState);
  if (!shouldShowTray) {
    taskListTray.replaceChildren();
    taskListTray.dataset.hasItems = 'false';
    taskListTray.classList.add('d-none');
    return;
  }
  const activeConversation = getActiveConversation();
  const items = activeConversation ? getTaskListForConversationLeaf(activeConversation) : [];
  if (!items.length) {
    isTaskListTrayExpanded = false;
  }
  renderTaskListTray({
    container: taskListTray,
    items,
    isExpanded: isTaskListTrayExpanded,
    onToggle: () => {
      isTaskListTrayExpanded = !isTaskListTrayExpanded;
      renderActiveTaskListTray();
    },
  });
}

function isUiBusy() {
  return shouldDisableConversationControls(appState);
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
    systemPromptSuffix: getConversationSystemPromptSuffix(selectedModelId, activeConversation),
    toolContext,
  });
}

function buildPromptForActiveConversation(
  conversation,
  leafMessageId = conversation?.activeLeafMessageId
) {
  return buildPromptForConversationLeaf(conversation, leafMessageId, {
    systemPromptSuffix: getConversationSystemPromptSuffix(
      getConversationModelId(conversation),
      conversation
    ),
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
  const isPreChatAvailable = selectHasStartedWorkspace(appState) && !isSettingsView(appState);
  const canShowPreChatActions =
    isPreChatAvailable && !isEngineReady(appState) && Boolean(activeConversation);
  const isBusy = isUiBusy();

  if (preChatActions instanceof HTMLElement) {
    preChatActions.classList.toggle('d-none', !canShowPreChatActions);
  }
  if (preChatLoadModelBtn instanceof HTMLButtonElement) {
    preChatLoadModelBtn.classList.toggle('d-none', !hasExistingConversation);
    preChatLoadModelBtn.disabled = !canShowPreChatActions || !hasExistingConversation || isBusy;
  }
  if (preChatEditConversationSystemPromptBtn instanceof HTMLButtonElement) {
    preChatEditConversationSystemPromptBtn.disabled = !isPreChatAvailable || isBusy;
  }
}

function updateComposerVisibility() {
  const showComposer = selectHasStartedWorkspace(appState) && !isSettingsView(appState);
  setRegionVisibility(chatForm, showComposer);
  if (taskListTray instanceof HTMLElement) {
    const showTaskTray =
      showComposer && appState.workspaceView === 'chat' && taskListTray.dataset.hasItems === 'true';
    setRegionVisibility(taskListTray, showTaskTray);
  }
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

function syncRouteToCurrentState({ replace = true } = {}) {
  routingShell.syncRouteToCurrentView({ replace });
}

function closeConversationSystemPromptModal() {
  if (!isConversationSystemPromptModalVisible()) {
    return;
  }
  const modalInstance =
    appState.conversationSystemPromptModalInstance ||
    (conversationSystemPromptModal instanceof HTMLElement
      ? Modal.getOrCreateInstance(conversationSystemPromptModal)
      : null);
  modalInstance?.hide();
}

function applyAppRouteFromHash() {
  const routeState = parseAppRouteFromHash();
  if (routeState.route === ROUTE_CHAT) {
    setChatWorkspaceStarted(appState, true);
    if (routeState.conversationId) {
      setPreparingNewConversation(appState, false);
      if (findConversationById(routeState.conversationId)) {
        setActiveConversationById(routeState.conversationId, { syncRoute: false });
      }
    } else {
      setPreparingNewConversation(appState, true);
      if (appState.activeConversationId !== null) {
        appState.activeConversationId = null;
        clearUserMessageEditSession();
        setChatTitleEditing(appState, false);
        renderConversationList();
        renderTranscript();
        updateChatTitle();
        syncConversationLanguageAndThinkingControls(null);
      }
    }
  }

  routingShell.applyRouteFromHash();

  if (
    routeState.showSystemPrompt &&
    routeState.conversationId &&
    findConversationById(routeState.conversationId)
  ) {
    if (!isConversationSystemPromptModalVisible()) {
      beginConversationSystemPromptEdit();
    }
    return;
  }

  closeConversationSystemPromptModal();
}

function setActiveConversationById(
  conversationId,
  { syncRoute = true, replaceRoute = false } = {}
) {
  if (appState.activeConversationId === conversationId) {
    if (syncRoute) {
      syncRouteToCurrentState({ replace: replaceRoute });
    }
    return;
  }
  if (isChatTitleEditingState(appState)) {
    setChatTitleEditing(appState, false);
  }
  setPreparingNewConversation(appState, false);
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
  if (syncRoute) {
    syncRouteToCurrentState({ replace: replaceRoute });
  }
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
  const attachmentsAreProcessing = isProcessingAttachments(appState);
  const composerControlsDisabled =
    isLoadingModelState(appState) ||
    isOrchestrationRunningState(appState) ||
    isMessageEditActive(appState) ||
    disableComposerForPreChatSelection;
  const attachmentSupport = getSelectedModelAttachmentSupport();
  if (messageInput instanceof HTMLTextAreaElement) {
    messageInput.disabled = disableComposerForPreChatSelection;
  }
  if (addImagesButton instanceof HTMLButtonElement) {
    addImagesButton.disabled =
      composerControlsDisabled || isGeneratingResponse(appState) || attachmentsAreProcessing;
  }
  if (attachReferenceMenuItem instanceof HTMLButtonElement) {
    const referenceMenuDisabled =
      composerControlsDisabled || isGeneratingResponse(appState) || attachmentsAreProcessing;
    attachReferenceMenuItem.disabled = referenceMenuDisabled;
    attachReferenceMenuItem.setAttribute('aria-disabled', referenceMenuDisabled ? 'true' : 'false');
  }
  if (attachWorkWithMenuItem instanceof HTMLButtonElement) {
    const workWithMenuDisabled =
      composerControlsDisabled || isGeneratingResponse(appState) || attachmentsAreProcessing;
    attachWorkWithMenuItem.disabled = workWithMenuDisabled;
    attachWorkWithMenuItem.setAttribute('aria-disabled', workWithMenuDisabled ? 'true' : 'false');
  }
  if (imageAttachmentInput instanceof HTMLInputElement) {
    imageAttachmentInput.disabled =
      composerControlsDisabled || isGeneratingResponse(appState) || attachmentsAreProcessing;
    imageAttachmentInput.accept = getAttachmentButtonAcceptValue(attachmentSupport);
  }
  const filteredAttachments = filterPendingComposerAttachmentsForModel(
    getPendingComposerAttachments(),
    attachmentSupport
  );
  if (
    filteredAttachments.removedUnsupported.length > 0 ||
    filteredAttachments.removedLimited.length > 0
  ) {
    appState.pendingComposerAttachments = filteredAttachments.attachments;
    renderComposerAttachments();
    setStatus(
      buildRemovedComposerAttachmentStatus({
        ...filteredAttachments,
        mediaSupport: attachmentSupport,
      })
    );
  }
  if (sendButton) {
    sendButton.disabled =
      composerControlsDisabled ||
      attachmentsAreProcessing ||
      (!isGeneratingResponse(appState) && !selectHasStartedWorkspace(appState)) ||
      false;
  }
  if (newConversationBtn) {
    newConversationBtn.classList.toggle('d-none', !shouldShowNewConversationButton());
    newConversationBtn.disabled =
      attachmentsAreProcessing ||
      isGeneratingResponse(appState) ||
      isOrchestrationRunningState(appState) ||
      appState.isPreparingNewConversation ||
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
    const hideActions = !isModelTurnComplete(activeConversation, modelMessage);
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
    sendButton.classList.add('is-stop-mode');
    sendButton.setAttribute('aria-label', 'Stop generating');
    sendButton.setAttribute('aria-keyshortcuts', 'Alt+.');
    sendButton.setAttribute('data-bs-title', 'Stop generating (Alt+.)');
    setIconButtonContent(sendButton, 'bi-stop-fill', 'Stop generating');
    initializeTooltips(document);
    return;
  }
  sendButton.type = 'submit';
  sendButton.classList.remove('btn-outline-secondary');
  sendButton.classList.add('btn-primary');
  sendButton.classList.remove('is-stop-mode');
  sendButton.setAttribute('aria-label', 'Send message');
  sendButton.setAttribute('aria-keyshortcuts', 'Enter');
  sendButton.setAttribute('data-bs-title', 'Send message (Enter)');
  setIconButtonContent(sendButton, 'bi-send', 'Send message');
  initializeTooltips(document);
}

function getThinkingTagsForModel(modelId) {
  return MODEL_OPTIONS_BY_ID.get(normalizeModelId(modelId))?.thinkingTags || null;
}

function getRuntimeConfigForModel(modelId) {
  return buildConversationRuntimeConfig({
    modelId: normalizeModelId(modelId),
    languagePreference: appState.pendingConversationLanguagePreference,
    thinkingEnabled: appState.pendingConversationThinkingEnabled,
  });
}

const {
  updateChatTitleEditorVisibility,
  updateConversationSystemPromptPreview,
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
  conversationSystemPromptComputedPreview,
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
  buildComputedConversationSystemPromptPreview,
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
  buildHash: buildRouteHash,
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
  updateTerminalVisibility: renderWorkspaceSidePanels,
  updateActionButtons,
  updatePreChatStatusHint,
  updatePreChatActionButtons,
  updateSkipLinkVisibility,
  playEntranceAnimation,
});

const { setActiveSettingsTab, setSettingsPageVisibility, updateWelcomePanelVisibility } =
  routingShell;

const preferencesController = createPreferencesController({
  appState,
  storage: localStorage,
  navigatorRef: navigator,
  documentRef: document,
  themeStorageKey: THEME_STORAGE_KEY,
  showThinkingStorageKey: SHOW_THINKING_STORAGE_KEY,
  enableToolCallingStorageKey: ENABLE_TOOL_CALLING_STORAGE_KEY,
  enabledToolsStorageKey: ENABLED_TOOLS_STORAGE_KEY,
  renderMathMlStorageKey: RENDER_MATHML_STORAGE_KEY,
  singleKeyShortcutsStorageKey: SINGLE_KEY_SHORTCUTS_STORAGE_KEY,
  transcriptViewStorageKey: TRANSCRIPT_VIEW_STORAGE_KEY,
  conversationPanelCollapsedStorageKey: CONVERSATION_PANEL_COLLAPSED_STORAGE_KEY,
  defaultSystemPromptStorageKey: DEFAULT_SYSTEM_PROMPT_STORAGE_KEY,
  corsProxyStorageKey: CORS_PROXY_STORAGE_KEY,
  mcpServersStorageKey: MCP_SERVERS_STORAGE_KEY,
  modelStorageKey: MODEL_STORAGE_KEY,
  backendStorageKey: BACKEND_STORAGE_KEY,
  supportedBackendPreferences: SUPPORTED_BACKEND_PREFERENCES,
  webGpuRequiredModelSuffix: WEBGPU_REQUIRED_MODEL_SUFFIX,
  availableToolDefinitions: getEnabledToolDefinitions(),
  themeSelect,
  showThinkingToggle,
  enableToolCallingToggle,
  toolSettingsList,
  corsProxyInput,
  corsProxyFeedback,
  mcpServerEndpointInput,
  addMcpServerButton,
  mcpServerAddFeedback,
  mcpServersList,
  renderMathMlToggle,
  enableSingleKeyShortcutsToggle,
  transcriptViewSelect,
  conversationPanelCollapseButton,
  conversationPanelCollapseButtonText,
  defaultSystemPromptInput,
  modelSelect,
  modelCardList,
  backendSelect,
  colorSchemeQuery,
  refreshModelThinkingVisibility,
  getRuntimeConfigForModel,
  syncGenerationSettingsFromModel,
  persistGenerationConfigForModel,
  validateCorsProxyUrl: (proxyUrl, options = {}) =>
    validateCorsProxyUrl(proxyUrl, {
      ...options,
      fetchRef: baseFetchRef,
    }),
  inspectMcpServerEndpoint: (endpoint, options = {}) =>
    inspectMcpServerEndpoint(endpoint, {
      ...options,
      fetchRef: corsAwareFetch,
    }),
  setStatus,
  appendDebug,
});

const {
  applyDefaultSystemPrompt,
  applyCorsProxyPreference,
  applyMathRenderingPreference,
  applyEnabledToolNamesPreference,
  applyShowThinkingPreference,
  applyTheme,
  applyToolEnabledPreference,
  applyToolCallingPreference,
  applyMcpServerEnabledPreference,
  applyMcpServerCommandEnabledPreference,
  applyMcpServersPreference,
  applyTranscriptViewPreference,
  applyConversationPanelCollapsedPreference,
  applySingleKeyShortcutPreference,
  clearCorsProxyFeedback,
  clearCorsProxyPreference,
  clearMcpServerFeedback,
  getStoredCorsProxyPreference,
  formatBackendPreferenceLabel,
  getAvailableModelId,
  getStoredDefaultSystemPrompt,
  getStoredEnabledToolNamesPreference,
  getStoredMathRenderingPreference,
  getStoredMcpServersPreference,
  getStoredShowThinkingPreference,
  getStoredSingleKeyShortcutPreference,
  getStoredThemePreference,
  getStoredToolCallingPreference,
  getStoredTranscriptViewPreference,
  getStoredConversationPanelCollapsedPreference,
  getWebGpuAvailability,
  importMcpServerEndpoint,
  normalizeBackendPreference,
  persistInferencePreferences,
  populateModelSelect,
  probeWebGpuAvailability,
  readEngineConfigFromUI,
  saveCorsProxyPreference,
  refreshMcpServerPreference,
  removeMcpServerPreference,
  restoreInferencePreferences,
  setSelectedModelId,
  setCorsProxyFeedback,
  setMcpServerFeedback,
  syncModelSelectionForCurrentEnvironment,
} = preferencesController;

function applyConversationLanguagePreference(value, { persist = false } = {}) {
  const normalizedValue = normalizeConversationLanguagePreference(value);
  const activeConversation = getActiveConversation();
  if (activeConversation) {
    activeConversation.languagePreference = normalizedValue;
    if (persist) {
      queueConversationStateSave();
    }
  } else {
    appState.pendingConversationLanguagePreference = normalizedValue;
  }
  syncConversationLanguageAndThinkingControls(activeConversation);
}

function applyConversationThinkingPreference(value, { persist = false } = {}) {
  const activeConversation = getActiveConversation();
  const nextValue = normalizeConversationThinkingEnabled(value);
  if (activeConversation) {
    activeConversation.thinkingEnabled = nextValue;
    if (persist) {
      queueConversationStateSave();
    }
  } else {
    appState.pendingConversationThinkingEnabled = nextValue;
  }
  syncConversationLanguageAndThinkingControls(activeConversation);
}

function resetPendingConversationModelPreferences() {
  const selectedModelId = normalizeModelId(modelSelect?.value || DEFAULT_MODEL);
  appState.pendingConversationLanguagePreference = 'auto';
  appState.pendingConversationThinkingEnabled =
    getThinkingControlForModel(selectedModelId)?.defaultEnabled !== false;
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
  executeToolCall: (toolCall) =>
    executeToolCall(toolCall, {
      conversation: getActiveConversation(),
      enabledToolNames: getConfiguredEnabledToolNames(),
      mcpServers: getConfiguredEnabledMcpServers(),
      requestToolConsent,
      onShellCommandStart: handleShellCommandStart,
      onShellCommandComplete: handleShellCommandComplete,
      onWebLookupSearchStart: handleWebLookupSearchStart,
      onWebLookupSearchComplete: handleWebLookupSearchComplete,
      fetchRef: corsAwareFetch,
      pythonExecutor,
      workspaceFileSystem: getConversationWorkspaceFileSystem(),
    }),
  getSelectedModelId: () => modelSelect?.value || DEFAULT_MODEL,
  getRuntimeConfigForConversation: (conversation) => buildConversationRuntimeConfig(conversation),
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
  streamUpdateIntervalMs: STREAM_UPDATE_INTERVAL_MS,
});

transcriptActions = createTranscriptActions({
  appState,
  chatTranscript,
  chatMain,
  windowRef: window,
  clamp,
  getActiveConversation,
  getMessageNodeById,
  getModelVariantState,
  getUserVariantState,
  findPreferredLeafForVariant,
  isEngineBusy,
  isOrchestrationRunningState,
  isVariantSwitchingState,
  isMessageEditActive,
  getActiveUserEditMessageId,
  isEngineReady,
  setSwitchingVariant,
  startUserMessageEditSession,
  clearUserMessageEditSession,
  addMessageToConversation,
  normalizeMessageContentParts,
  setUserMessageText,
  pruneDescendantsFromMessage,
  buildPromptForActiveConversation,
  startModelGeneration: (conversation, prompt, options) =>
    appController.startModelGeneration(conversation, prompt, options),
  renderTranscript,
  updateActionButtons,
  queueConversationStateSave,
  ensureModelVariantControlsVisible,
  setStatus,
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
applyEnabledToolNamesPreference(getStoredEnabledToolNamesPreference());
applyCorsProxyPreference(getStoredCorsProxyPreference());
applyMcpServersPreference(getStoredMcpServersPreference());
applyMathRenderingPreference(getStoredMathRenderingPreference());
applySingleKeyShortcutPreference(getStoredSingleKeyShortcutPreference());
applyTranscriptViewPreference(getStoredTranscriptViewPreference());
applyConversationPanelCollapsedPreference(getStoredConversationPanelCollapsedPreference());
applyDefaultSystemPrompt(getStoredDefaultSystemPrompt());
if (appState.renderMathMl) {
  void ensureMathJaxLoaded();
}
populateModelSelect();
restoreInferencePreferences();
syncConversationLanguageAndThinkingControls();
void probeWebGpuAvailability();
showProgressRegion(false);
renderComposerAttachments();
updateActionButtons();
setActiveSettingsTab(appState.activeSettingsTab);
updateWelcomePanelVisibility({ syncRoute: false });
skipLinkElements.forEach((link) => {
  if (!(link instanceof HTMLElement)) {
    return;
  }
  link.addEventListener('click', (event) => {
    event.preventDefault();
    const targetId = link.dataset.skipTarget;
    if (!targetId) {
      return;
    }
    focusSkipTarget(targetId);
  });
});
updateSkipLinkVisibility();
applyAppRouteFromHash();
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
  toolSettingsList,
  corsProxyForm,
  corsProxyInput,
  saveCorsProxyButton,
  clearCorsProxyButton,
  mcpServerEndpointForm,
  mcpServerEndpointInput,
  addMcpServerButton,
  mcpServerAddFeedback,
  mcpServersList,
  renderMathMlToggle,
  enableSingleKeyShortcutsToggle,
  transcriptViewSelect,
  defaultSystemPromptInput,
  conversationLanguageSelect,
  enableModelThinkingToggle,
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
  applyToolEnabledPreference,
  saveCorsProxyPreference,
  clearCorsProxyPreference,
  setCorsProxyFeedback,
  clearCorsProxyFeedback,
  applyMcpServerEnabledPreference,
  applyMcpServerCommandEnabledPreference,
  applyMathRenderingPreference,
  applySingleKeyShortcutPreference,
  applyTranscriptViewPreference,
  applyDefaultSystemPrompt,
  applyConversationLanguagePreference,
  applyConversationThinkingPreference,
  clearMcpServerFeedback,
  importMcpServerEndpoint,
  refreshMathRendering: () => {
    if (appState.renderMathMl) {
      void ensureMathJaxLoaded();
    }
    renderTranscript();
  },
  refreshConversationSystemPromptPreview: updateConversationSystemPromptPreview,
  refreshMcpServerPreference,
  removeMcpServerPreference,
  setMcpServerFeedback,
  syncModelSelectionForCurrentEnvironment,
  syncConversationLanguageAndThinkingControls,
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
  deleteConversationStorage,
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
  attachReferenceMenuItem,
  attachWorkWithMenuItem,
  imageAttachmentInput,
  composerAttachmentTray,
  isGeneratingResponse,
  isOrchestrationRunningState,
  isMessageEditActive,
  isEngineReady,
  hasStartedWorkspace: selectHasStartedWorkspace,
  setChatWorkspaceStarted,
  setPreparingNewConversation,
  updateWelcomePanelVisibility,
  getPendingComposerAttachments,
  selectedModelSupportsImageInput,
  getSelectedModelAttachmentSupport,
  createComposerAttachmentFromFile: async (file, options = {}) => {
    const { createComposerAttachmentFromFile } = await loadComposerAttachmentModule();
    return createComposerAttachmentFromFile(file, {
      ...options,
      workspaceFileSystem:
        getConversationWorkspaceFileSystem() ||
        getConversationWorkspaceFileSystem(reservePendingConversationId()),
    });
  },
  beginComposerAttachmentOperation: () => {
    beginAttachmentOperation(appState);
    renderComposerAttachments();
    updateActionButtons();
  },
  endComposerAttachmentOperation: () => {
    endAttachmentOperation(appState);
    renderComposerAttachments();
    updateActionButtons();
  },
  isProcessingComposerAttachments: () => isProcessingAttachments(appState),
  renderComposerAttachments,
  updateActionButtons,
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
  syncRouteToState: syncRouteToCurrentState,
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
  setPreparingNewConversation,
  updateWelcomePanelVisibility,
  clearUserMessageEditSession,
  setChatTitleEditing,
  clearPendingComposerAttachments,
  resetPendingConversationModelPreferences,
  renderConversationList,
  renderTranscript,
  syncConversationLanguageAndThinkingControls,
  updateChatTitle,
  queueConversationStateSave,
  openKeyboardShortcuts,
  closeKeyboardShortcuts,
  handleGlobalShortcut,
  handleFocusedMessageShortcut,
  applyRouteFromHash: applyAppRouteFromHash,
  persistConversationStateNow,
  disposeEngine: () => engine.dispose(),
  disposePythonRuntime,
  preChatEditConversationSystemPromptBtn,
  beginConversationSystemPromptEdit,
  preChatLoadModelBtn,
  loadModelForSelectedConversation: () => appController.loadModelForSelectedConversation(),
  saveChatTitleBtn,
  saveChatTitleEdit,
  cancelChatTitleBtn,
  cancelChatTitleEdit,
  conversationSystemPromptInput,
  conversationSystemPromptAppendToggle,
  saveConversationSystemPromptBtn,
  saveConversationSystemPromptEdit,
  updateConversationSystemPromptPreview,
  chatTitleInput,
  updateChatTitleEditorVisibility,
  onConversationSystemPromptModalShown: () => {
    appState.isConversationSystemPromptModalOpen = true;
    syncRouteToCurrentState({ replace: false });
  },
  onConversationSystemPromptModalHidden: () => {
    appState.isConversationSystemPromptModalOpen = false;
    syncRouteToCurrentState({ replace: false });
  },
});
