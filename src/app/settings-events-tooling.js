function refreshPromptPreview(refreshConversationSystemPromptPreview) {
  if (typeof refreshConversationSystemPromptPreview === 'function') {
    refreshConversationSystemPromptPreview();
  }
}

export function bindToolingSettingsEvents({
  enableToolCallingToggle,
  toolSettingsList,
  corsProxyForm,
  corsProxyInput,
  saveCorsProxyButton,
  clearCorsProxyButton,
  mcpServerEndpointForm,
  mcpServerEndpointInput,
  addMcpServerButton,
  mcpServersList,
  applyToolCallingPreference,
  applyToolEnabledPreference,
  saveCorsProxyPreference,
  clearCorsProxyPreference,
  setCorsProxyFeedback,
  clearCorsProxyFeedback,
  applyMcpServerEnabledPreference,
  applyMcpServerCommandEnabledPreference,
  clearMcpServerFeedback,
  importMcpServerEndpoint,
  refreshConversationSystemPromptPreview,
  refreshMcpServerPreference,
  removeMcpServerPreference,
  setMcpServerFeedback,
  setStatus,
}) {
  if (enableToolCallingToggle instanceof HTMLInputElement) {
    enableToolCallingToggle.addEventListener('change', (event) => {
      const value = event.target instanceof HTMLInputElement ? event.target.checked : true;
      applyToolCallingPreference(value, { persist: true });
      refreshPromptPreview(refreshConversationSystemPromptPreview);
      setStatus(value ? 'Tool calling enabled.' : 'Tool calling disabled.');
    });
  }

  if (toolSettingsList instanceof HTMLElement) {
    toolSettingsList.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.dataset.toolToggle !== 'true') {
        return;
      }
      const toolName = typeof target.dataset.toolName === 'string' ? target.dataset.toolName : '';
      const toolLabel =
        typeof target.dataset.toolDisplayName === 'string' && target.dataset.toolDisplayName.trim()
          ? target.dataset.toolDisplayName.trim()
          : toolName;
      applyToolEnabledPreference(toolName, target.checked, { persist: true });
      refreshPromptPreview(refreshConversationSystemPromptPreview);
      setStatus(
        target.checked
          ? `${toolLabel} enabled for tool calling.`
          : `${toolLabel} disabled for tool calling.`
      );
    });
  }

  async function handleCorsProxySave() {
    const proxyUrl = corsProxyInput instanceof HTMLInputElement ? corsProxyInput.value : '';
    if (saveCorsProxyButton instanceof HTMLButtonElement) {
      saveCorsProxyButton.disabled = true;
    }
    if (typeof setCorsProxyFeedback === 'function') {
      setCorsProxyFeedback('Validating CORS proxy...', 'info');
    }
    try {
      const normalizedProxyUrl = await saveCorsProxyPreference(proxyUrl, { persist: true });
      if (typeof setCorsProxyFeedback === 'function') {
        setCorsProxyFeedback(
          `Saved. Direct browser requests will retry through ${normalizedProxyUrl} only when they appear CORS-blocked.`,
          'success'
        );
      }
      setStatus('CORS proxy saved.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (typeof setCorsProxyFeedback === 'function') {
        setCorsProxyFeedback(message, 'danger');
      }
      setStatus(message);
    } finally {
      if (saveCorsProxyButton instanceof HTMLButtonElement) {
        saveCorsProxyButton.disabled = false;
      }
    }
  }

  if (corsProxyForm instanceof HTMLElement && corsProxyForm.tagName === 'FORM') {
    corsProxyForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void handleCorsProxySave();
    });
  }

  if (corsProxyInput instanceof HTMLInputElement) {
    corsProxyInput.addEventListener('input', () => {
      if (typeof clearCorsProxyFeedback === 'function') {
        clearCorsProxyFeedback();
      }
    });
  }

  if (clearCorsProxyButton instanceof HTMLButtonElement) {
    clearCorsProxyButton.addEventListener('click', () => {
      if (typeof clearCorsProxyPreference === 'function') {
        clearCorsProxyPreference({ persist: true });
      }
      if (typeof clearCorsProxyFeedback === 'function') {
        clearCorsProxyFeedback();
      }
      setStatus('CORS proxy cleared.');
    });
  }

  async function handleMcpServerImport() {
    const endpoint =
      mcpServerEndpointInput instanceof HTMLInputElement ? mcpServerEndpointInput.value : '';
    if (addMcpServerButton instanceof HTMLButtonElement) {
      addMcpServerButton.disabled = true;
    }
    if (typeof setMcpServerFeedback === 'function') {
      setMcpServerFeedback('Connecting to MCP server...', 'info');
    }
    try {
      const importedServer = await importMcpServerEndpoint(endpoint, { persist: true });
      refreshPromptPreview(refreshConversationSystemPromptPreview);
      setStatus(
        `${importedServer.displayName} added. Enable the server and any commands you want exposed.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (typeof setMcpServerFeedback === 'function') {
        setMcpServerFeedback(message, 'danger');
      }
      setStatus(message);
    } finally {
      if (addMcpServerButton instanceof HTMLButtonElement) {
        addMcpServerButton.disabled = false;
      }
    }
  }

  if (mcpServerEndpointForm instanceof HTMLElement && mcpServerEndpointForm.tagName === 'FORM') {
    mcpServerEndpointForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void handleMcpServerImport();
    });
  }

  if (mcpServerEndpointInput instanceof HTMLInputElement) {
    mcpServerEndpointInput.addEventListener('input', () => {
      if (typeof clearMcpServerFeedback === 'function') {
        clearMcpServerFeedback();
      }
    });
  }

  if (mcpServersList instanceof HTMLElement) {
    mcpServersList.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }
      if (target.dataset.mcpServerToggle === 'true') {
        const serverId =
          typeof target.dataset.mcpServerId === 'string' ? target.dataset.mcpServerId : '';
        const serverLabel =
          typeof target.dataset.mcpServerDisplayName === 'string' &&
          target.dataset.mcpServerDisplayName.trim()
            ? target.dataset.mcpServerDisplayName.trim()
            : serverId;
        applyMcpServerEnabledPreference(serverId, target.checked, { persist: true });
        refreshPromptPreview(refreshConversationSystemPromptPreview);
        setStatus(target.checked ? `${serverLabel} enabled.` : `${serverLabel} disabled.`);
        return;
      }
      if (target.dataset.mcpCommandToggle === 'true') {
        const serverId =
          typeof target.dataset.mcpServerId === 'string' ? target.dataset.mcpServerId : '';
        const commandName =
          typeof target.dataset.mcpCommandName === 'string' ? target.dataset.mcpCommandName : '';
        const commandLabel =
          typeof target.dataset.mcpCommandDisplayName === 'string' &&
          target.dataset.mcpCommandDisplayName.trim()
            ? target.dataset.mcpCommandDisplayName.trim()
            : commandName;
        applyMcpServerCommandEnabledPreference(serverId, commandName, target.checked, {
          persist: true,
        });
        refreshPromptPreview(refreshConversationSystemPromptPreview);
        setStatus(
          target.checked
            ? `${commandLabel} enabled for MCP server use.`
            : `${commandLabel} disabled for MCP server use.`
        );
      }
    });

    mcpServersList.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const refreshButton = target.closest('button[data-mcp-server-refresh="true"]');
      if (refreshButton instanceof HTMLButtonElement) {
        const serverId =
          typeof refreshButton.dataset.mcpServerId === 'string'
            ? refreshButton.dataset.mcpServerId
            : '';
        refreshButton.disabled = true;
        if (typeof setMcpServerFeedback === 'function') {
          setMcpServerFeedback('Refreshing MCP server metadata...', 'info');
        }
        void refreshMcpServerPreference(serverId, { persist: true })
          .then(
            (server) => {
              refreshPromptPreview(refreshConversationSystemPromptPreview);
              setStatus(`${server.displayName} metadata refreshed.`);
            },
            (error) => {
              const message = error instanceof Error ? error.message : String(error);
              if (typeof setMcpServerFeedback === 'function') {
                setMcpServerFeedback(message, 'danger');
              }
              setStatus(message);
            }
          )
          .finally(() => {
            refreshButton.disabled = false;
          });
        return;
      }

      const removeButton = target.closest('button[data-mcp-server-remove="true"]');
      if (removeButton instanceof HTMLButtonElement) {
        const serverId =
          typeof removeButton.dataset.mcpServerId === 'string'
            ? removeButton.dataset.mcpServerId
            : '';
        removeMcpServerPreference(serverId, { persist: true });
        refreshPromptPreview(refreshConversationSystemPromptPreview);
        if (typeof clearMcpServerFeedback === 'function') {
          clearMcpServerFeedback();
        }
        setStatus('MCP server removed.');
      }
    });
  }
}
