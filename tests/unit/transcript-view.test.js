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
    expect(harness.container.querySelector('.user-message .message-bubble')?.textContent).toBe('Hello there');
    expect(harness.container.querySelector('.model-message .response-content')?.innerHTML).toContain('Hi back');
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
});
