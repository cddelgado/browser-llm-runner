import {
  hasStartedWorkspace,
  isChatTitleEditingState,
  isSettingsView,
  refreshWorkspaceView,
  setChatTitleEditing,
  setChatWorkspaceStarted,
  setSettingsPageOpen,
} from '../state/app-state.js';

export function createRoutingShell({
  appState,
  routeHome = 'home',
  routeChat = 'chat',
  routeSettings = 'settings',
  windowRef = window,
  buildHash,
  selectCurrentViewRoute,
  setRegionVisibility,
  settingsPage,
  homePanel,
  preChatPanel,
  topBar,
  conversationPanel,
  chatTranscriptWrap,
  chatForm,
  chatMain,
  openSettingsButton,
  settingsTabButtons = [],
  settingsTabPanels = [],
  updateComposerVisibility,
  updateChatTitleEditorVisibility,
  updateTranscriptNavigationButtonVisibility,
  updateTerminalVisibility = () => {},
  updateActionButtons,
  updatePreChatStatusHint,
  updatePreChatActionButtons,
  updateSkipLinkVisibility = () => {},
  playEntranceAnimation,
}) {
  function getRouteFromHash(hashValue = windowRef.location.hash) {
    const normalized = String(hashValue || '').replace(/^#\/?/, '').trim();
    const segments = normalized
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean);
    const firstSegment = segments[0]?.toLowerCase() || '';
    const secondSegment = segments[1]?.toLowerCase() || '';
    if (firstSegment === routeSettings) {
      return routeSettings;
    }
    if (firstSegment === routeChat && secondSegment === routeSettings) {
      return routeSettings;
    }
    if (firstSegment === routeChat) {
      return routeChat;
    }
    return routeHome;
  }

  function getCurrentViewRoute() {
    return selectCurrentViewRoute(appState, {
      routeHome,
      routeChat,
      routeSettings,
    });
  }

  function setRouteHash(targetRoute, { replace = true } = {}) {
    const route = targetRoute === routeSettings || targetRoute === routeChat ? targetRoute : routeHome;
    const targetHash =
      typeof buildHash === 'function'
        ? buildHash(route, {
            appState,
            routeHome,
            routeChat,
            routeSettings,
          })
        : route === routeHome
          ? '#/'
          : `#/${route}`;
    if (windowRef.location.hash === targetHash) {
      return;
    }
    if (replace) {
      windowRef.history.replaceState(null, '', targetHash);
      return;
    }
    appState.ignoreNextHashChange = true;
    windowRef.location.hash = targetHash;
  }

  function syncRouteToCurrentView({ replace = true } = {}) {
    setRouteHash(getCurrentViewRoute(), { replace });
  }

  function setActiveSettingsTab(targetTabName, { focus = false } = {}) {
    const tabName = typeof targetTabName === 'string' ? targetTabName.trim() : '';
    if (!tabName || !settingsTabButtons.length || !settingsTabPanels.length) {
      return;
    }
    appState.activeSettingsTab = tabName;
    settingsTabButtons.forEach((button) => {
      if (!(button instanceof HTMLButtonElement)) {
        return;
      }
      const isActive = button.dataset.settingsTab === appState.activeSettingsTab;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-selected', String(isActive));
      button.tabIndex = isActive ? 0 : -1;
    });

    settingsTabPanels.forEach((panel) => {
      if (!(panel instanceof HTMLElement)) {
        return;
      }
      const isActive = panel.dataset.settingsTabPanel === appState.activeSettingsTab;
      panel.classList.toggle('d-none', !isActive);
      if (isActive) {
        panel.removeAttribute('aria-hidden');
        panel.inert = false;
      } else {
        panel.setAttribute('aria-hidden', 'true');
        panel.inert = true;
      }
    });

    if (focus) {
      const activeButton = Array.from(settingsTabButtons).find(
        (button) =>
          button instanceof HTMLButtonElement && button.dataset.settingsTab === appState.activeSettingsTab,
      );
      if (activeButton instanceof HTMLButtonElement) {
        activeButton.focus();
      }
    }
  }

  function setSettingsPageVisibility(visible, { syncRoute = true, replaceRoute = true } = {}) {
    if (!settingsPage || !topBar) {
      return;
    }
    setSettingsPageOpen(appState, visible);
    const settingsViewActive = isSettingsView(appState);
    const workspaceStarted = hasStartedWorkspace(appState);
    setRegionVisibility(settingsPage, settingsViewActive);
    const conversationPanelToggle = topBar.querySelector('[data-bs-target="#conversationPanel"]');
    if (openSettingsButton) {
      openSettingsButton.setAttribute('aria-expanded', String(settingsViewActive));
      openSettingsButton.classList.toggle('d-none', settingsViewActive);
    }
    if (conversationPanelToggle) {
      conversationPanelToggle.classList.toggle('d-none', settingsViewActive);
    }
    if (settingsViewActive) {
      setRegionVisibility(homePanel, false);
      setRegionVisibility(preChatPanel, false);
      setRegionVisibility(conversationPanel, false);
      setRegionVisibility(chatTranscriptWrap, false);
      setRegionVisibility(chatForm, false);
      setRegionVisibility(topBar, true);
      setActiveSettingsTab(appState.activeSettingsTab);
      updateSkipLinkVisibility();
      updateTerminalVisibility();
      if (topBar instanceof HTMLElement) {
        topBar.setAttribute('aria-label', 'Settings');
        topBar.classList.toggle('top-bar-actions-only', !workspaceStarted);
      }
      if (syncRoute) {
        syncRouteToCurrentView({ replace: replaceRoute });
      }
      return;
    }

    if (topBar) {
      topBar.removeAttribute('aria-label');
      topBar.classList.toggle('top-bar-actions-only', !workspaceStarted);
    }
    updateWelcomePanelVisibility({ syncRoute: false });
    updateSkipLinkVisibility();
    if (syncRoute) {
      syncRouteToCurrentView({ replace: replaceRoute });
    }
  }

  function updateWelcomePanelVisibility({ syncRoute = true, replaceRoute = true } = {}) {
    if (isSettingsView(appState)) {
      return;
    }
    const previousView = appState.currentWorkspaceView;
    refreshWorkspaceView(appState);
    const showHome = appState.workspaceView === routeHome;
    const showPreChat = appState.workspaceView === 'prechat';
    const showChat = appState.workspaceView === routeChat;
    const workspaceStarted = hasStartedWorkspace(appState);
    if (chatMain instanceof HTMLElement) {
      chatMain.classList.toggle('is-home', showHome);
      chatMain.classList.toggle('is-prechat', showPreChat);
      chatMain.classList.toggle('is-chat', showChat);
    }
    setRegionVisibility(homePanel, showHome);
    setRegionVisibility(preChatPanel, showPreChat);
    setRegionVisibility(topBar, true);
    if (topBar instanceof HTMLElement) {
      topBar.classList.toggle('top-bar-actions-only', !workspaceStarted);
    }
    setRegionVisibility(conversationPanel, workspaceStarted);
    const conversationPanelToggle = topBar?.querySelector('[data-bs-target="#conversationPanel"]');
    if (conversationPanelToggle instanceof HTMLElement) {
      conversationPanelToggle.classList.toggle('d-none', !workspaceStarted);
    }
    setRegionVisibility(chatTranscriptWrap, showChat);
    updateComposerVisibility();
    if (!showChat && isChatTitleEditingState(appState)) {
      setChatTitleEditing(appState, false);
    }
    updateChatTitleEditorVisibility();
    updateTranscriptNavigationButtonVisibility();
    updateTerminalVisibility();
    updateActionButtons();
    updatePreChatStatusHint();
    updatePreChatActionButtons();
    updateSkipLinkVisibility();
    if (appState.currentWorkspaceView !== previousView) {
      if (showPreChat) {
        playEntranceAnimation(preChatPanel);
        playEntranceAnimation(chatForm, 'animate-dock');
      } else if (showChat) {
        playEntranceAnimation(topBar);
        playEntranceAnimation(chatTranscriptWrap);
        playEntranceAnimation(chatForm, 'animate-dock');
      } else if (showHome) {
        playEntranceAnimation(homePanel);
      }
    }
    if (syncRoute) {
      syncRouteToCurrentView({ replace: replaceRoute });
    }
  }

  function applyRouteFromHash() {
    const requestedRoute = getRouteFromHash();
    if (requestedRoute === routeSettings) {
      setSettingsPageVisibility(true, { syncRoute: false });
      return;
    }

    setSettingsPageVisibility(false, { syncRoute: false });
    setChatWorkspaceStarted(appState, requestedRoute === routeChat);
    updateWelcomePanelVisibility({ syncRoute: false });
  }

  return {
    getRouteFromHash,
    getCurrentViewRoute,
    setRouteHash,
    syncRouteToCurrentView,
    applyRouteFromHash,
    setActiveSettingsTab,
    setSettingsPageVisibility,
    updateWelcomePanelVisibility,
  };
}
