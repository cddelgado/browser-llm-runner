import { describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { bindComposerEvents } from '../../src/app/composer-events.js';

function createHarness() {
  const dom = new JSDOM(
    `
      <div>
        <form class="composer">
          <textarea id="messageInput"></textarea>
          <button id="sendButton" type="submit"></button>
          <input id="imageAttachmentInput" type="file" />
        </form>
        <button id="addImagesButton" type="button"></button>
        <div id="composerAttachmentTray">
          <button class="composer-attachment-remove" data-attachment-index="0"></button>
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
  globalThis.HTMLButtonElement = dom.window.HTMLButtonElement;
  globalThis.HTMLInputElement = dom.window.HTMLInputElement;
  globalThis.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;

  const appState = {
    activeGenerationConfig: { temperature: 0.7 },
    pendingComposerAttachments: [{ filename: 'diagram.png' }],
    conversations: [],
    activeConversationId: null,
  };
  const messageInput = document.getElementById('messageInput');
  const sendButton = document.getElementById('sendButton');

  return {
    dom,
    document,
    appState,
    messageInput,
    sendButton,
    deps: {
      appState,
      chatForm: document.querySelector('.composer'),
      messageInput,
      sendButton,
      addImagesButton: document.getElementById('addImagesButton'),
      imageAttachmentInput: document.getElementById('imageAttachmentInput'),
      composerAttachmentTray: document.getElementById('composerAttachmentTray'),
      isGeneratingResponse: vi.fn(() => false),
      isOrchestrationRunningState: vi.fn(() => false),
      isMessageEditActive: vi.fn(() => false),
      isEngineReady: vi.fn(() => false),
      hasStartedWorkspace: vi.fn(() => false),
      setChatWorkspaceStarted: vi.fn((state, value) => {
        state.hasStartedChatWorkspace = value;
      }),
      updateWelcomePanelVisibility: vi.fn(),
      getPendingComposerAttachments: vi.fn(() => appState.pendingComposerAttachments),
      selectedModelSupportsImageInput: vi.fn(() => false),
      createComposerAttachmentFromFile: vi.fn(),
      renderComposerAttachments: vi.fn(),
      setStatus: vi.fn(),
      clearPendingComposerAttachments: vi.fn(() => {
        appState.pendingComposerAttachments = [];
      }),
      createConversation: vi.fn(() => ({ id: 'conversation-1', messageNodes: [] })),
      clearUserMessageEditSession: vi.fn(),
      setChatTitleEditing: vi.fn(),
      renderConversationList: vi.fn(),
      renderTranscript: vi.fn(),
      updateChatTitle: vi.fn(),
      queueConversationStateSave: vi.fn(),
      getActiveConversation: vi.fn(() => null),
      syncConversationModelSelection: vi.fn(() => ({ selectedModelId: 'model-1' })),
      getLoadedModelId: vi.fn(() => null),
      persistInferencePreferences: vi.fn(),
      initializeEngine: vi.fn(async () => {}),
      appendDebug: vi.fn(),
      buildUserMessageAttachmentPayload: vi.fn(() => ({ contentParts: [], artifactRefs: [] })),
      addMessageToConversation: vi.fn(() => ({ id: 'message-1' })),
      addMessageElement: vi.fn(),
      buildPromptForActiveConversation: vi.fn(() => 'prompt'),
      startModelGeneration: vi.fn(),
      stopGeneration: vi.fn(async () => {}),
    },
  };
}

describe('composer-events', () => {
  test('stops generation from the send button when the engine is streaming', async () => {
    const harness = createHarness();
    harness.deps.isGeneratingResponse.mockReturnValue(true);
    bindComposerEvents(harness.deps);

    harness.sendButton.dispatchEvent(
      new harness.dom.window.MouseEvent('click', { bubbles: true, cancelable: true }),
    );

    await Promise.resolve();
    expect(harness.deps.stopGeneration).toHaveBeenCalledTimes(1);
  });

  test('removes a pending attachment and refreshes the tray', () => {
    const harness = createHarness();
    bindComposerEvents(harness.deps);

    harness.document.querySelector('.composer-attachment-remove')?.dispatchEvent(
      new harness.dom.window.MouseEvent('click', { bubbles: true }),
    );

    expect(harness.appState.pendingComposerAttachments).toEqual([]);
    expect(harness.deps.renderComposerAttachments).toHaveBeenCalledTimes(1);
    expect(harness.deps.setStatus).toHaveBeenCalledWith('Removed diagram.png.');
  });

  test('blocks submit while a message edit is active', () => {
    const harness = createHarness();
    harness.deps.isMessageEditActive.mockReturnValue(true);
    harness.messageInput.value = 'Hello';
    bindComposerEvents(harness.deps);

    harness.deps.chatForm.dispatchEvent(
      new harness.dom.window.Event('submit', { bubbles: true, cancelable: true }),
    );

    expect(harness.deps.setStatus).toHaveBeenCalledWith(
      'Save or cancel the current message edit before sending a new message.',
    );
    expect(harness.deps.startModelGeneration).not.toHaveBeenCalled();
  });
});
