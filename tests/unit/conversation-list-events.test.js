import { describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { bindConversationListEvents } from '../../src/app/conversation-list-events.js';

function createHarness() {
  const dom = new JSDOM(
    `
      <div>
        <ul id="conversationList">
          <li class="conversation-item menu-open" data-conversation-id="conversation-1">
            <button class="conversation-menu-toggle" aria-expanded="true"></button>
            <div class="conversation-menu">
              <button class="conversation-delete"></button>
            </div>
            <button class="conversation-select"></button>
          </li>
          <li class="conversation-item" data-conversation-id="conversation-2">
            <button class="conversation-menu-toggle" aria-expanded="false"></button>
            <div class="conversation-menu d-none"></div>
            <button class="conversation-select"></button>
          </li>
        </ul>
        <button id="outside"></button>
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
  const appState = {
    conversations: [{ id: 'conversation-1' }, { id: 'conversation-2' }],
    activeConversationId: 'conversation-1',
  };
  const closeConversationMenus = vi.fn(({ restoreFocusTo } = {}) => {
    if (restoreFocusTo instanceof dom.window.HTMLElement) {
      restoreFocusTo.focus();
    }
  });

  return {
    dom,
    document,
    appState,
    conversationList: document.getElementById('conversationList'),
    closeConversationMenus,
    deps: {
      appState,
      documentRef: document,
      conversationList: document.getElementById('conversationList'),
      isGeneratingResponse: () => false,
      deleteConversationStorage: vi.fn(() => Promise.resolve()),
      clearUserMessageEditSession: vi.fn(),
      setChatTitleEditing: vi.fn(),
      getActiveConversation: vi.fn(() => ({ id: 'conversation-2' })),
      syncConversationModelSelection: vi.fn(() => ({ selectedModelId: 'model-1' })),
      activeConversationNeedsModelLoad: vi.fn(() => false),
      loadModelForSelectedConversation: vi.fn(),
      renderConversationList: vi.fn(),
      renderTranscript: vi.fn(),
      updateChatTitle: vi.fn(),
      queueConversationStateSave: vi.fn(),
      openConversationMenu: vi.fn(),
      toggleConversationDownloadMenu: vi.fn(),
      closeConversationMenus,
      runConversationMenuAction: vi.fn(),
      beginChatTitleEdit: vi.fn(),
      beginConversationSystemPromptEdit: vi.fn(),
      downloadActiveConversationBranchAsJson: vi.fn(),
      downloadActiveConversationBranchAsMarkdown: vi.fn(),
      setActiveConversationById: vi.fn(),
    },
  };
}

describe('conversation-list-events', () => {
  test('deletes the active conversation, clears storage, and refreshes the sidebar state', async () => {
    const harness = createHarness();
    bindConversationListEvents(harness.deps);

    harness.document.querySelector('.conversation-delete')?.dispatchEvent(
      new harness.dom.window.MouseEvent('click', { bubbles: true }),
    );
    await new Promise((resolve) => harness.dom.window.setTimeout(resolve, 0));

    expect(harness.appState.conversations).toEqual([{ id: 'conversation-2' }]);
    expect(harness.appState.activeConversationId).toBe('conversation-2');
    expect(harness.deps.deleteConversationStorage).toHaveBeenCalledWith('conversation-1');
    expect(harness.deps.clearUserMessageEditSession).toHaveBeenCalled();
    expect(harness.deps.setChatTitleEditing).toHaveBeenCalledWith(harness.appState, false);
    expect(harness.deps.renderConversationList).toHaveBeenCalled();
    expect(harness.deps.renderTranscript).toHaveBeenCalled();
    expect(harness.deps.updateChatTitle).toHaveBeenCalled();
    expect(harness.deps.queueConversationStateSave).toHaveBeenCalled();
  });

  test('closes open menus on outside click and escape', () => {
    const harness = createHarness();
    bindConversationListEvents(harness.deps);

    harness.document.getElementById('outside')?.dispatchEvent(
      new harness.dom.window.MouseEvent('click', { bubbles: true }),
    );
    expect(harness.closeConversationMenus).toHaveBeenCalledTimes(1);

    const toggle = harness.document.querySelector('.conversation-menu-toggle');
    toggle?.dispatchEvent(
      new harness.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(harness.closeConversationMenus).toHaveBeenCalledTimes(2);
  });
});
