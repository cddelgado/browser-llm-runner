import { isEngineReady } from '../state/app-state.js';

function refreshPromptPreview(refreshConversationSystemPromptPreview) {
  if (typeof refreshConversationSystemPromptPreview === 'function') {
    refreshConversationSystemPromptPreview();
  }
}

export function bindModelSettingsEvents({
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
}) {
  if (renderMathMlToggle instanceof HTMLInputElement) {
    renderMathMlToggle.addEventListener('change', (event) => {
      const value = event.target instanceof HTMLInputElement ? event.target.checked : true;
      applyMathRenderingPreference(value, { persist: true });
      refreshPromptPreview(refreshConversationSystemPromptPreview);
      if (typeof refreshMathRendering === 'function') {
        refreshMathRendering();
      }
      setStatus(value ? 'Math rendering enabled.' : 'Math rendering disabled.');
    });
  }

  if (enableSingleKeyShortcutsToggle instanceof HTMLInputElement) {
    enableSingleKeyShortcutsToggle.addEventListener('change', (event) => {
      const value = event.target instanceof HTMLInputElement ? event.target.checked : true;
      applySingleKeyShortcutPreference(value, { persist: true });
      setStatus(
        value
          ? 'Single-key transcript shortcuts enabled.'
          : 'Single-key transcript shortcuts disabled.'
      );
    });
  }

  if (transcriptViewSelect instanceof HTMLSelectElement) {
    transcriptViewSelect.addEventListener('change', (event) => {
      const value = event.target instanceof HTMLSelectElement ? event.target.value : 'standard';
      applyTranscriptViewPreference(value, { persist: true });
      setStatus(
        value === 'compact'
          ? 'Compact transcript view enabled.'
          : 'Standard transcript view enabled.'
      );
    });
  }

  if (defaultSystemPromptInput instanceof HTMLTextAreaElement) {
    defaultSystemPromptInput.addEventListener('change', (event) => {
      const value = event.target instanceof HTMLTextAreaElement ? event.target.value : '';
      applyDefaultSystemPrompt(value, { persist: true });
      refreshPromptPreview(refreshConversationSystemPromptPreview);
    });
  }

  if (conversationLanguageSelect instanceof HTMLSelectElement) {
    conversationLanguageSelect.addEventListener('change', (event) => {
      const value = event.target instanceof HTMLSelectElement ? event.target.value : 'auto';
      applyConversationLanguagePreference(value, { persist: true });
      refreshPromptPreview(refreshConversationSystemPromptPreview);
      setStatus('Response language updated.');
    });
  }

  if (enableModelThinkingToggle instanceof HTMLInputElement) {
    enableModelThinkingToggle.addEventListener('change', (event) => {
      const value = event.target instanceof HTMLInputElement ? event.target.checked : true;
      applyConversationThinkingPreference(value, { persist: true });
      refreshPromptPreview(refreshConversationSystemPromptPreview);
      setStatus(
        value ? 'Model thinking enabled when supported.' : 'Model thinking disabled when supported.'
      );
    });
  }

  function handleModelPreferenceChange({ announceFallback = false } = {}) {
    const selectedModel = syncModelSelectionForCurrentEnvironment({ announceFallback });
    syncGenerationSettingsFromModel(selectedModel, true);
    const activeConversation = getActiveConversation();
    if (activeConversation) {
      const { changed } = assignConversationModelId(activeConversation, selectedModel);
      if (changed) {
        queueConversationStateSave();
      }
    }
    if (typeof syncConversationLanguageAndThinkingControls === 'function') {
      syncConversationLanguageAndThinkingControls(activeConversation);
    }
    refreshPromptPreview(refreshConversationSystemPromptPreview);
    void reinitializeEngineFromSettings();
  }

  if (modelSelect instanceof HTMLSelectElement) {
    modelSelect.addEventListener('change', () => {
      handleModelPreferenceChange();
    });
  }

  if (backendSelect instanceof HTMLSelectElement) {
    backendSelect.addEventListener('change', () => {
      handleModelPreferenceChange({ announceFallback: true });
    });
  }

  if (maxOutputTokensInput instanceof HTMLInputElement) {
    maxOutputTokensInput.addEventListener('change', onGenerationSettingInputChanged);
  }

  if (maxContextTokensInput instanceof HTMLInputElement) {
    maxContextTokensInput.addEventListener('change', onGenerationSettingInputChanged);
  }

  if (temperatureInput instanceof HTMLInputElement) {
    temperatureInput.addEventListener('change', onGenerationSettingInputChanged);
  }

  if (resetContextTokensButton instanceof HTMLButtonElement) {
    resetContextTokensButton.addEventListener('click', () => {
      if (!isEngineReady(appState) || !(maxContextTokensInput instanceof HTMLInputElement)) {
        return;
      }
      const selectedModel = normalizeModelId(modelSelect?.value || defaultModelId);
      const limits = getModelGenerationLimits(selectedModel);
      maxContextTokensInput.value = String(limits.defaultMaxContextTokens);
      onGenerationSettingInputChanged();
    });
  }

  if (resetTemperatureButton instanceof HTMLButtonElement) {
    resetTemperatureButton.addEventListener('click', () => {
      if (!isEngineReady(appState) || !(temperatureInput instanceof HTMLInputElement)) {
        return;
      }
      const selectedModel = normalizeModelId(modelSelect?.value || defaultModelId);
      const limits = getModelGenerationLimits(selectedModel);
      temperatureInput.value = limits.defaultTemperature.toFixed(1);
      onGenerationSettingInputChanged();
    });
  }

  if (topKInput instanceof HTMLInputElement) {
    topKInput.addEventListener('change', onGenerationSettingInputChanged);
  }

  if (topPInput instanceof HTMLInputElement) {
    topPInput.addEventListener('change', onGenerationSettingInputChanged);
  }

  if (resetTopKButton instanceof HTMLButtonElement) {
    resetTopKButton.addEventListener('click', () => {
      if (!isEngineReady(appState) || !(topKInput instanceof HTMLInputElement)) {
        return;
      }
      const selectedModel = normalizeModelId(modelSelect?.value || defaultModelId);
      const limits = getModelGenerationLimits(selectedModel);
      topKInput.value = String(limits.defaultTopK);
      onGenerationSettingInputChanged();
    });
  }

  if (resetTopPButton instanceof HTMLButtonElement) {
    resetTopPButton.addEventListener('click', () => {
      if (!isEngineReady(appState) || !(topPInput instanceof HTMLInputElement)) {
        return;
      }
      const selectedModel = normalizeModelId(modelSelect?.value || defaultModelId);
      const limits = getModelGenerationLimits(selectedModel);
      topPInput.value = limits.defaultTopP.toFixed(2);
      onGenerationSettingInputChanged();
    });
  }
}
