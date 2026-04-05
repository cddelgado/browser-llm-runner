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
import { getStoredCorsProxyUrl, normalizeCorsProxyUrl } from '../llm/browser-fetch.js';
import { normalizeMcpServerConfigs, summarizeMcpInputSchema } from '../llm/mcp-client.js';
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
      return Array.isArray(parsed)
        ? normalizeEnabledToolNames(parsed)
        : getDefaultEnabledToolNames();
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

  function getStoredMcpServersPreference() {
    if (!mcpServersStorageKey) {
      return [];
    }
    const stored = storage.getItem(mcpServersStorageKey);
    if (!stored) {
      return [];
    }
    try {
      return normalizeMcpServerConfigs(JSON.parse(stored));
    } catch {
      return [];
    }
  }

  function setMcpServerFeedback(message = '', variant = 'info') {
    if (!(mcpServerAddFeedback instanceof HTMLElement)) {
      return;
    }
    const normalizedMessage = typeof message === 'string' ? message.trim() : '';
    mcpServerAddFeedback.className = '';
    mcpServerAddFeedback.replaceChildren();
    if (!normalizedMessage) {
      mcpServerAddFeedback.classList.add('d-none');
      mcpServerAddFeedback.removeAttribute('role');
      return;
    }
    mcpServerAddFeedback.classList.remove('d-none');
    mcpServerAddFeedback.setAttribute('role', variant === 'danger' ? 'alert' : 'status');
    mcpServerAddFeedback.classList.add(
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
    mcpServerAddFeedback.textContent = normalizedMessage;
  }

  function clearMcpServerFeedback() {
    setMcpServerFeedback('');
  }

  function buildMcpServerToggleId(serverIdentifier) {
    return `mcpServerToggle-${serverIdentifier.replace(/[^a-zA-Z0-9_-]+/g, '-')}`;
  }

  function buildMcpServerCommandToggleId(serverIdentifier, commandName) {
    return `mcpCommandToggle-${serverIdentifier.replace(/[^a-zA-Z0-9_-]+/g, '-')}-${commandName.replace(/[^a-zA-Z0-9_-]+/g, '-')}`;
  }

  function buildMcpServerSummaryText(server) {
    if (server.description) {
      return server.description;
    }
    if (server.endpoint) {
      return server.endpoint;
    }
    return 'Configured MCP server.';
  }

  function appendMetadataEntry(list, label, value) {
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

  function renderMcpServerPreferences() {
    if (!(mcpServersList instanceof HTMLElement)) {
      return;
    }
    const servers = normalizeMcpServerConfigs(appState.mcpServers);
    mcpServersList.replaceChildren();
    if (!servers.length) {
      const emptyState = documentRef.createElement('p');
      emptyState.className = 'text-body-secondary mb-0';
      emptyState.textContent = 'No MCP servers added yet.';
      mcpServersList.appendChild(emptyState);
      return;
    }

    servers.forEach((server) => {
      const accordionItem = documentRef.createElement('div');
      accordionItem.className = 'accordion-item';

      const header = documentRef.createElement('h4');
      header.className = 'accordion-header';
      header.id = `mcpServerHeading-${server.identifier}`;

      const headerButton = documentRef.createElement('button');
      headerButton.className = 'accordion-button collapsed';
      headerButton.type = 'button';
      headerButton.setAttribute('data-bs-toggle', 'collapse');
      headerButton.setAttribute('data-bs-target', `#mcpServerPanel-${server.identifier}`);
      headerButton.setAttribute('aria-expanded', 'false');
      headerButton.setAttribute('aria-controls', `mcpServerPanel-${server.identifier}`);

      const headerSummary = documentRef.createElement('span');
      headerSummary.className = 'mcp-server-summary';
      const headerTitle = documentRef.createElement('span');
      headerTitle.textContent = server.displayName;
      headerSummary.appendChild(headerTitle);
      const headerDescription = documentRef.createElement('small');
      headerDescription.textContent = buildMcpServerSummaryText(server);
      headerSummary.appendChild(headerDescription);
      headerButton.appendChild(headerSummary);
      header.appendChild(headerButton);
      accordionItem.appendChild(header);

      const collapse = documentRef.createElement('div');
      collapse.id = `mcpServerPanel-${server.identifier}`;
      collapse.className = 'accordion-collapse collapse';
      collapse.setAttribute('aria-labelledby', header.id);

      const body = documentRef.createElement('div');
      body.className = 'accordion-body d-flex flex-column gap-3';

      const controls = documentRef.createElement('div');
      controls.className = 'd-flex flex-wrap align-items-start justify-content-between gap-3';

      const toggleWrapper = documentRef.createElement('div');
      toggleWrapper.className = 'form-check form-switch';
      const toggle = documentRef.createElement('input');
      toggle.className = 'form-check-input';
      toggle.type = 'checkbox';
      toggle.role = 'switch';
      toggle.id = buildMcpServerToggleId(server.identifier);
      toggle.checked = server.enabled;
      toggle.dataset.mcpServerToggle = 'true';
      toggle.dataset.mcpServerId = server.identifier;
      toggle.dataset.mcpServerDisplayName = server.displayName;
      toggleWrapper.appendChild(toggle);
      const toggleLabel = documentRef.createElement('label');
      toggleLabel.className = 'form-check-label';
      toggleLabel.htmlFor = toggle.id;
      toggleLabel.textContent = 'Enable this server';
      toggleWrapper.appendChild(toggleLabel);
      controls.appendChild(toggleWrapper);

      const actionGroup = documentRef.createElement('div');
      actionGroup.className = 'd-flex flex-wrap gap-2';
      const refreshButton = documentRef.createElement('button');
      refreshButton.type = 'button';
      refreshButton.className = 'btn btn-outline-secondary btn-sm';
      refreshButton.textContent = 'Refresh metadata';
      refreshButton.dataset.mcpServerRefresh = 'true';
      refreshButton.dataset.mcpServerId = server.identifier;
      actionGroup.appendChild(refreshButton);
      const removeButton = documentRef.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'btn btn-outline-danger btn-sm';
      removeButton.textContent = 'Remove server';
      removeButton.dataset.mcpServerRemove = 'true';
      removeButton.dataset.mcpServerId = server.identifier;
      actionGroup.appendChild(removeButton);
      controls.appendChild(actionGroup);
      body.appendChild(controls);

      const metadata = documentRef.createElement('dl');
      metadata.className = 'mcp-server-metadata mb-0';
      appendMetadataEntry(metadata, 'Identifier', server.identifier);
      appendMetadataEntry(metadata, 'Endpoint', server.endpoint);
      appendMetadataEntry(metadata, 'Protocol', server.protocolVersion);
      appendMetadataEntry(metadata, 'Server version', server.serverVersion);
      appendMetadataEntry(
        metadata,
        'Capabilities',
        Array.isArray(server.capabilities) && server.capabilities.length
          ? server.capabilities.join(', ')
          : ''
      );
      appendMetadataEntry(metadata, 'Instructions', server.instructions);
      body.appendChild(metadata);

      const commandsGroup = documentRef.createElement('div');
      const commandsHeading = documentRef.createElement('p');
      commandsHeading.className = 'form-label mb-1';
      commandsHeading.textContent = 'Commands';
      commandsGroup.appendChild(commandsHeading);
      const commandsHelp = documentRef.createElement('p');
      commandsHelp.className = 'form-text mt-0 mb-2';
      commandsHelp.textContent = 'Enable only the commands you want exposed to the model.';
      commandsGroup.appendChild(commandsHelp);
      const commandList = documentRef.createElement('div');
      commandList.className = 'd-flex flex-column gap-3';

      if (!server.commands.length) {
        const emptyCommands = documentRef.createElement('p');
        emptyCommands.className = 'text-body-secondary mb-0';
        emptyCommands.textContent = 'No commands are available for this server.';
        commandList.appendChild(emptyCommands);
      } else {
        server.commands.forEach((command) => {
          const commandWrapper = documentRef.createElement('div');
          commandWrapper.className = 'form-check form-switch';
          const commandToggle = documentRef.createElement('input');
          commandToggle.className = 'form-check-input';
          commandToggle.type = 'checkbox';
          commandToggle.role = 'switch';
          commandToggle.id = buildMcpServerCommandToggleId(server.identifier, command.name);
          commandToggle.checked = command.enabled;
          commandToggle.dataset.mcpCommandToggle = 'true';
          commandToggle.dataset.mcpServerId = server.identifier;
          commandToggle.dataset.mcpCommandName = command.name;
          commandToggle.dataset.mcpCommandDisplayName = command.displayName;
          commandWrapper.appendChild(commandToggle);

          const commandLabel = documentRef.createElement('label');
          commandLabel.className = 'form-check-label';
          commandLabel.htmlFor = commandToggle.id;
          const commandName = documentRef.createElement('span');
          commandName.className = 'font-monospace';
          commandName.textContent = command.name;
          commandLabel.appendChild(commandName);
          commandWrapper.appendChild(commandLabel);

          const helpTextParts = [];
          if (command.description) {
            helpTextParts.push(command.description);
          }
          helpTextParts.push(summarizeMcpInputSchema(command.inputSchema));
          const commandHelp = documentRef.createElement('p');
          commandHelp.className = 'form-text mb-0';
          commandHelp.textContent = helpTextParts.filter(Boolean).join(' ');
          commandWrapper.appendChild(commandHelp);
          commandList.appendChild(commandWrapper);
        });
      }

      commandsGroup.appendChild(commandList);
      body.appendChild(commandsGroup);
      collapse.appendChild(body);
      accordionItem.appendChild(collapse);
      mcpServersList.appendChild(accordionItem);
    });
  }

  function applyMcpServersPreference(value, { persist = false } = {}) {
    appState.mcpServers = normalizeMcpServerConfigs(value);
    renderMcpServerPreferences();
    if (persist && mcpServersStorageKey) {
      storage.setItem(mcpServersStorageKey, JSON.stringify(appState.mcpServers));
    }
  }

  function applyMcpServerEnabledPreference(serverIdentifier, value, { persist = false } = {}) {
    const normalizedIdentifier =
      typeof serverIdentifier === 'string' ? serverIdentifier.trim().toLowerCase() : '';
    if (!normalizedIdentifier) {
      return;
    }
    const nextServers = normalizeMcpServerConfigs(appState.mcpServers).map((server) =>
      server.identifier.toLowerCase() === normalizedIdentifier
        ? {
            ...server,
            enabled: Boolean(value),
          }
        : server
    );
    applyMcpServersPreference(nextServers, { persist });
  }

  function applyMcpServerCommandEnabledPreference(
    serverIdentifier,
    commandName,
    value,
    { persist = false } = {}
  ) {
    const normalizedServerIdentifier =
      typeof serverIdentifier === 'string' ? serverIdentifier.trim().toLowerCase() : '';
    const normalizedCommandName =
      typeof commandName === 'string' ? commandName.trim().toLowerCase() : '';
    if (!normalizedServerIdentifier || !normalizedCommandName) {
      return;
    }
    const nextServers = normalizeMcpServerConfigs(appState.mcpServers).map((server) => {
      if (server.identifier.toLowerCase() !== normalizedServerIdentifier) {
        return server;
      }
      return {
        ...server,
        commands: server.commands.map((command) =>
          command.name.toLowerCase() === normalizedCommandName
            ? {
                ...command,
                enabled: Boolean(value),
              }
            : command
        ),
      };
    });
    applyMcpServersPreference(nextServers, { persist });
  }

  async function importMcpServerEndpoint(endpoint, { persist = true } = {}) {
    if (typeof inspectMcpServerEndpoint !== 'function') {
      throw new Error('MCP server inspection is unavailable.');
    }
    const existingServers = normalizeMcpServerConfigs(appState.mcpServers);
    const importedServer = await inspectMcpServerEndpoint(endpoint, {
      existingIdentifiers: existingServers.map((server) => server.identifier),
    });
    if (existingServers.some((server) => server.endpoint === importedServer.endpoint)) {
      throw new Error('That MCP server endpoint has already been added.');
    }
    applyMcpServersPreference([...existingServers, importedServer], { persist });
    if (mcpServerEndpointInput instanceof HTMLInputElement) {
      mcpServerEndpointInput.value = '';
    }
    clearMcpServerFeedback();
    return importedServer;
  }

  async function refreshMcpServerPreference(serverIdentifier, { persist = true } = {}) {
    if (typeof inspectMcpServerEndpoint !== 'function') {
      throw new Error('MCP server inspection is unavailable.');
    }
    const normalizedIdentifier =
      typeof serverIdentifier === 'string' ? serverIdentifier.trim().toLowerCase() : '';
    const existingServers = normalizeMcpServerConfigs(appState.mcpServers);
    const existingServer = existingServers.find(
      (server) => server.identifier.toLowerCase() === normalizedIdentifier
    );
    if (!existingServer) {
      throw new Error('The selected MCP server could not be found.');
    }
    const refreshedServer = await inspectMcpServerEndpoint(existingServer.endpoint, {
      preferredIdentifier: existingServer.identifier,
    });
    const enabledCommandNames = new Set(
      existingServer.commands
        .filter((command) => command.enabled)
        .map((command) => command.name.toLowerCase())
    );
    const nextServers = existingServers.map((server) =>
      server.identifier.toLowerCase() === normalizedIdentifier
        ? {
            ...refreshedServer,
            enabled: server.enabled,
            commands: refreshedServer.commands.map((command) => ({
              ...command,
              enabled: enabledCommandNames.has(command.name.toLowerCase()),
            })),
          }
        : server
    );
    applyMcpServersPreference(nextServers, { persist });
    clearMcpServerFeedback();
    return refreshedServer;
  }

  function removeMcpServerPreference(serverIdentifier, { persist = false } = {}) {
    const normalizedIdentifier =
      typeof serverIdentifier === 'string' ? serverIdentifier.trim().toLowerCase() : '';
    if (!normalizedIdentifier) {
      return;
    }
    const nextServers = normalizeMcpServerConfigs(appState.mcpServers).filter(
      (server) => server.identifier.toLowerCase() !== normalizedIdentifier
    );
    applyMcpServersPreference(nextServers, { persist });
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

      const secondary = documentRef.createElement('div');
      secondary.className = 'model-card-secondary';

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
        availabilityNote.textContent = availability.reason;
        secondary.appendChild(availabilityNote);
      } else if (model.runtime?.requiresWebGpu) {
        const requirement = documentRef.createElement('p');
        requirement.className = 'model-card-note';
        requirement.textContent = 'This model requires WebGPU.';
        secondary.appendChild(requirement);
      }

      content.appendChild(secondary);
      selectButton.appendChild(content);

      selectButton.addEventListener('click', () => {
        if (selectButton.disabled) {
          return;
        }
        setSelectedModelId(model.id, { dispatch: true });
      });
      card.appendChild(selectButton);

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
  clearCorsProxyFeedback();
  renderMcpServerPreferences();
  clearMcpServerFeedback();

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
