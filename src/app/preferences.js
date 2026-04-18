import { createModelPreferencesController } from './preferences-models.js';
import { createOrchestrationPreferencesController } from './preferences-orchestrations.js';
import { createToolingPreferencesController } from './preferences-tooling.js';
import { getStoredCorsProxyUrl, normalizeCorsProxyUrl } from '../llm/browser-fetch.js';
import { normalizeSystemPrompt } from '../state/conversation-model.js';

export function createPreferencesController({
  appState,
  storage = globalThis.localStorage,
  navigatorRef = globalThis.navigator,
  documentRef = document,
  themeStorageKey,
  showThinkingStorageKey,
  enableToolCallingStorageKey,
  enabledToolsStorageKey,
  enabledToolMigrationsStorageKey,
  renderMathMlStorageKey,
  singleKeyShortcutsStorageKey,
  transcriptViewStorageKey,
  conversationPanelCollapsedStorageKey,
  defaultSystemPromptStorageKey,
  corsProxyStorageKey,
  mcpServersStorageKey,
  modelStorageKey,
  backendStorageKey,
  cpuThreadsStorageKey,
  supportedBackendPreferences,
  webGpuRequiredModelSuffix,
  availableToolDefinitions = [],
  themeSelect,
  showThinkingToggle,
  enableToolCallingToggle,
  toolSettingsList,
  orchestrationEditorHeading = null,
  orchestrationEditorForm = null,
  orchestrationEditorIdInput = null,
  orchestrationNameInput = null,
  orchestrationSlashCommandInput = null,
  orchestrationDescriptionInput = null,
  orchestrationDefinitionInput = null,
  orchestrationStepList = null,
  orchestrationStepEditorFeedback = null,
  orchestrationSaveButton = null,
  orchestrationResetButton = null,
  orchestrationImportInput = null,
  orchestrationImportFeedback = null,
  customOrchestrationsList = null,
  builtInOrchestrationsList = null,
  builtInOrchestrations = [],
  saveCustomOrchestration = null,
  removeCustomOrchestration = null,
  downloadFile = null,
  skillPackageInput = null,
  skillPackageAddFeedback = null,
  skillsList = null,
  corsProxyInput,
  corsProxyFeedback,
  importSkillPackage = null,
  saveSkillPackage = null,
  removeSkillPackage = null,
  mcpServerEndpointInput,
  mcpServerAddFeedback,
  mcpServersList,
  renderMathMlToggle,
  enableSingleKeyShortcutsToggle,
  transcriptViewSelect,
  conversationPanelCollapseButton,
  conversationPanelCollapseButtonText,
  defaultSystemPromptInput,
  modelSelect,
  modelCardList,
  backendSelect,
  cpuThreadsInput,
  colorSchemeQuery,
  refreshModelThinkingVisibility,
  getRuntimeConfigForModel,
  syncGenerationSettingsFromModel,
  persistGenerationConfigForModel,
  validateCorsProxyUrl,
  inspectMcpServerEndpoint,
  setStatus,
  appendDebug,
  onSelectedModelCardChange,
}) {
  function getStoredShowThinkingPreference() {
    return storage.getItem(showThinkingStorageKey) === 'true';
  }

  function getStoredMathRenderingPreference() {
    const stored = storage.getItem(renderMathMlStorageKey);
    return stored === null ? true : stored === 'true';
  }

  function getStoredSingleKeyShortcutPreference() {
    const stored = storage.getItem(singleKeyShortcutsStorageKey);
    return stored === null ? true : stored === 'true';
  }

  function getStoredTranscriptViewPreference() {
    return storage.getItem(transcriptViewStorageKey) === 'compact' ? 'compact' : 'standard';
  }

  function getStoredConversationPanelCollapsedPreference() {
    return storage.getItem(conversationPanelCollapsedStorageKey) === 'true';
  }

  function getStoredDefaultSystemPrompt() {
    return normalizeSystemPrompt(storage.getItem(defaultSystemPromptStorageKey));
  }

  function getStoredCorsProxyPreference() {
    if (!corsProxyStorageKey) {
      return '';
    }
    const normalizedProxyUrl = getStoredCorsProxyUrl(storage.getItem(corsProxyStorageKey));
    if (!normalizedProxyUrl) {
      storage.removeItem(corsProxyStorageKey);
    }
    return normalizedProxyUrl;
  }

  function applyDefaultSystemPrompt(value, { persist = false } = {}) {
    appState.defaultSystemPrompt = normalizeSystemPrompt(value);
    if (defaultSystemPromptInput instanceof HTMLTextAreaElement) {
      defaultSystemPromptInput.value = appState.defaultSystemPrompt;
    }
    if (persist) {
      storage.setItem(defaultSystemPromptStorageKey, appState.defaultSystemPrompt);
    }
  }

  function setCorsProxyFeedback(message = '', variant = 'info') {
    if (!(corsProxyFeedback instanceof HTMLElement)) {
      return;
    }
    const normalizedMessage = typeof message === 'string' ? message.trim() : '';
    corsProxyFeedback.className = '';
    corsProxyFeedback.replaceChildren();
    if (!normalizedMessage) {
      corsProxyFeedback.classList.add('d-none');
      corsProxyFeedback.removeAttribute('role');
      return;
    }
    corsProxyFeedback.classList.remove('d-none');
    corsProxyFeedback.setAttribute('role', variant === 'danger' ? 'alert' : 'status');
    corsProxyFeedback.classList.add(
      'alert',
      variant === 'danger'
        ? 'alert-danger'
        : variant === 'success'
          ? 'alert-success'
          : 'alert-secondary',
      'py-2',
      'px-3',
      'mb-0'
    );
    corsProxyFeedback.textContent = normalizedMessage;
  }

  function clearCorsProxyFeedback() {
    setCorsProxyFeedback('');
  }

  function applyCorsProxyPreference(value, { persist = false } = {}) {
    const normalizedProxyUrl =
      typeof value === 'string' && value.trim() ? normalizeCorsProxyUrl(value) : '';
    appState.corsProxyUrl = normalizedProxyUrl;
    if (corsProxyInput instanceof HTMLInputElement) {
      corsProxyInput.value = normalizedProxyUrl;
    }
    if (persist && corsProxyStorageKey) {
      if (normalizedProxyUrl) {
        storage.setItem(corsProxyStorageKey, normalizedProxyUrl);
      } else {
        storage.removeItem(corsProxyStorageKey);
      }
    }
    return normalizedProxyUrl;
  }

  async function saveCorsProxyPreference(value, { persist = true } = {}) {
    if (typeof validateCorsProxyUrl !== 'function') {
      throw new Error('CORS proxy validation is unavailable.');
    }
    const normalizedProxyUrl = await validateCorsProxyUrl(value, {
      onDebug: (message) => appendDebug(`Proxy validation: ${message}`),
    });
    applyCorsProxyPreference(normalizedProxyUrl, { persist });
    clearCorsProxyFeedback();
    return normalizedProxyUrl;
  }

  function clearCorsProxyPreference({ persist = false } = {}) {
    applyCorsProxyPreference('', { persist });
    clearCorsProxyFeedback();
  }

  const {
    applyEnabledToolNamesPreference,
    applySkillPackageEnabledPreference,
    applySkillPackagesPreference,
    applyMcpServerCommandEnabledPreference,
    applyMcpServerEnabledPreference,
    applyMcpServersPreference,
    applyToolCallingPreference,
    applyToolEnabledPreference,
    clearSkillPackageFeedback,
    clearMcpServerFeedback,
    getStoredEnabledToolNamesPreference,
    migrateStoredEnabledToolNamesPreference,
    getStoredMcpServersPreference,
    getStoredToolCallingPreference,
    importSkillPackageFile,
    importMcpServerEndpoint,
    removeSkillPackagePreference,
    refreshMcpServerPreference,
    removeMcpServerPreference,
    setSkillPackageFeedback,
    setMcpServerFeedback,
  } = createToolingPreferencesController({
    appState,
    storage,
    documentRef,
    enableToolCallingStorageKey,
    enabledToolsStorageKey,
    enabledToolMigrationsStorageKey,
    mcpServersStorageKey,
    availableToolDefinitions,
    enabledToolMigrations: [
      {
        id: '2026-04-06-enable-web-lookup',
        toolName: 'web_lookup',
      },
    ],
    enableToolCallingToggle,
    toolSettingsList,
    skillPackageInput,
    skillPackageAddFeedback,
    skillsList,
    importSkillPackage,
    saveSkillPackage,
    removeSkillPackage,
    mcpServerEndpointInput,
    mcpServerAddFeedback,
    mcpServersList,
    inspectMcpServerEndpoint:
      typeof inspectMcpServerEndpoint === 'function'
        ? (endpoint, options = {}) =>
            inspectMcpServerEndpoint(endpoint, {
              ...options,
              onDebug: (message) => appendDebug(message),
            })
        : inspectMcpServerEndpoint,
  });

  const {
    applyCustomOrchestrationsPreference,
    clearCustomOrchestrationFeedback,
    exportAllCustomOrchestrations,
    exportCustomOrchestration,
    importCustomOrchestrationFile,
    loadCustomOrchestrationIntoEditor,
    removeCustomOrchestrationPreference,
    resetCustomOrchestrationEditor,
    saveCustomOrchestrationDraft,
    setCustomOrchestrationFeedback,
  } = createOrchestrationPreferencesController({
    appState,
    documentRef,
    orchestrationEditorHeading,
    orchestrationEditorForm,
    orchestrationEditorIdInput,
    orchestrationNameInput,
    orchestrationSlashCommandInput,
    orchestrationDescriptionInput,
    orchestrationDefinitionInput,
    orchestrationStepList,
    orchestrationStepEditorFeedback,
    orchestrationSaveButton,
    orchestrationResetButton,
    orchestrationImportInput,
    orchestrationImportFeedback,
    customOrchestrationsList,
    builtInOrchestrationsList,
    builtInOrchestrations,
    saveCustomOrchestration,
    removeCustomOrchestration,
    downloadFile,
  });

  function applyShowThinkingPreference(value, { persist = false, refresh = false } = {}) {
    appState.showThinkingByDefault = Boolean(value);
    if (showThinkingToggle) {
      showThinkingToggle.checked = appState.showThinkingByDefault;
    }
    if (persist) {
      storage.setItem(showThinkingStorageKey, String(appState.showThinkingByDefault));
    }
    if (refresh) {
      refreshModelThinkingVisibility();
    }
  }

  function applyMathRenderingPreference(value, { persist = false } = {}) {
    appState.renderMathMl = Boolean(value);
    if (renderMathMlToggle instanceof HTMLInputElement) {
      renderMathMlToggle.checked = appState.renderMathMl;
    }
    if (persist) {
      storage.setItem(renderMathMlStorageKey, String(appState.renderMathMl));
    }
  }

  function applySingleKeyShortcutPreference(value, { persist = false } = {}) {
    appState.enableSingleKeyShortcuts = Boolean(value);
    if (enableSingleKeyShortcutsToggle instanceof HTMLInputElement) {
      enableSingleKeyShortcutsToggle.checked = appState.enableSingleKeyShortcuts;
    }
    if (persist) {
      storage.setItem(singleKeyShortcutsStorageKey, String(appState.enableSingleKeyShortcuts));
    }
  }

  function applyTranscriptViewPreference(value, { persist = false } = {}) {
    appState.transcriptView = value === 'compact' ? 'compact' : 'standard';
    if (transcriptViewSelect instanceof HTMLSelectElement) {
      transcriptViewSelect.value = appState.transcriptView;
    }
    documentRef.body.classList.toggle('transcript-compact', appState.transcriptView === 'compact');
    if (persist) {
      storage.setItem(transcriptViewStorageKey, appState.transcriptView);
    }
  }

  function applyConversationPanelCollapsedPreference(value, { persist = false } = {}) {
    const isCollapsed = Boolean(value);
    documentRef.body?.classList.toggle('conversation-panel-collapsed', isCollapsed);
    if (conversationPanelCollapseButton instanceof HTMLButtonElement) {
      const label = isCollapsed ? 'Expand conversations panel' : 'Collapse conversations panel';
      conversationPanelCollapseButton.setAttribute('aria-expanded', String(!isCollapsed));
      conversationPanelCollapseButton.setAttribute('aria-label', label);
      conversationPanelCollapseButton.setAttribute('title', label);
    }
    if (conversationPanelCollapseButtonText instanceof HTMLElement) {
      conversationPanelCollapseButtonText.textContent = isCollapsed
        ? 'Expand conversations panel'
        : 'Collapse conversations panel';
    }
    if (persist) {
      storage.setItem(conversationPanelCollapsedStorageKey, String(isCollapsed));
    }
  }

  function getStoredThemePreference() {
    const storedPreference = storage.getItem(themeStorageKey);
    if (
      storedPreference === 'light' ||
      storedPreference === 'dark' ||
      storedPreference === 'system'
    ) {
      return storedPreference;
    }
    return 'system';
  }

  function resolveTheme(preference) {
    if (preference === 'system') {
      return colorSchemeQuery.matches ? 'dark' : 'light';
    }
    return preference;
  }

  function applyTheme(preference) {
    const resolvedTheme = resolveTheme(preference);
    documentRef.documentElement.setAttribute('data-theme', resolvedTheme);
    documentRef.documentElement.setAttribute('data-bs-theme', resolvedTheme);
    if (themeSelect) {
      themeSelect.value = preference;
    }
  }

  const {
    normalizeBackendPreference,
    formatBackendPreferenceLabel,
    getAvailableModelId,
    getWebGpuAvailability,
    populateModelSelect,
    probeWebGpuAvailability,
    readEngineConfigFromUI,
    persistInferencePreferences,
    restoreInferencePreferences,
    applyCpuThreadsPreference,
    setSelectedModelId,
    syncModelSelectionForCurrentEnvironment,
  } = createModelPreferencesController({
    appState,
    storage,
    navigatorRef,
    documentRef,
    modelStorageKey,
    backendStorageKey,
    cpuThreadsStorageKey,
    supportedBackendPreferences,
    webGpuRequiredModelSuffix,
    modelSelect,
    modelCardList,
    backendSelect,
    cpuThreadsInput,
    getRuntimeConfigForModel,
    syncGenerationSettingsFromModel,
    persistGenerationConfigForModel,
    setStatus,
    appendDebug,
    onSelectedModelCardChange,
  });

  if (conversationPanelCollapseButton instanceof HTMLButtonElement) {
    conversationPanelCollapseButton.addEventListener('click', () => {
      applyConversationPanelCollapsedPreference(
        !documentRef.body?.classList.contains('conversation-panel-collapsed'),
        {
          persist: true,
        }
      );
    });
  }

  clearCorsProxyFeedback();

  return {
    getStoredShowThinkingPreference,
    getStoredToolCallingPreference,
    getStoredEnabledToolNamesPreference,
    migrateStoredEnabledToolNamesPreference,
    getStoredMcpServersPreference,
    getStoredMathRenderingPreference,
    getStoredSingleKeyShortcutPreference,
    getStoredTranscriptViewPreference,
    getStoredConversationPanelCollapsedPreference,
    getStoredDefaultSystemPrompt,
    getStoredCorsProxyPreference,
    applyDefaultSystemPrompt,
    applyCorsProxyPreference,
    applyShowThinkingPreference,
    applyToolCallingPreference,
    applyEnabledToolNamesPreference,
    applyCustomOrchestrationsPreference,
    applySkillPackageEnabledPreference,
    applySkillPackagesPreference,
    applyToolEnabledPreference,
    saveCorsProxyPreference,
    clearCorsProxyPreference,
    setCorsProxyFeedback,
    clearCorsProxyFeedback,
    applyMcpServersPreference,
    applyMcpServerEnabledPreference,
    applyMcpServerCommandEnabledPreference,
    applyMathRenderingPreference,
    applySingleKeyShortcutPreference,
    applyTranscriptViewPreference,
    applyConversationPanelCollapsedPreference,
    clearCustomOrchestrationFeedback,
    clearSkillPackageFeedback,
    clearMcpServerFeedback,
    getStoredThemePreference,
    resolveTheme,
    applyTheme,
    exportAllCustomOrchestrations,
    exportCustomOrchestration,
    importCustomOrchestrationFile,
    importSkillPackageFile,
    importMcpServerEndpoint,
    loadCustomOrchestrationIntoEditor,
    populateModelSelect,
    removeCustomOrchestrationPreference,
    resetCustomOrchestrationEditor,
    removeSkillPackagePreference,
    refreshMcpServerPreference,
    removeMcpServerPreference,
    saveCustomOrchestrationDraft,
    setCustomOrchestrationFeedback,
    setSkillPackageFeedback,
    setMcpServerFeedback,
    setSelectedModelId,
    normalizeBackendPreference,
    formatBackendPreferenceLabel,
    getAvailableModelId,
    syncModelSelectionForCurrentEnvironment,
    getWebGpuAvailability,
    probeWebGpuAvailability,
    restoreInferencePreferences,
    applyCpuThreadsPreference,
    readEngineConfigFromUI,
    persistInferencePreferences,
  };
}
