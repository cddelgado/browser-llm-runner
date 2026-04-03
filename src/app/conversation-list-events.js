export function bindConversationListEvents({
  appState,
  documentRef = document,
  conversationList,
  isGeneratingResponse,
  deleteConversationStorage = async () => {},
  clearUserMessageEditSession,
  setChatTitleEditing,
  getActiveConversation,
  syncConversationModelSelection,
  activeConversationNeedsModelLoad,
  loadModelForSelectedConversation,
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
}) {
  const getConversationItem = (element) => {
    const item = element.closest('.conversation-item');
    return item instanceof HTMLElement ? item : null;
  };

  if (conversationList) {
    conversationList.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      if (isGeneratingResponse(appState)) {
        return;
      }

      const menuToggle = target.closest('.conversation-menu-toggle');
      if (menuToggle instanceof HTMLButtonElement) {
        const item = getConversationItem(menuToggle);
        openConversationMenu(item, menuToggle);
        return;
      }

      const downloadToggle = target.closest('.conversation-download-toggle');
      if (downloadToggle instanceof HTMLButtonElement) {
        const item = getConversationItem(downloadToggle);
        toggleConversationDownloadMenu(item, downloadToggle);
        return;
      }

      const deleteButton = target.closest('.conversation-delete');
      if (deleteButton instanceof HTMLButtonElement) {
        const item = getConversationItem(deleteButton);
        const conversationId = item?.dataset.conversationId;
        if (!conversationId) {
          return;
        }

        const index = appState.conversations.findIndex(
          (conversation) => conversation.id === conversationId,
        );
        if (index < 0) {
          return;
        }

        await deleteConversationStorage(conversationId);

        const wasActive = appState.activeConversationId === conversationId;
        appState.conversations.splice(index, 1);

        if (wasActive) {
          appState.activeConversationId = appState.conversations[0]?.id || null;
          clearUserMessageEditSession();
          setChatTitleEditing(appState, false);
          const nextActiveConversation = getActiveConversation();
          if (nextActiveConversation) {
            const selection = syncConversationModelSelection(nextActiveConversation, {
              useDefaults: true,
            });
            if (activeConversationNeedsModelLoad(nextActiveConversation, selection)) {
              void loadModelForSelectedConversation();
            }
          }
        }
        renderConversationList();
        renderTranscript();
        updateChatTitle();
        queueConversationStateSave();
        return;
      }

      const editNameButton = target.closest('.conversation-edit-name');
      if (editNameButton instanceof HTMLButtonElement) {
        const item = getConversationItem(editNameButton);
        const conversationId = item?.dataset.conversationId;
        if (!conversationId) {
          return;
        }
        runConversationMenuAction(conversationId, editNameButton, (trigger) => {
          beginChatTitleEdit({ trigger });
        });
        return;
      }

      const editPromptButton = target.closest('.conversation-edit-prompt');
      if (editPromptButton instanceof HTMLButtonElement) {
        const item = getConversationItem(editPromptButton);
        const conversationId = item?.dataset.conversationId;
        if (!conversationId) {
          return;
        }
        runConversationMenuAction(conversationId, editPromptButton, (trigger) => {
          beginConversationSystemPromptEdit({ trigger });
        });
        return;
      }

      const downloadJsonButton = target.closest('.conversation-download-json');
      if (downloadJsonButton instanceof HTMLButtonElement) {
        const item = getConversationItem(downloadJsonButton);
        const conversationId = item?.dataset.conversationId;
        if (!conversationId) {
          return;
        }
        runConversationMenuAction(conversationId, downloadJsonButton, () => {
          downloadActiveConversationBranchAsJson();
        });
        return;
      }

      const downloadMarkdownButton = target.closest('.conversation-download-markdown');
      if (downloadMarkdownButton instanceof HTMLButtonElement) {
        const item = getConversationItem(downloadMarkdownButton);
        const conversationId = item?.dataset.conversationId;
        if (!conversationId) {
          return;
        }
        runConversationMenuAction(conversationId, downloadMarkdownButton, () => {
          downloadActiveConversationBranchAsMarkdown();
        });
        return;
      }

      const selectButton = target.closest('.conversation-select');
      if (selectButton) {
        const item = getConversationItem(selectButton);
        const conversationId = item?.dataset.conversationId;
        if (conversationId) {
          setActiveConversationById(conversationId);
        }
      }
    });

    conversationList.addEventListener('keydown', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      if (event.key === 'Escape') {
        const item = getConversationItem(target);
        const menuToggle = item?.querySelector('.conversation-menu-toggle');
        if (item?.classList.contains('menu-open') && menuToggle instanceof HTMLElement) {
          event.preventDefault();
          closeConversationMenus({ restoreFocusTo: menuToggle });
        }
      }
    });
  }

  documentRef.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (target.closest('#conversationList')) {
      return;
    }
    closeConversationMenus();
  });
}
