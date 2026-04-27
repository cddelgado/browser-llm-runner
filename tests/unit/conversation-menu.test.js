import { describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  createConversationMenuController,
  findConversationMenuButton,
} from '../../src/app/conversation-menu.js';

function createHarness() {
  const dom = new JSDOM(
    `
      <ul id="conversationList">
        <li class="conversation-item menu-open" data-conversation-id="conversation-1">
          <button class="conversation-menu-toggle" aria-expanded="true"></button>
          <div class="conversation-menu">
            <button class="conversation-menu-item conversation-edit-name"></button>
            <button class="conversation-menu-item conversation-edit-prompt"></button>
            <div class="conversation-submenu-wrap">
              <button class="conversation-menu-item conversation-download-toggle" aria-expanded="true"></button>
              <div class="conversation-submenu">
                <button class="conversation-submenu-item conversation-download-json"></button>
                <button class="conversation-submenu-item conversation-download-markdown"></button>
              </div>
            </div>
          </div>
        </li>
        <li class="conversation-item" data-conversation-id="conversation-2">
          <button class="conversation-menu-toggle" aria-expanded="false"></button>
          <div class="conversation-menu d-none">
            <button class="conversation-menu-item conversation-edit-name"></button>
            <div class="conversation-submenu-wrap">
              <button class="conversation-menu-item conversation-download-toggle" aria-expanded="false"></button>
              <div class="conversation-submenu d-none">
                <button class="conversation-submenu-item conversation-download-json"></button>
                <button class="conversation-submenu-item conversation-download-markdown"></button>
              </div>
            </div>
          </div>
        </li>
      </ul>
    `,
    { url: 'https://example.test/', pretendToBeVisual: true }
  );
  const document = dom.window.document;
  const appState = {
    activeConversationId: 'conversation-1',
  };
  const setActiveConversationById = vi.fn((conversationId) => {
    appState.activeConversationId = conversationId;
  });
  const isUiBusy = vi.fn(() => false);
  const deriveConversationMenuCapabilities = vi.fn((conversation) => ({
    canEditName: true,
    canEditPrompt: conversation?.conversationType !== 'agent',
    canDownload: Boolean(conversation?.hasMessages),
  }));
  const conversationList = document.getElementById('conversationList');
  const controller = createConversationMenuController({
    appState,
    conversationList,
    isUiBusy,
    setActiveConversationById,
    deriveConversationMenuCapabilities,
  });

  return {
    appState,
    controller,
    deriveConversationMenuCapabilities,
    document,
    dom,
    isUiBusy,
    list: conversationList,
    setActiveConversationById,
  };
}

describe('conversation-menu', () => {
  test('closes open menus, submenus, and restores focus when requested', () => {
    const harness = createHarness();
    const toggle = harness.document.querySelector(
      '[data-conversation-id="conversation-1"] .conversation-menu-toggle'
    );

    harness.controller.closeConversationMenus({ restoreFocusTo: toggle });

    expect(harness.document.querySelector('.conversation-item.menu-open')).toBeNull();
    expect(
      harness.document
        .querySelector('[data-conversation-id="conversation-1"] .conversation-menu')
        ?.classList.contains('d-none')
    ).toBe(true);
    expect(
      harness.document
        .querySelector('[data-conversation-id="conversation-1"] .conversation-submenu')
        ?.classList.contains('d-none')
    ).toBe(true);
    expect(
      harness.document
        .querySelector('[data-conversation-id="conversation-1"] .conversation-menu-toggle')
        ?.getAttribute('aria-expanded')
    ).toBe('false');
    expect(
      harness.document
        .querySelector('[data-conversation-id="conversation-1"] .conversation-download-toggle')
        ?.getAttribute('aria-expanded')
    ).toBe('false');
    expect(harness.document.activeElement).toBe(toggle);
  });

  test('opens one conversation menu at a time and closes an already open menu', () => {
    const harness = createHarness();
    const secondItem = harness.document.querySelector('[data-conversation-id="conversation-2"]');
    const secondToggle = harness.document.querySelector(
      '[data-conversation-id="conversation-2"] .conversation-menu-toggle'
    );

    expect(harness.controller.openConversationMenu(secondItem, secondToggle)).toBe(true);

    expect(
      harness.document
        .querySelector('[data-conversation-id="conversation-1"]')
        ?.classList.contains('menu-open')
    ).toBe(false);
    expect(secondItem?.classList.contains('menu-open')).toBe(true);
    expect(
      harness.document
        .querySelector('[data-conversation-id="conversation-2"] .conversation-menu')
        ?.classList.contains('d-none')
    ).toBe(false);
    expect(secondToggle?.getAttribute('aria-expanded')).toBe('true');

    expect(harness.controller.openConversationMenu(secondItem, secondToggle)).toBe(false);

    expect(secondItem?.classList.contains('menu-open')).toBe(false);
    expect(secondToggle?.getAttribute('aria-expanded')).toBe('false');
  });

  test('toggles the nested download menu and aria state', () => {
    const harness = createHarness();
    const secondItem = harness.document.querySelector('[data-conversation-id="conversation-2"]');
    const downloadToggle = harness.document.querySelector(
      '[data-conversation-id="conversation-2"] .conversation-download-toggle'
    );
    const submenu = harness.document.querySelector(
      '[data-conversation-id="conversation-2"] .conversation-submenu'
    );

    expect(harness.controller.toggleConversationDownloadMenu(secondItem, downloadToggle)).toBe(
      true
    );
    expect(submenu?.classList.contains('d-none')).toBe(false);
    expect(downloadToggle?.getAttribute('aria-expanded')).toBe('true');

    expect(harness.controller.toggleConversationDownloadMenu(secondItem, downloadToggle)).toBe(
      false
    );
    expect(submenu?.classList.contains('d-none')).toBe(true);
    expect(downloadToggle?.getAttribute('aria-expanded')).toBe('false');
  });

  test('derives menu state with the current busy flag', () => {
    const harness = createHarness();
    harness.isUiBusy.mockReturnValue(true);

    expect(
      harness.controller.getConversationMenuState({
        id: 'conversation-2',
        conversationType: 'agent',
        hasMessages: true,
      })
    ).toEqual({
      canEditName: true,
      canEditPrompt: false,
      canDownload: true,
      controlsDisabled: true,
    });
    expect(harness.deriveConversationMenuCapabilities).toHaveBeenCalledWith({
      id: 'conversation-2',
      conversationType: 'agent',
      hasMessages: true,
    });
  });

  test('runs menu actions against the selected conversation and resolves the refreshed trigger', () => {
    const harness = createHarness();
    const actionButton = harness.document.querySelector(
      '[data-conversation-id="conversation-2"] .conversation-edit-name'
    );
    const callback = vi.fn();

    expect(
      harness.controller.runConversationMenuAction('conversation-2', actionButton, callback)
    ).toBe(true);

    expect(harness.setActiveConversationById).toHaveBeenCalledWith('conversation-2');
    expect(harness.document.querySelector('.conversation-item.menu-open')).toBeNull();
    expect(callback).toHaveBeenCalledWith(actionButton);
  });

  test('finds menu buttons by conversation id and selector', () => {
    const harness = createHarness();

    expect(
      findConversationMenuButton(harness.list, 'conversation-1', '.conversation-download-markdown')
    ).toBe(
      harness.document.querySelector(
        '[data-conversation-id="conversation-1"] .conversation-download-markdown'
      )
    );
    expect(
      harness.controller.findConversationMenuButton('missing', '.conversation-download-markdown')
    ).toBeNull();
  });
});
