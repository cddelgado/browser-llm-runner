import { normalizeGenerationLimits } from '../config/generation-config.js';
import { OPENAI_COMPATIBLE_PROVIDER_TYPE } from './openai-compatible.js';

export const REMOTE_MODEL_GENERATION_LIMITS = Object.freeze({
  defaultMaxOutputTokens: 1024,
  maxOutputTokens: 131072,
  defaultMaxContextTokens: 8192,
  maxContextTokens: 131072,
  minTemperature: 0.0,
  maxTemperature: 2.0,
  defaultTemperature: 0.7,
  defaultTopK: 50,
  defaultTopP: 1.0,
  defaultRepetitionPenalty: 1.0,
});
const DEFAULT_REMOTE_MODEL_DETECTED_FEATURES = Object.freeze({
  toolCalling: false,
});
const DEFAULT_REMOTE_MODEL_FEATURES = Object.freeze({
  toolCalling: false,
});
const OPENAI_COMPATIBLE_PROMPT_TOOL_CALLING_PROFILE = Object.freeze({
  format: 'json',
  nameKey: 'name',
  argumentsKey: 'parameters',
});
const CLOUD_PROVIDER_LINK_KEYS = Object.freeze([
  'createAccountUrl',
  'createTokenUrl',
  'dataSecurityUrl',
]);

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeTimestamp(value) {
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : null;
}

function normalizePositiveInteger(value) {
  return Number.isInteger(value) && value > 0 ? Math.trunc(value) : null;
}

function normalizeHttpUrl(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return '';
  }
  try {
    const url = new URL(normalized);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.toString();
    }
  } catch {
    return '';
  }
  return '';
}

export function buildCloudModelId(providerId, remoteModelId) {
  const normalizedProviderId = normalizeString(providerId);
  const normalizedRemoteModelId = normalizeString(remoteModelId);
  return normalizedProviderId && normalizedRemoteModelId
    ? `cloud:${normalizedProviderId}:${encodeURIComponent(normalizedRemoteModelId)}`
    : '';
}

function normalizeCloudModelFeatures(rawFeatures, defaults = null) {
  const defaultToolCalling = defaults?.toolCalling === true;
  return {
    toolCalling:
      rawFeatures?.toolCalling === true ||
      (rawFeatures?.toolCalling !== false && defaultToolCalling),
  };
}

function normalizeCloudProviderLinks(rawLinks) {
  if (!rawLinks || typeof rawLinks !== 'object' || Array.isArray(rawLinks)) {
    return null;
  }
  const normalizedLinks = Object.fromEntries(
    CLOUD_PROVIDER_LINK_KEYS.map((key) => [key, normalizeHttpUrl(rawLinks[key])]).filter(
      ([, value]) => Boolean(value)
    )
  );
  return Object.keys(normalizedLinks).length ? normalizedLinks : null;
}

function normalizeCloudModelRateLimit(rawRateLimit) {
  if (!rawRateLimit || typeof rawRateLimit !== 'object' || Array.isArray(rawRateLimit)) {
    return null;
  }
  const maxRequests = normalizePositiveInteger(rawRateLimit.maxRequests);
  const windowMs = normalizePositiveInteger(rawRateLimit.windowMs);
  if (!maxRequests || !windowMs) {
    return null;
  }
  return {
    maxRequests,
    windowMs,
  };
}

function normalizeAvailableModelEntry(entry) {
  const id = normalizeString(entry?.id);
  if (!id) {
    return null;
  }
  return {
    id,
    displayName: normalizeString(entry?.displayName) || id,
    detectedFeatures: normalizeCloudModelFeatures(
      entry?.detectedFeatures,
      DEFAULT_REMOTE_MODEL_DETECTED_FEATURES
    ),
  };
}

function normalizeAvailableModels(value) {
  const seenModelIds = new Set();
  return (Array.isArray(value) ? value : [])
    .map(normalizeAvailableModelEntry)
    .filter((entry) => {
      if (!entry || seenModelIds.has(entry.id)) {
        return false;
      }
      seenModelIds.add(entry.id);
      return true;
    });
}

function normalizeSelectedModelEntry(entry, availableModels, provider) {
  const id = normalizeString(entry?.id);
  if (!id) {
    return null;
  }
  const matchingAvailableModel = availableModels.find((model) => model.id === id);
  const displayName =
    normalizeString(entry?.displayName) || matchingAvailableModel?.displayName || id;
  const detectedFeatures = normalizeCloudModelFeatures(
    matchingAvailableModel?.detectedFeatures,
    entry?.detectedFeatures || DEFAULT_REMOTE_MODEL_DETECTED_FEATURES
  );
  return {
    id,
    displayName,
    generation: normalizeGenerationLimits(entry?.generation || REMOTE_MODEL_GENERATION_LIMITS),
    supportsTopK:
      entry?.supportsTopK === true || (entry?.supportsTopK !== false && provider.supportsTopK === true),
    detectedFeatures,
    features: normalizeCloudModelFeatures(
      entry?.features,
      detectedFeatures || DEFAULT_REMOTE_MODEL_FEATURES
    ),
    rateLimit: normalizeCloudModelRateLimit(entry?.rateLimit),
    managed: entry?.managed === true,
  };
}

function normalizeSelectedModels(value, availableModels, provider) {
  const seenModelIds = new Set();
  return (Array.isArray(value) ? value : [])
    .map((entry) => normalizeSelectedModelEntry(entry, availableModels, provider))
    .filter((entry) => {
      if (!entry || seenModelIds.has(entry.id)) {
        return false;
      }
      seenModelIds.add(entry.id);
      return true;
    });
}

export function normalizeCloudProviderConfig(provider) {
  const id = normalizeString(provider?.id);
  const type = normalizeString(provider?.type) || OPENAI_COMPATIBLE_PROVIDER_TYPE;
  const endpoint = normalizeString(provider?.endpoint);
  if (!id || !endpoint || type !== OPENAI_COMPATIBLE_PROVIDER_TYPE) {
    return null;
  }
  const endpointHost = normalizeString(provider?.endpointHost);
  const displayName = normalizeString(provider?.displayName) || endpointHost || endpoint;
  const preconfigured = provider?.preconfigured === true;
  const links = normalizeCloudProviderLinks(provider?.links);
  const hasSecret = provider?.hasSecret === true;
  const normalizedProvider = {
    id,
    type,
    endpoint,
    endpointHost,
    displayName,
    preconfigured,
    hasSecret,
    supportsTopK: provider?.supportsTopK === true,
    importedAt: normalizeTimestamp(provider?.importedAt) || Date.now(),
    updatedAt: normalizeTimestamp(provider?.updatedAt) || Date.now(),
    availableModels: [],
    selectedModels: [],
    ...(links ? { links } : {}),
  };
  normalizedProvider.availableModels = normalizeAvailableModels(provider?.availableModels);
  normalizedProvider.selectedModels = normalizeSelectedModels(
    provider?.selectedModels,
    normalizedProvider.availableModels,
    normalizedProvider
  );
  if (normalizedProvider.preconfigured && !normalizedProvider.availableModels.length) {
    normalizedProvider.availableModels = normalizedProvider.selectedModels.map((model) => ({
      id: model.id,
      displayName: model.displayName,
      detectedFeatures: model.detectedFeatures,
    }));
  }
  return normalizedProvider;
}

export function normalizeCloudProviderConfigs(value) {
  const seenProviderIds = new Set();
  return (Array.isArray(value) ? value : [])
    .map(normalizeCloudProviderConfig)
    .filter((provider) => {
      if (!provider || seenProviderIds.has(provider.id)) {
        return false;
      }
      seenProviderIds.add(provider.id);
      return true;
    })
    .sort((left, right) => {
      if (left.preconfigured !== right.preconfigured) {
        return left.preconfigured ? -1 : 1;
      }
      return left.displayName.localeCompare(right.displayName);
    });
}

export function getCloudProviderById(providers, providerId) {
  const normalizedProviderId = normalizeString(providerId);
  if (!normalizedProviderId) {
    return null;
  }
  return normalizeCloudProviderConfigs(providers).find((provider) => provider.id === normalizedProviderId) || null;
}

function mergeAvailableModels(baseProvider, storedProvider) {
  const mergedAvailableModels = [];
  const seenModelIds = new Set();
  [...(baseProvider?.availableModels || []), ...(storedProvider?.availableModels || [])].forEach(
    (model) => {
      const normalizedModel = normalizeAvailableModelEntry(model);
      if (!normalizedModel || seenModelIds.has(normalizedModel.id)) {
        return;
      }
      seenModelIds.add(normalizedModel.id);
      mergedAvailableModels.push(normalizedModel);
    }
  );
  return mergedAvailableModels;
}

function mergeSelectedModels(baseProvider, storedProvider, availableModels) {
  const mergedSelectedModels = [];
  const seenModelIds = new Set();
  const storedSelectedModelsById = new Map(
    (storedProvider?.selectedModels || []).map((model) => [model.id, model])
  );

  (baseProvider?.selectedModels || []).forEach((model) => {
    const storedModel = storedSelectedModelsById.get(model.id);
    const normalizedModel = normalizeSelectedModelEntry(
      {
        ...model,
        ...(baseProvider?.preconfigured ? { managed: true } : {}),
        ...(storedModel
          ? {
              supportsTopK: storedModel.supportsTopK,
              detectedFeatures: storedModel.detectedFeatures,
              features: storedModel.features,
            }
          : {}),
      },
      availableModels,
      baseProvider
    );
    if (!normalizedModel || seenModelIds.has(normalizedModel.id)) {
      return;
    }
    seenModelIds.add(normalizedModel.id);
    mergedSelectedModels.push(normalizedModel);
  });

  (storedProvider?.selectedModels || []).forEach((model) => {
    if (seenModelIds.has(model.id)) {
      return;
    }
    const normalizedModel = normalizeSelectedModelEntry(model, availableModels, {
      ...baseProvider,
      supportsTopK:
        storedProvider?.supportsTopK === true || baseProvider?.supportsTopK === true,
    });
    if (!normalizedModel) {
      return;
    }
    seenModelIds.add(normalizedModel.id);
    mergedSelectedModels.push(normalizedModel);
  });

  return mergedSelectedModels;
}

export function mergeCloudProviderConfigs(preconfiguredProviders, storedProviders) {
  const normalizedPreconfiguredProviders = normalizeCloudProviderConfigs(
    (Array.isArray(preconfiguredProviders) ? preconfiguredProviders : []).map((provider) => ({
      ...provider,
      preconfigured: true,
      selectedModels: Array.isArray(provider?.selectedModels)
        ? provider.selectedModels.map((model) => ({
            ...model,
            managed: model?.managed !== false,
          }))
        : [],
    }))
  );
  const normalizedStoredProviders = normalizeCloudProviderConfigs(storedProviders);
  const storedProvidersById = new Map(normalizedStoredProviders.map((provider) => [provider.id, provider]));
  const mergedProviders = [];
  const seenProviderIds = new Set();

  normalizedPreconfiguredProviders.forEach((provider) => {
    const storedProvider = storedProvidersById.get(provider.id) || null;
    const availableModels = mergeAvailableModels(provider, storedProvider);
    const selectedModels = mergeSelectedModels(provider, storedProvider, availableModels);
    mergedProviders.push(
      normalizeCloudProviderConfig({
        ...provider,
        ...(storedProvider
          ? {
              importedAt: storedProvider.importedAt,
              updatedAt: storedProvider.updatedAt,
              hasSecret: storedProvider.hasSecret === true,
            }
          : {}),
        availableModels,
        selectedModels,
      })
    );
    seenProviderIds.add(provider.id);
  });

  normalizedStoredProviders.forEach((provider) => {
    if (seenProviderIds.has(provider.id)) {
      return;
    }
    mergedProviders.push(provider);
  });

  return normalizeCloudProviderConfigs(mergedProviders);
}

export function buildRuntimeModelCatalog(providers) {
  return normalizeCloudProviderConfigs(providers).flatMap((provider) =>
    provider.selectedModels.map((model) => {
      const toolCallingEnabled = model?.features?.toolCalling === true;
      return {
        id: buildCloudModelId(provider.id, model.id),
        label: model.id,
        displayName: model.displayName,
        repositoryUrl: provider.endpoint,
        engine: {
          type: 'openai-compatible',
        },
        generation: model.generation,
        features: {
          streaming: true,
          thinking: false,
          toolCalling: toolCallingEnabled,
          imageInput: false,
          audioInput: false,
          videoInput: false,
        },
        ...(toolCallingEnabled
          ? { toolCalling: OPENAI_COMPATIBLE_PROMPT_TOOL_CALLING_PROFILE }
          : {}),
        runtime: {
          providerId: provider.id,
          providerType: provider.type,
          providerDisplayName: provider.displayName,
          providerHasSecret: provider.hasSecret === true,
          providerPreconfigured: provider.preconfigured === true,
          apiBaseUrl: provider.endpoint,
          remoteModelId: model.id,
          supportsTopK: model.supportsTopK === true,
          ...(model.rateLimit ? { rateLimit: model.rateLimit } : {}),
        },
      };
    })
  );
}
