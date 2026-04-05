import { createBrowserView } from '../ui/browser-view.js';

/**
 * @param {{
 *   appState: any;
 *   documentRef?: Document;
 *   windowRef?: { requestAnimationFrame: (callback: FrameRequestCallback) => number };
 *   terminalPanel?: HTMLElement | null;
 *   terminalHost?: HTMLElement | null;
 *   webLookupPanel?: HTMLElement | null;
 *   webLookupFrame?: HTMLIFrameElement | null;
 *   webLookupPanelTitle?: HTMLElement | null;
 *   webLookupPanelDescription?: HTMLElement | null;
 *   getActiveConversation: () => any;
 *   getConversationPathMessages: (conversation: any) => any[];
 *   findConversationById: (conversationId: string) => any;
 *   isSettingsView: (state: any) => boolean;
 *   isTerminalOpenForConversation: (state: any, conversationId: string) => boolean;
 *   hasDismissedTerminalForConversation: (state: any, conversationId: string) => boolean;
 *   openTerminalForConversation: (state: any, conversationId: string) => any;
 *   closeTerminal: (state: any, options?: { conversationId?: string | null; dismissed?: boolean }) => any;
 *   clearTerminalDismissal: (state: any, conversationId: string) => any;
 *   appendDebug?: (message: string) => void;
 *   loadTerminalView?: () => Promise<{
 *     createTerminalView: (options?: any) => {
 *       dispose?: () => void;
 *       renderSession: (session?: any) => void;
 *       setVisible: (visible: any) => void;
 *     };
 *   }>;
 *   createBrowserViewRef?: (options?: any) => {
 *     renderSession: (session?: any) => void;
 *     setVisible: (visible: any) => void;
 *   };
 * }} options
 */
export function createWorkspaceSidePanelsController({
  appState,
  documentRef = document,
  windowRef = window,
  terminalPanel,
  terminalHost,
  webLookupPanel,
  webLookupFrame,
  webLookupPanelTitle,
  webLookupPanelDescription,
  getActiveConversation,
  getConversationPathMessages,
  findConversationById,
  isSettingsView,
  isTerminalOpenForConversation,
  hasDismissedTerminalForConversation,
  openTerminalForConversation,
  closeTerminal,
  clearTerminalDismissal,
  appendDebug = (_message) => {},
  loadTerminalView = () => import('../ui/terminal-view.js'),
  createBrowserViewRef = createBrowserView,
}) {
  let terminalView = null;
  let terminalViewLoadPromise = null;
  const browserView = createBrowserViewRef({
    panel: webLookupPanel,
    frame: webLookupFrame,
    title: webLookupPanelTitle,
    description: webLookupPanelDescription,
  });

  function parseShellToolResult(message) {
    if (message?.toolResultData && typeof message.toolResultData === 'object') {
      return message.toolResultData;
    }
    const rawResult =
      typeof message?.toolResult === 'string'
        ? message.toolResult
        : typeof message?.text === 'string'
          ? message.text
          : '';
    if (!rawResult.trim()) {
      return null;
    }
    try {
      const parsed = JSON.parse(rawResult);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  function parsePythonWriteToolResult(message) {
    const rawResult =
      typeof message?.toolResult === 'string'
        ? message.toolResult
        : typeof message?.text === 'string'
          ? message.text
          : '';
    if (!rawResult.trim()) {
      return null;
    }
    try {
      const parsed = JSON.parse(rawResult);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  function getShellTerminalEntries(conversation) {
    if (!conversation) {
      return [];
    }
    return getConversationPathMessages(conversation)
      .filter(
        (message) =>
          message?.role === 'tool' &&
          (message.toolName === 'run_shell_command' || message.toolName === 'write_python_file')
      )
      .map((message) => {
        if (message.toolName === 'write_python_file') {
          const result = parsePythonWriteToolResult(message);
          const recordedPath =
            typeof message?.toolArguments?.path === 'string' && message.toolArguments.path.trim()
              ? message.toolArguments.path.trim()
              : typeof result?.path === 'string' && result.path.trim()
                ? result.path.trim()
                : '/workspace/script.py';
          const preview = typeof result?.preview === 'string' ? result.preview : '';
          const lineCount = Number.isFinite(result?.lines) ? Number(result.lines) : 0;
          const byteCount = Number.isFinite(result?.bytes) ? Number(result.bytes) : 0;
          return {
            command: `write_python_file ${recordedPath}`,
            currentWorkingDirectory:
              recordedPath.slice(0, recordedPath.lastIndexOf('/')) || '/workspace',
            exitCode: 0,
            stdout: `${typeof result?.message === 'string' ? result.message : `Python file written to ${recordedPath}.`}\n${lineCount ? `${lineCount} line${lineCount === 1 ? '' : 's'}` : '0 lines'}${byteCount ? `, ${byteCount} bytes` : ''}${preview ? `\n${preview}` : ''}`,
            stderr: '',
          };
        }
        const result = parseShellToolResult(message);
        const recordedCommand =
          typeof message?.toolArguments?.cmd === 'string' && message.toolArguments.cmd.trim()
            ? message.toolArguments.cmd.trim()
            : typeof message?.toolArguments?.command === 'string' &&
                message.toolArguments.command.trim()
              ? message.toolArguments.command.trim()
              : '';
        return {
          command:
            recordedCommand ||
            (typeof result?.command === 'string' && result.command.trim()
              ? result.command.trim()
              : ''),
          currentWorkingDirectory:
            typeof result?.currentWorkingDirectory === 'string' &&
            result.currentWorkingDirectory.trim()
              ? result.currentWorkingDirectory.trim()
              : typeof conversation?.currentWorkingDirectory === 'string' &&
                  conversation.currentWorkingDirectory.trim()
                ? conversation.currentWorkingDirectory.trim()
                : '/workspace',
          exitCode: Number.isFinite(result?.exitCode) ? Number(result.exitCode) : 0,
          stdout: typeof result?.stdout === 'string' ? result.stdout : '',
          stderr: typeof result?.stderr === 'string' ? result.stderr : '',
        };
      })
      .filter((entry) => entry.command);
  }

  function getTerminalSessionForConversation(conversation = getActiveConversation()) {
    const entries = getShellTerminalEntries(conversation);
    const pendingEntry =
      appState.pendingShellCommand &&
      conversation?.id &&
      appState.pendingShellCommand.conversationId === conversation.id
        ? appState.pendingShellCommand
        : null;
    const completedEntry =
      appState.completedShellCommand &&
      conversation?.id &&
      appState.completedShellCommand.conversationId === conversation.id
        ? appState.completedShellCommand
        : null;

    if (pendingEntry && entries.length > pendingEntry.historyCount) {
      appState.pendingShellCommand = null;
      return getTerminalSessionForConversation(conversation);
    }
    if (completedEntry && entries.length > completedEntry.historyCount) {
      appState.completedShellCommand = null;
      return getTerminalSessionForConversation(conversation);
    }

    const visibleEntries =
      completedEntry && completedEntry.command && entries.length === completedEntry.historyCount
        ? entries.concat({
            command: completedEntry.command,
            currentWorkingDirectory: completedEntry.currentWorkingDirectory,
            exitCode: completedEntry.exitCode,
            stdout: completedEntry.stdout,
            stderr: completedEntry.stderr,
          })
        : entries;

    const currentWorkingDirectory =
      typeof pendingEntry?.currentWorkingDirectory === 'string' &&
      pendingEntry.currentWorkingDirectory.trim()
        ? pendingEntry.currentWorkingDirectory.trim()
        : typeof visibleEntries[visibleEntries.length - 1]?.currentWorkingDirectory === 'string' &&
            visibleEntries[visibleEntries.length - 1].currentWorkingDirectory.trim()
          ? visibleEntries[visibleEntries.length - 1].currentWorkingDirectory.trim()
          : typeof conversation?.currentWorkingDirectory === 'string' &&
              conversation.currentWorkingDirectory.trim()
            ? conversation.currentWorkingDirectory.trim()
            : '/workspace';

    return {
      currentWorkingDirectory,
      entries: visibleEntries,
      hasVisibleContent: visibleEntries.length > 0 || Boolean(pendingEntry?.command),
      pendingEntry:
        pendingEntry && typeof pendingEntry.command === 'string' && pendingEntry.command.trim()
          ? {
              command: pendingEntry.command.trim(),
              currentWorkingDirectory,
            }
          : null,
      sessionKey: `${conversation?.id || 'none'}:${conversation?.activeLeafMessageId || 'root'}:${
        visibleEntries.length
      }:${pendingEntry?.command || ''}:${completedEntry?.command || ''}`,
    };
  }

  async function ensureTerminalView() {
    if (terminalView) {
      return terminalView;
    }
    if (!terminalViewLoadPromise) {
      terminalViewLoadPromise = loadTerminalView()
        .then(({ createTerminalView }) => {
          terminalView = createTerminalView({
            panel: terminalPanel,
            host: terminalHost,
          });
          return terminalView;
        })
        .catch((error) => {
          terminalViewLoadPromise = null;
          throw error;
        });
    }
    return terminalViewLoadPromise;
  }

  function getWebLookupPanelSessionForConversation(conversation = getActiveConversation()) {
    if (!(appState.webLookupPanelsByConversationId instanceof Map) || !conversation?.id) {
      return null;
    }
    return appState.webLookupPanelsByConversationId.get(conversation.id) || null;
  }

  function renderWorkspaceSidePanels() {
    const activeConversation = getActiveConversation();
    const webLookupSession = getWebLookupPanelSessionForConversation(activeConversation);
    const shouldShowWebLookupPanel =
      !isSettingsView(appState) &&
      Boolean(activeConversation?.id) &&
      appState.activeWorkspaceSidePanel === 'web_lookup' &&
      webLookupSession &&
      typeof webLookupSession.searchUrl === 'string' &&
      webLookupSession.searchUrl.trim();
    const session = getTerminalSessionForConversation(activeConversation);
    const shouldShowTerminal =
      !shouldShowWebLookupPanel &&
      !isSettingsView(appState) &&
      Boolean(activeConversation?.id) &&
      session.hasVisibleContent &&
      (isTerminalOpenForConversation(appState, activeConversation.id) ||
        (!hasDismissedTerminalForConversation(appState, activeConversation.id) &&
          session.entries.length > 0));

    if (
      activeConversation?.id &&
      session.hasVisibleContent &&
      !hasDismissedTerminalForConversation(appState, activeConversation.id)
    ) {
      openTerminalForConversation(appState, activeConversation.id);
    }

    if (shouldShowWebLookupPanel) {
      documentRef.body.classList.remove('terminal-open');
      documentRef.body.classList.add('web-lookup-open');
      terminalView?.setVisible(false);
      browserView.setVisible(true);
      browserView.renderSession({
        heading: webLookupSession.heading,
        details: webLookupSession.description,
        url: webLookupSession.searchUrl,
      });
      return;
    }

    if (!shouldShowTerminal) {
      if (!session.hasVisibleContent) {
        closeTerminal(appState, { conversationId: activeConversation?.id || null });
      }
      documentRef.body.classList.remove('terminal-open');
      documentRef.body.classList.remove('web-lookup-open');
      terminalView?.setVisible(false);
      browserView.setVisible(false);
      return;
    }

    documentRef.body.classList.remove('web-lookup-open');
    documentRef.body.classList.add('terminal-open');
    browserView.setVisible(false);
    void ensureTerminalView()
      .then((loadedTerminalView) => {
        const latestConversation = getActiveConversation();
        const latestWebLookupSession = getWebLookupPanelSessionForConversation(latestConversation);
        const latestSession = getTerminalSessionForConversation(latestConversation);
        const shouldStillShowTerminal =
          !isSettingsView(appState) &&
          Boolean(latestConversation?.id) &&
          latestSession.hasVisibleContent &&
          !(
            appState.activeWorkspaceSidePanel === 'web_lookup' &&
            latestWebLookupSession &&
            typeof latestWebLookupSession.searchUrl === 'string' &&
            latestWebLookupSession.searchUrl.trim()
          ) &&
          (isTerminalOpenForConversation(appState, latestConversation.id) ||
            (!hasDismissedTerminalForConversation(appState, latestConversation.id) &&
              latestSession.entries.length > 0));
        if (!shouldStillShowTerminal) {
          loadedTerminalView.setVisible(false);
          return;
        }
        loadedTerminalView.setVisible(true);
        loadedTerminalView.renderSession(latestSession);
      })
      .catch((error) => {
        appendDebug(
          `Terminal view failed to load: ${error instanceof Error ? error.message : String(error)}`
        );
        documentRef.body.classList.remove('terminal-open');
        browserView.setVisible(false);
      });
  }

  function handleCloseTerminalPanel() {
    const activeConversation = getActiveConversation();
    closeTerminal(appState, {
      conversationId: activeConversation?.id || null,
      dismissed: true,
    });
    if (appState.activeWorkspaceSidePanel === 'terminal') {
      appState.activeWorkspaceSidePanel = null;
    }
    renderWorkspaceSidePanels();
  }

  function handleCloseWebLookupPanel() {
    const activeConversation = getActiveConversation();
    if (activeConversation?.id && appState.webLookupPanelsByConversationId instanceof Map) {
      appState.webLookupPanelsByConversationId.delete(activeConversation.id);
    }
    if (appState.activeWorkspaceSidePanel === 'web_lookup') {
      appState.activeWorkspaceSidePanel = null;
    }
    renderWorkspaceSidePanels();
  }

  function handleShellCommandStart({ command = '', currentWorkingDirectory = '/workspace' } = {}) {
    const activeConversation = getActiveConversation();
    if (!activeConversation?.id || !String(command || '').trim()) {
      return;
    }
    clearTerminalDismissal(appState, activeConversation.id);
    appState.completedShellCommand = null;
    appState.pendingShellCommand = {
      command: String(command || '').trim(),
      conversationId: activeConversation.id,
      currentWorkingDirectory:
        typeof currentWorkingDirectory === 'string' && currentWorkingDirectory.trim()
          ? currentWorkingDirectory.trim()
          : '/workspace',
      historyCount: getShellTerminalEntries(activeConversation).length,
    };
    openTerminalForConversation(appState, activeConversation.id);
    appState.activeWorkspaceSidePanel = 'terminal';
    renderWorkspaceSidePanels();
  }

  function handleShellCommandComplete({
    command = '',
    currentWorkingDirectory = '/workspace',
    exitCode = 0,
    stdout = '',
    stderr = '',
  } = {}) {
    const activeConversation = getActiveConversation();
    const pendingConversationId =
      typeof appState.pendingShellCommand?.conversationId === 'string'
        ? appState.pendingShellCommand.conversationId
        : activeConversation?.id || null;
    if (!pendingConversationId || !String(command || '').trim()) {
      return;
    }
    const pendingConversation = findConversationById(pendingConversationId);
    appState.completedShellCommand = {
      command: String(command || '').trim(),
      conversationId: pendingConversationId,
      currentWorkingDirectory:
        typeof currentWorkingDirectory === 'string' && currentWorkingDirectory.trim()
          ? currentWorkingDirectory.trim()
          : '/workspace',
      exitCode: Number.isFinite(exitCode) ? Number(exitCode) : 0,
      stdout: typeof stdout === 'string' ? stdout : '',
      stderr: typeof stderr === 'string' ? stderr : '',
      historyCount: pendingConversation ? getShellTerminalEntries(pendingConversation).length : 0,
    };
    appState.activeWorkspaceSidePanel = 'terminal';
    renderWorkspaceSidePanels();
  }

  function handleWebLookupSearchStart({
    conversationId = null,
    query = '',
    panelUrl = '',
    searchUrl = '',
  } = {}) {
    const resolvedConversationId =
      typeof conversationId === 'string' && conversationId.trim()
        ? conversationId.trim()
        : getActiveConversation()?.id || null;
    const resolvedPanelUrl =
      typeof panelUrl === 'string' && panelUrl.trim()
        ? panelUrl.trim()
        : String(searchUrl || '').trim();
    if (!resolvedConversationId || !resolvedPanelUrl) {
      return Promise.resolve();
    }
    if (!(appState.webLookupPanelsByConversationId instanceof Map)) {
      appState.webLookupPanelsByConversationId = new Map();
    }
    appState.webLookupPanelsByConversationId.set(resolvedConversationId, {
      heading: 'DuckDuckGo search',
      description:
        typeof query === 'string' && query.trim()
          ? `Opening the lightweight DuckDuckGo results view for "${query.trim()}" before the in-app search fetch runs.`
          : 'Opening the lightweight DuckDuckGo results view before the in-app search fetch runs.',
      query: typeof query === 'string' ? query.trim() : '',
      searchUrl: resolvedPanelUrl,
    });
    appState.activeWorkspaceSidePanel = 'web_lookup';
    renderWorkspaceSidePanels();
    return new Promise((resolve) => {
      windowRef.requestAnimationFrame(() => resolve());
    });
  }

  function handleWebLookupSearchComplete({
    conversationId = null,
    query = '',
    resultCount = 0,
    panelUrl = '',
    searchUrl = '',
  } = {}) {
    const resolvedConversationId =
      typeof conversationId === 'string' && conversationId.trim()
        ? conversationId.trim()
        : getActiveConversation()?.id || null;
    if (!resolvedConversationId || !(appState.webLookupPanelsByConversationId instanceof Map)) {
      return;
    }
    const existingPanel = appState.webLookupPanelsByConversationId.get(resolvedConversationId) || {};
    appState.webLookupPanelsByConversationId.set(resolvedConversationId, {
      ...existingPanel,
      heading: 'DuckDuckGo search',
      description:
        typeof query === 'string' && query.trim()
          ? `The lightweight DuckDuckGo results view is open for "${query.trim()}". ${resultCount} result${resultCount === 1 ? '' : 's'} extracted in-app.`
          : `The lightweight DuckDuckGo results view is open. ${resultCount} result${resultCount === 1 ? '' : 's'} extracted in-app.`,
      searchUrl:
        typeof panelUrl === 'string' && panelUrl.trim()
          ? panelUrl.trim()
          : typeof searchUrl === 'string' && searchUrl.trim()
            ? searchUrl.trim()
            : existingPanel.searchUrl || '',
    });
    renderWorkspaceSidePanels();
  }

  return {
    getShellTerminalEntries,
    getTerminalSessionForConversation,
    handleCloseTerminalPanel,
    handleCloseWebLookupPanel,
    handleShellCommandComplete,
    handleShellCommandStart,
    handleWebLookupSearchComplete,
    handleWebLookupSearchStart,
    renderWorkspaceSidePanels,
  };
}
