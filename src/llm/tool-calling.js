export const TOOL_DEFINITIONS = Object.freeze([
  {
    name: 'get_current_date_time',
    description:
      'Returns the current local date and time for this browser session, plus a UTC ISO timestamp and timezone name.',
    enabled: true,
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
]);

export function getEnabledToolDefinitions() {
  return TOOL_DEFINITIONS.filter((tool) => tool?.enabled === true);
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

export async function executeToolCall(toolCall) {
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
  throw new Error(`Unknown tool: ${toolName}`);
}
