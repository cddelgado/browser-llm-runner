function refreshPromptPreview(refreshConversationSystemPromptPreview) {
  if (typeof refreshConversationSystemPromptPreview === 'function') {
    refreshConversationSystemPromptPreview();
  }
}

export function bindModelSettingsEvents({
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

  if (cpuThreadsInput instanceof HTMLInputElement) {
    cpuThreadsInput.addEventListener('change', () => {
      applyCpuThreadsPreference(cpuThreadsInput.value, { persist: true });
      void reinitializeEngineFromSettings();
    });
  }

  if (
    clearModelDownloadsButton instanceof HTMLButtonElement &&
    typeof clearSelectedModelDownloads === 'function'
  ) {
    clearModelDownloadsButton.addEventListener('click', async () => {
      clearModelDownloadsButton.disabled = true;
      try {
        await clearSelectedModelDownloads();
      } finally {
        clearModelDownloadsButton.disabled = false;
      }
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
      if (!(maxContextTokensInput instanceof HTMLInputElement)) {
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
      if (!(temperatureInput instanceof HTMLInputElement)) {
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
      if (!(topKInput instanceof HTMLInputElement)) {
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
      if (!(topPInput instanceof HTMLInputElement)) {
        return;
      }
      const selectedModel = normalizeModelId(modelSelect?.value || defaultModelId);
      const limits = getModelGenerationLimits(selectedModel);
      topPInput.value = limits.defaultTopP.toFixed(2);
      onGenerationSettingInputChanged();
    });
  }

  if (wllamaPromptCacheToggle instanceof HTMLInputElement) {
    wllamaPromptCacheToggle.addEventListener('change', onWllamaSettingInputChanged);
  }

  if (wllamaBatchSizeInput instanceof HTMLInputElement) {
    wllamaBatchSizeInput.addEventListener('change', onWllamaSettingInputChanged);
  }

  if (wllamaMinPInput instanceof HTMLInputElement) {
    wllamaMinPInput.addEventListener('change', onWllamaSettingInputChanged);
  }
}
