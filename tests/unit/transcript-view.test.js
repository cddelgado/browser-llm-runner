import { describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { createTranscriptView } from '../../src/ui/transcript-view.js';

function createViewHarness() {
  const dom = new JSDOM('<ul id="chatTranscript"></ul>');
  const document = dom.window.document;
  globalThis.document = document;

  const conversation = {
    id: 'conversation-1',
    activeLeafMessageId: 'model-1',
    messageNodes: [
      {
        id: 'user-1',
        role: 'user',
        speaker: 'User',
        text: 'Hello there',
        content: {
          parts: [
            { type: 'text', text: 'Hello there' },
            {
              type: 'image',
              url: 'data:image/png;base64,abc123',
              filename: 'hello.png',
              alt: 'Attached image: hello.png',
            },
            {
              type: 'file',
              filename: 'hello.md',
              mimeType: 'text/markdown',
              conversionWarnings: ['Embedded spreadsheet object omitted.'],
              llmText:
                'Attached file: hello.md\nMIME type: text/markdown\nWorkspace path: /workspace/hello.md\nThis file is available to inspect or modify with run_shell_command.\nContents:\n# Hello',
            },
          ],
        },
      },
      {
        id: 'model-1',
        role: 'model',
        speaker: 'Model',
        text: 'Hi back',
        response: 'Hi back',
        thoughts: '',
        hasThinking: false,
        isThinkingComplete: false,
        isResponseComplete: true,
      },
    ],
  };

  return {
    document,
    container: document.getElementById('chatTranscript'),
    conversation,
  };
}

describe('transcript-view', () => {
  test('renders transcript messages and empty state', () => {
    const harness = createViewHarness();
    const view = createTranscriptView({
      container: harness.container,
      getActiveConversation: () => harness.conversation,
      getConversationPathMessages: (conversation) => conversation.messageNodes,
      getConversationCardHeading: (_conversation, message) =>
        message.role === 'user' ? 'User Prompt 1' : 'Model Response 1',
      getModelVariantState: () => ({
        index: 0,
        total: 1,
        hasVariants: false,
        canGoPrev: false,
        canGoNext: false,
      }),
      getUserVariantState: () => ({
        index: 0,
        total: 1,
        hasVariants: false,
        canGoPrev: false,
        canGoNext: false,
      }),
      renderModelMarkdown: (content) => `<p>${content}</p>`,
      scheduleMathTypeset: vi.fn(),
      getToolDisplayName: (toolName) => (toolName === 'get_weather' ? 'Get Weather' : toolName),
      getShowThinkingByDefault: () => false,
      getActiveUserEditMessageId: () => null,
      getControlsState: () => ({
        isGenerating: false,
        isLoadingModel: false,
        isRunningOrchestration: false,
        isSwitchingVariant: false,
      }),
      getEmptyStateVisible: () => false,
      initializeTooltips: vi.fn(),
      disposeTooltips: vi.fn(),
      applyVariantCardSignals: vi.fn(),
      applyFixCardSignals: vi.fn(),
      scrollTranscriptToBottom: vi.fn(),
      updateTranscriptNavigationButtonVisibility: vi.fn(),
      cancelUserMessageEdit: vi.fn(),
      saveUserMessageEdit: vi.fn(),
    });

    view.renderTranscript({ scrollToBottom: false });

    expect(harness.container.querySelectorAll('.message-row')).toHaveLength(2);
    expect(harness.container.querySelector('.user-message .message-bubble')?.textContent).toContain(
      'Hello there'
    );
    expect(
      harness.container.querySelector('.user-message .message-image-thumb')?.getAttribute('src')
    ).toContain('data:image/png;base64,abc123');
    expect(harness.container.querySelector('.user-message .message-file-name')?.textContent).toBe(
      'hello.md'
    );
    expect(harness.container.querySelector('.user-message .message-file-card')?.textContent).toContain(
      'Embedded spreadsheet object omitted.'
    );
    expect(
      harness.container.querySelector('.model-message .response-content')?.innerHTML
    ).toContain('Hi back');
    expect(
      harness.container.querySelector('.regenerate-response-btn')?.getAttribute('aria-keyshortcuts')
    ).toBe('R');
    expect(
      harness.container.querySelector('.copy-message-btn')?.getAttribute('data-bs-title')
    ).toContain('(C)');
    expect(harness.container.querySelector('.copy-mathml-btn')?.classList.contains('d-none')).toBe(
      true
    );
  });

  test('shows a dedicated MathML copy action for math responses', () => {
    const harness = createViewHarness();
    harness.conversation.messageNodes[1].response = '$x^2$';
    harness.conversation.messageNodes[1].text = '$x^2$';

    const view = createTranscriptView({
      container: harness.container,
      getActiveConversation: () => harness.conversation,
      getConversationPathMessages: (conversation) => conversation.messageNodes,
      getConversationCardHeading: (_conversation, message) =>
        message.role === 'user' ? 'User Prompt 1' : 'Model Response 1',
      getModelVariantState: () => ({
        index: 0,
        total: 1,
        hasVariants: false,
        canGoPrev: false,
        canGoNext: false,
      }),
      getUserVariantState: () => ({
        index: 0,
        total: 1,
        hasVariants: false,
        canGoPrev: false,
        canGoNext: false,
      }),
      renderModelMarkdown: (content) => `<p>${content}</p>`,
      scheduleMathTypeset: vi.fn(),
      shouldShowMathMlCopyAction: (content) => String(content).includes('$'),
      getToolDisplayName: (toolName) => toolName,
      getShowThinkingByDefault: () => false,
      getActiveUserEditMessageId: () => null,
      getControlsState: () => ({
        isGenerating: false,
        isLoadingModel: false,
        isRunningOrchestration: false,
        isSwitchingVariant: false,
      }),
      getEmptyStateVisible: () => false,
      initializeTooltips: vi.fn(),
      disposeTooltips: vi.fn(),
      applyVariantCardSignals: vi.fn(),
      applyFixCardSignals: vi.fn(),
      scrollTranscriptToBottom: vi.fn(),
      updateTranscriptNavigationButtonVisibility: vi.fn(),
      cancelUserMessageEdit: vi.fn(),
      saveUserMessageEdit: vi.fn(),
    });

    view.renderTranscript({ scrollToBottom: false });

    const mathMlButton = harness.container.querySelector('.copy-mathml-btn');
    expect(mathMlButton?.classList.contains('d-none')).toBe(false);
    expect(mathMlButton?.getAttribute('data-copy-type')).toBe('mathml');
    expect(mathMlButton?.getAttribute('aria-label')).toBe('Copy MathML');
  });

  test('shows Please wait while a model response card is still empty', () => {
    const harness = createViewHarness();
    harness.conversation.messageNodes[1].response = '';
    harness.conversation.messageNodes[1].text = '';
    harness.conversation.messageNodes[1].isResponseComplete = false;

    const view = createTranscriptView({
      container: harness.container,
      getActiveConversation: () => harness.conversation,
      getConversationPathMessages: (conversation) => conversation.messageNodes,
      getConversationCardHeading: (_conversation, message) =>
        message.role === 'user' ? 'User Prompt 1' : 'Model Response 1',
      getModelVariantState: () => ({
        index: 0,
        total: 1,
        hasVariants: false,
        canGoPrev: false,
        canGoNext: false,
      }),
      getUserVariantState: () => ({
        index: 0,
        total: 1,
        hasVariants: false,
        canGoPrev: false,
        canGoNext: false,
      }),
      renderModelMarkdown: (content) => `<p>${content}</p>`,
      scheduleMathTypeset: vi.fn(),
      getToolDisplayName: (toolName) => toolName,
      getShowThinkingByDefault: () => false,
      getActiveUserEditMessageId: () => null,
      getControlsState: () => ({
        isGenerating: true,
        isLoadingModel: false,
        isRunningOrchestration: false,
        isSwitchingVariant: false,
      }),
      getEmptyStateVisible: () => false,
      initializeTooltips: vi.fn(),
      disposeTooltips: vi.fn(),
      applyVariantCardSignals: vi.fn(),
      applyFixCardSignals: vi.fn(),
      scrollTranscriptToBottom: vi.fn(),
      updateTranscriptNavigationButtonVisibility: vi.fn(),
      cancelUserMessageEdit: vi.fn(),
      saveUserMessageEdit: vi.fn(),
    });

    view.renderTranscript({ scrollToBottom: false });

    const responseRegion = harness.container.querySelector('.model-message .response-region');
    const waitMessage = harness.container.querySelector('.model-message .fix-wait-message');
    expect(responseRegion?.classList.contains('is-response-pending')).toBe(true);
    expect(waitMessage?.textContent).toBe('Please wait');
  });

  test('does not show Please wait when an empty pending segment is only a tool call', () => {
    const harness = createViewHarness();
    harness.conversation.messageNodes[1].response = '';
    harness.conversation.messageNodes[1].text = '';
    harness.conversation.messageNodes[1].isResponseComplete = false;
    harness.conversation.messageNodes[1].toolCalls = [
      {
        name: 'tasklist',
        arguments: { command: 'list' },
        rawText: '{"name":"tasklist","parameters":{"command":"list"}}',
      },
    ];

    const view = createTranscriptView({
      container: harness.container,
      getActiveConversation: () => harness.conversation,
      getConversationPathMessages: (conversation) => conversation.messageNodes,
      getConversationCardHeading: (_conversation, message) =>
        message.role === 'user' ? 'User Prompt 1' : 'Model Response 1',
      getModelVariantState: () => ({
        index: 0,
        total: 1,
        hasVariants: false,
        canGoPrev: false,
        canGoNext: false,
      }),
      getUserVariantState: () => ({
        index: 0,
        total: 1,
        hasVariants: false,
        canGoPrev: false,
        canGoNext: false,
      }),
      renderModelMarkdown: (content) => `<p>${content}</p>`,
      scheduleMathTypeset: vi.fn(),
      getToolDisplayName: (toolName) => toolName,
      getShowThinkingByDefault: () => false,
      getActiveUserEditMessageId: () => null,
      getControlsState: () => ({
        isGenerating: true,
        isLoadingModel: false,
        isRunningOrchestration: false,
        isSwitchingVariant: false,
      }),
      getEmptyStateVisible: () => false,
      initializeTooltips: vi.fn(),
      disposeTooltips: vi.fn(),
      applyVariantCardSignals: vi.fn(),
      applyFixCardSignals: vi.fn(),
      scrollTranscriptToBottom: vi.fn(),
      updateTranscriptNavigationButtonVisibility: vi.fn(),
      cancelUserMessageEdit: vi.fn(),
      saveUserMessageEdit: vi.fn(),
    });

    view.renderTranscript({ scrollToBottom: false });

    expect(harness.container.querySelector('.model-message .fix-wait-message')).toBeNull();
    expect(harness.container.querySelector('.model-message .tool-call-region')).not.toBeNull();
  });

  test('updates user message editing controls', () => {
    const harness = createViewHarness();
    const view = createTranscriptView({
      container: harness.container,
      getActiveConversation: () => harness.conversation,
      getConversationPathMessages: (conversation) => conversation.messageNodes,
      getConversationCardHeading: (_conversation, message) =>
        message.role === 'user' ? 'User Prompt 1' : 'Model Response 1',
      getModelVariantState: () => ({
        index: 0,
        total: 1,
        hasVariants: false,
        canGoPrev: false,
        canGoNext: false,
      }),
      getUserVariantState: () => ({
        index: 0,
        total: 1,
        hasVariants: false,
        canGoPrev: false,
        canGoNext: false,
      }),
      renderModelMarkdown: (content) => `<p>${content}</p>`,
      scheduleMathTypeset: vi.fn(),
      getToolDisplayName: (toolName) => toolName,
      getShowThinkingByDefault: () => false,
      getActiveUserEditMessageId: () => 'user-1',
      getControlsState: () => ({
        isGenerating: false,
        isLoadingModel: false,
        isRunningOrchestration: false,
        isSwitchingVariant: false,
      }),
      getEmptyStateVisible: () => false,
      initializeTooltips: vi.fn(),
      disposeTooltips: vi.fn(),
      applyVariantCardSignals: vi.fn(),
      applyFixCardSignals: vi.fn(),
      scrollTranscriptToBottom: vi.fn(),
      updateTranscriptNavigationButtonVisibility: vi.fn(),
      cancelUserMessageEdit: vi.fn(),
      saveUserMessageEdit: vi.fn(),
    });

    const userItem = view.addMessageElement(harness.conversation.messageNodes[0], {
      scroll: false,
    });

    expect(userItem.querySelector('.user-message-editor')?.classList.contains('d-none')).toBe(
      false
    );
    expect(userItem.querySelector('.save-user-message-btn')?.classList.contains('d-none')).toBe(
      false
    );
    expect(userItem.querySelector('.edit-user-message-btn')?.classList.contains('d-none')).toBe(
      true
    );
  });

  test('renders tool result messages', () => {
    const harness = createViewHarness();
    harness.conversation.messageNodes[1].toolCalls = [
      {
        name: 'get_weather',
        arguments: { location: 'Milwaukee, WI' },
        rawText: '{"name":"get_weather","arguments":{"location":"Milwaukee, WI"}}',
      },
    ];
    harness.conversation.messageNodes[1].childIds = ['tool-1'];
    const toolMessage = /** @type {any} */ ({
      id: 'tool-1',
      role: 'tool',
      speaker: 'Tool',
      text: '{"temperature":72,"summary":"72 F and sunny."}',
      toolName: 'get_weather',
      toolResult: '{"temperature":72,"summary":"72 F and sunny."}',
      parentId: 'model-1',
    });
    harness.conversation.messageNodes.push(toolMessage);
    harness.conversation.activeLeafMessageId = toolMessage.id;

    const view = createTranscriptView({
      container: harness.container,
      getActiveConversation: () => harness.conversation,
      getConversationPathMessages: (conversation) => conversation.messageNodes,
      getConversationCardHeading: (_conversation, message) =>
        message.role === 'user'
          ? 'User Prompt 1'
          : message.role === 'tool'
            ? 'Tool Result 1'
            : 'Model Response 1',
      getModelVariantState: () => ({
        index: 0,
        total: 1,
        hasVariants: false,
        canGoPrev: false,
        canGoNext: false,
      }),
      getUserVariantState: () => ({
        index: 0,
        total: 1,
        hasVariants: false,
        canGoPrev: false,
        canGoNext: false,
      }),
      renderModelMarkdown: (content) => `<p>${content}</p>`,
      scheduleMathTypeset: vi.fn(),
      getToolDisplayName: (toolName) => (toolName === 'get_weather' ? 'Get Weather' : toolName),
      getShowThinkingByDefault: () => false,
      getActiveUserEditMessageId: () => null,
      getControlsState: () => ({
        isGenerating: false,
        isLoadingModel: false,
        isRunningOrchestration: false,
        isSwitchingVariant: false,
      }),
      getEmptyStateVisible: () => false,
      initializeTooltips: vi.fn(),
      disposeTooltips: vi.fn(),
      applyVariantCardSignals: vi.fn(),
      applyFixCardSignals: vi.fn(),
      scrollTranscriptToBottom: vi.fn(),
      updateTranscriptNavigationButtonVisibility: vi.fn(),
      cancelUserMessageEdit: vi.fn(),
      saveUserMessageEdit: vi.fn(),
    });

    view.renderTranscript({ scrollToBottom: false });

    expect(harness.container.querySelectorAll('.message-row')).toHaveLength(2);
    expect(harness.container.querySelector('.tool-message')).toBeNull();
    const toggle = harness.container.querySelector('.tool-call-toggle');
    expect(toggle?.textContent).toContain('Tool action: Using Get Weather');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    toggle?.dispatchEvent(new harness.document.defaultView.Event('click', { bubbles: true }));
    expect(harness.container.querySelector('.tool-call-toggle')?.getAttribute('aria-expanded')).toBe('true');
    expect(harness.container.querySelector('.tool-call-request')?.textContent).toContain(
      '"name": "get_weather"'
    );
    expect(harness.container.querySelector('.tool-call-result')?.textContent).toContain(
      '"temperature": 72'
    );
    expect(harness.container.querySelector('.tool-call-result')?.textContent).toContain(
      '72 F and sunny.'
    );
  });

  test('keeps narration visible around tool calls', () => {
    const harness = createViewHarness();
    harness.conversation.messageNodes[1].toolCalls = [
      {
        name: 'tasklist',
        arguments: {},
        rawText: '{"name":"tasklist","parameters":{}}',
      },
      {
        name: 'get_current_date_time',
        arguments: {},
        rawText: '{"name":"get_current_date_time","parameters":{}}',
      },
    ];
    harness.conversation.messageNodes[1].response =
      '{"name":"tasklist","parameters":{}}\nI checked the current list.\n{"name":"get_current_date_time","parameters":{}}\nNow I have the time as well.';
    harness.conversation.messageNodes[1].text = harness.conversation.messageNodes[1].response;

    const view = createTranscriptView({
      container: harness.container,
      getActiveConversation: () => harness.conversation,
      getConversationPathMessages: (conversation) => conversation.messageNodes,
      getConversationCardHeading: (_conversation, message) =>
        message.role === 'user' ? 'User Prompt 1' : 'Model Response 1',
      getModelVariantState: () => ({
        index: 0,
        total: 1,
        hasVariants: false,
        canGoPrev: false,
        canGoNext: false,
      }),
      getUserVariantState: () => ({
        index: 0,
        total: 1,
        hasVariants: false,
        canGoPrev: false,
        canGoNext: false,
      }),
      renderModelMarkdown: (content) => `<p>${content}</p>`,
      scheduleMathTypeset: vi.fn(),
      getToolDisplayName: (toolName) => toolName,
      getShowThinkingByDefault: () => false,
      getActiveUserEditMessageId: () => null,
      getControlsState: () => ({
        isGenerating: false,
        isLoadingModel: false,
        isRunningOrchestration: false,
        isSwitchingVariant: false,
      }),
      getEmptyStateVisible: () => false,
      initializeTooltips: vi.fn(),
      disposeTooltips: vi.fn(),
      applyVariantCardSignals: vi.fn(),
      applyFixCardSignals: vi.fn(),
      scrollTranscriptToBottom: vi.fn(),
      updateTranscriptNavigationButtonVisibility: vi.fn(),
      cancelUserMessageEdit: vi.fn(),
      saveUserMessageEdit: vi.fn(),
    });

    view.renderTranscript({ scrollToBottom: false });

    expect(harness.container.querySelector('.tool-call-region')?.classList.contains('d-none')).toBe(false);
    expect(harness.container.querySelector('.response-region')?.classList.contains('d-none')).toBe(false);
    expect(harness.container.querySelector('.response-content')?.textContent).toContain(
      'I checked the current list.'
    );
    expect(harness.container.querySelector('.response-content')?.textContent).toContain(
      'Now I have the time as well.'
    );
    const responseRegion = harness.container.querySelector('.response-region');
    const toolCallRegion = harness.container.querySelector('.tool-call-region');
    expect(
      responseRegion?.compareDocumentPosition(toolCallRegion) &
        harness.document.defaultView.Node.DOCUMENT_POSITION_FOLLOWING
    ).not.toBe(0);
  });

  test('folds tool execution and continued model output into one visible turn in order', () => {
    const harness = createViewHarness();
    harness.conversation.messageNodes[1].response = 'I need to check the weather first.';
    harness.conversation.messageNodes[1].text = 'I need to check the weather first.';
    harness.conversation.messageNodes[1].toolCalls = [
      {
        name: 'get_weather',
        arguments: { location: 'Milwaukee, WI' },
        rawText: '{"name":"get_weather","arguments":{"location":"Milwaukee, WI"}}',
      },
    ];
    harness.conversation.messageNodes[1].childIds = ['tool-1'];
    harness.conversation.messageNodes[1].thoughts = 'Checking whether a tool is needed.';
    harness.conversation.messageNodes[1].hasThinking = true;
    harness.conversation.messageNodes[1].isThinkingComplete = true;

    const toolMessage = /** @type {any} */ ({
      id: 'tool-1',
      role: 'tool',
      speaker: 'Tool',
      text: '{"temperature":72,"summary":"72 F and sunny."}',
      toolName: 'get_weather',
      toolResult: '{"temperature":72,"summary":"72 F and sunny."}',
      parentId: 'model-1',
      childIds: ['model-2'],
    });
    const continuedModelMessage = /** @type {any} */ ({
      id: 'model-2',
      role: 'model',
      speaker: 'Model',
      text: 'It is 72 F and sunny.',
      response: 'It is 72 F and sunny.',
      thoughts: 'Summarizing the tool result.',
      hasThinking: true,
      isThinkingComplete: true,
      isResponseComplete: true,
      parentId: 'tool-1',
      childIds: [],
      toolCalls: [],
    });
    harness.conversation.messageNodes.push(toolMessage, continuedModelMessage);
    harness.conversation.activeLeafMessageId = 'model-2';

    const view = createTranscriptView({
      container: harness.container,
      getActiveConversation: () => harness.conversation,
      getConversationPathMessages: (conversation) => conversation.messageNodes,
      getConversationCardHeading: (_conversation, message) =>
        message.role === 'user' ? 'User Prompt 1' : 'Model Response 1',
      getModelVariantState: () => ({
        index: 0,
        total: 1,
        hasVariants: false,
        canGoPrev: false,
        canGoNext: false,
      }),
      getUserVariantState: () => ({
        index: 0,
        total: 1,
        hasVariants: false,
        canGoPrev: false,
        canGoNext: false,
      }),
      renderModelMarkdown: (content) => `<p>${content}</p>`,
      scheduleMathTypeset: vi.fn(),
      getToolDisplayName: (toolName) => (toolName === 'get_weather' ? 'Get Weather' : toolName),
      getShowThinkingByDefault: () => false,
      getActiveUserEditMessageId: () => null,
      getControlsState: () => ({
        isGenerating: false,
        isLoadingModel: false,
        isRunningOrchestration: false,
        isSwitchingVariant: false,
      }),
      getEmptyStateVisible: () => false,
      initializeTooltips: vi.fn(),
      disposeTooltips: vi.fn(),
      applyVariantCardSignals: vi.fn(),
      applyFixCardSignals: vi.fn(),
      scrollTranscriptToBottom: vi.fn(),
      updateTranscriptNavigationButtonVisibility: vi.fn(),
      cancelUserMessageEdit: vi.fn(),
      saveUserMessageEdit: vi.fn(),
    });

    view.renderTranscript({ scrollToBottom: false });

    expect(harness.container.querySelectorAll('.message-row')).toHaveLength(2);
    expect(harness.container.querySelectorAll('.message-row.model-message')).toHaveLength(1);
    expect(harness.container.querySelectorAll('.tool-message')).toHaveLength(0);
    expect(harness.container.querySelectorAll('.thoughts-region')).toHaveLength(2);
    expect(harness.container.querySelectorAll('.response-region')).toHaveLength(2);

    const bubble = harness.container.querySelector('.model-message .message-bubble');
    const orderedSections = Array.from(bubble?.children || []).map((element) => element.className);
    expect(orderedSections[0]).toContain('model-turn-timeline');

    const timelineSections = Array.from(
      harness.container.querySelectorAll('.model-message .model-turn-timeline > *')
    );
    expect(timelineSections[0]?.className).toContain('thoughts-region');
    expect(timelineSections[1]?.className).toContain('response-region');
    expect(timelineSections[2]?.className).toContain('tool-call-region');
    expect(timelineSections[3]?.className).toContain('thoughts-region');
    expect(timelineSections[4]?.className).toContain('response-region');

    expect(timelineSections[1]?.textContent).toContain('I need to check the weather first.');
    expect(timelineSections[2]?.textContent).toContain('Tool action: Using Get Weather');
    expect(timelineSections[4]?.textContent).toContain('It is 72 F and sunny.');
    expect(
      harness.container.querySelector('.model-message .response-actions')?.classList.contains('d-none')
    ).toBe(false);
  });

  test('toggles model-visible text for a file attachment', () => {
    const harness = createViewHarness();
    const view = createTranscriptView({
      container: harness.container,
      getActiveConversation: () => harness.conversation,
      getConversationPathMessages: (conversation) => conversation.messageNodes,
      getConversationCardHeading: (_conversation, message) =>
        message.role === 'user' ? 'User Prompt 1' : 'Model Response 1',
      getModelVariantState: () => ({
        index: 0,
        total: 1,
        hasVariants: false,
        canGoPrev: false,
        canGoNext: false,
      }),
      getUserVariantState: () => ({
        index: 0,
        total: 1,
        hasVariants: false,
        canGoPrev: false,
        canGoNext: false,
      }),
      renderModelMarkdown: (content) => `<p>${content}</p>`,
      scheduleMathTypeset: vi.fn(),
      getToolDisplayName: (toolName) => toolName,
      getShowThinkingByDefault: () => false,
      getActiveUserEditMessageId: () => null,
      getControlsState: () => ({
        isGenerating: false,
        isLoadingModel: false,
        isRunningOrchestration: false,
        isSwitchingVariant: false,
      }),
      getEmptyStateVisible: () => false,
      initializeTooltips: vi.fn(),
      disposeTooltips: vi.fn(),
      applyVariantCardSignals: vi.fn(),
      applyFixCardSignals: vi.fn(),
      scrollTranscriptToBottom: vi.fn(),
      updateTranscriptNavigationButtonVisibility: vi.fn(),
      cancelUserMessageEdit: vi.fn(),
      saveUserMessageEdit: vi.fn(),
    });

    view.renderTranscript({ scrollToBottom: false });

    const toggle = harness.container.querySelector('.message-file-toggle');
    const preview = harness.container.querySelector('.message-file-preview');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(preview?.hasAttribute('hidden')).toBe(true);
    toggle?.dispatchEvent(new harness.document.defaultView.Event('click', { bubbles: true }));
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(preview?.hasAttribute('hidden')).toBe(false);
    expect(harness.container.querySelector('.message-file-preview-text')?.textContent).toContain(
      'Attached file: hello.md'
    );
  });

  test('uses task-oriented labels for tasklist actions', () => {
    const harness = createViewHarness();
    harness.conversation.messageNodes[1].toolCalls = [
      {
        name: 'tasklist',
        arguments: { command: 'update', index: 0, status: 1 },
        rawText: '{"name":"tasklist","parameters":{"command":"update","index":0,"status":1}}',
      },
    ];

    const view = createTranscriptView({
      container: harness.container,
      getActiveConversation: () => harness.conversation,
      getConversationPathMessages: (conversation) => conversation.messageNodes,
      getConversationCardHeading: (_conversation, message) =>
        message.role === 'user' ? 'User Prompt 1' : 'Model Response 1',
      getModelVariantState: () => ({
        index: 0,
        total: 1,
        hasVariants: false,
        canGoPrev: false,
        canGoNext: false,
      }),
      getUserVariantState: () => ({
        index: 0,
        total: 1,
        hasVariants: false,
        canGoPrev: false,
        canGoNext: false,
      }),
      renderModelMarkdown: (content) => `<p>${content}</p>`,
      scheduleMathTypeset: vi.fn(),
      getToolDisplayName: (toolName) => (toolName === 'tasklist' ? 'Task List Planner' : toolName),
      getShowThinkingByDefault: () => false,
      getActiveUserEditMessageId: () => null,
      getControlsState: () => ({
        isGenerating: false,
        isLoadingModel: false,
        isRunningOrchestration: false,
        isSwitchingVariant: false,
      }),
      getEmptyStateVisible: () => false,
      initializeTooltips: vi.fn(),
      disposeTooltips: vi.fn(),
      applyVariantCardSignals: vi.fn(),
      applyFixCardSignals: vi.fn(),
      scrollTranscriptToBottom: vi.fn(),
      updateTranscriptNavigationButtonVisibility: vi.fn(),
      cancelUserMessageEdit: vi.fn(),
      saveUserMessageEdit: vi.fn(),
    });

    view.renderTranscript({ scrollToBottom: false });

    const toggle = harness.container.querySelector('.tool-call-toggle');
    expect(toggle?.textContent).toContain('Tool action: Updating task list');
    expect(toggle?.getAttribute('aria-label')).toBe('Updating task list: Task List Planner');
  });

  test('uses a shell-oriented label for shell command actions', () => {
    const harness = createViewHarness();
    harness.conversation.messageNodes[1].toolCalls = [
      {
        name: 'run_shell_command',
        arguments: { command: 'ls /workspace' },
        rawText: '{"name":"run_shell_command","parameters":{"command":"ls /workspace"}}',
      },
    ];

    const view = createTranscriptView({
      container: harness.container,
      getActiveConversation: () => harness.conversation,
      getConversationPathMessages: (conversation) => conversation.messageNodes,
      getConversationCardHeading: (_conversation, message) =>
        message.role === 'user' ? 'User Prompt 1' : 'Model Response 1',
      getModelVariantState: () => ({
        index: 0,
        total: 1,
        hasVariants: false,
        canGoPrev: false,
        canGoNext: false,
      }),
      getUserVariantState: () => ({
        index: 0,
        total: 1,
        hasVariants: false,
        canGoPrev: false,
        canGoNext: false,
      }),
      renderModelMarkdown: (content) => `<p>${content}</p>`,
      scheduleMathTypeset: vi.fn(),
      getToolDisplayName: (toolName) =>
        toolName === 'run_shell_command' ? 'Shell Command Runner' : toolName,
      getShowThinkingByDefault: () => false,
      getActiveUserEditMessageId: () => null,
      getControlsState: () => ({
        isGenerating: false,
        isLoadingModel: false,
        isRunningOrchestration: false,
        isSwitchingVariant: false,
      }),
      getEmptyStateVisible: () => false,
      initializeTooltips: vi.fn(),
      disposeTooltips: vi.fn(),
      applyVariantCardSignals: vi.fn(),
      applyFixCardSignals: vi.fn(),
      scrollTranscriptToBottom: vi.fn(),
      updateTranscriptNavigationButtonVisibility: vi.fn(),
      cancelUserMessageEdit: vi.fn(),
      saveUserMessageEdit: vi.fn(),
    });

    view.renderTranscript({ scrollToBottom: false });

    const toggle = harness.container.querySelector('.tool-call-toggle');
    expect(toggle?.textContent).toContain('Tool action: Running shell command');
    expect(toggle?.getAttribute('aria-label')).toBe('Running shell command: Shell Command Runner');
  });

  test('renders PDF attachment metadata in the transcript', () => {
    const harness = createViewHarness();
    harness.conversation.messageNodes[0].content.parts[2] = /** @type {any} */ ({
      type: 'file',
      filename: 'lesson.pdf',
      mimeType: 'application/pdf',
      extension: 'pdf',
      pageCount: 3,
      size: 4096,
      llmText:
        'Attached PDF: lesson.pdf\nMIME type: application/pdf\nPage count: 3\nWorkspace path: /workspace/lesson.pdf\nThis file is available to inspect or modify with run_shell_command.\nExtraction mode: parser-derived text only. OCR is not available.\n\nExtracted contents:\n\n## Page 1\nExtracted text',
      conversionWarnings: ['Page 2 has no extractable text. OCR is not available in this app.'],
    });

    const view = createTranscriptView({
      container: harness.container,
      getActiveConversation: () => harness.conversation,
      getConversationPathMessages: (conversation) => conversation.messageNodes,
      getConversationCardHeading: (_conversation, message) =>
        message.role === 'user' ? 'User Prompt 1' : 'Model Response 1',
      getModelVariantState: () => ({
        index: 0,
        total: 1,
        hasVariants: false,
        canGoPrev: false,
        canGoNext: false,
      }),
      getUserVariantState: () => ({
        index: 0,
        total: 1,
        hasVariants: false,
        canGoPrev: false,
        canGoNext: false,
      }),
      renderModelMarkdown: (content) => `<p>${content}</p>`,
      scheduleMathTypeset: vi.fn(),
      getToolDisplayName: (toolName) => toolName,
      getShowThinkingByDefault: () => false,
      getActiveUserEditMessageId: () => null,
      getControlsState: () => ({
        isGenerating: false,
        isLoadingModel: false,
        isRunningOrchestration: false,
        isSwitchingVariant: false,
      }),
      getEmptyStateVisible: () => false,
      initializeTooltips: vi.fn(),
      disposeTooltips: vi.fn(),
      applyVariantCardSignals: vi.fn(),
      applyFixCardSignals: vi.fn(),
      scrollTranscriptToBottom: vi.fn(),
      updateTranscriptNavigationButtonVisibility: vi.fn(),
      cancelUserMessageEdit: vi.fn(),
      saveUserMessageEdit: vi.fn(),
    });

    view.renderTranscript({ scrollToBottom: false });

    const fileCard = harness.container.querySelector('.message-file-card');
    expect(fileCard?.textContent).toContain('lesson.pdf');
    expect(fileCard?.textContent).toContain('application/pdf');
    expect(fileCard?.textContent).toContain('3 pages');
    expect(fileCard?.textContent).toContain('4096 bytes');
    expect(fileCard?.textContent).toContain('OCR is not available in this app.');
  });
});
