function isEditableElement(element) {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    Boolean(element instanceof HTMLElement && element.isContentEditable)
  );
}

function isShortcutTriggerAllowed(element, isAnyModalOpen) {
  return !isEditableElement(element) && !isAnyModalOpen();
}

function clickShortcutTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.classList.contains('d-none') || target.closest('.d-none')) {
    return false;
  }
  if (target.hasAttribute('disabled') || target.getAttribute('aria-disabled') === 'true') {
    return false;
  }
  if (target.tagName === 'A') {
    target.click();
    return true;
  }
  if (target instanceof HTMLButtonElement) {
    target.click();
    return true;
  }
  return false;
}

export function createShortcutHandlers({
  appState,
  documentRef = document,
  keyboardShortcutsModal,
  shortcutKeys,
  isAnyModalOpen,
  openKeyboardShortcuts,
  closeKeyboardShortcuts,
  messageInput,
  sendButton,
  isSettingsView,
  setSettingsPageVisibility,
  openSettingsButton,
  hasStartedWorkspace,
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
  regenerateFromMessage,
  fixResponseFromMessage,
  handleMessageCopyAction,
  beginUserMessageEdit,
  branchFromUserMessage,
}) {
  function getFocusedMessageShortcutContext() {
    const activeElement = documentRef.activeElement;
    if (!(activeElement instanceof Element)) {
      return null;
    }
    const messageRow = activeElement.closest('.message-row');
    if (!(messageRow instanceof HTMLElement)) {
      return null;
    }
    const messageId = messageRow.dataset.messageId;
    if (!messageId) {
      return null;
    }
    const activeConversation = getActiveConversation();
    if (!activeConversation) {
      return null;
    }
    const message = getMessageNodeById(activeConversation, messageId);
    if (!message) {
      return null;
    }
    return { message, messageRow };
  }

  function handleFocusedMessageShortcut(event) {
    if (!isShortcutTriggerAllowed(event.target, isAnyModalOpen)) {
      return false;
    }
    if (!appState.enableSingleKeyShortcuts) {
      return false;
    }
    const context = getFocusedMessageShortcutContext();
    if (!context) {
      return false;
    }
    const { message, messageRow } = context;
    const normalizedKey = String(event.key || '').toLowerCase();
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return false;
    }
    if (event.key === '[') {
      event.preventDefault();
      if (message.role === 'model') {
        switchModelVariant(message.id, -1);
        return true;
      }
      if (message.role === 'user') {
        switchUserVariant(message.id, -1);
        return true;
      }
      return false;
    }
    if (event.key === ']') {
      event.preventDefault();
      if (message.role === 'model') {
        switchModelVariant(message.id, 1);
        return true;
      }
      if (message.role === 'user') {
        switchUserVariant(message.id, 1);
        return true;
      }
      return false;
    }
    if (message.role === 'model') {
      if (normalizedKey === shortcutKeys.regenerate) {
        event.preventDefault();
        regenerateFromMessage(message.id);
        return true;
      }
      if (normalizedKey === shortcutKeys.fix) {
        event.preventDefault();
        void fixResponseFromMessage(message.id);
        return true;
      }
      if (normalizedKey === shortcutKeys.copy) {
        event.preventDefault();
        void handleMessageCopyAction(message.id, event.shiftKey ? 'thoughts' : 'response');
        return true;
      }
      return false;
    }
    if (message.role === 'user') {
      if (normalizedKey === shortcutKeys.edit) {
        event.preventDefault();
        beginUserMessageEdit(message.id);
        return true;
      }
      if (normalizedKey === shortcutKeys.branch) {
        event.preventDefault();
        branchFromUserMessage(message.id);
        return true;
      }
      if (normalizedKey === shortcutKeys.copy) {
        event.preventDefault();
        void handleMessageCopyAction(message.id, 'message');
        return true;
      }
      const editor = messageRow.querySelector('.user-message-editor');
      if (
        editor instanceof HTMLTextAreaElement &&
        documentRef.activeElement === editor &&
        normalizedKey === shortcutKeys.edit
      ) {
        return false;
      }
    }
    return false;
  }

  function handleGlobalShortcut(event) {
    const normalizedKey = String(event.key || '').toLowerCase();
    const target = event.target;
    const editableTarget = isEditableElement(target);

    if (event.ctrlKey && !event.altKey && !event.metaKey && normalizedKey === '/') {
      event.preventDefault();
      if (isAnyModalOpen() && keyboardShortcutsModal?.classList.contains('show')) {
        closeKeyboardShortcuts();
        return true;
      }
      if (isAnyModalOpen()) {
        return false;
      }
      openKeyboardShortcuts(target instanceof HTMLElement ? target : null);
      return true;
    }

    if (event.ctrlKey && !event.altKey && !event.metaKey && normalizedKey === 'enter') {
      if (
        documentRef.activeElement === messageInput &&
        sendButton instanceof HTMLButtonElement &&
        !sendButton.disabled
      ) {
        event.preventDefault();
        sendButton.click();
        return true;
      }
      return false;
    }

    if (editableTarget || isAnyModalOpen()) {
      return false;
    }

    if (!event.altKey || event.ctrlKey || event.metaKey) {
      return false;
    }

    if (normalizedKey === shortcutKeys.settings) {
      event.preventDefault();
      if (isSettingsView(appState)) {
        setSettingsPageVisibility(false, { replaceRoute: false });
        if (openSettingsButton instanceof HTMLButtonElement) {
          openSettingsButton.focus();
        }
      } else if (
        openSettingsButton instanceof HTMLButtonElement &&
        !openSettingsButton.disabled
      ) {
        openSettingsButton.click();
      }
      return true;
    }

    if (normalizedKey === shortcutKeys.help) {
      event.preventDefault();
      return clickShortcutTarget(documentRef.getElementById('openHelpButton'));
    }

    if (normalizedKey === shortcutKeys.newConversation) {
      event.preventDefault();
      if (!hasStartedWorkspace(appState)) {
        return clickShortcutTarget(startConversationButton);
      }
      return clickShortcutTarget(newConversationBtn);
    }

    if (normalizedKey === shortcutKeys.loadModel) {
      event.preventDefault();
      return clickShortcutTarget(preChatLoadModelBtn);
    }

    if (normalizedKey === shortcutKeys.jumpPrompt) {
      event.preventDefault();
      return clickShortcutTarget(jumpToPreviousUserButton);
    }

    if (event.shiftKey && normalizedKey === shortcutKeys.jumpLatest) {
      event.preventDefault();
      downloadActiveConversationBranchAsJson();
      return true;
    }

    if (event.shiftKey && normalizedKey === 'm') {
      event.preventDefault();
      downloadActiveConversationBranchAsMarkdown();
      return true;
    }

    if (normalizedKey === shortcutKeys.jumpLatest) {
      event.preventDefault();
      return clickShortcutTarget(jumpToLatestButton);
    }

    if (normalizedKey === shortcutKeys.systemPrompt) {
      event.preventDefault();
      if (getActiveConversation()) {
        beginConversationSystemPromptEdit();
        return true;
      }
      return clickShortcutTarget(preChatEditConversationSystemPromptBtn);
    }

    if (normalizedKey === shortcutKeys.title) {
      event.preventDefault();
      beginChatTitleEdit();
      return true;
    }

    if (normalizedKey === '.' && isGeneratingResponse(appState)) {
      event.preventDefault();
      return clickShortcutTarget(sendButton);
    }

    return false;
  }

  return {
    handleFocusedMessageShortcut,
    handleGlobalShortcut,
  };
}
