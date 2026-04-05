import { describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { createWorkspaceSidePanelsController } from '../../src/app/workspace-side-panels.js';

function createHarness({
  activeConversation = { id: 'conversation-1', activeLeafMessageId: 'leaf-1' },
  conversationsById = new Map(),
  pathMessagesByConversationId = new Map(),
} = {}) {
  const dom = new JSDOM(`
    <body>
      <div id="terminalPanel"></div>
      <div id="terminalHost"></div>
      <div id="webLookupPanel"></div>
      <iframe id="webLookupFrame"></iframe>
      <h2 id="webLookupPanelTitle"></h2>
      <p id="webLookupPanelDescription"></p>
    </body>
  `);
  const document = dom.window.document;
  globalThis.document = document;
  globalThis.window = dom.window;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.HTMLIFrameElement = dom.window.HTMLIFrameElement;

  const browserView = {
    renderSession: vi.fn(),
    setVisible: vi.fn(),
  };
  const terminalView = {
    dispose: vi.fn(),
    renderSession: vi.fn(),
    setVisible: vi.fn(),
  };

  const appState = {
    pendingShellCommand: null,
    completedShellCommand: null,
    terminalOpenConversationId: null,
    terminalDismissedConversationIds: new Set(),
    webLookupPanelsByConversationId: new Map(),
    activeWorkspaceSidePanel: null,
  };

  const getConversationPathMessages = vi.fn(
    (conversation) => pathMessagesByConversationId.get(conversation?.id) || []
  );
  const findConversationById = vi.fn((conversationId) => conversationsById.get(conversationId) || null);
  const isSettingsView = vi.fn(() => false);
  const isTerminalOpenForConversation = vi.fn(
    (state, conversationId) => state.terminalOpenConversationId === conversationId
  );
  const hasDismissedTerminalForConversation = vi.fn(
    (state, conversationId) => state.terminalDismissedConversationIds.has(conversationId)
  );
  const openTerminalForConversation = vi.fn((state, conversationId) => {
    state.terminalOpenConversationId = conversationId;
    state.terminalDismissedConversationIds.delete(conversationId);
  });
  const closeTerminal = vi.fn((state, { conversationId = null, dismissed = false } = {}) => {
    if (dismissed && conversationId) {
      state.terminalDismissedConversationIds.add(conversationId);
    }
    if (!conversationId || state.terminalOpenConversationId === conversationId) {
      state.terminalOpenConversationId = null;
    }
  });
  const clearTerminalDismissal = vi.fn((state, conversationId) =>
    state.terminalDismissedConversationIds.delete(conversationId)
  );
  const appendDebug = vi.fn();
  const loadTerminalView = vi.fn(async () => ({
    createTerminalView: () => terminalView,
  }));
  const createBrowserViewRef = vi.fn(() => browserView);

  return {
    appState,
    browserView,
    terminalView,
    getConversationPathMessages,
    findConversationById,
    isSettingsView,
    isTerminalOpenForConversation,
    hasDismissedTerminalForConversation,
    openTerminalForConversation,
    closeTerminal,
    clearTerminalDismissal,
    appendDebug,
    loadTerminalView,
    createBrowserViewRef,
    controller: createWorkspaceSidePanelsController({
      appState,
      documentRef: document,
      windowRef: {
        requestAnimationFrame(callback) {
          callback(0);
          return 1;
        },
      },
      terminalPanel: document.getElementById('terminalPanel'),
      terminalHost: document.getElementById('terminalHost'),
      webLookupPanel: document.getElementById('webLookupPanel'),
      webLookupFrame: document.getElementById('webLookupFrame'),
      webLookupPanelTitle: document.getElementById('webLookupPanelTitle'),
      webLookupPanelDescription: document.getElementById('webLookupPanelDescription'),
      getActiveConversation: vi.fn(() => activeConversation),
      getConversationPathMessages,
      findConversationById,
      isSettingsView,
      isTerminalOpenForConversation,
      hasDismissedTerminalForConversation,
      openTerminalForConversation,
      closeTerminal,
      clearTerminalDismissal,
      appendDebug,
      loadTerminalView,
      createBrowserViewRef,
    }),
  };
}

describe('workspace-side-panels', () => {
  test('uses the pending shell command conversation id when computing completion history', () => {
    const targetConversation = {
      id: 'conversation-2',
      activeLeafMessageId: 'leaf-2',
      currentWorkingDirectory: '/workspace',
    };
    const harness = createHarness({
      activeConversation: { id: 'conversation-1', activeLeafMessageId: 'leaf-1' },
      conversationsById: new Map([['conversation-2', targetConversation]]),
      pathMessagesByConversationId: new Map([
        [
          'conversation-2',
          [
            {
              role: 'tool',
              toolName: 'run_shell_command',
              toolArguments: { cmd: 'pwd' },
              toolResultData: {
                command: 'pwd',
                currentWorkingDirectory: '/workspace',
                exitCode: 0,
                stdout: '/workspace',
                stderr: '',
              },
            },
          ],
        ],
      ]),
    });
    harness.appState.pendingShellCommand = {
      command: 'ls',
      conversationId: 'conversation-2',
      currentWorkingDirectory: '/workspace',
      historyCount: 1,
    };

    harness.controller.handleShellCommandComplete({
      command: 'ls',
      currentWorkingDirectory: '/workspace',
      stdout: 'notes.md',
    });

    expect(harness.findConversationById).toHaveBeenCalledWith('conversation-2');
    expect(harness.appState.completedShellCommand).toMatchObject({
      command: 'ls',
      conversationId: 'conversation-2',
      historyCount: 1,
      stdout: 'notes.md',
    });
  });

  test('opens and updates the web lookup side panel session', async () => {
    const activeConversation = { id: 'conversation-1', activeLeafMessageId: 'leaf-1' };
    const harness = createHarness({
      activeConversation,
      conversationsById: new Map([[activeConversation.id, activeConversation]]),
    });

    await harness.controller.handleWebLookupSearchStart({
      query: 'duckduckgo bangs',
      panelUrl: 'https://duckduckgo.com/html/?q=duckduckgo+bangs',
    });

    expect(harness.appState.activeWorkspaceSidePanel).toBe('web_lookup');
    expect(harness.appState.webLookupPanelsByConversationId.get(activeConversation.id)).toMatchObject({
      heading: 'DuckDuckGo search',
      query: 'duckduckgo bangs',
      searchUrl: 'https://duckduckgo.com/html/?q=duckduckgo+bangs',
    });

    harness.controller.handleWebLookupSearchComplete({
      query: 'duckduckgo bangs',
      resultCount: 3,
    });

    expect(harness.appState.webLookupPanelsByConversationId.get(activeConversation.id)?.description).toBe(
      'The lightweight DuckDuckGo results view is open for "duckduckgo bangs". 3 results extracted in-app.'
    );
    expect(harness.browserView.setVisible).toHaveBeenCalledWith(true);
    expect(harness.browserView.renderSession).toHaveBeenCalled();
  });

  test('dismisses the terminal panel for the active conversation', () => {
    const activeConversation = { id: 'conversation-1', activeLeafMessageId: 'leaf-1' };
    const harness = createHarness({
      activeConversation,
      conversationsById: new Map([[activeConversation.id, activeConversation]]),
    });
    harness.appState.terminalOpenConversationId = activeConversation.id;
    harness.appState.activeWorkspaceSidePanel = 'terminal';

    harness.controller.handleCloseTerminalPanel();

    expect(harness.appState.terminalOpenConversationId).toBeNull();
    expect(harness.appState.terminalDismissedConversationIds.has(activeConversation.id)).toBe(true);
    expect(harness.appState.activeWorkspaceSidePanel).toBeNull();
  });
});
