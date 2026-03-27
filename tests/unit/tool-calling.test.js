import { describe, expect, test } from 'vitest';
import {
  buildToolCallingSystemPrompt,
  executeToolCall,
  getToolDisplayName,
  getEnabledToolDefinitions,
  sniffToolCalls,
} from '../../src/llm/tool-calling.js';

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
    expect(getToolDisplayName('lookup_fact')).toBe('Lookup Fact');
  });

  test('includes the user location tool definition', () => {
    expect(getEnabledToolDefinitions()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'get_user_location',
          displayName: 'Get User Location',
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
});
