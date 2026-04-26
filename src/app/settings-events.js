import { isSettingsView } from '../state/app-state.js';
import { bindCloudProviderSettingsEvents } from './settings-events-cloud.js';
import { bindModelSettingsEvents } from './settings-events-models.js';
import { bindOrchestrationSettingsEvents } from './settings-events-orchestrations.js';
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
  orchestrationEditorForm = null,
  orchestrationNameInput = null,
  orchestrationSlashCommandInput = null,
  orchestrationSaveButton = null,
  orchestrationResetButton = null,
  orchestrationImportForm = null,
  orchestrationImportInput = null,
  orchestrationImportButton = null,
  exportAllOrchestrationsButton = null,
  customOrchestrationsList = null,
  skillPackageForm = null,
  skillPackageInput = null,
  addSkillPackageButton = null,
  skillsList = null,
  cloudProviderForm = null,
  cloudProviderNameInput = null,
  cloudProviderEndpointInput = null,
  cloudProviderApiKeyInput = null,
  addCloudProviderButton = null,
  cloudProvidersList = null,
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
  exportConversationsButton,
  deleteConversationsButton,
  conversationLanguageSelect,
  enableModelThinkingToggle,
  modelSelect,
  backendSelect,
  cpuThreadsInput,
  clearModelDownloadsButton,
  maxOutputTokensInput,
  maxContextTokensInput,
  temperatureInput,
  resetContextTokensButton,
  resetTemperatureButton,
  topKInput,
  topPInput,
  resetTopKButton,
  resetTopPButton,
  wllamaPromptCacheToggle,
  wllamaBatchSizeInput,
  wllamaMinPInput,
  colorSchemeQuery,
  setActiveSettingsTab,
  setSettingsPageVisibility,
  getStoredThemePreference,
  applyTheme,
  applyShowThinkingPreference,
  applyToolCallingPreference,
  applyToolEnabledPreference,
  clearCustomOrchestrationFeedback = null,
  exportAllCustomOrchestrations = null,
  exportCustomOrchestration = null,
  importCustomOrchestrationFile = null,
  loadCustomOrchestrationIntoEditor = null,
  removeCustomOrchestrationPreference = null,
  resetCustomOrchestrationEditor = null,
  saveCustomOrchestrationDraft = null,
  setCustomOrchestrationFeedback = null,
  applySkillPackageEnabledPreference = null,
  clearSkillPackageFeedback = null,
  importSkillPackageFile = null,
  removeSkillPackagePreference = null,
  addCloudProvider = null,
  setCloudProviderFeedback = null,
  clearCloudProviderFeedback = null,
  refreshCloudProviderPreference = null,
  removeCloudProviderPreference = null,
  saveCloudProviderSecretPreference = null,
  setCloudProviderModelSelected = null,
  updateCloudModelFeaturePreference = null,
  updateCloudModelGenerationPreference = null,
  updateCloudModelRateLimitPreference = null,
  resetCloudModelGenerationPreference = null,
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
  applyCpuThreadsPreference,
  clearMcpServerFeedback,
  importMcpServerEndpoint,
  refreshMathRendering,
  refreshConversationSystemPromptPreview,
  refreshMcpServerPreference,
  removeMcpServerPreference,
  setSkillPackageFeedback = null,
  setMcpServerFeedback,
  syncModelSelectionForCurrentEnvironment,
  syncConversationLanguageAndThinkingControls,
  syncGenerationSettingsFromModel,
  getActiveConversation,
  assignConversationModelId,
  queueConversationStateSave,
  reinitializeEngineFromSettings,
  clearSelectedModelDownloads,
  onGenerationSettingInputChanged,
  onWllamaSettingInputChanged,
  getModelGenerationLimits,
  normalizeModelId,
  defaultModelId,
  exportAllConversations,
  deleteAllConversationStorage,
  isUiBusy = () => false,
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
        event.key !== 'ArrowLeft' &&
        event.key !== 'ArrowRight' &&
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
      if (
        event.key === 'ArrowUp' ||
        event.key === 'ArrowDown' ||
        event.key === 'ArrowLeft' ||
        event.key === 'ArrowRight'
      ) {
        const direction = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
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
    skillPackageForm,
    skillPackageInput,
    addSkillPackageButton,
    skillsList,
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
    applySkillPackageEnabledPreference,
    clearSkillPackageFeedback,
    importSkillPackageFile,
    removeSkillPackagePreference,
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
    setSkillPackageFeedback,
    setMcpServerFeedback,
    setStatus,
  });

  bindOrchestrationSettingsEvents({
    orchestrationEditorForm,
    orchestrationNameInput,
    orchestrationSlashCommandInput,
    orchestrationSaveButton,
    orchestrationResetButton,
    orchestrationImportForm,
    orchestrationImportInput,
    orchestrationImportButton,
    exportAllOrchestrationsButton,
    customOrchestrationsList,
    clearCustomOrchestrationFeedback,
    exportAllCustomOrchestrations,
    exportCustomOrchestration,
    importCustomOrchestrationFile,
    loadCustomOrchestrationIntoEditor,
    removeCustomOrchestrationPreference,
    resetCustomOrchestrationEditor,
    saveCustomOrchestrationDraft,
    setCustomOrchestrationFeedback,
    setStatus,
  });

  bindCloudProviderSettingsEvents({
    cloudProviderForm,
    cloudProviderNameInput,
    cloudProviderEndpointInput,
    cloudProviderApiKeyInput,
    addCloudProviderButton,
    cloudProvidersList,
    addCloudProvider,
    setCloudProviderFeedback,
    clearCloudProviderFeedback,
    refreshCloudProviderPreference,
    removeCloudProviderPreference,
    saveCloudProviderSecretPreference,
    setCloudProviderModelSelected,
    updateCloudModelFeaturePreference,
    updateCloudModelGenerationPreference,
    updateCloudModelRateLimitPreference,
    resetCloudModelGenerationPreference,
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
    cpuThreadsInput,
    clearModelDownloadsButton,
    maxOutputTokensInput,
    maxContextTokensInput,
    temperatureInput,
    resetContextTokensButton,
    resetTemperatureButton,
    topKInput,
    topPInput,
    resetTopKButton,
    resetTopPButton,
    wllamaPromptCacheToggle,
    wllamaBatchSizeInput,
    wllamaMinPInput,
    applyMathRenderingPreference,
    applySingleKeyShortcutPreference,
    applyTranscriptViewPreference,
    applyDefaultSystemPrompt,
    applyConversationLanguagePreference,
    applyConversationThinkingPreference,
    applyCpuThreadsPreference,
    refreshMathRendering,
    refreshConversationSystemPromptPreview,
    syncModelSelectionForCurrentEnvironment,
    syncConversationLanguageAndThinkingControls,
    syncGenerationSettingsFromModel,
    getActiveConversation,
    assignConversationModelId,
    queueConversationStateSave,
    reinitializeEngineFromSettings,
    clearSelectedModelDownloads,
    onGenerationSettingInputChanged,
    onWllamaSettingInputChanged,
    getModelGenerationLimits,
    normalizeModelId,
    defaultModelId,
    setStatus,
  });

  if (exportConversationsButton instanceof HTMLButtonElement) {
    exportConversationsButton.addEventListener('click', () => {
      if (isUiBusy()) {
        setStatus('Wait for the current conversation task to finish before exporting.');
        return;
      }
      try {
        exportAllConversations();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Conversation export failed.');
      }
    });
  }

  if (deleteConversationsButton instanceof HTMLButtonElement) {
    deleteConversationsButton.addEventListener('click', async () => {
      if (isUiBusy()) {
        setStatus(
          'Wait for the current conversation task to finish before deleting conversations.'
        );
        return;
      }
      const confirmed =
        typeof globalThis.confirm === 'function'
          ? globalThis.confirm(
              'Delete all saved conversations and their stored artifacts from this browser?'
            )
          : true;
      if (!confirmed) {
        return;
      }
      try {
        await deleteAllConversationStorage();
        setStatus('All saved conversations were deleted.');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Deleting conversations failed.');
      }
    });
  }

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
