import { describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { createConversationEditors } from '../../src/app/conversation-editors.js';

function createHarness() {
  const dom = new JSDOM(
    `
      <div>
        <h1 id="chatTitle"></h1>
        <input id="chatTitleInput" class="d-none" />
        <button id="saveChatTitleBtn" class="d-none"></button>
        <button id="cancelChatTitleBtn" class="d-none"></button>
        <div id="conversationSystemPromptModal"></div>
        <textarea id="conversationSystemPromptInput"></textarea>
        <input id="conversationSystemPromptAppendToggle" type="checkbox" />
      </div>
    `,
    { url: 'https://example.test/' },
  );
  const document = dom.window.document;
  globalThis.document = document;
  globalThis.window = dom.window;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.HTMLButtonElement = dom.window.HTMLButtonElement;
  globalThis.HTMLInputElement = dom.window.HTMLInputElement;
  globalThis.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;

  const activeConversation = {
    id: 'conversation-1',
    name: 'Generated title',
    hasGeneratedName: true,
    conversationSystemPrompt: '  Be concise.  ',
    appendConversationSystemPrompt: true,
  };
  const appState = {
    isChatTitleEditing: false,
    lastConversationTitleTrigger: null,
    lastConversationSystemPromptTrigger: null,
    pendingConversationSystemPrompt: '  Draft prompt.  ',
    pendingAppendConversationSystemPrompt: false,
    conversationSystemPromptModalInstance: {
      show: vi.fn(),
      hide: vi.fn(),
    },
  };

  return {
    dom,
    document,
    appState,
    activeConversation,
    elements: {
      chatTitle: document.getElementById('chatTitle'),
      chatTitleInput: document.getElementById('chatTitleInput'),
      saveChatTitleBtn: document.getElementById('saveChatTitleBtn'),
      cancelChatTitleBtn: document.getElementById('cancelChatTitleBtn'),
      conversationSystemPromptInput: document.getElementById('conversationSystemPromptInput'),
      conversationSystemPromptAppendToggle: document.getElementById(
        'conversationSystemPromptAppendToggle',
      ),
    },
    deps: {
      appState,
      conversationSystemPromptModal: document.getElementById('conversationSystemPromptModal'),
      conversationSystemPromptInput: document.getElementById('conversationSystemPromptInput'),
      conversationSystemPromptAppendToggle: document.getElementById(
        'conversationSystemPromptAppendToggle',
      ),
      chatTitle: document.getElementById('chatTitle'),
      chatTitleInput: document.getElementById('chatTitleInput'),
      saveChatTitleBtn: document.getElementById('saveChatTitleBtn'),
      cancelChatTitleBtn: document.getElementById('cancelChatTitleBtn'),
      getActiveConversation: vi.fn(() => activeConversation),
      getConversationMenuState: vi.fn(() => ({ canEditName: true })),
      isUiBusy: vi.fn(() => false),
      isChatTitleEditingState: vi.fn((state) => Boolean(state.isChatTitleEditing)),
      setChatTitleEditing: vi.fn((state, value) => {
        state.isChatTitleEditing = value;
      }),
      normalizeSystemPrompt: vi.fn((value) => String(value || '').trim()),
      normalizeConversationPromptMode: vi.fn((value) => value !== false),
      queueConversationStateSave: vi.fn(),
      setStatus: vi.fn(),
      renderConversationList: vi.fn(),
      updateChatTitle: vi.fn(),
      normalizeConversationName: vi.fn((value) => String(value || '').trim()),
      createConversationSystemPromptModalInstance: vi.fn(
        () => appState.conversationSystemPromptModalInstance,
      ),
    },
  };
}

describe('conversation-editors', () => {
  test('shows the chat title editor for generated titles', () => {
    const harness = createHarness();
    const editors = createConversationEditors(harness.deps);

    editors.beginChatTitleEdit();

    expect(harness.appState.isChatTitleEditing).toBe(true);
    expect(harness.elements.chatTitle.classList.contains('d-none')).toBe(true);
    expect(harness.elements.chatTitleInput.classList.contains('d-none')).toBe(false);
    expect(harness.elements.chatTitleInput.value).toBe('Generated title');
  });

  test('saves the conversation system prompt and hides the modal', () => {
    const harness = createHarness();
    const editors = createConversationEditors(harness.deps);
    harness.elements.conversationSystemPromptInput.value = '  New prompt  ';
    harness.elements.conversationSystemPromptAppendToggle.checked = false;

    editors.saveConversationSystemPromptEdit();

    expect(harness.activeConversation.conversationSystemPrompt).toBe('New prompt');
    expect(harness.activeConversation.appendConversationSystemPrompt).toBe(false);
    expect(harness.deps.queueConversationStateSave).toHaveBeenCalledTimes(1);
    expect(harness.deps.setStatus).toHaveBeenCalledWith('Conversation system prompt saved.');
    expect(harness.appState.conversationSystemPromptModalInstance.hide).toHaveBeenCalledTimes(1);
  });

  test('edits the pre-chat draft system prompt when no conversation exists yet', () => {
    const harness = createHarness();
    harness.deps.getActiveConversation.mockReturnValue(null);
    const editors = createConversationEditors(harness.deps);

    editors.beginConversationSystemPromptEdit();
    expect(harness.elements.conversationSystemPromptInput.value).toBe('Draft prompt.');
    expect(harness.elements.conversationSystemPromptAppendToggle.checked).toBe(false);

    harness.elements.conversationSystemPromptInput.value = '  Fresh chat context  ';
    harness.elements.conversationSystemPromptAppendToggle.checked = true;
    editors.saveConversationSystemPromptEdit();

    expect(harness.appState.pendingConversationSystemPrompt).toBe('Fresh chat context');
    expect(harness.appState.pendingAppendConversationSystemPrompt).toBe(true);
    expect(harness.deps.queueConversationStateSave).not.toHaveBeenCalled();
    expect(harness.deps.setStatus).toHaveBeenCalledWith('Conversation system prompt saved.');
  });
});
