import {
  assertSupportedMcpEndpoint,
  McpHttpClient,
  MCP_AUTH_UNSUPPORTED_MESSAGE,
} from './mcp-http-client';

const MAX_SCHEMA_DEPTH = 2;
const MAX_SCHEMA_PROPERTIES = 12;
const MAX_SCHEMA_ENUM_VALUES = 8;
const MAX_CAPABILITY_COUNT = 8;

function normalizeInlineText(value, { maxLength = 240 } = {}) {
  const normalized = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) {
    return '';
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function normalizeMultilineText(value, { maxLength = 1200 } = {}) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '';
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function slugifyIdentifier(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'mcp-server';
}

function createPrefixedDebugLogger(onDebug, prefix) {
  if (typeof onDebug !== 'function') {
    return null;
  }
  const normalizedPrefix = typeof prefix === 'string' && prefix.trim() ? prefix.trim() : 'MCP';
  return (message) => {
    const normalizedMessage = typeof message === 'string' ? message.trim() : '';
    if (!normalizedMessage) {
      return;
    }
    onDebug(`${normalizedPrefix}: ${normalizedMessage}`);
  };
}

export function buildUniqueMcpServerIdentifier(value, existingIdentifiers = []) {
  const baseIdentifier = slugifyIdentifier(value);
  const existingIdentifierSet = new Set(
    Array.isArray(existingIdentifiers)
      ? existingIdentifiers
          .map((identifier) =>
            typeof identifier === 'string' ? identifier.trim().toLowerCase() : ''
          )
          .filter(Boolean)
      : []
  );
  if (!existingIdentifierSet.has(baseIdentifier)) {
    return baseIdentifier;
  }
  let suffix = 2;
  while (existingIdentifierSet.has(`${baseIdentifier}-${suffix}`)) {
    suffix += 1;
  }
  return `${baseIdentifier}-${suffix}`;
}

function normalizeCapabilityList(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeInlineText(entry, { maxLength: 80 }))
      .filter(Boolean)
      .slice(0, MAX_CAPABILITY_COUNT);
  }
  if (!value || typeof value !== 'object') {
    return [];
  }
  return Object.entries(value)
    .filter(
      ([, entryValue]) => entryValue !== null && entryValue !== undefined && entryValue !== false
    )
    .map(([key]) => normalizeInlineText(key, { maxLength: 80 }))
    .filter(Boolean)
    .slice(0, MAX_CAPABILITY_COUNT);
}

function trimJsonSchema(schema, depth = 0) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return null;
  }
  const trimmed = {};
  if (typeof schema.type === 'string') {
    trimmed.type = schema.type;
  }
  if (typeof schema.title === 'string' && schema.title.trim()) {
    trimmed.title = normalizeInlineText(schema.title, { maxLength: 120 });
  }
  if (typeof schema.description === 'string' && schema.description.trim()) {
    trimmed.description = normalizeInlineText(schema.description, { maxLength: 240 });
  }
  if (Array.isArray(schema.enum) && schema.enum.length) {
    trimmed.enum = schema.enum
      .slice(0, MAX_SCHEMA_ENUM_VALUES)
      .map((entry) =>
        typeof entry === 'string' ? normalizeInlineText(entry, { maxLength: 80 }) : entry
      );
  }
  if (Array.isArray(schema.required) && schema.required.length) {
    trimmed.required = schema.required
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(Boolean)
      .slice(0, MAX_SCHEMA_PROPERTIES);
  }
  if (typeof schema.additionalProperties === 'boolean') {
    trimmed.additionalProperties = schema.additionalProperties;
  }
  if (schema.type === 'array' && schema.items && depth < MAX_SCHEMA_DEPTH) {
    trimmed.items = trimJsonSchema(schema.items, depth + 1);
  }
  if (
    schema.properties &&
    typeof schema.properties === 'object' &&
    !Array.isArray(schema.properties) &&
    depth < MAX_SCHEMA_DEPTH
  ) {
    const entries = Object.entries(schema.properties).slice(0, MAX_SCHEMA_PROPERTIES);
    if (entries.length) {
      trimmed.properties = Object.fromEntries(
        entries.map(([key, value]) => [key, trimJsonSchema(value, depth + 1)])
      );
    }
  }
  if (!Object.keys(trimmed).length) {
    return null;
  }
  return trimmed;
}

export function summarizeMcpInputSchema(inputSchema) {
  const schema = trimJsonSchema(inputSchema);
  if (!schema) {
    return 'No documented inputs.';
  }
  if (schema.type === 'object') {
    const properties =
      schema.properties &&
      typeof schema.properties === 'object' &&
      !Array.isArray(schema.properties)
        ? Object.entries(schema.properties)
        : [];
    const required = Array.isArray(schema.required) ? schema.required : [];
    if (!properties.length) {
      return required.length ? `Required: ${required.join(', ')}.` : 'No documented inputs.';
    }
    const propertySummary = properties
      .map(([name, value]) => {
        const propertyType =
          value && typeof value === 'object' && typeof value.type === 'string'
            ? value.type
            : 'value';
        return `${name} (${propertyType})`;
      })
      .join(', ');
    if (required.length) {
      return `Required: ${required.join(', ')}. Fields: ${propertySummary}.`;
    }
    return `Fields: ${propertySummary}.`;
  }
  if (schema.type === 'array') {
    return 'Accepts an array value.';
  }
  if (typeof schema.type === 'string') {
    return `Accepts a ${schema.type} value.`;
  }
  return 'Uses a documented input schema.';
}

function normalizeCommandRecord(command, { enabled = false } = {}) {
  const name = typeof command?.name === 'string' ? command.name.trim() : '';
  if (!name) {
    return null;
  }
  return {
    name,
    displayName:
      typeof command?.displayName === 'string' && command.displayName.trim()
        ? normalizeInlineText(command.displayName, { maxLength: 120 })
        : typeof command?.title === 'string' && command.title.trim()
          ? normalizeInlineText(command.title, { maxLength: 120 })
          : name,
    description: normalizeInlineText(command?.description, { maxLength: 240 }),
    enabled: enabled === true,
    inputSchema: trimJsonSchema(command?.inputSchema),
  };
}

function buildServerDescription({ displayName = '', instructions = '', endpointUrl }) {
  const instructionSummary = normalizeInlineText(String(instructions || '').split(/\n+/)[0], {
    maxLength: 180,
  });
  if (instructionSummary) {
    return instructionSummary;
  }
  if (displayName && endpointUrl?.host) {
    return `MCP server at ${endpointUrl.host}.`;
  }
  if (endpointUrl?.host) {
    return `MCP server at ${endpointUrl.host}.`;
  }
  return 'MCP server.';
}

function normalizeServerRecord(server) {
  const identifier =
    typeof server?.identifier === 'string' && server.identifier.trim()
      ? slugifyIdentifier(server.identifier)
      : '';
  const endpoint = typeof server?.endpoint === 'string' ? server.endpoint.trim() : '';
  if (!identifier || !endpoint) {
    return null;
  }
  const commands = Array.isArray(server?.commands)
    ? server.commands
        .map((command) => normalizeCommandRecord(command, { enabled: command?.enabled === true }))
        .filter(Boolean)
    : [];
  return {
    identifier,
    endpoint,
    displayName:
      typeof server?.displayName === 'string' && server.displayName.trim()
        ? normalizeInlineText(server.displayName, { maxLength: 120 })
        : identifier,
    description: normalizeInlineText(server?.description, { maxLength: 240 }),
    protocolVersion: normalizeInlineText(server?.protocolVersion, { maxLength: 60 }),
    serverVersion: normalizeInlineText(server?.serverVersion, { maxLength: 60 }),
    instructions: normalizeMultilineText(server?.instructions, { maxLength: 1200 }),
    capabilities: normalizeCapabilityList(server?.capabilities),
    enabled: server?.enabled === true,
    commands,
  };
}

export function normalizeMcpServerConfigs(value) {
  return (Array.isArray(value) ? value : []).map(normalizeServerRecord).filter(Boolean);
}

export function getEnabledMcpServerConfigs(servers = []) {
  return normalizeMcpServerConfigs(servers).filter(
    (server) => server.enabled && server.commands.some((command) => command.enabled)
  );
}

export function findMcpServerConfig(
  servers = [],
  selector,
  { enabledOnly = false, requireEnabledCommands = false } = {}
) {
  const normalizedSelector = String(selector || '')
    .trim()
    .toLowerCase();
  if (!normalizedSelector) {
    return null;
  }
  return (
    normalizeMcpServerConfigs(servers).find((server) => {
      if (enabledOnly && !server.enabled) {
        return false;
      }
      if (requireEnabledCommands && !server.commands.some((command) => command.enabled)) {
        return false;
      }
      return (
        server.identifier.toLowerCase() === normalizedSelector ||
        server.displayName.toLowerCase() === normalizedSelector
      );
    }) || null
  );
}

export function findMcpServerCommand(server, commandName, { enabledOnly = false } = {}) {
  const normalizedCommandName = String(commandName || '')
    .trim()
    .toLowerCase();
  if (!normalizedCommandName || !server || !Array.isArray(server.commands)) {
    return null;
  }
  return (
    server.commands.find((command) => {
      if (enabledOnly && !command.enabled) {
        return false;
      }
      return command.name.toLowerCase() === normalizedCommandName;
    }) || null
  );
}

function normalizeInspectionResult(
  endpointUrl,
  initializeResult,
  commands,
  { preferredIdentifier = '', existingIdentifiers = [] } = {}
) {
  const serverInfo =
    initializeResult?.serverInfo && typeof initializeResult.serverInfo === 'object'
      ? initializeResult.serverInfo
      : {};
  const displayName =
    normalizeInlineText(serverInfo.name, { maxLength: 120 }) ||
    normalizeInlineText(endpointUrl.hostname, { maxLength: 120 }) ||
    'MCP server';
  const instructions = normalizeMultilineText(initializeResult?.instructions, { maxLength: 1200 });
  const identifier = preferredIdentifier
    ? slugifyIdentifier(preferredIdentifier)
    : buildUniqueMcpServerIdentifier(displayName, existingIdentifiers);
  return {
    identifier,
    endpoint: endpointUrl.toString(),
    displayName,
    description: buildServerDescription({
      displayName,
      instructions,
      endpointUrl,
    }),
    protocolVersion: normalizeInlineText(initializeResult?.protocolVersion, { maxLength: 60 }),
    serverVersion: normalizeInlineText(serverInfo.version, { maxLength: 60 }),
    instructions,
    capabilities: normalizeCapabilityList(initializeResult?.capabilities),
    enabled: false,
    commands: commands
      .map((command) => normalizeCommandRecord(command, { enabled: false }))
      .filter(Boolean),
  };
}

/**
 * @param {string} endpoint
 * @param {{fetchRef?: typeof fetch; preferredIdentifier?: string; existingIdentifiers?: string[]; onDebug?: ((message: string) => void) | null}} [options]
 */
export async function inspectMcpServerEndpoint(endpoint, options = {}) {
  const { fetchRef, preferredIdentifier = '', existingIdentifiers = [], onDebug } = options;
  const endpointUrl = assertSupportedMcpEndpoint(endpoint);
  const debugLogger = createPrefixedDebugLogger(onDebug, `MCP inspect ${endpointUrl.host}`);
  const client = new McpHttpClient(endpointUrl.toString(), {
    fetchRef,
    onDebug: debugLogger,
  });
  const initializeResult = await client.initialize();
  const commands = await client.listTools();
  const normalizedResult = normalizeInspectionResult(endpointUrl, initializeResult, commands, {
    preferredIdentifier,
    existingIdentifiers,
  });
  if (!normalizedResult.commands.length) {
    throw new Error('This MCP server did not expose any commands.');
  }
  return normalizedResult;
}

function normalizeToolContentItem(item) {
  if (!item || typeof item !== 'object') {
    return null;
  }
  const normalizedType = typeof item.type === 'string' ? item.type.trim() : '';
  if (normalizedType === 'text') {
    return {
      type: 'text',
      text: normalizeMultilineText(item.text, { maxLength: 16000 }),
    };
  }
  if (normalizedType) {
    const normalizedItem = { type: normalizedType };
    if (typeof item.mimeType === 'string' && item.mimeType.trim()) {
      normalizedItem.mimeType = item.mimeType.trim();
    }
    if (typeof item.text === 'string' && item.text.trim()) {
      normalizedItem.text = normalizeMultilineText(item.text, { maxLength: 8000 });
    }
    return normalizedItem;
  }
  return null;
}

/**
 * @param {any} server
 * @param {string} commandName
 * @param {Record<string, any>} [commandArguments]
 * @param {{fetchRef?: typeof fetch; onDebug?: ((message: string) => void) | null}} [options]
 */
export async function executeMcpServerCommand(
  server,
  commandName,
  commandArguments = {},
  options = {}
) {
  const { fetchRef, onDebug } = options;
  const normalizedServer = normalizeServerRecord(server);
  if (!normalizedServer) {
    throw new Error('MCP server configuration is invalid.');
  }
  const endpointUrl = assertSupportedMcpEndpoint(normalizedServer.endpoint);
  const normalizedCommandName = String(commandName || '').trim();
  const debugLogger = createPrefixedDebugLogger(
    onDebug,
    `MCP ${normalizedServer.identifier}${normalizedCommandName ? `/${normalizedCommandName}` : ''}`
  );
  const client = new McpHttpClient(endpointUrl.toString(), {
    fetchRef,
    onDebug: debugLogger,
  });
  const result = await client.callTool(
    normalizedCommandName,
    commandArguments &&
      typeof commandArguments === 'object' &&
      !Array.isArray(commandArguments)
      ? commandArguments
      : {}
  );
  const content = Array.isArray(result.content)
    ? result.content.map(normalizeToolContentItem).filter(Boolean)
    : [];
  const structuredContent =
    result.structuredContent && typeof result.structuredContent === 'object'
      ? result.structuredContent
      : null;
  return {
    content,
    ...(structuredContent ? { structuredContent } : {}),
    ...(result.isError === true ? { isError: true } : {}),
  };
}

export { MCP_AUTH_UNSUPPORTED_MESSAGE };
