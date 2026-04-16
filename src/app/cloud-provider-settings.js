import { buildDefaultGenerationConfig, sanitizeGenerationConfig } from '../config/generation-config.js';
import {
  buildCloudModelId,
  REMOTE_MODEL_GENERATION_LIMITS,
  normalizeCloudProviderConfigs,
  getCloudProviderById,
} from '../cloud/cloud-provider-config.js';

function buildAlertClasses(variant) {
  return [
    'alert',
    variant === 'danger' ? 'alert-danger' : variant === 'success' ? 'alert-success' : 'alert-secondary',
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
    documentRef.activeElement instanceof HTMLElement && container.contains(documentRef.activeElement)
      ? documentRef.activeElement
      : null;
  return {
    expandedPanelIds,
    focusedElementId: activeElement?.id || '',
    scrollTop: container.scrollTop,
  };
}

function restoreAccordionUiState(documentRef, container, { expandedPanelIds, focusedElementId, scrollTop }) {
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

function normalizeStoredGenerationConfig(getStoredGenerationConfigForModel, getModelGenerationLimits, modelId) {
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

function buildConfiguredModelHeadingId(providerId, modelId) {
  return `cloudConfiguredModelHeading-${providerId.replace(/[^a-zA-Z0-9_-]+/g, '-')}-${modelId.replace(/[^a-zA-Z0-9_-]+/g, '-')}`;
}

export function createCloudProviderSettingsController({
  appState,
  documentRef = document,
  cloudProviderAddFeedback = null,
  cloudProvidersList = null,
  inspectCloudProviderEndpoint,
  loadCloudProviders,
  saveCloudProvider,
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

  function applyCloudProviders(providers) {
    appState.cloudProviders = normalizeCloudProviderConfigs(providers);
    renderCloudProviderPreferences();
    notifyProvidersChanged();
    return appState.cloudProviders;
  }

  function renderConfiguredModelAccordion(documentRef, provider, container) {
    if (!(container instanceof HTMLElement)) {
      return;
    }

    if (!provider.selectedModels.length) {
      const emptyState = documentRef.createElement('p');
      emptyState.className = 'text-body-secondary mb-0';
      emptyState.textContent = 'Select one or more models above to configure browser-local defaults.';
      container.appendChild(emptyState);
      return;
    }

    const nestedAccordion = documentRef.createElement('div');
    nestedAccordion.className = 'accordion settings-accordion';

    provider.selectedModels.forEach((model) => {
      const modelId = buildCloudModelId(provider.id, model.id);
      const { config, limits } = normalizeStoredGenerationConfig(
        getStoredGenerationConfigForModel,
        getModelGenerationLimits,
        modelId
      );
      const headingId = buildConfiguredModelHeadingId(provider.id, model.id);
      const panelId = buildConfiguredModelPanelId(provider.id, model.id);
      const accordionItem = documentRef.createElement('div');
      accordionItem.className = 'accordion-item';

      const header = documentRef.createElement('h5');
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
      title.textContent = model.displayName;
      summary.appendChild(title);
      const subtitle = documentRef.createElement('small');
      subtitle.textContent = model.id;
      summary.appendChild(subtitle);
      headerButton.appendChild(summary);
      header.appendChild(headerButton);
      accordionItem.appendChild(header);

      const collapse = documentRef.createElement('div');
      collapse.id = panelId;
      collapse.className = 'accordion-collapse collapse';
      collapse.setAttribute('aria-labelledby', headingId);

      const body = documentRef.createElement('div');
      body.className = 'accordion-body d-flex flex-column gap-3';
      body.dataset.cloudModelConfig = 'true';
      body.dataset.cloudProviderId = provider.id;
      body.dataset.cloudRemoteModelId = model.id;
      body.dataset.cloudCatalogModelId = modelId;

      const intro = documentRef.createElement('p');
      intro.className = 'form-text mt-0 mb-0';
      intro.textContent =
        'These defaults stay local to this browser. Context size is enforced approximately for remote models.';
      body.appendChild(intro);

      const fields = [
        {
          key: 'maxOutputTokens',
          label: 'Maximum output tokens',
          type: 'number',
          inputMode: 'numeric',
          value: String(config.maxOutputTokens),
          min: '8',
          step: '8',
        },
        {
          key: 'maxContextTokens',
          label: 'Context size (short-term memory)',
          type: 'number',
          inputMode: 'numeric',
          value: String(config.maxContextTokens),
          min: '8',
          step: '8',
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

      const resetButton = documentRef.createElement('button');
      resetButton.type = 'button';
      resetButton.className = 'btn btn-outline-secondary btn-sm align-self-start';
      resetButton.textContent = 'Reset model defaults';
      resetButton.dataset.cloudModelReset = 'true';
      resetButton.dataset.cloudProviderId = provider.id;
      resetButton.dataset.cloudRemoteModelId = model.id;
      body.appendChild(resetButton);

      collapse.appendChild(body);
      accordionItem.appendChild(collapse);
      nestedAccordion.appendChild(accordionItem);
    });

    container.appendChild(nestedAccordion);
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
      const selectedModelIds = new Set(provider.selectedModels.map((model) => model.id));
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
      keyNote.textContent = 'API key saved in browser-local encrypted storage. It cannot be shown again.';
      controls.appendChild(keyNote);

      const actionGroup = documentRef.createElement('div');
      actionGroup.className = 'd-flex flex-wrap gap-2';
      const refreshButton = documentRef.createElement('button');
      refreshButton.type = 'button';
      refreshButton.className = 'btn btn-outline-primary btn-sm';
      refreshButton.textContent = 'Refresh models';
      refreshButton.dataset.cloudProviderRefresh = 'true';
      refreshButton.dataset.cloudProviderId = provider.id;
      actionGroup.appendChild(refreshButton);
      const removeButton = documentRef.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'btn btn-outline-danger btn-sm';
      removeButton.textContent = 'Remove provider';
      removeButton.dataset.cloudProviderRemove = 'true';
      removeButton.dataset.cloudProviderId = provider.id;
      actionGroup.appendChild(removeButton);
      controls.appendChild(actionGroup);
      body.appendChild(controls);

      const metadata = documentRef.createElement('dl');
      metadata.className = 'mcp-server-metadata mb-0';
      createMetadataEntry(documentRef, metadata, 'Type', 'OpenAI-compatible');
      createMetadataEntry(documentRef, metadata, 'Endpoint', provider.endpoint);
      createMetadataEntry(
        documentRef,
        metadata,
        'Top K',
        provider.supportsTopK === true ? 'Sent when configured' : 'Not sent for this provider'
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
        const wrapper = documentRef.createElement('div');
        wrapper.className = 'form-check form-switch';

        const toggle = documentRef.createElement('input');
        toggle.className = 'form-check-input';
        toggle.type = 'checkbox';
        toggle.role = 'switch';
        toggle.id = buildProviderModelToggleId(provider.id, model.id);
        toggle.checked = selectedModelIds.has(model.id);
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
        help.textContent = model.id;
        wrapper.appendChild(help);

        availableModelsList.appendChild(wrapper);
      });
      availableModelsGroup.appendChild(availableModelsList);
      body.appendChild(availableModelsGroup);

      const configuredModelsGroup = documentRef.createElement('div');
      const configuredModelsHeading = documentRef.createElement('p');
      configuredModelsHeading.className = 'form-label mb-1';
      configuredModelsHeading.textContent = 'Configured model defaults';
      configuredModelsGroup.appendChild(configuredModelsHeading);
      const configuredModelsHelp = documentRef.createElement('p');
      configuredModelsHelp.className = 'form-text mt-0 mb-2';
      configuredModelsHelp.textContent =
        'Adjust per-model browser-local defaults for context size, output length, temperature, Top P, and Top K where supported.';
      configuredModelsGroup.appendChild(configuredModelsHelp);
      renderConfiguredModelAccordion(documentRef, provider, configuredModelsGroup);
      body.appendChild(configuredModelsGroup);

      collapse.appendChild(body);
      accordionItem.appendChild(collapse);
      cloudProvidersList.appendChild(accordionItem);
    });

    restoreAccordionUiState(documentRef, cloudProvidersList, uiState);
  }

  async function restoreCloudProvidersFromStorage() {
    if (typeof loadCloudProviders !== 'function') {
      return [];
    }
    const providers = await loadCloudProviders();
    return applyCloudProviders(providers);
  }

  async function addCloudProvider(endpoint, apiKey) {
    if (typeof inspectCloudProviderEndpoint !== 'function' || typeof saveCloudProvider !== 'function') {
      throw new Error('Cloud-provider import is unavailable.');
    }
    const inspectedProvider = await inspectCloudProviderEndpoint(endpoint, apiKey);
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
        selectedModels: [],
      },
      { apiKey }
    );
    applyCloudProviders([...normalizeCloudProviderConfigs(appState.cloudProviders), savedProvider]);
    clearCloudProviderFeedback();
    return savedProvider;
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
      selectedModels: existingProvider.selectedModels
        .filter((model) => availableModelsById.has(model.id))
        .map((model) => ({
          ...model,
          displayName: availableModelsById.get(model.id)?.displayName || model.displayName || model.id,
        })),
    });
    const nextProviders = normalizeCloudProviderConfigs(appState.cloudProviders).map((provider) =>
      provider.id === nextProvider.id ? nextProvider : provider
    );
    applyCloudProviders(nextProviders);
    clearCloudProviderFeedback();
    return nextProvider;
  }

  async function removeCloudProviderPreference(providerId) {
    if (typeof removeCloudProvider !== 'function') {
      throw new Error('Cloud-provider removal is unavailable.');
    }
    const removed = await removeCloudProvider(providerId);
    if (!removed) {
      throw new Error('The selected cloud provider could not be removed.');
    }
    applyCloudProviders(
      normalizeCloudProviderConfigs(appState.cloudProviders).filter((provider) => provider.id !== providerId)
    );
    clearCloudProviderFeedback();
    return true;
  }

  async function setCloudProviderModelSelected(providerId, remoteModelId, selected) {
    const existingProvider = getCloudProviderById(appState.cloudProviders, providerId);
    if (!existingProvider) {
      throw new Error('The selected cloud provider could not be found.');
    }
    const availableModel = existingProvider.availableModels.find((model) => model.id === remoteModelId);
    if (!availableModel) {
      throw new Error('The selected remote model could not be found.');
    }

    const nextSelectedModels = selected
      ? [
          ...existingProvider.selectedModels.filter((model) => model.id !== remoteModelId),
          {
            id: availableModel.id,
            displayName: availableModel.displayName,
            generation:
              existingProvider.selectedModels.find((model) => model.id === remoteModelId)?.generation ||
              REMOTE_MODEL_GENERATION_LIMITS,
            supportsTopK: existingProvider.supportsTopK === true,
          },
        ]
      : existingProvider.selectedModels.filter((model) => model.id !== remoteModelId);

    const nextProvider = await updateCloudProvider({
      ...existingProvider,
      selectedModels: nextSelectedModels,
    });
    applyCloudProviders(
      normalizeCloudProviderConfigs(appState.cloudProviders).map((provider) =>
        provider.id === nextProvider.id ? nextProvider : provider
      )
    );
    return nextProvider;
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
    setCloudProviderFeedback,
    setCloudProviderModelSelected,
    updateCloudModelGenerationPreference,
  };
}
