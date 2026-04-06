import { describe, expect, test } from 'vitest';
import { parseThinkingText } from '../../src/llm/thinking-parser.js';

describe('thinking-parser', () => {
  test('returns plain text unchanged when no thinking tags are configured', () => {
    expect(parseThinkingText('Final answer', null)).toEqual({
      response: 'Final answer',
      thoughts: '',
      hasThinking: false,
      isThinkingComplete: false,
    });
  });

  test('strips trailing control tokens even when no thinking tags are configured', () => {
    expect(parseThinkingText('Chicago Time Zone<turn|>', null)).toEqual({
      response: 'Chicago Time Zone',
      thoughts: '',
      hasThinking: false,
      isThinkingComplete: false,
    });
  });

  test('extracts standard tagged thinking blocks', () => {
    expect(parseThinkingText('<think>scratch</think>Final answer', { open: '<think>', close: '</think>' })).toEqual({
      response: 'Final answer',
      thoughts: 'scratch',
      hasThinking: true,
      isThinkingComplete: true,
    });
  });

  test('extracts Gemma channel thinking blocks and strips the channel label', () => {
    expect(
      parseThinkingText('<|channel>thought\nconsidering options<channel|>Final answer', {
        open: '<|channel>',
        close: '<channel|>',
        stripLeadingText: 'thought',
      }),
    ).toEqual({
      response: 'Final answer',
      thoughts: 'considering options',
      hasThinking: true,
      isThinkingComplete: true,
    });
  });

  test('strips trailing turn-control tags from the visible response after Gemma thinking', () => {
    expect(
      parseThinkingText('<|channel>thought\nconsidering options<channel|>Final answer<turn>', {
        open: '<|channel>',
        close: '<channel|>',
        stripLeadingText: 'thought',
      })
    ).toEqual({
      response: 'Final answer',
      thoughts: 'considering options',
      hasThinking: true,
      isThinkingComplete: true,
    });
  });

  test('strips trailing end-of-turn tokens from the visible response after thinking', () => {
    expect(
      parseThinkingText(
        '<|channel>thought\nconsidering options<channel|>Final answer<end_of_turn>',
        {
          open: '<|channel>',
          close: '<channel|>',
          stripLeadingText: 'thought',
        }
      )
    ).toEqual({
      response: 'Final answer',
      thoughts: 'considering options',
      hasThinking: true,
      isThinkingComplete: true,
    });
  });
});
