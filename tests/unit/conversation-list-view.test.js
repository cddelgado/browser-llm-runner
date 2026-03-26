import { describe, expect, test } from 'vitest';
import { JSDOM } from 'jsdom';
import { renderConversationListView } from '../../src/ui/conversation-list-view.js';

describe('conversation-list-view', () => {
  test('renders conversation items with active kebab actions and nested download choices', () => {
    const dom = new JSDOM('<ul id="conversationList"></ul>');
    const container = dom.window.document.getElementById('conversationList');

    renderConversationListView({
      container,
      conversations: [
        { id: 'conversation-1', name: 'First' },
        { id: 'conversation-2', name: 'Second' },
      ],
      activeConversationId: 'conversation-2',
      getConversationMenuState: (conversation) => ({
        canEditName: conversation.id === 'conversation-2',
        canEditPrompt: true,
        canDownload: conversation.id === 'conversation-2',
        controlsDisabled: false,
      }),
      setIconButtonContent: (button, iconClass, label) => {
        button.innerHTML = `<i class="${iconClass}"></i><span>${label}</span>`;
      },
    });

    expect(container.children).toHaveLength(2);
    expect(container.querySelector('[data-conversation-id="conversation-2"]')).not.toBeNull();
    expect(
      container
        .querySelector('.conversation-item.is-active .conversation-select')
        ?.getAttribute('aria-current'),
    ).toBe('page');
    expect(
      container.querySelector('.conversation-menu-toggle')?.getAttribute('aria-label'),
    ).toBe('Conversation options for First');
    expect(
      container
        .querySelector('[data-conversation-id="conversation-1"] .conversation-edit-name')
        ?.hasAttribute('disabled'),
    ).toBe(true);
    expect(
      container
        .querySelector('[data-conversation-id="conversation-2"] .conversation-download-markdown')
        ?.textContent,
    ).toBe('Markdown');
    expect(
      container
        .querySelector('[data-conversation-id="conversation-2"] .conversation-download-json')
        ?.getAttribute('aria-keyshortcuts'),
    ).toBe('Alt+Shift+J');
    expect(
      container.querySelector('[data-conversation-id="conversation-2"] .conversation-delete')
        ?.textContent,
    ).toBe('Delete');
  });
});
