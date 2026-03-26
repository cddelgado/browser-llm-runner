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
    expect(harness.container.querySelector('.user-message .message-bubble')?.textContent).toContain('Hello there');
    expect(harness.container.querySelector('.user-message .message-image-thumb')?.getAttribute('src')).toContain(
      'data:image/png;base64,abc123',
    );
    expect(harness.container.querySelector('.model-message .response-content')?.innerHTML).toContain('Hi back');
    expect(harness.container.querySelector('.regenerate-response-btn')?.getAttribute('aria-keyshortcuts')).toBe('R');
    expect(harness.container.querySelector('.copy-message-btn')?.getAttribute('data-bs-title')).toContain(
      '(C)',
    );
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

    const userItem = view.addMessageElement(harness.conversation.messageNodes[0], { scroll: false });

    expect(userItem.querySelector('.user-message-editor')?.classList.contains('d-none')).toBe(false);
    expect(userItem.querySelector('.save-user-message-btn')?.classList.contains('d-none')).toBe(false);
    expect(userItem.querySelector('.edit-user-message-btn')?.classList.contains('d-none')).toBe(true);
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
    const toolMessage = {
      id: 'tool-1',
      role: 'tool',
      speaker: 'Tool',
      text: '{"temperature":72,"summary":"72 F and sunny."}',
      toolName: 'get_weather',
      toolResult: '{"temperature":72,"summary":"72 F and sunny."}',
      parentId: 'model-1',
    };
    harness.conversation.messageNodes.push(toolMessage);
    harness.conversation.activeLeafMessageId = toolMessage.id;

    const view = createTranscriptView({
      container: harness.container,
      getActiveConversation: () => harness.conversation,
      getConversationPathMessages: (conversation) => conversation.messageNodes,
      getConversationCardHeading: (_conversation, message) =>
        message.role === 'user' ? 'User Prompt 1' : message.role === 'tool' ? 'Tool Result 1' : 'Model Response 1',
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
    expect(toggle?.textContent).toContain('🛠️ Tool Call: Get Weather');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    toggle?.dispatchEvent(new harness.document.defaultView.Event('click', { bubbles: true }));
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(harness.container.querySelector('.tool-call-request')?.textContent).toContain('"name": "get_weather"');
    expect(harness.container.querySelector('.tool-call-result')?.textContent).toContain('"temperature": 72');
    expect(harness.container.querySelector('.tool-call-result')?.textContent).toContain('72 F and sunny.');
  });
});
