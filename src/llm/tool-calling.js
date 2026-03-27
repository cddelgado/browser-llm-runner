export const TOOL_DEFINITIONS = Object.freeze([
  {
    name: 'get_current_date_time',
    displayName: 'Get Date and Time',
    description:
      'Returns the current local date and time for this browser session, plus a UTC ISO timestamp and timezone name.',
    enabled: true,
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'get_user_location',
    displayName: 'Get User Location',
    description:
      'Returns the user location from the browser geolocation API when permission is granted. Falls back to a coarse approximation from browser locale and timezone when permission is denied, unavailable, or times out.',
    enabled: true,
    parameters: {
      type: 'object',
      properties: {
        timeoutMs: {
          type: 'integer',
          minimum: 1000,
          maximum: 30000,
        },
      },
      additionalProperties: false,
    },
  },
]);

function humanizeToolName(toolName) {
  const normalizedName = typeof toolName === 'string' ? toolName.trim() : '';
  if (!normalizedName) {
    return 'Unknown Tool';
  }
  return normalizedName
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

export function getEnabledToolDefinitions() {
  return TOOL_DEFINITIONS.filter((tool) => tool?.enabled === true);
}

export function getToolDefinitionByName(toolName) {
  const normalizedName = typeof toolName === 'string' ? toolName.trim() : '';
  if (!normalizedName) {
    return null;
  }
  return TOOL_DEFINITIONS.find((tool) => tool?.name === normalizedName) || null;
}

export function getToolDisplayName(toolName) {
  const displayName = getToolDefinitionByName(toolName)?.displayName;
  return typeof displayName === 'string' && displayName.trim()
    ? displayName.trim()
    : humanizeToolName(toolName);
}

export function getEnabledToolNames() {
  return getEnabledToolDefinitions()
    .map((tool) => (typeof tool.name === 'string' ? tool.name.trim() : ''))
    .filter(Boolean);
}

function getNormalizedToolList(enabledToolNames = []) {
  const normalizedToolNames = Array.isArray(enabledToolNames)
    ? enabledToolNames
        .map((toolName) => (typeof toolName === 'string' ? toolName.trim() : ''))
        .filter(Boolean)
    : [];
  return normalizedToolNames.length ? normalizedToolNames : ['none'];
}

function buildToolCallingFormatInstructions(toolCallingConfig) {
  if (!toolCallingConfig || typeof toolCallingConfig !== 'object') {
    return [];
  }
  if (toolCallingConfig.format === 'json') {
    return [
      'When calling a tool, respond with exactly one JSON object and no extra text.',
      `Use this shape: {"${toolCallingConfig.nameKey}":"<tool-name>","${toolCallingConfig.argumentsKey}":{...}}.`,
    ];
  }
  if (toolCallingConfig.format === 'tagged-json') {
    return [
      'When calling a tool, respond with exactly one tagged tool call block and no extra text.',
      `Wrap the JSON object in ${toolCallingConfig.openTag} and ${toolCallingConfig.closeTag}.`,
      `Use this JSON shape inside the tags: {"${toolCallingConfig.nameKey}":"<tool-name>","${toolCallingConfig.argumentsKey}":{...}}.`,
    ];
  }
  if (toolCallingConfig.format === 'special-token-call') {
    return [
      'When calling a tool, respond with exactly one function-style tool call and no extra text.',
      `Wrap the call in ${toolCallingConfig.callOpen} and ${toolCallingConfig.callClose}.`,
      'Use this shape inside the wrapper: tool_name(arg1="value1", arg2="value2").',
    ];
  }
  return [];
}

function buildEnabledToolInstructions(enabledTools = []) {
  if (!Array.isArray(enabledTools) || !enabledTools.length) {
    return [];
  }
  return [
    'Available tool definitions:',
    ...enabledTools.map((tool) => {
      const name = typeof tool?.name === 'string' ? tool.name.trim() : 'unknown_tool';
      const description =
        typeof tool?.description === 'string' && tool.description.trim()
          ? tool.description.trim()
          : 'No description provided.';
      const parameters =
        tool?.parameters && typeof tool.parameters === 'object'
          ? JSON.stringify(tool.parameters)
          : '{}';
      return `- ${name}: ${description} Parameters schema: ${parameters}`;
    }),
  ];
}

export function buildToolCallingSystemPrompt(
  toolCallingConfig,
  enabledToolNames = [],
  enabledTools = []
) {
  const toolList = getNormalizedToolList(enabledToolNames);
  return [
    'Tool calling is enabled for this conversation.',
    `Enabled tools: ${toolList.join(', ')}.`,
    'If no tools are enabled, answer normally and do not attempt any tool calls.',
    'After you receive a tool result, use it to answer the user naturally.',
    'Do not call the same tool again unless the tool result is missing required information or the user asks for refreshed data.',
    ...buildEnabledToolInstructions(enabledTools),
    ...buildToolCallingFormatInstructions(toolCallingConfig),
    'Do not wrap tool calls in Markdown, and never invent tool names that are not enabled.',
  ]
    .filter(Boolean)
    .join('\n');
}

function normalizeDetectedToolCall(name, argumentsValue, rawText, format) {
  const normalizedName = typeof name === 'string' ? name.trim() : '';
  if (!normalizedName) {
    return null;
  }
  const normalizedArguments =
    argumentsValue && typeof argumentsValue === 'object' && !Array.isArray(argumentsValue)
      ? argumentsValue
      : {};
  return {
    name: normalizedName,
    arguments: normalizedArguments,
    rawText: String(rawText || ''),
    format,
  };
}

function detectJsonToolCall(rawText, toolCallingConfig) {
  const trimmed = String(rawText || '').trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return [];
  }
  try {
    const parsed = JSON.parse(trimmed);
    const detected = normalizeDetectedToolCall(
      parsed?.[toolCallingConfig.nameKey],
      parsed?.[toolCallingConfig.argumentsKey],
      trimmed,
      toolCallingConfig.format
    );
    return detected ? [detected] : [];
  } catch {
    return [];
  }
}

function detectTaggedJsonToolCall(rawText, toolCallingConfig) {
  const trimmed = String(rawText || '').trim();
  if (!trimmed.startsWith(toolCallingConfig.openTag) || !trimmed.endsWith(toolCallingConfig.closeTag)) {
    return [];
  }
  const innerText = trimmed
    .slice(toolCallingConfig.openTag.length, trimmed.length - toolCallingConfig.closeTag.length)
    .trim();
  return detectJsonToolCall(innerText, {
    ...toolCallingConfig,
    format: toolCallingConfig.format,
  });
}

function parseSpecialTokenArgumentValue(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return '';
  }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  if (trimmed === 'true') {
    return true;
  }
  if (trimmed === 'false') {
    return false;
  }
  if (trimmed === 'null') {
    return null;
  }
  const numericValue = Number(trimmed);
  if (Number.isFinite(numericValue) && trimmed === String(numericValue)) {
    return numericValue;
  }
  return trimmed;
}

function splitSpecialTokenArguments(rawArgumentsText) {
  const segments = [];
  let current = '';
  let quote = '';
  for (const character of String(rawArgumentsText || '')) {
    if ((character === '"' || character === "'") && !quote) {
      quote = character;
      current += character;
      continue;
    }
    if (character === quote) {
      quote = '';
      current += character;
      continue;
    }
    if (character === ',' && !quote) {
      if (current.trim()) {
        segments.push(current.trim());
      }
      current = '';
      continue;
    }
    current += character;
  }
  if (current.trim()) {
    segments.push(current.trim());
  }
  return segments;
}

function detectSpecialTokenCall(rawText, toolCallingConfig) {
  const trimmed = String(rawText || '').trim();
  if (!trimmed.startsWith(toolCallingConfig.callOpen) || !trimmed.endsWith(toolCallingConfig.callClose)) {
    return [];
  }
  const innerText = trimmed
    .slice(toolCallingConfig.callOpen.length, trimmed.length - toolCallingConfig.callClose.length)
    .trim();
  const match = innerText.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\(([\s\S]*)\)$/);
  if (!match) {
    return [];
  }
  const [, toolName, rawArgumentsText] = match;
  const argumentsObject = Object.fromEntries(
    splitSpecialTokenArguments(rawArgumentsText)
      .map((segment) => {
        const equalsIndex = segment.indexOf('=');
        if (equalsIndex <= 0) {
          return null;
        }
        const key = segment.slice(0, equalsIndex).trim();
        const value = parseSpecialTokenArgumentValue(segment.slice(equalsIndex + 1));
        return key ? [key, value] : null;
      })
      .filter(Boolean)
  );
  const detected = normalizeDetectedToolCall(
    toolName,
    argumentsObject,
    trimmed,
    toolCallingConfig.format
  );
  return detected ? [detected] : [];
}

export function sniffToolCalls(rawText, toolCallingConfig) {
  if (!toolCallingConfig || typeof toolCallingConfig !== 'object') {
    return [];
  }
  if (toolCallingConfig.format === 'json') {
    return detectJsonToolCall(rawText, toolCallingConfig);
  }
  if (toolCallingConfig.format === 'tagged-json') {
    return detectTaggedJsonToolCall(rawText, toolCallingConfig);
  }
  if (toolCallingConfig.format === 'special-token-call') {
    return detectSpecialTokenCall(rawText, toolCallingConfig);
  }
  return [];
}

function executeGetCurrentDateTime(argumentsValue = {}) {
  if (argumentsValue && typeof argumentsValue === 'object' && Object.keys(argumentsValue).length > 0) {
    throw new Error('get_current_date_time does not accept any arguments.');
  }
  const now = new Date();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  return {
    iso: now.toISOString(),
    unixMs: now.getTime(),
    localDate: new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(now),
    localTime: new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(now),
    timeZone,
  };
}

function getValidatedLocationArguments(argumentsValue = {}) {
  if (!argumentsValue || typeof argumentsValue !== 'object' || Array.isArray(argumentsValue)) {
    throw new Error('get_user_location arguments must be an object.');
  }
  const supportedKeys = new Set(['timeoutMs']);
  const unexpectedKeys = Object.keys(argumentsValue).filter((key) => !supportedKeys.has(key));
  if (unexpectedKeys.length) {
    throw new Error(`get_user_location does not accept: ${unexpectedKeys.join(', ')}.`);
  }
  const timeoutCandidate = argumentsValue.timeoutMs;
  if (timeoutCandidate === undefined) {
    return {
      timeoutMs: 10000,
    };
  }
  if (!Number.isInteger(timeoutCandidate) || timeoutCandidate < 1000 || timeoutCandidate > 30000) {
    throw new Error('get_user_location timeoutMs must be an integer between 1000 and 30000.');
  }
  return {
    timeoutMs: timeoutCandidate,
  };
}

async function getGeolocationPermissionState(navigatorRef) {
  const permissionsApi = navigatorRef?.permissions;
  if (!permissionsApi || typeof permissionsApi.query !== 'function') {
    return 'unavailable';
  }
  try {
    const status = await permissionsApi.query({ name: 'geolocation' });
    return typeof status?.state === 'string' ? status.state : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

function requestCurrentPosition(navigatorRef, options) {
  return new Promise((resolve, reject) => {
    navigatorRef.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

function getTimeZoneOffsetMinutes(now, timeZone) {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'shortOffset',
      hour: '2-digit',
      minute: '2-digit',
    });
    const offsetValue = formatter
      .formatToParts(now)
      .find((part) => part.type === 'timeZoneName')?.value;
    const match = offsetValue?.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
    if (!match) {
      return null;
    }
    const [, sign, hoursText, minutesText] = match;
    const hours = Number(hoursText);
    const minutes = Number(minutesText || '0');
    const totalMinutes = hours * 60 + minutes;
    return sign === '-' ? -totalMinutes : totalMinutes;
  } catch {
    return null;
  }
}

function formatUtcOffset(offsetMinutes) {
  if (!Number.isFinite(offsetMinutes)) {
    return null;
  }
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absoluteMinutes / 60)).padStart(2, '0');
  const minutes = String(absoluteMinutes % 60).padStart(2, '0');
  return `UTC${sign}${hours}:${minutes}`;
}

function buildApproximateLocationResult(navigatorRef) {
  const locale =
    navigatorRef?.languages?.find((entry) => typeof entry === 'string' && entry.trim()) ||
    (typeof navigatorRef?.language === 'string' ? navigatorRef.language : '') ||
    'en-US';
  const localeParts = String(locale).split(/[-_]/);
  const regionCode = localeParts.length > 1 ? localeParts[localeParts.length - 1].toUpperCase() : null;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const timeZoneParts = String(timeZone).split('/');
  const timeZoneArea = timeZoneParts.length > 1 ? timeZoneParts[timeZoneParts.length - 1] : timeZoneParts[0];
  const approximateArea = timeZoneArea ? timeZoneArea.replace(/_/g, ' ') : 'Unknown area';
  const now = new Date();
  const utcOffsetMinutes = getTimeZoneOffsetMinutes(now, timeZone);
  return {
    source: 'approximate_browser_signals',
    confidenceLevel: 'low',
    permissionState: 'denied',
    coordinates: null,
    approximateLocation: {
      label: regionCode ? `${approximateArea}, ${regionCode}` : approximateArea,
      regionCode,
      timeZone,
      utcOffset: formatUtcOffset(utcOffsetMinutes),
      locale,
    },
  };
}

async function executeGetUserLocation(argumentsValue = {}, runtimeContext = {}) {
  const { timeoutMs } = getValidatedLocationArguments(argumentsValue);
  const navigatorRef =
    runtimeContext.navigatorRef ||
    (typeof navigator !== 'undefined' && navigator ? navigator : null);
  if (!navigatorRef) {
    return {
      ...buildApproximateLocationResult(null),
      permissionState: 'unavailable',
    };
  }

  const permissionState = await getGeolocationPermissionState(navigatorRef);
  const geolocationApi = navigatorRef.geolocation;
  if (!geolocationApi || typeof geolocationApi.getCurrentPosition !== 'function') {
    return {
      ...buildApproximateLocationResult(navigatorRef),
      permissionState,
    };
  }

  try {
    const position = await requestCurrentPosition(navigatorRef, {
      enableHighAccuracy: true,
      timeout: timeoutMs,
      maximumAge: 0,
    });
    const accuracyMeters = Number(position?.coords?.accuracy);
    const confidenceLevel =
      Number.isFinite(accuracyMeters) && accuracyMeters <= 100
        ? 'high'
        : Number.isFinite(accuracyMeters) && accuracyMeters <= 1000
          ? 'medium'
          : 'low';
    return {
      source: 'browser_geolocation',
      confidenceLevel,
      permissionState: permissionState === 'unavailable' ? 'granted' : permissionState,
      coordinates: {
        latitude: Number(position?.coords?.latitude),
        longitude: Number(position?.coords?.longitude),
        accuracyMeters: Number.isFinite(accuracyMeters) ? accuracyMeters : null,
      },
      approximateLocation: null,
    };
  } catch (error) {
    const errorCode = Number(error?.code);
    const fallbackPermissionState =
      errorCode === 1
        ? 'denied'
        : errorCode === 3
          ? 'timeout'
          : permissionState;
    return {
      ...buildApproximateLocationResult(navigatorRef),
      permissionState: fallbackPermissionState,
    };
  }
}

export async function executeToolCall(toolCall, runtimeContext = {}) {
  if (!toolCall || typeof toolCall !== 'object') {
    throw new Error('Tool call is required.');
  }
  const toolName = typeof toolCall.name === 'string' ? toolCall.name.trim() : '';
  const argumentsValue =
    toolCall.arguments && typeof toolCall.arguments === 'object' && !Array.isArray(toolCall.arguments)
      ? toolCall.arguments
      : {};
  if (toolName === 'get_current_date_time') {
    const result = executeGetCurrentDateTime(argumentsValue);
    return {
      toolName,
      arguments: argumentsValue,
      result,
      resultText: JSON.stringify(result),
    };
  }
  if (toolName === 'get_user_location') {
    const result = await executeGetUserLocation(argumentsValue, runtimeContext);
    return {
      toolName,
      arguments: argumentsValue,
      result,
      resultText: JSON.stringify(result),
    };
  }
  throw new Error(`Unknown tool: ${toolName}`);
}
