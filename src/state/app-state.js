/**
 * @param {{
 *   activeGenerationConfig?: any;
 *   defaultSystemPrompt?: string;
 *   maxDebugEntries?: number;
 * }} [options]
 */
export function createAppState({
  activeGenerationConfig,
  defaultSystemPrompt = '',
  maxDebugEntries = 120,
} = {}) {
  return {
    modelReady: false,
    hasStartedChatWorkspace: false,
    isGenerating: false,
    isLoadingModel: false,
    conversationCount: 0,
    conversationIdCounter: 0,
    activeConversationId: null,
    conversations: [],
    debugEntries: [],
    maxDebugEntries,
    activeGenerationConfig,
    pendingGenerationConfig: null,
    pendingComposerAttachments: [],
    conversationSaveTimerId: null,
    showThinkingByDefault: false,
    enableSingleKeyShortcuts: true,
    transcriptView: 'standard',
    defaultSystemPrompt,
    isSwitchingVariant: false,
    activeUserEditMessageId: null,
    activeUserBranchSourceMessageId: null,
    isChatTitleEditing: false,
    isRunningOrchestration: false,
    isSettingsPageOpen: false,
    activeSettingsTab: 'system',
    keyboardShortcutsModalInstance: null,
    conversationSystemPromptModalInstance: null,
    currentWorkspaceView: 'home',
    ignoreNextHashChange: false,
    loadProgressFiles: new Map(),
    maxObservedLoadPercent: 0,
    webGpuProbeCompleted: false,
    webGpuAdapterAvailable: false,
    hasLoggedMathJaxError: false,
    mathJaxLoadPromise: null,
    lastKeyboardShortcutsTrigger: null,
    lastConversationSystemPromptTrigger: null,
    lastConversationTitleTrigger: null,
  };
}

export function getActiveConversation(state) {
  return (
    state?.conversations?.find((conversation) => conversation.id === state.activeConversationId) || null
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
  return (
    state.hasStartedChatWorkspace &&
    !state.isSettingsPageOpen &&
    !state.modelReady &&
    hasSelectedConversationWithHistory(state)
  );
}

export function shouldShowNewConversationButton(state) {
  return (
    state.hasStartedChatWorkspace &&
    !state.isSettingsPageOpen &&
    (state.isGenerating || (state.modelReady && hasAnyStartedInference(state)))
  );
}

export function getCurrentViewRoute(state, { routeHome, routeChat, routeSettings }) {
  if (state.isSettingsPageOpen) {
    return routeSettings;
  }
  if (state.hasStartedChatWorkspace) {
    return routeChat;
  }
  return routeHome;
}
