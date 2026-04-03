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
  getSelectedModelAttachmentSupport,
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
  syncRouteToState = (_options = {}) => {},
  buildUserMessageAttachmentPayload,
  addMessageToConversation,
  addMessageElement,
  buildPromptForActiveConversation,
  startModelGeneration,
  stopGeneration,
}) {
  const REFERENCE_AUDIO_ATTACHMENT_ACCEPT = 'audio/*,.mp3,.wav,.ogg,.oga,.flac,.aac,.m4a,.webm';
  const WORK_WITH_ATTACHMENT_ACCEPT = '';
  const AUDIO_FILE_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'oga', 'flac', 'aac', 'm4a', 'webm']);

  const resolveAttachmentSupport =
    typeof getSelectedModelAttachmentSupport === 'function'
      ? getSelectedModelAttachmentSupport
      : () => ({
          imageInputSupported:
            typeof selectedModelSupportsImageInput === 'function'
              ? selectedModelSupportsImageInput()
              : false,
          audioInputSupported: false,
          videoInputSupported: false,
          maxImageInputs: null,
          maxAudioInputs: null,
          maxVideoInputs: null,
        });

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

  const isImageAttachment = (file) => Boolean(file?.type && file.type.startsWith('image/'));

  const isSupportedAudioAttachment = (file) => {
    const mimeType = typeof file?.type === 'string' ? file.type.trim().toLowerCase() : '';
    if (mimeType.startsWith('audio/')) {
      return true;
    }
    const name = typeof file?.name === 'string' ? file.name.trim().toLowerCase() : '';
    const extension = name.includes('.') ? name.split('.').pop() || '' : '';
    return AUDIO_FILE_EXTENSIONS.has(extension);
  };

  const buildReferenceAttachmentAccept = (mediaSupport) => {
    const acceptTokens = [];
    if (mediaSupport.imageInputSupported) {
      acceptTokens.push('image/*');
    }
    if (mediaSupport.audioInputSupported) {
      acceptTokens.push(...REFERENCE_AUDIO_ATTACHMENT_ACCEPT.split(','));
    }
    acceptTokens.push('.txt', '.csv', '.md', '.html', '.htm', '.css', '.js', '.pdf');
    return [...new Set(acceptTokens)].join(',');
  };

  const buildAttachmentAvailabilityText = (mediaSupport) => {
    const mediaLabels = [];
    if (mediaSupport.imageInputSupported) {
      mediaLabels.push('image');
    }
    if (mediaSupport.audioInputSupported) {
      mediaLabels.push('audio');
    }
    const fileLabel = '.txt, .csv, .md, .html, .htm, .css, .js, and .pdf files';
    if (!mediaLabels.length) {
      return fileLabel;
    }
    if (mediaLabels.length === 1) {
      return `${mediaLabels[0]} and ${fileLabel}`;
    }
    return `${mediaLabels[0]}, ${mediaLabels[1]}, and ${fileLabel}`;
  };

  const buildAttachmentSuggestionText = (mediaSupport) => {
    const suggestions = [];
    if (mediaSupport.imageInputSupported) {
      suggestions.push('an image');
    }
    if (mediaSupport.audioInputSupported) {
      suggestions.push('an audio file');
    }
    suggestions.push('a .txt, .csv, .md, .html, .htm, .css, .js, or .pdf file');
    if (suggestions.length === 1) {
      return suggestions[0];
    }
    if (suggestions.length === 2) {
      return `${suggestions[0]} or ${suggestions[1]}`;
    }
    return `${suggestions[0]}, ${suggestions[1]}, or ${suggestions[2]}`;
  };

  const getPendingAttachmentCounts = () => {
    const attachments = getPendingComposerAttachments();
    return {
      image: attachments.filter((attachment) => attachment?.type === 'image').length,
      audio: attachments.filter((attachment) => attachment?.type === 'audio').length,
    };
  };

  const buildAttachmentLimitLabel = (limit, type) =>
    `${limit} ${type} attachment${limit === 1 ? '' : 's'}`;

  const setAttachmentPickerMode = (mode) => {
    if (!(imageAttachmentInput instanceof HTMLInputElement)) {
      return;
    }
    const attachmentSupport = resolveAttachmentSupport();
    if (mode === 'reference') {
      imageAttachmentInput.accept = buildReferenceAttachmentAccept(attachmentSupport);
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
      const attachmentSupport = resolveAttachmentSupport();
      const attachmentCounts = getPendingAttachmentCounts();
      let unsupportedCount = 0;
      let limitedCount = 0;
      const limitedTypes = new Set();
      const allowedFiles = files.filter((file) => {
        const isImage = isImageAttachment(file);
        const isAudio = isSupportedAudioAttachment(file);
        const isText = isSupportedTextAttachment(file);
        if (!isImage && !isAudio && !isText) {
          unsupportedCount += 1;
          return false;
        }
        if (isImage) {
          if (!attachmentSupport.imageInputSupported) {
            unsupportedCount += 1;
            return false;
          }
          if (
            attachmentSupport.maxImageInputs &&
            attachmentCounts.image >= attachmentSupport.maxImageInputs
          ) {
            limitedCount += 1;
            limitedTypes.add(
              buildAttachmentLimitLabel(attachmentSupport.maxImageInputs, 'image')
            );
            return false;
          }
          attachmentCounts.image += 1;
          return true;
        }
        if (isAudio) {
          if (!attachmentSupport.audioInputSupported) {
            unsupportedCount += 1;
            return false;
          }
          if (
            attachmentSupport.maxAudioInputs &&
            attachmentCounts.audio >= attachmentSupport.maxAudioInputs
          ) {
            limitedCount += 1;
            limitedTypes.add(
              buildAttachmentLimitLabel(attachmentSupport.maxAudioInputs, 'audio')
            );
            return false;
          }
          attachmentCounts.audio += 1;
          return true;
        }
        return true;
      });
      if (!allowedFiles.length) {
        const unsupportedMessage =
          attachmentMode === 'reference'
            ? `Only ${buildAttachmentAvailabilityText(attachmentSupport)} can be attached from this menu option.`
            : attachmentMode === 'workWith'
              ? `The selected files are not supported yet. Try ${buildAttachmentSuggestionText(attachmentSupport)}.`
              : `Only ${buildAttachmentAvailabilityText(attachmentSupport)} can be attached for this model.`;
        const limitMessage =
          limitedTypes.size > 0
            ? ` The selected model only accepts ${Array.from(limitedTypes).join(' and ')}.`
            : '';
        setStatus(unsupportedCount > 0 ? `${unsupportedMessage}${limitMessage}` : limitMessage.trim());
        return;
      }
      try {
        const nextAttachments = await Promise.all(
          allowedFiles.map((file) =>
            createComposerAttachmentFromFile(file, {
              attachmentMode,
            })
          )
        );
        appState.pendingComposerAttachments = [
          ...getPendingComposerAttachments(),
          ...nextAttachments,
        ];
        renderComposerAttachments();
        const imageCount = nextAttachments.filter((attachment) => attachment?.type === 'image').length;
        const audioCount = nextAttachments.filter((attachment) => attachment?.type === 'audio').length;
        const fileCount = nextAttachments.filter((attachment) => attachment?.type === 'file').length;
        const summary = [];
        if (imageCount) {
          summary.push(`${imageCount} image${imageCount === 1 ? '' : 's'}`);
        }
        if (audioCount) {
          summary.push(`${audioCount} audio file${audioCount === 1 ? '' : 's'}`);
        }
        if (fileCount) {
          summary.push(`${fileCount} file${fileCount === 1 ? '' : 's'}`);
        }
        const notices = [];
        if (unsupportedCount > 0) {
          notices.push(
            `${unsupportedCount} unsupported attachment${unsupportedCount === 1 ? '' : 's'} skipped.`
          );
        }
        if (limitedCount > 0 && limitedTypes.size > 0) {
          notices.push(
            `${limitedCount} extra attachment${limitedCount === 1 ? '' : 's'} skipped because the selected model only accepts ${Array.from(
              limitedTypes
            ).join(' and ')}.`
          );
        }
        setStatus(
          `${summary.join(' and ')} attached.${notices.length ? ` ${notices.join(' ')}` : ''}`
        );
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
    const { selectedModelId: activeConversationModelId } = syncConversationModelSelection(
      activeConversation,
      {
        useDefaults: false,
      }
    );
    const shouldInitializeEngine =
      !isEngineReady(appState) || getLoadedModelId() !== activeConversationModelId;

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
    }

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
      syncRouteToState({ replace: false });
    }

    if (createdConversationForSend) {
      updateWelcomePanelVisibility({ replaceRoute: false });
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
