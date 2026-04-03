import { describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { createAppState, getCurrentViewRoute } from '../../src/state/app-state.js';
import { createRoutingShell } from '../../src/app/routing-shell.js';

function createRoutingHarness() {
  const dom = new JSDOM(`
    <div id="settingsPage"></div>
    <div id="homePanel"></div>
    <div id="preChatPanel"></div>
    <div id="topBar"><button data-bs-target="#conversationPanel"></button></div>
    <div id="conversationPanel"></div>
    <div id="chatTranscriptWrap"></div>
    <form class="composer"></form>
    <div class="chat-main"></div>
    <button id="openSettingsButton"></button>
    <div id="settingsTabs">
      <button data-settings-tab="system"></button>
      <button data-settings-tab="conversation"></button>
    </div>
    <div data-settings-tab-panel="system"></div>
    <div data-settings-tab-panel="conversation"></div>
  `, {
    url: 'https://example.test/#/',
  });
  const document = dom.window.document;
  globalThis.document = document;
  globalThis.window = dom.window;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.HTMLButtonElement = dom.window.HTMLButtonElement;
  const appState = createAppState({ activeGenerationConfig: {} });

  return {
    appState,
    window: dom.window,
    document,
    shell: createRoutingShell({
      appState,
      routeHome: 'home',
      routeChat: 'chat',
      routeSettings: 'settings',
      windowRef: dom.window,
      buildHash: vi.fn((route, { appState }) => {
        if (route === 'settings') {
          return '#/chat/settings';
        }
        if (route === 'chat' && appState.isConversationSystemPromptModalOpen) {
          return '#/chat/conversation-2/system-prompt';
        }
        if (route === 'chat' && appState.activeConversationId) {
          return `#/chat/${appState.activeConversationId}`;
        }
        return route === 'chat' ? '#/chat' : '#/';
      }),
      selectCurrentViewRoute: getCurrentViewRoute,
      setRegionVisibility(region, visible) {
        region.classList.toggle('d-none', !visible);
      },
      settingsPage: document.getElementById('settingsPage'),
      homePanel: document.getElementById('homePanel'),
      preChatPanel: document.getElementById('preChatPanel'),
      topBar: document.getElementById('topBar'),
      conversationPanel: document.getElementById('conversationPanel'),
      chatTranscriptWrap: document.getElementById('chatTranscriptWrap'),
      chatForm: document.querySelector('.composer'),
      chatMain: document.querySelector('.chat-main'),
      openSettingsButton: document.getElementById('openSettingsButton'),
      settingsTabButtons: document.querySelectorAll('[data-settings-tab]'),
      settingsTabPanels: document.querySelectorAll('[data-settings-tab-panel]'),
      updateComposerVisibility: vi.fn(),
      updateChatTitleEditorVisibility: vi.fn(),
      updateTranscriptNavigationButtonVisibility: vi.fn(),
      updateActionButtons: vi.fn(),
      updatePreChatStatusHint: vi.fn(),
      updatePreChatActionButtons: vi.fn(),
      playEntranceAnimation: vi.fn(),
    }),
  };
}

describe('routing-shell', () => {
  test('applies settings route from hash and opens the settings page', () => {
    const harness = createRoutingHarness();

    harness.window.location.hash = '#/settings';
    harness.shell.applyRouteFromHash();

    expect(harness.appState.isSettingsPageOpen).toBe(true);
    expect(harness.document.getElementById('settingsPage')?.classList.contains('d-none')).toBe(
      false,
    );
    expect(
      harness.document.getElementById('openSettingsButton')?.getAttribute('aria-expanded'),
    ).toBe('true');
  });

  test('treats nested chat settings hashes as the settings route', () => {
    const harness = createRoutingHarness();

    harness.window.location.hash = '#/chat/settings';
    harness.shell.applyRouteFromHash();

    expect(harness.appState.isSettingsPageOpen).toBe(true);
  });

  test('activates settings tabs and updates panel visibility', () => {
    const harness = createRoutingHarness();

    harness.shell.setActiveSettingsTab('conversation');

    expect(harness.appState.activeSettingsTab).toBe('conversation');
    expect(
      harness.document.querySelector('[data-settings-tab="conversation"]')?.getAttribute('aria-selected'),
    ).toBe('true');
    expect(
      harness.document
        .querySelector('[data-settings-tab-panel="conversation"]')
        ?.classList.contains('d-none'),
    ).toBe(false);
    expect(
      harness.document
        .querySelector('[data-settings-tab-panel="system"]')
        ?.classList.contains('d-none'),
    ).toBe(true);
  });

  test('builds nested chat hashes from current state when syncing routes', () => {
    const harness = createRoutingHarness();

    harness.appState.hasStartedChatWorkspace = true;
    harness.appState.activeConversationId = 'conversation-2';
    harness.shell.syncRouteToCurrentView({ replace: true });
    expect(harness.window.location.hash).toBe('#/chat/conversation-2');

    harness.appState.isConversationSystemPromptModalOpen = true;
    harness.shell.syncRouteToCurrentView({ replace: true });
    expect(harness.window.location.hash).toBe('#/chat/conversation-2/system-prompt');
  });
});
