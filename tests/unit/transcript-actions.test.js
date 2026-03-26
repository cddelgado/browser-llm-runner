import { describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { createTranscriptActions } from '../../src/app/transcript-actions.js';

function createHarness() {
  const dom = new JSDOM(
    `
      <div id="chatMain">
        <div id="chatTranscript">
          <article data-message-id="user-1">
            <textarea class="user-message-editor">Original text</textarea>
          </article>
        </div>
      </div>
    `,
    { url: 'https://example.test/' },
  );
  const document = dom.window.document;
  globalThis.document = document;
  globalThis.window = dom.window;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;

  const activeConversation = {
    id: 'conversation-1',
    activeLeafMessageId: null,
    lastSpokenLeafMessageId: null,
    messageNodes: [
      {
        id: 'user-1',
        role: 'user',
        text: 'Original text',
        parentId: null,
        content: { parts: [] },
        artifactRefs: [],
      },
    ],
  };
  const appState = {
    activeUserEditMessageId: 'user-1',
    activeUserBranchSourceMessageId: null,
  };

  return {
    dom,
    document,
    appState,
    activeConversation,
    deps: {
      appState,
      chatTranscript: document.getElementById('chatTranscript'),
      chatMain: document.getElementById('chatMain'),
      windowRef: dom.window,
      clamp: vi.fn((value) => value),
      getActiveConversation: vi.fn(() => activeConversation),
      getMessageNodeById: vi.fn((conversation, messageId) =>
        conversation.messageNodes.find((message) => message.id === messageId) || null,
      ),
      getModelVariantState: vi.fn(),
      getUserVariantState: vi.fn(),
      findPreferredLeafForVariant: vi.fn(() => 'leaf-1'),
      isEngineBusy: vi.fn(() => false),
      isOrchestrationRunningState: vi.fn(() => false),
      isVariantSwitchingState: vi.fn(() => false),
      isMessageEditActive: vi.fn((state) => Boolean(state.activeUserEditMessageId)),
      getActiveUserEditMessageId: vi.fn((state) => state.activeUserEditMessageId),
      isEngineReady: vi.fn(() => false),
      setSwitchingVariant: vi.fn(),
      startUserMessageEditSession: vi.fn((messageId, options = {}) => {
        appState.activeUserEditMessageId = messageId;
        appState.activeUserBranchSourceMessageId = options.branchSourceMessageId || null;
      }),
      clearUserMessageEditSession: vi.fn(() => {
        appState.activeUserEditMessageId = null;
        appState.activeUserBranchSourceMessageId = null;
      }),
      addMessageToConversation: vi.fn(),
      normalizeMessageContentParts: vi.fn((parts) => parts || []),
      setUserMessageText: vi.fn((message, nextText) => {
        message.text = nextText;
      }),
      pruneDescendantsFromMessage: vi.fn(() => ({ removedCount: 0 })),
      buildPromptForActiveConversation: vi.fn(() => []),
      startModelGeneration: vi.fn(),
      renderTranscript: vi.fn(),
      updateActionButtons: vi.fn(),
      queueConversationStateSave: vi.fn(),
      ensureModelVariantControlsVisible: vi.fn(),
      setStatus: vi.fn(),
    },
  };
}

describe('transcript-actions', () => {
  test('begins user message edit and focuses the inline editor', () => {
    const harness = createHarness();
    const actions = createTranscriptActions(harness.deps);

    actions.beginUserMessageEdit('user-1');

    expect(harness.activeConversation.activeLeafMessageId).toBe('leaf-1');
    expect(harness.deps.startUserMessageEditSession).toHaveBeenCalledWith('user-1');
    expect(harness.deps.renderTranscript).toHaveBeenCalledWith({ scrollToBottom: false });
    expect(harness.document.activeElement).toBe(
      harness.document.querySelector('.user-message-editor'),
    );
  });

  test('does not create a branch when the branched text is unchanged', () => {
    const harness = createHarness();
    harness.appState.activeUserBranchSourceMessageId = 'user-1';
    const actions = createTranscriptActions(harness.deps);

    actions.saveUserMessageEdit('user-1');

    expect(harness.deps.clearUserMessageEditSession).toHaveBeenCalledTimes(1);
    expect(harness.deps.addMessageToConversation).not.toHaveBeenCalled();
    expect(harness.deps.startModelGeneration).not.toHaveBeenCalled();
    expect(harness.deps.setStatus).toHaveBeenCalledWith(
      'Branch not created. Change the message and save to create a branch.',
    );
  });

  test('enters branch mode and announces it', () => {
    const harness = createHarness();
    harness.appState.activeUserEditMessageId = null;
    const actions = createTranscriptActions(harness.deps);

    actions.branchFromUserMessage('user-1');

    expect(harness.activeConversation.activeLeafMessageId).toBe('leaf-1');
    expect(harness.deps.startUserMessageEditSession).toHaveBeenCalledWith('user-1', {
      branchSourceMessageId: 'user-1',
    });
    expect(harness.deps.setStatus).toHaveBeenCalledWith(
      'Branch mode enabled. Edit and save to create a branch.',
    );
  });
});
