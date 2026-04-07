import { executeWritePythonFileTool } from './python-tool.js';
import { buildShellToolResponseEnvelope, executeShellCommandTool } from './shell-command-tool.js';
import { executeWebLookupTool } from './web-tool.js';
import {
  executeMcpServerCommand,
  findMcpServerCommand,
  findMcpServerConfig,
  getEnabledMcpServerConfigs,
  summarizeMcpInputSchema,
} from './mcp-client.js';
import { findUsableSkillPackageByName, getUsableSkillPackages } from '../skills/skill-packages.js';

export const MCP_SERVER_COMMAND_LIST_TOOL = 'list_mcp_server_commands';
export const MCP_SERVER_COMMAND_CALL_TOOL = 'call_mcp_server_command';
export const READ_SKILL_TOOL = 'read_skill';

export const TOOL_DEFINITIONS = Object.freeze([
  {
    name: 'get_current_date_time',
    displayName: 'Get Date and Time',
    description: 'Returns the current local date and time, a UTC timestamp and timezone name.',
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
      "Returns the user's location label and coordinates, or a general location if permission unavailable.",
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
      'Manage a task list for multi-step work. Call with an empty arguments object to get tool syntax.',
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
  {
    name: 'web_lookup',
    displayName: 'Web Lookup',
    description: 'Interact with the web by calling {"input":"..."}.',
    enabled: true,
    parameters: {
      type: 'object',
      properties: {
        input: {
          type: 'string',
        },
      },
      required: ['input'],
      additionalProperties: false,
    },
  },
  {
    name: 'write_python_file',
    displayName: 'Write Python File',
    description: 'Writes Python source code to a .py file under /workspace.',
    enabled: true,
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
        },
        source: {
          type: 'string',
        },
      },
      required: ['path', 'source'],
      additionalProperties: false,
    },
  },
  {
    name: 'run_shell_command',
    displayName: 'Shell Command Runner',
    description:
      'Passes a shell command to an emulated Linux shell starting in /workspace. Call with an empty arguments object to get syntax and supported commands. Files are in /workspace.',
    enabled: true,
    parameters: {
      type: 'object',
      properties: {
        cmd: {
          type: 'string',
        },
      },
      additionalProperties: false,
    },
  },
]);

export const MCP_TOOL_DEFINITIONS = Object.freeze([
  {
    name: MCP_SERVER_COMMAND_LIST_TOOL,
    displayName: 'List MCP Server Commands',
    description: 'Lists the enabled commands for one configured MCP server.',
    parameters: {
      type: 'object',
      properties: {
        server: {
          type: 'string',
        },
      },
      required: ['server'],
      additionalProperties: false,
    },
  },
  {
    name: MCP_SERVER_COMMAND_CALL_TOOL,
    displayName: 'Call MCP Server Command',
    description: 'Calls one enabled command on one configured MCP server.',
    parameters: {
      type: 'object',
      properties: {
        server: {
          type: 'string',
        },
        command: {
          type: 'string',
        },
        arguments: {
          type: 'object',
        },
      },
      required: ['server', 'command'],
      additionalProperties: false,
    },
  },
]);

export const SKILL_TOOL_DEFINITIONS = Object.freeze([
  {
    name: READ_SKILL_TOOL,
    displayName: 'Read Skill',
    description: 'Returns the full SKILL.md markdown for one available uploaded skill.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
        },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
]);

const reverseGeocodeCache = new Map();
const WEB_LOOKUP_FAILURE_MESSAGE =
  'Use a direct https URL and retry with a simpler page if the request or extraction fails.';
const MCP_TOOL_BODY_FRACTION_OF_CONTEXT = 0.075;
const DEFAULT_MCP_TOOL_BODY_LENGTH = 500;

function collapseExtraNewlines(text) {
  return text.replace(/\r\n?/g, '\n').replace(/\n[\t \f\v]*\n+/g, '\n');
}

function trimToolBody(text, maxLength) {
  const normalizedText = collapseExtraNewlines(
    typeof text === 'string' ? text : String(text ?? '')
  );
  if (!Number.isFinite(maxLength) || maxLength <= 0 || normalizedText.length <= maxLength) {
    return {
      text: normalizedText,
      trimmed: false,
    };
  }
  return {
    text: normalizedText.slice(0, maxLength),
    trimmed: true,
  };
}

function getMcpToolBodyLimit(runtimeContext = {}) {
  const configuredContextSize = Number(runtimeContext?.generationConfig?.maxContextTokens);
  if (!Number.isFinite(configuredContextSize) || configuredContextSize <= 0) {
    return DEFAULT_MCP_TOOL_BODY_LENGTH;
  }
  return Math.max(1, Math.floor(configuredContextSize * MCP_TOOL_BODY_FRACTION_OF_CONTEXT));
}

function buildMcpToolTruncationMessage(maxLength) {
  return `This response was too long, so it was trimmed to ${maxLength} characters. Feel free to make another request if necessary.`;
}

function serializeMcpCommandCallResult(result, runtimeContext = {}) {
  const normalizedResult = result && typeof result === 'object' ? result : {};
  const maxLength = getMcpToolBodyLimit(runtimeContext);
  const trimmedBody = trimToolBody(normalizedResult.body, maxLength);
  return JSON.stringify({
    status: normalizedResult.status === 'failed' ? 'failed' : 'success',
    server:
      typeof normalizedResult.server === 'string' && normalizedResult.server.trim()
        ? normalizedResult.server.trim()
        : undefined,
    command:
      typeof normalizedResult.command === 'string' && normalizedResult.command.trim()
        ? normalizedResult.command.trim()
        : undefined,
    body: trimmedBody.text,
    ...(trimmedBody.trimmed ? { message: buildMcpToolTruncationMessage(maxLength) } : {}),
  });
}

/**
 * @param {unknown} error
 * @param {{message?: string}} [options]
 */
function buildFailedToolEnvelope(error, options = {}) {
  const message = typeof options.message === 'string' ? options.message : '';
  const body = error instanceof Error ? error.message : String(error);
  return JSON.stringify({
    status: 'failed',
    body,
    ...(message.trim() ? { message: message.trim() } : {}),
  });
}

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

export function getToolDefinitionByName(toolName) {
  const normalizedName = typeof toolName === 'string' ? toolName.trim() : '';
  if (!normalizedName) {
    return null;
  }
  return (
    TOOL_DEFINITIONS.find((tool) => tool?.name === normalizedName) ||
    MCP_TOOL_DEFINITIONS.find((tool) => tool?.name === normalizedName) ||
    SKILL_TOOL_DEFINITIONS.find((tool) => tool?.name === normalizedName) ||
    null
  );
}

export function getToolDisplayName(toolName) {
  const displayName = getToolDefinitionByName(toolName)?.displayName;
  return typeof displayName === 'string' && displayName.trim()
    ? displayName.trim()
    : humanizeToolName(toolName);
}

function normalizeRequestedToolNames(requestedToolNames = []) {
  return Array.isArray(requestedToolNames)
    ? requestedToolNames
        .map((toolName) => (typeof toolName === 'string' ? toolName.trim() : ''))
        .filter(Boolean)
    : [];
}

export function getAvailableToolDefinitions() {
  return TOOL_DEFINITIONS.filter((tool) => tool?.enabled === true);
}

export function getEnabledToolDefinitions(requestedToolNames = null) {
  const availableTools = getAvailableToolDefinitions();
  if (!Array.isArray(requestedToolNames)) {
    return availableTools;
  }
  const enabledToolNameSet = new Set(normalizeRequestedToolNames(requestedToolNames));
  return availableTools.filter((tool) => enabledToolNameSet.has(tool.name));
}

export function getEnabledToolNames(requestedToolNames = null) {
  return getEnabledToolDefinitions(requestedToolNames)
    .map((tool) => (typeof tool.name === 'string' ? tool.name.trim() : ''))
    .filter(Boolean);
}

export function getImplicitlyEnabledToolNames(configuredMcpServers = [], skillPackages = []) {
  return [
    ...(getEnabledMcpServerConfigs(configuredMcpServers).length
      ? MCP_TOOL_DEFINITIONS.map((tool) => tool.name)
      : []),
    ...(getUsableSkillPackages(skillPackages).length
      ? SKILL_TOOL_DEFINITIONS.map((tool) => tool.name)
      : []),
  ];
}

export function getImplicitlyEnabledToolDefinitions(configuredMcpServers = [], skillPackages = []) {
  return [
    ...(getEnabledMcpServerConfigs(configuredMcpServers).length ? [...MCP_TOOL_DEFINITIONS] : []),
    ...(getUsableSkillPackages(skillPackages).length ? [...SKILL_TOOL_DEFINITIONS] : []),
  ];
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
  const nameKey =
    typeof toolCallingConfig.nameKey === 'string' ? toolCallingConfig.nameKey : 'name';
  const argumentsKey =
    typeof toolCallingConfig.argumentsKey === 'string'
      ? toolCallingConfig.argumentsKey
      : 'arguments';
  if (toolCallingConfig.format === 'json') {
    return [
      'When you call a tool, output exactly one JSON object and nothing else.',
      `Shape: {"${nameKey}":"<tool-name>","${argumentsKey}":{...}}.`,
      `The "${argumentsKey}" value must always be a JSON object.`,
      `Use an empty "${argumentsKey}" object (${JSON.stringify({ [argumentsKey]: {} })}) only when the tool takes no inputs or when the tool description explicitly says that an empty "${argumentsKey}" object returns usage help.`,
    ];
  }
  if (toolCallingConfig.format === 'tagged-json') {
    return [
      'When you call a tool, output exactly one tagged tool-call block and nothing else.',
      `Wrap the JSON object in ${toolCallingConfig.openTag} and ${toolCallingConfig.closeTag}.`,
      `Shape inside the tags: {"${nameKey}":"<tool-name>","${argumentsKey}":{...}}.`,
      `The "${argumentsKey}" value must always be a JSON object.`,
      `Use an empty "${argumentsKey}" object (${JSON.stringify({ [argumentsKey]: {} })}) only when the tool takes no inputs or when the tool description explicitly says that an empty "${argumentsKey}" object returns usage help.`,
    ];
  }
  if (toolCallingConfig.format === 'special-token-call') {
    return [
      'When you call a tool, start the assistant reply with exactly one wrapped function-style tool call.',
      `Wrap the call in ${toolCallingConfig.callOpen} and ${toolCallingConfig.callClose}.`,
      'Inside the wrapper, write one Python-style call such as tool_name(arg1="value1", arg2="value2").',
      'After the wrapped tool call, you may include a brief plain-text sentence if helpful.',
    ];
  }
  if (toolCallingConfig.format === 'xml-tool-call') {
    return [
      'When you call a tool, output exactly one XML tool-call block and nothing else.',
      'Wrap the call in <tool_call>...</tool_call>.',
      'Inside it, use one nested <function=tool_name>...</function> block.',
      'Represent each argument as its own <parameter=argument_name>value</parameter> block.',
    ];
  }
  if (toolCallingConfig.format === 'gemma-special-token-call') {
    return [
      'When you call a tool, output exactly one Gemma-style tool-call block and nothing else.',
      'Wrap the call in <|tool_call> and <tool_call|>.',
      'Shape inside the wrapper: call:tool_name{arg1:<|"|>value1<|"|>, arg2:2}.',
      'Use <|"|>...<|"|> around string values.',
    ];
  }
  return [];
}

function buildEnabledToolInstructions(enabledTools = []) {
  if (!Array.isArray(enabledTools) || !enabledTools.length) {
    return [];
  }
  return enabledTools.flatMap((tool) =>
    buildToolInstructionLines(
      typeof tool?.name === 'string' ? tool.name.trim() : 'unknown_tool',
      typeof tool?.description === 'string' && tool.description.trim()
        ? tool.description.trim()
        : 'No description provided.'
    )
  );
}

function buildMcpServerInventoryLines(enabledMcpServers = []) {
  if (!Array.isArray(enabledMcpServers) || !enabledMcpServers.length) {
    return [];
  }
  return [
    '**Available MCP servers:**',
    'Use call_mcp_server_command with a server identifier and one of that server\'s enabled command names.',
    ...enabledMcpServers.map((server) => {
      const identifier =
        typeof server?.identifier === 'string' && server.identifier.trim()
          ? server.identifier.trim()
          : 'mcp-server';
      const description =
        typeof server?.description === 'string' && server.description.trim()
          ? `: ${server.description.trim()}`
          : '';
      const enabledCommands = Array.isArray(server?.commands)
        ? server.commands
            .filter((command) => command?.enabled)
            .map((command) => command?.name)
            .filter((commandName) => typeof commandName === 'string' && commandName.trim())
        : [];
      const commandSummary = enabledCommands.length
        ? ` Enabled commands: ${enabledCommands.join(', ')}.`
        : ' Enabled commands: none.';
      return `- ${identifier}${description}${commandSummary}`;
    }),
  ];
}

function buildAvailableSkillLines(skillPackages = []) {
  const availableSkills = getUsableSkillPackages(skillPackages);
  if (!availableSkills.length) {
    return [];
  }
  return [
    '**Available Agent Skills:**',
    ...availableSkills.map((skillPackage) => {
      const description =
        typeof skillPackage?.description === 'string' && skillPackage.description.trim()
          ? `: ${skillPackage.description.trim()}`
          : '';
      return `- ${skillPackage.name}${description}`;
    }),
  ];
}

function stringifyToolCallArgumentValue(value) {
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

function buildExampleToolCallText(toolCallingConfig, toolName, argumentsValue = {}) {
  if (!toolCallingConfig || typeof toolCallingConfig !== 'object') {
    return '';
  }
  if (toolCallingConfig.format === 'json') {
    const nameKey = toolCallingConfig.nameKey || 'name';
    const argumentsKey = toolCallingConfig.argumentsKey || 'arguments';
    return JSON.stringify({
      [nameKey]: toolName,
      [argumentsKey]: argumentsValue,
    });
  }
  if (toolCallingConfig.format === 'tagged-json') {
    const nameKey = toolCallingConfig.nameKey || 'name';
    const argumentsKey = toolCallingConfig.argumentsKey || 'arguments';
    const payload = JSON.stringify({
      [nameKey]: toolName,
      [argumentsKey]: argumentsValue,
    });
    return `${toolCallingConfig.openTag}${payload}${toolCallingConfig.closeTag}`;
  }
  if (toolCallingConfig.format === 'special-token-call') {
    const serializedArguments = Object.entries(argumentsValue)
      .map(([key, value]) => `${key}=${stringifyToolCallArgumentValue(value)}`)
      .join(', ');
    return `${toolCallingConfig.callOpen}${toolName}(${serializedArguments})${toolCallingConfig.callClose}`;
  }
  if (toolCallingConfig.format === 'xml-tool-call') {
    const parameterLines = Object.entries(argumentsValue).map(
      ([key, value]) => `  <parameter=${key}>${JSON.stringify(value)}</parameter>`
    );
    return [
      '<tool_call>',
      `  <function=${toolName}>`,
      ...parameterLines,
      '  </function>',
      '</tool_call>',
    ].join('\n');
  }
  if (toolCallingConfig.format === 'gemma-special-token-call') {
    const serializedArguments = Object.entries(argumentsValue)
      .map(([key, value]) => `${key}:${typeof value === 'string' ? `<|"|>${value}<|"|>` : stringifyToolCallArgumentValue(value)}`)
      .join(', ');
    return `<|tool_call>call:${toolName}{${serializedArguments}}<tool_call|>`;
  }
  return '';
}

function buildMcpServerExampleLines(toolCallingConfig, enabledMcpServers = []) {
  if (!Array.isArray(enabledMcpServers) || !enabledMcpServers.length) {
    return [];
  }
  const listExample = buildExampleToolCallText(toolCallingConfig, MCP_SERVER_COMMAND_LIST_TOOL, {
    server: 'demo_mcp_server',
  });
  const callExample = buildExampleToolCallText(toolCallingConfig, MCP_SERVER_COMMAND_CALL_TOOL, {
    server: 'demo_mcp_server',
    command: 'get_status',
  });
  if (!listExample || !callExample) {
    return [];
  }
  return [
    '**Example MCP Server Tool Calls:**',
    'These examples use a fake server and fake command names. Replace them with enabled values from this conversation.',
    'Example: inspect one MCP server',
    '```text',
    listExample,
    '```',
    'Example: call one MCP command',
    '```text',
    callExample,
    '```',
  ];
}

function buildToolInstructionLines(name, description = '') {
  const normalizedName = typeof name === 'string' && name.trim() ? name.trim() : 'unknown_tool';
  const normalizedDescription =
    typeof description === 'string' && description.trim() ? `: ${description.trim()}` : '';
  const lines = [`- ${normalizedName}${normalizedDescription}`];
  getToolInstructionNotes(normalizedName).forEach((note) => {
    lines.push(note.bulleted ? `  - ${note.text}` : `  ${note.text}`);
  });
  return lines;
}

function getToolInstructionNotes(name) {
  const normalizedName = typeof name === 'string' && name.trim() ? name.trim() : 'unknown_tool';
  const notes = [];
  if (normalizedName === 'get_user_location') {
    notes.push({
      text: 'Use the returned location and coordinate directly in the answer.',
      bulleted: false,
    });
  }
  if (normalizedName === 'tasklist') {
    notes.push({
      text: 'Call with an empty arguments object to get tool syntax.',
      bulleted: true,
    });
  }
  if (normalizedName === 'write_python_file') {
    notes.push({
      text: 'Use this for longer Python scripts.',
      bulleted: false,
    });
    notes.push({
      text: 'Call with {"path":"/workspace/script.py","source":"print(\\"hello\\")\\n"}.',
      bulleted: false,
    });
  }
  if (normalizedName === 'web_lookup') {
    notes.push({
      text: 'When input is a URL, fetch a page preview',
      bulleted: true,
    });
    notes.push({
      text: 'When input is search terms, DuckDuckgo is used to return search results.',
      bulleted: true,
    });
  }
  if (normalizedName === 'run_shell_command') {
    notes.push({
      text: 'Call with an empty arguments object to get syntax and supported commands.',
      bulleted: true,
    });
    notes.push({
      text: 'The shell includes python.',
      bulleted: true,
    });
    notes.push({
      text: 'Prefer write_python_file for larger scripts.',
      bulleted: true,
    });
  }
  if (normalizedName === READ_SKILL_TOOL) {
    notes.push({
      text: 'Use this when one of the listed agent skills would help.',
      bulleted: true,
    });
    notes.push({
      text: 'Call with {"name":"Skill Name"}. The response body is the SKILL.md markdown.',
      bulleted: true,
    });
  }
  if (normalizedName === MCP_SERVER_COMMAND_LIST_TOOL) {
    notes.push({
      text: 'Use this first when you need to inspect one enabled MCP server.',
      bulleted: true,
    });
    notes.push({
      text: 'Call with {"server":"server_identifier"}.',
      bulleted: true,
    });
  }
  if (normalizedName === MCP_SERVER_COMMAND_CALL_TOOL) {
    notes.push({
      text: 'Use this after discovery to call one enabled MCP command.',
      bulleted: true,
    });
    notes.push({
      text: 'Call with {"server":"server_identifier","command":"command_name","arguments":{...}}.',
      bulleted: true,
    });
  }
  return notes;
}

function buildToolPromptDescription(name, description = '') {
  const baseDescription = typeof description === 'string' ? description.trim() : '';
  const notes = getToolInstructionNotes(name).map((note) => note.text);
  return [baseDescription, ...notes].filter(Boolean).join(' ');
}

function buildResolvedToolDefinitions(toolList = [], enabledTools = []) {
  const providedToolDefinitions = new Map();
  (Array.isArray(enabledTools) ? enabledTools : []).forEach((tool) => {
    const normalizedName = typeof tool?.name === 'string' ? tool.name.trim() : '';
    if (normalizedName) {
      providedToolDefinitions.set(normalizedName, tool);
    }
  });
  return (Array.isArray(toolList) ? toolList : [])
    .map((toolName) => {
      const normalizedName = typeof toolName === 'string' ? toolName.trim() : '';
      if (!normalizedName) {
        return null;
      }
      return providedToolDefinitions.get(normalizedName) || getToolDefinitionByName(normalizedName);
    })
    .filter(Boolean);
}

function buildJsonToolListLines(
  resolvedToolDefinitions = [],
  enabledMcpServers = [],
  toolCallingConfig = {},
  availableSkills = []
) {
  if (!Array.isArray(resolvedToolDefinitions) || !resolvedToolDefinitions.length) {
    return [];
  }
  const serializedTools = resolvedToolDefinitions.map((tool) => {
    const name = typeof tool?.name === 'string' ? tool.name.trim() : 'unknown_tool';
    const description = buildToolPromptDescription(name, tool?.description);
    const parameters =
      tool?.parameters && typeof tool.parameters === 'object' && !Array.isArray(tool.parameters)
        ? tool.parameters
        : {
            type: 'object',
            properties: {},
            additionalProperties: false,
          };
    return {
      name,
      ...(description ? { description } : {}),
      parameters,
    };
  });
  const lines = [`List of tools: ${JSON.stringify(serializedTools)}`];
  if (Array.isArray(availableSkills) && availableSkills.length) {
    lines.push('');
    lines.push(...buildAvailableSkillLines(availableSkills));
  }
  if (Array.isArray(enabledMcpServers) && enabledMcpServers.length) {
    lines.push('');
    lines.push(...buildMcpServerInventoryLines(enabledMcpServers));
    lines.push('');
    lines.push(...buildMcpServerExampleLines(toolCallingConfig, enabledMcpServers));
  }
  return lines;
}

export function buildToolCallingSystemPrompt(
  toolCallingConfig,
  enabledToolNames = [],
  enabledTools = [],
  { skills = [], mcpServers = [] } = {}
) {
  const enabledMcpServers = getEnabledMcpServerConfigs(mcpServers);
  const availableSkills = getUsableSkillPackages(skills);
  const toolList = getNormalizedToolList(enabledToolNames).filter(
    (toolName) => toolName !== 'none'
  );
  if (!toolList.length) {
    return '';
  }
  const resolvedToolDefinitions = buildResolvedToolDefinitions(toolList, enabledTools);
  const toolListFormat = toolCallingConfig?.toolListFormat === 'json' ? 'json' : 'markdown';
  const toolLines =
    toolListFormat === 'json'
      ? buildJsonToolListLines(
          resolvedToolDefinitions,
          enabledMcpServers,
          toolCallingConfig,
          availableSkills
        )
      : [
          '**Tools available in this conversation:**\nThese are the tools you can call.',
          ...buildEnabledToolInstructions(resolvedToolDefinitions),
          ...(availableSkills.length ? ['', ...buildAvailableSkillLines(availableSkills)] : []),
          ...(enabledMcpServers.length ? ['', ...buildMcpServerInventoryLines(enabledMcpServers)] : []),
          ...(enabledMcpServers.length
            ? ['', ...buildMcpServerExampleLines(toolCallingConfig, enabledMcpServers)]
            : []),
        ];
  const toolBehaviorLines = ['After a tool result, continue the work and answer naturally.'].filter(
    Boolean
  );
  const formatLines = buildToolCallingFormatInstructions(toolCallingConfig);
  return [
    ...toolLines,
    toolBehaviorLines.length ? '' : null,
    toolBehaviorLines.length ? '**Tool behavior:**' : null,
    ...toolBehaviorLines.map((line) => `- ${line}`),
    formatLines.length ? '' : null,
    formatLines.length ? '**Tool call format:**' : null,
    ...formatLines.map((line) => `- ${line}`),
  ]
    .filter((line) => line !== null)
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

function parseLooseStructuredValue(rawValue) {
  const text = String(rawValue ?? '').trim();
  if (!text) {
    return '';
  }
  if (
    (text.startsWith('{') && text.endsWith('}')) ||
    (text.startsWith('[') && text.endsWith(']')) ||
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    try {
      return JSON.parse(text);
    } catch {
      // fall through to scalar parsing
    }
  }
  if (text === 'true') {
    return true;
  }
  if (text === 'false') {
    return false;
  }
  if (text === 'null') {
    return null;
  }
  if (/^-?(?:\d+|\d*\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) {
    const numericValue = Number(text);
    if (Number.isFinite(numericValue)) {
      return numericValue;
    }
  }
  return text;
}

function detectXmlToolCall(rawText, toolCallingConfig) {
  const trimmed = String(rawText || '').trim();
  const detectedCalls = [];
  let searchIndex = 0;
  const openTag = '<tool_call>';
  const closeTag = '</tool_call>';
  while (searchIndex < trimmed.length) {
    const openIndex = trimmed.indexOf(openTag, searchIndex);
    if (openIndex < 0) {
      break;
    }
    const closeIndex = trimmed.indexOf(closeTag, openIndex + openTag.length);
    if (closeIndex < 0) {
      break;
    }
    const segmentText = trimmed.slice(openIndex, closeIndex + closeTag.length);
    const innerText = trimmed.slice(openIndex + openTag.length, closeIndex).trim();
    const functionMatch = innerText.match(
      /^<function=([a-zA-Z_][a-zA-Z0-9_-]*)>\s*([\s\S]*?)\s*<\/function>$/
    );
    if (functionMatch) {
      const [, toolName, parameterText] = functionMatch;
      const argumentsObject = {};
      const parameterPattern =
        /<parameter=([a-zA-Z_][a-zA-Z0-9_-]*)>\s*([\s\S]*?)\s*<\/parameter>/g;
      let parameterMatch;
      while ((parameterMatch = parameterPattern.exec(parameterText))) {
        argumentsObject[parameterMatch[1]] = parseLooseStructuredValue(parameterMatch[2]);
      }
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
    searchIndex = closeIndex + closeTag.length;
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

function skipGemmaWhitespace(text, index) {
  let cursor = index;
  while (cursor < text.length && /\s/.test(text[cursor])) {
    cursor += 1;
  }
  return cursor;
}

function parseGemmaQuotedString(text, index) {
  if (text.startsWith('<|"|>', index)) {
    const closingIndex = text.indexOf('<|"|>', index + 5);
    if (closingIndex < 0) {
      throw new Error('Unterminated Gemma quoted string.');
    }
    return {
      value: text.slice(index + 5, closingIndex),
      index: closingIndex + 5,
    };
  }
  const quote = text[index];
  if (quote !== '"' && quote !== "'") {
    throw new Error('Expected quoted string.');
  }
  let cursor = index + 1;
  let value = '';
  let escaped = false;
  while (cursor < text.length) {
    const character = text[cursor];
    if (escaped) {
      value += character;
      escaped = false;
      cursor += 1;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      cursor += 1;
      continue;
    }
    if (character === quote) {
      return {
        value,
        index: cursor + 1,
      };
    }
    value += character;
    cursor += 1;
  }
  throw new Error('Unterminated quoted string.');
}

function parseGemmaBareToken(text, index) {
  let cursor = index;
  while (cursor < text.length && !/[,\]}]/.test(text[cursor])) {
    cursor += 1;
  }
  const token = text.slice(index, cursor).trim();
  if (!token) {
    throw new Error('Expected token value.');
  }
  return {
    value: parseLooseStructuredValue(token),
    index: cursor,
  };
}

function parseGemmaKey(text, index) {
  const cursor = skipGemmaWhitespace(text, index);
  if (text.startsWith('<|"|>', cursor) || text[cursor] === '"' || text[cursor] === "'") {
    return parseGemmaQuotedString(text, cursor);
  }
  const match = text.slice(cursor).match(/^[A-Za-z_][A-Za-z0-9_.-]*/);
  if (!match) {
    throw new Error('Expected object key.');
  }
  return {
    value: match[0],
    index: cursor + match[0].length,
  };
}

function parseGemmaArray(text, index) {
  let cursor = skipGemmaWhitespace(text, index);
  if (text[cursor] !== '[') {
    throw new Error('Expected array.');
  }
  cursor += 1;
  const values = [];
  while (cursor < text.length) {
    cursor = skipGemmaWhitespace(text, cursor);
    if (text[cursor] === ']') {
      return {
        value: values,
        index: cursor + 1,
      };
    }
    const parsedValue = parseGemmaValue(text, cursor);
    values.push(parsedValue.value);
    cursor = skipGemmaWhitespace(text, parsedValue.index);
    if (text[cursor] === ',') {
      cursor += 1;
      continue;
    }
    if (text[cursor] === ']') {
      return {
        value: values,
        index: cursor + 1,
      };
    }
    throw new Error('Expected , or ] in array.');
  }
  throw new Error('Unterminated array.');
}

function parseGemmaObject(text, index) {
  let cursor = skipGemmaWhitespace(text, index);
  if (text[cursor] !== '{') {
    throw new Error('Expected object.');
  }
  cursor += 1;
  const result = {};
  while (cursor < text.length) {
    cursor = skipGemmaWhitespace(text, cursor);
    if (text[cursor] === '}') {
      return {
        value: result,
        index: cursor + 1,
      };
    }
    const parsedKey = parseGemmaKey(text, cursor);
    cursor = skipGemmaWhitespace(text, parsedKey.index);
    if (text[cursor] !== ':') {
      throw new Error('Expected : after object key.');
    }
    const parsedValue = parseGemmaValue(text, cursor + 1);
    result[parsedKey.value] = parsedValue.value;
    cursor = skipGemmaWhitespace(text, parsedValue.index);
    if (text[cursor] === ',') {
      cursor += 1;
      continue;
    }
    if (text[cursor] === '}') {
      return {
        value: result,
        index: cursor + 1,
      };
    }
    throw new Error('Expected , or } in object.');
  }
  throw new Error('Unterminated object.');
}

function parseGemmaValue(text, index) {
  const cursor = skipGemmaWhitespace(text, index);
  if (text.startsWith('<|"|>', cursor) || text[cursor] === '"' || text[cursor] === "'") {
    return parseGemmaQuotedString(text, cursor);
  }
  if (text[cursor] === '{') {
    return parseGemmaObject(text, cursor);
  }
  if (text[cursor] === '[') {
    return parseGemmaArray(text, cursor);
  }
  return parseGemmaBareToken(text, cursor);
}

function parseGemmaCallSegment(segmentText, toolCallingConfig) {
  const innerText = String(segmentText || '').trim();
  if (!innerText.startsWith('call:')) {
    return null;
  }
  const braceIndex = innerText.indexOf('{', 5);
  if (braceIndex <= 5) {
    return null;
  }
  const toolName = innerText.slice(5, braceIndex).trim();
  try {
    const parsedArguments = parseGemmaObject(innerText, braceIndex);
    const consumedText = innerText.slice(0, parsedArguments.index);
    return normalizeDetectedToolCall(
      toolName,
      parsedArguments.value,
      consumedText,
      toolCallingConfig.format
    );
  } catch {
    return null;
  }
}

function detectGemmaSpecialTokenCall(rawText, toolCallingConfig) {
  const trimmed = String(rawText || '').trim();
  const detectedCalls = [];
  let searchIndex = 0;
  const openTag = '<|tool_call>';
  const closeTag = '<tool_call|>';

  const leadingBareCall = parseGemmaCallSegment(trimmed, toolCallingConfig);
  if (leadingBareCall) {
    detectedCalls.push(leadingBareCall);
  }

  while (searchIndex < trimmed.length) {
    const openIndex = trimmed.indexOf(openTag, searchIndex);
    if (openIndex < 0) {
      break;
    }
    const closeIndex = trimmed.indexOf(closeTag, openIndex + openTag.length);
    if (closeIndex < 0) {
      break;
    }
    const segmentText = trimmed.slice(openIndex, closeIndex + closeTag.length);
    const innerText = trimmed.slice(openIndex + openTag.length, closeIndex).trim();
    const detected = parseGemmaCallSegment(innerText, toolCallingConfig);
    if (detected) {
      detected.rawText = segmentText;
      detectedCalls.push(detected);
    }
    searchIndex = closeIndex + closeTag.length;
  }
  return detectedCalls;
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
  if (toolCallingConfig.format === 'xml-tool-call') {
    return detectXmlToolCall(rawText, toolCallingConfig);
  }
  if (toolCallingConfig.format === 'gemma-special-token-call') {
    return detectGemmaSpecialTokenCall(rawText, toolCallingConfig);
  }
  return [];
}

function executeGetCurrentDateTime(argumentsValue = {}) {
  if (
    argumentsValue &&
    typeof argumentsValue === 'object' &&
    Object.keys(argumentsValue).length > 0
  ) {
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
      'Tasklist syntax reference. Use the normal tool-call wrapper for this model, then pass one of these arguments objects:',
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

function getConversationPathMessages(
  conversation,
  leafMessageId = conversation?.activeLeafMessageId
) {
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
  const normalizedText = withoutControlCharacters.replace(/\s+/g, ' ').trim();
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
    /^<\|tool_call_start\|>[\s\S]*<\|tool_call_end\|>$/i.test(normalizedText) ||
    /^<\|tool_call>[\s\S]*<tool_call\|>$/i.test(normalizedText)
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
  const taskListArguments =
    /** @type {{command?: unknown; item?: unknown; index?: unknown; status?: unknown}} */ (
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
    if (
      typeof indexCandidate !== 'number' ||
      !Number.isInteger(indexCandidate) ||
      indexCandidate < 0
    ) {
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
    (value, index, values) =>
      typeof value === 'string' && value.trim() && values.indexOf(value) === index
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
  const fetchRef =
    runtimeContext.fetchRef || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
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
      countryCode:
        typeof address.country_code === 'string' ? address.country_code.toUpperCase() : null,
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
  const regionCode =
    localeParts.length > 1 ? localeParts[localeParts.length - 1].toUpperCase() : null;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const timeZoneParts = String(timeZone).split('/');
  const timeZoneArea =
    timeZoneParts.length > 1 ? timeZoneParts[timeZoneParts.length - 1] : timeZoneParts[0];
  const approximateArea = timeZoneArea ? timeZoneArea.replace(/_/g, ' ') : 'Unknown area';
  return regionCode ? `${approximateArea}, ${regionCode}` : approximateArea;
}

async function requestSensitiveToolConsent(toolName, runtimeContext = {}, details = {}) {
  if (typeof runtimeContext.requestToolConsent !== 'function') {
    return true;
  }
  const result = await runtimeContext.requestToolConsent({
    toolName,
    ...details,
  });
  return result !== false;
}

async function executeGetUserLocation(argumentsValue = {}, runtimeContext = {}) {
  const { timeoutMs } = getValidatedLocationArguments(argumentsValue);
  const navigatorRef =
    runtimeContext.navigatorRef ||
    (typeof navigator !== 'undefined' && navigator ? navigator : null);
  const hasPreciseLocationConsent = await requestSensitiveToolConsent(
    'get_user_location',
    runtimeContext,
    {
      scope: 'precise-location',
      title: 'Allow precise location tool use?',
      reason:
        'The location tool can access precise browser location, may use that location in later tool calls, and may send coordinates to OpenStreetMap for reverse geocoding.',
    }
  );
  if (!hasPreciseLocationConsent) {
    return {
      location: buildApproximateLocationLabel(navigatorRef),
      coordinate: null,
    };
  }
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
      typeof resolvedLocation?.formattedLocation === 'string' &&
      resolvedLocation.formattedLocation.trim()
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

function getValidatedMcpServerListArguments(argumentsValue = {}) {
  if (!argumentsValue || typeof argumentsValue !== 'object' || Array.isArray(argumentsValue)) {
    throw new Error(`${MCP_SERVER_COMMAND_LIST_TOOL} arguments must be an object.`);
  }
  const listArguments = /** @type {{server?: unknown}} */ (argumentsValue);
  const supportedKeys = new Set(['server']);
  const unexpectedKeys = Object.keys(argumentsValue).filter((key) => !supportedKeys.has(key));
  if (unexpectedKeys.length) {
    throw new Error(
      `${MCP_SERVER_COMMAND_LIST_TOOL} does not accept: ${unexpectedKeys.join(', ')}.`
    );
  }
  const serverName = typeof listArguments.server === 'string' ? listArguments.server.trim() : '';
  if (!serverName) {
    throw new Error(`${MCP_SERVER_COMMAND_LIST_TOOL} requires server.`);
  }
  return {
    server: serverName,
  };
}

function getValidatedMcpServerCallArguments(argumentsValue = {}) {
  if (!argumentsValue || typeof argumentsValue !== 'object' || Array.isArray(argumentsValue)) {
    throw new Error(`${MCP_SERVER_COMMAND_CALL_TOOL} arguments must be an object.`);
  }
  const callArguments = /** @type {{server?: unknown; command?: unknown; arguments?: unknown}} */ (
    argumentsValue
  );
  const supportedKeys = new Set(['server', 'command', 'arguments']);
  const unexpectedKeys = Object.keys(argumentsValue).filter((key) => !supportedKeys.has(key));
  if (unexpectedKeys.length) {
    throw new Error(
      `${MCP_SERVER_COMMAND_CALL_TOOL} does not accept: ${unexpectedKeys.join(', ')}.`
    );
  }
  const serverName = typeof callArguments.server === 'string' ? callArguments.server.trim() : '';
  if (!serverName) {
    throw new Error(`${MCP_SERVER_COMMAND_CALL_TOOL} requires server.`);
  }
  const commandName = typeof callArguments.command === 'string' ? callArguments.command.trim() : '';
  if (!commandName) {
    throw new Error(`${MCP_SERVER_COMMAND_CALL_TOOL} requires command.`);
  }
  const commandArguments =
    callArguments.arguments &&
    typeof callArguments.arguments === 'object' &&
    !Array.isArray(callArguments.arguments)
      ? callArguments.arguments
      : callArguments.arguments === undefined
        ? {}
        : null;
  if (commandArguments === null) {
    throw new Error(`${MCP_SERVER_COMMAND_CALL_TOOL} arguments must be an object when provided.`);
  }
  return {
    server: serverName,
    command: commandName,
    arguments: commandArguments,
  };
}

function buildMcpCommandListResult(server) {
  return {
    server: server.identifier,
    name: server.displayName,
    description: server.description || undefined,
    commands: server.commands
      .filter((command) => command.enabled)
      .map((command) => ({
        name: command.name,
        description: command.description || undefined,
        inputSchema: command.inputSchema || undefined,
        inputSummary: summarizeMcpInputSchema(command.inputSchema),
      })),
  };
}

function getValidatedReadSkillArguments(argumentsValue = {}) {
  if (!argumentsValue || typeof argumentsValue !== 'object' || Array.isArray(argumentsValue)) {
    throw new Error(`${READ_SKILL_TOOL} arguments must be an object.`);
  }
  const skillArguments = /** @type {{name?: unknown}} */ (argumentsValue);
  const supportedKeys = new Set(['name']);
  const unexpectedKeys = Object.keys(argumentsValue).filter((key) => !supportedKeys.has(key));
  if (unexpectedKeys.length) {
    throw new Error(`${READ_SKILL_TOOL} does not accept: ${unexpectedKeys.join(', ')}.`);
  }
  const skillName = typeof skillArguments.name === 'string' ? skillArguments.name.trim() : '';
  if (!skillName) {
    throw new Error(`${READ_SKILL_TOOL} requires name.`);
  }
  return {
    name: skillName,
  };
}

function executeReadSkill(argumentsValue = {}, runtimeContext = {}) {
  const { name } = getValidatedReadSkillArguments(argumentsValue);
  const resolvedSkillPackage = findUsableSkillPackageByName(runtimeContext.skills, name);
  if (!resolvedSkillPackage) {
    throw new Error(`Unknown skill: ${name}`);
  }
  if (resolvedSkillPackage?.ambiguous) {
    throw new Error(`Skill name is ambiguous: ${name}`);
  }
  return {
    status: 'success',
    body: typeof resolvedSkillPackage.skillMarkdown === 'string' ? resolvedSkillPackage.skillMarkdown : '',
  };
}

function executeListMcpServerCommands(argumentsValue = {}, runtimeContext = {}) {
  const { server: serverSelector } = getValidatedMcpServerListArguments(argumentsValue);
  const configuredServer = findMcpServerConfig(runtimeContext.mcpServers, serverSelector, {
    enabledOnly: true,
    requireEnabledCommands: true,
  });
  if (!configuredServer) {
    throw new Error(`Unknown MCP server: ${serverSelector}`);
  }
  return buildMcpCommandListResult(configuredServer);
}

async function executeCallMcpServerCommand(argumentsValue = {}, runtimeContext = {}) {
  const normalizedArguments = getValidatedMcpServerCallArguments(argumentsValue);
  const configuredServer = findMcpServerConfig(
    runtimeContext.mcpServers,
    normalizedArguments.server,
    {
      enabledOnly: true,
      requireEnabledCommands: true,
    }
  );
  if (!configuredServer) {
    throw new Error(`Unknown MCP server: ${normalizedArguments.server}`);
  }
  const configuredCommand = findMcpServerCommand(configuredServer, normalizedArguments.command, {
    enabledOnly: true,
  });
  if (!configuredCommand) {
    throw new Error(`Unknown MCP command: ${normalizedArguments.command}`);
  }
  return executeMcpServerCommand(
    configuredServer,
    configuredCommand.name,
    normalizedArguments.arguments,
    {
      fetchRef:
        runtimeContext.fetchRef || (typeof fetch === 'function' ? fetch.bind(globalThis) : null),
      onDebug: runtimeContext.onDebug,
    }
  );
}

function getAllowedToolNamesForRuntime(runtimeContext = {}) {
  const allowedToolNames = new Set(
    Array.isArray(runtimeContext.enabledToolNames)
      ? getEnabledToolNames(runtimeContext.enabledToolNames)
      : []
  );
  getImplicitlyEnabledToolNames(runtimeContext.mcpServers, runtimeContext.skills).forEach(
    (toolName) => {
      allowedToolNames.add(toolName);
    }
  );
  return allowedToolNames;
}

function findEnabledMcpCommandAlias(mcpServers = [], toolName = '') {
  const normalizedToolName = typeof toolName === 'string' ? toolName.trim() : '';
  if (!normalizedToolName) {
    return null;
  }
  const matches = [];
  getEnabledMcpServerConfigs(mcpServers).forEach((server) => {
    const command = findMcpServerCommand(server, normalizedToolName, { enabledOnly: true });
    if (command) {
      matches.push({
        server,
        command,
      });
    }
  });
  if (matches.length !== 1) {
    return matches.length ? { ambiguous: true, matches } : null;
  }
  return matches[0];
}

const TOOL_EXECUTORS = Object.freeze({
  get_current_date_time: {
    execute: (argumentsValue) => executeGetCurrentDateTime(argumentsValue),
  },
  get_user_location: {
    execute: (argumentsValue, runtimeContext) =>
      executeGetUserLocation(argumentsValue, runtimeContext),
  },
  tasklist: {
    execute: (argumentsValue, runtimeContext) => executeTaskList(argumentsValue, runtimeContext),
  },
  web_lookup: {
    execute: (argumentsValue, runtimeContext) =>
      executeWebLookupTool(argumentsValue, runtimeContext),
    serializeError: (error) =>
      buildFailedToolEnvelope(error, {
        message: WEB_LOOKUP_FAILURE_MESSAGE,
      }),
  },
  write_python_file: {
    execute: (argumentsValue, runtimeContext) =>
      executeWritePythonFileTool(argumentsValue, runtimeContext),
    serializeResult: (result) =>
      JSON.stringify({
        status: 'success',
        body: `Script successfully written to ${result?.path || '/workspace/script.py'}.`,
        message: `To execute the script, use {"name":"run_shell_command","parameters":{"cmd":"python ${result?.path || '/workspace/script.py'}"}}`,
      }),
    serializeError: (error) => buildFailedToolEnvelope(error),
  },
  run_shell_command: {
    execute: (argumentsValue, runtimeContext) =>
      executeShellCommandTool(argumentsValue, runtimeContext),
    serializeResult: (result) =>
      JSON.stringify(
        result?.responseEnvelope && typeof result.responseEnvelope === 'object'
          ? result.responseEnvelope
          : buildShellToolResponseEnvelope(result)
      ),
  },
  [READ_SKILL_TOOL]: {
    execute: (argumentsValue, runtimeContext) => executeReadSkill(argumentsValue, runtimeContext),
    serializeResult: (result) =>
      JSON.stringify({
        status: result?.status === 'failed' ? 'failed' : 'success',
        body: typeof result?.body === 'string' ? result.body : '',
      }),
    serializeError: (error) => buildFailedToolEnvelope(error),
  },
  [MCP_SERVER_COMMAND_LIST_TOOL]: {
    execute: (argumentsValue, runtimeContext) =>
      executeListMcpServerCommands(argumentsValue, runtimeContext),
    serializeError: (error) => buildFailedToolEnvelope(error),
  },
  [MCP_SERVER_COMMAND_CALL_TOOL]: {
    execute: (argumentsValue, runtimeContext) =>
      executeCallMcpServerCommand(argumentsValue, runtimeContext),
    serializeResult: (result, runtimeContext) => serializeMcpCommandCallResult(result, runtimeContext),
    serializeError: (error, runtimeContext) =>
      serializeMcpCommandCallResult({
        status: 'failed',
        body: error instanceof Error ? error.message : String(error),
      }, runtimeContext),
  },
});

export async function executeToolCall(toolCall, runtimeContext = {}) {
  if (!toolCall || typeof toolCall !== 'object') {
    throw new Error('Tool call is required.');
  }
  const requestedToolName = typeof toolCall.name === 'string' ? toolCall.name.trim() : '';
  let toolName = requestedToolName;
  let aliasResolution = null;
  if (Array.isArray(runtimeContext.enabledToolNames)) {
    const allowedToolNames = getAllowedToolNamesForRuntime(runtimeContext);
    if (!allowedToolNames.has(toolName)) {
      aliasResolution = findEnabledMcpCommandAlias(runtimeContext.mcpServers, toolName);
      if (aliasResolution?.ambiguous) {
        throw new Error(
          `Tool name is ambiguous across enabled MCP servers: ${toolName || 'unknown_tool'}`
        );
      }
      if (!aliasResolution) {
        throw new Error(`Tool is disabled: ${toolName || 'unknown_tool'}`);
      }
      toolName = MCP_SERVER_COMMAND_CALL_TOOL;
    }
  }
  const argumentsValue =
    toolCall.arguments &&
    typeof toolCall.arguments === 'object' &&
    !Array.isArray(toolCall.arguments)
      ? toolCall.arguments
      : {};
  const toolExecutor = TOOL_EXECUTORS[toolName];
  if (!toolExecutor) {
    aliasResolution = findEnabledMcpCommandAlias(runtimeContext.mcpServers, toolName);
    if (aliasResolution?.ambiguous) {
      throw new Error(
        `Tool name is ambiguous across enabled MCP servers: ${toolName || 'unknown_tool'}`
      );
    }
    if (!aliasResolution) {
      throw new Error(`Unknown tool: ${toolName}`);
    }
    toolName = MCP_SERVER_COMMAND_CALL_TOOL;
  }
  const resolvedArgumentsValue =
    aliasResolution && toolName === MCP_SERVER_COMMAND_CALL_TOOL
      ? {
          server: aliasResolution.server.identifier,
          command: aliasResolution.command.name,
          arguments: argumentsValue,
        }
      : argumentsValue;
  const resolvedExecutor = TOOL_EXECUTORS[toolName];
  if (!resolvedExecutor) {
    throw new Error(`Unknown tool: ${toolName}`);
  }
  let result;
  try {
    result = await resolvedExecutor.execute(resolvedArgumentsValue, runtimeContext);
  } catch (error) {
    if (typeof resolvedExecutor.serializeError === 'function') {
      return {
        toolName: requestedToolName,
        arguments: resolvedArgumentsValue,
        result: null,
        resultText: resolvedExecutor.serializeError(error, runtimeContext, resolvedArgumentsValue),
      };
    }
    throw error;
  }
  return {
    toolName: requestedToolName,
    arguments: resolvedArgumentsValue,
    result,
    resultText:
      typeof resolvedExecutor.serializeResult === 'function'
        ? resolvedExecutor.serializeResult(result, runtimeContext, resolvedArgumentsValue)
        : JSON.stringify(result),
  };
}
