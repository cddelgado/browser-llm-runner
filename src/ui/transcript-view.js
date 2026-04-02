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
    if (part?.extension === 'pdf' || part?.mimeType === 'application/pdf') {
      return 'bi-file-earmark-pdf';
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
        if (Number.isFinite(part.pageCount) && part.pageCount > 0) {
          detailBits.push(`${part.pageCount} page${part.pageCount === 1 ? '' : 's'}`);
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

        if (Array.isArray(part.conversionWarnings) && part.conversionWarnings.length) {
          const warningWrap = documentRef.createElement('div');
          warningWrap.className = 'mt-2';
          const warningLabel = documentRef.createElement('p');
          warningLabel.className = 'mb-1 fw-semibold';
          warningLabel.textContent = 'Conversion warnings';
          const warningList = documentRef.createElement('ul');
          warningList.className = 'mb-0 ps-3';
          part.conversionWarnings.forEach((warningText) => {
            const warning = typeof warningText === 'string' ? warningText.trim() : '';
            if (!warning) {
              return;
            }
            const item = documentRef.createElement('li');
            item.textContent = warning;
            warningList.appendChild(item);
          });
          if (warningList.childElementCount) {
            warningWrap.append(warningLabel, warningList);
            card.appendChild(warningWrap);
          }
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
      const taggedJsonMatch = rawText.match(/^<tool_call>\s*([\s\S]*?)\s*<\/tool_call>$/i);
      if (taggedJsonMatch) {
        try {
          return JSON.stringify(JSON.parse(taggedJsonMatch[1]), null, 2);
        } catch {
          return rawText;
        }
      }
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
        const parsed = JSON.parse(normalizedText);
        if (
          parsed &&
          typeof parsed === 'object' &&
          !Array.isArray(parsed) &&
          typeof parsed.body === 'string' &&
          (parsed.status === 'success' || parsed.status === 'failed')
        ) {
          return parsed.body.trim();
        }
        return JSON.stringify(parsed, null, 2);
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

  function getModelTurnMessages(conversation, rootModelMessage) {
    if (!conversation || rootModelMessage?.role !== 'model') {
      return [];
    }
    const pathMessages = getConversationPathMessages(conversation);
    const startIndex = pathMessages.findIndex((message) => message?.id === rootModelMessage.id);
    if (startIndex < 0) {
      return [rootModelMessage];
    }
    const turnMessages = [];
    for (let index = startIndex; index < pathMessages.length; index += 1) {
      const message = pathMessages[index];
      if (!message) {
        continue;
      }
      if (index > startIndex && message.role === 'user') {
        break;
      }
      if (message.role === 'model' || message.role === 'tool') {
        turnMessages.push(message);
      }
    }
    return turnMessages;
  }

  function getLastModelTurnMessage(conversation, rootModelMessage) {
    const turnMessages = getModelTurnMessages(conversation, rootModelMessage);
    for (let index = turnMessages.length - 1; index >= 0; index -= 1) {
      if (turnMessages[index]?.role === 'model') {
        return turnMessages[index];
      }
    }
    return rootModelMessage?.role === 'model' ? rootModelMessage : null;
  }

  function isModelTurnComplete(conversation, rootModelMessage) {
    return Boolean(getLastModelTurnMessage(conversation, rootModelMessage)?.isResponseComplete);
  }

  function getToolCallActionLabel(toolCall) {
    const toolName = typeof toolCall?.name === 'string' ? toolCall.name.trim() : '';
    const toolLabel = toolName ? resolveToolDisplayName(toolName) : 'Tool';
    const toolArguments =
      toolCall?.arguments && typeof toolCall.arguments === 'object' && !Array.isArray(toolCall.arguments)
        ? toolCall.arguments
        : {};

    if (toolName === 'tasklist') {
      switch (toolArguments.command) {
        case 'new':
        case 'update':
          return 'Updating task list';
        case 'list':
          return 'Checking task list';
        case 'clear':
          return 'Clearing task list';
        default:
          return 'Working with task list';
      }
    }
    if (toolName === 'get_current_date_time') {
      return 'Checking date and time';
    }
    if (toolName === 'get_user_location') {
      return 'Checking location';
    }
    if (toolName === 'run_shell_command') {
      return 'Running shell command';
    }
    return `Using ${toolLabel}`;
  }

  function getToolCallNarrationText(message) {
    const fullText = String(message?.response || message?.text || '');
    const toolCalls = Array.isArray(message?.toolCalls) ? message.toolCalls : [];
    if (!fullText.trim() || !toolCalls.length) {
      return fullText;
    }
    let narration = fullText;
    toolCalls.forEach((toolCall) => {
      const rawText = typeof toolCall?.rawText === 'string' ? toolCall.rawText.trim() : '';
      if (!rawText) {
        return;
      }
      const rawIndex = narration.indexOf(rawText);
      if (rawIndex >= 0) {
        narration = `${narration.slice(0, rawIndex)}\n\n${narration.slice(rawIndex + rawText.length)}`;
      }
    });
    return narration.replace(/\n{3,}/g, '\n\n').trim();
  }

  function setModelBubbleContent(message, refs) {
    if (!refs) {
      return;
    }
    const conversation = getActiveConversation();
    const turnMessages = getModelTurnMessages(conversation, message);
    const lastModelTurnMessage = getLastModelTurnMessage(conversation, message);
    const timeline = refs.timeline;
    timeline.replaceChildren();

    let hasMathMlCopyAction = false;
    turnMessages.forEach((turnMessage) => {
      if (turnMessage.role !== 'model') {
        return;
      }

      const hasThinking = Boolean(turnMessage.hasThinking || turnMessage.thoughts?.trim());
      if (hasThinking) {
        const isExpanded = refs.thinkingExpansion.has(turnMessage.id)
          ? refs.thinkingExpansion.get(turnMessage.id) === true
          : getShowThinkingByDefault();
        const thinkingLabel = turnMessage.isThinkingComplete
          ? isExpanded
            ? 'Done thinking. Hide thoughts.'
            : 'Done thinking. View thoughts.'
          : 'Thinking';

        const thinkingRegion = documentRef.createElement('section');
        thinkingRegion.className = 'thoughts-region';
        const heading = documentRef.createElement('h3');
        heading.className = 'visually-hidden';
        heading.textContent = 'Thoughts';
        const toolbar = documentRef.createElement('div');
        toolbar.className = 'thoughts-toolbar';
        const toggle = documentRef.createElement('a');
        toggle.href = '#';
        toggle.className = 'thinking-toggle';
        toggle.textContent = thinkingLabel;
        toggle.setAttribute('aria-expanded', String(isExpanded));
        toggle.dataset.thinkingMessageId = turnMessage.id;
        const copyButton = documentRef.createElement('button');
        copyButton.type = 'button';
        copyButton.className = 'btn btn-sm btn-link thoughts-copy-btn';
        copyButton.dataset.messageId = turnMessage.id;
        copyButton.dataset.copyType = 'thoughts';
        copyButton.setAttribute('aria-label', 'Copy thoughts');
        copyButton.setAttribute('aria-keyshortcuts', 'Shift+C');
        copyButton.setAttribute('data-bs-toggle', 'tooltip');
        copyButton.setAttribute('data-bs-title', 'Copy thoughts (Shift+C)');
        copyButton.disabled = !turnMessage.thoughts?.trim();
        copyButton.innerHTML =
          '<i class="bi bi-copy" aria-hidden="true"></i><span class="visually-hidden">Copy thoughts</span>';
        toolbar.append(toggle, copyButton);
        const body = documentRef.createElement('p');
        body.className = 'thoughts-content';
        body.hidden = !isExpanded;
        body.textContent = turnMessage.thoughts || '';
        thinkingRegion.append(heading, toolbar, body);
        timeline.appendChild(thinkingRegion);
      }

      const responseContent =
        Array.isArray(turnMessage.toolCalls) && turnMessage.toolCalls.length > 0
          ? getToolCallNarrationText(turnMessage)
          : String(turnMessage.response || turnMessage.text || '');
      const hasToolCalls = Array.isArray(turnMessage.toolCalls) && turnMessage.toolCalls.length > 0;
      const shouldShowPendingResponse =
        turnMessage.id === lastModelTurnMessage?.id &&
        !turnMessage.isResponseComplete &&
        !responseContent.trim() &&
        !hasToolCalls;
      if (shouldShowPendingResponse || responseContent.trim()) {
        const responseRegion = documentRef.createElement('section');
        responseRegion.className = 'response-region';
        responseRegion.classList.toggle('is-response-pending', shouldShowPendingResponse);
        const heading = documentRef.createElement('h3');
        heading.className = 'visually-hidden';
        heading.textContent = 'Response';
        const waitMessage = documentRef.createElement('p');
        waitMessage.className = 'fix-wait-message mb-0';
        waitMessage.setAttribute('aria-live', 'off');
        waitMessage.textContent = 'Please wait';
        const responseText = documentRef.createElement('div');
        responseText.className = 'response-content';
        responseText.innerHTML = renderModelMarkdown(responseContent);
        responseRegion.append(heading, waitMessage, responseText);
        timeline.appendChild(responseRegion);
        scheduleMathTypeset(responseText, { immediate: Boolean(turnMessage.isResponseComplete) });
        hasMathMlCopyAction ||= canShowMathMlCopyAction(responseContent);
      }

      const toolCalls = hasToolCalls ? turnMessage.toolCalls : [];
      if (toolCalls.length) {
        const isExpanded = refs.toolExpansion.get(turnMessage.id) === true;
        const primaryToolName =
          typeof toolCalls[0]?.name === 'string' && toolCalls[0].name.trim()
            ? toolCalls[0].name.trim()
            : '';
        const toolLabel = primaryToolName ? resolveToolDisplayName(primaryToolName) : 'Unknown Tool';
        const actionLabel = getToolCallActionLabel(toolCalls[0]);
        const toolResultText = formatToolResultText(
          getInlineToolResultMessages(conversation, turnMessage)
        );

        const toolCallRegion = documentRef.createElement('section');
        toolCallRegion.className = 'tool-call-region';
        const heading = documentRef.createElement('h3');
        heading.className = 'visually-hidden';
        heading.textContent = 'Tool call';
        const toggle = documentRef.createElement('button');
        toggle.type = 'button';
        toggle.className = 'btn btn-sm tool-call-toggle';
        toggle.textContent = `Tool action: ${actionLabel}`;
        toggle.setAttribute('aria-label', `${actionLabel}: ${toolLabel}`);
        toggle.setAttribute('aria-expanded', String(isExpanded));
        toggle.dataset.toolMessageId = turnMessage.id;
        const body = documentRef.createElement('div');
        body.className = 'tool-call-body mt-2';
        body.hidden = !isExpanded;
        const requestLabel = documentRef.createElement('p');
        requestLabel.className = 'mb-1 fw-semibold';
        requestLabel.textContent = 'Request';
        const requestPanel = documentRef.createElement('pre');
        requestPanel.className = 'tool-call-panel tool-call-request mb-2';
        requestPanel.textContent = toolCalls.map(formatToolCallText).filter(Boolean).join('\n\n');
        body.append(requestLabel, requestPanel);
        if (toolResultText) {
          const resultSection = documentRef.createElement('section');
          resultSection.className = 'tool-call-result-section';
          const resultLabel = documentRef.createElement('p');
          resultLabel.className = 'mb-1 fw-semibold';
          resultLabel.textContent = 'Response';
          const resultPanel = documentRef.createElement('pre');
          resultPanel.className = 'tool-call-panel tool-call-result mb-0';
          resultPanel.textContent = toolResultText;
          resultSection.append(resultLabel, resultPanel);
          body.appendChild(resultSection);
        }
        toolCallRegion.append(heading, toggle, body);
        timeline.appendChild(toolCallRegion);
      }
    });

    refs.copyMathMlButton.classList.toggle('d-none', !hasMathMlCopyAction);
    refs.copyMathMlButton.disabled = !hasMathMlCopyAction;
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
          <div class="model-turn-timeline"></div>
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
        responseActions.classList.toggle('d-none', !isModelTurnComplete(activeConversation, message));
      }
      const timeline = item.querySelector('.model-turn-timeline');
      const copyMathMlButton = item.querySelector('.copy-mathml-btn');
      if (timeline && copyMathMlButton instanceof view.HTMLButtonElement) {
        const refs = {
          timeline,
          copyMathMlButton,
          thinkingExpansion: new Map(),
          toolExpansion: new Map(),
        };
        timeline.addEventListener('click', (event) => {
          const target = event.target;
          if (!(target instanceof view.Element)) {
            return;
          }
          const thinkingToggle = target.closest('.thinking-toggle');
          if (thinkingToggle instanceof view.HTMLAnchorElement) {
            event.preventDefault();
            const thinkingMessageId = thinkingToggle.dataset.thinkingMessageId || '';
            if (thinkingMessageId) {
              const currentValue = refs.thinkingExpansion.get(thinkingMessageId);
              const nextValue =
                typeof currentValue === 'boolean'
                  ? !currentValue
                  : !getShowThinkingByDefault();
              refs.thinkingExpansion.set(thinkingMessageId, nextValue);
              setModelBubbleContent(message, refs);
            }
            return;
          }
          const toolCallToggle = target.closest('.tool-call-toggle');
          if (toolCallToggle instanceof view.HTMLButtonElement) {
            const toolMessageId = toolCallToggle.dataset.toolMessageId || '';
            if (toolMessageId) {
              refs.toolExpansion.set(toolMessageId, !(refs.toolExpansion.get(toolMessageId) === true));
              setModelBubbleContent(message, refs);
            }
          }
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
    const activeConversation = getActiveConversation();
    const isTurnComplete = isModelTurnComplete(activeConversation, message);
    const responseActions = item.querySelector('.response-actions');
    if (responseActions) {
      responseActions.classList.toggle('d-none', !isTurnComplete);
    }
    const variantState = getModelVariantState(activeConversation, message);
    const variantNav = item.querySelector('.response-variant-nav');
    const variantLabel = item.querySelector('.response-variant-status');
    const prevButton = item.querySelector('.response-variant-prev');
    const nextButton = item.querySelector('.response-variant-next');
    if (variantNav) {
      variantNav.classList.toggle(
        'd-none',
        !variantState.hasVariants || !isTurnComplete
      );
    }
    if (variantLabel) {
      variantLabel.textContent = `${Math.max(variantState.index + 1, 1)}/${Math.max(variantState.total, 1)}`;
    }
    if (prevButton instanceof view.HTMLButtonElement) {
      prevButton.disabled = !variantState.canGoPrev || !isTurnComplete;
    }
    if (nextButton instanceof view.HTMLButtonElement) {
      nextButton.disabled = !variantState.canGoNext || !isTurnComplete;
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
    const pathMessages = getConversationPathMessages(conversation);
    pathMessages.forEach((message, index) => {
      if (message?.role === 'tool') {
        return;
      }
      if (message?.role === 'model' && index > 0 && pathMessages[index - 1]?.role === 'tool') {
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
