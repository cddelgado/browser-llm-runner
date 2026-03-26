export function createTranscriptActions({
  appState,
  chatTranscript,
  chatMain,
  windowRef = window,
  clamp,
  getActiveConversation,
  getMessageNodeById,
  getModelVariantState,
  getUserVariantState,
  findPreferredLeafForVariant,
  isEngineBusy,
  isOrchestrationRunningState,
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
  startModelGeneration,
  renderTranscript,
  updateActionButtons,
  queueConversationStateSave,
  ensureModelVariantControlsVisible,
  setStatus,
}) {
  function focusUserMessageEditor(messageId) {
    const editor = chatTranscript?.querySelector(
      `[data-message-id="${messageId}"] .user-message-editor`,
    );
    if (editor instanceof HTMLTextAreaElement) {
      editor.focus();
      editor.setSelectionRange(editor.value.length, editor.value.length);
    }
    return editor;
  }

  function animateVariantSwitch(outgoingMessageId, incomingMessageId, direction, options = {}) {
    if (!chatTranscript) {
      return;
    }
    const ensureControlsVisible = Boolean(options.ensureModelControlsVisible);
    const outgoingItem = chatTranscript.querySelector(`[data-message-id="${outgoingMessageId}"]`);
    const outgoingBubble = outgoingItem?.querySelector('.message-bubble');
    const outgoingOffsetWithinChat =
      chatMain && outgoingItem instanceof HTMLElement
        ? outgoingItem.getBoundingClientRect().top - chatMain.getBoundingClientRect().top
        : null;
    const outgoingClass = direction < 0 ? 'variant-switch-out-right' : 'variant-switch-out-left';
    if (outgoingBubble) {
      outgoingBubble.classList.add(outgoingClass);
    }

    windowRef.setTimeout(() => {
      if (outgoingBubble) {
        outgoingBubble.classList.remove(outgoingClass);
      }
      renderTranscript({ scrollToBottom: false });
      const incomingItem = chatTranscript.querySelector(`[data-message-id="${incomingMessageId}"]`);
      if (chatMain && incomingItem instanceof HTMLElement) {
        if (Number.isFinite(outgoingOffsetWithinChat)) {
          const incomingOffsetWithinChat =
            incomingItem.getBoundingClientRect().top - chatMain.getBoundingClientRect().top;
          const boundedAdjustment = clamp(
            incomingOffsetWithinChat - outgoingOffsetWithinChat,
            -chatMain.clientHeight,
            chatMain.clientHeight,
          );
          if (Math.abs(boundedAdjustment) > 1) {
            chatMain.scrollTop += boundedAdjustment;
          }
        }
        incomingItem.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
      const incomingBubble = incomingItem?.querySelector('.message-bubble');
      const incomingClass = direction < 0 ? 'variant-switch-in-left' : 'variant-switch-in-right';
      if (incomingBubble) {
        incomingBubble.classList.add(incomingClass);
        windowRef.setTimeout(() => {
          incomingBubble.classList.remove(incomingClass);
        }, 280);
      }
      if (ensureControlsVisible) {
        ensureModelVariantControlsVisible(incomingMessageId);
      }
      setSwitchingVariant(appState, false);
      updateActionButtons();
      queueConversationStateSave();
    }, 170);
  }

  function switchModelVariant(messageId, direction) {
    if (
      !messageId ||
      isEngineBusy(appState) ||
      isOrchestrationRunningState(appState) ||
      isVariantSwitchingState(appState) ||
      isMessageEditActive(appState)
    ) {
      return;
    }
    const activeConversation = getActiveConversation();
    if (!activeConversation) {
      return;
    }
    const modelMessage = getMessageNodeById(activeConversation, messageId);
    if (!modelMessage || modelMessage.role !== 'model') {
      return;
    }
    const variantState = getModelVariantState(activeConversation, modelMessage);
    if (!variantState.hasVariants) {
      return;
    }
    const targetIndex = variantState.index + direction;
    if (targetIndex < 0 || targetIndex >= variantState.total) {
      return;
    }
    const targetMessage = variantState.siblings[targetIndex];
    if (!targetMessage) {
      return;
    }
    const targetLeafId = findPreferredLeafForVariant(activeConversation, targetMessage);
    setSwitchingVariant(appState, true);
    activeConversation.activeLeafMessageId = targetLeafId || targetMessage.id;
    updateActionButtons();
    animateVariantSwitch(modelMessage.id, targetMessage.id, direction, {
      ensureModelControlsVisible: true,
    });
  }

  function switchUserVariant(messageId, direction) {
    if (
      !messageId ||
      isEngineBusy(appState) ||
      isOrchestrationRunningState(appState) ||
      isVariantSwitchingState(appState) ||
      isMessageEditActive(appState)
    ) {
      return;
    }
    const activeConversation = getActiveConversation();
    if (!activeConversation) {
      return;
    }
    const userMessage = getMessageNodeById(activeConversation, messageId);
    if (!userMessage || userMessage.role !== 'user') {
      return;
    }
    const variantState = getUserVariantState(activeConversation, userMessage);
    if (!variantState.hasVariants) {
      return;
    }
    const targetIndex = variantState.index + direction;
    if (targetIndex < 0 || targetIndex >= variantState.total) {
      return;
    }
    const targetMessage = variantState.siblings[targetIndex];
    if (!targetMessage) {
      return;
    }
    const targetLeafId = findPreferredLeafForVariant(activeConversation, targetMessage);
    setSwitchingVariant(appState, true);
    activeConversation.activeLeafMessageId = targetLeafId || targetMessage.id;
    updateActionButtons();
    animateVariantSwitch(userMessage.id, targetMessage.id, direction);
  }

  function beginUserMessageEdit(messageId) {
    if (
      !messageId ||
      isEngineBusy(appState) ||
      isOrchestrationRunningState(appState) ||
      isVariantSwitchingState(appState)
    ) {
      return;
    }
    const activeConversation = getActiveConversation();
    if (!activeConversation) {
      return;
    }
    const userMessage = getMessageNodeById(activeConversation, messageId);
    if (!userMessage || userMessage.role !== 'user') {
      return;
    }
    activeConversation.activeLeafMessageId =
      findPreferredLeafForVariant(activeConversation, userMessage) || userMessage.id;
    startUserMessageEditSession(messageId);
    renderTranscript({ scrollToBottom: false });
    updateActionButtons();
    focusUserMessageEditor(messageId);
  }

  function cancelUserMessageEdit(messageId) {
    if (
      !isMessageEditActive(appState) ||
      (messageId && getActiveUserEditMessageId(appState) !== messageId)
    ) {
      return;
    }
    clearUserMessageEditSession();
    renderTranscript({ scrollToBottom: false });
    updateActionButtons();
    setStatus('Edit canceled.');
  }

  function saveUserMessageEdit(messageId) {
    if (
      !messageId ||
      isEngineBusy(appState) ||
      isOrchestrationRunningState(appState) ||
      isVariantSwitchingState(appState) ||
      getActiveUserEditMessageId(appState) !== messageId
    ) {
      return;
    }
    const activeConversation = getActiveConversation();
    if (!activeConversation) {
      return;
    }
    const userMessage = getMessageNodeById(activeConversation, messageId);
    if (!userMessage || userMessage.role !== 'user') {
      return;
    }
    const editor = chatTranscript?.querySelector(`[data-message-id="${messageId}"] .user-message-editor`);
    if (!(editor instanceof HTMLTextAreaElement)) {
      return;
    }
    const nextText = editor.value.trim();
    const hasAttachments = Array.isArray(userMessage.content?.parts)
      ? userMessage.content.parts.some((part) => part?.type === 'image')
      : false;
    if (!nextText && !hasAttachments) {
      setStatus('Message text cannot be empty.');
      editor.focus();
      return;
    }
    const isBranchEdit = appState.activeUserBranchSourceMessageId === messageId;
    if (isBranchEdit) {
      const currentText = (userMessage.text || '').trim();
      if (nextText === currentText) {
        clearUserMessageEditSession();
        renderTranscript({ scrollToBottom: false });
        updateActionButtons();
        setStatus('Branch not created. Change the message and save to create a branch.');
        return;
      }
      const branchMessage = addMessageToConversation(activeConversation, 'user', nextText, {
        parentId: userMessage.parentId || null,
        contentParts: normalizeMessageContentParts(userMessage.content?.parts, userMessage.text || ''),
        artifactRefs: Array.isArray(userMessage.artifactRefs) ? userMessage.artifactRefs : [],
      });
      setUserMessageText(branchMessage, nextText);
      activeConversation.activeLeafMessageId = branchMessage.id;
      activeConversation.lastSpokenLeafMessageId = branchMessage.id;
      clearUserMessageEditSession();
      renderTranscript();
      updateActionButtons();
      queueConversationStateSave();
      if (!isEngineReady(appState)) {
        setStatus('Branch saved. Send a message to load the model and generate a new response.');
        return;
      }
      setStatus('Branch saved. Generating response...');
      startModelGeneration(activeConversation, buildPromptForActiveConversation(activeConversation), {
        parentMessageId: branchMessage.id,
        updateLastSpokenOnComplete: true,
      });
      return;
    }
    setUserMessageText(userMessage, nextText);
    const { removedCount } = pruneDescendantsFromMessage(activeConversation, userMessage.id);
    activeConversation.activeLeafMessageId = userMessage.id;
    activeConversation.lastSpokenLeafMessageId = userMessage.id;
    clearUserMessageEditSession();
    renderTranscript();
    updateActionButtons();
    queueConversationStateSave();
    const saveStatus =
      removedCount > 0
        ? 'Message saved. Later turns were removed from this branch.'
        : 'Message saved.';
    if (!isEngineReady(appState)) {
      setStatus(`${saveStatus} Send a message to load the model and generate a new response.`);
      return;
    }
    setStatus(`${saveStatus} Generating updated response...`);
    startModelGeneration(activeConversation, buildPromptForActiveConversation(activeConversation), {
      parentMessageId: userMessage.id,
      updateLastSpokenOnComplete: true,
    });
  }

  function branchFromUserMessage(messageId) {
    if (
      !messageId ||
      isEngineBusy(appState) ||
      isOrchestrationRunningState(appState) ||
      isVariantSwitchingState(appState) ||
      isMessageEditActive(appState)
    ) {
      return;
    }
    const activeConversation = getActiveConversation();
    if (!activeConversation) {
      return;
    }
    const userMessage = getMessageNodeById(activeConversation, messageId);
    if (!userMessage || userMessage.role !== 'user') {
      return;
    }
    activeConversation.activeLeafMessageId =
      findPreferredLeafForVariant(activeConversation, userMessage) || userMessage.id;
    startUserMessageEditSession(messageId, { branchSourceMessageId: messageId });
    renderTranscript({ scrollToBottom: false });
    updateActionButtons();
    focusUserMessageEditor(messageId);
    setStatus('Branch mode enabled. Edit and save to create a branch.');
  }

  return {
    switchModelVariant,
    switchUserVariant,
    beginUserMessageEdit,
    cancelUserMessageEdit,
    saveUserMessageEdit,
    branchFromUserMessage,
  };
}
