import {
  buildDefaultGenerationConfig,
  sanitizeGenerationConfig,
} from '../config/generation-config.js';
import {
  buildCloudModelId,
  REMOTE_MODEL_GENERATION_LIMITS,
  mergeCloudProviderConfigs,
  normalizeCloudProviderConfigs,
  getCloudProviderById,
} from '../cloud/cloud-provider-config.js';

const RATE_LIMIT_UNITS = Object.freeze({
  seconds: 1000,
  minutes: 60 * 1000,
  hours: 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
  weeks: 7 * 24 * 60 * 60 * 1000,
});
const RATE_LIMIT_UNIT_OPTIONS = Object.freeze([
  ['seconds', 'Seconds'],
  ['minutes', 'Minutes'],
  ['hours', 'Hours'],
  ['days', 'Days'],
  ['weeks', 'Weeks'],
]);

function buildAlertClasses(variant) {
  return [
    'alert',
    variant === 'danger'
      ? 'alert-warning'
      : variant === 'success'
        ? 'alert-success'
        : 'alert-secondary',
    'py-2',
    'px-3',
    'mb-0',
  ];
}

function captureAccordionUiState(documentRef, container) {
  if (!(container instanceof HTMLElement)) {
    return {
      expandedPanelIds: new Set(),
      focusedElementId: '',
      scrollTop: 0,
    };
  }
  const expandedPanelIds = new Set(
    Array.from(container.querySelectorAll('.accordion-collapse.show'))
      .map((panel) => (panel instanceof HTMLElement ? panel.id : ''))
      .filter(Boolean)
  );
  const activeElement =
    documentRef.activeElement instanceof HTMLElement &&
    container.contains(documentRef.activeElement)
      ? documentRef.activeElement
      : null;
  return {
    expandedPanelIds,
    focusedElementId: activeElement?.id || '',
    scrollTop: container.scrollTop,
  };
}

function restoreAccordionUiState(
  documentRef,
  container,
  { expandedPanelIds, focusedElementId, scrollTop }
) {
  if (!(container instanceof HTMLElement)) {
    return;
  }
  expandedPanelIds.forEach((panelId) => {
    const panel = documentRef.getElementById(panelId);
    if (!(panel instanceof HTMLElement)) {
      return;
    }
    panel.classList.add('show');
    const headerButton = container.querySelector(`[data-bs-target="#${panelId}"]`);
    if (headerButton instanceof HTMLElement) {
      headerButton.classList.remove('collapsed');
      headerButton.setAttribute('aria-expanded', 'true');
    }
  });
  container.scrollTop = typeof scrollTop === 'number' ? scrollTop : 0;
  if (focusedElementId) {
    const focusedElement = documentRef.getElementById(focusedElementId);
    if (focusedElement instanceof HTMLElement) {
      focusedElement.focus({ preventScroll: true });
    }
  }
}

function createMetadataEntry(documentRef, list, label, value) {
  if (!(list instanceof HTMLElement) || !value) {
    return;
  }
  const term = documentRef.createElement('dt');
  term.textContent = label;
  list.appendChild(term);
  const description = documentRef.createElement('dd');
  if (/^https?:\/\//i.test(value)) {
    const code = documentRef.createElement('code');
    code.textContent = value;
    description.appendChild(code);
  } else {
    description.textContent = value;
  }
  list.appendChild(description);
}

function normalizeStoredGenerationConfig(
  getStoredGenerationConfigForModel,
  getModelGenerationLimits,
  modelId
) {
  const limits = getModelGenerationLimits(modelId);
  const storedConfig =
    typeof getStoredGenerationConfigForModel === 'function'
      ? getStoredGenerationConfigForModel(modelId)
      : null;
  return {
    limits,
    config: storedConfig || buildDefaultGenerationConfig(limits),
  };
}

function buildProviderPanelId(providerId) {
  return `cloudProviderPanel-${providerId.replace(/[^a-zA-Z0-9_-]+/g, '-')}`;
}

function buildProviderHeadingId(providerId) {
  return `cloudProviderHeading-${providerId.replace(/[^a-zA-Z0-9_-]+/g, '-')}`;
}

function buildProviderModelToggleId(providerId, modelId) {
  return `cloudProviderModelToggle-${providerId.replace(/[^a-zA-Z0-9_-]+/g, '-')}-${modelId.replace(/[^a-zA-Z0-9_-]+/g, '-')}`;
}

function buildConfiguredModelPanelId(providerId, modelId) {
  return `cloudConfiguredModelPanel-${providerId.replace(/[^a-zA-Z0-9_-]+/g, '-')}-${modelId.replace(/[^a-zA-Z0-9_-]+/g, '-')}`;
}

function buildConfiguredModelFeatureToggleId(providerId, modelId, featureKey) {
  return `cloudConfiguredModelFeature-${providerId.replace(/[^a-zA-Z0-9_-]+/g, '-')}-${modelId.replace(/[^a-zA-Z0-9_-]+/g, '-')}-${featureKey.replace(/[^a-zA-Z0-9_-]+/g, '-')}`;
}

function buildProviderSecretInputId(providerId) {
  return `cloudProviderSecret-${providerId.replace(/[^a-zA-Z0-9_-]+/g, '-')}`;
}

function cloudModelSupportsDetectedToolCalling(model) {
  return model?.detectedFeatures?.toolCalling === true;
}

function cloudModelToolCallingEnabled(model) {
  return model?.features?.toolCalling === true;
}

function buildCloudModelToolCallingHelpText(model) {
  if (cloudModelSupportsDetectedToolCalling(model)) {
    return 'Provider metadata suggests this model supports tool or function calling. Leave this on to include built-in tool instructions in the computed system prompt for this model.';
  }
  return 'Provider metadata did not confirm tool or function calling. Turn this on only when you know the model can follow prompt-directed JSON tool calls.';
}

function toRateLimitWindowParts(rateLimit) {
  if (!Number.isInteger(rateLimit?.windowMs) || rateLimit.windowMs <= 0) {
    return {
      value: '',
      unit: 'minutes',
    };
  }
  const matchingUnit =
    RATE_LIMIT_UNIT_OPTIONS.map(([unit]) => unit)
      .reverse()
      .find(
        (unit) =>
          rateLimit.windowMs >= RATE_LIMIT_UNITS[unit] &&
          rateLimit.windowMs % RATE_LIMIT_UNITS[unit] === 0
      ) || 'seconds';
  return {
    value: String(Math.max(1, Math.round(rateLimit.windowMs / RATE_LIMIT_UNITS[matchingUnit]))),
    unit: matchingUnit,
  };
}

function normalizeRateLimitInput(candidate) {
  const maxRequests = Number.parseInt(String(candidate?.maxRequests ?? ''), 10);
  const windowValue = Number.parseInt(
    String(candidate?.windowValue ?? candidate?.windowMinutes ?? ''),
    10
  );
  const windowUnit = Object.prototype.hasOwnProperty.call(RATE_LIMIT_UNITS, candidate?.windowUnit)
    ? candidate.windowUnit
    : 'minutes';
  if (!Number.isInteger(maxRequests) || maxRequests <= 0) {
    return null;
  }
  if (!Number.isInteger(windowValue) || windowValue <= 0) {
    return null;
  }
  return {
    maxRequests,
    windowMs: windowValue * RATE_LIMIT_UNITS[windowUnit],
  };
}

export function createCloudProviderSettingsController({
  appState,
  documentRef = document,
  preconfiguredProviders = [],
  cloudProviderAddFeedback = null,
  cloudProvidersList = null,
  inspectCloudProviderEndpoint,
  loadCloudProviders,
  saveCloudProvider,
  saveCloudProviderSecret,
  updateCloudProvider,
  removeCloudProvider,
  getCloudProviderSecret,
  onProvidersChanged = null,
  getStoredGenerationConfigForModel,
  persistGenerationConfigForModel,
  getModelGenerationLimits,
  syncGenerationSettingsFromModel,
  getSelectedModelId,
}) {
  function setCloudProviderFeedback(message = '', variant = 'info') {
    if (!(cloudProviderAddFeedback instanceof HTMLElement)) {
      return;
    }
    const normalizedMessage = typeof message === 'string' ? message.trim() : '';
    cloudProviderAddFeedback.className = '';
    cloudProviderAddFeedback.replaceChildren();
    if (!normalizedMessage) {
      cloudProviderAddFeedback.classList.add('d-none');
      cloudProviderAddFeedback.removeAttribute('role');
      return;
    }
    cloudProviderAddFeedback.classList.remove('d-none');
    cloudProviderAddFeedback.setAttribute('role', variant === 'danger' ? 'alert' : 'status');
    cloudProviderAddFeedback.classList.add(...buildAlertClasses(variant));
    cloudProviderAddFeedback.textContent = normalizedMessage;
  }

  function clearCloudProviderFeedback() {
    setCloudProviderFeedback('');
  }

  function notifyProvidersChanged() {
    if (typeof onProvidersChanged === 'function') {
      onProvidersChanged(appState.cloudProviders);
    }
  }

  function mergeProviders(providers) {
    return mergeCloudProviderConfigs(preconfiguredProviders, providers);
  }

  function applyCloudProviders(providers) {
    appState.cloudProviders = mergeProviders(providers);
    renderCloudProviderPreferences();
    notifyProvidersChanged();
    return appState.cloudProviders;
  }

  async function reloadCloudProvidersFromStorage() {
    if (typeof loadCloudProviders !== 'function') {
      return applyCloudProviders([]);
    }
    const providers = await loadCloudProviders();
    return applyCloudProviders(providers);
  }

  function renderConfiguredModelPanel(documentRef, provider, model, container) {
    if (!(container instanceof HTMLElement)) {
      return;
    }
    const modelId = buildCloudModelId(provider.id, model.id);
    const { config, limits } = normalizeStoredGenerationConfig(
      getStoredGenerationConfigForModel,
      getModelGenerationLimits,
      modelId
    );
    const panelId = buildConfiguredModelPanelId(provider.id, model.id);

    const body = documentRef.createElement('div');
    body.id = panelId;
    body.className = 'cloud-model-config-panel border rounded p-3 mt-2 d-flex flex-column gap-3';
    body.dataset.cloudModelConfig = 'true';
    body.dataset.cloudProviderId = provider.id;
    body.dataset.cloudRemoteModelId = model.id;
    body.dataset.cloudCatalogModelId = modelId;

    const heading = documentRef.createElement('h5');
    heading.className = 'h6 mb-0';
    heading.textContent = `${model.displayName} defaults`;
    body.appendChild(heading);

    const intro = documentRef.createElement('p');
    intro.className = 'form-text mt-0 mb-0';
    intro.textContent =
      'These defaults stay local to this browser. Context size is enforced approximately for remote models.';
    body.appendChild(intro);

    if (model.managed) {
      const managedNote = documentRef.createElement('div');
      managedNote.className = 'alert alert-secondary py-2 px-3 mb-0';
      managedNote.textContent =
        'This model is preconfigured by the app. It stays in the picker, and its shipped endpoint, base defaults, and rate limit are managed here.';
      body.appendChild(managedNote);
    }

    const toolCallingToggleWrapper = documentRef.createElement('div');
    toolCallingToggleWrapper.className = 'settings-control-group';
    const toolCallingToggleRow = documentRef.createElement('div');
    toolCallingToggleRow.className = 'form-check form-switch';
    const toolCallingToggle = documentRef.createElement('input');
    const toolCallingToggleId = buildConfiguredModelFeatureToggleId(
      provider.id,
      model.id,
      'toolCalling'
    );
    toolCallingToggle.className = 'form-check-input';
    toolCallingToggle.type = 'checkbox';
    toolCallingToggle.role = 'switch';
    toolCallingToggle.id = toolCallingToggleId;
    toolCallingToggle.checked = cloudModelToolCallingEnabled(model);
    toolCallingToggle.dataset.cloudModelFeature = 'toolCalling';
    toolCallingToggle.dataset.cloudProviderId = provider.id;
    toolCallingToggle.dataset.cloudRemoteModelId = model.id;
    toolCallingToggle.dataset.cloudRemoteModelDisplayName = model.displayName;
    toolCallingToggleRow.appendChild(toolCallingToggle);
    const toolCallingLabel = documentRef.createElement('label');
    toolCallingLabel.className = 'form-check-label';
    toolCallingLabel.htmlFor = toolCallingToggleId;
    toolCallingLabel.textContent = 'Enable built-in tools';
    toolCallingToggleRow.appendChild(toolCallingLabel);
    toolCallingToggleWrapper.appendChild(toolCallingToggleRow);
    const toolCallingHelp = documentRef.createElement('p');
    toolCallingHelp.className = 'form-text mb-0';
    toolCallingHelp.textContent = buildCloudModelToolCallingHelpText(model);
    toolCallingToggleWrapper.appendChild(toolCallingHelp);
    body.appendChild(toolCallingToggleWrapper);

    const fields = [
      {
        key: 'maxOutputTokens',
        label: 'Maximum output tokens',
        type: 'number',
        inputMode: 'numeric',
        value: String(config.maxOutputTokens),
        min: '8',
        step: '8',
        max: String(limits.maxOutputTokens),
      },
      {
        key: 'maxContextTokens',
        label: 'Context size (short-term memory)',
        type: 'number',
        inputMode: 'numeric',
        value: String(config.maxContextTokens),
        min: '8',
        step: '8',
        max: String(limits.maxContextTokens),
      },
      {
        key: 'temperature',
        label: 'Temperature',
        type: 'number',
        inputMode: 'decimal',
        value: config.temperature.toFixed(1),
        min: limits.minTemperature.toFixed(1),
        max: limits.maxTemperature.toFixed(1),
        step: '0.1',
      },
      {
        key: 'topP',
        label: 'Top P',
        type: 'number',
        inputMode: 'decimal',
        value: config.topP.toFixed(2),
        min: '0.00',
        max: '1.00',
        step: '0.05',
      },
      {
        key: 'topK',
        label: 'Top K',
        type: 'number',
        inputMode: 'numeric',
        value: String(config.topK),
        min: '5',
        step: '1',
        disabled: model.supportsTopK !== true,
        helpText:
          model.supportsTopK === true
            ? ''
            : 'This provider is using the safer OpenAI-style request profile, so top_k is not sent.',
      },
    ];

    fields.forEach((field) => {
      const wrapper = documentRef.createElement('div');
      wrapper.className = 'settings-control-group';

      const label = documentRef.createElement('label');
      label.className = 'form-label';
      const inputId = `${panelId}-${field.key}`;
      label.htmlFor = inputId;
      label.textContent = field.label;
      wrapper.appendChild(label);

      const input = documentRef.createElement('input');
      input.id = inputId;
      input.className = 'form-control';
      input.type = field.type;
      input.inputMode = field.inputMode;
      input.value = field.value;
      input.min = field.min;
      if (field.max) {
        input.max = field.max;
      }
      input.step = field.step;
      input.disabled = field.disabled === true;
      input.dataset.cloudModelSetting = field.key;
      wrapper.appendChild(input);

      if (field.helpText) {
        const help = documentRef.createElement('p');
        help.className = 'form-text mb-0';
        help.textContent = field.helpText;
        wrapper.appendChild(help);
      }

      body.appendChild(wrapper);
    });

    const rateLimitHeading = documentRef.createElement('p');
    rateLimitHeading.className = 'form-label mb-1';
    rateLimitHeading.textContent = 'Browser-local rate limit';
    body.appendChild(rateLimitHeading);

    const rateLimitHelp = documentRef.createElement('p');
    rateLimitHelp.className = 'form-text mt-0 mb-0';
    rateLimitHelp.textContent = model.managed
      ? 'This model uses the app-managed request cap below so a shared free API does not get exhausted accidentally.'
      : 'Add a browser-local request cap for this model to avoid exhausting a free API key. Leave either field blank to disable rate limiting.';
    body.appendChild(rateLimitHelp);

    const rateLimitWindow = toRateLimitWindowParts(model.rateLimit);
    [
      {
        key: 'maxRequests',
        label: 'Requests per window',
        type: 'number',
        inputMode: 'numeric',
        value: model.rateLimit?.maxRequests ? String(model.rateLimit.maxRequests) : '',
        min: '1',
        step: '1',
      },
      {
        key: 'windowValue',
        label: 'Window length',
        type: 'number',
        inputMode: 'numeric',
        value: rateLimitWindow.value,
        min: '1',
        step: '1',
      },
    ].forEach((field) => {
      const wrapper = documentRef.createElement('div');
      wrapper.className = 'settings-control-group';

      const label = documentRef.createElement('label');
      label.className = 'form-label';
      const inputId = `${panelId}-rateLimit-${field.key}`;
      label.htmlFor = inputId;
      label.textContent = field.label;
      wrapper.appendChild(label);

      const input = documentRef.createElement('input');
      input.id = inputId;
      input.className = 'form-control';
      input.type = field.type;
      input.inputMode = field.inputMode;
      input.value = field.value;
      input.min = field.min;
      input.step = field.step;
      input.disabled = model.managed === true;
      input.dataset.cloudModelRateLimit = field.key;
      wrapper.appendChild(input);

      body.appendChild(wrapper);
    });

    const unitWrapper = documentRef.createElement('div');
    unitWrapper.className = 'settings-control-group';
    const unitLabel = documentRef.createElement('label');
    unitLabel.className = 'form-label';
    const unitInputId = `${panelId}-rateLimit-windowUnit`;
    unitLabel.htmlFor = unitInputId;
    unitLabel.textContent = 'Window unit';
    unitWrapper.appendChild(unitLabel);

    const unitSelect = documentRef.createElement('select');
    unitSelect.id = unitInputId;
    unitSelect.className = 'form-select';
    unitSelect.disabled = model.managed === true;
    unitSelect.dataset.cloudModelRateLimit = 'windowUnit';
    RATE_LIMIT_UNIT_OPTIONS.forEach(([value, label]) => {
      const option = documentRef.createElement('option');
      option.value = value;
      option.textContent = label;
      option.selected = value === rateLimitWindow.unit;
      unitSelect.appendChild(option);
    });
    unitWrapper.appendChild(unitSelect);
    body.appendChild(unitWrapper);

    const resetButton = documentRef.createElement('button');
    resetButton.type = 'button';
    resetButton.className = 'btn btn-outline-secondary btn-sm align-self-start';
    resetButton.textContent = 'Reset model defaults';
    resetButton.dataset.cloudModelReset = 'true';
    resetButton.dataset.cloudProviderId = provider.id;
    resetButton.dataset.cloudRemoteModelId = model.id;
    body.appendChild(resetButton);

    container.appendChild(body);
  }

  function renderCloudProviderPreferences() {
    if (!(cloudProvidersList instanceof HTMLElement)) {
      return;
    }
    const uiState = captureAccordionUiState(documentRef, cloudProvidersList);
    const providers = normalizeCloudProviderConfigs(appState.cloudProviders);
    cloudProvidersList.replaceChildren();

    if (!providers.length) {
      const emptyState = documentRef.createElement('p');
      emptyState.className = 'text-body-secondary mb-0';
      emptyState.textContent = 'No cloud providers added yet.';
      cloudProvidersList.appendChild(emptyState);
      return;
    }

    providers.forEach((provider) => {
      const selectedModelsById = new Map(provider.selectedModels.map((model) => [model.id, model]));
      const selectedModelIds = new Set(selectedModelsById.keys());
      const headingId = buildProviderHeadingId(provider.id);
      const panelId = buildProviderPanelId(provider.id);
      const accordionItem = documentRef.createElement('div');
      accordionItem.className = 'accordion-item';

      const header = documentRef.createElement('h4');
      header.className = 'accordion-header';
      header.id = headingId;

      const headerButton = documentRef.createElement('button');
      headerButton.className = 'accordion-button collapsed';
      headerButton.type = 'button';
      headerButton.setAttribute('data-bs-toggle', 'collapse');
      headerButton.setAttribute('data-bs-target', `#${panelId}`);
      headerButton.setAttribute('aria-expanded', 'false');
      headerButton.setAttribute('aria-controls', panelId);

      const summary = documentRef.createElement('span');
      summary.className = 'mcp-server-summary';
      const title = documentRef.createElement('span');
      title.textContent = provider.displayName;
      summary.appendChild(title);
      const description = documentRef.createElement('small');
      description.textContent =
        provider.selectedModels.length > 0
          ? `${provider.endpoint} | ${provider.selectedModels.length} model${provider.selectedModels.length === 1 ? '' : 's'} selected`
          : provider.endpoint;
      summary.appendChild(description);
      headerButton.appendChild(summary);
      header.appendChild(headerButton);
      accordionItem.appendChild(header);

      const collapse = documentRef.createElement('div');
      collapse.id = panelId;
      collapse.className = 'accordion-collapse collapse';
      collapse.setAttribute('aria-labelledby', headingId);

      const body = documentRef.createElement('div');
      body.className = 'accordion-body d-flex flex-column gap-3';

      const controls = documentRef.createElement('div');
      controls.className = 'd-flex flex-wrap align-items-start justify-content-between gap-3';
      const keyNote = documentRef.createElement('p');
      keyNote.className = 'mb-0 text-body-secondary';
      keyNote.textContent = provider.hasSecret
        ? 'API key saved in browser-local encrypted storage. It cannot be shown again.'
        : 'Save an API key below before these cloud models can be used from this browser.';
      controls.appendChild(keyNote);

      const actionGroup = documentRef.createElement('div');
      actionGroup.className = 'd-flex flex-wrap gap-2';
      const refreshButton = documentRef.createElement('button');
      refreshButton.type = 'button';
      refreshButton.className = 'btn btn-outline-secondary btn-sm';
      refreshButton.textContent = 'Refresh models';
      refreshButton.dataset.cloudProviderRefresh = 'true';
      refreshButton.dataset.cloudProviderId = provider.id;
      actionGroup.appendChild(refreshButton);
      if (!provider.preconfigured) {
        const removeButton = documentRef.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'btn btn-outline-secondary btn-sm';
        removeButton.textContent = 'Remove provider';
        removeButton.dataset.cloudProviderRemove = 'true';
        removeButton.dataset.cloudProviderId = provider.id;
        actionGroup.appendChild(removeButton);
      }
      controls.appendChild(actionGroup);
      body.appendChild(controls);

      if (provider.preconfigured) {
        const managedProviderNote = documentRef.createElement('div');
        managedProviderNote.className = 'alert alert-secondary py-2 px-3 mb-0';
        managedProviderNote.textContent =
          'This provider includes app-managed cloud models. Those managed models stay in the picker and cannot be removed here.';
        body.appendChild(managedProviderNote);
      }

      if (provider.links) {
        const linkGroup = documentRef.createElement('div');
        linkGroup.className = 'settings-control-group';
        const linksLabel = documentRef.createElement('p');
        linksLabel.className = 'form-label mb-1';
        linksLabel.textContent = 'Provider links';
        linkGroup.appendChild(linksLabel);
        const linksRow = documentRef.createElement('div');
        linksRow.className = 'd-flex flex-wrap gap-2';
        [
          ['createAccountUrl', 'Create account'],
          ['createTokenUrl', 'Create token'],
          ['dataSecurityUrl', 'Data security'],
        ].forEach(([key, label]) => {
          const href = provider.links?.[key];
          if (!href) {
            return;
          }
          const link = documentRef.createElement('a');
          link.className = 'btn btn-outline-secondary btn-sm';
          link.href = href;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = label;
          linksRow.appendChild(link);
        });
        if (linksRow.childElementCount > 0) {
          linkGroup.appendChild(linksRow);
          body.appendChild(linkGroup);
        }
      }

      const secretGroup = documentRef.createElement('div');
      secretGroup.className = 'settings-control-group';
      const secretForm = documentRef.createElement('form');
      secretForm.className = 'mcp-server-form';
      secretForm.dataset.cloudProviderSecretForm = 'true';
      secretForm.dataset.cloudProviderId = provider.id;
      const secretLabel = documentRef.createElement('label');
      const secretInputId = buildProviderSecretInputId(provider.id);
      secretLabel.className = 'form-label';
      secretLabel.htmlFor = secretInputId;
      secretLabel.textContent = provider.hasSecret ? 'Update API key' : 'Save API key';
      secretForm.appendChild(secretLabel);
      const secretInputGroup = documentRef.createElement('div');
      secretInputGroup.className = 'input-group';
      const secretInput = documentRef.createElement('input');
      secretInput.id = secretInputId;
      secretInput.className = 'form-control';
      secretInput.type = 'password';
      secretInput.autocomplete = 'off';
      secretInput.placeholder = provider.hasSecret ? 'Enter a new API key' : 'Paste an API key';
      secretInput.dataset.cloudProviderSecretInput = 'true';
      secretInput.dataset.cloudProviderId = provider.id;
      secretInputGroup.appendChild(secretInput);
      const secretSaveButton = documentRef.createElement('button');
      secretSaveButton.type = 'submit';
      secretSaveButton.className = 'btn btn-primary';
      secretSaveButton.textContent = provider.hasSecret ? 'Update key' : 'Save key';
      secretInputGroup.appendChild(secretSaveButton);
      secretForm.appendChild(secretInputGroup);
      const secretHelp = documentRef.createElement('p');
      secretHelp.className = 'form-text mb-0';
      secretHelp.textContent = provider.hasSecret
        ? 'Replacing the saved API key updates this provider for future requests.'
        : 'The key is stored only in this browser and cannot be shown again after it is saved.';
      secretForm.appendChild(secretHelp);
      secretGroup.appendChild(secretForm);
      body.appendChild(secretGroup);

      const metadata = documentRef.createElement('dl');
      metadata.className = 'mcp-server-metadata mb-0';
      createMetadataEntry(
        documentRef,
        metadata,
        'Network route',
        provider.requiresProxy === true
          ? 'Uses the saved CORS proxy for cloud requests'
          : 'Uses direct browser requests unless CORS fallback is needed'
      );
      body.appendChild(metadata);

      const availableModelsGroup = documentRef.createElement('div');
      const availableModelsHeading = documentRef.createElement('p');
      availableModelsHeading.className = 'form-label mb-1';
      availableModelsHeading.textContent = 'Available models';
      availableModelsGroup.appendChild(availableModelsHeading);
      const availableModelsHelp = documentRef.createElement('p');
      availableModelsHelp.className = 'form-text mt-0 mb-2';
      availableModelsHelp.textContent =
        'Select the models you want available in New Conversation and New Agent.';
      availableModelsGroup.appendChild(availableModelsHelp);

      const availableModelsList = documentRef.createElement('div');
      availableModelsList.className = 'd-flex flex-column gap-3';
      provider.availableModels.forEach((model) => {
        const configuredModel = selectedModelsById.get(model.id) || null;
        const isManagedModel = configuredModel?.managed === true;
        const wrapper = documentRef.createElement('div');
        wrapper.className = 'form-check form-switch';

        const toggle = documentRef.createElement('input');
        toggle.className = 'form-check-input';
        toggle.type = 'checkbox';
        toggle.role = 'switch';
        toggle.id = buildProviderModelToggleId(provider.id, model.id);
        toggle.checked = selectedModelIds.has(model.id);
        toggle.disabled = isManagedModel;
        toggle.dataset.cloudProviderModelToggle = 'true';
        toggle.dataset.cloudProviderId = provider.id;
        toggle.dataset.cloudRemoteModelId = model.id;
        toggle.dataset.cloudRemoteModelDisplayName = model.displayName;
        wrapper.appendChild(toggle);

        const label = documentRef.createElement('label');
        label.className = 'form-check-label';
        label.htmlFor = toggle.id;
        label.textContent = model.displayName;
        wrapper.appendChild(label);

        const help = documentRef.createElement('p');
        help.className = 'form-text mb-0';
        help.textContent = isManagedModel
          ? `${model.id} - Included by the app and cannot be removed here.`
          : model.id;
        wrapper.appendChild(help);

        if (configuredModel) {
          renderConfiguredModelPanel(documentRef, provider, configuredModel, wrapper);
        }

        availableModelsList.appendChild(wrapper);
      });
      availableModelsGroup.appendChild(availableModelsList);
      body.appendChild(availableModelsGroup);

      collapse.appendChild(body);
      accordionItem.appendChild(collapse);
      cloudProvidersList.appendChild(accordionItem);
    });

    restoreAccordionUiState(documentRef, cloudProvidersList, uiState);
  }

  async function restoreCloudProvidersFromStorage() {
    return reloadCloudProvidersFromStorage();
  }

  async function addCloudProvider(endpoint, apiKey, displayName = '') {
    if (
      typeof inspectCloudProviderEndpoint !== 'function' ||
      typeof saveCloudProvider !== 'function'
    ) {
      throw new Error('Cloud-provider import is unavailable.');
    }
    const inspectedProvider = await inspectCloudProviderEndpoint(endpoint, apiKey);
    const normalizedDisplayName = typeof displayName === 'string' ? displayName.trim() : '';
    if (
      normalizeCloudProviderConfigs(appState.cloudProviders).some(
        (provider) => provider.endpoint === inspectedProvider.endpoint
      )
    ) {
      throw new Error('That cloud provider endpoint has already been added.');
    }
    const savedProvider = await saveCloudProvider(
      {
        ...inspectedProvider,
        ...(normalizedDisplayName ? { displayName: normalizedDisplayName } : {}),
        hasSecret: true,
        selectedModels: [],
      },
      { apiKey }
    );
    await reloadCloudProvidersFromStorage();
    clearCloudProviderFeedback();
    return savedProvider;
  }

  async function saveCloudProviderSecretPreference(providerId, apiKey) {
    if (
      typeof saveCloudProviderSecret !== 'function' ||
      typeof updateCloudProvider !== 'function'
    ) {
      throw new Error('Cloud-provider secret storage is unavailable.');
    }
    const existingProvider = getCloudProviderById(appState.cloudProviders, providerId);
    if (!existingProvider) {
      throw new Error('The selected cloud provider could not be found.');
    }
    await saveCloudProviderSecret(existingProvider.id, apiKey);
    await updateCloudProvider({
      ...existingProvider,
      hasSecret: true,
    });
    await reloadCloudProvidersFromStorage();
    clearCloudProviderFeedback();
    return true;
  }

  async function refreshCloudProviderPreference(providerId) {
    if (
      typeof inspectCloudProviderEndpoint !== 'function' ||
      typeof getCloudProviderSecret !== 'function' ||
      typeof updateCloudProvider !== 'function'
    ) {
      throw new Error('Cloud-provider refresh is unavailable.');
    }
    const existingProvider = getCloudProviderById(appState.cloudProviders, providerId);
    if (!existingProvider) {
      throw new Error('The selected cloud provider could not be found.');
    }
    const secret = await getCloudProviderSecret(existingProvider.id);
    const refreshedMetadata = await inspectCloudProviderEndpoint(existingProvider.endpoint, secret);
    const availableModelsById = new Map(
      refreshedMetadata.availableModels.map((model) => [model.id, model])
    );
    const nextProvider = await updateCloudProvider({
      ...existingProvider,
      ...refreshedMetadata,
      displayName: existingProvider.displayName,
      selectedModels: existingProvider.selectedModels
        .filter((model) => model.managed === true || availableModelsById.has(model.id))
        .map((model) => ({
          ...model,
          displayName:
            availableModelsById.get(model.id)?.displayName || model.displayName || model.id,
        })),
    });
    await reloadCloudProvidersFromStorage();
    clearCloudProviderFeedback();
    return nextProvider;
  }

  async function removeCloudProviderPreference(providerId) {
    if (typeof removeCloudProvider !== 'function') {
      throw new Error('Cloud-provider removal is unavailable.');
    }
    const existingProvider = getCloudProviderById(appState.cloudProviders, providerId);
    if (!existingProvider) {
      throw new Error('The selected cloud provider could not be found.');
    }
    if (existingProvider.preconfigured) {
      throw new Error('This app-managed cloud provider cannot be removed.');
    }
    const removed = await removeCloudProvider(providerId);
    if (!removed) {
      throw new Error('The selected cloud provider could not be removed.');
    }
    await reloadCloudProvidersFromStorage();
    clearCloudProviderFeedback();
    return true;
  }

  async function setCloudProviderModelSelected(providerId, remoteModelId, selected) {
    const existingProvider = getCloudProviderById(appState.cloudProviders, providerId);
    if (!existingProvider) {
      throw new Error('The selected cloud provider could not be found.');
    }
    const availableModel = existingProvider.availableModels.find(
      (model) => model.id === remoteModelId
    );
    if (!availableModel) {
      throw new Error('The selected remote model could not be found.');
    }
    const existingSelectedModel = existingProvider.selectedModels.find(
      (model) => model.id === remoteModelId
    );
    if (selected !== true && existingSelectedModel?.managed === true) {
      throw new Error('This app-managed cloud model cannot be removed from the picker.');
    }

    const nextSelectedModels = selected
      ? [
          ...existingProvider.selectedModels.filter((model) => model.id !== remoteModelId),
          {
            id: availableModel.id,
            displayName: availableModel.displayName,
            generation: existingSelectedModel?.generation || REMOTE_MODEL_GENERATION_LIMITS,
            supportsTopK: existingProvider.supportsTopK === true,
            detectedFeatures: availableModel.detectedFeatures,
            features: existingSelectedModel?.features || availableModel.detectedFeatures,
            ...(existingSelectedModel?.rateLimit
              ? { rateLimit: existingSelectedModel.rateLimit }
              : {}),
            ...(existingSelectedModel?.managed ? { managed: true } : {}),
          },
        ]
      : existingProvider.selectedModels.filter((model) => model.id !== remoteModelId);

    const nextProvider = await updateCloudProvider({
      ...existingProvider,
      selectedModels: nextSelectedModels,
    });
    await reloadCloudProvidersFromStorage();
    return nextProvider;
  }

  async function updateCloudModelFeaturePreference(providerId, remoteModelId, featureKey, enabled) {
    if (featureKey !== 'toolCalling') {
      throw new Error('That cloud model feature cannot be changed here.');
    }
    if (typeof updateCloudProvider !== 'function') {
      throw new Error('Cloud model settings are unavailable.');
    }
    const existingProvider = getCloudProviderById(appState.cloudProviders, providerId);
    if (!existingProvider) {
      throw new Error('The selected cloud provider could not be found.');
    }
    const existingModel = existingProvider.selectedModels.find(
      (model) => model.id === remoteModelId
    );
    if (!existingModel) {
      throw new Error('The selected remote model could not be found.');
    }
    const nextProvider = await updateCloudProvider({
      ...existingProvider,
      selectedModels: existingProvider.selectedModels.map((model) =>
        model.id === remoteModelId
          ? {
              ...model,
              features: {
                ...(model.features || {}),
                [featureKey]: enabled === true,
              },
            }
          : model
      ),
    });
    await reloadCloudProvidersFromStorage();
    return nextProvider;
  }

  async function updateCloudModelRateLimitPreference(providerId, remoteModelId, nextRateLimit) {
    if (typeof updateCloudProvider !== 'function') {
      throw new Error('Cloud model settings are unavailable.');
    }
    const existingProvider = getCloudProviderById(appState.cloudProviders, providerId);
    if (!existingProvider) {
      throw new Error('The selected cloud provider could not be found.');
    }
    const existingModel = existingProvider.selectedModels.find(
      (model) => model.id === remoteModelId
    );
    if (!existingModel) {
      throw new Error('The selected remote model could not be found.');
    }
    if (existingModel.managed) {
      throw new Error('This app-managed cloud model uses a fixed rate limit.');
    }

    const rateLimit = normalizeRateLimitInput(nextRateLimit);
    await updateCloudProvider({
      ...existingProvider,
      selectedModels: existingProvider.selectedModels.map((model) =>
        model.id === remoteModelId
          ? {
              ...model,
              rateLimit,
            }
          : model
      ),
    });
    await reloadCloudProvidersFromStorage();
    return rateLimit;
  }

  function updateCloudModelGenerationPreference(providerId, remoteModelId, nextConfig) {
    if (typeof persistGenerationConfigForModel !== 'function') {
      throw new Error('Cloud model settings are unavailable.');
    }
    const catalogModelId = buildCloudModelId(providerId, remoteModelId);
    const sanitizedConfig = sanitizeGenerationConfig(
      nextConfig,
      getModelGenerationLimits(catalogModelId)
    );
    persistGenerationConfigForModel(catalogModelId, sanitizedConfig);
    if (typeof getSelectedModelId === 'function' && getSelectedModelId() === catalogModelId) {
      syncGenerationSettingsFromModel(catalogModelId, true);
    }
    renderCloudProviderPreferences();
    return sanitizedConfig;
  }

  function resetCloudModelGenerationPreference(providerId, remoteModelId) {
    const catalogModelId = buildCloudModelId(providerId, remoteModelId);
    const defaultConfig = buildDefaultGenerationConfig(getModelGenerationLimits(catalogModelId));
    return updateCloudModelGenerationPreference(providerId, remoteModelId, defaultConfig);
  }

  renderCloudProviderPreferences();
  clearCloudProviderFeedback();

  return {
    addCloudProvider,
    applyCloudProviders,
    clearCloudProviderFeedback,
    refreshCloudProviderPreference,
    removeCloudProviderPreference,
    resetCloudModelGenerationPreference,
    restoreCloudProvidersFromStorage,
    saveCloudProviderSecretPreference,
    setCloudProviderFeedback,
    setCloudProviderModelSelected,
    updateCloudModelFeaturePreference,
    updateCloudModelGenerationPreference,
    updateCloudModelRateLimitPreference,
  };
}
