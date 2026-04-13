export function createModelLoadFeedbackController({
  appState,
  documentRef = document,
  modelLoadFeedback,
  transcriptFeedbackHost = null,
  modelLoadProgressWrap,
  modelLoadProgressLabel,
  modelLoadProgressValue,
  modelLoadProgressBar,
  modelLoadProgressSummary,
  modelLoadCurrentFileLabel,
  modelLoadCurrentFileValue,
  modelLoadCurrentFileBar,
  modelLoadError,
  modelLoadErrorSummary,
  modelLoadErrorDetails,
  modelCardList,
  getSelectedModelId = () => '',
}) {
  const view = documentRef?.defaultView || window;
  const fallbackParent = modelLoadFeedback?.parentElement || null;
  let feedbackContext = 'selected-model';

  function getTrackedFileNoun(count) {
    return count === 1 ? 'file' : 'files';
  }

  function getAggregateLoadSummary(totalCount, totalLoadedBytes, totalBytes) {
    if (!totalCount) {
      return 'Waiting for model files...';
    }
    if (totalBytes > 0) {
      return `${formatBytes(totalLoadedBytes)} of ${formatBytes(totalBytes)} downloaded across ${totalCount} ${getTrackedFileNoun(totalCount)}`;
    }
    if (totalLoadedBytes > 0) {
      return `${formatBytes(totalLoadedBytes)} downloaded across ${totalCount} ${getTrackedFileNoun(totalCount)}`;
    }
    return `Preparing ${totalCount} model ${getTrackedFileNoun(totalCount)}...`;
  }

  function getLatestTrackedEntry(entries) {
    return [...entries].sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;
  }

  function getCurrentFileValueText(entry) {
    if (!entry) {
      return 'Waiting...';
    }
    if (entry.hasKnownTotal && entry.totalBytes > 0) {
      return `${formatBytes(entry.loadedBytes)} / ${formatBytes(entry.totalBytes)}`;
    }
    if (entry.loadedBytes > 0) {
      return `${formatBytes(entry.loadedBytes)} downloaded`;
    }
    return 'Downloading...';
  }

  function getCurrentFileAriaText(entry, fallbackMessage = 'Loading model files...') {
    if (!entry) {
      return fallbackMessage;
    }
    const label = entry.label || 'Current file';
    if (entry.hasKnownTotal && entry.totalBytes > 0) {
      return `${label}: ${formatBytes(entry.loadedBytes)} of ${formatBytes(entry.totalBytes)} downloaded`;
    }
    if (entry.loadedBytes > 0) {
      return `${label}: ${formatBytes(entry.loadedBytes)} downloaded`;
    }
    return `${label}: downloading`;
  }

  function getLoadProgressStats() {
    const entries = [...appState.loadProgressFiles.values()];
    const totalLoadedBytes = entries.reduce((total, entry) => {
      const loadedBytes = Number.isFinite(entry?.loadedBytes) ? Math.max(0, entry.loadedBytes) : 0;
      const totalBytes = Number.isFinite(entry?.totalBytes) ? Math.max(0, entry.totalBytes) : 0;
      if (totalBytes > 0) {
        return total + Math.min(loadedBytes, totalBytes);
      }
      if (entry?.isComplete && loadedBytes > 0) {
        return total + loadedBytes;
      }
      return total + loadedBytes;
    }, 0);
    const totalBytes = entries.reduce((total, entry) => {
      const totalBytesForEntry =
        Number.isFinite(entry?.totalBytes) && entry.totalBytes > 0
          ? entry.totalBytes
          : entry?.isComplete && Number.isFinite(entry?.loadedBytes) && entry.loadedBytes > 0
            ? entry.loadedBytes
            : 0;
      return total + totalBytesForEntry;
    }, 0);
    return {
      entries,
      totalCount: entries.length,
      completeCount: entries.filter((entry) => entry.isComplete).length,
      totalLoadedBytes,
      totalBytes,
    };
  }

  function findSelectedModelFeedbackHost() {
    if (!(modelCardList instanceof HTMLElement)) {
      return null;
    }
    const selectedModelId =
      typeof getSelectedModelId === 'function' ? String(getSelectedModelId() || '').trim() : '';
    if (!selectedModelId) {
      return null;
    }
    const escapedModelId = view.CSS?.escape ? view.CSS.escape(selectedModelId) : selectedModelId;
    const selectedButton = modelCardList.querySelector(
      `.model-card-button[data-model-id="${escapedModelId}"]`
    );
    if (!(selectedButton instanceof HTMLElement)) {
      return null;
    }
    const selectedCard = selectedButton.closest('.model-card');
    if (!(selectedCard instanceof HTMLElement)) {
      return null;
    }
    return selectedCard.querySelector('.model-card-feedback-slot');
  }

  function setFeedbackContext(nextContext = 'selected-model') {
    feedbackContext = nextContext === 'transcript' ? 'transcript' : 'selected-model';
    syncFeedbackHost();
  }

  function getFeedbackHost() {
    if (feedbackContext === 'transcript' && transcriptFeedbackHost instanceof HTMLElement) {
      return transcriptFeedbackHost;
    }
    return findSelectedModelFeedbackHost() || fallbackParent;
  }

  function syncFeedbackHost() {
    if (!(modelLoadFeedback instanceof HTMLElement)) {
      return;
    }
    const nextParent = getFeedbackHost();
    if (nextParent instanceof HTMLElement && modelLoadFeedback.parentElement !== nextParent) {
      nextParent.appendChild(modelLoadFeedback);
    }
  }

  function syncFeedbackVisibility() {
    if (!(modelLoadFeedback instanceof HTMLElement)) {
      return;
    }
    const hasVisibleProgress =
      modelLoadProgressWrap instanceof HTMLElement && !modelLoadProgressWrap.classList.contains('d-none');
    const hasVisibleError =
      modelLoadError instanceof HTMLElement && !modelLoadError.classList.contains('d-none');
    modelLoadFeedback.classList.toggle('d-none', !hasVisibleProgress && !hasVisibleError);
  }

  function showProgressRegion(show) {
    syncFeedbackHost();
    if (!modelLoadProgressWrap) {
      return;
    }
    modelLoadProgressWrap.classList.toggle('d-none', !show);
    syncFeedbackVisibility();
  }

  function formatLoadFileLabel(fileName) {
    if (typeof fileName !== 'string' || !fileName.trim()) {
      return '';
    }
    const normalized = fileName.replace(/\\/g, '/');
    const segments = normalized.split('/').filter(Boolean);
    return segments[segments.length - 1] || normalized;
  }

  function formatBytes(value) {
    if (!Number.isFinite(value) || value <= 0) {
      return '0 B';
    }
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = value;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }
    const decimals = size >= 100 || unitIndex === 0 ? 0 : 1;
    return `${size.toFixed(decimals)} ${units[unitIndex]}`;
  }

  function setCurrentFileProgressBar({ percent = 0, indeterminate = false, animate = true }) {
    if (!modelLoadCurrentFileBar) {
      return;
    }
    const boundedPercent = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
    if (!animate) {
      modelLoadCurrentFileBar.classList.add('model-load-bar-no-transition');
    }
    modelLoadCurrentFileBar.classList.toggle('model-load-bar-indeterminate', indeterminate);
    if (indeterminate) {
      modelLoadCurrentFileBar.style.width = '35%';
      modelLoadCurrentFileBar.removeAttribute('aria-valuenow');
    } else {
      modelLoadCurrentFileBar.style.width = `${boundedPercent}%`;
      modelLoadCurrentFileBar.setAttribute('aria-valuenow', `${Math.round(boundedPercent)}`);
    }
    if (!animate) {
      view.requestAnimationFrame(() => {
        modelLoadCurrentFileBar.classList.remove('model-load-bar-no-transition');
      });
    }
  }

  function renderLoadProgressFiles() {
    if (!modelLoadProgressSummary && !modelLoadCurrentFileLabel && !modelLoadCurrentFileValue) {
      return;
    }
    const { entries, totalCount, totalLoadedBytes, totalBytes } = getLoadProgressStats();
    const latestEntry = getLatestTrackedEntry(entries);
    const summaryText = getAggregateLoadSummary(totalCount, totalLoadedBytes, totalBytes);
    if (modelLoadProgressSummary) {
      modelLoadProgressSummary.textContent = summaryText;
    }
    if (!latestEntry) {
      if (modelLoadCurrentFileLabel) {
        modelLoadCurrentFileLabel.textContent = 'Current file';
      }
      if (modelLoadCurrentFileValue) {
        modelLoadCurrentFileValue.textContent = 'Waiting...';
      }
      setCurrentFileProgressBar({ percent: 0, indeterminate: false, animate: false });
      return;
    }

    if (modelLoadCurrentFileLabel) {
      modelLoadCurrentFileLabel.textContent = latestEntry.label || 'Current file';
    }
    if (modelLoadCurrentFileValue) {
      modelLoadCurrentFileValue.textContent = getCurrentFileValueText(latestEntry);
    }
    setCurrentFileProgressBar({
      percent: latestEntry.percent,
      indeterminate: latestEntry.isIndeterminate,
    });
  }

  function resetLoadProgressFiles() {
    appState.maxObservedLoadPercent = 0;
    appState.loadProgressSequence = 0;
    appState.loadProgressFiles.clear();
    renderLoadProgressFiles();
  }

  function trackLoadFileProgress(file, percent, status, loadedBytes, totalBytes) {
    if (typeof file !== 'string' || !file.trim()) {
      return;
    }
    const key = file.trim();
    const numericPercent = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
    const statusText = typeof status === 'string' ? status.trim() : '';
    const numericLoadedBytes = Number.isFinite(loadedBytes) && loadedBytes > 0 ? loadedBytes : 0;
    const numericTotalBytes = Number.isFinite(totalBytes) && totalBytes > 0 ? totalBytes : 0;
    const hasKnownTotal = numericTotalBytes > 0;
    const percentFromBytes = hasKnownTotal ? (numericLoadedBytes / numericTotalBytes) * 100 : null;
    const effectivePercent = Number.isFinite(percentFromBytes) ? percentFromBytes : numericPercent;
    const previous = appState.loadProgressFiles.get(key);
    const nextSequence =
      Number.isFinite(appState.loadProgressSequence) && appState.loadProgressSequence >= 0
        ? appState.loadProgressSequence + 1
        : 1;
    appState.loadProgressSequence = nextSequence;
    const isComplete =
      effectivePercent >= 100 ||
      (hasKnownTotal && numericLoadedBytes >= numericTotalBytes) ||
      /complete|ready|loaded|done|cached/i.test(statusText);
    appState.loadProgressFiles.set(key, {
      label: formatLoadFileLabel(key),
      percent: previous ? Math.max(previous.percent, effectivePercent) : effectivePercent,
      status: statusText || previous?.status || '',
      loadedBytes: previous
        ? Math.max(previous.loadedBytes || 0, numericLoadedBytes)
        : numericLoadedBytes,
      totalBytes: hasKnownTotal ? numericTotalBytes : previous?.totalBytes || 0,
      hasKnownTotal: hasKnownTotal || Boolean(previous?.hasKnownTotal),
      isIndeterminate: !hasKnownTotal && !isComplete,
      isComplete: Boolean(previous?.isComplete || isComplete),
      updatedAt: nextSequence,
    });
    renderLoadProgressFiles();
  }

  function clearLoadError() {
    if (modelLoadError) {
      modelLoadError.classList.add('d-none');
    }
    if (modelLoadErrorSummary) {
      modelLoadErrorSummary.textContent = '';
    }
    if (modelLoadErrorDetails) {
      modelLoadErrorDetails.replaceChildren();
    }
    syncFeedbackVisibility();
  }

  function setLoadProgress({
    percent = 0,
    message = 'Preparing model...',
    file = '',
    status = '',
    loadedBytes = 0,
    totalBytes = 0,
  }) {
    const numericPercent = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
    const isCompletedMessage =
      /^model ready\.$/i.test(String(message || '').trim()) ||
      /^loaded .+ \((webgpu|wasm|cpu)\)\.$/i.test(String(message || '').trim());
    const normalizedPercent = isCompletedMessage ? 100 : numericPercent;
    if (modelLoadProgressLabel) {
      modelLoadProgressLabel.textContent = message;
    }
    trackLoadFileProgress(file, normalizedPercent, status || message, loadedBytes, totalBytes);
    const { entries } = getLoadProgressStats();
    const latestEntry = getLatestTrackedEntry(entries);
    const displayPercent = latestEntry ? latestEntry.percent : normalizedPercent;
    appState.maxObservedLoadPercent = displayPercent;
    if (modelLoadProgressValue) {
      modelLoadProgressValue.textContent = latestEntry
        ? getCurrentFileValueText(latestEntry)
        : `${Math.round(displayPercent)}%`;
    }
    if (modelLoadProgressBar) {
      modelLoadProgressBar.style.width = `${displayPercent}%`;
      modelLoadProgressBar.setAttribute('aria-valuenow', `${Math.round(displayPercent)}`);
      modelLoadProgressBar.setAttribute(
        'aria-valuetext',
        getCurrentFileAriaText(latestEntry, message)
      );
      modelLoadProgressBar.classList.toggle('progress-bar-animated', displayPercent < 100);
    }
  }

  function showLoadError(errorMessage) {
    syncFeedbackHost();
    if (!modelLoadError) {
      return;
    }
    const parts = String(errorMessage || 'Unknown initialization error')
      .split(' | ')
      .map((segment) => segment.trim())
      .filter(Boolean);
    const [summary, ...details] = parts;
    if (modelLoadErrorSummary) {
      modelLoadErrorSummary.textContent = summary || 'Failed to initialize the selected model.';
    }
    if (modelLoadErrorDetails) {
      modelLoadErrorDetails.replaceChildren();
      details.forEach((detail) => {
        const item = documentRef.createElement('li');
        item.textContent = detail;
        modelLoadErrorDetails.appendChild(item);
      });
    }
    modelLoadError.classList.remove('d-none');
    syncFeedbackVisibility();
  }

  return {
    clearLoadError,
    resetLoadProgressFiles,
    setFeedbackContext,
    setLoadProgress,
    showLoadError,
    showProgressRegion,
    syncFeedbackHost,
  };
}
