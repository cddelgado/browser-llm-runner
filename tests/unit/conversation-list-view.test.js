import { describe, expect, test } from 'vitest';
import { JSDOM } from 'jsdom';
import { renderConversationListView } from '../../src/ui/conversation-list-view.js';

describe('conversation-list-view', () => {
  test('renders conversation items with active and delete controls', () => {
    const dom = new JSDOM('<ul id="conversationList"></ul>');
    const container = dom.window.document.getElementById('conversationList');

    renderConversationListView({
      container,
      conversations: [
        { id: 'conversation-1', name: 'First' },
        { id: 'conversation-2', name: 'Second' },
      ],
      activeConversationId: 'conversation-2',
      setIconButtonContent: (button, iconClass, label) => {
        button.innerHTML = `<i class="${iconClass}"></i><span>${label}</span>`;
      },
    });

    expect(container.children).toHaveLength(2);
    expect(container.querySelector('[data-conversation-id="conversation-2"]')).not.toBeNull();
    expect(container.querySelector('.conversation-item.is-active .conversation-select')?.getAttribute('aria-current')).toBe('page');
    expect(container.querySelector('.conversation-delete')?.getAttribute('aria-label')).toBe(
      'Delete First conversation',
    );
  });
});
