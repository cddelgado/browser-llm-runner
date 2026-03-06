export function createTranscriptView(dependencies) {
  const {
    container,
    getActiveConversation,
    getConversationPathMessages,
    getConversationCardHeading,
    getModelVariantState,
    getUserVariantState,
    renderModelMarkdown,
    scheduleMathTypeset,
    getShowThinkingByDefault,
    getActiveUserEditMessageId,
    getControlsState,
    getEmptyStateVisible,
    initializeTooltips,
    disposeTooltips,
    applyVariantCardSignals,
    applyFixCardSignals,
    scrollTranscriptToBottom,
    updateTranscriptNavigationButtonVisibility,
    cancelUserMessageEdit,
    saveUserMessageEdit,
  } = dependencies;
  const documentRef = container?.ownerDocument || document;
  const view = documentRef.defaultView || window;

  function setModelBubbleContent(message, refs) {
    if (!refs) {
      return;
    }

    const hasThinking = Boolean(message.hasThinking || message.thoughts?.trim());
    const isExpanded = refs.thinkingToggle.getAttribute('aria-expanded') === 'true';
    const thinkingLabel = message.isThinkingComplete
      ? isExpanded
        ? 'Done thinking. Hide thoughts.'
        : 'Done thinking. View thoughts.'
      : 'Thinking';

    refs.thinkingRegion.classList.toggle('d-none', !hasThinking);
    refs.thinkingToggle.textContent = thinkingLabel;
    refs.thinkingToggle.setAttribute('aria-expanded', String(isExpanded));
    refs.thinkingCopyButton.disabled = !hasThinking || !message.thoughts?.trim();
    /** @type {HTMLElement} */ (refs.thinkingBody).hidden = !hasThinking || !isExpanded;
    refs.thoughtsText.textContent = message.thoughts || '';
    refs.responseText.innerHTML = renderModelMarkdown(message.response || message.text || '');
    scheduleMathTypeset(refs.responseText, { immediate: Boolean(message.isResponseComplete) });
  }

  function refreshModelThinkingVisibility() {
    if (!container) {
      return;
    }
    container.querySelectorAll('.message-row.model-message').forEach((item) => {
      const refs = /** @type {any} */ (item)._modelBubbleRefs || null;
      const message = /** @type {any} */ (item)._modelMessage || null;
      if (!refs || !message || message.role !== 'model') {
        return;
      }
      const showThinkingByDefault = getShowThinkingByDefault();
      refs.thinkingToggle.setAttribute('aria-expanded', String(showThinkingByDefault));
      /** @type {HTMLElement} */ (refs.thinkingBody).hidden = !showThinkingByDefault;
      setModelBubbleContent(message, refs);
    });
  }

  function addMessageElement(message, options = {}) {
    if (!container) {
      return null;
    }
    const shouldScroll = options.scroll !== false;
    const activeConversation = getActiveConversation();
    const cardHeading = getConversationCardHeading(activeConversation, message);
    const item = documentRef.createElement('li');
    item.className = `message-row ${message.role === 'user' ? 'user-message' : 'model-message'}`;
    item.dataset.messageId = message.id;

    if (message.role === 'model') {
      const variantState = getModelVariantState(activeConversation, message);
      const variantLabel = `${Math.max(variantState.index + 1, 1)}/${Math.max(variantState.total, 1)}`;
      item.innerHTML = `
        <h3 class="visually-hidden">${cardHeading}</h3>
        <p class="message-speaker">${message.speaker}</p>
        <div class="message-bubble">
          <section class="thoughts-region d-none">
            <h3 class="visually-hidden">Thoughts</h3>
            <div class="thoughts-toolbar">
              <a href="#" class="thinking-toggle" aria-expanded="false">Thinking</a>
              <button
                type="button"
                class="btn btn-sm btn-link thoughts-copy-btn"
                data-message-id="${message.id}"
                aria-label="Copy thoughts"
                data-copy-type="thoughts"
                data-bs-toggle="tooltip"
                data-bs-title="Copy thoughts"
              >
                <i class="bi bi-copy" aria-hidden="true"></i>
                <span class="visually-hidden">Copy thoughts</span>
              </button>
            </div>
            <p class="thoughts-content" hidden></p>
          </section>
          <section class="response-region">
            <h3 class="visually-hidden">Response</h3>
            <p class="fix-wait-message mb-0" aria-live="off">Please Wait</p>
            <div class="response-content"></div>
          </section>
        </div>
        <section class="response-actions">
          <button
            type="button"
            class="btn btn-sm btn-outline-primary regenerate-response-btn"
            data-message-id="${message.id}"
            aria-label="Regenerate response"
            data-bs-toggle="tooltip"
            data-bs-title="Regenerate response"
          >
            <i class="bi bi-arrow-clockwise" aria-hidden="true"></i>
            <span class="visually-hidden">Regenerate response</span>
          </button>
          <button
            type="button"
            class="btn btn-sm btn-outline-primary fix-response-btn"
            data-message-id="${message.id}"
            aria-label="Fix response"
            data-bs-toggle="tooltip"
            data-bs-title="Fix response"
          >
            <i class="bi bi-wrench-adjustable-circle" aria-hidden="true"></i>
            <span class="visually-hidden">Fix response</span>
          </button>
          <button
            type="button"
            class="btn btn-sm btn-outline-primary copy-message-btn"
            data-message-id="${message.id}"
            aria-label="Copy response"
            data-copy-type="response"
            data-bs-toggle="tooltip"
            data-bs-title="Copy response"
          >
            <i class="bi bi-copy" aria-hidden="true"></i>
            <span class="visually-hidden">Copy response</span>
          </button>
          <div class="response-variant-nav${variantState.hasVariants ? '' : ' d-none'}">
            <button
              type="button"
              class="btn btn-sm btn-outline-primary response-variant-prev"
              data-message-id="${message.id}"
              aria-label="Previous regenerated response"
              data-bs-toggle="tooltip"
              data-bs-title="Previous regenerated response"
              ${variantState.canGoPrev ? '' : 'disabled'}
            >
              <i class="bi bi-arrow-bar-left" aria-hidden="true"></i>
              <span class="visually-hidden">Previous regenerated response</span>
            </button>
            <p class="response-variant-status mb-0" aria-live="off">${variantLabel}</p>
            <button
              type="button"
              class="btn btn-sm btn-outline-primary response-variant-next"
              data-message-id="${message.id}"
              aria-label="Next regenerated response"
              data-bs-toggle="tooltip"
              data-bs-title="Next regenerated response"
              ${variantState.canGoNext ? '' : 'disabled'}
            >
              <i class="bi bi-arrow-bar-right" aria-hidden="true"></i>
              <span class="visually-hidden">Next regenerated response</span>
            </button>
          </div>
        </section>
      `;
      const responseActions = item.querySelector('.response-actions');
      if (responseActions) {
        responseActions.classList.toggle('d-none', !message.isResponseComplete);
      }
      const thinkingRegion = item.querySelector('.thoughts-region');
      const thinkingToggle = item.querySelector('.thinking-toggle');
      const thinkingCopyButton = item.querySelector('.thoughts-copy-btn');
      const thinkingBody = item.querySelector('.thoughts-content');
      const thoughtsText = item.querySelector('.thoughts-content');
      const responseText = item.querySelector('.response-content');
      if (
        thinkingRegion &&
        thinkingToggle &&
        thinkingCopyButton &&
        thinkingBody &&
        thoughtsText &&
        responseText
      ) {
        const refs = {
          thinkingRegion,
          thinkingToggle,
          thinkingCopyButton,
          thinkingBody,
          thoughtsText,
          responseText,
        };
        const showThinkingByDefault = getShowThinkingByDefault();
        thinkingToggle.setAttribute('aria-expanded', String(showThinkingByDefault));
          /** @type {HTMLElement} */ (thinkingBody).hidden = !showThinkingByDefault;
        thinkingToggle.addEventListener('click', (event) => {
          event.preventDefault();
          const expanded = thinkingToggle.getAttribute('aria-expanded') === 'true';
          thinkingToggle.setAttribute('aria-expanded', String(!expanded));
          /** @type {HTMLElement} */ (thinkingBody).hidden = expanded;
          setModelBubbleContent(message, refs);
        });
        setModelBubbleContent(message, refs);
        /** @type {any} */ (item)._modelBubbleRefs = refs;
        /** @type {any} */ (item)._modelMessage = message;
      }
      applyVariantCardSignals(item, variantState);
      applyFixCardSignals(item, message);
    } else {
      const variantState = getUserVariantState(activeConversation, message);
      const variantLabel = `${Math.max(variantState.index + 1, 1)}/${Math.max(variantState.total, 1)}`;
      const isEditing = getActiveUserEditMessageId() === message.id;
      item.innerHTML = `
        <h3 class="visually-hidden">${cardHeading}</h3>
        <p class="message-speaker">${message.speaker}</p>
        <p class="message-bubble mb-0"></p>
        <textarea
          class="form-control user-message-editor${isEditing ? '' : ' d-none'}"
          rows="3"
          aria-label="Edit user message"
        ></textarea>
        <section class="message-actions">
          <button
            type="button"
            class="btn btn-sm btn-outline-primary edit-user-message-btn${isEditing ? ' d-none' : ''}"
            data-message-id="${message.id}"
            aria-label="Edit message"
            data-bs-toggle="tooltip"
            data-bs-title="Edit message"
          >
            <i class="bi bi-pencil-fill" aria-hidden="true"></i>
            <span class="visually-hidden">Edit message</span>
          </button>
          <button
            type="button"
            class="btn btn-sm btn-outline-primary save-user-message-btn${isEditing ? '' : ' d-none'}"
            data-message-id="${message.id}"
            aria-label="Save edited message"
            data-bs-toggle="tooltip"
            data-bs-title="Save edited message"
          >
            <i class="bi bi-floppy-fill" aria-hidden="true"></i>
            <span class="visually-hidden">Save edited message</span>
          </button>
          <button
            type="button"
            class="btn btn-sm btn-outline-primary cancel-user-edit-btn${isEditing ? '' : ' d-none'}"
            data-message-id="${message.id}"
            aria-label="Cancel editing message"
            data-bs-toggle="tooltip"
            data-bs-title="Cancel editing"
          >
            <i class="bi bi-x-circle-fill" aria-hidden="true"></i>
            <span class="visually-hidden">Cancel editing</span>
          </button>
          <button
            type="button"
            class="btn btn-sm btn-outline-primary branch-user-message-btn${isEditing ? ' d-none' : ''}"
            data-message-id="${message.id}"
            aria-label="Branch from this user message"
            data-bs-toggle="tooltip"
            data-bs-title="Branch conversation"
          >
            <i class="bi bi-terminal-split" aria-hidden="true"></i>
            <span class="visually-hidden">Branch conversation</span>
          </button>
          <button
            type="button"
            class="btn btn-sm btn-outline-primary copy-message-btn${isEditing ? ' d-none' : ''}"
            data-message-id="${message.id}"
            aria-label="Copy message"
            data-copy-type="message"
            data-bs-toggle="tooltip"
            data-bs-title="Copy message"
          >
            <i class="bi bi-copy" aria-hidden="true"></i>
            <span class="visually-hidden">Copy message</span>
          </button>
          <div class="response-variant-nav user-variant-nav${variantState.hasVariants && !isEditing ? '' : ' d-none'}">
            <button
              type="button"
              class="btn btn-sm btn-outline-primary user-variant-prev"
              data-message-id="${message.id}"
              aria-label="Previous user branch"
              data-bs-toggle="tooltip"
              data-bs-title="Previous user branch"
              ${variantState.canGoPrev ? '' : 'disabled'}
            >
              <i class="bi bi-arrow-bar-left" aria-hidden="true"></i>
              <span class="visually-hidden">Previous user branch</span>
            </button>
            <p class="response-variant-status user-variant-status mb-0" aria-live="off">${variantLabel}</p>
            <button
              type="button"
              class="btn btn-sm btn-outline-primary user-variant-next"
              data-message-id="${message.id}"
              aria-label="Next user branch"
              data-bs-toggle="tooltip"
              data-bs-title="Next user branch"
              ${variantState.canGoNext ? '' : 'disabled'}
            >
              <i class="bi bi-arrow-bar-right" aria-hidden="true"></i>
              <span class="visually-hidden">Next user branch</span>
            </button>
          </div>
        </section>
      `;
      const bubble = item.querySelector('.message-bubble');
      const editor = item.querySelector('.user-message-editor');
      const editButton = item.querySelector('.edit-user-message-btn');
      const saveButton = item.querySelector('.save-user-message-btn');
      const cancelButton = item.querySelector('.cancel-user-edit-btn');
      const branchButton = item.querySelector('.branch-user-message-btn');
      const copyButton = item.querySelector('.copy-message-btn');
      const variantNav = item.querySelector('.user-variant-nav');
      const variantLabelElement = item.querySelector('.user-variant-status');
      const variantPrev = item.querySelector('.user-variant-prev');
      const variantNext = item.querySelector('.user-variant-next');
      if (
        bubble &&
        editor instanceof view.HTMLTextAreaElement &&
        editButton instanceof view.HTMLButtonElement &&
        saveButton instanceof view.HTMLButtonElement &&
        cancelButton instanceof view.HTMLButtonElement &&
        branchButton instanceof view.HTMLButtonElement &&
        copyButton instanceof view.HTMLButtonElement
      ) {
        editor.value = message.text || '';
        editor.addEventListener('keydown', (event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            cancelUserMessageEdit(message.id);
            return;
          }
          if (
            (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) ||
            (event.key === 'Enter' && event.altKey)
          ) {
            event.preventDefault();
            saveUserMessageEdit(message.id);
          }
        });
        editor.addEventListener('input', () => {
          const isCurrentEdit = getActiveUserEditMessageId() === message.id;
          saveButton.disabled = !isCurrentEdit || !editor.value.trim();
        });
        /** @type {any} */ (item)._userBubbleRefs = {
          bubble,
          editor,
          editButton,
          saveButton,
          cancelButton,
          branchButton,
          copyButton,
          variantNav,
          variantLabel: variantLabelElement,
          variantPrev,
          variantNext,
        };
        updateUserMessageElement(message, item);
      }
    }
    container.appendChild(item);
    initializeTooltips(item);
    if (shouldScroll) {
      scrollTranscriptToBottom();
    }
    return item;
  }

  function updateModelMessageElement(message, item) {
    if (!item || message.role !== 'model') {
      return;
    }
    /** @type {any} */ (item)._modelMessage = message;
    const responseActions = item.querySelector('.response-actions');
    if (responseActions) {
      responseActions.classList.toggle('d-none', !message.isResponseComplete);
    }
    const activeConversation = getActiveConversation();
    const variantState = getModelVariantState(activeConversation, message);
    const variantNav = item.querySelector('.response-variant-nav');
    const variantLabel = item.querySelector('.response-variant-status');
    const prevButton = item.querySelector('.response-variant-prev');
    const nextButton = item.querySelector('.response-variant-next');
    if (variantNav) {
      variantNav.classList.toggle('d-none', !variantState.hasVariants || !message.isResponseComplete);
    }
    if (variantLabel) {
      variantLabel.textContent = `${Math.max(variantState.index + 1, 1)}/${Math.max(variantState.total, 1)}`;
    }
    if (prevButton instanceof view.HTMLButtonElement) {
      prevButton.disabled = !variantState.canGoPrev || !message.isResponseComplete;
    }
    if (nextButton instanceof view.HTMLButtonElement) {
      nextButton.disabled = !variantState.canGoNext || !message.isResponseComplete;
    }
    applyVariantCardSignals(item, variantState);
    applyFixCardSignals(item, message);
    setModelBubbleContent(message, /** @type {any} */ (item)._modelBubbleRefs || null);
  }

  function updateUserMessageElement(message, item) {
    if (!item || message.role !== 'user') {
      return;
    }
    item._userMessage = message;
    const refs = /** @type {any} */ (item)._userBubbleRefs || null;
    if (!refs) {
      return;
    }
    refs.bubble.textContent = message.text || '';
    const activeConversation = getActiveConversation();
    const variantState = getUserVariantState(activeConversation, message);
    const isEditing = getActiveUserEditMessageId() === message.id;
    const controlsState = getControlsState();
    const controlsDisabled =
      controlsState.isLoadingModel ||
      controlsState.isGenerating ||
      controlsState.isRunningOrchestration ||
      controlsState.isSwitchingVariant ||
      Boolean(getActiveUserEditMessageId() && !isEditing);
    refs.bubble.classList.toggle('d-none', isEditing);
    refs.editor.classList.toggle('d-none', !isEditing);
    refs.editor.disabled = controlsDisabled;
    refs.editButton.classList.toggle('d-none', isEditing);
    refs.branchButton.classList.toggle('d-none', isEditing);
    refs.copyButton.classList.toggle('d-none', isEditing);
    refs.saveButton.classList.toggle('d-none', !isEditing);
    refs.cancelButton.classList.toggle('d-none', !isEditing);
    refs.editButton.disabled = controlsDisabled;
    refs.branchButton.disabled = controlsDisabled;
    refs.copyButton.disabled = controlsDisabled;
    refs.saveButton.disabled = controlsDisabled || !refs.editor.value.trim();
    refs.cancelButton.disabled = controlsDisabled;
    if (refs.variantNav) {
      refs.variantNav.classList.toggle('d-none', !variantState.hasVariants || isEditing);
    }
    if (refs.variantLabel) {
      refs.variantLabel.textContent = `${Math.max(variantState.index + 1, 1)}/${Math.max(variantState.total, 1)}`;
    }
    if (refs.variantPrev instanceof view.HTMLButtonElement) {
      refs.variantPrev.disabled = controlsDisabled || !variantState.canGoPrev || isEditing;
    }
    if (refs.variantNext instanceof view.HTMLButtonElement) {
      refs.variantNext.disabled = controlsDisabled || !variantState.canGoNext || isEditing;
    }
    applyVariantCardSignals(item, variantState);
  }

  function renderTranscript(options = {}) {
    if (!container) {
      return;
    }
    const shouldScrollToBottom = options.scrollToBottom !== false;
    disposeTooltips(container);
    container.replaceChildren();
    const conversation = getActiveConversation();
    const showEmptyState = getEmptyStateVisible();
    if (!conversation) {
      if (showEmptyState) {
      const emptyItem = documentRef.createElement('li');
        emptyItem.className = 'transcript-empty-state text-body-secondary';
        emptyItem.textContent = 'Select a conversation from the left panel, or start a new conversation.';
        container.appendChild(emptyItem);
      }
      updateTranscriptNavigationButtonVisibility();
      return;
    }
    getConversationPathMessages(conversation).forEach((message) => {
      addMessageElement(message, { scroll: false });
    });
    if (shouldScrollToBottom) {
      scrollTranscriptToBottom();
      return;
    }
    updateTranscriptNavigationButtonVisibility();
  }

  function findMessageElement(messageId) {
    return container?.querySelector(`[data-message-id="${messageId}"]`) || null;
  }

  return {
    addMessageElement,
    findMessageElement,
    refreshModelThinkingVisibility,
    renderTranscript,
    updateModelMessageElement,
    updateUserMessageElement,
  };
}
