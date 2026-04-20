import cloudModelCatalog from './cloud-models.json';
import { normalizeCloudProviderConfigs } from '../cloud/cloud-provider-config.js';

export const PRECONFIGURED_CLOUD_PROVIDERS = Object.freeze(
  normalizeCloudProviderConfigs(
    (Array.isArray(cloudModelCatalog?.providers) ? cloudModelCatalog.providers : []).map(
      (provider) => ({
        ...provider,
        preconfigured: true,
        selectedModels: Array.isArray(provider?.selectedModels)
          ? provider.selectedModels.map((model) => ({
              ...model,
              managed: model?.managed !== false,
            }))
          : [],
      })
    )
  )
);
