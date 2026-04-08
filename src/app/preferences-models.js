import {
  DEFAULT_MODEL,
  MODEL_OPTIONS,
  MODEL_OPTIONS_BY_ID,
  browserSupportsWebGpu,
  getFirstAvailableModelId,
  getModelEngineType,
  getModelAvailability,
  normalizeModelId,
  normalizeSupportedBackendPreference,
} from '../config/model-settings.js';

const BACKEND_FALLBACK = 'webgpu';
const DEFAULT_LANGUAGE_TAG_COUNT = 4;
const INTEGER_FORMATTER = new Intl.NumberFormat('en-US');
const MODEL_FEATURE_DEFINITIONS = Object.freeze([
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
]);

function formatInteger(value) {
  return INTEGER_FORMATTER.format(Math.max(0, Number(value) || 0));
}

function formatWordEstimate(tokenCount) {
  const roundedEstimate = Math.round(((Number(tokenCount) || 0) * 0.75) / 100) * 100;
  return formatInteger(roundedEstimate);
}

function buildLanguageSupportText(model) {
  const tags = Array.isArray(model?.languageSupport?.tags) ? model.languageSupport.tags : [];
  if (!tags.length) {
    return '';
  }
  return tags.map((tag) => `${tag.name} (${tag.code})`).join(', ');
}

function shouldShowLanguageOverflow(model, visibleTagCount = DEFAULT_LANGUAGE_TAG_COUNT) {
  const tags = Array.isArray(model?.languageSupport?.tags) ? model.languageSupport.tags : [];
  return tags.length > visibleTagCount || model?.languageSupport?.hasMore === true;
}

/**
 * @param {object} options
 * @param {any} options.appState
 * @param {Storage} [options.storage]
 * @param {Navigator} [options.navigatorRef]
 * @param {Document} [options.documentRef]
 * @param {string} options.modelStorageKey
 * @param {string} options.backendStorageKey
 * @param {Set<string>} [options.supportedBackendPreferences]
 * @param {string} [options.webGpuRequiredModelSuffix]
 * @param {HTMLSelectElement | null} [options.modelSelect]
 * @param {HTMLElement | null} [options.modelCardList]
 * @param {HTMLSelectElement | null} [options.backendSelect]
 * @param {(modelId: string) => any} options.getRuntimeConfigForModel
 * @param {(modelId: string, resetQueuedValues: boolean) => void} options.syncGenerationSettingsFromModel
 * @param {(modelId: string, generationConfig: any) => void} options.persistGenerationConfigForModel
 * @param {(message: string) => void} options.setStatus
 * @param {(message: string) => void} options.appendDebug
 * @param {() => void} [options.onSelectedModelCardChange]
 */
export function createModelPreferencesController({
  appState,
  storage = globalThis.localStorage,
  navigatorRef = globalThis.navigator,
  documentRef = document,
  modelStorageKey,
  backendStorageKey,
  supportedBackendPreferences = new Set([BACKEND_FALLBACK]),
  webGpuRequiredModelSuffix = '',
  modelSelect,
  modelCardList,
  backendSelect,
  getRuntimeConfigForModel,
  syncGenerationSettingsFromModel,
  persistGenerationConfigForModel,
  setStatus,
  appendDebug,
  onSelectedModelCardChange,
}) {
  const supportedBackendPreferenceSet =
    supportedBackendPreferences instanceof Set
      ? supportedBackendPreferences
      : new Set([BACKEND_FALLBACK]);

  function normalizeBackendPreference(value) {
    const normalized = normalizeSupportedBackendPreference(value);
    if (supportedBackendPreferenceSet.has(normalized)) {
      return normalized;
    }
    return BACKEND_FALLBACK;
  }

  function getSelectedBackendPreference() {
    return normalizeBackendPreference(backendSelect?.value || BACKEND_FALLBACK);
  }

  function formatBackendPreferenceLabel(value) {
    if (value === 'webgpu') {
      return 'WebGPU';
    }
    if (value === 'cpu') {
      return 'CPU';
    }
    return 'WebGPU';
  }

  function getWebGpuAvailability() {
    if (appState.webGpuProbeCompleted) {
      return appState.webGpuAdapterAvailable;
    }
    return browserSupportsWebGpu(navigatorRef);
  }

  function isVisibleModelId(modelId) {
    return MODEL_OPTIONS.some((model) => model.id === modelId);
  }

  function getAvailableModelId(modelId, backendPreference = getSelectedBackendPreference()) {
    const normalizedModelId = normalizeModelId(modelId);
    const webGpuAvailable = getWebGpuAvailability();
    if (!isVisibleModelId(normalizedModelId)) {
      return getFirstAvailableModelId({
        backendPreference,
        webGpuAvailable,
      });
    }
    const availability = getModelAvailability(normalizedModelId, {
      backendPreference,
      webGpuAvailable,
    });
    if (availability.available) {
      return normalizedModelId;
    }
    return getFirstAvailableModelId({
      backendPreference,
      webGpuAvailable,
    });
  }

  function getModelPickerValue() {
    return modelSelect?.value || DEFAULT_MODEL;
  }

  function buildFeatureTokens(model) {
    const features = model?.features || {};
    const runtime = model?.runtime || {};
    return MODEL_FEATURE_DEFINITIONS.filter((feature) => {
      if (
        feature.key === 'imageInput' ||
        feature.key === 'audioInput' ||
        feature.key === 'videoInput'
      ) {
        return features[feature.key] === true && runtime.multimodalGeneration === true;
      }
      return features[feature.key] === true;
    });
  }

  function createLanguageSupportNode(model) {
    const tags = Array.isArray(model?.languageSupport?.tags) ? model.languageSupport.tags : [];
    if (!tags.length) {
      return null;
    }

    const languages = documentRef.createElement('p');
    languages.className = 'model-card-languages';

    const languageSupportText = buildLanguageSupportText(model);
    const ariaLabel = shouldShowLanguageOverflow(model)
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
    tags.slice(0, DEFAULT_LANGUAGE_TAG_COUNT).forEach((tag, index) => {
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

    if (shouldShowLanguageOverflow(model) && model.languageSupport.sourceUrl) {
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
    if (typeof onSelectedModelCardChange === 'function') {
      onSelectedModelCardChange();
    }
  }

  function setSelectedModelId(modelId, { dispatch = false } = {}) {
    if (!(modelSelect instanceof HTMLSelectElement)) {
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

    const selectedBackend = getSelectedBackendPreference();
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

      const content = documentRef.createElement('div');
      content.className = 'model-card-content';

      const primary = documentRef.createElement('div');
      primary.className = 'model-card-primary';

      const titleRow = documentRef.createElement('div');
      titleRow.className = 'model-card-title-row';
      const title = documentRef.createElement('span');
      title.className = 'model-card-title';
      title.textContent = model.displayName || model.label;
      titleRow.appendChild(title);

      const titleMeta = documentRef.createElement('div');
      titleMeta.className = 'model-card-title-meta';
      if (model.id === DEFAULT_MODEL) {
        const badge = documentRef.createElement('span');
        badge.className = 'badge text-bg-primary model-card-badge';
        badge.textContent = 'Default';
        titleMeta.appendChild(badge);
      }
      if (!availability.available) {
        const unavailableBadge = documentRef.createElement('span');
        unavailableBadge.className = 'badge model-card-badge model-card-badge-unavailable';
        unavailableBadge.textContent = 'Unavailable';
        titleMeta.appendChild(unavailableBadge);
        selectButton.title = availability.reason;
        selectButton.setAttribute(
          'aria-label',
          `${model.displayName || model.label}. Unavailable. ${availability.reason}`
        );
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
        titleMeta.appendChild(featureList);
      }
      if (titleMeta.childElementCount > 0) {
        titleRow.appendChild(titleMeta);
      }
      primary.appendChild(titleRow);

      const context = documentRef.createElement('p');
      context.className = 'model-card-context';
      context.innerHTML = `<i class="bi bi-text-paragraph" aria-hidden="true"></i> <strong>${formatInteger(
        model.generation.maxContextTokens
      )} tokens</strong> / about ${formatWordEstimate(model.generation.maxContextTokens)} words`;
      primary.appendChild(context);
      content.appendChild(primary);

      if (!availability.available) {
        const availabilityNote = documentRef.createElement('p');
        availabilityNote.className = 'model-card-note';
        availabilityNote.textContent = `Unavailable in this app. ${availability.reason}`;
        content.appendChild(availabilityNote);
      } else if (model.runtime?.requiresWebGpu) {
        const requirement = documentRef.createElement('p');
        requirement.className = 'model-card-note';
        requirement.textContent = 'This model requires WebGPU.';
        content.appendChild(requirement);
      }
      selectButton.appendChild(content);

      selectButton.addEventListener('click', () => {
        if (selectButton.disabled) {
          return;
        }
        setSelectedModelId(model.id, { dispatch: true });
      });
      card.appendChild(selectButton);

      const feedbackSlot = documentRef.createElement('div');
      feedbackSlot.className = 'model-card-feedback-slot';
      card.appendChild(feedbackSlot);

      const footer = documentRef.createElement('div');
      footer.className = 'model-card-footer';
      const languages = createLanguageSupportNode(model);
      if (languages) {
        footer.appendChild(languages);
      }
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
    if (!(modelSelect instanceof HTMLSelectElement)) {
      return;
    }

    const selectedBackend = getSelectedBackendPreference();
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
        !availability.available && model.runtime?.requiresWebGpu
          ? `${model.label}${webGpuRequiredModelSuffix}`
          : !availability.available
            ? `${model.label} (Unavailable)`
            : model.label;
      modelSelect.appendChild(option);
    });

    setSelectedModelId(getAvailableModelId(selectedModel, selectedBackend), { dispatch: false });
    populateModelCards();
  }

  function syncModelSelectionForCurrentEnvironment({ announceFallback = false } = {}) {
    if (!(modelSelect instanceof HTMLSelectElement)) {
      return DEFAULT_MODEL;
    }

    const selectedBackend = getSelectedBackendPreference();
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
      if (requestedModel) {
        setStatus(
          requestedModel.runtime?.requiresWebGpu
            ? `${requestedModel.label} is unavailable with ${formatBackendPreferenceLabel(selectedBackend)}. ${availability.reason} Switched to ${selectedModelId}.`
            : `${requestedModel.label} is unavailable. ${availability.reason} Switched to ${selectedModelId}.`
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

    if (modelSelect instanceof HTMLSelectElement && storedModel) {
      const normalizedModel = normalizeModelId(storedModel);
      setSelectedModelId(normalizedModel, { dispatch: false });
      storage.setItem(modelStorageKey, normalizedModel);
    }

    if (backendSelect instanceof HTMLSelectElement && storedBackend) {
      const normalizedBackend = normalizeBackendPreference(storedBackend);
      backendSelect.value = normalizedBackend;
      storage.setItem(backendStorageKey, normalizedBackend);
    }

    const selectedModel = syncModelSelectionForCurrentEnvironment();
    storage.setItem(modelStorageKey, selectedModel);
    syncGenerationSettingsFromModel(selectedModel, true);
  }

  function readEngineConfigFromUI(activeGenerationConfig) {
    const selectedBackend = getSelectedBackendPreference();
    const selectedModel = getAvailableModelId(getModelPickerValue(), selectedBackend);
    setSelectedModelId(selectedModel, { dispatch: false });
    if (backendSelect instanceof HTMLSelectElement && backendSelect.value !== selectedBackend) {
      backendSelect.value = selectedBackend;
    }
    syncGenerationSettingsFromModel(selectedModel, false);
    return {
      engineType: getModelEngineType(selectedModel),
      modelId: selectedModel,
      backendPreference: selectedBackend,
      runtime: getRuntimeConfigForModel(selectedModel),
      generationConfig: activeGenerationConfig,
    };
  }

  function persistInferencePreferences(activeGenerationConfig) {
    const selectedBackend = getSelectedBackendPreference();
    const selectedModel = getAvailableModelId(getModelPickerValue(), selectedBackend);
    setSelectedModelId(selectedModel, { dispatch: false });
    if (backendSelect instanceof HTMLSelectElement && backendSelect.value !== selectedBackend) {
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
      const navigableButtons = Array.from(
        modelCardList.querySelectorAll('.model-card-button')
      ).reduce((buttons, button) => {
        if (button instanceof HTMLButtonElement && !button.disabled) {
          buttons.push(button);
        }
        return buttons;
      }, []);
      if (!navigableButtons.length) {
        return;
      }

      event.preventDefault();
      if (event.key === 'Home') {
        navigableButtons[0].focus();
        setSelectedModelId(navigableButtons[0].dataset.modelId || DEFAULT_MODEL, {
          dispatch: true,
        });
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
        currentIndex < 0
          ? 0
          : (currentIndex + direction + navigableButtons.length) % navigableButtons.length;
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

  return {
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
  };
}
