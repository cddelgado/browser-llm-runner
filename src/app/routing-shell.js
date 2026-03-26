export function createRoutingShell({
  appState,
  routeHome = 'home',
  routeChat = 'chat',
  routeSettings = 'settings',
  windowRef = window,
  selectCurrentViewRoute,
  getActiveConversation,
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
  updateActionButtons,
  updatePreChatStatusHint,
  updatePreChatActionButtons,
  playEntranceAnimation,
}) {
  function getRouteFromHash(hashValue = windowRef.location.hash) {
    const normalized = String(hashValue || '')
      .replace(/^#\/?/, '')
      .trim()
      .toLowerCase();
    if (normalized === routeSettings) {
      return routeSettings;
    }
    if (normalized === routeChat) {
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
    const targetHash = route === routeHome ? '#/' : `#/${route}`;
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
    appState.isSettingsPageOpen = Boolean(visible);
    setRegionVisibility(settingsPage, appState.isSettingsPageOpen);
    const conversationPanelToggle = topBar.querySelector('[data-bs-target="#conversationPanel"]');
    if (openSettingsButton) {
      openSettingsButton.setAttribute('aria-expanded', String(appState.isSettingsPageOpen));
      openSettingsButton.classList.toggle('d-none', appState.isSettingsPageOpen);
    }
    if (conversationPanelToggle) {
      conversationPanelToggle.classList.toggle('d-none', appState.isSettingsPageOpen);
    }
    if (appState.isSettingsPageOpen) {
      setRegionVisibility(homePanel, false);
      setRegionVisibility(preChatPanel, false);
      setRegionVisibility(conversationPanel, false);
      setRegionVisibility(chatTranscriptWrap, false);
      setRegionVisibility(chatForm, false);
      setRegionVisibility(topBar, true);
      setActiveSettingsTab(appState.activeSettingsTab);
      if (topBar instanceof HTMLElement) {
        topBar.setAttribute('aria-label', 'Settings');
        topBar.classList.toggle('top-bar-actions-only', !appState.hasStartedChatWorkspace);
      }
      if (syncRoute) {
        syncRouteToCurrentView({ replace: replaceRoute });
      }
      return;
    }

    if (topBar) {
      topBar.removeAttribute('aria-label');
      topBar.classList.toggle('top-bar-actions-only', !appState.hasStartedChatWorkspace);
    }
    updateWelcomePanelVisibility({ syncRoute: false });
    if (syncRoute) {
      syncRouteToCurrentView({ replace: replaceRoute });
    }
  }

  function updateWelcomePanelVisibility({ syncRoute = true, replaceRoute = true } = {}) {
    if (appState.isSettingsPageOpen) {
      return;
    }
    const previousView = appState.currentWorkspaceView;
    const activeConversation = getActiveConversation();
    const showHome = !appState.hasStartedChatWorkspace;
    const showPreChat = appState.hasStartedChatWorkspace && !appState.modelReady && !activeConversation;
    const showChat = appState.hasStartedChatWorkspace && (appState.modelReady || Boolean(activeConversation));
    appState.currentWorkspaceView = showHome ? routeHome : showPreChat ? 'prechat' : routeChat;
    if (chatMain instanceof HTMLElement) {
      chatMain.classList.toggle('is-home', showHome);
      chatMain.classList.toggle('is-prechat', showPreChat);
      chatMain.classList.toggle('is-chat', showChat);
    }
    setRegionVisibility(homePanel, showHome);
    setRegionVisibility(preChatPanel, showPreChat);
    setRegionVisibility(topBar, true);
    if (topBar instanceof HTMLElement) {
      topBar.classList.toggle('top-bar-actions-only', !appState.hasStartedChatWorkspace);
    }
    setRegionVisibility(conversationPanel, appState.hasStartedChatWorkspace);
    const conversationPanelToggle = topBar?.querySelector('[data-bs-target="#conversationPanel"]');
    if (conversationPanelToggle instanceof HTMLElement) {
      conversationPanelToggle.classList.toggle('d-none', !appState.hasStartedChatWorkspace);
    }
    setRegionVisibility(chatTranscriptWrap, showChat);
    updateComposerVisibility();
    if (!showChat && appState.isChatTitleEditing) {
      appState.isChatTitleEditing = false;
    }
    updateChatTitleEditorVisibility();
    updateTranscriptNavigationButtonVisibility();
    updateActionButtons();
    updatePreChatStatusHint();
    updatePreChatActionButtons();
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
    appState.hasStartedChatWorkspace = requestedRoute === routeChat;
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
