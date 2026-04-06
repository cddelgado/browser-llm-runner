import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  buildToolCallingSystemPrompt,
  executeToolCall,
  getToolDisplayName,
  getEnabledToolDefinitions,
  sniffToolCalls,
} from '../../src/llm/tool-calling.js';
import {
  buildShellToolResponseEnvelope,
  MAX_SHELL_TOOL_OUTPUT_LENGTH,
} from '../../src/llm/shell-command-tool.js';
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
      if (normalizedPath === '/workspace') {
        throw new Error('Deleting /workspace is not allowed.');
      }
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
          (directoryPath) =>
            directoryPath !== normalizedPath && directoryPath.startsWith(childPrefix)
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
    expect(prompt).toContain('\n\n**Tool behavior:**');
    expect(prompt).toContain('\n\n**Tool call format:**');
    expect(prompt).toContain('After a tool result, continue the work and answer naturally.');
    expect(prompt).toContain(
      'When you call a tool, output exactly one JSON object and nothing else.'
    );
    expect(prompt).toContain('Shape: {"name":"<tool-name>","parameters":{...}}.');
    expect(prompt).toContain(
      'Use an empty "parameters" object ({"parameters":{}}) only when the tool takes no inputs'
    );
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
    expect(prompt).toContain(
      'Use an empty "arguments" object ({"arguments":{}}) only when the tool takes no inputs'
    );
  });

  test('builds the XML tool-calling prompt', () => {
    const prompt = buildToolCallingSystemPrompt(
      {
        format: 'xml-tool-call',
      },
      ['lookup_fact']
    );

    expect(prompt).toContain(
      'When you call a tool, output exactly one XML tool-call block and nothing else.'
    );
    expect(prompt).toContain('Wrap the call in <tool_call>...</tool_call>.');
    expect(prompt).toContain('Inside it, use one nested <function=tool_name>...</function> block.');
    expect(prompt).toContain(
      'Represent each argument as its own <parameter=argument_name>value</parameter> block.'
    );
  });

  test('builds the Gemma special-token tool-calling prompt', () => {
    const prompt = buildToolCallingSystemPrompt(
      {
        format: 'gemma-special-token-call',
      },
      ['lookup_fact']
    );

    expect(prompt).toContain(
      'When you call a tool, output exactly one Gemma-style tool-call block and nothing else.'
    );
    expect(prompt).toContain('Wrap the call in <|tool_call> and <tool_call|>.');
    expect(prompt).toContain(
      'Shape inside the wrapper: call:tool_name{arg1:<|"|>value1<|"|>, arg2:2}.'
    );
    expect(prompt).toContain('Use <|"|>...<|"|> around string values.');
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
      '- tasklist: Manage a task list for multi-step work. Call with an empty arguments object to get tool syntax.'
    );
    expect(prompt).toContain('- Call with an empty arguments object to get tool syntax.');
  });

  test('adds a web lookup instruction', () => {
    const prompt = buildToolCallingSystemPrompt(
      {
        format: 'json',
        nameKey: 'name',
        argumentsKey: 'parameters',
      },
      ['web_lookup']
    );

    expect(prompt).toContain('- web_lookup: Interact with the web by calling {"input":"..."}.');
    expect(prompt).toContain('- When input is a URL, fetch a page preview');
    expect(prompt).toContain(
      '- When input is search terms, DuckDuckgo is used to return search results.'
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
      '- run_shell_command: Passes a shell command to an emulated Linux shell starting in /workspace. Call with an empty arguments object to get syntax and supported commands. Files are in /workspace.'
    );
    expect(prompt).toContain(
      '- Call with an empty arguments object to get syntax and supported commands.'
    );
    expect(prompt).toContain('- The shell includes python.');
    expect(prompt).toContain('- Prefer write_python_file for larger scripts.');
  });

  test('adds a python file writing instruction', () => {
    const prompt = buildToolCallingSystemPrompt(
      {
        format: 'json',
        nameKey: 'name',
        argumentsKey: 'parameters',
      },
      ['write_python_file']
    );

    expect(prompt).toContain(
      '- write_python_file: Writes Python source code to a .py file under /workspace.'
    );
    expect(prompt).toContain('Use this for longer Python scripts.');
    expect(prompt).toContain(
      'Call with {"path":"/workspace/script.py","source":"print(\\"hello\\")\\n"}.'
    );
  });

  test('lists MCP helper tools alongside the other tools when enabled MCP servers exist', () => {
    const prompt = buildToolCallingSystemPrompt(
      {
        format: 'json',
        nameKey: 'name',
        argumentsKey: 'parameters',
      },
      ['list_mcp_server_commands', 'call_mcp_server_command'],
      [
        {
          name: 'list_mcp_server_commands',
          description: 'Lists the enabled commands for one configured MCP server.',
        },
        {
          name: 'call_mcp_server_command',
          description: 'Calls one enabled command on one configured MCP server.',
        },
      ],
      {
        mcpServers: [
          {
            identifier: 'docs',
            endpoint: 'https://example.com/mcp',
            displayName: 'Docs',
            description: 'Project documentation lookup.',
            enabled: true,
            commands: [
              {
                name: 'search_docs',
                enabled: true,
                inputSchema: {
                  type: 'object',
                  properties: {
                    query: {
                      type: 'string',
                    },
                  },
                  required: ['query'],
                },
              },
            ],
          },
        ],
      }
    );

    expect(prompt).toContain('**Tools available in this conversation:**');
    expect(prompt).toContain(
      '- list_mcp_server_commands: Lists the enabled commands for one configured MCP server.'
    );
    expect(prompt).toContain(
      '- Use this first when you need to inspect one enabled MCP server.'
    );
    expect(prompt).toContain('- Call with {"server":"server_identifier"}.');
    expect(prompt).toContain(
      '- call_mcp_server_command: Calls one enabled command on one configured MCP server.'
    );
    expect(prompt).toContain(
      '- Use this after discovery to call one enabled MCP command.'
    );
    expect(prompt).toContain(
      '- Call with {"server":"server_identifier","command":"command_name","arguments":{...}}.'
    );
    expect(prompt).toContain('**Available MCP servers:**');
    expect(prompt).toContain(
      'Use call_mcp_server_command with a server identifier and one of that server\'s enabled command names.'
    );
    expect(prompt).toContain(
      '  - docs: Project documentation lookup. Enabled commands: search_docs.'
    );
    expect(prompt).toContain('**Tool call format:**');
  });

  test('notifies shell callbacks when run_shell_command executes', async () => {
    const onShellCommandStart = vi.fn();
    const onShellCommandComplete = vi.fn();

    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          cmd: 'pwd',
        },
      },
      {
        onShellCommandStart,
        onShellCommandComplete,
        workspaceFileSystem: createMockWorkspaceFileSystem(),
      }
    );

    expect(onShellCommandStart).toHaveBeenCalledWith({
      command: 'pwd',
      currentWorkingDirectory: '/workspace',
    });
    expect(onShellCommandComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'pwd',
        currentWorkingDirectory: '/workspace',
        exitCode: 0,
        stdout: '/workspace',
      })
    );
    expect(result.result.stdout).toBe('/workspace');
  });

  test('rejects execution when a known tool is disabled in runtime context', async () => {
    await expect(
      executeToolCall(
        {
          name: 'run_shell_command',
          arguments: {
            cmd: 'pwd',
          },
        },
        {
          enabledToolNames: ['tasklist'],
          workspaceFileSystem: createMockWorkspaceFileSystem(),
        }
      )
    ).rejects.toThrow('Tool is disabled: run_shell_command');
  });

  test('lists only enabled MCP commands for an enabled server', async () => {
    const result = await executeToolCall(
      {
        name: 'list_mcp_server_commands',
        arguments: {
          server: 'docs',
        },
      },
      {
        enabledToolNames: [],
        mcpServers: [
          {
            identifier: 'docs',
            endpoint: 'https://example.com/mcp',
            displayName: 'Docs',
            description: 'Project documentation lookup.',
            enabled: true,
            commands: [
              {
                name: 'search_docs',
                description: 'Search documentation pages.',
                enabled: true,
                inputSchema: {
                  type: 'object',
                  properties: {
                    query: {
                      type: 'string',
                    },
                  },
                  required: ['query'],
                },
              },
              {
                name: 'delete_docs',
                description: 'Disabled command.',
                enabled: false,
                inputSchema: {
                  type: 'object',
                },
              },
            ],
          },
        ],
      }
    );

    expect(result.result).toEqual({
      server: 'docs',
      name: 'Docs',
      description: 'Project documentation lookup.',
      commands: [
        {
          name: 'search_docs',
          description: 'Search documentation pages.',
          inputSchema: {
            type: 'object',
            required: ['query'],
            properties: {
              query: {
                type: 'string',
              },
            },
          },
          inputSummary: 'Required: query. Fields: query (string).',
        },
      ],
    });
  });

  test('calls an enabled MCP command through the existing tool harness', async () => {
    const fetchRef = vi
      .fn()
      .mockResolvedValueOnce(
        new globalThis.Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 'initialize',
            result: {
              protocolVersion: '2025-03-26',
              serverInfo: {
                name: 'Docs',
                version: '1.0.0',
              },
              capabilities: {
                tools: {},
              },
            },
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'MCP-Session-Id': 'session-1',
            },
          }
        )
      )
      .mockResolvedValueOnce(new globalThis.Response('', { status: 202 }))
      .mockResolvedValueOnce(
        new globalThis.Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 'tools-call-search_docs',
            result: {
              content: [
                {
                  type: 'text',
                  text: 'Result from MCP.',
                },
              ],
              structuredContent: {
                answer: 'Result from MCP.',
              },
            },
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )
      );

    const result = await executeToolCall(
      {
        name: 'call_mcp_server_command',
        arguments: {
          server: 'docs',
          command: 'search_docs',
          arguments: {
            query: 'routing',
          },
        },
      },
      {
        enabledToolNames: [],
        fetchRef,
        mcpServers: [
          {
            identifier: 'docs',
            endpoint: 'https://example.com/mcp',
            displayName: 'Docs',
            description: 'Project documentation lookup.',
            enabled: true,
            commands: [
              {
                name: 'search_docs',
                enabled: true,
                inputSchema: {
                  type: 'object',
                  properties: {
                    query: {
                      type: 'string',
                    },
                  },
                },
              },
            ],
          },
        ],
      }
    );

    expect(fetchRef).toHaveBeenCalledTimes(3);
    expect(fetchRef.mock.calls[2][1].body).toContain('"method":"tools/call"');
    expect(result.result).toEqual({
      status: 'success',
      server: 'docs',
      command: 'search_docs',
      body: 'Result from MCP.',
      structuredContent: {
        answer: 'Result from MCP.',
      },
      content: [
        {
          type: 'text',
          text: 'Result from MCP.',
        },
      ],
    });
    expect(result.resultText).toBe(
      JSON.stringify({
        status: 'success',
        server: 'docs',
        command: 'search_docs',
        body: 'Result from MCP.',
      })
    );
  });

  test('trims long MCP command responses in the serialized tool result', async () => {
    const longBody = 'A'.repeat(700);
    const fetchRef = vi
      .fn()
      .mockResolvedValueOnce(
        new globalThis.Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 'initialize',
            result: {
              protocolVersion: '2025-03-26',
              serverInfo: {
                name: 'Docs',
                version: '1.0.0',
              },
              capabilities: {
                tools: {},
              },
            },
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'MCP-Session-Id': 'session-1',
            },
          }
        )
      )
      .mockResolvedValueOnce(new globalThis.Response('', { status: 202 }))
      .mockResolvedValueOnce(
        new globalThis.Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 'tools-call-search_docs',
            result: {
              content: [
                {
                  type: 'text',
                  text: longBody,
                },
              ],
            },
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )
      );

    const result = await executeToolCall(
      {
        name: 'call_mcp_server_command',
        arguments: {
          server: 'docs',
          command: 'search_docs',
          arguments: {
            query: 'routing',
          },
        },
      },
      {
        enabledToolNames: [],
        fetchRef,
        generationConfig: {
          maxContextTokens: 8192,
        },
        mcpServers: [
          {
            identifier: 'docs',
            endpoint: 'https://example.com/mcp',
            displayName: 'Docs',
            description: 'Project documentation lookup.',
            enabled: true,
            commands: [
              {
                name: 'search_docs',
                enabled: true,
                inputSchema: {
                  type: 'object',
                  properties: {
                    query: {
                      type: 'string',
                    },
                  },
                },
              },
            ],
          },
        ],
      }
    );

    expect(result.result.body).toBe(longBody);
    expect(result.resultText).toBe(
      JSON.stringify({
        status: 'success',
        server: 'docs',
        command: 'search_docs',
        body: longBody.slice(0, 491),
        message:
          'This response was too long, so it was trimmed to 491 characters. Feel free to make another request if necessary.',
      })
    );
  });

  test('trims long MCP command failures in the serialized tool result', async () => {
    const longError = `Server error: ${'B'.repeat(700)}`;

    const result = await executeToolCall(
      {
        name: 'call_mcp_server_command',
        arguments: {
          server: 'docs',
          command: 'search_docs',
        },
      },
      {
        enabledToolNames: [],
        generationConfig: {
          maxContextTokens: 8192,
        },
        fetchRef: vi.fn(async () => {
          throw new Error(longError);
        }),
        mcpServers: [
          {
            identifier: 'docs',
            endpoint: 'https://example.com/mcp',
            displayName: 'Docs',
            description: 'Project documentation lookup.',
            enabled: true,
            commands: [
              {
                name: 'search_docs',
                enabled: true,
                inputSchema: {
                  type: 'object',
                },
              },
            ],
          },
        ],
      }
    );

    expect(result.result).toBeNull();
    expect(result.resultText).toBe(
      JSON.stringify({
        status: 'failed',
        body: longError.slice(0, 491),
        message:
          'This response was too long, so it was trimmed to 491 characters. Feel free to make another request if necessary.',
      })
    );
  });

  test('accepts a direct enabled MCP command name as a call alias', async () => {
    const fetchRef = vi
      .fn()
      .mockResolvedValueOnce(
        new globalThis.Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 'initialize',
            result: {
              protocolVersion: '2025-03-26',
              serverInfo: {
                name: 'Docs',
                version: '1.0.0',
              },
              capabilities: {
                tools: {},
              },
            },
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'MCP-Session-Id': 'session-1',
            },
          }
        )
      )
      .mockResolvedValueOnce(new globalThis.Response('', { status: 202 }))
      .mockResolvedValueOnce(
        new globalThis.Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 'tools-call-search_docs',
            result: {
              content: [
                {
                  type: 'text',
                  text: 'Alias result.',
                },
              ],
            },
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )
      );

    const result = await executeToolCall(
      {
        name: 'search_docs',
        arguments: {
          query: 'routing',
        },
      },
      {
        enabledToolNames: [],
        fetchRef,
        mcpServers: [
          {
            identifier: 'docs',
            endpoint: 'https://example.com/mcp',
            displayName: 'Docs',
            description: 'Project documentation lookup.',
            enabled: true,
            commands: [
              {
                name: 'search_docs',
                enabled: true,
                inputSchema: {
                  type: 'object',
                  properties: {
                    query: {
                      type: 'string',
                    },
                  },
                },
              },
            ],
          },
        ],
      }
    );

    expect(fetchRef).toHaveBeenCalledTimes(3);
    expect(fetchRef.mock.calls[2][1].body).toContain('"method":"tools/call"');
    expect(fetchRef.mock.calls[2][1].body).toContain('"name":"search_docs"');
    expect(fetchRef.mock.calls[2][1].body).toContain('"query":"routing"');
    expect(result.toolName).toBe('search_docs');
    expect(result.arguments).toEqual({
      server: 'docs',
      command: 'search_docs',
      arguments: {
        query: 'routing',
      },
    });
    expect(result.result).toEqual({
      status: 'success',
      server: 'docs',
      command: 'search_docs',
      body: 'Alias result.',
      structuredContent: null,
      content: [
        {
          type: 'text',
          text: 'Alias result.',
        },
      ],
    });
  });

  test('rejects a direct MCP command alias when multiple enabled servers expose the same command', async () => {
    await expect(
      executeToolCall(
        {
          name: 'search_docs',
          arguments: {
            query: 'routing',
          },
        },
        {
          enabledToolNames: [],
          mcpServers: [
            {
              identifier: 'docs',
              endpoint: 'https://example.com/mcp',
              displayName: 'Docs',
              enabled: true,
              commands: [{ name: 'search_docs', enabled: true, inputSchema: { type: 'object' } }],
            },
            {
              identifier: 'microsoft',
              endpoint: 'https://example.net/mcp',
              displayName: 'Microsoft Docs',
              enabled: true,
              commands: [{ name: 'search_docs', enabled: true, inputSchema: { type: 'object' } }],
            },
          ],
        }
      )
    ).rejects.toThrow('Tool name is ambiguous across enabled MCP servers: search_docs');
  });

  test('does not notify shell callbacks when run_shell_command fails before execution starts', async () => {
    const onShellCommandStart = vi.fn();
    const onShellCommandComplete = vi.fn();

    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          cmd: 'grep -o "<a href="[^"]*"" canvas_canvas.html',
        },
      },
      {
        onShellCommandStart,
        onShellCommandComplete,
        workspaceFileSystem: createMockWorkspaceFileSystem(),
      }
    );

    expect(onShellCommandStart).not.toHaveBeenCalled();
    expect(onShellCommandComplete).not.toHaveBeenCalled();
    expect(result.result.exitCode).toBe(2);
    expect(result.result.stderr).toContain('shell: unterminated escape or quote.');
    expect(result.resultText).toBe(
      JSON.stringify({
        status: 'failed',
        body: 'shell: unterminated escape or quote.\nThe shell command could not be parsed. Please try again with balanced quotes and escapes.',
      })
    );
  });

  test('builds the LFM function-style tool-calling prompt', () => {
    const prompt = buildToolCallingSystemPrompt(
      {
        toolListFormat: 'json',
        format: 'special-token-call',
        callOpen: '<|tool_call_start|>[',
        callClose: ']<|tool_call_end|>',
      },
      ['get_weather'],
      [
        {
          name: 'get_weather',
          description: 'Returns the current weather for a location.',
          parameters: {
            type: 'object',
            properties: {
              location: {
                type: 'string',
              },
            },
            required: ['location'],
            additionalProperties: false,
          },
        },
      ]
    );

    expect(prompt).toContain(
      'List of tools: [{"name":"get_weather","description":"Returns the current weather for a location.","parameters":{"type":"object","properties":{"location":{"type":"string"}},"required":["location"],"additionalProperties":false}}]'
    );
    expect(prompt).not.toContain('**Tools available in this conversation:**');
    expect(prompt).toContain(
      'When you call a tool, output exactly one wrapped function-style call and nothing else.'
    );
    expect(prompt).toContain('Wrap the call in <|tool_call_start|>[ and ]<|tool_call_end|>.');
    expect(prompt).toContain('Shape inside the wrapper: tool_name(arg1="value1", arg2="value2").');
  });

  test('keeps MCP inventory markdown for LFM and includes MCP helper tools in the json tool list', () => {
    const prompt = buildToolCallingSystemPrompt(
      {
        toolListFormat: 'json',
        format: 'special-token-call',
        callOpen: '<|tool_call_start|>[',
        callClose: ']<|tool_call_end|>',
      },
      ['list_mcp_server_commands', 'call_mcp_server_command'],
      [
        {
          name: 'list_mcp_server_commands',
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
          name: 'call_mcp_server_command',
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
      ],
      {
        mcpServers: [
          {
            identifier: 'docs',
            endpoint: 'https://example.com/mcp',
            displayName: 'Docs',
            description: 'Project documentation lookup.',
            enabled: true,
            commands: [
              {
                name: 'search_docs',
                enabled: true,
              },
            ],
          },
        ],
      }
    );

    expect(prompt).toContain('List of tools: [{"name":"list_mcp_server_commands"');
    expect(prompt).toContain('"name":"call_mcp_server_command"');
    expect(prompt).toContain('**Available MCP servers:**');
    expect(prompt).toContain(
      '  - docs: Project documentation lookup. Enabled commands: search_docs.'
    );
    expect(prompt).not.toContain('Available MCP servers: [{"identifier":"docs"');
  });

  test('returns a friendly tool display name', () => {
    expect(getToolDisplayName('get_current_date_time')).toBe('Get Date and Time');
    expect(getToolDisplayName('get_user_location')).toBe('Get User Location');
    expect(getToolDisplayName('tasklist')).toBe('Task List Planner');
    expect(getToolDisplayName('web_lookup')).toBe('Web Lookup');
    expect(getToolDisplayName('write_python_file')).toBe('Write Python File');
    expect(getToolDisplayName('run_shell_command')).toBe('Shell Command Runner');
    expect(getToolDisplayName('lookup_fact')).toBe('Lookup Fact');
  });

  test('includes the enabled tool definitions and excludes disabled web lookup', () => {
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
          name: 'write_python_file',
          displayName: 'Write Python File',
        }),
        expect.objectContaining({
          name: 'run_shell_command',
          displayName: 'Shell Command Runner',
        }),
      ])
    );
    expect(getEnabledToolDefinitions()).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'web_lookup',
        }),
      ])
    );
  });

  test('filters enabled tool definitions to the requested available subset', () => {
    expect(getEnabledToolDefinitions(['tasklist', 'run_shell_command'])).toEqual([
      expect.objectContaining({
        name: 'tasklist',
      }),
      expect.objectContaining({
        name: 'run_shell_command',
      }),
    ]);
  });

  test('builds tool-calling prompt content only for the enabled tool subset', () => {
    const prompt = buildToolCallingSystemPrompt(
      {
        format: 'json',
        nameKey: 'name',
        argumentsKey: 'parameters',
      },
      ['tasklist'],
      getEnabledToolDefinitions(['tasklist'])
    );

    expect(prompt).toContain('- tasklist: Manage a task list for multi-step work.');
    expect(prompt).not.toContain('run_shell_command');
    expect(prompt).not.toContain('write_python_file');
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

  test('sniffs XML tool calls', () => {
    expect(
      sniffToolCalls(
        '<tool_call><function=lookup_fact><parameter=topic>stars</parameter><parameter=count>2</parameter></function></tool_call>',
        {
          format: 'xml-tool-call',
        }
      )
    ).toEqual([
      {
        name: 'lookup_fact',
        arguments: { topic: 'stars', count: 2 },
        rawText:
          '<tool_call><function=lookup_fact><parameter=topic>stars</parameter><parameter=count>2</parameter></function></tool_call>',
        format: 'xml-tool-call',
      },
    ]);
  });

  test('sniffs Gemma special-token tool calls', () => {
    expect(
      sniffToolCalls(
        '<|tool_call>call:lookup_fact{topic:<|"|>stars<|"|>, filters:{kind:<|"|>science<|"|>}, count:2}<tool_call|>',
        {
          format: 'gemma-special-token-call',
        }
      )
    ).toEqual([
      {
        name: 'lookup_fact',
        arguments: {
          topic: 'stars',
          filters: { kind: 'science' },
          count: 2,
        },
        rawText:
          '<|tool_call>call:lookup_fact{topic:<|"|>stars<|"|>, filters:{kind:<|"|>science<|"|>}, count:2}<tool_call|>',
        format: 'gemma-special-token-call',
      },
    ]);
  });

  test('sniffs bare Gemma special-token tool calls without wrappers', () => {
    expect(
      sniffToolCalls('call:get_user_location{}', {
        format: 'gemma-special-token-call',
      })
    ).toEqual([
      {
        name: 'get_user_location',
        arguments: {},
        rawText: 'call:get_user_location{}',
        format: 'gemma-special-token-call',
      },
    ]);
  });

  test('sniffs a leading bare Gemma tool call even with trailing prose', () => {
    expect(
      sniffToolCalls('call:get_user_location{}\nI will answer after the tool result.', {
        format: 'gemma-special-token-call',
      })
    ).toEqual([
      {
        name: 'get_user_location',
        arguments: {},
        rawText: 'call:get_user_location{}',
        format: 'gemma-special-token-call',
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

  test('does not sniff a malformed run_shell_command json tool call when inner shell quotes are not escaped', () => {
    expect(
      sniffToolCalls(
        '{"name":"run_shell_command","parameters":{"command":"grep -o \'href="[^"]*\' Canvas - Canvas.html | wc -l"}}',
        {
          format: 'json',
          nameKey: 'name',
          argumentsKey: 'parameters',
        }
      )
    ).toEqual([]);
  });

  test('does not sniff a malformed run_shell_command json tool call when the shell field is cmd', () => {
    expect(
      sniffToolCalls(
        '{"name":"run_shell_command","parameters":{"cmd":"grep -o \'href="[^"]*\' Canvas - Canvas.html | wc -l"}}',
        {
          format: 'json',
          nameKey: 'name',
          argumentsKey: 'parameters',
        }
      )
    ).toEqual([]);
  });

  test('does not sniff a malformed run_shell_command json tool call after leading prose', () => {
    expect(
      sniffToolCalls(
        'I will use the shell tool now.\n{"name":"run_shell_command","parameters":{"command":"grep -o \'href="[^"]*\' Canvas - Canvas.html | wc -l"}}',
        {
          format: 'json',
          nameKey: 'name',
          argumentsKey: 'parameters',
        }
      )
    ).toEqual([]);
  });

  test('sniffs a run_shell_command json tool call with escaped quotes and backslashes intact', () => {
    expect(
      sniffToolCalls(
        '{"name":"run_shell_command","parameters":{"command":"curl -X POST -H \\"Content-Type: application/json\\" -d \\"{\\\\\\"topic\\\\\\":\\\\\\"planets\\\\\\"}\\" https://example.com/api"}}',
        {
          format: 'json',
          nameKey: 'name',
          argumentsKey: 'parameters',
        }
      )
    ).toEqual([
      {
        name: 'run_shell_command',
        arguments: {
          command:
            'curl -X POST -H "Content-Type: application/json" -d "{\\"topic\\":\\"planets\\"}" https://example.com/api',
        },
        rawText:
          '{"name":"run_shell_command","parameters":{"command":"curl -X POST -H \\"Content-Type: application/json\\" -d \\"{\\\\\\"topic\\\\\\":\\\\\\"planets\\\\\\"}\\" https://example.com/api"}}',
        format: 'json',
      },
    ]);
  });

  test('does not sniff an incomplete run_shell_command json tool call', () => {
    expect(
      sniffToolCalls(
        '{"name":"run_shell_command","parameters":{"command":"printf \\"%s\\" \\"unterminated"',
        {
          format: 'json',
          nameKey: 'name',
          argumentsKey: 'parameters',
        }
      )
    ).toEqual([]);
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
          usage: 'grep [-i] [-n] [-v] [-c] [-l] [-F] [-o] <pattern> <file>...',
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
          name: 'curl',
          usage: 'curl [-I] [-X <method>] [-H "Header: value"]... [-d <body>] [-o <file>] <url>',
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
        expect.objectContaining({
          name: 'python',
          usage: 'python <script.py> [<argument>...] | python -c "<code>" [<argument>...]',
        }),
      ])
    );
    expect(result.result.limitations).toContain(
      'Commands are GNU/Linux-like, but only the documented subset is implemented.'
    );
    expect(result.result.limitations).toContain(
      'Command text must be plain shell input, 2000 characters or fewer, and free of control characters.'
    );
    expect(result.result.limitations).toContain(
      'Relative paths resolve from the current working directory.'
    );
    expect(result.result.limitations).toContain(
      'Minimal variable support exists for $VAR, ${VAR}, NAME=value, set, and unset.'
    );
    expect(result.result.limitations).toContain(
      'Pipeline-safe commands: printf, echo, cat, head, tail, wc, sort, uniq, cut, tr, nl, grep, sed.'
    );
    expect(result.result.limitations).toContain(
      'Unsupported syntax: ;, &&, redirection, substitution, globbing.'
    );
    expect(result.result.limitations).toContain(
      'paste, join, column, file, diff, curl, and python are partial GNU/Linux-like subsets.'
    );
  });

  test('writes python source to a workspace file', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem();
    const onPythonFileWrite = vi.fn();

    const result = await executeToolCall(
      {
        name: 'write_python_file',
        arguments: {
          path: '/workspace/tools/script.py',
          source: 'print("hello")\n',
        },
      },
      {
        onPythonFileWrite,
        workspaceFileSystem,
      }
    );

    expect(result.toolName).toBe('write_python_file');
    expect(result.result.path).toBe('/workspace/tools/script.py');
    expect(result.resultText).toBe(
      JSON.stringify({
        status: 'success',
        body: 'Script successfully written to /workspace/tools/script.py.',
        message:
          'To execute the script, use {"name":"run_shell_command","parameters":{"cmd":"python /workspace/tools/script.py"}}',
      })
    );
    expect(await workspaceFileSystem.readTextFile('/workspace/tools/script.py')).toBe(
      'print("hello")\n'
    );
    expect(onPythonFileWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/workspace/tools/script.py',
        currentWorkingDirectory: '/workspace/tools',
      })
    );
  });

  test('serializes write_python_file failures with a compact failure envelope', async () => {
    const result = await executeToolCall(
      {
        name: 'write_python_file',
        arguments: {
          path: '/workspace/tools/script.txt',
          source: 'print("hello")\n',
        },
      },
      {
        workspaceFileSystem: createMockWorkspaceFileSystem(),
      }
    );

    expect(result.toolName).toBe('write_python_file');
    expect(result.result).toBeNull();
    expect(result.resultText).toBe(
      JSON.stringify({
        status: 'failed',
        body: 'write_python_file path must end in .py under /workspace.',
      })
    );
  });

  test('rejects fenced code blocks in shell commands', async () => {
    await expect(
      executeToolCall({
        name: 'run_shell_command',
        arguments: {
          command: '```sh ls```',
        },
      })
    ).rejects.toThrow(
      'run_shell_command command must be plain shell text, not a fenced code block.'
    );
  });

  test('accepts cmd as the preferred run_shell_command argument name', async () => {
    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          cmd: 'pwd',
        },
      },
      {
        workspaceFileSystem: createMockWorkspaceFileSystem(),
      }
    );

    expect(result.toolName).toBe('run_shell_command');
    expect(result.result.stdout).toBe('/workspace');
  });

  test('puts the preferred cmd usage first in empty-argument shell discovery responses', () => {
    expect(buildShellToolResponseEnvelope()).toEqual({
      status: 'success',
      body: 'Call again with {"cmd":"..."}\nCurrent working directory: /workspace\nSupported commands: pwd, basename, dirname, printf, true, false, cd, ls, cat, head, tail, wc, sort, uniq, cut, paste, join, column, tr, nl, rmdir, mkdir, mktemp, touch, cp, mv, rm, find, grep, sed, file, diff, curl, python, echo, set, unset, which',
    });
  });

  test('serializes run_shell_command execution with the shell response envelope', async () => {
    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          cmd: 'printf "hello"',
        },
      },
      {
        workspaceFileSystem: createMockWorkspaceFileSystem(),
      }
    );

    expect(result.result.stdout).toBe('hello');
    expect(result.resultText).toBe(
      JSON.stringify({
        status: 'success',
        body: 'hello',
      })
    );
  });

  test('marks oversized shell output as incomplete for the model response envelope', () => {
    const oversizedOutput = 'a'.repeat(MAX_SHELL_TOOL_OUTPUT_LENGTH + 50);

    expect(
      buildShellToolResponseEnvelope({
        command: 'cat notes.txt',
        exitCode: 0,
        stdout: oversizedOutput,
        stderr: '',
        currentWorkingDirectory: '/workspace',
      })
    ).toEqual({
      status: 'incomplete',
      body: oversizedOutput.slice(0, MAX_SHELL_TOOL_OUTPUT_LENGTH),
      message: `Output was truncated to ${MAX_SHELL_TOOL_OUTPUT_LENGTH} of ${oversizedOutput.length} characters. Retry with a command which returns targeted results.`,
    });
  });

  test('rejects run_shell_command calls that send both cmd and command', async () => {
    await expect(
      executeToolCall({
        name: 'run_shell_command',
        arguments: {
          cmd: 'pwd',
          command: 'ls',
        },
      })
    ).rejects.toThrow('run_shell_command accepts either cmd or command, not both.');
  });

  test('rejects nested json tool calls in shell commands', async () => {
    await expect(
      executeToolCall({
        name: 'run_shell_command',
        arguments: {
          command: '{"name":"get_current_date_time","parameters":{}}',
        },
      })
    ).rejects.toThrow('run_shell_command command must be plain shell text, not a JSON tool call.');
  });

  test('rejects control characters in shell commands', async () => {
    await expect(
      executeToolCall({
        name: 'run_shell_command',
        arguments: {
          command: `cat notes.txt${String.fromCharCode(7)}`,
        },
      })
    ).rejects.toThrow('run_shell_command command cannot contain control characters.');
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
    expect(result.arguments).toEqual({
      command: 'cat notes.txt',
    });
    expect(result.result).toEqual({
      shellFlavor: 'GNU/Linux-like shell subset',
      currentWorkingDirectory: '/workspace',
      command: 'cat notes.txt',
      exitCode: 0,
      stdout: 'alpha\nbeta\n',
      stderr: '',
    });
  });

  test('caps oversized shell output and returns an incomplete tool result envelope', async () => {
    const oversizedOutput = 'a'.repeat(MAX_SHELL_TOOL_OUTPUT_LENGTH + 50);
    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'cat notes.txt',
        },
      },
      {
        workspaceFileSystem: createMockWorkspaceFileSystem({
          '/workspace/notes.txt': oversizedOutput,
        }),
      }
    );

    expect(result.result.stdout).toBe(oversizedOutput);
    expect(result.result.stderr).toBe('');
    expect(result.resultText).toBe(
      JSON.stringify({
        status: 'incomplete',
        body: oversizedOutput.slice(0, MAX_SHELL_TOOL_OUTPUT_LENGTH),
        message: `Output was truncated to ${MAX_SHELL_TOOL_OUTPUT_LENGTH} of ${oversizedOutput.length} characters. Retry with a command which returns targeted results.`,
      })
    );
  });

  test('preserves escaped quotes and spaces in echoed shell text', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem();

    const quotedResult = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'echo "a \\"quoted\\" value"',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    const escapedSpaceResult = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'echo a\\ b',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(quotedResult.result.stdout).toBe('a "quoted" value');
    expect(escapedSpaceResult.result.stdout).toBe('a b');
  });

  test('preserves backslashes through printf arguments', async () => {
    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'printf "%s" "C:\\\\temp\\\\file.txt"',
        },
      },
      {
        workspaceFileSystem: createMockWorkspaceFileSystem(),
      }
    );

    expect(result.result.stdout).toBe('C:\\temp\\file.txt');
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

  test('delegates python file execution through the python runtime', async () => {
    const pythonExecutor = {
      execute: vi.fn(async ({ argv, mode, path }) => ({
        shellFlavor: 'GNU/Linux-like shell subset',
        command: argv.join(' '),
        currentWorkingDirectory: '/workspace',
        exitCode: 0,
        stdout: `ran ${mode}:${path}`,
        stderr: '',
      })),
    };
    const workspaceFileSystem = createMockWorkspaceFileSystem({
      '/workspace/script.py': 'print("hi")\n',
    });

    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'python /workspace/script.py',
        },
      },
      {
        pythonExecutor,
        workspaceFileSystem,
      }
    );

    expect(pythonExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        argv: ['python', '/workspace/script.py'],
        mode: 'file',
        path: '/workspace/script.py',
      })
    );
    expect(result.result.stdout).toBe('ran file:/workspace/script.py');
  });

  test('delegates python -c execution through the python runtime', async () => {
    const pythonExecutor = {
      execute: vi.fn(async ({ argv, mode, code }) => ({
        shellFlavor: 'GNU/Linux-like shell subset',
        command: argv.join(' '),
        currentWorkingDirectory: '/workspace',
        exitCode: 0,
        stdout: `ran ${mode}:${code}`,
        stderr: '',
      })),
    };

    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'python -c "print(2 + 2)"',
        },
      },
      {
        pythonExecutor,
        workspaceFileSystem: createMockWorkspaceFileSystem(),
      }
    );

    expect(pythonExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        argv: ['python', '-c', 'print(2 + 2)'],
        mode: 'code',
        code: 'print(2 + 2)',
      })
    );
    expect(result.result.stdout).toBe('ran code:print(2 + 2)');
  });

  test('returns a shell-style error when python interactive mode is requested', async () => {
    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'python',
        },
      },
      {
        pythonExecutor: {
          execute: vi.fn(),
        },
        workspaceFileSystem: createMockWorkspaceFileSystem(),
      }
    );

    expect(result.result).toEqual({
      shellFlavor: 'GNU/Linux-like shell subset',
      currentWorkingDirectory: '/workspace',
      command: 'python',
      exitCode: 2,
      stdout: '',
      stderr: 'python: interactive mode is not supported in this shell subset.',
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

  test('supports mkdir, touch, cp, mv, and rm for workspace files', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem({
      '/workspace/source.txt': 'alpha\nbeta\n',
    });

    const mkdirResult = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'mkdir -p coursework/drafts',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    const touchResult = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'touch coursework/drafts/notes.txt',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    const copyResult = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'cp source.txt coursework/drafts/copy.txt',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    const moveResult = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'mv coursework/drafts/copy.txt coursework/final.txt',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(mkdirResult.result.exitCode).toBe(0);
    await expect(workspaceFileSystem.stat('/workspace/coursework/drafts')).resolves.toMatchObject({
      kind: 'directory',
      path: '/workspace/coursework/drafts',
    });
    expect(touchResult.result.exitCode).toBe(0);
    await expect(
      workspaceFileSystem.readTextFile('/workspace/coursework/drafts/notes.txt')
    ).resolves.toBe('');
    expect(copyResult.result.exitCode).toBe(0);
    expect(moveResult.result.exitCode).toBe(0);
    await expect(workspaceFileSystem.readTextFile('/workspace/coursework/final.txt')).resolves.toBe(
      'alpha\nbeta\n'
    );

    const removeResult = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'rm coursework/final.txt',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(removeResult.result.exitCode).toBe(0);
    await expect(workspaceFileSystem.stat('/workspace/coursework/final.txt')).rejects.toMatchObject(
      {
        name: 'NotFoundError',
      }
    );
  });

  test('rejects cp when source and destination resolve to the same file', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem({
      '/workspace/notes.txt': 'alpha\n',
    });

    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'cp notes.txt ./notes.txt',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(result.result.exitCode).toBe(1);
    expect(result.result.stderr).toBe(
      "cp: 'notes.txt' and './notes.txt' resolve to the same file."
    );
    await expect(workspaceFileSystem.readTextFile('/workspace/notes.txt')).resolves.toBe('alpha\n');
  });

  test('rejects mv when source and destination resolve to the same file', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem({
      '/workspace/notes.txt': 'alpha\n',
    });

    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'mv notes.txt /workspace/notes.txt',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(result.result.exitCode).toBe(1);
    expect(result.result.stderr).toBe(
      "mv: 'notes.txt' and '/workspace/notes.txt' resolve to the same file."
    );
    await expect(workspaceFileSystem.readTextFile('/workspace/notes.txt')).resolves.toBe('alpha\n');
  });

  test('returns a shell-style rm error when deleting /workspace is blocked', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem({
      '/workspace/notes.txt': 'alpha\n',
    });

    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'rm -rf /workspace',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(result.result.exitCode).toBe(1);
    expect(result.result.stderr).toBe(
      "rm: cannot remove '/workspace': Deleting /workspace is not allowed."
    );
    await expect(workspaceFileSystem.readTextFile('/workspace/notes.txt')).resolves.toBe('alpha\n');
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

  test('supports head, tail, and wc over workspace text files', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem({
      '/workspace/notes.txt': 'alpha beta\ngamma\nlast line\n',
    });

    const headResult = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'head -n 2 notes.txt',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    const tailResult = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'tail -n 1 notes.txt',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    const lineCountResult = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'wc -l notes.txt',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    const wordCountResult = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'wc -w notes.txt',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    const byteCountResult = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'wc -c notes.txt',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(headResult.result.stdout).toBe('alpha beta\ngamma\n');
    expect(tailResult.result.stdout).toBe('last line\n');
    expect(lineCountResult.result.stdout).toBe('3 /workspace/notes.txt');
    expect(wordCountResult.result.stdout).toBe('5 /workspace/notes.txt');
    expect(byteCountResult.result.stdout).toBe('27 /workspace/notes.txt');
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

  test('supports text pipelines across stdin-aware shell commands', async () => {
    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'cat notes.txt | grep beta | wc -w',
        },
      },
      {
        workspaceFileSystem: createMockWorkspaceFileSystem({
          '/workspace/notes.txt': 'alpha\nbeta\ngamma\n',
        }),
      }
    );

    expect(result.result).toEqual({
      shellFlavor: 'GNU/Linux-like shell subset',
      currentWorkingDirectory: '/workspace',
      command: 'cat notes.txt | grep beta | wc -w',
      exitCode: 0,
      stdout: '1',
      stderr: '',
    });
  });

  test('rejects non-pipeline-safe commands inside pipelines', async () => {
    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'cd coursework | cat notes.txt',
        },
      },
      {
        workspaceFileSystem: createMockWorkspaceFileSystem({
          '/workspace/coursework/notes.txt': 'chapter one',
        }),
      }
    );

    expect(result.result.exitCode).toBe(2);
    expect(result.result.stderr).toContain('cd: this command is not supported inside pipelines.');
  });

  test('continues rejecting command chaining with semicolons', async () => {
    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'echo hello; pwd',
        },
      },
      {
        workspaceFileSystem: createMockWorkspaceFileSystem(),
      }
    );

    expect(result.result.exitCode).toBe(2);
    expect(result.result.stderr).toContain(
      'pipelines, redirection, command chaining, and substitutions are not supported'
    );
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

  test('keeps escaped and single-quoted shell variables literal', async () => {
    const conversation = createConversation({
      id: 'conversation-shell-literals',
    });
    const workspaceFileSystem = createMockWorkspaceFileSystem();

    await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'COURSE=biology',
        },
      },
      {
        conversation,
        workspaceFileSystem,
      }
    );

    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'echo $COURSE "$COURSE" \'$COURSE\' \\$COURSE',
        },
      },
      {
        conversation,
        workspaceFileSystem,
      }
    );

    expect(result.result.stdout).toBe('biology biology $COURSE $COURSE');
  });

  test('preserves escaped JSON payloads in curl request bodies', async () => {
    const fetchRef = vi.fn(async (_url, init = {}) => {
      expect(init).toMatchObject({
        method: 'POST',
        body: '{"topic":"planets"}',
      });
      const headers =
        init.headers instanceof globalThis.Headers
          ? init.headers
          : new globalThis.Headers(init.headers);
      expect(headers.get('Content-Type')).toBe('application/json');
      return new globalThis.Response('ok', {
        status: 200,
      });
    });

    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command:
            'curl -H "Content-Type: application/json" -d "{\\"topic\\":\\"planets\\"}" https://example.com/api',
        },
      },
      {
        workspaceFileSystem: createMockWorkspaceFileSystem(),
        fetchRef,
      }
    );

    expect(result.result.exitCode).toBe(0);
    expect(result.result.stdout).toBe('ok');
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

  test('does not treat empty variable expansion as a workspace path operand', async () => {
    const conversation = createConversation({
      id: 'conversation-shell-empty-expansion',
    });
    const workspaceFileSystem = createMockWorkspaceFileSystem({
      '/workspace/notes.txt': 'alpha\n',
    });

    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'rm -rf $MISSING_TARGET',
        },
      },
      {
        conversation,
        workspaceFileSystem,
      }
    );

    expect(result.result.exitCode).toBe(2);
    expect(result.result.stderr).toBe('rm: expected at least one path.');
    await expect(workspaceFileSystem.readTextFile('/workspace/notes.txt')).resolves.toBe('alpha\n');
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

    expect(result.result.stdout.split('\n')).toEqual(['/workspace/summary.txt']);
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

  test('supports grep -o in pipelines for match counting workflows', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem({
      '/workspace/canvas.html':
        '<a href="/one">One</a>\n<p>Skip</p>\n<a href="/two">Two</a>\n<a href="/three">Three</a>\n',
    });

    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: `grep -o 'href="[^"]*"' canvas.html | wc -l`,
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(result.result.exitCode).toBe(0);
    expect(result.result.stdout).toBe('3');
  });

  test('rejects grep -o combined with -v in this shell subset', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem({
      '/workspace/notes.txt': 'Alpha\nbeta\n',
    });

    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'grep -ov alpha notes.txt',
        },
      },
      {
        workspaceFileSystem,
      }
    );

    expect(result.result.exitCode).toBe(2);
    expect(result.result.stderr).toBe(
      'grep: the -o and -v options cannot be combined in this subset.'
    );
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
    expect(result.result.stderr).toBe(
      "file: cannot open 'missing.txt': No such file or directory."
    );
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
    expect(result.result.stderr).toBe(
      "diff: cannot open 'missing.txt': No such file or directory."
    );
  });

  test('supports curl URL with the default GET method', async () => {
    const fetchRef = vi.fn(async (url, init = {}) => {
      expect(url).toBe('https://example.com/data.txt');
      expect(init).toMatchObject({
        method: 'GET',
        body: null,
      });
      return new globalThis.Response('alpha\nbeta\n', {
        status: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
        },
      });
    });

    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'curl https://example.com/data.txt',
        },
      },
      {
        workspaceFileSystem: createMockWorkspaceFileSystem(),
        fetchRef,
      }
    );

    expect(result.result.exitCode).toBe(0);
    expect(result.result.stdout).toBe('alpha\nbeta\n');
  });

  test('supports web_lookup for HTML page previews', async () => {
    const fetchRef = vi.fn(async (url, init = {}) => {
      expect(url).toBe('https://example.com/lesson');
      expect(init).toMatchObject({
        method: 'GET',
        body: null,
      });
      const headers =
        init.headers instanceof globalThis.Headers
          ? init.headers
          : new globalThis.Headers(init.headers);
      expect(headers.get('Accept')).toContain('text/html');
      return new globalThis.Response(
        [
          '<!doctype html>',
          '<html>',
          '<head>',
          '<title>Example Lesson</title>',
          '<meta name="description" content="Student-facing lesson page.">',
          '</head>',
          '<body>',
          '<header>Ignore me</header>',
          '<main>',
          '<h1>Lesson overview</h1>',
          '<p>First paragraph.</p>',
          '<p>Second paragraph.</p>',
          '</main>',
          '<script>console.log("ignore");</script>',
          '</body>',
          '</html>',
        ].join(''),
        {
          status: 200,
          statusText: 'OK',
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
          },
        }
      );
    });

    const result = await executeToolCall(
      {
        name: 'web_lookup',
        arguments: {
          input: 'https://example.com/lesson',
        },
      },
      {
        fetchRef,
      }
    );

    expect(result.result.status).toBe('successful');
    expect(result.result.body).toContain('- MIME type: text/html; charset=utf-8');
    expect(result.result.body).toContain('- Title: Example Lesson');
    expect(result.result.body).toContain('## Summary');
    expect(result.result.body).toContain('Student-facing lesson page.');
    expect(result.result.body).toContain('First paragraph.');
    expect(result.result.body).toContain('Second paragraph.');
    expect(result.result.body).not.toContain('console.log');
    expect(result.result.message).toBeUndefined();
  });

  test('adds curl guidance when web_lookup truncates extracted content', async () => {
    const longParagraph = 'Alpha '.repeat(900);
    const fetchRef = vi.fn(async () => {
      return new globalThis.Response(
        [
          '<!doctype html>',
          '<html>',
          '<head>',
          '<title>Long Lesson</title>',
          '</head>',
          '<body>',
          '<main>',
          `<p>${longParagraph}</p>`,
          '</main>',
          '</body>',
          '</html>',
        ].join(''),
        {
          status: 200,
          statusText: 'OK',
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
          },
        }
      );
    });

    const result = await executeToolCall(
      {
        name: 'web_lookup',
        arguments: {
          input: 'https://example.com/long-lesson',
        },
      },
      {
        fetchRef,
      }
    );

    expect(result.result.status).toBe('successful');
    expect(result.result.message).toBe(
      'Extracted content limited to 4000 characters. Use the run_shell_command tool with curl to get the entire page.'
    );
  });

  test('supports web_lookup search queries and opens the search panel before fetching results', async () => {
    const events = [];
    const fetchRef = vi.fn(async (url) => {
      events.push(`fetch:${url}`);
      if (url === 'https://duckduckgo.com/?q=latest+news+about+europa&ia=web') {
        return new globalThis.Response(
          '<!doctype html><html><body>vqd="3-123456789012345678901234567890"</body></html>',
          {
            status: 200,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
            },
          }
        );
      }
      if (String(url).startsWith('https://links.duckduckgo.com/d.js?q=latest+news+about+europa')) {
        return new globalThis.Response(
          'DDG.pageLayout.load(\'d\',[{"t":"Europa update","a":"A short summary of the latest Europa update.","i":"example.com","u":"https://example.com/europa-update"}]);DDG.duckbar.load(\'images\', {});',
          {
            status: 200,
            headers: {
              'Content-Type': 'text/javascript; charset=utf-8',
            },
          }
        );
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    const onWebLookupSearchStart = vi.fn(async ({ searchUrl }) => {
      events.push(`panel:${searchUrl}`);
    });
    const onWebLookupSearchComplete = vi.fn(({ resultCount }) => {
      events.push(`complete:${resultCount}`);
    });

    const result = await executeToolCall(
      {
        name: 'web_lookup',
        arguments: {
          input: 'latest news about europa',
        },
      },
      {
        fetchRef,
        onWebLookupSearchStart,
        onWebLookupSearchComplete,
      }
    );

    expect(onWebLookupSearchStart).toHaveBeenCalledWith({
      conversationId: null,
      query: 'latest news about europa',
      panelUrl: 'https://duckduckgo.com/html/?q=latest+news+about+europa',
      searchUrl: 'https://duckduckgo.com/?q=latest+news+about+europa&ia=web',
    });
    expect(events[0]).toBe('panel:https://duckduckgo.com/?q=latest+news+about+europa&ia=web');
    expect(events[1]).toBe('fetch:https://duckduckgo.com/?q=latest+news+about+europa&ia=web');
    expect(result.result).toEqual({
      status: 'successful',
      body:
        '## Search results\n' +
        'Query: latest news about europa\n' +
        '\n' +
        '1. Europa update\n' +
        '   URL: https://example.com/europa-update\n' +
        '   Source: example.com\n' +
        '   Snippet: A short summary of the latest Europa update.',
      message: 'Use web_lookup again with one of the result URLs to read the page.',
    });
    expect(onWebLookupSearchComplete).toHaveBeenCalledWith({
      conversationId: null,
      query: 'latest news about europa',
      panelUrl: 'https://duckduckgo.com/html/?q=latest+news+about+europa',
      searchUrl: 'https://duckduckgo.com/?q=latest+news+about+europa&ia=web',
      resultCount: 1,
    });
    expect(result.resultText).toBe(
      JSON.stringify({
        status: 'successful',
        body:
          '## Search results\n' +
          'Query: latest news about europa\n' +
          '\n' +
          '1. Europa update\n' +
          '   URL: https://example.com/europa-update\n' +
          '   Source: example.com\n' +
          '   Snippet: A short summary of the latest Europa update.',
        message: 'Use web_lookup again with one of the result URLs to read the page.',
      })
    );
  });

  test('rejects http input for web_lookup', async () => {
    const result = await executeToolCall({
      name: 'web_lookup',
      arguments: {
        input: 'http://example.com/article',
      },
    });

    expect(result.result).toEqual({
      status: 'failed',
      body: 'web_lookup direct URLs must use https.',
      message:
        'Use a direct https URL and retry with a simpler page if the request or extraction fails.',
    });
  });

  test('returns a failed envelope when web_lookup input is missing', async () => {
    const result = await executeToolCall({
      name: 'web_lookup',
      arguments: {},
    });

    expect(result.result).toEqual({
      status: 'failed',
      body: 'web_lookup input must be a non-empty string.',
      message:
        'Use a direct https URL and retry with a simpler page if the request or extraction fails.',
    });
  });

  test('supports curl -I for response headers', async () => {
    const fetchRef = vi.fn(async (_url, init = {}) => {
      expect(init).toMatchObject({
        method: 'HEAD',
        body: null,
      });
      return new globalThis.Response(null, {
        status: 204,
        statusText: 'No Content',
        headers: {
          'X-Test': 'yes',
          'Content-Type': 'text/plain',
        },
      });
    });

    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'curl -I https://example.com/data.txt',
        },
      },
      {
        workspaceFileSystem: createMockWorkspaceFileSystem(),
        fetchRef,
      }
    );

    expect(result.result.exitCode).toBe(0);
    expect(result.result.stdout).toBe('HTTP 204 No Content\ncontent-type: text/plain\nx-test: yes');
  });

  test('supports curl -X, repeated -H, and -d', async () => {
    const fetchRef = vi.fn(async (_url, init = {}) => {
      expect(init).toMatchObject({
        method: 'PATCH',
        body: '{"title":"Europa"}',
      });
      const headers =
        init.headers instanceof globalThis.Headers
          ? init.headers
          : new globalThis.Headers(init.headers);
      expect(headers.get('Content-Type')).toBe('application/json');
      expect(headers.get('X-Mode')).toBe('test');
      return new globalThis.Response('updated', {
        status: 200,
      });
    });

    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command:
            'curl -X PATCH -H "Content-Type: application/json" -H "X-Mode: test" -d \'{"title":"Europa"}\' https://example.com/items/1',
        },
      },
      {
        workspaceFileSystem: createMockWorkspaceFileSystem(),
        fetchRef,
      }
    );

    expect(result.result.exitCode).toBe(0);
    expect(result.result.stdout).toBe('updated');
  });

  test('supports curl -o for writing response bytes into /workspace', async () => {
    const workspaceFileSystem = createMockWorkspaceFileSystem();
    const fetchRef = vi.fn(async () => {
      return new globalThis.Response(new Uint8Array([0x50, 0x44, 0x46]), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
        },
      });
    });

    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'curl -o downloads/report.pdf https://example.com/report.pdf',
        },
      },
      {
        workspaceFileSystem,
        fetchRef,
      }
    );

    expect(result.result.exitCode).toBe(0);
    expect(result.result.stdout).toBe('');
    await expect(workspaceFileSystem.readFile('/workspace/downloads/report.pdf')).resolves.toEqual(
      new Uint8Array([0x50, 0x44, 0x46])
    );
  });

  test('returns a shell-style curl error for forbidden browser headers', async () => {
    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'curl -H "Cookie: session=1" https://example.com/data.txt',
        },
      },
      {
        workspaceFileSystem: createMockWorkspaceFileSystem(),
      }
    );

    expect(result.result.exitCode).toBe(2);
    expect(result.result.stderr).toBe(
      "curl: header 'Cookie' is not allowed by the browser fetch API."
    );
  });

  test('returns a shell-style curl error when GET is combined with -d', async () => {
    const result = await executeToolCall(
      {
        name: 'run_shell_command',
        arguments: {
          command: 'curl -X GET -d hello https://example.com/data.txt',
        },
      },
      {
        workspaceFileSystem: createMockWorkspaceFileSystem(),
      }
    );

    expect(result.result.exitCode).toBe(2);
    expect(result.result.stderr).toBe(
      'curl: GET requests cannot include -d in the browser fetch API.'
    );
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
