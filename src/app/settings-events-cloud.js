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

function readCloudModelRateLimitFromPanel(panel) {
  if (!(panel instanceof HTMLElement)) {
    return null;
  }
  const values = {};
  panel.querySelectorAll('[data-cloud-model-rate-limit]').forEach((input) => {
    if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLSelectElement)) {
      return;
    }
    values[input.dataset.cloudModelRateLimit] = input.value;
  });
  return values;
}

function readCloudModelThinkingFromPanel(panel) {
  if (!(panel instanceof HTMLElement)) {
    return null;
  }
  const values = {};
  const toggle = panel.querySelector('input[data-cloud-model-thinking-toggle="true"]');
  values.enabled = toggle instanceof HTMLInputElement ? toggle.checked : false;
  panel.querySelectorAll('textarea[data-cloud-model-thinking-setting]').forEach((textarea) => {
    if (!(textarea instanceof HTMLTextAreaElement)) {
      return;
    }
    values[textarea.dataset.cloudModelThinkingSetting] = textarea.value;
  });
  return values;
}

function hasCompleteRateLimit(rateLimit) {
  return Boolean(
    rateLimit?.maxRequests?.trim() &&
    (rateLimit?.windowValue?.trim() || rateLimit?.windowMinutes?.trim()) &&
    rateLimit?.windowUnit?.trim()
  );
}

function isEmptyRateLimit(rateLimit) {
  return (
    !rateLimit?.maxRequests?.trim() &&
    !rateLimit?.windowValue?.trim() &&
    !rateLimit?.windowMinutes?.trim()
  );
}

export function bindCloudProviderSettingsEvents({
  cloudProviderForm,
  cloudProviderNameInput,
  cloudProviderEndpointInput,
  cloudProviderApiKeyInput,
  addCloudProviderButton,
  cloudProvidersList,
  addCloudProvider,
  setCloudProviderFeedback,
  clearCloudProviderFeedback,
  refreshCloudProviderPreference,
  removeCloudProviderPreference,
  saveCloudProviderSecretPreference,
  setCloudProviderModelSelected,
  updateCloudModelFeaturePreference,
  updateCloudModelGenerationPreference,
  updateCloudModelThinkingPreference,
  updateCloudModelRateLimitPreference,
  setStatus,
}) {
  async function handleCloudProviderAdd() {
    const endpoint =
      cloudProviderEndpointInput instanceof HTMLInputElement
        ? cloudProviderEndpointInput.value
        : '';
    const apiKey =
      cloudProviderApiKeyInput instanceof HTMLInputElement ? cloudProviderApiKeyInput.value : '';
    const providerName =
      cloudProviderNameInput instanceof HTMLInputElement ? cloudProviderNameInput.value : '';
    if (addCloudProviderButton instanceof HTMLButtonElement) {
      addCloudProviderButton.disabled = true;
    }
    if (typeof setCloudProviderFeedback === 'function') {
      setCloudProviderFeedback('Testing cloud provider...', 'info');
    }
    try {
      const provider = await addCloudProvider(endpoint, apiKey, providerName);
      if (cloudProviderNameInput instanceof HTMLInputElement) {
        cloudProviderNameInput.value = '';
      }
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

  if (cloudProviderNameInput instanceof HTMLInputElement) {
    cloudProviderNameInput.addEventListener('input', () => {
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
    cloudProvidersList.addEventListener('submit', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || target.tagName !== 'FORM') {
        return;
      }
      if (target.dataset.cloudProviderSecretForm !== 'true') {
        return;
      }
      event.preventDefault();
      const providerId =
        typeof target.dataset.cloudProviderId === 'string' ? target.dataset.cloudProviderId : '';
      const secretInput = target.querySelector('input[data-cloud-provider-secret-input="true"]');
      const apiKey = secretInput instanceof HTMLInputElement ? secretInput.value : '';
      const submitButton = target.querySelector('button[type="submit"]');
      if (submitButton instanceof HTMLButtonElement) {
        submitButton.disabled = true;
      }
      if (secretInput instanceof HTMLInputElement) {
        secretInput.disabled = true;
      }
      void saveCloudProviderSecretPreference(providerId, apiKey)
        .then(
          () => {
            if (secretInput instanceof HTMLInputElement) {
              secretInput.value = '';
            }
            setStatus('Cloud provider API key saved.');
          },
          (error) => {
            setStatus(error instanceof Error ? error.message : String(error));
          }
        )
        .finally(() => {
          if (submitButton instanceof HTMLButtonElement) {
            submitButton.disabled = false;
          }
          if (secretInput instanceof HTMLInputElement) {
            secretInput.disabled = false;
          }
        });
    });

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
        typeof target.dataset.cloudModelFeature === 'string'
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
        const featureKey = target.dataset.cloudModelFeature;
        target.disabled = true;
        void updateCloudModelFeaturePreference(
          providerId,
          remoteModelId,
          featureKey,
          target.checked
        )
          .then(
            () => {
              setStatus(
                target.checked
                  ? `Built-in tools enabled for ${remoteModelDisplayName}.`
                  : `Built-in tools disabled for ${remoteModelDisplayName}.`
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
        (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) &&
        (target.dataset.cloudModelThinkingToggle === 'true' ||
          typeof target.dataset.cloudModelThinkingSetting === 'string')
      ) {
        const panel = target.closest('[data-cloud-model-config="true"]');
        const thinking = readCloudModelThinkingFromPanel(panel);
        const providerId =
          panel instanceof HTMLElement && typeof panel.dataset.cloudProviderId === 'string'
            ? panel.dataset.cloudProviderId
            : '';
        const remoteModelId =
          panel instanceof HTMLElement && typeof panel.dataset.cloudRemoteModelId === 'string'
            ? panel.dataset.cloudRemoteModelId
            : '';
        const remoteModelDisplayName =
          target instanceof HTMLElement &&
          typeof target.dataset.cloudRemoteModelDisplayName === 'string' &&
          target.dataset.cloudRemoteModelDisplayName.trim()
            ? target.dataset.cloudRemoteModelDisplayName.trim()
            : remoteModelId;
        if (!thinking || !providerId || !remoteModelId) {
          return;
        }
        if (typeof updateCloudModelThinkingPreference !== 'function') {
          setStatus('Cloud model thinking settings are unavailable.');
          return;
        }
        if (
          target instanceof HTMLInputElement &&
          target.dataset.cloudModelThinkingToggle === 'true'
        ) {
          panel
            ?.querySelectorAll('textarea[data-cloud-model-thinking-setting]')
            .forEach((textarea) => {
              if (textarea instanceof HTMLTextAreaElement) {
                textarea.disabled = !target.checked;
              }
            });
        }
        if (
          thinking.enabled &&
          !thinking.enabledInstruction?.trim() &&
          !thinking.disabledInstruction?.trim()
        ) {
          setStatus(
            'Enter at least one thinking system-prompt instruction to enable thinking control.'
          );
          return;
        }
        target.disabled = true;
        void updateCloudModelThinkingPreference(providerId, remoteModelId, thinking)
          .then(
            () => {
              setStatus(
                thinking.enabled
                  ? `Thinking control enabled for ${remoteModelDisplayName}.`
                  : `Thinking control disabled for ${remoteModelDisplayName}.`
              );
            },
            (error) => {
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
        return;
      }

      if (
        (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) &&
        typeof target.dataset.cloudModelRateLimit === 'string'
      ) {
        const panel = target.closest('[data-cloud-model-config="true"]');
        const rateLimit = readCloudModelRateLimitFromPanel(panel);
        const providerId =
          panel instanceof HTMLElement && typeof panel.dataset.cloudProviderId === 'string'
            ? panel.dataset.cloudProviderId
            : '';
        const remoteModelId =
          panel instanceof HTMLElement && typeof panel.dataset.cloudRemoteModelId === 'string'
            ? panel.dataset.cloudRemoteModelId
            : '';
        if (!rateLimit || !providerId || !remoteModelId) {
          return;
        }
        const targetValue = typeof target.value === 'string' ? target.value.trim() : '';
        const shouldDisableIncompleteRateLimit = !targetValue;
        if (
          !hasCompleteRateLimit(rateLimit) &&
          !isEmptyRateLimit(rateLimit) &&
          !shouldDisableIncompleteRateLimit
        ) {
          setStatus(
            'Enter both the request count and window length to save a cloud model rate limit.'
          );
          return;
        }
        target.disabled = true;
        void updateCloudModelRateLimitPreference(providerId, remoteModelId, rateLimit)
          .then(
            () => {
              setStatus('Cloud model rate limit updated.');
            },
            (error) => {
              setStatus(error instanceof Error ? error.message : String(error));
            }
          )
          .finally(() => {
            target.disabled = false;
          });
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
    });
  }
}
