export function bindShellEvents({
  appState,
  documentRef = document,
  windowRef = window,
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
  disposeEngine,
  preChatEditConversationSystemPromptBtn,
  beginConversationSystemPromptEdit,
  preChatLoadModelBtn,
  loadModelForSelectedConversation,
  saveChatTitleBtn,
  saveChatTitleEdit,
  cancelChatTitleBtn,
  cancelChatTitleEdit,
  conversationSystemPromptInput,
  saveConversationSystemPromptBtn,
  saveConversationSystemPromptEdit,
  chatTitleInput,
  updateChatTitleEditorVisibility,
}) {
  if (openKeyboardShortcutsButton instanceof HTMLButtonElement) {
    openKeyboardShortcutsButton.addEventListener('click', (event) => {
      openKeyboardShortcuts(event.currentTarget);
    });
  }

  documentRef.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && keyboardShortcutsModal?.classList.contains('show')) {
      event.preventDefault();
      closeKeyboardShortcuts();
    }
  });

  documentRef.addEventListener('keydown', (event) => {
    if (handleGlobalShortcut(event)) {
      return;
    }
    void handleFocusedMessageShortcut(event);
  });

  windowRef.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || !keyboardShortcutsModal?.classList.contains('show')) {
        return;
      }
      event.preventDefault();
      closeKeyboardShortcuts();
    },
    { capture: true }
  );

  windowRef.addEventListener('hashchange', () => {
    if (appState.ignoreNextHashChange) {
      appState.ignoreNextHashChange = false;
      return;
    }
    applyRouteFromHash();
  });

  if (startConversationButton instanceof HTMLButtonElement) {
    startConversationButton.addEventListener('click', () => {
      setChatWorkspaceStarted(appState, true);
      updateWelcomePanelVisibility({ replaceRoute: false });
      if (messageInput instanceof HTMLTextAreaElement) {
        messageInput.focus();
      }
    });
  }

  if (newConversationBtn) {
    newConversationBtn.addEventListener('click', () => {
      if (isGeneratingResponse(appState)) {
        return;
      }
      setChatWorkspaceStarted(appState, true);
      setPreparingNewConversation(appState, true);
      appState.activeConversationId = null;
      appState.pendingConversationSystemPrompt = '';
      appState.pendingAppendConversationSystemPrompt = true;
      clearUserMessageEditSession();
      setChatTitleEditing(appState, false);
      clearPendingComposerAttachments();
      updateWelcomePanelVisibility({ replaceRoute: false });
      renderConversationList();
      renderTranscript();
      updateChatTitle();
      queueConversationStateSave();
      if (messageInput instanceof HTMLTextAreaElement) {
        messageInput.focus();
      }
    });
  }

  windowRef.addEventListener('beforeunload', () => {
    if (appState.conversationSaveTimerId !== null) {
      windowRef.clearTimeout(appState.conversationSaveTimerId);
      appState.conversationSaveTimerId = null;
    }
    void persistConversationStateNow();
    disposeEngine();
  });

  if (preChatEditConversationSystemPromptBtn instanceof HTMLButtonElement) {
    preChatEditConversationSystemPromptBtn.addEventListener('click', (event) => {
      beginConversationSystemPromptEdit({ trigger: event.currentTarget });
    });
  }

  if (preChatLoadModelBtn instanceof HTMLButtonElement) {
    preChatLoadModelBtn.addEventListener('click', () => {
      void loadModelForSelectedConversation();
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
          conversationSystemPromptInput.value.length
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
        }
      }
    });
  }

  if (keyboardShortcutsModal instanceof HTMLElement) {
    keyboardShortcutsModal.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      closeKeyboardShortcuts();
    });
    keyboardShortcutsModal.addEventListener('keyup', (event) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      closeKeyboardShortcuts();
    });
    keyboardShortcutsModal.addEventListener('hidden.bs.modal', () => {
      if (appState.lastKeyboardShortcutsTrigger instanceof HTMLElement) {
        appState.lastKeyboardShortcutsTrigger.focus();
        appState.lastKeyboardShortcutsTrigger = null;
        return;
      }
      if (openKeyboardShortcutsButton instanceof HTMLButtonElement) {
        openKeyboardShortcutsButton.focus();
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
}
