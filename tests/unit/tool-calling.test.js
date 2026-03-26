import { describe, expect, test } from 'vitest';
import { buildToolCallingSystemPrompt } from '../../src/llm/tool-calling.js';

describe('tool-calling prompt builder', () => {
  test('builds the Llama json tool-calling prompt', () => {
    const prompt = buildToolCallingSystemPrompt(
      {
        format: 'json',
        nameKey: 'name',
        argumentsKey: 'parameters',
      },
      ['get_weather']
    );

    expect(prompt).toContain('Enabled tools: get_weather.');
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
});
