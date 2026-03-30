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
    shouldShowMathMlCopyAction,
    getToolDisplayName,
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
  const canShowMathMlCopyAction =
    typeof shouldShowMathMlCopyAction === 'function' ? shouldShowMathMlCopyAction : () => false;
  const resolveToolDisplayName =
    typeof getToolDisplayName === 'function'
      ? getToolDisplayName
      : (toolName) => String(toolName || 'Unknown Tool');

  function getUserImageParts(message) {
    const rawParts = Array.isArray(message?.content?.parts) ? message.content.parts : [];
    return rawParts.filter((part) => part?.type === 'image');
  }

  function getUserFileParts(message) {
    const rawParts = Array.isArray(message?.content?.parts) ? message.content.parts : [];
    return rawParts.filter((part) => part?.type === 'file');
  }

  function getUserAttachmentCount(message) {
    return getUserImageParts(message).length + getUserFileParts(message).length;
  }

  function getFileAttachmentIconClass(part) {
    if (part?.extension === 'csv' || part?.mimeType === 'text/csv') {
      return 'bi-file-earmark-spreadsheet';
    }
    if (part?.extension === 'md' || part?.mimeType === 'text/markdown') {
      return 'bi-file-earmark-richtext';
    }
    return 'bi-file-earmark-text';
  }

  function renderUserBubbleContent(message, bubble) {
    if (!bubble) {
      return;
    }
    bubble.replaceChildren();
    const content = documentRef.createElement('div');
    content.className = 'message-bubble-content';

    const imageParts = getUserImageParts(message);
    if (imageParts.length) {
      const gallery = documentRef.createElement('div');
      gallery.className = 'message-image-gallery';
      imageParts.forEach((part, index) => {
        const figure = documentRef.createElement('figure');
        figure.className = 'message-image-card';
        const image = documentRef.createElement('img');
        image.className = 'message-image-thumb';
        image.src = part.url || part.image || '';
        image.alt =
          typeof part.alt === 'string' && part.alt.trim()
            ? part.alt.trim()
            : part.filename
              ? `Attached image: ${part.filename}`
              : `Attached image ${index + 1}`;
        if (typeof part.width === 'number' && Number.isFinite(part.width)) {
          image.width = part.width;
        }
        if (typeof part.height === 'number' && Number.isFinite(part.height)) {
          image.height = part.height;
        }
        figure.appendChild(image);
        if (typeof part.filename === 'string' && part.filename.trim()) {
          const caption = documentRef.createElement('figcaption');
          caption.className = 'message-image-caption';
          caption.textContent = part.filename.trim();
          figure.appendChild(caption);
        }
        gallery.appendChild(figure);
      });
      content.appendChild(gallery);
    }

    const fileParts = getUserFileParts(message);
    if (fileParts.length) {
      const fileList = documentRef.createElement('div');
      fileList.className = 'message-file-list';
      fileParts.forEach((part, index) => {
        const card = documentRef.createElement('section');
        card.className = 'message-file-card';

        const header = documentRef.createElement('div');
        header.className = 'message-file-header';

        const iconWrap = documentRef.createElement('div');
        iconWrap.className = 'message-file-icon';
        const icon = documentRef.createElement('i');
        icon.className = `bi ${getFileAttachmentIconClass(part)}`;
        icon.setAttribute('aria-hidden', 'true');
        iconWrap.appendChild(icon);
        header.appendChild(iconWrap);

        const meta = documentRef.createElement('div');
        meta.className = 'message-file-meta';
        const name = documentRef.createElement('p');
        name.className = 'message-file-name';
        name.textContent =
          typeof part.filename === 'string' && part.filename.trim()
            ? part.filename.trim()
            : `Attached file ${index + 1}`;
        meta.appendChild(name);
        const detail = documentRef.createElement('p');
        detail.className = 'message-file-detail';
        const detailBits = [];
        if (typeof part.mimeType === 'string' && part.mimeType.trim()) {
          detailBits.push(part.mimeType.trim());
        }
        if (Number.isFinite(part.size) && part.size >= 0) {
          detailBits.push(`${Math.round(part.size)} bytes`);
        }
        detail.textContent = detailBits.join(' · ');
        meta.appendChild(detail);
        header.appendChild(meta);
        card.appendChild(header);

        const llmText = typeof part.llmText === 'string' ? part.llmText.trim() : '';
        if (llmText) {
          const toggle = documentRef.createElement('button');
          toggle.type = 'button';
          toggle.className = 'btn btn-sm btn-outline-secondary message-file-toggle';
          toggle.textContent = 'Model sees';
          toggle.setAttribute('aria-expanded', 'false');
          toggle.setAttribute(
            'aria-label',
            `Show model-visible text for ${name.textContent || `attached file ${index + 1}`}`
          );

          const preview = documentRef.createElement('div');
          preview.className = 'tool-call-body message-file-preview mt-2';
          preview.hidden = true;
          const previewLabel = documentRef.createElement('p');
          previewLabel.className = 'mb-1 fw-semibold';
          previewLabel.textContent = 'Model-visible text';
          const previewBody = documentRef.createElement('pre');
          previewBody.className = 'tool-call-panel message-file-preview-text mb-0';
          previewBody.textContent = llmText;
          preview.append(previewLabel, previewBody);

          toggle.addEventListener('click', () => {
            const expanded = toggle.getAttribute('aria-expanded') === 'true';
            toggle.setAttribute('aria-expanded', String(!expanded));
            preview.hidden = expanded;
          });

          card.append(toggle, preview);
        }

        fileList.appendChild(card);
      });
      content.appendChild(fileList);
    }

    if (message.text) {
      const text = documentRef.createElement('p');
      text.className = 'message-bubble-text';
      text.textContent = message.text;
      content.appendChild(text);
    }

    bubble.appendChild(content);
  }

  function getInlineToolResultMessages(conversation, modelMessage) {
    if (!conversation || modelMessage?.role !== 'model' || !Array.isArray(modelMessage.childIds)) {
      return [];
    }
    const messageById = new Map(
      Array.isArray(conversation.messageNodes)
        ? conversation.messageNodes.map((message) => [message.id, message])
        : []
    );
    return modelMessage.childIds
      .map((childId) => messageById.get(childId) || null)
      .filter((message) => message?.role === 'tool');
  }

  function formatToolCallText(toolCall) {
    if (!toolCall || typeof toolCall !== 'object') {
      return '';
    }
    const rawText = typeof toolCall.rawText === 'string' ? toolCall.rawText.trim() : '';
    if (rawText) {
      if (rawText.startsWith('{') && rawText.endsWith('}')) {
        try {
          return JSON.stringify(JSON.parse(rawText), null, 2);
        } catch {
          return rawText;
        }
      }
      return rawText;
    }
    return JSON.stringify(
      {
        name: typeof toolCall.name === 'string' ? toolCall.name : '',
        arguments:
          toolCall.arguments &&
          typeof toolCall.arguments === 'object' &&
          !Array.isArray(toolCall.arguments)
            ? toolCall.arguments
            : {},
      },
      null,
      2
    );
  }

  function formatToolStructuredText(text) {
    const normalizedText = String(text || '').trim();
    if (!normalizedText) {
      return '';
    }
    if (normalizedText.startsWith('{') && normalizedText.endsWith('}')) {
      try {
        return JSON.stringify(JSON.parse(normalizedText), null, 2);
      } catch {
        return normalizedText;
      }
    }
    return normalizedText;
  }

  function formatToolResultText(toolMessages) {
    if (!Array.isArray(toolMessages) || !toolMessages.length) {
      return '';
    }
    return toolMessages
      .map((message) => formatToolStructuredText(message.toolResult || message.text || ''))
      .filter(Boolean)
      .join('\n\n');
  }

  function setModelToolCallContent(message, refs) {
    if (!refs) {
      return;
    }
    const toolCalls = Array.isArray(message.toolCalls) ? message.toolCalls : [];
    const hasToolCalls = toolCalls.length > 0;
    refs.toolCallRegion.classList.toggle('d-none', !hasToolCalls);
    refs.responseRegion.classList.toggle('d-none', hasToolCalls);
    if (!hasToolCalls) {
      refs.toolCallRequest.textContent = '';
      refs.toolCallResult.textContent = '';
      refs.toolCallResultSection.hidden = true;
      return;
    }

    const isExpanded = refs.toolCallToggle.getAttribute('aria-expanded') === 'true';
    const primaryToolName =
      typeof toolCalls[0]?.name === 'string' && toolCalls[0].name.trim()
        ? toolCalls[0].name.trim()
        : '';
    const toolLabel = primaryToolName ? resolveToolDisplayName(primaryToolName) : 'Unknown Tool';
    refs.toolCallToggle.textContent = `🛠️ Tool Call: ${toolLabel}`;
    refs.toolCallToggle.setAttribute('aria-label', `Tool call details for ${toolLabel}`);
    refs.toolCallToggle.setAttribute('aria-expanded', String(isExpanded));
    refs.toolCallBody.hidden = !isExpanded;
    refs.toolCallRequest.textContent = toolCalls
      .map(formatToolCallText)
      .filter(Boolean)
      .join('\n\n');

    const toolResultText = formatToolResultText(
      getInlineToolResultMessages(getActiveConversation(), message)
    );
    refs.toolCallResult.textContent = toolResultText;
    refs.toolCallResultSection.hidden = !toolResultText;
  }

  function setModelBubbleContent(message, refs) {
    if (!refs) {
      return;
    }
    const responseContent = String(message.response || message.text || '');
    const shouldShowPendingResponse = !message.isResponseComplete && !responseContent.trim();

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
    refs.waitMessage.textContent = 'Please wait';
    refs.responseRegion.classList.toggle('is-response-pending', shouldShowPendingResponse);
    refs.responseText.innerHTML = renderModelMarkdown(responseContent);
    const hasMathMlCopyAction = canShowMathMlCopyAction(responseContent);
    refs.copyMathMlButton.classList.toggle('d-none', !hasMathMlCopyAction);
    refs.copyMathMlButton.disabled = !hasMathMlCopyAction;
    setModelToolCallContent(message, refs);
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
    item.className = `message-row ${
      message.role === 'user'
        ? 'user-message'
        : message.role === 'tool'
          ? 'tool-message'
          : 'model-message'
    }`;
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
                aria-keyshortcuts="Shift+C"
                data-copy-type="thoughts"
                data-bs-toggle="tooltip"
                data-bs-title="Copy thoughts (Shift+C)"
              >
                <i class="bi bi-copy" aria-hidden="true"></i>
                <span class="visually-hidden">Copy thoughts</span>
              </button>
            </div>
            <p class="thoughts-content" hidden></p>
          </section>
          <section class="tool-call-region d-none">
            <h3 class="visually-hidden">Tool call</h3>
            <button
              type="button"
              class="btn btn-sm tool-call-toggle"
              aria-expanded="false"
            >
              🛠️ Tool Call
            </button>
            <div class="tool-call-body mt-2" hidden>
              <p class="mb-1 fw-semibold">Request</p>
              <pre class="tool-call-panel tool-call-request mb-2"></pre>
              <section class="tool-call-result-section" hidden>
                <p class="mb-1 fw-semibold">Response</p>
                <pre class="tool-call-panel tool-call-result mb-0"></pre>
              </section>
            </div>
          </section>
          <section class="response-region">
            <h3 class="visually-hidden">Response</h3>
            <p class="fix-wait-message mb-0" aria-live="off">Please wait</p>
            <div class="response-content"></div>
          </section>
        </div>
        <section class="response-actions">
          <button
            type="button"
            class="btn btn-sm btn-outline-primary regenerate-response-btn"
            data-message-id="${message.id}"
            aria-label="Regenerate response"
            aria-keyshortcuts="R"
            data-bs-toggle="tooltip"
            data-bs-title="Regenerate response (R)"
          >
            <i class="bi bi-arrow-clockwise" aria-hidden="true"></i>
            <span class="visually-hidden">Regenerate response</span>
          </button>
          <button
            type="button"
            class="btn btn-sm btn-outline-primary fix-response-btn"
            data-message-id="${message.id}"
            aria-label="Fix response"
            aria-keyshortcuts="F"
            data-bs-toggle="tooltip"
            data-bs-title="Fix response (F)"
          >
            <i class="bi bi-wrench-adjustable-circle" aria-hidden="true"></i>
            <span class="visually-hidden">Fix response</span>
          </button>
          <button
            type="button"
            class="btn btn-sm btn-outline-primary copy-message-btn"
            data-message-id="${message.id}"
            aria-label="Copy response"
            aria-keyshortcuts="C"
            data-copy-type="response"
            data-bs-toggle="tooltip"
            data-bs-title="Copy response (C)"
          >
            <i class="bi bi-copy" aria-hidden="true"></i>
            <span class="visually-hidden">Copy response</span>
          </button>
          <button
            type="button"
            class="btn btn-sm btn-outline-primary copy-mathml-btn d-none"
            data-message-id="${message.id}"
            aria-label="Copy MathML"
            data-copy-type="mathml"
            data-bs-toggle="tooltip"
            data-bs-title="Copy MathML"
          >
            MathML
          </button>
          <div class="response-variant-nav${variantState.hasVariants ? '' : ' d-none'}">
            <button
              type="button"
              class="btn btn-sm btn-outline-primary response-variant-prev"
              data-message-id="${message.id}"
              aria-label="Previous regenerated response"
              aria-keyshortcuts="["
              data-bs-toggle="tooltip"
              data-bs-title="Previous regenerated response ([)"
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
              aria-keyshortcuts="]"
              data-bs-toggle="tooltip"
              data-bs-title="Next regenerated response (])"
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
      const toolCallRegion = item.querySelector('.tool-call-region');
      const toolCallToggle = item.querySelector('.tool-call-toggle');
      const toolCallBody = item.querySelector('.tool-call-body');
      const toolCallRequest = item.querySelector('.tool-call-request');
      const toolCallResultSection = item.querySelector('.tool-call-result-section');
      const toolCallResult = item.querySelector('.tool-call-result');
      const responseRegion = item.querySelector('.response-region');
      const waitMessage = item.querySelector('.fix-wait-message');
      const responseText = item.querySelector('.response-content');
      const copyMathMlButton = item.querySelector('.copy-mathml-btn');
      if (
        thinkingRegion &&
        thinkingToggle &&
        thinkingCopyButton &&
        thinkingBody &&
        thoughtsText &&
        toolCallRegion &&
        toolCallToggle &&
        toolCallBody &&
        toolCallRequest &&
        toolCallResultSection &&
        toolCallResult &&
        responseRegion &&
        waitMessage &&
        responseText &&
        copyMathMlButton instanceof view.HTMLButtonElement
      ) {
        const refs = {
          thinkingRegion,
          thinkingToggle,
          thinkingCopyButton,
          thinkingBody,
          thoughtsText,
          toolCallRegion,
          toolCallToggle,
          toolCallBody,
          toolCallRequest,
          toolCallResultSection,
          toolCallResult,
          responseRegion,
          waitMessage,
          responseText,
          copyMathMlButton,
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
        toolCallToggle.addEventListener('click', () => {
          const expanded = toolCallToggle.getAttribute('aria-expanded') === 'true';
          toolCallToggle.setAttribute('aria-expanded', String(!expanded));
          toolCallBody.hidden = expanded;
        });
        setModelBubbleContent(message, refs);
        /** @type {any} */ (item)._modelBubbleRefs = refs;
        /** @type {any} */ (item)._modelMessage = message;
      }
      applyVariantCardSignals(item, variantState);
      applyFixCardSignals(item, message);
    } else if (message.role === 'user') {
      const variantState = getUserVariantState(activeConversation, message);
      const variantLabel = `${Math.max(variantState.index + 1, 1)}/${Math.max(variantState.total, 1)}`;
      const isEditing = getActiveUserEditMessageId() === message.id;
      item.innerHTML = `
        <h3 class="visually-hidden">${cardHeading}</h3>
        <p class="message-speaker">${message.speaker}</p>
        <div class="message-bubble mb-0"></div>
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
            aria-keyshortcuts="E"
            data-bs-toggle="tooltip"
            data-bs-title="Edit message (E)"
          >
            <i class="bi bi-pencil-fill" aria-hidden="true"></i>
            <span class="visually-hidden">Edit message</span>
          </button>
          <button
            type="button"
            class="btn btn-sm btn-outline-primary save-user-message-btn${isEditing ? '' : ' d-none'}"
            data-message-id="${message.id}"
            aria-label="Save edited message"
            aria-keyshortcuts="Control+Enter"
            data-bs-toggle="tooltip"
            data-bs-title="Save edited message (Ctrl+Enter)"
          >
            <i class="bi bi-floppy-fill" aria-hidden="true"></i>
            <span class="visually-hidden">Save edited message</span>
          </button>
          <button
            type="button"
            class="btn btn-sm btn-outline-primary cancel-user-edit-btn${isEditing ? '' : ' d-none'}"
            data-message-id="${message.id}"
            aria-label="Cancel editing message"
            aria-keyshortcuts="Escape"
            data-bs-toggle="tooltip"
            data-bs-title="Cancel editing (Esc)"
          >
            <i class="bi bi-x-circle-fill" aria-hidden="true"></i>
            <span class="visually-hidden">Cancel editing</span>
          </button>
          <button
            type="button"
            class="btn btn-sm btn-outline-primary branch-user-message-btn${isEditing ? ' d-none' : ''}"
            data-message-id="${message.id}"
            aria-label="Branch from this user message"
            aria-keyshortcuts="B"
            data-bs-toggle="tooltip"
            data-bs-title="Branch conversation (B)"
          >
            <i class="bi bi-terminal-split" aria-hidden="true"></i>
            <span class="visually-hidden">Branch conversation</span>
          </button>
          <button
            type="button"
            class="btn btn-sm btn-outline-primary copy-message-btn${isEditing ? ' d-none' : ''}"
            data-message-id="${message.id}"
            aria-label="Copy message"
            aria-keyshortcuts="C"
            data-copy-type="message"
            data-bs-toggle="tooltip"
            data-bs-title="Copy message (C)"
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
              aria-keyshortcuts="["
              data-bs-toggle="tooltip"
              data-bs-title="Previous user branch ([)"
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
              aria-keyshortcuts="]"
              data-bs-toggle="tooltip"
              data-bs-title="Next user branch (])"
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
          const hasAttachments = getUserAttachmentCount(message) > 0;
          saveButton.disabled = !isCurrentEdit || (!editor.value.trim() && !hasAttachments);
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
    } else {
      item.innerHTML = `
        <h3 class="visually-hidden">${cardHeading}</h3>
        <p class="message-speaker">${message.speaker}</p>
        <div class="message-bubble">
          <section class="response-region">
            <h3 class="visually-hidden">Tool result</h3>
            <p class="mb-2"><strong>Tool:</strong> ${message.toolName || 'Unknown tool'}</p>
            <div class="response-content"></div>
          </section>
        </div>
      `;
      const responseText = item.querySelector('.response-content');
      if (responseText) {
        responseText.textContent = message.toolResult || message.text || '';
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
      variantNav.classList.toggle(
        'd-none',
        !variantState.hasVariants || !message.isResponseComplete
      );
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
    renderUserBubbleContent(message, refs.bubble);
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
    refs.saveButton.disabled = controlsDisabled || (!refs.editor.value.trim() && getUserAttachmentCount(message) === 0);
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
        emptyItem.textContent =
          'Select a conversation from the left panel, or start a new conversation.';
        container.appendChild(emptyItem);
      }
      updateTranscriptNavigationButtonVisibility();
      return;
    }
    const suppressedToolMessageIds = new Set(
      getConversationPathMessages(conversation)
        .filter(
          (message) =>
            message?.role === 'model' &&
            Array.isArray(message.toolCalls) &&
            message.toolCalls.length
        )
        .flatMap((message) =>
          getInlineToolResultMessages(conversation, message).map((toolMessage) => toolMessage.id)
        )
    );
    getConversationPathMessages(conversation).forEach((message) => {
      if (message?.role === 'tool' && suppressedToolMessageIds.has(message.id)) {
        return;
      }
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
