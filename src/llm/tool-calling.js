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
      'Returns a location label and coordinates from the browser geolocation API. Falls back to a coarse location label when permission is denied, unavailable, or times out.',
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
  {
    name: 'tasklist',
    displayName: 'Task List Planner',
    description:
      'Manages a browser-local task list for multi-step work. Call it with no arguments first to reveal the syntax and why task lists matter when context is short.',
    enabled: true,
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          enum: ['new', 'list', 'clear', 'update'],
        },
        item: {
          type: 'string',
        },
        index: {
          type: 'integer',
          minimum: 0,
        },
        status: {
          type: 'integer',
          enum: [0, 1],
        },
      },
      additionalProperties: false,
    },
  },
]);

const reverseGeocodeCache = new Map();

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

function buildToolSpecificUsageInstructions(enabledToolNames = []) {
  const normalizedNames = Array.isArray(enabledToolNames)
    ? enabledToolNames
        .map((toolName) => (typeof toolName === 'string' ? toolName.trim() : ''))
        .filter(Boolean)
    : [];
  const instructions = [];
  if (normalizedNames.includes('get_user_location')) {
    instructions.push('For get_user_location: use the returned location and coordinate directly in your answer.');
  }
  if (normalizedNames.includes('tasklist')) {
    instructions.push(
      'For tasklist: when you need help preserving multi-step work, call tasklist with empty arguments first to reveal syntax. Task lists are important because context may be short, so next steps are easy to forget.'
    );
  }
  return instructions;
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
    ...buildToolSpecificUsageInstructions(enabledToolNames),
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

function extractLeadingJsonObject(rawText) {
  const text = String(rawText || '');
  if (!text.startsWith('{')) {
    return '';
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === '{') {
      depth += 1;
      continue;
    }
    if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(0, index + 1);
      }
    }
  }
  return '';
}

function detectJsonToolCall(rawText, toolCallingConfig) {
  const text = String(rawText || '');
  const detectedCalls = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '{') {
      continue;
    }
    const objectText = extractLeadingJsonObject(text.slice(index));
    if (!objectText) {
      continue;
    }
    try {
      const parsed = JSON.parse(objectText);
      const detected = normalizeDetectedToolCall(
        parsed?.[toolCallingConfig.nameKey],
        parsed?.[toolCallingConfig.argumentsKey],
        objectText,
        toolCallingConfig.format
      );
      if (detected) {
        detectedCalls.push(detected);
        index += objectText.length - 1;
      }
    } catch {
      continue;
    }
  }
  return detectedCalls;
}

function detectTaggedJsonToolCall(rawText, toolCallingConfig) {
  const trimmed = String(rawText || '').trim();
  const detectedCalls = [];
  let searchIndex = 0;
  while (searchIndex < trimmed.length) {
    const openIndex = trimmed.indexOf(toolCallingConfig.openTag, searchIndex);
    if (openIndex < 0) {
      break;
    }
    const closeIndex = trimmed.indexOf(
      toolCallingConfig.closeTag,
      openIndex + toolCallingConfig.openTag.length
    );
    if (closeIndex < 0) {
      break;
    }
    const segmentText = trimmed.slice(openIndex, closeIndex + toolCallingConfig.closeTag.length);
    const innerText = trimmed
      .slice(openIndex + toolCallingConfig.openTag.length, closeIndex)
      .trim();
    const innerDetections = detectJsonToolCall(innerText, {
      ...toolCallingConfig,
      format: toolCallingConfig.format,
    });
    if (innerDetections.length) {
      detectedCalls.push({
        ...innerDetections[0],
        rawText: segmentText,
      });
    }
    searchIndex = closeIndex + toolCallingConfig.closeTag.length;
  }
  return detectedCalls;
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
  const detectedCalls = [];
  let searchIndex = 0;
  while (searchIndex < trimmed.length) {
    const openIndex = trimmed.indexOf(toolCallingConfig.callOpen, searchIndex);
    if (openIndex < 0) {
      break;
    }
    const closeIndex = trimmed.indexOf(
      toolCallingConfig.callClose,
      openIndex + toolCallingConfig.callOpen.length
    );
    if (closeIndex < 0) {
      break;
    }
    const segmentText = trimmed.slice(openIndex, closeIndex + toolCallingConfig.callClose.length);
    const innerText = trimmed
      .slice(openIndex + toolCallingConfig.callOpen.length, closeIndex)
      .trim();
    const match = innerText.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\(([\s\S]*)\)$/);
    if (match) {
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
        segmentText,
        toolCallingConfig.format
      );
      if (detected) {
        detectedCalls.push(detected);
      }
    }
    searchIndex = closeIndex + toolCallingConfig.callClose.length;
  }
  return detectedCalls;
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

function buildTaskListUsageResult() {
  return {
    message:
      'Task lists are important because context may be short, so next steps are easy to forget. Use the normal tool-call wrapper for this model. For tasklist, use one of these arguments objects:',
    examples: [
      '{ "command": "new", "item": "Task item", "index": 0 }',
      '{ "command": "list" }',
      '{ "command": "clear" }',
      '{ "command": "update", "index": 0, "status": 1 }',
    ],
    note: 'status: 0 = undone, 1 = done.',
  };
}

function buildTaskListSnapshot(entries = []) {
  return entries.map((entry, index) => ({
    index,
    text: entry.text,
    status: entry.status,
  }));
}

function getConversationPathMessages(conversation, leafMessageId = conversation?.activeLeafMessageId) {
  if (!conversation || !leafMessageId || !Array.isArray(conversation.messageNodes)) {
    return [];
  }
  const byId = new Map(conversation.messageNodes.map((message) => [message.id, message]));
  const path = [];
  let cursor = byId.get(leafMessageId) || null;
  while (cursor) {
    path.push(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) || null : null;
  }
  return path.reverse();
}

function parseTaskListItemsFromToolMessage(message) {
  if (message?.role !== 'tool' || message.toolName !== 'tasklist') {
    return null;
  }
  try {
    const parsed = JSON.parse(String(message.toolResult || message.text || ''));
    if (!Array.isArray(parsed?.items)) {
      return null;
    }
    return parsed.items
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }
        const text = typeof entry.text === 'string' ? entry.text.trim() : '';
        if (!text) {
          return null;
        }
        return {
          text,
          status: entry.status === 1 || entry.status === true ? 1 : 0,
        };
      })
      .filter(Boolean);
  } catch {
    return null;
  }
}

function deriveTaskListFromConversation(conversation) {
  const pathMessages = getConversationPathMessages(conversation);
  for (let index = pathMessages.length - 1; index >= 0; index -= 1) {
    const taskListItems = parseTaskListItemsFromToolMessage(pathMessages[index]);
    if (taskListItems) {
      return taskListItems;
    }
  }
  return [];
}

function sanitizeTaskListItemText(value) {
  const withoutControlCharacters = Array.from(String(value || ''))
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 ? ' ' : character;
    })
    .join('');
  const normalizedText = withoutControlCharacters
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalizedText) {
    throw new Error('tasklist item must be a non-empty string.');
  }
  if (normalizedText.length > 200) {
    throw new Error('tasklist item must be 200 characters or fewer.');
  }
  if (normalizedText.includes('```')) {
    throw new Error('tasklist item must be plain language, not a fenced code block.');
  }
  if (
    /^<tool_call>[\s\S]*<\/tool_call>$/i.test(normalizedText) ||
    /^<\|tool_call_start\|>[\s\S]*<\|tool_call_end\|>$/i.test(normalizedText)
  ) {
    throw new Error('tasklist item must be plain language, not a tool call block.');
  }
  if (
    /^\{[\s\S]*\}$/.test(normalizedText) &&
    /"(name|arguments|parameters)"\s*:/.test(normalizedText)
  ) {
    throw new Error('tasklist item must be plain language, not a JSON tool call.');
  }
  return normalizedText;
}

function getValidatedTaskListArguments(argumentsValue = {}) {
  if (argumentsValue === undefined) {
    return {};
  }
  if (!argumentsValue || typeof argumentsValue !== 'object' || Array.isArray(argumentsValue)) {
    throw new Error('tasklist arguments must be an object.');
  }
  const supportedKeys = new Set(['command', 'item', 'index', 'status']);
  const unexpectedKeys = Object.keys(argumentsValue).filter((key) => !supportedKeys.has(key));
  if (unexpectedKeys.length) {
    throw new Error(`tasklist does not accept: ${unexpectedKeys.join(', ')}.`);
  }
  const taskListArguments = /** @type {{command?: unknown; item?: unknown; index?: unknown; status?: unknown}} */ (
    argumentsValue
  );
  const normalized = {};
  if (taskListArguments.command !== undefined) {
    if (typeof taskListArguments.command !== 'string' || !taskListArguments.command.trim()) {
      throw new Error('tasklist command must be a non-empty string.');
    }
    const command = taskListArguments.command.trim().toLowerCase();
    if (!['new', 'list', 'clear', 'update'].includes(command)) {
      throw new Error('tasklist command must be one of: new, list, clear, update.');
    }
    normalized.command = command;
  }
  if (taskListArguments.item !== undefined) {
    if (typeof taskListArguments.item !== 'string' || !taskListArguments.item.trim()) {
      throw new Error('tasklist item must be a non-empty string.');
    }
    normalized.item = sanitizeTaskListItemText(taskListArguments.item);
  }
  if (taskListArguments.index !== undefined) {
    const indexCandidate = taskListArguments.index;
    if (typeof indexCandidate !== 'number' || !Number.isInteger(indexCandidate) || indexCandidate < 0) {
      throw new Error('tasklist index must be an integer greater than or equal to 0.');
    }
    normalized.index = indexCandidate;
  }
  if (taskListArguments.status !== undefined) {
    const statusCandidate = taskListArguments.status;
    if (
      statusCandidate !== 0 &&
      statusCandidate !== 1 &&
      statusCandidate !== false &&
      statusCandidate !== true
    ) {
      throw new Error('tasklist status must be 0 or 1.');
    }
    normalized.status = statusCandidate === 1 || statusCandidate === true ? 1 : 0;
  }
  return normalized;
}

function executeTaskList(argumentsValue = {}, runtimeContext = {}) {
  const normalizedArguments = getValidatedTaskListArguments(argumentsValue);
  if (!normalizedArguments.command) {
    return buildTaskListUsageResult();
  }
  const conversation =
    runtimeContext.conversation && typeof runtimeContext.conversation === 'object'
      ? runtimeContext.conversation
      : null;
  if (!conversation) {
    throw new Error('tasklist requires an active conversation.');
  }
  const taskListItems = deriveTaskListFromConversation(conversation);

  if (normalizedArguments.command === 'list') {
    return {
      items: buildTaskListSnapshot(taskListItems),
    };
  }

  if (normalizedArguments.command === 'clear') {
    return {
      items: [],
    };
  }

  if (normalizedArguments.command === 'new') {
    if (!normalizedArguments.item) {
      throw new Error('tasklist new requires item.');
    }
    const insertIndex = Number.isInteger(normalizedArguments.index)
      ? Math.max(0, Math.min(taskListItems.length, normalizedArguments.index))
      : taskListItems.length;
    const nextEntry = {
      text: normalizedArguments.item,
      status: 0,
    };
    const nextItems = [...taskListItems];
    nextItems.splice(insertIndex, 0, nextEntry);
    return {
      items: buildTaskListSnapshot(nextItems),
    };
  }

  if (normalizedArguments.command === 'update') {
    if (!Number.isInteger(normalizedArguments.index)) {
      throw new Error('tasklist update requires index.');
    }
    if (normalizedArguments.status === undefined) {
      throw new Error('tasklist update requires status.');
    }
    const existingItem = taskListItems[normalizedArguments.index];
    if (!existingItem) {
      throw new Error(`tasklist item ${normalizedArguments.index} does not exist.`);
    }
    const nextItems = taskListItems.map((entry, index) =>
      index === normalizedArguments.index
        ? {
            text: entry.text,
            status: normalizedArguments.status,
          }
        : entry
    );
    return {
      items: buildTaskListSnapshot(nextItems),
    };
  }

  throw new Error('Unsupported tasklist command.');
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
  const locationArguments = /** @type {{timeoutMs?: unknown}} */ (argumentsValue);
  const timeoutCandidate = locationArguments.timeoutMs;
  if (timeoutCandidate === undefined) {
    return {
      timeoutMs: 10000,
    };
  }
  if (
    typeof timeoutCandidate !== 'number' ||
    !Number.isInteger(timeoutCandidate) ||
    timeoutCandidate < 1000 ||
    timeoutCandidate > 30000
  ) {
    throw new Error('get_user_location timeoutMs must be an integer between 1000 and 30000.');
  }
  return {
    timeoutMs: timeoutCandidate,
  };
}

function requestCurrentPosition(navigatorRef, options) {
  return new Promise((resolve, reject) => {
    navigatorRef.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

function buildNominatimReverseUrl(latitude, longitude, language) {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', String(latitude));
  url.searchParams.set('lon', String(longitude));
  url.searchParams.set('addressdetails', '1');
  if (typeof language === 'string' && language.trim()) {
    url.searchParams.set('accept-language', language.trim());
  }
  return url.toString();
}

function getReadableLocality(address = {}) {
  if (!address || typeof address !== 'object') {
    return '';
  }
  const addressRecord = /** @type {{
   * city?: unknown;
   * town?: unknown;
   * village?: unknown;
   * hamlet?: unknown;
   * suburb?: unknown;
   * county?: unknown;
   * }} */ (address);
  return (
    addressRecord.city ||
    addressRecord.town ||
    addressRecord.village ||
    addressRecord.hamlet ||
    addressRecord.suburb ||
    addressRecord.county ||
    ''
  );
}

function buildFormattedResolvedLocation(address = {}, fallbackDisplayName = '') {
  const locality = getReadableLocality(address);
  const adminRegion = address.state || address.region || address.county || '';
  const country = address.country || '';
  const parts = [locality, adminRegion, country].filter(
    (value, index, values) => typeof value === 'string' && value.trim() && values.indexOf(value) === index
  );
  if (parts.length) {
    return parts.join(', ');
  }
  return typeof fallbackDisplayName === 'string' ? fallbackDisplayName.trim() : '';
}

async function reverseGeocodeCoordinates(latitude, longitude, runtimeContext = {}) {
  const cacheKey = `${Number(latitude).toFixed(3)},${Number(longitude).toFixed(3)}`;
  if (reverseGeocodeCache.has(cacheKey)) {
    return reverseGeocodeCache.get(cacheKey);
  }
  const fetchRef = runtimeContext.fetchRef || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  if (typeof fetchRef !== 'function') {
    return null;
  }
  try {
    const response = await fetchRef(
      buildNominatimReverseUrl(latitude, longitude, runtimeContext.navigatorRef?.language),
      {
        headers: {
          Accept: 'application/json',
        },
      }
    );
    if (!response?.ok) {
      return null;
    }
    const payload = await response.json();
    const address = payload?.address && typeof payload.address === 'object' ? payload.address : {};
    const formattedLocation = buildFormattedResolvedLocation(
      address,
      typeof payload?.display_name === 'string' ? payload.display_name : ''
    );
    const result = {
      provider: 'OpenStreetMap Nominatim',
      attribution: '© OpenStreetMap contributors',
      formattedLocation: formattedLocation || null,
      displayName: typeof payload?.display_name === 'string' ? payload.display_name : null,
      locality: getReadableLocality(address) || null,
      state: typeof address.state === 'string' ? address.state : null,
      country: typeof address.country === 'string' ? address.country : null,
      countryCode: typeof address.country_code === 'string' ? address.country_code.toUpperCase() : null,
      postcode: typeof address.postcode === 'string' ? address.postcode : null,
    };
    reverseGeocodeCache.set(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}

function buildApproximateLocationLabel(navigatorRef) {
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
  return regionCode ? `${approximateArea}, ${regionCode}` : approximateArea;
}

async function executeGetUserLocation(argumentsValue = {}, runtimeContext = {}) {
  const { timeoutMs } = getValidatedLocationArguments(argumentsValue);
  const navigatorRef =
    runtimeContext.navigatorRef ||
    (typeof navigator !== 'undefined' && navigator ? navigator : null);
  if (!navigatorRef) {
    return {
      location: buildApproximateLocationLabel(null),
      coordinate: null,
    };
  }

  const geolocationApi = navigatorRef.geolocation;
  if (!geolocationApi || typeof geolocationApi.getCurrentPosition !== 'function') {
    return {
      location: buildApproximateLocationLabel(navigatorRef),
      coordinate: null,
    };
  }

  try {
    const position = await requestCurrentPosition(navigatorRef, {
      enableHighAccuracy: true,
      timeout: timeoutMs,
      maximumAge: 0,
    });
    const latitude = Number(position?.coords?.latitude);
    const longitude = Number(position?.coords?.longitude);
    const resolvedLocation = await reverseGeocodeCoordinates(latitude, longitude, runtimeContext);
    const location =
      typeof resolvedLocation?.formattedLocation === 'string' && resolvedLocation.formattedLocation.trim()
        ? resolvedLocation.formattedLocation.trim()
        : `${latitude}, ${longitude}`;
    return {
      location,
      coordinate: {
        latitude,
        longitude,
      },
    };
  } catch {
    return {
      location: buildApproximateLocationLabel(navigatorRef),
      coordinate: null,
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
  if (toolName === 'tasklist') {
    const result = executeTaskList(argumentsValue, runtimeContext);
    return {
      toolName,
      arguments: argumentsValue,
      result,
      resultText: JSON.stringify(result),
    };
  }
  throw new Error(`Unknown tool: ${toolName}`);
}
