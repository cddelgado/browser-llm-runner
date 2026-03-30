export function bindComposerEvents({
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
  hasStartedWorkspace,
  setChatWorkspaceStarted,
  setPreparingNewConversation,
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
  const REFERENCE_ATTACHMENT_ACCEPT = '.txt,.csv,.md,.html,.htm,.css,.js,.pdf';
  const WORK_WITH_ATTACHMENT_ACCEPT = '';

  const isSupportedTextAttachment = (file) => {
    const name = typeof file?.name === 'string' ? file.name.trim().toLowerCase() : '';
    return (
      name.endsWith('.txt') ||
      name.endsWith('.csv') ||
      name.endsWith('.md') ||
      name.endsWith('.html') ||
      name.endsWith('.htm') ||
      name.endsWith('.css') ||
      name.endsWith('.js') ||
      name.endsWith('.pdf')
    );
  };

  const setAttachmentPickerMode = (mode) => {
    if (!(imageAttachmentInput instanceof HTMLInputElement)) {
      return;
    }
    if (mode === 'reference') {
      imageAttachmentInput.accept = REFERENCE_ATTACHMENT_ACCEPT;
    } else if (mode === 'workWith') {
      imageAttachmentInput.accept = WORK_WITH_ATTACHMENT_ACCEPT;
    }
    imageAttachmentInput.dataset.attachmentMode = mode;
  };

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
    attachReferenceMenuItem?.addEventListener('click', () => {
      setAttachmentPickerMode('reference');
      imageAttachmentInput.click();
    });

    attachWorkWithMenuItem?.addEventListener('click', () => {
      setAttachmentPickerMode('workWith');
      imageAttachmentInput.click();
    });

    imageAttachmentInput.addEventListener('change', async (event) => {
      const files =
        event.target instanceof HTMLInputElement ? Array.from(event.target.files || []) : [];
      if (!files.length) {
        return;
      }
      const attachmentMode =
        event.target instanceof HTMLInputElement ? event.target.dataset.attachmentMode || '' : '';
      const imageInputSupported = selectedModelSupportsImageInput();
      const supportedFiles = files.filter((file) => {
        if (attachmentMode === 'reference') {
          return isSupportedTextAttachment(file);
        }
        return (file.type && file.type.startsWith('image/')) || isSupportedTextAttachment(file);
      });
      const allowedFiles = supportedFiles.filter((file) => {
        if (!file.type.startsWith('image/')) {
          return true;
        }
        return imageInputSupported;
      });
      if (!allowedFiles.length) {
        setStatus(
          attachmentMode === 'reference'
            ? 'Only .txt, .csv, .md, .html, .htm, .css, .js, and .pdf files can be attached from this menu option.'
            : attachmentMode === 'workWith'
              ? imageInputSupported
                ? 'The selected files are not supported yet. Try an image, .txt, .csv, .md, .html, .htm, .css, .js, or .pdf file.'
                : 'The selected files are not supported yet. Try a .txt, .csv, .md, .html, .htm, .css, .js, or .pdf file.'
            : imageInputSupported
              ? 'Only image, .txt, .csv, .md, .html, .htm, .css, .js, and .pdf files can be attached.'
              : 'Only .txt, .csv, .md, .html, .htm, .css, .js, and .pdf files can be attached for this model.'
        );
        return;
      }
      try {
        const nextAttachments = await Promise.all(
          allowedFiles.map((file) => createComposerAttachmentFromFile(file))
        );
        appState.pendingComposerAttachments = [
          ...getPendingComposerAttachments(),
          ...nextAttachments,
        ];
        renderComposerAttachments();
        const imageCount = nextAttachments.filter((attachment) => attachment?.type === 'image').length;
        const fileCount = nextAttachments.filter((attachment) => attachment?.type === 'file').length;
        const summary = [];
        if (imageCount) {
          summary.push(`${imageCount} image${imageCount === 1 ? '' : 's'}`);
        }
        if (fileCount) {
          summary.push(`${fileCount} file${fileCount === 1 ? '' : 's'}`);
        }
        const rejectedCount = files.length - allowedFiles.length;
        const rejectedNotice =
          rejectedCount > 0
            ? ` ${rejectedCount} unsupported attachment${rejectedCount === 1 ? '' : 's'} skipped.`
            : '';
        setStatus(`${summary.join(' and ')} attached.${rejectedNotice}`);
      } catch (error) {
        setStatus(
          `Unable to read selected attachments. ${
            error instanceof Error ? error.message : 'Try again.'
          }`
        );
      } finally {
        delete imageAttachmentInput.dataset.attachmentMode;
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
          : 'Removed attached item.'
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
    let createdConversationForSend = false;
    if (!activeConversation) {
      const conversation = createConversation();
      appState.conversations.unshift(conversation);
      appState.activeConversationId = conversation.id;
      setPreparingNewConversation(appState, false);
      activeConversation = conversation;
      createdConversationForSend = true;
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
    const shouldInitializeEngine =
      !isEngineReady(appState) || getLoadedModelId() !== activeConversationModelId;

    if (createdConversationForSend && !shouldInitializeEngine) {
      updateWelcomePanelVisibility({ replaceRoute: false });
    }

    if (shouldInitializeEngine) {
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
