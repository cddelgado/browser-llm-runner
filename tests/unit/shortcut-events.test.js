import { describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { createShortcutHandlers } from '../../src/app/shortcut-events.js';

function createHarness() {
  const dom = new JSDOM(
    `
      <div>
        <button id="openSettingsButton"></button>
        <button id="startConversationButton"></button>
        <button id="newConversationBtn"></button>
        <button id="preChatLoadModelBtn"></button>
        <button id="jumpToPreviousUserButton"></button>
        <button id="jumpToLatestButton"></button>
        <button id="preChatEditConversationSystemPromptBtn"></button>
        <button id="sendButton"></button>
        <textarea id="messageInput"></textarea>
        <div id="keyboardShortcutsModal"></div>
        <article class="message-row model-message" data-message-id="model-1" tabindex="0"></article>
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
  globalThis.HTMLSelectElement = dom.window.HTMLSelectElement;

  const appState = {
    enableSingleKeyShortcuts: true,
    hasStartedChatWorkspace: true,
    isGenerating: false,
  };
  const activeConversation = {
    id: 'conversation-1',
    messageNodes: [{ id: 'model-1', role: 'model' }],
  };

  return {
    dom,
    document,
    appState,
    activeConversation,
    deps: {
      appState,
      documentRef: document,
      keyboardShortcutsModal: document.getElementById('keyboardShortcutsModal'),
      shortcutKeys: {
        branch: 'b',
        copy: 'c',
        edit: 'e',
        fix: 'f',
        help: 'h',
        jumpLatest: 'j',
        jumpPrompt: 'k',
        loadModel: 'l',
        newConversation: 'n',
        systemPrompt: 'p',
        regenerate: 'r',
        settings: 's',
        title: 't',
      },
      isAnyModalOpen: vi.fn(() => false),
      openKeyboardShortcuts: vi.fn(),
      closeKeyboardShortcuts: vi.fn(),
      messageInput: document.getElementById('messageInput'),
      sendButton: document.getElementById('sendButton'),
      isSettingsView: vi.fn(() => false),
      setSettingsPageVisibility: vi.fn(),
      openSettingsButton: document.getElementById('openSettingsButton'),
      hasStartedWorkspace: vi.fn(() => true),
      startConversationButton: document.getElementById('startConversationButton'),
      newConversationBtn: document.getElementById('newConversationBtn'),
      preChatLoadModelBtn: document.getElementById('preChatLoadModelBtn'),
      jumpToPreviousUserButton: document.getElementById('jumpToPreviousUserButton'),
      jumpToLatestButton: document.getElementById('jumpToLatestButton'),
      downloadActiveConversationBranchAsJson: vi.fn(),
      downloadActiveConversationBranchAsMarkdown: vi.fn(),
      getActiveConversation: vi.fn(() => activeConversation),
      beginConversationSystemPromptEdit: vi.fn(),
      preChatEditConversationSystemPromptBtn: document.getElementById(
        'preChatEditConversationSystemPromptBtn',
      ),
      beginChatTitleEdit: vi.fn(),
      isGeneratingResponse: vi.fn(() => false),
      getMessageNodeById: vi.fn((conversation, messageId) =>
        conversation.messageNodes.find((message) => message.id === messageId) || null,
      ),
      switchModelVariant: vi.fn(),
      switchUserVariant: vi.fn(),
      regenerateFromMessage: vi.fn(),
      fixResponseFromMessage: vi.fn(async () => {}),
      handleMessageCopyAction: vi.fn(async () => {}),
      beginUserMessageEdit: vi.fn(),
      branchFromUserMessage: vi.fn(),
    },
  };
}

describe('shortcut-events', () => {
  test('routes the settings shortcut through the provided shell controls', () => {
    const harness = createHarness();
    const { handleGlobalShortcut } = createShortcutHandlers(harness.deps);
    const settingsButton = harness.document.getElementById('openSettingsButton');
    const clickSpy = vi.spyOn(settingsButton, 'click');

    const handled = handleGlobalShortcut(
      new harness.dom.window.KeyboardEvent('keydown', {
        key: 's',
        altKey: true,
        bubbles: true,
      }),
    );

    expect(handled).toBe(true);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  test('routes focused model-message copy shortcuts to the copy handler', () => {
    const harness = createHarness();
    const { handleFocusedMessageShortcut } = createShortcutHandlers(harness.deps);
    const messageRow = harness.document.querySelector('.message-row');
    messageRow.focus();

    const event = new harness.dom.window.KeyboardEvent('keydown', {
      key: 'c',
      bubbles: true,
    });
    Object.defineProperty(event, 'target', {
      value: messageRow,
    });

    const handled = handleFocusedMessageShortcut(event);

    expect(handled).toBe(true);
    expect(harness.deps.handleMessageCopyAction).toHaveBeenCalledWith('model-1', 'response');
  });
});
