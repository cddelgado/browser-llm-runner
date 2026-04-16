function readCloudModelSettingsFromPanel(panel) {
  if (!(panel instanceof HTMLElement)) {
    return null;
  }
  const values = {};
  panel.querySelectorAll('input[data-cloud-model-setting]').forEach((input) => {
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    values[input.dataset.cloudModelSetting] = input.value;
  });
  return values;
}

export function bindCloudProviderSettingsEvents({
  cloudProviderForm,
  cloudProviderEndpointInput,
  cloudProviderApiKeyInput,
  addCloudProviderButton,
  cloudProvidersList,
  addCloudProvider,
  setCloudProviderFeedback,
  clearCloudProviderFeedback,
  refreshCloudProviderPreference,
  removeCloudProviderPreference,
  setCloudProviderModelSelected,
  updateCloudModelGenerationPreference,
  resetCloudModelGenerationPreference,
  setStatus,
}) {
  async function handleCloudProviderAdd() {
    const endpoint =
      cloudProviderEndpointInput instanceof HTMLInputElement ? cloudProviderEndpointInput.value : '';
    const apiKey =
      cloudProviderApiKeyInput instanceof HTMLInputElement ? cloudProviderApiKeyInput.value : '';
    if (addCloudProviderButton instanceof HTMLButtonElement) {
      addCloudProviderButton.disabled = true;
    }
    if (typeof setCloudProviderFeedback === 'function') {
      setCloudProviderFeedback('Testing cloud provider...', 'info');
    }
    try {
      const provider = await addCloudProvider(endpoint, apiKey);
      if (cloudProviderEndpointInput instanceof HTMLInputElement) {
        cloudProviderEndpointInput.value = '';
      }
      if (cloudProviderApiKeyInput instanceof HTMLInputElement) {
        cloudProviderApiKeyInput.value = '';
      }
      if (typeof setCloudProviderFeedback === 'function') {
        setCloudProviderFeedback(
          `${provider.displayName} added. Select the models you want available in chat.`,
          'success'
        );
      }
      setStatus(`${provider.displayName} added.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (typeof setCloudProviderFeedback === 'function') {
        setCloudProviderFeedback(message, 'danger');
      }
      setStatus(message);
    } finally {
      if (addCloudProviderButton instanceof HTMLButtonElement) {
        addCloudProviderButton.disabled = false;
      }
    }
  }

  if (cloudProviderForm instanceof HTMLElement && cloudProviderForm.tagName === 'FORM') {
    cloudProviderForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void handleCloudProviderAdd();
    });
  }

  if (cloudProviderEndpointInput instanceof HTMLInputElement) {
    cloudProviderEndpointInput.addEventListener('input', () => {
      if (typeof clearCloudProviderFeedback === 'function') {
        clearCloudProviderFeedback();
      }
    });
  }

  if (cloudProviderApiKeyInput instanceof HTMLInputElement) {
    cloudProviderApiKeyInput.addEventListener('input', () => {
      if (typeof clearCloudProviderFeedback === 'function') {
        clearCloudProviderFeedback();
      }
    });
  }

  if (cloudProvidersList instanceof HTMLElement) {
    cloudProvidersList.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (
        target instanceof HTMLInputElement &&
        target.dataset.cloudProviderModelToggle === 'true'
      ) {
        const providerId =
          typeof target.dataset.cloudProviderId === 'string' ? target.dataset.cloudProviderId : '';
        const remoteModelId =
          typeof target.dataset.cloudRemoteModelId === 'string'
            ? target.dataset.cloudRemoteModelId
            : '';
        const remoteModelDisplayName =
          typeof target.dataset.cloudRemoteModelDisplayName === 'string' &&
          target.dataset.cloudRemoteModelDisplayName.trim()
            ? target.dataset.cloudRemoteModelDisplayName.trim()
            : remoteModelId;
        target.disabled = true;
        void setCloudProviderModelSelected(providerId, remoteModelId, target.checked)
          .then(
            () => {
              setStatus(
                target.checked
                  ? `${remoteModelDisplayName} added to the model picker.`
                  : `${remoteModelDisplayName} removed from the model picker.`
              );
            },
            (error) => {
              target.checked = !target.checked;
              setStatus(error instanceof Error ? error.message : String(error));
            }
          )
          .finally(() => {
            target.disabled = false;
          });
        return;
      }

      if (
        target instanceof HTMLInputElement &&
        typeof target.dataset.cloudModelSetting === 'string'
      ) {
        const panel = target.closest('[data-cloud-model-config="true"]');
        const settings = readCloudModelSettingsFromPanel(panel);
        const providerId =
          panel instanceof HTMLElement && typeof panel.dataset.cloudProviderId === 'string'
            ? panel.dataset.cloudProviderId
            : '';
        const remoteModelId =
          panel instanceof HTMLElement && typeof panel.dataset.cloudRemoteModelId === 'string'
            ? panel.dataset.cloudRemoteModelId
            : '';
        if (!settings || !providerId || !remoteModelId) {
          return;
        }
        try {
          updateCloudModelGenerationPreference(providerId, remoteModelId, settings);
          setStatus('Cloud model defaults updated.');
        } catch (error) {
          setStatus(error instanceof Error ? error.message : String(error));
        }
      }
    });

    cloudProvidersList.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const refreshButton = target.closest('button[data-cloud-provider-refresh="true"]');
      if (refreshButton instanceof HTMLButtonElement) {
        const providerId =
          typeof refreshButton.dataset.cloudProviderId === 'string'
            ? refreshButton.dataset.cloudProviderId
            : '';
        refreshButton.disabled = true;
        if (typeof setCloudProviderFeedback === 'function') {
          setCloudProviderFeedback('Refreshing cloud provider models...', 'info');
        }
        void refreshCloudProviderPreference(providerId)
          .then(
            (provider) => {
              if (typeof setCloudProviderFeedback === 'function') {
                setCloudProviderFeedback(`${provider.displayName} refreshed.`, 'success');
              }
              setStatus(`${provider.displayName} refreshed.`);
            },
            (error) => {
              const message = error instanceof Error ? error.message : String(error);
              if (typeof setCloudProviderFeedback === 'function') {
                setCloudProviderFeedback(message, 'danger');
              }
              setStatus(message);
            }
          )
          .finally(() => {
            refreshButton.disabled = false;
          });
        return;
      }

      const removeButton = target.closest('button[data-cloud-provider-remove="true"]');
      if (removeButton instanceof HTMLButtonElement) {
        const providerId =
          typeof removeButton.dataset.cloudProviderId === 'string'
            ? removeButton.dataset.cloudProviderId
            : '';
        removeButton.disabled = true;
        void removeCloudProviderPreference(providerId)
          .then(
            () => {
              if (typeof clearCloudProviderFeedback === 'function') {
                clearCloudProviderFeedback();
              }
              setStatus('Cloud provider removed.');
            },
            (error) => {
              setStatus(error instanceof Error ? error.message : String(error));
            }
          )
          .finally(() => {
            removeButton.disabled = false;
          });
        return;
      }

      const resetButton = target.closest('button[data-cloud-model-reset="true"]');
      if (resetButton instanceof HTMLButtonElement) {
        const providerId =
          typeof resetButton.dataset.cloudProviderId === 'string'
            ? resetButton.dataset.cloudProviderId
            : '';
        const remoteModelId =
          typeof resetButton.dataset.cloudRemoteModelId === 'string'
            ? resetButton.dataset.cloudRemoteModelId
            : '';
        try {
          resetCloudModelGenerationPreference(providerId, remoteModelId);
          setStatus('Cloud model defaults reset.');
        } catch (error) {
          setStatus(error instanceof Error ? error.message : String(error));
        }
      }
    });
  }
}
