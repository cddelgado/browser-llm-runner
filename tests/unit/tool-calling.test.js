import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  buildToolCallingSystemPrompt,
  executeToolCall,
  getToolDisplayName,
  getEnabledToolDefinitions,
  sniffToolCalls,
} from '../../src/llm/tool-calling.js';
import {
  addMessageToConversation,
  createConversation,
} from '../../src/state/conversation-model.js';

let taskListConversation;

function getTextEncoder() {
  return new globalThis.TextEncoder();
}

function getTextDecoder() {
  return new globalThis.TextDecoder();
}

function createMockWorkspaceFileSystem(initialFiles = {}) {
  const directories = new Set(['/workspace']);
  const files = new Map();

  function normalizePath(path) {
    const rawPath = typeof path === 'string' ? path.trim() : '';
    if (!rawPath || rawPath === '.' || rawPath === './' || rawPath === '/') {
      return '/workspace';
    }
    const slashNormalized = rawPath.replace(/\\/g, '/');
    const absolutePath = slashNormalized.startsWith('/')
      ? slashNormalized
      : slashNormalized.startsWith('workspace/')
        ? `/${slashNormalized}`
        : slashNormalized === 'workspace'
          ? '/workspace'
          : `/workspace/${slashNormalized.replace(/^\.\//, '')}`;
    const segments = absolutePath.split('/').filter(Boolean);
    if (!segments.length || segments[0] !== 'workspace' || segments.includes('..')) {
      throw new Error('Workspace paths must stay under /workspace.');
    }
    return `/${segments.join('/')}`;
  }

  function ensureParentDirectories(path) {
    const segments = normalizePath(path).split('/').filter(Boolean);
    for (let index = 1; index < segments.length; index += 1) {
      directories.add(`/${segments.slice(0, index).join('/')}`);
    }
  }

  function getEntryName(path) {
    const segments = normalizePath(path).split('/').filter(Boolean);
    return segments[segments.length - 1] || 'workspace';
  }

  Object.entries(initialFiles).forEach(([path, content]) => {
    const normalizedPath = normalizePath(path);
    ensureParentDirectories(normalizedPath);
    files.set(normalizedPath, String(content));
  });

  return {
    normalizePath,
    async ensureDirectory(path) {
      const normalizedPath = normalizePath(path);
      const segments = normalizedPath.split('/').filter(Boolean);
      for (let index = 1; index <= segments.length; index += 1) {
        directories.add(`/${segments.slice(0, index).join('/')}`);
      }
      return {
        path: normalizedPath,
        kind: 'directory',
      };
    },
    async stat(path) {
      const normalizedPath = normalizePath(path);
      if (files.has(normalizedPath)) {
        const content = files.get(normalizedPath) || '';
        return {
          path: normalizedPath,
          name: getEntryName(normalizedPath),
          kind: 'file',
          size: getTextEncoder().encode(content).byteLength,
        };
      }
      if (directories.has(normalizedPath)) {
        return {
          path: normalizedPath,
          name: getEntryName(normalizedPath),
          kind: 'directory',
        };
      }
      const error = new Error(`No such file or directory: ${normalizedPath}`);
      error.name = 'NotFoundError';
      throw error;
    },
    async listDirectory(path = '/workspace') {
      const normalizedPath = normalizePath(path);
      const entries = [];
      for (const directoryPath of directories) {
        if (directoryPath === normalizedPath || !directoryPath.startsWith(`${normalizedPath}/`)) {
          continue;
        }
        const relative = directoryPath.slice(normalizedPath.length + 1);
        if (!relative || relative.includes('/')) {
          continue;
        }
        entries.push({
          path: directoryPath,
          name: relative,
          kind: 'directory',
        });
      }
      for (const [filePath, content] of files.entries()) {
        if (!filePath.startsWith(`${normalizedPath}/`)) {
          continue;
        }
        const relative = filePath.slice(normalizedPath.length + 1);
        if (!relative || relative.includes('/')) {
          continue;
        }
        entries.push({
          path: filePath,
          name: relative,
          kind: 'file',
          size: getTextEncoder().encode(content).byteLength,
        });
      }
      return entries.sort((left, right) => left.path.localeCompare(right.path));
    },
    async readTextFile(path) {
      const normalizedPath = normalizePath(path);
      if (!files.has(normalizedPath)) {
        const error = new Error(`No such file or directory: ${normalizedPath}`);
        error.name = 'NotFoundError';
        throw error;
      }
      return files.get(normalizedPath) || '';
    },
    async readFile(path) {
      return getTextEncoder().encode(await this.readTextFile(path));
    },
    async writeTextFile(path, text) {
      const normalizedPath = normalizePath(path);
      ensureParentDirectories(normalizedPath);
      files.set(normalizedPath, String(text));
      return this.stat(normalizedPath);
    },
    async writeFile(path, data) {
      const text =
        data instanceof Uint8Array
          ? getTextDecoder().decode(data)
          : data instanceof ArrayBuffer
            ? getTextDecoder().decode(new Uint8Array(data))
            : String(data || '');
      return this.writeTextFile(path, text);
    },
    async deletePath(path, { recursive = false } = {}) {
      const normalizedPath = normalizePath(path);
      if (files.delete(normalizedPath)) {
        return true;
      }
      if (!directories.has(normalizedPath)) {
        const error = new Error(`No such file or directory: ${normalizedPath}`);
        error.name = 'NotFoundError';
        throw error;
      }
      const childPrefix = `${normalizedPath}/`;
      const hasChildren =
        Array.from(files.keys()).some((filePath) => filePath.startsWith(childPrefix)) ||
        Array.from(directories).some(
          (directoryPath) => directoryPath !== normalizedPath && directoryPath.startsWith(childPrefix)
        );
      if (hasChildren && !recursive) {
        throw new Error(`Directory not empty: ${normalizedPath}`);
      }
      Array.from(files.keys()).forEach((filePath) => {
        if (filePath.startsWith(childPrefix)) {
          files.delete(filePath);
        }
      });
      Array.from(directories)
        .sort((left, right) => right.length - left.length)
        .forEach((directoryPath) => {
          if (directoryPath === normalizedPath || directoryPath.startsWith(childPrefix)) {
            directories.delete(directoryPath);
          }
        });
      directories.add('/workspace');
      return true;
    },
  };
}

beforeEach(async () => {
  taskListConversation = createConversation({
    id: 'conversation-tasklist',
  });
  await executeToolCall(
    {
      name: 'tasklist',
      arguments: {
        command: 'clear',
      },
    },
    {
      conversation: taskListConversation,
    }
  );
});

function appendTaskListToolResult(conversation, toolArguments, result) {
  const parentId = conversation.activeLeafMessageId;
  const modelMessage = addMessageToConversation(
    conversation,
    'model',
    JSON.stringify({
      name: 'tasklist',
      parameters: toolArguments,
    }),
    {
      parentId,
    }
  );
  modelMessage.response = modelMessage.text;
  modelMessage.isResponseComplete = true;
  return addMessageToConversation(conversation, 'tool', JSON.stringify(result), {
    parentId: modelMessage.id,
    toolName: 'tasklist',
    toolArguments,
  });
}

describe('tool-calling prompt builder', () => {
  test('builds the Llama json tool-calling prompt', () => {
    const prompt = buildToolCallingSystemPrompt(
      {
        format: 'json',
        nameKey: 'name',
        argumentsKey: 'parameters',
      },
      ['get_current_date_time'],
      [
        {
          name: 'get_current_date_time',
          description: 'Returns the current local date and time.',
          parameters: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
        },
      ]
    );

    expect(prompt).toContain('**Tools available in this conversation:**');
    expect(prompt).toContain('- get_current_date_time: Returns the current local date and time.');
    expect(prompt).toContain('**Tool behavior:**');
    expect(prompt).toContain('**Tool call format:**');
    expect(prompt).toContain('After a tool result, continue the work and answer naturally.');
    expect(prompt).toContain('When you call a tool, output exactly one JSON object and nothing else.');
    expect(prompt).toContain('Shape: {"name":"<tool-name>","parameters":{...}}.');
    expect(prompt).toContain('Use {} when the tool takes no arguments.');
  });

  test('builds the Qwen tagged-json tool-calling prompt', () => {
    const prompt = buildToolCallingSystemPrompt(
      {
        format: 'tagged-json',
        nameKey: 'name',
        argumentsKey: 'arguments',
        openTag: '<tool_call>',
        closeTag: '</tool_call>',
      },
      ['lookup_fact']
    );

    expect(prompt).toContain(
      'When you call a tool, output exactly one tagged tool-call block and nothing else.'
    );
    expect(prompt).toContain('Wrap the JSON object in <tool_call> and </tool_call>.');
    expect(prompt).toContain('Shape inside the tags: {"name":"<tool-name>","arguments":{...}}.');
    expect(prompt).toContain('Use {} when the tool takes no arguments.');
  });

  test('adds a terminal-use instruction for get_user_location', () => {
    const prompt = buildToolCallingSystemPrompt(
      {
        format: 'json',
        nameKey: 'name',
        argumentsKey: 'parameters',
      },
      ['get_user_location']
    );

    expect(prompt).toContain('Use the returned location and coordinate directly in the answer.');
    expect(prompt).not.toContain(
      '**Tool behavior:**\n- Use the returned location and coordinate directly in the answer.'
    );
  });

  test('adds a tasklist planning instruction', () => {
    const prompt = buildToolCallingSystemPrompt(
      {
        format: 'json',
        nameKey: 'name',
        argumentsKey: 'parameters',
      },
      ['tasklist']
    );

    expect(prompt).toContain(
      'If tasklist would help and you need its command syntax, call it first with an empty arguments object.'
    );
    expect(prompt).not.toContain(
      '**Tool behavior:**\n- If tasklist would help and you need its command syntax, call it first with an empty arguments object.'
    );
  });

  test('adds a shell command discovery instruction', () => {
    const prompt = buildToolCallingSystemPrompt(
      {
        format: 'json',
        nameKey: 'name',
        argumentsKey: 'parameters',
      },
      ['run_shell_command']
    );

    expect(prompt).toContain(
      'Commands are GNU/Linux-like but only a subset is implemented. Call it first with an empty arguments object to see the supported commands and placeholder paths.'
    );
  });

  test('builds the LFM function-style tool-calling prompt', () => {
    const prompt = buildToolCallingSystemPrompt(
      {
        format: 'special-token-call',
        callOpen: '<|tool_call_start|>[',
        callClose: ']<|tool_call_end|>',
      },
      ['get_weather']
    );

    expect(prompt).toContain(
      'When you call a tool, output exactly one wrapped function-style call and nothing else.'
    );
    expect(prompt).toContain('Wrap the call in <|tool_call_start|>[ and ]<|tool_call_end|>.');
    expect(prompt).toContain('Shape inside the wrapper: tool_name(arg1="value1", arg2="value2").');
  });

  test('returns a friendly tool display name', () => {
    expect(getToolDisplayName('get_current_date_time')).toBe('Get Date and Time');
    expect(getToolDisplayName('get_user_location')).toBe('Get User Location');
    expect(getToolDisplayName('tasklist')).toBe('Task List Planner');
    expect(getToolDisplayName('run_shell_command')).toBe('Shell Command Runner');
    expect(getToolDisplayName('lookup_fact')).toBe('Lookup Fact');
  });

  test('includes the user location and tasklist tool definitions', () => {
    expect(getEnabledToolDefinitions()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'get_user_location',
          displayName: 'Get User Location',
        }),
        expect.objectContaining({
          name: 'tasklist',
          displayName: 'Task List Planner',
        }),
        expect.objectContaining({
          name: 'run_shell_command',
          displayName: 'Shell Command Runner',
        }),
      ])
    );
  });

  test('returns an empty prompt when no tools are enabled', () => {
    const prompt = buildToolCallingSystemPrompt(
      {
        format: 'json',
        nameKey: 'name',
        argumentsKey: 'arguments',
      },
      []
    );

    expect(prompt).toBe('');
  });

  test('sniffs plain json tool calls', () => {
    expect(
      sniffToolCalls('{"name":"get_weather","parameters":{"location":"Milwaukee, WI"}}', {
        format: 'json',
        nameKey: 'name',
        argumentsKey: 'parameters',
      })
    ).toEqual([
      {
        name: 'get_weather',
        arguments: { location: 'Milwaukee, WI' },
        rawText: '{"name":"get_weather","parameters":{"location":"Milwaukee, WI"}}',
        format: 'json',
      },
    ]);
  });

  test('sniffs a leading plain json tool call even with trailing prose', () => {
    expect(
      sniffToolCalls(
        '{"name":"tasklist","parameters":{}}\n\nLet us start by creating a new task.',
        {
          format: 'json',
          nameKey: 'name',
          argumentsKey: 'parameters',
        }
      )
    ).toEqual([
      {
        name: 'tasklist',
        arguments: {},
        rawText: '{"name":"tasklist","parameters":{}}',
        format: 'json',
      },
    ]);
  });

  test('sniffs tagged json tool calls', () => {
    expect(
      sniffToolCalls(
        '<tool_call>\n{"name":"lookup_fact","arguments":{"topic":"stars"}}\n</tool_call>',
        {
          format: 'tagged-json',
          nameKey: 'name',
          argumentsKey: 'arguments',
          openTag: '<tool_call>',
          closeTag: '</tool_call>',
        }
      )
    ).toEqual([
      {
        name: 'lookup_fact',
        arguments: { topic: 'stars' },
        rawText: '<tool_call>\n{"name":"lookup_fact","arguments":{"topic":"stars"}}\n</tool_call>',
        format: 'tagged-json',
      },
    ]);
  });

  test('sniffs a tagged json tool call even with trailing prose', () => {
    expect(
      sniffToolCalls(
        '<tool_call>{"name":"lookup_fact","arguments":{"topic":"stars"}}</tool_call>\nI will use that next.',
        {
          format: 'tagged-json',
          nameKey: 'name',
          argumentsKey: 'arguments',
          openTag: '<tool_call>',
          closeTag: '</tool_call>',
        }
      )
    ).toEqual([
      {
        name: 'lookup_fact',
        arguments: { topic: 'stars' },
        rawText: '<tool_call>{"name":"lookup_fact","arguments":{"topic":"stars"}}</tool_call>',
        format: 'tagged-json',
      },
    ]);
  });

  test('sniffs special-token function calls', () => {
    expect(
      sniffToolCalls(
        '<|tool_call_start|>[get_weather(location="Milwaukee, WI", unit="fahrenheit")]<|tool_call_end|>',
        {
          format: 'special-token-call',
          callOpen: '<|tool_call_start|>[',
          callClose: ']<|tool_call_end|>',
        }
      )
    ).toEqual([
      {
        name: 'get_weather',
        arguments: { location: 'Milwaukee, WI', unit: 'fahrenheit' },
        rawText:
          '<|tool_call_start|>[get_weather(location="Milwaukee, WI", unit="fahrenheit")]<|tool_call_end|>',
        format: 'special-token-call',
      },
    ]);
  });

  test('sniffs a special-token tool call even with trailing prose', () => {
    expect(
      sniffToolCalls(
        '<|tool_call_start|>[get_weather(location="Milwaukee, WI")]<|tool_call_end|>\nChecking now.',
        {
          format: 'special-token-call',
          callOpen: '<|tool_call_start|>[',
          callClose: ']<|tool_call_end|>',
        }
      )
    ).toEqual([
      {
        name: 'get_weather',
        arguments: { location: 'Milwaukee, WI' },
        rawText: '<|tool_call_start|>[get_weather(location="Milwaukee, WI")]<|tool_call_end|>',
        format: 'special-token-call',
      },
    ]);
  });

  test('sniffs multiple json tool calls separated by prose', () => {
    expect(
      sniffToolCalls(
        '{"name":"tasklist","parameters":{"command":"list"}}\nChecking current items.\n{"name":"get_current_date_time","parameters":{}}',
        {
          format: 'json',
          nameKey: 'name',
          argumentsKey: 'parameters',
        }
      )
    ).toEqual([
      {
        name: 'tasklist',
        arguments: { command: 'list' },
        rawText: '{"name":"tasklist","parameters":{"command":"list"}}',
        format: 'json',
      },
      {
        name: 'get_current_date_time',
        arguments: {},
        rawText: '{"name":"get_current_date_time","parameters":{}}',
        format: 'json',
      },
    ]);
  });

  test('executes get_current_date_time without arguments', async () => {
    const result = await executeToolCall({
      name: 'get_current_date_time',
      arguments: {},
    });

    expect(result.toolName).toBe('get_current_date_time');
    expect(result.arguments).toEqual({});
    expect(result.result).toMatchObject({
      iso: expect.any(String),
      unixMs: expect.any(Number),
      localDate: expect.any(String),
      localTime: expect.any(String),
      timeZone: expect.any(String),
    });
    expect(JSON.parse(result.resultText)).toMatchObject({
      iso: expect.any(String),
      unixMs: expect.any(Number),
    });
  });

  test('executes get_user_location with precise coordinates when geolocation succeeds', async () => {
    const result = await executeToolCall(
      {
        name: 'get_user_location',
        arguments: {
          timeoutMs: 5000,
        },
      },
      {
        navigatorRef: {
          language: 'en-US',
          languages: ['en-US'],
          geolocation: {
            getCurrentPosition: (success, _error, options) => {
              expect(options).toMatchObject({
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0,
              });
              success({
                coords: {
                  latitude: 43.0389,
                  longitude: -87.9065,
                  accuracy: 25,
                },
              });
            },
          },
        },
        fetchRef: async () => ({
          ok: true,
          json: async () => ({
            display_name: 'Milwaukee, Wisconsin, United States',
            address: {
              city: 'Milwaukee',
              state: 'Wisconsin',
              country: 'United States',
              country_code: 'us',
              postcode: '53202',
            },
          }),
        }),
      }
    );

    expect(result.toolName).toBe('get_user_location');
    expect(result.result).toEqual({
      location: 'Milwaukee, Wisconsin, United States',
      coordinate: {
        latitude: 43.0389,
        longitude: -87.9065,
      },
    });
  });

  test('falls back to an approximate location when geolocation permission is denied', async () => {
    const result = await executeToolCall(
      {
        name: 'get_user_location',
        arguments: {},
      },
      {
        navigatorRef: {
          language: 'en-US',
          languages: ['en-US'],
          geolocation: {
            getCurrentPosition: (_success, error) => {
              error({
                code: 1,
              });
            },
          },
        },
      }
    );

    expect(result.toolName).toBe('get_user_location');
    expect(result.result.coordinate).toBeNull();
    expect(result.result.location).toEqual(expect.any(String));
    expect(result.result.location).toContain('US');
  });

  test('falls back to an approximate location when first-use consent is denied', async () => {
    const getCurrentPosition = vi.fn();
    const fetchRef = vi.fn();
    const requestToolConsent = vi.fn(() => false);
    const result = await executeToolCall(
      {
        name: 'get_user_location',
        arguments: {},
      },
      {
        requestToolConsent,
        navigatorRef: {
          language: 'en-US',
          languages: ['en-US'],
          geolocation: {
            getCurrentPosition,
          },
        },
        fetchRef,
      }
    );

    expect(requestToolConsent).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'get_user_location',
        scope: 'precise-location',
      })
    );
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(fetchRef).not.toHaveBeenCalled();
    expect(result.result.coordinate).toBeNull();
    expect(result.result.location).toContain('US');
  });

  test('keeps coordinates when reverse geocoding is unavailable', async () => {
    const result = await executeToolCall(
      {
        name: 'get_user_location',
        arguments: {},
      },
      {
        navigatorRef: {
          language: 'en-US',
          languages: ['en-US'],
          geolocation: {
            getCurrentPosition: (success) => {
              success({
                coords: {
                  latitude: 43.044035,
                  longitude: -87.9149,
                  accuracy: 100,
                },
              });
            },
          },
        },
        fetchRef: async () => ({
          ok: false,
        }),
      }
    );

    expect(result.result.location).toBe('43.044035, -87.9149');
    expect(result.result.coordinate).toEqual({
      latitude: 43.044035,
      longitude: -87.9149,
    });
  });

  test('waits for the geolocation request outcome even without relying on the permissions api', async () => {
    const result = await executeToolCall(
      {
        name: 'get_user_location',
        arguments: {},
      },
      {
        navigatorRef: {
          language: 'en-US',
          languages: ['en-US'],
          geolocation: {
            getCurrentPosition: (success) => {
              success({
                coords: {
                  latitude: 43.044035,
                  longitude: -87.9149,
                  accuracy: 100,
                },
              });
            },
          },
        },
        fetchRef: async () => ({
          ok: true,
          json: async () => ({
            display_name: 'Milwaukee, Wisconsin, United States',
            address: {
              city: 'Milwaukee',
              state: 'Wisconsin',
              country: 'United States',
              country_code: 'us',
            },
          }),
        }),
      }
    );

    expect(result.result).toEqual({
      location: 'Milwaukee, Wisconsin, United States',
      coordinate: {
        latitude: 43.044035,
        longitude: -87.9149,
      },
    });
  });

  test('reveals tasklist syntax and why it matters when called without arguments', async () => {
    const result = await executeToolCall({
      name: 'tasklist',
      arguments: {},
    });

    expect(result.toolName).toBe('tasklist');
    expect(result.result.message).toBe(
      'Tasklist syntax reference. Use the normal tool-call wrapper for this model, then pass one of these arguments objects:'
    );
    expect(result.result.examples).toEqual([
      '{ "command": "new", "item": "Task item", "index": 0 }',
      '{ "command": "list" }',
      '{ "command": "clear" }',
      '{ "command": "update", "index": 0, "status": 1 }',
    ]);
    expect(result.result.note).toBe('status: 0 = undone, 1 = done.');
  });

  test('reveals shell command syntax and placeholder commands when called without arguments', async () => {
    const result = await executeToolCall({
      name: 'run_shell_command',
      arguments: {},
    });

    expect(result.toolName).toBe('run_shell_command');
    expect(result.result.shellFlavor).toBe('GNU/Linux-like shell subset');
    expect(result.result.currentWorkingDirectory).toBe('/workspace');
    expect(result.result.supportedCommands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'pwd', usage: 'pwd' }),
        expect.objectContaining({ name: 'basename', usage: 'basename <path>' }),
        expect.objectContaining({ name: 'dirname', usage: 'dirname <path>' }),
        expect.objectContaining({ name: 'printf', usage: 'printf <format> [<argument>...]' }),
        expect.objectContaining({ name: 'true', usage: 'true' }),
        expect.objectContaining({ name: 'false', usage: 'false' }),
        expect.objectContaining({ name: 'cd', usage: 'cd [<directory>]' }),
        expect.objectContaining({ name: 'rmdir', usage: 'rmdir <directory>...' }),
        expect.objectContaining({ name: 'mktemp', usage: 'mktemp [-d] [<template>]' }),
        expect.objectContaining({ name: 'sort', usage: 'sort [-r] [-n] <file>...' }),
        expect.objectContaining({ name: 'uniq', usage: 'uniq [-c] <file>' }),
        expect.objectContaining({ name: 'cut', usage: 'cut -f <fields> [-d <delimiter>] <file>' }),
        expect.objectContaining({ name: 'paste', usage: 'paste [-d <delimiters>] <file>...' }),
        expect.objectContaining({
          name: 'join',
          usage: 'join [-1 <field>] [-2 <field>] [-t <delimiter>] <left-file> <right-file>',
        }),
        expect.objectContaining({
          name: 'column',
          usage: 'column [-t] [-s <separator>] <file>',
        }),
        expect.objectContaining({ name: 'tr', usage: 'tr [-d] <set1> [<set2>] <file>' }),
        expect.objectContaining({ name: 'nl', usage: 'nl <file>' }),
        expect.objectContaining({ name: 'ls', usage: 'ls [-1] [-R] [-d] [-h] [-l] [<path>...]' }),
        expect.objectContaining({
          name: 'cat',
          usage: 'cat [-bns] [--number] [--number-nonblank] [--squeeze-blank] <file>...',
        }),
        expect.objectContaining({
          name: 'find',
          usage: 'find [<path>] [-name <pattern>] [-type f|d] [-maxdepth <n>] [-mindepth <n>]',
        }),
        expect.objectContaining({
          name: 'grep',
          usage: 'grep [-i] [-n] [-v] [-c] [-l] [-F] <pattern> <file>...',
        }),
        expect.objectContaining({
          name: 'sed',
          usage: "sed [-n] [-i] '<script>' <file>",
        }),
        expect.objectContaining({
          name: 'file',
          usage: 'file <path>...',
        }),
        expect.objectContaining({
          name: 'diff',
          usage: 'diff [-u] <left-file> <right-file>',
        }),
        expect.objectContaining({
          name: 'set',
          usage: 'set <name> <value...>',
        }),
        expect.objectContaining({
          name: 'unset',
          usage: 'unset <name>...',
        }),
        expect.objectContaining({
          name: 'which',
          usage: 'which <command>...',
        }),
      ])
    );
    expect(result.result.limitations).toContain(
      'Commands are GNU/Linux-like, but only the documented subset is implemented.'
    );
    expect(result.result.limitations).toContain(
      'Relative paths resolve from the current working directory.'
    );
    expect(result.result.limitations).toContain(
      'Minimal variable support exists for $VAR, ${VAR}, NAME=value, set, and unset.'
    );
    expect(result.result.limitations).toContain(
      'paste merges text files line-by-line, with optional -d delimiters.'
    );
    expect(result.result.limitations).toContain(
      'join supports two-file joins with optional -1, -2, and -t field-selection flags.'
    );
    expect(result.result.limitations).toContain(
      'column focuses on table alignment, especially with -t and optional -s separators.'
    );
    expect(result.result.limitations).toContain(
      'sed supports a single sed-like script with addresses N, N,M, /regex/, and $, plus commands p, d, and s///g, with optional -n and -i.'
    );
    expect(result.result.limitations).toContain(
      'file reports a small deterministic set of directory, signature, extension, and text-vs-binary classifications.'
    );
    expect(result.result.limitations).toContain(
      'diff is line-based and emits unified-style emulated output rather than full GNU diff compatibility.'
    );
  });

  test('executes a shell command against the workspace and returns stdout', async () => {
    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'cat notes.txt',
        },
      },
      {
        workspaceFileSystem: createMockWorkspaceFileSystem({
          '/workspace/notes.txt': 'alpha\nbeta\n',
        }),
      }
    );

    expect(result.toolName).toBe('run_shell_command');
    expect(result.result).toEqual({
      shellFlavor: 'GNU/Linux-like shell subset',
      currentWorkingDirectory: '/workspace',
      command: 'cat notes.txt',
      exitCode: 0,
      stdout: 'alpha\nbeta\n',
      stderr: '',
    });
  });

  test('supports true and false as fixed exit-code commands', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem();

    const trueResult = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'true',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    const falseResult = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'false',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(trueResult.result).toEqual({
      shellFlavor: 'GNU/Linux-like shell subset',
      currentWorkingDirectory: '/workspace',
      command: 'true',
      exitCode: 0,
      stdout: '',
      stderr: '',
    });
    expect(falseResult.result).toEqual({
      shellFlavor: 'GNU/Linux-like shell subset',
      currentWorkingDirectory: '/workspace',
      command: 'false',
      exitCode: 1,
      stdout: '',
      stderr: '',
    });
  });

  test('supports basename and dirname as path transforms', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem();

    const basenameResult = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'basename /workspace/coursework/notes.txt',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    const dirnameResult = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'dirname /workspace/coursework/notes.txt',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(basenameResult.result).toEqual({
      shellFlavor: 'GNU/Linux-like shell subset',
      currentWorkingDirectory: '/workspace',
      command: 'basename /workspace/coursework/notes.txt',
      exitCode: 0,
      stdout: 'notes.txt',
      stderr: '',
    });
    expect(dirnameResult.result).toEqual({
      shellFlavor: 'GNU/Linux-like shell subset',
      currentWorkingDirectory: '/workspace',
      command: 'dirname /workspace/coursework/notes.txt',
      exitCode: 0,
      stdout: '/workspace/coursework',
      stderr: '',
    });
  });

  test('supports printf without an automatic trailing newline', async () => {
    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'printf "Hello %s\\n%d" world 7',
        },
      },
      {
        workspaceFileSystem: createMockWorkspaceFileSystem(),
      }
    );

    expect(result.result).toEqual({
      shellFlavor: 'GNU/Linux-like shell subset',
      currentWorkingDirectory: '/workspace',
      command: 'printf "Hello %s\\n%d" world 7',
      exitCode: 0,
      stdout: 'Hello world\n7',
      stderr: '',
    });
  });

  test('repeats the printf format when extra arguments remain', async () => {
    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'printf "%s-" a b c',
        },
      },
      {
        workspaceFileSystem: createMockWorkspaceFileSystem(),
      }
    );

    expect(result.result.stdout).toBe('a-b-c-');
  });

  test('supports which for built-in shell commands', async () => {
    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'which ls fakecmd echo',
        },
      },
      {
        workspaceFileSystem: createMockWorkspaceFileSystem(),
      }
    );

    expect(result.result).toEqual({
      shellFlavor: 'GNU/Linux-like shell subset',
      currentWorkingDirectory: '/workspace',
      command: 'which ls fakecmd echo',
      exitCode: 1,
      stdout: 'ls\necho',
      stderr: '',
    });
  });

  test('supports rmdir for empty directories only', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem({
      '/workspace/full/file.txt': 'alpha',
    });
    await workspaceFileSystem.ensureDirectory('/workspace/empty');

    const successResult = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'rmdir empty',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    const failureResult = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'rmdir full',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(successResult.result).toEqual({
      shellFlavor: 'GNU/Linux-like shell subset',
      currentWorkingDirectory: '/workspace',
      command: 'rmdir empty',
      exitCode: 0,
      stdout: '',
      stderr: '',
    });
    expect(failureResult.result.exitCode).toBe(1);
    expect(failureResult.result.stderr).toContain("failed to remove 'full'");
  });

  test('supports mktemp for files and directories', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem();

    const fileResult = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'mktemp',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    const directoryResult = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'mktemp -d /workspace/tmpdir.XXXXXX',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(fileResult.result.exitCode).toBe(0);
    expect(fileResult.result.stdout).toMatch(/^\/workspace\/tmp\.[a-z0-9]{6}$/);
    await expect(workspaceFileSystem.stat(fileResult.result.stdout)).resolves.toMatchObject({
      kind: 'file',
      path: fileResult.result.stdout,
    });

    expect(directoryResult.result.exitCode).toBe(0);
    expect(directoryResult.result.stdout).toMatch(/^\/workspace\/tmpdir\.[a-z0-9]{6}$/);
    await expect(workspaceFileSystem.stat(directoryResult.result.stdout)).resolves.toMatchObject({
      kind: 'directory',
      path: directoryResult.result.stdout,
    });
  });

  test('supports sort for lexical and numeric ordering', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem({
      '/workspace/words.txt': 'pear\napple\nbanana\n',
      '/workspace/numbers.txt': '10\n2\n1\n',
    });

    const lexicalResult = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'sort words.txt',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    const numericReverseResult = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'sort -nr numbers.txt',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(lexicalResult.result.stdout).toBe('apple\nbanana\npear\n');
    expect(numericReverseResult.result.stdout).toBe('10\n2\n1\n');
  });

  test('supports uniq and uniq -c for adjacent duplicates', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem({
      '/workspace/dupes.txt': 'apple\napple\nbanana\nbanana\nbanana\npear\n',
    });

    const uniqResult = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'uniq dupes.txt',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    const uniqCountResult = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'uniq -c dupes.txt',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(uniqResult.result.stdout).toBe('apple\nbanana\npear\n');
    expect(uniqCountResult.result.stdout).toBe('      2 apple\n      3 banana\n      1 pear\n');
  });

  test('supports cut for delimited field selection', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem({
      '/workspace/table.csv': 'alpha,beta,gamma\none,two,three\n',
    });

    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'cut -d , -f 1,3 table.csv',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(result.result.stdout).toBe('alpha,gamma\none,three\n');
  });

  test('supports paste for line-wise file merging', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem({
      '/workspace/left.txt': 'alpha\nbeta\n',
      '/workspace/right.txt': '1\n2\n',
    });

    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'paste left.txt right.txt',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(result.result.stdout).toBe('alpha\t1\nbeta\t2\n');
  });

  test('supports paste -d with custom delimiters', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem({
      '/workspace/a.txt': 'x\ny\n',
      '/workspace/b.txt': '1\n2\n',
      '/workspace/c.txt': 'p\nq\n',
    });

    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'paste -d ",;" a.txt b.txt c.txt',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(result.result.stdout).toBe('x,1;p\ny,2;q\n');
  });

  test('supports join with delimiter-aware field matching', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem({
      '/workspace/left.csv': 'a,alpha,one\nb,beta,two\n',
      '/workspace/right.csv': 'a,apple\nc,cherry\nb,banana\n',
    });

    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'join -t , left.csv right.csv',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(result.result.stdout).toBe('a,alpha,one,apple\nb,beta,two,banana\n');
  });

  test('supports join with explicit field selection', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem({
      '/workspace/left.txt': 'alpha 1 red\nbeta 2 blue\n',
      '/workspace/right.txt': 'red circle\nblue square\n',
    });

    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'join -1 3 -2 1 left.txt right.txt',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(result.result.stdout).toBe('red alpha 1 circle\nblue beta 2 square\n');
  });

  test('supports column -t for linux-like table alignment', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem({
      '/workspace/table.csv': 'name,score,grade\nAna,9,A\nBeatrice,10,A+\n',
    });

    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'column -t -s , table.csv',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(result.result.stdout).toBe(
      'name      score  grade\nAna       9      A\nBeatrice  10     A+\n'
    );
  });

  test('supports tr for translation and deletion', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem({
      '/workspace/text.txt': 'banana\n',
    });

    const translateResult = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'tr an oz text.txt',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    const deleteResult = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'tr -d an text.txt',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(translateResult.result.stdout).toBe('bozozo\n');
    expect(deleteResult.result.stdout).toBe('b\n');
  });

  test('supports nl for line numbering', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem({
      '/workspace/notes.txt': 'alpha\nbeta\n',
    });

    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'nl notes.txt',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(result.result.stdout).toBe('     1\talpha\n     2\tbeta\n');
  });

  test('supports cat -n for numbering all output lines', async () => {
    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'cat -n notes.txt',
        },
      },
      {
        workspaceFileSystem: createMockWorkspaceFileSystem({
          '/workspace/notes.txt': 'alpha\n\nbeta\n',
        }),
      }
    );

    expect(result.result.stdout).toBe('     1\talpha\n     2\t\n     3\tbeta\n');
  });

  test('supports cat -b and prefers it over -n for blank lines', async () => {
    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'cat -bn notes.txt',
        },
      },
      {
        workspaceFileSystem: createMockWorkspaceFileSystem({
          '/workspace/notes.txt': 'alpha\n\nbeta\n',
        }),
      }
    );

    expect(result.result.stdout).toBe('     1\talpha\n\n     2\tbeta\n');
  });

  test('supports cat -s for squeezing repeated blank lines', async () => {
    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'cat -s notes.txt',
        },
      },
      {
        workspaceFileSystem: createMockWorkspaceFileSystem({
          '/workspace/notes.txt': 'alpha\n\n\nbeta\n',
        }),
      }
    );

    expect(result.result.stdout).toBe('alpha\n\nbeta\n');
  });

  test('supports cat long aliases', async () => {
    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'cat --number-nonblank --squeeze-blank notes.txt',
        },
      },
      {
        workspaceFileSystem: createMockWorkspaceFileSystem({
          '/workspace/notes.txt': 'alpha\n\n\nbeta\n',
        }),
      }
    );

    expect(result.result.stdout).toBe('     1\talpha\n\n     2\tbeta\n');
  });

  test('returns shell-style stderr for unsupported shell commands', async () => {
    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'awk "{print $1}" notes.txt',
        },
      },
      {
        workspaceFileSystem: createMockWorkspaceFileSystem({
          '/workspace/notes.txt': 'hello\n',
        }),
      }
    );

    expect(result.toolName).toBe('run_shell_command');
    expect(result.result.exitCode).toBe(127);
    expect(result.result.stdout).toBe('');
    expect(result.result.stderr).toContain("command 'awk' is not available");
  });

  test('changes and reuses the conversation working directory for shell commands', async () => {
    const conversation = createConversation({
      id: 'conversation-shell',
    });
    const workspaceFileSystem = createMockWorkspaceFileSystem({
      '/workspace/coursework/notes.txt': 'chapter one',
    });

    const cdResult = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'cd coursework',
        },
      },
      {
        conversation,
        workspaceFileSystem,
      }
    );

    expect(cdResult.result).toEqual({
      shellFlavor: 'GNU/Linux-like shell subset',
      currentWorkingDirectory: '/workspace/coursework',
      command: 'cd coursework',
      exitCode: 0,
      stdout: '',
      stderr: '',
    });
    expect(conversation.currentWorkingDirectory).toBe('/workspace/coursework');

    const catResult = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'cat notes.txt',
        },
      },
      {
        conversation,
        workspaceFileSystem,
      }
    );

    expect(catResult.result).toEqual({
      shellFlavor: 'GNU/Linux-like shell subset',
      currentWorkingDirectory: '/workspace/coursework',
      command: 'cat notes.txt',
      exitCode: 0,
      stdout: 'chapter one',
      stderr: '',
    });
  });

  test('supports minimal shell variables with assignment and expansion', async () => {
    const conversation = createConversation({
      id: 'conversation-shell-vars',
    });

    await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'COURSE=biology',
        },
      },
      {
        conversation,
        workspaceFileSystem: createMockWorkspaceFileSystem(),
      }
    );

    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'echo $COURSE ${COURSE}',
        },
      },
      {
        conversation,
        workspaceFileSystem: createMockWorkspaceFileSystem(),
      }
    );

    expect(conversation.shellVariables).toEqual({
      COURSE: 'biology',
    });
    expect(result.result.stdout).toBe('biology biology');
  });

  test('supports PWD expansion and unset for shell variables', async () => {
    const conversation = createConversation({
      id: 'conversation-shell-pwd',
    });
    const workspaceFileSystem = createMockWorkspaceFileSystem({
      '/workspace/coursework/notes.txt': 'chapter one',
    });

    await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'cd coursework',
        },
      },
      {
        conversation,
        workspaceFileSystem,
      }
    );

    const pwdResult = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'echo $PWD',
        },
      },
      {
        conversation,
        workspaceFileSystem,
      }
    );

    await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'set COURSE science',
        },
      },
      {
        conversation,
        workspaceFileSystem,
      }
    );

    await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'unset COURSE',
        },
      },
      {
        conversation,
        workspaceFileSystem,
      }
    );

    const unsetResult = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'echo $COURSE',
        },
      },
      {
        conversation,
        workspaceFileSystem,
      }
    );

    expect(pwdResult.result.stdout).toBe('/workspace/coursework');
    expect(unsetResult.result.stdout).toBe('');
    expect(conversation.shellVariables).toEqual({});
  });

  test('supports ls -l and ls -h for long listings', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem({
      '/workspace/notes.txt': '1234567890',
      '/workspace/readme.md': 'abc',
    });

    const longResult = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'ls -l',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(longResult.result.stdout).toContain('-       10 notes.txt');
    expect(longResult.result.stdout).toContain('-        3 readme.md');

    const humanReadableResult = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'ls -lh',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(humanReadableResult.result.stdout).toContain('-      10B notes.txt');
    expect(humanReadableResult.result.stdout).toContain('-       3B readme.md');
  });

  test('supports ls -d for listing a directory entry instead of its contents', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem({
      '/workspace/coursework/notes.txt': 'chapter one',
    });

    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'ls -d coursework',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(result.result.stdout).toBe('coursework');
  });

  test('supports ls -R for recursive listings', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem({
      '/workspace/coursework/notes.txt': 'chapter one',
      '/workspace/coursework/week1/todo.txt': 'finish reading',
      '/workspace/root.txt': 'top level',
    });

    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'ls -R',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(result.result.stdout).toContain('/workspace:');
    expect(result.result.stdout).toContain('coursework');
    expect(result.result.stdout).toContain('root.txt');
    expect(result.result.stdout).toContain('/workspace/coursework:');
    expect(result.result.stdout).toContain('notes.txt');
    expect(result.result.stdout).toContain('week1');
    expect(result.result.stdout).toContain('/workspace/coursework/week1:');
    expect(result.result.stdout).toContain('todo.txt');
  });

  test('accepts ls -1 without changing line-based output behavior', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem({
      '/workspace/a.txt': 'a',
      '/workspace/b.txt': 'b',
    });

    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'ls -1',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(result.result.stdout.split('\n')).toEqual(['a.txt', 'b.txt']);
  });

  test('supports find -name and -type filters', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem({
      '/workspace/coursework/notes.txt': 'chapter one',
      '/workspace/coursework/todo.md': 'finish reading',
      '/workspace/coursework/week1/notes.txt': 'week one',
    });

    const filesResult = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'find coursework -name "*.txt" -type f',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(filesResult.result.stdout.split('\n')).toEqual([
      '/workspace/coursework/notes.txt',
      '/workspace/coursework/week1/notes.txt',
    ]);

    const directoriesResult = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'find coursework -type d',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(directoriesResult.result.stdout.split('\n')).toEqual([
      '/workspace/coursework',
      '/workspace/coursework/week1',
    ]);
  });

  test('supports find maxdepth and mindepth filters', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem({
      '/workspace/coursework/notes.txt': 'chapter one',
      '/workspace/coursework/week1/todo.txt': 'finish reading',
      '/workspace/coursework/week1/day1/tasks.txt': 'lab',
    });

    const shallowResult = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'find coursework -maxdepth 1',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(shallowResult.result.stdout.split('\n')).toEqual([
      '/workspace/coursework',
      '/workspace/coursework/notes.txt',
      '/workspace/coursework/week1',
    ]);

    const deepOnlyResult = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'find coursework -mindepth 2 -type f',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(deepOnlyResult.result.stdout.split('\n')).toEqual([
      '/workspace/coursework/week1/day1/tasks.txt',
      '/workspace/coursework/week1/todo.txt',
    ]);
  });

  test('supports grep -i, -n, and -F', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem({
      '/workspace/notes.txt': 'Alpha\nbeta\nALPHA BETA\n',
    });

    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'grep -inF alpha notes.txt',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(result.result.stdout).toBe('1:Alpha\n3:ALPHA BETA');
  });

  test('supports grep -v and -c', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem({
      '/workspace/notes.txt': 'Alpha\nbeta\nALPHA BETA\n',
    });

    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'grep -vc alpha notes.txt',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(result.result.stdout).toBe('3');
  });

  test('supports grep -l across multiple files', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem({
      '/workspace/notes.txt': 'Alpha\nbeta\n',
      '/workspace/todo.txt': 'gamma\ndelta\n',
      '/workspace/summary.txt': 'alphabet soup\n',
    });

    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'grep -l alpha notes.txt todo.txt summary.txt',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(result.result.stdout.split('\n')).toEqual([
      '/workspace/summary.txt',
    ]);
  });

  test('prefixes grep output with file names for multiple files', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem({
      '/workspace/a.txt': 'target\n',
      '/workspace/b.txt': 'skip\ntarget\n',
    });

    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'grep target a.txt b.txt',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(result.result.stdout.split('\n')).toEqual([
      '/workspace/a.txt:target',
      '/workspace/b.txt:target',
    ]);
  });

  test('supports sed -n with line ranges and print', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem({
      '/workspace/notes.txt': 'alpha\nbeta\ngamma\ndelta\n',
    });

    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: "sed -n '2,3p' notes.txt",
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(result.result.stdout).toBe('beta\ngamma\n');
  });

  test('supports sed delete by regex address', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem({
      '/workspace/notes.txt': 'alpha\nbeta\ngamma\n',
    });

    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: "sed '/beta/d' notes.txt",
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(result.result.stdout).toBe('alpha\ngamma\n');
  });

  test('supports sed substitution over the default output stream', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem({
      '/workspace/notes.txt': 'beta beta\ngamma\n',
    });

    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: "sed 's/beta/delta/g' notes.txt",
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(result.result.stdout).toBe('delta delta\ngamma\n');
  });

  test('supports sed -i for in-place edits', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem({
      '/workspace/notes.txt': 'alpha\nbeta\ngamma\n',
    });

    const editResult = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: "sed -i '2s/beta/delta/' notes.txt",
        },
      },
      {
        workspaceFileSystem,
      }
    );

    const readBackResult = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'cat notes.txt',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(editResult.result.stdout).toBe('');
    expect(readBackResult.result.stdout).toBe('alpha\ndelta\ngamma\n');
  });

  test('returns a shell-style sed error for invalid scripts', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem({
      '/workspace/notes.txt': 'alpha\nbeta\n',
    });

    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: "sed 'q' notes.txt",
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(result.result.exitCode).toBe(2);
    expect(result.result.stderr).toContain("sed: unsupported sed script 'q'.");
  });

  test('supports file for directories and common text formats', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem({
      '/workspace/notes.md': '# Hello\n',
      '/workspace/table.csv': 'a,b\n1,2\n',
      '/workspace/coursework/todo.txt': 'finish reading\n',
    });

    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'file coursework notes.md table.csv',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(result.result.exitCode).toBe(0);
    expect(result.result.stdout.split('\n')).toEqual([
      '/workspace/coursework: directory',
      '/workspace/notes.md: Markdown text',
      '/workspace/table.csv: CSV text',
    ]);
  });

  test('supports file for binary signatures and generic binary data', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem();
    await workspaceFileSystem.writeFile(
      '/workspace/document.pdf',
      new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])
    );
    await workspaceFileSystem.writeFile(
      '/workspace/blob.bin',
      new Uint8Array([0x00, 0xff, 0x10, 0x80])
    );

    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'file document.pdf blob.bin',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(result.result.stdout.split('\n')).toEqual([
      '/workspace/document.pdf: PDF document',
      '/workspace/blob.bin: data',
    ]);
  });

  test('returns a shell-style file error when a path is missing', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem();

    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'file missing.txt',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(result.result.exitCode).toBe(1);
    expect(result.result.stderr).toBe("file: cannot open 'missing.txt': No such file or directory.");
  });

  test('supports diff with unified-style emulated output', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem({
      '/workspace/before.txt': 'alpha\nbeta\ndelta\n',
      '/workspace/after.txt': 'alpha\ngamma\ndelta\n',
    });

    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'diff -u before.txt after.txt',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(result.result.exitCode).toBe(1);
    expect(result.result.stdout).toBe(
      '--- /workspace/before.txt\n' +
        '+++ /workspace/after.txt\n' +
        '@@ -1,3 +1,3 @@\n' +
        ' alpha\n' +
        '-beta\n' +
        '+gamma\n' +
        ' delta'
    );
  });

  test('returns an empty diff for identical files', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem({
      '/workspace/a.txt': 'same\ntext\n',
      '/workspace/b.txt': 'same\ntext\n',
    });

    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'diff a.txt b.txt',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(result.result.exitCode).toBe(0);
    expect(result.result.stdout).toBe('');
    expect(result.result.stderr).toBe('');
  });

  test('returns a shell-style diff error when a file is missing', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem({
      '/workspace/a.txt': 'same\ntext\n',
    });

    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'diff a.txt missing.txt',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(result.result.exitCode).toBe(1);
    expect(result.result.stderr).toBe("diff: cannot open 'missing.txt': No such file or directory.");
  });

  test('creates, lists, updates, and clears tasklist items', async () => {
    const added = await executeToolCall(
      {
        name: 'tasklist',
        arguments: {
          command: 'new',
          item: 'Draft release notes',
        },
      },
      {
        conversation: taskListConversation,
      }
    );
    expect(added.result).toEqual({
      items: [
        {
          index: 0,
          text: 'Draft release notes',
          status: 0,
        },
      ],
    });
    appendTaskListToolResult(
      taskListConversation,
      {
        command: 'new',
        item: 'Draft release notes',
      },
      added.result
    );

    const updated = await executeToolCall(
      {
        name: 'tasklist',
        arguments: {
          command: 'update',
          index: 0,
          status: 1,
        },
      },
      {
        conversation: taskListConversation,
      }
    );
    expect(updated.result).toEqual({
      items: [
        {
          index: 0,
          text: 'Draft release notes',
          status: 1,
        },
      ],
    });
    appendTaskListToolResult(
      taskListConversation,
      {
        command: 'update',
        index: 0,
        status: 1,
      },
      updated.result
    );

    const listed = await executeToolCall(
      {
        name: 'tasklist',
        arguments: {
          command: 'list',
        },
      },
      {
        conversation: taskListConversation,
      }
    );
    expect(listed.result).toEqual({
      items: [
        {
          index: 0,
          text: 'Draft release notes',
          status: 1,
        },
      ],
    });

    const cleared = await executeToolCall(
      {
        name: 'tasklist',
        arguments: {
          command: 'clear',
        },
      },
      {
        conversation: taskListConversation,
      }
    );
    expect(cleared.result).toEqual({
      items: [],
    });
  });

  test('sanitizes tasklist item whitespace before storing', async () => {
    const added = await executeToolCall(
      {
        name: 'tasklist',
        arguments: {
          command: 'new',
          item: '  Draft\n\nrelease\t notes  ',
        },
      },
      {
        conversation: taskListConversation,
      }
    );

    expect(added.result).toEqual({
      items: [
        {
          index: 0,
          text: 'Draft release notes',
          status: 0,
        },
      ],
    });
  });

  test('rejects fenced code blocks in tasklist items', async () => {
    await expect(
      executeToolCall(
        {
          name: 'tasklist',
          arguments: {
            command: 'new',
            item: '```js const x = 1; ```',
          },
        },
        {
          conversation: taskListConversation,
        }
      )
    ).rejects.toThrow('tasklist item must be plain language, not a fenced code block.');
  });

  test('rejects json-style tool calls in tasklist items', async () => {
    await expect(
      executeToolCall(
        {
          name: 'tasklist',
          arguments: {
            command: 'new',
            item: '{"name":"get_current_date_time","parameters":{}}',
          },
        },
        {
          conversation: taskListConversation,
        }
      )
    ).rejects.toThrow('tasklist item must be plain language, not a JSON tool call.');
  });
});
