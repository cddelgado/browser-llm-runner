import { normalizeMcpServerConfigs, summarizeMcpInputSchema } from '../llm/mcp-client.js';
import { normalizeSkillPackages } from '../skills/skill-packages.js';

/**
 * @param {{
 *   appState: any;
 *   storage?: Storage;
 *   documentRef?: Document;
 *   enableToolCallingStorageKey?: string;
 *   enabledToolsStorageKey?: string;
 *   enabledToolMigrationsStorageKey?: string;
 *   mcpServersStorageKey?: string;
 *   availableToolDefinitions?: any[];
 *   enabledToolMigrations?: Array<{id?: string; toolName?: string}>;
 *   enableToolCallingToggle?: HTMLInputElement | null;
 *   toolSettingsList?: HTMLElement | null;
 *   skillPackageInput?: HTMLInputElement | null;
 *   skillPackageAddFeedback?: HTMLElement | null;
 *   skillsList?: HTMLElement | null;
 *   importSkillPackage?: ((file: File, options?: any) => Promise<any>) | null;
 *   removeSkillPackage?: ((skillPackageId: string, options?: any) => Promise<boolean>) | null;
 *   mcpServerEndpointInput?: HTMLInputElement | null;
 *   mcpServerAddFeedback?: HTMLElement | null;
 *   mcpServersList?: HTMLElement | null;
 *   inspectMcpServerEndpoint?: ((endpoint: string, options?: any) => Promise<any>) | null;
 * }} options
 */
export function createToolingPreferencesController({
  appState,
  storage = globalThis.localStorage,
  documentRef = document,
  enableToolCallingStorageKey,
  enabledToolsStorageKey,
  enabledToolMigrationsStorageKey,
  mcpServersStorageKey,
  availableToolDefinitions = [],
  enabledToolMigrations = [],
  enableToolCallingToggle,
  toolSettingsList,
  skillPackageInput,
  skillPackageAddFeedback,
  skillsList,
  importSkillPackage = null,
  removeSkillPackage = null,
  mcpServerEndpointInput,
  mcpServerAddFeedback,
  mcpServersList,
  inspectMcpServerEndpoint = null,
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
  const normalizedEnabledToolMigrations = Array.isArray(enabledToolMigrations)
    ? enabledToolMigrations
        .map((migration) => ({
          id: typeof migration?.id === 'string' ? migration.id.trim() : '',
          toolName: typeof migration?.toolName === 'string' ? migration.toolName.trim() : '',
        }))
        .filter(
          (migration) => migration.id && migration.toolName && availableToolNameSet.has(migration.toolName)
        )
    : [];

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

  function getStoredEnabledToolMigrationIds() {
    if (!enabledToolMigrationsStorageKey) {
      return [];
    }
    const stored = storage.getItem(enabledToolMigrationsStorageKey);
    if (!stored) {
      return [];
    }
    try {
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed)
        ? parsed
            .map((migrationId) => (typeof migrationId === 'string' ? migrationId.trim() : ''))
            .filter(Boolean)
        : [];
    } catch {
      return [];
    }
  }

  function migrateStoredEnabledToolNamesPreference({ persist = false } = {}) {
    const stored = storage.getItem(enabledToolsStorageKey);
    const enabledToolNames = getStoredEnabledToolNamesPreference();
    if (stored === null || !normalizedEnabledToolMigrations.length) {
      return enabledToolNames;
    }
    const appliedMigrationIds = new Set(getStoredEnabledToolMigrationIds());
    const nextEnabledToolNames = [...enabledToolNames];
    let enabledToolNamesChanged = false;
    let migrationIdsChanged = false;
    normalizedEnabledToolMigrations.forEach((migration) => {
      if (appliedMigrationIds.has(migration.id)) {
        return;
      }
      if (!nextEnabledToolNames.includes(migration.toolName)) {
        nextEnabledToolNames.push(migration.toolName);
        enabledToolNamesChanged = true;
      }
      appliedMigrationIds.add(migration.id);
      migrationIdsChanged = true;
    });
    if (persist && (enabledToolNamesChanged || migrationIdsChanged)) {
      storage.setItem(enabledToolsStorageKey, JSON.stringify(nextEnabledToolNames));
      if (enabledToolMigrationsStorageKey) {
        storage.setItem(
          enabledToolMigrationsStorageKey,
          JSON.stringify([...appliedMigrationIds])
        );
      }
    }
    return nextEnabledToolNames;
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

  function applySkillPackagesPreference(value) {
    appState.skillPackages = normalizeSkillPackages(value);
    renderSkillPackagePreferences();
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

  async function importSkillPackageFile(file, { persist = true } = {}) {
    if (typeof importSkillPackage !== 'function') {
      throw new Error('Skill package import is unavailable.');
    }
    const importedSkillPackage = await importSkillPackage(file, {
      persist,
      existingSkillPackages: normalizeSkillPackages(appState.skillPackages),
    });
    const nextSkillPackages = normalizeSkillPackages([
      ...normalizeSkillPackages(appState.skillPackages),
      importedSkillPackage,
    ]);
    applySkillPackagesPreference(nextSkillPackages);
    if (skillPackageInput instanceof HTMLInputElement) {
      skillPackageInput.value = '';
    }
    clearSkillPackageFeedback();
    return importedSkillPackage;
  }

  async function removeSkillPackagePreference(skillPackageId, { persist = true } = {}) {
    const normalizedSkillPackageId =
      typeof skillPackageId === 'string' ? skillPackageId.trim() : '';
    if (!normalizedSkillPackageId) {
      return false;
    }
    if (typeof removeSkillPackage === 'function') {
      await removeSkillPackage(normalizedSkillPackageId, { persist });
    }
    const nextSkillPackages = normalizeSkillPackages(appState.skillPackages).filter(
      (skillPackage) => skillPackage.id !== normalizedSkillPackageId
    );
    applySkillPackagesPreference(nextSkillPackages);
    clearSkillPackageFeedback();
    return true;
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

  function setSkillPackageFeedback(message = '', variant = 'info') {
    if (!(skillPackageAddFeedback instanceof HTMLElement)) {
      return;
    }
    const normalizedMessage = typeof message === 'string' ? message.trim() : '';
    skillPackageAddFeedback.className = '';
    skillPackageAddFeedback.replaceChildren();
    if (!normalizedMessage) {
      skillPackageAddFeedback.classList.add('d-none');
      skillPackageAddFeedback.removeAttribute('role');
      return;
    }
    skillPackageAddFeedback.classList.remove('d-none');
    skillPackageAddFeedback.setAttribute('role', variant === 'danger' ? 'alert' : 'status');
    skillPackageAddFeedback.classList.add(
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
    skillPackageAddFeedback.textContent = normalizedMessage;
  }

  function clearSkillPackageFeedback() {
    setSkillPackageFeedback('');
  }

  function captureAccordionUiState(container) {
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

  function restoreAccordionUiState(container, { expandedPanelIds, focusedElementId, scrollTop }) {
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
      const nextFocusTarget = documentRef.getElementById(focusedElementId);
      if (nextFocusTarget instanceof HTMLElement) {
        nextFocusTarget.focus({ preventScroll: true });
      }
    }
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

  function buildSkillPackagePanelId(skillPackageId) {
    return `skillPackagePanel-${skillPackageId.replace(/[^a-zA-Z0-9_-]+/g, '-')}`;
  }

  function buildSkillPackageHeadingId(skillPackageId) {
    return `skillPackageHeading-${skillPackageId.replace(/[^a-zA-Z0-9_-]+/g, '-')}`;
  }

  function buildSkillPackageRemoveButtonId(skillPackageId) {
    return `skillPackageRemove-${skillPackageId.replace(/[^a-zA-Z0-9_-]+/g, '-')}`;
  }

  function buildSkillPackageStatusText(skillPackage) {
    if (skillPackage?.isUsable) {
      return 'Ready';
    }
    if (skillPackage?.hasSkillMarkdown) {
      return 'Not exposed to model';
    }
    return 'Missing SKILL.md';
  }

  function buildSkillPackageSummaryText(skillPackage) {
    if (skillPackage?.description) {
      return skillPackage.description;
    }
    if (skillPackage?.issue) {
      return skillPackage.issue;
    }
    if (skillPackage?.packageName) {
      return skillPackage.packageName;
    }
    return 'Uploaded skill package.';
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

  function renderSkillPackagePreferences() {
    if (!(skillsList instanceof HTMLElement)) {
      return;
    }
    const uiState = captureAccordionUiState(skillsList);
    const skillPackages = normalizeSkillPackages(appState.skillPackages);
    skillsList.replaceChildren();
    if (!skillPackages.length) {
      const emptyState = documentRef.createElement('p');
      emptyState.className = 'text-body-secondary mb-0';
      emptyState.textContent = 'No skill packages added yet.';
      skillsList.appendChild(emptyState);
      return;
    }

    skillPackages.forEach((skillPackage) => {
      const skillPackageId = skillPackage.id || skillPackage.lookupName || skillPackage.name;
      const headingId = buildSkillPackageHeadingId(skillPackageId);
      const panelId = buildSkillPackagePanelId(skillPackageId);
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

      const headerSummary = documentRef.createElement('span');
      headerSummary.className = 'mcp-server-summary';
      const headerTitle = documentRef.createElement('span');
      headerTitle.textContent = skillPackage.name;
      headerSummary.appendChild(headerTitle);
      const headerDescription = documentRef.createElement('small');
      headerDescription.textContent = buildSkillPackageSummaryText(skillPackage);
      headerSummary.appendChild(headerDescription);
      headerButton.appendChild(headerSummary);
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
      const statusBlock = documentRef.createElement('div');
      const statusHeading = documentRef.createElement('p');
      statusHeading.className = 'form-label mb-1';
      statusHeading.textContent = 'Package status';
      statusBlock.appendChild(statusHeading);
      const statusValue = documentRef.createElement('p');
      statusValue.className = 'mb-0';
      statusValue.textContent = buildSkillPackageStatusText(skillPackage);
      statusBlock.appendChild(statusValue);
      controls.appendChild(statusBlock);

      const actionGroup = documentRef.createElement('div');
      actionGroup.className = 'd-flex flex-wrap gap-2';
      const removeButton = documentRef.createElement('button');
      removeButton.type = 'button';
      removeButton.id = buildSkillPackageRemoveButtonId(skillPackageId);
      removeButton.className = 'btn btn-outline-danger btn-sm';
      removeButton.textContent = 'Remove package';
      removeButton.dataset.skillPackageRemove = 'true';
      removeButton.dataset.skillPackageId = skillPackage.id;
      removeButton.dataset.skillPackageName = skillPackage.name;
      actionGroup.appendChild(removeButton);
      controls.appendChild(actionGroup);
      body.appendChild(controls);

      const metadata = documentRef.createElement('dl');
      metadata.className = 'mcp-server-metadata mb-0';
      appendMetadataEntry(metadata, 'Name', skillPackage.name);
      appendMetadataEntry(metadata, 'Lookup name', skillPackage.lookupName);
      appendMetadataEntry(metadata, 'Package file', skillPackage.packageName);
      appendMetadataEntry(metadata, 'Status', buildSkillPackageStatusText(skillPackage));
      appendMetadataEntry(metadata, 'Description', skillPackage.description);
      appendMetadataEntry(metadata, 'SKILL.md path', skillPackage.skillFilePath);
      appendMetadataEntry(
        metadata,
        'Files',
        Array.isArray(skillPackage.filePaths) && skillPackage.filePaths.length
          ? skillPackage.filePaths.join(', ')
          : ''
      );
      body.appendChild(metadata);

      if (skillPackage.issue) {
        const issue = documentRef.createElement('div');
        issue.className = skillPackage.isUsable
          ? 'alert alert-secondary py-2 px-3 mb-0'
          : 'alert alert-warning py-2 px-3 mb-0';
        issue.textContent = skillPackage.issue;
        body.appendChild(issue);
      }

      const markdownGroup = documentRef.createElement('div');
      const markdownHeading = documentRef.createElement('p');
      markdownHeading.className = 'form-label mb-1';
      markdownHeading.textContent = 'SKILL.md';
      markdownGroup.appendChild(markdownHeading);
      const markdownHelp = documentRef.createElement('p');
      markdownHelp.className = 'form-text mt-0 mb-2';
      markdownHelp.textContent =
        'This preview shows the exact stored markdown returned by read_skill.';
      markdownGroup.appendChild(markdownHelp);

      if (skillPackage.skillMarkdown) {
        const markdownPreview = documentRef.createElement('pre');
        markdownPreview.className = 'skill-markdown-preview mb-0';
        markdownPreview.textContent = skillPackage.skillMarkdown;
        markdownGroup.appendChild(markdownPreview);
      } else {
        const emptyState = documentRef.createElement('p');
        emptyState.className = 'text-body-secondary mb-0';
        emptyState.textContent = 'This package does not include a readable SKILL.md file.';
        markdownGroup.appendChild(emptyState);
      }

      body.appendChild(markdownGroup);
      collapse.appendChild(body);
      accordionItem.appendChild(collapse);
      skillsList.appendChild(accordionItem);
    });

    restoreAccordionUiState(skillsList, uiState);
  }

  function renderMcpServerPreferences() {
    if (!(mcpServersList instanceof HTMLElement)) {
      return;
    }
    const uiState = captureAccordionUiState(mcpServersList);
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
      refreshButton.className = 'btn btn-outline-primary btn-sm';
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
          commandToggle.disabled = !server.enabled;
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
          if (!server.enabled) {
            helpTextParts.push('Enable this server to change command availability.');
          }
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
    restoreAccordionUiState(mcpServersList, uiState);
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

  renderToolAvailabilityPreferences();
  renderSkillPackagePreferences();
  renderMcpServerPreferences();
  clearSkillPackageFeedback();
  clearMcpServerFeedback();

  return {
    applyEnabledToolNamesPreference,
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
  };
}
