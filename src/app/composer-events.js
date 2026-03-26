export function bindComposerEvents({
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
  hasStartedWorkspace,
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
  initializeEngine,
  appendDebug,
  buildUserMessageAttachmentPayload,
  addMessageToConversation,
  addMessageElement,
  buildPromptForActiveConversation,
  startModelGeneration,
  stopGeneration,
}) {
  if (sendButton) {
    sendButton.addEventListener('click', async (event) => {
      if (!isGeneratingResponse(appState)) {
        return;
      }
      event.preventDefault();
      await stopGeneration();
    });
  }

  if (messageInput instanceof HTMLTextAreaElement) {
    messageInput.addEventListener('keydown', (event) => {
      if (
        event.key !== 'Enter' ||
        event.shiftKey ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        event.isComposing
      ) {
        return;
      }
      if (messageInput.disabled || sendButton?.hasAttribute('disabled')) {
        return;
      }
      event.preventDefault();
      if (sendButton instanceof HTMLButtonElement) {
        sendButton.click();
        return;
      }
      if (chatForm && typeof chatForm.requestSubmit === 'function') {
        chatForm.requestSubmit();
      }
    });
  }

  if (
    addImagesButton instanceof HTMLButtonElement &&
    imageAttachmentInput instanceof HTMLInputElement
  ) {
    addImagesButton.addEventListener('click', () => {
      if (!selectedModelSupportsImageInput()) {
        return;
      }
      imageAttachmentInput.click();
    });

    imageAttachmentInput.addEventListener('change', async (event) => {
      if (!selectedModelSupportsImageInput()) {
        imageAttachmentInput.value = '';
        return;
      }
      const files =
        event.target instanceof HTMLInputElement ? Array.from(event.target.files || []) : [];
      if (!files.length) {
        return;
      }
      const imageFiles = files.filter((file) => file.type.startsWith('image/'));
      if (!imageFiles.length) {
        setStatus('Only image files can be attached.');
        clearPendingComposerAttachments({ resetInput: true });
        return;
      }
      try {
        const nextAttachments = await Promise.all(
          imageFiles.map((file) => createComposerAttachmentFromFile(file))
        );
        appState.pendingComposerAttachments = [
          ...getPendingComposerAttachments(),
          ...nextAttachments,
        ];
        renderComposerAttachments();
        setStatus(
          `${nextAttachments.length} image${nextAttachments.length === 1 ? '' : 's'} attached.`
        );
      } catch (error) {
        setStatus(
          `Unable to read selected images. ${error instanceof Error ? error.message : 'Try again.'}`
        );
      } finally {
        imageAttachmentInput.value = '';
      }
    });
  }

  if (composerAttachmentTray instanceof HTMLElement) {
    composerAttachmentTray.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const removeButton = target.closest('.composer-attachment-remove');
      if (!(removeButton instanceof HTMLButtonElement)) {
        return;
      }
      const index = Number.parseInt(removeButton.dataset.attachmentIndex || '', 10);
      if (!Number.isInteger(index) || index < 0) {
        return;
      }
      const attachments = getPendingComposerAttachments();
      if (index >= attachments.length) {
        return;
      }
      const [removedAttachment] = attachments.splice(index, 1);
      appState.pendingComposerAttachments = [...attachments];
      renderComposerAttachments();
      setStatus(
        removedAttachment?.filename
          ? `Removed ${removedAttachment.filename}.`
          : 'Removed attached image.'
      );
    });
  }

  if (!(chatForm && messageInput instanceof HTMLTextAreaElement)) {
    return;
  }

  chatForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = messageInput.value.trim();
    const attachments = getPendingComposerAttachments();
    const hasAttachments = attachments.length > 0;
    if (
      (!value && !hasAttachments) ||
      isGeneratingResponse(appState) ||
      isOrchestrationRunningState(appState) ||
      isMessageEditActive(appState)
    ) {
      if (isMessageEditActive(appState)) {
        setStatus('Save or cancel the current message edit before sending a new message.');
      } else if (isOrchestrationRunningState(appState)) {
        setStatus('Please wait for the current orchestration step to finish.');
      }
      return;
    }

    if (!hasStartedWorkspace(appState)) {
      setChatWorkspaceStarted(appState, true);
      updateWelcomePanelVisibility({ replaceRoute: false });
    }

    let activeConversation = getActiveConversation();
    if (!activeConversation) {
      const conversation = createConversation();
      appState.conversations.unshift(conversation);
      appState.activeConversationId = conversation.id;
      activeConversation = conversation;
      clearUserMessageEditSession();
      setChatTitleEditing(appState, false);
      renderConversationList();
      renderTranscript();
      updateChatTitle();
      queueConversationStateSave();
    }

    const { selectedModelId: activeConversationModelId } = syncConversationModelSelection(
      activeConversation,
      {
        useDefaults: false,
      }
    );

    if (!isEngineReady(appState) || getLoadedModelId() !== activeConversationModelId) {
      persistInferencePreferences(appState.activeGenerationConfig);
      setStatus(
        isEngineReady(appState)
          ? 'Switching models for this conversation...'
          : 'Loading model for your first message...'
      );
      try {
        await initializeEngine();
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

    const attachmentPayload = buildUserMessageAttachmentPayload(attachments);
    const userMessage = addMessageToConversation(activeConversation, 'user', value, {
      contentParts: [
        ...(value ? [{ type: 'text', text: value }] : []),
        ...attachmentPayload.contentParts,
      ],
      artifactRefs: attachmentPayload.artifactRefs,
    });
    activeConversation.lastSpokenLeafMessageId = userMessage.id;
    addMessageElement(userMessage);
    messageInput.value = '';
    clearPendingComposerAttachments();
    queueConversationStateSave();
    startModelGeneration(activeConversation, buildPromptForActiveConversation(activeConversation), {
      updateLastSpokenOnComplete: true,
    });
  });
}
