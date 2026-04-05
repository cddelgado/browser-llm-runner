import { isSettingsView } from '../state/app-state.js';
import { bindModelSettingsEvents } from './settings-events-models.js';
import { bindToolingSettingsEvents } from './settings-events-tooling.js';

export function bindSettingsEvents({
  appState,
  documentRef = document,
  themeStorageKey,
  storage = globalThis.localStorage,
  settingsTabContainer,
  settingsTabButtons = [],
  openSettingsButton,
  closeSettingsButton,
  themeSelect,
  showThinkingToggle,
  enableToolCallingToggle,
  toolSettingsList,
  corsProxyForm,
  corsProxyInput,
  saveCorsProxyButton,
  clearCorsProxyButton,
  mcpServerEndpointForm,
  mcpServerEndpointInput,
  addMcpServerButton,
  mcpServersList,
  renderMathMlToggle,
  enableSingleKeyShortcutsToggle,
  transcriptViewSelect,
  defaultSystemPromptInput,
  conversationLanguageSelect,
  enableModelThinkingToggle,
  modelSelect,
  backendSelect,
  maxOutputTokensInput,
  maxContextTokensInput,
  temperatureInput,
  resetContextTokensButton,
  resetTemperatureButton,
  topKInput,
  topPInput,
  resetTopKButton,
  resetTopPButton,
  colorSchemeQuery,
  setActiveSettingsTab,
  setSettingsPageVisibility,
  getStoredThemePreference,
  applyTheme,
  applyShowThinkingPreference,
  applyToolCallingPreference,
  applyToolEnabledPreference,
  saveCorsProxyPreference,
  clearCorsProxyPreference,
  setCorsProxyFeedback,
  clearCorsProxyFeedback,
  applyMcpServerEnabledPreference,
  applyMcpServerCommandEnabledPreference,
  applyMathRenderingPreference,
  applySingleKeyShortcutPreference,
  applyTranscriptViewPreference,
  applyDefaultSystemPrompt,
  applyConversationLanguagePreference,
  applyConversationThinkingPreference,
  clearMcpServerFeedback,
  importMcpServerEndpoint,
  refreshMathRendering,
  refreshConversationSystemPromptPreview,
  refreshMcpServerPreference,
  removeMcpServerPreference,
  setMcpServerFeedback,
  syncModelSelectionForCurrentEnvironment,
  syncConversationLanguageAndThinkingControls,
  syncGenerationSettingsFromModel,
  getActiveConversation,
  assignConversationModelId,
  queueConversationStateSave,
  reinitializeEngineFromSettings,
  onGenerationSettingInputChanged,
  getModelGenerationLimits,
  normalizeModelId,
  defaultModelId,
  setStatus,
  isAnyModalOpen,
}) {
  if (settingsTabContainer) {
    settingsTabContainer.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) {
        return;
      }
      const tab = target.dataset.settingsTab;
      if (tab && tab === appState.activeSettingsTab) {
        return;
      }
      setActiveSettingsTab(tab, { focus: true });
    });

    settingsTabContainer.addEventListener('keydown', (event) => {
      if (!(event.target instanceof HTMLButtonElement)) {
        return;
      }
      if (
        event.key !== 'ArrowDown' &&
        event.key !== 'ArrowUp' &&
        event.key !== 'Home' &&
        event.key !== 'End'
      ) {
        if (event.key === 'Enter' || event.key === ' ') {
          setActiveSettingsTab(event.target.dataset.settingsTab, { focus: false });
        }
        return;
      }
      const buttons = Array.from(settingsTabButtons).filter(
        (button) => button instanceof HTMLButtonElement
      );
      const currentIndex = buttons.indexOf(event.target);
      if (currentIndex < 0) {
        return;
      }
      event.preventDefault();
      let nextIndex = currentIndex;
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        nextIndex = (currentIndex + direction + buttons.length) % buttons.length;
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = buttons.length - 1;
      }
      const nextTab = buttons[nextIndex];
      const nextTabName = nextTab?.dataset?.settingsTab;
      if (typeof nextTabName === 'string') {
        setActiveSettingsTab(nextTabName, { focus: false });
        nextTab.focus();
      }
    });
  }

  if (openSettingsButton) {
    openSettingsButton.addEventListener('click', () => {
      setSettingsPageVisibility(true, { replaceRoute: false });
      if (settingsTabButtons[0] instanceof HTMLButtonElement) {
        settingsTabButtons[0].focus();
      }
    });
  }

  if (closeSettingsButton) {
    closeSettingsButton.addEventListener('click', () => {
      setSettingsPageVisibility(false, { replaceRoute: false });
      if (openSettingsButton instanceof HTMLButtonElement) {
        openSettingsButton.focus();
      }
    });
  }

  if (themeSelect) {
    themeSelect.addEventListener('change', (event) => {
      const value = event.target.value;
      if (value !== 'light' && value !== 'dark' && value !== 'system') {
        return;
      }
      storage.setItem(themeStorageKey, value);
      applyTheme(value);
    });
  }

  if (showThinkingToggle) {
    showThinkingToggle.addEventListener('change', (event) => {
      const value = event.target instanceof HTMLInputElement ? event.target.checked : false;
      applyShowThinkingPreference(value, { persist: true, refresh: true });
    });
  }

  colorSchemeQuery.addEventListener('change', () => {
    if (getStoredThemePreference() === 'system') {
      applyTheme('system');
    }
  });

  bindToolingSettingsEvents({
    enableToolCallingToggle,
    toolSettingsList,
    corsProxyForm,
    corsProxyInput,
    saveCorsProxyButton,
    clearCorsProxyButton,
    mcpServerEndpointForm,
    mcpServerEndpointInput,
    addMcpServerButton,
    mcpServersList,
    applyToolCallingPreference,
    applyToolEnabledPreference,
    saveCorsProxyPreference,
    clearCorsProxyPreference,
    setCorsProxyFeedback,
    clearCorsProxyFeedback,
    applyMcpServerEnabledPreference,
    applyMcpServerCommandEnabledPreference,
    clearMcpServerFeedback,
    importMcpServerEndpoint,
    refreshConversationSystemPromptPreview,
    refreshMcpServerPreference,
    removeMcpServerPreference,
    setMcpServerFeedback,
    setStatus,
  });

  bindModelSettingsEvents({
    appState,
    renderMathMlToggle,
    enableSingleKeyShortcutsToggle,
    transcriptViewSelect,
    defaultSystemPromptInput,
    conversationLanguageSelect,
    enableModelThinkingToggle,
    modelSelect,
    backendSelect,
    maxOutputTokensInput,
    maxContextTokensInput,
    temperatureInput,
    resetContextTokensButton,
    resetTemperatureButton,
    topKInput,
    topPInput,
    resetTopKButton,
    resetTopPButton,
    applyMathRenderingPreference,
    applySingleKeyShortcutPreference,
    applyTranscriptViewPreference,
    applyDefaultSystemPrompt,
    applyConversationLanguagePreference,
    applyConversationThinkingPreference,
    refreshMathRendering,
    refreshConversationSystemPromptPreview,
    syncModelSelectionForCurrentEnvironment,
    syncConversationLanguageAndThinkingControls,
    syncGenerationSettingsFromModel,
    getActiveConversation,
    assignConversationModelId,
    queueConversationStateSave,
    reinitializeEngineFromSettings,
    onGenerationSettingInputChanged,
    getModelGenerationLimits,
    normalizeModelId,
    defaultModelId,
    setStatus,
  });

  documentRef.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !isSettingsView(appState) || isAnyModalOpen()) {
      return;
    }
    event.preventDefault();
    setSettingsPageVisibility(false, { replaceRoute: false });
    if (openSettingsButton instanceof HTMLButtonElement) {
      openSettingsButton.focus();
    }
  });
}
