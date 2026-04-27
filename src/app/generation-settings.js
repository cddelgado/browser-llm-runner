import {
  buildDefaultGenerationConfig,
  sanitizeGenerationConfig,
} from '../config/generation-config.js';
import {
  DEFAULT_GENERATION_LIMITS,
  DEFAULT_MODEL,
  MAX_TOP_K,
  MAX_TOP_P,
  MIN_TOKEN_LIMIT,
  MIN_TOP_K,
  MIN_TOP_P,
  MODEL_OPTIONS_BY_ID,
  TEMPERATURE_STEP,
  TOKEN_STEP,
  TOP_K_STEP,
  TOP_P_STEP,
  getModelGenerationLimits as getConfiguredModelGenerationLimits,
  getModelEngineType,
  normalizeGenerationLimits,
  normalizeModelId,
} from '../config/model-settings.js';
import {
  buildDefaultWllamaSettings,
  sanitizeWllamaSettings,
  canUseWllamaPromptCache,
  MAX_WLLAMA_BATCH_SIZE,
  MAX_WLLAMA_PROMPT_CACHE_CONTEXT_TOKENS,
  MAX_WLLAMA_MIN_P,
  MIN_WLLAMA_BATCH_SIZE,
  MIN_WLLAMA_MIN_P,
  WLLAMA_BATCH_SIZE_STEP,
  WLLAMA_MIN_P_STEP,
} from '../config/wllama-settings.js';

function formatInteger(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatWordEstimateFromTokens(tokenCount) {
  const wordEstimate = Math.round(Number(tokenCount) * 0.75);
  return formatInteger(Math.max(0, wordEstimate));
}

function isElementOfType(value, typeName) {
  const view = value?.ownerDocument?.defaultView || globalThis;
  const TypeCtor = view?.[typeName];
  return typeof TypeCtor === 'function' && value instanceof TypeCtor;
}

function readObjectFromStorage(storage, key) {
  try {
    const raw = storage?.getItem(key);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function writeObjectToStorage(storage, key, value) {
  storage?.setItem(key, JSON.stringify(value));
}

/**
 * @param {{
 *   appState: any;
 *   engine: any;
 *   storage?: Storage;
 *   modelGenerationSettingsStorageKey: string;
 *   modelWllamaSettingsStorageKey: string;
 *   defaultModelId?: string;
 *   modelSelect?: HTMLSelectElement | null;
 *   backendSelect?: HTMLSelectElement | null;
 *   maxOutputTokensInput?: HTMLInputElement | null;
 *   maxContextTokensInput?: HTMLInputElement | null;
 *   temperatureInput?: HTMLInputElement | null;
 *   resetContextTokensButton?: HTMLButtonElement | null;
 *   resetTemperatureButton?: HTMLButtonElement | null;
 *   resetTopKButton?: HTMLButtonElement | null;
 *   resetTopPButton?: HTMLButtonElement | null;
 *   topKInput?: HTMLInputElement | null;
 *   topPInput?: HTMLInputElement | null;
 *   wllamaSettingsSection?: HTMLElement | null;
 *   wllamaPromptCacheToggle?: HTMLInputElement | null;
 *   wllamaPromptCacheHelp?: HTMLElement | null;
 *   wllamaBatchSizeInput?: HTMLInputElement | null;
 *   wllamaBatchSizeHelp?: HTMLElement | null;
 *   wllamaMinPInput?: HTMLInputElement | null;
 *   wllamaMinPHelp?: HTMLElement | null;
 *   maxOutputTokensHelp?: HTMLElement | null;
 *   maxContextTokensHelp?: HTMLElement | null;
 *   temperatureHelp?: HTMLElement | null;
 *   topKHelp?: HTMLElement | null;
 *   topPHelp?: HTMLElement | null;
 *   clearModelDownloadsHelp?: HTMLElement | null;
 *   isGeneratingResponse?: () => boolean;
 *   isEngineReady?: () => boolean;
 *   reinitializeInferenceSettings?: () => Promise<any> | any;
 *   setStatus?: (message: string) => void;
 *   appendDebug?: (entryInput: any) => void;
 * }} options
 */
export function createGenerationSettingsController({
  appState,
  engine,
  storage = globalThis.localStorage,
  modelGenerationSettingsStorageKey,
  modelWllamaSettingsStorageKey,
  defaultModelId = DEFAULT_MODEL,
  modelSelect = null,
  backendSelect = null,
  maxOutputTokensInput = null,
  maxContextTokensInput = null,
  temperatureInput = null,
  resetContextTokensButton = null,
  resetTemperatureButton = null,
  resetTopKButton = null,
  resetTopPButton = null,
  topKInput = null,
  topPInput = null,
  wllamaSettingsSection = null,
  wllamaPromptCacheToggle = null,
  wllamaPromptCacheHelp = null,
  wllamaBatchSizeInput = null,
  wllamaBatchSizeHelp = null,
  wllamaMinPInput = null,
  wllamaMinPHelp = null,
  maxOutputTokensHelp = null,
  maxContextTokensHelp = null,
  temperatureHelp = null,
  topKHelp = null,
  topPHelp = null,
  clearModelDownloadsHelp = null,
  isGeneratingResponse = () => false,
  isEngineReady = () => false,
  reinitializeInferenceSettings = async () => {},
  setStatus = (_message) => {},
  appendDebug = (_entryInput) => {},
}) {
  function getSelectedModelId() {
    return normalizeModelId(modelSelect?.value || defaultModelId);
  }

  function getBackendPreference() {
    return backendSelect?.value || 'webgpu';
  }

  function getBaseModelGenerationLimits(modelId) {
    return (
      MODEL_OPTIONS_BY_ID.get(normalizeModelId(modelId))?.generation ||
      normalizeGenerationLimits(null)
    );
  }

  function getModelGenerationLimits(modelId, { backendPreference = getBackendPreference() } = {}) {
    return getConfiguredModelGenerationLimits(normalizeModelId(modelId), { backendPreference });
  }

  function sanitizeGenerationConfigForModel(
    modelId,
    candidateConfig,
    { backendPreference = getBackendPreference() } = {}
  ) {
    return sanitizeGenerationConfig(
      candidateConfig,
      getModelGenerationLimits(modelId, { backendPreference })
    );
  }

  function getStoredModelGenerationSettings() {
    return readObjectFromStorage(storage, modelGenerationSettingsStorageKey);
  }

  function getStoredGenerationConfigForModel(modelId) {
    const normalizedModelId = normalizeModelId(modelId);
    const byModel = getStoredModelGenerationSettings();
    const stored = byModel[normalizedModelId];
    if (!stored || typeof stored !== 'object') {
      return null;
    }
    return sanitizeGenerationConfig(stored, getBaseModelGenerationLimits(normalizedModelId));
  }

  function persistGenerationConfigForModel(modelId, config) {
    const normalizedModelId = normalizeModelId(modelId);
    const sanitized = sanitizeGenerationConfig(
      config,
      getBaseModelGenerationLimits(normalizedModelId)
    );
    const byModel = getStoredModelGenerationSettings();
    byModel[normalizedModelId] = sanitized;
    writeObjectToStorage(storage, modelGenerationSettingsStorageKey, byModel);
  }

  function isWllamaModel(modelId) {
    return getModelEngineType(modelId) === 'wllama';
  }

  function getStoredModelWllamaSettings() {
    return readObjectFromStorage(storage, modelWllamaSettingsStorageKey);
  }

  function sanitizeWllamaSettingsForModel(modelId, candidateSettings, generationConfig = null) {
    const normalizedModelId = normalizeModelId(modelId);
    const normalizedGenerationConfig = sanitizeGenerationConfigForModel(
      normalizedModelId,
      generationConfig || appState.activeGenerationConfig
    );
    return sanitizeWllamaSettings(candidateSettings, {
      maxContextTokens: normalizedGenerationConfig.maxContextTokens,
    });
  }

  function getStoredWllamaSettingsForModel(modelId, generationConfig = null) {
    const normalizedModelId = normalizeModelId(modelId);
    if (!isWllamaModel(normalizedModelId)) {
      return null;
    }
    const byModel = getStoredModelWllamaSettings();
    const stored = byModel[normalizedModelId];
    if (!stored || typeof stored !== 'object') {
      return null;
    }
    return sanitizeWllamaSettingsForModel(normalizedModelId, stored, generationConfig);
  }

  function persistWllamaSettingsForModel(modelId, settings, generationConfig = null) {
    const normalizedModelId = normalizeModelId(modelId);
    if (!isWllamaModel(normalizedModelId)) {
      return;
    }
    const sanitized = sanitizeWllamaSettingsForModel(normalizedModelId, settings, generationConfig);
    const byModel = getStoredModelWllamaSettings();
    byModel[normalizedModelId] = sanitized;
    writeObjectToStorage(storage, modelWllamaSettingsStorageKey, byModel);
  }

  function buildGenerationConfigFromUI(modelId) {
    return sanitizeGenerationConfig(
      {
        maxOutputTokens: maxOutputTokensInput?.value,
        maxContextTokens: maxContextTokensInput?.value,
        temperature: temperatureInput?.value,
        topK: topKInput?.value,
        topP: topPInput?.value,
      },
      getModelGenerationLimits(modelId)
    );
  }

  function buildWllamaSettingsFromUI(modelId, generationConfig = null) {
    return sanitizeWllamaSettingsForModel(
      modelId,
      {
        usePromptCache: wllamaPromptCacheToggle?.checked !== false,
        batchSize: wllamaBatchSizeInput?.value,
        minP: wllamaMinPInput?.value,
      },
      generationConfig
    );
  }

  function getEffectiveWllamaSettingsForModel(modelId, generationConfig = null) {
    const normalizedModelId = normalizeModelId(modelId);
    if (!isWllamaModel(normalizedModelId)) {
      return null;
    }
    return (
      getStoredWllamaSettingsForModel(normalizedModelId, generationConfig) ||
      sanitizeWllamaSettingsForModel(
        normalizedModelId,
        buildDefaultWllamaSettings(),
        generationConfig
      )
    );
  }

  function renderClearModelDownloadsHelp(modelId) {
    if (!isElementOfType(clearModelDownloadsHelp, 'HTMLElement')) {
      return;
    }
    clearModelDownloadsHelp.textContent = isWllamaModel(modelId)
      ? 'Clears cached wllama GGUF files for the selected local CPU model. Loaded in-memory sessions keep working until that model is reloaded.'
      : 'Clears cached Transformers.js files for the selected local ONNX model. Loaded in-memory sessions keep working until that model is reloaded.';
  }

  function renderWllamaSettingsVisibility(modelId) {
    if (!isElementOfType(wllamaSettingsSection, 'HTMLElement')) {
      return;
    }
    const visible = isWllamaModel(modelId);
    wllamaSettingsSection.classList.toggle('d-none', !visible);
    if (visible) {
      wllamaSettingsSection.removeAttribute('aria-hidden');
    } else {
      wllamaSettingsSection.setAttribute('aria-hidden', 'true');
    }
  }

  function renderWllamaSettingsHelpText(settings, generationConfig) {
    const maxBatchSize = Math.max(
      MIN_WLLAMA_BATCH_SIZE,
      Math.min(
        MAX_WLLAMA_BATCH_SIZE,
        Number(generationConfig?.maxContextTokens) || MIN_WLLAMA_BATCH_SIZE
      )
    );
    const promptCacheAllowed = canUseWllamaPromptCache(generationConfig?.maxContextTokens);
    if (wllamaPromptCacheHelp) {
      wllamaPromptCacheHelp.textContent = !promptCacheAllowed
        ? `Prompt cache reuse is automatically disabled above ${formatInteger(
            MAX_WLLAMA_PROMPT_CACHE_CONTEXT_TOKENS
          )} context tokens to avoid browser memory spikes. Lower Context size to re-enable it.`
        : settings.usePromptCache
          ? 'Prompt cache reuse is enabled. Follow-up turns can reuse compatible prefixes instead of reprocessing the full prompt every time.'
          : 'Prompt cache reuse is disabled. Every turn starts from a cleared KV cache.';
    }
    if (wllamaBatchSizeHelp) {
      wllamaBatchSizeHelp.textContent = `Load-time prompt batch size. Higher values can speed prompt ingestion but use more memory. Allowed: ${formatInteger(
        MIN_WLLAMA_BATCH_SIZE
      )} to ${formatInteger(maxBatchSize)} in steps of ${formatInteger(WLLAMA_BATCH_SIZE_STEP)}.`;
    }
    if (wllamaMinPHelp) {
      wllamaMinPHelp.textContent = `Additional probability floor after Top K / Top P. ${MIN_WLLAMA_MIN_P.toFixed(
        2
      )} disables it; higher values can make wllama generations more selective. Allowed: ${MIN_WLLAMA_MIN_P.toFixed(
        2
      )} to ${MAX_WLLAMA_MIN_P.toFixed(2)} in steps of ${WLLAMA_MIN_P_STEP.toFixed(2)}.`;
    }
  }

  function syncWllamaSettingsFromModel(
    modelId,
    { useDefaults = true, generationConfig = null } = {}
  ) {
    const normalizedModelId = normalizeModelId(modelId);
    renderWllamaSettingsVisibility(normalizedModelId);
    renderClearModelDownloadsHelp(normalizedModelId);
    if (!isWllamaModel(normalizedModelId)) {
      return;
    }

    const effectiveGenerationConfig =
      generationConfig ||
      sanitizeGenerationConfigForModel(normalizedModelId, appState.activeGenerationConfig);
    const settings = useDefaults
      ? getEffectiveWllamaSettingsForModel(normalizedModelId, effectiveGenerationConfig)
      : buildWllamaSettingsFromUI(normalizedModelId, effectiveGenerationConfig);
    if (!settings) {
      return;
    }

    if (isElementOfType(wllamaPromptCacheToggle, 'HTMLInputElement')) {
      wllamaPromptCacheToggle.checked = settings.usePromptCache;
    }
    if (isElementOfType(wllamaBatchSizeInput, 'HTMLInputElement')) {
      wllamaBatchSizeInput.min = String(MIN_WLLAMA_BATCH_SIZE);
      wllamaBatchSizeInput.max = String(
        Math.max(
          MIN_WLLAMA_BATCH_SIZE,
          Math.min(MAX_WLLAMA_BATCH_SIZE, effectiveGenerationConfig.maxContextTokens)
        )
      );
      wllamaBatchSizeInput.step = String(WLLAMA_BATCH_SIZE_STEP);
      wllamaBatchSizeInput.value = String(settings.batchSize);
    }
    if (isElementOfType(wllamaMinPInput, 'HTMLInputElement')) {
      wllamaMinPInput.min = MIN_WLLAMA_MIN_P.toFixed(2);
      wllamaMinPInput.max = MAX_WLLAMA_MIN_P.toFixed(2);
      wllamaMinPInput.step = WLLAMA_MIN_P_STEP.toFixed(2);
      wllamaMinPInput.value = settings.minP.toFixed(2);
    }
    renderWllamaSettingsHelpText(settings, effectiveGenerationConfig);
  }

  function renderGenerationSettingsHelpText(config, limits) {
    const normalizedModelId = getSelectedModelId();
    const baseLimits = getBaseModelGenerationLimits(normalizedModelId);
    const currentBackend = String(getBackendPreference()).trim().toLowerCase();
    const backendLabel = currentBackend === 'cpu' ? 'CPU' : 'WebGPU';
    const hasReducedTokenLimits =
      Number(limits?.maxContextTokens) < Number(baseLimits?.maxContextTokens) ||
      Number(limits?.maxOutputTokens) < Number(baseLimits?.maxOutputTokens);
    const reducedTokenLimitsNote = hasReducedTokenLimits
      ? ` ${backendLabel} mode reduces this model's token budget in this app to avoid browser memory exhaustion.`
      : '';
    if (maxOutputTokensHelp) {
      maxOutputTokensHelp.textContent = `Allowed: ${formatInteger(
        MIN_TOKEN_LIMIT
      )} to ${formatInteger(Math.min(limits.maxOutputTokens, config.maxContextTokens))} in steps of ${formatInteger(
        TOKEN_STEP
      )}. Estimated words: about ${formatWordEstimateFromTokens(
        config.maxOutputTokens
      )}.${reducedTokenLimitsNote}`;
    }
    if (maxContextTokensHelp) {
      maxContextTokensHelp.textContent = `Allowed: ${formatInteger(
        MIN_TOKEN_LIMIT
      )} to ${formatInteger(limits.maxContextTokens)} in steps of ${formatInteger(
        TOKEN_STEP
      )}. Estimated words: about ${formatWordEstimateFromTokens(
        config.maxContextTokens
      )}.${reducedTokenLimitsNote}`;
    }
    if (temperatureHelp) {
      temperatureHelp.textContent = `Allowed: ${limits.minTemperature.toFixed(
        1
      )} to ${limits.maxTemperature.toFixed(1)} in steps of ${TEMPERATURE_STEP.toFixed(1)}.`;
    }
    if (topKHelp) {
      topKHelp.textContent = `Top K picks from the K most likely next-token options. Lower values are more predictable. Current model default: ${formatInteger(
        limits.defaultTopK
      )}.`;
    }
    if (topPHelp) {
      topPHelp.textContent = `Also called nucleus sampling. Higher values can make responses more varied. Allowed: ${MIN_TOP_P.toFixed(
        2
      )} to ${MAX_TOP_P.toFixed(2)} in steps of ${TOP_P_STEP.toFixed(
        2
      )}. Current model default: ${limits.defaultTopP.toFixed(2)}.`;
    }
  }

  function syncGenerationSettingsFromModel(modelId, useDefaults = true) {
    const normalizedModelId = normalizeModelId(modelId);
    const limits = getModelGenerationLimits(normalizedModelId);
    const defaultConfig = buildDefaultGenerationConfig(limits);
    const storedConfig = getStoredGenerationConfigForModel(normalizedModelId);
    const config = useDefaults
      ? sanitizeGenerationConfig(storedConfig || defaultConfig, limits)
      : buildGenerationConfigFromUI(normalizedModelId);
    const boundedOutputMax = Math.min(limits.maxOutputTokens, config.maxContextTokens);

    if (maxContextTokensInput) {
      maxContextTokensInput.min = String(MIN_TOKEN_LIMIT);
      maxContextTokensInput.max = String(limits.maxContextTokens);
      maxContextTokensInput.step = String(TOKEN_STEP);
      maxContextTokensInput.value = String(config.maxContextTokens);
    }

    if (maxOutputTokensInput) {
      maxOutputTokensInput.min = String(MIN_TOKEN_LIMIT);
      maxOutputTokensInput.max = String(boundedOutputMax);
      maxOutputTokensInput.step = String(TOKEN_STEP);
      maxOutputTokensInput.value = String(config.maxOutputTokens);
    }
    if (temperatureInput) {
      temperatureInput.min = limits.minTemperature.toFixed(1);
      temperatureInput.max = limits.maxTemperature.toFixed(1);
      temperatureInput.step = TEMPERATURE_STEP.toFixed(1);
      temperatureInput.value = config.temperature.toFixed(1);
    }
    if (topKInput) {
      topKInput.min = String(MIN_TOP_K);
      topKInput.max = String(MAX_TOP_K);
      topKInput.step = String(TOP_K_STEP);
      topKInput.value = String(config.topK);
    }
    if (topPInput) {
      topPInput.min = MIN_TOP_P.toFixed(2);
      topPInput.max = MAX_TOP_P.toFixed(2);
      topPInput.step = TOP_P_STEP.toFixed(2);
      topPInput.value = config.topP.toFixed(2);
    }

    appState.activeGenerationConfig = { ...config };
    engine?.setGenerationConfig?.(appState.activeGenerationConfig);
    renderGenerationSettingsHelpText(config, limits);
    syncWllamaSettingsFromModel(normalizedModelId, {
      useDefaults,
      generationConfig: config,
    });
  }

  function updateGenerationSettingsEnabledState() {
    const disabled = false;
    if (maxOutputTokensInput) {
      maxOutputTokensInput.disabled = disabled;
    }
    if (maxContextTokensInput) {
      maxContextTokensInput.disabled = disabled;
    }
    if (temperatureInput) {
      temperatureInput.disabled = disabled;
    }
    if (isElementOfType(resetContextTokensButton, 'HTMLButtonElement')) {
      resetContextTokensButton.disabled = disabled;
    }
    if (isElementOfType(resetTemperatureButton, 'HTMLButtonElement')) {
      resetTemperatureButton.disabled = disabled;
    }
    if (isElementOfType(resetTopKButton, 'HTMLButtonElement')) {
      resetTopKButton.disabled = disabled;
    }
    if (isElementOfType(resetTopPButton, 'HTMLButtonElement')) {
      resetTopPButton.disabled = disabled;
    }
    if (topKInput) {
      topKInput.disabled = disabled;
    }
    if (topPInput) {
      topPInput.disabled = disabled;
    }
    if (isElementOfType(wllamaPromptCacheToggle, 'HTMLInputElement')) {
      wllamaPromptCacheToggle.disabled = disabled;
    }
    if (isElementOfType(wllamaBatchSizeInput, 'HTMLInputElement')) {
      wllamaBatchSizeInput.disabled = disabled;
    }
    if (isElementOfType(wllamaMinPInput, 'HTMLInputElement')) {
      wllamaMinPInput.disabled = disabled;
    }
  }

  function describeGenerationConfig(config) {
    return `Generation settings applied (maxOutputTokens=${config.maxOutputTokens}, maxContextTokens=${config.maxContextTokens}, temperature=${config.temperature.toFixed(1)}, topK=${config.topK}, topP=${config.topP.toFixed(2)}, repetitionPenalty=${config.repetitionPenalty.toFixed(2)}).`;
  }

  function applyPendingGenerationSettingsIfReady() {
    if (isGeneratingResponse() || !appState.pendingGenerationConfig) {
      return;
    }
    const selectedModel = getSelectedModelId();
    const nextConfig = sanitizeGenerationConfig(
      appState.pendingGenerationConfig,
      getModelGenerationLimits(selectedModel)
    );
    appState.pendingGenerationConfig = null;
    appState.activeGenerationConfig = nextConfig;
    engine?.setGenerationConfig?.(nextConfig);
    syncGenerationSettingsFromModel(selectedModel, false);
    setStatus('Generation settings updated.');
    appendDebug(describeGenerationConfig(nextConfig));
  }

  function onGenerationSettingInputChanged() {
    const selectedModel = getSelectedModelId();
    const nextConfig = buildGenerationConfigFromUI(selectedModel);
    appState.activeGenerationConfig = nextConfig;
    syncGenerationSettingsFromModel(selectedModel, false);
    persistGenerationConfigForModel(selectedModel, nextConfig);
    if (isWllamaModel(selectedModel)) {
      persistWllamaSettingsForModel(
        selectedModel,
        buildWllamaSettingsFromUI(selectedModel, nextConfig),
        nextConfig
      );
    }
    if (isGeneratingResponse()) {
      appState.pendingGenerationConfig = nextConfig;
      setStatus('Generation settings will apply after current response.');
      appendDebug('Generation settings change queued until current response completes.');
      return;
    }
    engine?.setGenerationConfig?.(nextConfig);
    setStatus('Generation settings updated.');
    appendDebug(describeGenerationConfig(nextConfig));
  }

  function onWllamaSettingInputChanged() {
    const selectedModel = getSelectedModelId();
    if (!isWllamaModel(selectedModel)) {
      return;
    }
    const nextGenerationConfig = buildGenerationConfigFromUI(selectedModel);
    const nextWllamaSettings = buildWllamaSettingsFromUI(selectedModel, nextGenerationConfig);
    persistWllamaSettingsForModel(selectedModel, nextWllamaSettings, nextGenerationConfig);
    syncWllamaSettingsFromModel(selectedModel, {
      useDefaults: false,
      generationConfig: nextGenerationConfig,
    });
    if (isGeneratingResponse()) {
      setStatus('wllama settings will apply on the next request.');
      appendDebug(
        `wllama settings changed during generation; promptCache=${nextWllamaSettings.usePromptCache}, batchSize=${nextWllamaSettings.batchSize}, minP=${nextWllamaSettings.minP.toFixed(2)}.`
      );
      return;
    }
    if (!isEngineReady()) {
      setStatus('wllama settings updated.');
      appendDebug(
        `wllama settings updated while no model was loaded (promptCache=${nextWllamaSettings.usePromptCache}, batchSize=${nextWllamaSettings.batchSize}, minP=${nextWllamaSettings.minP.toFixed(2)}).`
      );
      return;
    }
    void reinitializeInferenceSettings();
    appendDebug(
      `wllama settings updated (promptCache=${nextWllamaSettings.usePromptCache}, batchSize=${nextWllamaSettings.batchSize}, minP=${nextWllamaSettings.minP.toFixed(2)}).`
    );
  }

  function getActiveGenerationTemperature() {
    return Number.isFinite(engine?.config?.generationConfig?.temperature)
      ? Number(engine.config.generationConfig.temperature)
      : Number(
          appState.activeGenerationConfig?.temperature ??
            DEFAULT_GENERATION_LIMITS.defaultTemperature
        );
  }

  return {
    applyPendingGenerationSettingsIfReady,
    buildGenerationConfigFromUI,
    buildWllamaSettingsFromUI,
    getActiveGenerationTemperature,
    getBaseModelGenerationLimits,
    getEffectiveWllamaSettingsForModel,
    getModelGenerationLimits,
    getStoredGenerationConfigForModel,
    getStoredWllamaSettingsForModel,
    isWllamaModel,
    onGenerationSettingInputChanged,
    onWllamaSettingInputChanged,
    persistGenerationConfigForModel,
    persistWllamaSettingsForModel,
    renderClearModelDownloadsHelp,
    renderGenerationSettingsHelpText,
    renderWllamaSettingsHelpText,
    renderWllamaSettingsVisibility,
    sanitizeGenerationConfigForModel,
    sanitizeWllamaSettingsForModel,
    syncGenerationSettingsFromModel,
    syncWllamaSettingsFromModel,
    updateGenerationSettingsEnabledState,
  };
}
