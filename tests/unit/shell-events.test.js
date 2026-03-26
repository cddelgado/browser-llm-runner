import { describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { bindShellEvents } from '../../src/app/shell-events.js';

function createHarness() {
  const dom = new JSDOM(
    `
      <div>
        <button id="openKeyboardShortcutsButton"></button>
        <div id="keyboardShortcutsModal" class="modal"></div>
        <div id="conversationSystemPromptModal" class="modal"></div>
        <button id="startConversationButton"></button>
        <button id="newConversationBtn"></button>
        <textarea id="messageInput"></textarea>
        <button id="preChatEditConversationSystemPromptBtn"></button>
        <button id="preChatLoadModelBtn"></button>
        <button id="saveChatTitleBtn"></button>
        <button id="cancelChatTitleBtn"></button>
        <textarea id="conversationSystemPromptInput"></textarea>
        <button id="saveConversationSystemPromptBtn"></button>
        <input id="chatTitleInput" />
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
    ignoreNextHashChange: false,
    conversationSaveTimerId: null,
    conversations: [],
    activeConversationId: null,
    lastKeyboardShortcutsTrigger: null,
    lastConversationSystemPromptTrigger: null,
  };

  return {
    dom,
    document,
    appState,
    elements: {
      keyboardShortcutsModal: document.getElementById('keyboardShortcutsModal'),
      openKeyboardShortcutsButton: document.getElementById('openKeyboardShortcutsButton'),
      conversationSystemPromptModal: document.getElementById('conversationSystemPromptModal'),
      preChatEditConversationSystemPromptBtn: document.getElementById(
        'preChatEditConversationSystemPromptBtn',
      ),
      chatTitleInput: document.getElementById('chatTitleInput'),
    },
    deps: {
      appState,
      documentRef: document,
      windowRef: dom.window,
      keyboardShortcutsModal: document.getElementById('keyboardShortcutsModal'),
      conversationSystemPromptModal: document.getElementById('conversationSystemPromptModal'),
      openKeyboardShortcutsButton: document.getElementById('openKeyboardShortcutsButton'),
      startConversationButton: document.getElementById('startConversationButton'),
      messageInput: document.getElementById('messageInput'),
      newConversationBtn: document.getElementById('newConversationBtn'),
      isGeneratingResponse: vi.fn(() => false),
      setChatWorkspaceStarted: vi.fn(),
      updateWelcomePanelVisibility: vi.fn(),
      createConversation: vi.fn(() => ({ id: 'conversation-1' })),
      clearUserMessageEditSession: vi.fn(),
      setChatTitleEditing: vi.fn(),
      renderConversationList: vi.fn(),
      renderTranscript: vi.fn(),
      updateChatTitle: vi.fn(),
      queueConversationStateSave: vi.fn(),
      openKeyboardShortcuts: vi.fn(),
      closeKeyboardShortcuts: vi.fn(),
      handleGlobalShortcut: vi.fn(() => false),
      handleFocusedMessageShortcut: vi.fn(),
      applyRouteFromHash: vi.fn(),
      persistConversationStateNow: vi.fn(async () => {}),
      disposeEngine: vi.fn(),
      preChatEditConversationSystemPromptBtn: document.getElementById(
        'preChatEditConversationSystemPromptBtn',
      ),
      beginConversationSystemPromptEdit: vi.fn(),
      preChatLoadModelBtn: document.getElementById('preChatLoadModelBtn'),
      loadModelForSelectedConversation: vi.fn(async () => {}),
      saveChatTitleBtn: document.getElementById('saveChatTitleBtn'),
      saveChatTitleEdit: vi.fn(),
      cancelChatTitleBtn: document.getElementById('cancelChatTitleBtn'),
      cancelChatTitleEdit: vi.fn(),
      conversationSystemPromptInput: document.getElementById('conversationSystemPromptInput'),
      saveConversationSystemPromptBtn: document.getElementById('saveConversationSystemPromptBtn'),
      saveConversationSystemPromptEdit: vi.fn(),
      chatTitleInput: document.getElementById('chatTitleInput'),
      updateChatTitleEditorVisibility: vi.fn(),
    },
  };
}

describe('shell-events', () => {
  test('hashchange respects ignoreNextHashChange before routing', () => {
    const harness = createHarness();
    bindShellEvents(harness.deps);

    harness.appState.ignoreNextHashChange = true;
    harness.dom.window.dispatchEvent(new harness.dom.window.HashChangeEvent('hashchange'));
    expect(harness.deps.applyRouteFromHash).not.toHaveBeenCalled();
    expect(harness.appState.ignoreNextHashChange).toBe(false);

    harness.dom.window.dispatchEvent(new harness.dom.window.HashChangeEvent('hashchange'));
    expect(harness.deps.applyRouteFromHash).toHaveBeenCalledTimes(1);
  });

  test('keyboard shortcuts modal hidden restores trigger focus', () => {
    const harness = createHarness();
    bindShellEvents(harness.deps);

    harness.appState.lastKeyboardShortcutsTrigger = harness.elements.openKeyboardShortcutsButton;
    harness.elements.keyboardShortcutsModal.dispatchEvent(
      new harness.dom.window.Event('hidden.bs.modal'),
    );

    expect(harness.document.activeElement).toBe(harness.elements.openKeyboardShortcutsButton);
    expect(harness.appState.lastKeyboardShortcutsTrigger).toBe(null);
  });

  test('chat title input delegates enter and escape actions', () => {
    const harness = createHarness();
    bindShellEvents(harness.deps);

    harness.elements.chatTitleInput.dispatchEvent(
      new harness.dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    harness.elements.chatTitleInput.dispatchEvent(
      new harness.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );

    expect(harness.deps.saveChatTitleEdit).toHaveBeenCalledTimes(1);
    expect(harness.deps.cancelChatTitleEdit).toHaveBeenCalledTimes(1);
  });
});
