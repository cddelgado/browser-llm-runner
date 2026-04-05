const CORS_ERROR_MESSAGE_PATTERN =
  /failed to fetch|load failed|networkerror|network request failed|fetch failed/i;
const SENSITIVE_PROXY_HEADER_NAMES = new Set([
  'authorization',
  'cookie',
  'proxy-authorization',
  'x-api-key',
]);
export const CORS_PROXY_VALIDATION_TARGET_URL = 'https://example.com/';

function isLocalHttpUrl(url) {
  const hostname = String(url?.hostname || '').toLowerCase();
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1'
  );
}

function normalizeInlineErrorMessage(error) {
  const message =
    error instanceof Error && typeof error.message === 'string' ? error.message.trim() : '';
  if (message) {
    return message;
  }
  return String(error || 'Unknown network error.');
}

function getFetchRef(fetchRef) {
  if (typeof fetchRef === 'function') {
    return fetchRef;
  }
  return typeof fetch === 'function' ? fetch.bind(globalThis) : null;
}

/**
 * @param {{ href?: string; origin?: string } | null | undefined} [locationRef]
 */
function getLocationOrigin(locationRef = globalThis.location) {
  if (locationRef && typeof locationRef.origin === 'string' && locationRef.origin.trim()) {
    return locationRef.origin.trim();
  }
  if (locationRef && typeof locationRef.href === 'string' && locationRef.href.trim()) {
    try {
      return new URL(locationRef.href).origin;
    } catch {
      return '';
    }
  }
  return '';
}

function isPrivateIpv4Hostname(hostname) {
  const parts = String(hostname || '')
    .trim()
    .split('.')
    .map((entry) => Number.parseInt(entry, 10));
  if (parts.length !== 4 || parts.some((entry) => !Number.isInteger(entry) || entry < 0 || entry > 255)) {
    return false;
  }
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}

function isLocalNetworkHostname(hostname) {
  const normalizedHostname = String(hostname || '').trim().toLowerCase();
  return (
    normalizedHostname === 'localhost' ||
    normalizedHostname === '[::1]' ||
    normalizedHostname === '::1' ||
    normalizedHostname.endsWith('.local') ||
    isPrivateIpv4Hostname(normalizedHostname)
  );
}

function isSensitiveProxyTarget(targetUrl, proxyUrl) {
  const targetHostIsLocal = isLocalNetworkHostname(targetUrl.hostname);
  if (!targetHostIsLocal) {
    return false;
  }
  return !isLocalNetworkHostname(proxyUrl.hostname);
}

function hasSensitiveProxyHeaders(headers) {
  if (!headers || typeof headers.forEach !== 'function') {
    return false;
  }
  let foundSensitiveHeader = false;
  headers.forEach((_value, name) => {
    if (SENSITIVE_PROXY_HEADER_NAMES.has(String(name || '').trim().toLowerCase())) {
      foundSensitiveHeader = true;
    }
  });
  return foundSensitiveHeader;
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

function shouldTreatAsCrossOrigin(requestUrl, locationOrigin) {
  if (!locationOrigin) {
    return true;
  }
  return requestUrl.origin !== locationOrigin;
}

function shouldConsiderProxyForRequest(request, proxyUrl, locationOrigin) {
  const requestUrl = new URL(request.url);
  if (
    (requestUrl.protocol !== 'https:' && !(requestUrl.protocol === 'http:' && isLocalHttpUrl(requestUrl))) ||
    !shouldTreatAsCrossOrigin(requestUrl, locationOrigin)
  ) {
    return false;
  }
  if (request.mode === 'no-cors') {
    return false;
  }
  return !request.url.startsWith(proxyUrl);
}

function buildProxyRetryFailure(error) {
  return new Error(
    `Direct browser request appears blocked by CORS, and the configured proxy also failed: ${normalizeInlineErrorMessage(error)}`
  );
}

async function readRequestBody(request) {
  if (request.method === 'GET' || request.method === 'HEAD') {
    return undefined;
  }
  const bodyBuffer = await request.arrayBuffer();
  return new Uint8Array(bodyBuffer);
}

/**
 * @param {string} targetUrl
 * @param {{fetchRef?: typeof fetch | null; method?: string; signal?: AbortSignal | null}} [options]
 */
async function canReachTargetWithoutCors(targetUrl, { fetchRef, method = 'GET', signal } = {}) {
  if (typeof fetchRef !== 'function') {
    return false;
  }
  try {
    await fetchRef(targetUrl, {
      method: method === 'HEAD' ? 'HEAD' : 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'follow',
      signal,
    });
    return true;
  } catch {
    return false;
  }
}

export function normalizeCorsProxyUrl(value) {
  const rawValue = typeof value === 'string' ? value.trim() : '';
  if (!rawValue) {
    throw new Error('Enter a CORS proxy URL.');
  }
  let url;
  try {
    url = new URL(rawValue);
  } catch {
    throw new Error('Enter a valid CORS proxy URL.');
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalHttpUrl(url))) {
    throw new Error('Use an https CORS proxy URL, or http on localhost.');
  }
  if (url.username || url.password) {
    throw new Error('CORS proxy URLs with embedded credentials are not supported.');
  }
  if (url.hash) {
    throw new Error('CORS proxy URLs cannot include fragments.');
  }
  if (!url.search && !url.pathname.endsWith('/')) {
    url.pathname = `${url.pathname}/`;
  }
  return url.toString();
}

export function getStoredCorsProxyUrl(value) {
  const rawValue = typeof value === 'string' ? value.trim() : '';
  if (!rawValue) {
    return '';
  }
  try {
    return normalizeCorsProxyUrl(rawValue);
  } catch {
    return '';
  }
}

export function buildCorsProxyRequestUrl(proxyUrl, targetUrl) {
  const normalizedProxyUrl = normalizeCorsProxyUrl(proxyUrl);
  const normalizedTargetUrl = new URL(String(targetUrl || '').trim());
  return `${normalizedProxyUrl}${normalizedTargetUrl.toString()}`;
}

/**
 * @param {string} value
 * @param {{fetchRef?: typeof fetch | null; probeTargetUrl?: string}} [options]
 */
export async function validateCorsProxyUrl(
  value,
  {
    fetchRef,
    probeTargetUrl = CORS_PROXY_VALIDATION_TARGET_URL,
  } = {}
) {
  const normalizedProxyUrl = normalizeCorsProxyUrl(value);
  const activeFetchRef = getFetchRef(fetchRef);
  if (typeof activeFetchRef !== 'function') {
    throw new Error('Browser fetch is unavailable for CORS proxy validation.');
  }
  let response;
  try {
    response = await activeFetchRef(buildCorsProxyRequestUrl(normalizedProxyUrl, probeTargetUrl), {
      method: 'GET',
      cache: 'no-store',
      headers: {
        Accept: 'text/html, text/plain;q=0.9, */*;q=0.1',
      },
    });
  } catch (error) {
    throw new Error(
      `The CORS proxy could not be reached from the browser. ${normalizeInlineErrorMessage(error)}`
    );
  }
  if (!response?.ok) {
    throw new Error(
      `The CORS proxy test request failed (${response?.status || 0}${response?.statusText ? ` ${response.statusText}` : ''}).`
    );
  }
  let previewText = '';
  try {
    previewText = await response.text();
  } catch {
    throw new Error('The CORS proxy test response could not be read by the browser.');
  }
  if (!/example domain/i.test(previewText)) {
    throw new Error(
      'The proxy did not return the expected test page. Use a prefix-style proxy that can fetch https://example.com/.'
    );
  }
  return normalizedProxyUrl;
}

/**
 * @param {{
 *   fetchRef?: typeof fetch | null;
 *   getProxyUrl?: (() => string) | string;
 *   locationRef?: { href?: string; origin?: string } | null;
 * }} [options]
 */
export function createCorsAwareFetch({
  fetchRef,
  getProxyUrl = () => '',
  locationRef = globalThis.location,
} = {}) {
  const activeFetchRef = getFetchRef(fetchRef);
  if (typeof activeFetchRef !== 'function') {
    return null;
  }
  if (
    typeof globalThis.Request !== 'function' ||
    typeof globalThis.Headers !== 'function'
  ) {
    return activeFetchRef;
  }
  const locationOrigin = getLocationOrigin(locationRef);
  return async (input, init) => {
    const normalizedProxyUrl = getStoredCorsProxyUrl(
      typeof getProxyUrl === 'function' ? getProxyUrl() : getProxyUrl
    );
    if (!normalizedProxyUrl) {
      return activeFetchRef(input, init);
    }

    const request = new globalThis.Request(input, init);
    if (!shouldConsiderProxyForRequest(request, normalizedProxyUrl, locationOrigin)) {
      return activeFetchRef(request);
    }

    try {
      return await activeFetchRef(request.clone());
    } catch (error) {
      const requestUrl = new URL(request.url);
      const proxyUrl = new URL(normalizedProxyUrl);
      if (
        !isLikelyCorsBlockedError(error) ||
        request.signal?.aborted ||
        hasSensitiveProxyHeaders(request.headers) ||
        isSensitiveProxyTarget(requestUrl, proxyUrl)
      ) {
        throw error;
      }

      const targetLooksReachable = await canReachTargetWithoutCors(request.url, {
        fetchRef: activeFetchRef,
        method: request.method,
        signal: request.signal,
      });
      if (!targetLooksReachable) {
        throw error;
      }

      const proxyRequest = new globalThis.Request(
        buildCorsProxyRequestUrl(normalizedProxyUrl, request.url),
        {
          method: request.method,
          headers: new globalThis.Headers(request.headers),
          body: await readRequestBody(request),
          cache: request.cache,
          credentials: request.credentials,
          integrity: request.integrity,
          keepalive: request.keepalive,
          mode: request.mode === 'navigate' ? 'cors' : request.mode,
          redirect: request.redirect,
          referrer: request.referrer,
          referrerPolicy: request.referrerPolicy,
          signal: request.signal,
        }
      );

      try {
        return await activeFetchRef(proxyRequest);
      } catch (proxyError) {
        throw buildProxyRetryFailure(proxyError);
      }
    }
  };
}
