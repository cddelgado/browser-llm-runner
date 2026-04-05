import { createModelPreferencesController } from './preferences-models.js';
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
  renderMathMlStorageKey,
  singleKeyShortcutsStorageKey,
  transcriptViewStorageKey,
  conversationPanelCollapsedStorageKey,
  defaultSystemPromptStorageKey,
  corsProxyStorageKey,
  mcpServersStorageKey,
  modelStorageKey,
  backendStorageKey,
  supportedBackendPreferences,
  webGpuRequiredModelSuffix,
  availableToolDefinitions = [],
  themeSelect,
  showThinkingToggle,
  enableToolCallingToggle,
  toolSettingsList,
  corsProxyInput,
  corsProxyFeedback,
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
  colorSchemeQuery,
  refreshModelThinkingVisibility,
  getRuntimeConfigForModel,
  syncGenerationSettingsFromModel,
  persistGenerationConfigForModel,
  validateCorsProxyUrl,
  inspectMcpServerEndpoint,
  setStatus,
  appendDebug,
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
    const normalizedProxyUrl = await validateCorsProxyUrl(value);
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
    applyMcpServerCommandEnabledPreference,
    applyMcpServerEnabledPreference,
    applyMcpServersPreference,
    applyToolCallingPreference,
    applyToolEnabledPreference,
    clearMcpServerFeedback,
    getStoredEnabledToolNamesPreference,
    getStoredMcpServersPreference,
    getStoredToolCallingPreference,
    importMcpServerEndpoint,
    refreshMcpServerPreference,
    removeMcpServerPreference,
    setMcpServerFeedback,
  } = createToolingPreferencesController({
    appState,
    storage,
    documentRef,
    enableToolCallingStorageKey,
    enabledToolsStorageKey,
    mcpServersStorageKey,
    availableToolDefinitions,
    enableToolCallingToggle,
    toolSettingsList,
    mcpServerEndpointInput,
    mcpServerAddFeedback,
    mcpServersList,
    inspectMcpServerEndpoint,
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
    setSelectedModelId,
    syncModelSelectionForCurrentEnvironment,
  } = createModelPreferencesController({
    appState,
    storage,
    navigatorRef,
    documentRef,
    modelStorageKey,
    backendStorageKey,
    supportedBackendPreferences,
    webGpuRequiredModelSuffix,
    modelSelect,
    modelCardList,
    backendSelect,
    getRuntimeConfigForModel,
    syncGenerationSettingsFromModel,
    persistGenerationConfigForModel,
    setStatus,
    appendDebug,
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
    clearMcpServerFeedback,
    getStoredThemePreference,
    resolveTheme,
    applyTheme,
    importMcpServerEndpoint,
    populateModelSelect,
    refreshMcpServerPreference,
    removeMcpServerPreference,
    setMcpServerFeedback,
    setSelectedModelId,
    normalizeBackendPreference,
    formatBackendPreferenceLabel,
    getAvailableModelId,
    syncModelSelectionForCurrentEnvironment,
    getWebGpuAvailability,
    probeWebGpuAvailability,
    restoreInferencePreferences,
    readEngineConfigFromUI,
    persistInferencePreferences,
  };
}
