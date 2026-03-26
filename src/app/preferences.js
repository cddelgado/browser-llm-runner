import {
  DEFAULT_MODEL,
  MODEL_OPTIONS,
  MODEL_OPTIONS_BY_ID,
  browserSupportsWebGpu,
  getFirstAvailableModelId,
  getModelAvailability,
  normalizeModelId,
  normalizeSupportedBackendPreference,
} from '../config/model-settings.js';
import { normalizeSystemPrompt } from '../state/conversation-model.js';

export function createPreferencesController({
  appState,
  storage = globalThis.localStorage,
  navigatorRef = globalThis.navigator,
  documentRef = document,
  themeStorageKey,
  showThinkingStorageKey,
  enableToolCallingStorageKey,
  singleKeyShortcutsStorageKey,
  transcriptViewStorageKey,
  defaultSystemPromptStorageKey,
  modelStorageKey,
  backendStorageKey,
  supportedBackendPreferences,
  webGpuRequiredModelSuffix,
  themeSelect,
  showThinkingToggle,
  enableToolCallingToggle,
  enableSingleKeyShortcutsToggle,
  transcriptViewSelect,
  defaultSystemPromptInput,
  modelSelect,
  backendSelect,
  colorSchemeQuery,
  refreshModelThinkingVisibility,
  getRuntimeConfigForModel,
  syncGenerationSettingsFromModel,
  persistGenerationConfigForModel,
  setStatus,
  appendDebug,
}) {
  function getStoredShowThinkingPreference() {
    return storage.getItem(showThinkingStorageKey) === 'true';
  }

  function getStoredToolCallingPreference() {
    const stored = storage.getItem(enableToolCallingStorageKey);
    return stored === null ? true : stored === 'true';
  }

  function getStoredSingleKeyShortcutPreference() {
    const stored = storage.getItem(singleKeyShortcutsStorageKey);
    return stored === null ? true : stored === 'true';
  }

  function getStoredTranscriptViewPreference() {
    return storage.getItem(transcriptViewStorageKey) === 'compact' ? 'compact' : 'standard';
  }

  function getStoredDefaultSystemPrompt() {
    return normalizeSystemPrompt(storage.getItem(defaultSystemPromptStorageKey));
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

  function applyToolCallingPreference(value, { persist = false } = {}) {
    appState.enableToolCalling = Boolean(value);
    if (enableToolCallingToggle instanceof HTMLInputElement) {
      enableToolCallingToggle.checked = appState.enableToolCalling;
    }
    if (persist) {
      storage.setItem(enableToolCallingStorageKey, String(appState.enableToolCalling));
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

  function normalizeBackendPreference(value) {
    const normalized = normalizeSupportedBackendPreference(value);
    if (supportedBackendPreferences.has(normalized)) {
      return normalized;
    }
    return 'auto';
  }

  function formatBackendPreferenceLabel(value) {
    if (value === 'webgpu') {
      return 'WebGPU only';
    }
    if (value === 'wasm') {
      return 'WASM only';
    }
    if (value === 'cpu') {
      return 'CPU only';
    }
    return 'Auto';
  }

  function getWebGpuAvailability() {
    if (appState.webGpuProbeCompleted) {
      return appState.webGpuAdapterAvailable;
    }
    return browserSupportsWebGpu(navigatorRef);
  }

  function getAvailableModelId(
    modelId,
    backendPreference = normalizeBackendPreference(backendSelect?.value || 'auto'),
  ) {
    const normalizedModelId = normalizeModelId(modelId);
    const availability = getModelAvailability(normalizedModelId, {
      backendPreference,
      webGpuAvailable: getWebGpuAvailability(),
    });
    if (availability.available) {
      return normalizedModelId;
    }
    return getFirstAvailableModelId({
      backendPreference,
      webGpuAvailable: getWebGpuAvailability(),
    });
  }

  function populateModelSelect() {
    if (!modelSelect) {
      return;
    }
    const selectedBackend = normalizeBackendPreference(backendSelect?.value || 'auto');
    const selectedModel = normalizeModelId(modelSelect.value || DEFAULT_MODEL);
    const webGpuAvailable = getWebGpuAvailability();
    modelSelect.replaceChildren();
    MODEL_OPTIONS.forEach((model) => {
      const option = documentRef.createElement('option');
      option.value = model.id;
      const availability = getModelAvailability(model.id, {
        backendPreference: selectedBackend,
        webGpuAvailable,
      });
      option.disabled = !availability.available;
      option.textContent =
        model.runtime?.requiresWebGpu && !availability.available
          ? `${model.label}${webGpuRequiredModelSuffix}`
          : model.label;
      modelSelect.appendChild(option);
    });
    modelSelect.value = getAvailableModelId(selectedModel, selectedBackend);
  }

  function syncModelSelectionForCurrentEnvironment({ announceFallback = false } = {}) {
    if (!modelSelect) {
      return DEFAULT_MODEL;
    }

    const selectedBackend = normalizeBackendPreference(backendSelect?.value || 'auto');
    const requestedModelId = normalizeModelId(modelSelect.value || DEFAULT_MODEL);

    populateModelSelect();

    const selectedModelId = getAvailableModelId(requestedModelId, selectedBackend);
    if (modelSelect.value !== selectedModelId) {
      modelSelect.value = selectedModelId;
    }

    if (announceFallback && selectedModelId !== requestedModelId) {
      const requestedModel = MODEL_OPTIONS_BY_ID.get(requestedModelId);
      const availability = getModelAvailability(requestedModelId, {
        backendPreference: selectedBackend,
        webGpuAvailable: getWebGpuAvailability(),
      });
      if (requestedModel?.runtime?.requiresWebGpu) {
        setStatus(
          `${requestedModel.label} is unavailable with ${formatBackendPreferenceLabel(selectedBackend)}. ${availability.reason} Switched to ${selectedModelId}.`,
        );
      }
    }

    return selectedModelId;
  }

  async function probeWebGpuAvailability() {
    if (!browserSupportsWebGpu(navigatorRef)) {
      appState.webGpuProbeCompleted = true;
      appState.webGpuAdapterAvailable = false;
      const selectedModel = syncModelSelectionForCurrentEnvironment();
      syncGenerationSettingsFromModel(selectedModel, true);
      return false;
    }

    try {
      const gpuNavigator = /** @type {any} */ (navigatorRef);
      const adapter = await gpuNavigator.gpu.requestAdapter();
      appState.webGpuProbeCompleted = true;
      appState.webGpuAdapterAvailable = Boolean(adapter);
    } catch (error) {
      appState.webGpuProbeCompleted = true;
      appState.webGpuAdapterAvailable = false;
      appendDebug(
        `WebGPU adapter probe failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const previousModelId = normalizeModelId(modelSelect?.value || DEFAULT_MODEL);
    const selectedModel = syncModelSelectionForCurrentEnvironment();
    syncGenerationSettingsFromModel(selectedModel, true);

    if (
      previousModelId !== selectedModel &&
      MODEL_OPTIONS_BY_ID.get(previousModelId)?.runtime?.requiresWebGpu &&
      !appState.webGpuAdapterAvailable
    ) {
      setStatus(
        `${previousModelId} is unavailable because no usable WebGPU adapter was found. Switched to ${selectedModel}.`,
      );
    }

    return appState.webGpuAdapterAvailable;
  }

  function restoreInferencePreferences() {
    const storedModel = storage.getItem(modelStorageKey);
    const storedBackend = storage.getItem(backendStorageKey);
    if (modelSelect && storedModel) {
      const normalizedModel = normalizeModelId(storedModel);
      modelSelect.value = normalizedModel;
      storage.setItem(modelStorageKey, normalizedModel);
    }
    if (backendSelect && storedBackend) {
      const normalizedBackend = normalizeBackendPreference(storedBackend);
      backendSelect.value = normalizedBackend;
      storage.setItem(backendStorageKey, normalizedBackend);
    }
    const selectedModel = syncModelSelectionForCurrentEnvironment();
    syncGenerationSettingsFromModel(selectedModel, true);
  }

  function readEngineConfigFromUI(activeGenerationConfig) {
    const selectedBackend = normalizeBackendPreference(backendSelect?.value || 'auto');
    const selectedModel = getAvailableModelId(modelSelect?.value || DEFAULT_MODEL, selectedBackend);
    if (modelSelect && modelSelect.value !== selectedModel) {
      modelSelect.value = selectedModel;
    }
    if (backendSelect && backendSelect.value !== selectedBackend) {
      backendSelect.value = selectedBackend;
    }
    syncGenerationSettingsFromModel(selectedModel, false);
    return {
      modelId: selectedModel,
      backendPreference: selectedBackend,
      runtime: getRuntimeConfigForModel(selectedModel),
      generationConfig: activeGenerationConfig,
    };
  }

  function persistInferencePreferences(activeGenerationConfig) {
    const selectedBackend = normalizeBackendPreference(backendSelect?.value || 'auto');
    const selectedModel = getAvailableModelId(modelSelect?.value || DEFAULT_MODEL, selectedBackend);
    if (modelSelect && modelSelect.value !== selectedModel) {
      modelSelect.value = selectedModel;
    }
    if (backendSelect && backendSelect.value !== selectedBackend) {
      backendSelect.value = selectedBackend;
    }
    storage.setItem(modelStorageKey, selectedModel);
    storage.setItem(backendStorageKey, selectedBackend);
    persistGenerationConfigForModel(selectedModel, activeGenerationConfig);
  }

  return {
    getStoredShowThinkingPreference,
    getStoredToolCallingPreference,
    getStoredSingleKeyShortcutPreference,
    getStoredTranscriptViewPreference,
    getStoredDefaultSystemPrompt,
    applyDefaultSystemPrompt,
    applyShowThinkingPreference,
    applyToolCallingPreference,
    applySingleKeyShortcutPreference,
    applyTranscriptViewPreference,
    getStoredThemePreference,
    resolveTheme,
    applyTheme,
    populateModelSelect,
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
