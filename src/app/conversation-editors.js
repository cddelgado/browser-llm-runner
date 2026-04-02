export function createConversationEditors({
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
  createConversationSystemPromptModalInstance,
}) {
  function getConversationSystemPromptModalInstance() {
    if (!(conversationSystemPromptModal instanceof HTMLElement)) {
      return null;
    }
    if (!appState.conversationSystemPromptModalInstance) {
      appState.conversationSystemPromptModalInstance =
        typeof createConversationSystemPromptModalInstance === 'function'
          ? createConversationSystemPromptModalInstance(conversationSystemPromptModal)
          : null;
    }
    return appState.conversationSystemPromptModalInstance;
  }

  function updateChatTitleEditorVisibility() {
    if (!chatTitle || !chatTitleInput || !saveChatTitleBtn || !cancelChatTitleBtn) {
      return;
    }
    const activeConversation = getActiveConversation();
    const menuState = getConversationMenuState(activeConversation);
    const canEditTitle = menuState.canEditName;
    const controlsDisabled = isUiBusy();
    const showEditor = canEditTitle && isChatTitleEditingState(appState);
    chatTitle.classList.toggle('d-none', showEditor);
    chatTitleInput.classList.toggle('d-none', !showEditor);
    saveChatTitleBtn.classList.toggle('d-none', !showEditor);
    cancelChatTitleBtn.classList.toggle('d-none', !showEditor);
    chatTitleInput.disabled = !showEditor || controlsDisabled;
    saveChatTitleBtn.disabled = controlsDisabled || !chatTitleInput.value.trim();
    cancelChatTitleBtn.disabled = controlsDisabled;
  }

  function beginConversationSystemPromptEdit({ trigger = null } = {}) {
    if (
      isUiBusy() ||
      !(conversationSystemPromptInput instanceof HTMLTextAreaElement) ||
      !(conversationSystemPromptAppendToggle instanceof HTMLInputElement)
    ) {
      return;
    }
    const activeConversation = getActiveConversation();
    if (trigger instanceof HTMLElement) {
      appState.lastConversationSystemPromptTrigger = trigger;
    }
    conversationSystemPromptInput.value = normalizeSystemPrompt(
      activeConversation
        ? activeConversation.conversationSystemPrompt
        : appState.pendingConversationSystemPrompt,
    );
    conversationSystemPromptAppendToggle.checked = normalizeConversationPromptMode(
      activeConversation
        ? activeConversation.appendConversationSystemPrompt
        : appState.pendingAppendConversationSystemPrompt,
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
    const normalizedPrompt = normalizeSystemPrompt(conversationSystemPromptInput.value);
    const appendPrompt = Boolean(conversationSystemPromptAppendToggle.checked);
    if (activeConversation) {
      activeConversation.conversationSystemPrompt = normalizedPrompt;
      activeConversation.appendConversationSystemPrompt = appendPrompt;
      queueConversationStateSave();
    } else {
      appState.pendingConversationSystemPrompt = normalizedPrompt;
      appState.pendingAppendConversationSystemPrompt = appendPrompt;
    }
    setStatus('Conversation system prompt saved.');
    const modalInstance = getConversationSystemPromptModalInstance();
    if (modalInstance) {
      modalInstance.hide();
    }
  }

  function beginChatTitleEdit({ trigger = null } = {}) {
    if (isUiBusy()) {
      return;
    }
    const activeConversation = getActiveConversation();
    if (!activeConversation?.hasGeneratedName || !chatTitleInput) {
      return;
    }
    if (trigger instanceof HTMLElement) {
      appState.lastConversationTitleTrigger = trigger;
    }
    setChatTitleEditing(appState, true);
    chatTitleInput.value = activeConversation.name;
    updateChatTitleEditorVisibility();
    chatTitleInput.focus();
    chatTitleInput.select();
  }

  function cancelChatTitleEdit({ restoreFocus = true } = {}) {
    if (!isChatTitleEditingState(appState)) {
      return;
    }
    setChatTitleEditing(appState, false);
    updateChatTitle();
    if (restoreFocus && appState.lastConversationTitleTrigger instanceof HTMLElement) {
      appState.lastConversationTitleTrigger.focus();
    }
    appState.lastConversationTitleTrigger = null;
  }

  function saveChatTitleEdit() {
    if (!isChatTitleEditingState(appState) || !chatTitleInput) {
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
    setChatTitleEditing(appState, false);
    renderConversationList();
    updateChatTitle();
    queueConversationStateSave();
    setStatus('Conversation title saved.');
    if (appState.lastConversationTitleTrigger instanceof HTMLElement) {
      appState.lastConversationTitleTrigger.focus();
    }
    appState.lastConversationTitleTrigger = null;
  }

  return {
    updateChatTitleEditorVisibility,
    beginConversationSystemPromptEdit,
    saveConversationSystemPromptEdit,
    beginChatTitleEdit,
    cancelChatTitleEdit,
    saveChatTitleEdit,
  };
}
