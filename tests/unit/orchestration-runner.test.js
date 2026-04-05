import { describe, expect, test, vi } from 'vitest';
import {
  buildOrchestrationPrompt,
  createOrchestrationRunner,
} from '../../src/llm/orchestration-runner.js';

describe('orchestration-runner', () => {
  test('renders placeholders and response format instructions', () => {
    const prompt = buildOrchestrationPrompt(
      {
        prompt: 'Critique {{assistantResponse}} for {{userPrompt}}',
        responseFormat: {
          instructions: 'Return one short paragraph.',
        },
      },
      {
        assistantResponse: 'A rough draft',
        userPrompt: 'the original question',
      }
    );

    expect(prompt).toBe(
      'Critique A rough draft for the original question\n\nResponse format:\nReturn one short paragraph.'
    );
  });

  test('runs steps in order and exposes prior outputs to later steps', async () => {
    const generateText = vi
      .fn()
      .mockResolvedValueOnce('Needs detail')
      .mockResolvedValueOnce('Improved answer');
    const onDebug = vi.fn();
    const runner = createOrchestrationRunner({
      generateText,
      formatStepOutput: (_step, output) => output.trim(),
      onDebug,
    });

    const result = await runner(
      {
        id: 'fix-response',
        steps: [
          {
            stepName: 'Critique',
            prompt: 'Critique {{assistantResponse}}',
            outputKey: 'critique',
          },
          {
            stepName: 'Revise',
            prompt: 'Revise using {{critique}}',
          },
        ],
      },
      {
        assistantResponse: 'Draft answer',
      }
    );

    expect(generateText).toHaveBeenNthCalledWith(1, 'Critique Draft answer', {
      signal: undefined,
    });
    expect(generateText).toHaveBeenNthCalledWith(2, 'Revise using Needs detail', {
      signal: undefined,
    });
    expect(result).toEqual({
      finalPrompt: 'Revise using Needs detail',
      finalOutput: 'Improved answer',
    });
    expect(onDebug).toHaveBeenCalledWith('Orchestration completed: fix-response');
  });

  test('can prepare the final step without executing it', async () => {
    const generateText = vi.fn().mockResolvedValueOnce('Prepared context');
    const runner = createOrchestrationRunner({
      generateText,
    });

    const result = await runner(
      {
        id: 'rename-chat',
        steps: [
          { prompt: 'Summarize {{userPrompt}}', outputKey: 'summary' },
          { prompt: 'Title {{summary}}' },
        ],
      },
      {
        userPrompt: 'Why is the sky blue?',
      },
      {
        runFinalStep: false,
      }
    );

    expect(generateText).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      finalPrompt: 'Title Prepared context',
      finalOutput: '',
    });
  });

  test('supports nested placeholders', () => {
    const prompt = buildOrchestrationPrompt(
      {
        prompt: 'Chunk {{chunk.chunkIndex}} on {{chunk.pageLabel}}:\n{{chunk.text}}',
      },
      {
        chunk: {
          chunkIndex: 2,
          pageLabel: 'Pages 3-4',
          text: 'Extracted text',
        },
      }
    );

    expect(prompt).toBe('Chunk 2 on Pages 3-4:\nExtracted text');
  });

  test('supports deterministic transform, forEach, and join steps', async () => {
    const generateText = vi
      .fn()
      .mockResolvedValueOnce('## Chunk 1')
      .mockResolvedValueOnce('## Chunk 2')
      .mockResolvedValueOnce('# Final Document');
    const runner = createOrchestrationRunner({
      generateText,
      formatStepOutput: (_step, output) => output.trim(),
    });

    const result = await runner(
      {
        id: 'pdf-to-markdown',
        steps: [
          {
            type: 'transform',
            stepName: 'Chunk text',
            transform: 'chunkText',
            source: 'documentPages',
            outputKey: 'documentChunks',
            parameters: {
              maxChars: 15,
              overlapChars: 0,
              textField: 'text',
              pageField: 'pageNumber',
            },
          },
          {
            type: 'forEach',
            stepName: 'Convert chunks',
            input: 'documentChunks',
            itemName: 'chunk',
            outputKey: 'chunkMarkdown',
            prompt: 'Convert {{chunk.pageLabel}}:\n{{chunk.text}}',
          },
          {
            type: 'join',
            stepName: 'Join markdown',
            source: 'chunkMarkdown',
            outputKey: 'combinedMarkdown',
            separator: '\n\n',
          },
          {
            stepName: 'Finalize',
            prompt: 'Finalize:\n{{combinedMarkdown}}',
          },
        ],
      },
      {
        documentPages: [
          { pageNumber: 1, text: 'Alpha text.' },
          { pageNumber: 2, text: 'Bravo text.' },
        ],
      }
    );

    expect(generateText).toHaveBeenNthCalledWith(1, 'Convert Page 1:\nAlpha text.', {
      signal: undefined,
    });
    expect(generateText).toHaveBeenNthCalledWith(2, 'Convert Page 2:\nBravo text.', {
      signal: undefined,
    });
    expect(generateText).toHaveBeenNthCalledWith(3, 'Finalize:\n## Chunk 1\n\n## Chunk 2', {
      signal: undefined,
    });
    expect(result).toEqual({
      finalPrompt: 'Finalize:\n## Chunk 1\n\n## Chunk 2',
      finalOutput: '# Final Document',
    });
  });

  test('can return array output from a final forEach step', async () => {
    const generateText = vi.fn().mockResolvedValueOnce('A').mockResolvedValueOnce('B');
    const runner = createOrchestrationRunner({
      generateText,
      formatStepOutput: (_step, output) => output.trim(),
    });

    const result = await runner(
      {
        id: 'chunk-pass',
        steps: [
          {
            type: 'forEach',
            input: 'chunks',
            itemName: 'chunk',
            outputKey: 'chunkOutputs',
            prompt: 'Chunk {{itemNumber}}/{{itemCount}}: {{chunk.text}}',
          },
        ],
      },
      {
        chunks: [{ text: 'one' }, { text: 'two' }],
      }
    );

    expect(result).toEqual({
      finalPrompt: '',
      finalOutput: ['A', 'B'],
    });
  });
});
