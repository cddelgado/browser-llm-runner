import { beforeEach, describe, expect, test } from 'vitest';
import {
  buildToolCallingSystemPrompt,
  executeToolCall,
  getToolDisplayName,
  getEnabledToolDefinitions,
  sniffToolCalls,
} from '../../src/llm/tool-calling.js';
import { createConversation } from '../../src/state/conversation-model.js';

let taskListConversation;

beforeEach(async () => {
  taskListConversation = createConversation({
    id: 'conversation-tasklist',
  });
  await executeToolCall({
    name: 'tasklist',
    arguments: {
      command: 'clear',
    },
  }, {
    conversation: taskListConversation,
  });
});

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

    expect(prompt).toContain('Enabled tools: get_current_date_time.');
    expect(prompt).toContain('After you receive a tool result, use it to answer the user naturally.');
    expect(prompt).toContain('Available tool definitions:');
    expect(prompt).toContain('Parameters schema: {"type":"object","properties":{},"additionalProperties":false}');
    expect(prompt).toContain(
      'Use this shape: {"name":"<tool-name>","parameters":{...}}.'
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

    expect(prompt).toContain('Wrap the JSON object in <tool_call> and </tool_call>.');
    expect(prompt).toContain(
      'Use this JSON shape inside the tags: {"name":"<tool-name>","arguments":{...}}.'
    );
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

    expect(prompt).toContain(
      'For get_user_location: use the returned location and coordinate directly in your answer.'
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
      'For tasklist: when you need help preserving multi-step work, call tasklist with empty arguments first to reveal syntax.'
    );
    expect(prompt).toContain(
      'Task lists are important because context may be short, so next steps are easy to forget.'
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

    expect(prompt).toContain('Wrap the call in <|tool_call_start|>[ and ]<|tool_call_end|>.');
    expect(prompt).toContain(
      'Use this shape inside the wrapper: tool_name(arg1="value1", arg2="value2").'
    );
  });

  test('returns a friendly tool display name', () => {
    expect(getToolDisplayName('get_current_date_time')).toBe('Get Date and Time');
    expect(getToolDisplayName('get_user_location')).toBe('Get User Location');
    expect(getToolDisplayName('tasklist')).toBe('Task List Planner');
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
      ])
    );
  });

  test('lists none when no tools are enabled', () => {
    const prompt = buildToolCallingSystemPrompt(
      {
        format: 'json',
        nameKey: 'name',
        argumentsKey: 'arguments',
      },
      []
    );

    expect(prompt).toContain('Enabled tools: none.');
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

  test('sniffs tagged json tool calls', () => {
    expect(
      sniffToolCalls('<tool_call>\n{"name":"lookup_fact","arguments":{"topic":"stars"}}\n</tool_call>', {
        format: 'tagged-json',
        nameKey: 'name',
        argumentsKey: 'arguments',
        openTag: '<tool_call>',
        closeTag: '</tool_call>',
      })
    ).toEqual([
      {
        name: 'lookup_fact',
        arguments: { topic: 'stars' },
        rawText: '{"name":"lookup_fact","arguments":{"topic":"stars"}}',
        format: 'tagged-json',
      },
    ]);
  });

  test('sniffs special-token function calls', () => {
    expect(
      sniffToolCalls('<|tool_call_start|>[get_weather(location="Milwaukee, WI", unit="fahrenheit")]<|tool_call_end|>', {
        format: 'special-token-call',
        callOpen: '<|tool_call_start|>[',
        callClose: ']<|tool_call_end|>',
      })
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
    expect(result.result.importance).toBe(
      'Task lists are important because context may be short, so next steps are easy to forget.'
    );
    expect(result.result.syntax).toEqual([
      "tasklist\n  'new',\n  'Task item',\n  index",
      "tasklist\n  'list'",
      "tasklist\n  'clear'",
      "tasklist\n  'update',\n  index,\n  status:bool (0=undone, 1=done)",
    ]);
  });

  test('creates, lists, updates, and clears tasklist items', async () => {
    const added = await executeToolCall({
      name: 'tasklist',
      arguments: {
        command: 'new',
        item: 'Draft release notes',
      },
    }, {
      conversation: taskListConversation,
    });
    expect(added.result.added).toEqual({
      index: 0,
      text: 'Draft release notes',
      status: 0,
    });

    const updated = await executeToolCall({
      name: 'tasklist',
      arguments: {
        command: 'update',
        index: 0,
        status: 1,
      },
    }, {
      conversation: taskListConversation,
    });
    expect(updated.result.updated).toEqual({
      index: 0,
      text: 'Draft release notes',
      status: 1,
    });

    const listed = await executeToolCall({
      name: 'tasklist',
      arguments: {
        command: 'list',
      },
    }, {
      conversation: taskListConversation,
    });
    expect(listed.result).toEqual({
      items: [
        {
          index: 0,
          text: 'Draft release notes',
          status: 1,
        },
      ],
      total: 1,
      done: 1,
      undone: 0,
    });

    const cleared = await executeToolCall({
      name: 'tasklist',
      arguments: {
        command: 'clear',
      },
    }, {
      conversation: taskListConversation,
    });
    expect(cleared.result).toEqual({
      clearedCount: 1,
      items: [],
    });
    expect(taskListConversation.taskList).toEqual([]);
  });
});
