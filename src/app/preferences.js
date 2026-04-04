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
  enabledToolsStorageKey,
  renderMathMlStorageKey,
  singleKeyShortcutsStorageKey,
  transcriptViewStorageKey,
  conversationPanelCollapsedStorageKey,
  defaultSystemPromptStorageKey,
  modelStorageKey,
  backendStorageKey,
  supportedBackendPreferences,
  webGpuRequiredModelSuffix,
  availableToolDefinitions = [],
  themeSelect,
  showThinkingToggle,
  enableToolCallingToggle,
  toolSettingsList,
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
  setStatus,
  appendDebug,
}) {
  const normalizedAvailableToolDefinitions = Array.isArray(availableToolDefinitions)
    ? availableToolDefinitions
        .filter((tool) => tool && typeof tool === 'object')
        .map((tool) => ({
          name: typeof tool.name === 'string' ? tool.name.trim() : '',
          displayName:
            typeof tool.displayName === 'string' && tool.displayName.trim()
              ? tool.displayName.trim()
              : typeof tool.name === 'string'
                ? tool.name.trim()
                : 'Unknown tool',
          description:
            typeof tool.description === 'string' && tool.description.trim()
              ? tool.description.trim()
              : '',
        }))
        .filter((tool) => tool.name)
    : [];
  const availableToolNameSet = new Set(
    normalizedAvailableToolDefinitions.map((toolDefinition) => toolDefinition.name)
  );

  function getStoredShowThinkingPreference() {
    return storage.getItem(showThinkingStorageKey) === 'true';
  }

  function getStoredToolCallingPreference() {
    const stored = storage.getItem(enableToolCallingStorageKey);
    return stored === null ? true : stored === 'true';
  }

  function getDefaultEnabledToolNames() {
    return normalizedAvailableToolDefinitions.map((toolDefinition) => toolDefinition.name);
  }

  function normalizeEnabledToolNames(value) {
    const requestedToolNames = Array.isArray(value)
      ? value
          .map((toolName) => (typeof toolName === 'string' ? toolName.trim() : ''))
          .filter(Boolean)
      : [];
    const requestedToolNameSet = new Set(requestedToolNames);
    return normalizedAvailableToolDefinitions
      .map((toolDefinition) => toolDefinition.name)
      .filter((toolName) => requestedToolNameSet.has(toolName));
  }

  function getStoredEnabledToolNamesPreference() {
    const stored = storage.getItem(enabledToolsStorageKey);
    if (stored === null) {
      return getDefaultEnabledToolNames();
    }
    try {
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? normalizeEnabledToolNames(parsed) : getDefaultEnabledToolNames();
    } catch {
      return getDefaultEnabledToolNames();
    }
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

  function buildToolToggleId(toolName) {
    return `toolSettingToggle-${toolName.replace(/[^a-zA-Z0-9_-]+/g, '-')}`;
  }

  function renderToolAvailabilityPreferences() {
    if (!(toolSettingsList instanceof HTMLElement)) {
      return;
    }
    const enabledToolNameSet = new Set(appState.enabledToolNames);
    toolSettingsList.replaceChildren();
    normalizedAvailableToolDefinitions.forEach((toolDefinition) => {
      const wrapper = documentRef.createElement('div');
      wrapper.className = 'form-check form-switch';

      const input = documentRef.createElement('input');
      input.className = 'form-check-input';
      input.type = 'checkbox';
      input.role = 'switch';
      input.id = buildToolToggleId(toolDefinition.name);
      input.checked = enabledToolNameSet.has(toolDefinition.name);
      input.dataset.toolToggle = 'true';
      input.dataset.toolName = toolDefinition.name;
      input.dataset.toolDisplayName = toolDefinition.displayName;
      wrapper.appendChild(input);

      const label = documentRef.createElement('label');
      label.className = 'form-check-label';
      label.htmlFor = input.id;
      label.textContent = toolDefinition.displayName;
      wrapper.appendChild(label);

      if (toolDefinition.description) {
        const help = documentRef.createElement('p');
        help.className = 'form-text mb-0';
        help.textContent = toolDefinition.description;
        wrapper.appendChild(help);
      }

      toolSettingsList.appendChild(wrapper);
    });
  }

  function applyEnabledToolNamesPreference(value, { persist = false } = {}) {
    appState.enabledToolNames = normalizeEnabledToolNames(value);
    renderToolAvailabilityPreferences();
    if (persist) {
      storage.setItem(enabledToolsStorageKey, JSON.stringify(appState.enabledToolNames));
    }
  }

  function applyToolEnabledPreference(toolName, value, { persist = false } = {}) {
    const normalizedToolName = typeof toolName === 'string' ? toolName.trim() : '';
    if (!availableToolNameSet.has(normalizedToolName)) {
      return;
    }
    const nextEnabledToolNames = new Set(appState.enabledToolNames);
    if (value) {
      nextEnabledToolNames.add(normalizedToolName);
    } else {
      nextEnabledToolNames.delete(normalizedToolName);
    }
    applyEnabledToolNamesPreference([...nextEnabledToolNames], { persist });
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
    backendPreference = normalizeBackendPreference(backendSelect?.value || 'auto')
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

  function getModelPickerValue() {
    return modelSelect?.value || DEFAULT_MODEL;
  }

  function formatInteger(value) {
    return new Intl.NumberFormat('en-US').format(Math.max(0, Number(value) || 0));
  }

  function formatWordEstimate(tokenCount) {
    const roundedEstimate = Math.round(((Number(tokenCount) || 0) * 0.75) / 100) * 100;
    return formatInteger(roundedEstimate);
  }

  function getFeatureDefinitions() {
    return [
      {
        key: 'thinking',
        icon: 'bi-stars',
        label: 'Shows a thinking section',
      },
      {
        key: 'toolCalling',
        icon: 'bi-wrench-adjustable-circle',
        label: 'Can use built-in tools',
      },
      {
        key: 'imageInput',
        icon: 'bi-image',
        label: 'Accepts image input',
      },
      {
        key: 'audioInput',
        icon: 'bi-mic-fill',
        label: 'Accepts audio input',
      },
      {
        key: 'videoInput',
        icon: 'bi-camera-video-fill',
        label: 'Accepts video input',
      },
    ];
  }

  function buildFeatureTokens(model) {
    const features = model?.features || {};
    const runtime = model?.runtime || {};
    return getFeatureDefinitions().filter((feature) => {
      if (feature.key === 'imageInput' || feature.key === 'audioInput' || feature.key === 'videoInput') {
        return features[feature.key] === true && runtime.multimodalGeneration === true;
      }
      return features[feature.key] === true;
    });
  }

  function buildLanguageSupportText(model) {
    const tags = Array.isArray(model?.languageSupport?.tags) ? model.languageSupport.tags : [];
    if (!tags.length) {
      return '';
    }
    return tags.map((tag) => `${tag.name} (${tag.code})`).join(', ');
  }

  function shouldShowLanguageOverflow(model, visibleTagCount) {
    const tags = Array.isArray(model?.languageSupport?.tags) ? model.languageSupport.tags : [];
    return tags.length > visibleTagCount || model?.languageSupport?.hasMore === true;
  }

  function createLanguageSupportNode(model) {
    const tags = Array.isArray(model?.languageSupport?.tags) ? model.languageSupport.tags : [];
    if (!tags.length) {
      return null;
    }
    const visibleTagCount = 4;
    const languages = documentRef.createElement('p');
    languages.className = 'model-card-languages';

    const languageSupportText = buildLanguageSupportText(model);
    const ariaLabel = shouldShowLanguageOverflow(model, visibleTagCount)
      ? `Supported languages: ${languageSupportText}, and more.`
      : `Supported languages: ${languageSupportText}`;
    const tooltipText = ariaLabel.replace(/^Supported languages:\s*/, '');

    const icon = documentRef.createElement('i');
    icon.className = 'bi bi-translate';
    icon.setAttribute('role', 'img');
    icon.setAttribute('aria-label', ariaLabel);
    icon.title = tooltipText;
    languages.appendChild(icon);

    const list = documentRef.createElement('span');
    list.className = 'model-card-language-list';
    tags.slice(0, visibleTagCount).forEach((tag, index) => {
      if (index > 0) {
        list.append(' ');
      }
      const abbr = documentRef.createElement('abbr');
      abbr.className = 'model-card-language-tag';
      abbr.title = tag.name;
      abbr.textContent = tag.code;
      list.appendChild(abbr);
    });
    languages.appendChild(list);

    if (shouldShowLanguageOverflow(model, visibleTagCount) && model.languageSupport.sourceUrl) {
      languages.append(' ');
      const overflowLink = documentRef.createElement('a');
      overflowLink.className = 'model-card-language-overflow';
      overflowLink.href = model.languageSupport.sourceUrl;
      overflowLink.target = '_blank';
      overflowLink.rel = 'noopener noreferrer';
      overflowLink.textContent = 'and more';
      languages.appendChild(overflowLink);
    }

    return languages;
  }

  function syncModelCardSelection() {
    if (!(modelCardList instanceof HTMLElement)) {
      return;
    }
    const selectedModelId = normalizeModelId(getModelPickerValue());
    modelCardList.querySelectorAll('.model-card-button').forEach((button) => {
      if (!(button instanceof HTMLButtonElement)) {
        return;
      }
      const isSelected = button.dataset.modelId === selectedModelId;
      button.classList.toggle('is-selected', isSelected);
      button.setAttribute('aria-checked', String(isSelected));
    });
  }

  function setSelectedModelId(modelId, { dispatch = false } = {}) {
    if (!modelSelect) {
      return DEFAULT_MODEL;
    }
    const nextModelId = normalizeModelId(modelId || DEFAULT_MODEL);
    const changed = modelSelect.value !== nextModelId;
    modelSelect.value = nextModelId;
    syncModelCardSelection();
    if (dispatch && changed) {
      modelSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return nextModelId;
  }

  function populateModelCards() {
    if (!(modelCardList instanceof HTMLElement)) {
      return;
    }
    const selectedBackend = normalizeBackendPreference(backendSelect?.value || 'auto');
    const selectedModel = normalizeModelId(getModelPickerValue());
    const webGpuAvailable = getWebGpuAvailability();
    modelCardList.replaceChildren();
    MODEL_OPTIONS.forEach((model) => {
      const availability = getModelAvailability(model.id, {
        backendPreference: selectedBackend,
        webGpuAvailable,
      });
      const card = documentRef.createElement('article');
      card.className = 'model-card';
      if (!availability.available) {
        card.classList.add('is-unavailable');
      }

      const selectButton = documentRef.createElement('button');
      selectButton.type = 'button';
      selectButton.className = 'model-card-button';
      selectButton.dataset.modelId = model.id;
      selectButton.setAttribute('role', 'radio');
      selectButton.setAttribute('aria-checked', 'false');
      selectButton.disabled = !availability.available;

      const titleRow = documentRef.createElement('div');
      titleRow.className = 'model-card-title-row';
      const title = documentRef.createElement('span');
      title.className = 'model-card-title';
      title.textContent = model.displayName || model.label;
      titleRow.appendChild(title);
      if (model.id === DEFAULT_MODEL) {
        const badge = documentRef.createElement('span');
        badge.className = 'badge text-bg-primary model-card-badge';
        badge.textContent = 'Default';
        titleRow.appendChild(badge);
      }
      selectButton.appendChild(titleRow);

      const context = documentRef.createElement('p');
      context.className = 'model-card-context';
      context.innerHTML = `<i class="bi bi-text-paragraph" aria-hidden="true"></i> <strong>${formatInteger(
        model.generation.maxContextTokens
      )} tokens</strong> / about ${formatWordEstimate(model.generation.maxContextTokens)} words`;
      selectButton.appendChild(context);

      const languages = createLanguageSupportNode(model);
      if (languages) {
        selectButton.appendChild(languages);
      }

      const featureList = documentRef.createElement('ul');
      featureList.className = 'model-card-features';
      buildFeatureTokens(model).forEach((feature) => {
        const item = documentRef.createElement('li');
        item.className = 'model-feature-pill';
        item.setAttribute('aria-label', feature.label);
        item.title = feature.label;
        item.innerHTML = `<i class="bi ${feature.icon}" aria-hidden="true"></i>`;
        featureList.appendChild(item);
      });
      if (featureList.childElementCount > 0) {
        selectButton.appendChild(featureList);
      }

      if (!availability.available) {
        const availabilityNote = documentRef.createElement('p');
        availabilityNote.className = 'model-card-note';
        availabilityNote.textContent = availability.reason;
        selectButton.appendChild(availabilityNote);
      } else if (model.runtime?.requiresWebGpu) {
        const requirement = documentRef.createElement('p');
        requirement.className = 'model-card-note';
        requirement.textContent = 'This model requires WebGPU.';
        selectButton.appendChild(requirement);
      }

      selectButton.addEventListener('click', () => {
        if (selectButton.disabled) {
          return;
        }
        setSelectedModelId(model.id, { dispatch: true });
      });
      card.appendChild(selectButton);

      const footer = documentRef.createElement('div');
      footer.className = 'model-card-footer';
      const detailsLink = documentRef.createElement('a');
      detailsLink.className = 'model-card-link';
      detailsLink.href = model.repositoryUrl || `https://huggingface.co/${model.id}`;
      detailsLink.target = '_blank';
      detailsLink.rel = 'noopener noreferrer';
      detailsLink.textContent = 'Model details';
      footer.appendChild(detailsLink);
      card.appendChild(footer);

      modelCardList.appendChild(card);
    });
    setSelectedModelId(selectedModel, { dispatch: false });
  }

  function populateModelSelect() {
    if (!modelSelect) {
      return;
    }
    const selectedBackend = normalizeBackendPreference(backendSelect?.value || 'auto');
    const selectedModel = normalizeModelId(getModelPickerValue());
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
    setSelectedModelId(getAvailableModelId(selectedModel, selectedBackend), { dispatch: false });
    populateModelCards();
  }

  function syncModelSelectionForCurrentEnvironment({ announceFallback = false } = {}) {
    if (!modelSelect) {
      return DEFAULT_MODEL;
    }

    const selectedBackend = normalizeBackendPreference(backendSelect?.value || 'auto');
    const requestedModelId = normalizeModelId(getModelPickerValue());

    populateModelSelect();

    const selectedModelId = getAvailableModelId(requestedModelId, selectedBackend);
    setSelectedModelId(selectedModelId, { dispatch: false });

    if (announceFallback && selectedModelId !== requestedModelId) {
      const requestedModel = MODEL_OPTIONS_BY_ID.get(requestedModelId);
      const availability = getModelAvailability(requestedModelId, {
        backendPreference: selectedBackend,
        webGpuAvailable: getWebGpuAvailability(),
      });
      if (requestedModel?.runtime?.requiresWebGpu) {
        setStatus(
          `${requestedModel.label} is unavailable with ${formatBackendPreferenceLabel(selectedBackend)}. ${availability.reason} Switched to ${selectedModelId}.`
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
        `WebGPU adapter probe failed: ${error instanceof Error ? error.message : String(error)}`
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
        `${previousModelId} is unavailable because no usable WebGPU adapter was found. Switched to ${selectedModel}.`
      );
    }

    return appState.webGpuAdapterAvailable;
  }

  function restoreInferencePreferences() {
    const storedModel = storage.getItem(modelStorageKey);
    const storedBackend = storage.getItem(backendStorageKey);
    if (modelSelect && storedModel) {
      const normalizedModel = normalizeModelId(storedModel);
      setSelectedModelId(normalizedModel, { dispatch: false });
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
    const selectedModel = getAvailableModelId(getModelPickerValue(), selectedBackend);
    setSelectedModelId(selectedModel, { dispatch: false });
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
    const selectedModel = getAvailableModelId(getModelPickerValue(), selectedBackend);
    setSelectedModelId(selectedModel, { dispatch: false });
    if (backendSelect && backendSelect.value !== selectedBackend) {
      backendSelect.value = selectedBackend;
    }
    storage.setItem(modelStorageKey, selectedModel);
    storage.setItem(backendStorageKey, selectedBackend);
    persistGenerationConfigForModel(selectedModel, activeGenerationConfig);
  }

  if (modelCardList instanceof HTMLElement) {
    modelCardList.addEventListener('keydown', (event) => {
      if (
        event.key !== 'ArrowRight' &&
        event.key !== 'ArrowDown' &&
        event.key !== 'ArrowLeft' &&
        event.key !== 'ArrowUp' &&
        event.key !== 'Home' &&
        event.key !== 'End'
      ) {
        return;
      }
      /** @type {HTMLButtonElement[]} */
      const navigableButtons = Array.from(modelCardList.querySelectorAll('.model-card-button')).reduce(
        (buttons, button) => {
          if (button instanceof HTMLButtonElement && !button.disabled) {
            buttons.push(button);
          }
          return buttons;
        },
        []
      );
      if (!navigableButtons.length) {
        return;
      }
      event.preventDefault();
      if (event.key === 'Home') {
        navigableButtons[0].focus();
        setSelectedModelId(navigableButtons[0].dataset.modelId || DEFAULT_MODEL, { dispatch: true });
        return;
      }
      if (event.key === 'End') {
        const lastButton = navigableButtons[navigableButtons.length - 1];
        lastButton.focus();
        setSelectedModelId(lastButton.dataset.modelId || DEFAULT_MODEL, { dispatch: true });
        return;
      }
      const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
      const currentIndex = navigableButtons.findIndex(
        (button) => button.dataset.modelId === normalizeModelId(getModelPickerValue())
      );
      const nextIndex =
        currentIndex < 0 ? 0 : (currentIndex + direction + navigableButtons.length) % navigableButtons.length;
      const nextButton = navigableButtons[nextIndex];
      nextButton.focus();
      setSelectedModelId(nextButton.dataset.modelId || DEFAULT_MODEL, { dispatch: true });
    });
  }

  if (modelSelect instanceof HTMLSelectElement) {
    modelSelect.addEventListener('change', () => {
      syncModelCardSelection();
    });
  }

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

  renderToolAvailabilityPreferences();

  return {
    getStoredShowThinkingPreference,
    getStoredToolCallingPreference,
    getStoredEnabledToolNamesPreference,
    getStoredMathRenderingPreference,
    getStoredSingleKeyShortcutPreference,
    getStoredTranscriptViewPreference,
    getStoredConversationPanelCollapsedPreference,
    getStoredDefaultSystemPrompt,
    applyDefaultSystemPrompt,
    applyShowThinkingPreference,
    applyToolCallingPreference,
    applyEnabledToolNamesPreference,
    applyToolEnabledPreference,
    applyMathRenderingPreference,
    applySingleKeyShortcutPreference,
    applyTranscriptViewPreference,
    applyConversationPanelCollapsedPreference,
    getStoredThemePreference,
    resolveTheme,
    applyTheme,
    populateModelSelect,
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
