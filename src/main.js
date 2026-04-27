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
  createConversationDownloadController,
  triggerDownload,
} from './app/conversation-downloads.js';
import { createDebugLogController } from './app/debug-log.js';
import { createMessageCopyController } from './app/message-copy.js';
import { createCloudProviderSettingsController } from './app/cloud-provider-settings.js';
import {
  createAgentAutomationController,
  estimatePromptTokenCount,
} from './app/agent-automation.js';
import {
  formatAttachmentSize,
  getAttachmentButtonAcceptValue,
  getAttachmentIconClass,
} from './attachments/attachment-ui.js';
import { createConversationEditors } from './app/conversation-editors.js';
import { createModelLoadFeedbackController } from './app/model-load-feedback.js';
import { createSemanticMemoryController } from './app/semantic-memory.js';
import './styles.css';
import { bindConversationListEvents } from './app/conversation-list-events.js';
import { createPreferencesController } from './app/preferences.js';
import { createRoutingShell } from './app/routing-shell.js';
import { bindShellEvents } from './app/shell-events.js';
import { bindSettingsEvents } from './app/settings-events.js';
import { createShortcutHandlers } from './app/shortcut-events.js';
import { applyStatusRegion } from './app/status-region.js';
import { createTranscriptContentRenderer } from './app/transcript-content-renderer.js';
import { createTranscriptNavigationController } from './app/transcript-navigation.js';
import { createTranscriptActions } from './app/transcript-actions.js';
import { bindTranscriptEvents } from './app/transcript-events.js';
import { createViewportLayoutController } from './app/viewport-layout.js';
import { createWorkspaceSidePanelsController } from './app/workspace-side-panels.js';
import { LLMEngineClient } from './llm/engine-client.js';
import { createCorsAwareFetch, validateCorsProxyUrl } from './llm/browser-fetch.js';
import { createOrchestrationRunner } from './llm/orchestration-runner.js';
import { shouldUseMultimodalGenerationForPrompt } from './llm/runtime-config.js';
import { expandWllamaModelUrls } from './llm/wllama-load.js';
import { getEnabledMcpServerConfigs, inspectMcpServerEndpoint } from './llm/mcp-client.js';
import {
  buildFactCheckingPrompt,
  buildLanguagePreferencePrompt,
  buildMathRenderingFeaturePrompt,
  buildOptionalFeaturePromptSection,
  buildThinkingModePrompt,
} from './llm/system-prompt.js';
import { parseThinkingText } from './llm/thinking-parser.js';
import {
  buildToolCallingSystemPrompt,
  executeToolCall,
  getEnabledToolDefinitions,
  getEnabledToolNames,
  getImplicitlyEnabledToolDefinitions,
  getImplicitlyEnabledToolNames,
  getToolDisplayName,
  sniffToolCalls,
} from './llm/tool-calling.js';
import {
  getEnabledSkillPackages,
  getUsableSkillPackages,
  normalizeSkillLookupName,
  parseSkillArchiveBytes,
} from './skills/skill-packages.js';
import { matchCustomOrchestrationSlashCommand } from './orchestrations/custom-orchestrations.js';
import renameChatOrchestration from './config/orchestrations/rename-chat.json';
import fixResponseOrchestration from './config/orchestrations/fix-response.json';
import agentFollowUpOrchestration from './config/orchestrations/agent-follow-up.json';
import pdfToMarkdownOrchestration from './config/orchestrations/pdf-to-markdown.json';
import summarizeConversationOrchestration from './config/orchestrations/summarize-conversation.json';
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
  getModelGenerationLimits as getConfiguredModelGenerationLimits,
  getModelEngineType,
  getModelAvailability,
  clamp,
  browserSupportsWebGpu,
  normalizeGenerationLimits,
  normalizeModelId,
  resolveRuntimeDtypeForBackend,
  replaceRuntimeModelCatalog,
} from './config/model-settings.js';
import {
  buildDefaultWllamaSettings,
  sanitizeWllamaSettings,
  canUseWllamaPromptCache,
  MAX_WLLAMA_BATCH_SIZE,
  MAX_WLLAMA_PROMPT_CACHE_CONTEXT_TOKENS,
  MAX_WLLAMA_MIN_P,
  MIN_WLLAMA_BATCH_SIZE,
  MIN_WLLAMA_MIN_P,
  WLLAMA_BATCH_SIZE_STEP,
  WLLAMA_MIN_P_STEP,
} from './config/wllama-settings.js';
import { buildRuntimeModelCatalog } from './cloud/cloud-provider-config.js';
import { inspectOpenAiCompatibleEndpoint } from './cloud/openai-compatible.js';
import { normalizeMessageContentParts, setUserMessageText } from './state/conversation-content.js';
import {
  CONVERSATION_TYPES,
  addMessageToConversation,
  buildPromptForConversationLeaf,
  createConversation as createConversationRecord,
  deriveConversationMenuCapabilities,
  deriveConversationName,
  findPreferredLeafForVariant,
  getConversationCardHeading,
  getConversationPathMessages,
  getTaskListForConversationLeaf,
  getMessageNodeById,
  getModelVariantState,
  getUserVariantState,
  isAgentConversation,
  isHeartbeatMessage,
  normalizeConversationLanguagePreference,
  normalizeConversationName,
  normalizeConversationType,
  normalizeConversationPromptMode,
  normalizeConversationThinkingEnabled,
  normalizeSystemPrompt,
  pruneDescendantsFromMessage,
} from './state/conversation-model.js';
import { createAppController } from './state/app-controller.js';
import {
  applyStoredConversationState,
  buildConversationStateSnapshot,
} from './state/conversation-serialization.js';
import {
  loadCustomOrchestrations,
  removeCustomOrchestration,
  saveCustomOrchestration,
} from './state/orchestration-store.js';
import { loadSkillPackages, removeSkillPackage, saveSkillPackage } from './state/skill-store.js';
import {
  clearSemanticMemories,
  loadSemanticMemories,
  replaceSemanticMemories,
} from './state/semantic-memory-store.js';
import {
  ORCHESTRATION_KINDS,
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
  isBlockingOrchestrationState,
  isChatTitleEditingState,
  isEngineBusy,
  isEngineReady,
  isGeneratingResponse,
  isProcessingAttachments,
  isTerminalOpenForConversation,
  isMessageEditActive,
  isSettingsView,
  isVariantSwitchingState,
  isLoadingModelState,
  openTerminalForConversation,
  setOrchestrationRunning,
  setPreparingNewConversation,
  setChatTitleEditing,
  setChatWorkspaceStarted,
  setSwitchingVariant,
  setUserMessageEditState,
  shouldDisableNewAgentButton,
  shouldDisableNewConversationButton,
  shouldShowNewConversationButton as selectShouldShowNewConversationButton,
  shouldDisableConversationControls,
  shouldDisableComposerForPreChatConversationSelection as selectShouldDisableComposerForPreChatConversationSelection,
} from './state/app-state.js';
import { loadConversationState, saveConversationState } from './state/conversation-store.js';
import {
  getCloudProviderSecret,
  loadCloudProviders as loadStoredCloudProviders,
  removeCloudProvider as removeStoredCloudProvider,
  saveCloudProvider as saveStoredCloudProvider,
  saveCloudProviderSecret as saveStoredCloudProviderSecret,
  updateCloudProvider as updateStoredCloudProvider,
} from './state/cloud-provider-store.js';
import { PRECONFIGURED_CLOUD_PROVIDERS } from './config/preconfigured-cloud-providers.js';
import { renderConversationListView } from './ui/conversation-list-view.js';
import { createTranscriptView } from './ui/transcript-view.js';
import { renderTaskListTray } from './ui/task-list-tray.js';
import {
  CONVERSATION_WORKSPACE_DIRECTORY_NAME,
  createConversationWorkspaceFileSystem,
  createWorkspaceFileSystem,
  WORKSPACE_ROOT_PATH,
} from './workspace/workspace-file-system.js';

const THEME_STORAGE_KEY = 'ui-theme-preference';
const SHOW_THINKING_STORAGE_KEY = 'ui-show-thinking';
const ENABLE_TOOL_CALLING_STORAGE_KEY = 'conversation-enable-tool-calling';
const ENABLED_TOOLS_STORAGE_KEY = 'conversation-enabled-tools';
const ENABLED_TOOL_MIGRATIONS_STORAGE_KEY = 'conversation-enabled-tool-migrations';
const RENDER_MATHML_STORAGE_KEY = 'conversation-render-mathml';
const SINGLE_KEY_SHORTCUTS_STORAGE_KEY = 'ui-enable-single-key-shortcuts';
const TRANSCRIPT_VIEW_STORAGE_KEY = 'ui-transcript-view';
const CONVERSATION_PANEL_COLLAPSED_STORAGE_KEY = 'ui-conversation-panel-collapsed';
const DEFAULT_SYSTEM_PROMPT_STORAGE_KEY = 'conversation-default-system-prompt';
const CORS_PROXY_STORAGE_KEY = 'cors-proxy-url';
const MCP_SERVERS_STORAGE_KEY = 'mcp-server-configurations';
const MODEL_STORAGE_KEY = 'llm-model-preference';
const BACKEND_STORAGE_KEY = 'llm-backend-preference';
const CPU_THREADS_STORAGE_KEY = 'llm-cpu-threads-preference';
const MODEL_GENERATION_SETTINGS_STORAGE_KEY = 'llm-model-generation-settings';
const MODEL_WLLAMA_SETTINGS_STORAGE_KEY = 'llm-model-wllama-settings';
const TOOL_CONSENT_STORAGE_KEY = 'tool-consents-v1';
const UNTITLED_CONVERSATION_PREFIX = 'New Conversation';
const SUPPORTED_BACKEND_PREFERENCES = new Set(['webgpu', 'cpu']);
const WEBGPU_REQUIRED_MODEL_SUFFIX = ' (WebGPU required)';
const FIX_RESPONSE_ORCHESTRATION = fixResponseOrchestration;
const RENAME_CHAT_ORCHESTRATION = renameChatOrchestration;
const BUILT_IN_ORCHESTRATIONS = [
  {
    id: 'rename-chat',
    name: 'Rename Chat',
    description: 'Generates a concise conversation title after the first exchange.',
    usageLabel: 'Used for automatic conversation renaming.',
    definition: renameChatOrchestration,
  },
  {
    id: 'fix-response',
    name: 'Fix Response',
    description:
      'Critiques, revises, and validates a response before streaming a corrected variant.',
    usageLabel: 'Used by the transcript Fix action.',
    definition: fixResponseOrchestration,
  },
  {
    id: 'agent-follow-up',
    name: 'Agent Follow-up',
    description: 'Decides whether an active agent should post a short proactive follow-up.',
    usageLabel: 'Used by scheduled agent follow-up automation.',
    definition: agentFollowUpOrchestration,
  },
  {
    id: 'summarize-conversation',
    name: 'Summarize Conversation',
    description: 'Compacts older agent context into a durable summary node and memory seed.',
    usageLabel: 'Used by agent-context summarization.',
    definition: summarizeConversationOrchestration,
  },
  {
    id: 'pdf-to-markdown',
    name: 'PDF to Markdown',
    description: 'Chunks extracted PDF text and merges conservative Markdown output.',
    usageLabel: 'Reserved for built-in document preparation flows.',
    definition: pdfToMarkdownOrchestration,
  },
];
const CONVERSATION_SAVE_DEBOUNCE_MS = 300;
const STREAM_UPDATE_INTERVAL_MS = 32;
const AGENT_FOLLOW_UP_INTERVAL_MS = 15 * 60 * 1000;
const AGENT_FOLLOW_UP_BUSY_RETRY_MS = 30 * 1000;
const AGENT_SUMMARY_TRIGGER_RATIO = 0.9;
const AGENT_SUMMARY_MIN_MESSAGES = 8;
const DEBUG_LOG_PAGE_SIZE = 20;
const TRANSCRIPT_BOTTOM_THRESHOLD_PX = 24;
const ROUTE_NEW_AGENT = 'new-agent';

const themeSelect = /** @type {HTMLSelectElement | null} */ (
  document.getElementById('themeSelect')
);
const showThinkingToggle = /** @type {HTMLInputElement | null} */ (
  document.getElementById('showThinkingToggle')
);
const enableToolCallingToggle = /** @type {HTMLInputElement | null} */ (
  document.getElementById('enableToolCallingToggle')
);
const toolSettingsList = /** @type {HTMLElement | null} */ (
  document.getElementById('toolSettingsList')
);
const orchestrationEditorHeading = /** @type {HTMLElement | null} */ (
  document.getElementById('orchestrationEditorHeading')
);
const orchestrationEditorForm = /** @type {HTMLFormElement | null} */ (
  document.getElementById('orchestrationEditorForm')
);
const orchestrationEditorIdInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('orchestrationEditorIdInput')
);
const orchestrationNameInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('orchestrationNameInput')
);
const orchestrationSlashCommandInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('orchestrationSlashCommandInput')
);
const orchestrationDescriptionInput = /** @type {HTMLTextAreaElement | null} */ (
  document.getElementById('orchestrationDescriptionInput')
);
const orchestrationDefinitionInput = /** @type {HTMLTextAreaElement | null} */ (
  document.getElementById('orchestrationDefinitionInput')
);
const orchestrationStepList = /** @type {HTMLElement | null} */ (
  document.getElementById('orchestrationStepList')
);
const orchestrationStepEditorFeedback = /** @type {HTMLElement | null} */ (
  document.getElementById('orchestrationStepEditorFeedback')
);
const orchestrationSaveButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('orchestrationSaveButton')
);
const orchestrationResetButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('orchestrationResetButton')
);
const orchestrationImportForm = /** @type {HTMLFormElement | null} */ (
  document.getElementById('orchestrationImportForm')
);
const orchestrationImportInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('orchestrationImportInput')
);
const orchestrationImportButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('orchestrationImportButton')
);
const exportAllOrchestrationsButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('exportAllOrchestrationsButton')
);
const orchestrationImportFeedback = /** @type {HTMLElement | null} */ (
  document.getElementById('orchestrationImportFeedback')
);
const customOrchestrationsList = /** @type {HTMLElement | null} */ (
  document.getElementById('customOrchestrationsList')
);
const builtInOrchestrationsList = /** @type {HTMLElement | null} */ (
  document.getElementById('builtInOrchestrationsList')
);
const skillPackageForm = /** @type {HTMLFormElement | null} */ (
  document.getElementById('skillPackageForm')
);
const skillPackageInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('skillPackageInput')
);
const addSkillPackageButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('addSkillPackageButton')
);
const skillPackageAddFeedback = /** @type {HTMLElement | null} */ (
  document.getElementById('skillPackageAddFeedback')
);
const skillsList = /** @type {HTMLElement | null} */ (document.getElementById('skillsList'));
const cloudProviderForm = /** @type {HTMLFormElement | null} */ (
  document.getElementById('cloudProviderForm')
);
const cloudProviderNameInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('cloudProviderNameInput')
);
const cloudProviderEndpointInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('cloudProviderEndpointInput')
);
const cloudProviderApiKeyInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('cloudProviderApiKeyInput')
);
const addCloudProviderButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('addCloudProviderButton')
);
const cloudProviderAddFeedback = /** @type {HTMLElement | null} */ (
  document.getElementById('cloudProviderAddFeedback')
);
const cloudProvidersList = /** @type {HTMLElement | null} */ (
  document.getElementById('cloudProvidersList')
);
const corsProxyForm = /** @type {HTMLFormElement | null} */ (
  document.getElementById('corsProxyForm')
);
const corsProxyInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('corsProxyInput')
);
const saveCorsProxyButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('saveCorsProxyButton')
);
const clearCorsProxyButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('clearCorsProxyButton')
);
const corsProxyFeedback = /** @type {HTMLElement | null} */ (
  document.getElementById('corsProxyFeedback')
);
const mcpServerEndpointForm = /** @type {HTMLFormElement | null} */ (
  document.getElementById('mcpServerEndpointForm')
);
const mcpServerEndpointInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('mcpServerEndpointInput')
);
const addMcpServerButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('addMcpServerButton')
);
const mcpServerAddFeedback = /** @type {HTMLElement | null} */ (
  document.getElementById('mcpServerAddFeedback')
);
const mcpServersList = /** @type {HTMLElement | null} */ (
  document.getElementById('mcpServersList')
);
const renderMathMlToggle = /** @type {HTMLInputElement | null} */ (
  document.getElementById('renderMathMlToggle')
);
const defaultSystemPromptInput = /** @type {HTMLTextAreaElement | null} */ (
  document.getElementById('defaultSystemPromptInput')
);
const exportConversationsButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('exportConversationsButton')
);
const deleteConversationsButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('deleteConversationsButton')
);
const conversationLanguageSelect = /** @type {HTMLSelectElement | null} */ (
  document.getElementById('conversationLanguageSelect')
);
const conversationLanguageHelp = /** @type {HTMLElement | null} */ (
  document.getElementById('conversationLanguageHelp')
);
const enableModelThinkingToggle = /** @type {HTMLInputElement | null} */ (
  document.getElementById('enableModelThinkingToggle')
);
const enableModelThinkingHelp = /** @type {HTMLElement | null} */ (
  document.getElementById('enableModelThinkingHelp')
);
const modelSelect = /** @type {HTMLSelectElement | null} */ (
  document.getElementById('modelSelect')
);
const modelCardList = /** @type {HTMLElement | null} */ (document.getElementById('modelCardList'));
const backendSelect = /** @type {HTMLSelectElement | null} */ (
  document.getElementById('backendSelect')
);
const cpuThreadsInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('cpuThreadsInput')
);
const clearModelDownloadsButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('clearModelDownloadsButton')
);
const clearModelDownloadsHelp = /** @type {HTMLElement | null} */ (
  document.getElementById('clearModelDownloadsHelp')
);
const maxOutputTokensInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('maxOutputTokensInput')
);
const maxContextTokensInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('maxContextTokensInput')
);
const temperatureInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('temperatureInput')
);
const resetContextTokensButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('resetContextTokensButton')
);
const resetTemperatureButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('resetTemperatureButton')
);
const resetTopKButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('resetTopKButton')
);
const resetTopPButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('resetTopPButton')
);
const topKInput = /** @type {HTMLInputElement | null} */ (document.getElementById('topKInput'));
const topPInput = /** @type {HTMLInputElement | null} */ (document.getElementById('topPInput'));
const wllamaSettingsSection = /** @type {HTMLElement | null} */ (
  document.getElementById('wllamaSettingsSection')
);
const wllamaPromptCacheToggle = /** @type {HTMLInputElement | null} */ (
  document.getElementById('wllamaPromptCacheToggle')
);
const wllamaPromptCacheHelp = /** @type {HTMLElement | null} */ (
  document.getElementById('wllamaPromptCacheHelp')
);
const wllamaBatchSizeInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('wllamaBatchSizeInput')
);
const wllamaBatchSizeHelp = /** @type {HTMLElement | null} */ (
  document.getElementById('wllamaBatchSizeHelp')
);
const wllamaMinPInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('wllamaMinPInput')
);
const wllamaMinPHelp = /** @type {HTMLElement | null} */ (
  document.getElementById('wllamaMinPHelp')
);
const maxOutputTokensHelp = /** @type {HTMLElement | null} */ (
  document.getElementById('maxOutputTokensHelp')
);
const maxContextTokensHelp = /** @type {HTMLElement | null} */ (
  document.getElementById('maxContextTokensHelp')
);
const temperatureHelp = /** @type {HTMLElement | null} */ (
  document.getElementById('temperatureHelp')
);
const topKHelp = /** @type {HTMLElement | null} */ (document.getElementById('topKHelp'));
const topPHelp = /** @type {HTMLElement | null} */ (document.getElementById('topPHelp'));
const statusRegion = /** @type {HTMLElement | null} */ (document.getElementById('statusRegion'));
const statusRegionHeading = /** @type {HTMLElement | null} */ (
  document.getElementById('statusRegionHeading')
);
const statusRegionMessage = /** @type {HTMLElement | null} */ (
  document.getElementById('statusRegionMessage')
);
const skipLinkElements = /** @type {HTMLElement[]} */ (
  Array.from(document.querySelectorAll('.skip-link[data-skip-target]'))
);
const appChrome = /** @type {HTMLElement | null} */ (document.querySelector('.app-chrome'));
const startConversationButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('startConversationButton')
);
const debugLogPanel = /** @type {HTMLElement | null} */ (document.getElementById('debugLogPanel'));
const modelLoadFeedback = /** @type {HTMLElement | null} */ (
  document.getElementById('modelLoadFeedback')
);
const transcriptModelLoadFeedbackHost = /** @type {HTMLElement | null} */ (
  document.getElementById('transcriptModelLoadFeedbackHost')
);
const modelLoadProgressWrap = /** @type {HTMLElement | null} */ (
  document.getElementById('modelLoadProgressWrap')
);
const modelLoadProgressLabel = /** @type {HTMLElement | null} */ (
  document.getElementById('modelLoadProgressLabel')
);
const modelLoadProgressValue = /** @type {HTMLElement | null} */ (
  document.getElementById('modelLoadProgressValue')
);
const modelLoadProgressBar = /** @type {HTMLElement | null} */ (
  document.getElementById('modelLoadProgressBar')
);
const modelLoadProgressSummary = /** @type {HTMLElement | null} */ (
  document.getElementById('modelLoadProgressSummary')
);
const modelLoadCurrentFileLabel = /** @type {HTMLElement | null} */ (
  document.getElementById('modelLoadCurrentFileLabel')
);
const modelLoadCurrentFileValue = /** @type {HTMLElement | null} */ (
  document.getElementById('modelLoadCurrentFileValue')
);
const modelLoadCurrentFileBar = /** @type {HTMLElement | null} */ (
  document.getElementById('modelLoadCurrentFileBar')
);
const modelLoadError = /** @type {HTMLElement | null} */ (
  document.getElementById('modelLoadError')
);
const modelLoadErrorSummary = /** @type {HTMLElement | null} */ (
  document.getElementById('modelLoadErrorSummary')
);
const modelLoadErrorDetails = /** @type {HTMLElement | null} */ (
  document.getElementById('modelLoadErrorDetails')
);
const sendButton = /** @type {HTMLButtonElement | null} */ (document.getElementById('sendButton'));
const conversationList = /** @type {HTMLElement | null} */ (
  document.getElementById('conversationList')
);
const newConversationBtn = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('newConversationBtn')
);
const newAgentBtn = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('newAgentBtn')
);
const chatForm = /** @type {HTMLFormElement | null} */ (document.querySelector('.composer'));
const imageAttachmentInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('imageAttachmentInput')
);
const composerAttachmentTray = /** @type {HTMLElement | null} */ (
  document.getElementById('composerAttachmentTray')
);
const addImagesButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('addImagesButton')
);
const attachReferenceMenuItem = /** @type {HTMLElement | null} */ (
  document.getElementById('attachReferenceMenuItem')
);
const attachWorkWithMenuItem = /** @type {HTMLElement | null} */ (
  document.getElementById('attachWorkWithMenuItem')
);
const messageInput = /** @type {HTMLTextAreaElement | null} */ (
  document.getElementById('messageInput')
);
const chatTranscript = /** @type {HTMLElement | null} */ (
  document.getElementById('chatTranscript')
);
const chatTranscriptWrap = /** @type {HTMLElement | null} */ (
  document.getElementById('chatTranscriptWrap')
);
const chatTranscriptStart = /** @type {HTMLElement | null} */ (
  document.getElementById('chatTranscriptStart')
);
const chatTranscriptEnd = /** @type {HTMLElement | null} */ (
  document.getElementById('chatTranscriptEnd')
);
const taskListTray = /** @type {HTMLElement | null} */ (document.getElementById('taskListTray'));
const jumpToTopButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('jumpToTopButton')
);
const jumpToPreviousUserButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('jumpToPreviousUserButton')
);
const jumpToNextModelButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('jumpToNextModelButton')
);
const jumpToLatestButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('jumpToLatestButton')
);
const chatMain = /** @type {HTMLElement | null} */ (document.querySelector('.chat-main'));
let isTaskListTrayExpanded = false;
let reinitializeInferenceSettings = async () => {};
const homePanel = document.getElementById('homePanel');
const preChatPanel = document.getElementById('preChatPanel');
const preChatHeading = document.getElementById('preChatHeading');
const preChatLead = document.getElementById('preChatLead');
const preChatAgentFields = document.getElementById('preChatAgentFields');
const agentNameInput = document.getElementById('agentNameInput');
const agentPersonalityInput = document.getElementById('agentPersonalityInput');
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
const agentAutomationControls = document.getElementById('agentAutomationControls');
const pauseAgentBtn = document.getElementById('pauseAgentBtn');
const agentFollowUpCountdown = document.getElementById('agentFollowUpCountdown');
const agentFollowUpCountdownText = document.getElementById('agentFollowUpCountdownText');
const agentFollowUpAutomationHelp = document.getElementById('agentFollowUpAutomationHelp');
const agentFollowUpCountdownLive = document.getElementById('agentFollowUpCountdownLive');
const chatTitleInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('chatTitleInput')
);
const saveChatTitleBtn = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('saveChatTitleBtn')
);
const cancelChatTitleBtn = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('cancelChatTitleBtn')
);
const openKeyboardShortcutsButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('openKeyboardShortcutsButton')
);
const openKeyboardShortcutsMobileButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('openKeyboardShortcutsMobileButton')
);
const keyboardShortcutsModal = /** @type {HTMLElement | null} */ (
  document.getElementById('keyboardShortcutsModal')
);
const conversationPanelCollapseButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('conversationPanelCollapseButton')
);
const conversationPanelCollapseButtonText = document.getElementById(
  'conversationPanelCollapseButtonText'
);
const conversationSystemPromptModal = document.getElementById('conversationSystemPromptModal');
const conversationSystemPromptModalLabel = document.getElementById(
  'conversationSystemPromptModalLabel'
);
const conversationSystemPromptModalHelp = document.getElementById(
  'conversationSystemPromptModalHelp'
);
const conversationSystemPromptComputedLabel = document.getElementById(
  'conversationSystemPromptComputedLabel'
);
const conversationSystemPromptInput = document.getElementById('conversationSystemPromptInput');
const conversationSystemPromptAppendToggle = document.getElementById(
  'conversationSystemPromptAppendToggle'
);
const conversationSystemPromptComputedPreview = document.getElementById(
  'conversationSystemPromptComputedPreview'
);
const conversationPromptFields = document.getElementById('conversationPromptFields');
const agentPromptFields = document.getElementById('agentPromptFields');
const agentPromptNameInput = document.getElementById('agentPromptNameInput');
const agentPromptPersonalityInput = document.getElementById('agentPromptPersonalityInput');
const saveConversationSystemPromptBtn = document.getElementById('saveConversationSystemPromptBtn');
const openSettingsButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('openSettingsButton')
);
const closeSettingsButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('closeSettingsButton')
);
const enableSingleKeyShortcutsToggle = /** @type {HTMLInputElement | null} */ (
  document.getElementById('enableSingleKeyShortcutsToggle')
);
const transcriptViewSelect = /** @type {HTMLSelectElement | null} */ (
  document.getElementById('transcriptViewSelect')
);
const settingsPage = document.getElementById('settingsPage');
const terminalPanel = document.getElementById('terminalPanel');
const terminalHost = document.getElementById('terminalHost');
const closeTerminalButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('closeTerminalButton')
);
const settingsTabContainer = /** @type {HTMLElement | null} */ (
  document.querySelector('.settings-tabs')
);
const settingsTabButtons = settingsTabContainer
  ? Array.from(settingsTabContainer.querySelectorAll('[data-settings-tab]'))
  : [];
const settingsTabPanels = settingsPage
  ? Array.from(settingsPage.querySelectorAll('[data-settings-tab-panel]'))
  : [];
const colorSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const viewportLayoutController = createViewportLayoutController({
  windowRef: window,
  documentRef: document,
  appChrome,
});
viewportLayoutController.start();

const engine = new LLMEngineClient();
let pythonRuntime = null;
let pythonRuntimeLoadPromise = null;
let composerAttachmentModulePromise = null;
let agentFollowUpCountdownIntervalId = null;
let lastAgentFollowUpAnnouncementKey = '';
let agentAutomationController = null;
let semanticMemoryController = null;
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

const MAX_DEBUG_ENTRIES = 240;
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
  cloudProviders: [...PRECONFIGURED_CLOUD_PROVIDERS],
  mcpServers: [],
  maxDebugEntries: MAX_DEBUG_ENTRIES,
});
appState.webGpuAdapterAvailable = browserSupportsWebGpu();
const debugLogController = createDebugLogController({
  appState,
  container: debugLogPanel,
  pageSize: DEBUG_LOG_PAGE_SIZE,
  triggerDownload,
  setStatus,
});
const transcriptContentRenderer = createTranscriptContentRenderer({
  appState,
  windowRef: window,
  appendDebug,
  isGeneratingResponse: () => isGeneratingResponse(appState),
  renderTranscript: () => renderTranscript(),
});
const messageCopyController = createMessageCopyController({
  documentRef: document,
  navigatorRef: navigator,
  getActiveConversation,
  getMessageNodeById,
  getConversationPathMessages,
  findMessageElement,
  typesetMathInElement,
  extractMathMlFromElement,
  setStatus,
});
const baseFetchRef = typeof fetch === 'function' ? fetch.bind(globalThis) : null;
const corsAwareFetch = createCorsAwareFetch({
  fetchRef: baseFetchRef,
  getProxyUrl: () => appState.corsProxyUrl,
  locationRef: window.location,
});
const {
  clearLoadError,
  resetLoadProgressFiles,
  setFeedbackContext: setModelLoadFeedbackContext,
  setLoadProgress,
  showLoadError,
  showProgressRegion,
  syncFeedbackHost,
} = createModelLoadFeedbackController({
  appState,
  documentRef: document,
  modelLoadFeedback,
  transcriptFeedbackHost: transcriptModelLoadFeedbackHost,
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
  modelCardList,
  getSelectedModelId: () => modelSelect?.value || '',
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
const conversationDownloadController = createConversationDownloadController({
  appState,
  documentRef: document,
  urlApi: window.URL,
  getActiveConversation,
  getConversationModelId,
  getActiveTemperature: () =>
    Number.isFinite(engine?.config?.generationConfig?.temperature)
      ? Number(engine.config.generationConfig.temperature)
      : Number(
          appState.activeGenerationConfig?.temperature ??
            DEFAULT_GENERATION_LIMITS.defaultTemperature
        ),
  getConversationSystemPromptSuffix,
  getToolCallingContext,
  getMessageArtifacts,
  getStoredGenerationConfigForModel,
  getModelGenerationLimits,
  setStatus,
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

/**
 * @param {Element | Document | null | undefined} [root=document]
 */
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

/**
 * @param {Element | Document | null | undefined} root
 */
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

async function handleMessageCopyAction(messageId, copyType) {
  return messageCopyController.handleMessageCopyAction(messageId, copyType);
}

function extractMathMlFromElement(element) {
  return transcriptContentRenderer.extractMathMlFromElement(element);
}

function formatInteger(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatWordEstimateFromTokens(tokenCount) {
  const wordEstimate = Math.round(Number(tokenCount) * 0.75);
  return formatInteger(Math.max(0, wordEstimate));
}

function renderModelMarkdown(content) {
  return transcriptContentRenderer.renderModelMarkdown(content);
}

function ensureMathJaxLoaded() {
  return transcriptContentRenderer.ensureMathJaxLoaded();
}

async function typesetMathInElement(element) {
  return transcriptContentRenderer.typesetMathInElement(element);
}

function scheduleMathTypeset(element, options = {}) {
  transcriptContentRenderer.scheduleMathTypeset(element, options);
}

function getBaseModelGenerationLimits(modelId) {
  return (
    MODEL_OPTIONS_BY_ID.get(normalizeModelId(modelId))?.generation ||
    normalizeGenerationLimits(null)
  );
}

function getModelGenerationLimits(
  modelId,
  { backendPreference = backendSelect?.value || 'webgpu' } = {}
) {
  return getConfiguredModelGenerationLimits(normalizeModelId(modelId), { backendPreference });
}

function sanitizeGenerationConfigForModel(
  modelId,
  candidateConfig,
  { backendPreference = backendSelect?.value || 'webgpu' } = {}
) {
  return sanitizeGenerationConfig(
    candidateConfig,
    getModelGenerationLimits(modelId, { backendPreference })
  );
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
  return sanitizeGenerationConfig(stored, getBaseModelGenerationLimits(normalizedModelId));
}

function persistGenerationConfigForModel(modelId, config) {
  const normalizedModelId = normalizeModelId(modelId);
  const sanitized = sanitizeGenerationConfig(
    config,
    getBaseModelGenerationLimits(normalizedModelId)
  );
  const byModel = getStoredModelGenerationSettings();
  byModel[normalizedModelId] = sanitized;
  localStorage.setItem(MODEL_GENERATION_SETTINGS_STORAGE_KEY, JSON.stringify(byModel));
}

function isWllamaModel(modelId) {
  return getModelEngineType(modelId) === 'wllama';
}

function getStoredModelWllamaSettings() {
  try {
    const raw = localStorage.getItem(MODEL_WLLAMA_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function sanitizeWllamaSettingsForModel(modelId, candidateSettings, generationConfig = null) {
  const normalizedModelId = normalizeModelId(modelId);
  const normalizedGenerationConfig = sanitizeGenerationConfigForModel(
    normalizedModelId,
    generationConfig || appState.activeGenerationConfig
  );
  return sanitizeWllamaSettings(candidateSettings, {
    maxContextTokens: normalizedGenerationConfig.maxContextTokens,
  });
}

function getStoredWllamaSettingsForModel(modelId, generationConfig = null) {
  const normalizedModelId = normalizeModelId(modelId);
  if (!isWllamaModel(normalizedModelId)) {
    return null;
  }
  const byModel = getStoredModelWllamaSettings();
  const stored = byModel[normalizedModelId];
  if (!stored || typeof stored !== 'object') {
    return null;
  }
  return sanitizeWllamaSettingsForModel(normalizedModelId, stored, generationConfig);
}

function persistWllamaSettingsForModel(modelId, settings, generationConfig = null) {
  const normalizedModelId = normalizeModelId(modelId);
  if (!isWllamaModel(normalizedModelId)) {
    return;
  }
  const sanitized = sanitizeWllamaSettingsForModel(normalizedModelId, settings, generationConfig);
  const byModel = getStoredModelWllamaSettings();
  byModel[normalizedModelId] = sanitized;
  localStorage.setItem(MODEL_WLLAMA_SETTINGS_STORAGE_KEY, JSON.stringify(byModel));
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

function buildWllamaSettingsFromUI(modelId, generationConfig = null) {
  return sanitizeWllamaSettingsForModel(
    modelId,
    {
      usePromptCache: wllamaPromptCacheToggle?.checked !== false,
      batchSize: wllamaBatchSizeInput?.value,
      minP: wllamaMinPInput?.value,
    },
    generationConfig
  );
}

function getEffectiveWllamaSettingsForModel(modelId, generationConfig = null) {
  const normalizedModelId = normalizeModelId(modelId);
  if (!isWllamaModel(normalizedModelId)) {
    return null;
  }
  return (
    getStoredWllamaSettingsForModel(normalizedModelId, generationConfig) ||
    sanitizeWllamaSettingsForModel(
      normalizedModelId,
      buildDefaultWllamaSettings(),
      generationConfig
    )
  );
}

function renderClearModelDownloadsHelp(modelId) {
  if (!(clearModelDownloadsHelp instanceof HTMLElement)) {
    return;
  }
  clearModelDownloadsHelp.textContent = isWllamaModel(modelId)
    ? 'Clears cached wllama GGUF files for the selected local CPU model. Loaded in-memory sessions keep working until that model is reloaded.'
    : 'Clears cached Transformers.js files for the selected local ONNX model. Loaded in-memory sessions keep working until that model is reloaded.';
}

function renderWllamaSettingsVisibility(modelId) {
  if (!(wllamaSettingsSection instanceof HTMLElement)) {
    return;
  }
  const visible = isWllamaModel(modelId);
  wllamaSettingsSection.classList.toggle('d-none', !visible);
  if (visible) {
    wllamaSettingsSection.removeAttribute('aria-hidden');
  } else {
    wllamaSettingsSection.setAttribute('aria-hidden', 'true');
  }
}

function renderWllamaSettingsHelpText(settings, generationConfig) {
  const maxBatchSize = Math.max(
    MIN_WLLAMA_BATCH_SIZE,
    Math.min(
      MAX_WLLAMA_BATCH_SIZE,
      Number(generationConfig?.maxContextTokens) || MIN_WLLAMA_BATCH_SIZE
    )
  );
  const promptCacheAllowed = canUseWllamaPromptCache(generationConfig?.maxContextTokens);
  if (wllamaPromptCacheHelp) {
    wllamaPromptCacheHelp.textContent = !promptCacheAllowed
      ? `Prompt cache reuse is automatically disabled above ${formatInteger(
          MAX_WLLAMA_PROMPT_CACHE_CONTEXT_TOKENS
        )} context tokens to avoid browser memory spikes. Lower Context size to re-enable it.`
      : settings.usePromptCache
        ? 'Prompt cache reuse is enabled. Follow-up turns can reuse compatible prefixes instead of reprocessing the full prompt every time.'
        : 'Prompt cache reuse is disabled. Every turn starts from a cleared KV cache.';
  }
  if (wllamaBatchSizeHelp) {
    wllamaBatchSizeHelp.textContent = `Load-time prompt batch size. Higher values can speed prompt ingestion but use more memory. Allowed: ${formatInteger(
      MIN_WLLAMA_BATCH_SIZE
    )} to ${formatInteger(maxBatchSize)} in steps of ${formatInteger(WLLAMA_BATCH_SIZE_STEP)}.`;
  }
  if (wllamaMinPHelp) {
    wllamaMinPHelp.textContent = `Additional probability floor after Top K / Top P. ${MIN_WLLAMA_MIN_P.toFixed(
      2
    )} disables it; higher values can make wllama generations more selective. Allowed: ${MIN_WLLAMA_MIN_P.toFixed(
      2
    )} to ${MAX_WLLAMA_MIN_P.toFixed(2)} in steps of ${WLLAMA_MIN_P_STEP.toFixed(2)}.`;
  }
}

function syncWllamaSettingsFromModel(
  modelId,
  { useDefaults = true, generationConfig = null } = {}
) {
  const normalizedModelId = normalizeModelId(modelId);
  renderWllamaSettingsVisibility(normalizedModelId);
  renderClearModelDownloadsHelp(normalizedModelId);
  if (!isWllamaModel(normalizedModelId)) {
    return;
  }

  const effectiveGenerationConfig =
    generationConfig ||
    sanitizeGenerationConfigForModel(normalizedModelId, appState.activeGenerationConfig);
  const settings = useDefaults
    ? getEffectiveWllamaSettingsForModel(normalizedModelId, effectiveGenerationConfig)
    : buildWllamaSettingsFromUI(normalizedModelId, effectiveGenerationConfig);
  if (!settings) {
    return;
  }

  if (wllamaPromptCacheToggle instanceof HTMLInputElement) {
    wllamaPromptCacheToggle.checked = settings.usePromptCache;
  }
  if (wllamaBatchSizeInput instanceof HTMLInputElement) {
    wllamaBatchSizeInput.min = String(MIN_WLLAMA_BATCH_SIZE);
    wllamaBatchSizeInput.max = String(
      Math.max(
        MIN_WLLAMA_BATCH_SIZE,
        Math.min(MAX_WLLAMA_BATCH_SIZE, effectiveGenerationConfig.maxContextTokens)
      )
    );
    wllamaBatchSizeInput.step = String(WLLAMA_BATCH_SIZE_STEP);
    wllamaBatchSizeInput.value = String(settings.batchSize);
  }
  if (wllamaMinPInput instanceof HTMLInputElement) {
    wllamaMinPInput.min = MIN_WLLAMA_MIN_P.toFixed(2);
    wllamaMinPInput.max = MAX_WLLAMA_MIN_P.toFixed(2);
    wllamaMinPInput.step = WLLAMA_MIN_P_STEP.toFixed(2);
    wllamaMinPInput.value = settings.minP.toFixed(2);
  }
  renderWllamaSettingsHelpText(settings, effectiveGenerationConfig);
}

function renderGenerationSettingsHelpText(config, limits) {
  const normalizedModelId = normalizeModelId(modelSelect?.value || DEFAULT_MODEL);
  const baseLimits = getBaseModelGenerationLimits(normalizedModelId);
  const currentBackend = String(backendSelect?.value || 'webgpu')
    .trim()
    .toLowerCase();
  const backendLabel = currentBackend === 'cpu' ? 'CPU' : 'WebGPU';
  const hasReducedTokenLimits =
    Number(limits?.maxContextTokens) < Number(baseLimits?.maxContextTokens) ||
    Number(limits?.maxOutputTokens) < Number(baseLimits?.maxOutputTokens);
  const reducedTokenLimitsNote = hasReducedTokenLimits
    ? ` ${backendLabel} mode reduces this model's token budget in this app to avoid browser memory exhaustion.`
    : '';
  if (maxOutputTokensHelp) {
    maxOutputTokensHelp.textContent = `Allowed: ${formatInteger(MIN_TOKEN_LIMIT)} to ${formatInteger(
      Math.min(limits.maxOutputTokens, config.maxContextTokens)
    )} in steps of ${formatInteger(TOKEN_STEP)}. Estimated words: about ${formatWordEstimateFromTokens(config.maxOutputTokens)}.${reducedTokenLimitsNote}`;
  }
  if (maxContextTokensHelp) {
    maxContextTokensHelp.textContent = `Allowed: ${formatInteger(MIN_TOKEN_LIMIT)} to ${formatInteger(
      limits.maxContextTokens
    )} in steps of ${formatInteger(TOKEN_STEP)}. Estimated words: about ${formatWordEstimateFromTokens(config.maxContextTokens)}.${reducedTokenLimitsNote}`;
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
  const storedConfig = getStoredGenerationConfigForModel(normalizedModelId);
  const config = useDefaults
    ? sanitizeGenerationConfig(storedConfig || defaultConfig, limits)
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
  syncWllamaSettingsFromModel(normalizedModelId, {
    useDefaults,
    generationConfig: config,
  });
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
  if (wllamaPromptCacheToggle instanceof HTMLInputElement) {
    wllamaPromptCacheToggle.disabled = disabled;
  }
  if (wllamaBatchSizeInput instanceof HTMLInputElement) {
    wllamaBatchSizeInput.disabled = disabled;
  }
  if (wllamaMinPInput instanceof HTMLInputElement) {
    wllamaMinPInput.disabled = disabled;
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
  if (isWllamaModel(selectedModel)) {
    persistWllamaSettingsForModel(
      selectedModel,
      buildWllamaSettingsFromUI(selectedModel, nextConfig),
      nextConfig
    );
  }
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

function onWllamaSettingInputChanged() {
  const selectedModel = normalizeModelId(modelSelect?.value || DEFAULT_MODEL);
  if (!isWllamaModel(selectedModel)) {
    return;
  }
  const nextGenerationConfig = buildGenerationConfigFromUI(selectedModel);
  const nextWllamaSettings = buildWllamaSettingsFromUI(selectedModel, nextGenerationConfig);
  persistWllamaSettingsForModel(selectedModel, nextWllamaSettings, nextGenerationConfig);
  syncWllamaSettingsFromModel(selectedModel, {
    useDefaults: false,
    generationConfig: nextGenerationConfig,
  });
  if (isGeneratingResponse(appState)) {
    setStatus('wllama settings will apply on the next request.');
    appendDebug(
      `wllama settings changed during generation; promptCache=${nextWllamaSettings.usePromptCache}, batchSize=${nextWllamaSettings.batchSize}, minP=${nextWllamaSettings.minP.toFixed(2)}.`
    );
    return;
  }
  if (!isEngineReady(appState)) {
    setStatus('wllama settings updated.');
    appendDebug(
      `wllama settings updated while no model was loaded (promptCache=${nextWllamaSettings.usePromptCache}, batchSize=${nextWllamaSettings.batchSize}, minP=${nextWllamaSettings.minP.toFixed(2)}).`
    );
    return;
  }
  void reinitializeInferenceSettings();
  appendDebug(
    `wllama settings updated (promptCache=${nextWllamaSettings.usePromptCache}, batchSize=${nextWllamaSettings.batchSize}, minP=${nextWllamaSettings.minP.toFixed(2)}).`
  );
}

function renderDebugLog() {
  debugLogController.render();
}

function appendDebug(entryInput) {
  return debugLogController.append(entryInput);
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

function getConfiguredAvailableSkills() {
  return getEnabledSkillPackages(appState.skillPackages);
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
  const enabledSkills = getConfiguredAvailableSkills();
  const enabledMcpServers = getConfiguredEnabledMcpServers();
  const implicitToolNames = supported
    ? getImplicitlyEnabledToolNames(enabledMcpServers, enabledSkills)
    : [];
  const implicitToolDefinitions = supported
    ? getImplicitlyEnabledToolDefinitions(enabledMcpServers, enabledSkills)
    : [];
  return {
    enabled,
    supported,
    enabledTools: [...new Set([...enabledTools, ...implicitToolNames])],
    enabledSkills,
    enabledToolDefinitions: [...enabledToolDefinitions, ...implicitToolDefinitions],
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
    toolContext.exposedToolNames,
    toolContext.enabledToolDefinitions,
    {
      skills: toolContext.enabledSkills,
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
  const toolContext = getToolCallingContext(modelId);
  return buildOptionalFeaturePromptSection([
    buildFactCheckingPrompt({
      toolUseAvailable: toolContext.supported && toolContext.exposedToolNames.length > 0,
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

function buildConversationRuntimeConfigForPrompt(conversation = null, prompt = null) {
  const modelId = conversation
    ? getConversationModelId(conversation)
    : normalizeModelId(modelSelect?.value || DEFAULT_MODEL);
  const model = MODEL_OPTIONS_BY_ID.get(modelId);
  const runtime = model?.runtime || {};
  const features = model?.features || {};
  const inputLimits = model?.inputLimits || {};
  const multimodalGeneration = shouldUseMultimodalGenerationForPrompt(runtime, prompt);
  const thinkingControl = model?.thinkingControl || null;
  const thinkingEnabled = getConversationThinkingEnabled(conversation);
  const thinkingExtraBody = thinkingEnabled
    ? thinkingControl?.enabledExtraBody
    : thinkingControl?.disabledExtraBody;
  const baseRuntime = { ...runtime };
  const generationConfig = sanitizeGenerationConfigForModel(
    modelId,
    appState.activeGenerationConfig
  );
  const wllamaSettings = getEffectiveWllamaSettingsForModel(modelId, generationConfig);
  delete baseRuntime.multimodalGeneration;
  return {
    ...baseRuntime,
    ...(multimodalGeneration ? { multimodalGeneration: true } : {}),
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
    ...(thinkingExtraBody && typeof thinkingExtraBody === 'object'
      ? { extraBody: thinkingExtraBody }
      : {}),
    ...(wllamaSettings
      ? {
          usePromptCache: wllamaSettings.usePromptCache,
          batchSize: wllamaSettings.batchSize,
          minP: wllamaSettings.minP,
        }
      : {}),
    ...(model?.engine?.type === 'openai-compatible' && appState.corsProxyUrl
      ? { proxyUrl: appState.corsProxyUrl }
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
  conversationType = '',
  agentName = '',
  agentDescription = '',
} = {}) {
  const activeConversation = getActiveConversation();
  const previewConversationType = normalizeConversationType(
    conversationType || activeConversation?.conversationType || getPendingConversationType()
  );
  const modelId = activeConversation
    ? getConversationModelId(activeConversation)
    : normalizeModelId(modelSelect?.value || DEFAULT_MODEL);
  const normalizedConversationPrompt = normalizeSystemPrompt(conversationPrompt);
  const normalizedAppendConversationPrompt =
    normalizeConversationPromptMode(appendConversationPrompt);
  const normalizedAgentName = normalizeConversationName(agentName);
  const normalizedAgentDescription = normalizeSystemPrompt(agentDescription);
  const promptTarget = activeConversation
    ? {
        ...activeConversation,
        name:
          previewConversationType === CONVERSATION_TYPES.AGENT
            ? normalizedAgentName ||
              activeConversation?.agent?.name ||
              activeConversation.name ||
              'Agent'
            : activeConversation.name,
        conversationSystemPrompt: normalizedConversationPrompt,
        appendConversationSystemPrompt: normalizedAppendConversationPrompt,
        agent:
          previewConversationType === CONVERSATION_TYPES.AGENT
            ? {
                ...(activeConversation.agent || {}),
                name:
                  normalizedAgentName ||
                  activeConversation?.agent?.name ||
                  activeConversation.name ||
                  'Agent',
                description: normalizedAgentDescription,
              }
            : activeConversation.agent,
      }
    : {
        ...createConversationRecord({
          id: 'conversation-system-prompt-preview',
          name:
            previewConversationType === CONVERSATION_TYPES.AGENT
              ? normalizedAgentName || 'Agent'
              : 'Prompt Preview',
          modelId,
          conversationType: previewConversationType,
          systemPrompt: appState.defaultSystemPrompt,
          languagePreference: appState.pendingConversationLanguagePreference,
          thinkingEnabled: appState.pendingConversationThinkingEnabled,
          agent:
            previewConversationType === CONVERSATION_TYPES.AGENT
              ? {
                  name: normalizedAgentName || 'Agent',
                  description: normalizedAgentDescription,
                }
              : null,
        }),
        conversationSystemPrompt: normalizedConversationPrompt,
        appendConversationSystemPrompt: normalizedAppendConversationPrompt,
      };
  const systemPromptSuffix = [
    getConversationSystemPromptSuffix(modelId, promptTarget),
    'Below is your conversation with the user.',
  ]
    .map((section) => normalizeSystemPrompt(section))
    .filter(Boolean)
    .join('\n\n');
  const promptMessages = buildPromptForConversationLeaf(
    promptTarget,
    promptTarget.activeLeafMessageId,
    {
      systemPromptSuffix,
    }
  );
  return (
    promptMessages.find(
      (message) =>
        message?.role === 'system' && typeof message.content === 'string' && message.content.trim()
    )?.content || ''
  );
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

async function restoreSemanticMemoryFromStorage() {
  try {
    await semanticMemoryController?.restore();
  } catch (error) {
    appendDebug({
      kind: 'semantic-memory',
      message: 'Semantic memory restore failed.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
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
  await semanticMemoryController?.forgetConversation(normalizedConversationId);
}

function findOriginatingUserMessage(conversation, message) {
  if (!conversation || !message?.id) {
    return null;
  }
  let cursor =
    typeof message.parentId === 'string' && message.parentId
      ? getMessageNodeById(conversation, message.parentId)
      : null;
  while (cursor) {
    if (cursor.role === 'user') {
      return cursor;
    }
    cursor =
      typeof cursor.parentId === 'string' && cursor.parentId
        ? getMessageNodeById(conversation, cursor.parentId)
        : null;
  }
  return null;
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
    if (appState.isPreparingNewConversation && isPendingAgentConversation()) {
      return `#/chat/${ROUTE_NEW_AGENT}`;
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
    return {
      route: ROUTE_SETTINGS,
      conversationId: null,
      showSystemPrompt: false,
      pendingConversationType: CONVERSATION_TYPES.CHAT,
    };
  }
  if (secondSegment === ROUTE_NEW_AGENT) {
    return {
      route: ROUTE_CHAT,
      conversationId: null,
      showSystemPrompt: false,
      pendingConversationType: CONVERSATION_TYPES.AGENT,
    };
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
    pendingConversationType: CONVERSATION_TYPES.CHAT,
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
  const conversationType = getPendingConversationType();
  const agentName = normalizeConversationName(appState.pendingAgentName);
  const agentDescription = normalizeSystemPrompt(appState.pendingAgentDescription);
  const conversationName =
    conversationType === CONVERSATION_TYPES.AGENT ? agentName || 'New Agent' : name;
  const conversation = createConversationRecord({
    id: conversationId,
    name: conversationName,
    modelId: getAvailableModelId(
      modelSelect?.value || DEFAULT_MODEL,
      normalizeBackendPreference(backendSelect?.value || 'webgpu')
    ),
    conversationType,
    untitledPrefix: UNTITLED_CONVERSATION_PREFIX,
    systemPrompt: appState.defaultSystemPrompt,
    languagePreference: appState.pendingConversationLanguagePreference,
    thinkingEnabled: appState.pendingConversationThinkingEnabled,
    agent:
      conversationType === CONVERSATION_TYPES.AGENT
        ? {
            name: agentName || 'Agent',
            description: agentDescription,
            paused: false,
            lastActivityAt: Date.now(),
            lastFollowUpAt: null,
            nextFollowUpAt: null,
          }
        : null,
    startedAt: Date.now(),
  });
  if (conversationType === CONVERSATION_TYPES.AGENT) {
    conversation.hasGeneratedName = true;
    conversation.conversationSystemPrompt = '';
    conversation.appendConversationSystemPrompt = true;
  } else {
    conversation.conversationSystemPrompt = normalizeSystemPrompt(
      appState.pendingConversationSystemPrompt
    );
    conversation.appendConversationSystemPrompt = normalizeConversationPromptMode(
      appState.pendingAppendConversationSystemPrompt
    );
  }
  return conversation;
}

function getConversationModelId(conversation) {
  const loadedModelId = getLoadedModelId();
  return getAvailableModelId(
    conversation?.modelId || loadedModelId || modelSelect?.value || DEFAULT_MODEL,
    normalizeBackendPreference(backendSelect?.value || 'webgpu')
  );
}

function getConversationModelDisplayName(conversation = getActiveConversation()) {
  const modelId = getConversationModelId(conversation);
  const model = MODEL_OPTIONS_BY_ID.get(normalizeModelId(modelId));
  if (!model) {
    return modelId || 'Model';
  }
  const displayName =
    typeof model.displayName === 'string' && model.displayName.trim()
      ? model.displayName.trim()
      : typeof model.label === 'string' && model.label.trim()
        ? model.label.trim()
        : '';
  return displayName || modelId || 'Model';
}

function assignConversationModelId(conversation, modelId) {
  if (!conversation) {
    return { changed: false, modelId: getAvailableModelId(modelId || DEFAULT_MODEL) };
  }
  const nextModelId = getAvailableModelId(
    modelId || conversation.modelId || DEFAULT_MODEL,
    normalizeBackendPreference(backendSelect?.value || 'webgpu')
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
  const selectedBackend = normalizeBackendPreference(backendSelect?.value || 'webgpu');
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
    if (requestedModel) {
      setStatus(
        requestedModel.runtime?.requiresWebGpu
          ? `${requestedModel.label} is unavailable with ${formatBackendPreferenceLabel(selectedBackend)}. ${availability.reason} Switched to ${selectedModelId}.`
          : `${requestedModel.label} is unavailable. ${availability.reason} Switched to ${selectedModelId}.`
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

function requestSingleGeneration(prompt, options = {}) {
  return new Promise((resolve, reject) => {
    const signal =
      globalThis.AbortSignal && options.signal instanceof globalThis.AbortSignal
        ? options.signal
        : null;
    const activeConversation = getActiveConversation();
    const selectedModelId = getConversationModelId(activeConversation);
    const requestGenerationConfig = sanitizeGenerationConfigForModel(selectedModelId, {
      ...appState.activeGenerationConfig,
      ...(options.generationConfig && typeof options.generationConfig === 'object'
        ? options.generationConfig
        : {}),
    });
    const requestRuntime = {
      ...buildConversationRuntimeConfigForPrompt(activeConversation, prompt),
      ...(options.runtime && typeof options.runtime === 'object' ? options.runtime : {}),
    };
    let streamedText = '';
    let isSettled = false;

    const settle = (callback) => {
      if (isSettled) {
        return;
      }
      isSettled = true;
      signal?.removeEventListener('abort', handleAbort);
      callback();
    };

    const rejectAsAbort = () => {
      settle(() => {
        const AbortError =
          globalThis.DOMException ||
          class AbortError extends Error {
            constructor(message) {
              super(message);
              this.name = 'AbortError';
            }
          };
        reject(new AbortError('Generation canceled.', 'AbortError'));
      });
    };

    const handleAbort = () => {
      void engine
        .cancelGeneration()
        .catch(() => {})
        .finally(() => {
          rejectAsAbort();
        });
    };

    if (signal?.aborted) {
      rejectAsAbort();
      return;
    }

    signal?.addEventListener('abort', handleAbort, { once: true });
    try {
      engine.generate(prompt, {
        runtime: requestRuntime,
        generationConfig: requestGenerationConfig,
        onToken: (chunk) => {
          streamedText += String(chunk || '');
        },
        onComplete: (finalText) => {
          settle(() => {
            resolve(String(finalText || streamedText).trim());
          });
        },
        onError: (message) => {
          settle(() => {
            reject(new Error(String(message || 'Generation failed.')));
          });
        },
        onCancel: () => {
          rejectAsAbort();
        },
      });
    } catch (error) {
      settle(() => {
        reject(error);
      });
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
  isAgentConversation,
  getConversationModelDisplayName,
  getAgentDisplayName,
  renderModelMarkdown,
  scheduleMathTypeset,
  shouldShowMathMlCopyAction: transcriptContentRenderer.shouldShowMathMlCopyAction,
  getToolDisplayName,
  getShowThinkingByDefault: () => appState.showThinkingByDefault,
  getActiveUserEditMessageId: () => getActiveUserEditMessageId(appState),
  getControlsState: () => ({
    isGenerating: isGeneratingResponse(appState),
    isLoadingModel: isLoadingModelState(appState),
    isRunningOrchestration: isBlockingOrchestrationState(appState),
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
  handleShellCommandComplete,
  handleShellCommandStart,
  renderWorkspaceSidePanels,
} = createWorkspaceSidePanelsController({
  appState,
  documentRef: document,
  windowRef: window,
  terminalPanel,
  terminalHost,
  closeButton: closeTerminalButton,
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

function buildPromptForActiveConversation(
  conversation,
  leafMessageId = conversation?.activeLeafMessageId
) {
  const selectedModelId = getConversationModelId(conversation);
  const systemPromptSuffix = getConversationSystemPromptSuffix(selectedModelId, conversation);
  const baseSystemPromptSuffix = [systemPromptSuffix, 'Below is your conversation with the user.']
    .filter((part) => typeof part === 'string' && part.trim())
    .join('\n\n');
  const basePrompt = buildPromptForConversationLeaf(conversation, leafMessageId, {
    systemPromptSuffix: baseSystemPromptSuffix,
  });
  const promptTokenCount = estimatePromptTokenCount(basePrompt);
  const contextLimitTokens = sanitizeGenerationConfigForModel(selectedModelId, {
    ...appState.activeGenerationConfig,
  }).maxContextTokens;
  const semanticMemoryPromptSection = semanticMemoryController?.buildPromptSection(
    conversation,
    leafMessageId,
    {
      contextLimitTokens,
      promptTokenCount,
    }
  );
  return buildPromptForConversationLeaf(conversation, leafMessageId, {
    systemPromptSuffix: [
      systemPromptSuffix,
      semanticMemoryPromptSection,
      'Below is your conversation with the user.',
    ]
      .filter((part) => typeof part === 'string' && part.trim())
      .join('\n\n'),
  });
}

function downloadActiveConversationBranchAsJson() {
  return conversationDownloadController.downloadActiveConversationBranchAsJson();
}

function downloadActiveConversationBranchAsMarkdown() {
  return conversationDownloadController.downloadActiveConversationBranchAsMarkdown();
}

function exportAllConversations() {
  return conversationDownloadController.exportAllConversations();
}

async function deleteAllConversationStorage() {
  if (appState.conversationSaveTimerId !== null) {
    window.clearTimeout(appState.conversationSaveTimerId);
    appState.conversationSaveTimerId = null;
  }
  const conversationsRootPath = `${WORKSPACE_ROOT_PATH}/${CONVERSATION_WORKSPACE_DIRECTORY_NAME}`;
  if (await workspaceFileSystem.exists(conversationsRootPath)) {
    await workspaceFileSystem.deletePath(conversationsRootPath, { recursive: true });
  }
  conversationWorkspaceFileSystems.clear();
  appState.conversations.length = 0;
  appState.activeConversationId = null;
  appState.conversationCount = 0;
  appState.conversationIdCounter = 0;
  appState.pendingConversationDraftId = null;
  clearUserMessageEditSession();
  clearPendingComposerAttachments();
  setChatTitleEditing(appState, false);
  await semanticMemoryController?.clear();
  renderConversationList();
  renderTranscript();
  updateChatTitle();
  syncConversationLanguageAndThinkingControls();
  updateActionButtons();
  await persistConversationStateNow();
  syncRouteToCurrentState({ replace: true });
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
  const isAgentDraft = !activeConversation && isPendingAgentConversation();
  const isAgentPreChatConversation = isAgentDraft || isAgentConversation(activeConversation);

  if (preChatActions instanceof HTMLElement) {
    preChatActions.classList.toggle('d-none', !canShowPreChatActions);
  }
  if (preChatLoadModelBtn instanceof HTMLButtonElement) {
    preChatLoadModelBtn.classList.toggle('d-none', !hasExistingConversation);
    preChatLoadModelBtn.disabled = !canShowPreChatActions || !hasExistingConversation || isBusy;
  }
  if (preChatEditConversationSystemPromptBtn instanceof HTMLButtonElement) {
    preChatEditConversationSystemPromptBtn.classList.toggle('d-none', isAgentPreChatConversation);
    preChatEditConversationSystemPromptBtn.disabled =
      !isPreChatAvailable || isBusy || isAgentPreChatConversation;
  }
}

function updateMessageInputPlaceholder() {
  if (!(messageInput instanceof HTMLTextAreaElement)) {
    return;
  }
  const activeConversation = getActiveConversation();
  if (!activeConversation && isPendingAgentConversation()) {
    messageInput.placeholder = `Say hello to ${getAgentDisplayName(null)}...`;
    return;
  }
  if (isAgentConversation(activeConversation) && !hasConversationHistory(activeConversation)) {
    messageInput.placeholder = `Say hello to ${getAgentDisplayName(activeConversation)}...`;
    return;
  }
  messageInput.placeholder = 'Type your message...';
}

function updatePreChatModeUi() {
  const activeConversation = getActiveConversation();
  const isAgentDraft = !activeConversation && isPendingAgentConversation();
  const isAgentPreChatConversation = isAgentDraft || isAgentConversation(activeConversation);
  const agentNameValue = isAgentConversation(activeConversation)
    ? normalizeConversationName(activeConversation?.agent?.name || activeConversation?.name || '')
    : appState.pendingAgentName;
  const agentDescriptionValue = isAgentConversation(activeConversation)
    ? normalizeSystemPrompt(activeConversation?.agent?.description)
    : appState.pendingAgentDescription;
  if (preChatHeading instanceof HTMLElement) {
    preChatHeading.textContent = isAgentPreChatConversation
      ? 'Create a New Agent'
      : 'Start a New Chat';
  }
  if (preChatLead instanceof HTMLElement) {
    preChatLead.textContent = isAgentPreChatConversation
      ? 'Name your agent, describe its personality, choose a model, then say hello below to begin.'
      : 'Choose a model, then send your first message below to begin.';
  }
  if (preChatAgentFields instanceof HTMLElement) {
    preChatAgentFields.classList.toggle('d-none', !isAgentPreChatConversation);
  }
  if (agentNameInput instanceof HTMLInputElement && agentNameInput.value !== agentNameValue) {
    agentNameInput.value = agentNameValue;
  }
  if (
    agentPersonalityInput instanceof HTMLTextAreaElement &&
    agentPersonalityInput.value !== agentDescriptionValue
  ) {
    agentPersonalityInput.value = agentDescriptionValue;
  }
  updateMessageInputPlaceholder();
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
  updatePreChatModeUi();
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
      appState.pendingConversationType = normalizeConversationType(
        routeState.pendingConversationType || CONVERSATION_TYPES.CHAT
      );
      if (appState.pendingConversationType !== CONVERSATION_TYPES.AGENT) {
        clearPendingAgentDraft();
      }
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
  refreshAgentAutomationState();

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
  if (activeConversation) {
    syncConversationModelSelection(activeConversation, { useDefaults: true });
  }
  clearUserMessageEditSession();
  clearPendingComposerAttachments();
  renderConversationList();
  renderTranscript();
  updateChatTitle();
  queueConversationStateSave();
  refreshAgentAutomationState();
  if (syncRoute) {
    syncRouteToCurrentState({ replace: replaceRoute });
  }
}

function shouldShowAgentAutomationControls(conversation = getActiveConversation()) {
  return (
    isAgentConversation(conversation) &&
    !appState.isPreparingNewConversation &&
    selectHasStartedWorkspace(appState) &&
    !isSettingsView(appState)
  );
}

function clearAgentFollowUpCountdownTimer() {
  if (agentFollowUpCountdownIntervalId !== null) {
    window.clearInterval(agentFollowUpCountdownIntervalId);
    agentFollowUpCountdownIntervalId = null;
  }
}

function startAgentFollowUpCountdownTimer() {
  if (agentFollowUpCountdownIntervalId !== null) {
    return;
  }
  agentFollowUpCountdownIntervalId = window.setInterval(() => {
    updateAgentFollowUpCountdownUi();
  }, 1000);
}

function formatAgentFollowUpCountdown(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  }
  return `${seconds}s`;
}

function formatAgentFollowUpAnnouncement(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (hours > 0) {
    parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
  }
  if (minutes > 0) {
    parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
  }
  if (!hours && (!minutes || seconds > 0)) {
    parts.push(`${seconds} second${seconds === 1 ? '' : 's'}`);
  }
  return parts.join(' ');
}

function isAgentFollowUpRunning(conversation = getActiveConversation()) {
  return agentAutomationController?.isFollowUpRunning(conversation) === true;
}

function updateAgentFollowUpCountdownUi() {
  const activeConversation = getActiveConversation();
  const showControls = shouldShowAgentAutomationControls(activeConversation);
  if (
    !(agentFollowUpCountdown instanceof HTMLElement) ||
    !(agentFollowUpCountdownText instanceof HTMLElement)
  ) {
    clearAgentFollowUpCountdownTimer();
    return;
  }
  if (!showControls || !activeConversation?.agent) {
    agentFollowUpCountdown.classList.add('d-none');
    agentFollowUpCountdownText.textContent = '--';
    if (agentFollowUpCountdownLive instanceof HTMLElement) {
      agentFollowUpCountdownLive.textContent = '';
    }
    lastAgentFollowUpAnnouncementKey = '';
    clearAgentFollowUpCountdownTimer();
    return;
  }
  agentFollowUpCountdown.classList.remove('d-none');
  const isPaused = activeConversation.agent.paused === true;
  const isRunning = isAgentFollowUpRunning(activeConversation);
  const nextFollowUpAt = Number(activeConversation.agent.nextFollowUpAt) || 0;
  let valueText = 'waiting';
  let announcementText = '';
  let announcementKey = `${activeConversation.id}:idle`;
  const shouldTick =
    !isPaused && !isRunning && Number.isFinite(nextFollowUpAt) && nextFollowUpAt > 0;

  if (isPaused) {
    valueText = 'paused';
    announcementKey = `${activeConversation.id}:paused`;
    announcementText = `${getAgentDisplayName(activeConversation)} automatic heartbeats are paused.`;
  } else if (isRunning) {
    valueText = 'sending now';
    announcementKey = `${activeConversation.id}:running`;
    announcementText = `${getAgentDisplayName(activeConversation)} is sending a heartbeat now.`;
  } else if (shouldTick) {
    const remainingMs = Math.max(0, nextFollowUpAt - Date.now());
    valueText = remainingMs <= 1000 ? 'due now' : `in ${formatAgentFollowUpCountdown(remainingMs)}`;
    announcementKey = `${activeConversation.id}:scheduled:${Math.trunc(nextFollowUpAt / 1000)}`;
    announcementText = `${getAgentDisplayName(activeConversation)} may send the next heartbeat in about ${formatAgentFollowUpAnnouncement(
      remainingMs
    )}.`;
  } else {
    valueText = 'scheduling...';
    announcementKey = `${activeConversation.id}:scheduling`;
    announcementText = `${getAgentDisplayName(activeConversation)} will schedule the next heartbeat after the current activity settles.`;
  }

  agentFollowUpCountdownText.textContent = valueText;
  if (
    agentFollowUpCountdownLive instanceof HTMLElement &&
    announcementKey !== lastAgentFollowUpAnnouncementKey
  ) {
    agentFollowUpCountdownLive.textContent = announcementText;
    lastAgentFollowUpAnnouncementKey = announcementKey;
  }
  if (shouldTick) {
    startAgentFollowUpCountdownTimer();
  } else {
    clearAgentFollowUpCountdownTimer();
  }
}

function updatePauseAgentButton() {
  if (!(pauseAgentBtn instanceof HTMLButtonElement)) {
    clearAgentFollowUpCountdownTimer();
    return;
  }
  const activeConversation = getActiveConversation();
  const showButton = shouldShowAgentAutomationControls(activeConversation);
  if (agentAutomationControls instanceof HTMLElement) {
    agentAutomationControls.classList.toggle('d-none', !showButton);
  } else {
    pauseAgentBtn.classList.toggle('d-none', !showButton);
  }
  if (!showButton) {
    pauseAgentBtn.disabled = true;
    pauseAgentBtn.removeAttribute('aria-describedby');
    updateAgentFollowUpCountdownUi();
    return;
  }
  const isPaused = activeConversation?.agent?.paused === true;
  pauseAgentBtn.disabled = isUiBusy();
  pauseAgentBtn.setAttribute('aria-pressed', String(isPaused));
  const buttonLabel = isPaused ? 'Resume agent' : 'Pause agent';
  pauseAgentBtn.setAttribute('aria-label', buttonLabel);
  pauseAgentBtn.setAttribute('data-bs-title', buttonLabel);
  pauseAgentBtn.title = buttonLabel;
  const describedBy = [agentFollowUpAutomationHelp, agentFollowUpCountdown]
    .filter((element) => element instanceof HTMLElement)
    .map((element) => element.id)
    .join(' ');
  if (describedBy) {
    pauseAgentBtn.setAttribute('aria-describedby', describedBy);
  } else {
    pauseAgentBtn.removeAttribute('aria-describedby');
  }
  const icon = pauseAgentBtn.querySelector('[data-agent-toggle-icon="true"]');
  if (icon instanceof HTMLElement) {
    icon.className = `bi ${isPaused ? 'bi-play-fill' : 'bi-pause-fill'}`;
  }
  updateAgentFollowUpCountdownUi();
  const tooltipInstance = Tooltip.getInstance(pauseAgentBtn);
  if (tooltipInstance) {
    tooltipInstance.dispose();
  }
  initializeTooltips(pauseAgentBtn.parentElement || pauseAgentBtn);
}

function updateActionButtons() {
  updateSendButtonMode();
  updateGenerationSettingsEnabledState();
  updateChatTitleEditorVisibility();
  updatePreChatActionButtons();
  updatePauseAgentButton();
  const disableComposerForPreChatSelection = shouldDisableComposerForPreChatConversationSelection();
  const attachmentsAreProcessing = isProcessingAttachments(appState);
  const composerControlsDisabled =
    isLoadingModelState(appState) ||
    isBlockingOrchestrationState(appState) ||
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
    newConversationBtn.disabled = shouldDisableNewConversationButton(appState);
  }
  if (newAgentBtn) {
    newAgentBtn.classList.toggle('d-none', !shouldShowNewConversationButton());
    newAgentBtn.disabled = shouldDisableNewAgentButton(appState);
  }
  updateMessageInputPlaceholder();
  updateRegenerateButtons();
  updateUserMessageButtons();
  refreshAgentAutomationState();
}

function updateRegenerateButtons() {
  if (!chatTranscript) {
    return;
  }
  const activeConversation = getActiveConversation();
  const isAgentThread = isAgentConversation(activeConversation);
  const disabled =
    isLoadingModelState(appState) ||
    isGeneratingResponse(appState) ||
    isBlockingOrchestrationState(appState) ||
    isVariantSwitchingState(appState) ||
    !isEngineReady(appState) ||
    isMessageEditActive(appState);
  chatTranscript.querySelectorAll('.message-row.model-message').forEach((item) => {
    if (!(item instanceof HTMLElement)) {
      return;
    }
    const messageId = item.dataset.messageId;
    const modelMessage = activeConversation?.messageNodes.find(
      (message) => message.id === messageId && message.role === 'model'
    );
    const hideActions = !isModelTurnComplete(activeConversation, modelMessage);
    const responseActions = item.querySelector('.response-actions');
    if (responseActions) {
      responseActions.classList.toggle('d-none', hideActions);
      responseActions.querySelectorAll('.regenerate-response-btn').forEach((button) => {
        if (button instanceof HTMLButtonElement) {
          button.classList.toggle('d-none', isAgentThread);
          button.disabled = disabled || hideActions || isAgentThread;
        }
      });
      const prevButton = responseActions.querySelector('.response-variant-prev');
      const nextButton = responseActions.querySelector('.response-variant-next');
      const variantNav = responseActions.querySelector('.response-variant-nav');
      const variantLabel = responseActions.querySelector('.response-variant-status');
      const variantState = getModelVariantState(activeConversation, modelMessage);
      if (variantNav) {
        variantNav.classList.toggle(
          'd-none',
          !variantState.hasVariants || hideActions || isAgentThread
        );
      }
      if (variantLabel) {
        variantLabel.textContent = `${Math.max(variantState.index + 1, 1)}/${Math.max(variantState.total, 1)}`;
      }
      if (prevButton instanceof HTMLButtonElement) {
        prevButton.disabled = disabled || hideActions || isAgentThread || !variantState.canGoPrev;
      }
      if (nextButton instanceof HTMLButtonElement) {
        nextButton.disabled = disabled || hideActions || isAgentThread || !variantState.canGoNext;
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
  return buildConversationRuntimeConfigForPrompt(
    {
      modelId: normalizeModelId(modelId),
      languagePreference: appState.pendingConversationLanguagePreference,
      thinkingEnabled: appState.pendingConversationThinkingEnabled,
    },
    null
  );
}

async function clearSelectedModelDownloads() {
  const selectedModelId = normalizeModelId(modelSelect?.value || DEFAULT_MODEL);
  const selectedModel = MODEL_OPTIONS_BY_ID.get(selectedModelId);
  if (!selectedModel) {
    setStatus('Selected model is unavailable.');
    return;
  }
  if (selectedModel.engine?.type === 'wllama') {
    const runtime =
      selectedModel.runtime && typeof selectedModel.runtime === 'object'
        ? selectedModel.runtime
        : {};
    const modelUrl =
      typeof runtime.modelUrl === 'string' && runtime.modelUrl.trim()
        ? runtime.modelUrl.trim()
        : '';
    if (!modelUrl) {
      setStatus('Selected model is missing its GGUF cache key.');
      return;
    }

    setStatus('Clearing downloaded model files...');
    appendDebug(`Clearing cached wllama files for ${selectedModelId}.`);

    try {
      const { ModelManager } = await import('@wllama/wllama');
      const manager = new ModelManager({
        allowOffline: true,
        logger: {
          debug() {},
          log() {},
          warn() {},
          error() {},
        },
      });
      const cachedUrls = expandWllamaModelUrls(modelUrl);
      const cacheEntriesBefore = await manager.cacheManager.list();
      const cachedNames = await Promise.all(
        cachedUrls.map((url) => manager.cacheManager.getNameFromURL(url))
      );
      const hadCachedFiles = cachedUrls.some((url) =>
        cacheEntriesBefore.some(
          (entry) => cachedNames.includes(entry.name) || entry.metadata?.originalURL === url
        )
      );

      if (!hadCachedFiles) {
        setStatus(
          `No cached files were found for ${selectedModel.displayName || selectedModelId}.`
        );
        appendDebug(`No cached wllama files were found for ${selectedModelId}.`);
        return;
      }

      for (const currentUrl of cachedUrls) {
        await manager.cacheManager.delete(currentUrl);
      }
      setStatus(`Cleared cached files for ${selectedModel.displayName || selectedModelId}.`);
      appendDebug(`Cleared cached wllama files for ${selectedModelId}.`);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || 'Unknown error');
      setStatus(`Failed to clear downloaded model files: ${message}`);
      appendDebug(`Clear downloaded wllama model files failed: ${message}`);
      return;
    }
  }
  if (selectedModel.engine?.type !== 'transformers-js') {
    setStatus('Selected model does not use a clearable browser-local model cache.');
    return;
  }

  const runtime =
    selectedModel.runtime && typeof selectedModel.runtime === 'object' ? selectedModel.runtime : {};
  const revision =
    typeof runtime.revision === 'string' && runtime.revision.trim() ? runtime.revision.trim() : '';
  const webgpuDtype = resolveRuntimeDtypeForBackend(runtime, 'webgpu');
  const cpuDtype = resolveRuntimeDtypeForBackend(runtime, 'cpu');
  /** @type {Array<{device: 'webgpu' | 'wasm', dtype?: string, includeTokenizer?: boolean, includeProcessor?: boolean}>} */
  const clearPlans = [];

  if (webgpuDtype) {
    clearPlans.push({
      device: 'webgpu',
      dtype: webgpuDtype,
      includeTokenizer: true,
      includeProcessor: runtime.multimodalGeneration === true,
    });
  }
  if (cpuDtype && (!webgpuDtype || cpuDtype !== webgpuDtype)) {
    clearPlans.push({
      device: 'wasm',
      dtype: cpuDtype,
      includeTokenizer: !webgpuDtype,
      includeProcessor: !webgpuDtype && runtime.multimodalGeneration === true,
    });
  }
  if (!clearPlans.length) {
    clearPlans.push({
      device: 'wasm',
      includeTokenizer: true,
      includeProcessor: runtime.multimodalGeneration === true,
    });
  }

  setStatus('Clearing downloaded model files...');
  appendDebug(`Clearing cached Transformers.js files for ${selectedModelId}.`);

  try {
    const { ModelRegistry } = await import('@huggingface/transformers');
    let filesDeleted = 0;
    let filesCached = 0;

    for (const plan of clearPlans) {
      const result = await ModelRegistry.clear_cache(
        selectedModelId,
        /** @type {any} */ ({
          ...(revision ? { revision } : {}),
          ...(plan.dtype ? { dtype: plan.dtype } : {}),
          device: plan.device,
          include_tokenizer: plan.includeTokenizer !== false,
          include_processor: plan.includeProcessor !== false,
        })
      );
      filesDeleted += Number(result?.filesDeleted) || 0;
      filesCached += Number(result?.filesCached) || 0;
    }

    if (filesCached > 0) {
      setStatus(
        `Cleared ${filesDeleted} cached file${filesDeleted === 1 ? '' : 's'} for ${selectedModel.displayName || selectedModelId}.`
      );
      appendDebug(
        `Cleared ${filesDeleted} of ${filesCached} cached Transformers.js file${filesCached === 1 ? '' : 's'} for ${selectedModelId}.`
      );
      return;
    }

    setStatus(`No cached files were found for ${selectedModel.displayName || selectedModelId}.`);
    appendDebug(`No cached Transformers.js files were found for ${selectedModelId}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'Unknown error');
    setStatus(`Failed to clear downloaded model files: ${message}`);
    appendDebug(`Clear downloaded model files failed: ${message}`);
  }
}

const {
  updateChatTitleEditorVisibility,
  updateConversationSystemPromptPreview,
  beginConversationSystemPromptEdit,
  saveConversationSystemPromptEdit,
  focusConversationSystemPromptEditor,
  beginChatTitleEdit,
  cancelChatTitleEdit,
  saveChatTitleEdit,
} = createConversationEditors({
  appState,
  conversationSystemPromptModal,
  conversationSystemPromptModalLabel,
  conversationSystemPromptModalHelp,
  conversationSystemPromptComputedLabel,
  conversationSystemPromptInput,
  conversationSystemPromptAppendToggle,
  conversationSystemPromptComputedPreview,
  conversationPromptFields,
  agentPromptFields,
  agentPromptNameInput,
  agentPromptPersonalityInput,
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

async function importSkillPackage(file, { existingSkillPackages = [] } = {}) {
  if (!file || typeof file.arrayBuffer !== 'function') {
    throw new Error('Choose a valid skill zip before uploading.');
  }
  if (!/\.zip$/i.test(file.name)) {
    throw new Error('Skill packages must be uploaded as .zip files.');
  }
  const parsedSkillPackage = parseSkillArchiveBytes(new Uint8Array(await file.arrayBuffer()), {
    packageName: file.name,
  });
  if (parsedSkillPackage.isUsable) {
    const normalizedLookupName = normalizeSkillLookupName(parsedSkillPackage.name);
    const existingMatch = getUsableSkillPackages(existingSkillPackages).find(
      (skillPackage) => skillPackage.lookupName === normalizedLookupName
    );
    if (existingMatch) {
      throw new Error(`A skill named "${parsedSkillPackage.name}" has already been added.`);
    }
  }
  const savedSkillPackage = await saveSkillPackage(parsedSkillPackage);
  if (!savedSkillPackage) {
    throw new Error('Skill package storage is unavailable in this browser session.');
  }
  return savedSkillPackage;
}

async function deleteSkillPackage(skillPackageId) {
  const removed = await removeSkillPackage(skillPackageId);
  if (!removed) {
    throw new Error('The selected skill package could not be removed.');
  }
  return true;
}

const preferencesController = createPreferencesController({
  appState,
  storage: localStorage,
  navigatorRef: navigator,
  documentRef: document,
  themeStorageKey: THEME_STORAGE_KEY,
  showThinkingStorageKey: SHOW_THINKING_STORAGE_KEY,
  enableToolCallingStorageKey: ENABLE_TOOL_CALLING_STORAGE_KEY,
  enabledToolsStorageKey: ENABLED_TOOLS_STORAGE_KEY,
  enabledToolMigrationsStorageKey: ENABLED_TOOL_MIGRATIONS_STORAGE_KEY,
  renderMathMlStorageKey: RENDER_MATHML_STORAGE_KEY,
  singleKeyShortcutsStorageKey: SINGLE_KEY_SHORTCUTS_STORAGE_KEY,
  transcriptViewStorageKey: TRANSCRIPT_VIEW_STORAGE_KEY,
  conversationPanelCollapsedStorageKey: CONVERSATION_PANEL_COLLAPSED_STORAGE_KEY,
  defaultSystemPromptStorageKey: DEFAULT_SYSTEM_PROMPT_STORAGE_KEY,
  corsProxyStorageKey: CORS_PROXY_STORAGE_KEY,
  mcpServersStorageKey: MCP_SERVERS_STORAGE_KEY,
  modelStorageKey: MODEL_STORAGE_KEY,
  backendStorageKey: BACKEND_STORAGE_KEY,
  cpuThreadsStorageKey: CPU_THREADS_STORAGE_KEY,
  supportedBackendPreferences: SUPPORTED_BACKEND_PREFERENCES,
  webGpuRequiredModelSuffix: WEBGPU_REQUIRED_MODEL_SUFFIX,
  availableToolDefinitions: getEnabledToolDefinitions(),
  themeSelect,
  showThinkingToggle,
  enableToolCallingToggle,
  toolSettingsList,
  orchestrationEditorHeading,
  orchestrationEditorForm,
  orchestrationEditorIdInput,
  orchestrationNameInput,
  orchestrationSlashCommandInput,
  orchestrationDescriptionInput,
  orchestrationDefinitionInput,
  orchestrationStepList,
  orchestrationStepEditorFeedback,
  orchestrationSaveButton,
  orchestrationResetButton,
  orchestrationImportInput,
  orchestrationImportFeedback,
  customOrchestrationsList,
  builtInOrchestrationsList,
  builtInOrchestrations: BUILT_IN_ORCHESTRATIONS,
  saveCustomOrchestration,
  removeCustomOrchestration,
  downloadFile: triggerDownload,
  skillPackageInput,
  skillPackageAddFeedback,
  skillsList,
  corsProxyInput,
  corsProxyFeedback,
  importSkillPackage,
  saveSkillPackage,
  removeSkillPackage: deleteSkillPackage,
  mcpServerEndpointInput,
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
  cpuThreadsInput,
  colorSchemeQuery,
  refreshModelThinkingVisibility,
  getRuntimeConfigForModel,
  getStoredGenerationConfigForModel,
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
  onSelectedModelCardChange: syncFeedbackHost,
});

const {
  applyDefaultSystemPrompt,
  applyCorsProxyPreference,
  applyMathRenderingPreference,
  applyEnabledToolNamesPreference,
  applyCustomOrchestrationsPreference,
  applySkillPackageEnabledPreference,
  applySkillPackagesPreference,
  applyShowThinkingPreference,
  applyTheme,
  applyToolEnabledPreference,
  applyToolCallingPreference,
  applyMcpServerEnabledPreference,
  applyMcpServerCommandEnabledPreference,
  applyMcpServersPreference,
  applyTranscriptViewPreference,
  applyConversationPanelCollapsedPreference,
  applyCpuThreadsPreference,
  applySingleKeyShortcutPreference,
  clearCustomOrchestrationFeedback,
  clearSkillPackageFeedback,
  clearCorsProxyFeedback,
  clearCorsProxyPreference,
  clearMcpServerFeedback,
  getStoredCorsProxyPreference,
  formatBackendPreferenceLabel,
  getAvailableModelId,
  getStoredDefaultSystemPrompt,
  getStoredMathRenderingPreference,
  getStoredMcpServersPreference,
  getStoredShowThinkingPreference,
  getStoredSingleKeyShortcutPreference,
  getStoredThemePreference,
  getStoredToolCallingPreference,
  getStoredTranscriptViewPreference,
  getStoredConversationPanelCollapsedPreference,
  migrateStoredEnabledToolNamesPreference,
  getWebGpuAvailability,
  exportAllCustomOrchestrations,
  exportCustomOrchestration,
  importCustomOrchestrationFile,
  importSkillPackageFile,
  importMcpServerEndpoint,
  loadCustomOrchestrationIntoEditor,
  normalizeBackendPreference,
  persistInferencePreferences,
  populateModelSelect,
  probeWebGpuAvailability,
  readEngineConfigFromUI,
  removeCustomOrchestrationPreference,
  removeSkillPackagePreference,
  resetCustomOrchestrationEditor,
  saveCorsProxyPreference,
  saveCustomOrchestrationDraft,
  refreshMcpServerPreference,
  removeMcpServerPreference,
  restoreInferencePreferences,
  setSelectedModelId,
  setCustomOrchestrationFeedback,
  setCorsProxyFeedback,
  setSkillPackageFeedback,
  setMcpServerFeedback,
  syncModelSelectionForCurrentEnvironment,
} = preferencesController;

function matchSavedOrchestrationSlashCommand(rawValue) {
  return matchCustomOrchestrationSlashCommand(rawValue, appState.customOrchestrations);
}

function syncCloudProviderModelCatalog() {
  replaceRuntimeModelCatalog(buildRuntimeModelCatalog(appState.cloudProviders));
  const activeConversation = getActiveConversation();
  if (activeConversation) {
    const previousModelId = activeConversation.modelId;
    const { selectedModelId } = syncConversationModelSelection(activeConversation, {
      announceFallback: false,
      useDefaults: true,
    });
    if (selectedModelId !== previousModelId) {
      queueConversationStateSave();
    }
  } else {
    populateModelSelect();
    const selectedModelId = syncModelSelectionForCurrentEnvironment({ announceFallback: false });
    syncGenerationSettingsFromModel(selectedModelId, true);
    syncConversationLanguageAndThinkingControls();
  }
  updateConversationSystemPromptPreview();
  updateActionButtons();
  updateWelcomePanelVisibility({ syncRoute: false });
}

const cloudProviderSettingsController = createCloudProviderSettingsController({
  appState,
  documentRef: document,
  preconfiguredProviders: [...PRECONFIGURED_CLOUD_PROVIDERS],
  cloudProviderAddFeedback,
  cloudProvidersList,
  inspectCloudProviderEndpoint: (endpoint, apiKey) =>
    inspectOpenAiCompatibleEndpoint(endpoint, apiKey, {
      fetchRef: baseFetchRef,
      proxyUrl: appState.corsProxyUrl,
    }),
  loadCloudProviders: loadStoredCloudProviders,
  saveCloudProvider: saveStoredCloudProvider,
  saveCloudProviderSecret: saveStoredCloudProviderSecret,
  updateCloudProvider: updateStoredCloudProvider,
  removeCloudProvider: removeStoredCloudProvider,
  getCloudProviderSecret,
  onProvidersChanged: () => {
    syncCloudProviderModelCatalog();
  },
  getStoredGenerationConfigForModel,
  persistGenerationConfigForModel,
  getModelGenerationLimits,
  syncGenerationSettingsFromModel,
  getSelectedModelId: () => modelSelect?.value || DEFAULT_MODEL,
});

const {
  addCloudProvider,
  clearCloudProviderFeedback,
  refreshCloudProviderPreference,
  removeCloudProviderPreference,
  restoreCloudProvidersFromStorage,
  saveCloudProviderSecretPreference,
  setCloudProviderFeedback,
  setCloudProviderModelSelected,
  updateCloudModelFeaturePreference,
  updateCloudModelGenerationPreference,
  updateCloudModelThinkingPreference,
  updateCloudModelRateLimitPreference,
} = cloudProviderSettingsController;

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

async function restoreSkillPackagesFromStorage() {
  try {
    applySkillPackagesPreference(await loadSkillPackages());
    updateConversationSystemPromptPreview();
  } catch (error) {
    appendDebug({
      kind: 'skill-packages',
      message: 'Failed to restore skill packages.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

async function restoreCustomOrchestrationsFromStorage() {
  try {
    applyCustomOrchestrationsPreference(await loadCustomOrchestrations());
  } catch (error) {
    appendDebug({
      kind: 'custom-orchestrations',
      message: 'Failed to restore custom orchestrations.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

async function initializeStoredBrowserState() {
  try {
    await restoreCloudProvidersFromStorage();
  } catch (error) {
    appendDebug({
      kind: 'cloud-providers',
      message: 'Failed to restore cloud providers.',
      details: error instanceof Error ? error.message : String(error),
    });
  }

  syncCloudProviderModelCatalog();
  populateModelSelect();
  restoreInferencePreferences();
  syncConversationLanguageAndThinkingControls();
  try {
    await probeWebGpuAvailability();
  } catch (_error) {
    // probeWebGpuAvailability already records recoverable adapter failures.
  }

  updateWelcomePanelVisibility({ syncRoute: false });
  applyAppRouteFromHash();
  await restoreCustomOrchestrationsFromStorage();
  await restoreSkillPackagesFromStorage();
  await restoreSemanticMemoryFromStorage();
  await restoreConversationStateFromStorage();
}

function resetPendingConversationModelPreferences() {
  const selectedModelId = normalizeModelId(modelSelect?.value || DEFAULT_MODEL);
  appState.pendingConversationLanguagePreference = 'auto';
  appState.pendingConversationThinkingEnabled =
    getThinkingControlForModel(selectedModelId)?.defaultEnabled !== false;
}

function getPendingConversationType() {
  return normalizeConversationType(appState.pendingConversationType);
}

function isPendingAgentConversation() {
  return getPendingConversationType() === CONVERSATION_TYPES.AGENT;
}

function clearPendingAgentDraft() {
  appState.pendingAgentName = '';
  appState.pendingAgentDescription = '';
}

function getAgentDisplayName(conversation = getActiveConversation()) {
  if (isAgentConversation(conversation)) {
    return (
      normalizeConversationName(conversation?.agent?.name || conversation?.name || 'Agent') ||
      'Agent'
    );
  }
  const draftName = normalizeConversationName(appState.pendingAgentName);
  return draftName || 'Agent';
}

function preparePendingConversationDraft(conversationType = CONVERSATION_TYPES.CHAT) {
  appState.pendingConversationType = normalizeConversationType(conversationType);
  appState.pendingConversationDraftId = '';
  appState.pendingConversationSystemPrompt = '';
  appState.pendingAppendConversationSystemPrompt = true;
  if (appState.pendingConversationType !== CONVERSATION_TYPES.AGENT) {
    clearPendingAgentDraft();
  }
  resetPendingConversationModelPreferences();
}

const runOrchestration = createOrchestrationRunner({
  generateText: requestSingleGeneration,
  formatStepOutput: (step, rawOutput) => {
    const selectedModelId = normalizeModelId(modelSelect?.value || DEFAULT_MODEL);
    return formatOrchestrationStepOutput(step, rawOutput, getThinkingTagsForModel(selectedModelId));
  },
  onDebug: appendDebug,
});

semanticMemoryController = createSemanticMemoryController({
  loadSemanticMemories,
  replaceSemanticMemories,
  clearSemanticMemories,
  getConversationPathMessages,
  onDebug: appendDebug,
});

function isAgentConversationLoaded() {
  return appState.workspaceView === 'chat' && isAgentConversation(getActiveConversation());
}

agentAutomationController = createAgentAutomationController({
  appState,
  engine,
  runOrchestration,
  agentFollowUpOrchestration,
  summarizeConversationOrchestration,
  getActiveConversation,
  findConversationById,
  getConversationPathMessages,
  addMessageToConversation,
  buildPromptForConversation: buildPromptForActiveConversation,
  getMessageNodeById,
  isAgentConversation,
  isHeartbeatMessage,
  isAgentConversationLoaded,
  getAgentDisplayName,
  isGeneratingResponse,
  isLoadingModelState,
  isBlockingOrchestrationState,
  setOrchestrationRunning,
  queueConversationStateSave,
  renderTranscript,
  scrollTranscriptToBottom,
  updateActionButtons,
  setStatus,
  appendDebug,
  onSummaryCreated: (conversation, summaryMessage) =>
    semanticMemoryController?.rememberSummary(conversation, summaryMessage),
  onScheduleChanged: updateAgentFollowUpCountdownUi,
  followUpOrchestrationKind: ORCHESTRATION_KINDS.AGENT_FOLLOW_UP,
  summaryOrchestrationKind: ORCHESTRATION_KINDS.SUMMARY,
  followUpIntervalMs: AGENT_FOLLOW_UP_INTERVAL_MS,
  busyRetryMs: AGENT_FOLLOW_UP_BUSY_RETRY_MS,
  summaryTriggerRatio: AGENT_SUMMARY_TRIGGER_RATIO,
  summaryMinMessages: AGENT_SUMMARY_MIN_MESSAGES,
});

function cancelActiveAgentFollowUp(options) {
  return agentAutomationController?.cancelActiveFollowUp(options) || Promise.resolve();
}

function refreshAgentAutomationState(options) {
  agentAutomationController?.refreshState(options);
}

function recordAgentActivity(conversation, options) {
  agentAutomationController?.recordActivity(conversation, options);
}

function ensureAgentConversationSummaryBeforeSend(conversation, userMessage) {
  return (
    agentAutomationController?.ensureSummaryBeforeSend(conversation, userMessage) ||
    Promise.resolve(true)
  );
}

function toggleAgentPauseState() {
  agentAutomationController?.togglePauseState();
}

function handleCompletedModelMessage(conversation, message) {
  agentAutomationController?.handleCompletedModelMessage(conversation, message);
  const originatingUserMessage = findOriginatingUserMessage(conversation, message);
  if (originatingUserMessage) {
    void semanticMemoryController?.rememberUserMessage(conversation, originatingUserMessage);
  }
  transcriptContentRenderer.flushQueuedMarkdownRendererRefresh();
}

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
      skills: getConfiguredAvailableSkills(),
      mcpServers: getConfiguredEnabledMcpServers(),
      requestToolConsent,
      onShellCommandStart: handleShellCommandStart,
      onShellCommandComplete: handleShellCommandComplete,
      fetchRef: corsAwareFetch,
      onDebug: appendDebug,
      generationConfig: appState.activeGenerationConfig,
      pythonExecutor,
      workspaceFileSystem: getConversationWorkspaceFileSystem(),
    }),
  getSelectedModelId: () => modelSelect?.value || DEFAULT_MODEL,
  getRuntimeConfigForConversation: (conversation, prompt = null) =>
    buildConversationRuntimeConfigForPrompt(conversation, prompt),
  isAgentConversation,
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
  onModelMessageComplete: handleCompletedModelMessage,
  onGenerationSettled: () => transcriptContentRenderer.flushQueuedMarkdownRendererRefresh(),
  streamUpdateIntervalMs: STREAM_UPDATE_INTERVAL_MS,
});
reinitializeInferenceSettings = () => appController.reinitializeEngineFromSettings();

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
  isOrchestrationRunningState: isBlockingOrchestrationState,
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
  isAgentConversation,
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
  const resetFiles = progress?.resetFiles === true;
  setLoadProgress({ percent, message, file, status, loadedBytes, totalBytes, resetFiles });
};

const themePreference = getStoredThemePreference();
applyTheme(themePreference);
applyShowThinkingPreference(getStoredShowThinkingPreference());
applyToolCallingPreference(getStoredToolCallingPreference());
applyEnabledToolNamesPreference(migrateStoredEnabledToolNamesPreference({ persist: true }));
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
showProgressRegion(false);
renderComposerAttachments();
renderDebugLog();
updateActionButtons();
setActiveSettingsTab(appState.activeSettingsTab);
if (pauseAgentBtn instanceof HTMLButtonElement) {
  pauseAgentBtn.addEventListener('click', () => {
    toggleAgentPauseState();
  });
}
if (agentNameInput instanceof HTMLInputElement) {
  agentNameInput.addEventListener('input', () => {
    appState.pendingAgentName = agentNameInput.value;
    updatePreChatModeUi();
  });
}
if (agentPersonalityInput instanceof HTMLTextAreaElement) {
  agentPersonalityInput.addEventListener('input', () => {
    appState.pendingAgentDescription = agentPersonalityInput.value;
  });
}
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
void initializeStoredBrowserState();

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
  orchestrationEditorForm,
  orchestrationNameInput,
  orchestrationSlashCommandInput,
  orchestrationSaveButton,
  orchestrationResetButton,
  orchestrationImportForm,
  orchestrationImportInput,
  orchestrationImportButton,
  exportAllOrchestrationsButton,
  customOrchestrationsList,
  skillPackageForm,
  skillPackageInput,
  addSkillPackageButton,
  skillsList,
  cloudProviderForm,
  cloudProviderNameInput,
  cloudProviderEndpointInput,
  cloudProviderApiKeyInput,
  addCloudProviderButton,
  cloudProvidersList,
  corsProxyForm,
  corsProxyInput,
  saveCorsProxyButton,
  clearCorsProxyButton,
  mcpServerEndpointForm,
  mcpServerEndpointInput,
  addMcpServerButton,
  mcpServersList,
  renderMathMlToggle,
  enableSingleKeyShortcutsToggle,
  transcriptViewSelect,
  defaultSystemPromptInput,
  exportConversationsButton,
  deleteConversationsButton,
  conversationLanguageSelect,
  enableModelThinkingToggle,
  modelSelect,
  backendSelect,
  cpuThreadsInput,
  clearModelDownloadsButton,
  maxOutputTokensInput,
  maxContextTokensInput,
  temperatureInput,
  resetContextTokensButton,
  resetTemperatureButton,
  topKInput,
  topPInput,
  resetTopKButton,
  resetTopPButton,
  wllamaPromptCacheToggle,
  wllamaBatchSizeInput,
  wllamaMinPInput,
  colorSchemeQuery,
  setActiveSettingsTab,
  setSettingsPageVisibility,
  getStoredThemePreference,
  applyTheme,
  applyShowThinkingPreference,
  applyToolCallingPreference,
  applyToolEnabledPreference,
  clearCustomOrchestrationFeedback,
  exportAllCustomOrchestrations,
  exportCustomOrchestration,
  importCustomOrchestrationFile,
  loadCustomOrchestrationIntoEditor,
  removeCustomOrchestrationPreference,
  resetCustomOrchestrationEditor,
  saveCustomOrchestrationDraft,
  setCustomOrchestrationFeedback,
  applySkillPackageEnabledPreference,
  clearSkillPackageFeedback,
  importSkillPackageFile,
  removeSkillPackagePreference,
  addCloudProvider,
  setCloudProviderFeedback,
  clearCloudProviderFeedback,
  refreshCloudProviderPreference,
  removeCloudProviderPreference,
  saveCloudProviderSecretPreference,
  setCloudProviderModelSelected,
  updateCloudModelFeaturePreference,
  updateCloudModelGenerationPreference,
  updateCloudModelThinkingPreference,
  updateCloudModelRateLimitPreference,
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
  applyCpuThreadsPreference,
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
  setSkillPackageFeedback,
  setMcpServerFeedback,
  syncModelSelectionForCurrentEnvironment,
  syncConversationLanguageAndThinkingControls,
  syncGenerationSettingsFromModel,
  getActiveConversation,
  assignConversationModelId,
  queueConversationStateSave,
  reinitializeEngineFromSettings: () => appController.reinitializeEngineFromSettings(),
  clearSelectedModelDownloads,
  onGenerationSettingInputChanged,
  onWllamaSettingInputChanged,
  getModelGenerationLimits,
  normalizeModelId,
  defaultModelId: DEFAULT_MODEL,
  exportAllConversations,
  deleteAllConversationStorage,
  isUiBusy,
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
  isOrchestrationRunningState: isBlockingOrchestrationState,
  isMessageEditActive,
  isEngineReady,
  hasStartedWorkspace: selectHasStartedWorkspace,
  setChatWorkspaceStarted,
  setPreparingNewConversation,
  updateWelcomePanelVisibility,
  preparePendingConversationDraft,
  syncConversationLanguageAndThinkingControls,
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
  matchCustomOrchestrationSlashCommand: matchSavedOrchestrationSlashCommand,
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
  setModelLoadFeedbackContext,
  syncRouteToState: syncRouteToCurrentState,
  buildUserMessageAttachmentPayload,
  beforeStartGeneration: async (conversation, userMessage) => {
    await cancelActiveAgentFollowUp();
    return ensureAgentConversationSummaryBeforeSend(conversation, userMessage);
  },
  onUserMessageAdded: (conversation) => {
    if (isAgentConversation(conversation)) {
      recordAgentActivity(conversation, { timestamp: Date.now() });
    }
  },
  addMessageToConversation,
  addMessageElement,
  buildPromptForActiveConversation,
  runCustomOrchestrationFromMessage: (userMessage, invocation) =>
    appController.runCustomOrchestrationFromMessage(userMessage, invocation),
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
  openKeyboardShortcutsButtons: [openKeyboardShortcutsMobileButton],
  startConversationButton,
  messageInput,
  newConversationBtn,
  newAgentBtn,
  isGeneratingResponse,
  setChatWorkspaceStarted,
  setPreparingNewConversation,
  updateWelcomePanelVisibility,
  clearUserMessageEditSession,
  setChatTitleEditing,
  clearPendingComposerAttachments,
  clearPendingAgentDraft,
  preparePendingConversationDraft,
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
  setModelLoadFeedbackContext,
  saveChatTitleBtn,
  saveChatTitleEdit,
  cancelChatTitleBtn,
  cancelChatTitleEdit,
  conversationSystemPromptInput,
  conversationSystemPromptAppendToggle,
  agentPromptNameInput,
  agentPromptPersonalityInput,
  saveConversationSystemPromptBtn,
  saveConversationSystemPromptEdit,
  updateConversationSystemPromptPreview,
  focusConversationSystemPromptEditor,
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
