export const ENGINE_PHASES = Object.freeze({
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  GENERATING: 'generating',
});

export const WORKSPACE_VIEWS = Object.freeze({
  HOME: 'home',
  PRECHAT: 'prechat',
  CHAT: 'chat',
  SETTINGS: 'settings',
});

export const INTERACTION_MODES = Object.freeze({
  NONE: 'none',
  MESSAGE_EDIT: 'message-edit',
  MESSAGE_BRANCH: 'message-branch',
  TITLE_EDIT: 'title-edit',
  VARIANT_SWITCH: 'variant-switch',
});

export const ORCHESTRATION_STATUSES = Object.freeze({
  IDLE: 'idle',
  RUNNING: 'running',
});

export const ORCHESTRATION_KINDS = Object.freeze({
  NONE: 'none',
  RENAME: 'rename',
  FIX: 'fix',
  AGENT_FOLLOW_UP: 'agent-follow-up',
  SUMMARY: 'summary',
  GENERIC: 'generic',
});

/**
 * @param {{
 *   activeGenerationConfig?: any;
 *   defaultSystemPrompt?: string;
 *   enableToolCalling?: boolean;
 *   enabledToolNames?: string[];
 *   skillPackages?: any[];
 *   mcpServers?: any[];
 *   renderMathMl?: boolean;
 *   corsProxyUrl?: string;
 *   maxDebugEntries?: number;
 * }} [options]
 */
export function createAppState({
  activeGenerationConfig,
  defaultSystemPrompt = '',
  enableToolCalling = true,
  enabledToolNames = [],
  skillPackages = [],
  mcpServers = [],
  renderMathMl = true,
  corsProxyUrl = '',
  maxDebugEntries = 240,
} = {}) {
  return {
    modelReady: false,
    enginePhase: ENGINE_PHASES.IDLE,
    hasStartedChatWorkspace: false,
    isPreparingNewConversation: false,
    isGenerating: false,
    isLoadingModel: false,
    conversationCount: 0,
    conversationIdCounter: 0,
    activeConversationId: null,
    pendingConversationDraftId: '',
    pendingConversationType: 'chat',
    pendingAgentName: '',
    pendingAgentDescription: '',
    conversations: [],
    debugEntries: [],
    debugEntryCounter: 0,
    debugPageIndex: 0,
    maxDebugEntries,
    activeGenerationConfig,
    pendingGenerationConfig: null,
    pendingComposerAttachments: [],
    pendingAttachmentOperationCount: 0,
    corsProxyUrl: typeof corsProxyUrl === 'string' ? corsProxyUrl.trim() : '',
    conversationSaveTimerId: null,
    showThinkingByDefault: false,
    enableToolCalling: Boolean(enableToolCalling),
    enabledToolNames: Array.isArray(enabledToolNames) ? [...enabledToolNames] : [],
    skillPackages: Array.isArray(skillPackages) ? [...skillPackages] : [],
    mcpServers: Array.isArray(mcpServers) ? [...mcpServers] : [],
    renderMathMl: Boolean(renderMathMl),
    enableSingleKeyShortcuts: true,
    transcriptView: 'standard',
    defaultSystemPrompt,
    pendingConversationSystemPrompt: '',
    pendingAppendConversationSystemPrompt: true,
    pendingConversationLanguagePreference: 'auto',
    pendingConversationThinkingEnabled: true,
    isSwitchingVariant: false,
    interactionMode: INTERACTION_MODES.NONE,
    activeUserEditMessageId: null,
    activeUserBranchSourceMessageId: null,
    isChatTitleEditing: false,
    isRunningOrchestration: false,
    orchestrationStatus: ORCHESTRATION_STATUSES.IDLE,
    activeOrchestrationKind: ORCHESTRATION_KINDS.NONE,
    isBlockingOrchestration: false,
    isSettingsPageOpen: false,
    activeSettingsTab: 'system',
    isConversationSystemPromptModalOpen: false,
    keyboardShortcutsModalInstance: null,
    conversationSystemPromptModalInstance: null,
    workspaceView: WORKSPACE_VIEWS.HOME,
    currentWorkspaceView: 'home',
    ignoreNextHashChange: false,
    loadProgressFiles: new Map(),
    loadProgressSequence: 0,
    maxObservedLoadPercent: 0,
    webGpuProbeCompleted: false,
    webGpuAdapterAvailable: false,
    hasLoggedMathJaxError: false,
    mathJaxLoadPromise: null,
    lastKeyboardShortcutsTrigger: null,
    lastConversationSystemPromptTrigger: null,
    lastConversationTitleTrigger: null,
    terminalOpenConversationId: null,
    terminalDismissedConversationIds: new Set(),
    pendingShellCommand: null,
    completedShellCommand: null,
    activeWorkspaceSidePanel: null,
  };
}

export function isTerminalOpen(state) {
  return (
    typeof state?.terminalOpenConversationId === 'string' && state.terminalOpenConversationId.trim()
  );
}

export function isTerminalOpenForConversation(state, conversationId) {
  const normalizedConversationId = typeof conversationId === 'string' ? conversationId.trim() : '';
  if (!normalizedConversationId) {
    return false;
  }
  return state?.terminalOpenConversationId === normalizedConversationId;
}

export function hasDismissedTerminalForConversation(state, conversationId) {
  const normalizedConversationId = typeof conversationId === 'string' ? conversationId.trim() : '';
  if (!normalizedConversationId) {
    return false;
  }
  return state?.terminalDismissedConversationIds instanceof Set
    ? state.terminalDismissedConversationIds.has(normalizedConversationId)
    : false;
}

export function clearTerminalDismissal(state, conversationId) {
  const normalizedConversationId = typeof conversationId === 'string' ? conversationId.trim() : '';
  if (!normalizedConversationId) {
    return false;
  }
  if (!(state?.terminalDismissedConversationIds instanceof Set)) {
    state.terminalDismissedConversationIds = new Set();
  }
  return state.terminalDismissedConversationIds.delete(normalizedConversationId);
}

export function openTerminalForConversation(state, conversationId) {
  const normalizedConversationId = typeof conversationId === 'string' ? conversationId.trim() : '';
  if (!normalizedConversationId) {
    state.terminalOpenConversationId = null;
    return null;
  }
  clearTerminalDismissal(state, normalizedConversationId);
  state.terminalOpenConversationId = normalizedConversationId;
  return state.terminalOpenConversationId;
}

export function closeTerminal(state, { conversationId = null, dismissed = false } = {}) {
  const normalizedConversationId = typeof conversationId === 'string' ? conversationId.trim() : '';
  if (dismissed && normalizedConversationId) {
    if (!(state?.terminalDismissedConversationIds instanceof Set)) {
      state.terminalDismissedConversationIds = new Set();
    }
    state.terminalDismissedConversationIds.add(normalizedConversationId);
  }
  if (!normalizedConversationId || state?.terminalOpenConversationId === normalizedConversationId) {
    state.terminalOpenConversationId = null;
  }
  return state?.terminalOpenConversationId || null;
}

export function deriveEnginePhase(state) {
  if (state?.isLoadingModel) {
    return ENGINE_PHASES.LOADING;
  }
  if (state?.isGenerating) {
    return ENGINE_PHASES.GENERATING;
  }
  if (state?.modelReady) {
    return ENGINE_PHASES.READY;
  }
  return ENGINE_PHASES.IDLE;
}

export function refreshEnginePhase(state) {
  const nextPhase = deriveEnginePhase(state);
  state.enginePhase = nextPhase;
  return nextPhase;
}

export function isEngineReady(state) {
  return deriveEnginePhase(state) === ENGINE_PHASES.READY;
}

export function isLoadingModelState(state) {
  return deriveEnginePhase(state) === ENGINE_PHASES.LOADING;
}

export function isGeneratingResponse(state) {
  return deriveEnginePhase(state) === ENGINE_PHASES.GENERATING;
}

export function isEngineBusy(state) {
  const phase = deriveEnginePhase(state);
  return phase === ENGINE_PHASES.LOADING || phase === ENGINE_PHASES.GENERATING;
}

export function isProcessingAttachments(state) {
  return Number.isFinite(state?.pendingAttachmentOperationCount)
    ? state.pendingAttachmentOperationCount > 0
    : false;
}

export function beginAttachmentOperation(state) {
  const currentCount = Number.isFinite(state?.pendingAttachmentOperationCount)
    ? Math.max(0, Math.trunc(state.pendingAttachmentOperationCount))
    : 0;
  state.pendingAttachmentOperationCount = currentCount + 1;
  return state.pendingAttachmentOperationCount;
}

export function endAttachmentOperation(state) {
  const currentCount = Number.isFinite(state?.pendingAttachmentOperationCount)
    ? Math.max(0, Math.trunc(state.pendingAttachmentOperationCount))
    : 0;
  state.pendingAttachmentOperationCount = Math.max(0, currentCount - 1);
  return state.pendingAttachmentOperationCount;
}

export function shouldDisableConversationControls(state) {
  return isEngineBusy(state);
}

export function setModelReady(state, value) {
  state.modelReady = Boolean(value);
  return refreshEnginePhase(state);
}

export function setLoadingModel(state, value) {
  state.isLoadingModel = Boolean(value);
  return refreshEnginePhase(state);
}

export function setGenerating(state, value) {
  state.isGenerating = Boolean(value);
  return refreshEnginePhase(state);
}

/**
 * @param {any} state
 * @param {any} value
 * @param {{ kind?: string; blocksUi?: boolean }} [options]
 */
export function setOrchestrationRunning(
  state,
  value,
  { kind = ORCHESTRATION_KINDS.GENERIC, blocksUi = false } = {}
) {
  state.isRunningOrchestration = Boolean(value);
  state.orchestrationStatus = state.isRunningOrchestration
    ? ORCHESTRATION_STATUSES.RUNNING
    : ORCHESTRATION_STATUSES.IDLE;
  const normalizedKind =
    typeof kind === 'string' && kind.trim() ? kind.trim() : ORCHESTRATION_KINDS.GENERIC;
  state.activeOrchestrationKind = state.isRunningOrchestration
    ? normalizedKind
    : ORCHESTRATION_KINDS.NONE;
  state.isBlockingOrchestration = state.isRunningOrchestration && Boolean(blocksUi);
  return state.orchestrationStatus;
}

export function isOrchestrationRunningState(state) {
  return state?.orchestrationStatus === ORCHESTRATION_STATUSES.RUNNING;
}

export function getActiveOrchestrationKind(state) {
  return typeof state?.activeOrchestrationKind === 'string'
    ? state.activeOrchestrationKind
    : ORCHESTRATION_KINDS.NONE;
}

export function isBlockingOrchestrationState(state) {
  return isOrchestrationRunningState(state) && Boolean(state?.isBlockingOrchestration);
}

export function deriveInteractionMode(state) {
  if (state?.activeUserEditMessageId) {
    return state.activeUserBranchSourceMessageId
      ? INTERACTION_MODES.MESSAGE_BRANCH
      : INTERACTION_MODES.MESSAGE_EDIT;
  }
  if (state?.isChatTitleEditing) {
    return INTERACTION_MODES.TITLE_EDIT;
  }
  if (state?.isSwitchingVariant) {
    return INTERACTION_MODES.VARIANT_SWITCH;
  }
  return INTERACTION_MODES.NONE;
}

export function refreshInteractionMode(state) {
  const nextMode = deriveInteractionMode(state);
  state.interactionMode = nextMode;
  return nextMode;
}

export function isMessageEditActive(state) {
  const mode = deriveInteractionMode(state);
  return mode === INTERACTION_MODES.MESSAGE_EDIT || mode === INTERACTION_MODES.MESSAGE_BRANCH;
}

export function getActiveUserEditMessageId(state) {
  return typeof state?.activeUserEditMessageId === 'string' ? state.activeUserEditMessageId : null;
}

export function isVariantSwitchingState(state) {
  return deriveInteractionMode(state) === INTERACTION_MODES.VARIANT_SWITCH;
}

export function isChatTitleEditingState(state) {
  return deriveInteractionMode(state) === INTERACTION_MODES.TITLE_EDIT;
}

export function isInteractionLocked(state) {
  return deriveInteractionMode(state) !== INTERACTION_MODES.NONE;
}

export function setUserMessageEditState(
  state,
  { messageId = null, branchSourceMessageId = null } = {}
) {
  state.activeUserEditMessageId = messageId;
  state.activeUserBranchSourceMessageId = branchSourceMessageId;
  return refreshInteractionMode(state);
}

export function clearUserMessageEditState(state) {
  return setUserMessageEditState(state);
}

export function setChatTitleEditing(state, value) {
  state.isChatTitleEditing = Boolean(value);
  return refreshInteractionMode(state);
}

export function setSwitchingVariant(state, value) {
  state.isSwitchingVariant = Boolean(value);
  return refreshInteractionMode(state);
}

export function deriveWorkspaceView(state) {
  if (state?.isSettingsPageOpen) {
    return WORKSPACE_VIEWS.SETTINGS;
  }
  if (!state?.hasStartedChatWorkspace) {
    return WORKSPACE_VIEWS.HOME;
  }
  if (state?.isPreparingNewConversation) {
    return WORKSPACE_VIEWS.PRECHAT;
  }
  if (!state?.modelReady && !getActiveConversation(state)) {
    return WORKSPACE_VIEWS.PRECHAT;
  }
  return WORKSPACE_VIEWS.CHAT;
}

export function refreshWorkspaceView(state) {
  const nextView = deriveWorkspaceView(state);
  state.workspaceView = nextView;
  state.currentWorkspaceView = nextView;
  return nextView;
}

export function isSettingsView(state) {
  return deriveWorkspaceView(state) === WORKSPACE_VIEWS.SETTINGS;
}

export function hasStartedWorkspace(state) {
  const workspaceView = deriveWorkspaceView(state);
  return workspaceView !== WORKSPACE_VIEWS.HOME && workspaceView !== WORKSPACE_VIEWS.SETTINGS
    ? true
    : Boolean(state?.hasStartedChatWorkspace);
}

export function setSettingsPageOpen(state, value) {
  state.isSettingsPageOpen = Boolean(value);
  return refreshWorkspaceView(state);
}

export function setChatWorkspaceStarted(state, value) {
  state.hasStartedChatWorkspace = Boolean(value);
  return refreshWorkspaceView(state);
}

export function setPreparingNewConversation(state, value) {
  state.isPreparingNewConversation = Boolean(value);
  return refreshWorkspaceView(state);
}

export function getActiveConversation(state) {
  return (
    state?.conversations?.find((conversation) => conversation.id === state.activeConversationId) ||
    null
  );
}

export function findConversationById(state, conversationId) {
  return state?.conversations?.find((conversation) => conversation.id === conversationId) || null;
}

export function hasConversationHistory(conversation) {
  return getConversationPathMessagesForState(conversation).length > 0;
}

function getConversationPathMessagesForState(conversation) {
  if (!conversation || !conversation.activeLeafMessageId) {
    return [];
  }
  const byId = new Map(conversation.messageNodes.map((message) => [message.id, message]));
  const path = [];
  let cursor = byId.get(conversation.activeLeafMessageId) || null;
  while (cursor) {
    path.push(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) || null : null;
  }
  return path.reverse();
}

export function hasSelectedConversationWithHistory(state) {
  return hasConversationHistory(getActiveConversation(state));
}

export function hasAnyStartedInference(state) {
  return Boolean(
    state?.conversations?.some((conversation) =>
      conversation?.messageNodes?.some((message) => message?.role === 'model')
    )
  );
}

export function shouldDisableComposerForPreChatConversationSelection(state) {
  if (deriveWorkspaceView(state) !== WORKSPACE_VIEWS.PRECHAT) {
    return false;
  }
  return (
    state.hasStartedChatWorkspace &&
    deriveEnginePhase(state) !== ENGINE_PHASES.READY &&
    hasSelectedConversationWithHistory(state)
  );
}

export function shouldShowNewConversationButton(state) {
  return Boolean(state?.hasStartedChatWorkspace);
}

export function shouldDisableNewConversationButton(state) {
  return (
    isProcessingAttachments(state) ||
    isGeneratingResponse(state) ||
    isBlockingOrchestrationState(state) ||
    (Boolean(state?.isPreparingNewConversation) && state?.pendingConversationType !== 'agent') ||
    !hasStartedWorkspace(state)
  );
}

export function shouldDisableNewAgentButton(state) {
  return (
    isProcessingAttachments(state) ||
    isGeneratingResponse(state) ||
    isBlockingOrchestrationState(state) ||
    (Boolean(state?.isPreparingNewConversation) && state?.pendingConversationType === 'agent') ||
    !hasStartedWorkspace(state)
  );
}

export function getCurrentViewRoute(state, { routeHome, routeChat, routeSettings }) {
  const workspaceView = deriveWorkspaceView(state);
  if (workspaceView === WORKSPACE_VIEWS.SETTINGS) {
    return routeSettings;
  }
  if (workspaceView === WORKSPACE_VIEWS.CHAT || workspaceView === WORKSPACE_VIEWS.PRECHAT) {
    return routeChat;
  }
  return routeHome;
}
