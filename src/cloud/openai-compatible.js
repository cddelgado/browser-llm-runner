import { buildCorsProxyRequestUrl, getStoredCorsProxyUrl } from '../llm/browser-fetch.js';

export const OPENAI_COMPATIBLE_PROVIDER_TYPE = 'openai-compatible';
export const OPENAI_COMPATIBLE_PROVIDER_LABEL = 'OpenAI-compatible';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const CORS_ERROR_MESSAGE_PATTERN =
  /failed to fetch|load failed|networkerror|network request failed|fetch failed/i;
const TOOL_CALLING_CAPABILITY_TOKENS = new Set([
  'tool',
  'tools',
  'tool_call',
  'tool_calls',
  'tool_calling',
  'tool_choice',
  'parallel_tool_calls',
  'function',
  'functions',
  'function_call',
  'function_calls',
  'function_calling',
]);

function normalizeCapabilityToken(value) {
  return typeof value === 'string'
    ? value
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_')
    : '';
}

function hasEnabledCapabilityFlag(candidate, capabilityTokens) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return false;
  }
  return Object.entries(candidate).some(([rawKey, rawValue]) => {
    const normalizedKey = normalizeCapabilityToken(rawKey);
    if (!capabilityTokens.has(normalizedKey)) {
      return false;
    }
    return rawValue !== false && rawValue !== null && rawValue !== undefined;
  });
}

function listIncludesCapability(candidate, capabilityTokens) {
  if (!Array.isArray(candidate)) {
    return false;
  }
  return candidate.some((value) => capabilityTokens.has(normalizeCapabilityToken(value)));
}

export function inferOpenAiCompatibleModelFeatures(entry) {
  const detectedToolCalling =
    listIncludesCapability(entry?.supported_parameters, TOOL_CALLING_CAPABILITY_TOKENS) ||
    listIncludesCapability(entry?.supported_features, TOOL_CALLING_CAPABILITY_TOKENS) ||
    listIncludesCapability(entry?.capabilities, TOOL_CALLING_CAPABILITY_TOKENS) ||
    listIncludesCapability(entry?.features, TOOL_CALLING_CAPABILITY_TOKENS) ||
    hasEnabledCapabilityFlag(entry?.capabilities, TOOL_CALLING_CAPABILITY_TOKENS) ||
    hasEnabledCapabilityFlag(entry?.features, TOOL_CALLING_CAPABILITY_TOKENS);
  return {
    toolCalling: detectedToolCalling,
  };
}

function usesStrictOpenAiRequestProfile(endpoint) {
  try {
    const url = new URL(endpoint);
    const hostname = url.hostname.trim().toLowerCase();
    return hostname === 'api.openai.com' || hostname.endsWith('.openai.com');
  } catch {
    return false;
  }
}

function isLoopbackHost(hostname) {
  const normalizedHostname = typeof hostname === 'string' ? hostname.trim().toLowerCase() : '';
  return LOOPBACK_HOSTS.has(normalizedHostname);
}

function trimTerminalPathSegment(pathname, segment) {
  const normalizedPathname = typeof pathname === 'string' ? pathname : '';
  return normalizedPathname.replace(new RegExp(`/${segment}/?$`, 'i'), '');
}

function normalizeEndpointPathname(pathname) {
  let normalizedPathname = typeof pathname === 'string' ? pathname.trim() : '';
  if (!normalizedPathname || normalizedPathname === '/') {
    return '';
  }
  normalizedPathname = normalizedPathname.replace(/\/+$/g, '');
  normalizedPathname = trimTerminalPathSegment(normalizedPathname, 'chat/completions');
  normalizedPathname = trimTerminalPathSegment(normalizedPathname, 'responses');
  normalizedPathname = trimTerminalPathSegment(normalizedPathname, 'models');
  normalizedPathname = normalizedPathname.replace(/\/+$/g, '');
  return normalizedPathname === '/' ? '' : normalizedPathname;
}

function toProviderDisplayName(endpoint) {
  try {
    const url = new URL(endpoint);
    const normalizedPathname = normalizeEndpointPathname(url.pathname);
    if (!normalizedPathname || normalizedPathname === '/v1') {
      return url.host;
    }
    return `${url.host}${normalizedPathname}`;
  } catch {
    return 'Cloud provider';
  }
}

export function inferOpenAiCompatibleTopKSupport(endpoint) {
  return !usesStrictOpenAiRequestProfile(endpoint);
}

export function inferOpenAiCompatibleMaxOutputTokensField(endpoint) {
  return usesStrictOpenAiRequestProfile(endpoint) ? 'max_completion_tokens' : 'max_tokens';
}

export function normalizeOpenAiCompatibleEndpoint(value) {
  const rawValue = typeof value === 'string' ? value.trim() : '';
  if (!rawValue) {
    throw new Error('Enter an endpoint URL.');
  }

  let url;
  try {
    url = new URL(rawValue);
  } catch {
    throw new Error('Enter a valid endpoint URL.');
  }

  if (url.username || url.password) {
    throw new Error('Endpoint URLs must not include credentials.');
  }
  if (url.hash) {
    throw new Error('Endpoint URLs must not include fragments.');
  }
  if (url.search) {
    throw new Error('Endpoint URLs must not include query strings.');
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopbackHost(url.hostname))) {
    throw new Error(
      'Endpoint URLs must use https, or http only for localhost, 127.0.0.1, or ::1.'
    );
  }

  const normalizedPathname = normalizeEndpointPathname(url.pathname);
  const normalizedBase = normalizedPathname ? `${url.origin}${normalizedPathname}` : url.origin;
  return normalizedBase.replace(/\/+$/g, '');
}

export function buildOpenAiCompatibleModelsUrl(endpoint) {
  const normalizedEndpoint = normalizeOpenAiCompatibleEndpoint(endpoint);
  return `${normalizedEndpoint}/models`;
}

export function buildOpenAiCompatibleChatCompletionsUrl(endpoint) {
  const normalizedEndpoint = normalizeOpenAiCompatibleEndpoint(endpoint);
  return `${normalizedEndpoint}/chat/completions`;
}

function normalizeModelListEntry(entry) {
  const id = typeof entry?.id === 'string' ? entry.id.trim() : '';
  if (!id) {
    return null;
  }
  return {
    id,
    displayName: id,
    detectedFeatures: inferOpenAiCompatibleModelFeatures(entry),
  };
}

export function normalizeOpenAiCompatibleModelList(value) {
  const seenModelIds = new Set();
  return (Array.isArray(value) ? value : [])
    .map(normalizeModelListEntry)
    .filter((entry) => {
      if (!entry || seenModelIds.has(entry.id)) {
        return false;
      }
      seenModelIds.add(entry.id);
      return true;
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
}

async function parseJsonSafely(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function parseTextSafely(response) {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function extractProviderErrorMessage(payload) {
  if (!payload || typeof payload !== 'object') {
    return '';
  }
  const error = payload.error;
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }
  if (error && typeof error === 'object' && typeof error.message === 'string') {
    return error.message.trim();
  }
  if (typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message.trim();
  }
  return '';
}

function normalizeInlineErrorMessage(error) {
  const message =
    error instanceof Error && typeof error.message === 'string' ? error.message.trim() : '';
  return message || String(error || 'Unknown network error.');
}

function isLikelyCorsBlockedError(error) {
  if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
    return false;
  }
  if (error instanceof TypeError) {
    return true;
  }
  return CORS_ERROR_MESSAGE_PATTERN.test(normalizeInlineErrorMessage(error));
}

function buildOpenAiCompatibleInspectionRequest(apiKey) {
  return {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
  };
}

export async function inspectOpenAiCompatibleEndpoint(
  endpoint,
  apiKey,
  { fetchRef = globalThis.fetch, proxyUrl = '' } = {}
) {
  const normalizedEndpoint = normalizeOpenAiCompatibleEndpoint(endpoint);
  const normalizedApiKey = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!normalizedApiKey) {
    throw new Error('Enter an API key before testing the provider.');
  }
  if (typeof fetchRef !== 'function') {
    throw new Error('Browser fetch is unavailable.');
  }

  const modelsUrl = buildOpenAiCompatibleModelsUrl(normalizedEndpoint);
  const normalizedProxyUrl = getStoredCorsProxyUrl(proxyUrl);
  let response;
  let requiresProxy = false;
  try {
    response = await fetchRef(modelsUrl, buildOpenAiCompatibleInspectionRequest(normalizedApiKey));
  } catch (error) {
    if (normalizedProxyUrl && isLikelyCorsBlockedError(error)) {
      try {
        response = await fetchRef(
          buildCorsProxyRequestUrl(normalizedProxyUrl, modelsUrl),
          buildOpenAiCompatibleInspectionRequest(normalizedApiKey)
        );
        requiresProxy = true;
      } catch (proxyError) {
        throw new Error(
          `The provider could not be reached directly from this browser, and the configured CORS proxy also failed. (${normalizeInlineErrorMessage(proxyError)})`
        );
      }
    } else {
      throw new Error(
        `The provider could not be reached from this browser. Confirm the endpoint is correct and that it allows direct cross-origin browser requests, or save a CORS proxy in Settings -> Proxy. (${normalizeInlineErrorMessage(error)})`
      );
    }
  }

  const payload = await parseJsonSafely(response.clone());
  if (!response.ok) {
    const providerMessage = extractProviderErrorMessage(payload);
    if (response.status === 401 || response.status === 403) {
      throw new Error(providerMessage || 'The provider rejected the API key.');
    }
    if (response.status === 404) {
      throw new Error(
        providerMessage ||
          'The provider did not expose a readable /models endpoint at that URL. Use an OpenAI-compatible base endpoint such as https://example.com/v1.'
      );
    }
    const fallbackText = (await parseTextSafely(response.clone())).trim();
    throw new Error(
      providerMessage ||
        fallbackText ||
        `The provider test failed with HTTP ${response.status}.`
    );
  }

  const models = normalizeOpenAiCompatibleModelList(payload?.data);
  if (!models.length) {
    throw new Error('The provider responded, but no readable models were returned.');
  }

  return {
    type: OPENAI_COMPATIBLE_PROVIDER_TYPE,
    endpoint: normalizedEndpoint,
    endpointHost: new URL(normalizedEndpoint).host.toLowerCase(),
    displayName: toProviderDisplayName(normalizedEndpoint),
    supportsTopK: inferOpenAiCompatibleTopKSupport(normalizedEndpoint),
    requiresProxy,
    availableModels: models,
  };
}
